/**
 * client/config-form-rmw.ts —— 插件 Config 整字段读改写（RMW）的共享助手（MF-1-2）。
 *
 * 为什么需要它：`ConfigFormLike.set` 的「接受」只保证宿主按当时 revision 栅栏收下了这次
 * 写入，**不保证写入所基于的镜像快照内容是最新的**——插件 Config 与 llm-pi-ai 等命名空间
 * 共享宿主设置文档的 revision 计数，其他命名空间的写入会把计数推进，让一份 revision 已
 * 推进而内容滞后的镜像快照随写入通过栅栏被接受（route-store.ts 内容级回放守卫注释记载的
 * 实测形态）。此时整字段读改写（读快照 → 改 → 整字段写回）会把滞后快照里没有、宿主真值
 * 里已有的他端成员静默抹掉（如 pendingCredentialUnsets 里他端窗口刚登记的 ref——AX9
 * 孤儿密钥防线的登记丢失形态）。本助手把两道防线收敛为唯一入口：
 *
 *   · 栅栏防线：被拒（宿主已自做一次镜像重读，`ConfigFormLike.set` 契约）自动以重读快照
 *     重算重发一次——重算取到的即新栅栏与新内容，非盲重试；传输异常同径重试一次。
 *   · 内容防线：接受后按 verify 钩子校验关键成员状态（append 场景 = 本端写入的 ref 在场
 *     性；remove 场景 = 被移除成员的缺席性）。缺席说明接受基于滞后快照——滞后镜像恰保有
 *     被覆盖前的宿主真值，以重读内容重算重发一次即可挽回他端成员。「他端 ref 的集合」
 *     本端不可枚举，防线以本端关键成员的在场性为信号、以重读内容为挽回源。
 *
 * 与 route-store 的分工（不重叠）：RoutesListModel 的 writeRoutesAndWhitelist 双字段原子
 * 通道（一次乐观登记 + 两笔 commit 的 pair 语义）与 preImages/lastWritten/reconciledFor
 * 读侧回放守卫是路由表专用的会话内乐观更新体系，保持其私有机制不动；本助手只服务「无
 * 乐观 UI 状态的整字段读改写」（pendingCredentialUnsets 的登记与重试写回、appearance
 * 单值写入），不持有会话内权威、不做读侧守卫。
 *
 * 行为上界：每道防线各重发一次（最坏三次 set），连续失败如实返回终态，由调用方翻译文案。
 */
import type { ConfigFormLike } from './persist'

/**
 * 单字段 RMW 的终态：accepted = 落盘（或幂等判定无需写入）；refused = 重发后仍被拒；
 * failed = 传输异常（重试一次后仍失败，detail 为错误消息）；not-ready = 快照未被服务或
 * 镜像未答（requireReady 下零写入）。
 */
export type ConfigFieldRMWOutcome =
  | { kind: 'accepted' }
  | { kind: 'refused' }
  | { kind: 'failed'; detail: string }
  | { kind: 'not-ready' }

/** compute 的返回：write:false = 内容已符合预期（幂等），本轮零写入直接 accepted。 */
export type ConfigFieldRMWValue = { write: false } | { write: true; value: unknown }

/** 基于字段现值计算新值（幂等判定也在其中——返回 write:false 跳过写入）。 */
export type ConfigFieldCompute = (current: unknown) => ConfigFieldRMWValue

/** 接受后的内容校验：true = 关键成员状态符合预期；false = 触发重读重算重发一次。 */
export type ConfigFieldVerify = (fresh: unknown) => boolean

/** 附加选项。 */
export interface ConfigFieldRMWOptions {
  /**
   * 快照非 ready（镜像未答 / 命名空间未被服务）时是否仍照写。缺省 true：非 ready 返回
   * not-ready、零写入（RMW 的计算依赖字段现值，无内容不可算）。单值写入（写入值不依赖
   * 快照内容，compute 收到 undefined current）可传 false 保持「任何镜像态都尝试 set」。
   */
  requireReady?: boolean
}

/**
 * 整字段读改写的唯一入口：读快照 → compute → set；被拒/传输异常以重读快照重算重发一次；
 * 接受后按 verify 校验关键成员，缺席以重读内容重算重发一次。
 */
export async function writeConfigFieldRMW(
  form: ConfigFormLike,
  field: string,
  compute: ConfigFieldCompute,
  verify?: ConfigFieldVerify,
  options: ConfigFieldRMWOptions = {},
): Promise<ConfigFieldRMWOutcome> {
  const requireReady = options.requireReady ?? true
  const first = await attemptRMW(form, field, compute, requireReady)
  if (first.kind === 'refused' || first.kind === 'failed') {
    // 栅栏防线：被拒时宿主已自做镜像重读，重算取新栅栏与新内容；传输异常同径重试一次。
    const second = await attemptRMW(form, field, compute, requireReady)
    if (second.kind !== 'accepted') return second
    return verifyPhase(form, field, compute, verify)
  }
  if (first.kind === 'not-ready') return first
  return verifyPhase(form, field, compute, verify)
}

/** 单轮尝试：读快照 → compute（幂等跳过）→ set；传输异常收敛成 failed（不外抛）。 */
async function attemptRMW(
  form: ConfigFormLike,
  field: string,
  compute: ConfigFieldCompute,
  requireReady: boolean,
): Promise<ConfigFieldRMWOutcome> {
  const snapshot = form.getSnapshot()
  if (snapshot.status !== 'ready' && requireReady) return { kind: 'not-ready' }
  const section = typeof snapshot.value === 'object' && snapshot.value !== null
    ? snapshot.value as Record<string, unknown>
    : undefined
  const plan = compute(section?.[field])
  if (!plan.write) return { kind: 'accepted' }
  try {
    const accepted = await form.set(field, plan.value)
    return accepted ? { kind: 'accepted' } : { kind: 'refused' }
  } catch (error) {
    return { kind: 'failed', detail: error instanceof Error ? error.message : String(error) }
  }
}

/** 接受后的内容防线：verify 通过即终；缺席以重读内容重算重发一次（不再嵌套重试）。 */
async function verifyPhase(
  form: ConfigFormLike,
  field: string,
  compute: ConfigFieldCompute,
  verify: ConfigFieldVerify | undefined,
): Promise<ConfigFieldRMWOutcome> {
  if (verify === undefined) return { kind: 'accepted' }
  const snapshot = form.getSnapshot()
  if (snapshot.status !== 'ready') return { kind: 'accepted' } // 写入已落盘，不因镜像态反悔已接受事实
  const section = typeof snapshot.value === 'object' && snapshot.value !== null
    ? snapshot.value as Record<string, unknown>
    : undefined
  if (verify(section?.[field])) return { kind: 'accepted' }
  return await attemptRMW(form, field, compute, true)
}
