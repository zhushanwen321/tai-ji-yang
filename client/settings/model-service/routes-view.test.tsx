import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { collectElements, createTsxLoader, elementsWithClass, textOf, type FakeElement } from '../../testing/load-tsx'
import { modelServiceZh } from '../../locale'
import type { Translate } from './route-time-grid'
import type { RouteEntry, RouteMember, RouteWindowMask } from '../../model-service/route-evaluate'
import type { RoutesListModel, RoutesSnapshot } from '../../model-service/route-store'

/**
 * RoutesView 单测（路由卡工作台，路由交互定稿 A1-A8）：
 *   · RoutesView 顶层：新建即配置（createRoute 默认名避重取序 + 选中新卡由 store 返回值驱动）、
 *     卡头「对话流可见」开关（role=switch，转发 toggleWhitelist）、收起卡脚（编辑成员转发
 *     onSelect / 删除两段确认）、注册状态徽章、命中预览；
 *   · RouteCardBody（导出面 = 生产消费点 RouteCard）：成员管线行（把手 draggable + 序号 +
 *     下拉 + 条件 + 可用性徽章 + 移除）、拖拽落点与键盘方向键同一 moveMember 出口（即时
 *     保存）、时间窗格点节流（草案不落盘、卸载补盘）、添加成员禁用与接入指引、注册失败
 *     修复条（就地改名转发 renameRoute）；改名 × 脏草案串行补盘（MF-4-2：两处改名入口先
 *     flush 后 rename 唯一序，非脏零额外写盘）。
 *
 * 交互断言沿 load-tsx 夹具语义：真相在 ref，同一渲染树上的 props 直调可读同一份 ref；
 * 落盘断言落在假模型的 saveRoute / renameRoute spy 上。
 */

const VIEW_PATH = fileURLToPath(new URL('./routes-view.tsx', import.meta.url))

const loader = createTsxLoader()
const viewModule = loader.load(VIEW_PATH) as unknown as {
  RoutesView: (props: Record<string, unknown>) => FakeElement
  RouteCard: (props: Record<string, unknown>) => FakeElement
  RouteCardBody: (props: Record<string, unknown>) => FakeElement
  RouteNameEditor: (props: Record<string, unknown>) => FakeElement
}
// RouteTimeGrid 组件同一性参照（夹具不递归函数组件；时间窗在场按组件元素断言）。
// emptyRouteWindowMask 同经 loader 取（.tsx 直 import 会触到 react 解析，无本地 react 包）。
const timeGridModule = loader.load(
  fileURLToPath(new URL('./route-time-grid.tsx', import.meta.url)),
) as unknown as { RouteTimeGrid: unknown; emptyRouteWindowMask: () => RouteWindowMask }
const TimeGridComponent = timeGridModule.RouteTimeGrid
const emptyRouteWindowMask = timeGridModule.emptyRouteWindowMask

/** 翻译桩：zh 词条 + {param} 插值。 */
const t: Translate = (key, params) => {
  let text = modelServiceZh[key]
  for (const [name, value] of Object.entries(params ?? {})) text = text.replaceAll(`{${name}}`, String(value))
  return text
}

/** 成员构造（order = 数组序）。 */
function member(provider: string, model: string, order: number): RouteMember {
  return { provider, model, order, condition: { type: 'none' } }
}

/** 快照构造：ready 基座 + 覆盖。 */
function readySnapshot(overrides: Partial<RoutesSnapshot> = {}): RoutesSnapshot {
  return {
    status: 'ready',
    routes: [],
    whitelist: [],
    hanging: [],
    registrationFailed: [],
    hits: new Map(),
    memberAvailability: new Map(),
    usableMembers: new Map(),
    selectableProviders: [],
    notice: undefined,
    error: undefined,
    ...overrides,
  }
}

/** 假视图模型：动作 spy 记录调用（落盘断言载体；calls 为跨动作统一调用序——save/rename
 * 先后序断言用，MF-4-2）。 */
