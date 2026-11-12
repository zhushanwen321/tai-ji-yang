import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { collectElements, createTsxLoader, elementsWithClass, textOf, type FakeElement } from '../../testing/load-tsx'
import { modelServiceZh } from '../../locale'
import type { ModelServiceHost, SettingsNamespaceViewLike, SettingsOp } from '../../model-service/settings-client'
import type { ModelGroupSnapshot, ModelsListSnapshot, ModelSourceFilter } from './models-view'
import type { Translate } from './model-edit'

/**
 * ModelsView 单测（模型清单操作台，清单交互定稿 C1-C5）：
 *   · 视图接线：空态矩阵三态（未接入 / 有供应商无行 / 筛选无结果）的引导按钮转发接线
 *     （F1-29 回归保护面延续）+ 来源 chip 组 + 分组组头动作（跳转 / 自定义此清单 / 添加模型）
 *     与行内动作（编辑 / 删除 / 复制到自定义清单）；
 *   · ModelsListModel 行为：四层分组拼装（未接入目录 route 不直出）、来源筛选、行内编辑
 *     保存往返（空 id 拒绝 / 原位替换 / 追加）、复制到自定义清单（同 id 不重复 + 目录默认
 *     被替换 toast）、删除至空（unset models = 目录默认恢复）。
 */

const VIEW_PATH = fileURLToPath(new URL('./models-view.tsx', import.meta.url))

const loader = createTsxLoader()
const viewModule = loader.load(VIEW_PATH) as unknown as {
  ModelsView: (props: Record<string, unknown>) => FakeElement
  ModelsListModel: new (deps: { remote: unknown; t: Translate }) => {
    pending: Promise<void>
    getSnapshot(): ModelsListSnapshot
    subscribe(listener: () => void): () => void
    setFilter(value: string): void
    setSourceFilter(value: ModelSourceFilter): void
    beginEdit(key: string, index: number): void
    beginAdd(key: string): void
    setEditDraft(draft: unknown): void
    cancelEdit(): void
    saveEdit(): Promise<boolean>
    removeModel(key: string, index: number): Promise<boolean>
    copyToCustom(key: string, modelId: string): Promise<boolean>
    customizeFromDirectory(key: string): Promise<boolean>
  }
}
// ModelEdit 组件同一性参照（同一 loader 树内加载的函数；夹具不递归函数组件，
// 行内编辑卡的深断言按「组件元素在场 + 草案引用」承载）。
const ModelEditComponent = loader.load(
  fileURLToPath(new URL('./model-edit.tsx', import.meta.url)),
).ModelEdit as unknown

/** 翻译桩：zh 词条 + {param} 插值（断言可见文本用）。 */
const t: Translate = (key, params) => {
  let text = modelServiceZh[key]
  for (const [name, value] of Object.entries(params ?? {})) text = text.replaceAll(`{${name}}`, String(value))
  return text
}

/** 快照构造：ready 态基座 + 覆盖（视图空态矩阵分流只看 groups / filter / sourceFilter / providersExist）。 */
function readySnapshot(overrides: Partial<ModelsListSnapshot> = {}): ModelsListSnapshot {
  return {
    status: 'ready',
    groups: [],
    providersExist: false,
    filter: '',
    sourceFilter: 'all',
    editing: undefined,
    notice: undefined,
    error: undefined,
    ...overrides,
  }
}

/** 假视图模型（视图只经 useSyncExternalStore 取快照；动作 spy 供接线断言）。 */
function fakeModel(snapshot: ModelsListSnapshot, actions: Partial<Record<string, (...args: unknown[]) => unknown>> = {}): Record<string, unknown> {
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    setFilter: actions.setFilter ?? (() => {}),
    setSourceFilter: actions.setSourceFilter ?? (() => {}),
    beginEdit: actions.beginEdit ?? (() => {}),
    beginAdd: actions.beginAdd ?? (() => {}),
    customizeFromDirectory: actions.customizeFromDirectory ?? (() => {}),
    copyToCustom: actions.copyToCustom ?? (() => {}),
    removeModel: actions.removeModel ?? (() => {}),
    ...actions,
  }
}

