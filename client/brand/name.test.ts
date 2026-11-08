import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { collectElements, createTsxLoader, textOf, type FakeElement } from '../testing/load-tsx'
import { TAIJI_LOCALE_NS, zh } from '../locale'

/**
 * 产品名字标单测（设计 §3.3.8 / D8；V1「产品名在侧栏 brand.name」的行为范围）。
 *
 * 本槽只拥有侧栏品牌行的名字位；hero 首屏的产品名由 hero 品牌区组件（hero-area.tsx）
 * 在 hero 槽内自渲染（同一枚 brand.name 字典 key）——本文件锁死侧栏通路：注册目标槽、
 * locale 声明、文案取值。
 */

const NAME_PATH = fileURLToPath(new URL('./name.tsx', import.meta.url))

interface NameModule {
  TaijiBrandName: (props: { t: (key: string) => string }) => FakeElement
  installBrandNameSlot: (host: unknown) => void
  readShellInfo: (globalScope?: typeof globalThis) => { version: string; dshVersion?: string } | null
  formatVersionLine: (info: { version: string; dshVersion?: string } | null) => string | null
}

/** 假宿主 slots（与 mark.test.ts 同构：inject 等 declare 才跑）。 */
function fakeSlotsHost(prefill: Record<string, number[]> = {}) {
  const registry = new Map<string, { options: { priority?: number } }[]>(
    Object.entries(prefill).map(([key, priorities]) => [key, priorities.map((priority) => ({ options: { priority } }))]),
  )
  const registrations: { key: string; options: { name: string; priority?: number; locale?: string }; component: unknown }[] = []
  const pending = new Map<string, (() => (() => void) | void)[]>()
  const warnings: string[] = []
  const host = {
    slots: {
      inject(key: string, callback: () => (() => void) | void) {
        const list = pending.get(key) ?? []
        list.push(callback)
        pending.set(key, list)
        return () => {}
      },
      register(options: { name: string; priority?: number; locale?: string }, component: unknown) {
        registrations.push({ key: options.name, options, component })
        const list = registry.get(options.name) ?? []
        list.push({ options })
        registry.set(options.name, list)
        return () => {}
      },
      entries(key: string) {
        return registry.get(key) ?? []
      },
    },
    logger: { warn: (message: string) => warnings.push(message) },
  }
  return {
    host,
    registrations,
    warnings,
    declare(key: string) {
      for (const callback of pending.get(key) ?? []) callback()
      pending.delete(key)
    },
  }
}

function loadName(): NameModule {
  return createTsxLoader().load(NAME_PATH) as unknown as NameModule
}

describe('installBrandNameSlot 装配', () => {
  it('注册进 sidebar.brand.name，声明本包 locale 命名空间（t 座位的来源）', () => {
    const name = loadName()
    const fake = fakeSlotsHost()
    name.installBrandNameSlot(fake.host)
    expect(fake.registrations).toHaveLength(0)
    fake.declare('sidebar.brand.name')
    expect(fake.registrations).toHaveLength(1)
    expect(fake.registrations[0].key).toBe('sidebar.brand.name')
    expect(fake.registrations[0].options.locale).toBe(TAIJI_LOCALE_NS)
    expect(fake.registrations[0].options.priority).toBe(-5)
    expect(fake.registrations[0].component).toBe(name.TaijiBrandName)
  })

  it('不注册进 hero 槽（hero 首屏产品名由 hero-area.tsx 的品牌区组件自渲染，不走 brand.name 槽）', () => {
    const name = loadName()
    const fake = fakeSlotsHost()
    name.installBrandNameSlot(fake.host)
    fake.declare('conversation.hero.brand.mark')
    fake.declare('sidebar.brand.name')
    expect(fake.registrations.map((registration) => registration.key)).toEqual(['sidebar.brand.name'])
  })

  it('槽位被占 -5 时让到 -4（与 mark.tsx 同一避让规则）', () => {
    const name = loadName()
    const fake = fakeSlotsHost({ 'sidebar.brand.name': [-5] })
    name.installBrandNameSlot(fake.host)
    fake.declare('sidebar.brand.name')
    expect(fake.registrations[0].options.priority).toBe(-4)
  })
})