function fakeModel(snapshot: RoutesSnapshot): RoutesListModel & {
  saves: RouteEntry[]
  toggles: string[]
  creates: string[]
  renames: { oldId: string; newName: string }[]
  deletes: string[]
  calls: string[]
  nextRename: { id: string; name: string; members: RouteMember[] } | undefined
} {
  const saves: RouteEntry[] = []
  const toggles: string[] = []
  const creates: string[] = []
  const renames: { oldId: string; newName: string }[] = []
  const deletes: string[] = []
  const calls: string[] = []
  const state = { nextRename: undefined as { id: string; name: string; members: RouteMember[] } | undefined }
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    saveRoute: async (route: RouteEntry) => { calls.push('save'); saves.push(route); return true },
    toggleWhitelist: async (id: string) => { toggles.push(id); return true },
    createRoute: async (name: string) => { creates.push(name); return { id: 'p-1', name, members: [] } },
    renameRoute: async (oldId: string, newName: string) => {
      calls.push('rename')
      renames.push({ oldId, newName })
      return state.nextRename === undefined ? undefined : { ...state.nextRename, name: newName }
    },
    deleteRoute: async (id: string) => { deletes.push(id) },
    removeWhitelistEntry: async () => {},
    cleanupHanging: async () => {},
    dispose: () => {},
    saves,
    toggles,
    creates,
    renames,
    deletes,
    calls,
    get nextRename() { return state.nextRename },
    set nextRename(value) { state.nextRename = value },
  } as unknown as RoutesListModel & {
    saves: RouteEntry[]
    toggles: string[]
    creates: string[]
    renames: { oldId: string; newName: string }[]
    deletes: string[]
    calls: string[]
    nextRename: { id: string; name: string; members: RouteMember[] } | undefined
  }
}

/** 渲染单张卡（RoutesView 内部对每路由挂 RouteCard；卡头/卡脚接线在此直挂断言）。 */
function renderCard(snapshot: RoutesSnapshot, route: RouteEntry, model: RoutesListModel, selected = false, onDeleted: (id: string) => void = () => {}): FakeElement[] {
  return collectElements(viewModule.RouteCard({
    t, route, state: snapshot, model, selected,
    onSelect: () => {},
    onToast: () => {},
    onRenamed: () => {},
    onDeleted,
    flushDrafts: () => Promise.resolve(),
    onFlushDraftsChange: () => {},
  }))
}

/** 渲染展开卡体（生产消费点 RouteCard 内嵌；单测直挂以触达成员管线）。 */
function renderBody(snapshot: RoutesSnapshot, route: RouteEntry, model: RoutesListModel): FakeElement[] {
  return collectElements(viewModule.RouteCardBody({ t, route, state: snapshot, model, onToast: () => {}, onRenamed: () => {}, onFlushDraftsChange: () => {} }))
}

/** 按 aria-label 找元素。 */
function withAria(elements: readonly FakeElement[], label: string): FakeElement[] {
  return elements.filter((element) => element.props['aria-label'] === label)
}

const ROUTE: RouteEntry = {
  id: 'work-route',
  name: '工作路由',
  members: [member('alpha', 'a1', 1), member('beta', 'b1', 2)],
}
const SELECTABLE = [
  { key: 'alpha', name: 'Alpha', models: [{ id: 'a1', name: 'A1' }, { id: 'a2', name: 'A2' }] },
  { key: 'beta', name: 'Beta', models: [{ id: 'b1', name: 'B1' }] },
]

describe('RoutesView 顶层（新建即配置）', () => {
  it('「+ 新建路由」直接追加新卡：createRoute 收到避重默认名（既有「新路由 1」在场时取 2）', async () => {
    const snapshot = readySnapshot({ routes: [{ id: 'p-1', name: '新路由 1', members: [] }] })
    const model = fakeModel(snapshot)
    const elements = collectElements(viewModule.RoutesView({ t, model }))
    const create = elementsWithClass(elements, 'ms-button-primary').filter((button) => textOf(button) === modelServiceZh['route.create'])
    expect(create).toHaveLength(1)
    ;(create[0].props.onClick as () => Promise<void>)()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(model.creates).toEqual(['新路由 2'])
  })
})

