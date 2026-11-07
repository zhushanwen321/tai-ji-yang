import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { collectElements, createTsxLoader, elementsWithClass, textOf, type FakeElement } from '../testing/load-tsx'
import { zh } from '../locale'
import { resolveTheme, resolveThemeTokens, type ThemeId } from '../theme/resolve'
import { THEME_IDS } from '../theme/tokens'
// 类型-only 引入（esbuild 整体擦除，不触发 Vite 对 .tsx 的模块解析）；运行值全部经测试
// 夹具装载——被测模块 import 了 'react'（宿主模块表供给，本仓 devDeps 没有），直接 import 会挂在
// 模块解析上（见 client/testing/load-tsx.ts 头部说明）。
import type { ThemePreference } from './appearance-row'

/**
 * 外观行单测（设计 §3.3.8 / D8；验收 V12 设置页表面不变量的可机器化部分）。
 *
 * V12 的五项里，②「标题为外观的行恰好一条 + 同屏三段模式与六色平铺」与 ⑤「三次开关后行集合
 * 不增不减」的真实宿主行为归 L3 场景；本层锁死它的机器可判部分：注册选项（id 同字面 /
 * priority 负值 / order < 10 = 遮蔽契约）、同屏两组控件、点击去向（模式 → 宿主偏好写入口；
 * 色块 → controller 换层+持久）、swatch 取哪一支（当前解析族）。
 */

const ROW_PATH = fileURLToPath(new URL('./appearance-row.tsx', import.meta.url))

/** 假宿主：slots + theme + on（最小结构，对齐 AppearanceRowHost）。 */
function fakeRowHost(initial: { preference: ThemePreference; scheme: 'light' | 'dark' } = { preference: 'system', scheme: 'dark' }) {
  const state = { preference: initial.preference, colorScheme: initial.scheme }
  const setThemeCalls: ThemePreference[] = []
  const themeListeners = new Set<() => void>()
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
      entries() {
        return []
      },
    },
    theme: {
      getTheme: () => ({ preference: state.preference, active: { colorScheme: state.colorScheme } }),
      setTheme: (id: ThemePreference) => {
        setThemeCalls.push(id)
      },
    },
    on(event: string, listener: () => void) {
      themeListeners.add(listener)
      return () => {
        themeListeners.delete(listener)
      }
    },
  }
  return {
    host,
    registrations,
    setThemeCalls,
    declare(key: string) {
      for (const callback of pending.get(key) ?? []) callback()
      pending.delete(key)
    },
    /** 切宿主状态并广播 theme/change（模拟宿主偏好切换 / 系统明暗翻转）。 */
    publish(next: { preference?: ThemePreference; scheme?: 'light' | 'dark' }) {
      if (next.preference !== undefined) state.preference = next.preference
      if (next.scheme !== undefined) state.colorScheme = next.scheme
      for (const listener of themeListeners) listener()
    },
  }
}

/** 假 controller（U3 装配层的替身：持有当前配色 + 记录点选）。 */
function fakeController(initial: ThemeId = 'xuan') {
  let current = initial
  const selections: ThemeId[] = []
  const listeners = new Set<() => void>()
  return {
    controller: {
      getThemeId: () => current,
      selectThemeId: (id: ThemeId) => {
        current = id
        selections.push(id)
        for (const listener of listeners) listener()
      },
      subscribeThemeId: (listener: () => void) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    },
    selections,
    /** 外部换色（如 U3 用持久值播种）后广播。 */
    publish: (id: ThemeId) => {
      current = id
      for (const listener of listeners) listener()
    },
  }
}

interface RowModule {
  AppearanceRow: (props: Record<string, unknown>) => FakeElement
  installAppearanceRow: (host: unknown, controller: unknown) => void
  APPEARANCE_ROW_ID: string
  APPEARANCE_ROW_ORDER: number
  APPEARANCE_ROW_PRIORITY: number
  SWATCH_TOKENS: readonly string[]
}

const loader = createTsxLoader()
const rowModule = loader.load(ROW_PATH) as unknown as RowModule
const { APPEARANCE_ROW_ID, APPEARANCE_ROW_ORDER, APPEARANCE_ROW_PRIORITY, SWATCH_TOKENS } = rowModule

/** 装配并取回注入范围（宿主渲染机合成 props 的那一层）。 */
function assemble(host: ReturnType<typeof fakeRowHost>, controller: ReturnType<typeof fakeController>) {
  rowModule.installAppearanceRow(host.host, controller.controller)
  host.declare('settings.general.item')
  expect(host.registrations).toHaveLength(1)
  const registration = host.registrations[0]
  const inject = registration.options.inject as (() => Record<string, unknown>) | undefined
  expect(typeof inject).toBe('function')
  return { registration, face: inject!() }
}

