/**
 * client/projects/browser.tsx —— 侧栏会话区的项目分组浏览器（M2 整槽替换 `sidebar.workspaces`）。
 *
 * 注册形态（照 brand/mark.tsx 的优先级避让范式）：
 *   · 槽 = `sidebar.workspaces`（single/root，宿主 ui-sidebar 声明、ui-workspace 注册官方列表）。
 *     同格按 priority 升序、数值最小者渲染——宿主官方列表不显式设 priority（默认 0），本包取
 *     -10 起向下找空闲（-10 被占取 -11、-12…），压过官方列表实现整槽替换；
 *   · 注册选项只传 name/priority/locale：**不传 children**（宿主 entry 仍声明着 5 个子槽，同名
 *     声明会 throw）、不传 store/inject（动作服务经闭包捕获，见下）；
 *   · 降级：-10 … -100 全被占（理论上不可达，防坐下界）→ 不注册 + logger.warn，回落宿主原生
 *     列表（可见降级，不抛错炸装配）。
 *
 * 组件 props（槽渲染时框架注入，宽松读取、全部可能缺席）：
 *   · owner 份额 `{ wide, expandSidebar }`：wide 缺省按 true；wide=false（折叠轨）时本组件渲染
 *     null——轨态的新建/搜索按钮归侧栏 shell 所有（宿主 SidebarRoot 自持），会话区不参与轨态；
 *   · hookContext 份额 `useSectionScroller`：绑滚动衔接（导航区先滚出再续列表），缺席不绑；
 *   · GlobalStandardProps 数据钩子（useSessions/useSessionStatus/useWorkspaces，宿主对该槽的
 *     任何占用者都注入）：**缺席时渲染「数据服务未就绪」占位，不 throw**。缺席兜底用模块级
 *     稳定函数——hook 调用序恒定（缺席与否在 occupant 生命周期内不变），不违反 hooks 规则；
 *   · `t` 座位：注册声明 `locale: TAIJI_LOCALE_NS` 后宿主渲染机合成注入（字典先注册，装配序
 *     约束同品牌槽）。
 *
 * 动作服务（闭包捕获，不经 props——参照 mark.tsx 的 BrandSlotHost 风格，不 import 任何
 * @deepseek-ai/* 包，宿主接口的最小结构类型在本文件自定义）：
 *   · 打开/新建/归档/置顶 = `uiWorkspace`（宿主自带运行中确认与可撤销 toast）；
 *   · 会话重命名 = `sessions.using(id, { source: 'workspaceOperation' }, r => r.binding.session.rename(title))`
 *     （宿主公开合同，失败显式 logger.error 上报）；
 *   · 项目建/改名/删/归属 = 本包 ProjectStore（数据契约见 store.ts）。
 *
 * 新建会话归组（设计 §1）：点组头「+」→ `uiWorkspace.startSession()`（无参，新建/复用 blank 并
 * 立即成为当前选中）→ 记 `pendingProjectId` → 快照出现「blank 且无映射且是当前选中」的会话时
 * 消费它（一次性，消费即清；判定收进纯函数 findPendingAssignment，消费在 useEffect 里做）。
 *
 * 交互语义权威 = taiji 源组件（ProjectGroup.vue / DefaultProjectHead.vue / SessionItem.vue
 * 拖拽段）：组头 hover 三钮（+/pencil/trash）、行内重命名 Enter 提交 Esc 取消失焦提交、删除
 * 两段确认（Esc/pointerleave 复位）、计数 hover 让位（CSS 同位替换）、展开体 grid 0fr↔1fr
 * 高度动画 + 内层 opacity 跟进 + 收起延迟 visibility（reduced-motion 归零）、双 MIME 拖拽
 * （HTML5 DnD 原生事件，M3 提前）：会话行拖到组头 = 改归属（dragover 高亮、折叠组可落、
 * 落点强制展开、自组 no-op）、命名组头互拖 = 换位（默认项目头不可拖不发换位、重命名态禁拖、
 * 自拖自落静默），dragover/drop 按 dataTransfer.types 分流互不误触（dragover 阶段 getData
 * 不可读，types 是唯一判别通道），拖拽中源行半透明（dragend 兜底复位）。展开态纯组件内
 * state（默认：当前所在组展开、其余收起；**不用 localStorage**——tests/uninstall-cleanliness
 * 禁 client 侧存储调用）。
 *
 * 行首不放任何品牌图标（用户硬性要求）：只有 7px 状态点，无状态（idle）时留空位保对齐。
 *
 * 测试夹具注意（client/testing/load-tsx.ts 单次渲染语义）：主体树全内联在 ProjectBrowser 里
 * （拆出的函数组件在夹具里不展开）；移动弹层 portal 只在打开时渲染（夹具无 document，关态
 * 零 DOM 依赖），弹层内容单独抽成纯组件 ProjectMoveMenu 直接测。
 */
import { useEffect, useRef, useState, useSyncExternalStore, type RefCallback } from 'react'
import { createPortal } from 'react-dom'
import { TAIJI_LOCALE_NS, type LocaleKey } from '../locale'
import { DEFAULT_PROJECT_ID, type ProjectStoreLike, type TaijiProject } from './store'
import {
  currentSessionIdOf,
  deriveGroups,
  formatRelativeTime,
  type SessionListLike,
  type SessionRowModel,
  type StatusMapLike,
} from './derive'

// ── 宿主动作服务的最小结构类型（不 import 任何 @deepseek-ai/* 包，D3）──────────────

/** 宿主 `uiWorkspace` 服务（dsh-api-workspace-controller 的客户端动作面）的最小子集。 */
export interface UiWorkspaceLike {
  /** 打开会话（target = SessionId；宿主 SessionTarget 的字符串形态）。 */
  openSession(target: string): void
  /** 新建会话：无参调用 = 新建/复用 blank 并立即成为当前选中（M2 归组锚点）。 */
  startSession(...args: unknown[]): void
  /** 归档（宿主自带运行中确认与可撤销 toast）。 */
  archiveSession(sessionId: string): Promise<void>
  pinSession(sessionId: string): Promise<void>
  unpinSession(sessionId: string): Promise<void>
}

/** 宿主 `sessions` 服务（会话引用租借）的最小子集：重命名走它的公开合同。 */
export interface SessionsServiceLike {
  using<T>(
    sessionId: string,
    options: { source: string },
    operation: (reference: {
      binding: { session: { rename(title: string): Promise<{ ok: boolean; error?: { message?: string } }> } }
    }) => T,
  ): Promise<T>
}

