import { readFileSync } from "node:fs";
import { applyRewrites } from "../rewrite/apply.js";
import { buildAssetCatalog } from "../locate/asset-catalog.js";
import { deriveCatalogDirs, readRosterAsset } from "../locate/version-profile.js";
import { renderContextFacts } from "./context-facts.js";
import { renderDesignSystemsSegment } from "./design-systems.js";
import { replaceInjectionPlaceholders } from "./placeholders.js";
import { renderRoutingSegment } from "./task-routing.js";
const SECTION_SEPARATOR = "\n\n---\n\n";
class OdComposeSourceError extends Error {
  constructor(message) {
    super(message);
    this.name = "OdComposeSourceError";
  }
}
function requiredInjectionAssetPath(manifest, manifestPath, kind) {
  const path = manifest.od.strategy?.assets?.[kind]?.path;
  if (typeof path !== "string" || path === "") {
    throw new OdComposeSourceError(
      `OpenDesign 资产清单结构漂移：od.strategy.assets.${kind}.path 缺失（${manifestPath}）。OD 升级后清单结构变化需适配本插件。恢复动作：运行 /opendesign-doctor 检查清单，或向插件仓报告该 OD 版本的清单结构。`
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
  const catalogDirs = deriveCatalogDirs(profile.resourceRoot);
  const catalog = buildAssetCatalog(catalogDirs);
  const { texts, records } = applyRewrites(
    { "core-system-prompt": core, "general-orchestration": orchestration },
    { designSystemsRoot: catalogDirs.designSystemsRoot }
  );
  const injected = replaceInjectionPlaceholders(
    texts["core-system-prompt"] + SECTION_SEPARATOR + texts["general-orchestration"],
    profile.scenarioRoot
  );
  const facts = renderContextFacts({
    craftRoot: catalog.craft.present ? catalog.craft.craftRoot : void 0
  });
  const routing = renderRoutingSegment({
    scenarioRoot: profile.scenarioRoot,
    shapeTemplates: catalog.shapeTemplates
  });
  const designSystems = renderDesignSystemsSegment(catalog.designSystems);
  const text = [injected, facts, routing, designSystems].join(SECTION_SEPARATOR);
  return { text, rewriteRecords: records };
}
export {
  OdComposeSourceError,
  composeSystemPrompt
};
