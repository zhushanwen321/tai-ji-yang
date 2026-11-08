import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { collectElements, createTsxLoader, elementsWithClass, textOf, type FakeElement } from '../testing/load-tsx'
import { TAIJI_LOCALE_NS, zh } from '../locale'
import type { ProjectStoreLike } from './store'

/**
 * 项目分组浏览器单测（M2 整槽替换 + M3 提前的拖拽段）。锁死五件事的可机器化部分：
 *   · 注册契约：注入槽名 sidebar.workspaces、优先级避让（-10 起向下）、区间占满降级不注册
 *     + warn、注册 disposer 透传、选项只传 name/priority/locale；
 *   · 动作接线：install 闭包捕获 uiWorkspace/sessions（行点击打开、组头「+」新建、归档、
 *     取消置顶、会话重命名走宿主 sessions.using 合同）；
 *   · 新建归组：findPendingAssignment 判定 + PendingProjectTracker 一次性消费（mock 快照序列）；
 *   · 渲染 smoke：区头/组头/chip/计数/行四态/徽标族/空态/加载态/数据缺席占位/折叠轨最小入口/
 *     滚动衔接 ref 绑定；删除两段确认与新建草稿行（taiji-section.test 同款夹具技巧）；
 *   · 拖拽（双 MIME 分流）：classifyDragOver 判定、行 dragstart 写 session MIME、组头
 *     dragover/drop 的 session 改归属与 project 换位分流、自组/自落静默、重命名态禁拖。
 *
 * 夹具边界（单次渲染语义）：真实宿主渲染、展开动画、弹层 portal 归 L3 场景；弹层内容经
 * 纯组件 ProjectMoveMenu 直接测，组件内关态零 DOM 依赖。拖拽高亮类名是 rerender 后的
 * 渲染产物（夹具不重渲染），夹具层锁行为面：preventDefault / dropEffect / store 调用分流。
 * M3 同范式：详情卡 / 归档子视图 / 右键菜单内容经 SessionHoverCard / ArchiveSubview /
 * SessionContextMenu 纯组件直接测；浮层开合与点外/Esc/滚动关闭的 document 监听归 L3 真渲染。
 */

const BROWSER_PATH = fileURLToPath(new URL('./browser.tsx', import.meta.url))

/** 模块出口面（loader 装载后按此消费；类型断言收敛在各 helper 内）。 */
interface BrowserModule {
  ProjectBrowser: (props: Record<string, unknown>) => FakeElement | null
  ProjectMoveMenu: (props: Record<string, unknown>) => FakeElement
  SessionHoverCard: (props: Record<string, unknown>) => FakeElement
  ArchiveSubview: (props: Record<string, unknown>) => FakeElement
  SessionContextMenu: (props: Record<string, unknown>) => FakeElement
  installProjectsBrowser: (host: unknown, deps: { store: unknown }) => void
  createProjectsBrowser: (host: unknown, deps: { store: unknown }) => (props: Record<string, unknown>) => FakeElement
  resolveBrowserPriority: (entries: readonly { options: { priority?: number } }[]) => number | undefined
  findPendingAssignment: (input: Record<string, unknown>) => { sessionId: string; projectId: string } | null
  createPendingProjectTracker: () => {
    begin(projectId: string, beginCurrentId: string | null): void
    consume(input: Record<string, unknown>): { sessionId: string; projectId: string } | null
  }
  performSessionRename: (deps: Record<string, unknown>, sessionId: string, title: string) => void
  classifyDragOver: (types: readonly string[]) => 'session' | 'project' | null
  resolveHoverParent: (row: { parentId?: string }, byId: Record<string, unknown> | undefined) => unknown
  abbreviateHomePath: (cwd: string) => string
  performCopySessionId: (deps: Record<string, unknown>, sessionId: string) => void
  archiveBucketOf: (updatedAtMs: number, now?: number) => string
  resolveSeedExpansion: (state: {
    seeded: boolean
    userTouched: boolean
    currentGroupId: string | undefined
    expandedSize: number
  }) => string | null
  targetInsideContainer: (target: unknown, selector: string) => boolean
  performMovePick: (
    deps: { closeLayer(): void; assignSession(sessionId: string, projectId: string): Promise<boolean> },
    rowId: string,
    projectId: string,
  ) => void
  ctxAnchorValid: (anchor: { rowId: string } | null, rowsById: ReadonlyMap<string, unknown>) => boolean
  SESSION_DRAG_MIME: string
  PROJECT_DRAG_MIME: string
  PROJECTS_BROWSER_SLOT: string
  PREFERRED_BROWSER_PRIORITY: number
  PRIORITY_FLOOR: number
}

const loader = createTsxLoader()
const browserModule = loader.load(BROWSER_PATH) as unknown as BrowserModule
const { PROJECTS_BROWSER_SLOT, PREFERRED_BROWSER_PRIORITY, PRIORITY_FLOOR } = browserModule

// ── 测试替身 ─────────────────────────────────────────────────────────────────────

/** t 座位替身：查 zh 字典 + `{n}` 占位插值（宿主 locale 服务的求值面同构）。 */
const t = (key: string, params?: Record<string, unknown>): string => {
  const template = zh[key as keyof typeof zh]
  if (typeof template !== 'string') return key
  let out = template
  for (const [name, value] of Object.entries(params ?? {})) {
    out = out.split(`{${name}}`).join(String(value))
  }
  return out
}

/** 宿主动作服务替身：全部调用入账。 */
function fakeUiWorkspace() {
  const calls: { method: string; args: unknown[] }[] = []
  return {
    calls,
    uiWorkspace: {
      openSession: (target: string) => { calls.push({ method: 'openSession', args: [target] }) },
      startSession: (...args: unknown[]) => { calls.push({ method: 'startSession', args }) },
      archiveSession: async (id: string) => { calls.push({ method: 'archiveSession', args: [id] }) },
      unarchiveSession: async (id: string) => { calls.push({ method: 'unarchiveSession', args: [id] }) },
      pinSession: async (id: string) => { calls.push({ method: 'pinSession', args: [id] }) },
      unpinSession: async (id: string) => { calls.push({ method: 'unpinSession', args: [id] }) },
    },
  }
}

/** sessions 服务替身：记录 using 合同调用；rename 结果可编排。 */
function fakeSessions(result: { ok: boolean; error?: { message: string } } = { ok: true }) {
  const usingCalls: { sessionId: string; options: unknown; renameTitle: string | undefined }[] = []
  const sessions = {
    using: <T,>(
      sessionId: string,
      options: { source: string },
      operation: (reference: unknown) => T,
    ): Promise<T> => {
      const renameTitle: { title: string }[] = []
      const reference = { binding: { session: { rename: (title: string) => { renameTitle.push({ title }); return Promise.resolve(result) } } } }
      const value = operation(reference)
      usingCalls.push({ sessionId, options, renameTitle: renameTitle[0]?.title })
      return Promise.resolve(value)
    },
  }
  return { sessions, usingCalls }
}

/** 假宿主：slots（inject/register/entries）+ 动作服务 + logger（避让失败告警入账）。 */
function fakeBrowserHost(options: {
  entries?: readonly { options: { priority?: number } }[]
  uiWorkspace?: unknown
  sessions?: unknown
} = {}) {
  const registrations: { key: string; options: Record<string, unknown>; component: unknown }[] = []
  const pending = new Map<string, (() => (() => void) | void)[]>()
  const warns: string[] = []
  const errors: string[] = []
  let disposerSeq = 0
  const disposers: string[] = []
  const defaultUi = fakeUiWorkspace()
  const host = {
    slots: {
      inject(key: string, callback: () => (() => void) | void) {
        const list = pending.get(key) ?? []
        list.push(callback)
        pending.set(key, list)
        return () => {}
      },
      register(regOptions: Record<string, unknown>, component: unknown) {
        registrations.push({ key: regOptions.name as string, options: regOptions, component })
        const token = `dispose:${++disposerSeq}`
        disposers.push(token)
        return () => { disposers.splice(disposers.indexOf(token), 1) }
      },
      entries(key: string) {
        expect(key).toBe(PROJECTS_BROWSER_SLOT)
        return options.entries ?? []
      },
    },
    uiWorkspace: options.uiWorkspace ?? defaultUi.uiWorkspace,
    sessions: options.sessions ?? fakeSessions().sessions,
    logger: {
      warn(message: string) { warns.push(message) },
      error(message: string) { errors.push(message) },
    },
  }
  return {
    host,
    registrations,
    warns,
    errors,
    disposers,
    /** host 实际使用的动作面（外部传入 face 时账本由调用方自持）。 */
    ui: host.uiWorkspace,
    sessions: host.sessions,
    /** 默认 uiWorkspace face 的调用账本（未传外部 face 时有效）。 */
    uiCalls: defaultUi.calls,
    /** 槽声明就位（宿主语义：声明已存在则同步执行），返回各 callback 的返回值。 */
    declare(key: string): ((() => void) | void)[] {
      const callbacks = pending.get(key) ?? []
      pending.delete(key)
      return callbacks.map((callback) => callback())
    },
  }
}

/**
 * 假 store：状态只读 + 动作全记录（与 taiji-section.test 的 fakeProjectStore 同形态）。
 * expanded = M3 展开态持久面的 mock（真实 store.ts 由并行任务实装，浏览器测试不依赖它）；
 * expandFail 编排 setExpanded 持久化失败分支。
 */
function fakeStore(
  initial: {
    projects?: { id: string; name: string }[]
    assignments?: Record<string, string>
    expanded?: readonly string[]
    expandFail?: boolean
  } = {},
) {
  const state = { projects: initial.projects ?? [], assignments: initial.assignments ?? {}, expanded: [...(initial.expanded ?? [])] }
  const calls: { method: string; args: unknown[] }[] = []
  const listeners = new Set<() => void>()
  const store = {
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    getExpanded: () => state.expanded,
    setExpanded: async (ids: readonly string[]) => {
      calls.push({ method: 'setExpanded', args: [[...ids]] })
      if (initial.expandFail) return false
      state.expanded = [...ids]
      return true
    },
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
    assignSession: async (sessionId: string, projectId: string) => {
      calls.push({ method: 'assignSession', args: [sessionId, projectId] })
      return true
    },
    dispose: () => {},
  }
  return {
    store: store as unknown as ProjectStoreLike,
    calls,
    /**
     * 模拟镜像晚答采纳（真实 store 的 applySnapshot 路径）：换新数组引用（getExpanded 引用
     * 稳定契约——值变更必换引用）并 notify 全部订阅者。用于复现「挂载时镜像 loading、
     * 其后才 ready 采纳持久值」的迟到时序。
     */
    adoptExternalExpanded(ids: readonly string[]): void {
      state.expanded = [...ids]
      for (const listener of [...listeners]) listener()
    },
  }
}

