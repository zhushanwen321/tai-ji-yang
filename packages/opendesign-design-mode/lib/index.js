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
 *     无条件全量重铺进会话工作目录。同一事件（独立监听、presetId 过滤同款）登记质量环
 *     触发（U5 / D4 / D5）：起 fs.watch 递归监听（lib/quality/watcher.js）→ 写盘事件经
 *     防抖 + 完整性哨兵 → lib/quality/lint.js 检查 → lib/quality/feedback.js 仅 P0 回注
 *     （steer/followup 双通道）+ .od-quality/report.jsonl 记录。监听器集合挂进程 effect
 *     （卸载即撤）；同会话重复 selected（resume 重组路径）先撤旧监听再起新一代——新一代
 *     快照 + 产物身份豁免集即 resume 语义（D5④）。非设计会话零监听零注入（preset 过滤）。
 *
 * 材质化触发点的宿主契约（0.1.7-rc.2 亲读核实，U8 接线时定案）：
 *   - 事件：agent-preset-registry 对会话事件 `agent-preset/selected` 的转发
 *     （ctx.emit('agent-preset/selected', sessionId, presetId)）——preset 应答到会话的时点，
 *     覆盖「blank 会话经芯片 staged pick 应用设计 preset」与 resume 重组两条路径，即 D8 的
 *     「会话创建时」（doctor 文案同口径：新会话首轮前已重铺）；
 *   - cwd：resolveSessionCwdById（lib/serve/session-cwd.js，U6 检查点裁决的唯一通道）——
 *     sessions.get(sessionId) 取会话对象后 workingDirectory.get 优先（0.2.x）、header.cwd
 *     回退（两版本 header 均带 cwd 字段）。产物伺服路由（lib/serve/artifacts-route.ts）的
 *     伺服根消费同一函数，「伺服根 = 材质化目标」由结构承载，不靠两边各自约定。sessions
 *     服务必须经 inject 声明——cordis ctx 读未声明
 *     服务即抛，preview-tab 同款纪律；
 *   - 失败语义：监听器的异步拒绝被宿主 per-listener containment 记 warn（dsh-session
 *     announce 语义），会话创建不因此回滚——材质化失败时本包侧以 logger.error 带恢复动作
 *     记日志（降级 ≠ 吞错），落点状态由 /opendesign-doctor 第⑤项报告（D8 的感知通道）。
 *     材质化不挂 persona 激活链路：preset 挂载是 per-revision 一次的进程生命周期行为而非
 *     per-session，「抛错 → preset broken」降级只属 persona 行启动探测（见 persona.ts）；
 *     copy.ts 文件头的失败语义与本监听同口径。
 *
 * 宿主契约：Cordis 插件 = 导出 `name` 与 `apply(ctx, config)` 的 ESM 模块；贡献点一律经
 * `ctx.effect` 登记并返回 disposer，卸载即撤除。本包零 npm 运行时依赖：宿主供给的能力走
 * 宿主模块表，探测逻辑只直连 node:fs（lib/persona.ts）。
 */
import { locateOdAssets } from './locate/version-profile.js'
import { materializeAssets } from './materialize/copy.js'
import { createQualityFeedbackHandler } from './quality/feedback.js'
import { lintArtifact } from './quality/lint.js'
import { startSessionWatcher } from './quality/watcher.js'
import { resolveSessionCwdById } from './serve/session-cwd.js'

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
  // 质量环监听器集合（U5/D4）：每设计会话一个监听器，同会话 selected 重复先撤旧起新
  // （Map 键 = sessionId）；进程卸载统一撤除。监听器自毁（错误/目录不可达）从集合出清
  // 由自毁侧完成（controller.destroyed 后 dispose 为 no-op，残留在集合内无害）。
  const qualityWatchers = new Map()
  ctx.effect(() => () => {
    for (const watcher of qualityWatchers.values()) watcher.dispose()
    qualityWatchers.clear()
  }, 'opendesign-design-mode: 质量环监听器集合（进程卸载即撤）')
  ctx.effect(() => ctx.on('agent-preset/selected', (sessionId, presetId) => {
    startQualityWatchForSession(ctx, sessionId, presetId, qualityWatchers)
  }), 'opendesign-design-mode: 质量环监听触发（agent-preset/selected）')
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
  const cwd = resolveSessionCwdById(ctx, sessionId)
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
 * 设计 preset 应答到会话时点的质量环监听启动（U5/D4；非设计会话零监听）。
 *
 * @param ctx - Cordis 插件上下文（包主行 scope）。
 * @param sessionId - 选定了 preset 的会话 id。
 * @param presetId - 选定的 preset id；非本包 preset 直接返回。
 * @param qualityWatchers - 会话 → 换代条目的在册集合（进程 effect 持有，卸载统一撤）。
 */
