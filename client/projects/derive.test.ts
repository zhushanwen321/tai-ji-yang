import { describe, expect, it } from 'vitest'
import {
  currentSessionIdOf,
  deriveGroups,
  formatRelativeTime,
  type SessionListLike,
  type SessionRowModel,
  type SessionStatusLike,
  type SessionSummaryLike,
} from './derive'
import { DEFAULT_PROJECT_ID, type ProjectsState } from './store'

/**
 * 派生层单测（设计 §3 的机器可判部分）。宿主语义判据（可见性 / 状态优先级 / 子会话计数 /
 * 当前选中）逐条对拍宿主 tree.ts 与 Rows.tsx 实装——这里是「插件侧行为 = 宿主行为」的
 * 唯一看守点。被测模块引入链 react-free（derive → store → persist → theme/resolve），
 * 直接 import，无需 tsx 夹具。
 */

/** 造一条会话摘要（默认值 = 一条普通 idle 会话）。 */
function summary(partial: Partial<SessionSummaryLike> & { id: string }): SessionSummaryLike {
  return {
    title: undefined,
    displayTitle: `标题-${partial.id}`,
    running: false,
    retainedBy: {},
    blank: false,
    updatedAt: 1_700_000_000_000,
    ...partial,
  }
}

/** 造快照形态的会话列表（byId 按传入序登记——Object.values 枚举序即此序）。 */
function makeList(summaries: readonly SessionSummaryLike[], phase: 'pending' | 'ready' = 'ready'): SessionListLike {
  const byId: Record<string, SessionSummaryLike> = {}
  for (const item of summaries) byId[item.id] = item
  return { ids: summaries.map((item) => item.id), byId, phase, projectionsBySession: {} }
}

/** 状态表：普通 Map 已满足 StatusMapLike（get 形态）。 */
function makeStatuses(entries: Record<string, SessionStatusLike> = {}): Map<string, SessionStatusLike> {
  return new Map(Object.entries(entries))
}

/** 派生入参的默认骨架（三路事实 + 项目数据）。 */
function derive(
  list: SessionListLike,
  options: {
    statuses?: Map<string, SessionStatusLike>
    archivedIds?: readonly string[]
    pinnedIds?: readonly string[]
    state?: ProjectsState
    currentId?: string | null
  } = {},
) {
  return deriveGroups({
    list,
    statuses: options.statuses ?? makeStatuses(),
    workspaces: { archivedIds: options.archivedIds ?? [], pinnedIds: options.pinnedIds ?? [] },
    state: options.state ?? { projects: [], assignments: {} },
    currentId: options.currentId ?? currentSessionIdOf(list),
  })
}

/** 取组内可见行的 id 序（断言组内序的主形态）。 */
const visibleIdsOf = (rows: readonly SessionRowModel[]): string[] =>
  rows.filter((row) => row.visible).map((row) => row.id)

describe('currentSessionIdOf（当前选中 = 宿主 mainSessionId 同判据）', () => {
  it('byId 枚举序里第一个 retainedBy.mainView > 0 的会话', () => {
    const list = makeList([
      summary({ id: 'a' }),
      summary({ id: 'b', retainedBy: { mainView: 1 } }),
      summary({ id: 'c', retainedBy: { mainView: 2 } }),
    ])
    expect(currentSessionIdOf(list)).toBe('b')
  })

  it('没有保留计数 → null；mainView 0 / 负数不算', () => {
    expect(currentSessionIdOf(makeList([summary({ id: 'a' }), summary({ id: 'b', retainedBy: { mainView: 0 } })]))).toBeNull()
  })
})

