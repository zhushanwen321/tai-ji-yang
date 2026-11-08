/**
 * client/projects/derive.ts —— 项目分组列表的派生层（设计 §3，纯函数）。
 *
 * 输入 = 三路事实（宿主会话列表 / 宿主状态表 / 宿主工作区集合）+ 插件侧项目数据（store 的
 * ProjectsState）+ 当前选中 id；输出 = 分组视图模型（组序 / 组内序 / 行状态 / 可见性全部在此
 * 定型）。组件层零派生逻辑——它只消费 ProjectGroupModel 渲染，测试也只对拍这里。
 *
 * 宿主语义逐条照抄（来源 = 宿主 `packages/client/ui-workspace/src/client/tree.ts`，行号为
 * 0.2.x 实装）：
 *   · 当前选中（mainSessionId，tree.ts:37-39）：byId 枚举序里第一个 `retainedBy.mainView > 0`
 *     的会话——注意是 **byId 枚举序**不是 ids 序，两条序在宿主推送里可能不同，照抄不「修正」；
 *   · 行可见性（sessionVisible，tree.ts:229-243）：`origin === 'subagent'` 隐藏、非当前 blank
 *     隐藏、归档隐藏（M2 只有「隐藏归档」一档，等价宿主 archivedFilter='default'）；
 *   · 行状态优先级（Rows.tsx:398-430）：pendingInteraction（三 kind 白名单）> running > 完成
 *     未读 > idle；运行子会话计数（runningChildCount，tree.ts:381-386）按「status 表优先、
 *     回落 summary」逐子项判 running 计数；
 *   · 置顶行引领所在组（宿主 pinned 集合语义，taiji 无置顶、不砍宿主能力）。
 *
 * 与宿主的刻意差异（设计 §3 登记过）：分组轴换成插件侧 Project（悬空映射视为未映射 → 落默认
 * 项目）；blank 当前会话置顶其所在组首（taiji 锚定语义），领先置顶行——blank 是「正在创建中的
 * 入口」，时序上最新，压在一切之上；置顶行次之；其余按快照序。
 *
 * 相对时间：返回 { key, params } 短语形态而不是拼好的字符串——「刚刚 / N 分钟前」必须双语可译
 * （t 的插值格式与宿主 locale 服务一致：`{n}` 占位），日期档（YYYY-MM-DD）作为 {date} 参数
 * 传入，短语本身仍走词条。
 */
import type { LocaleKey } from '../locale'
import { DEFAULT_PROJECT_ID, type ProjectsState } from './store'

// ── 宿主数据的最小结构类型（不 import 任何 @deepseek-ai/* 包，D3）──────────────────

/** 宿主 `SessionSummary` 的同构子集（派生只消费这些字段）。 */
export interface SessionSummaryLike {
  id: string
  /** 持久标题（空 = 从未命名；空白由 sessionTitleOf trim 收敛）。 */
  title?: string
  /** 展示标题兜底（title 空时的行文案来源）。 */
  displayTitle: string
  /** 工作目录；宿主可能给 undefined 或空串（空串按无处理，照抄宿主 tree.ts:407）。 */
  cwd?: string
  parentId?: string
  /** 'subagent' = 子会话（行不可见，但仍是子会话计数的目录来源）。 */
  origin?: string
  running: boolean
  /** mainView 保留计数：> 0 即当前选中（宿主判据，见文件头）。 */
  retainedBy: { mainView?: number }
  /** blank = 刚创建、还没有首条消息的空会话。 */
  blank: boolean
  /** 最近更新时间（ms epoch）。 */
  updatedAt: number
}

/** 宿主 `SessionStatus` 的同构子集。 */
export interface SessionStatusLike {
  running?: boolean
  /** 等待用户交互；kind 只认三值白名单，其余视为无（宿主 visiblePendingKind 同判）。 */
  pendingInteraction?: { kind: string }
  /** 完成未读（宿主 done 绿点数据来源）。 */
  completionUnread: boolean
}

/** 宿主子会话目录条目（subagentCatalog 的成员，只需要 id 参与运行计数）。 */
export interface SubagentCatalogEntryLike {
  id: string
}

/** 宿主 `SessionListState` 的同构子集。 */
export interface SessionListLike {
  /** 快照序（新 → 旧）：组内序的唯一来源，客户端零重排。 */
  ids: string[]
  byId: Record<string, SessionSummaryLike>
  phase: 'pending' | 'ready'
  /** 每会话投影视图（子会话计数目录在这里）。 */
  projectionsBySession: Record<string, { values: { subagentCatalog?: readonly SubagentCatalogEntryLike[] } }>
}

/** 宿主状态表（`useSessionStatus(s => s)` 的返回形态）。 */
export interface StatusMapLike {
  get(id: string): SessionStatusLike | undefined
}

/** 派生要用的宿主工作区集合（`useWorkspaces(s => s)` 快照的最小子集）。 */
export interface WorkspacesSetsLike {
  archivedIds: readonly string[]
  pinnedIds: readonly string[]
}