// ── 数据样本（三路事实 + 项目数据）──────────────────────────────────────────────

const NOW = Date.now()
const MINUTE = 60_000

/** 会话快照：s1 当前（p1 组，子会话运行中）· s2 待交互+置顶 · s3 完成未读 · 归档与子会话各一条（不可见）。 */
const SAMPLE_LIST = {
  ids: ['s1', 's2', 's3', 'sArch', 'sSub'],
  byId: {
    s1: { id: 's1', title: '主题令牌三层重构', displayTitle: '', cwd: '/w/main', running: false, retainedBy: { mainView: 1 }, blank: false, updatedAt: NOW - 5 * MINUTE },
    s2: { id: 's2', title: '', displayTitle: '插槽系统侦查', running: false, retainedBy: {}, blank: false, updatedAt: NOW - 3 * 3_600_000 },
    s3: { id: 's3', title: '', displayTitle: '对接联调', running: false, retainedBy: {}, blank: false, updatedAt: NOW - 30 * 3_600_000 },
    sArch: { id: 'sArch', title: '', displayTitle: '旧版调色板迁移', running: false, retainedBy: {}, blank: false, updatedAt: NOW - 90_000 * MINUTE },
    sSub: { id: 'sSub', title: '', displayTitle: '子会话', origin: 'subagent', running: true, retainedBy: {}, blank: false, updatedAt: NOW },
  },
  phase: 'ready' as const,
  projectionsBySession: { s1: { values: { subagentCatalog: [{ id: 'sSub' }] } } },
}

const SAMPLE_STATUSES = new Map([
  ['s2', { pendingInteraction: { kind: 'approval' }, completionUnread: false }],
  ['s3', { completionUnread: true }],
])

const SAMPLE_WORKSPACES = { archivedSessionIds: ['sArch'], pinnedSessionIds: ['s2'] }

const SAMPLE_STORE_STATE = {
  projects: [{ id: 'p1', name: '太极侧栏' }],
  assignments: { s1: 'p1' },
}

/** 组装组件 props（数据钩子替身 + 可覆盖项）。 */
function browserProps(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    t,
    useSessions: (selector: (state: unknown) => unknown) => selector(SAMPLE_LIST),
    useSessionStatus: (selector: (state: unknown) => unknown) => selector(SAMPLE_STATUSES),
    useWorkspaces: (selector: (state: unknown) => unknown) => selector(SAMPLE_WORKSPACES),
    ...overrides,
  }
}

/** 渲染组件本体并返回元素全集（root 为 null 时 elements 为空数组）。 */
function renderBrowser(
  deps: { store: ProjectStoreLike; uiWorkspace: unknown; sessions: unknown; logger?: unknown },
  props: Record<string, unknown> = {},
): { root: FakeElement | null; elements: FakeElement[] } {
  const root = browserModule.ProjectBrowser({ ...browserProps(props), ...deps, ...props })
  return { root, elements: root === null ? [] : collectElements(root) }
}

/** 按类名 + 属性值找元素（行/组的定位主形态）。 */
const findBy = (elements: readonly FakeElement[], className: string, attr: string, value: unknown): FakeElement | undefined =>
  elementsWithClass(elements, className).find((element) => element.props[attr] === value)

/** 元素子树内按 aria-label 找图标钮。 */
const buttonByLabel = (scope: FakeElement, label: string): FakeElement => {
  const found = elementsWithClass(collectElements(scope), 'taiji-pb-abtn').find((button) => button.props['aria-label'] === label)
  if (found === undefined) throw new Error(`找不到 aria-label 为「${label}」的动作钮`)
  return found
}

/** 取组头元素（data-project-id 定位组 → 内层 .taiji-pb-ghead；'' = 默认项目）。 */
const headOf = (elements: readonly FakeElement[], projectId: string): FakeElement => {
  const group = findBy(elements, 'taiji-pb-group', 'data-project-id', projectId)
  if (group === undefined) throw new Error(`找不到项目组 data-project-id="${projectId}"`)
  const head = elementsWithClass(collectElements(group), 'taiji-pb-ghead')[0]
  if (head === undefined) throw new Error(`项目组 ${projectId} 无组头`)
  return head
}

/** 拖拽事件夹具（browser.tsx 内 DragEventLike 同构的最小结构；preventDefault 调用可查）。 */
function fakeDragEvent(init: {
  types?: readonly string[]
  data?: Record<string, string>
  relatedTarget?: unknown
  currentTarget?: unknown
} = {}) {
  const payload = { ...init.data }
  let prevented = false
  return {
    /** preventDefault 是否被调（HTML5 DnD「允许成为落点」的契约面）。 */
    prevented: (): boolean => prevented,
    dataTransfer: {
      types: init.types ?? [],
      getData: (mime: string): string => payload[mime] ?? '',
      setData: (mime: string, value: string): void => { payload[mime] = value },
      effectAllowed: undefined as string | undefined,
      dropEffect: undefined as string | undefined,
    },
    relatedTarget: init.relatedTarget ?? null,
    currentTarget: init.currentTarget,
    preventDefault: (): void => { prevented = true },
  }
}

// ── 注册契约 ─────────────────────────────────────────────────────────────────────

describe('installProjectsBrowser 注册契约', () => {
  it('空槽：注入 sidebar.workspaces，priority -10，选项只传 name/priority/locale', () => {
    const fake = fakeBrowserHost()
    browserModule.installProjectsBrowser(fake.host, { store: fakeStore().store })
    const results = fake.declare(PROJECTS_BROWSER_SLOT)
    expect(fake.registrations).toHaveLength(1)
    const [registration] = fake.registrations
    expect(registration.key).toBe('sidebar.workspaces')
    expect(registration.options).toEqual({
      name: 'sidebar.workspaces',
      priority: PREFERRED_BROWSER_PRIORITY,
      locale: TAIJI_LOCALE_NS,
    })
    expect(PREFERRED_BROWSER_PRIORITY).toBe(-10)
    expect(typeof registration.component).toBe('function')
    expect(results).toHaveLength(1)
    expect(typeof results[0]).toBe('function') // register 的 disposer 经 inject 返回值透传
  })

  it('优先级避让：-10 被占取 -11；-10/-11 都被占取 -12；未显式 priority 的占用者记 0、不挡 -10', () => {
    expect(browserModule.resolveBrowserPriority([])).toBe(-10)
    expect(browserModule.resolveBrowserPriority([{ options: { priority: -10 } }])).toBe(-11)
    expect(browserModule.resolveBrowserPriority([{ options: { priority: -10 } }, { options: { priority: -11 } }])).toBe(-12)
    expect(browserModule.resolveBrowserPriority([{ options: {} }, { options: { priority: 0 } }])).toBe(-10)
    // 经 install 全链路再验一档（entries 在声明就位时巡检）
    const fake = fakeBrowserHost({ entries: [{ options: { priority: -10 } }] })
    browserModule.installProjectsBrowser(fake.host, { store: fakeStore().store })
    fake.declare(PROJECTS_BROWSER_SLOT)
    expect(fake.registrations[0]?.options.priority).toBe(-11)
  })

  it('区间占满（-10 … -100 全占）：不注册 + warn 一条 + inject 返回 no-op disposer（回落宿主原生列表）', () => {
    const entries = Array.from({ length: PRIORITY_FLOOR * -1 - 9 }, (_, index) => ({ options: { priority: -10 - index } }))
    expect(entries).toHaveLength(91) // -10 … -100
    const fake = fakeBrowserHost({ entries })
    browserModule.installProjectsBrowser(fake.host, { store: fakeStore().store })
    const results = fake.declare(PROJECTS_BROWSER_SLOT)
    expect(fake.registrations).toHaveLength(0)
    expect(fake.warns).toHaveLength(1)
    expect(fake.warns[0]).toContain('sidebar.workspaces')
    expect(fake.warns[0]).toContain('回落宿主原生列表')
    expect(results).toHaveLength(1)
    expect(typeof results[0]).toBe('function')
  })

  it('注册 disposer 透传：宿主 register 的 disposer 即 inject 回调的返回值', () => {
    const fake = fakeBrowserHost()
    browserModule.installProjectsBrowser(fake.host, { store: fakeStore().store })
    const [disposer] = fake.declare(PROJECTS_BROWSER_SLOT) as (() => void)[]
    expect(fake.disposers).toHaveLength(1)
    disposer()
    expect(fake.disposers).toHaveLength(0) // 执行后撤除
  })
})

// ── 动作接线（install 闭包捕获服务）─────────────────────────────────────────────

