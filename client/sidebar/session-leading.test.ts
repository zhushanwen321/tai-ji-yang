import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { collectElements, createTsxLoader, type FakeElement } from '../testing/load-tsx'

/**
 * 会话行行首微标单测（client/sidebar/session-leading.tsx）。
 *
 * 锁死机器可判部分：注册选项字面值（槽名/id/order，私有 id 不遮蔽）、壳对
 * standardProps 的忽略、鱼形几何复用 TaijiBrandMark 单一来源（6 path / viewBox 1200）、
 * CSS 契约（取色只经 brand-primary token、:has 让位规则在场）。
 *
 * 不在本层断言（测试夹具是单次渲染语义，见 client/testing/load-tsx.ts 头部边界）：
 * :has() 在真实浏览器里的隐藏效果、与宿主渲染机（data-slot 锚）的组装——归 L3 真实
 * 宿主场景；单测层以 CSS 文本契约锁让位规则的存在与寻址缝字面值。
 */

const LEADING_PATH = fileURLToPath(new URL('./session-leading.tsx', import.meta.url))
const LEADING_CSS_PATH = fileURLToPath(new URL('./session-leading.css', import.meta.url))

/** 假宿主：slots.inject/register（对齐 SessionLeadingHost 的最小结构）。 */
function fakeLeadingHost() {
  const registrations: { key: string; options: Record<string, unknown>; component: unknown }[] = []
  const pending = new Map<string, (() => (() => void) | void)[]>()
  const host = {
    slots: {
      inject(key: string, callback: () => (() => void) | void) {
        const list = pending.get(key) ?? []
        list.push(callback)
        pending.set(key, list)
        return () => {}
      },
      register(options: Record<string, unknown>, component: unknown) {
        registrations.push({ key: options.name as string, options, component })
        return () => {}
      },
    },
  }
  return {
    host,
    registrations,
    /** 模拟宿主声明某槽：跑该槽的全部待决 inject callback。 */
    declare(key: string) {
      for (const callback of pending.get(key) ?? []) callback()
      pending.delete(key)
    },
  }
}

interface LeadingModule {
  SessionLeadingSlot: (props: Record<string, unknown>) => FakeElement
  installSessionLeading: (host: unknown) => void
  SESSION_LEADING_SLOT: string
  SESSION_LEADING_ID: string
  SESSION_LEADING_ORDER: number
  SESSION_LEADING_MARK_SIZE: number
}

const loader = createTsxLoader()
const leadingModule = loader.load(LEADING_PATH) as unknown as LeadingModule
const {
  SESSION_LEADING_SLOT, SESSION_LEADING_ID, SESSION_LEADING_ORDER, SESSION_LEADING_MARK_SIZE,
} = leadingModule

/** 装配（声明槽位出现）并取回唯一一条注册。 */
function assemble(host: ReturnType<typeof fakeLeadingHost>) {
  leadingModule.installSessionLeading(host.host)
  host.declare(SESSION_LEADING_SLOT)
  expect(host.registrations).toHaveLength(1)
  return host.registrations[0]
}

/** 渲染壳并展开到 svg 层（壳 → span → TaijiBrandMark 组件元素 → 手动执行得 svg）。 */
function renderMark() {
  const shell = leadingModule.SessionLeadingSlot({
    sessionId: '会话 id（owner props，应被忽略）',
    useSessions: '宿主钩子座位（应被忽略）',
  })
  expect(shell.type).toBe('span')
  const markElement = shell.props.children as FakeElement
  const svg = (markElement.type as (props: unknown) => FakeElement)(markElement.props)
  return { shell, svg, tree: collectElements(svg) }
}

describe('installSessionLeading 注册契约', () => {
  it('注册进 sidebar.session.row.leading：选项字面值与宿主 example 同形态（私有 id，不遮蔽 shipped 条目）', () => {
    const registration = assemble(fakeLeadingHost())
    expect(registration.key).toBe(SESSION_LEADING_SLOT)
    expect(SESSION_LEADING_SLOT).toBe('sidebar.session.row.leading')
    expect(SESSION_LEADING_ID).toBe('taiji-session-leading')
    // 整对象对账：三键且只有三键——不设 priority（list 槽同 id 才遮蔽，私有 id 即追加）、
    // 不设 label（该槽不读取时求值 label）、不设 locale/inject（该槽无此机制）
    expect(registration.options).toEqual({
      name: 'sidebar.session.row.leading',
      id: 'taiji-session-leading',
      order: 100,
    })
    expect(registration.options.order).toBe(SESSION_LEADING_ORDER)
    expect(typeof registration.component).toBe('function')
  })

  it('注册组件即壳本体（SessionLeadingSlot，无闭包工厂层）', () => {
    const registration = assemble(fakeLeadingHost())
    expect(registration.component).toBe(leadingModule.SessionLeadingSlot)
  })
})

describe('SessionLeadingSlot 组件输出', () => {
  it('根 span 带 taiji- 前缀类，内嵌 TaijiBrandMark（几何单一来源：6 path + viewBox 1200）', () => {
    const { shell, svg, tree } = renderMark()
    expect(shell.props.className).toBe('taiji-session-leading')
    expect(svg.type).toBe('svg')
    expect(svg.props.width).toBe(SESSION_LEADING_MARK_SIZE)
    expect(SESSION_LEADING_MARK_SIZE).toBe(12)
    expect(svg.props['aria-hidden']).toBe('true')
    // 鱼几何复用对账（细节契约归 brand/mark.test.ts，此处锁「用的真是 TaijiBrandMark」）
    expect(svg.props.viewBox).toBe('0 0 1200 1200')
    expect(tree.filter((element) => element.type === 'path')).toHaveLength(6)
  })

  it('壳忽略宿主 standardProps 与 owner props（装饰与具体会话无关，每行同形）', () => {
    const { shell } = renderMark()
    // 壳只产出类名一个 prop（无 children 之外的字段泄漏，无 props 透传）
    expect(Object.keys(shell.props).sort()).toEqual(['children', 'className'])
  })
})

describe('CSS 契约（session-leading.css）', () => {
  const css = readFileSync(LEADING_CSS_PATH, 'utf8')

  it('取色只经宿主 token：品牌色 var(--dsw-alias-brand-primary)，无字面色值', () => {
    expect(css).toContain('.taiji-session-leading')
    expect(css).toContain('var(--dsw-alias-brand-primary)')
    // 禁字面色值：颜色只能经 token（#hex / rgb( / hsl( 均不许出现）
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(css).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\(/)
  })

  it('让位规则在场：宿主时钟标（schedule-mark）渲染时鱼隐藏（补位形态）', () => {
    // 两条寻址缝都是宿主文档化的稳定 DOM 契约（data-slot 锚 + 时钟标稳定标记）
    expect(css).toContain("[data-slot='sidebar.session.row.leading']:has([data-session-schedule-mark])")
    expect(css).toContain('display: none')
  })
})