describe('RouteCard 卡头与卡脚', () => {
  it('卡头：路由名（就地改名编辑器挂载）、派生 id 徽标、注册状态徽章、对话流可见开关（role=switch 转发 toggleWhitelist）、命中预览', async () => {
    const snapshot = readySnapshot({
      routes: [ROUTE],
      whitelist: ['work-route'],
      hits: new Map([['work-route', { provider: 'alpha', model: 'a1', order: 1, condition: { type: 'none' } }]]),
    })
    const model = fakeModel(snapshot)
    const elements = renderCard(snapshot, ROUTE, model)
    // 路由名 = RouteNameEditor 函数组件（夹具不递归）：组件同一性 + 路由引用断言。
    const names = elements.filter((element) => element.type === viewModule.RouteNameEditor)
    expect(names).toHaveLength(1)
    expect((names[0].props.route as RouteEntry).name).toBe('工作路由')
    // 派生 id 徽标 + 注册徽章（无失败 → 已注册绿徽）。
    const badges = elementsWithClass(elements, 'ms-badge').map((badge) => textOf(badge))
    expect(badges).toContain('work-route')
    expect(badges).toContain(modelServiceZh['route.registeredBadge'])
    expect(badges).not.toContain(modelServiceZh['route.registrationFailedBadge'])
    // 对话流可见开关：role=switch、checked 反映白名单、onChange 转发 toggleWhitelist。
    const switches = elements.filter((element) => element.props.role === 'switch')
    expect(switches).toHaveLength(1)
    expect(switches[0].props.checked).toBe(true)
    expect(switches[0].props['aria-label']).toBe('对话流可见开关：工作路由')
    ;(switches[0].props.onChange as () => Promise<void>)()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(model.toggles).toEqual(['work-route'])
    // 命中预览（时间窗感知求值，无条件首成员即命中）。
    const notes = elementsWithClass(elements, 'ms-row-note').map((note) => textOf(note))
    expect(notes).toContain('当前命中：alpha / a1')
  })

  it('注册失败路由：卡头红徽（注册失败）替换绿徽；收起态卡体不挂载、卡脚在场', () => {
    const snapshot = readySnapshot({ routes: [ROUTE], registrationFailed: ['work-route'] })
    const model = fakeModel(snapshot)
    const failed = renderCard(snapshot, ROUTE, model)
    const badges = elementsWithClass(failed, 'ms-badge').map((badge) => textOf(badge))
    expect(badges).toContain(modelServiceZh['route.registrationFailedBadge'])
    expect(badges).not.toContain(modelServiceZh['route.registeredBadge'])
    const bodies = elementsWithClass(failed, 'ms-route-card-body')
    expect(bodies).toHaveLength(0)
    expect(elementsWithClass(failed, 'ms-route-card-foot')).toHaveLength(1)
  })

  it('展开态（selected）：卡体挂载（RouteCardBody 组件同一性）、卡脚退场', () => {
    const snapshot = readySnapshot({ routes: [ROUTE], selectableProviders: SELECTABLE })
    const model = fakeModel(snapshot)
    const elements = renderCard(snapshot, ROUTE, model, true)
    expect(elementsWithClass(elements, 'ms-route-card-selected')).toHaveLength(1)
    const bodies = elements.filter((element) => element.type === viewModule.RouteCardBody)
    expect(bodies).toHaveLength(1)
    expect((bodies[0].props.route as RouteEntry).id).toBe('work-route')
    expect(elementsWithClass(elements, 'ms-route-card-foot')).toHaveLength(0)
  })

  it('收起卡脚：删除两段确认（第一击只武装改文案，第二击才 deleteRoute）+ 完成回调 onDeleted(route.id)', async () => {
    const snapshot = readySnapshot({ routes: [ROUTE] })
    const model = fakeModel(snapshot)
    let deletedWith: string | undefined
    const elements = renderCard(snapshot, ROUTE, model, false, (id) => { deletedWith = id })
    const deletes = elementsWithClass(elements, 'ms-button').filter((button) => textOf(button) === modelServiceZh['route.delete'])
    expect(deletes).toHaveLength(1)
    ;(deletes[0].props.onClick as () => void)()
    expect(model.deletes).toEqual([]) // 第一击只武装
    // 第二击在武装态（文案切换为确认）——夹具不重渲染，直接再点同一回调（ref 真相可读）。
    ;(deletes[0].props.onClick as () => void)()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(model.deletes).toEqual(['work-route'])
    expect(deletedWith).toBe('work-route')
  })

  it('当选卡卡头有「收起成员」按钮（toggle 收起通道）；收起态卡头无该按钮', () => {
    const snapshot = readySnapshot({ routes: [ROUTE] })
    const model = fakeModel(snapshot)
    const expanded = renderCard(snapshot, ROUTE, model, true)
    const collapseOnExpanded = elementsWithClass(expanded, 'ms-button').filter((button) => textOf(button) === modelServiceZh['route.collapseMembers'])
    expect(collapseOnExpanded).toHaveLength(1)
    const collapsed = renderCard(snapshot, ROUTE, model, false)
    const collapseOnCollapsed = elementsWithClass(collapsed, 'ms-button').filter((button) => textOf(button) === modelServiceZh['route.collapseMembers'])
    expect(collapseOnCollapsed).toHaveLength(0)
  })
})

