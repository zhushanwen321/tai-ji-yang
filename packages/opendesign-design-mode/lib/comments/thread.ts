/**
 * 评论线程显式状态机（U1；机制权威 = 设计 §3.3 D5 / 公理 AX3「lifecycle × delivery 双维
 * 正交，表外转移一律 fail-fast 抛错，不静默吞」）。
 *
 * 两个状态维度（contract.ts 词表）：
 *   - lifecycle status：open | resolved——用户裁决维（是否已解决）；
 *   - delivery：pending | delivered | no-agent | inject-error——系统投递维（投递结果）。
 * 两维正交：混成单维大状态表达不了「已解决但未送达」这类真实组合（D5 不采用条款）。
 *
 * 合法转移表 COMMENT_THREAD_TRANSITIONS 按 D5 采用条款 ①-⑤ 逐条静态枚举（表是唯一
 * 权威——isLegalThreadTransition / applyThreadTransition 都查它，测试逐行断言它）：
 *   ① 初始态 = open × pending（.create 落盘形态，INITIAL_THREAD_STATE）；
 *   ② deliver（投递结果回写，仅 open × pending 出发）→ delivered | no-agent | inject-error；
 *   ③ resolve（仅 open 出发，任意 delivery）→ resolved × 同一 delivery（不触发投递；
 *      对已 resolved 线程再 resolve 属表外——重开走 append-reply，不设 resolved:false）；
 *   ④ append-reply（任意组合态出发）→ open × pending（resolved 自动回 open 且 delivery
 *      一律重置 pending——追加评论进入新投递周期，旧内容不重投，D4）；
 *   ⑤ retry（仅 open × no-agent / open × inject-error 出发）→ open × pending（纯重投
 *      不写新文本；pending 无从重投、delivered 不接受重投、resolved 不重投旧内容）；
 *   ⑥ 表外转移（含对 pending 线程 retry、delivery 未经投递动作直改、resolved 态直接改
 *      delivery 等）一律抛 CommentTransitionError。
 *
 * deliveredAt 不变量：deliveredAt 存在 ⇔ 当前 delivery === 'delivered'（contract.ts
 * 「delivery 未达 delivered 前无值」）；append-reply / retry 把 delivery 重置 pending 时
 * 同步清除 deliveredAt，deliver → delivered 时写入新时刻。
 * 编号口径：本文件裸编号（D/AX/RL/UC 等）属 opendesign-comment-loop 设计包。
 */

import type { CommentDelivery, CommentThread, CommentThreadStatus } from './contract.js'

/** 状态机组合态（lifecycle × delivery 的一对取值；转移表 from/to 的最小单位）。 */
export interface CommentThreadState {
  status: CommentThreadStatus
  delivery: CommentDelivery
}

/** 状态机事件词表（D5 转移表 ②-⑤ 的事件名；①初始态由构造承载，不是转移事件）。 */
export type CommentTransitionEvent = 'deliver' | 'resolve' | 'append-reply' | 'retry'

/** deliver 事件的合法投递结果（pending 是投递前瞬态，不是投递结果）。 */
export type DeliverOutcome = Exclude<CommentDelivery, 'pending'>

/** 合法转移表单条规则（from 组合态 × 事件 → to 组合态；to 显式写死，静态可逐行断言）。 */
export interface CommentThreadTransitionRule {
  from: CommentThreadState
  event: CommentTransitionEvent
  to: CommentThreadState
}

/** 初始组合态（D5 ①：.create → open × pending，投递前瞬态）。 */
export const INITIAL_THREAD_STATE: CommentThreadState = { status: 'open', delivery: 'pending' }

/**
 * 合法转移表（D5 ②-⑤ 全量静态枚举，恰 17 条；组合态 × 事件唯一位恰 15 个——deliver
 * 从 open × pending 出发按三种投递结果各一条）。表外位（32 - 15 = 17 个）无规则命中，
 * applyThreadTransition 抛 CommentTransitionError（D5 ⑥）。
 */
export const COMMENT_THREAD_TRANSITIONS: readonly CommentThreadTransitionRule[] = [
  // ② deliver：仅 open × pending 出发（pending 是唯一可被投递结果覆盖的状态）
  { from: { status: 'open', delivery: 'pending' }, event: 'deliver', to: { status: 'open', delivery: 'delivered' } },
  { from: { status: 'open', delivery: 'pending' }, event: 'deliver', to: { status: 'open', delivery: 'no-agent' } },
  { from: { status: 'open', delivery: 'pending' }, event: 'deliver', to: { status: 'open', delivery: 'inject-error' } },
  // ③ resolve：仅 open 出发，delivery 原样保留（状态变更不触发投递，D2 .resolve 语义）
  { from: { status: 'open', delivery: 'pending' }, event: 'resolve', to: { status: 'resolved', delivery: 'pending' } },
  { from: { status: 'open', delivery: 'delivered' }, event: 'resolve', to: { status: 'resolved', delivery: 'delivered' } },
  { from: { status: 'open', delivery: 'no-agent' }, event: 'resolve', to: { status: 'resolved', delivery: 'no-agent' } },
  { from: { status: 'open', delivery: 'inject-error' }, event: 'resolve', to: { status: 'resolved', delivery: 'inject-error' } },
  // ④ append-reply：任意组合态出发 → open × pending（resolved 自动回 open，delivery 重置）
  { from: { status: 'open', delivery: 'pending' }, event: 'append-reply', to: { status: 'open', delivery: 'pending' } },
  { from: { status: 'open', delivery: 'delivered' }, event: 'append-reply', to: { status: 'open', delivery: 'pending' } },
  { from: { status: 'open', delivery: 'no-agent' }, event: 'append-reply', to: { status: 'open', delivery: 'pending' } },
  { from: { status: 'open', delivery: 'inject-error' }, event: 'append-reply', to: { status: 'open', delivery: 'pending' } },
  { from: { status: 'resolved', delivery: 'pending' }, event: 'append-reply', to: { status: 'open', delivery: 'pending' } },
  { from: { status: 'resolved', delivery: 'delivered' }, event: 'append-reply', to: { status: 'open', delivery: 'pending' } },
  { from: { status: 'resolved', delivery: 'no-agent' }, event: 'append-reply', to: { status: 'open', delivery: 'pending' } },
  { from: { status: 'resolved', delivery: 'inject-error' }, event: 'append-reply', to: { status: 'open', delivery: 'pending' } },
  // ⑤ retry：仅 open × no-agent / open × inject-error 出发 → open × pending（纯重投）
  { from: { status: 'open', delivery: 'no-agent' }, event: 'retry', to: { status: 'open', delivery: 'pending' } },
  { from: { status: 'open', delivery: 'inject-error' }, event: 'retry', to: { status: 'open', delivery: 'pending' } },
]

