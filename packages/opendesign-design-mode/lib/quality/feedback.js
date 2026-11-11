import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
const QUALITY_DIR_NAME = ".od-quality";
const QUALITY_REPORT_NAME = "report.jsonl";
function qualityReportPath(cwd) {
  return path.join(cwd, QUALITY_DIR_NAME, QUALITY_REPORT_NAME);
}
async function appendQualityReportLine(cwd, line) {
  const file = qualityReportPath(cwd);
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(line)}
`, "utf8");
}
async function readArtifactIdentityPaths(cwd) {
  let raw;
  try {
    raw = await readFile(qualityReportPath(cwd), "utf8");
  } catch {
    return /* @__PURE__ */ new Set();
  }
  const out = /* @__PURE__ */ new Set();
  for (const lineText of raw.split("\n")) {
    const trimmed = lineText.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.type === "artifact" && typeof parsed.path === "string" && parsed.path.length > 0) {
        out.add(parsed.path);
      }
    } catch {
    }
  }
  return out;
}
const LINT_SOURCE_KIND = "opendesign-design-mode/lint";
function buildLintFeedbackMessage(relativePath, p0Findings) {
  const items = p0Findings.map((finding, index) => {
    const lines = [
      `${index + 1}. [${finding.id}] ${finding.message}`,
      finding.snippet ? `   片段：${finding.snippet}` : void 0,
      finding.fix ? `   修复指引：${finding.fix}` : void 0
    ].filter((line) => line !== void 0);
    return lines.join("\n");
  });
  const text = [
    `[opendesign-design-mode 质量环] 反 AI 味检查发现以下 P0 问题（宿主侧机器检查，非用户发言；文件：${relativePath}）：`,
    "",
    ...items,
    "",
    "作用域：仅修复你本会话产出的 HTML；会话目录中非你产出的文件命中仅报告，勿改动。",
    "修复后无需回复本消息。"
  ].join("\n");
  return {
    id: randomUUID(),
    role: "user",
    content: [{ type: "text", text }],
    source: { kind: LINT_SOURCE_KIND }
  };
}
const DEFAULT_MAX_FEEDBACKS_PER_FILE = 2;
function createQualityFeedbackHandler(options) {
  const maxPerFile = options.maxFeedbacksPerFile ?? DEFAULT_MAX_FEEDBACKS_PER_FILE;
  const cwd = options.cwd;
  const fingerprints = /* @__PURE__ */ new Map();
  const feedbackCounts = /* @__PURE__ */ new Map();
  const identityWritten = /* @__PURE__ */ new Set();
  return async (input) => {
    const { kind, relativePath, content, findings } = input;
    if (kind === "session-artifact" && !identityWritten.has(relativePath)) {
      identityWritten.add(relativePath);
      await appendQualityReportLine(cwd, { type: "artifact", at: nowIso(), path: relativePath });
    }
    if (findings.length === 0) return { action: "no-findings" };
    if (kind === "unrecognized-existing") {
      await recordFindings(cwd, relativePath, findings, "unrecognized-existing");
      return { action: "recorded-only", reason: "unrecognized-existing" };
    }
    const p0 = findings.filter((f) => f.severity === "P0");
    if (p0.length === 0) {
      await recordFindings(cwd, relativePath, findings, "p1p2");
      return { action: "recorded-only", reason: "p1p2" };
    }
    const fingerprint = contentFingerprint(content, p0);
    if (fingerprints.get(relativePath) === fingerprint) {
      await recordFindings(cwd, relativePath, findings, "duplicate");
      return { action: "recorded-only", reason: "duplicate" };
    }
    if ((feedbackCounts.get(relativePath) ?? 0) >= maxPerFile) {
      await recordFindings(cwd, relativePath, findings, "limit");
      return { action: "recorded-only", reason: "limit" };
    }
    const message = buildLintFeedbackMessage(relativePath, p0);
    const delivered = deliverFeedback(options.ctx, options.sessionId, message);
    if (delivered === "steered" || delivered === "followup") {
      fingerprints.set(relativePath, fingerprint);
      feedbackCounts.set(relativePath, (feedbackCounts.get(relativePath) ?? 0) + 1);
      await recordFindings(cwd, relativePath, findings, "fed-back");
      return { action: delivered };
    }
    await recordFindings(cwd, relativePath, findings, delivered);
    return { action: "recorded-only", reason: delivered };
  };
}
async function recordFindings(cwd, relativePath, findings, reason) {
  const at = nowIso();
  for (const finding of findings) {
    const lineReason = reason === "fed-back" && finding.severity !== "P0" ? "p1p2" : reason;
    await appendQualityReportLine(cwd, {
      type: "finding",
      at,
      path: relativePath,
      severity: finding.severity,
      id: finding.id,
      message: finding.message,
      fix: finding.fix,
      snippet: finding.snippet,
      reason: lineReason
    });
  }
}
function contentFingerprint(content, p0) {
  const ids = [...new Set(p0.map((f) => f.id))].sort();
  return `${createHash("sha256").update(content, "utf8").digest("hex")}|${ids.join(",")}`;
}
function deliverFeedback(ctx, sessionId, message) {
  let agents;
  try {
    const candidate = ctx?.get;
    if (typeof candidate === "function") agents = candidate.call(ctx, "agents");
  } catch {
    return "no-agent";
  }
  if (agents === null || typeof agents !== "object" || typeof agents.get !== "function") return "no-agent";
  let agent;
  try {
    agent = agents.get(sessionId);
  } catch {
    return "no-agent";
  }
  if (agent === null || typeof agent !== "object") return "no-agent";
  const canSteer = typeof agent.steer === "function";
  const canFollowup = typeof agent.followup === "function";
  if (!canSteer && !canFollowup) return "no-agent";
  try {
    if (agent.status === "running" && canSteer) {
      agent.steer?.(message);
      return "steered";
    }
    if (canFollowup) {
      agent.followup?.(message);
      return "followup";
    }
    return "no-agent";
  } catch {
    return "inject-error";
  }
}
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
export {
  DEFAULT_MAX_FEEDBACKS_PER_FILE,
  LINT_SOURCE_KIND,
  QUALITY_DIR_NAME,
  QUALITY_REPORT_NAME,
  appendQualityReportLine,
  buildLintFeedbackMessage,
  createQualityFeedbackHandler,
  deliverFeedback,
  qualityReportPath,
  readArtifactIdentityPaths
};
