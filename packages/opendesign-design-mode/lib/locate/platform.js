import { resolve } from "node:path";
import { collectMacOsCandidates } from "./platform-macos.js";
const OD_RESOURCE_ROOT_ENV = "OD_RESOURCE_ROOT";
const PLATFORM_STRATEGIES = {
  darwin: { collectCandidates: collectMacOsCandidates }
};
const EMPTY_STRATEGY = { collectCandidates: () => [] };
function locateEnvHints() {
  return { env: process.env, platform: process.platform };
}
function resourceRootOverride(env) {
  const raw = env[OD_RESOURCE_ROOT_ENV]?.trim();
  if (raw === void 0 || raw.length === 0) return null;
  return resolve(raw);
}
function collectAssetCandidates(hints = locateEnvHints()) {
  const strategy = PLATFORM_STRATEGIES[hints.platform] ?? EMPTY_STRATEGY;
  return strategy.collectCandidates(hints);
}
export {
  OD_RESOURCE_ROOT_ENV,
  collectAssetCandidates,
  locateEnvHints,
  resourceRootOverride
};