/** 宿主 `useWorkspaces` 快照的最小子集（分组派生只消费两个集合）。 */
export interface WorkspaceSnapshotLike {
  archivedSessionIds?: readonly string[]
  pinnedSessionIds?: readonly string[]
}

// ── 槽位注册（优先级避让，照 mark.tsx 范式）──────────────────────────────────────

/** 本浏览器注册的槽名（宿主 ui-sidebar 声明的侧栏会话区整槽）。 */
export const PROJECTS_BROWSER_SLOT = 'sidebar.workspaces'

/** 宿主官方列表的隐式优先级：注册时不显式设，槽规则取默认 0。 */
const HOST_BROWSER_PRIORITY = 0

/** 本包目标优先级：压过宿主官方列表（0）——装了项目分组，会话区就该是它。 */
export const PREFERRED_BROWSER_PRIORITY = -10

/** 向下搜索的防坐下界：到 -100 仍无空闲 = 槽被异常占满（理论不可达），降级不注册。 */
export const PRIORITY_FLOOR = -100

/**
 * 在 [-100, -10] 里挑一个未被占用的优先级（从 -10 起向下：-10 被占取 -11、-12…）。
 *
 * @param entries - 目标槽当前的 occupant 巡检结果（ctx.slots.entries）。
 * @returns 可用优先级；区间占满返回 undefined（调用方不注册并告警）。
 */
export function resolveBrowserPriority(
  entries: readonly { options: { priority?: number } }[],
): number | undefined {
  const taken = new Set(entries.map((entry) => entry.options.priority ?? HOST_BROWSER_PRIORITY))
  for (let priority = PREFERRED_BROWSER_PRIORITY; priority >= PRIORITY_FLOOR; priority -= 1) {
    if (!taken.has(priority)) return priority
  }
  return undefined
}

// ── 新建会话归组：消费判定（纯函数）+ 一次性追踪器（状态体）───────────────────────

/**
 * pendingProjectId 的消费判定：快照里当前选中的会话是「blank 且无映射」时，它就是刚才
 * 组头「+」发起的新会话（startSession 的新建/复用都会立即成为当前选中），归入 pending 项目。
 *
 * 已有映射的当前 blank 不消费——那是别的入口建好又归过组的会话，不抢改用户的归属。
 */
export function findPendingAssignment(input: {
  pendingProjectId: string
  currentId: string | null
  list: SessionListLike
  assignments: Record<string, string>
}): { sessionId: string; projectId: string } | null {
  if (input.currentId === null) return null
  const summary = input.list.byId[input.currentId]
  if (summary === undefined || !summary.blank) return null
  if (input.assignments[input.currentId] !== undefined) return null
  return { sessionId: input.currentId, projectId: input.pendingProjectId }
}

/**
 * pendingProjectId 的状态体：begin 记目标项目，consume 按快照序列做一次性消费（命中即清）。
 *
 * 收成可独立实例化的对象而不是散在组件 ref 里：消费时序（点「+」→ 宿主建 blank → 快照
 * 更新 → 消费一次）可以用 mock 快照序列直接单测，不依赖组件渲染循环。
 */
export interface PendingProjectTracker {
  /** 组头「+」发起：记 pending 项目（覆盖式——连点两组以最后一击为准）。 */
  begin(projectId: string): void
  /**
   * 消费判定（组件每次快照更新后调用）：命中即消费（内部清空）并返回归属写入；未命中返回
   * null 且保持 pending（等下一次快照）。幂等安全：无 pending 时恒 null。
   */
  consume(input: {
    currentId: string | null
    list: SessionListLike
    assignments: Record<string, string>
  }): { sessionId: string; projectId: string } | null
}

/** 建一个独立追踪器（组件经 useRef 持有一个实例）。 */
export function createPendingProjectTracker(): PendingProjectTracker {
  let pending: string | null = null
  return {
    begin(projectId: string): void {
      pending = projectId
    },
    consume(input): { sessionId: string; projectId: string } | null {
      if (pending === null) return null
      const hit = findPendingAssignment({ pendingProjectId: pending, ...input })
      if (hit === null) return null
      pending = null // 一次性，消费即清
      return hit
    },
  }
}

// ── 组件 props ───────────────────────────────────────────────────────────────────

/** 槽渲染时框架注入的 props（宽松读取：owner/hook/数据钩子全部可能缺席）。 */
export interface ProjectBrowserProps {
  /** 本包命名空间的翻译函数（注册声明 locale 后由宿主渲染机合成注入）。 */
  t: (key: LocaleKey, params?: Record<string, unknown>) => string
  /** 折叠轨态 = false（缺省按 true 宽松处理；false 时本组件渲染 null，理由见文件头）。 */
  wide?: boolean
  /** 展开侧栏回调（缺省不调；轨态渲染 null，M2 无消费点）。 */
  expandSidebar?: () => void
  /** 滚动衔接钩子（hookContext 份额；缺席不绑）。 */
  useSectionScroller?: () => { bindScrollerRef?: RefCallback<HTMLElement> }
  /** 会话列表快照钩子（GlobalStandardProps；缺席 → 数据服务未就绪占位）。 */
  useSessions?: (selector: (state: SessionListLike) => SessionListLike) => SessionListLike
  /** 状态表钩子（同上）。 */
  useSessionStatus?: (selector: (state: StatusMapLike) => StatusMapLike) => StatusMapLike
  /** 工作区快照钩子（同上）。 */
  useWorkspaces?: (selector: (state: WorkspaceSnapshotLike) => WorkspaceSnapshotLike) => WorkspaceSnapshotLike
}

/** 动作服务与数据 store（闭包捕获经 shell 透传，不经宿主 props）。 */
export interface ProjectBrowserDeps {
  store: ProjectStoreLike
  uiWorkspace: UiWorkspaceLike
  sessions: SessionsServiceLike
  logger?: { warn(message: string): void; error(message: string): void }
}

/** 数据钩子缺席时的稳定兜底（模块级函数身份，hook 调用序恒定；返回 undefined → 占位态）。 */
const useNoList = (): undefined => undefined
const useNoStatuses = (): undefined => undefined
const useNoWorkspaces = (): undefined => undefined
const useNoScroller = (): { bindScrollerRef?: undefined } => ({})
/** 全量选择器（宿主 WorkspaceBrowser 同款 `useSessions(s => s)` 形态）。 */
const selectWhole = <T,>(state: T): T => state

