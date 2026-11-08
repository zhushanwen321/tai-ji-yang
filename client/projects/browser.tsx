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
 *   · owner 份额 `{ wide, expandSidebar }`：wide 缺省按 true；显式 false = 折叠轨态（Web 载体
 *     侧栏折叠成 56px 轨）。宿主官方列表在轨态渲染两枚 36px 轨入口（搜索 / 新建工作区，各自
 *     经 owner 份额请求展开——宿主 ui-workspace WorkspaceBrowser 文件头 "rail state renders
 *     the two rail entry paths"）；本组件整槽替换压过官方列表后，轨态入口随之归本组件——渲染
 *     最小轨态入口（一枚「新建会话」钮，点击 = expandSidebar 后 startSession，见组件内轨态
 *     分支）。搜索轨入口不提供：本浏览器无搜索功能，与宿主轨态两枚入口存在该差异（登记）；
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
 * 立即成为当前选中）→ 记 `pendingProjectId` + **当时的 currentId** → 快照出现「blank 且无映射
 * 且是当前选中」的会话时消费它（一次性，消费即清；判定收进纯函数 findPendingAssignment，
 * 消费在 useEffect 里做）；currentId 漂移到非可消费形态（宿主复用了已映射 blank / 用户点了
 * 别的会话）→ 判定过期清除，pending 不永久武装劫持后续新会话（createPendingProjectTracker）。
 *
 * 交互语义权威 = taiji 源组件（ProjectGroup.vue / DefaultProjectHead.vue / SessionItem.vue
 * 拖拽段）：组头 hover 三钮（+/pencil/trash）、行内重命名 Enter 提交 Esc 取消失焦提交、删除
 * 两段确认（Esc/pointerleave 复位）、计数 hover 让位（CSS 同位替换）、展开体 grid 0fr↔1fr
 * 高度动画 + 内层 opacity 跟进 + 收起延迟 visibility（reduced-motion 归零）、双 MIME 拖拽
 * （HTML5 DnD 原生事件，M3 提前）：会话行拖到组头 = 改归属（dragover 高亮、折叠组可落、
 * 落点强制展开、自组 no-op）、命名组头互拖 = 换位（默认项目头不可拖不发换位、重命名态禁拖、
 * 自拖自落静默），dragover/drop 按 dataTransfer.types 分流互不误触（dragover 阶段 getData
 * 不可读，types 是唯一判别通道），拖拽中源行半透明（dragend 兜底复位）。
 *
 * M3 三件（本文件实现，视觉基准 = taiji-sidebar-ideal.html demo 逐值）：
 *   · 悬停详情卡：行 mouseenter 立即右弹 232px fixed 卡（贴行右侧 + 视口钳制），mouseleave
 *     关；pointer-events:none 纯展示不抢 hover。内容 = 完整标题（不截断）/ cwd（~ 缩写 mono）
 *     / 相对时间（blank 行无时间行）/ 父会话行（byId 找得到显父标题，找不到显 id 前 8 位）。
 *     消息计数无数据来源（宿主快照无消息数字段）——登记不做；
 *   · 归档子视图：区头 archive 图标钮 + 计数角标（0 隐藏角标），点击切入与主列表互斥的子
 *     视图：返回行 + 时间筛选 chips（全部/1天内/2-3天/4-7天/7天+，按 updatedAt 距今分档，
 *     各带计数，选中 accent 底）+ 归档行（标题 + 相对时间 + hover 恢复钮 →
 *     uiWorkspace.unarchiveSession；unarchive 后行消失纯数据驱动——宿主集合变化重派生）。
 *     无删除/批量清理——DSH 无会话删除 API，登记不做；
 *   · 右键菜单：行 contextmenu 自绘菜单（fixed ~200px，宿主 overlay 令牌底）：置顶/取消置顶
 *     （按当前置顶态切文案）、重命名（同 hover 钮的行内重命名）、归档、复制会话 ID
 *     （navigator.clipboard，失败 logger.warn）、分隔线 + 移动到项目组（默认项目 + 各命名
 *     项目，当前归属打勾）。关闭 = 点菜单外 / Esc / 任意滚动（capture；菜单自身容器内滚动
 *     豁免——max-height 70vh 的菜单是可滚的，滚它不等于要关它）；目标行从当前数据消失时
 *     清锚点关层（不留悬空 ref 挂着 document 监听）。
 *
 * 展开态持久（M3）：**单一数据源 = store 快照 + 本地乐观先行**。store 快照经
 * useSyncExternalStore 订阅消费（getExpanded 引用稳定契约：值不变不换数组——镜像晚答
 * loading→ready 采纳持久值并 notify 时，组件跟随新快照，不冻结挂载初值）；本地开合走
 * 统一出口 applyExpanded = 乐观覆盖先行 + store.setExpanded 持久（失败不回滚视觉、显式
 * warn 上报——与 store 的「乐观更新不回滚」同一哲学）。覆盖带「写时刻的 store 快照引用」
 * 作基线：store 一旦换引用（本地写被采纳 / 迟到的持久值 / 外部事实）覆盖即失效回落
 * store——过期本地集合永远不会整写回 store 销毁持久值；store 回声与本地相等时（幂等
 * no-op，不 notify）覆盖继续生效，视觉无抖动。**不用 localStorage**——tests/uninstall-
 * cleanliness 禁 client 侧存储调用，持久通道归 store 的插件 Config 字段。播种（首次进入
 * 展开当前组）是纯视觉默认不写 store：持久值为空可能是「从未持久」也可能是「用户全收起」，
 * 两者在 getExpanded 契约下不可区分，按「空 = 跟随当前组」收敛（登记：全收起重启后会回到
 * 播种态）；播种仅在「用户从未动过展开」时发生——用户中途全收起后，晚到的 currentGroupId
 * 不再强制展开（resolveSeedExpansion 判定表）。
 *
 * 行首不放任何品牌图标（用户硬性要求）：只有 7px 状态点，无状态（idle）时留空位保对齐。
 *
 * 测试夹具注意（client/testing/load-tsx.ts 单次渲染语义）：主体树全内联在 ProjectBrowser 里
 * （拆出的函数组件在夹具里不展开）；三个弹层/浮层（移动弹层、悬停详情卡、右键菜单）portal
 * 只在打开时渲染（夹具无 document，关态零 DOM 依赖），内容各自抽成纯组件直接测：
 * ProjectMoveMenu / SessionHoverCard / ArchiveSubview / SessionContextMenu。
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
  type SessionSummaryLike,
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
  /** 取消归档（归档子视图恢复钮的动作面；宿主集合变化驱动行消失）。 */
  unarchiveSession(sessionId: string): Promise<void>
  pinSession(sessionId: string): Promise<void>
  unpinSession(sessionId: string): Promise<void>
}

