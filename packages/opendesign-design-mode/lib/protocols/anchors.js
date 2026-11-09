import { createHash } from "node:crypto";
import { renderDeckFrameworkFile } from "./deck.js";
import { PANEL_PROTOCOL_SKELETON } from "./panel.js";
const PROTOCOL_SOURCE_REPO_URL = "https://github.com/nexu-io/open-design";
const PROTOCOL_SOURCE_COMMIT = "20c49e75c9164bb592cfc299d366884ed79f9914";
const PROTOCOL_EXTRACTED_AT = "2026-11-10";
const PROTOCOL_VERSION_ANCHORS = [
  {
    protocol: "panel",
    sourceRepoUrl: PROTOCOL_SOURCE_REPO_URL,
    commit: PROTOCOL_SOURCE_COMMIT,
    extractedAt: PROTOCOL_EXTRACTED_AT,
    skeletonSha256: "03efc005cedb33d61194b80b73f37d28dc517d762deff9f94fb3e575765569d0",
    skeleton: () => PANEL_PROTOCOL_SKELETON,
    skeletonBasis: "renderPanelPrompt 渲染模板剔除插值后的静态部分（插值点以 {{token}} 标记承载；正源 apps/daemon/src/prompts/panel.ts）"
  },
  {
    protocol: "deck",
    sourceRepoUrl: PROTOCOL_SOURCE_REPO_URL,
    commit: PROTOCOL_SOURCE_COMMIT,
    extractedAt: PROTOCOL_EXTRACTED_AT,
    skeletonSha256: "bfcbae696a6a0f45b10d67f7e34b0427ea1018a6922e1451311d04efbe6144f0",
    skeleton: () => renderDeckFrameworkFile(),
    skeletonBasis: ".od-frames/deck-framework.md 铺盘全文（组文结构与 daemon device-frames.ts 同构；handoff 固定 filesystem，无其余插值；正源 packages/contracts/src/prompts/deck-framework.ts）"
  }
];
function computeSkeletonSha256(skeleton) {
  return createHash("sha256").update(skeleton, "utf8").digest("hex");
}
function compareSkeletonAnchor(protocol, skeleton) {
  const anchor = PROTOCOL_VERSION_ANCHORS.find((entry) => entry.protocol === protocol);
  if (anchor === void 0) {
    throw new Error(`compareSkeletonAnchor: 未登记的协议 ${protocol}（登记处 = PROTOCOL_VERSION_ANCHORS）`);
  }
  const actualSha256 = computeSkeletonSha256(skeleton);
  return {
    status: actualSha256 === anchor.skeletonSha256 ? "ok" : "drift",
    expectedSha256: anchor.skeletonSha256,
    actualSha256
  };
}
export {
  PROTOCOL_EXTRACTED_AT,
  PROTOCOL_SOURCE_COMMIT,
  PROTOCOL_SOURCE_REPO_URL,
  PROTOCOL_VERSION_ANCHORS,
  compareSkeletonAnchor,
  computeSkeletonSha256
};
