import { watch } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { lintArtifact } from "./lint.js";
import { appendQualityReportLine, readArtifactIdentityPaths } from "./feedback.js";
const WATCHED_EXTENSIONS = [".html", ".htm"];
const EXCLUDED_DIR_NAMES = /* @__PURE__ */ new Set([".od-frames", ".od-quality"]);
const DEFAULT_DEBOUNCE_MS = 800;
function isWatchedArtifactPath(relativePath) {
  if (relativePath.length === 0) return false;
  const segments = relativePath.split("/");
  if (segments.some((s) => EXCLUDED_DIR_NAMES.has(s))) return false;
  const base = segments[segments.length - 1] ?? "";
  const lower = base.toLowerCase();
  return WATCHED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
function isCompleteHtml(content) {
  return /<\/html>\s*$/i.test(content);
}
async function startSessionWatcher(options) {
  const cwd = options.cwd;
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const lint = options.lintArtifact ?? lintArtifact;
  const timers = /* @__PURE__ */ new Map();
  let fsWatcher;
  let disposed = false;
  let destroyed = false;
  let destroyedReason;
  const controller = {
    dispose() {
      if (destroyed) {
        disposed = true;
        return;
      }
      disposed = true;
      closeWatcher();
    },
    get destroyed() {
      return destroyed;
    },
    get destroyedReason() {
      return destroyedReason;
    }
  };
  function closeWatcher() {
    if (fsWatcher !== void 0) {
      try {
        fsWatcher.close();
      } catch {
      }
      fsWatcher = void 0;
    }
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  }
  function selfDestruct(reason) {
    if (destroyed) return;
    destroyed = true;
    destroyedReason = reason;
    closeWatcher();
    void appendQualityReportLine(cwd, {
      type: "watcher",
      at: (/* @__PURE__ */ new Date()).toISOString(),
      event: "destroyed",
      reason
    }).catch((error) => {
      options.logger?.warn?.(`opendesign-design-mode: 监听器自毁行写盘失败（${cwd}）：${errorMessage(error)}`);
    });
    options.onDestroyed?.(reason);
  }
  async function checkFile(absPath, relativePath, snapshot, identities) {
    if (destroyed || disposed) return;
    let content;
    try {
      content = await readFile(absPath, "utf8");
    } catch {
      return;
    }
    if (!isCompleteHtml(content)) return;
    const kind = classify(relativePath, snapshot, identities);
    let findings;
    try {
      findings = lint(content);
    } catch (error) {
      options.logger?.warn?.(`opendesign-design-mode: 产物检查异常（${relativePath}）：${errorMessage(error)}`);
      return;
    }
    try {
      await options.onFindings?.({ kind, relativePath, content, findings });
    } catch (error) {
      options.logger?.warn?.(`opendesign-design-mode: 回注处理异常（${relativePath}）：${errorMessage(error)}`);
    }
  }
  try {
    const [snapshot, identities] = await Promise.all([
      scanWatchedHtmlFiles(cwd),
      readArtifactIdentityPaths(cwd)
    ]);
    if (disposed || destroyed) return controller;
    fsWatcher = watch(cwd, { recursive: true }, (_event, filename) => {
      if (destroyed || disposed) return;
      const relativePath = normalizeRelPath(filename);
      if (relativePath === null || !isWatchedArtifactPath(relativePath)) return;
      const absPath = path.join(cwd, relativePath);
      const previous = timers.get(absPath);
      if (previous !== void 0) clearTimeout(previous);
      timers.set(
        absPath,
        setTimeout(() => {
          timers.delete(absPath);
          void checkFile(absPath, relativePath, snapshot, identities);
        }, debounceMs)
      );
    });
    fsWatcher.on("error", (error) => {
      selfDestruct(`watch-error: ${error?.message ?? String(error)}`);
    });
    if (disposed) {
      closeWatcher();
      return controller;
    }
  } catch (error) {
    selfDestruct(`start-failed: ${errorMessage(error)}`);
    return controller;
  }
  try {
    await appendQualityReportLine(cwd, {
      type: "watcher",
      at: (/* @__PURE__ */ new Date()).toISOString(),
      event: "started",
      cwd
    });
  } catch (error) {
    options.logger?.warn?.(`opendesign-design-mode: 监听器 started 行写盘失败（${cwd}）：${errorMessage(error)}`);
  }
  return controller;
}
function classify(relativePath, snapshot, identities) {
  if (identities.has(relativePath)) return "resume-artifact";
  if (snapshot.has(relativePath)) return "unrecognized-existing";
  return "session-artifact";
}
function normalizeRelPath(filename) {
  if (typeof filename !== "string" || filename.length === 0) return null;
  const normalized = filename.split(path.sep).join("/").replace(/^\.\//, "");
  return normalized.length === 0 ? null : normalized;
}
async function scanWatchedHtmlFiles(dir) {
  const out = /* @__PURE__ */ new Set();
  async function walk(walkDir, relPrefix) {
    const entries = await readdir(walkDir, { withFileTypes: true });
    for (const entry of entries) {
      const rel = relPrefix === "" ? entry.name : `${relPrefix}/${entry.name}`;
      if (entry.isDirectory()) {
        if (EXCLUDED_DIR_NAMES.has(entry.name)) continue;
        await walk(path.join(walkDir, entry.name), rel);
      } else if (entry.isFile() && isWatchedArtifactPath(rel)) {
        out.add(rel);
      }
    }
  }
  await walk(dir, "");
  return out;
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
export {
  DEFAULT_DEBOUNCE_MS,
  EXCLUDED_DIR_NAMES,
  WATCHED_EXTENSIONS,
  isCompleteHtml,
  isWatchedArtifactPath,
  startSessionWatcher
};
