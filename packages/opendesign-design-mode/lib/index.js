/**
 * opendesign-design-mode —— 包主行的 host 半入口（patch 行 id: opendesign-design-mode）。
 *
 * 职责边界（本包各机制的归属）：
 *   - preset 组合的挂载由 patch 的 `@deepseek-ai/dsh-agent-preset` 行完成（声明式，本文件
 *     不参与）；persona 行的启动资产探测与 broken 降级在 lib/persona.ts（探测必须在 preset
 *     组合的子行内，子行失败才会被 agent-preset-registry 记为 preset 的 broken 诊断——主行
 *     失败是 profile 装配错误，不是设计内的降级形态，见 persona.ts 文件头）。
 *   - 本文件是包级生命周期的宿主侧锚点：终态在此承载跨子插件协调（材质化触发与资产
 *     代际感知等，U5/U3 接线时落盘）。本单元（U1）保持最小可加载骨架——不注册任何会失败
 *     的槽位贡献（tai-ji-yang-shell 包纪律），装配期零副作用，保证「装入即无装配错误」
 *     （U1 验收条款②的 stub 形态）。
 *
 * 宿主契约：Cordis 插件 = 导出 `name` 与 `apply(ctx, config)` 的 ESM 模块；贡献点一律经
 * `ctx.effect` 登记并返回 disposer，卸载即撤除。本包零 npm 运行时依赖：宿主供给的能力走
 * 宿主模块表，探测逻辑只直连 node:fs（lib/persona.ts）。
 */

/** Cordis 插件显示名（与 package.json 的 name、patch 行 id 同一字面值；诊断日志归属名）。 */
export const name = 'opendesign-design-mode'

/**
 * 包主行装配入口。
 *
 * @param ctx - Cordis 插件上下文。本单元无贡献点；U3/U5 接线时在此登记的贡献点一律
 *   挂 `ctx.effect` 并返回 disposer（卸载即撤除，不留残留监听）。
 */
export function apply(ctx) {
  ctx.logger.debug('opendesign-design-mode host 半已装配（骨架形态；preset 行见 cordis.patch.yml）')
}
