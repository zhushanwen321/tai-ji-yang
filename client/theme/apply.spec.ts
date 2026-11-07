import { describe, expect, it } from 'vitest'
import { applyStructureLayer, applyThemeLayer, applyTokenLayer, STRUCTURE_LAYER_SOURCE, THEME_LAYER_SOURCE } from './apply'
import { resolveThemeTokens } from './resolve'
import { paletteTokensFor } from './palette'
import { THEME_TOKEN_NAMES, type TokenTable } from './tokens'
import { STRUCTURE_TOKENS } from './structure'

/** 记录每一次 overrideTokens 调用的假宿主（层身份 + 表 + 是否已被 disposer 撤除）。 */
interface FakeLayer {
  source: string
  tokens: TokenTable
  removed: boolean
}

function fakeHost() {
  const layers: FakeLayer[] = []
  let effectDisposer: (() => void) | undefined
  const ctx = {
    theme: {
      overrideTokens(source: string, tokens: TokenTable) {
        const layer: FakeLayer = { source, tokens, removed: false }
        layers.push(layer)
        return () => {
          layer.removed = true
        }
      },
    },
    effect(callback: () => (() => void) | void) {
      const result = callback()
      effectDisposer = typeof result === 'function' ? result : undefined
    },
  }
  return { ctx, layers, runEffectDisposer: () => effectDisposer?.() }
}

describe('applyThemeLayer 装配', () => {
  it('首装即注册主题层：source = 字面包名，表 = 初始色双模表', () => {
    const host = fakeHost()
    applyThemeLayer(host.ctx, 'xuan')
    expect(host.layers).toHaveLength(1)
    expect(host.layers[0].source).toBe(THEME_LAYER_SOURCE)
    expect(host.layers[0].tokens).toBe(resolveThemeTokens('xuan'))
    // 整层表 = alias 双模表（20）+ 静态调色板（32，paletteTokensFor 与 resolve 同源）
    expect(Object.keys(host.layers[0].tokens)).toHaveLength(
      THEME_TOKEN_NAMES.length + Object.keys(paletteTokensFor('xuan')).length,
    )
  })

  it('换色 = 同 source 整层替换（不撤销重建，不堆积 effect）', () => {
    const host = fakeHost()
    const select = applyThemeLayer(host.ctx, 'xuan')
    select('qingmo')
    expect(host.layers).toHaveLength(2)
    expect(host.layers[1].source).toBe(THEME_LAYER_SOURCE)
    expect(host.layers[1].tokens).toBe(resolveThemeTokens('qingmo'))
    // 旧层未被撤除（宿主按层身份校验后它是空操作）；也没有新登记 effect
    expect(host.layers[0].removed).toBe(false)
  })

  it('重复选同一色是空操作（同引用表不重调 overrideTokens）', () => {
    const host = fakeHost()
    const select = applyThemeLayer(host.ctx, 'nuanmo')
    select('nuanmo')
    expect(host.layers).toHaveLength(1)
  })

  it('卸载时撤除的是当前生效层（AX3 / V5：不残留历史层）', () => {
    const host = fakeHost()
    const select = applyThemeLayer(host.ctx, 'xuan')
    select('dailan')
    select('zhuyin')
    host.runEffectDisposer()
    // 只有最新层被撤；被替换掉的历史层从未被撤（宿主层身份校验下它们也撤不动新层）
    expect(host.layers.map((layer) => layer.removed)).toEqual([false, false, true])
  })
})

describe('applyTokenLayer / applyStructureLayer', () => {
  it('结构层用独立 source，与主题层互不覆盖', () => {
    const host = fakeHost()
    applyThemeLayer(host.ctx, 'xuan')
    applyStructureLayer(host.ctx, STRUCTURE_TOKENS)
    expect(host.layers.map((layer) => layer.source)).toEqual([THEME_LAYER_SOURCE, STRUCTURE_LAYER_SOURCE])
    expect(host.layers[1].tokens).toBe(STRUCTURE_TOKENS)
  })

  it('换层函数传同一引用是空操作', () => {
    const host = fakeHost()
    const swap = applyTokenLayer(host.ctx, 'taiji-test', STRUCTURE_TOKENS, 'test')
    swap(STRUCTURE_TOKENS)
    expect(host.layers).toHaveLength(1)
  })

  it('没有 effect 托管的 disposer 不会被执行（反证托管是必需的）', () => {
    // 直接调 applyTokenLayer 但不跑 effect disposer：层留在宿主里——这正是 AS10
    // 「disposer 无 fiber 绑定，必须自己挂 ctx.effect」反证的形态。
    const host = fakeHost()
    applyTokenLayer(host.ctx, 'taiji-test', STRUCTURE_TOKENS, 'test')
    expect(host.layers[0].removed).toBe(false)
    host.runEffectDisposer()
    expect(host.layers[0].removed).toBe(true)
  })
})
