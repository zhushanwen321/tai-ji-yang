/**
 * client/input/appearance-chip.tsx —— composer 工具行的配色快选 chip。
 *
 * 注册进 `conversation.input.left`（kind=list，composer 工具行左侧紧凑控件）。宿主槽契约
 * 要点（cordis-client-runner 的 slot-catalog）：
 *   · 注册选项 = `{ name, id, order, label }`——id 是本包私有格子（新格追加在宿主已有条目
 *     旁，不遮蔽任何内置条目，与外观行「同 id 遮蔽」是两种不同的占位策略）；label 支持
 *     string 或 thunk（每次投影重读，可跟随语言切换），本 chip 文案只有一个中文常量，
 *     用字符串即够；
 *   · 组件会被喂宿主 standardProps（useChat / useInput 等钩子座位）——本 chip 一项都不
 *     消费，注册的壳组件全忽略不接；
 *   · **弹层必须 portal 到 document.body**：宿主 catalog 明言 composer 卡含 overflow 容器，
 *     留在原地的 fixed 定位会被裁——用 react-dom 的 `createPortal`（react-dom 在宿主模块
 *     表基线内，见 scripts/check-require-baseline.mjs 的 BASELINE_MODULES）。
 *
 * 与外观行（settings/appearance-row.tsx）的分工：外观行是设置页的完整外观控制（三段模式
 * 按钮 + 六色平铺 + 名字标签）；本 chip 是 composer 内的紧凑快选——24px 色点按钮，点开弹
 * 六色圆点色卡（当前色品牌色描边），点选即换色。两处的点选都只经 controller 转交（换层 +
 * 持久归 U3 装配层），本文件不碰持久通道与覆盖层装配。
 *
 * 色点取色（2026-11-07 用户裁决「按族取本支」）：每色取本族那一支的 accent——
 * `THEME_TOKEN_TABLES[id]['--dsw-alias-brand-primary'][THEMES[id].family]`。直接全取 dark
 * 列会让玄/皓/青墨/朱印四个点同为 #7fb89c（亮族三色的 dark 列跨族回落到玄的暗值，见
 * tokens.ts 的 buildTable），紧凑色卡无名字标签时无法区分；按族取本支六色各不相同。色点
 * 是配色的「名义色相」标识，点选后界面实际呈现仍由宿主按当前 colorScheme 解析（跨族回落
 * 语义不变）。
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { THEMES, THEME_IDS, THEME_TOKEN_TABLES, type ThemeId } from '../theme/tokens'

/** 本 chip 注册的槽名（composer 工具行左侧紧凑控件）。 */
export const APPEARANCE_CHIP_SLOT = 'conversation.input.left'

/** 槽内格子 id：本包私有 id（追加新格，不与宿主内置条目同格）。 */
export const APPEARANCE_CHIP_ID = 'taiji-appearance'

/** 排序位（升序，宿主默认 0）：取宿主槽文档 example 的同值 100，落在宿主紧凑控件的常规区段。 */
export const APPEARANCE_CHIP_ORDER = 100

/** chip 的可访问名 / 悬停提示 / 注册 label（文案中文，任务约束）。 */
export const APPEARANCE_CHIP_LABEL = '太极配色'

/** 色点取色的 token：六色各自的名义色相（tokens.ts 的 brand-primary）。 */
const ACCENT_TOKEN = '--dsw-alias-brand-primary'

/** 弹层与按钮的间距（px；几何量不是颜色，不入主题 token）。 */
const POPOVER_GAP = 6

/**
 * 色点取色：每色取本族那一支的 accent（按族取本支，见文件头）。六个值都出自
 * THEME_TOKEN_TABLES 的常量表——是数据搬运，不是样式硬编码。
 */
export function accentColorOf(id: ThemeId): string {
  return THEME_TOKEN_TABLES[id][ACCENT_TOKEN][THEMES[id].family]
}

/**
 * 配色选择控制器（**类型自声明**，不 import appearance-row——参照 brand/mark.tsx 的
 * BrandSlotHost 最小结构类型模式 + client/apply.ts 的 ClientApplyContext 模式）：字段与
 * settings/appearance-row.tsx 的同名接口逐项一致，U3 装配层把同一个 controller 实例同时
 * 喂给外观行与本 chip（两处快选共享同一事实源与持久通道）。
 */
export interface ThemeSelectionController {
  /** 当前生效的配色 id（U3 持有；初值来自持久 Config）。 */
  getThemeId: () => ThemeId
  /** 用户点选配色：U3 换主题层 + 写 Config。 */
  selectThemeId: (id: ThemeId) => void
  /** 订阅配色变化（点选后色点即时跟随）。 */
  subscribeThemeId: (listener: () => void) => () => void
}

/**
 * 本 chip 用到的宿主 slots 面（最小结构类型；register 选项形状按 conversation.input.left
 * 的槽契约：id 必填、order/label 可选，无 priority 与 inject 机制）。
 */
export interface AppearanceChipHost {
  slots: {
    /** 等槽位声明出现后执行 callback（声明已存在则同步执行）；返回值是撤除回调。 */
    inject(key: string, callback: () => (() => void) | void): () => void
    /** 注册一个 list occupant（register 自挂 effect，卸载即撤除）。 */
    register(
      options: {
        name: string
        id: string
        order?: number
        label?: string | (() => string)
      },
      component: unknown,
    ): () => void
  }
}

/** 类名拼接（不引 clsx：宿主基线模块表里没有它，与 appearance-row.tsx 同一口径）。 */
const cx = (...names: (string | false | undefined)[]): string => names.filter(Boolean).join(' ')