/**
 * store 展开态持久面（M3 并行扩展的两个成员）的本地结构性声明——不动 store.ts，这里按
 * 浏览器侧的消费最小集定义；真实 ProjectStore（store.ts 实装后）结构满足即兼容。
 */
export interface ExpandedPersistenceLike {
  /** 持久展开态（项目 id 数组；'' 成员 = 默认项目展开）。 */
  getExpanded(): readonly string[]
  /** 整体写回展开态；false = 持久化失败（会话内视觉不回滚，调用方显式上报）。 */
  setExpanded(ids: readonly string[]): Promise<boolean>
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
 * pendingProjectId 的状态体：begin 记目标项目与**当时的 currentId**（漂移判定的基线），
 * consume 按快照序列做一次性消费（命中即清），并对「currentId 已漂移且非可消费形态」做
 * 过期清除。
 *
 * 过期语义：点「+」后宿主建 blank 需要若干快照才到达，期间 currentId 仍是旧会话（未漂移）
 * → 保持等待，不误杀在途动作；若某次快照的 currentId 已不是 begin 时的会话、又不是
 * 「未映射 blank」（可消费形态）——典型 = 宿主复用了已映射的 blank、或用户点了别的会话
 * ——用户意图已离开本次归组动作，pending 判定过期清除，不永久武装劫持之后外部入口新建
 * 的未映射 blank。
 *
 * 收成可独立实例化的对象而不是散在组件 ref 里：消费时序（点「+」→ 宿主建 blank → 快照
 * 更新 → 消费一次）可以用 mock 快照序列直接单测，不依赖组件渲染循环。
 */
export interface PendingProjectTracker {
  /** 组头「+」发起：记 pending 项目与当时的当前会话 id（覆盖式——连点两组以最后一击为准）。 */
  begin(projectId: string, beginCurrentId: string | null): void
  /**
   * 消费判定（组件每次快照更新后调用）：命中即消费（内部清空）并返回归属写入；未命中返回
   * null——currentId 未漂移时保持 pending（等下一次快照），已漂移且非可消费形态时过期清除
   * （此后恒 null 直到再次 begin）。幂等安全：无 pending 时恒 null。
   */
  consume(input: {
    currentId: string | null
    list: SessionListLike
    assignments: Record<string, string>
  }): { sessionId: string; projectId: string } | null
}

/** 建一个独立追踪器（组件经 useRef 持有一个实例）。 */
export function createPendingProjectTracker(): PendingProjectTracker {
  let pending: { projectId: string; beginCurrentId: string | null } | null = null
  return {
    begin(projectId: string, beginCurrentId: string | null): void {
      pending = { projectId, beginCurrentId }
    },
    consume(input): { sessionId: string; projectId: string } | null {
      if (pending === null) return null
      const hit = findPendingAssignment({ pendingProjectId: pending.projectId, ...input })
      if (hit !== null) {
        pending = null // 一次性，消费即清
        return hit
      }
      // 漂移过期：currentId 已不是 begin 时的会话，且不是可消费形态（可消费已在上方命中
      // 返回）。此时用户/宿主的意图已离开本次归组动作，pending 清除——不永久武装。
      // currentId 与 begin 时相同（含同为 null）= 宿主动作在途，保持等待。
      if (input.currentId !== pending.beginCurrentId) pending = null
      return null
    },
  }
}

// ── 组件 props ───────────────────────────────────────────────────────────────────

/** 槽渲染时框架注入的 props（宽松读取：owner/hook/数据钩子全部可能缺席）。 */
export interface ProjectBrowserProps {
  /** 本包命名空间的翻译函数（注册声明 locale 后由宿主渲染机合成注入）。 */
  t: (key: LocaleKey, params?: Record<string, unknown>) => string
  /** 折叠轨态 = false（缺省按 true 宽松处理；false 时渲染本包最小轨态入口，理由见文件头 owner 份额段）。 */
  wide?: boolean
  /** 展开侧栏回调（轨态入口点击序列第一步：先展开回宽态再新建；缺席跳过、只新建）。 */
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
  /** store 面 = 项目 CRUD 契约 + 展开态持久面（结构性扩展，见 ExpandedPersistenceLike）。 */
  store: ProjectStoreLike & ExpandedPersistenceLike
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

/** 最小结构的事件面（与 taiji-section.tsx 的 InputEventLike 同构子集）。 */
interface InputEventLike {
  key: string
  target: { value: string }
  preventDefault(): void
}

/** 鼠标事件的最小结构面（行 hover / 右键锚点定位用；夹具传同形对象）。 */
interface MouseEventLike {
  /** 视口坐标（contextmenu 的菜单锚点；夹具缺席按 0 收敛）。 */
  clientX?: number
  clientY?: number
  preventDefault(): void
  /** 事件源元素（hover 卡的行几何来源；缺席按无几何兜底锚 0,0）。 */
  currentTarget?: unknown
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

// ── M3 模块级纯函数（可独立于组件渲染直接单测）───────────────────────────────────

/**
 * cwd 的 home 段缩写：`/Users/<name>/...`、`/home/<name>/...` 前缀替换为 `~`。
 *
 * 浏览器环境拿不到 os.homedir()，按惯例路径段启发式替换（macOS / Linux 命中绝大多数形态）；
 * 未命中（Windows 盘符路径、相对路径）原样返回——缩写失败不应丢信息。
 */
export function abbreviateHomePath(cwd: string): string {
  return cwd.replace(/^\/(?:Users|home)\/[^/]+/, '~')
}

/** 详情卡父会话行的数据形态：找得到 = 父标题；找不到 = 父 id 前 8 位；null = 无父会话。 */
export type HoverParent = { title: string } | { shortId: string } | null

/**
 * 父会话行解析：parentId 在宿主快照 byId 里找得到显父标题（title trim 非空，否则回落
 * displayTitle——与派生层 titleOf 同一收敛口径，但派生层私有、这里只用到这两个字段）；
 * 找不到只显 id 前 8 位（完整 id 太长，8 位与本项目 id 生成长度一致可辨识）。
 */
export function resolveHoverParent(
  row: Pick<SessionRowModel, 'parentId'>,
  byId: Record<string, SessionSummaryLike> | undefined,
): HoverParent {
  if (row.parentId === undefined) return null
  const parent = byId?.[row.parentId]
  if (parent === undefined) return { shortId: row.parentId.slice(0, 8) }
  const stored = parent.title?.trim()
  return { title: stored === undefined || stored === '' ? parent.displayTitle : stored }
}

/** 复制会话 ID 的最小剪贴板面（deps 注入便于测试；真身是 navigator.clipboard）。 */
export interface CopyIdDeps {
  clipboard?: { writeText(text: string): Promise<void> }
  logger?: { warn(message: string): void }
}

/**
 * 复制会话 ID：navigator.clipboard.writeText；剪贴板缺席 / 写入拒绝都不外抛——菜单动作
 * 失败的唯一留痕是 logger.warn（菜单关层是既定节奏，不因复制失败弹错误 UI）。
 */
export function performCopySessionId(deps: CopyIdDeps, sessionId: string): void {
  const { clipboard, logger } = deps
  if (clipboard === undefined) {
    logger?.warn(`taiji: 剪贴板不可用，未能复制会话 id（${sessionId}）`)
    return
  }
  clipboard
    .writeText(sessionId)
    .catch((error: unknown) => {
      logger?.warn(`taiji: 复制会话 id 失败（${sessionId}）：${error instanceof Error ? error.message : String(error)}`)
    })
}

/** 运行环境的剪贴板面（测试夹具 / 非安全上下文可能没有；缺席由 performCopySessionId 兜 warn）。 */
function hostClipboard(): { writeText(text: string): Promise<void> } | undefined {
  if (typeof navigator === 'undefined') return undefined
  return (navigator as { clipboard?: { writeText(text: string): Promise<void> } }).clipboard
}

/** 归档子视图的时间筛选档（'all' = 全部；其余按 updatedAt 距今分档）。 */
export type ArchiveFilter = 'all' | 'd1' | 'd3' | 'd7' | 'older'

/** chips 的渲染与分档序（全部 → 1天内 → 2-3天 → 4-7天 → 7天+，demo 同序）。 */
export const ARCHIVE_FILTERS: readonly ArchiveFilter[] = ['all', 'd1', 'd3', 'd7', 'older']

/** 一天的毫秒数（归档分档的时长基准；与 derive.ts 的 DAY_MS 同值，各自私有——两文件互不引常量）。 */
const ARCHIVE_DAY_MS = 24 * 60 * 60 * 1000

/**
 * 归档行的时间档判定（按 updatedAt 距今的**时长差**分档，不用日历日差：归档筛选是
 * 「多老」的粗粒度浏览，时长差边界稳定、跨时区/午夜不抖动）：
 * <1天 → d1 · 1-3天 → d3 · 3-7天 → d7 · ≥7天 → older。未来时间戳（时钟漂移）兜底 d1。
 */
export function archiveBucketOf(updatedAtMs: number, now: number = Date.now()): Exclude<ArchiveFilter, 'all'> {
  const diff = Math.max(0, now - updatedAtMs)
  if (diff < ARCHIVE_DAY_MS) return 'd1'
  if (diff < 3 * ARCHIVE_DAY_MS) return 'd3'
  if (diff < 7 * ARCHIVE_DAY_MS) return 'd7'
  return 'older'
}

/**
 * 播种判定（展开态首次进入展开当前组）：同时满足四条件才返回待播种的当前组 id，否则 null——
 *   1. 未播过（一次性的开关，防 currentGroupId 轮换时反复播种）；
 *   2. **用户从未动过展开**：用户中途收起全部组是显式意图事实，其后才首次出现的
 *      currentGroupId 不得把它强制展开回去（「播过」开关挡不住「播之前用户先动了」的时序，
 *      必须独立记账）；
 *   3. 已拿到当前组（没有当前会话时无从播种）；
 *   4. 当前无任何展开事实（持久值非空 = 已有事实，不覆盖）。
 *
 * 收成纯函数供直接单测（effect 里的接线依赖组件 ref 序列，夹具单次渲染不可复现「先动过、
 * 后出现 currentGroupId」的跨快照时序）。
 */
export function resolveSeedExpansion(state: {
  seeded: boolean
  userTouched: boolean
  currentGroupId: string | undefined
  expandedSize: number
}): string | null {
  if (state.seeded || state.userTouched) return null
  if (state.currentGroupId === undefined || state.expandedSize > 0) return null
  return state.currentGroupId
}

/**
 * 事件目标是否落在指定选择器的容器内（右键菜单 / 移动弹层的 mousedown 与 scroll 关层
 * 豁免的同一判据）。duck-typing 判 closest：真事件目标是 Element（有 closest）；夹具 /
 * 边缘形态（无 closest 的节点、null）按「不在容器内」收敛——关层方向安全（最多多关一次，
 * 不会卡死开层）。收纯函数供直接单测（document 监听接线归 L3 真渲染）。
 */
export function targetInsideContainer(target: unknown, selector: string): boolean {
  if (typeof target !== 'object' || target === null) return false
  const closest = (target as { closest?: (sel: string) => unknown }).closest
  if (typeof closest !== 'function') return false
  const hit = closest.call(target, selector)
  return hit !== null && hit !== undefined
}

/**
 * 移动弹层的点选动作：**无条件先关层再写归属**。点「当前归属」时 assignSession 是幂等
 * no-op（值未变不写、不 notify），关层若依赖 store 回声驱动重渲染就永远不发生——所以
 * 关层必须自带重渲染扳机、与 store 通知解耦（对齐右键菜单每路动作先 closeCtxMenu 的
 * 节奏）。收成可注入 deps 的函数供夹具直接单测（portal 接线归 L3）。
 */
export function performMovePick(
  deps: { closeLayer(): void; assignSession(sessionId: string, projectId: string): Promise<boolean> },
  rowId: string,
  projectId: string,
): void {
  deps.closeLayer()
  void deps.assignSession(rowId, projectId)
}

/**
 * 右键菜单锚点是否仍有效：目标行还在当前派生数据（rowsById 含全部行，含归档/不可见）→
 * 有效。行消失（会话被删 / 数据源变化）→ 无效，调用方渲染 null 的**同时必须清 ctxMenu
 * ref**——只返 null 不清 ref 会让悬空锚点驻留：document 关闭监听继续挂着，且行回来前的
 * 每次渲染都白做一次查找。收纯函数供夹具直接单测（portal 接线归 L3）。
 */
export function ctxAnchorValid(anchor: { rowId: string } | null, rowsById: ReadonlyMap<string, unknown>): boolean {
  if (anchor === null) return false
  return rowsById.has(anchor.rowId)
}

/**
 * 展开态的本地乐观覆盖（组件展开段的内部结构）：ids = 开合动作的目标集合；base = 写时刻
 * 的 store 快照引用（引用判等，不比内容）——覆盖只在 store 快照仍是该引用时生效，store
 * 换引用（本地写被采纳 / 迟到的持久值 / 外部事实）即失效回落 store 快照。
 */
interface ExpandedOverride {
  /** 乐观集合（开合动作的目标态）。 */
  ids: ReadonlySet<string>
  /** 基线快照引用。 */
  base: readonly string[]
}

// ── fixed 浮层的视口钳制（详情卡 / 右键菜单共用）─────────────────────────────────

/** 悬停详情卡固定宽（任务规格 232px；demo hcard 244px 同量级）。 */
const HOVER_CARD_WIDTH = 232
/** 详情卡高度上界估值（标题可换行，渲染前不可测；按标题两行 + 三信息行的最坏形态估）。 */
const HOVER_MAX_HEIGHT = 200
/** 右键菜单宽度（min-width 同值；钳制用它做水平上界）。 */
const CTX_MENU_WIDTH = 200
/** 右键菜单高度上界估值（动作 4 项 + 分隔 + 标签 + 项目若干，按 10 项菜单估）。 */
const CTX_MAX_HEIGHT = 320

/**
 * fixed 层的视口钳制：点定位 + 宽高估值夹进视口（留 8px 边距）。测试夹具 / SSR 无 window
 * 时原样返回（那里没有视口可钳，锚点由调用方的几何兜底决定）。
 */
function clampToViewport(point: { x: number; y: number }, width: number, maxHeight: number): { top: number; left: number } {
  if (typeof window === 'undefined') return { top: point.y, left: point.x }
  const margin = 8
  return {
    left: Math.max(margin, Math.min(point.x, window.innerWidth - width - margin)),
    top: Math.max(margin, Math.min(point.y, window.innerHeight - maxHeight - margin)),
  }
}

/** 详情卡锚点：贴行右侧 8px、随行顶（垂直/水平都做视口钳制）。 */
function anchorRightOfRow(rect: { top: number; right: number }): { top: number; left: number } {
  return clampToViewport({ x: rect.right + 8, y: rect.top }, HOVER_CARD_WIDTH, HOVER_MAX_HEIGHT)
}

/** 右键菜单锚点：鼠标点定位（水平垂直钳制；菜单落在光标右下是平台惯例）。 */
function anchorAtPoint(x: number, y: number): { top: number; left: number } {
  return clampToViewport({ x, y }, CTX_MENU_WIDTH, CTX_MAX_HEIGHT)
}

// ── 内联图标（最小 SVG，currentColor 描边，尺寸照 demo）───────────────────────────

/** chevron-down 基准 + 收起 -90° 旋转（taiji ProjectGroup.vue 同语系：展开向下 / 收起向右）。 */
const ICON_CHEVRON_DOWN = ['m6 9 6 6 6-6']
/** chevron-left（归档子视图返回行；demo lucide chevron-left 同形）。 */
const ICON_CHEVRON_LEFT = ['m15 18-6-6 6-6']
const ICON_PLUS = ['M12 5v14', 'M5 12h14']
const ICON_PENCIL = ['M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z']
const ICON_TRASH = ['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2', 'M10 11v6', 'M14 11v6']
const ICON_ARCHIVE = ['M21 8v13H3V8', 'M1 3h22v5H1z', 'M10 12h4']
const ICON_FOLDER_IN = ['M2.5 5.5h5l2 2h7a1.5 1.5 0 0 1 1.5 1.5v2', 'M2.5 19.5h11', 'M13 13.5h7.5m0 0-2.5-2.5m2.5 2.5-2.5 2.5']
/** 普通文件夹（详情卡 cwd 行；demo lucide folder 的单 path 形）。 */
const ICON_FOLDER = ['M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z']
/** fork 分叉（详情卡父会话行；demo lucide git-fork 的三圆两线形）。 */
const ICON_FORK = [
  'M9 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  'M21 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  'M15 21a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  'M7 9v1c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2V9',
  'M12 12v3',
]
/** 复制（右键菜单「复制会话 ID」；demo lucide copy 的双框形，rect 收成 path）。 */
const ICON_COPY = [
  'M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2',
]
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

// ── 悬停详情卡（纯组件，portal 内渲染；单独导出供直接测）─────────────────────────

/** 详情卡消费的行字段子集（窄化输入：纯组件只看这些，测试自造同形对象即可）。 */
type HoverRow = Pick<SessionRowModel, 'title' | 'cwd' | 'updatedAtMs' | 'blank'>

/** 详情卡 props：行字段子集 + 父会话解析结果 + 翻译函数。 */
export interface SessionHoverCardProps {
  t: ProjectBrowserProps['t']
  row: HoverRow
  /** 父会话行数据（resolveHoverParent 的产物；null = 不渲染该行）。 */
  parent: HoverParent
}

/**
 * 悬停详情卡内容：完整标题（不截断，卡内允许换行）/ 父会话行 / cwd 行（~ 缩写 mono）/
 * 相对时间行（复用 formatRelativeTime；blank 会话无时间——刚创建还没有「上次活动」）。
 * 卡本体 pointer-events:none（CSS 层）纯展示，交互全部归行自身。
 */
export function SessionHoverCard({ t, row, parent }: SessionHoverCardProps) {
  const phrase = formatRelativeTime(row.updatedAtMs)
  return (
    <div className="taiji-pb-hover-card" role="tooltip">
      <div className="taiji-pb-hover-title">{row.blank ? t('projects.rowNewSession') : row.title}</div>
      {parent !== null && (
        <div className="taiji-pb-hover-row">
          <Icon paths={ICON_FORK} size={12} />
          <span className="taiji-pb-hover-text">
            {'title' in parent
              ? t('projects.parentSession', { title: parent.title })
              : t('projects.parentMissing', { id: parent.shortId })}
          </span>
        </div>
      )}
      {row.cwd !== undefined && (
        <div className="taiji-pb-hover-row">
          <Icon paths={ICON_FOLDER} size={12} />
          <code className="taiji-pb-hover-cwd">{abbreviateHomePath(row.cwd)}</code>
        </div>
      )}
      {!row.blank && <div className="taiji-pb-hover-meta">{t(phrase.key, phrase.params)}</div>}
    </div>
  )
}

// ── 归档子视图（纯组件；单独导出供直接测）────────────────────────────────────────

/** 归档子视图 props：全部归档行 + 当前筛选档 + 三个交互回调。 */
export interface ArchiveSubviewProps {
  t: ProjectBrowserProps['t']
  /** 全部归档行（未过滤；chips 计数对全集算，行列表按 filter 过滤）。 */
  rows: readonly SessionRowModel[]
  filter: ArchiveFilter
  onBack(): void
  onFilterChange(filter: ArchiveFilter): void
  onUnarchive(sessionId: string): void
}

/** chips 的文案词条映射（ARCHIVE_FILTERS 的每档一个 key）。 */
const ARCHIVE_FILTER_KEYS: Record<ArchiveFilter, LocaleKey> = {
  all: 'projects.archiveFilter.all',
  d1: 'projects.archiveFilter.d1',
  d3: 'projects.archiveFilter.d3',
  d7: 'projects.archiveFilter.d7',
  older: 'projects.archiveFilter.older',
}

/**
 * 归档子视图：返回行 + 时间筛选 chips（各带计数，选中 accent 底）+ 归档行列表 + 空态。
 *
 * 恢复不删本地行——unarchiveSession 改变宿主归档集合，快照重派生后行自然消失（纯数据
 * 驱动，避免本地乐观列表与宿主事实双源）。刻意无删除/批量清理：DSH 无会话删除 API。
 */
export function ArchiveSubview({ t, rows, filter, onBack, onFilterChange, onUnarchive }: ArchiveSubviewProps) {
  // 渲染时算一次 now：chips 计数与行过滤用同一基准，同帧内自洽。
  const now = Date.now()
  const counts: Record<ArchiveFilter, number> = { all: rows.length, d1: 0, d3: 0, d7: 0, older: 0 }
  for (const row of rows) counts[archiveBucketOf(row.updatedAtMs, now)] += 1
  const visible = filter === 'all' ? rows : rows.filter((row) => archiveBucketOf(row.updatedAtMs, now) === filter)

  return (
    <div className="taiji-pb-archive">
      <div className="taiji-pb-a-head">
        <button
          type="button"
          className="taiji-pb-a-back"
          title={t('projects.backToSessions')}
          aria-label={t('projects.backToSessions')}
          onClick={() => { onBack() }}
        >
          <Icon paths={ICON_CHEVRON_LEFT} size={13} />
        </button>
        <span className="taiji-pb-a-title">{t('projects.archivedCount', { n: rows.length })}</span>
      </div>
      <div className="taiji-pb-chips">
        {ARCHIVE_FILTERS.map((key) => (
          <button
            key={key}
            type="button"
            className={cx('taiji-pb-chip', filter === key && 'taiji-pb-chip-on')}
            data-filter={key}
            aria-pressed={filter === key}
            onClick={() => { onFilterChange(key) }}
          >
            {`${t(ARCHIVE_FILTER_KEYS[key])} ${counts[key]}`}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <div className="taiji-pb-empty">{t('projects.archiveEmpty')}</div>
      ) : (
        visible.map((row) => {
          const phrase = formatRelativeTime(row.updatedAtMs)
          return (
            <div key={row.id} className="taiji-pb-a-row" data-session-id={row.id}>
              <span className="taiji-pb-a-ttl">{row.blank ? t('projects.rowNewSession') : row.title}</span>
              <span className="taiji-pb-a-time">{t(phrase.key, phrase.params)}</span>
              <span className="taiji-pb-a-acts">
                <button
                  type="button"
                  className="taiji-pb-a-restore"
                  title={t('projects.unarchiveSession')}
                  aria-label={t('projects.unarchiveSession')}
                  onClick={() => { onUnarchive(row.id) }}
                >
                  {t('projects.unarchiveSession')}
                </button>
              </span>
            </div>
          )
        })
      )}
    </div>
  )
}

// ── 右键菜单（纯组件，portal 内渲染；单独导出供直接测）───────────────────────────

/** 右键菜单 props：行字段子集 + 项目全集 + 当前归属 + 五路动作回调。 */
export interface SessionContextMenuProps {
  t: ProjectBrowserProps['t']
  /** 菜单目标行（置顶态切文案用 pinned；id 不直接消费但窄化输入里保留语义完整）。 */
  row: Pick<SessionRowModel, 'id' | 'pinned'>
  projects: readonly TaijiProject[]
  /** 行的当前归属（'' = 默认项目；悬空映射由调用方收敛成 ''）。 */
  currentProjectId: string
  onTogglePin(): void
  onRename(): void
  onArchive(): void
  onCopyId(): void
  onPickProject(projectId: string): void
}

/**
 * 会话右键菜单：置顶/取消置顶（按当前置顶态切文案）、重命名、归档、复制会话 ID、分隔线 +
 * 「移动到项目」标签 + 默认项目 + 各命名项目（当前归属打勾）。菜单项点击后关层由调用方
 * 包装回调承担（纯组件只发动作，生命周期归组件本体）。
 */
export function SessionContextMenu({ t, row, projects, currentProjectId, onTogglePin, onRename, onArchive, onCopyId, onPickProject }: SessionContextMenuProps) {
  const entries: readonly (readonly { id: string; name: string })[] = [
    [{ id: DEFAULT_PROJECT_ID, name: t('projects.default') }],
    projects.map((project) => ({ id: project.id, name: project.name })),
  ]
  return (
    <div className="taiji-pb-ctx" role="menu" aria-label={t('projects.moveToProjectTitle')}>
      <button type="button" role="menuitem" className="taiji-pb-ctx-item" data-act="pin" onClick={() => { onTogglePin() }}>
        <Icon paths={ICON_PIN} />
        <span className="taiji-pb-ctx-name">{row.pinned ? t('projects.unpinSession') : t('projects.pinSession')}</span>
      </button>
      <button type="button" role="menuitem" className="taiji-pb-ctx-item" data-act="rename" onClick={() => { onRename() }}>
        <Icon paths={ICON_PENCIL} />
        <span className="taiji-pb-ctx-name">{t('projects.renameShort')}</span>
      </button>
      <button type="button" role="menuitem" className="taiji-pb-ctx-item" data-act="archive" onClick={() => { onArchive() }}>
        <Icon paths={ICON_ARCHIVE} />
        <span className="taiji-pb-ctx-name">{t('projects.archiveShort')}</span>
      </button>
      <button type="button" role="menuitem" className="taiji-pb-ctx-item" data-act="copy-id" onClick={() => { onCopyId() }}>
        <Icon paths={ICON_COPY} />
        <span className="taiji-pb-ctx-name">{t('projects.copySessionId')}</span>
      </button>
      <div className="taiji-pb-ctx-sep" />
      <div className="taiji-pb-ctx-label">{t('projects.moveToProjectTitle')}</div>
      {entries.flat().map((entry) => (
        <button
          key={entry.id === DEFAULT_PROJECT_ID ? 'default' : entry.id}
          type="button"
          role="menuitem"
          className="taiji-pb-ctx-item"
          data-project-id={entry.id}
          aria-current={entry.id === currentProjectId || undefined}
          onClick={() => { onPickProject(entry.id) }}
        >
          <span className="taiji-pb-ctx-name">{entry.name}</span>
          {entry.id === currentProjectId && <span className="taiji-pb-ctx-check"><Icon paths={ICON_CHECK} /></span>}
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
 * 测试夹具的 useState 桩不触发重渲染，行为真相在 ref 里才能被同一渲染树上的后续交互读到）。
 * 展开集合同款形态：真相 = localOverride ref（+ store 快照），useState 只做视觉扳机；真
 * 实 React 侧再叠加 store 订阅驱动（见展开态段注释）。
 */
export function ProjectBrowser(props: ProjectBrowserProps & ProjectBrowserDeps) {
  const { t, store, uiWorkspace, sessions, logger } = props

  // 数据钩子：缺席兜底是模块级稳定函数（调用序恒定）；缺席 → dataReady=false → 占位态。
  const list = (props.useSessions ?? useNoList)(selectWhole)
  const statuses = (props.useSessionStatus ?? useNoStatuses)(selectWhole)
  const wsSnapshot = (props.useWorkspaces ?? useNoWorkspaces)(selectWhole)
  const scroller = (props.useSectionScroller ?? useNoScroller)()

  // 轨态判定：wide 缺省按 true（宽松缺席）；显式 false = Web 载体 56px 折叠轨（轨态分支见下方
  // 渲染段的 early return，位置在全部 hooks 之后——hooks 调用序不得随轨/宽态变化）。
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

  // ── 展开态（持久化归 store 的插件 Config 字段，不用 localStorage）──
  // 单一数据源 = store 快照 + 本地乐观先行：
  //   · store 快照经 useSyncExternalStore 订阅（getExpanded 引用稳定契约：值不变不换数组），
  //     镜像晚答（loading→ready）采纳持久值并 notify 时组件跟随重渲染，不冻结挂载初值；
  //   · 本地开合写「乐观覆盖」（ExpandedOverride）先行（视觉即时）+ setExpanded 持久。
  //     覆盖带写时刻的 store 快照引用作基线：store 一旦换引用（本地写被采纳 / 迟到持久值 /
  //     外部事实）覆盖即失效、回落 store 快照——此后一切开合计算都以最新 store 快照为基线，
  //     过期本地集合永远不会整写回 store 销毁持久值；store 回声与本地相等（幂等 no-op 不
  //     notify）时覆盖继续生效，useSyncExternalStore 自动空转。
  // 订阅驱动重渲染（快照值统一经 effectiveExpanded 实时读取，不绑变量）。
  useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getExpanded(),
    () => store.getExpanded(),
  )
  const localOverride = useRef<ExpandedOverride | null>(null)
  /** 当前生效集合（渲染与开合动作的统一计算基线；实时读 store 而非渲染闭包——异步间隙 store 可能已换值）。 */
  const effectiveExpanded = (): ReadonlySet<string> => {
    const snapshot = store.getExpanded()
    const local = localOverride.current
    return local !== null && local.base === snapshot ? local.ids : new Set(snapshot)
  }
  const expandedIds = effectiveExpanded()
  const expandSeeded = useRef(false)
  const expandUserTouched = useRef(false)
  const [, bumpExpandedRender] = useState(0)
  useEffect(() => {
    // 播种 = 纯视觉默认（不写 store），完整守卫表在 resolveSeedExpansion（含「用户未动过
    // 展开」条件：用户中途全收起后，晚到的 currentGroupId 不再强制展开）。空持久值可能是
    // 「从未持久」也可能是「用户全收起」，契约下不可区分，按「跟随当前组」收敛（文件头已
    // 登记此边界）；用户第一次手动开合才产生持久事实。
    const seedId = resolveSeedExpansion({
      seeded: expandSeeded.current,
      userTouched: expandUserTouched.current,
      currentGroupId,
      expandedSize: effectiveExpanded().size,
    })
    if (seedId === null) return
    expandSeeded.current = true
    localOverride.current = { ids: new Set([seedId]), base: store.getExpanded() }
    bumpExpandedRender((count) => count + 1)
  }, [currentGroupId])

  /**
   * 展开集合变更的统一出口：乐观覆盖先行（真实 React 的视觉扳机）+ store.setExpanded 乐观
   * 持久。持久化失败不回滚视觉（与 store「乐观更新不回滚」同一哲学）、显式 warn 上报——
   * 重载后回到上次成功保存的展开态，会话内浏览不受影响。
   */
  const applyExpanded = (next: ReadonlySet<string>): void => {
    // 用户开合 = 用户意图事实：置位后播种永久失效（用户全收起不该被晚到的当前组覆盖）
    expandUserTouched.current = true
    // 基线须在 setExpanded 之前取（setExpanded 可能同步采纳换引用，之后取到的就是新值）
    localOverride.current = { ids: next, base: store.getExpanded() }
    bumpExpandedRender((count) => count + 1)
    void store.setExpanded([...next]).then((persisted) => {
      if (!persisted) {
        logger?.warn('taiji: 展开态持久化失败（本次会话内仍生效，重载后回到上次成功保存的展开态）')
      }
    })
  }

  const toggleGroup = (id: string): void => {
    const next = new Set(effectiveExpanded())
    if (next.has(id)) next.delete(id)
    else next.add(id)
    applyExpanded(next)
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

  /** 组头/默认头「+」：先发起 startSession 再记 pending（宿主会立即把它选成当前）。begin 带
   * 当时的 currentId 作漂移判定基线：其后快照里 currentId 漂到非可消费形态（宿主复用已映射
   * blank / 用户点了别的会话）即过期清除，不永久武装劫持后续新会话。 */
  const startSessionIn = (projectId: string): void => {
    uiWorkspace.startSession()
    pendingTracker.current.begin(projectId, currentId)
  }

  // ── 交互态（真相在 ref；rerender 是真实 React 的视觉扳机）──
  const armedDeleteId = useRef<string | null>(null)
  const renamingGroupId = useRef<string | null>(null)
  const renamingSessionId = useRef<string | null>(null)
  const newDraftOpen = useRef(false)
  const moveMenu = useRef<{ rowId: string; top: number; left: number } | null>(null)
  // M3：悬停详情卡锚点（行 mouseenter 写 / mouseleave 清）；右键菜单锚点（行 contextmenu
  // 写）；归档子视图开关与筛选档（区头归档钮切入，与主列表互斥）。
  const hoverCard = useRef<{ rowId: string; top: number; left: number } | null>(null)
  const ctxMenu = useRef<{ rowId: string; top: number; left: number } | null>(null)
  const archiveOpen = useRef(false)
  const archiveFilter = useRef<ArchiveFilter>('all')
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

  /** 新建项目草稿提交：建好即展开新组（applyExpanded 持久；夹具里只断言 store 调用）。 */
  const submitNewProject = (value: string, input: InputEventLike['target']): void => {
    const trimmed = value.trim()
    input.value = ''
    if (trimmed === '') return
    void store.createProject(trimmed).then((created) => {
      // then 里读实时生效集合（effectiveExpanded 实时读 store + 覆盖）而非渲染闭包——异步
      // 间隙可能已有开合或 store 已采纳外部事实
      if (created !== null) applyExpanded(new Set(effectiveExpanded()).add(created.id))
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

  /** 悬停详情卡：行 mouseenter 写锚点（贴行右侧 + 视口钳制；夹具事件无几何时锚 0,0）。 */
  const openHoverCard = (rowId: string, event: MouseEventLike): void => {
    const element = event.currentTarget as { getBoundingClientRect?: () => { top: number; right: number } } | undefined
    const rect = typeof element?.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : undefined
    hoverCard.current = { rowId, ...(rect ? anchorRightOfRow(rect) : { top: 0, left: 0 }) }
    rerender((count) => count + 1)
  }

  /** 关详情卡（行 mouseleave；幂等——无卡时不扳机渲染）。 */
  const closeHoverCard = (): void => {
    if (hoverCard.current === null) return
    hoverCard.current = null
    rerender((count) => count + 1)
  }

  /**
   * 右键菜单：行 contextmenu 写锚点（光标定位 + 视口钳制）。preventDefault 压掉浏览器原生
   * 菜单（自绘菜单顶替）；移动弹层若开着一并关掉——两个浮层锚同一行，新交互优先。
   */
  const openCtxMenu = (rowId: string, event: MouseEventLike): void => {
    event.preventDefault()
    moveMenu.current = null
    ctxMenu.current = { rowId, ...anchorAtPoint(event.clientX ?? 0, event.clientY ?? 0) }
    rerender((count) => count + 1)
  }

  /** 关右键菜单（幂等）。 */
  const closeCtxMenu = (): void => {
    if (ctxMenu.current === null) return
    ctxMenu.current = null
    rerender((count) => count + 1)
  }

  // 弹层开着时挂 document 监听（点外/Escape 关层；关层即撤——夹具里弹层恒关，零 DOM 依赖）。
  // 点外判定 = 事件目标不在弹层容器内（targetInsideContainer，与右键菜单同判据）。
  const menu = moveMenu.current
  useEffect(() => {
    if (menu === null) return
    const onPointerDown = (event: MouseEvent): void => {
      if (targetInsideContainer(event.target, '.taiji-pb-menu')) return
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

  // 右键菜单开着时挂关闭监听：点菜单外 / Esc / 任意滚动（capture——列表滚动容器的滚动
  // 不冒泡到 document，捕获阶段才能截到）。滚动的豁免：菜单自身 max-height 70vh 可滚，
  // 滚动源落在菜单容器内 = 用户在操作菜单，不关层（判据对齐 mousedown 的容器内豁免）。
  // 关层即撤——夹具里菜单恒关，零 DOM 依赖。gate 读 ref 而非渲染闭包值：渲染中目标行
  // 消失已清锚点（见 ctxNode 段），此时不再挂监听。
  const ctx = ctxMenu.current
  useEffect(() => {
    if (ctxMenu.current === null) return
    const close = (): void => {
      ctxMenu.current = null
      rerender((count) => count + 1)
    }
    const onPointerDown = (event: MouseEvent): void => {
      if (targetInsideContainer(event.target, '.taiji-pb-ctx')) return
      close()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    const onScroll = (event: Event): void => {
      if (targetInsideContainer(event.target, '.taiji-pb-ctx')) return
      close()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('scroll', onScroll, true)
    }
  })

  // 全部行的索引（含不可见行）：详情卡与右键菜单按 rowId 取行模型（快照更新后重派生重建）。
  const rowsById = new Map<string, SessionRowModel>()
  for (const group of groups) for (const row of group.rows) rowsById.set(row.id, row)

  // 归档子视图数据源：archived 行（visible=false 的归档行在主列表被过滤，这里反向捞起）。
  const archivedCount = wsSnapshot?.archivedSessionIds?.length ?? 0
  const archivedRows = dataReady ? groups.flatMap((group) => group.rows).filter((row) => row.archived) : []

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
        /* 悬停详情卡：enter 立即右弹 / leave 关（重命名态不开——行内容已是输入框，卡是噪音） */
        onMouseEnter={(event: MouseEventLike) => {
          if (renaming) return
          openHoverCard(row.id, event)
        }}
        onMouseLeave={() => { closeHoverCard() }}
        /* 右键菜单：preventDefault 压原生菜单，自绘菜单锚光标定位 */
        onContextMenu={(event: MouseEventLike) => { openCtxMenu(row.id, event) }}
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
      // 折叠组同样可落：落点组强制展开（taiji 父级 drop 后展开同语义）；已展开时不产生
      // 冗余持久写（实时读生效集合显式判空承担）
      if (!effectiveExpanded().has(group.id)) applyExpanded(new Set(effectiveExpanded()).add(group.id))
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

  if (!wide) {
    // 折叠轨态：整槽替换把宿主官方列表（含其轨态两枚入口）整体压掉，轨态入口归本组件——渲染
    // null 会让轨态会话区整块空白（P2 缺陷），这里给最小轨态入口：一枚「新建会话」图标钮。
    // 点击次序对齐宿主轨入口「先经 owner 份额请求展开、后落动作」：expandSidebar 展开侧栏回
    // 宽态，startSession 新建/复用 blank 并立即选中。与组头「+」不同，不记 pendingProjectId——
    // 轨态无项目上下文，新会话按派生规则自然归入默认项目（未映射 blank 的去向）。搜索轨入口
    // 不提供：本浏览器无搜索功能，展开后无承接面（宿主轨态搜索入口落宿主搜索框，已随整槽
    // 替换一并让位），登记该差异。
    return (
      <div className="taiji-pb-rail">
        <button
          type="button"
          className="taiji-pb-rail-add"
          title={t('projects.railNewSession')}
          aria-label={t('projects.railNewSession')}
          onClick={() => {
            props.expandSidebar?.()
            uiWorkspace.startSession()
          }}
        >
          <Icon paths={ICON_PLUS} size={18} />
        </button>
      </div>
    )
  }

  // 悬停详情卡节点：行模型还在快照里才渲染（hover 期间会话被删 = 卡自然消失）。
  const hover = hoverCard.current
  const hoverNode = hover !== null
    ? (() => {
        const row = rowsById.get(hover.rowId)
        if (row === undefined) return null
        return createPortal(
          <div className="taiji-pb-hover-anchor" style={{ top: hover.top, left: hover.left }}>
            <SessionHoverCard t={t} row={row} parent={resolveHoverParent(row, list?.byId)} />
          </div>,
          document.body,
        )
      })()
    : null

  // 右键菜单节点：每路动作先关层再执行（关层节奏不因动作成败变化；复制失败只剩日志留痕）。
  // 目标行已不在当前数据（会话被删 / 数据源变化）→ 渲染 null 之外**清锚点 ref**：悬空锚点
  // 会让 document 关闭监听持续挂着（上方 effect 的 gate 读 ref，清了即不挂/随 cleanup 撤）。
  const ctxRow = ctx !== null && ctxAnchorValid(ctx, rowsById) ? rowsById.get(ctx.rowId) : undefined
  if (ctx !== null && ctxRow === undefined) ctxMenu.current = null
  const ctxNode = ctx !== null && ctxRow !== undefined
    ? createPortal(
        <div className="taiji-pb-ctx-anchor" style={{ top: ctx.top, left: ctx.left }}>
          <SessionContextMenu
            t={t}
            row={ctxRow}
            projects={projectsState.projects}
            currentProjectId={effectiveProjectId(ctx.rowId)}
            onTogglePin={() => {
              closeCtxMenu()
              void (ctxRow.pinned ? uiWorkspace.unpinSession(ctxRow.id) : uiWorkspace.pinSession(ctxRow.id))
            }}
            onRename={() => {
              closeCtxMenu()
              renamingSessionId.current = ctxRow.id
              rerender((count) => count + 1)
            }}
            onArchive={() => {
              closeCtxMenu()
              void uiWorkspace.archiveSession(ctxRow.id)
            }}
            onCopyId={() => {
              closeCtxMenu()
              performCopySessionId({ clipboard: hostClipboard(), logger }, ctxRow.id)
            }}
            onPickProject={(projectId) => {
              closeCtxMenu()
              void store.assignSession(ctx.rowId, projectId)
            }}
          />
        </div>,
        document.body,
      )
    : null

  return (
    <div className="taiji-pb">
      {/* 区头：标题 + 总计数（mono）+ 归档入口 + 新建项目「+」；草稿输入行常挂载、hidden 类切换显隐 */}
      <div className="taiji-pb-head">
        <span className="taiji-pb-head-title">{t('projects.title')}</span>
        <span className="taiji-pb-head-count">{total}</span>
        <span className="taiji-pb-head-flex" />
        <button
          type="button"
          className="taiji-pb-head-arch"
          title={t('projects.archiveEntry', { n: archivedCount })}
          aria-label={t('projects.archiveEntry', { n: archivedCount })}
          aria-expanded={archiveOpen.current}
          onClick={() => {
            archiveOpen.current = !archiveOpen.current
            archiveFilter.current = 'all' // 每次进入重置筛选：进入先看到全量（demo 同感）
            rerender((count) => count + 1)
          }}
        >
          <Icon paths={ICON_ARCHIVE} size={13} />
          {/* 计数角标：0 隐藏（无归档不占注意力；钮本体保留可进空态子视图确认） */}
          {archivedCount > 0 && <span className="taiji-pb-nbadge">{archivedCount}</span>}
        </button>
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
        ) : archiveOpen.current ? (
          /* 归档子视图与主列表互斥（同一滚动容器内整区替换）；恢复后行消失纯数据驱动 */
          <ArchiveSubview
            t={t}
            rows={archivedRows}
            filter={archiveFilter.current}
            onBack={() => {
              archiveOpen.current = false
              rerender((count) => count + 1)
            }}
            onFilterChange={(next) => {
              archiveFilter.current = next
              rerender((count) => count + 1)
            }}
            onUnarchive={(sessionId) => { void uiWorkspace.unarchiveSession(sessionId) }}
          />
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
                  // 关层自带重渲染扳机、与 store 通知解耦：点「当前归属」时 assignSession 幂等
                  // no-op 不 notify，依赖回声的话弹层永远不关（performMovePick 契约）
                  performMovePick(
                    {
                      closeLayer: () => {
                        moveMenu.current = null
                        rerender((count) => count + 1)
                      },
                      assignSession: (sessionId, targetId) => store.assignSession(sessionId, targetId),
                    },
                    menu.rowId,
                    projectId,
                  )
                }}
              />
            </div>,
            document.body,
          )
        : null}
      {/* 悬停详情卡 / 右键菜单：同款 portal-on-open 形态（关态零 DOM 依赖） */}
      {hoverNode}
      {ctxNode}
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
export function createProjectsBrowser(host: ProjectsBrowserHost, deps: { store: ProjectStoreLike & ExpandedPersistenceLike }) {
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
 * @param deps - 本包侧（ProjectStore 实例——M1 装配层创建、与设置页共用同一实例；含 M3
 *   展开态持久面 getExpanded/setExpanded）。
 */
export function installProjectsBrowser(host: ProjectsBrowserHost, deps: { store: ProjectStoreLike & ExpandedPersistenceLike }): void {
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
