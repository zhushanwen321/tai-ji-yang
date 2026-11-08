import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
const MANIFEST_SEARCH_MAX_DEPTH = 6;
const MANIFEST_OD_KIND = "scenario";
const MANIFEST_STRATEGY_ID_MARKER = "od-next-strategy";
const MANIFEST_FILENAME = "open-design.json";
class ManifestValidationError extends Error {
  /** 缺失或损坏的清单文件绝对路径（doctor 逐项定位用）。 */
  manifestPath;
  constructor(message, manifestPath) {
    super(message);
    this.name = "ManifestValidationError";
    this.manifestPath = manifestPath;
  }
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function asStringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}
function parseStrategyManifest(manifestPath) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !isRecord(parsed.od)) return null;
  const od = parsed.od;
  if (od.kind !== MANIFEST_OD_KIND) return null;
  const strategy = isRecord(od.strategy) ? od.strategy : void 0;
  const strategyId = strategy?.["id"];
  if (typeof strategyId !== "string" || !strategyId.includes(MANIFEST_STRATEGY_ID_MARKER)) {
    return null;
  }
  return parsed;
}
function listDeclaredRosterPaths(manifest) {
  const paths = [];
  for (const skill of manifest.compat?.agentSkills ?? []) {
    if (typeof skill?.path === "string") paths.push(skill.path);
  }
  const odContext = manifest.od.context;
  for (const skill of odContext?.skills ?? []) {
    if (typeof skill?.path === "string") paths.push(skill.path);
  }
  paths.push(...asStringArray(odContext?.assets));
  const assets = manifest.od.strategy?.assets;
  for (const entry of [assets?.core, assets?.orchestration, assets?.taskProfileMapping]) {
    if (typeof entry?.path === "string") paths.push(entry.path);
  }
  for (const profile of assets?.taskProfiles ?? []) {
    if (typeof profile?.path === "string") paths.push(profile.path);
    for (const resource of profile?.resources ?? []) {
      if (typeof resource?.path === "string") paths.push(resource.path);
    }
  }
  return paths;
}
function toScenarioAbsolute(scenarioRoot, relativePath) {
  return join(scenarioRoot, relativePath.replace(/^\.\//, ""));
}
function verifyRoster(manifestPath, scenarioRoot, manifest) {
  const missing = [];
  for (const relative of listDeclaredRosterPaths(manifest)) {
    const absolute = toScenarioAbsolute(scenarioRoot, relative);
    let exists = false;
    try {
      exists = statSync(absolute).isFile();
    } catch {
      exists = false;
    }
    if (!exists) missing.push(relative);
  }
  if (missing.length > 0) {
    throw new ManifestValidationError(
      `OpenDesign 资产清单声明了 ${missing.length} 个不存在的文件（${missing.join("、")}）。清单存在但资产残缺（安装不完整或被破坏），为避免进入提示词残缺的会话已停止装配。恢复动作：重装 OpenDesign，然后重启 DSH。`,
      manifestPath
    );
  }
}
function collectManifestFiles(resourceRoot) {
  const found = [];
  const walk = (dir, depth) => {
    if (depth > MANIFEST_SEARCH_MAX_DEPTH) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absolute, depth + 1);
      } else if (entry.isFile() && entry.name === MANIFEST_FILENAME) {
        found.push(absolute);
      }
    }
  };
  walk(resourceRoot, 0);
  return found;
}
function extractVersions(manifest) {
  return {
    manifestVersion: manifest.version,
    specVersion: manifest.specVersion,
    assetVersion: manifest.od.strategy?.assets?.core?.version
  };
}
function discoverManifest(resourceRoot) {
  let root;
  try {
    root = resolve(resourceRoot);
    if (!statSync(root).isDirectory()) return { status: "not-found" };
  } catch {
    return { status: "not-found" };
  }
  const manifestFiles = collectManifestFiles(root).sort();
  let broken = null;
  for (const manifestPath of manifestFiles) {
    const manifest = parseStrategyManifest(manifestPath);
    if (manifest === null) continue;
    const scenarioRoot = dirname(manifestPath);
    try {
      verifyRoster(manifestPath, scenarioRoot, manifest);
    } catch (error) {
      if (broken === null && error instanceof ManifestValidationError) broken = error;
      continue;
    }
    return {
      status: "found",
      discovered: {
        resourceRoot: root,
        manifestPath,
        scenarioRoot,
        manifest,
        versions: extractVersions(manifest)
      }
    };
  }
  if (broken !== null) return { status: "broken", error: broken };
  return { status: "not-found" };
}
function isPathWithin(base, target) {
  const resolvedBase = resolve(base);
  const resolvedTarget = resolve(target);
  return resolvedTarget === resolvedBase || resolvedTarget.startsWith(resolvedBase + sep);
}
export {
  MANIFEST_SEARCH_MAX_DEPTH,
  ManifestValidationError,
  discoverManifest,
  isPathWithin,
  listDeclaredRosterPaths
};
