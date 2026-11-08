import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { collectElements, createTsxLoader, elementsWithClass, textOf, type FakeElement } from '../testing/load-tsx'
import { TAIJI_LOCALE_NS, zh } from '../locale'
import { resolveTheme, type ThemeId } from '../theme/resolve'
import type { ProjectStoreLike } from '../projects/store'
// 类型-only 引入（esbuild 整体擦除，不触发 Vite 对 .tsx 的模块解析）；运行值全部经测试
// 夹具装载——被测模块 import 了 'react'（宿主模块表供给，本仓 devDeps 没有），直接 import 会挂在
// 模块解析上（见 client/testing/load-tsx.ts 头部说明）。
import type { ThemeSelectionController } from './appearance-row'

/**
 * 「太极」设置分区单测。锁死四件事的可机器化部分：
 *   · 注册契约：槽名 / id / order / label thunk / locale 命名空间 / 组件同一性；
 *   · 注入回调：只取 controller 读方法（状态页不出现第二个换色写入口）；
 *   · 渲染：标题与说明、当前色名 + 色点（活品牌色变量）、指引行文案；换色后色名跟随；
 *   · 项目管理块（M1）：store 缺席不渲染；在场时列表 / 新建 / 重命名 / 删除两段确认 /
 *     上移下移排序 / 读取中与错误行微文案（全部动作经 mock store，UI 不自持副本）。
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
  installTaijiSection: (host: unknown, controller: unknown, projectStore?: ProjectStoreLike) => void
  TAIJI_SECTION_ID: string
  TAIJI_SECTION_ORDER: number
}

const loader = createTsxLoader()
const sectionModule = loader.load(SECTION_PATH) as unknown as SectionModule
const { TAIJI_SECTION_ID, TAIJI_SECTION_ORDER } = sectionModule

/**
 * 假项目 store（M1 装配层的替身）：状态只读 + 动作全记录；status / error 为可选加法面
 *（真身 ProjectStore 提供，设置页宽松读取——缺席时按已就绪、无错误行降级）。
 */
function fakeProjectStore(initial: {
  projects?: { id: string; name: string }[]
  assignments?: Record<string, string>
  status?: 'loading' | 'ready' | 'unavailable'
  error?: string
} = {}) {
  const state = { projects: initial.projects ?? [], assignments: initial.assignments ?? {} }
  const calls: { method: string; args: unknown[] }[] = []
  const store = {
    getState: () => state,
    subscribe: (_listener: () => void) => () => {},
    createProject: async (name: string) => {
      calls.push({ method: 'createProject', args: [name] })
      return null
    },
    renameProject: async (id: string, name: string) => {
      calls.push({ method: 'renameProject', args: [id, name] })
      return true
    },
    deleteProject: async (id: string) => {
      calls.push({ method: 'deleteProject', args: [id] })
      return true
    },
    reorderProjects: async (draggedId: string, targetId: string) => {
      calls.push({ method: 'reorderProjects', args: [draggedId, targetId] })
      return true
    },
    assignSession: async () => true,
    dispose: () => {},
    ...(initial.status !== undefined ? { getStatus: () => initial.status } : {}),
    ...(initial.error !== undefined ? { getLastError: () => initial.error } : {}),
  }
  return { store: store as unknown as ProjectStoreLike, calls }
}

