/**
 * client/sidebar/session-leading.tsx —— 会话行行首的太极鱼形微标。
 *
 * 注册进 `sidebar.session.row.leading`（kind=list、scope=root、inline，宿主
 * ui-workspace 的 Rows.tsx 在会话行的行首 16px 格子渲染）。宿主槽契约要点
 * （cordis-client-runner slot-catalog + ui-workspace/src/client/contract/slots.ts 侦查结论）：
 *   · 该格子与行自身状态点**互斥**——行处于忙碌态（待交互 / 新消息 / 生成中）时宿主渲染
 *     自家 SessionStatusDots，槽整体不渲染；槽 occupant 只在行的主状态为 idle 时挂载，
 *     构造上不会与状态点并排。归档行该格子恒空（槽与状态点都不渲染）；
 *   · 插件侧注册选项 = `{ id 必填, order?/label? 可选 }`——与本包 appearance-chip 所在的
 *     `conversation.input.left` 同形态；不设 priority（list 槽同 id 才遮蔽，私有 id 即追加）；
 *   · owner props 只有 `{ sessionId }`，本装饰与具体会话无关（每行同形），全忽略不接。
 *
 * 形态决策（taiji 侧侦查：SessionItemDisplay.vue）——**鱼形微标，不用圆点**：
 *   · taiji 会话行行首本身无装饰：7px 状态点在 2026-10-11 用户裁决后移到了右侧时间旁，
 *     标题贴左缩进。故本贡献不映射 taiji 既有元素，按任务 fallback 做「克制的太极特征装饰」；
 *   · 不取「accent 色点」而取鱼形：宿主该格子的既有语言全是圆点族（StateDot 10px 实/空
 *     圆、ongoing 14px spinner），纯圆点会与宿主状态点同形，被读成又一种状态语义；
 *     taiji 自家 accent 实心圆又恰是「未读」语义，撞两重。双鱼标是宿主没有的形状，
 *     只可能是品牌装饰，零语义冲突；几何直接复用 client/brand/mark.tsx 的
 *     TaijiBrandMark（几何禁止手改，单一来源）；
 *   · 「太极色」经 `var(--dsw-alias-brand-primary)` 取得——本包主题层换六色时该 token
 *     跟随，鱼即跟随当前配色（见 session-leading.css）；
 *   · 尺寸 12px：比宿主该格子的 14px 图标（时钟标/分支标）小一档，视觉层级更低，
 *     不喧宾夺主；16px 格子内放得下。
 *
 * 补位避让（「无 shipped occupant 时才补位」形态）：宿主 shipped occupant 两个——
 * ui-schedule 的 `schedule-mark`（order 10，idle 且有活跃定时任务时渲染 14px 时钟）与
 * 实验包 liveshare 的 `liveshare.fork`（order 默认 0，仅 viewer 页 fork 血缘行渲染）。
 * 时钟标与鱼同现（16px 格塞 14px+12px）会挤坏，故 CSS 让位：宿主渲染机给每个槽位包
 * `[data-slot="<key>"]` 锚（文档明言「the addressable seam dynamic styles target」），
 * 时钟标自带 `data-session-schedule-mark` 稳定标记——`:has()` 探到时钟标在场即隐藏鱼
 * （见 session-leading.css 的让位规则，零 JS、零宿主 import）。liveshare.fork 无稳定
 * data 标记（Tooltip 包裹，不可寻址）且仅存在于实验 viewer 页，不做让位、允许共现
 * （order 100 落在其右侧），证据留侦查报告。
 */
import { TaijiBrandMark } from '../brand/mark'

/** 本装饰注册的槽名（会话行行首 16px 装饰位）。 */
export const SESSION_LEADING_SLOT = 'sidebar.session.row.leading'

/** 槽内格子 id：本包私有 id（追加新格，不遮蔽宿主 shipped 条目）。 */
export const SESSION_LEADING_ID = 'taiji-session-leading'

/**
 * 排序位（升序，宿主 shipped：liveshare.fork 默认 0、schedule-mark 10）。
 * 取 100 与本包 appearance-chip 的 APPEARANCE_CHIP_ORDER 同值——落在宿主条目右侧的
 * 常规追加区段；与 schedule-mark 的共现已被 CSS 让位规则消除，次序仅在与
 * liveshare.fork 共现（实验 viewer 页）时决定左右，取右侧不抢占宿主信息位。
 */
export const SESSION_LEADING_ORDER = 100

/**
 * 鱼形微标边长（px）：比宿主格子内 14px 图标小一档（视觉让位）；几何量不是颜色，
 * 不入主题 token（与 appearance-chip 的 POPOVER_GAP 同口径）。
 */
export const SESSION_LEADING_MARK_SIZE = 12

/**
 * 本装饰用到的宿主 slots 面（最小结构类型，参照 client/input/appearance-chip.tsx 的
 * AppearanceChipHost 模式；不 import 任何 @deepseek-ai/dsh-client-* 包）。
 */
export interface SessionLeadingHost {
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

/** 宿主 standardProps 的占位类型（owner props 的 sessionId 与各 use* 钩子座位——全忽略不接）。 */
export type SessionLeadingProps = Record<string, unknown>

/**
 * 槽 occupant 壳组件：忽略宿主喂来的全部 props，渲染行首鱼形微标。
 *
 * 根元素带 `taiji-session-leading` 类（CSS 取色与让位规则的锚点）；装饰性图形
 * aria-hidden 由内层 TaijiBrandMark 自带（svg 上），根 span 不再重复。非交互元素：
 * 点击冒泡给宿主行自身（与行内标题同语义——整行都是打开会话的点击目标），不做
 * stopPropagation（宿主时钟标 stopPropagation 是「按标记不应触发换行」的指示器语义，
 * 纯装饰无此语义）。
 */
export function SessionLeadingSlot(_props: SessionLeadingProps) {
  return (
    <span className="taiji-session-leading">
      <TaijiBrandMark size={SESSION_LEADING_MARK_SIZE} />
    </span>
  )
}

/**
 * 装配会话行行首微标：注册进 `sidebar.session.row.leading`。
 *
 * U3 的 `client/apply.ts` 在装配期调用（接线留给主会话）。
 *
 * @param host - 宿主 slots 面。
 */
export function installSessionLeading(host: SessionLeadingHost): void {
  host.slots.inject(SESSION_LEADING_SLOT, () =>
    host.slots.register(
      { name: SESSION_LEADING_SLOT, id: SESSION_LEADING_ID, order: SESSION_LEADING_ORDER },
      SessionLeadingSlot,
    ),
  )
}