/** 稳定空集（展开态初值；useSyncExternalStore 同款「值不变则引用不变」纪律）。 */
const EMPTY_SET: ReadonlySet<string> = new Set()

/** 最小结构的事件面（与 taiji-section.tsx 的 InputEventLike 同构子集）。 */
interface InputEventLike {
  key: string
  target: { value: string }
  preventDefault(): void
}

/** 类名拼接（仓内既有口径：不为几个类名引宿主基线外的依赖）。 */
const cx = (...names: (string | false | undefined)[]): string => names.filter(Boolean).join(' ')

// ── 拖拽（M3 提前，taiji session-drag.ts 同值）：双 MIME 分流 ─────────────────────

/** 会话行拖拽 MIME（值 = sessionId）：拖到组头 = 改归属。 */
export const SESSION_DRAG_MIME = 'application/x-taiji-session'

/** 项目组头换位拖拽 MIME（值 = projectId）：拖到其他命名组头 = 换位。 */
export const PROJECT_DRAG_MIME = 'application/x-taiji-project'

/** 拖拽载荷的最小结构面（HTML5 DnD 原生事件只用到这些；夹具照 InputEventLike 模式模拟）。 */
interface DataTransferLike {
  /** 悬停阶段可读的类型清单——getData 在 dragover 阶段不可读（安全限制），types 是唯一判别通道。 */
  types: readonly string[]
  getData(mime: string): string
  setData(mime: string, value: string): void
  /** dragstart 写（源侧声明允许的效果）；dragover 写（落点侧声明的实际效果）。 */
  effectAllowed?: string
  dropEffect?: string
}

/** 拖拽事件的最小结构面（与 InputEventLike 同构子集：真宿主是 DragEvent，夹具传同形对象）。 */
interface DragEventLike {
  dataTransfer: DataTransferLike | null
  preventDefault(): void
  /** dragleave 抖动过滤：移出去向（null = 离开窗口）。 */
  relatedTarget?: unknown
  currentTarget?: unknown
}

/**
 * 拖拽悬停分流判定（taiji ProjectGroup.vue 的 isProjectDrag 模式收成纯函数）：
 * session 与 project 两类拖拽共享组头落点，dragover/drop 阶段各按 types 命中分流互不误触。
 * 两类同时命中的形态物理上不可达（一次拖拽只写一种 MIME），万一到达按 project 优先
 * （与 taiji onHeadDragOver 先判 isProjectDrag 同序）。
 */
export function classifyDragOver(types: readonly string[]): 'session' | 'project' | null {
  if (types.includes(PROJECT_DRAG_MIME)) return 'project'
  if (types.includes(SESSION_DRAG_MIME)) return 'session'
  return null
}

/**
 * dragleave 的真离开判定（taiji 同判）：relatedTarget 仍落在组头元素内 = 组头子元素间抖动
 * （进入文字 span / 按钮也会冒泡 dragleave），不算离开；null / 缺席 = 真离开（宽松处理，
 * 夹具简陋事件没有 currentTarget.contains 时同样按真离开收敛）。
 */
function dragLeaveIsReal(event: DragEventLike): boolean {
  const related = event.relatedTarget
  if (related === null || related === undefined) return true
  const current = event.currentTarget as { contains?(node: unknown): boolean } | undefined
  return typeof current?.contains === 'function' ? !current.contains(related) : true
}

/**
 * 会话重命名：宿主公开合同 `sessions.using(id, { source: 'workspaceOperation' },
 * r => r.binding.session.rename(title))`。失败（被拒 / 传输异常）显式 logger.error 上报，
 * 不静默吞、不向上抛（行内编辑无错误位，日志是唯一留痕）。
 *
 * 收成模块级函数：合同调用与失败上报可独立于组件渲染直接单测。
 */
export function performSessionRename(
  deps: { sessions: SessionsServiceLike; logger?: ProjectsBrowserHost['logger'] },
  sessionId: string,
  title: string,
): void {
  const { sessions, logger } = deps
  sessions
    .using(sessionId, { source: 'workspaceOperation' }, (reference) => reference.binding.session.rename(title))
    .then((result) => {
      if (!result.ok) {
        logger?.error(`taiji: 会话重命名被拒（${sessionId}）：${result.error?.message ?? '未知原因'}`)
      }
    })
    .catch((error: unknown) => {
      logger?.error(`taiji: 会话重命名失败（${sessionId}）：${error instanceof Error ? error.message : String(error)}`)
    })
}

// ── 内联图标（最小 SVG，currentColor 描边，尺寸照 demo）───────────────────────────

/** chevron-down 基准 + 收起 -90° 旋转（taiji ProjectGroup.vue 同语系：展开向下 / 收起向右）。 */
const ICON_CHEVRON_DOWN = ['m6 9 6 6 6-6']
const ICON_PLUS = ['M12 5v14', 'M5 12h14']
const ICON_PENCIL = ['M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z']
const ICON_TRASH = ['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2', 'M10 11v6', 'M14 11v6']
const ICON_ARCHIVE = ['M21 8v13H3V8', 'M1 3h22v5H1z', 'M10 12h4']
const ICON_FOLDER_IN = ['M2.5 5.5h5l2 2h7a1.5 1.5 0 0 1 1.5 1.5v2', 'M2.5 19.5h11', 'M13 13.5h7.5m0 0-2.5-2.5m2.5 2.5-2.5 2.5']
const ICON_PIN = ['M9 4h6', 'M12 4v2', 'M8.5 6h7v3l-2 3.5v3h-3v-3L8.5 9z', 'M12 15.5V20']
const ICON_LAYERS = ['m12 3 9 5-9 5-9-5z', 'm3 13.5 9 5 9-5']
const ICON_CHECK = ['m5 13 4 4L19 7']

/** 线性图标（多 path 描边；装饰性图形 aria-hidden，可访问名在按钮上）。 */
function Icon({ paths, size = 12 }: { paths: readonly string[]; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths.map((d, index) => <path key={index} d={d} />)}
    </svg>
  )
}

// ── 移动到项目弹层（纯组件，portal 内渲染；单独导出供直接测）─────────────────────