/** 渲染并返回元素树（跳转与接入引导用手写 spy 计数，不经 vi 假设）。 */
function renderView(
  snapshot: ModelsListSnapshot,
  handlers: { onGoToProviders?: () => void; onJump?: (provider: string, model?: string) => void } = {},
  actions: Partial<Record<string, (...args: unknown[]) => unknown>> = {},
): FakeElement[] {
  const root = viewModule.ModelsView({
    t,
    model: fakeModel(snapshot, actions),
    onJump: handlers.onJump ?? (() => {}),
    onGoToProviders: handlers.onGoToProviders ?? (() => {}),
  })
  return collectElements(root)
}

/** 分组构造（视图渲染用最小面）。 */
function group(overrides: Partial<ModelGroupSnapshot> = {}): ModelGroupSnapshot {
  return {
    providerKey: 'alpha',
    providerName: 'Alpha',
    source: 'custom',
    rows: [{ modelId: 'a1', modelName: 'A1', contextWindow: '1048576', maxTokens: '未提供', inputModalities: 'text', reasoning: '' }],
    directoryModels: [],
    customEntries: [],
    ...overrides,
  }
}

describe('ModelsView 空态矩阵与筛选接线', () => {
  it('目录无 provider 空态：「尚未接入供应商」+ 引导按钮（文案 = models.emptyGoProviders，onClick 引用一致转发）', () => {
    let goCalls = 0
    const onGoToProviders = () => { goCalls += 1 }
    const elements = renderView(readySnapshot(), { onGoToProviders })
    expect(elementsWithClass(elements, 'ms-empty')).toHaveLength(1)
    const titles = elementsWithClass(elements, 'ms-empty-title')
    expect(textOf(titles[0])).toBe(modelServiceZh['models.emptyNoProviders'])
    const buttons = elementsWithClass(elements, 'ms-button-primary')
    expect(buttons).toHaveLength(1)
    expect(textOf(buttons[0])).toBe(modelServiceZh['models.emptyGoProviders'])
    // 引用一致 = 转发接线：按钮 onClick 就是传入的回调本身。
    expect(buttons[0].props.onClick).toBe(onGoToProviders)
    ;(buttons[0].props.onClick as () => void)()
    expect(goCalls).toBe(1)
  })

  it('有 provider 无行空态（来源筛选在「全部」）：「供应商已接入，但还没有模型」+ 同款引导按钮接线', () => {
    let goCalls = 0
    const elements = renderView(readySnapshot({ providersExist: true }), { onGoToProviders: () => { goCalls += 1 } })
    const titles = elementsWithClass(elements, 'ms-empty-title')
    expect(textOf(titles[0])).toBe(modelServiceZh['models.emptyNoModelsButProviders'])
    const buttons = elementsWithClass(elements, 'ms-button-primary')
    ;(buttons[0].props.onClick as () => void)()
    expect(goCalls).toBe(1)
  })

  it('来源筛选非「全部」且无分组：来源空态（该来源下没有模型）+「全部」复位按钮，两个非筛选空态不渲染', () => {
    const elements = renderView(readySnapshot({ providersExist: true, sourceFilter: 'custom' }))
    const titles = elementsWithClass(elements, 'ms-empty-title')
    expect(textOf(titles[0])).toBe(modelServiceZh['models.emptySourceFiltered'])
    const reset = elementsWithClass(elements, 'ms-button').filter((button) => textOf(button) === modelServiceZh['models.sourceFilterAll'])
    expect(reset).toHaveLength(1)
    expect(elementsWithClass(elements, 'ms-button-primary')).toHaveLength(0)
  })

  it('关键词筛选无结果：没有匹配「{q}」+ 清除动作（既有 V9 步骤 5 语义保留）', () => {
    const elements = renderView(readySnapshot({ providersExist: true, filter: '不存在的模型' }))
    const titles = elementsWithClass(elements, 'ms-empty-title')
    expect(textOf(titles[0])).toBe('没有匹配「不存在的模型」的模型')
    const clear = elementsWithClass(elements, 'ms-button').filter((button) => textOf(button) === modelServiceZh['models.clearFilter'])
    expect(clear).toHaveLength(1)
  })

  it('分组在场时空态矩阵不渲染', () => {
    const elements = renderView(readySnapshot({ providersExist: true, groups: [group()] }))
    expect(elementsWithClass(elements, 'ms-empty')).toHaveLength(0)
    expect(elementsWithClass(elements, 'ms-model-group')).toHaveLength(1)
  })
})