describe('动作接线：install 捕获 uiWorkspace / sessions，组件经闭包消费', () => {
  function assemble() {
    const uiWorkspace = fakeUiWorkspace()
    const sessionsFace = fakeSessions()
    const host = fakeBrowserHost({ uiWorkspace: uiWorkspace.uiWorkspace, sessions: sessionsFace.sessions })
    const store = fakeStore(SAMPLE_STORE_STATE)
    browserModule.installProjectsBrowser(host.host, { store: store.store })
    host.declare(PROJECTS_BROWSER_SLOT)
    const shell = host.registrations[0]?.component as (props: Record<string, unknown>) => FakeElement
    expect(typeof shell).toBe('function')
    /** 渲染 shell（宿主槽渲染语义：owner/hook/数据钩子/t 经 props 注入，服务经闭包）。 */
    const render = (props: Record<string, unknown> = {}) => {
      const element = shell(browserProps(props))
      expect(element.type).toBe(browserModule.ProjectBrowser)
      const inner = (element.type as (props: Record<string, unknown>) => FakeElement)(element.props)
      return { root: element, elements: collectElements(inner) }
    }
    return { render, uiWorkspace, sessions: sessionsFace, store }
  }

  it('行点击 → uiWorkspace.openSession(会话 id)', () => {
    const { render, uiWorkspace } = assemble()
    const { elements } = render()
    const row = findBy(elements, 'taiji-pb-row', 'data-session-id', 's2')
    expect(row).toBeDefined()
    ;(row!.props.onClick as () => void)()
    expect(uiWorkspace.calls).toEqual([{ method: 'openSession', args: ['s2'] }])
  })

  it('组头「+」→ uiWorkspace.startSession() 无参调用（归组锚点由 pending 消费完成）', () => {
    const { render, uiWorkspace } = assemble()
    const { elements } = render()
    const group = findBy(elements, 'taiji-pb-group', 'data-project-id', 'p1')
    expect(group).toBeDefined()
    ;(buttonByLabel(group!, '在此项目新建会话').props.onClick as (event: unknown) => void)({ stopPropagation: () => {} })
    expect(uiWorkspace.calls).toEqual([{ method: 'startSession', args: [] }])
  })

  it('行 hover 归档钮 → uiWorkspace.archiveSession(id)', () => {
    const { render, uiWorkspace } = assemble()
    const { elements } = render()
    const row = findBy(elements, 'taiji-pb-row', 'data-session-id', 's1')
    ;(buttonByLabel(row!, '归档会话').props.onClick as () => void)()
    expect(uiWorkspace.calls).toEqual([{ method: 'archiveSession', args: ['s1'] }])
  })

  it('置顶图钉点按 → uiWorkspace.unpinSession(id)（M2 置顶入口 = 图钉点按）', () => {
    const { render, uiWorkspace } = assemble()
    const { elements } = render()
    const row = findBy(elements, 'taiji-pb-row', 'data-session-id', 's2')
    const pin = elementsWithClass(collectElements(row!), 'taiji-pb-pin')[0]
    expect(pin?.props['aria-label']).toBe('取消置顶')
    ;(pin!.props.onClick as () => void)()
    expect(uiWorkspace.calls).toEqual([{ method: 'unpinSession', args: ['s2'] }])
  })
})

// ── 新建归组：判定 + 一次性消费 ────────────────────────────────────────────────

describe('新建会话归组（pendingProjectId 消费逻辑）', () => {
  /** blank 未映射会话快照（startSession 后宿主推送的形态）。 */
  const blankList = (blankId: string, mapped: Record<string, string> = {}) => ({
    ids: [blankId, 's1'],
    byId: {
      [blankId]: { id: blankId, title: '', displayTitle: '', running: false, retainedBy: { mainView: 1 }, blank: true, updatedAt: NOW },
      s1: { id: 's1', title: '', displayTitle: '存量', running: false, retainedBy: {}, blank: false, updatedAt: NOW },
    },
    phase: 'ready' as const,
    projectionsBySession: {},
  })

  it('findPendingAssignment：当前 blank 未映射 → 命中；非 blank / 已映射 / 无当前 → null', () => {
    const list = blankList('b1')
    expect(browserModule.findPendingAssignment({ pendingProjectId: 'p1', currentId: 'b1', list, assignments: {} }))
      .toEqual({ sessionId: 'b1', projectId: 'p1' })
    expect(browserModule.findPendingAssignment({ pendingProjectId: 'p1', currentId: 's1', list, assignments: {} })).toBeNull()
    expect(browserModule.findPendingAssignment({ pendingProjectId: 'p1', currentId: 'b1', list, assignments: { b1: 'p2' } })).toBeNull()
    expect(browserModule.findPendingAssignment({ pendingProjectId: 'p1', currentId: null, list, assignments: {} })).toBeNull()
    // 归默认项目也是合法目标（'' = 删映射键的幂等写）
    expect(browserModule.findPendingAssignment({ pendingProjectId: '', currentId: 'b1', list, assignments: {} }))
      .toEqual({ sessionId: 'b1', projectId: '' })
  })

  it('PendingProjectTracker 按快照序列一次性消费：在途快照（currentId 未漂移）保持等待，blank 到达即命中', () => {
    const tracker = browserModule.createPendingProjectTracker()
    expect(tracker.consume({ currentId: null, list: blankList('b1'), assignments: {} })).toBeNull() // 无 pending 恒 null
    tracker.begin('p1', 's1') // 点「+」时当前会话是 s1（此后漂移判定的基线）
    // 快照 1：宿主建 blank 需要若干快照才到达，期间 currentId 仍是 s1（未漂移）→ 不误杀，保持等待
    expect(tracker.consume({ currentId: 's1', list: blankList('b1'), assignments: {} })).toBeNull()
    // 快照 2：blank 出现且成为当前选中、无映射 → 命中
    expect(tracker.consume({ currentId: 'b1', list: blankList('b1'), assignments: {} }))
      .toEqual({ sessionId: 'b1', projectId: 'p1' })
    // 快照 3（消费后的重复通知）：一次性，消费即清
    expect(tracker.consume({ currentId: 'b1', list: blankList('b1'), assignments: {} })).toBeNull()
    // 再次 begin 后可重新消费（连点两组以最后一击为准；基线 = 再次点击时的当前会话）
    tracker.begin('p2', 'b1')
    expect(tracker.consume({ currentId: 'b1', list: blankList('b1'), assignments: {} }))
      .toEqual({ sessionId: 'b1', projectId: 'p2' })
  })

  it('pending 过期清除：currentId 漂移到别的会话（用户点了别的行）→ 清除，其后到达的未映射 blank 不被误归组', () => {
    const tracker = browserModule.createPendingProjectTracker()
    tracker.begin('p1', 's1')
    // 用户点了 s2：currentId 漂移且非「未映射 blank」可消费形态 → 判定过期清除（返回仍 null）
    expect(tracker.consume({ currentId: 's2', list: blankList('b1'), assignments: {} })).toBeNull()
    // 之后外部入口新建的未映射 blank 成为当前 → pending 已清除，不再消费（不劫持）
    expect(tracker.consume({ currentId: 'b1', list: blankList('b1'), assignments: {} })).toBeNull()
  })

  it('pending 过期清除：宿主复用已映射 blank（漂移到已映射 blank）→ 同样清除，不抢改既有归属', () => {
    const tracker = browserModule.createPendingProjectTracker()
    tracker.begin('p1', 's1')
    // 宿主复用已归过组的 blank：currentId 漂移到它（已映射 → 不可消费）→ 过期清除
    expect(tracker.consume({ currentId: 'bOld', list: blankList('bOld', { bOld: 'p2' }), assignments: { bOld: 'p2' } })).toBeNull()
    expect(tracker.consume({ currentId: 'b1', list: blankList('b1'), assignments: {} })).toBeNull() // 已解除武装
  })

  it('begin 时无当前会话（currentId null）：null 不算漂移，blank 到达仍可消费', () => {
    const tracker = browserModule.createPendingProjectTracker()
    tracker.begin('p1', null)
    expect(tracker.consume({ currentId: null, list: blankList('b1'), assignments: {} })).toBeNull() // 未漂移，等待
    expect(tracker.consume({ currentId: 'b1', list: blankList('b1'), assignments: {} }))
      .toEqual({ sessionId: 'b1', projectId: 'p1' })
  })

  it('组件消费闭环的接线形态：shell 闭包携带 store，组头「+」只调 startSession 不直写 store', () => {
    // 归属写入由快照更新驱动的 effect 完成（消费逻辑已在上两条 tracker 用例锁死）；这里锁
    // 「点 + 的瞬间不发生归属写」——写早了会把 pending 算到 startSession 之前的旧当前会话头上。
    const fake = fakeBrowserHost()
    const storeFace = fakeStore(SAMPLE_STORE_STATE)
    browserModule.installProjectsBrowser(fake.host, { store: storeFace.store })
    fake.declare(PROJECTS_BROWSER_SLOT)
    const shell = fake.registrations[0]?.component as (props: Record<string, unknown>) => FakeElement
    const element = shell(browserProps())
    const inner = (element.type as (props: Record<string, unknown>) => FakeElement)(element.props)
    const elements = collectElements(inner)
    const group = findBy(elements, 'taiji-pb-group', 'data-project-id', 'p1')
    ;(buttonByLabel(group!, '在此项目新建会话').props.onClick as (event: unknown) => void)({ stopPropagation: () => {} })
    expect(fake.uiCalls).toEqual([{ method: 'startSession', args: [] }])
    expect(storeFace.calls).toEqual([]) // 归属写只在快照消费时发生
  })
})

// ── 会话重命名合同 ─────────────────────────────────────────────────────────────

describe('performSessionRename（宿主 sessions.using 合同）', () => {
  it('成功（ok:true）：经 using(id, {source: workspaceOperation}, …) 调 rename，无错误日志', () => {
    const face = fakeSessions({ ok: true })
    const errors: string[] = []
    browserModule.performSessionRename(
      { sessions: face.sessions, logger: { warn() {}, error(message: string) { errors.push(message) } } },
      's1',
      '新标题',
    )
    expect(face.usingCalls).toEqual([{ sessionId: 's1', options: { source: 'workspaceOperation' }, renameTitle: '新标题' }])
    expect(errors).toEqual([])
  })

  it('被拒（ok:false）：logger.error 一条，含会话 id 与原因', async () => {
    const face = fakeSessions({ ok: false, error: { message: 'session not found' } })
    const errors: string[] = []
    browserModule.performSessionRename(
      { sessions: face.sessions, logger: { warn() {}, error(message: string) { errors.push(message) } } },
      'sX',
      '名字',
    )
    await Promise.resolve() // then 链结算
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('sX')
    expect(errors[0]).toContain('session not found')
  })

  it('传输异常（using reject）：logger.error 一条，不外抛', async () => {
    const errors: string[] = []
    const sessions = {
      using: () => Promise.reject(new Error('connection lost')),
    }
    expect(() => {
      browserModule.performSessionRename(
        { sessions, logger: { warn() {}, error(message: string) { errors.push(message) } } },
        's1',
        '名',
      )
    }).not.toThrow()
    await Promise.resolve()
    await Promise.resolve()
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('connection lost')
  })
})

// ── 移动到项目弹层（纯组件）────────────────────────────────────────────────────