/** 六色色卡 props：当前配色 + 点选回调（纯呈现与意图转发，不含开关态）。 */
export interface AppearanceChipPaletteProps {
  /** 当前选中的配色 id（当前色描边跟随）。 */
  themeId: ThemeId
  /** 点选一枚色点（chip 外壳在这里接 controller.selectThemeId 并收起弹层）。 */
  onSelect: (id: ThemeId) => void
}

/**
 * 渲染六色色卡：圆点横排的紧凑快选形态——无名字标签，色点带 title/aria-label 中文名兜底
 * 辨识；当前色用品牌色细环描边（对齐外观行选中环的做法，appearance-row.css 的
 * taiji-appearance-swatch-active）。
 */
export function AppearanceChipPalette({ themeId, onSelect }: AppearanceChipPaletteProps) {
  return (
    <div className="taiji-appearance-chip-palette" role="group" aria-label={APPEARANCE_CHIP_LABEL}>
      {THEME_IDS.map((id) => {
        const active = themeId === id
        return (
          <button
            key={id}
            type="button"
            className={cx('taiji-appearance-chip-swatch', active && 'taiji-appearance-chip-swatch-active')}
            aria-pressed={active}
            aria-label={THEMES[id].name}
            title={THEMES[id].name}
            onClick={() => { onSelect(id) }}
          >
            <span
              className="taiji-appearance-chip-swatch-dot"
              style={{ background: accentColorOf(id) }}
              aria-hidden="true"
            />
          </button>
        )
      })}
    </div>
  )
}

/** 宿主 standardProps 的占位类型（useChat / useInput 等钩子座位——本 chip 全忽略不接）。 */
export type AppearanceChipStandardProps = Record<string, unknown>

/** chip 本体 props：controller 经闭包注入（槽契约无 inject 机制，不能走 props 注入）。 */
export interface AppearanceChipProps {
  controller: ThemeSelectionController
}

/** 弹层锚点（打开瞬间按钮的视口几何，px）。 */
interface PopoverAnchor {
  top: number
  left: number
}

/**
 * chip 本体：24px 圆点按钮（当前配色的 accent 色点）+ 点开 portal 到 body 的六色色卡。
 *
 * 弹层关闭时机（两条，监听只在 open 期间挂载，关层即撤）：
 *   · 点击弹层与按钮之外（document mousedown——先于 click 触发，弹层内/按钮上的按下不关层：
 *     前者是正常点选，后者由按钮自己的 onClick 切换，避免一次按下被两处各处理一遍）；
 *   · Escape（document keydown）。
 */
export function AppearanceChip({ controller }: AppearanceChipProps) {
  // 当前配色经 controller 订阅：本 chip 与外观行任一处换色，两处色点都即时跟随
  const themeId = useSyncExternalStore(controller.subscribeThemeId, controller.getThemeId, controller.getThemeId)
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<PopoverAnchor | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)

  // 打开时取锚点：按钮 getBoundingClientRect 的视口坐标，弹层 position:fixed 直接消费
  const togglePopover = () => {
    if (open) {
      setOpen(false)
      return
    }
    const rect = buttonRef.current?.getBoundingClientRect()
    setAnchor(rect ? { top: rect.bottom + POPOVER_GAP, left: rect.left } : { top: 0, left: 0 })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (popoverRef.current?.contains(target)) return
      if (buttonRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // 点选：换色 + 收起弹层（紧凑快选的预期交互——选完即走）
  const handleSelect = (id: ThemeId) => {
    controller.selectThemeId(id)
    setOpen(false)
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="taiji-appearance-chip"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={APPEARANCE_CHIP_LABEL}
        title={APPEARANCE_CHIP_LABEL}
        onClick={togglePopover}
      >
        <span
          className="taiji-appearance-chip-dot"
          style={{ background: accentColorOf(themeId) }}
          aria-hidden="true"
        />
      </button>
      {/* 关态不渲染弹层：不建 portal、不读 document（宿主 overflow 裁剪与测试夹具的无 DOM
          环境都不被触碰）；锚点坐标是打开瞬间的快照，不随滚动跟随（composer 滚动时收起重开） */}
      {open && anchor !== null
        ? createPortal(
            <div
              ref={popoverRef}
              className="taiji-appearance-chip-popover"
              style={{ top: anchor.top, left: anchor.left }}
            >
              <AppearanceChipPalette themeId={themeId} onSelect={handleSelect} />
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

/**
 * 造注册用壳组件：闭包携带 controller（槽契约没有 inject 机制，controller 无法经宿主渲染机
 * 注入 props），宿主喂来的 standardProps 全忽略不接。
 *
 * @param controller - 配色选择控制器（U3 提供：换层 + 持久 + 初值）。
 * @returns 可直接注册进槽的函数组件（渲染委托给 {@link AppearanceChip}）。
 */
export function createAppearanceChip(controller: ThemeSelectionController) {
  return function AppearanceChipSlot(_standardProps: AppearanceChipStandardProps) {
    return <AppearanceChip controller={controller} />
  }
}

/**
 * 装配配色 chip：注册进 `conversation.input.left`。
 *
 * U3 的 `client/apply.ts` 在装配期调用（controller 传给外观行的同一个实例）。
 *
 * @param host - 宿主 slots 面。
 * @param controller - 配色选择控制器（U3 提供：换层 + 持久 + 初值）。
 */
export function installAppearanceChip(host: AppearanceChipHost, controller: ThemeSelectionController): void {
  host.slots.inject(APPEARANCE_CHIP_SLOT, () =>
    host.slots.register(
      {
        name: APPEARANCE_CHIP_SLOT,
        id: APPEARANCE_CHIP_ID,
        order: APPEARANCE_CHIP_ORDER,
        label: APPEARANCE_CHIP_LABEL,
      },
      createAppearanceChip(controller),
    ),
  )
}
