import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { collectElements, createTsxLoader, elementsWithClass, type FakeElement } from '../testing/load-tsx'
import { THEMES, THEME_IDS, THEME_TOKEN_TABLES, type ThemeId } from '../theme/tokens'

/**
 * 配色 chip 单测（client/input/appearance-chip.tsx）。
 *
 * 锁死机器可判部分：注册选项字面值（槽名/id/order/label）、chip 本体色点取色（按族取本支，
 * 2026-11-07 用户裁决）、六色色卡渲染自 THEME_TOKEN_TABLES、点选 → controller.selectThemeId、
 * 注册壳对 standardProps 的忽略与委托。
 *
 * 不在本层断言（测试夹具是单次渲染语义，见 client/testing/load-tsx.ts 头部边界）：弹层
 * 开关的真实交互（useState 更新、document 外点/Escape 监听、portal 挂 body）归 L3 真实宿主
 * 场景——组件侧已按「关态不建 portal、不读 document」组织，单次渲染路径零 DOM 依赖。
 */

const CHIP_PATH = fileURLToPath(new URL('./appearance-chip.tsx', import.meta.url))

/** 色点取色的 token 名（与被测模块的 ACCENT_TOKEN 同字面；断言直接读真表对账）。 */
const ACCENT_TOKEN = '--dsw-alias-brand-primary'

/** 假宿主：slots.inject/register（对齐 AppearanceChipHost 的最小结构）。 */
function fakeChipHost() {
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
    declare(key: string) {
      for (const callback of pending.get(key) ?? []) callback()
      pending.delete(key)
    },
  }
}

/** 假 controller（U3 装配层的替身：持有当前配色 + 记录点选；与外观行测试同形态）。 */
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
    /** 外部换色（如 U3 用持久值播种 / 外观行点选）后广播。 */
    publish: (id: ThemeId) => {
      current = id
      for (const listener of listeners) listener()
    },
  }
}

interface ChipModule {
  AppearanceChip: (props: { controller: unknown }) => FakeElement
  AppearanceChipPalette: (props: Record<string, unknown>) => FakeElement
  createAppearanceChip: (controller: unknown) => (props: Record<string, unknown>) => FakeElement
  installAppearanceChip: (host: unknown, controller: unknown) => void
  APPEARANCE_CHIP_SLOT: string
  APPEARANCE_CHIP_ID: string
  APPEARANCE_CHIP_ORDER: number
  APPEARANCE_CHIP_LABEL: string
  accentColorOf: (id: ThemeId) => string
}

const loader = createTsxLoader()
const chipModule = loader.load(CHIP_PATH) as unknown as ChipModule
const { APPEARANCE_CHIP_SLOT, APPEARANCE_CHIP_ID, APPEARANCE_CHIP_ORDER, APPEARANCE_CHIP_LABEL } = chipModule

/** 装配（声明槽位出现）并取回唯一一条注册。 */
function assemble(host: ReturnType<typeof fakeChipHost>, controller: ReturnType<typeof fakeController>) {
  chipModule.installAppearanceChip(host.host, controller.controller)
  host.declare(APPEARANCE_CHIP_SLOT)
  expect(host.registrations).toHaveLength(1)
  return host.registrations[0]
}

/** 渲染 chip 本体并返回元素全集。 */
function renderChip(controller: ReturnType<typeof fakeController>) {
  return collectElements(chipModule.AppearanceChip({ controller: controller.controller }))
}

/** 取元素的背景色（色点断言用）。 */
const backgroundOf = (dot: FakeElement): string => (dot.props.style as { background: string }).background

describe('installAppearanceChip 注册契约', () => {
  it('注册进 conversation.input.left：选项字面值与宿主 example 同形态（私有 id，不遮蔽内置条目）', () => {
    const host = fakeChipHost()
    const registration = assemble(host, fakeController())
    expect(registration.key).toBe(APPEARANCE_CHIP_SLOT)
    expect(APPEARANCE_CHIP_SLOT).toBe('conversation.input.left')
    // 整对象对账：四键且只有四键——不设 priority（不遮蔽）、不设 locale/inject（该槽无此机制）
    expect(registration.options).toEqual({
      name: 'conversation.input.left',
      id: 'taiji-appearance',
      order: 100,
      label: '太极配色',
    })
    expect(registration.options.id).toBe(APPEARANCE_CHIP_ID)
    expect(registration.options.order).toBe(APPEARANCE_CHIP_ORDER)
    expect(registration.options.label).toBe(APPEARANCE_CHIP_LABEL)
    expect(typeof registration.component).toBe('function')
  })

  it('注册组件是忽略 standardProps 的壳：渲染委托给 AppearanceChip（controller 闭包携带）', () => {
    const host = fakeChipHost()
    const controller = fakeController('hao')
    const registration = assemble(host, controller)
    const shell = (registration.component as (props: Record<string, unknown>) => FakeElement)({
      useChat: '宿主钩子座位（应被忽略不接）',
    })
    expect(shell.type).toBe(chipModule.AppearanceChip)
    // 委托真的发生：壳产出的组件元素再执行一次，树里有 chip 按钮与当前色色点
    const tree = collectElements((shell.type as (props: unknown) => FakeElement)(shell.props))
    expect(elementsWithClass(tree, 'taiji-appearance-chip')).toHaveLength(1)
    expect(backgroundOf(elementsWithClass(tree, 'taiji-appearance-chip-dot')[0])).toBe('#43765d')
  })
})