describe('ProjectMoveMenu（移动到项目弹层列表）', () => {
  const projects = [
    { id: 'p1', name: '甲' },
    { id: 'p2', name: '乙' },
  ]

  it('列出默认项目 + 全部命名项目，勾标当前归属', () => {
    const menu = browserModule.ProjectMoveMenu({ t, projects, currentProjectId: 'p2', onPick: () => {} })
    const items = elementsWithClass(collectElements(menu), 'taiji-pb-menu-item')
    expect(items.map((item) => item.props['data-project-id'])).toEqual(['', 'p1', 'p2'])
    expect(textOf(items[0]!)).toContain('未分组')
    const current = items.find((item) => item.props['aria-current'] === true)
    expect(current?.props['data-project-id']).toBe('p2')
    expect(elementsWithClass(collectElements(menu), 'taiji-pb-menu-check')).toHaveLength(1)
  })

  it('点选 → onPick(项目 id)；归回默认 = onPick(\'\')', () => {
    const picks: string[] = []
    const menu = browserModule.ProjectMoveMenu({ t, projects, currentProjectId: 'p1', onPick: (id: string) => { picks.push(id) } })
    const items = elementsWithClass(collectElements(menu), 'taiji-pb-menu-item')
    ;(items[0]!.props.onClick as () => void)()
    ;(items[2]!.props.onClick as () => void)()
    expect(picks).toEqual(['', 'p2'])
  })
})

describe('performMovePick（弹层点选：关层不依赖 store 回声）', () => {
  it('点「当前归属」（assignSession 幂等 no-op、不产生 notify）：仍无条件先关层再写归属', () => {
    const events: string[] = []
    browserModule.performMovePick(
      {
        closeLayer: () => { events.push('close') },
        assignSession: async () => { events.push('assign'); return true }, // 幂等形态：值未变不写不 notify
      },
      's1',
      'p1', // s1 本就归属 p1（点的是当前归属）
    )
    expect(events).toEqual(['close', 'assign'])
  })
})

describe('targetInsideContainer（关层豁免判定：mousedown / scroll 同判据）', () => {
  it('目标落在菜单容器内 → true（豁免不关层）；容器外 / 无 closest / null → false（关层）', () => {
    const menuContainer = { tag: 'ctx' }
    const inside = { closest: (selector: string) => (selector === '.taiji-pb-ctx' ? menuContainer : null) }
    expect(browserModule.targetInsideContainer(inside, '.taiji-pb-ctx')).toBe(true) // 菜单自身内容滚动
    const outside = { closest: () => null }
    expect(browserModule.targetInsideContainer(outside, '.taiji-pb-ctx')).toBe(false) // 列表滚动
    expect(browserModule.targetInsideContainer({}, '.taiji-pb-ctx')).toBe(false) // 无 closest（文本节点等）
    expect(browserModule.targetInsideContainer(null, '.taiji-pb-ctx')).toBe(false) // 无目标
  })
})

describe('ctxAnchorValid（右键菜单锚点有效性）', () => {
  it('目标行在当前数据 → 有效；行消失 / 无锚点 → 无效（调用方渲染 null 并清 ctxMenu ref）', () => {
    const rows = new Map([['s1', { id: 's1' }]])
    expect(browserModule.ctxAnchorValid({ rowId: 's1' }, rows)).toBe(true)
    expect(browserModule.ctxAnchorValid({ rowId: 'gone' }, rows)).toBe(false) // 会话被删 / 数据源变化
    expect(browserModule.ctxAnchorValid(null, rows)).toBe(false)
  })
})

// ── 拖拽（M3 提前：行拖改归属 / 组头拖换位，双 MIME 分流）─────────────────────────

describe('拖拽：行拖改归属 + 组头拖换位（双 MIME 分流）', () => {
  const { SESSION_DRAG_MIME, PROJECT_DRAG_MIME } = browserModule

  /** 两命名组夹具：p1 含 s1（当前会话），s2/s3 在默认组（无映射）。 */
  const TWO_PROJECTS = { projects: [{ id: 'p1', name: '甲' }, { id: 'p2', name: '乙' }], assignments: { s1: 'p1' } }

  function subject(
    initial: { projects?: { id: string; name: string }[]; assignments?: Record<string, string> } = TWO_PROJECTS,
  ) {
    const storeFace = fakeStore(initial)
    const fake = fakeBrowserHost()
    const { elements } = renderBrowser({ store: storeFace.store, uiWorkspace: fake.ui, sessions: fake.sessions })
    return { storeFace, elements }
  }

  it('classifyDragOver 分流：project 优先 / session / 无关拖拽 null（types 是 dragover 阶段唯一判别通道）', () => {
    expect(browserModule.classifyDragOver([PROJECT_DRAG_MIME])).toBe('project')
    expect(browserModule.classifyDragOver([SESSION_DRAG_MIME])).toBe('session')
    expect(browserModule.classifyDragOver(['Files', SESSION_DRAG_MIME])).toBe('session')
    expect(browserModule.classifyDragOver(['Files'])).toBeNull()
    expect(browserModule.classifyDragOver([])).toBeNull()
    // 两类同时命中物理不可达（一次拖拽只写一种 MIME），到达时 project 优先（taiji 同序）
    expect(browserModule.classifyDragOver([SESSION_DRAG_MIME, PROJECT_DRAG_MIME])).toBe('project')
  })

  it('行 dragstart：写 session MIME（值 = 行 id）+ effectAllowed move；dragend 复位不 throw', () => {
    const { elements } = subject()
    const row = findBy(elements, 'taiji-pb-row', 'data-session-id', 's2')
    expect(row?.props.draggable).toBe(true)
    const start = fakeDragEvent()
    ;(row!.props.onDragStart as (event: unknown) => void)(start)
    expect(start.dataTransfer.getData(SESSION_DRAG_MIME)).toBe('s2')
    expect(start.dataTransfer.effectAllowed).toBe('move')
    ;(row!.props.onDragEnd as () => void)()
  })

  it('组头 dragover 双 MIME 分流：session/project 各自命中才 preventDefault + dropEffect；默认头不接换位；无关拖拽不响应', () => {
    const { elements } = subject()
    // session MIME 悬停命名组头：允许落点 + 落点效果 move（session 改归属的 dragover 面）
    const sessionOver = fakeDragEvent({ types: [SESSION_DRAG_MIME] })
    ;(headOf(elements, 'p1').props.onDragOver as (event: unknown) => void)(sessionOver)
    expect(sessionOver.prevented()).toBe(true)
    expect(sessionOver.dataTransfer.dropEffect).toBe('move')
    // project MIME 悬停命名组头：换位落点同样允许（高亮锚点与 session 独立，drop 分流见下）
    const projectOver = fakeDragEvent({ types: [PROJECT_DRAG_MIME] })
    ;(headOf(elements, 'p2').props.onDragOver as (event: unknown) => void)(projectOver)
    expect(projectOver.prevented()).toBe(true)
    expect(projectOver.dataTransfer.dropEffect).toBe('move')
    // project MIME 悬停默认组头：不响应（默认头只接 session 改归属，taiji DefaultProjectHead 同构）
    const projectOverDefault = fakeDragEvent({ types: [PROJECT_DRAG_MIME] })
    ;(headOf(elements, '').props.onDragOver as (event: unknown) => void)(projectOverDefault)
    expect(projectOverDefault.prevented()).toBe(false)
    // 无关拖拽（文件拖入窗口）：不 preventDefault（浏览器不派发 drop，不误触高亮）
    const unrelated = fakeDragEvent({ types: ['Files'] })
    ;(headOf(elements, 'p1').props.onDragOver as (event: unknown) => void)(unrelated)
    expect(unrelated.prevented()).toBe(false)
  })

  it('dragleave 真离开（relatedTarget null / 缺席）不 throw；子元素抖动不算离开；drop 不依赖高亮态', () => {
    const { storeFace, elements } = subject()
    const head = headOf(elements, 'p1')
    ;(head.props.onDragOver as (event: unknown) => void)(fakeDragEvent({ types: [SESSION_DRAG_MIME] }))
    // 子元素间抖动（relatedTarget 仍被组头包含）：不清高亮分支
    const inner = { tag: 'span' }
    ;(head.props.onDragLeave as (event: unknown) => void)(fakeDragEvent({
      relatedTarget: inner,
      currentTarget: { contains: (node: unknown) => node === inner },
    }))
    // 真离开（relatedTarget null）：清；随后 drop 仍按 types 分流正常工作（不读高亮状态）
    ;(head.props.onDragLeave as (event: unknown) => void)(fakeDragEvent({}))
    const drop = fakeDragEvent({ types: [SESSION_DRAG_MIME], data: { [SESSION_DRAG_MIME]: 's2' } })
    ;(head.props.onDrop as (event: unknown) => void)(drop)
    expect(drop.prevented()).toBe(true)
    expect(storeFace.calls).toEqual([{ method: 'assignSession', args: ['s2', 'p1'] }])
  })

  it('drop 改归属：session drop 到组头（含默认头 = 归回默认）→ store.assignSession；自组拖自组 no-op', () => {
    const { storeFace, elements } = subject()
    // s2 在默认组 → drop 到 p2 头 = 改归属（折叠组同样可落：drop 不看展开态）。
    // M3 起 drop 强制展开走 applyExpanded（多出 setExpanded 持久写，展开语义另行单测），
    // 本用例只锁归属写分流：对账先滤掉 setExpanded。
    const assigns = () => storeFace.calls.filter((call) => call.method !== 'setExpanded')
    ;(headOf(elements, 'p2').props.onDrop as (event: unknown) => void)(
      fakeDragEvent({ types: [SESSION_DRAG_MIME], data: { [SESSION_DRAG_MIME]: 's2' } }),
    )
    expect(assigns()).toEqual([{ method: 'assignSession', args: ['s2', 'p2'] }])
    // s1 在 p1 组 → drop 到默认头 = 归回默认（assignSession(id, '')）
    ;(headOf(elements, '').props.onDrop as (event: unknown) => void)(
      fakeDragEvent({ types: [SESSION_DRAG_MIME], data: { [SESSION_DRAG_MIME]: 's1' } }),
    )
    expect(assigns()).toEqual([
      { method: 'assignSession', args: ['s2', 'p2'] },
      { method: 'assignSession', args: ['s1', ''] },
    ])
    // 自组拖自组（s1 已在 p1）→ no-op 不写 store
    ;(headOf(elements, 'p1').props.onDrop as (event: unknown) => void)(
      fakeDragEvent({ types: [SESSION_DRAG_MIME], data: { [SESSION_DRAG_MIME]: 's1' } }),
    )
    expect(assigns()).toHaveLength(2)
  })

  it('组头换位：project drop 到其他命名组头 → reorderProjects(拖动 id, 目标 id)；自拖自落静默；默认头不接', () => {
    const { storeFace, elements } = subject()
    ;(headOf(elements, 'p2').props.onDrop as (event: unknown) => void)(
      fakeDragEvent({ types: [PROJECT_DRAG_MIME], data: { [PROJECT_DRAG_MIME]: 'p1' } }),
    )
    expect(storeFace.calls).toEqual([{ method: 'reorderProjects', args: ['p1', 'p2'] }])
    // 自拖自落（p1 拖回 p1 头）：组件内静默
    ;(headOf(elements, 'p1').props.onDrop as (event: unknown) => void)(
      fakeDragEvent({ types: [PROJECT_DRAG_MIME], data: { [PROJECT_DRAG_MIME]: 'p1' } }),
    )
    expect(storeFace.calls).toHaveLength(1)
    // project drop 到默认头：不响应（不产生「移到末尾」——taiji 默认头无换位落点）
    ;(headOf(elements, '').props.onDrop as (event: unknown) => void)(
      fakeDragEvent({ types: [PROJECT_DRAG_MIME], data: { [PROJECT_DRAG_MIME]: 'p1' } }),
    )
    expect(storeFace.calls).toHaveLength(1)
  })

  it('组头 dragstart 与禁拖：命名组头写 project MIME + move；默认头恒 draggable=false；重命名态兜底拦截', () => {
    const { elements } = subject()
    expect(headOf(elements, 'p1').props.draggable).toBe(true)
    const start = fakeDragEvent()
    ;(headOf(elements, 'p1').props.onDragStart as (event: unknown) => void)(start)
    expect(start.dataTransfer.getData(PROJECT_DRAG_MIME)).toBe('p1')
    expect(start.dataTransfer.effectAllowed).toBe('move')
    expect(headOf(elements, '').props.draggable).toBe(false)
    // 重命名态禁拖：点 pencil 进入行内重命名后，dragstart 兜底 preventDefault 且不写载荷
    //（真浏览器里 draggable=false 根本不发起 dragstart，兜底防冒泡/夹具形态——taiji 同款双保险）
    const p2 = findBy(elements, 'taiji-pb-group', 'data-project-id', 'p2')!
    ;(buttonByLabel(p2, '重命名项目').props.onClick as (event: unknown) => void)({ stopPropagation: () => {} })
    const duringRename = fakeDragEvent()
    ;(headOf(elements, 'p2').props.onDragStart as (event: unknown) => void)(duringRename)
    expect(duringRename.prevented()).toBe(true)
    expect(duringRename.dataTransfer.getData(PROJECT_DRAG_MIME)).toBe('')
  })
})

