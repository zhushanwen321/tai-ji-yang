import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { collectElements, createTsxLoader, textOf, type FakeElement } from '../testing/load-tsx'
import { TAIJI_LOCALE_NS, zh } from '../locale'

/**
 * 产品名字标单测（设计 §3.3.8 / D8；V1「产品名在侧栏 brand.name」的行为范围）。
 *
 * hero 槽没有名字位（owner props 只有 size/className），产品名只能经 sidebar.brand.name——
 * 本文件锁死这条通路：注册目标槽、locale 声明、文案取值。
 */

const NAME_PATH = fileURLToPath(new URL('./name.tsx', import.meta.url))

interface NameModule {
  TaijiBrandName: (props: { t: (key: string) => string }) => FakeElement
  installBrandNameSlot: (host: unknown) => void
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

  it('不注册进 hero 槽（hero 无名字位——产品名只能走侧栏）', () => {
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

  it('渲染文字 span，内容 = 当前语言的产品名（太极 / TaiJi）', () => {
    const root = name.TaijiBrandName({ t: (key: string) => zh[key as keyof typeof zh] })
    expect(root.type).toBe('span')
    expect(textOf(root)).toBe('太极')
    expect(collectElements(root)).toHaveLength(1) // 不套多余结构：宿主 .brandName 容器已管排版
  })

  it('英文环境渲染 TaiJi（大小写按太极侧 en-US/app.ts 原样）', () => {
    const root = name.TaijiBrandName({ t: () => 'TaiJi' })
    expect(textOf(root)).toBe('TaiJi')
  })
})
