import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createTsxLoader } from '../../testing/load-tsx'
import { isSlotCoveredAt, SLOTS_PER_DAY, type RouteSpecialDate, type RouteWindowMask } from '../../model-service/route-evaluate'

/**
 * toggleSpecialMaskSlot 单测（掩码归一语义锁定）：归一只允许发生在「mask 与无 mask 求值
 * 等价」时——exclude 的 mask 全 false（无剔除格 = 该日按周表）与无 mask（全天剔除）语义
 * 相反，必须保留（历史回归：旧实现的 exclude 归一条件写成 every(false)，全 false 掩码被
 * 归一成全天剔除，用户逐格取消剔除后语义静默翻转）。等价性用真 isSlotCoveredAt 对拍断言。
 *
 * route-time-grid.tsx 经 load-tsx 夹具装载（无本地 react 包，.tsx 不能直 import）；
 * isSlotCoveredAt 是纯函数模块，直 import。
 */

const loader = createTsxLoader()
const gridModule = loader.load(fileURLToPath(new URL('./route-time-grid.tsx', import.meta.url))) as unknown as {
  toggleSpecialMaskSlot: (special: RouteSpecialDate, slot: number) => RouteSpecialDate
}
const toggleSpecialMaskSlot = gridModule.toggleSpecialMaskSlot

/** 48 格布尔数组构造（true 的格位入参）。 */
function slots(trueAt: number[] = []): boolean[] {
  return Array.from({ length: SLOTS_PER_DAY }, (_, slot) => trueAt.includes(slot))
}

/** 2026-01-05（本地周一）09:30 = 周(day 0)格 19。 */
const MON_0930 = new Date(2026, 0, 5, 9, 30)

/** 周表仅命中周一格 19 的掩码（specialDates 由用例填）。 */
function weeklyMask(specials: RouteSpecialDate[]): RouteWindowMask {
  return { days: [slots([19]), slots(), slots(), slots(), slots(), slots(), slots()], specialDates: specials }
}

describe('toggleSpecialMaskSlot（exclude 归一语义）', () => {
  it('mask 全 false（无剔除格）保留 mask——该日按周表，与无 mask 的全天剔除语义相反', () => {
    // 用户已剔除格 19，再点一次取消剔除 → mask 全 false。
    const special: RouteSpecialDate = { date: '01-05', name: '日', mode: 'exclude', mask: slots([19]) }
    const next = toggleSpecialMaskSlot(special, 19)
    expect(next.mask).toEqual(slots()) // 全 false 且保留（旧实现此处 delete mask）
  })

  it('mask 全 false（按周表）与无 mask（全天剔除）在周表命中格上求值相反——不可归一的根据', () => {
    const withEmptyMask = weeklyMask([{ date: '01-05', name: '日', mode: 'exclude', mask: slots() }])
    const withoutMask = weeklyMask([{ date: '01-05', name: '日', mode: 'exclude' }])
    expect(isSlotCoveredAt(withEmptyMask, MON_0930)).toBe(true) // 周表命中格保留
    expect(isSlotCoveredAt(withoutMask, MON_0930)).toBe(false) // 无 mask = 全天剔除
  })

  it('mask 全 true（全部剔除）归一为无 mask——与无 mask 求值等价（对拍断言）', () => {
    const almostAll = Array.from({ length: SLOTS_PER_DAY }, (_, at) => at !== 18) // 除格 18 外全剔除
    const before = weeklyMask([{ date: '01-05', name: '日', mode: 'exclude', mask: almostAll }])
    const special = before.specialDates[0] as RouteSpecialDate
    const next = toggleSpecialMaskSlot(special, 18) // 补上最后一格 → 全 true
    expect('mask' in next && next.mask !== undefined).toBe(false) // 全 true → 归一去掉 mask
    const after = weeklyMask([next])
    for (let slot = 0; slot < SLOTS_PER_DAY; slot += 1) {
      const at = new Date(2026, 0, 5, Math.floor(slot / 2), slot % 2 === 0 ? 0 : 30)
      expect(isSlotCoveredAt(after, at)).toBe(isSlotCoveredAt(before, at)) // 归一前后逐格等价
    }
  })
})

describe('toggleSpecialMaskSlot（include 归一语义，既有行为锁定）', () => {
  it('无 mask 起点点一格：全 true 起点被翻成一格 false，保留 mask', () => {
    const special: RouteSpecialDate = { date: '01-05', name: '日', mode: 'include' }
    const next = toggleSpecialMaskSlot(special, 19)
    expect(next.mask).toEqual(Array.from({ length: SLOTS_PER_DAY }, (_, at) => at !== 19)) // 除格 19 外全命中
  })

  it('mask 全 true（全天命中）归一为无 mask', () => {
    const almostAll = Array.from({ length: SLOTS_PER_DAY }, (_, at) => at !== 19) // 除格 19 外全命中
    const special: RouteSpecialDate = { date: '01-05', name: '日', mode: 'include', mask: almostAll }
    const next = toggleSpecialMaskSlot(special, 19) // 格 19 false → true → 全 true
    expect('mask' in next && next.mask !== undefined).toBe(false)
  })
})

describe('toggleSpecialMaskSlot（受控纪律：不改入参）', () => {
  it('入参条目的 mask 数组不被就地修改', () => {
    const mask = slots([19])
    const special: RouteSpecialDate = { date: '01-05', name: '日', mode: 'exclude', mask }
    toggleSpecialMaskSlot(special, 19)
    expect(special.mask).toEqual(slots([19]))
    expect(mask[19]).toBe(true)
  })
})
