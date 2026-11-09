import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderDeckFrameworkFile } from "../protocols/deck.js";
const OD_FRAMES_DIR = ".od-frames";
const DECK_FRAMEWORK_FILE_NAME = "deck-framework.md";
const MATERIALIZED_FILE_NAMES = [
  "android.html",
  "iphone.html",
  "neutral.html",
  "layout.css"
];
const MATERIALIZED_WRITE_LIST = [
  ...MATERIALIZED_FILE_NAMES,
  DECK_FRAMEWORK_FILE_NAME
];
const MANAGED_NAMES = new Set(MATERIALIZED_FILE_NAMES);
class MaterializeSourceError extends Error {
  constructor(message) {
    super(message);
    this.name = "MaterializeSourceError";
  }
}
async function materializeAssets(input) {
  const manifestDir = path.dirname(input.manifestPath);
  let raw;
  try {
    raw = await readFile(input.manifestPath, "utf8");
  } catch (err) {
    throw new MaterializeSourceError(
      `无法读取 OD 资产清单 ${input.manifestPath}：${err.message}。恢复动作：运行 /opendesign-doctor 检查资产定位与完整性，确认 OpenDesign 安装未损坏。`
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new MaterializeSourceError(
      `OD 资产清单不是合法 JSON：${input.manifestPath}（${err.message}）。恢复动作：运行 /opendesign-doctor 检查清单完整性，确认 OpenDesign 安装未损坏。`
    );
  }
  const taskProfiles = parsed.od?.strategy?.assets?.taskProfiles;
  if (!Array.isArray(taskProfiles)) {
    throw new MaterializeSourceError(
      `OD 资产清单结构漂移：od.strategy.assets.taskProfiles 缺失或非数组（${input.manifestPath}）。恢复动作：运行 /opendesign-doctor 检查清单版本，OD 升级后结构变化需适配本插件。`
    );
  }
  const plan = /* @__PURE__ */ new Map();
  for (const [profileIndex, profile] of taskProfiles.entries()) {
    const resources = profile.resources;
    if (resources === void 0) continue;
    if (!Array.isArray(resources)) {
      throw new MaterializeSourceError(
        `OD 资产清单结构漂移：taskProfiles[${profileIndex}].resources 非数组（${input.manifestPath}）。恢复动作：运行 /opendesign-doctor 检查清单版本。`
      );
    }
    for (const [resourceIndex, resource] of resources.entries()) {
      const resourcePath = resource.path;
      if (typeof resourcePath !== "string" || resourcePath === "") {
        throw new MaterializeSourceError(
          `OD 资产清单结构漂移：taskProfiles[${profileIndex}].resources[${resourceIndex}].path 缺失（${input.manifestPath}）。恢复动作：运行 /opendesign-doctor 检查清单版本。`
        );
      }
      const name = resourcePath.split("/").pop() ?? "";
      if (!MANAGED_NAMES.has(name)) continue;
      const sourcePath = path.resolve(manifestDir, resourcePath);
      const previous = plan.get(name);
      if (previous !== void 0 && previous !== sourcePath) {
        throw new MaterializeSourceError(
          `OD 资产清单冲突：管理名 ${name} 被声明指向两个不同源（${previous} 与 ${sourcePath}）。落点唯一（${OD_FRAMES_DIR}/${name}），无法同时重铺两份内容。恢复动作：运行 /opendesign-doctor 检查清单，OD 升级后结构变化需适配本插件。`
        );
      }
      plan.set(name, sourcePath);
    }
  }
  const targetRoot = path.join(input.cwd, OD_FRAMES_DIR);
  await mkdir(targetRoot, { recursive: true });
  const files = [];
  const ordered = [...plan.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  for (const [name, sourcePath] of ordered) {
    let content;
    try {
      content = await readFile(sourcePath);
    } catch (err) {
      throw new MaterializeSourceError(
        `无法读取 OD 源资产 ${sourcePath}（清单声明的管理名 ${name}）：${err.message}。恢复动作：运行 /opendesign-doctor 检查资产完整性（roster 核验），确认 OpenDesign 安装未损坏。`
      );
    }
    await writeFile(path.join(targetRoot, name), content);
    files.push({ name, sourcePath, bytes: content.byteLength });
  }
  const deckText = renderDeckFrameworkFile();
  await writeFile(path.join(targetRoot, DECK_FRAMEWORK_FILE_NAME), deckText);
  files.push({ name: DECK_FRAMEWORK_FILE_NAME, bytes: Buffer.byteLength(deckText) });
  return { targetRoot, files };
}
export {
  DECK_FRAMEWORK_FILE_NAME,
  MATERIALIZED_FILE_NAMES,
  MATERIALIZED_WRITE_LIST,
  MaterializeSourceError,
  OD_FRAMES_DIR,
  materializeAssets
};