/** 移动弹层 props：项目全集 + 行当前归属 + 点选回调。 */
export interface ProjectMoveMenuProps {
  t: ProjectBrowserProps['t']
  /** 全部命名项目（store 数组序）。 */
  projects: readonly TaijiProject[]
  /** 行的当前归属（'' = 默认项目；悬空映射由调用方收敛成 ''）。 */
  currentProjectId: string
  /** 点选一个目标项目（'' = 归回默认）。 */
  onPick: (projectId: string) => void
}

/**
 * 「移动到项目」弹层列表：默认项目 + 全部命名项目，勾标当前归属，点选即迁。
 * 宿主 shell 不裁剪 portal 到 body 的内容（appearance-chip 同款先例）。
 */
export function ProjectMoveMenu({ t, projects, currentProjectId, onPick }: ProjectMoveMenuProps) {
  const entries: readonly (readonly { id: string; name: string })[] = [
    [{ id: DEFAULT_PROJECT_ID, name: t('projects.default') }],
    projects.map((project) => ({ id: project.id, name: project.name })),
  ]
  return (
    <div className="taiji-pb-menu" role="menu" aria-label={t('projects.moveToProjectTitle')}>
      {entries.flat().map((entry) => (
        <button
          key={entry.id === DEFAULT_PROJECT_ID ? 'default' : entry.id}
          type="button"
          role="menuitem"
          className="taiji-pb-menu-item"
          data-project-id={entry.id}
          aria-current={entry.id === currentProjectId || undefined}
          onClick={() => { onPick(entry.id) }}
        >
          <span className="taiji-pb-menu-name">{entry.name}</span>
          {entry.id === currentProjectId && <span className="taiji-pb-menu-check"><Icon paths={ICON_CHECK} /></span>}
        </button>
      ))}
    </div>
  )
}

// ── 组件本体 ─────────────────────────────────────────────────────────────────────

/**
 * 项目分组浏览器：区头 → 默认项目轻量头 → 命名项目组 × N → 会话行。
 *
 * 交互状态全部收在 useRef + 重渲染扳机（useState 只当扳机用，与 taiji-section.tsx 同款：
 * 测试夹具的 useState 桩不触发重渲染，行为真相在 ref 里才能被同一渲染树上的后续交互读到）；
 * 展开集合是唯一例外——它只被真实 React 消费（夹具里初始空集即冒烟形态），走原生 setState。
 */