describe('归属 / 组序 / 默认项目', () => {
  const STATE: ProjectsState = {
    projects: [
      { id: 'p2', name: '乙' },
      { id: 'p1', name: '甲' },
    ],
    assignments: { s1: 'p1', sGhost: 'p2' },
  }

  function subject() {
    return derive(
      makeList([summary({ id: 's1' }), summary({ id: 's2' }), summary({ id: 'sGhost' })]),
      { state: STATE },
    )
  }

  it('组序 = store 数组序（乙前甲后），默认项目恒最后', () => {
    const { groups } = subject()
    expect(groups.map((group) => group.id)).toEqual(['p2', 'p1', DEFAULT_PROJECT_ID])
    expect(DEFAULT_PROJECT_ID).toBe('')
    expect(groups[2]?.isDefault).toBe(true)
  })

  it('归属：映射进对应命名项目；未映射落默认；悬空映射（指向已删项目）视为未映射', () => {
    // sGhost 的映射指向 p2，但 p2 在 projects 里——注意悬空测试要用真悬空值，见下条
    const { groups } = subject()
    expect(visibleIdsOf(groups.find((group) => group.id === 'p1')?.rows ?? [])).toEqual(['s1'])
    expect(visibleIdsOf(groups.find((group) => group.id === DEFAULT_PROJECT_ID)?.rows ?? [])).toEqual(['s2'])
    // p2 存在所以 sGhost 归 p2（先证正向归属）
    expect(visibleIdsOf(groups.find((group) => group.id === 'p2')?.rows ?? [])).toEqual(['sGhost'])
  })

  it('悬空映射：assignments 指向 projects 里不存在的 id → 落默认项目', () => {
    const { groups } = derive(
      makeList([summary({ id: 's1' })]),
      { state: { projects: [{ id: 'p1', name: '甲' }], assignments: { s1: 'gone' } } },
    )
    expect(visibleIdsOf(groups.find((group) => group.id === DEFAULT_PROJECT_ID)?.rows ?? [])).toEqual(['s1'])
    expect(groups.find((group) => group.id === 'p1')?.rows).toEqual([])
  })

  it('空项目组与默认组恒出现（组来自 projects 数组，不随会话增减消失）；默认组名为空串', () => {
    const { groups, total } = derive(makeList([]), { state: STATE })
    expect(groups).toHaveLength(3)
    expect(groups.map((group) => group.name)).toEqual(['乙', '甲', ''])
    expect(groups.every((group) => group.rows.length === 0)).toBe(true)
    expect(total).toBe(0)
  })
})

describe('组内序与置顶', () => {
  it('组内序 = 快照 ids 序（新 → 旧），客户端零重排', () => {
    const { groups } = derive(makeList([summary({ id: 'old' }), summary({ id: 'new' })]))
    expect(visibleIdsOf(groups[0]?.rows ?? [])).toEqual(['old', 'new'])
  })

  it('置顶行引领所在组（快照序保持），不跨组搬动', () => {
    const list = makeList([
      summary({ id: 'a' }),
      summary({ id: 'p1' }),
      summary({ id: 'b' }),
      summary({ id: 'c' }),
    ])
    const { groups } = derive(list, {
      state: { projects: [{ id: 'px', name: 'X' }], assignments: { p1: 'px' } },
      pinnedIds: ['b'],
    })
    const defaultRows = groups.find((group) => group.isDefault)?.rows
    expect(visibleIdsOf(defaultRows ?? [])).toEqual(['b', 'a', 'c'])
    expect(visibleIdsOf(groups.find((group) => group.id === 'px')?.rows ?? [])).toEqual(['p1'])
  })

  it('当前 blank 置顶其组首，领先置顶行', () => {
    const list = makeList([
      summary({ id: 'pin1' }),
      summary({ id: 'plain' }),
      summary({ id: 'blank1', blank: true, retainedBy: { mainView: 1 }, displayTitle: '' }),
    ])
    const { groups } = derive(list, { pinnedIds: ['pin1'] })
    const rows = groups[0]?.rows ?? []
    expect(visibleIdsOf(rows)).toEqual(['blank1', 'pin1', 'plain'])
    expect(rows[0]?.blank).toBe(true)
    expect(rows[0]?.isCurrent).toBe(true)
  })
})

