const OD_CHANNEL_PRIORITY = ["override", "stable", "beta", "prerelease", "preview"];
class OdProbeError extends Error {
}
const OD_MISSING_MESSAGE = "未检测到 OpenDesign，请安装后重启 DSH。";
const OD_PROBE_FAILED_MESSAGE = "OpenDesign 资产检测失败，请重启 DSH 重试。";
const ROUTED_TASK_PROFILES = [
  "prototype",
  "ppt",
  "document",
  "marketing",
  "motion-design",
  "hyperframes",
  "web-clone",
  "webgl"
];
export {
  OD_CHANNEL_PRIORITY,
  OD_MISSING_MESSAGE,
  OD_PROBE_FAILED_MESSAGE,
  OdProbeError,
  ROUTED_TASK_PROFILES
};
