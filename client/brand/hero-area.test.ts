import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { collectElements, createTsxLoader, elementsWithClass, textOf, type FakeElement, type TsxLoader } from '../testing/load-tsx'
import { TAIJI_LOCALE_NS, en, zh } from '../locale'

/**
 * hero 品牌区单测（hero 槽 taiji 化：放大双鱼标 + 产品名 + 欢迎语）。
 *
 * 三条测试线（装配线与组件线同 mark.test.ts 形态）：
 *   ① 装配线（假宿主 slots）——hero 槽注册的是品牌区组件 TaijiHeroArea（不是裸 mark），
 *      locale 声明、优先级避让、区间占满的降级回落；
 *   ② 组件线（测试夹具装载 .tsx + 假 react）——竖排结构与文案（mark 56 / 产品名 / 欢迎语）、
 *      宿主几何类透传到 mark svg、size 请求值不被消费；
 *   ③ 隐藏样式线（最小 document stub）——宿主标题组的隐藏样式随组件挂载注入 head、随
 *      disposer 移除（双欢迎语修复：样式串的 :has 结构锚 + 可逆性）。
 * 真渲染（品牌区真的出现在 hero、样式真的藏掉宿主标题）归真实宿主场景，本层不越界。
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
  /** 隐藏宿主标题组的样式串（模块常量；内容断言用）。 */
  HERO_HOST_TITLE_HIDE_CSS: string
  /** style 元素的 data-taiji-hero 标记值。 */
  HERO_HOST_TITLE_STYLE_MARK: string
  /** 样式安装函数（最小 DOM 面；安装/卸载断言用）。 */
  installHeroHostTitleStyle: (doc: StyleDocumentStub['document']) => () => void
}

interface MarkModule {
  installBrandMarkSlots: (host: unknown) => void
  TaijiBrandMark: (props: { size: number; className?: string }) => FakeElement
}

/**
 * 同一 loader 装载 mark.tsx + hero-area.tsx：模块循环（mark ⇄ hero-area）下两边拿到
 * 彼此的同一实例引用，component 身份断言（toBe）才成立。
 */
function loadBrandModules(): { loader: TsxLoader; mark: MarkModule; heroArea: HeroAreaModule } {
  const loader = createTsxLoader()
  const mark = loader.load(MARK_PATH) as unknown as MarkModule
  const heroArea = loader.load(HERO_AREA_PATH) as unknown as HeroAreaModule
  return { loader, mark, heroArea }
}

/** 最小 style 元素 stub：记录 textContent 与 data 属性（断言注入内容用）。 */
interface StyleStub {
  textContent: string | null
  readonly attributes: Record<string, string>
  setAttribute(name: string, value: string): void
}

/** 最小 document stub：只提供 installHeroHostTitleStyle 用到的三个面。 */
interface StyleDocumentStub {
  document: {
    createElement(tagName: 'style'): StyleStub
    head: {
      appendChild(node: unknown): unknown
      removeChild(node: unknown): unknown
    }
  }
  /** head 里当前的元素（appendChild 进来的；断言「随安装出现 / 随 disposer 消失」）。 */
  children: unknown[]
  /** 全部创建过的 style 元素（创建即记录，与是否挂载无关）。 */
  created: StyleStub[]
}

/**
 * 造最小 document stub（node 测试环境无真实 DOM，见 testing/load-tsx.ts 边界）。
 *
 * removeChild 收到不在 head 里的元素时抛错：安装/卸载若不配对，测试当场红——
 * 这正是「样式元素随安装出现、随 disposer 消失」要锁的行为。
 */
function createStyleDocumentStub(): StyleDocumentStub {
  const children: unknown[] = []
  const created: StyleStub[] = []
  const document = {
    createElement(tagName: 'style'): StyleStub {
      if (tagName !== 'style') throw new Error(`stub 只造 style 元素，收到 ${String(tagName)}`)
      const element: StyleStub = {
        textContent: null,
        attributes: {},
        setAttribute(name: string, value: string) {
          element.attributes[name] = value
        },
      }
      created.push(element)
      return element
    },
    head: {
      appendChild(node: unknown): unknown {
        children.push(node)
        return node
      },
      removeChild(node: unknown): unknown {
        const index = children.indexOf(node)
        if (index < 0) throw new Error('stub removeChild：元素不在 head 里（安装/卸载不配对）')
        children.splice(index, 1)
        return node
      },
    },
  }
  return { document, children, created }
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

  // 组件体内 useEffect 注入隐藏样式 → 夹具桩立即执行 effect → 读全局 document；node
  // 测试环境无 DOM，每条用例装一个最小 stub（真机 document 天然满足同一最小面）
  beforeEach(() => {
    vi.stubGlobal('document', createStyleDocumentStub().document)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

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

describe('宿主标题组隐藏样式（双欢迎语修复）', () => {
  it('样式串：:has 锚定品牌区根类（在场才隐藏）+ 紧邻兄弟 titleGroup + display:none', () => {
    const { heroArea } = loadBrandModules()
    const css = heroArea.HERO_HOST_TITLE_HIDE_CSS
    // 结构锚（真机探针 + EmptyHero.tsx 132-158 行）：fishHitbox span 的槽容器内含品牌区
    // 根类，titleGroup 是 fishHitbox 的紧邻兄弟——选择器必须原样携带这两级锚
    expect(css).toContain("span:has(> [data-slot='conversation.hero.brand.mark'] .taiji-hero-area) + span")
    expect(css).toContain('display: none')
  })

  it('installHeroHostTitleStyle：head 追加带 data-taiji-hero 标记的 style 元素，disposer 移除它', () => {
    const { heroArea } = loadBrandModules()
    const stub = createStyleDocumentStub()
    const dispose = heroArea.installHeroHostTitleStyle(stub.document)

    expect(stub.created).toHaveLength(1)
    expect(stub.children).toHaveLength(1)
    const style = stub.children[0] as StyleStub
    expect(style).toBe(stub.created[0]) // head 里挂的就是创建的那个元素
    expect(style.attributes['data-taiji-hero']).toBe(heroArea.HERO_HOST_TITLE_STYLE_MARK)
    expect(style.textContent).toBe(heroArea.HERO_HOST_TITLE_HIDE_CSS)

    dispose()
    expect(stub.children).toHaveLength(0) // 卸载语义：宿主欢迎语自动回来，不留全局副作用
  })

  it('样式生命周期挂在组件上：渲染即注入 head，effect 清理即移除', () => {
    const stub = createStyleDocumentStub()
    vi.stubGlobal('document', stub.document)
    const { loader, heroArea } = loadBrandModules()

    // 夹具语义：手动调用组件函数 = 夹具的 useEffect 桩立即执行 effect（注入 head）
    heroArea.TaijiHeroArea({ size: 34, t: () => '太极' })
    expect(stub.children).toHaveLength(1)
    expect((stub.children[0] as StyleStub).textContent).toBe(heroArea.HERO_HOST_TITLE_HIDE_CSS)

    // 真 React 的卸载 = 执行 effect cleanup（桩记录在 effectCleanups）
    const cleanup = loader.effectCleanups.at(-1)
    expect(cleanup).toBeTypeOf('function')
    cleanup?.()
    expect(stub.children).toHaveLength(0)
    vi.unstubAllGlobals()
  })
})
