import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { collectElements, createTsxLoader, elementsWithClass, textOf, type FakeElement } from '../testing/load-tsx'
import { TAIJI_LOCALE_NS, zh } from '../locale'
import { resolveTheme, type ThemeId } from '../theme/resolve'
// 类型-only 引入（esbuild 整体擦除，不触发 Vite 对 .tsx 的模块解析）；运行值全部经测试
// 夹具装载——被测模块 import 了 'react'（宿主模块表供给，本仓 devDeps 没有），直接 import 会挂在
// 模块解析上（见 client/testing/load-tsx.ts 头部说明）。
import type { ThemeSelectionController } from './appearance-row'

/**
 * 「太极」设置分区单测。锁死三件事的可机器化部分：
 *   · 注册契约：槽名 / id / order / label thunk / locale 命名空间 / 组件同一性；
 *   · 注入回调：只取 controller 读方法（状态页不出现第二个换色写入口）；
 *   · 渲染：标题与说明、当前色名 + 色点（活品牌色变量）、指引行文案；换色后色名跟随。
 *
 * 真实宿主渲染（导航位、面板 chrome）归 L3 场景，本层不越界。
 */

const SECTION_PATH = fileURLToPath(new URL('./taiji-section.tsx', import.meta.url))

/** 假宿主：slots + locale.bind（最小结构，对齐 TaijiSectionHost）。 */
function fakeSectionHost() {
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
    locale: {
      // bind 的替身：直接查 zh 字典（宿主真身读当前激活语言，语义等价的求值面）
      bind(ns: string) {
        expect(ns).toBe(TAIJI_LOCALE_NS)
        return (key: string) => zh[key as keyof typeof zh]
      },
    },
  }
  return {
    host,
    registrations,
    /** 宿主 settings.section 声明就位（声明已存在则注入回调同步执行）。 */
    declare(key: string) {
      for (const callback of pending.get(key) ?? []) callback()
      pending.delete(key)
    },
  }
}

