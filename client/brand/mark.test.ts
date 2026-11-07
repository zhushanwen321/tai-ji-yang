import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { collectElements, createTsxLoader, elementsWithClass, type FakeElement } from '../testing/load-tsx'

/**
 * 双鱼标单测（设计 §3.3.8 / D8；验收 V1 品牌位 + RL1 静态检查的行为范围）。
 *
 * 两条测试线：
 *   ① 装配线（假宿主 slots）——注册进哪两个槽、什么优先级、避让规则是否真的避让；
 *   ② 组件线（测试夹具装载 .tsx + 假 react）——svg 元素树与几何完整性。
 * 真渲染（双鱼标真的出现在 hero / 侧栏）归 V1 的真实宿主场景，本层不越界。
 */

const MARK_PATH = fileURLToPath(new URL('./mark.tsx', import.meta.url))

/** 一条 occupant 登记（假宿主账本）。 */
interface Registration {
  key: string
  options: { name: string; priority?: number; locale?: string }
  component: unknown
}

/** 假宿主 slots：inject 等 declare 才跑 callback（对齐宿主「等槽位声明出现」语义）。 */
function fakeSlotsHost(prefill: Record<string, number[]> = {}) {
  const registry = new Map<string, { options: { priority?: number } }[]>(
    Object.entries(prefill).map(([key, priorities]) => [key, priorities.map((priority) => ({ options: { priority } }))]),
  )
  const registrations: Registration[] = []
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
    /** 模拟宿主声明某槽：跑该槽的全部待决 inject callback。 */
    declare(key: string) {
      for (const callback of pending.get(key) ?? []) callback()
      pending.delete(key)
    },
  }
}

interface MarkModule {
  TaijiBrandMark: (props: { size: number; className?: string }) => FakeElement
  installBrandMarkSlots: (host: unknown) => void
  resolveBrandPriority: (entries: readonly { options: { priority?: number } }[]) => number | undefined
  MARK_PATH_COUNT: number
  MARK_VIEWBOX: string
}

function loadMark(): MarkModule {
  return createTsxLoader().load(MARK_PATH) as unknown as MarkModule
}

describe('resolveBrandPriority 避让规则', () => {
  const mark = loadMark()

  it('无占用时取目标值 -5（压在官方标 0 之下、让在 viewer 标 -10 之上）', () => {
    expect(mark.resolveBrandPriority([])).toBe(-5)
    // 官方标（隐式 0，未显式设 priority）不挡 -5
    expect(mark.resolveBrandPriority([{ options: {} }])).toBe(-5)
  })

  it('目标值被占时向 0 方向步进找最近空闲值——同优先级二次注册会抛错，必须让出', () => {
    expect(mark.resolveBrandPriority([{ options: { priority: -5 } }])).toBe(-4)
    expect(
      mark.resolveBrandPriority([
        { options: { priority: -5 } },
        { options: { priority: -4 } },
      ]),
    ).toBe(-3)
  })

  it('viewer 标（-10）在位不改变本包取值——-5 仍高于它，分享页让位成立', () => {
    expect(mark.resolveBrandPriority([{ options: { priority: -10 } }])).toBe(-5)
  })

  it('区间 (-10, 0) 被占满时返回 undefined（调用方不注册，不抛错、不静默抢位）', () => {
    const full = [-5, -4, -3, -2, -1].map((priority) => ({ options: { priority } }))
    expect(mark.resolveBrandPriority(full)).toBeUndefined()
  })
})

