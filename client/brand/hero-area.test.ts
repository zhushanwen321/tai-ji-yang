import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { collectElements, createTsxLoader, elementsWithClass, textOf, type FakeElement } from '../testing/load-tsx'
import { TAIJI_LOCALE_NS, en, zh } from '../locale'

/**
 * hero 品牌区单测（hero 槽 taiji 化：放大双鱼标 + 产品名 + 欢迎语）。
 *
 * 两条测试线（与 mark.test.ts 同形态）：
 *   ① 装配线（假宿主 slots）——hero 槽注册的是品牌区组件 TaijiHeroArea（不是裸 mark），
 *      locale 声明、优先级避让、区间占满的降级回落；
 *   ② 组件线（测试夹具装载 .tsx + 假 react）——竖排结构与文案（mark 56 / 产品名 / 欢迎语）、
 *      宿主几何类透传到 mark svg、size 请求值不被消费。
 * 真渲染（品牌区真的出现在 hero）归真实宿主场景，本层不越界。
 */

const MARK_PATH = fileURLToPath(new URL('./mark.tsx', import.meta.url))
const HERO_AREA_PATH = fileURLToPath(new URL('./hero-area.tsx', import.meta.url))

/** hero 品牌区的 mark 展示边长（与 hero-area.tsx 的 HERO_MARK_SIZE 同值，结构断言用）。 */
const HERO_MARK_SIZE = 56

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

interface HeroAreaModule {
  TaijiHeroArea: (props: {
    size: number
    className?: string
    t: (key: string) => string
  }) => FakeElement
}

interface MarkModule {
  installBrandMarkSlots: (host: unknown) => void
  TaijiBrandMark: (props: { size: number; className?: string }) => FakeElement
}

/**
 * 同一 loader 装载 mark.tsx + hero-area.tsx：模块循环（mark ⇄ hero-area）下两边拿到
 * 彼此的同一实例引用，component 身份断言（toBe）才成立。
 */
function loadBrandModules(): { mark: MarkModule; heroArea: HeroAreaModule } {
  const loader = createTsxLoader()
  const mark = loader.load(MARK_PATH) as unknown as MarkModule
  const heroArea = loader.load(HERO_AREA_PATH) as unknown as HeroAreaModule
  return { mark, heroArea }
}

describe('installBrandMarkSlots 的 hero 槽（品牌区组件）', () => {
  it('hero 槽注册 TaijiHeroArea（非裸 mark）并声明本包 locale 命名空间（t 座位来源）', () => {
    const { mark, heroArea } = loadBrandModules()
    const fake = fakeSlotsHost()
    mark.installBrandMarkSlots(fake.host)
    expect(fake.registrations).toHaveLength(0) // 等声明，未注册

    fake.declare('conversation.hero.brand.mark')
    fake.declare('sidebar.brand.mark')
    const hero = fake.registrations.find((registration) => registration.key === 'conversation.hero.brand.mark')
    expect(hero?.options.priority).toBe(-5)
    expect(hero?.options.locale).toBe(TAIJI_LOCALE_NS)
    expect(hero?.component).toBe(heroArea.TaijiHeroArea)
    expect(fake.warnings).toHaveLength(0)
  })

  it('hero 槽被占 -5 时让到 -4（避让规则复用，不抛错）', () => {
    const { mark } = loadBrandModules()
    const fake = fakeSlotsHost({ 'conversation.hero.brand.mark': [-5] })
    mark.installBrandMarkSlots(fake.host)
    fake.declare('conversation.hero.brand.mark')
    expect(fake.registrations[0].options.priority).toBe(-4)
  })

  it('hero 区间占满时不注册并告警（回落宿主原生 occupant，失败可见；sidebar 槽照常）', () => {
    const { mark } = loadBrandModules()
    const fake = fakeSlotsHost({ 'conversation.hero.brand.mark': [-5, -4, -3, -2, -1] })
    mark.installBrandMarkSlots(fake.host)
    fake.declare('conversation.hero.brand.mark')
    fake.declare('sidebar.brand.mark')
    expect(fake.registrations.map((registration) => registration.key)).toEqual(['sidebar.brand.mark'])
    expect(fake.warnings).toHaveLength(1)
    expect(fake.warnings[0]).toContain('conversation.hero.brand.mark')
  })
})

describe('TaijiHeroArea 组件输出', () => {
  const { mark, heroArea } = loadBrandModules()

  /** 树中定位 mark 元素（type = TaijiBrandMark 组件函数；夹具不递归执行组件）。 */
  function markElement(root: FakeElement): FakeElement | undefined {
    return collectElements(root).find((element) => element.type === mark.TaijiBrandMark)
  }

  it('竖排品牌区结构：根容器类 + 放大 mark（56px）+ 产品名 + 欢迎语两行文字', () => {
    const root = heroArea.TaijiHeroArea({ size: 34, t: (key) => zh[key as keyof typeof zh] })
    expect(root.type).toBe('div')
    expect(root.props.className).toBe('taiji-hero-area')

    const elements = collectElements(root)
    // mark 座位：品牌区以展示值 56 调用 TaijiBrandMark（宿主请求值 34 不被消费）
    const markEl = markElement(root)
    expect(markEl).toBeDefined()
    // 手动渲染 mark 元素（夹具语义：组件 JSX 只记录元素，不执行）验证几何与边长
    const markSize = typeof markEl?.props.size === 'number' ? markEl.props.size : Number.NaN
    const svg = mark.TaijiBrandMark({ size: markSize })
    expect(svg.props.width).toBe(HERO_MARK_SIZE)
    expect(svg.props.height).toBe(HERO_MARK_SIZE)
    const paths = collectElements(svg).filter((element) => element.type === 'path')
    expect(paths).toHaveLength(6) // 双鱼标 6 条 path，几何与 TaijiBrandMark 同源
    // 产品名 / 欢迎语两级文字
    const name = elementsWithClass(elements, 'taiji-hero-area-name')
    const greeting = elementsWithClass(elements, 'taiji-hero-area-greeting')
    expect(name).toHaveLength(1)
    expect(textOf(name[0])).toBe('太极')
    expect(greeting).toHaveLength(1)
    expect(textOf(greeting[0])).toBe('有什么想让我帮忙的吗')
  })

  it('英文环境渲染 TaiJi 与英文欢迎语（字典 zh/en 同 key 集，文案抄录太极侧 greetingPrompt）', () => {
    const root = heroArea.TaijiHeroArea({ size: 34, t: (key) => en[key as keyof typeof en] })
    const elements = collectElements(root)
    expect(textOf(elementsWithClass(elements, 'taiji-hero-area-name')[0])).toBe('TaiJi')
    expect(textOf(elementsWithClass(elements, 'taiji-hero-area-greeting')[0])).toBe('What can I help you with?')
  })

  it('宿主几何类透传到 mark（保留宿主 fish 几何与 hover 游动钩子），不落在品牌区根上', () => {
    const root = heroArea.TaijiHeroArea({ size: 34, className: 'host-fish-geometry', t: () => '太极' })
    expect(root.props.className).toBe('taiji-hero-area') // 根仍是品牌区自己的类
    expect(markElement(root)?.props.className).toBe('host-fish-geometry')
  })

  it('size 是宿主请求值，品牌区不消费：传任意 size，mark 调用边长恒为展示值 56', () => {
    const root = heroArea.TaijiHeroArea({ size: 34, t: () => '太极' })
    expect(markElement(root)?.props.size).toBe(HERO_MARK_SIZE)
  })
})