describe('ModelsView 分组组头与行内动作接线', () => {
  it('组头：供应商名 + 来源徽章 + 清单态徽章（自定义清单 · N 个）+ 跳转与添加模型动作', () => {
    let jumped: string | undefined
    let addedKey: string | undefined
    const elements = renderView(
      readySnapshot({ providersExist: true, groups: [group()] }),
      { onJump: (provider) => { jumped = provider } },
      { beginAdd: (key) => { addedKey = key as string } },
    )
    const heads = elementsWithClass(elements, 'ms-model-group-head')
    expect(heads).toHaveLength(1)
    const badgeTexts = elementsWithClass(elements, 'ms-badge').map((badge) => textOf(badge))
    expect(badgeTexts).toContain(modelServiceZh['models.sourceCustom'])
    expect(badgeTexts).toContain('自定义清单 · 1 个')
    const locate = elementsWithClass(elements, 'ms-button').filter((button) => textOf(button) === modelServiceZh['action.locate'])
    expect(locate).toHaveLength(1)
    ;(locate[0].props.onClick as () => void)()
    expect(jumped).toBe('alpha')
    const add = elementsWithClass(elements, 'ms-button').filter((button) => textOf(button) === modelServiceZh['models.addModel'])
    expect(add).toHaveLength(1)
    ;(add[0].props.onClick as () => void)()
    expect(addedKey).toBe('alpha')
  })

  it('目录默认组：自定义此清单动作接线；无目录模型时回落「添加模型」；行内为复制到自定义清单', () => {
    let customized: string | undefined
    let copied: { key: string; modelId: string } | undefined
    const directory = group({
      providerKey: 'dirp',
      providerName: 'DirP',
      source: 'directory',
      directoryModels: [{ id: 'd1', name: 'D1' }],
      rows: [{ modelId: 'd1', modelName: 'D1', contextWindow: '未提供', maxTokens: '未提供', inputModalities: '未提供', reasoning: '' }],
    })
    const emptyDirectory = group({ providerKey: 'bare', providerName: 'Bare', source: 'directory', directoryModels: [], rows: [] })
    const elements = renderView(
      readySnapshot({ providersExist: true, groups: [directory, emptyDirectory] }),
      {},
      {
        customizeFromDirectory: (key) => { customized = key as string },
        copyToCustom: (key, modelId) => { copied = { key: key as string, modelId: modelId as string } },
      },
    )
    const customize = elementsWithClass(elements, 'ms-button').filter((button) => textOf(button) === modelServiceZh['models.customizeFromDirectory'])
    expect(customize).toHaveLength(1) // 只在有目录模型的目录默认组
    ;(customize[0].props.onClick as () => void)()
    expect(customized).toBe('dirp')
    const addButtons = elementsWithClass(elements, 'ms-button').filter((button) => textOf(button) === modelServiceZh['models.addModel'])
    expect(addButtons).toHaveLength(1) // 目录模型为空的目录默认组回落添加模型
    const copy = elementsWithClass(elements, 'ms-button').filter((button) => textOf(button) === modelServiceZh['models.copyToCustom'])
    expect(copy).toHaveLength(1)
    ;(copy[0].props.onClick as () => void)()
    expect(copied).toEqual({ key: 'dirp', modelId: 'd1' })
  })

  it('自定义条目行：编辑 / 删除动作接线；托管组只读（无行内动作，注明宿主管理）', () => {
    let edited: { key: string; index: number } | undefined
    let removed: { key: string; index: number } | undefined
    const managed = group({ providerKey: 'deepseek-official', providerName: 'DeepSeek 官方', source: 'managed', rows: [] })
    const elements = renderView(
      readySnapshot({ providersExist: true, groups: [group(), managed] }),
      {},
      {
        beginEdit: (key, index) => { edited = { key: key as string, index: index as number } },
        removeModel: (key, index) => { removed = { key: key as string, index: index as number } },
      },
    )
    const edit = elementsWithClass(elements, 'ms-button').filter((button) => textOf(button) === modelServiceZh['action.edit'])
    expect(edit).toHaveLength(1)
    ;(edit[0].props.onClick as () => void)()
    expect(edited).toEqual({ key: 'alpha', index: 0 })
    const remove = elementsWithClass(elements, 'ms-button').filter((button) => textOf(button) === modelServiceZh['models.removeModel'])
    expect(remove).toHaveLength(1)
    ;(remove[0].props.onClick as () => void)()
    expect(removed).toEqual({ key: 'alpha', index: 0 })
    // 托管组：宿主管理注记在场；行内动作（编辑/删除/复制）只属于可编辑组。
    const notes = elementsWithClass(elements, 'ms-row-note').map((note) => textOf(note))
    expect(notes).toContain(modelServiceZh['providers.managedNote'])
    expect(edit).toHaveLength(1)
    expect(remove).toHaveLength(1)
  })

  it('行内编辑卡：编辑态草案挂 ModelEdit 控件（组件同一性 + 草稿引用），保存/取消接线（保存转发 model.saveEdit）', () => {
    let saveCalls = 0
    const editing = { key: 'alpha', index: 0, isNew: false, draft: { id: 'a1', name: 'A1', contextWindow: 1048576, maxTokens: undefined, input: ['text' as const], thinkingEnabled: false, levels: [], preserve: true } }
    const elements = renderView(
      readySnapshot({ providersExist: true, groups: [group()], editing }),
      {},
      { saveEdit: () => { saveCalls += 1 } },
    )
    const editCards = elementsWithClass(elements, 'ms-model-row-edit')
    expect(editCards).toHaveLength(1)
    // ModelEdit 是函数组件（夹具不递归）：按组件同一性断言在场，草案引用一致挂载。
    const modelEdits = elements.filter((element) => element.type === ModelEditComponent)
    expect(modelEdits).toHaveLength(1)
    expect((modelEdits[0].props.draft as { id: string }).id).toBe('a1')
    const save = elementsWithClass(elements, 'ms-button-primary').filter((button) => textOf(button) === modelServiceZh['models.editSave'])
    expect(save).toHaveLength(1)
    ;(save[0].props.onClick as () => void)()
    expect(saveCalls).toBe(1)
    const cancel = elementsWithClass(elements, 'ms-button').filter((button) => textOf(button) === modelServiceZh['action.cancel'])
    expect(cancel).toHaveLength(1)
  })

  it('notice / error 上报面：toast（目录默认已被替换）与错误条（writeProviderModels 四段式）', () => {
    const elements = renderView(
      readySnapshot({ providersExist: true, groups: [group()], notice: modelServiceZh['models.directoryReplaced'], error: '模型清单未能写入宿主设置文档（llm-pi-ai 命名空间 providers.alpha.models）：…' }),
    )
    const statuses = elements.filter((element) => element.props.role === 'status').map((element) => textOf(element))
    expect(statuses).toContain(modelServiceZh['models.directoryReplaced'])
    const alerts = elements.filter((element) => element.props.role === 'alert').map((element) => textOf(element))
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toContain('providers.alpha.models')
  })
})

