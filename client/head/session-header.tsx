/**
 * client/head/session-header.tsx —— taiji 式会话头：状态图标 occupant + 四态派生。
 *
 * 架构裁决（为什么不整槽替换 `conversation.session.header`）：宿主槽位的 renderSlot 座位
 * 只注入给**自带 children 声明的注册项**（ui-renderer/scoped-slots.tsx 的 standardKit：'
 * entry.children !== undefined' 才发 renderSlot），而子槽一个槽只许一个声明者（ui-slots
 * 「declaring an already-declared child key throws」）——utilities（「打开方式」按钮所在）
 * 与 corner（右侧栏开关）的声明权在宿主 ui-conversation 手里。整槽替换的占用者拿不到
 * renderSlot，这两个子槽就再也渲染不出来 = 换头丢按钮（用户硬性要求保留打开方式）。
 * 故采用「宿主 DOM 保留 + 全局 CSS 重塑（session-header.css）+ 本文件向 actions 槽增补
 * taiji 的 13px 状态图标」的组合：
 *
 *   · **CSS 重塑**（session-header.css，taiji 逐值对照注释在彼处）：40px 单行、标题
 *     排版、第二行标签页压成 taiji 分段控件并归位右簇、More ⋯ 隐藏（taiji 无 more 菜单，
 *     其独有项——重命名/归档/打开方式子菜单——在侧栏行与 utilities 按钮里都有等价入口）；
 *   · **本 occupant**：注册进 `conversation.session.header.actions`（list 槽，多占用者
 *     合法共存——宿主 AgentPresetLabel 也在其中），经 CSS 的 flex order 排到会话名左侧，
 *     对齐 taiji 的「[状态图标][会话名]」行首形态（taiji PanelHeader.vue:75-91）。
 *
 * 状态语义 = taiji sessionStatus.ts 的 9 态按本包四态收敛（判据序照 client/projects/derive.ts
 * 的 rowStateOf：待交互 > 运行 > 完成未读 > idle）：run → refresh/accent 旋转、wait →
 * wrench/warn、done → check/accent、idle → 不渲染（taiji 无 idle 占位，会话名随行左对齐）。
 *
 * 注册形态：list 槽无需优先级避让（多占用者合法），priority 取 **-1** 排在默认 0 的
 * AgentPresetLabel 之前（本图标是行首语素，应先于预设标签）；list 槽无同格冲突抛错路径
 * （抛错仅限 keyed 槽同 key 同优先级），无避让失败分支。
 *
 * props 契约（槽渲染时框架注入，宽松读取、缺席降级，不 throw）：
 *   · sessionId：session 标准座位；缺席或查不到会话 → 图标不渲染；
 *   · useSessions / useSessionStatus：GlobalStandardProps 数据钩子（AgentPresetLabel 同款
 *     注入面）；缺席时用模块级稳定函数兜底（hook 调用序恒定，模式照 browser.tsx）。
 */
import type {
  SessionListLike,
  SessionStatusLike,
  SessionSummaryLike,
  StatusMapLike,
} from '../projects/derive'

// ── 槽位注册 ─────────────────────────────────────────────────────────────────────

/** 状态图标注册的槽名（宿主 ui-conversation 声明的会话头标题旁动作列表，list / scope session）。 */
export const SESSION_STATUS_ICON_SLOT = 'conversation.session.header.actions'

/** 本图标在 list 里的优先级：-1 排在默认 0 的 AgentPresetLabel 之前（行首语素先渲染）。 */
export const SESSION_STATUS_ICON_PRIORITY = -1

/** list 槽条目身份（宿主 register 对缺 id 的 list 注册直接 throw——实装探针实证）。 */
export const SESSION_STATUS_ICON_ID = 'taiji-status-icon'

/** 本图标用到的宿主 slots 面（最小结构类型；不 import 任何 @deepseek-ai/* 包，D3）。 */
export interface SessionStatusIconHost {
  slots: {
    /**
     * 等槽位声明出现后执行 callback（声明已存在则同步执行）；callback 返回 disposer 或空。
     * 声明生命周期结束时反序执行 disposer——注册随之撤除（V5 槽位贡献撤销）。
     */
    inject(key: string, callback: () => (() => void) | void): () => void
    /** 注册一个 occupant（register 自身把 disposer 挂进调用者的 ctx.effect）。 */
    register(
      options: { name: string; id?: string; priority?: number },
      component: unknown,
    ): () => void
  }
}

// ── 会话状态四态（派生 + 图标映射，均纯函数可直测）───────────────────────────────

/** 会话头状态四态（优先级 = 宿主 Rows.tsx 展示序：待交互 > 运行 > 完成未读 > idle）。 */
export type HeaderStatus = 'idle' | 'wait' | 'run' | 'done'

/**
 * 待交互 kind 白名单——与 client/projects/derive.ts 的 PENDING_INTERACTION_KINDS 同集
 * （宿主 visiblePendingKind 同判）。derive.ts 未导出该常量，故就地重建并互指：两处集合
 * 若要演化必须一起改（derive.test.ts 与本文件测试各自对拍）。
 */
const PENDING_INTERACTION_KINDS = new Set(['approval', 'plan-review', 'question'])

/**
 * 从宿主两路事实（列表快照的 summary + 状态表条目）派生会话头四态。
 *
 * 判据逐条照抄 derive.ts 的 rowStateOf（同一宿主语义不写两套判定）：待交互白名单命中 →
 * wait；running（状态表优先、回落 summary）→ run；完成未读 → done；其余 → idle。
 */