// ── 渲染 smoke ──────────────────────────────────────────────────────────────────

describe('渲染 smoke（taiji-section.test 同款夹具技巧）', () => {
  function subject(overrides: Record<string, unknown> = {}) {
    const fake = fakeBrowserHost()
    const deps = { store: fakeStore(SAMPLE_STORE_STATE).store, uiWorkspace: fake.ui, sessions: fake.sessions, logger: fake.host.logger }
    return { ...renderBrowser(deps, overrides), fake }
  }

  it('完整数据：区头（标题 + 总计数）+ 命名组在前默认组殿后 + 当前组 chip + 行结构（状态点/标题/徽标族/右槽）', () => {
    const { elements } = subject()
    // 区头
    expect(textOf(elementsWithClass(elements, 'taiji-pb-head-title')[0]!)).toBe('项目')
    const headCount = elementsWithClass(elements, 'taiji-pb-head-count')[0]
    expect(textOf(headCount!)).toBe('3') // s1/s2/s3 可见（归档与子会话隐藏）
    // 组序：p1 → 默认（data-project-id 空串）
    const groupIds = elementsWithClass(elements, 'taiji-pb-group').map((group) => group.props['data-project-id'])
    expect(groupIds).toEqual(['p1', ''])
    // 默认组名 = 兜底文案「未分组」；当前组（s1 在 p1）带 chip 与 data-current
    const defaultHead = elementsWithClass(collectElements(findBy(elements, 'taiji-pb-group', 'data-project-id', '')!), 'taiji-pb-gname')[0]
    expect(textOf(defaultHead!)).toBe('未分组')
    const currentGroup = findBy(elements, 'taiji-pb-group', 'data-project-id', 'p1')
    expect(currentGroup?.props['data-current']).toBe(true)
    expect(textOf(elementsWithClass(collectElements(currentGroup!), 'taiji-pb-chip')[0]!)).toBe('当前')
    // 行四态：s1 run（子会话计数）· s2 wait（置顶 + 待交互文案替换时间）· s3 done-unread
    expect(elementsWithClass(elements, 'taiji-pb-dot-run')).toHaveLength(1)
    expect(elementsWithClass(elements, 'taiji-pb-dot-wait')).toHaveLength(1)
    expect(elementsWithClass(elements, 'taiji-pb-dot-done-unread')).toHaveLength(1)
    const s1 = findBy(elements, 'taiji-pb-row', 'data-session-id', 's1')
    expect(textOf(elementsWithClass(collectElements(s1!), 'taiji-pb-title')[0]!)).toBe('主题令牌三层重构')
    expect(textOf(elementsWithClass(collectElements(s1!), 'taiji-pb-sub')[0]!)).toBe('1')
    expect(textOf(elementsWithClass(collectElements(s1!), 'taiji-pb-time')[0]!)).toBe('5 分钟前')
    const s2 = findBy(elements, 'taiji-pb-row', 'data-session-id', 's2')
    expect(textOf(elementsWithClass(collectElements(s2!), 'taiji-pb-waittext')[0]!)).toBe('等待确认')
    expect(elementsWithClass(collectElements(s2!), 'taiji-pb-pin')).toHaveLength(1)
    // 行首无品牌图标：行内只有状态点一个装饰位（svg 只出现在动作钮/图钉/徽标）
    const s3 = findBy(elements, 'taiji-pb-row', 'data-session-id', 's3')
    expect(elementsWithClass(collectElements(s3!), 'taiji-pb-dot')).toHaveLength(1)
    // 不可见行不在树里：归档 / 子会话来源
    expect(findBy(elements, 'taiji-pb-row', 'data-session-id', 'sArch')).toBeUndefined()
    expect(findBy(elements, 'taiji-pb-row', 'data-session-id', 'sSub')).toBeUndefined()
  })

  it('数据钩子缺席：渲染「数据服务未就绪」占位，不 throw、无组', () => {
    const { elements } = subject({
      useSessions: undefined,
      useSessionStatus: undefined,
      useWorkspaces: undefined,
    })
    expect(textOf(elementsWithClass(elements, 'taiji-pb-unavailable')[0]!)).toBe('数据服务未就绪')
    expect(elementsWithClass(elements, 'taiji-pb-group')).toHaveLength(0)
  })

  it('快照 pending：读取中 + 三条骨架行', () => {
    const { elements } = subject({
      useSessions: (selector: (state: unknown) => unknown) => selector({ ...SAMPLE_LIST, phase: 'pending' }),
    })
    expect(textOf(elementsWithClass(elements, 'taiji-pb-loading')[0]!)).toBe('读取中')
    expect(elementsWithClass(elements, 'taiji-pb-skeleton')).toHaveLength(3)
    expect(elementsWithClass(elements, 'taiji-pb-group')).toHaveLength(0)
  })

  it('全部组零可见会话：空态文案（组头仍渲染）', () => {
    const emptyList = { ids: [], byId: {}, phase: 'ready' as const, projectionsBySession: {} }
    const { elements } = subject({
      useSessions: (selector: (state: unknown) => unknown) => selector(emptyList),
      useWorkspaces: (selector: (state: unknown) => unknown) => selector({ archivedSessionIds: [], pinnedSessionIds: [] }),
    })
    expect(textOf(elementsWithClass(elements, 'taiji-pb-empty')[0]!)).toBe('暂无会话')
    expect(elementsWithClass(elements, 'taiji-pb-group').map((group) => group.props['data-project-id'])).toEqual(['p1', ''])
  })

  it('wide=false（折叠轨）：渲染最小轨态入口，点击先 expandSidebar 再 startSession', () => {
    // 序列断言需两路回调写同一账本：外部注入 uiWorkspace face 与 expandSidebar 都推 order
    const order: string[] = []
    const fake = fakeBrowserHost({
      uiWorkspace: {
        openSession: () => {},
        startSession: () => { order.push('startSession') },
        archiveSession: async () => {},
        unarchiveSession: async () => {},
        pinSession: async () => {},
        unpinSession: async () => {},
      },
    })
    const { root, elements } = renderBrowser(
      { store: fakeStore(SAMPLE_STORE_STATE).store, uiWorkspace: fake.ui, sessions: fake.sessions },
      { wide: false, expandSidebar: () => { order.push('expandSidebar') } },
    )
    expect(root).not.toBeNull()
    const rail = elementsWithClass(elements, 'taiji-pb-rail')[0]!
    const button = elementsWithClass(collectElements(rail), 'taiji-pb-rail-add')[0]!
    expect(button.props['aria-label']).toBe('新建会话')
    // 轨态是最小入口：宽态的区头/组结构不渲染（轨态会话区不再整块空白）
    expect(elementsWithClass(elements, 'taiji-pb-head')).toHaveLength(0)
    expect(elementsWithClass(elements, 'taiji-pb-group')).toHaveLength(0)
    ;(button.props.onClick as () => void)()
    // 宿主轨入口同款次序：先经 owner 份额请求展开侧栏，再新建/复用 blank
    expect(order).toEqual(['expandSidebar', 'startSession'])
  })

  it('wide=false 且 expandSidebar 缺席：点击只新建会话（owner 份额宽松缺席不炸）', () => {
    const { fake, elements } = subject({ wide: false })
    const button = elementsWithClass(elements, 'taiji-pb-rail-add')[0]!
    ;(button.props.onClick as () => void)()
    expect(fake.uiCalls.map((call) => call.method)).toEqual(['startSession'])
  })

  it('wide 缺省按宽态：渲染完整浏览器（区头在场，无轨态入口）', () => {
    const { root, elements } = subject()
    expect(root).not.toBeNull()
    expect(elementsWithClass(elements, 'taiji-pb-head-title')).toHaveLength(1)
    expect(elementsWithClass(elements, 'taiji-pb-rail')).toHaveLength(0)
  })

  it('滚动衔接：useSectionScroller 的 bindScrollerRef 绑到列表滚动容器；缺席时不绑', () => {
    const bindScrollerRef = (instance: unknown) => { void instance }
    const { elements } = subject({ useSectionScroller: () => ({ bindScrollerRef }) })
    expect(elementsWithClass(elements, 'taiji-pb-list')[0]?.props.ref).toBe(bindScrollerRef)
    const absent = subject()
    expect(absent.elements.filter((element) => element.props.ref !== undefined)).toEqual([])
  })

  it('删除两段确认：首击武装不写 store，第二击执行；pointerleave 复位后重新武装', () => {
    const storeFace = fakeStore(SAMPLE_STORE_STATE)
    const fake = fakeBrowserHost()
    const { elements } = renderBrowser(
      { store: storeFace.store, uiWorkspace: fake.ui, sessions: fake.sessions },
    )
    const group = findBy(elements, 'taiji-pb-group', 'data-project-id', 'p1')
    const head = elementsWithClass(collectElements(group!), 'taiji-pb-ghead')[0]!
    const trash = buttonByLabel(group!, '删除项目')
    const click = () => { (trash.props.onClick as (event: unknown) => void)({ stopPropagation: () => {} }) }
    click()
    expect(storeFace.calls).toEqual([]) // 第一击只武装
    click()
    expect(storeFace.calls).toEqual([{ method: 'deleteProject', args: ['p1'] }])
    // 复位支：武装后 pointerleave 复位，再次单击只重新武装
    const storeFace2 = fakeStore(SAMPLE_STORE_STATE)
    const second = renderBrowser({ store: storeFace2.store, uiWorkspace: fake.ui, sessions: fake.sessions })
    const group2 = findBy(second.elements, 'taiji-pb-group', 'data-project-id', 'p1')
    const trash2 = buttonByLabel(group2!, '删除项目')
    const click2 = () => { (trash2.props.onClick as (event: unknown) => void)({ stopPropagation: () => {} }) }
    click2()
    ;(elementsWithClass(collectElements(group2!), 'taiji-pb-ghead')[0]!.props.onPointerLeave as () => void)()
    click2()
    expect(storeFace2.calls).toEqual([]) // 复位后重新武装，未到第二击
    void head
  })

  it('新建项目草稿行：Enter 提交 trim 后非空名并清空草稿；空名丢弃不调用', () => {
    const storeFace = fakeStore(SAMPLE_STORE_STATE)
    const fake = fakeBrowserHost()
    const { elements } = renderBrowser({ store: storeFace.store, uiWorkspace: fake.ui, sessions: fake.sessions })
    const draft = elementsWithClass(elements, 'taiji-pb-newdraft')[0]!
    expect(draft.props.placeholder).toBe('新建项目')
    const target = { value: '  新项目  ' }
    ;(draft.props.onKeyDown as (event: unknown) => void)({ key: 'Enter', target, preventDefault: () => {} })
    expect(target.value).toBe('')
    ;(draft.props.onKeyDown as (event: unknown) => void)({ key: 'Enter', target: { value: '   ' }, preventDefault: () => {} })
    ;(draft.props.onKeyDown as (event: unknown) => void)({ key: 'a', target: { value: 'x' }, preventDefault: () => {} })
    expect(storeFace.calls).toEqual([{ method: 'createProject', args: ['新项目'] }])
  })

  it('归档 / 子会话行的动作钮不可达（行不渲染），行点击打开会话', () => {
    const fake = fakeBrowserHost()
    const { elements } = renderBrowser({ store: fakeStore(SAMPLE_STORE_STATE).store, uiWorkspace: fake.ui, sessions: fake.sessions })
    const row = findBy(elements, 'taiji-pb-row', 'data-session-id', 's1')
    ;(row!.props.onClick as () => void)()
    expect(fake.uiCalls.map((call) => call.method)).toEqual(['openSession'])
  })

  it('草稿行提交后自动收起：Enter 提交后失焦不重复提交，点「+」重新展开可再提交', () => {
    const storeFace = fakeStore(SAMPLE_STORE_STATE)
    const fake = fakeBrowserHost()
    const { elements } = renderBrowser({ store: storeFace.store, uiWorkspace: fake.ui, sessions: fake.sessions })
    const draft = elementsWithClass(elements, 'taiji-pb-newdraft')[0]!
    const headAdd = elementsWithClass(elements, 'taiji-pb-head-add')[0]!
    const enter = (value: string) => {
      const target = { value }
      ;(draft.props.onKeyDown as (event: unknown) => void)({ key: 'Enter', target, preventDefault: () => {} })
      return target
    }
    const blur = (value: string): void => {
      ;(draft.props.onBlur as (event: unknown) => void)({ target: { value } })
    }
    ;(headAdd.props.onClick as () => void)() // 展开草稿行
    const first = enter('甲')
    expect(first.value).toBe('') // 提交即清值（下次展开内容为空）
    expect(storeFace.calls).toEqual([{ method: 'createProject', args: ['甲'] }])
    blur('乙') // 收起态失焦（含 Enter 收起 display:none 引发的浏览器失焦）：不重复提交
    expect(storeFace.calls).toHaveLength(1)
    ;(headAdd.props.onClick as () => void)() // 点「+」重新展开
    blur('丙') // 展开态失焦 = 失焦提交
    expect(storeFace.calls).toEqual([
      { method: 'createProject', args: ['甲'] },
      { method: 'createProject', args: ['丙'] },
    ])
  })

  it('草稿行 Esc 取消：清值收起，后续失焦不提交', () => {
    const storeFace = fakeStore(SAMPLE_STORE_STATE)
    const fake = fakeBrowserHost()
    const { elements } = renderBrowser({ store: storeFace.store, uiWorkspace: fake.ui, sessions: fake.sessions })
    const draft = elementsWithClass(elements, 'taiji-pb-newdraft')[0]!
    const headAdd = elementsWithClass(elements, 'taiji-pb-head-add')[0]!
    ;(headAdd.props.onClick as () => void)()
    const target = { value: '草稿名' }
    ;(draft.props.onKeyDown as (event: unknown) => void)({ key: 'Escape', target, preventDefault: () => {} })
    expect(target.value).toBe('')
    ;(draft.props.onBlur as (event: unknown) => void)({ target: { value: '乙' } })
    expect(storeFace.calls).toEqual([])
  })

  it('草稿行空值失焦：丢弃不建项目，同样收起（后续失焦不提交）', () => {
    const storeFace = fakeStore(SAMPLE_STORE_STATE)
    const fake = fakeBrowserHost()
    const { elements } = renderBrowser({ store: storeFace.store, uiWorkspace: fake.ui, sessions: fake.sessions })
    const draft = elementsWithClass(elements, 'taiji-pb-newdraft')[0]!
    const headAdd = elementsWithClass(elements, 'taiji-pb-head-add')[0]!
    const blur = (value: string): void => {
      ;(draft.props.onBlur as (event: unknown) => void)({ target: { value } })
    }
    ;(headAdd.props.onClick as () => void)()
    blur('   ')
    expect(storeFace.calls).toEqual([])
    blur('乙') // 已收起：不再提交
    expect(storeFace.calls).toEqual([])
  })

  it('默认组展开内容区挂同款细线类名：与命名组同构，承载当前会话时走 accent 档', () => {
    // s1 无映射 → 落默认组且是当前会话：默认组 isCurrent（当前组的判据在派生层锁死）
    const state = { projects: [{ id: 'p1', name: '太极侧栏' }], assignments: {} }
    const fake = fakeBrowserHost()
    const { elements } = renderBrowser({ store: fakeStore(state).store, uiWorkspace: fake.ui, sessions: fake.sessions })
    const bodyOf = (projectId: string) =>
      elementsWithClass(collectElements(findBy(elements, 'taiji-pb-group', 'data-project-id', projectId)!), 'taiji-pb-gbody')[0]
    // 默认组内容区与命名组同款细线类名；当前组 accent 档类两组通用（视觉同款 = 同一套类）
    expect(bodyOf('')!.props.className).toBe('taiji-pb-gbody taiji-pb-gbody-current')
    expect(bodyOf('p1')!.props.className).toBe('taiji-pb-gbody')
  })
})