// ── 视图模型 ────────────────────────────────────────────────────────────────────

/** 行状态四态（优先级见文件头；渲染形态由组件层定）。 */
export type SessionRowState = 'wait' | 'run' | 'done-unread' | 'idle'

/** 会话行视图模型。rows 数组含不可见行（visible=false，M3 归档子视图的数据基础），渲染层过滤。 */
export interface SessionRowModel {
  id: string
  /** 行文案：blank = 空串（组件层换 t 词条）；否则 title（trim 后非空）回落 displayTitle。 */
  title: string
  updatedAtMs: number
  cwd?: string
  /** 父会话 id（fork 来源；详情卡「父会话」行的数据源，无父不带字段）。 */
  parentId?: string
  blank: boolean
  pinned: boolean
  /** 在宿主归档集合里（M2 隐藏；字段保留供 M3 归档视图消费）。 */
  archived: boolean
  isCurrent: boolean
  state: SessionRowState
  /** 运行中的直接子会话数（宿主 runningChildCount 同判）。 */
  subagentCount: number
  /** 可见性终判：subagent 来源 / 非当前 blank / 归档 三者任一即 false。 */
  visible: boolean
}

/** 项目组视图模型（命名项目恒渲染——组来自 projects 数组，不随会话增减消失）。 */
export interface ProjectGroupModel {
  id: string
  /** 默认项目为空串（组件层换 t 兜底文案；命名项目 = store 里的用户名）。 */
  name: string
  isDefault: boolean
  /** 当前选中会话所在组（「当前」chip + 展开体 accent 细线的判据）。 */
  isCurrent: boolean
  /** 全部行（含不可见），组内序见文件头。 */
  rows: SessionRowModel[]
}

/** 待交互 kind 白名单（宿主 visiblePendingKind 同集：其余 kind 视为无）。 */
const PENDING_INTERACTION_KINDS = new Set(['approval', 'plan-review', 'question'])

/**
 * 当前选中会话 id（宿主 mainSessionId 同判据：byId 枚举序第一个 `retainedBy.mainView > 0`）。
 *
 * 导出成纯函数：组件层每次渲染先调它，再把结果喂 deriveGroups——「谁选中」与「怎么分组」
 * 两个关注点各占一个可单测的入口。
 */
export function currentSessionIdOf(list: SessionListLike): string | null {
  for (const summary of Object.values(list.byId)) {
    if ((summary.retainedBy.mainView ?? 0) > 0) return summary.id
  }
  return null
}

/**
 * 运行中的直接子会话数：宿主 runningChildCount 逐行照抄——目录里每个子会话按
 * 「status 表优先、回落 summary」判 running，计 true 的条数；无目录 = 0。
 */
function runningSubagentCount(list: SessionListLike, statuses: StatusMapLike, sessionId: string): number {
  const catalog = list.projectionsBySession[sessionId]?.values.subagentCatalog
  if (catalog === undefined) return 0
  let count = 0
  for (const child of catalog) {
    const running = statuses.get(child.id)?.running ?? list.byId[child.id]?.running
    if (running === true) count += 1
  }
  return count
}

/** 行状态四态（优先级 = 宿主 Rows.tsx 的展示序：待交互 > 运行 > 完成未读 > idle）。 */
function rowStateOf(
  summary: SessionSummaryLike,
  status: SessionStatusLike | undefined,
  subagentCount: number,
): SessionRowState {
  const kind = status?.pendingInteraction?.kind
  if (kind !== undefined && PENDING_INTERACTION_KINDS.has(kind)) return 'wait'
  if ((status?.running ?? summary.running) === true || subagentCount > 0) return 'run'
  if (status?.completionUnread === true) return 'done-unread'
  return 'idle'
}

/** 行文案：blank = ''（组件层换 t 词条）；title trim 后非空优先，空则回落 displayTitle。 */
function titleOf(summary: SessionSummaryLike): string {
  if (summary.blank) return ''
  const stored = summary.title?.trim()
  return stored === undefined || stored === '' ? summary.displayTitle : stored
}

/**
 * 派生分组列表。
 *
 * 组序：命名项目按 store 数组序 → 默认项目恒最后（两个恒定组，即便零会话也出现在结果里）。
 * 组内序：当前 blank（若可见）置顶组首 → 置顶行（快照序）→ 其余（快照序）→ 不可见行垫底。
 * 悬空映射（指向已删项目）视为未映射 → 落默认项目。
 *
 * @returns groups = 全部组（含空组）；total = 全部可见行数（区头总计数与空态判据）。
 */