export function ProjectBrowser(props: ProjectBrowserProps & ProjectBrowserDeps) {
  const { t, store, uiWorkspace, sessions, logger } = props

  // 数据钩子：缺席兜底是模块级稳定函数（调用序恒定）；缺席 → dataReady=false → 占位态。
  const list = (props.useSessions ?? useNoList)(selectWhole)
  const statuses = (props.useSessionStatus ?? useNoStatuses)(selectWhole)
  const wsSnapshot = (props.useWorkspaces ?? useNoWorkspaces)(selectWhole)
  const scroller = (props.useSectionScroller ?? useNoScroller)()

  // 折叠轨态：会话区不参与轨态（shell 自持轨态按钮），渲染 null。
  const wide = props.wide ?? true

  // 项目数据（store 的会话内权威；订阅驱动重渲染）。
  // 闭包包裹而非直传方法引用：store.getState 脱离实例会丢 this（真机首渲染即崩，
  // 宿主 abdicate 摘除本组件——隔离环境 phase1 验收实锤）
  const projectsState = useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getState(),
    () => store.getState(),
  )

  // 分组派生：三路事实齐了才派生（缺任何一路 = 数据服务未就绪）。
  const currentId = list !== undefined ? currentSessionIdOf(list) : null
  const dataReady = list !== undefined && statuses !== undefined && wsSnapshot !== undefined
  const derivation = dataReady
    ? deriveGroups({
      list,
      statuses,
      workspaces: {
        archivedIds: wsSnapshot.archivedSessionIds ?? [],
        pinnedIds: wsSnapshot.pinnedSessionIds ?? [],
      },
      state: projectsState,
      currentId,
    })
    : undefined
  const groups = derivation?.groups ?? []
  const total = derivation?.total ?? 0
  const currentGroupId = groups.find((group) => group.isCurrent)?.id

  // ── 展开态（组件内 state，不用 localStorage）：默认当前所在组展开、其余收起 ──
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(EMPTY_SET)
  const expandSeeded = useRef(false)
  useEffect(() => {
    // 初次拿到「当前所在组」时播种展开集（此后不再跟随——浏览态归用户）。
    if (expandSeeded.current || currentGroupId === undefined) return
    expandSeeded.current = true
    setExpandedIds(new Set([currentGroupId]))
  }, [currentGroupId])

  const toggleGroup = (id: string): void => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── 新建会话归组（见文件头）：tracker 在 ref，消费在 effect（不在 render 里做副作用）──
  const pendingTracker = useRef(createPendingProjectTracker())
  useEffect(() => {
    if (list === undefined) return
    const hit = pendingTracker.current.consume({
      currentId,
      list,
      assignments: projectsState.assignments,
    })
    if (hit === null) return
    void store.assignSession(hit.sessionId, hit.projectId)
  }, [list, currentId, projectsState.assignments, store])

  /** 组头/默认头「+」：先发起 startSession 再记 pending（宿主会立即把它选成当前）。 */
  const startSessionIn = (projectId: string): void => {
    uiWorkspace.startSession()
    pendingTracker.current.begin(projectId)
  }

  // ── 交互态（真相在 ref；rerender 是真实 React 的视觉扳机）──
  const armedDeleteId = useRef<string | null>(null)
  const renamingGroupId = useRef<string | null>(null)
  const renamingSessionId = useRef<string | null>(null)
  const newDraftOpen = useRef(false)
  const moveMenu = useRef<{ rowId: string; top: number; left: number } | null>(null)
  // 拖拽态（M3 提前）：session 悬停高亮的组头 id（dropActive 态）/ project 换位悬停高亮的
  // 组头 id（projectDragOver 态）——两类独立锚点、同视觉；一次拖拽物理上只有一个悬停位，
  // 组件级单值 id 即可表达（taiji 是每组件实例自持 ref，同一时刻也只有一个置位）。
  const sessionDropOverId = useRef<string | null>(null)
  const projectDragOverId = useRef<string | null>(null)
  // 拖拽中的源行 id（行半透明反馈；dragend 兜底复位——drop 被取消也还原）。
  const draggingSessionId = useRef<string | null>(null)
  const [, rerender] = useState(0)

  /** 行的当前归属（悬空映射收敛成默认项目——与派生层同一判据）。 */
  const projectIds = new Set(projectsState.projects.map((project) => project.id))
  const effectiveProjectId = (sessionId: string): string => {
    const mapped = projectsState.assignments[sessionId]
    return mapped !== undefined && projectIds.has(mapped) ? mapped : DEFAULT_PROJECT_ID
  }

  /** 组内会话数（删除确认文案的 N；与 taiji-section 同一数法：assignments 值计数）。 */
  const assignedCount = (projectId: string): number =>
    Object.values(projectsState.assignments).filter((id) => id === projectId).length

  /** 删除两段确认：第一击武装（变红显后果文案），第二击执行；换目标重新武装。 */
  const requestDeleteGroup = (id: string): void => {
    if (armedDeleteId.current === id) {
      armedDeleteId.current = null
      void store.deleteProject(id)
    } else {
      armedDeleteId.current = id
    }
    rerender((count) => count + 1)
  }

  const disarmDelete = (): void => {
    if (armedDeleteId.current === null) return
    armedDeleteId.current = null
    rerender((count) => count + 1)
  }

  /** 会话重命名：宿主公开合同（performSessionRename，失败显式上报）。 */
  const renameSession = (sessionId: string, title: string): void => {
    performSessionRename({ sessions, logger }, sessionId, title)
  }

  /** 新建项目草稿提交：建好即展开新组（真实 React 的 setState 展开；夹具里只断言 store 调用）。 */
  const submitNewProject = (value: string, input: InputEventLike['target']): void => {
    const trimmed = value.trim()
    input.value = ''
    if (trimmed === '') return
    void store.createProject(trimmed).then((created) => {
      if (created !== null) setExpandedIds((prev) => new Set(prev).add(created.id))
    })
  }

  /**
   * 草稿行收起回「+」态：提交 / Esc / 失焦的共用出口。值已由各分支清空（submitNewProject
   * 内清 / Esc 分支清），下次点「+」重新展开时内容为空；重复收起幂等（无扳机）。
   */
  const closeNewDraft = (): void => {
    if (!newDraftOpen.current) return
    newDraftOpen.current = false
    rerender((count) => count + 1)
  }

  /** 打开弹层：取按钮视口几何做 fixed 锚点（appearance-chip 同款；夹具事件无几何时锚 0,0）。 */
  const openMoveMenu = (rowId: string, event: { currentTarget?: unknown }): void => {
    const element = event.currentTarget as { getBoundingClientRect?: () => { bottom: number; left: number } } | undefined
    const rect = typeof element?.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : undefined
    moveMenu.current = { rowId, top: rect ? rect.bottom + 4 : 0, left: rect ? rect.left : 0 }
    rerender((count) => count + 1)
  }

  // 弹层开着时挂 document 监听（点外/Escape 关层；关层即撤——夹具里弹层恒关，零 DOM 依赖）。
  const menu = moveMenu.current
  useEffect(() => {
    if (menu === null) return
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node | null
      if (target instanceof Element && target.closest('.taiji-pb-menu') !== null) return
      moveMenu.current = null
      rerender((count) => count + 1)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      moveMenu.current = null
      rerender((count) => count + 1)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  })

  /** 单个会话行（内联渲染：夹具可深断言；hover 操作钮覆盖右槽由 CSS 承担）。 */
  const renderRow = (row: SessionRowModel) => {
    const renaming = renamingSessionId.current === row.id
    const phrase = formatRelativeTime(row.updatedAtMs)
    const dragging = draggingSessionId.current === row.id
    return (
      <div
        key={row.id}
        className={cx('taiji-pb-row', row.isCurrent && 'taiji-pb-row-current', dragging && 'taiji-pb-row-dragging')}
        role="button"
        tabIndex={0}
        data-session-id={row.id}
        /* 行拖拽改归属（M3 提前）：draggable + dragstart 写 session MIME；重命名态禁拖
           （与组头重命名禁拖同理：输入框内的文本选中拖拽不得冒泡成整行拖拽） */
        draggable={!renaming}
        onDragStart={(event: DragEventLike) => {
          if (event.dataTransfer === null) return
          event.dataTransfer.setData(SESSION_DRAG_MIME, row.id)
          event.dataTransfer.effectAllowed = 'move'
          draggingSessionId.current = row.id
          rerender((count) => count + 1)
        }}
        onDragEnd={() => {
          /* 兜底复位：drop 被取消（Esc / 拖到无效区）也还原半透明（taiji SessionItem 同款） */
          if (draggingSessionId.current === null) return
          draggingSessionId.current = null
          rerender((count) => count + 1)
        }}
        onClick={() => { uiWorkspace.openSession(row.id) }}
        onKeyDown={(event: InputEventLike) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            uiWorkspace.openSession(row.id)
          }
        }}
      >
        {renaming ? (
          <input
            key={`${row.id}:${row.title}`}
            className="taiji-pb-rename-input"
            defaultValue={row.title}
            aria-label={t('projects.renameSession')}
            autoFocus
            /* 点击输入框不得触发组头开合（重命名态组头也是展开开关） */
            onClick={(event: { stopPropagation(): void }) => { event.stopPropagation() }}
            onKeyDown={(event: InputEventLike) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                const trimmed = event.target.value.trim()
                if (trimmed !== '' && trimmed !== row.title) renameSession(row.id, trimmed)
                renamingSessionId.current = null
                rerender((count) => count + 1)
              } else if (event.key === 'Escape') {
                event.target.value = row.title
                renamingSessionId.current = null
                rerender((count) => count + 1)
              }
            }}
            onBlur={(event: InputEventLike) => {
              const trimmed = event.target.value.trim()
              if (trimmed !== '' && trimmed !== row.title) renameSession(row.id, trimmed)
              renamingSessionId.current = null
              rerender((count) => count + 1)
            }}
          />
        ) : (
          <>
            {/* 状态点 7px：idle 留空位保对齐（行首不放品牌图标——用户硬性要求） */}
            <span className={cx('taiji-pb-dot', row.state !== 'idle' && `taiji-pb-dot-${row.state}`)} aria-hidden="true" />
            <span className="taiji-pb-title">{row.blank ? t('projects.rowNewSession') : row.title}</span>
            {row.subagentCount > 0 && (
              <span className="taiji-pb-sub" title={t('projects.subagents', { n: row.subagentCount })}>
                <Icon paths={ICON_LAYERS} size={9} />
                {row.subagentCount}
              </span>
            )}
            {row.pinned && (
              <button
                type="button"
                className="taiji-pb-pin"
                title={t('projects.unpinSession')}
                aria-label={t('projects.unpinSession')}
                onClick={() => { void uiWorkspace.unpinSession(row.id) }}
              >
                <Icon paths={ICON_PIN} />
              </button>
            )}
            {row.state === 'wait' ? (
              <span className="taiji-pb-waittext">{t('projects.waiting')}</span>
            ) : (
              <span className="taiji-pb-time">{t(phrase.key, phrase.params)}</span>
            )}
            <span className="taiji-pb-acts">
              <button
                type="button"
                className="taiji-pb-abtn"
                title={t('projects.renameSession')}
                aria-label={t('projects.renameSession')}
                onClick={() => {
                  renamingSessionId.current = row.id
                  rerender((count) => count + 1)
                }}
              >
                <Icon paths={ICON_PENCIL} />
              </button>
              <button
                type="button"
                className="taiji-pb-abtn"
                title={t('projects.moveToProject')}
                aria-label={t('projects.moveToProject')}
                onClick={(event) => { openMoveMenu(row.id, event) }}
              >
                <Icon paths={ICON_FOLDER_IN} />
              </button>
              <button
                type="button"
                className="taiji-pb-abtn"
                title={t('projects.archiveSession')}
                aria-label={t('projects.archiveSession')}
                onClick={() => { void uiWorkspace.archiveSession(row.id) }}
              >
                <Icon paths={ICON_ARCHIVE} />
              </button>
            </span>
          </>
        )}
      </div>
    )
  }

  /** 单个项目组（命名组头三钮 / 默认组轻量头行 +「+」；展开内容区两组同款左缘细线）。 */
  const renderGroup = (group: (typeof groups)[number]) => {
    const expanded = expandedIds.has(group.id)
    const armed = armedDeleteId.current === group.id
    const renaming = renamingGroupId.current === group.id && !group.isDefault
    const visibleRows = group.rows.filter((row) => row.visible)
    const label = group.isDefault ? t('projects.default') : group.name
    // 拖拽悬停高亮（两类独立锚点、同视觉 = 组头 hover 底色；taiji dropActive / projectDragOver 同构）
    const dropActive = sessionDropOverId.current === group.id
    const projectDragOver = projectDragOverId.current === group.id

    /** 组头发起换位拖拽：写本组 projectId（默认项目头不可拖由 draggable=false 保证，此处兜底）。 */
    const onHeadDragStart = (event: DragEventLike): void => {
      // 重命名态禁拖（taiji 同判：防与输入框文本选中/输入冲突）。判定读 ref 实时值而非
      // 渲染闭包快照——本仓「真相在 ref」纪律：rerender 前的旧闭包里 renaming 恒 false
      if ((renamingGroupId.current === group.id && !group.isDefault) || group.isDefault) {
        event.preventDefault()
        return
      }
      if (event.dataTransfer === null) return
      event.dataTransfer.setData(PROJECT_DRAG_MIME, group.id)
      event.dataTransfer.effectAllowed = 'move'
    }

    /** dragover 按 types 分流：project 换位高亮（默认头不接）/ session 改归属高亮；无关拖拽不响应。 */
    const onHeadDragOver = (event: DragEventLike): void => {
      if (event.dataTransfer === null) return
      const kind = classifyDragOver(event.dataTransfer.types)
      if (kind === null) return
      // 默认项目头只接 session 改归属，不是换位落点（taiji DefaultProjectHead 同构：无 project 分支）
      if (kind === 'project' && group.isDefault) return
      // preventDefault 是 HTML5 DnD「允许成为落点」的契约；dropEffect 声明落点侧效果
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      const ref = kind === 'project' ? projectDragOverId : sessionDropOverId
      // dragover 高频连续触发：只在状态实际变化时扳机重渲染
      if (ref.current !== group.id) {
        ref.current = group.id
        rerender((count) => count + 1)
      }
    }

    /** dragleave 两类高亮同清；relatedTarget 仍在组头内的子元素抖动不算离开（taiji 同判）。 */
    const onHeadDragLeave = (event: DragEventLike): void => {
      if (!dragLeaveIsReal(event)) return
      let changed = false
      if (sessionDropOverId.current === group.id) {
        sessionDropOverId.current = null
        changed = true
      }
      if (projectDragOverId.current === group.id) {
        projectDragOverId.current = null
        changed = true
      }
      if (changed) rerender((count) => count + 1)
    }

    /** drop 按 types 分流：project 换位（自拖自落静默）/ session 改归属（自组 no-op + 强制展开）。 */
    const onHeadDrop = (event: DragEventLike): void => {
      if (event.dataTransfer === null) return
      const kind = classifyDragOver(event.dataTransfer.types)
      if (kind === null) return
      // 与 dragover 对称：默认项目头不接换位（其 dragover 未 preventDefault，浏览器不会
      // 派发 drop 到它——此处拦截的是夹具/边缘形态的手动派发）
      if (kind === 'project' && group.isDefault) return
      event.preventDefault()
      if (kind === 'project') {
        if (projectDragOverId.current !== null) {
          projectDragOverId.current = null
          rerender((count) => count + 1)
        }
        const draggedId = event.dataTransfer.getData(PROJECT_DRAG_MIME)
        // 自拖自落组件内静默（taiji 同判：draggedId === 目标组不 emit reorder）
        if (draggedId !== '' && draggedId !== group.id) void store.reorderProjects(draggedId, group.id)
        return
      }
      if (sessionDropOverId.current !== null) {
        sessionDropOverId.current = null
        rerender((count) => count + 1)
      }
      const sessionId = event.dataTransfer.getData(SESSION_DRAG_MIME)
      if (sessionId === '') return
      // 自组拖自组 no-op：归属未变不写 store（store 层另有幂等，组件层短路省一次异步）
      if (effectiveProjectId(sessionId) === group.id) return
      void store.assignSession(sessionId, group.id)
      // 折叠组同样可落：落点组强制展开（taiji 父级 drop 后展开同语义；已展开时引用不变即 bail out）
      setExpandedIds((prev) => (prev.has(group.id) ? prev : new Set(prev).add(group.id)))
    }

    return (
      <div
        key={group.id === DEFAULT_PROJECT_ID ? 'default' : group.id}
        className={cx('taiji-pb-group', group.isDefault && 'taiji-pb-group-default', expanded && 'taiji-pb-open')}
        data-project-id={group.id}
        data-current={group.isCurrent || undefined}
      >
        <div
          className={cx(
            'taiji-pb-ghead',
            group.isDefault && 'taiji-pb-ghead-default',
            dropActive && 'taiji-pb-ghead-drop',
            projectDragOver && 'taiji-pb-ghead-pdrag',
          )}
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          aria-label={label}
          data-dragover={dropActive || undefined}
          data-project-dragover={projectDragOver || undefined}
          /* 组头 = 双 MIME 拖拽交互面：自身 draggable 发起换位（默认头不可拖、重命名态禁拖）；
             dragover/drop 按 types 分流接 session 改归属与 project 换位（taiji ProjectGroup.vue 同构） */
          draggable={!renaming && !group.isDefault}
          onDragStart={onHeadDragStart}
          onDragOver={onHeadDragOver}
          onDragLeave={onHeadDragLeave}
          onDrop={onHeadDrop}
          onClick={() => { toggleGroup(group.id) }}
          onKeyDown={(event: InputEventLike) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              toggleGroup(group.id)
            } else if (event.key === 'Escape') {
              disarmDelete()
            }
          }}
          onPointerLeave={() => { disarmDelete() }}
        >
          {renaming ? (
            /* 组头行内重命名（Enter 提交 / Esc 取消 / 失焦提交；与 taiji ProjectGroup.vue 同语义） */
            <input
              key={`${group.id}:${group.name}`}
              className="taiji-pb-rename-input"
              defaultValue={group.name}
              aria-label={t('projects.renameProject')}
              autoFocus
              /* 点击输入框不得触发组头开合（同上） */
              onClick={(event: { stopPropagation(): void }) => { event.stopPropagation() }}
              onKeyDown={(event: InputEventLike) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  const trimmed = event.target.value.trim()
                  if (trimmed !== '' && trimmed !== group.name) void store.renameProject(group.id, trimmed)
                  renamingGroupId.current = null
                  rerender((count) => count + 1)
                } else if (event.key === 'Escape') {
                  event.target.value = group.name
                  renamingGroupId.current = null
                  rerender((count) => count + 1)
                }
              }}
              onBlur={(event: InputEventLike) => {
                const trimmed = event.target.value.trim()
                if (trimmed !== '' && trimmed !== group.name) void store.renameProject(group.id, trimmed)
                renamingGroupId.current = null
                rerender((count) => count + 1)
              }}
            />
          ) : (
            <>
              <span className="taiji-pb-chev" aria-hidden="true"><Icon paths={ICON_CHEVRON_DOWN} /></span>
              <span className="taiji-pb-gname">{label}</span>
              {group.isCurrent && <span className="taiji-pb-chip">{t('projects.currentChip')}</span>}
              {armed && !group.isDefault ? (
                /* 两段确认武装态：红色后果文案即确认钮（第二击执行）；Esc / pointerleave 复位 */
                <button
                  type="button"
                  className="taiji-pb-confirm"
                  title={t('projects.deleteProject')}
                  onClick={(event) => {
                    event.stopPropagation()
                    requestDeleteGroup(group.id)
                  }}
                >
                  {t('projects.deleteConfirm', { n: assignedCount(group.id) })}
                </button>
              ) : (
                <>
                  <span className="taiji-pb-count">{visibleRows.length}</span>
                  <span className="taiji-pb-gacts">
                    <button
                      type="button"
                      className="taiji-pb-abtn"
                      title={t('projects.newSessionIn')}
                      aria-label={t('projects.newSessionIn')}
                      onClick={(event) => {
                        event.stopPropagation()
                        startSessionIn(group.id)
                      }}
                    >
                      <Icon paths={ICON_PLUS} />
                    </button>
                    {!group.isDefault && (
                      <>
                        <button
                          type="button"
                          className="taiji-pb-abtn"
                          title={t('projects.renameProject')}
                          aria-label={t('projects.renameProject')}
                          onClick={(event) => {
                            event.stopPropagation()
                            renamingGroupId.current = group.id
                            rerender((count) => count + 1)
                          }}
                        >
                          <Icon paths={ICON_PENCIL} />
                        </button>
                        <button
                          type="button"
                          className="taiji-pb-abtn"
                          title={t('projects.deleteProject')}
                          aria-label={t('projects.deleteProject')}
                          onClick={(event) => {
                            event.stopPropagation()
                            requestDeleteGroup(group.id)
                          }}
                        >
                          <Icon paths={ICON_TRASH} />
                        </button>
                      </>
                    )}
                  </span>
                </>
              )}
            </>
          )}
        </div>
        {/* 展开体常驻 DOM：grid 0fr↔1fr 高度动画 + 内层 opacity 跟进 + 收起延迟 visibility
            （taiji 逐值语义）；左缘细线两档（默认项目同款——用户裁决对齐命名组，轻量头行
            保留）：当前组 accent 60% / 非当前组 border-l1 极淡 hairline，收起随体隐藏 */}
        <div className={cx('taiji-pb-gbody-wrap', expanded && 'taiji-pb-gbody-open')}>
          <div className={cx('taiji-pb-gbody', group.isCurrent && 'taiji-pb-gbody-current')}>
            {visibleRows.map(renderRow)}
          </div>
        </div>
      </div>
    )
  }

  if (!wide) return null

  return (
    <div className="taiji-pb">
      {/* 区头：标题 + 总计数（mono）+ 新建项目「+」；草稿输入行常挂载、hidden 类切换显隐 */}
      <div className="taiji-pb-head">
        <span className="taiji-pb-head-title">{t('projects.title')}</span>
        <span className="taiji-pb-head-count">{total}</span>
        <span className="taiji-pb-head-flex" />
        <button
          type="button"
          className="taiji-pb-head-add"
          title={t('projects.newProject')}
          aria-label={t('projects.newProject')}
          aria-expanded={newDraftOpen.current}
          onClick={() => {
            newDraftOpen.current = !newDraftOpen.current
            rerender((count) => count + 1)
          }}
        >
          <Icon paths={ICON_PLUS} size={13} />
        </button>
      </div>
      <input
        className={cx('taiji-pb-newdraft', !newDraftOpen.current && 'taiji-pb-hidden')}
        placeholder={t('projects.newProject')}
        aria-label={t('projects.newProject')}
        aria-hidden={!newDraftOpen.current}
        tabIndex={!newDraftOpen.current ? -1 : undefined}
        onKeyDown={(event: InputEventLike) => {
          if (event.key === 'Enter') {
            // Enter = 结束本次输入：提交（空值丢弃）后一律收起回「+」态
            event.preventDefault()
            submitNewProject(event.target.value, event.target)
            closeNewDraft()
          } else if (event.key === 'Escape') {
            event.target.value = ''
            closeNewDraft()
          }
        }}
        onBlur={(event: InputEventLike) => {
          // 收起态的失焦不重复提交（Enter 收起把行 display:none 会引发浏览器失焦，值已清空，
          // guard 挡住夹具/边缘形态下的二次提交）；展开态失焦 = 失焦提交，空值丢弃后同样收起
          if (!newDraftOpen.current) return
          submitNewProject(event.target.value, event.target)
          closeNewDraft()
        }}
      />
      {/* 列表滚动容器：bindScrollerRef 在场时绑上（滚动衔接白捡；缺席不绑） */}
      <div
        className="taiji-pb-list"
        ref={typeof scroller.bindScrollerRef === 'function' ? scroller.bindScrollerRef : undefined}
      >
        {!dataReady ? (
          <div className="taiji-pb-unavailable">{t('projects.dataUnavailable')}</div>
        ) : list.phase === 'pending' ? (
          <>
            <div className="taiji-pb-loading" role="status">{t('projects.loading')}</div>
            <div className="taiji-pb-skeleton" />
            <div className="taiji-pb-skeleton" />
            <div className="taiji-pb-skeleton" />
          </>
        ) : (
          <>
            {groups.map(renderGroup)}
            {total === 0 && <div className="taiji-pb-empty">{t('projects.empty')}</div>}
          </>
        )}
      </div>
      {/* 移动弹层：只在打开时 portal（夹具无 document，关态零 DOM 依赖） */}
      {menu !== null
        ? createPortal(
          <div className="taiji-pb-menu-anchor" style={{ top: menu.top, left: menu.left }}>
            <ProjectMoveMenu
              t={t}
              projects={projectsState.projects}
              currentProjectId={effectiveProjectId(menu.rowId)}
              onPick={(projectId) => {
                moveMenu.current = null
                void store.assignSession(menu.rowId, projectId)
              }}
            />
          </div>,
          document.body,
        )
        : null}
    </div>
  )
}