/** 渲染一行并返回元素全集。 */
function render(face: Record<string, unknown>) {
  const root = rowModule.AppearanceRow({ t: (key: string) => zh[key as keyof typeof zh], ...face })
  return collectElements(root)
}

describe('installAppearanceRow 遮蔽契约（D8）', () => {
  it('注册进 settings.general.item：id 与内置行同字面、priority 负值、order < 10', () => {
    const host = fakeRowHost()
    const controller = fakeController()
    const { registration } = assemble(host, controller)
    expect(registration.key).toBe('settings.general.item')
    expect(registration.options.id).toBe(APPEARANCE_ROW_ID)
    expect(APPEARANCE_ROW_ID).toBe('appearance') // 与宿主内置外观行同 id = 遮蔽的锚点
    expect(registration.options.priority).toBe(APPEARANCE_ROW_PRIORITY)
    expect(APPEARANCE_ROW_PRIORITY).toBeLessThan(0) // 压过内置行（内置未显式设，槽规则取 0）
    expect(registration.options.order).toBe(APPEARANCE_ROW_ORDER)
    expect(APPEARANCE_ROW_ORDER).toBeLessThan(10) // 小于内置行的 10
    expect(registration.options.locale).toBe('taiji.shell')
    expect(registration.component).toBe(rowModule.AppearanceRow)
  })

  it('注入范围：模式按钮写宿主偏好入口，读偏好/解析族经 theme 服务，订阅 theme/change', () => {
    const host = fakeRowHost({ preference: 'dark', scheme: 'light' })
    const controller = fakeController('qingmo')
    const { face } = assemble(host, controller)
    expect(face.getPreference()).toBe('dark')
    expect(face.getScheme()).toBe('light')
    ;(face.setPreference as (p: ThemePreference) => void)('system')
    expect(host.setThemeCalls).toEqual(['system'])
    // 订阅真的挂在宿主事件上：宿主广播后监听被调用
    let notified = 0
    const unsubscribe = (face.subscribeTheme as (listener: () => void) => () => void)(() => {
      notified += 1
    })
    host.publish({ preference: 'light' })
    expect(notified).toBe(1)
    unsubscribe()
    host.publish({ preference: 'dark' })
    expect(notified).toBe(1)
  })

  it('注入范围透传 controller（配色读/写/订阅都走 U3 装配层，本文件不碰持久）', () => {
    const host = fakeRowHost()
    const controller = fakeController('nuanmo')
    const { face } = assemble(host, controller)
    expect(face.getThemeId()).toBe('nuanmo')
    ;(face.selectThemeId as (id: ThemeId) => void)('zhuyin')
    expect(controller.selections).toEqual(['zhuyin'])
    let notified = 0
    const unsubscribe = (face.subscribeThemeId as (listener: () => void) => () => void)(() => {
      notified += 1
    })
    controller.publish('dailan')
    expect(notified).toBe(1)
    expect(face.getThemeId()).toBe('dailan')
    unsubscribe()
  })
})