describe('可见性（宿主 sessionVisible 同判据）', () => {
  it('归档隐藏：visible=false 且不计入 total，行保留在模型里（M3 归档视图的数据基础）', () => {
    const { groups, total } = derive(makeList([summary({ id: 'a' }), summary({ id: 'arch' })]), { archivedIds: ['arch'] })
    const rows = groups[0]?.rows ?? []
    expect(rows.find((row) => row.id === 'a')?.visible).toBe(true)
    const archivedRow = rows.find((row) => row.id === 'arch')
    expect(archivedRow?.visible).toBe(false)
    expect(archivedRow?.archived).toBe(true)
    expect(total).toBe(1)
  })

  it('子会话来源隐藏：origin=subagent → visible=false（但仍参与父行子会话计数）', () => {
    const list: SessionListLike = {
      ...makeList([summary({ id: 'parent' }), summary({ id: 'child', origin: 'subagent', running: true })]),
      projectionsBySession: { parent: { values: { subagentCatalog: [{ id: 'child' }] } } },
    }
    const { groups, total } = derive(list)
    const rows = groups[0]?.rows ?? []
    expect(rows.find((row) => row.id === 'child')?.visible).toBe(false)
    expect(rows.find((row) => row.id === 'parent')?.subagentCount).toBe(1)
    expect(total).toBe(1)
  })

  it('blank 只在等于当前选中时可见；非当前 blank 隐藏', () => {
    const list = makeList([
      summary({ id: 'blankA', blank: true }),
      summary({ id: 'cur', retainedBy: { mainView: 1 } }),
    ])
    const { groups, total } = derive(list)
    const rows = groups[0]?.rows ?? []
    expect(rows.find((row) => row.id === 'blankA')?.visible).toBe(false)
    expect(rows.find((row) => row.id === 'cur')?.visible).toBe(true)
    expect(total).toBe(1)
  })
})

describe('状态映射四态（宿主 Rows.tsx 展示序：待交互 > 运行 > 完成未读 > idle）', () => {
  function stateOf(status?: SessionStatusLike, summaryOverrides: Partial<SessionSummaryLike> = {}, subCount = 0): string {
    // subCount > 0 时挂 N 个运行中的子会话（origin=subagent 不可见，但让父行计数为真值）
    const children = Array.from({ length: subCount }, (_, i) =>
      summary({ id: `c${i}`, running: true, origin: 'subagent' }))
    const list = makeList([summary({ id: 's', ...summaryOverrides }), ...children])
    const statuses = status === undefined ? makeStatuses() : makeStatuses({ s: status })
    const withCatalog: SessionListLike = subCount > 0
      ? { ...list, projectionsBySession: { s: { values: { subagentCatalog: children.map((child) => ({ id: child.id })) } } } }
      : list
    const groups = derive(withCatalog, { statuses }).groups
    return groups[0]?.rows[0]?.state ?? 'unreachable'
  }

  it('wait：三 kind 白名单命中；其他 kind 视为无', () => {
    for (const kind of ['approval', 'plan-review', 'question']) {
      expect(stateOf({ pendingInteraction: { kind }, completionUnread: false })).toBe('wait')
    }
    expect(stateOf({ pendingInteraction: { kind: 'other' }, completionUnread: false })).toBe('idle')
  })

  it('run：status.running 优先 / 回落 summary.running / 子会话计数 > 0；status 显式 false 压过 summary true', () => {
    expect(stateOf({ running: true, completionUnread: false })).toBe('run')
    expect(stateOf(undefined, { running: true })).toBe('run')
    // ?? 只在 null/undefined 时回落：status 显式 false 即否决 summary 的 true（宿主同判 `status?.running ?? s.running`）
    expect(stateOf({ running: false, completionUnread: false }, { running: true })).toBe('idle')
    expect(stateOf(undefined, {}, 2)).toBe('run')
  })

  it('done-unread：completionUnread === true（显式 false 与缺席都不算）', () => {
    expect(stateOf({ completionUnread: true })).toBe('done-unread')
    expect(stateOf({ completionUnread: false })).toBe('idle')
    expect(stateOf(undefined)).toBe('idle')
  })

  it('优先级：wait 压过 run；run 压过 done-unread', () => {
    expect(stateOf({ pendingInteraction: { kind: 'approval' }, running: true, completionUnread: true })).toBe('wait')
    expect(stateOf({ running: true, completionUnread: true })).toBe('run')
  })

  it('子会话计数：status 表优先、回落 summary 的逐子项判定（宿主 runningChildCount 同判）', () => {
    const list: SessionListLike = {
      ...makeList([
        summary({ id: 'parent' }),
        summary({ id: 'c1', running: true }),
        summary({ id: 'c2' }),
        summary({ id: 'c3' }),
      ]),
      projectionsBySession: { parent: { values: { subagentCatalog: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }] } } },
    }
    // c1 走 summary.running=true；c2 被 status 显式压成 false；c3 两侧都无 → 计 1
    const statuses = makeStatuses({ c2: { running: false, completionUnread: false } })
    const { groups } = derive(list, { statuses })
    expect(groups[0]?.rows.find((row) => row.id === 'parent')?.subagentCount).toBe(1)
  })
})