describe('RouteCardBody 成员管线（展开态）', () => {
  it('成员行：把手 draggable + 序号 + 供应商/模型下拉取值 + 条件 + 可用性徽章 + 移除', async () => {
    const availability = new Map<string, MemberAvailability>([
      ['alpha/a1', { providerMissing: true, modelMissing: false, credentialMissing: false, ref: undefined }],
    ])
    const model = fakeModel(readySnapshot({
      routes: [ROUTE],
      selectableProviders: SELECTABLE,
      memberAvailability: availability,
    }))
    const snapshot = readySnapshot({ routes: [ROUTE], selectableProviders: SELECTABLE, memberAvailability: availability })
    const elements = renderBody(snapshot, ROUTE, model)
    const handles = withAria(elements, modelServiceZh['route.dragHandle'])
    expect(handles).toHaveLength(2)
    expect(handles[0].props.draggable).toBe(true)
    const providerSelects = withAria(elements, modelServiceZh['route.memberProvider'])
    expect(providerSelects).toHaveLength(2)
    expect(providerSelects[0].props.value).toBe('alpha')
    const modelSelects = withAria(elements, modelServiceZh['route.memberModel'])
    expect(modelSelects).toHaveLength(2)
    expect(modelSelects[0].props.value).toBe('a1')
    const conditionSelects = withAria(elements, modelServiceZh['route.memberCondition'])
    expect(conditionSelects).toHaveLength(2)
    expect(conditionSelects[0].props.value).toBe('none')
    const missingBadges = elementsWithClass(elements, 'ms-badge-missing').map((badge) => textOf(badge))
    expect(missingBadges).toContain(modelServiceZh['route.memberProviderMissing'])
    const removes = elementsWithClass(elements, 'ms-button-danger')
    expect(removes).toHaveLength(2)
    ;(removes[0].props.onClick as () => Promise<void>)()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(model.saves).toHaveLength(1)
    // 删除后 order 重排（数组序 1 起）。
    expect(model.saves[0].members).toEqual([member('beta', 'b1', 1)])
  })

  it('拖拽排序：把手 dragStart 记起点、目标行 drop 落点 → moveMember 数据交换 + 即时保存（order 重排）', async () => {
    const model = fakeModel(readySnapshot({ routes: [ROUTE], selectableProviders: SELECTABLE }))
    const snapshot = readySnapshot({ routes: [ROUTE], selectableProviders: SELECTABLE })
    const elements = renderBody(snapshot, ROUTE, model)
    const handles = withAria(elements, modelServiceZh['route.dragHandle'])
    const rows = elementsWithClass(elements, 'ms-route-member-row')
    ;(handles[0].props.onDragStart as (event: { dataTransfer?: { setData(type: string, value: string): void; effectAllowed: string } }) => void)({ dataTransfer: undefined })
    ;(rows[1].props.onDrop as (event: { preventDefault(): void }) => void)({ preventDefault: () => {} })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(model.saves).toHaveLength(1)
    expect(model.saves[0].members.map((entry) => entry.model)).toEqual(['b1', 'a1'])
    expect(model.saves[0].members.map((entry) => entry.order)).toEqual([1, 2])
  })

  it('键盘可达回退：把手 ArrowDown 移动一位（同一 moveMember 出口）', async () => {
    const model = fakeModel(readySnapshot({ routes: [ROUTE], selectableProviders: SELECTABLE }))
    const snapshot = readySnapshot({ routes: [ROUTE], selectableProviders: SELECTABLE })
    const elements = renderBody(snapshot, ROUTE, model)
    const handles = withAria(elements, modelServiceZh['route.dragHandle'])
    ;(handles[0].props.onKeyDown as (event: { key: string; preventDefault(): void }) => void)({ key: 'ArrowDown', preventDefault: () => {} })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(model.saves).toHaveLength(1)
    expect(model.saves[0].members.map((entry) => entry.model)).toEqual(['b1', 'a1'])
  })

  it('原位落点不产生写入（moveMember 越界/原位返回原数组引用，视图以引用同异判无操作）', async () => {
    const model = fakeModel(readySnapshot({ routes: [ROUTE], selectableProviders: SELECTABLE }))
    const snapshot = readySnapshot({ routes: [ROUTE], selectableProviders: SELECTABLE })
    const elements = renderBody(snapshot, ROUTE, model)
    const handles = withAria(elements, modelServiceZh['route.dragHandle'])
    const rows = elementsWithClass(elements, 'ms-route-member-row')
    ;(handles[1].props.onDragStart as (event: unknown) => void)({ dataTransfer: undefined })
    ;(rows[1].props.onDrop as (event: { preventDefault(): void }) => void)({ preventDefault: () => {} })
    ;(handles[0].props.onKeyDown as (event: { key: string; preventDefault(): void }) => void)({ key: 'ArrowUp', preventDefault: () => {} })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(model.saves).toHaveLength(0)
  })

  it('时间窗：条件选「时间窗」即行下内联渲染（空掩码走 emptyRouteWindowMask 归一）并即时保存', async () => {
    const model = fakeModel(readySnapshot({ routes: [ROUTE], selectableProviders: SELECTABLE }))
    const snapshot = readySnapshot({ routes: [ROUTE], selectableProviders: SELECTABLE })
    const elements = renderBody(snapshot, ROUTE, model)
    const conditionSelects = withAria(elements, modelServiceZh['route.memberCondition'])
    ;(conditionSelects[0].props.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'window' } })
    expect(model.saves).toHaveLength(1)
    expect(model.saves[0].members[0].condition.type).toBe('window')
    expect(model.saves[0].members[0].condition.window?.days).toHaveLength(7)
  })

  it('时间窗节流：格点编辑只改内存草案（不落盘）；卡体卸载（切换选中卡）一次性补盘', async () => {
    const windowed: RouteEntry = {
      id: 'work-route',
      name: '工作路由',
      members: [
        { ...member('alpha', 'a1', 1), condition: { type: 'window', window: emptyRouteWindowMask() } },
        member('beta', 'b1', 2),
      ],
    }
    const snapshot = readySnapshot({ routes: [windowed], selectableProviders: SELECTABLE })
    const model = fakeModel(snapshot)
    const cleanupsBefore = loader.effectCleanups.length
    const elements = renderBody(snapshot, windowed, model)
    // 条件已是「时间窗」→ RouteTimeGrid 内联在场（组件同一性）。
    const grids = elements.filter((element) => element.type === TimeGridComponent)
    expect(grids).toHaveLength(1)
    // 格点编辑走内存草案（节流）：saveRoute 不被调；草案在 ref（卸载补盘时可见）。
    const edited = emptyRouteWindowMask()
    edited.days[0][0] = true
    ;(grids[0].props.onChange as (mask: RouteWindowMask) => void)(edited)
    expect(model.saves).toHaveLength(0)
    // 卸载补盘：fixture 记录 effect cleanup，只触发本次渲染登记的那条 = 切换选中卡的卸载路径。
    for (const cleanup of loader.effectCleanups.slice(cleanupsBefore)) cleanup()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(model.saves).toHaveLength(1)
    expect(model.saves[0].members[0].condition.window?.days[0][0]).toBe(true)
  })

  it('供应商下拉切换：模型重置为目标供应商首模型并即时保存；无已接入供应商时添加禁用 + 行内接入指引', async () => {
    const model = fakeModel(readySnapshot({ routes: [ROUTE], selectableProviders: SELECTABLE }))
    const snapshot = readySnapshot({ routes: [ROUTE], selectableProviders: SELECTABLE })
    const elements = renderBody(snapshot, ROUTE, model)
    const providerSelects = withAria(elements, modelServiceZh['route.memberProvider'])
    ;(providerSelects[0].props.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'beta' } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(model.saves).toHaveLength(1)
    expect(model.saves[0].members[0]).toEqual({ provider: 'beta', model: 'b1', order: 1, condition: { type: 'none' } })

    // 无已接入供应商：添加成员禁用 + 指引文案；成员行的供应商下拉回落「暂无可编辑供应商」。
    const emptyModel = fakeModel(readySnapshot({ routes: [ROUTE], selectableProviders: [] }))
    const emptyElements = renderBody(readySnapshot({ routes: [ROUTE], selectableProviders: [] }), ROUTE, emptyModel)
    const addButtons = elementsWithClass(emptyElements, 'ms-button').filter((button) => textOf(button) === modelServiceZh['route.addMember'])
    expect(addButtons).toHaveLength(1)
    expect(addButtons[0].props.disabled).toBe(true)
    const notes = elementsWithClass(emptyElements, 'ms-row-note').map((note) => textOf(note))
    expect(notes).toContain(modelServiceZh['route.noProvidersHint'])
  })

  it('添加成员：取首个已接入供应商与其首模型，即时保存', async () => {
    const model = fakeModel(readySnapshot({ routes: [{ id: 'r', name: 'R', members: [] }], selectableProviders: SELECTABLE }))
    const snapshot = readySnapshot({ routes: [{ id: 'r', name: 'R', members: [] }], selectableProviders: SELECTABLE })
    const elements = renderBody(snapshot, { id: 'r', name: 'R', members: [] }, model)
    const addButtons = elementsWithClass(elements, 'ms-button').filter((button) => textOf(button) === modelServiceZh['route.addMember'])
    expect(addButtons).toHaveLength(1)
    expect(addButtons[0].props.disabled).toBe(false)
    ;(addButtons[0].props.onClick as () => Promise<void>)()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(model.saves).toHaveLength(1)
    expect(model.saves[0].members).toEqual([{ provider: 'alpha', model: 'a1', order: 1, condition: { type: 'none' } }])
  })

  it('注册失败修复条：说明 + Next 指引 + 就地改名输入与动作（转发 renameRoute，成功后 onRenamed 接管新 id）', async () => {
    const model = fakeModel(readySnapshot({ routes: [ROUTE], registrationFailed: ['work-route'] }))
    model.nextRename = { id: 'new-route', name: '新名', members: ROUTE.members }
    const snapshot = readySnapshot({ routes: [ROUTE], registrationFailed: ['work-route'] })
    let renamedWith: string | undefined
  let renamedFrom: string | undefined
    const root = viewModule.RouteCardBody({ t, route: ROUTE, state: snapshot, model, onToast: () => {}, onRenamed: (oldId, newId) => { renamedWith = newId; renamedFrom = oldId }, onFlushDraftsChange: () => {} })
    const elements = collectElements(root)
    expect(elementsWithClass(elements, 'ms-route-fix')).toHaveLength(1)
    const fixTexts = elementsWithClass(elements, 'ms-note-warn').map((note) => textOf(note))
    expect(fixTexts).toContain('路由功能不可用：provider id 与宿主冲突（工作路由）')
    // 修复条的就地改名输入（受控 value 来自草案 ref；经 onChange 填新名、点动作钮触发）。
    const nameInput = elements.filter((element) => element.props['aria-label'] === modelServiceZh['route.nameField'] && element.props.className === 'ms-input')
    expect(nameInput).toHaveLength(1)
    ;(nameInput[0].props.onChange as (event: { target: { value: string } }) => void)({ target: { value: '新名' } })
    const apply = elementsWithClass(elements, 'ms-button').filter((button) => textOf(button) === modelServiceZh['route.fixRenameApply'])
    expect(apply).toHaveLength(1)
    ;(apply[0].props.onClick as () => Promise<void>)()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(model.renames).toEqual([{ oldId: 'work-route', newName: '新名' }])
    expect(renamedWith).toBe('new-route')
  })
})