describe('行内同屏：三段模式按钮 + 六色平铺（V12 ②）', () => {
  function renderDefault(host: ReturnType<typeof fakeRowHost>, controller: ReturnType<typeof fakeController>) {
    const { face } = assemble(host, controller)
    return render(face)
  }

  it('恰好三段模式按钮（浅色/深色/跟随系统），选中态跟随宿主偏好', () => {
    const host = fakeRowHost({ preference: 'system', scheme: 'dark' })
    const elements = renderDefault(host, fakeController())
    const modes = elementsWithClass(elements, 'taiji-appearance-mode')
    expect(modes).toHaveLength(3)
    expect(modes.map((mode) => textOf(mode))).toEqual(['浅色', '深色', '跟随系统'])
    expect(modes.map((mode) => mode.props['aria-pressed'])).toEqual([false, false, true])
  })

  it('恰好六枚色块（玄/黛蓝/暖墨/皓/青墨/朱印），选中态跟随当前配色', () => {
    const host = fakeRowHost({ preference: 'system', scheme: 'dark' })
    const elements = renderDefault(host, fakeController('dailan'))
    const swatches = elementsWithClass(elements, 'taiji-appearance-swatch')
    expect(swatches).toHaveLength(6)
    expect(swatches.map((swatch) => textOf(swatch))).toEqual(THEME_IDS.map((id) => resolveTheme(id).name))
    expect(swatches.map((swatch) => swatch.props['aria-pressed'])).toEqual([false, true, false, false, false, false])
  })

  it('两组控件同屏（同一行根下），标题为「外观」', () => {
    const host = fakeRowHost()
    const elements = renderDefault(host, fakeController())
    const modes = elementsWithClass(elements, 'taiji-appearance-mode')
    const swatches = elementsWithClass(elements, 'taiji-appearance-swatch')
    const title = elements.find((element) => element.props.className === 'taiji-appearance-title')
    expect(textOf(title as FakeElement)).toBe('外观')
    // 同屏 = 同一次渲染产出里两组都在（V12 ② 的两项特征同屏判定）
    expect(modes.length + swatches.length).toBe(9)
  })

  it('swatch 取当前解析族那一支：暗模式下取暗列（点了之后界面将呈现的值）', () => {
    const host = fakeRowHost({ preference: 'dark', scheme: 'dark' })
    const elements = renderDefault(host, fakeController('xuan'))
    const swatches = elementsWithClass(elements, 'taiji-appearance-swatch')
    const dots = elementsWithClass(collectElements(swatches[0]), 'taiji-appearance-swatch-dot')
    expect(dots).toHaveLength(SWATCH_TOKENS.length)
    const table = resolveThemeTokens('xuan')
    expect(dots.map((dot) => (dot.props.style as { background: string }).background)).toEqual(
      SWATCH_TOKENS.map((token) => table[token].dark),
    )
  })

  it('跨族色的当前支 = 族默认（皓在暗模式下与玄同支——事实的诚实呈现）', () => {
    const host = fakeRowHost({ preference: 'dark', scheme: 'dark' })
    const elements = renderDefault(host, fakeController('hao'))
    const swatches = elementsWithClass(elements, 'taiji-appearance-swatch')
    const dotOf = (index: number) =>
      elementsWithClass(collectElements(swatches[index]), 'taiji-appearance-swatch-dot').map(
        (dot) => (dot.props.style as { background: string }).background,
      )
    // 皓（index 3）与玄（index 0）在暗解析下同支
    expect(dotOf(3)).toEqual(dotOf(0))
    // 黛蓝（index 1）是暗族预设，与族默认不同支
    expect(dotOf(1)).not.toEqual(dotOf(0))
  })

  it('亮模式下取亮列：皓的 accent 是它的亮值 #43765d（不是暗值 #7fb89c）', () => {
    const host = fakeRowHost({ preference: 'light', scheme: 'light' })
    const elements = renderDefault(host, fakeController('hao'))
    const swatches = elementsWithClass(elements, 'taiji-appearance-swatch')
    const dots = elementsWithClass(collectElements(swatches[3]), 'taiji-appearance-swatch-dot')
    const backgrounds = dots.map((dot) => (dot.props.style as { background: string }).background)
    expect(backgrounds[0]).toBe('#43765d')
    expect(backgrounds[0]).not.toBe('#7fb89c')
  })
})

describe('点击去向', () => {
  it('模式按钮 → 宿主偏好写入口（theme.setTheme），且只写不臆测当前值', () => {
    const host = fakeRowHost({ preference: 'system', scheme: 'dark' })
    const controller = fakeController()
    const { face } = assemble(host, controller)
    const modes = elementsWithClass(render(face), 'taiji-appearance-mode')
    ;(modes[0].props.onClick as () => void)()
    ;(modes[2].props.onClick as () => void)()
    expect(host.setThemeCalls).toEqual(['light', 'system'])
  })

  it('色块 → controller.selectThemeId（换层 + 持久归 U3，行内不碰）', () => {
    const host = fakeRowHost({ preference: 'dark', scheme: 'dark' })
    const controller = fakeController('xuan')
    const { face } = assemble(host, controller)
    const swatches = elementsWithClass(render(face), 'taiji-appearance-swatch')
    ;(swatches[1].props.onClick as () => void)()
    expect(controller.selections).toEqual(['dailan'])
    // 点色不写宿主偏好（D2 方案 A：跨族不改写宿主偏好）
    expect(host.setThemeCalls).toEqual([])
  })

  it('controller 外部换色后重渲染，选中环跟着走（订阅通道生效）', () => {
    const host = fakeRowHost({ preference: 'dark', scheme: 'dark' })
    const controller = fakeController('xuan')
    const { face } = assemble(host, controller)
    const before = elementsWithClass(render(face), 'taiji-appearance-swatch')
    expect(before[0].props['aria-pressed']).toBe(true)
    controller.publish('qingmo')
    const after = elementsWithClass(render(face), 'taiji-appearance-swatch')
    expect(after[0].props['aria-pressed']).toBe(false)
    expect(after[4].props['aria-pressed']).toBe(true)
  })
})