// ── M3：展开态持久化（消费 store.getExpanded / setExpanded）─────────────────────

describe('展开态持久化（store 消费）', () => {
  function subject(initial: Parameters<typeof fakeStore>[0] = SAMPLE_STORE_STATE) {
    const storeFace = fakeStore(initial)
    const fake = fakeBrowserHost()
    const { elements } = renderBrowser({ store: storeFace.store, uiWorkspace: fake.ui, sessions: fake.sessions, logger: fake.host.logger })
    return { storeFace, fake, elements }
  }

  it('初值 getExpanded：持久展开的组渲染 open 类（空串成员 = 默认项目展开同样生效）', () => {
    const { elements } = subject({ ...SAMPLE_STORE_STATE, expanded: ['p1', ''] })
    expect(findBy(elements, 'taiji-pb-group', 'data-project-id', 'p1')!.props.className).toContain('taiji-pb-open')
    expect(findBy(elements, 'taiji-pb-group', 'data-project-id', '')!.props.className).toContain('taiji-pb-open')
  })

  it('持久初值非空时不播种、无持久写：store 无 setExpanded 调用（播种是纯视觉默认）', () => {
    const { storeFace } = subject({ ...SAMPLE_STORE_STATE, expanded: ['p1'] })
    expect(storeFace.calls).toEqual([])
  })

  it('空初值播种当前组也不写 store（默认态跟随当前组，用户首次开合才产生持久事实）', () => {
    // SAMPLE 里 s1（当前会话）在 p1 组 → 播种效应命中 p1；断言播种只动视觉不动 store
    const { storeFace } = subject(SAMPLE_STORE_STATE)
    expect(storeFace.calls).toEqual([])
  })

  it('切换组头 → 乐观 setExpanded 收新集合（初值 {p1}：点 p1 头收起 → 空数组；再点默认头展开 → [空串]）', () => {
    const { storeFace, elements } = subject({ ...SAMPLE_STORE_STATE, expanded: ['p1'] })
    // 收起 p1（初值集合摘掉 p1；toggle 读 expandedRef 的最新值）
    ;(headOf(elements, 'p1').props.onClick as () => void)()
    expect(storeFace.calls).toEqual([{ method: 'setExpanded', args: [[]] }])
    // 展开默认组（前一次收起后的最新集合 + ''）
    ;(headOf(elements, '').props.onClick as () => void)()
    expect(storeFace.calls).toEqual([
      { method: 'setExpanded', args: [[]] },
      { method: 'setExpanded', args: [['']] },
    ])
  })

  it('持久化失败（setExpanded false）：显式 warn 一条，不回滚不外抛', async () => {
    const { storeFace, fake, elements } = subject({ ...SAMPLE_STORE_STATE, expanded: ['p1'], expandFail: true })
    // 初值含 p1（不播种）；点 p1 头 = 收起 → setExpanded(空数组) 拒绝
    ;(headOf(elements, 'p1').props.onClick as () => void)()
    expect(storeFace.calls).toEqual([{ method: 'setExpanded', args: [[]] }])
    await Promise.resolve()
    expect(fake.warns).toHaveLength(1)
    expect(fake.warns[0]).toContain('展开态持久化失败')
  })
})