/** 自由输入回落分支的夹具：provider 行在场但 models[] 空（目录默认态——模型 id 手输）。 */
const FREE_INPUT_SELECTABLE = [{ key: 'alpha', name: 'Alpha', models: [] as { id: string; name: string }[] }]
const FREE_INPUT_ROUTE: RouteEntry = { id: 'work-route', name: '工作路由', members: [member('alpha', '', 1)] }

describe('模型 id 自由输入的草案 + blur/Enter 提交（MF-1-4）', () => {
  it('连续击键不落盘（onChange N 次 → saveRoute 零调用）；blur 恰一次落盘终值', async () => {
    const model = fakeModel(readySnapshot({ routes: [FREE_INPUT_ROUTE], selectableProviders: FREE_INPUT_SELECTABLE }))
    const elements = renderBody(
      readySnapshot({ routes: [FREE_INPUT_ROUTE], selectableProviders: FREE_INPUT_SELECTABLE }),
      FREE_INPUT_ROUTE,
      model,
    )
    const modelInputs = withAria(elements, modelServiceZh['route.memberModel'])
    expect(modelInputs).toHaveLength(1)
    const onChange = modelInputs[0].props.onChange as (event: { target: { value: string } }) => void
    onChange({ target: { value: 'g' } })
    onChange({ target: { value: 'gl' } })
    onChange({ target: { value: 'glm-4' } })
    expect(model.saves).toHaveLength(0) // 击键只改草案：configForm.set 零次
    ;(modelInputs[0].props.onBlur as () => void)()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(model.saves).toHaveLength(1)
    expect(model.saves[0].members[0].model).toBe('glm-4')
  })

  it('Enter 提交后 blur 不重复落盘；未改动直接 blur 零写入', async () => {
    const model = fakeModel(readySnapshot({ routes: [FREE_INPUT_ROUTE], selectableProviders: FREE_INPUT_SELECTABLE }))
    const elements = renderBody(
      readySnapshot({ routes: [FREE_INPUT_ROUTE], selectableProviders: FREE_INPUT_SELECTABLE }),
      FREE_INPUT_ROUTE,
      model,
    )
    const input = withAria(elements, modelServiceZh['route.memberModel'])[0]
    ;(input.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'm-2' } })
    ;(input.props.onKeyDown as (event: { key: string }) => void)({ key: 'Enter' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(model.saves).toHaveLength(1)
    ;(input.props.onBlur as () => void)()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(model.saves).toHaveLength(1) // 脏标记已随 save 清除，blur 不二次写盘

    const untouched = fakeModel(readySnapshot({ routes: [FREE_INPUT_ROUTE], selectableProviders: FREE_INPUT_SELECTABLE }))
    const untouchedElements = renderBody(
      readySnapshot({ routes: [FREE_INPUT_ROUTE], selectableProviders: FREE_INPUT_SELECTABLE }),
      FREE_INPUT_ROUTE,
      untouched,
    )
    ;(withAria(untouchedElements, modelServiceZh['route.memberModel'])[0].props.onBlur as () => void)()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(untouched.saves).toHaveLength(0)
  })

  it('击键中途切卡（卡体卸载）：脏草案经卸载补盘出口落盘，不静默丢输入', async () => {
    const model = fakeModel(readySnapshot({ routes: [FREE_INPUT_ROUTE], selectableProviders: FREE_INPUT_SELECTABLE }))
    // cleanupsBefore 先于渲染取（fixture 的 useEffect 同步执行、cleanup 即时登记）。
    const cleanupsBefore = loader.effectCleanups.length
    const elements = renderBody(
      readySnapshot({ routes: [FREE_INPUT_ROUTE], selectableProviders: FREE_INPUT_SELECTABLE }),
      FREE_INPUT_ROUTE,
      model,
    )
    ;(withAria(elements, modelServiceZh['route.memberModel'])[0].props.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'draft-model' } })
    expect(model.saves).toHaveLength(0)
    for (const cleanup of loader.effectCleanups.slice(cleanupsBefore)) cleanup()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(model.saves).toHaveLength(1)
    expect(model.saves[0].members[0].model).toBe('draft-model')
  })
})