/** 表外转移错误（可辨识：调用方按 instanceof 分流；message 带当前态/事件/目标，指向恢复动作）。 */
export class CommentTransitionError extends Error {
  override readonly name = 'CommentTransitionError'

  constructor(detail: string) {
    super(`评论线程状态机表外转移（D5 ⑥ fail-fast）：${detail}`)
  }
}

/**
 * 查合法转移表：命中返回目标组合态，未命中返回 null（表外）。
 * deliver 事件须命中「同一 from 组合态下 to.delivery === outcome」的具体规则；
 * outcome 不在 delivery 词表（含 pending）时无规则可命中，同样返回 null。
 */
export function findThreadTransition(
  from: CommentThreadState,
  event: CommentTransitionEvent,
  deliverOutcome?: DeliverOutcome,
): CommentThreadState | null {
  for (const rule of COMMENT_THREAD_TRANSITIONS) {
    if (rule.event !== event) continue
    if (rule.from.status !== from.status || rule.from.delivery !== from.delivery) continue
    if (event === 'deliver') {
      if (rule.to.delivery === deliverOutcome) return rule.to
      continue
    }
    return rule.to
  }
  return null
}

/** 判定「组合态 × 事件（deliver 须附投递结果）」是否在合法转移表内。 */
export function isLegalThreadTransition(
  from: CommentThreadState,
  event: CommentTransitionEvent,
  deliverOutcome?: DeliverOutcome,
): boolean {
  return findThreadTransition(from, event, deliverOutcome) !== null
}

/**
 * 对既有线程施加一次状态机转移（纯函数：不修改入参，返回新线程对象）。
 * 表外转移抛 CommentTransitionError（fail-fast，AX3——调用方不 catch 吞掉）。
 * replies 等业务字段的演化归调用方（store.ts 在 append-reply 转移后 push 追加条目），
 * 本函数只裁决 status / delivery / deliveredAt / updatedAt 四个状态机字段。
 */
export function applyThreadTransition(
  thread: CommentThread,
  event: CommentTransitionEvent,
  options?: { deliverOutcome?: DeliverOutcome; at?: string },
): CommentThread {
  const from: CommentThreadState = { status: thread.status, delivery: thread.delivery }
  const to = findThreadTransition(from, event, options?.deliverOutcome)
  if (to === null) {
    const outcomeHint = event === 'deliver' ? ` → ${String(options?.deliverOutcome)}` : ''
    throw new CommentTransitionError(
      `当前 ${thread.status} × ${thread.delivery} 不允许事件 ${event}${outcomeHint}；` +
        '合法转移见 COMMENT_THREAD_TRANSITIONS（D5 ①-⑤）',
    )
  }
  const at = options?.at ?? new Date().toISOString()
  // deliveredAt 不变量：deliveredAt 存在 ⇔ 当前 delivery === 'delivered'。
  // 按 from 维度分流：delivered 出发的转移只有 resolve（to 仍 delivered → 原样保留）与
  // append-reply（to 重置 pending → 清除）；非 delivered 出发且到达 delivered（deliver
  // 转移，from 必为 pending）→ 写本转移时刻；其余与 delivered 无关 → 原样保留。
  let deliveredAt: string | undefined
  if (from.delivery === 'delivered') {
    deliveredAt = to.delivery === 'delivered' ? thread.deliveredAt : undefined
  } else if (to.delivery === 'delivered') {
    deliveredAt = at
  } else {
    deliveredAt = thread.deliveredAt
  }
  const next: CommentThread = { ...thread, status: to.status, delivery: to.delivery, updatedAt: at }
  if (deliveredAt === undefined) {
    delete next.deliveredAt
  } else {
    next.deliveredAt = deliveredAt
  }
  return next
}

/** 构造初始组合态线程的状态字段（createThread 初始态 = D5 ①；id 等标识字段归调用方）。 */
export function createInitialThreadFields(at: string): Pick<CommentThread, 'status' | 'delivery' | 'createdAt' | 'updatedAt'> {
  return { status: INITIAL_THREAD_STATE.status, delivery: INITIAL_THREAD_STATE.delivery, createdAt: at, updatedAt: at }
}