export function deriveGroups(input: {
  list: SessionListLike
  statuses: StatusMapLike
  workspaces: WorkspacesSetsLike
  state: ProjectsState
  currentId: string | null
}): { groups: ProjectGroupModel[]; total: number } {
  const { list, statuses, workspaces, state, currentId } = input
  const projectIds = new Set(state.projects.map((project) => project.id))
  const archivedIds = new Set(workspaces.archivedIds)
  const pinnedIds = new Set(workspaces.pinnedIds)

  // 组桶：命名项目 + 默认项目；行先按快照序入桶，出桶时做稳定三段划分。
  const orderKeys = [...state.projects.map((project) => project.id), DEFAULT_PROJECT_ID]
  const buckets = new Map<string, SessionRowModel[]>()
  for (const key of orderKeys) buckets.set(key, [])

  for (const id of list.ids) {
    const summary = list.byId[id]
    if (summary === undefined) continue
    const isCurrent = id === currentId
    const archived = archivedIds.has(id)
    const subagentCount = runningSubagentCount(list, statuses, id)
    const row: SessionRowModel = {
      id,
      title: titleOf(summary),
      updatedAtMs: summary.updatedAt,
      ...(summary.cwd !== undefined && summary.cwd !== '' ? { cwd: summary.cwd } : {}),
      ...(summary.parentId !== undefined && summary.parentId !== '' ? { parentId: summary.parentId } : {}),
      blank: summary.blank,
      pinned: pinnedIds.has(id),
      archived,
      isCurrent,
      state: rowStateOf(summary, statuses.get(id), subagentCount),
      subagentCount,
      visible: summary.origin !== 'subagent' && !(summary.blank && !isCurrent) && !archived,
    }
    // 归属：映射值指向不存在的项目 = 悬空 = 未映射 → 默认项目。
    const mapped = state.assignments[id]
    const groupKey = mapped !== undefined && projectIds.has(mapped) ? mapped : DEFAULT_PROJECT_ID
    buckets.get(groupKey)?.push(row)
  }

  let total = 0
  const groups: ProjectGroupModel[] = orderKeys.map((key) => {
    const all = buckets.get(key) ?? []
    // 三段稳定划分（filter 保序）：当前 blank → 置顶 → 其余；不可见行垫底（不计入 total）。
    const rows = [
      ...all.filter((row) => row.visible && row.blank),
      ...all.filter((row) => row.visible && !row.blank && row.pinned),
      ...all.filter((row) => row.visible && !row.blank && !row.pinned),
      ...all.filter((row) => !row.visible),
    ]
    total += rows.filter((row) => row.visible).length
    return {
      id: key,
      name: key === DEFAULT_PROJECT_ID ? '' : state.projects.find((project) => project.id === key)?.name ?? '',
      isDefault: key === DEFAULT_PROJECT_ID,
      isCurrent: currentId !== null && rows.some((row) => row.isCurrent),
      rows,
    }
  })

  return { groups, total }
}

// ── 相对时间 ────────────────────────────────────────────────────────────────────

/** 可译短语：key = locale 词条，params = 插值参数（宿主 t 的 `{n}` 占位格式）。 */
export interface RelativeTimePhrase {
  key: LocaleKey
  params?: Record<string, string | number>
}

/** 一天的毫秒数（跨天档的日差计算基准）。 */
const DAY_MS = 24 * 60 * 60 * 1000

/** 本地时区的当日零点（ms epoch）——「昨天 / N 天前」按本地日历日差，不做 UTC 换算。 */
function startOfDay(ms: number): number {
  const date = new Date(ms)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/** 本地时区的 YYYY-MM-DD（再早档的日期形态；补零两位）。 */
function isoDateOf(ms: number): string {
  const date = new Date(ms)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * 相对时间短语：刚刚 / N 分钟前 / N 小时前 / 昨天 / N 天前 / YYYY-MM-DD。
 *
 * 同一天内按**时长**分档（<1 分钟 / <1 小时 / <24 小时）；跨天起按**本地日历日差**分档
 * （1 天 = 昨天，2-6 天 = N 天前，更早 = 日期）。两套基准刻意并存：同一天内「3 小时前」
 * 比「今天」信息量大，跨天后「昨天」比「27 小时前」符合口语。未来时间戳（时钟漂移）按
 * 「刚刚」兜底，不产生负数档位。
 */
export function formatRelativeTime(ms: number, now: number = Date.now()): RelativeTimePhrase {
  const diff = now - ms
  if (diff < 60_000) return { key: 'projects.time.justNow' }
  if (diff < 3_600_000) return { key: 'projects.time.minutesAgo', params: { n: Math.floor(diff / 60_000) } }
  if (diff < DAY_MS) return { key: 'projects.time.hoursAgo', params: { n: Math.floor(diff / 3_600_000) } }
  const dayDelta = Math.round((startOfDay(now) - startOfDay(ms)) / DAY_MS)
  if (dayDelta === 1) return { key: 'projects.time.yesterday' }
  if (dayDelta >= 2 && dayDelta <= 6) return { key: 'projects.time.daysAgo', params: { n: dayDelta } }
  return { key: 'projects.time.older', params: { date: isoDateOf(ms) } }
}