// ── ModelsListModel 行为（分组拼装 / 筛选 / 写路径）──────────────────────────────────

/** 假宿主：设置文档 providers 段可注入，mutate 就地合并 path ops（写路径往返的真值底座）。 */
function fakeHost(options: {
  providers?: Record<string, Record<string, unknown>>
  directory?: { provider: string; displayName: string; settingsNs: string }[]
  catalogGroups?: { id: string; name: string; models: { id: string; name: string }[] }[]
  discover?: { provider: string; models: { id: string; name?: string }[] }[]
} = {}): ModelServiceHost & { mutations: { ops: SettingsOp[] }[] } {
  const providers: Record<string, Record<string, unknown>> = structuredClone(options.providers ?? {})
  const mutations: { ops: SettingsOp[] }[] = []
  return {
    mutations,
    catalogGroups: options.catalogGroups,
    settings: {
      async describe() {
        const namespaces: SettingsNamespaceViewLike[] = [{ ns: 'llm-pi-ai', value: { providers }, revision: 1 }]
        return { ok: true, value: { writable: true, namespaces } }
      },
      async mutate(_ns: string, ops: SettingsOp[]) {
        mutations.push({ ops })
        for (const op of ops) {
          const key = op.path[1] as string
          if (op.path.length === 3 && op.path[2] === 'models') {
            if (op.op === 'set') providers[key] = { ...providers[key], models: op.value }
            else if (providers[key] !== undefined) Reflect.deleteProperty(providers[key], 'models')
          }
        }
        return { ok: true, value: { ns: 'llm-pi-ai', value: { providers }, revision: 2 } }
      },
    },
    llm: {
      async listProviders() { return { ok: true, value: [] } },
      async listConfigurableProviders() {
        return {
          ok: true,
          value: (options.directory ?? []).map((row) => ({ provider: row.provider, displayName: row.displayName, settingsNs: row.settingsNs, settingsPath: ['providers', row.provider] })),
        }
      },
      async discoverModels(_ns: string, request: { provider?: string }) {
        const hit = (options.discover ?? []).find((entry) => entry.provider === request.provider)
        return { ok: true, value: hit?.models ?? [] }
      },
    },
    credentials: {
      describe: async () => ({ ok: true, value: {} }),
      set: async () => ({ ok: true, value: undefined }),
      unset: async () => ({ ok: true, value: undefined }),
    },
  }
}

