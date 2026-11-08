import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { applyRewrites } from "../rewrite/apply.js";
import { readRosterAsset } from "../locate/version-profile.js";
import { renderContextFacts } from "./context-facts.js";
import { replaceInjectionPlaceholders } from "./placeholders.js";
import { renderRoutingSegment } from "./task-routing.js";
const DESIGN_SYSTEMS_DIR = "design-systems";
const SECTION_SEPARATOR = "\n\n---\n\n";
class OdComposeSourceError extends Error {
  constructor(message) {
    super(message);
    this.name = "OdComposeSourceError";
  }
}
function scanDesignSystemNames(resourceRoot) {
  let entries;
  try {
    entries = readdirSync(join(resourceRoot, DESIGN_SYSTEMS_DIR), { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}
function requiredInjectionAssetPath(manifest, manifestPath, kind) {
  const path = manifest.od.strategy?.assets?.[kind]?.path;
  if (typeof path !== "string" || path === "") {
    throw new OdComposeSourceError(
      `OpenDesign 资产清单结构漂移：od.strategy.assets.${kind}.path 缺失（${manifestPath}）。OD 升级后清单结构变化需适配本插件。恢复动作：运行 /opendesign:doctor 检查清单，或向插件仓报告该 OD 版本的清单结构。`
    );
  }
  return path;
}
function composeSystemPrompt(input) {
  const { profile } = input;
  const manifest = JSON.parse(readFileSync(profile.manifestPath, "utf8"));
  const corePath = requiredInjectionAssetPath(manifest, profile.manifestPath, "core");
  const orchestrationPath = requiredInjectionAssetPath(manifest, profile.manifestPath, "orchestration");
  const core = readRosterAsset(profile, corePath);
  const orchestration = readRosterAsset(profile, orchestrationPath);
  const designSystemsRoot = join(profile.resourceRoot, DESIGN_SYSTEMS_DIR);
  const { texts, records } = applyRewrites(
    { "core-system-prompt": core, "general-orchestration": orchestration },
    { designSystemsRoot }
  );
  const injected = replaceInjectionPlaceholders(
    texts["core-system-prompt"] + SECTION_SEPARATOR + texts["general-orchestration"],
    profile.scenarioRoot
  );
  const facts = renderContextFacts();
  const routing = renderRoutingSegment({
    scenarioRoot: profile.scenarioRoot,
    designSystemNames: scanDesignSystemNames(profile.resourceRoot)
  });
  const text = [injected, facts, routing].join(SECTION_SEPARATOR);
  return { text, rewriteRecords: records };
}
export {
  OdComposeSourceError,
  composeSystemPrompt,
  scanDesignSystemNames
};
