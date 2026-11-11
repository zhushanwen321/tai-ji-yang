import { describe, expect, it } from 'vitest'

import {
  COMMENT_DELIVERY_STATES,
  COMMENT_THREAD_STATUSES,
  type CommentDelivery,
  type CommentThread,
  type CommentThreadStatus,
} from '../../lib/comments/contract.js'
import {
  applyThreadTransition,
  COMMENT_THREAD_TRANSITIONS,
  CommentTransitionError,
  createInitialThreadFields,
  findThreadTransition,
  INITIAL_THREAD_STATE,
  isLegalThreadTransition,
  type CommentThreadTransitionRule,
  type CommentTransitionEvent,
  type DeliverOutcome,
} from '../../lib/comments/thread.js'

/**
 * 评论线程状态机单测（U1，RL5）：按设计 §3.3 D5 转移表逐行断言（合法转移 17 条数据
 * 驱动全覆盖），并对「组合态 × 事件」全集做表外穷举（32 - 15 = 17 个表外位 + deliver
 * 目标态词表外取值，全部断言抛 CommentTransitionError——AX3 fail-fast 不静默吞）。
 * 专项用例覆盖验收条款：reopen（resolved → open）可构造且 delivery 重置 pending；
 * deliveredAt 不变量（存在 ⇔ 当前 delivery === 'delivered'）。
 * 编号口径：本文件裸编号（D/AX/RL 等）属 opendesign-comment-loop 设计包。
 */

/** 构造完整字段的合成线程（状态机纯函数的输入材料；replies 默认空）。 */
function makeThread(status: CommentThreadStatus, delivery: CommentDelivery, extra?: Partial<CommentThread>): CommentThread {
  return {
    id: 'c_test-0',
    artifactPath: 'landing.html',
    text: '主视觉配色太艳',
    replies: [],
    status,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    delivery,
    ...extra,
  }
}

/** 全部组合态（2 lifecycle × 4 delivery = 8）。 */
const ALL_STATES: ReadonlyArray<{ status: CommentThreadStatus; delivery: CommentDelivery }> =
  COMMENT_THREAD_STATUSES.flatMap((status) => COMMENT_DELIVERY_STATES.map((delivery) => ({ status, delivery })))

/** deliver 规则的 to.delivery 恒为投递结果（转移表保证非 pending）——运行时守卫收窄类型。 */
function toDeliverOutcome(delivery: CommentDelivery): DeliverOutcome {
  if (delivery === 'pending') throw new Error('deliver 规则目标不可能是 pending（转移表数据保证）')
  return delivery
}

/** 「组合态 × 事件（deliver 须附目标结果）」是否在合法转移表内（与 findThreadTransition 同构判定，供穷举过滤）。 */
function isLegalProbe(
  state: { status: CommentThreadStatus; delivery: CommentDelivery },
  event: CommentTransitionEvent,
  outcome?: DeliverOutcome | 'pending',
): boolean {
  return (
    COMMENT_THREAD_TRANSITIONS.some((rule: CommentThreadTransitionRule) =>
      rule.from.status === state.status &&
      rule.from.delivery === state.delivery &&
      rule.event === event &&
      (event !== 'deliver' || rule.to.delivery === outcome),
    )
  )
}