function startQualityWatchForSession(ctx, sessionId, presetId, qualityWatchers) {
  if (presetId !== OD_PRESET_ID) return
  const cwd = resolveSessionCwdById(ctx, sessionId)
  if (cwd === null) {
    ctx.logger.warn(`opendesign-design-mode: 会话 ${sessionId} 选定设计 preset 但工作目录不可得，质量环监听跳过（落点未知；/opendesign-doctor 第⑪节按监听未启动报告）`)
    return
  }
  // 同会话重复 selected（resume 重组路径）：先撤上一代监听再起新一代——新一代的启动快照
  // + 产物身份豁免集（report.jsonl 回查）承载 resume 语义（D5④）。条目同步创建：监听启动
  // 是异步的（快照扫描先行），换代若发生在启动完成前，条目 disposed 旗标会在完成时把
  // 刚落定的控制器立即撤除——不存在「旧代启动完才入集合」的双监听竞态。
  const previous = qualityWatchers.get(sessionId)
  if (previous !== undefined) {
    previous.dispose()
    qualityWatchers.delete(sessionId)
  }
  const entry = {
    disposed: false,
    controller: undefined,
    dispose() {
      entry.disposed = true
      if (entry.controller !== undefined) entry.controller.dispose()
    },
  }
  qualityWatchers.set(sessionId, entry)
  const feedback = createQualityFeedbackHandler({ ctx, sessionId, cwd })
  startSessionWatcher({
    cwd,
    lintArtifact,
    // SC7 进程级观测（回注放弃口）：放弃回注的裁决（no-agent / inject-error）各写一行——
    // 发现已落 report.jsonl（doctor 第⑪节读侧），宿主进程日志补跨进程排障通道（D4 残存期
    // 「report.jsonl 一行 + ctx.logger 一行」的后半句）。每事件一行、不含产物内容；级别按
    // 分级契约：no-agent 是残存期查无活 Agent 的声明行为（debug）、inject-error 是注入
    // 调用异常（warn 带恢复动作）。
    onFindings: (input) => feedback(input).then((outcome) => {
      if (outcome.action !== 'recorded-only') return
      if (outcome.reason === 'no-agent') {
        ctx.logger.debug(`opendesign-design-mode: 会话 ${sessionId} 质量环回注放弃（查无活 Agent；文件 ${input.relativePath}）——发现已落检查记录，经 /opendesign-doctor 第⑪节查看`)
      } else if (outcome.reason === 'inject-error') {
        ctx.logger.warn(`opendesign-design-mode: 会话 ${sessionId} 质量环回注放弃（注入调用失败；文件 ${input.relativePath}）——发现已落检查记录；恢复动作：运行 /opendesign-doctor 第⑪节查看发现`)
      }
    }),
    onDestroyed: (reason) => ctx.logger.warn(`opendesign-design-mode: 会话 ${sessionId} 质量环监听器自毁（${reason}）。恢复动作：resume 该会话重新触发监听；生命周期记录见 /opendesign-doctor 第⑪节。`),
    logger: ctx.logger,
  }).then((controller) => {
    // 启动即自毁（目录不可达等）不持控制器——残存句柄零；换代竞态见 entry.dispose 注释。
    if (controller.destroyed) return
    if (entry.disposed) {
      controller.dispose()
      return
    }
    entry.controller = controller
    // SC7 进程级观测（监听器启动口）：启动成功且存活一行 debug；自毁口在 onDestroyed、
    // 换代撤销的代未存活（disposed 分支）不记启动行，避免「已启动即撤」的误导观测行。
    ctx.logger.debug(`opendesign-design-mode: 会话 ${sessionId} 质量环监听已启动（${cwd}）`)
  }, (error) => {
    ctx.logger.error(`opendesign-design-mode: 会话 ${sessionId} 质量环监听启动异常：${error instanceof Error ? error.message : String(error)}。恢复动作：运行 /opendesign-doctor 检查会话目录状态。`)
  })
}