// ── 装配（注册进宿主槽位）────────────────────────────────────────────────────────

/** 本浏览器用到的宿主 context 面（最小结构类型；slots 签名照 BrandSlotHost）。 */
export interface ProjectsBrowserHost {
  slots: {
    /** 等 `sidebar.workspaces` 声明出现后执行 callback（声明已存在则同步执行）。 */
    inject(key: string, callback: () => (() => void) | void): () => void
    /** 注册一个 occupant（同格同优先级二次注册会抛错，故先避让；register 自挂 effect）。 */
    register(
      options: { name: string; priority?: number; locale?: string },
      component: unknown,
    ): () => void
    /** 只读巡检：某槽当前的全部 occupant（未显式设 priority 的按槽规则视作 0）。 */
    entries(key: string): readonly { options: { priority?: number } }[]
  }
  /** 宿主动作服务（动作经闭包捕获进组件，不经槽 props）。 */
  uiWorkspace: UiWorkspaceLike
  /** 宿主会话服务（重命名合同）。 */
  sessions: SessionsServiceLike
  /** 宿主日志（避让失败告警 / 动作失败上报；缺失不影响主路径）。 */
  logger?: { warn(message: string): void; error(message: string): void }
}

/**
 * 造注册用壳组件：闭包携带 store 与动作服务（槽契约没有 inject 机制，服务无法经宿主渲染机
 * 注入 props），宿主喂来的 owner/hook/数据钩子 props 原样透传。
 */