describe('chip 本体（关态初始渲染）', () => {
  it('24px 圆点按钮呈现当前配色的 accent 色点（黛蓝 = #8b9cc8，按族取本支）', () => {
    const elements = renderChip(fakeController('dailan'))
    const buttons = elementsWithClass(elements, 'taiji-appearance-chip')
    expect(buttons).toHaveLength(1)
    expect(buttons[0].props['aria-label']).toBe('太极配色')
    expect(buttons[0].props['aria-expanded']).toBe(false)
    const dots = elementsWithClass(elements, 'taiji-appearance-chip-dot')
    expect(dots).toHaveLength(1)
    expect(backgroundOf(dots[0])).toBe('#8b9cc8')
  })

  it('关态不渲染弹层（无 popover 元素——关态路径零 DOM 依赖）', () => {
    const elements = renderChip(fakeController())
    expect(elementsWithClass(elements, 'taiji-appearance-chip-popover')).toHaveLength(0)
    expect(elementsWithClass(elements, 'taiji-appearance-chip-palette')).toHaveLength(0)
  })

  it('controller 外部换色后重渲染，色点跟着走（订阅通道生效，与外观行同一事实源）', () => {
    const controller = fakeController('xuan')
    expect(backgroundOf(elementsWithClass(renderChip(controller), 'taiji-appearance-chip-dot')[0])).toBe('#7fb89c')
    controller.publish('zhuyin')
    expect(backgroundOf(elementsWithClass(renderChip(controller), 'taiji-appearance-chip-dot')[0])).toBe('#9c4335')
  })
})

describe('六色色卡（AppearanceChipPalette）', () => {
  it('恰好六枚色点，填充色逐色取自 THEME_TOKEN_TABLES 的本族支', () => {
    const palette = chipModule.AppearanceChipPalette({ themeId: 'xuan', onSelect: () => {} })
    const elements = collectElements(palette)
    const swatches = elementsWithClass(elements, 'taiji-appearance-chip-swatch')
    const dots = elementsWithClass(elements, 'taiji-appearance-chip-swatch-dot')
    expect(swatches).toHaveLength(THEME_IDS.length)
    expect(dots).toHaveLength(THEME_IDS.length)
    // 与真表直接对账（不经 accentColorOf 转手）：渲染值 = 表内本族支的常量值
    expect(dots.map(backgroundOf)).toEqual(
      THEME_IDS.map((id) => THEME_TOKEN_TABLES[id][ACCENT_TOKEN][THEMES[id].family]),
    )
    // 按族取本支的裁决判据：六色六值各不相同（全取 dark 列会四色同值）
    expect(new Set(dots.map(backgroundOf)).size).toBe(THEME_IDS.length)
  })

  it('色点带中文名（title/aria-label，紧凑形态无文字标签的辨识兜底）', () => {
    const swatches = elementsWithClass(
      collectElements(chipModule.AppearanceChipPalette({ themeId: 'xuan', onSelect: () => {} })),
      'taiji-appearance-chip-swatch',
    )
    expect(swatches.map((swatch) => swatch.props.title)).toEqual(THEME_IDS.map((id) => THEMES[id].name))
    expect(swatches[0].props['aria-label']).toBe('玄')
  })

  it('当前色描边：选中态跟随当前配色（aria-pressed + 选中类）', () => {
    const elements = collectElements(chipModule.AppearanceChipPalette({ themeId: 'qingmo', onSelect: () => {} }))
    const swatches = elementsWithClass(elements, 'taiji-appearance-chip-swatch')
    expect(swatches.map((swatch) => swatch.props['aria-pressed'])).toEqual([false, false, false, false, true, false])
    const active = elementsWithClass(elements, 'taiji-appearance-chip-swatch-active')
    expect(active).toHaveLength(1)
    expect(active[0].props['aria-label']).toBe('青墨')
  })

  it('点选色点 → onSelect(该色 id)（chip 外壳把它接给 controller.selectThemeId）', () => {
    const controller = fakeController('xuan')
    const swatches = elementsWithClass(
      collectElements(
        chipModule.AppearanceChipPalette({ themeId: 'xuan', onSelect: controller.controller.selectThemeId }),
      ),
      'taiji-appearance-chip-swatch',
    )
    ;(swatches[5].props.onClick as () => void)()
    ;(swatches[2].props.onClick as () => void)()
    expect(controller.selections).toEqual(['zhuyin', 'nuanmo'])
  })
})

describe('accentColorOf 取色规则（按族取本支，2026-11-07 裁决）', () => {
  it('暗族三色取 dark 列、亮族三色取 light 列——六色各不相同', () => {
    expect(chipModule.accentColorOf('xuan')).toBe('#7fb89c')
    expect(chipModule.accentColorOf('dailan')).toBe('#8b9cc8')
    expect(chipModule.accentColorOf('nuanmo')).toBe('#cbbc93')
    expect(chipModule.accentColorOf('hao')).toBe('#43765d')
    expect(chipModule.accentColorOf('qingmo')).toBe('#356b7a')
    expect(chipModule.accentColorOf('zhuyin')).toBe('#9c4335')
    // 亮族绝不回落到玄的暗值（全取 dark 列的退化形态）
    expect(chipModule.accentColorOf('hao')).not.toBe(chipModule.accentColorOf('xuan'))
  })
})