// ── 展开态迟到采纳：store 快照单一数据源（组件行为面）──────────────────────────

describe('展开态迟到采纳（镜像晚答 loading→ready）', () => {
  function subject(initial: Parameters<typeof fakeStore>[0] = SAMPLE_STORE_STATE) {
    const storeFace = fakeStore(initial)
    const fake = fakeBrowserHost()
    const deps = { store: storeFace.store, uiWorkspace: fake.ui, sessions: fake.sessions }
    return { storeFace, deps, render: () => renderBrowser(deps) }
  }

  it('迟到持久值到达后：渲染跟随 store 新快照（useSyncExternalStore 订阅驱动，不冻结挂载初值）', () => {
    const { storeFace, render } = subject() // 初值 expanded=[]（镜像尚未答）
    const first = render().elements
    expect(findBy(first, 'taiji-pb-group', 'data-project-id', 'p1')!.props.className).not.toContain('taiji-pb-open')
    // 镜像晚答：store 采纳持久值 ['p1'] 并 notify（真实时序：loading→ready 的 applySnapshot）
    storeFace.adoptExternalExpanded(['p1'])
    // 通知驱动的重渲染（真实 React 由 useSyncExternalStore 监听器触发；夹具手动驱动同一渲染）
    const second = render().elements
    expect(findBy(second, 'taiji-pb-group', 'data-project-id', 'p1')!.props.className).toContain('taiji-pb-open')
  })

  it('迟到持久值到达后用户开合：计算基线 = 最新 store 快照，不把过期空集整写回 store 销毁持久值', () => {
    const { storeFace, render } = subject()
    const { elements } = render()
    storeFace.adoptExternalExpanded(['p1']) // 挂载后才采纳的持久事实
    // 用户点默认组头展开：开合动作实时读 store，保留迟到的 p1（旧实现读挂载初值 ∅ →
    // setExpanded(['']) 静默销毁 p1）
    ;(headOf(elements, '').props.onClick as () => void)()
    expect(storeFace.calls).toEqual([{ method: 'setExpanded', args: [['p1', '']] }])
  })
})

// ── 播种守卫判定表（resolveSeedExpansion 纯函数）──────────────────────────────

describe('resolveSeedExpansion（播种守卫）', () => {
  const base = { seeded: false, userTouched: false, currentGroupId: 'p1' as string | undefined, expandedSize: 0 }

  it('正常播种：未播过 + 用户未动过 + 首次拿到当前组 + 无展开事实 → 返回当前组 id', () => {
    expect(browserModule.resolveSeedExpansion(base)).toBe('p1')
  })

  it('守卫：已播过 / 用户动过展开（含全收起）/ 无当前组 / 已有展开事实 → 不播', () => {
    expect(browserModule.resolveSeedExpansion({ ...base, seeded: true })).toBeNull()
    // 用户中途全收起 = 用户意图事实：其后才首次出现的 currentGroupId 不得强制展开回去
    expect(browserModule.resolveSeedExpansion({ ...base, userTouched: true })).toBeNull()
    expect(browserModule.resolveSeedExpansion({ ...base, currentGroupId: undefined })).toBeNull()
    expect(browserModule.resolveSeedExpansion({ ...base, expandedSize: 2 })).toBeNull()
  })
})

// ── M3：悬停详情卡 ─────────────────────────────────────────────────────────────

describe('SessionHoverCard（悬停详情卡内容）', () => {
  it('完整标题 + 父会话行（标题形态）+ cwd（~ 缩写 mono）+ 相对时间', () => {
    const card = browserModule.SessionHoverCard({
      t,
      row: { title: '主题令牌三层重构', cwd: '/Users/dev/Code/main', updatedAtMs: NOW - 5 * MINUTE, blank: false },
      parent: { title: '插槽系统侦查' },
    })
    const els = collectElements(card)
    expect(textOf(elementsWithClass(els, 'taiji-pb-hover-title')[0]!)).toBe('主题令牌三层重构')
    expect(textOf(elementsWithClass(els, 'taiji-pb-hover-text')[0]!)).toBe('父会话「插槽系统侦查」')
    expect(textOf(elementsWithClass(els, 'taiji-pb-hover-cwd')[0]!)).toBe('~/Code/main')
    expect(textOf(elementsWithClass(els, 'taiji-pb-hover-meta')[0]!)).toBe('5 分钟前')
  })

  it('blank 行：标题换「新会话」文案、无时间行；无 cwd / 无父会话时对应行不渲染', () => {
    const card = browserModule.SessionHoverCard({
      t,
      row: { title: '', cwd: undefined, updatedAtMs: NOW, blank: true },
      parent: null,
    })
    const els = collectElements(card)
    expect(textOf(elementsWithClass(els, 'taiji-pb-hover-title')[0]!)).toBe('新会话')
    expect(elementsWithClass(els, 'taiji-pb-hover-meta')).toHaveLength(0)
    expect(elementsWithClass(els, 'taiji-pb-hover-cwd')).toHaveLength(0)
    expect(elementsWithClass(els, 'taiji-pb-hover-text')).toHaveLength(0)
  })

  it('父会话回退：byId 找不到 → id 前 8 位形态', () => {
    const card = browserModule.SessionHoverCard({
      t,
      row: { title: '子会话', updatedAtMs: NOW, blank: false },
      parent: { shortId: 'abcd1234' },
    })
    expect(textOf(elementsWithClass(collectElements(card), 'taiji-pb-hover-text')[0]!)).toBe('父会话 abcd1234')
  })
})

describe('resolveHoverParent / abbreviateHomePath（纯函数）', () => {
  it('父会话解析：命中显标题（title 空回落 displayTitle）；未命中显前 8 位；无 parentId null', () => {
    const byId = {
      full: { id: 'full', title: '父标题', displayTitle: '', running: false, retainedBy: {}, blank: false, updatedAt: NOW },
      fallback: { id: 'fallback', title: '  ', displayTitle: '展示兜底', running: false, retainedBy: {}, blank: false, updatedAt: NOW },
    }
    expect(browserModule.resolveHoverParent({ parentId: 'full' }, byId)).toEqual({ title: '父标题' })
    expect(browserModule.resolveHoverParent({ parentId: 'fallback' }, byId)).toEqual({ title: '展示兜底' })
    expect(browserModule.resolveHoverParent({ parentId: 'gone0000000' }, byId)).toEqual({ shortId: 'gone0000' })
    expect(browserModule.resolveHoverParent({ parentId: 'gone0000000' }, undefined)).toEqual({ shortId: 'gone0000' })
    expect(browserModule.resolveHoverParent({}, byId)).toBeNull()
  })

  it('cwd 缩写：/Users/<name> 与 /home/<name> 前缀替换 ~；其余原样（Windows 盘符等不丢信息）', () => {
    expect(browserModule.abbreviateHomePath('/Users/dev/Code/main')).toBe('~/Code/main')
    expect(browserModule.abbreviateHomePath('/home/dev/work')).toBe('~/work')
    expect(browserModule.abbreviateHomePath('C:\\Users\\dev')).toBe('C:\\Users\\dev')
    expect(browserModule.abbreviateHomePath('/srv/data')).toBe('/srv/data')
  })
})

describe('详情卡与右键菜单的行接线（本体，单次渲染锁行为面）', () => {
  it('行 contextmenu → preventDefault（压原生菜单）；mouseenter/mouseleave 不 throw；关态无浮层 DOM', () => {
    const fake = fakeBrowserHost()
    const { elements } = renderBrowser({ store: fakeStore(SAMPLE_STORE_STATE).store, uiWorkspace: fake.ui, sessions: fake.sessions })
    // 关态：三个浮层（移动弹层 / 详情卡 / 右键菜单）都不在树里（portal 只在打开时渲染）
    expect(elementsWithClass(elements, 'taiji-pb-menu-anchor')).toHaveLength(0)
    expect(elementsWithClass(elements, 'taiji-pb-hover-anchor')).toHaveLength(0)
    expect(elementsWithClass(elements, 'taiji-pb-ctx-anchor')).toHaveLength(0)
    const row = findBy(elements, 'taiji-pb-row', 'data-session-id', 's1')!
    let prevented = false
    ;(row.props.onContextMenu as (event: unknown) => void)({ clientX: 10, clientY: 20, preventDefault: () => { prevented = true } })
    expect(prevented).toBe(true)
    // 夹具事件无几何（currentTarget 缺席）→ 锚 0,0 兜底路径，不 throw
    ;(row.props.onMouseEnter as (event: unknown) => void)({ currentTarget: undefined })
    ;(row.props.onMouseLeave as () => void)()
  })
})

// ── M3：归档子视图 ─────────────────────────────────────────────────────────────