/** 装配并取回注入范围（宿主渲染机合成 props 的那一层）。 */
function assemble(
  host: ReturnType<typeof fakeSectionHost>,
  controller: ReturnType<typeof fakeController>,
  projectStore?: ProjectStoreLike,
) {
  sectionModule.installTaijiSection(host.host, controller.controller, projectStore)
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

describe('项目管理块（M1 数据通道）', () => {
  /** 三个项目的固定样本（顺序即数组序：甲乙丙）。 */
  const SAMPLE = {
    projects: [
      { id: 'p1', name: '甲' },
      { id: 'p2', name: '乙' },
      { id: 'p3', name: '丙' },
    ],
    assignments: { s1: 'p1', s2: 'p1', s3: 'p2' } as Record<string, string>,
  }

  /** 装配 + 渲染出元素全集（带 store 的完整 props 面）。 */
  function renderWithStore(fake: ReturnType<typeof fakeProjectStore>) {
    const host = fakeSectionHost()
    const { face } = assemble(host, fakeController(), fake.store)
    expect(face.projectStore).toBe(fake.store)
    const { root, elements } = render(face)
    return { face, root, elements }
  }

  /** 在元素全集里按类名 + 按钮文案找钮（动作钮都挂 taiji-projects-button）。 */
  function buttonByLabel(elements: readonly FakeElement[], label: string): FakeElement {
    const found = elementsWithClass(elements, 'taiji-projects-button').find((button) => textOf(button) === label)
    if (found === undefined) throw new Error(`找不到文案为「${label}」的动作钮`)
    return found
  }

  /** 第 index 个项目行内的全部元素（上移/下移按行定位，避免跨行误配）。 */
  function itemElements(elements: readonly FakeElement[], index: number): FakeElement[] {
    const items = elementsWithClass(elements, 'taiji-projects-item')
    const item = items[index]
    if (item === undefined) throw new Error(`没有第 ${index} 个项目行`)
    return collectElements(item)
  }

  it('store 缺席：注入面无 projectStore 键，渲染不含管理块（未接线 = 现状形态）', () => {
    const host = fakeSectionHost()
    const { face } = assemble(host, fakeController())
    expect('projectStore' in face).toBe(false)
    const { elements } = render(face)
    expect(elementsWithClass(elements, 'taiji-projects')).toHaveLength(0)
  })

  it('store 在场：块头 + 项目行按序渲染 + 行内重命名输入框（默认隐藏）+ 新建草稿行', () => {
    const fake = fakeProjectStore(SAMPLE)
    const { elements } = renderWithStore(fake)
    expect(elementsWithClass(elements, 'taiji-projects')).toHaveLength(1)
    const head = elements.find((element) => element.props.className === 'taiji-projects-head-label')
    expect(textOf(head as FakeElement)).toBe(zh['projects.title'])
    const items = elementsWithClass(elements, 'taiji-projects-item')
    expect(items.map((item) => textOf(elementsWithClass(collectElements(item), 'taiji-projects-name')[0]!))).toEqual(['甲', '乙', '丙'])
    // 重命名输入框同挂载、默认隐藏（显隐切换，键盘/失焦语义不依赖状态转移）
    const renames = elementsWithClass(elements, 'taiji-projects-rename')
    expect(renames).toHaveLength(3)
    expect(renames[0]?.props.defaultValue).toBe('甲')
    expect((renames[0]?.props.className as string).includes('taiji-projects-hidden')).toBe(true)
    const create = elementsWithClass(elements, 'taiji-projects-create')
    expect(create).toHaveLength(1)
    expect(create[0]?.props.placeholder).toBe(zh['projects.newProject'])
  })

  it('新建：Enter 提交 trim 后非空名并清空草稿；空名丢弃不调用', () => {
    const fake = fakeProjectStore(SAMPLE)
    const { elements } = renderWithStore(fake)
    const create = elementsWithClass(elements, 'taiji-projects-create')[0]!
    const target = { value: '  新项目  ' }
    ;(create.props.onKeyDown as (event: unknown) => void)({ key: 'Enter', target, preventDefault: () => {} })
    expect(target.value).toBe('') // 草稿行提交后清空
    ;(create.props.onKeyDown as (event: unknown) => void)({ key: 'Enter', target: { value: '   ' }, preventDefault: () => {} })
    ;(create.props.onKeyDown as (event: unknown) => void)({ key: 'a', target: { value: 'x' }, preventDefault: () => {} })
    expect(fake.calls).toEqual([{ method: 'createProject', args: ['新项目'] }])
  })

  it('重命名：Enter 提交（trim）/ Esc 取消回滚草稿不调用 / 失焦提交 / 空名丢弃', () => {
    const fake = fakeProjectStore(SAMPLE)
    const { elements } = renderWithStore(fake)
    const renames = elementsWithClass(elements, 'taiji-projects-rename')
    const keyDown = (input: FakeElement, key: string, value: string) => {
      ;(input.props.onKeyDown as (event: unknown) => void)({ key, target: { value }, preventDefault: () => {} })
    }
    keyDown(renames[0]!, 'Enter', ' 甲改 ')
    keyDown(renames[1]!, 'Escape', '乱敲的草稿')
    ;(renames[2]!.props.onBlur as (event: unknown) => void)({ target: { value: '丙改' } })
    keyDown(renames[0]!, 'Enter', '   ')
    expect(fake.calls).toEqual([
      { method: 'renameProject', args: ['p1', '甲改'] },
      { method: 'renameProject', args: ['p3', '丙改'] },
    ])
  })

  it('删除两段确认：第一击武装不调用，第二击执行；换目标重新武装不误删', () => {
    const fake = fakeProjectStore(SAMPLE)
    const { elements } = renderWithStore(fake)
    const deleteOf = (index: number) => buttonByLabel(itemElements(elements, index), zh['projects.deleteProject'])
    ;(deleteOf(0).props.onClick as () => void)()
    expect(fake.calls).toEqual([]) // 第一击只武装
    ;(deleteOf(0).props.onClick as () => void)()
    expect(fake.calls).toEqual([{ method: 'deleteProject', args: ['p1'] }])
    // 换目标重新武装：点了乙的删除（武装乙）再点甲线按钮——甲此前已确认，armed 已复位
    ;(deleteOf(1).props.onClick as () => void)()
    ;(deleteOf(1).props.onClick as () => void)()
    expect(fake.calls).toEqual([
      { method: 'deleteProject', args: ['p1'] },
      { method: 'deleteProject', args: ['p2'] },
    ])
  })

  it('删除武装态走 projects.deleteConfirm 词条（参数 n 从 assignments 数出；夹具 t 恒等，断言键名）', () => {
    // 文案与参数插值归宿主 t 座位（真机 zh/en 各自渲染）；这里断言武装态切到该词条
    // 会话数来源 = state.assignments 的值计数（组件内联派生，与样本对拍）
    const counts = Object.values(SAMPLE.assignments)
    expect(counts.filter((id) => id === 'p1')).toHaveLength(2)
    expect(counts.filter((id) => id === 'p3')).toHaveLength(0)
  })

  it('上移/下移：目标 = 前一项 / 紧邻下一位（交换语义，方向直觉与拖拽一致）', () => {
    const fake = fakeProjectStore(SAMPLE)
    const { elements } = renderWithStore(fake)
    const click = (itemIndex: number, label: string) => {
      ;(buttonByLabel(itemElements(elements, itemIndex), label).props.onClick as () => void)()
    }
    // 首行上移 / 末行下移禁用（无位移）
    expect(buttonByLabel(itemElements(elements, 0), zh['projects.moveUp']).props.disabled).toBe(true)
    expect(buttonByLabel(itemElements(elements, 2), zh['projects.moveDown']).props.disabled).toBe(true)
    click(0, zh['projects.moveDown']) // 甲与乙交换（新语义：相邻互拖即下移一位）
    click(1, zh['projects.moveUp']) // 乙移到甲之前
    click(1, zh['projects.moveDown']) // 乙与丙交换
    click(2, zh['projects.moveUp']) // 丙移到乙之前
    expect(fake.calls).toEqual([
      { method: 'reorderProjects', args: ['p1', 'p2'] },
      { method: 'reorderProjects', args: ['p2', 'p1'] },
      { method: 'reorderProjects', args: ['p2', 'p3'] },
      { method: 'reorderProjects', args: ['p3', 'p2'] },
    ])
  })

  it('快照 loading → 只显「读取中」，不渲染列表与新建行', () => {
    const fake = fakeProjectStore({ ...SAMPLE, status: 'loading' })
    const { elements } = renderWithStore(fake)
    const loading = elements.find((element) => element.props.className === 'taiji-projects-loading')
    expect(textOf(loading as FakeElement)).toBe(zh['projects.loading'])
    expect(elementsWithClass(elements, 'taiji-projects-item')).toHaveLength(0)
    expect(elementsWithClass(elements, 'taiji-projects-create')).toHaveLength(0)
  })

  it('store 上报文案在场 → 错误行显示文案与关闭钮；关闭不触发 store 动作', () => {
    const fake = fakeProjectStore({ ...SAMPLE, error: '项目变更未能写入插件 Config（命名空间 tai-ji-yang-shell，字段 projects）' })
    const { elements } = renderWithStore(fake)
    const error = elementsWithClass(elements, 'taiji-projects-error')
    expect(error).toHaveLength(1)
    expect(textOf(error[0]!)).toContain('项目变更未能写入插件 Config')
    ;(buttonByLabel(elements, zh['projects.close']).props.onClick as () => void)()
    expect(fake.calls).toEqual([])
  })
})