/** 目录模型与快照的分组合成用例底座（四层拼装的可观察事实；catalogGroups 注入 session 派生面）。 */
async function makeModel(host: ReturnType<typeof fakeHost> & { catalogGroups?: { id: string; name: string; models: { id: string; name: string }[] }[] }) {
  const remote = host.catalogGroups !== undefined
    ? { ...host, session: { modelCatalog: async () => ({ ok: true, value: { groups: host.catalogGroups } }) } }
    : host
  const instance = new viewModule.ModelsListModel({ remote, t })
  await instance.pending
  return instance
}

describe('ModelsListModel 分组拼装（四层数据源）', () => {
  it('按供应商分组：自定义组（快照 models）/ 目录默认组（discover 短路）/ 托管组（catalog）；未接入目录 route 不直出', async () => {
    const host = fakeHost({
      providers: {
        alpha: { displayName: 'Alpha', models: [{ id: 'a1', name: 'A1', input: ['text'] }] },
        dirp: {}, // 已接入、零自定义清单 = 目录默认态（discover 分支）
      },
      directory: [
        { provider: 'alpha', displayName: 'Alpha', settingsNs: 'llm-pi-ai' },
        { provider: 'dirp', displayName: 'DirP', settingsNs: 'llm-pi-ai' },
        { provider: 'deepseek-official', displayName: 'DeepSeek 官方', settingsNs: 'other-ns' },
        { provider: 'zeta', displayName: 'Zeta（未接入）', settingsNs: 'llm-pi-ai' },
      ],
      catalogGroups: [{ id: 'deepseek-official', name: 'DeepSeek 官方', models: [{ id: 'dsk-chat', name: 'DSK Chat' }] }],
      discover: [{ provider: 'dirp', models: [{ id: 'd1', name: 'D1', contextWindow: 8192 }] }],
    })
    const model = await makeModel(host)
    const snapshot = model.getSnapshot()
    expect(snapshot.status).toBe('ready')
    expect(snapshot.groups.map((group) => `${group.providerKey}:${group.source}`)).toEqual([
      'alpha:custom',
      'dirp:directory',
      'deepseek-official:managed',
    ])
    // 自定义组条目原文（写路径的整段替换底稿）。
    expect(snapshot.groups[0].customEntries).toEqual([{ id: 'a1', name: 'A1', input: ['text'] }])
    // 目录默认组的目录模型（复制/自定义此清单的数据源）与行字段。
    expect(snapshot.groups[1].directoryModels).toEqual([{ id: 'd1', name: 'D1', contextWindow: 8192 }])
    expect(snapshot.groups[1].rows[0].contextWindow).toBe('8192')
    // 托管组行来自 catalog 分组。
    expect(snapshot.groups[2].rows[0].modelId).toBe('dsk-chat')
    // 未接入的 zeta 不产生分组。
    expect(snapshot.groups.some((group) => group.providerKey === 'zeta')).toBe(false)
  })

  it('来源筛选：custom 只留自定义组；directory 留目录默认与覆盖两态；关键词过滤行并隐藏空组', async () => {
    const host = fakeHost({
      providers: { alpha: { models: [{ id: 'a1', name: 'A1', input: ['text'] }] }, dirp: {} },
      directory: [
        { provider: 'alpha', displayName: 'Alpha', settingsNs: 'llm-pi-ai' },
        { provider: 'dirp', displayName: 'DirP', settingsNs: 'llm-pi-ai' },
      ],
      discover: [{ provider: 'dirp', models: [{ id: 'd1', name: 'D1' }] }],
    })
    const model = await makeModel(host)
    model.setSourceFilter('custom')
    expect(model.getSnapshot().groups.map((group) => group.providerKey)).toEqual(['alpha'])
    model.setSourceFilter('directory')
    expect(model.getSnapshot().groups.map((group) => group.providerKey)).toEqual(['dirp'])
    model.setSourceFilter('all')
    expect(model.getSnapshot().groups).toHaveLength(2)
    model.setFilter('a1')
    expect(model.getSnapshot().groups.map((group) => group.providerKey)).toEqual(['alpha'])
    model.setFilter('不存在的模型')
    expect(model.getSnapshot().groups).toEqual([])
    model.clearFilter()
    expect(model.getSnapshot().groups).toHaveLength(2)
  })
})

