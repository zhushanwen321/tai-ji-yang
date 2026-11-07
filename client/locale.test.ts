import { describe, expect, it } from 'vitest'
import { en, installLocale, LOCALE_DICTS, TAIJI_LOCALE_NS, zh } from './locale'

/**
 * locale 单测（设计 §5 文件地图的 locale-keys 项；exec-plan 的 U7 testCommand 指名
 * `client/locale.test.ts`）。纯数据 + 装配函数，无 JSX，直接 import。
 */

describe('内联双语字典', () => {
  it('zh 与 en 的 key 集相等（U7 checkpoint：不依赖文件级约束，由单测断言）', () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
  })

  it('每个 key 在两种语言下都是非空字符串（空串会让宿主 t 渲染出空白控件）', () => {
    for (const [key, value] of Object.entries(zh)) {
      expect(typeof value, `zh.${key} 不是字符串`).toBe('string')
      expect(value.trim().length, `zh.${key} 是空白`).toBeGreaterThan(0)
    }
    for (const [key, value] of Object.entries(en)) {
      expect(typeof value, `en.${key} 不是字符串`).toBe('string')
      expect(value.trim().length, `en.${key} 是空白`).toBeGreaterThan(0)
    }
  })

  it('不建 locale/*.json：字典是内联对象（设计 D8 形态裁决）', () => {
    expect(Object.isFrozen(LOCALE_DICTS)).toBe(false) // 并表是普通对象，冻结由各字典自行决定
    expect(LOCALE_DICTS.zh).toBe(zh)
    expect(LOCALE_DICTS.en).toBe(en)
  })

  it('文案覆盖品牌名与外观行（hero 无名字位，产品名只能走 sidebar.brand.name）', () => {
    // 产品名抄录太极侧 i18n app.ts：zh 太极 / en TaiJi
    expect(zh['brand.name']).toBe('太极')
    expect(en['brand.name']).toBe('TaiJi')
    // 行标题与宿主内置行同文（settings.theme 命名空间），遮蔽后用户无感知差异（V12 ②）
    expect(zh['appearance.title']).toBe('外观')
    expect(en['appearance.title']).toBe('Appearance')
    // 三段模式抄录太极侧 settings.ts：浅色/深色/跟随系统 · Light/Dark/Follow system
    expect(zh['appearance.mode.light']).toBe('浅色')
    expect(zh['appearance.mode.dark']).toBe('深色')
    expect(zh['appearance.mode.system']).toBe('跟随系统')
    expect(en['appearance.mode.light']).toBe('Light')
    expect(en['appearance.mode.dark']).toBe('Dark')
    expect(en['appearance.mode.system']).toBe('Follow system')
  })
})

describe('installLocale 装配', () => {
  it('经 ctx.effect 调一次 locale.register，把 {zh, en} 注册进本包命名空间', () => {
    const registrations: { ns: string; dicts: Record<string, unknown> }[] = []
    const effects: (() => (() => void) | void)[] = []
    installLocale({
      effect(callback) {
        effects.push(callback)
      },
      locale: {
        register(ns, dicts) {
          registrations.push({ ns, dicts })
          return () => {}
        },
      },
    })
    // 装配是同步的：调用返回时 effect 已登记、尚未执行（执行时机归宿主 fiber）
    expect(effects).toHaveLength(1)
    expect(registrations).toHaveLength(0)

    effects[0]()
    expect(registrations).toHaveLength(1)
    expect(registrations[0].ns).toBe(TAIJI_LOCALE_NS)
    expect(Object.keys(registrations[0].dicts).sort()).toEqual(['en', 'zh'])
    expect(registrations[0].dicts.zh).toBe(zh)
    expect(registrations[0].dicts.en).toBe(en)
  })

  it('register 的 disposer 经 effect 托管——fiber 卸载即撤除字典（V5 槽位贡献撤销）', () => {
    let removed = false
    const effects: (() => (() => void) | void)[] = []
    installLocale({
      effect(callback) {
        effects.push(callback)
      },
      locale: {
        register() {
          return () => {
            removed = true
          }
        },
      },
    })
    const disposer = effects[0]()
    expect(typeof disposer).toBe('function')
    expect(removed).toBe(false)
    ;(disposer as () => void)()
    expect(removed).toBe(true)
  })
})
