import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  OD_CHANNEL_PRIORITY
} from "../types.js";
import {
  discoverManifest,
  isPathWithin,
  listDeclaredRosterPaths,
  ManifestValidationError
} from "./manifest-discovery.js";
import { collectAssetCandidates, locateEnvHints, OD_RESOURCE_ROOT_ENV } from "./platform.js";
const VERIFIED_SPEC_VERSIONS = ["1.0.0"];
function selectionKey(candidate) {
  const index = OD_CHANNEL_PRIORITY.indexOf(candidate.channel);
  return [index === -1 ? OD_CHANNEL_PRIORITY.length : index, candidate.resourceRoot];
}
function sortBySelectionOrder(candidates) {
  return [...candidates].sort((a, b) => {
    const [aChannel, aPath] = selectionKey(a);
    const [bChannel, bPath] = selectionKey(b);
    return aChannel !== bChannel ? aChannel - bChannel : aPath.localeCompare(bPath);
  });
}
function describeSelection(winner, sorted) {
  if (winner.channel === "override") return `环境变量 ${OD_RESOURCE_ROOT_ENV} 覆盖`;
  const sameChannelCount = sorted.filter((candidate) => candidate.channel === winner.channel).length;
  if (sameChannelCount > 1) return `路径序（同渠道多候选按路径排序；渠道 ${winner.channel}）`;
  return `渠道优先级（${winner.channel}）`;
}
function buildVersionProfile(candidates) {
  if (candidates.length === 0) return { status: "missing" };
  const sorted = sortBySelectionOrder(candidates);
  let firstBroken = null;
  for (const candidate of sorted) {
    const result = discoverManifest(candidate.resourceRoot);
    if (result.status === "not-found") continue;
    if (result.status === "broken") {
      if (firstBroken === null) firstBroken = { candidate, error: result.error };
      continue;
    }
    const discovered = result.discovered;
    const profile = {
      resourceRoot: discovered.resourceRoot,
      manifestPath: discovered.manifestPath,
      scenarioRoot: discovered.scenarioRoot,
      versions: discovered.versions,
      candidates: sorted,
      selectedBy: describeSelection(candidate, sorted),
      verified: VERIFIED_SPEC_VERSIONS.includes(discovered.versions.specVersion ?? "")
    };
    return { status: "found", profile };
  }
  if (firstBroken !== null) {
    return {
      status: "error",
      reason: `候选 ${firstBroken.candidate.resourceRoot}（渠道 ${firstBroken.candidate.channel}）资产不可用：` + firstBroken.error.message
    };
  }
  return { status: "missing" };
}
function locateOdAssets(hints = locateEnvHints()) {
  return buildVersionProfile(collectAssetCandidates(hints));
}
function readRosterAsset(profile, relativePath) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(profile.manifestPath, "utf8"));
  } catch (error) {
    throw new ManifestValidationError(
      `OpenDesign 资产清单不可读取或解析失败（${profile.manifestPath}）：${error instanceof Error ? error.message : String(error)}。恢复动作：重装 OpenDesign，然后重启 DSH。`,
      profile.manifestPath
    );
  }
  const normalized = relativePath.replace(/^\.\//, "");
  const declared = listDeclaredRosterPaths(manifest).map((path) => path.replace(/^\.\//, ""));
  if (!declared.includes(normalized)) {
    throw new ManifestValidationError(
      `路径 "${relativePath}" 不在清单声明的 roster 集合内（${profile.manifestPath}），默认读取器只读清单声明过的资产。`,
      profile.manifestPath
    );
  }
  const absolute = join(profile.scenarioRoot, normalized);
  if (!isPathWithin(profile.scenarioRoot, absolute)) {
    throw new Error(
      `路径 "${relativePath}" 解析后越出场景包目录（${profile.scenarioRoot}），已拒绝读取。`
    );
  }
  return readFileSync(absolute, "utf8");
}
export {
  VERIFIED_SPEC_VERSIONS,
  buildVersionProfile,
  locateOdAssets,
  readRosterAsset
};
