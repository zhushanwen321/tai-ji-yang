/**
 * opendesign-design-mode —— 包主行的 host 半入口（patch 行 id: opendesign-design-mode）。
 *
 * 职责边界（本包各机制的归属）：
 *   - preset 组合的挂载由 patch 的 `@deepseek-ai/dsh-agent-preset` 行完成（声明式，本文件
 *     不参与）；persona 行的启动资产探测与 broken 降级在 lib/persona.ts（探测必须在 preset
 *     组合的子行内，子行失败才会被 agent-preset-registry 记为 preset 的 broken 诊断——主行
 *     失败是 profile 装配错误，不是设计内的降级形态，见 persona.ts 文件头）。
 *   - 本文件是包级生命周期的宿主侧锚点：承载跨子插件协调。本文件登记材质化触发（D8）：
 *     会话选定设计 preset 的时点（宿主 `agent-preset/selected` 事件）把设备壳支撑文件
 *     无条件全量重铺进会话工作目录。
 *
 * 材质化触发点的宿主契约（0.1.7-rc.2 亲读核实，U8 接线时定案）：
 *   - 事件：agent-preset-registry 对会话事件 `agent-preset/selected` 的转发
 *     （ctx.emit('agent-preset/selected', sessionId, presetId)）——preset 应答到会话的时点，
 *     覆盖「blank 会话经芯片 staged pick 应用设计 preset」与 resume 重组两条路径，即 D8 的
 *     「会话创建时」（doctor 文案同口径：新会话首轮前已重铺）；
 *   - cwd：`ctx.sessions.get(sessionId).header.cwd`（working-directory 服务 0.1.7 不在，
 *     session header 的 cwd 字段两版本都有，doctor 的 resolveSessionCwd 同款回退链；
 *     sessions 服务必须经 inject 声明——cordis ctx 读未声明服务即抛，preview-tab 同款纪律）；
 *   - 失败语义：监听器的异步拒绝被宿主 per-listener containment 记 warn（dsh-session
 *     announce 语义），会话创建不因此回滚——材质化失败时本包侧以 logger.error 带恢复动作
 *     记日志（降级 ≠ 吞错），落点状态由 /opendesign-doctor 第⑤项报告（D8 的感知通道）。
 *     copy.ts 文件头假设的「persona 激活链路抛错 → preset broken」不可达：preset 挂载是
 *     per-revision 一次（进程生命周期），不是 per-session——事件接线形态与该注释的这一点
 *     分歧在此显式登记（2026-11-09，U8 接线时核实 dsh-agent-preset-registry mount 语义）。
 *
 * 宿主契约：Cordis 插件 = 导出 `name` 与 `apply(ctx, config)` 的 ESM 模块；贡献点一律经
 * `ctx.effect` 登记并返回 disposer，卸载即撤除。本包零 npm 运行时依赖：宿主供给的能力走
 * 宿主模块表，探测逻辑只直连 node:fs（lib/persona.ts）。
 */
import { locateOdAssets } from './locate/version-profile.js'
import { materializeAssets } from './materialize/copy.js'

/** Cordis 插件显示名（与 package.json 的 name、patch 行 id 同一字面值；诊断日志归属名）。 */
export const name = 'opendesign-design-mode'

/** 本行消费的宿主服务：会话注册表（dsh-session 的 ctx.sessions；cwd 探测用）。 */
export const inject = ['sessions']

/** 本包 preset 的 id（cordis.patch.yml preset 行 config.id；事件过滤用）。 */
const OD_PRESET_ID = 'opendesign'

/**
 * 包主行装配入口。
 *
 * @param ctx - Cordis 插件上下文。登记的贡献点一律挂 `ctx.effect` 并返回 disposer
 *   （卸载即撤除，不留残留监听）。
 */
export function apply(ctx) {
  ctx.logger.debug('opendesign-design-mode host 半已装配（preset 行见 cordis.patch.yml）')
  ctx.effect(() => ctx.on('agent-preset/selected', (sessionId, presetId) => {
    materializeForSession(ctx, sessionId, presetId)
  }), 'opendesign-design-mode: 材质化触发（agent-preset/selected）')
}

/**
 * 设计 preset 应答到会话时点的材质化（D8 无条件全量重铺；非设计会话零写入）。
 *
 * @param ctx - Cordis 插件上下文（包主行 scope）。
 * @param sessionId - 选定了 preset 的会话 id。
 * @param presetId - 选定的 preset id；非本包 preset 直接返回（标准会话无设计内容）。
 */
function materializeForSession(ctx, sessionId, presetId) {
  if (presetId !== OD_PRESET_ID) return
  const cwd = sessionCwdOf(ctx, sessionId)
  if (cwd === null) {
    ctx.logger.warn(`opendesign-design-mode: 会话 ${sessionId} 选定设计 preset 但工作目录不可得，材质化跳过（落点未知；/opendesign-doctor 第⑤项同口径按目录未知报告）`)
    return
  }
  const located = locateOdAssets()
  if (located.status !== 'found') {
    // preset 激活时点的探测（persona 行）已把资产不可用挡在 preset broken（AX5）；本分支是
    // 运行期资产被移除的旁路形态：报错不重铺，落点保持旧态由 doctor 感知，不静默伪造清单。
    ctx.logger.error(`opendesign-design-mode: 会话 ${sessionId} 材质化失败——资产不可用（${located.status === 'missing' ? '未检测到 OpenDesign' : located.reason}）。恢复动作：运行 /opendesign-doctor 检查资产定位。`)
    return
  }
  materializeAssets({ manifestPath: located.profile.manifestPath, cwd }).then(
    (manifest) => ctx.logger.debug(`opendesign-design-mode: 会话 ${sessionId} 材质化完成（${manifest.files.length} 文件 → ${manifest.targetRoot}）`),
    (error) => ctx.logger.error(`opendesign-design-mode: 会话 ${sessionId} 材质化失败：${error instanceof Error ? error.message : String(error)}（落点状态由 /opendesign-doctor 第⑤项报告）`),
  )
}

/**
 * 会话工作目录探测：session header 的 cwd 字段（两目标版本会话 header 均带 cwd；
 * doctor resolveSessionCwd 的回退链尾段同款）。服务或会话不可得时返回 null。
 *
 * @param ctx - Cordis 插件上下文。
 * @param sessionId - 会话 id。
 * @returns 会话 cwd；不可得时 null。
 */
function sessionCwdOf(ctx, sessionId) {
  const sessions = /** @type {{ get?: (id: string) => unknown } | undefined} */ (/** @type {unknown} */ (ctx).sessions)
  const session = typeof sessions?.get === 'function' ? sessions.get(sessionId) : undefined
  const cwd = /** @type {{ header?: { cwd?: unknown } } | undefined} */ (/** @type {unknown} */ (session))?.header?.cwd
  return typeof cwd === 'string' && cwd.length > 0 ? cwd : null
}