describe('TaijiBrandName 组件输出', () => {
  const name = loadName()
  const GLOBAL_KEY = '__TAIJI_SHELL_INFO__'

  /** 组件直读 globalThis——测试里注入再还原（本文件内串行，无并发污染）。 */
  function withShellInfo(value: unknown, run: () => void) {
    const saved = (globalThis as Record<string, unknown>)[GLOBAL_KEY]
    ;(globalThis as Record<string, unknown>)[GLOBAL_KEY] = value
    try {
      run()
    } finally {
      if (saved === undefined) delete (globalThis as Record<string, unknown>)[GLOBAL_KEY]
      else (globalThis as Record<string, unknown>)[GLOBAL_KEY] = saved
    }
  }

  it('渲染品牌栈：产品名 span；壳信息缺席时无版本行（降级形态）', () => {
    withShellInfo(undefined, () => {
      const root = name.TaijiBrandName({ t: (key: string) => zh[key as keyof typeof zh] })
      expect(root.type).toBe('span')
      expect(root.props['className']).toBe('taiji-brand-stack')
      const elements = collectElements(root) // 含根递归：[0]=栈 [1]=产品名
      expect(elements).toHaveLength(2)
      expect(elements[1].props['className']).toBe('taiji-brand-name')
      expect(textOf(root)).toBe('太极')
    })
  })

  it('壳信息带 dsh 版本时渲染版本行（v{壳} · dsh v{宿主}，taiji versionLabel 同构）', () => {
    withShellInfo({ version: '0.1.0', dshVersion: '0.2.2-rc.1' }, () => {
      const root = name.TaijiBrandName({ t: (key: string) => zh[key as keyof typeof zh] })
      const elements = collectElements(root) // [0]=栈 [1]=产品名 [2]=版本行
      expect(elements).toHaveLength(3)
      expect(elements[2].props['className']).toBe('taiji-brand-version')
      expect(textOf(elements[2])).toBe('v0.1.0 · dsh v0.2.2-rc.1')
      expect(textOf(root)).toBe('太极v0.1.0 · dsh v0.2.2-rc.1')
    })
  })

  it('壳信息只有壳版本时版本行只显 v{壳}（内核版本缺席的降级）', () => {
    withShellInfo({ version: '0.1.0' }, () => {
      const root = name.TaijiBrandName({ t: () => 'TaiJi' })
      const elements = collectElements(root)
      expect(elements).toHaveLength(3)
      expect(textOf(elements[2])).toBe('v0.1.0')
    })
  })

  it('英文环境渲染 TaiJi（大小写按太极侧 en-US/app.ts 原样）', () => {
    const root = name.TaijiBrandName({ t: () => 'TaiJi' })
    expect(textOf(root)).toBe('TaiJi')
  })
})

describe('readShellInfo / formatVersionLine', () => {
  const name = loadName()

  it('readShellInfo：合法对象原样收窄；dshVersion 数字串化', () => {
    expect(name.readShellInfo({ __TAIJI_SHELL_INFO__: { version: '0.1.0' } } as typeof globalThis))
      .toEqual({ version: '0.1.0' })
    expect(name.readShellInfo({ __TAIJI_SHELL_INFO__: { version: '0.1.0', dshVersion: 1 } } as typeof globalThis))
      .toEqual({ version: '0.1.0', dshVersion: '1' })
  })

  it('readShellInfo：缺席 / 非对象 / version 非法 → null（版本行消失，产品名不受影响）', () => {
    expect(name.readShellInfo({} as typeof globalThis)).toBeNull()
    expect(name.readShellInfo({ __TAIJI_SHELL_INFO__: 'junk' } as typeof globalThis)).toBeNull()
    expect(name.readShellInfo({ __TAIJI_SHELL_INFO__: { dshVersion: '0.2.0' } } as typeof globalThis)).toBeNull()
    expect(name.readShellInfo({ __TAIJI_SHELL_INFO__: { version: '' } } as typeof globalThis)).toBeNull()
  })

  it('formatVersionLine：null → null；单版本 → v{壳}；双版本 → v{壳} · dsh v{宿主}', () => {
    expect(name.formatVersionLine(null)).toBeNull()
    expect(name.formatVersionLine({ version: '0.1.0' })).toBe('v0.1.0')
    expect(name.formatVersionLine({ version: '0.1.0', dshVersion: '0.1.7-rc.2' })).toBe('v0.1.0 · dsh v0.1.7-rc.2')
  })
})