export function deriveHeaderStatus(
  summary: Pick<SessionSummaryLike, 'running'> | undefined,
  status: SessionStatusLike | undefined,
): HeaderStatus {
  const kind = status?.pendingInteraction?.kind
  if (kind !== undefined && PENDING_INTERACTION_KINDS.has(kind)) return 'wait'
  if ((status?.running ?? summary?.running) === true) return 'run'
  if (status?.completionUnread === true) return 'done'
  return 'idle'
}

/** 状态图标的渲染规格：icon = 内联 SVG 路径键；tone = 语义色档（CSS 侧映射宿主令牌）。 */
export interface StatusIconSpec {
  icon: 'refresh' | 'wrench' | 'check'
  tone: 'accent' | 'warn'
}

/**
 * 四态 → 图标规格（taiji sessionStatus.ts 的 STATUS_ICON 同语义收窄到本头三态）：
 * run → refresh/accent（CSS 动画旋转）、wait → wrench/warn、done → check/accent；
 * idle 与 undefined → null（不渲染图标）。
 */
export function statusIconOf(status: HeaderStatus | undefined): StatusIconSpec | null {
  if (status === 'run') return { icon: 'refresh', tone: 'accent' }
  if (status === 'wait') return { icon: 'wrench', tone: 'warn' }
  if (status === 'done') return { icon: 'check', tone: 'accent' }
  return null
}

// ── 组件 props ───────────────────────────────────────────────────────────────────

/** 槽渲染时框架注入的 props（宽松读取：sessionId 与两个数据钩子全部可能缺席）。 */
export interface TaijiSessionStatusIconProps {
  /** 当前会话 id（session 标准座位；缺席或查不到会话 → 图标不渲染）。 */
  sessionId?: string
  /** 会话列表快照钩子（GlobalStandardProps；缺席 → 无状态事实，图标不渲染）。 */
  useSessions?: (selector: (state: SessionListLike) => SessionListLike) => SessionListLike
  /** 状态表钩子（同上；缺席同降级）。 */
  useSessionStatus?: (selector: (state: StatusMapLike) => StatusMapLike) => StatusMapLike
}

/** 数据钩子缺席时的稳定兜底（模块级函数身份，hook 调用序恒定；返回 undefined → 降级形态）。 */
const useNoSessions = (): undefined => undefined
const useNoStatuses = (): undefined => undefined
/** 全量选择器（宿主 `useSessions(s => s)` 同款形态）。 */
const selectWhole = <T,>(state: T): T => state

// ── 内联图标（lucide 路径常量，currentColor 描边，写法照 browser.tsx 的 ICON_*）────

/** 三态图标路径（lucide v1.23.0 逐 path 抄录：refresh-cw / wrench / check）。 */
const STATUS_ICON_PATHS: Record<StatusIconSpec['icon'], readonly string[]> = {
  refresh: [
    'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8',
    'M21 3v5h-5',
    'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16',
    'M8 16H3v5',
  ],
  wrench: [
    'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z',
  ],
  check: ['M20 6 9 17l-5-5'],
}

/** 类名拼接（仓内既有口径：不为几个类名引宿主基线外的依赖）。 */
const cx = (...names: (string | false | undefined)[]): string => names.filter(Boolean).join(' ')

// ── 组件本体 ─────────────────────────────────────────────────────────────────────

/**
 * taiji 的 13px 会话状态图标（色调与旋转动画见 session-header.css）。
 *
 * 纯渲染组件：零本地状态、零副作用——两路数据经钩子流入。idle / 无会话 / 钩子缺席 →
 * null（taiji 卡头无 idle 占位）。测试夹具（load-tsx 单次渲染语义）下整树可直接断言。
 */
export function TaijiSessionStatusIcon(props: TaijiSessionStatusIconProps) {
  // 数据钩子：缺席兜底是模块级稳定函数（调用序恒定，不违反 hooks 规则）。
  const list = (props.useSessions ?? useNoSessions)(selectWhole)
  const statuses = (props.useSessionStatus ?? useNoStatuses)(selectWhole)

  // 会话事实：sessionId 在场才查（缺席 = 无会话形态）；查不到同样落 undefined 降级。
  const sessionId = props.sessionId === '' ? undefined : props.sessionId
  const summary = sessionId === undefined ? undefined : list?.byId[sessionId]
  const status = sessionId === undefined ? undefined : statuses?.get(sessionId)

  const state = deriveHeaderStatus(summary, status)
  const icon = statusIconOf(state)
  if (icon === null) return null

  return (
    <svg
      className={cx(
        'taiji-sh-status',
        `taiji-sh-status-${icon.tone}`,
        icon.icon === 'refresh' && 'taiji-sh-status-spin',
      )}
      data-status={state}
      width={13}
      height={13}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {STATUS_ICON_PATHS[icon.icon].map((d, index) => (
        <path key={index} d={d} />
      ))}
    </svg>
  )
}

// ── 装配（注册进宿主槽位）────────────────────────────────────────────────────────

/**
 * 装配状态图标：注册进 `conversation.session.header.actions`（list 槽——注册必须带 `id`
 * （list 槽的条目身份，宿主 register 对缺 id 直接 throw），priority -1 排在默认 0 的
 * AgentPresetLabel 之前）。无闭包依赖（全部经槽 props 注入），直接注册组件本体。
 * register 的 disposer 由宿主挂进调用者 fiber 的 effect，卸载即撤（V5 槽位贡献撤销）。
 *
 * @param host - 宿主 slots 面。
 */
export function installSessionStatusIcon(host: SessionStatusIconHost): void {
  host.slots.inject(SESSION_STATUS_ICON_SLOT, () =>
    host.slots.register(
      { name: SESSION_STATUS_ICON_SLOT, id: SESSION_STATUS_ICON_ID, priority: SESSION_STATUS_ICON_PRIORITY },
      TaijiSessionStatusIcon,
    ),
  )
}
