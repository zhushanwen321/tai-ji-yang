import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { collectElements, createTsxLoader, elementsWithClass, textOf, type FakeElement } from '../testing/load-tsx'
import { TAIJI_LOCALE_NS, zh } from '../locale'
import type { ProjectStoreLike } from './store'

/**
 * 项目分组浏览器单测（M2 整槽替换）。锁死四件事的可机器化部分：
 *   · 注册契约：注入槽名 sidebar.workspaces、优先级避让（-10 起向下）、区间占满降级不注册
 *     + warn、注册 disposer 透传、选项只传 name/priority/locale；
 *   · 动作接线：install 闭包捕获 uiWorkspace/sessions（行点击打开、组头「+」新建、归档、
 *     取消置顶、会话重命名走宿主 sessions.using 合同）；
 *   · 新建归组：findPendingAssignment 判定 + PendingProjectTracker 一次性消费（mock 快照序列）；
 *   · 渲染 smoke：区头/组头/chip/计数/行四态/徽标族/空态/加载态/数据缺席占位/折叠轨 null/
 *     滚动衔接 ref 绑定；删除两段确认与新建草稿行（taiji-section.test 同款夹具技巧）。
 *
 * 夹具边界（单次渲染语义）：真实宿主渲染、展开动画、弹层 portal 归 L3 场景；弹层内容经
 * 纯组件 ProjectMoveMenu 直接测，组件内关态零 DOM 依赖。
 */

const BROWSER_PATH = fileURLToPath(new URL('./browser.tsx', import.meta.url))

/** 模块出口面（loader 装载后按此消费；类型断言收敛在各 helper 内）。 */
interface BrowserModule {
  ProjectBrowser: (props: Record<string, unknown>) => FakeElement | null
  ProjectMoveMenu: (props: Record<string, unknown>) => FakeElement
  installProjectsBrowser: (host: unknown, deps: { store: unknown }) => void
  createProjectsBrowser: (host: unknown, deps: { store: unknown }) => (props: Record<string, unknown>) => FakeElement
  resolveBrowserPriority: (entries: readonly { options: { priority?: number } }[]) => number | undefined
  findPendingAssignment: (input: Record<string, unknown>) => { sessionId: string; projectId: string } | null
  createPendingProjectTracker: () => {
    begin(projectId: string): void
    consume(input: Record<string, unknown>): { sessionId: string; projectId: string } | null
  }
  performSessionRename: (deps: Record<string, unknown>, sessionId: string, title: string) => void
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

/** 假 store：状态只读 + 动作全记录（与 taiji-section.test 的 fakeProjectStore 同形态）。 */
function fakeStore(initial: { projects?: { id: string; name: string }[]; assignments?: Record<string, string> } = {}) {
  const state = { projects: initial.projects ?? [], assignments: initial.assignments ?? {} }
  const calls: { method: string; args: unknown[] }[] = []
  const store = {
    getState: () => state,
    subscribe: (_listener: () => void) => () => {},
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
    reorderProjects: async () => true,
    assignSession: async (sessionId: string, projectId: string) => {
      calls.push({ method: 'assignSession', args: [sessionId, projectId] })
      return true
    },
    dispose: () => {},
  }
  return { store: store as unknown as ProjectStoreLike, calls }
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

  it('PendingProjectTracker 按快照序列一次性消费：未命中保持 pending，命中即清', () => {
    const tracker = browserModule.createPendingProjectTracker()
    expect(tracker.consume({ currentId: null, list: blankList('b1'), assignments: {} })).toBeNull() // 还没有当前会话
    tracker.begin('p1')
    // 快照 1：当前仍是存量会话（startSession 尚未生效）→ 保持 pending
    expect(tracker.consume({ currentId: 's1', list: blankList('b1'), assignments: {} })).toBeNull()
    // 快照 2：blank 出现且成为当前选中、无映射 → 命中
    expect(tracker.consume({ currentId: 'b1', list: blankList('b1'), assignments: {} }))
      .toEqual({ sessionId: 'b1', projectId: 'p1' })
    // 快照 3（消费后的重复通知）：一次性，消费即清
    expect(tracker.consume({ currentId: 'b1', list: blankList('b1'), assignments: {} })).toBeNull()
    // 再次 begin 后可重新消费（连点两组以最后一击为准）
    tracker.begin('p2')
    expect(tracker.consume({ currentId: 'b1', list: blankList('b1'), assignments: {} }))
      .toEqual({ sessionId: 'b1', projectId: 'p2' })
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

  it('wide=false（折叠轨）：渲染 null（轨态按钮归侧栏 shell 所有）', () => {
    const { root } = subject({ wide: false })
    expect(root).toBeNull()
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
})
