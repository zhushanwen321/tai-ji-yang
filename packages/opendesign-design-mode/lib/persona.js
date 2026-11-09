import { locateOdAssets } from "./locate/version-profile.js";
import { composeSystemPrompt } from "./compose/bundle.js";
import {
  OD_MISSING_MESSAGE,
  OD_PROBE_FAILED_MESSAGE,
  OdProbeError
} from "./types.js";
const name = "od-persona";
const inject = ["systemPrompt"];
const OD_PERSONA_SECTION_NAME = "deployment:persona-prefix";
const OD_PERSONA_SECTION_ORDER_KEY = "DEPLOYMENT_PERSONA_PREFIX";
function toProbeOutcome(result) {
  if (result.status === "found") return { status: "found", resourceRoot: result.profile.resourceRoot };
  if (result.status === "missing") return { status: "missing" };
  return { status: "error", reason: result.reason };
}
function probeDiagnostic(outcome) {
  if (outcome.status === "found") return void 0;
  if (outcome.status === "missing") return OD_MISSING_MESSAGE;
  return `${OD_PROBE_FAILED_MESSAGE}（探测错误：${outcome.reason}）`;
}
function apply(ctx) {
  const located = locateOdAssets();
  const diagnostic = probeDiagnostic(toProbeOutcome(located));
  if (diagnostic !== void 0) {
    throw new OdProbeError(diagnostic);
  }
  if (located.status !== "found") {
    throw new OdProbeError(OD_PROBE_FAILED_MESSAGE + "（探测结局与诊断判定不一致）");
  }
  const bundle = composeSystemPrompt({ profile: located.profile });
  ctx.effect(() => ctx.systemPrompt.section({
    name: OD_PERSONA_SECTION_NAME,
    order: ctx.systemPrompt.getSectionOrder(OD_PERSONA_SECTION_ORDER_KEY),
    text: bundle.text
  }), "od.persona");
  ctx.logger.debug(
    `OpenDesign 设计模式 persona section 已注册（资产根 ${located.profile.resourceRoot}，提示词 ${bundle.text.length} 字符，改写命中记录 ${bundle.rewriteRecords.length} 条）`
  );
}
export {
  OD_PERSONA_SECTION_NAME,
  OD_PERSONA_SECTION_ORDER_KEY,
  apply,
  inject,
  name,
  probeDiagnostic
};
