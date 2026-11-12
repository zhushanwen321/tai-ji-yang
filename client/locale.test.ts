import { describe, expect, it } from 'vitest'
import {
  en,
  installLocale,
  installModelServiceLocale,
  LOCALE_DICTS,
  modelServiceEn,
  modelServiceZh,
  MODEL_SERVICE_LOCALE_DICTS,
  TAIJI_LOCALE_NS,
  TAIJI_MODEL_SERVICE_LOCALE_NS,
  zh,
} from './locale'

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

  it('文案覆盖品牌名 / hero 欢迎语与外观行（产品名两处同文：hero 品牌区 + 侧栏 brand.name）', () => {
    // 产品名抄录太极侧 i18n app.ts：zh 太极 / en TaiJi
    expect(zh['brand.name']).toBe('太极')
    expect(en['brand.name']).toBe('TaiJi')
    // hero 品牌区欢迎语抄录太极侧 app.ts 的 greetingPrompt（Landing 问候语后半句）
    expect(zh['hero.greeting']).toBe('有什么想让我帮忙的吗')
    expect(en['hero.greeting']).toBe('What can I help you with?')
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

describe('模型服务分区双语字典（u-foundation 骨架 + M1 填充 + M2 增键，键集完整性）', () => {
  it('modelServiceZh 与 modelServiceEn 的 key 集相等（zh/en 同 key 集纪律）', () => {
    expect(Object.keys(modelServiceZh).sort()).toEqual(Object.keys(modelServiceEn).sort())
  })

  it('每个 key 在两种语言下都是非空字符串（空串会让宿主 t 渲染出空白控件）', () => {
    for (const [key, value] of Object.entries(modelServiceZh)) {
      expect(typeof value, `modelServiceZh.${key} 不是字符串`).toBe('string')
      expect(value.trim().length, `modelServiceZh.${key} 是空白`).toBeGreaterThan(0)
    }
    for (const [key, value] of Object.entries(modelServiceEn)) {
      expect(typeof value, `modelServiceEn.${key} 不是字符串`).toBe('string')
      expect(value.trim().length, `modelServiceEn.${key} 是空白`).toBeGreaterThan(0)
    }
  })

  it('骨架键不被 M1 填充改动（u-foundation 键集原样保留；M1 只增键）', () => {
    expect(modelServiceZh['section.label']).toBe('模型服务')
    expect(modelServiceZh['view.providers']).toBe('供应商')
    expect(modelServiceZh['view.models']).toBe('模型清单')
    expect(modelServiceZh['view.routes']).toBe('模型路由')
    expect(modelServiceZh['models.directoryMode']).toBe('保持目录默认')
    expect(modelServiceZh['models.directoryReplaced']).toBe('目录默认已被替换')
    expect(modelServiceZh['models.restoreDirectory']).toBe('恢复目录默认')
  })

  it('M1 填充的关键键在位（D6 compat / D7 查重两支 / D11 来源态 / 空态矩阵）', () => {
    // D7 查重两支（a = 本 profile 查得到持有者 / b = 可能来自其他 profile）
    expect(modelServiceZh['save.refTakenA']).toContain('本 profile')
    expect(modelServiceZh['save.refTakenB']).toContain('其他 profile')
    // D11 来源态
    expect(modelServiceZh['models.sourceDirectory']).toBe('目录默认')
    expect(modelServiceZh['models.sourceCustom']).toBe('自定义清单')
    expect(modelServiceZh['models.sourceOverride']).toBe('目录默认 + 覆盖')
    // D6 compat 分组与一期不开放标注
    expect(modelServiceZh['compat.groupEssential']).toBe('基础兼容')
    expect(modelServiceZh['compat.groupAdvanced']).toBe('高级兼容')
    expect(modelServiceZh['compat.unavailable']).toBe('一期不开放')
    // 空态矩阵三视图分支 + 筛选空态
    expect(modelServiceZh['models.emptyNoMatch']).toContain('{q}')
    expect(modelServiceZh['models.clearFilter']).toBe('清除筛选')
    expect(modelServiceZh['models.fieldMissing']).toBe('未提供')
  })

  it('installModelServiceLocale 经 ctx.effect 注册独立命名空间 taiji.model-service', () => {
    const registrations: { ns: string; dicts: Record<string, unknown> }[] = []
    const effects: (() => (() => void) | void)[] = []
    installModelServiceLocale({
      effect(callback) { effects.push(callback) },
      locale: {
        register(ns, dicts) {
          registrations.push({ ns, dicts })
          return () => {}
        },
      },
    })
    expect(effects).toHaveLength(1)
    expect(registrations).toHaveLength(0)
    effects[0]()
    expect(registrations[0].ns).toBe(TAIJI_MODEL_SERVICE_LOCALE_NS)
    expect(TAIJI_MODEL_SERVICE_LOCALE_NS).toBe('taiji.model-service')
    expect(registrations[0].dicts.zh).toBe(modelServiceZh)
    expect(registrations[0].dicts.en).toBe(modelServiceEn)
    expect(MODEL_SERVICE_LOCALE_DICTS.zh).toBe(modelServiceZh)
  })
})