describe('改名 × 脏草案串行补盘（MF-4-2：先 flush 后 rename 唯一序）', () => {
  /** 手工接线卡体补盘出口（夹具不递归函数组件，卡头编辑器与卡体无法同树直挂——以注册表
   * 复刻 RoutesView 的 setRouteFlush / flushRouteDrafts 接线，两入口共用同一补盘序）。 */
  function wireRegistry(): {
    registry: Map<string, () => Promise<void>>
    onFlushDraftsChange: (id: string, flush: (() => Promise<void>) | undefined) => void
    flushDrafts: (id: string) => Promise<void>
  } {
    const registry = new Map<string, () => Promise<void>>()
    return {
      registry,
      onFlushDraftsChange: (id, flush) => {
        if (flush === undefined) registry.delete(id)
        else registry.set(id, flush)
      },
      flushDrafts: async (id) => { await registry.get(id)?.() },
    }
  }

  it('卡头 commitRename：脏模型 id 草案下改名——补盘先于 renameRoute（save→rename 调用序）且落盘成员含草案值', async () => {
    const snapshot = readySnapshot({ routes: [FREE_INPUT_ROUTE], selectableProviders: FREE_INPUT_SELECTABLE })
    const model = fakeModel(snapshot)
    model.nextRename = { id: 'renamed-route', name: '新名', members: FREE_INPUT_ROUTE.members }
    const wiring = wireRegistry()
    const body = collectElements(viewModule.RouteCardBody({
      t, route: FREE_INPUT_ROUTE, state: snapshot, model,
      onToast: () => {}, onRenamed: () => {}, onFlushDraftsChange: wiring.onFlushDraftsChange,
    }))
    // 击键改草案（脏、不落盘）；卡体挂载即登记补盘出口。
    ;(withAria(body, modelServiceZh['route.memberModel'])[0].props.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'draft-model' } })
    expect(model.saves).toHaveLength(0)
    expect(wiring.registry.get('work-route')).toBeTypeOf('function')
    // 卡头编辑器（startEditing 直挂输入分支——夹具无法从按钮态翻到输入态；flushDrafts 接线
    // 同 RoutesView：按路由 id 从注册表取卡体出口）。
    let renamedWith: string | undefined
  let renamedFrom: string | undefined
    const head = collectElements(viewModule.RouteNameEditor({
      t, route: FREE_INPUT_ROUTE, model,
      onRenamed: (oldId, newId) => { renamedWith = newId; renamedFrom = oldId },
      flushDrafts: () => wiring.flushDrafts(FREE_INPUT_ROUTE.id),
      startEditing: true,
    }))
    const nameInput = head.filter((element) => element.props.className === 'ms-input ms-route-name-input')
    expect(nameInput).toHaveLength(1)
    ;(nameInput[0].props.onChange as (event: { target: { value: string } }) => void)({ target: { value: '新名' } })
    ;(nameInput[0].props.onBlur as () => void)()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(model.calls).toEqual(['save', 'rename'])
    expect(model.saves).toHaveLength(1)
    expect(model.saves[0].members[0].model).toBe('draft-model')
    expect(model.renames).toEqual([{ oldId: 'work-route', newName: '新名' }])
    expect(renamedWith).toBe('renamed-route')
  })

  it('修复条 applyFixRename：脏时间窗草案下改名——补盘先于 renameRoute 且落盘格点在场', async () => {
    const windowed: RouteEntry = {
      id: 'work-route',
      name: '工作路由',
      members: [{ ...member('alpha', 'a1', 1), condition: { type: 'window', window: emptyRouteWindowMask() } }],
    }
    const snapshot = readySnapshot({ routes: [windowed], registrationFailed: ['work-route'], selectableProviders: SELECTABLE })
    const model = fakeModel(snapshot)
    model.nextRename = { id: 'renamed-route', name: '新名', members: windowed.members }
    const wiring = wireRegistry()
    const body = collectElements(viewModule.RouteCardBody({
      t, route: windowed, state: snapshot, model,
      onToast: () => {}, onRenamed: () => {}, onFlushDraftsChange: wiring.onFlushDraftsChange,
    }))
    // 时间窗格点草案（脏、不落盘）。
    const grids = body.filter((element) => element.type === TimeGridComponent)
    expect(grids).toHaveLength(1)
    const edited = emptyRouteWindowMask()
    edited.days[0][0] = true
    ;(grids[0].props.onChange as (mask: RouteWindowMask) => void)(edited)
    expect(model.saves).toHaveLength(0)
    // 修复条就地改名（输入 + 动作钮同屏在场，直调）。
    const fixInput = body.filter((element) => element.props['aria-label'] === modelServiceZh['route.nameField'] && element.props.className === 'ms-input')
    expect(fixInput).toHaveLength(1)
    ;(fixInput[0].props.onChange as (event: { target: { value: string } }) => void)({ target: { value: '新名' } })
    const apply = elementsWithClass(body, 'ms-button').filter((button) => textOf(button) === modelServiceZh['route.fixRenameApply'])
    ;(apply[0].props.onClick as () => Promise<void>)()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(model.calls).toEqual(['save', 'rename'])
    expect(model.saves).toHaveLength(1)
    expect(model.saves[0].members[0].condition.window?.days[0][0]).toBe(true)
    expect(model.renames).toEqual([{ oldId: 'work-route', newName: '新名' }])
  })

  it('非脏状态下改名零额外写盘（flushDrafts 只认脏标记，空操作不产生 save）', async () => {
    const snapshot = readySnapshot({ routes: [ROUTE], registrationFailed: ['work-route'] })
    const model = fakeModel(snapshot)
    model.nextRename = { id: 'renamed-route', name: '新名', members: ROUTE.members }
    const wiring = wireRegistry()
    const body = collectElements(viewModule.RouteCardBody({
      t, route: ROUTE, state: snapshot, model,
      onToast: () => {}, onRenamed: () => {}, onFlushDraftsChange: wiring.onFlushDraftsChange,
    }))
    // 无草案击键：直接修复条改名。
    const fixInput = body.filter((element) => element.props['aria-label'] === modelServiceZh['route.nameField'] && element.props.className === 'ms-input')
    ;(fixInput[0].props.onChange as (event: { target: { value: string } }) => void)({ target: { value: '新名' } })
    const apply = elementsWithClass(body, 'ms-button').filter((button) => textOf(button) === modelServiceZh['route.fixRenameApply'])
    ;(apply[0].props.onClick as () => Promise<void>)()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(model.calls).toEqual(['rename'])
    expect(model.saves).toHaveLength(0)
    expect(model.renames).toEqual([{ oldId: 'work-route', newName: '新名' }])
  })
})