/** 假 controller（U3 装配层的替身；真身契约 = appearance-row.tsx 的 ThemeSelectionController）。 */
function fakeController(initial: ThemeId = 'xuan') {
  let current = initial
  const listeners = new Set<() => void>()
  const controller: ThemeSelectionController = {
    getThemeId: () => current,
    selectThemeId: (id) => {
      current = id
      for (const listener of listeners) listener()
    },
    subscribeThemeId: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
  return {
    controller,
    /** 外部换色（外观行点选 / U3 持久值播种）后广播。 */
    publish: (id: ThemeId) => {
      current = id
      for (const listener of listeners) listener()
    },
  }
}

interface SectionModule {
  TaijiSection: (props: Record<string, unknown>) => FakeElement
  installTaijiSection: (host: unknown, controller: unknown) => void
  TAIJI_SECTION_ID: string
  TAIJI_SECTION_ORDER: number
}

const loader = createTsxLoader()
const sectionModule = loader.load(SECTION_PATH) as unknown as SectionModule
const { TAIJI_SECTION_ID, TAIJI_SECTION_ORDER } = sectionModule

/** 装配并取回注入范围（宿主渲染机合成 props 的那一层）。 */
function assemble(host: ReturnType<typeof fakeSectionHost>, controller: ReturnType<typeof fakeController>) {
  sectionModule.installTaijiSection(host.host, controller.controller)
  host.declare('settings.section')
  expect(host.registrations).toHaveLength(1)
  const registration = host.registrations[0]
  const inject = registration.options.inject as (() => Record<string, unknown>) | undefined
  expect(typeof inject).toBe('function')
  return { registration, face: inject!() }
}

/** 渲染分区并返回元素全集（t 用 zh 字典求值，模拟宿主 locale 座位）。 */
function render(face: Record<string, unknown>) {
  const root = sectionModule.TaijiSection({
    t: (key: string) => zh[key as keyof typeof zh],
    close: () => {},
    ...face,
  })
  return { root, elements: collectElements(root) }
}

describe('installTaijiSection 注册契约', () => {
  it('注册进 settings.section：id 唯一、order 末位、label thunk、locale 命名空间、组件同一性', () => {
    const host = fakeSectionHost()
    const { registration } = assemble(host, fakeController())
    expect(registration.key).toBe('settings.section')
    expect(registration.options.id).toBe(TAIJI_SECTION_ID)
    // 不与宿主内置分区 id 相撞（general/account/models/plugins/agent-presets）
    expect(TAIJI_SECTION_ID).toBe('taiji')
    expect(registration.options.order).toBe(TAIJI_SECTION_ORDER)
    // 末位：大于宿主最高的 agent-presets（20）
    expect(TAIJI_SECTION_ORDER).toBeGreaterThan(20)
    // label 是 thunk 且求值得到产品名（宿主每次读取时求值，跟随激活语言）
    expect(typeof registration.options.label).toBe('function')
    expect((registration.options.label as () => string)()).toBe('太极')
    expect(registration.options.locale).toBe(TAIJI_LOCALE_NS)
    expect(registration.component).toBe(sectionModule.TaijiSection)
  })

  it('注入回调只取 controller 读方法：getThemeId / subscribeThemeId 透传，无 selectThemeId', () => {
    const host = fakeSectionHost()
    const controller = fakeController('qingmo')
    const { face } = assemble(host, controller)
    // 只读分享：状态页不该出现第二个换色写入口（写入口唯一 = 通用设置的外观行）
    expect(Object.keys(face).sort()).toEqual(['getThemeId', 'subscribeThemeId'])
    expect(face.getThemeId()).toBe('qingmo')
    // 订阅真的挂在 controller 上：外部换色广播后监听被调用
    let notified = 0
    const unsubscribe = (face.subscribeThemeId as (listener: () => void) => () => void)(() => {
      notified += 1
    })
    controller.publish('zhuyin')
    expect(notified).toBe(1)
    expect(face.getThemeId()).toBe('zhuyin')
    unsubscribe()
    controller.publish('xuan')
    expect(notified).toBe(1)
  })
})

describe('分区渲染', () => {
  it('标题「太极」+ 一句说明（本插件是什么）+ 当前配色行 + 指引行', () => {
    const host = fakeSectionHost()
    const { face } = assemble(host, fakeController('dailan'))
    const { root, elements } = render(face)
    expect(root.props['aria-label']).toBe('太极')
    const title = elements.find((element) => element.props.className === 'taiji-section-title')
    expect(textOf(title as FakeElement)).toBe('太极')
    const desc = elements.find((element) => element.props.className === 'taiji-section-desc')
    expect(textOf(desc as FakeElement)).toBe(zh['section.desc'])
    expect(zh['section.desc']).toContain('六套配色')
    const rowLabel = elements.find((element) => element.props.className === 'taiji-section-row-label')
    expect(textOf(rowLabel as FakeElement)).toBe('当前配色')
    const guide = elements.find((element) => element.props.className === 'taiji-section-guide')
    expect(textOf(guide as FakeElement)).toBe(zh['section.guide'])
  })

  it('指引文案锚定宿主真实导航名：通用设置 → 外观（与宿主 nav 标签同字面）', () => {
    // 宿主 General 分区 nav 标签 = 「通用设置」（ui-settings-general locales.ts general.nav），
    // 外观行标题 = 「外观」（宿主 settings.theme 同文）。指路文案必须写用户实际看得到的名字。
    expect(zh['section.guide']).toContain('通用设置')
    expect(zh['section.guide']).toContain('外观')
  })

  it('当前配色行：色名 = 当前 id 的中文名，色点 = 活品牌色变量', () => {
    const host = fakeSectionHost()
    const { face } = assemble(host, fakeController('nuanmo'))
    const { elements } = render(face)
    const name = elements.find((element) => element.props.className === 'taiji-section-current-name')
    expect(textOf(name as FakeElement)).toBe(resolveTheme('nuanmo').name)
    const dot = elementsWithClass(elements, 'taiji-section-dot')
    expect(dot).toHaveLength(1)
    expect(dot[0].props['aria-hidden']).toBe('true')
    // 活变量取色：呈现当前实际生效的强调色（U2 覆盖层换层后自动跟随），不是静态表取值
    expect((dot[0].props.style as { background: string }).background).toBe('var(--dsw-alias-brand-primary)')
  })

  it('换色后重渲染，色名跟随订阅源（玄 → 朱印）', () => {
    const host = fakeSectionHost()
    const controller = fakeController('xuan')
    const { face } = assemble(host, controller)
    const nameOf = () => {
      const { elements } = render(face)
      return textOf(elements.find((element) => element.props.className === 'taiji-section-current-name') as FakeElement)
    }
    expect(nameOf()).toBe('玄')
    controller.publish('zhuyin')
    expect(nameOf()).toBe('朱印')
  })
})
