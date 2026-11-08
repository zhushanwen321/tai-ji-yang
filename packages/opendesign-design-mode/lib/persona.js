import { existsSync } from "node:fs";
import {
  OD_MISSING_MESSAGE,
  OD_PROBE_FAILED_MESSAGE,
  OdProbeError
} from "./types.js";
const name = "od-persona";
const inject = ["systemPrompt"];
const PRIMARY_APP_ROOT = "/Applications/Open Design.app/Contents/Resources";
function candidateRoots() {
  return existsSync(PRIMARY_APP_ROOT) ? [PRIMARY_APP_ROOT] : [];
}
function probeOdAssets() {
  let roots;
  try {
    roots = candidateRoots();
  } catch (error) {
    return { status: "error", reason: error instanceof Error ? error.message : String(error) };
  }
  if (roots.length === 0) return { status: "missing" };
  return { status: "found", resourceRoot: roots[0] };
}
function probeDiagnostic(outcome) {
  if (outcome.status === "found") return void 0;
  if (outcome.status === "missing") return OD_MISSING_MESSAGE;
  return `${OD_PROBE_FAILED_MESSAGE}（探测错误：${outcome.reason}）`;
}
function apply(ctx) {
  const outcome = probeOdAssets();
  const diagnostic = probeDiagnostic(outcome);
  if (diagnostic !== void 0) {
    throw new OdProbeError(diagnostic);
  }
  ctx.logger.debug("OpenDesign 资产就绪，persona section 待组装器（U3）接入");
}
export {
  apply,
  inject,
  name,
  probeDiagnostic,
  probeOdAssets
};
