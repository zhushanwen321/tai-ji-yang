import { describe, expect, it } from 'vitest'
import {
  DAYS_PER_WEEK,
  SLOTS_PER_DAY,
  evaluateConditionAt,
  evaluateRouteAt,
  evaluateRoutesAt,
  firstMatchingSpecialDate,
  isSlotCoveredAt,
  sanitizeRoutes,
  sanitizeWhitelist,
  slotIndexOf,
  type RouteEntry,
  type RouteWindowMask,
} from './route-evaluate'

/**
 * 求值纯函数单测（dsh-model-service D5 / §5.1 U2 检查点「时区与格边界用例」）。
 *
 * 时间语义三条的落点：
 *   · 宿主本地时区——用例全部以**本地时间分量**构造（new Date(y, m, d, hh, mm)），断言
 *     本地分量语义（任意进程时区下等价，不假设具体 TZ 值）；
 *   · 周一首日——固定 2026-01-05（本地周一）验证 day=0，2026-01-04（周日）验证 day=6；
 *   · 格边界 [start, end)——整点/半点属「开始于该时刻」的格：09:30 → slot 19、09:29 → 18。
 */

/** 构造本地时间（分量即宿主本地时区语义；月份 1-12 入参换 JS 0-11）。 */
function at(year: number, month: number, day: number, hour: number, minute: number): Date {
  return new Date(year, month - 1, day, hour, minute)
}

/** 2026-01-05（本地周一）09:30。 */
const MON_0930 = at(2026, 1, 5, 9, 30)
/** 2026-01-04（本地周日）23:59。 */
const SUN_2359 = at(2026, 1, 4, 23, 59)

/** 全不覆盖掩码。 */
function emptyMask(): RouteWindowMask {
  return {
    days: Array.from({ length: DAYS_PER_WEEK }, () => Array.from({ length: SLOTS_PER_DAY }, () => false)),
    specialDates: [],
  }
}

/** 命中 (day, slot) 单格的掩码。 */
function maskWith(day: number, slot: number): RouteWindowMask {
  const mask = emptyMask()
  mask.days[day][slot] = true
  return mask
}

describe('slotIndexOf（周一为首日 + [start,end) 半小时格边界）', () => {
  it('2026-01-05（本地周一）09:30 → day 0、slot 19（格 [9:30,10:00) 左闭）', () => {
    expect(slotIndexOf(MON_0930)).toEqual({ day: 0, slot: 19 })
  })

  it('09:29 属前一格（slot 18）——[start, end) 右开', () => {
    expect(slotIndexOf(at(2026, 1, 5, 9, 29)).slot).toBe(18)
  })

  it('周日（2026-01-04）→ day 6；周日 23:59 → slot 47', () => {
    expect(slotIndexOf(SUN_2359)).toEqual({ day: 6, slot: 47 })
  })

  it('周六（2026-01-10）→ day 5', () => {
    expect(slotIndexOf(at(2026, 1, 10, 0, 0)).day).toBe(5)
  })
})

describe('isSlotCoveredAt（周表判定）', () => {
  it('命中的格 true、未命中格 false', () => {
    const mask = maskWith(0, 19)
    expect(isSlotCoveredAt(mask, MON_0930)).toBe(true)
    expect(isSlotCoveredAt(mask, at(2026, 1, 5, 10, 0))).toBe(false)
  })

  it('缺行/缺格容忍（脏掩码 = 全不覆盖，不抛错）', () => {
    expect(isSlotCoveredAt({ days: [], specialDates: [] }, MON_0930)).toBe(false)
  })
})

describe('特殊日期优先于周表（D5）', () => {
  const day = 0 // 周一
  const weekly = maskWith(day, 19) // 周一 09:30–10:00

  it('include 无 mask：当日全天命中（覆盖周表未命中格）', () => {
    const mask: RouteWindowMask = { days: weekly.days, specialDates: [{ date: '01-05', name: '日', mode: 'include' }] }
    expect(isSlotCoveredAt(mask, at(2026, 1, 5, 3, 0))).toBe(true) // 周表未覆盖的 03:00
    expect(isSlotCoveredAt(mask, at(2026, 1, 6, 3, 0))).toBe(false) // 非当日不受影响
  })

  it('include 带 mask：只覆盖掩码格', () => {
    const slots = Array.from({ length: SLOTS_PER_DAY }, () => false)
    slots[12] = true
    const mask: RouteWindowMask = { days: weekly.days, specialDates: [{ date: '2026-01-05', name: '日', mode: 'include', mask: slots }] }
    expect(isSlotCoveredAt(mask, at(2026, 1, 5, 6, 0))).toBe(true)
    expect(isSlotCoveredAt(mask, at(2026, 1, 5, 6, 30))).toBe(false)
  })

  it('exclude 无 mask：当日全不命中（周表命中格也被剔除）', () => {
    const mask: RouteWindowMask = { days: weekly.days, specialDates: [{ date: '01-05', name: '日', mode: 'exclude' }] }
    expect(isSlotCoveredAt(mask, MON_0930)).toBe(false)
  })

  it('exclude 带 mask：只剔除掩码格，周表其余格保留', () => {
    const slots = Array.from({ length: SLOTS_PER_DAY }, () => false)
    slots[19] = true
    const mask: RouteWindowMask = { days: weekly.days, specialDates: [{ date: '01-05', name: '日', mode: 'exclude', mask: slots }] }
    expect(isSlotCoveredAt(mask, MON_0930)).toBe(false) // 19 格被剔除
    const morning = maskWith(day, 18)
    expect(isSlotCoveredAt({ days: morning.days, specialDates: mask.specialDates }, at(2026, 1, 5, 9, 0))).toBe(true) // 18 格保留
  })

  it('YYYY-MM-DD 仅该年命中；MM-DD 年年在', () => {
    const only2026: RouteWindowMask = { days: weekly.days, specialDates: [{ date: '2026-01-05', name: '日', mode: 'include' }] }
    expect(isSlotCoveredAt(only2026, at(2026, 1, 5, 3, 0))).toBe(true)
    expect(isSlotCoveredAt(only2026, at(2027, 1, 5, 3, 0))).toBe(false) // 2027 周一 1/5：日期匹配但年份不符
    const everyYear: RouteWindowMask = { days: weekly.days, specialDates: [{ date: '01-05', name: '日', mode: 'include' }] }
    expect(isSlotCoveredAt(everyYear, at(2027, 1, 5, 3, 0))).toBe(true)
  })

  it('清单中第一个命中的生效（配置序即优先级）', () => {
    const specials = [
      { date: '01-05', name: '先', mode: 'exclude' as const },
      { date: '2026-01-05', name: '后', mode: 'include' as const },
    ]
    expect(firstMatchingSpecialDate(specials, MON_0930)?.name).toBe('先')
  })
})