export function createProjectsBrowser(host: ProjectsBrowserHost, deps: { store: ProjectStoreLike }) {
  return function ProjectsBrowserSlot(props: ProjectBrowserProps) {
    return (
      <ProjectBrowser
        {...props}
        store={deps.store}
        uiWorkspace={host.uiWorkspace}
        sessions={host.sessions}
        logger={host.logger}
      />
    )
  }
}

/**
 * 装配项目分组浏览器：整槽注册进 `sidebar.workspaces`（优先级避让 + 降级告警，见文件头）。
 *
 * 装配序约束：locale 字典必须先于本槽首次渲染注册（locale: 声明 + 渲染机合成 t 座位）。
 * register 的 disposer 由宿主挂进调用者 fiber 的 effect（与品牌槽同机制），卸载即回落宿主
 * 原生列表（V5 验收判据）。
 *
 * @param host - 宿主侧（slots + uiWorkspace + sessions + 可选 logger）。
 * @param deps - 本包侧（ProjectStore 实例——M1 装配层创建、与设置页共用同一实例）。
 */
export function installProjectsBrowser(host: ProjectsBrowserHost, deps: { store: ProjectStoreLike }): void {
  host.slots.inject(PROJECTS_BROWSER_SLOT, () => {
    const priority = resolveBrowserPriority(host.slots.entries(PROJECTS_BROWSER_SLOT))
    if (priority === undefined) {
      host.logger?.warn(
        `侧栏会话区槽 ${PROJECTS_BROWSER_SLOT} 的 [${PRIORITY_FLOOR}, ${PREFERRED_BROWSER_PRIORITY}] 优先级区间已被占满，`
        + '项目分组浏览器本次不注册（回落宿主原生列表）',
      )
      // no-op disposer（宿主 inject 契约的 effect 形态是「disposer 或可迭代」，空 = 本次无可撤）
      return () => {}
    }
    return host.slots.register(
      { name: PROJECTS_BROWSER_SLOT, priority, locale: TAIJI_LOCALE_NS },
      createProjectsBrowser(host, deps),
    )
  })
}