describe('ModelsListModel 写路径（writeProviderModels 消费侧）', () => {
  const alphaModels = [{ id: 'a1', name: 'A1', input: ['text'] }]

  async function customModel() {
    const host = fakeHost({
      providers: { alpha: { displayName: 'Alpha', models: structuredClone(alphaModels) } },
      directory: [{ provider: 'alpha', displayName: 'Alpha', settingsNs: 'llm-pi-ai' }],
    })
    const model = await makeModel(host)
    return { host, model }
  }

  it('beginEdit + saveEdit：空 id 拒绝（零写入 + 错误条），填 id 后原位替换整段写回', async () => {
    const { host, model } = await customModel()
    model.beginEdit('alpha', 0)
    model.setEditDraft({ id: '', name: '', contextWindow: undefined, maxTokens: undefined, input: ['text'], thinkingEnabled: false, levels: [], preserve: true })
    expect(await model.saveEdit()).toBe(false)
    expect(model.getSnapshot().error).toBe(modelServiceZh['models.editNeedsId'])
    expect(host.mutations).toHaveLength(0)

    model.setEditDraft({ id: 'a1', name: 'A1 改', contextWindow: 32768, maxTokens: undefined, input: ['text'], thinkingEnabled: false, levels: [], preserve: true })
    expect(await model.saveEdit()).toBe(true)
    expect(host.mutations).toHaveLength(1)
    // preserve 草案（无 reasoningEfforts 既有值）写回省略该字段（沿用目录能力语义，D3 保真）。
    expect(host.mutations[0].ops).toEqual([{
      op: 'set',
      path: ['providers', 'alpha', 'models'],
      value: [{ id: 'a1', name: 'A1 改', input: ['text'], contextWindow: 32768 }],
    }])
    expect(model.getSnapshot().notice).toBe(modelServiceZh['save.saved'])
    expect(model.getSnapshot().editing).toBeUndefined()
    // 写后重读：分组行反映新值。
    expect(model.getSnapshot().groups[0].rows[0].modelName).toBe('A1 改')
  })

  it('beginAdd + saveEdit：新条目追加（首笔写入后 toast 注明目录默认已被替换）', async () => {
    const host = fakeHost({
      providers: { dirp: {} },
      directory: [{ provider: 'dirp', displayName: 'DirP', settingsNs: 'llm-pi-ai' }],
      discover: [{ provider: 'dirp', models: [{ id: 'd1', name: 'D1' }] }],
    })
    const model = await makeModel(host)
    expect(model.getSnapshot().groups[0].source).toBe('directory')
    model.beginAdd('dirp')
    model.setEditDraft({ id: 'new-model', name: 'New', contextWindow: undefined, maxTokens: undefined, input: ['text'], thinkingEnabled: false, levels: [], preserve: true })
    expect(await model.saveEdit()).toBe(true)
    expect(model.getSnapshot().notice).toBe(modelServiceZh['models.directoryReplaced'])
    expect(model.getSnapshot().groups[0].source).toBe('custom')
    expect(model.getSnapshot().groups[0].customEntries).toEqual([{ id: 'new-model', name: 'New', input: ['text'] }])
  })

  it('copyToCustom：目录条目追加写入并注明目录默认已被替换；同 id 已存在时提示不重复、零写入', async () => {
    const host = fakeHost({
      providers: { dirp: {} },
      directory: [{ provider: 'dirp', displayName: 'DirP', settingsNs: 'llm-pi-ai' }],
      discover: [{ provider: 'dirp', models: [{ id: 'd1', name: 'D1' }, { id: 'd2', name: 'D2' }] }],
    })
    const model = await makeModel(host)
    expect(await model.copyToCustom('dirp', 'd1')).toBe(true)
    expect(host.mutations[0].ops[0].value).toEqual([{ id: 'd1', name: 'D1', input: ['text'] }])
    expect(model.getSnapshot().notice).toBe(modelServiceZh['models.directoryReplaced'])

    // 再复制同 id：条目已在清单 → 不重复提示、零写入。
    expect(await model.copyToCustom('dirp', 'd1')).toBe(false)
    expect(model.getSnapshot().notice).toBe('模型 d1 已在自定义清单中，未重复添加')
    expect(host.mutations).toHaveLength(1)
  })

  it('removeModel：删除自定义条目整段写回；删空 = unset models（目录默认恢复 toast）', async () => {
    const host = fakeHost({
      providers: { alpha: { models: structuredClone(alphaModels) } },
      directory: [{ provider: 'alpha', displayName: 'Alpha', settingsNs: 'llm-pi-ai' }],
    })
    const model = await makeModel(host)
    expect(await model.removeModel('alpha', 0)).toBe(true)
    expect(host.mutations[0].ops).toEqual([{ op: 'unset', path: ['providers', 'alpha', 'models'] }])
    expect(model.getSnapshot().notice).toBe(modelServiceZh['models.directoryMode'])
    expect(model.getSnapshot().groups[0].source).toBe('directory')
  })
})