describe('行文案与字段收敛', () => {
  it('blank → 空串；title trim 后非空优先；title 空/空白回落 displayTitle；空 cwd 不进模型', () => {
    const list = makeList([
      summary({ id: 'b', blank: true, displayTitle: '' }),
      summary({ id: 't', title: '  自定义  ', displayTitle: 'fallback' }),
      summary({ id: 'f', title: '   ', displayTitle: 'fallback' }),
      summary({ id: 'c', cwd: '' }),
    ])
    const rows = derive(list).groups[0]?.rows ?? []
    expect(rows.find((row) => row.id === 'b')?.title).toBe('')
    expect(rows.find((row) => row.id === 't')?.title).toBe('自定义')
    expect(rows.find((row) => row.id === 'f')?.title).toBe('fallback')
    expect(rows.find((row) => row.id === 'c')?.cwd).toBeUndefined()
    expect(rows.find((row) => row.id === 'b')?.cwd).toBeUndefined()
  })

  it('updatedAtMs 原样透传；cwd 非空保留', () => {
    const list = makeList([summary({ id: 's', updatedAt: 42, cwd: '/tmp/x' })])
    const row = derive(list).groups[0]?.rows[0]
    expect(row?.updatedAtMs).toBe(42)
    expect(row?.cwd).toBe('/tmp/x')
  })
})

describe('formatRelativeTime（时长档 + 本地日历日差档）', () => {
  /** 固定基准：2026-11-08 12:00 本地时。 */
  const NOW = new Date(2026, 10, 8, 12, 0, 0, 0).getTime()
  const at = (year: number, monthIndex: number, day: number, hour = 12, minute = 0): number =>
    new Date(year, monthIndex, day, hour, minute, 0, 0).getTime()

  it('刚刚：<1 分钟与未来时间戳（时钟漂移兜底）', () => {
    expect(formatRelativeTime(NOW, NOW)).toEqual({ key: 'projects.time.justNow' })
    expect(formatRelativeTime(NOW + 30_000, NOW)).toEqual({ key: 'projects.time.justNow' })
    expect(formatRelativeTime(NOW - 59_999, NOW)).toEqual({ key: 'projects.time.justNow' })
  })

  it('分钟档与小时档的边界值', () => {
    expect(formatRelativeTime(NOW - 60_000, NOW)).toEqual({ key: 'projects.time.minutesAgo', params: { n: 1 } })
    expect(formatRelativeTime(NOW - 3_599_999, NOW)).toEqual({ key: 'projects.time.minutesAgo', params: { n: 59 } })
    expect(formatRelativeTime(NOW - 3_600_000, NOW)).toEqual({ key: 'projects.time.hoursAgo', params: { n: 1 } })
    expect(formatRelativeTime(NOW - 23 * 3_600_000, NOW)).toEqual({ key: 'projects.time.hoursAgo', params: { n: 23 } })
  })

  it('同一天内按时长分档：1.5 小时前（日历上已属昨天）仍是小时档，不是「昨天」', () => {
    const now = at(2026, 10, 8, 0, 30)
    const ms = at(2026, 10, 7, 23, 0) // 前一天深夜，差 1.5h——时长档优先于日历日差档
    expect(formatRelativeTime(ms, now)).toEqual({ key: 'projects.time.hoursAgo', params: { n: 1 } })
  })

  it('跨天档按本地日历日差：昨天 / N 天前（2-6）/ 更早给日期串', () => {
    expect(formatRelativeTime(at(2026, 10, 7, 11), NOW)).toEqual({ key: 'projects.time.yesterday' }) // 差 25h、日差 1
    expect(formatRelativeTime(at(2026, 10, 6, 12), NOW)).toEqual({ key: 'projects.time.daysAgo', params: { n: 2 } })
    expect(formatRelativeTime(at(2026, 10, 2, 12), NOW)).toEqual({ key: 'projects.time.daysAgo', params: { n: 6 } })
    expect(formatRelativeTime(at(2026, 10, 1, 12), NOW)).toEqual({ key: 'projects.time.older', params: { date: '2026-11-01' } })
    expect(formatRelativeTime(at(2025, 2, 5, 9), NOW)).toEqual({ key: 'projects.time.older', params: { date: '2025-03-05' } })
  })
})