describe('ArchiveSubview（归档子视图）', () => {
  const DAY = 24 * 60 * 60 * 1000

  /** 归档行夹具：ageDays = 距今天数（跨档安全取档中值）。 */
  const archRow = (id: string, ageDays: number): Record<string, unknown> => ({
    id,
    title: `t-${id}`,
    updatedAtMs: Date.now() - ageDays * DAY,
    blank: false,
  })
  const rows = [archRow('a1', 0.5), archRow('a2', 2), archRow('a3', 5), archRow('a4', 10)]

  function view(overrides: Record<string, unknown> = {}) {
    const events: { kind: string; value: unknown }[] = []
    const node = browserModule.ArchiveSubview({
      t,
      rows,
      filter: 'all',
      onBack: () => { events.push({ kind: 'back', value: null }) },
      onFilterChange: (filter: string) => { events.push({ kind: 'filter', value: filter }) },
      onUnarchive: (id: string) => { events.push({ kind: 'unarchive', value: id }) },
      ...overrides,
    })
    return { node, events, els: collectElements(node) }
  }

  it('渲染：返回钮 + 标题计数 + chips 全档计数（选中 all）+ 归档行（标题/时间/恢复钮）', () => {
    const { els } = view()
    expect(textOf(elementsWithClass(els, 'taiji-pb-a-title')[0]!)).toBe('已归档 (4)')
    const chips = elementsWithClass(els, 'taiji-pb-bucket')
    expect(chips.map((chip) => textOf(chip))).toEqual(['全部 4', '1天内 1', '2-3天 1', '4-7天 1', '7天+ 1'])
    expect(chips[0]!.props['aria-pressed']).toBe(true)
    expect(chips.slice(1).every((chip) => chip.props['aria-pressed'] === false)).toBe(true)
    expect(elementsWithClass(els, 'taiji-pb-a-row').map((row) => row.props['data-session-id'])).toEqual(['a1', 'a2', 'a3', 'a4'])
    expect(elementsWithClass(els, 'taiji-pb-a-restore')).toHaveLength(4)
    expect(textOf(elementsWithClass(els, 'taiji-pb-a-restore')[0]!)).toBe('恢复')
  })

  it('filter 过滤行（d3 档只显 2 天前那行）；点 chip → onFilterChange(档)', () => {
    const { els, events } = view({ filter: 'd3' })
    expect(elementsWithClass(els, 'taiji-pb-a-row').map((row) => row.props['data-session-id'])).toEqual(['a2'])
    const chips = elementsWithClass(els, 'taiji-pb-bucket')
    expect(chips[2]!.props['aria-pressed']).toBe(true)
    ;(chips[4]!.props.onClick as () => void)()
    expect(events).toEqual([{ kind: 'filter', value: 'older' }])
  })

  it('筛选无匹配 → 空态文案', () => {
    const { els } = view({ rows: [archRow('a1', 0.5)], filter: 'older' })
    expect(textOf(elementsWithClass(els, 'taiji-pb-empty')[0]!)).toBe('暂无归档会话')
    expect(elementsWithClass(els, 'taiji-pb-a-row')).toHaveLength(0)
  })

  it('恢复钮 → onUnarchive(行 id)；返回钮 → onBack（动作面见本体 unarchiveSession 接线）', () => {
    const { els, events } = view()
    const first = findBy(els, 'taiji-pb-a-row', 'data-session-id', 'a1')!
    ;(elementsWithClass(collectElements(first), 'taiji-pb-a-restore')[0]!.props.onClick as () => void)()
    ;(elementsWithClass(els, 'taiji-pb-a-back')[0]!.props.onClick as () => void)()
    expect(events).toEqual([{ kind: 'unarchive', value: 'a1' }, { kind: 'back', value: null }])
  })

  it('archiveBucketOf 分档边界（时长差：恰 1/3/7 天进下一档；未来时间戳兜底 d1）', () => {
    const now = 1_000_000_000_000
    expect(browserModule.archiveBucketOf(now - 0.9 * DAY, now)).toBe('d1')
    expect(browserModule.archiveBucketOf(now - 1 * DAY, now)).toBe('d3')
    expect(browserModule.archiveBucketOf(now - 3 * DAY, now)).toBe('d7')
    expect(browserModule.archiveBucketOf(now - 7 * DAY, now)).toBe('older')
    expect(browserModule.archiveBucketOf(now + 5_000, now)).toBe('d1')
  })
})

describe('区头归档入口（角标 + 可访问名）', () => {
  function subject(overrides: Record<string, unknown> = {}) {
    const fake = fakeBrowserHost()
    const { elements } = renderBrowser(
      { store: fakeStore(SAMPLE_STORE_STATE).store, uiWorkspace: fake.ui, sessions: fake.sessions },
      overrides,
    )
    return { elements }
  }

  it('有归档（SAMPLE 1 条）：钮 + 角标计数；aria-label 带数', () => {
    const { elements } = subject()
    const btn = elementsWithClass(elements, 'taiji-pb-head-arch')[0]!
    expect(btn.props['aria-label']).toBe('已归档 1 个会话')
    expect(textOf(elementsWithClass(collectElements(btn), 'taiji-pb-nbadge')[0]!)).toBe('1')
  })

  it('零归档：角标隐藏、钮保留（可进空态子视图确认）', () => {
    const { elements } = subject({
      useWorkspaces: (selector: (state: unknown) => unknown) => selector({ archivedSessionIds: [], pinnedSessionIds: ['s2'] }),
    })
    expect(elementsWithClass(elements, 'taiji-pb-head-arch')).toHaveLength(1)
    expect(elementsWithClass(elements, 'taiji-pb-nbadge')).toHaveLength(0)
  })
})

// ── M3：右键菜单 ───────────────────────────────────────────────────────────────

describe('SessionContextMenu（右键菜单）', () => {
  const projects = [
    { id: 'p1', name: '甲' },
    { id: 'p2', name: '乙' },
  ]

  function menu(overrides: Record<string, unknown> = {}) {
    return browserModule.SessionContextMenu({
      t,
      row: { id: 's1', pinned: false },
      projects,
      currentProjectId: 'p1',
      onTogglePin: () => {},
      onRename: () => {},
      onArchive: () => {},
      onCopyId: () => {},
      onPickProject: (_projectId: string) => {},
      ...overrides,
    })
  }

  /** 按 data-act 找动作项（项目项无 data-act，两族靠属性分流）。 */
  const actItem = (elements: readonly FakeElement[], act: string): FakeElement | undefined =>
    elementsWithClass(elements, 'taiji-pb-ctx-item').find((item) => item.props['data-act'] === act)

  it('项清单：置顶/重命名/归档/复制 ID + 分隔线 + 「移动到项目」标签 + 项目组（默认在前，当前归属打勾）', () => {
    const els = collectElements(menu())
    expect(textOf(actItem(els, 'pin')!)).toBe('置顶')
    expect(textOf(actItem(els, 'rename')!)).toBe('重命名')
    expect(textOf(actItem(els, 'archive')!)).toBe('归档')
    expect(textOf(actItem(els, 'copy-id')!)).toBe('复制会话 ID')
    expect(elementsWithClass(els, 'taiji-pb-ctx-sep')).toHaveLength(1)
    expect(textOf(elementsWithClass(els, 'taiji-pb-ctx-label')[0]!)).toBe('移动到项目')
    const projectItems = elementsWithClass(els, 'taiji-pb-ctx-item').filter((item) => item.props['data-act'] === undefined)
    expect(projectItems.map((item) => item.props['data-project-id'])).toEqual(['', 'p1', 'p2'])
    expect(textOf(projectItems[0]!)).toContain('未分组')
    expect(projectItems.find((item) => item.props['aria-current'] === true)?.props['data-project-id']).toBe('p1')
    expect(elementsWithClass(els, 'taiji-pb-ctx-check')).toHaveLength(1)
  })

  it('置顶态切文案：已置顶行显「取消置顶」', () => {
    const els = collectElements(menu({ row: { id: 's1', pinned: true } }))
    expect(textOf(actItem(els, 'pin')!)).toBe('取消置顶')
  })

  it('点项分流：置顶/重命名/归档/复制/移动各归其回调', () => {
    const calls: string[] = []
    const els = collectElements(menu({
      onTogglePin: () => { calls.push('pin') },
      onRename: () => { calls.push('rename') },
      onArchive: () => { calls.push('archive') },
      onCopyId: () => { calls.push('copy') },
      onPickProject: (projectId: string) => { calls.push(`move:${projectId}`) },
    }))
    ;(actItem(els, 'pin')!.props.onClick as () => void)()
    ;(actItem(els, 'rename')!.props.onClick as () => void)()
    ;(actItem(els, 'archive')!.props.onClick as () => void)()
    ;(actItem(els, 'copy-id')!.props.onClick as () => void)()
    ;(elementsWithClass(els, 'taiji-pb-ctx-item').find((item) => item.props['data-project-id'] === 'p2')!.props.onClick as () => void)()
    expect(calls).toEqual(['pin', 'rename', 'archive', 'copy', 'move:p2'])
  })
})

describe('performCopySessionId（剪贴板合同）', () => {
  it('成功：clipboard.writeText(id)，无 warn', async () => {
    const written: string[] = []
    const warns: string[] = []
    browserModule.performCopySessionId(
      { clipboard: { writeText: async (text: string) => { written.push(text) } }, logger: { warn(message: string) { warns.push(message) } } },
      's1',
    )
    await Promise.resolve()
    expect(written).toEqual(['s1'])
    expect(warns).toEqual([])
  })

  it('剪贴板缺席 → warn 一条；写入拒绝 → warn 一条（含原因），不外抛', async () => {
    const warns: string[] = []
    const logger = { warn(message: string) { warns.push(message) } }
    browserModule.performCopySessionId({ logger }, 's1')
    expect(warns).toHaveLength(1)
    expect(() => {
      browserModule.performCopySessionId(
        { clipboard: { writeText: () => Promise.reject(new Error('denied')) }, logger },
        's2',
      )
    }).not.toThrow()
    await Promise.resolve()
    await Promise.resolve()
    expect(warns).toHaveLength(2)
    expect(warns[1]).toContain('s2')
    expect(warns[1]).toContain('denied')
  })
})