describe('空态矩阵消费派生可用成员计数（MF-1-14）', () => {
  /** 夹具不递归函数组件：EmptyMatrix 直挂（导出面 = RoutesView 生产消费 + 单测直挂）；
   * 无空态时组件返回 null，collectElements 以空清单承接。 */
  const emptyMatrix = (snapshot: RoutesSnapshot): FakeElement[] => {
    const root = (viewModule as unknown as { EmptyMatrix: (props: Record<string, unknown>) => FakeElement | null }).EmptyMatrix({ t, state: snapshot })
    return root === null ? [] : collectElements(root)
  }

  it('可见路由全员不可用（usableMembers 全 0）→ 第三空态；有可用成员 → 不渲染', () => {
    const allUnavailable = readySnapshot({
      routes: [ROUTE],
      whitelist: ['work-route'],
      usableMembers: new Map([['work-route', 0]]),
    })
    const elements = emptyMatrix(allUnavailable)
    const titles = elementsWithClass(elements, 'ms-empty-title').map((title) => textOf(title))
    expect(titles).toContain(modelServiceZh['routes.emptyMembersUnavailable'])

    const hasUsable = readySnapshot({
      routes: [ROUTE],
      whitelist: ['work-route'],
      usableMembers: new Map([['work-route', 2]]),
    })
    expect(elementsWithClass(emptyMatrix(hasUsable), 'ms-empty')).toHaveLength(0)
  })

  it('前两空态分流不变：无路由 / 有路由无一可见（第三态判定不越位）', () => {
    const noRoutes = readySnapshot({ routes: [], whitelist: [] })
    const titlesNoRoutes = elementsWithClass(emptyMatrix(noRoutes), 'ms-empty-title').map((title) => textOf(title))
    expect(titlesNoRoutes).toEqual([modelServiceZh['routes.emptyNoRoutes']])

    const noneVisible = readySnapshot({ routes: [ROUTE], whitelist: [], usableMembers: new Map([['work-route', 1]]) })
    const titlesNoneVisible = elementsWithClass(emptyMatrix(noneVisible), 'ms-empty-title').map((title) => textOf(title))
    expect(titlesNoneVisible).toEqual([modelServiceZh['routes.emptyNotWhitelisted']])
  })
})