describe('评论线程状态机初始态与转移表自身边界（D5 ①）', () => {
  it('初始组合态 = open × pending（.create 落盘形态）', () => {
    expect(INITIAL_THREAD_STATE).toEqual({ status: 'open', delivery: 'pending' })
    expect(createInitialThreadFields('2026-01-01T00:00:00.000Z')).toEqual({
      status: 'open',
      delivery: 'pending',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
  })

  it('转移表恰 17 条，from × event 组合位恰 15 个且无重复（deliver 从 open × pending 三条）', () => {
    expect(COMMENT_THREAD_TRANSITIONS).toHaveLength(17)
    const seen = new Set<string>()
    for (const rule of COMMENT_THREAD_TRANSITIONS) {
      const deliverPart = rule.event === 'deliver' ? `->${rule.to.delivery}` : ''
      const key = `${rule.from.status}×${rule.from.delivery}|${rule.event}${deliverPart}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
    expect(seen.size).toBe(COMMENT_THREAD_TRANSITIONS.length)
    // 唯一 from × event 组合位（不含 deliver 的目标维度）恰 15 个
    const slots = new Set(COMMENT_THREAD_TRANSITIONS.map((rule) => `${rule.from.status}×${rule.from.delivery}|${rule.event}`))
    expect(slots.size).toBe(15)
  })

  it('转移表每条 to 态都在词表内（lifecycle × delivery 交集）', () => {
    for (const rule of COMMENT_THREAD_TRANSITIONS) {
      expect(COMMENT_THREAD_STATUSES).toContain(rule.to.status)
      expect(COMMENT_DELIVERY_STATES).toContain(rule.to.delivery)
      expect(COMMENT_THREAD_STATUSES).toContain(rule.from.status)
      expect(COMMENT_DELIVERY_STATES).toContain(rule.from.delivery)
    }
  })
})

describe('合法转移逐行断言（D5 ②-⑤ 全量数据驱动）', () => {
  it('对转移表每一条规则：from 态构造线程施事件后精确落到 to 态', () => {
    expect.assertions(COMMENT_THREAD_TRANSITIONS.length * 4)
    for (const rule of COMMENT_THREAD_TRANSITIONS) {
      const thread = makeThread(rule.from.status, rule.from.delivery)
      const options = rule.event === 'deliver'
        ? { deliverOutcome: toDeliverOutcome(rule.to.delivery), at: '2026-01-02T00:00:00.000Z' }
        : { at: '2026-01-02T00:00:00.000Z' }
      const next = applyThreadTransition(thread, rule.event, options)
      expect(next.status).toBe(rule.to.status)
      expect(next.delivery).toBe(rule.to.delivery)
      expect(next.updatedAt).toBe('2026-01-02T00:00:00.000Z')
      expect(next.replies).toBe(thread.replies) // replies 归调用方演化，转移不动业务字段
    }
  })

  it('isLegalThreadTransition 与 findThreadTransition 对全部合法位判定一致', () => {
    for (const rule of COMMENT_THREAD_TRANSITIONS) {
      const outcome = rule.event === 'deliver' ? toDeliverOutcome(rule.to.delivery) : undefined
      expect(isLegalThreadTransition(rule.from, rule.event, outcome)).toBe(true)
      expect(findThreadTransition(rule.from, rule.event, outcome)).toEqual(rule.to)
    }
  })
})

describe('表外转移穷举抛错（RL5 / D5 ⑥ fail-fast）', () => {
  it('8 组合态 × 4 事件全集（deliver × 4 目标含 pending）中所有表外位都抛 CommentTransitionError', () => {
    const events: CommentTransitionEvent[] = ['deliver', 'resolve', 'append-reply', 'retry']
    const deliverTargets = [...COMMENT_DELIVERY_STATES] as ReadonlyArray<DeliverOutcome | 'pending'>
    let illegalCount = 0
    let legalCount = 0
    for (const state of ALL_STATES) {
      for (const event of events) {
        if (event === 'deliver') {
          for (const target of deliverTargets) {
            if (!isLegalProbe(state, event, target)) {
              illegalCount++
              const thread = makeThread(state.status, state.delivery)
              expect(() =>
                applyThreadTransition(thread, event, { deliverOutcome: target as DeliverOutcome }),
              ).toThrow(CommentTransitionError)
            } else {
              legalCount++
            }
          }
          continue
        }
        if (!isLegalProbe(state, event)) {
          illegalCount++
          const thread = makeThread(state.status, state.delivery)
          expect(() => applyThreadTransition(thread, event)).toThrow(CommentTransitionError)
        } else {
          legalCount++
        }
      }
    }
    // 全集判定位：deliver 8 状态 × 4 目标 + 其余三事件各 8 = 56；合法位恰 17（deliver 3 +
    // resolve 4 + append-reply 8 + retry 2），表外位 39 全部断言抛错
    expect(illegalCount + legalCount).toBe(56)
    expect(legalCount).toBe(17)
    expect(illegalCount).toBe(39)
  })

  it('典型表外转移逐例断言（设计 RL5 点名场景）：pending 线程 retry、delivered 直改 inject-error、resolved 再 resolve', () => {
    // 对 pending 线程 .retry（pending 无从重投，D5 ⑤）
    expect(() => applyThreadTransition(makeThread('open', 'pending'), 'retry')).toThrow(CommentTransitionError)
    // delivery 未经投递动作从 delivered 直改 inject-error（deliver 仅从 pending 出发）
    expect(() =>
      applyThreadTransition(makeThread('open', 'delivered'), 'deliver', { deliverOutcome: 'inject-error' }),
    ).toThrow(CommentTransitionError)
    // 对已 resolved 线程再 .resolve（D5 ③：重开走 append-reply，不设 resolved:false）
    expect(() => applyThreadTransition(makeThread('resolved', 'delivered'), 'resolve')).toThrow(CommentTransitionError)
    // no-agent 线程不经 retry/deliver 直改 delivered
    expect(() =>
      applyThreadTransition(makeThread('open', 'no-agent'), 'deliver', { deliverOutcome: 'delivered' }),
    ).toThrow(CommentTransitionError)
  })

  it('deliver 目标态为词表外取值（含 pending）无规则命中，抛 CommentTransitionError', () => {
    const pendingAsTarget = 'pending' as unknown as DeliverOutcome
    expect(() =>
      applyThreadTransition(makeThread('open', 'pending'), 'deliver', { deliverOutcome: pendingAsTarget }),
    ).toThrow(CommentTransitionError)
    const bogus = 'bogus-state' as unknown as DeliverOutcome
    expect(() =>
      applyThreadTransition(makeThread('open', 'pending'), 'deliver', { deliverOutcome: bogus }),
    ).toThrow(CommentTransitionError)
  })

  it('错误消息可辨识：name 固定、携带当前态与事件（指向恢复动作）', () => {
    try {
      applyThreadTransition(makeThread('resolved', 'delivered'), 'retry')
      expect.unreachable('表外转移必须抛错')
    } catch (error) {
      expect(error).toBeInstanceOf(CommentTransitionError)
      expect((error as Error).name).toBe('CommentTransitionError')
      expect((error as Error).message).toContain('resolved')
      expect((error as Error).message).toContain('delivered')
      expect((error as Error).message).toContain('retry')
    }
  })
})

describe('reopen 可构造与 deliveredAt 不变量（验收条款 / D5 ③④）', () => {
  it('reopen：resolved × delivered 经 append-reply → open × pending，deliveredAt 清除（delivery 重置）', () => {
    const thread = makeThread('resolved', 'delivered', { deliveredAt: '2026-01-01T12:00:00.000Z' })
    const reopened = applyThreadTransition(thread, 'append-reply', { at: '2026-01-02T00:00:00.000Z' })
    expect(reopened.status).toBe('open')
    expect(reopened.delivery).toBe('pending')
    expect(reopened.deliveredAt).toBeUndefined()
    expect('deliveredAt' in reopened).toBe(false)
    // resolved × 其余三 delivery 同样可重开
    for (const delivery of ['pending', 'no-agent', 'inject-error'] as const) {
      const next = applyThreadTransition(makeThread('resolved', delivery), 'append-reply')
      expect(next.status).toBe('open')
      expect(next.delivery).toBe('pending')
    }
  })

  it('deliveredAt 写入：deliver → delivered 写时刻；→ no-agent / inject-error 不写', () => {
    const thread = makeThread('open', 'pending')
    const delivered = applyThreadTransition(thread, 'deliver', { deliverOutcome: 'delivered', at: '2026-01-02T08:00:00.000Z' })
    expect(delivered.delivery).toBe('delivered')
    expect(delivered.deliveredAt).toBe('2026-01-02T08:00:00.000Z')
    const noAgent = applyThreadTransition(thread, 'deliver', { deliverOutcome: 'no-agent', at: '2026-01-02T08:00:00.000Z' })
    expect(noAgent.delivery).toBe('no-agent')
    expect('deliveredAt' in noAgent).toBe(false)
    const injectError = applyThreadTransition(thread, 'deliver', { deliverOutcome: 'inject-error', at: '2026-01-02T08:00:00.000Z' })
    expect(injectError.delivery).toBe('inject-error')
    expect('deliveredAt' in injectError).toBe(false)
  })

  it('deliveredAt 保留：resolve 不动投递维（resolved × delivered 保留 deliveredAt）', () => {
    const thread = makeThread('open', 'delivered', { deliveredAt: '2026-01-01T12:00:00.000Z' })
    const resolved = applyThreadTransition(thread, 'resolve', { at: '2026-01-02T00:00:00.000Z' })
    expect(resolved.status).toBe('resolved')
    expect(resolved.delivery).toBe('delivered') // D5 ③：delivery 原样保留
    expect(resolved.deliveredAt).toBe('2026-01-01T12:00:00.000Z')
  })

  it('纯函数性：applyThreadTransition 不修改入参线程', () => {
    const thread = makeThread('open', 'pending')
    const snapshot = JSON.stringify(thread)
    applyThreadTransition(thread, 'deliver', { deliverOutcome: 'delivered', at: '2026-01-02T00:00:00.000Z' })
    expect(JSON.stringify(thread)).toBe(snapshot)
  })

  it('缺省时刻：不带 at 时 updatedAt 取当前 ISO 时刻', () => {
    const before = Date.now()
    const next = applyThreadTransition(makeThread('open', 'pending'), 'deliver', { deliverOutcome: 'delivered' })
    const at = Date.parse(next.updatedAt)
    expect(Number.isNaN(at)).toBe(false)
    expect(at).toBeGreaterThanOrEqual(before - 1000)
    expect(at).toBeLessThanOrEqual(Date.now() + 1000)
  })
})