describe('evaluateConditionAt（一期求值语义）', () => {
  it('none 恒命中；window 按掩码；无条件（undefined）fail-closed 不命中', () => {
    expect(evaluateConditionAt({ type: 'none' }, MON_0930)).toBe(true)
    expect(evaluateConditionAt({ type: 'window', window: maskWith(0, 19) }, MON_0930)).toBe(true)
    expect(evaluateConditionAt({ type: 'window', window: maskWith(0, 20) }, MON_0930)).toBe(false)
    expect(evaluateConditionAt(undefined, MON_0930)).toBe(false)
    // quota/combo 一期不求值：fail-closed 永不命中。
    expect(evaluateConditionAt({ type: 'quota' as 'none' }, MON_0930)).toBe(false)
  })
})

describe('evaluateRouteAt（成员顺序即优先级）', () => {
  const member = (order: number, type: 'none' | 'window', day = 0, slot = 19) => ({
    provider: `provider-${order}`,
    model: 'model',
    order,
    condition: type === 'none' ? { type: 'none' as const } : { type: 'window' as const, window: maskWith(day, slot) },
  })

  it('A（命中）→ 候选 A；A 不命中 → 回退 B（V5 步骤 6 的回退语义）', () => {
    const route: RouteEntry = { id: 'r', name: 'R', members: [member(1, 'window'), member(2, 'none')] }
    expect(evaluateRouteAt(route, MON_0930)?.provider).toBe('provider-1') // A 命中
    const hitlessA: RouteEntry = { id: 'r', name: 'R', members: [member(1, 'window', 0, 20), member(2, 'none')] }
    expect(evaluateRouteAt(hitlessA, MON_0930)?.provider).toBe('provider-2') // A 不命中 → B
  })

  it('成员按 order 排序（乱序输入仍按优先级）', () => {
    const route: RouteEntry = { id: 'r', name: 'R', members: [member(2, 'none'), member(1, 'none')] }
    expect(evaluateRouteAt(route, MON_0930)?.provider).toBe('provider-1')
  })

  it('无成员命中 → undefined；quota/combo 成员永不命中', () => {
    const hitless: RouteEntry = { id: 'r', name: 'R', members: [member(1, 'window', 0, 20), member(2, 'window', 1, 20)] }
    expect(evaluateRouteAt(hitless, MON_0930)).toBeUndefined()
    const quota: RouteEntry = { id: 'r', name: 'R', members: [{ provider: 'q', model: 'm', order: 1, condition: { type: 'quota' as 'none' } }] }
    expect(evaluateRouteAt(quota, MON_0930)).toBeUndefined()
  })
})

describe('evaluateRoutesAt（预览批量入口）', () => {
  it('路由 id → 命中成员映射', () => {
    const route: RouteEntry = { id: 'r1', name: 'R1', members: [{ provider: 'p', model: 'm', order: 1, condition: { type: 'none' } }] }
    const hits = evaluateRoutesAt([route], MON_0930)
    expect(hits.get('r1')?.provider).toBe('p')
  })
})

describe('sanitize（脏数据容忍）', () => {
  it('非数组 → 空；形态异常条目丢弃；合法条目保留', () => {
    expect(sanitizeRoutes(undefined)).toEqual([])
    const raw = [
      { id: 'ok', name: 'OK', members: [{ provider: 'p', model: 'm', order: 1, condition: { type: 'none' } }] },
      { id: '', name: '无 id', members: [] },
      { id: 'no-members', name: '无成员表' },
      null,
      42,
    ]
    const routes = sanitizeRoutes(raw)
    expect(routes).toHaveLength(1)
    expect(routes[0]?.id).toBe('ok')
  })

  it('window 型缺掩码按 none 容忍；quota/combo 成员被丢弃（fail-closed），路由本体保留', () => {
    const routes = sanitizeRoutes([
      { id: 'a', name: 'A', members: [{ provider: 'p', model: 'm', order: 1, condition: { type: 'window' } }] },
      { id: 'b', name: 'B', members: [{ provider: 'p', model: 'm', order: 1, condition: { type: 'quota' } }] },
    ])
    expect(routes[0]?.members[0]?.condition.type).toBe('none')
    expect(routes[1]?.members).toEqual([]) // quota 成员丢弃 → 空成员路由 = 求值恒无候选（V5 步骤 7 可构造）
  })

  it('白名单：string 去重保序；脏条目丢弃', () => {
    expect(sanitizeWhitelist(['a', 'b', 'a', '', 42])).toEqual(['a', 'b'])
  })
})
