import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { applyRewrites } from "../rewrite/apply.js";
import { ruleAppliesToGeneration } from "../rewrite/rules.js";
import { listDeclaredRosterPaths } from "../locate/manifest-discovery.js";
import { locateOdAssets, readRosterAsset, deriveCatalogDirs } from "../locate/version-profile.js";
import { buildAssetCatalog } from "../locate/asset-catalog.js";
import { MATERIALIZED_WRITE_LIST, OD_FRAMES_DIR } from "../materialize/copy.js";
import {
  PROTOCOL_VERSION_ANCHORS,
  PROTOCOL_SOURCE_REPO_URL
} from "../protocols/anchors.js";
import { LINT_SOURCE_ANCHOR } from "../quality/lint.js";
import {
  qualityReportPath
} from "../quality/feedback.js";
const name = "od-doctor";
const inject = ["commands"];
const DOCTOR_COMMAND_NAME = "opendesign-doctor";
const DOCTOR_DEFINITION_ID = "opendesign-design-mode/commands/doctor";
const DOCTOR_REPORT_TITLE = "OpenDesign 设计模式诊断报告";
const DOCTOR_SECTIONS = {
  install: "安装形态与资源根",
  manifest: "清单路径与三层版本",
  roster: "roster 完整性核验",
  rewrite: "改写规则命中清单",
  materialize: "材质化状态",
  generation: "资产代际提示",
  recovery: "异常与恢复动作",
  stopLoss: "止损位状态",
  assetRichness: "资产丰富度",
  protocolAudit: "协议与检查器对账",
  qualityFindings: "质量发现"
};
const DOCTOR_SECTION_COUNT = Object.keys(DOCTOR_SECTIONS).length;
function doctorSectionLine(index, title) {
  return `【${index}/${DOCTOR_SECTION_COUNT}】${title}`;
}
const DOCTOR_RECOVERY_ACTIONS = {
  reinstallOd: "恢复动作：重装 OpenDesign，然后重启 DSH。",
  upgradePlugin: "恢复动作：升级本插件到适配当前 OpenDesign 资产的版本（改写规则随插件版本更新），然后重启 DSH。",
  restartDsh: "恢复动作：重启 DSH（材质化在新会话创建时无条件全量重铺；.od-frames/ 目录可安全删除后重建）。",
  /** D10⑨ 目录缺失降级：资产根完整性指引。 */
  checkAssetRoot: "恢复动作：检查资产根（资源根见第①节）与 OD 安装完整性——重装 OpenDesign 后重启 DSH。",
  /** D10⑨ 解析异常降级：包清单 + 升级对账指引。 */
  catalogParseError: "恢复动作：核对上述包的清单文件（SKILL.md frontmatter / manifest.json），并做升级对账（OD 升级引入新 frontmatter 或 manifest 形态时升级本插件适配），然后重启 DSH。",
  /** D10⑩ clone 未登记 / 探测失败：登记路径指引（GPK1）。 */
  registerSourceClone: "恢复动作：重新运行 /opendesign-doctor 并附 OpenDesign 源码仓 clone 路径参数（例：/opendesign-doctor <clone 路径>），登记后本节按 git 内容寻址逐协议比对。",
  /** D10⑩ 漂移态：重新提取登记指引。 */
  reExtractAnchor: "恢复动作：升级本插件（新版随插件重新提取登记版本锚），或按登记锚重新提取正源骨架并重登记版本锚，然后重启 DSH。"
};
function evaluateStopLoss(records, readerUnavailable) {
  const misfires = records.filter(
    (record) => record.locator === "semantic-anchor" && record.hitCount === 0 && ruleAppliesToGeneration(record.generation, record.assetGeneration)
  );
  const criterion1Triggered = misfires.length >= 3;
  return {
    criterion1Triggered,
    misfires,
    criterion2Triggered: readerUnavailable,
    criterion3Triggered: false,
    triggered: criterion1Triggered || readerUnavailable
  };
}
function rewriteRecordLine(record) {
  const applicable = ruleAppliesToGeneration(record.generation, record.assetGeneration);
  const marker = record.hitCount > 0 ? "[✓]" : record.locator === "regex" ? "[—]" : applicable ? "[✗ 失配]" : record.generation === "legacy-only" ? "[— 仅旧代生效]" : "[— 仅新代生效]";
  const fragility = `脆弱度 ${record.fragility}`;
  return `- ${marker} ${record.ruleName}（${record.ruleId}）→ ${record.asset} → ${record.summary}（${fragility}）`;
}
function readManifest(profile) {
  try {
    return JSON.parse(readFileSync(profile.manifestPath, "utf8"));
  } catch {
    return null;
  }
}
function renderRosterSection(profile, issues) {
  const manifest = readManifest(profile);
  if (manifest === null) {
    const message = `清单文件无法读取或解析（${profile.manifestPath}）。${DOCTOR_RECOVERY_ACTIONS.reinstallOd}`;
    issues.push({ section: DOCTOR_SECTIONS.roster, message });
    return [`- ✗ ${message}`];
  }
  const declared = listDeclaredRosterPaths(manifest);
  const lines = [`- 声明文件共 ${declared.length} 项：`];
  const missing = [];
  for (const relative of declared) {
    const absolute = join(profile.scenarioRoot, relative.replace(/^\.\//, ""));
    let exists = false;
    try {
      exists = statSync(absolute).isFile();
    } catch {
      exists = false;
    }
    if (exists) {
      lines.push(`  - ✓ ${relative}`);
    } else {
      missing.push(relative);
      lines.push(`  - ✗ ${relative}（缺失）`);
    }
  }
  if (missing.length > 0) {
    const message = `roster 核验失败：${missing.length} 个声明文件缺失（${missing.join("、")}）。${DOCTOR_RECOVERY_ACTIONS.reinstallOd}`;
    issues.push({ section: DOCTOR_SECTIONS.roster, message });
    lines.push(`- ✗ ${message}`);
  } else {
    lines.push("- 结论：全部声明文件在场。");
  }
  return lines;
}
function renderMaterializeSection(sessionCwd, issues) {
  if (sessionCwd === null) {
    return ["- 会话工作目录未知，无法报告材质化状态（不影响本报告其余各项）。"];
  }
  const targetRoot = join(sessionCwd, OD_FRAMES_DIR);
  const lines = [
    `- 会话工作目录：${sessionCwd}`,
    `- 写入落点（D8 约定子目录）：${targetRoot}`
  ];
  if (!existsSync(targetRoot)) {
    lines.push("- 状态：尚未预铺（落点目录不存在；材质化在会话创建时无条件全量重铺，新会话首轮前执行本命令即此形态）。");
    return lines;
  }
  const present = [];
  const missingNames = [];
  for (const fileName of MATERIALIZED_WRITE_LIST) {
    const absolute = join(targetRoot, fileName);
    let bytes = 0;
    let exists = false;
    try {
      bytes = statSync(absolute).size;
      exists = true;
    } catch {
      exists = false;
    }
    if (exists) {
      present.push(`  - ✓ ${fileName}（${bytes} 字节）`);
    } else {
      missingNames.push(fileName);
    }
  }
  lines.push(...present);
  if (missingNames.length === MATERIALIZED_WRITE_LIST.length) {
    const message = `材质化异常：落点目录存在但 ${MATERIALIZED_WRITE_LIST.length} 个管理名全部缺失（预铺后为空即异常）。${DOCTOR_RECOVERY_ACTIONS.restartDsh}`;
    issues.push({ section: DOCTOR_SECTIONS.materialize, message });
    lines.push(`- ✗ ${message}`);
  } else if (missingNames.length > 0) {
    const message = `材质化异常：${missingNames.length} 个管理名缺失（${missingNames.join("、")}；D8/D9 为无条件全量重铺，写清单 ${MATERIALIZED_WRITE_LIST.length} 文件应齐备）。${DOCTOR_RECOVERY_ACTIONS.restartDsh}`;
    issues.push({ section: DOCTOR_SECTIONS.materialize, message });
    lines.push(`- ✗ ${message}`);
  } else {
    lines.push(`- 结论：${MATERIALIZED_WRITE_LIST.length} 个管理名全部在场（写入落点清单如上）。`);
  }
  return lines;
}
function renderRewriteSection(profile, issues) {
  const designSystemsRoot = join(profile.resourceRoot, "design-systems");
  let records;
  try {
    const manifest = readManifest(profile);
    const corePath = manifest?.od?.strategy?.assets?.core?.path;
    const orchestrationPath = manifest?.od?.strategy?.assets?.orchestration?.path;
    if (typeof corePath !== "string" || typeof orchestrationPath !== "string") {
      throw new Error(`清单缺少 core / orchestration 资产声明（${profile.manifestPath}）`);
    }
    records = applyRewrites({
      "core-system-prompt": readRosterAsset(profile, corePath),
      "general-orchestration": readRosterAsset(profile, orchestrationPath)
    }, { designSystemsRoot }).records;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const message = `默认读取器无法产出可注入文本（${reason}）。${DOCTOR_RECOVERY_ACTIONS.upgradePlugin}`;
    issues.push({ section: DOCTOR_SECTIONS.rewrite, message });
    return {
      lines: [`- ✗ ${message}`, "- 改写命中清单不可产出（判据②命中：默认读取器不可用）。"],
      records: [],
      readerUnavailable: true
    };
  }
  const hit = records.filter((record) => record.hitCount > 0).length;
  const assetGeneration = records[0]?.assetGeneration ?? "unknown";
  const lines = [
    `- 资产代际探测：${assetGeneration}（legacy = 0.25.x 形态 / current = 真机 2.0.4 形态 / unknown = 按全规则适用保守处理；代际外规则的零命中是预期形态）`,
    `- 规则应用记录共 ${records.length} 条（命中 ${hit} 条 / 零命中 ${records.length - hit} 条；零命中含防御性规则基线形态、残余兜底未触发形态与代际外规则预期形态，见逐条标记）：`,
    ...records.map(rewriteRecordLine)
  ];
  const residualHits = records.filter((record) => record.ruleId.endsWith("residual") && record.hitCount > 0);
  if (residualHits.length > 0) {
    lines.push(
      `- ⚠ 残余兜底规则命中 ${residualHits.length} 条（${residualHits.map((record) => record.ruleId).join("、")}）——特征串残余说明上游段锚漂移，见失配标记。`
    );
  }
  return { lines, records, readerUnavailable: false };
}
function renderStopLossSection(evaluation) {
  const lines = [
    `- 判据① 核心段改写规则失配 ≥3 条：${evaluation.criterion1Triggered ? `触发（${evaluation.misfires.length} 条失配）` : `未触发（${evaluation.misfires.length} 条失配）`}`,
    ...evaluation.misfires.map((record) => `  - ✗ ${record.ruleName}（${record.ruleId}，${record.asset}，脆弱度 ${record.fragility}）：锚未命中`),
    `- 判据② 默认读取器无法产出可注入文本：${evaluation.criterion2Triggered ? "触发" : "未触发"}`,
    "- 判据③ 连续两个 OD 版本升级均需重写全部规则：不在单次诊断可观测范围（需跨升级历史记录；升级后若连续两版均见判据①触发，即按本判据处置）。"
  ];
  if (evaluation.triggered) {
    lines.push("- ⚠ 建议方案级重审：止损位判据已触发（V2 真桥接提前或改写策略重构）。");
  } else {
    lines.push("- 结论：可观测判据均未触发。");
  }
  return lines;
}
function renderAssetRichnessSection(profile) {
  if (profile === null) {
    return ["- 资产未定位，无资产丰富度可报告（见第①节）。"];
  }
  const catalog = buildAssetCatalog(deriveCatalogDirs(profile.resourceRoot));
  const lines = [];
  if (catalog.craft.present) {
    lines.push(`- craft 手册：${catalog.craft.manualFiles.length} 册（规则书口径，排除 README.md 与 FUTURE_SECTIONS.md 两个元文件）`);
  } else {
    lines.push(`- ✗ craft 手册：craft/ 目录缺失（${catalog.craft.craftRoot}），册数不可清点、craft 指路块整体省略。${DOCTOR_RECOVERY_ACTIONS.checkAssetRoot}`);
  }
  if (catalog.shapeTemplates.present) {
    lines.push(`- 形状包：${catalog.shapeTemplates.entries.length} 个（解析异常 ${catalog.shapeTemplates.parseErrorCount} 个）`);
    appendParseErrorLine(lines, catalog.shapeTemplates.parseErrorCount, degradedNames(catalog.shapeTemplates.entries));
  } else {
    lines.push(`- ✗ 形状包：design-templates/ 目录缺失（${catalog.shapeTemplates.root}），形状包清单段降级为空（0 行）。${DOCTOR_RECOVERY_ACTIONS.checkAssetRoot}`);
  }
  if (catalog.designSystems.present) {
    lines.push(`- 设计系统 manifest 命中：${catalog.designSystems.entries.length} 个（解析异常 ${catalog.designSystems.parseErrorCount} 个）`);
    appendParseErrorLine(lines, catalog.designSystems.parseErrorCount, degradedNames(catalog.designSystems.entries));
  } else {
    lines.push(`- ✗ 设计系统：design-systems/ 目录缺失（${catalog.designSystems.root}），manifest 感知清单段降级为空（0 行）。${DOCTOR_RECOVERY_ACTIONS.checkAssetRoot}`);
  }
  const shapeRows = catalog.shapeTemplates.present ? catalog.shapeTemplates.entries.length : 0;
  const systemRows = catalog.designSystems.present ? catalog.designSystems.entries.length : 0;
  const craftBlock = catalog.craft.present ? "注入（craft/ 在场）" : "省略（craft/ 缺失时整体省略，D1/AX5）";
  lines.push(`- 清单段注入行数：形状包清单段 ${shapeRows} 行 / 设计系统清单段 ${systemRows} 行（一行一包口径）；craft 指路块：${craftBlock}。`);
  return lines;
}
function degradedNames(entries) {
  return entries.filter((entry) => entry.degraded).map((entry) => entry.dirName);
}
function appendParseErrorLine(lines, count, names) {
  if (count > 0) {
    lines.push(`- ⚠ 解析异常 ${count} 个包（${names.join("、")}；降级仅目录名）。${DOCTOR_RECOVERY_ACTIONS.catalogParseError}`);
  }
}
function probeSourceClone(clonePath) {
  const trimmed = clonePath === null ? "" : clonePath.trim();
  if (trimmed === "") {
    return { status: "unregistered", clonePath: "", head: null, toplevel: null, reason: "未登记源码仓 clone 路径" };
  }
  try {
    const toplevel = execFileSync("git", ["-C", trimmed, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    const head = execFileSync("git", ["-C", trimmed, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return { status: "available", clonePath: trimmed, head, toplevel };
  } catch {
    return {
      status: "unavailable",
      clonePath: trimmed,
      head: null,
      toplevel: null,
      reason: "路径不是 git 仓库目录，或 git 命令不可用"
    };
  }
}
function reconcileProtocolAnchor(check, probe) {
  if (probe.status !== "available" || probe.head === null) {
    return {
      check,
      status: "cannot-compare",
      cloneHead: null,
      cannotCompareReason: probe.reason ?? "clone 探测未通过"
    };
  }
  return {
    check,
    status: probe.head === check.registeredCommit ? "ok" : "drift",
    cloneHead: probe.head,
    cannotCompareReason: null
  };
}
function buildProtocolAnchorChecks() {
  const protocolLabels = { panel: "panel 评审团协议", deck: "deck 演示稿协议" };
  const rows = PROTOCOL_VERSION_ANCHORS.map((anchor) => ({
    id: anchor.protocol,
    label: protocolLabels[anchor.protocol] ?? anchor.protocol,
    registeredCommit: anchor.commit,
    registeredSha256: anchor.skeletonSha256,
    basis: anchor.skeletonBasis
  }));
  rows.push({
    id: "lint",
    label: "反 AI 味检查项清单",
    registeredCommit: LINT_SOURCE_ANCHOR.commit,
    registeredSha256: null,
    basis: `${LINT_SOURCE_ANCHOR.upstreamPath}（检查项清单移植，无骨架哈希——比对基准 = commit；${LINT_SOURCE_ANCHOR.license}）`
  });
  return rows;
}
function renderProtocolAuditSection(sourceClonePath) {
  const checks = buildProtocolAnchorChecks();
  const lines = [
    `- 版本锚登记（AX3 例外：本仓派生副本的登记锚；正源仓 ${PROTOCOL_SOURCE_REPO_URL}）：`
  ];
  for (const check of checks) {
    const sha = check.registeredSha256 === null ? "无骨架哈希（比对基准 = commit）" : `骨架 sha256 ${check.registeredSha256}`;
    lines.push(`  - ${check.label}：登记 commit ${check.registeredCommit}、${sha}（${check.basis}）`);
  }
  const probe = probeSourceClone(sourceClonePath);
  if (probe.status === "available") {
    lines.push(`- 源码仓 clone 探测：${probe.clonePath}（HEAD ${probe.head}）`);
  } else if (probe.status === "unregistered") {
    lines.push("- 源码仓 clone 探测：未登记。");
  } else {
    lines.push(`- 源码仓 clone 探测：${probe.clonePath}（探测失败：${probe.reason}）。${DOCTOR_RECOVERY_ACTIONS.registerSourceClone}`);
  }
  lines.push(
    "- 逐协议比对（比对口径 = git 内容寻址：clone HEAD 与登记 commit 逐字一致 ⟺ 同口径提取的骨架哈希与登记哈希一致；HEAD 已变化时保守判定漂移）："
  );
  for (const check of checks) {
    const outcome = reconcileProtocolAnchor(check, probe);
    if (outcome.status === "ok") {
      lines.push(`  - ✓ ${check.label}：ok（clone HEAD = 登记提取 commit，骨架哈希比对一致）`);
    } else if (outcome.status === "drift") {
      lines.push(`  - ✗ ${check.label}：drift（clone HEAD ${outcome.cloneHead} ≠ 登记 commit ${check.registeredCommit}——正源已变化，登记骨架哈希不可再视为正源哈希）。${DOCTOR_RECOVERY_ACTIONS.reExtractAnchor}`);
    } else {
      lines.push(`  - ⚠ ${check.label}：无法比对（${outcome.cannotCompareReason}）。`);
    }
  }
  if (probe.status === "unregistered") {
    lines.push(`- ${DOCTOR_RECOVERY_ACTIONS.registerSourceClone}`);
  }
  lines.push("- 已知信息：clone HEAD 可能滞后于本机安装版本——ok 态以登记锚为准（本节比对的是用户登记的 clone，非 /Applications 安装盘资产）。");
  return lines;
}
const FINDING_REASON_LABELS = {
  "fed-back": "已回注送达会话",
  p1p2: "P1/P2 仅记录不回注",
  duplicate: "内容指纹去重未再回注",
  limit: "超每文件回注上限仅记录",
  "no-agent": "查无活 Agent 放弃回注",
  "inject-error": "注入失败放弃回注",
  "unrecognized-existing": "陌生既有文件只记录不回注"
};
function readQualityReportLines(sessionCwd) {
  const file = qualityReportPath(sessionCwd);
  let raw;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return { lines: [], corruptCount: 0, fileExists: false };
  }
  const lines = [];
  let corruptCount = 0;
  for (const lineText of raw.split("\n")) {
    const trimmed = lineText.trim();
    if (trimmed === "") continue;
    try {
      lines.push(JSON.parse(trimmed));
    } catch {
      corruptCount += 1;
    }
  }
  return { lines, corruptCount, fileExists: true };
}
function renderQualityFindingsSection(sessionCwd) {
  if (sessionCwd === null) {
    return ["- 会话工作目录未知，无法读取检查记录（不影响本报告其余各项）。"];
  }
  const { lines: reportLines, corruptCount, fileExists } = readQualityReportLines(sessionCwd);
  if (!fileExists || reportLines.length === 0) {
    const where = fileExists ? `${qualityReportPath(sessionCwd)} 为空或全部行损坏` : `${qualityReportPath(sessionCwd)} 不存在`;
    return [
      `- 本轮会话无检查记录（${where}）。`,
      "- 监听器未启动原因：质量环监听器仅随设计 preset 会话启动（agent-preset/selected 事件按 presetId 过滤）；普通会话零监听零检查（V7 零侵入形态），监听器启动即失败自毁且记录未落盘时同样表现为本形态。"
    ];
  }
  const out = [];
  if (corruptCount > 0) {
    out.push(`- ⚠ ${corruptCount} 行损坏已跳过（追加式记录容忍半行写入）。`);
  }
  const watcherEvents = reportLines.filter((line) => line.type === "watcher");
  if (watcherEvents.length === 0) {
    out.push("- 监听器状态：记录中无监听器生命周期事件（检查记录由其他通道写入或插件版本较早）。");
  } else {
    const starts = watcherEvents.filter((event) => event.event === "started").length;
    const destroys = watcherEvents.filter((event) => event.event === "destroyed").length;
    const last = watcherEvents[watcherEvents.length - 1];
    const lastText = last.event === "started" ? `运行中（最近 started ${last.at}）` : `已自毁（最近 destroyed ${last.at}${typeof last.reason === "string" && last.reason !== "" ? `；原因：${last.reason}` : ""}）`;
    out.push(`- 监听器状态：${lastText}；累计启动 ${starts} 次 / 自毁 ${destroys} 次。`);
  }
  const findings = reportLines.filter((line) => line.type === "finding");
  const countBySeverity = { P0: 0, P1: 0, P2: 0 };
  for (const finding of findings) {
    if (finding.severity === "P0") countBySeverity.P0 += 1;
    else if (finding.severity === "P1") countBySeverity.P1 += 1;
    else if (finding.severity === "P2") countBySeverity.P2 += 1;
  }
  out.push(`- 检查发现：共 ${findings.length} 条（P0 ${countBySeverity.P0} / P1 ${countBySeverity.P1} / P2 ${countBySeverity.P2}）。`);
  for (const finding of findings) {
    const reasonLabel = FINDING_REASON_LABELS[finding.reason] ?? finding.reason;
    out.push(`  - [${finding.severity}] ${finding.id} — ${finding.path}（${reasonLabel}）：${finding.message}`);
  }
  const artifacts = reportLines.filter((line) => line.type === "artifact");
  out.push(`- 产物写盘身份记录：${artifacts.length} 条（快照豁免的回查数据源，D5④）。`);
  for (const artifact of artifacts) {
    out.push(`  - ${artifact.path}（${artifact.at}）`);
  }
  return out;
}
function buildDoctorReport(input) {
  const issues = [];
  const sections = [];
  const installLines = [];
  if (input.profileResult.status === "found") {
    const profile2 = input.profileResult.profile;
    installLines.push(
      `- 资源根：${profile2.resourceRoot}`,
      `- 选中依据：${profile2.selectedBy}`,
      `- 全部候选（${profile2.candidates.length}）：`,
      ...profile2.candidates.map(
        (candidate) => `  - ${candidate.resourceRoot}（渠道 ${candidate.channel}）${candidate.resourceRoot === profile2.resourceRoot ? " ← 已选中" : ""}`
      )
    );
  } else if (input.profileResult.status === "missing") {
    const message = "未检测到 OpenDesign 安装（零候选）。恢复动作：安装 OpenDesign（/Applications/Open Design.app），然后重启 DSH。";
    issues.push({ section: DOCTOR_SECTIONS.install, message });
    installLines.push(`- ✗ ${message}`);
  } else {
    const message = `OpenDesign 资产探测失败：${input.profileResult.reason} ${DOCTOR_RECOVERY_ACTIONS.reinstallOd}`;
    issues.push({ section: DOCTOR_SECTIONS.install, message });
    installLines.push(`- ✗ ${message}`);
  }
  sections.push(renderSection(1, DOCTOR_SECTIONS.install, installLines));
  const profile = input.profileResult.status === "found" ? input.profileResult.profile : null;
  const manifestLines = [];
  if (profile === null) {
    manifestLines.push("- 资产未定位，无清单可报告（见第①节）。");
  } else {
    const verifiedLine = profile.verified ? "（已核实）" : `（未核实——超出本插件已核实集合；${DOCTOR_RECOVERY_ACTIONS.upgradePlugin}）`;
    manifestLines.push(
      `- 清单路径：${profile.manifestPath}`,
      `- manifest 版本：${profile.versions.manifestVersion ?? "（未声明）"}`,
      `- specVersion：${profile.versions.specVersion ?? "（未声明）"}${verifiedLine}`,
      `- 资产版本（core.version）：${profile.versions.assetVersion ?? "（未声明）"}`
    );
  }
  sections.push(renderSection(2, DOCTOR_SECTIONS.manifest, manifestLines));
  const rosterLines = profile === null ? ["- 资产未定位，无法核验（见第①节）。"] : renderRosterSection(profile, issues);
  sections.push(renderSection(3, DOCTOR_SECTIONS.roster, rosterLines));
  let records = [];
  let readerUnavailable = false;
  let rewriteLines;
  if (profile === null) {
    rewriteLines = ["- 资产未定位，改写命中清单不可产出（见第①节）。"];
  } else {
    const rendered = renderRewriteSection(profile, issues);
    records = rendered.records;
    readerUnavailable = rendered.readerUnavailable;
    rewriteLines = rendered.lines;
  }
  sections.push(renderSection(4, DOCTOR_SECTIONS.rewrite, rewriteLines));
  sections.push(renderSection(5, DOCTOR_SECTIONS.materialize, renderMaterializeSection(input.sessionCwd, issues)));
  const generationLines = [];
  if (profile !== null) {
    generationLines.push(
      `- 当前资产版本：core v${profile.versions.assetVersion ?? "未知"}（清单 specVersion ${profile.versions.specVersion ?? "未知"}）`
    );
  }
  generationLines.push(
    "- 提示：若本会话是 resume 的旧会话，历史轮次的系统提示词由旧代资产组装，与上列当前资产版本可能不同代；新轮次以当前资产重新组装为准（SC4 代际边界）。"
  );
  sections.push(renderSection(6, DOCTOR_SECTIONS.generation, generationLines));
  const recoveryLines = issues.length === 0 ? ["- 未发现异常。"] : issues.map((issue, index) => `- ${index + 1}. 【${issue.section}】${issue.message}`);
  sections.push(renderSection(7, DOCTOR_SECTIONS.recovery, recoveryLines));
  const evaluation = evaluateStopLoss(records, readerUnavailable);
  sections.push(renderSection(8, DOCTOR_SECTIONS.stopLoss, renderStopLossSection(evaluation)));
  sections.push(renderSection(9, DOCTOR_SECTIONS.assetRichness, renderAssetRichnessSection(profile)));
  sections.push(renderSection(10, DOCTOR_SECTIONS.protocolAudit, renderProtocolAuditSection(input.sourceClonePath ?? null)));
  sections.push(renderSection(11, DOCTOR_SECTIONS.qualityFindings, renderQualityFindingsSection(input.sessionCwd)));
  return [
    DOCTOR_REPORT_TITLE,
    `（生成时间：${(/* @__PURE__ */ new Date()).toISOString()}；求助时请附本报告全文）`,
    "",
    ...sections.join("\n\n").split("\n"),
    ""
  ].join("\n");
}
function renderSection(index, title, lines) {
  return [doctorSectionLine(index, title), ...lines].join("\n");
}
function resolveSessionCwd(hostCtx, agent) {
  const session = agent?.session;
  let workingDirectory;
  try {
    workingDirectory = hostCtx?.workingDirectory;
  } catch {
  }
  if (workingDirectory && typeof workingDirectory.get === "function" && session !== void 0) {
    try {
      const cwd = workingDirectory.get(session);
      if (typeof cwd === "string" && cwd.length > 0) return cwd;
    } catch {
    }
  }
  const headerCwd = session?.header?.cwd;
  return typeof headerCwd === "string" && headerCwd.length > 0 ? headerCwd : null;
}
function apply(ctx) {
  ctx.commands.register({
    definitionId: DOCTOR_DEFINITION_ID,
    name: DOCTOR_COMMAND_NAME,
    description: "诊断 OpenDesign 设计模式：资产定位、清单版本、roster 完整性、改写命中、材质化、资产丰富度、协议对账、质量发现与止损位状态",
    handler: (invocation) => {
      const rawInput = invocation?.rawInput;
      const sourceClonePath = typeof rawInput === "string" && rawInput.trim() !== "" ? rawInput.trim() : null;
      const text = buildDoctorReport({
        profileResult: locateOdAssets(),
        sessionCwd: resolveSessionCwd(ctx, invocation?.agent),
        sourceClonePath
      });
      return { kind: "success", text };
    }
  });
}
export {
  DOCTOR_COMMAND_NAME,
  DOCTOR_DEFINITION_ID,
  DOCTOR_RECOVERY_ACTIONS,
  DOCTOR_REPORT_TITLE,
  DOCTOR_SECTIONS,
  DOCTOR_SECTION_COUNT,
  FINDING_REASON_LABELS,
  apply,
  buildDoctorReport,
  buildProtocolAnchorChecks,
  doctorSectionLine,
  evaluateStopLoss,
  inject,
  name,
  probeSourceClone,
  reconcileProtocolAnchor,
  resolveSessionCwd,
  rewriteRecordLine
};
