import { existsSync } from "node:fs";
import { join } from "node:path";
import { resourceRootOverride } from "./platform.js";
const CHANNEL_APPS = [
  ["Open Design.app", "stable"],
  ["Open Design Beta.app", "beta"],
  ["Open Design Prerelease.app", "prerelease"],
  ["Open Design Preview.app", "preview"]
];
function collectMacOsCandidates(hints) {
  const candidates = [];
  const override = resourceRootOverride(hints.env);
  if (override !== null) candidates.push({ resourceRoot: override, channel: "override" });
  const appDir = hints.applicationsDir ?? "/Applications";
  for (const [appName, channel] of CHANNEL_APPS) {
    const resources = join(appDir, appName, "Contents", "Resources");
    if (existsSync(resources)) candidates.push({ resourceRoot: resources, channel });
  }
  return candidates;
}
export {
  collectMacOsCandidates
};
