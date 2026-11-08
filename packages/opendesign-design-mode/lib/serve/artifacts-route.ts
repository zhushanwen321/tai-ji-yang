/**
 * 产物伺服 host 子插件：webServer 前缀路由（U6 填实；本单元为最小可加载骨架）。
 *
 * 终态职责（设计 D7）：经宿主 webServer 注册同源前缀路由，伺服会话工作目录（伺服根 =
 * 会话 cwd）内的产物文件——过鉴权围栏（未认证 401/403）、路径穿越拒绝（.. 与绝对路径
 * 规范化后限制在 cwd 内）；设计面板 client 半的 iframe 载入本路由（sandbox="allow-scripts"
 * 隔离，D7 缓解）。路由注册先例 = DSH 仓 packages/host/open-in-app/src/index.ts:193-310
 * （register/WebRoute + connection 围栏）。
 *
 * 本单元（U1）只立插件行骨架：不注册路由（无贡献点即无 disposer 义务），装入即无装配
 * 错误；路由实现与围栏单测（tests/serve.test.ts，RL2）由 U6 落盘。桌面混合内容最小探针
 * 在 U6 交付门实测（复审 F5 / RR3）。
 */

/** Cordis 插件名（preset plugins 行的行内标识）。 */
export const name = 'od-serve'

/**
 * 本行消费的宿主服务：web 承载层。缺席时路由无从注册——与 shell 包的 profile 能力探针
 * 同理，本包是 web profile 专属能力（design 模式的预览依赖 http 同源伺服）。
 */
export const inject = ['webServer']

/**
 * 伺服路由装配入口（U6 填实：webServer 前缀路由 + 围栏 + 穿越拒绝）。
 *
 * @param ctx - Cordis 插件上下文（preset 组合 scope）。
 */
export function apply(ctx) {
  ctx.logger.debug('od-serve 骨架已装配；产物伺服路由由 U6 接线')
}
