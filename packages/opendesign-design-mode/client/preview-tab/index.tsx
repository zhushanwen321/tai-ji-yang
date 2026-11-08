/**
 * client/preview-tab/index.tsx —— 设计预览面板的浏览器半场源入口（U7 填实；本单元最小骨架）。
 *
 * 终态职责（设计 D7）：经 `ctx.sidebarRightTabs` 注册右侧栏设计面板 tab 类型（可停靠/
 * 分屏/浮动），面板体内 iframe 载入产物伺服路由（伺服根 = 会话 cwd，host 半 lib/serve/
 * artifacts-route.ts）——iframe 一律带 `sandbox="allow-scripts"` 且**不含** allow-same-origin
 * （产物脚本隔离的缓解落地，D7 影响分析）；面板内附产物列表兜底与加载态。
 *
 * 构建形态：本文件是 `node scripts/build-client.mjs` 对本包的浏览器半场入口（多包适配后
 * 逐包构建），产物 = lib/client.js（`window.__ModuleLoader__.load({ id, factory })` 契约）。
 * lib/client.js 的装载由本包 patch 主行驱动（宿主 client-modules 按行名解析包 manifest →
 * dsh.client → exports `./client`，与 tai-ji-yang-shell 同构）；preset 组合内的 od-client 行
 * 指向 host 侧锚点 lib/client-entry.js——浏览器 bundle 不进 host 装载（顶层 window 引用）。
 *
 * 本单元（U1）只立可编译骨架：入口导出 `inject` 与 `apply`（与 tai-ji-yang-shell 的
 * client/apply.ts 同构的最小结构类型形态），apply 零贡献点——tab 注册、iframe 视图与
 * 产物列表由 U7 落盘（client/preview-tab/iframe-view.tsx、artifact-list.tsx）。
 */

/** 面板消费的宿主 client 模块（U7 接线 sidebarRightTabs 时按需追加；骨架期零依赖）。 */
export const inject: string[] = []

/** 本包浏览器半场用到的宿主 context（最小结构类型；不 import 任何 dsh-client 包）。 */
export interface PreviewApplyContext {
  /** 登记启动副作用并拿到 fiber 生命周期托管（卸载时反序执行 disposer）。 */
  effect(execute: () => () => void, label?: string): void
  /** 诊断日志（宿主按包名打前缀）。 */
  logger: { debug(message: string): void; warn(message: string): void; error(message: string): void }
}

/**
 * 浏览器半场装配入口（factory 壳物化时执行；U7 填实 tab 注册）。
 *
 * @param ctx - 宿主 client context。
 */
export function apply(ctx: PreviewApplyContext): void {
  ctx.logger.debug('preview-tab 骨架已物化；设计面板 tab 注册由 U7 接线')
}