describe('installBrandMarkSlots 装配', () => {
  it('注册进 hero 与 sidebar 两个品牌标记槽，priority = -5', () => {
    const mark = loadMark()
    const fake = fakeSlotsHost()
    mark.installBrandMarkSlots(fake.host)
    // 注册是「等槽位声明」的：声明前只有 inject 待决，没有实际注册
    expect(fake.registrations).toHaveLength(0)

    fake.declare('conversation.hero.brand.mark')
    fake.declare('sidebar.brand.mark')
    expect(fake.registrations).toHaveLength(2)
    expect(fake.registrations.map((registration) => registration.key).sort()).toEqual([
      'conversation.hero.brand.mark',
      'sidebar.brand.mark',
    ])
    for (const registration of fake.registrations) {
      expect(registration.options.priority).toBe(-5)
      expect(registration.component).toBe(mark.TaijiBrandMark)
    }
    expect(fake.warnings).toHaveLength(0)
  })

  it('sidebar 槽已被占 -5 时本包让到 -4（不抛错；官方 0 与 viewer -10 语义不变）', () => {
    const mark = loadMark()
    const fake = fakeSlotsHost({ 'sidebar.brand.mark': [-5] })
    mark.installBrandMarkSlots(fake.host)
    fake.declare('conversation.hero.brand.mark')
    fake.declare('sidebar.brand.mark')
    const sidebar = fake.registrations.find((registration) => registration.key === 'sidebar.brand.mark')
    expect(sidebar?.options.priority).toBe(-4)
  })

  it('viewer 标（-10）在位时本包仍取 -5：viewer 更小，分享页品牌位是它的', () => {
    const mark = loadMark()
    const fake = fakeSlotsHost({ 'sidebar.brand.mark': [-10] })
    mark.installBrandMarkSlots(fake.host)
    fake.declare('sidebar.brand.mark')
    const sidebar = fake.registrations.find((registration) => registration.key === 'sidebar.brand.mark')
    expect(sidebar?.options.priority).toBe(-5)
  })

  it('区间占满时不注册并告警（回落宿主原生 occupant，失败可见）', () => {
    const mark = loadMark()
    const fake = fakeSlotsHost({ 'sidebar.brand.mark': [-5, -4, -3, -2, -1] })
    mark.installBrandMarkSlots(fake.host)
    fake.declare('conversation.hero.brand.mark')
    fake.declare('sidebar.brand.mark')
    expect(fake.registrations).toHaveLength(1) // hero 槽照常注册
    expect(fake.registrations[0].key).toBe('conversation.hero.brand.mark')
    expect(fake.warnings).toHaveLength(1)
    expect(fake.warnings[0]).toContain('sidebar.brand.mark')
  })
})

describe('TaijiBrandMark 组件输出', () => {
  const loader = createTsxLoader()
  const mark = loader.load(MARK_PATH) as unknown as MarkModule

  it('几何完整：viewBox 1200 正方形 + 6 条 path（太极侧 TaijiLogo.vue 同构）', () => {
    expect(mark.MARK_VIEWBOX).toBe('0 0 1200 1200')
    expect(mark.MARK_PATH_COUNT).toBe(6)
    const root = mark.TaijiBrandMark({ size: 24 })
    const elements = collectElements(root)
    const paths = elements.filter((element) => element.type === 'path')
    expect(paths).toHaveLength(6)
    for (const path of paths) {
      expect(typeof path.props.d).toBe('string')
      expect((path.props.d as string).length).toBeGreaterThan(100)
    }
    // 主体两条最大（阴阳鱼身），逐条抄录不允许空壳
    expect((paths[0].props.d as string).startsWith('M3655 9803')).toBe(true)
    expect((paths[1].props.d as string).startsWith('M3880 8359')).toBe(true)
  })

  it('size 决定宽高、className 透传、aria-hidden（宿主鱼标同语义）', () => {
    const root = mark.TaijiBrandMark({ size: 34, className: 'host-fish-geometry' })
    expect(root.type).toBe('svg')
    expect(root.props.width).toBe(34)
    expect(root.props.height).toBe(34)
    expect(root.props.className).toBe('host-fish-geometry')
    expect(root.props['aria-hidden']).toBe('true')
    expect(root.props.preserveAspectRatio).toBe('xMidYMid meet')
  })

  it('sidebar 槽不传 className 时元素上无该类（owner props 只有 size）', () => {
    const root = mark.TaijiBrandMark({ size: 24 })
    expect(root.props.className).toBeUndefined()
  })

  it('fill/stroke 用 currentColor（继承宿主行内文字色，不引第二套取色）', () => {
    const root = mark.TaijiBrandMark({ size: 24 })
    const groups = collectElements(root).filter((element) => element.type === 'g')
    expect(groups.length).toBeGreaterThanOrEqual(3) // 外层 + 两级 transform
    expect(groups[0].props.fill).toBe('currentColor')
    expect(groups[0].props.stroke).toBe('currentColor')
    expect(groups[0].props.fillRule).toBe('evenodd')
  })

  it('无旋转类/无动画属性（不旋转是刻意决策：设计 D8 未要求，宿主自身品牌标全静态）', () => {
    const root = mark.TaijiBrandMark({ size: 24 })
    const classes = elementsWithClass(collectElements(root), 'animate-taiji-spin')
    expect(classes).toHaveLength(0)
    expect(root.props.className).toBeUndefined()
  })
})
