/**
 * 设计面板 client 在 preset 组合内的 host 侧占位入口（patch 行 id: od-client）。
 *
 * 为什么有这个文件：preset plugins 的行由宿主 loader 在 host 侧装载，而行指向的模块必须
 * 是 host 可加载的 Cordis 插件。设计面板的**浏览器 bundle 本体**是 lib/client.js（顶层执行
 * `window.__ModuleLoader__.load(...)`，Node 侧 import 即抛 ReferenceError），且它的装载
 * 本来就不由 preset 行驱动——宿主 client-modules 按本包主行（patch 行 id:
 * opendesign-design-mode，name = 包名）解析包 manifest → dsh.client 声明 → exports
 * `./client`，把 bundle 编进 boot 图（与 tai-ji-yang-shell 的 client 半同构）。因此本行
 * （od-client）指向本入口，作为面板 client 在 preset 组合内的 host 侧锚点。
 *
 * 终态职责（U7 填实）：面板 client 的 host 侧协调（交付卡片点击路由到面板的 patterns
 * 接线等）；届时本入口登记的贡献点一律挂 `ctx.effect` 并返回 disposer。本单元（U1）
 * 保持最小可加载骨架——零贡献点、零副作用，保证装入即无装配错误（U1 验收条款②）。
 * 编号口径：本文件编号默认属 V1 设计包（opendesign-design-mode impl-plan）；其他设计包域编号带包名前缀（opendesign-assets-quality / p1-shell-identity）。
 */

/** Cordis 插件名（preset plugins 行的行内标识）。 */
export const name = 'od-client'

/**
 * 装配入口（U7 填实）。
 *
 * @param ctx - Cordis 插件上下文（preset 组合 scope）。
 */
export function apply(ctx) {
  ctx.logger.debug('od-client host 侧锚点已装配；面板 bundle 由主行经 client-modules 装载，协调逻辑由 U7 接线')
}
