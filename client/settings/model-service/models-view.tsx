/**
 * client/settings/model-service/models-view.tsx —— 模型清单操作台（清单交互定稿：
 * 「清单即操作台」；dsh-model-service G16/M1 四层数据源保留，只读汇总升级为分组操作台）。
 *
 * 四层数据源（SC3）：session.modelCatalog（注册表派生：id/name/推理档位——托管 provider 行与
 * 推理标注的来源）+ 设置快照（来源态判定与自定义条目字段）+ discoverModels 目录分支
 * （目录默认态的 contextWindow/maxTokens/inputModalities，provider 命中目录零网络，AS7）+
 * 目录清单（托管 provider 只读行）。缺失字段标注「未提供」。
 *
 * 分组操作台（按供应商一组）：
 *   · 组头 = 供应商名 + 来源徽章 + 清单态徽章（「目录默认 · N 个（只读）」/「自定义清单 ·
 *     N 个」）+ 组级动作：目录默认组 →「自定义此清单」（目录模型铺开写入 models[]，成为
 *     可编辑起点）；自定义组 →「+ 添加模型」（追加空白条目行就地填写）；组头保留「供应商
 *     配置」跳转（onJump 既有通道）；托管组只读（注明宿主管理）；
 *   · 行内动作：自定义条目 → 编辑（就地展开编辑卡，ModelDraft 控件复用 model-edit）与删除；
 *     目录默认条目 → 复制到自定义清单（追加进该供应商 models[]——整体替换语义下从此可编辑；
 *     同 id 已存在时提示不重复、零写入）；
 *   · 写通道 = settings-client.writeProviderModels（describe 取 revision → mutate 整段 set
 *     providers.<key>.models → 回读校验；冲突重读一次重发一次，四段式文案报错进错误条）。
 *     models[] 非空整体替换目录默认的宿主语义必须显式提示：目录默认被替换的动作 toast 一律
 *     注明「目录默认已被替换」，组头徽章随之翻转为「自定义清单」。
 *
 * 筛选：关键词（保留现状，内存过滤）+ 来源 chip（全部 / 自定义 / 目录默认；目录默认匹配
 * directory 与 override 两态——同为目录基线）。
 *
 * 跳转态（目标 provider/model + 返回路径）由分区组件承载（section.tsx），本视图只发起 onJump。
 * 空态矩阵（V9）：目录无任何 provider → 「尚未接入供应商」+ 接入引导；有 provider 无任何
 * 分组行 → 「供应商已接入，但还没有模型」；关键词/来源筛选无结果 → 对应空态 + 清除动作。
 */
import { useSyncExternalStore } from 'react'
import {
  LLM_PI_AI_NS,
  listProviderDirectory,
  modelFromDraft,
  modelToDraft,
  readLlmPiAi,
  unwrapRemote,
  writeProviderModels,
  THINKING_LEVELS,
  type ConfigurableProviderRow,
  type HostProviderProfile,
  type ModelDraft,
  type ModelServiceHost,
} from '../../model-service/settings-client'
import { discoverProviderModels, type DiscoveredModel } from '../../model-service/discovery'
import { DEFAULT_CONTEXT_WINDOW, ModelEdit, type Translate } from './model-edit'
import type { ModelCatalogLike, SessionRemoteLike } from './section'

/** 清单行快照（组内行；四层只读信息保留展示）。 */
export interface ModelListRow {
  modelId: string
  modelName: string
  contextWindow: string
  maxTokens: string
  inputModalities: string
  /** 推理档位（modelCatalog 的 efforts 名拼接；空串 = 不渲染该列）。 */
  reasoning: string
}

/** 分组快照（按供应商一组的操作台单元；来源态组级互斥）。 */
export interface ModelGroupSnapshot {
  providerKey: string
  providerName: string
  /** 来源态（D11 四态；目录默认与覆盖同为目录基线，来源 chip 一并匹配）。 */
  source: 'custom' | 'directory' | 'override' | 'managed'
  rows: ModelListRow[]
  /** 目录模型（复制到自定义清单 / 自定义此清单的数据源；custom/managed 组为空）。 */
  directoryModels: DiscoveredModel[]
  /** 目录模型读取失败提示（MF-1-18：失败显形——携带恢复动作，区分「目录无模型」与「读取失败」）。 */
  directoryError: string | undefined
  /** 自定义条目原文（models[] 值域——行内编辑/删除/复制的整段替换底稿；仅 custom 组非空）。 */
  customEntries: HostProviderProfile[]
}

/** 行内编辑态（编辑既有条目 = 原位替换；添加 = 追加在位次）。 */
export interface ModelEditState {
  key: string
  index: number
  isNew: boolean
  draft: ModelDraft
}

/** 来源筛选值（目录默认匹配 directory/override 两态）。 */
export type ModelSourceFilter = 'all' | 'custom' | 'directory'

/** 清单视图快照。 */
export interface ModelsListSnapshot {
  /** 三态（对齐 ProvidersListSnapshot 词表，MF-1-5）：unavailable = readLlmPiAi 失败或命名空间未被服务。 */
  status: 'loading' | 'ready' | 'unavailable'
  groups: ModelGroupSnapshot[]
  /** 目录里是否存在任何 provider（空态矩阵的分流依据）。 */
  providersExist: boolean
  filter: string
  sourceFilter: ModelSourceFilter
  editing: ModelEditState | undefined
  notice: string | undefined
  error: string | undefined
}

/** 视图构造依赖（session 缺席时托管行与推理标注缺失——宽松降级，不阻塞目录行）。 */
export interface ModelsListModelDeps {
  remote: ModelServiceHost & { session?: SessionRemoteLike }
  t: Translate
}

/** 来源筛选候选（chip 渲染序）。 */
const SOURCE_FILTERS: ModelSourceFilter[] = ['all', 'custom', 'directory']

  /**
   * 模型清单视图模型：四层拼装的分组操作台会话内权威（纯 TS，可独立单测）。
   */
export class ModelsListModel {
  private readonly deps: ModelsListModelDeps
  private readonly listeners = new Set<() => void>()
  private state: ModelsListSnapshot
  private allGroups: ModelGroupSnapshot[] = []
  /** 构造时启动的首读。 */
  readonly pending: Promise<void>

  constructor(deps: ModelsListModelDeps) {
    this.deps = deps
    this.state = { status: 'loading', groups: [], providersExist: false, filter: '', sourceFilter: 'all', editing: undefined, notice: undefined, error: undefined }
    this.pending = this.load()
  }

  getSnapshot(): ModelsListSnapshot {
    return this.state
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** 设置关键词筛选（内存过滤，不触发重读）。 */
  setFilter(value: string): void {
    this.state = { ...this.state, filter: value }
    this.applyFilter()
    this.notify()
  }

  /** 清除关键词筛选（筛选空态的清除动作）。 */
  clearFilter(): void {
    this.setFilter('')
  }

  /** 设置来源筛选（chip 点选；内存过滤）。 */
  setSourceFilter(value: ModelSourceFilter): void {
    this.state = { ...this.state, sourceFilter: value }
    this.applyFilter()
    this.notify()
  }

  /**
   * 重读四层并按供应商分组（视图激活时可再调——AS10 的拉取式刷新兜底；unavailable 态的
   * 重试按钮也直调本方法，MF-1-5）。快照缺席（readLlmPiAi 传输失败）或命名空间未被服务
   * → 显式 unavailable（对齐 providers 视图三态），不再静默转 undefined 拼装残缺分组
   * （已接入 provider 的分组会整组消失、失败与空同形）；筛选状态经 spread 保留不复位。
   */
  async load(): Promise<void> {
    const t = this.deps.t
    const [directory, snapshot, catalog] = await Promise.all([
      listProviderDirectory(this.deps.remote.llm).catch(() => [] as ConfigurableProviderRow[]),
      readLlmPiAi(this.deps.remote.settings).catch(() => undefined),
      this.deps.remote.session?.modelCatalog().then(unwrapRemote).catch(() => undefined) ?? Promise.resolve(undefined),
    ])
    if (snapshot === undefined || !snapshot.available) {
      this.state = { ...this.state, status: 'unavailable' }
      this.notify()
      return
    }
    const groups: ModelGroupSnapshot[] = []
    const reasoningOf = buildReasoningIndex(catalog)
    // 目录行序 = 目录声明序（宿主 directoryEntries：catalog 在前、declared 在后）。
    for (const entry of directory) {
      const profile = entry.settingsNs === LLM_PI_AI_NS ? recordOf(snapshot?.providers[entry.provider]) : undefined
      if (entry.settingsNs !== LLM_PI_AI_NS) {
        // 托管 provider（deepseek-account / deepseek-official）：只读组，模型与推理来自 catalog。
        groups.push(managedGroup(entry, catalog, t))
        continue
      }
      if (profile === undefined) continue // 未接入的目录 route（清单口径反转）不直出
      const models = Array.isArray(profile.models) ? profile.models.filter(asRecord) : []
      if (models.length > 0) {
        groups.push(customGroup(entry, models, reasoningOf, t))
        continue
      }
      // 目录默认态 / 覆盖态：目录分支读目录模型（provider 命中目录零网络）。失败显形
      // （MF-1-18）：failed outcome 的可行动 recovery 文案进组提示行，不再降级为空清单
      // （组头动作回落「添加模型」的既有行为保留）。
      const outcome = await discoverProviderModels(this.deps.remote.llm, { provider: entry.provider })
      const directoryModels = outcome.kind === 'failed' ? [] : outcome.models
      const directoryError = outcome.kind === 'failed'
        ? `${t('models.directoryLoadFailed')}：${outcome.recovery}（${outcome.message}）`
        : undefined
      groups.push(directoryGroup(entry, directoryModels, reasoningOf, isNonEmptyRecord(profile.modelOverrides), t, directoryError))
    }
    // 快照有而目录未刷新的 route 补组（custom 语义；字段从条目直读）。
    for (const [key, profile] of Object.entries(snapshot?.providers ?? {})) {
      if (directory.some((entry) => entry.provider === key)) continue
      const models = Array.isArray(profile.models) ? profile.models.filter(asRecord) : []
      groups.push(customGroup(
        { provider: key, displayName: key, settingsNs: LLM_PI_AI_NS, settingsPath: ['providers', key] },
        models,
        reasoningOf,
        t,
      ))
    }
    this.allGroups = groups
    this.state = { ...this.state, status: 'ready', providersExist: directory.length > 0 }
    this.applyFilter()
    this.notify()
  }

  // ── 操作台写动作（writeProviderModels 唯一写通道；失败进错误条，成功给 toast）────

  /** 进入既有条目的行内编辑（就地展开编辑卡；草案 = modelToDraft，preserve 语义保真）。 */
  beginEdit(key: string, index: number): void {
    const entry = this.findGroup(key)?.customEntries[index]
    if (entry === undefined) return
    this.state = { ...this.state, editing: { key, index, isNew: false, draft: modelToDraft(entry) } }
    this.notify()
  }

  /** 追加空白条目行（自定义组「+ 添加模型」；目录默认组无目录模型时同入口）。 */
  beginAdd(key: string): void {
    const group = this.findGroup(key)
    if (group === undefined) return
    this.state = {
      ...this.state,
      editing: { key, index: group.customEntries.length, isNew: true, draft: blankModelDraft() },
    }
    this.notify()
  }

  /** 更新行内编辑草案（ModelEdit 受控 onChange）。 */
  setEditDraft(draft: ModelDraft): void {
    if (this.state.editing === undefined) return
    this.state = { ...this.state, editing: { ...this.state.editing, draft } }
    this.notify()
  }

  /** 退出行内编辑（草案丢弃，无写入）。 */
  cancelEdit(): void {
    if (this.state.editing === undefined) return
    this.state = { ...this.state, editing: undefined }
    this.notify()
  }

  /** 保存行内编辑（既有条目原位替换 / 新条目追加；写整段 models[]）。 */
  async saveEdit(): Promise<boolean> {
    const editing = this.state.editing
    if (editing === undefined) return false
    const id = editing.draft.id.trim()
    if (id === '') {
      // 宿主 models[] 条目 id 必填：空白草案在填写前不产生任何写入。
      this.state = { ...this.state, error: this.deps.t('models.editNeedsId') }
      this.notify()
      return false
    }
    const group = this.findGroup(editing.key)
    if (group === undefined) return false
    // 同组 id 查重（MF-1-13）：改 id 撞同组既有条目 / 新增已存在 id 时零写入 + duplicateId
    // 提示（宿主 strict 写入门拒收重复 id——「lists model "x" more than once」整次保存被拒；
    // 对照 copyToCustom 的同款前置）。原位替换排除自身行位。
    if (group.customEntries.some((existing, at) => at !== editing.index && existing.id === id)) {
      this.state = { ...this.state, notice: this.deps.t('models.duplicateId', { id }) }
      this.notify()
      return false
    }
    const entries = [...group.customEntries]
    const entry = modelFromDraft({ ...editing.draft, id })
    if (editing.isNew) entries.push(entry)
    else entries[editing.index] = entry
    // 目录默认组的首笔写入（添加模型）= 整体替换目录默认，toast 注明（C3 显式提示）。
    const notice = group.source === 'directory' ? this.deps.t('models.directoryReplaced') : this.deps.t('save.saved')
    this.state = { ...this.state, editing: undefined }
    return await this.writeModels(editing.key, entries, notice)
  }

  /** 删除自定义条目（整段写回；删空 = 目录默认恢复——unset models）。 */
  async removeModel(key: string, index: number): Promise<boolean> {
    const group = this.findGroup(key)
    if (group === undefined || group.customEntries[index] === undefined) return false
    const entries = group.customEntries.filter((_, at) => at !== index)
    const notice = entries.length === 0 ? this.deps.t('models.directoryMode') : this.deps.t('save.saved')
    this.state = { ...this.state, editing: undefined }
    return await this.writeModels(key, entries, notice)
  }

  /** 目录条目复制到自定义清单（追加进 models[]；同 id 已存在时提示不重复、零写入——
   * 查重在前：目录默认被替换后组已转自定义态，同 id 命中自定义清单即提示，不再要求目录源在场）。 */
  async copyToCustom(key: string, modelId: string): Promise<boolean> {
    const group = this.findGroup(key)
    if (group === undefined) return false
    if (group.customEntries.some((entry) => entry.id === modelId)) {
      this.state = { ...this.state, notice: this.deps.t('models.duplicateId', { id: modelId }) }
      this.notify()
      return false
    }
    const source = group.directoryModels.find((candidate) => candidate.id === modelId)
    if (source === undefined) return false
    const entries = [...group.customEntries, discoveredToEntry(source)]
    this.state = { ...this.state, editing: undefined }
    // 复制动作 = models[] 由空转非空，目录默认被整体替换——toast 注明（C3 显式提示）。
    return await this.writeModels(key, entries, this.deps.t('models.directoryReplaced'))
  }

  /** 自定义此清单（目录默认组：目录模型铺开写入 models[]，成为可编辑起点）。 */
  async customizeFromDirectory(key: string): Promise<boolean> {
    const group = this.findGroup(key)
    if (group === undefined || group.source !== 'directory' || group.directoryModels.length === 0) return false
    const entries = group.directoryModels.map(discoveredToEntry)
    this.state = { ...this.state, editing: undefined }
    return await this.writeModels(key, entries, this.deps.t('models.directoryReplaced'))
  }

  /** 写通道封装：writeProviderModels → 成功重读 + toast，失败错误条（四段式文案自包含）。
   * 写通道 rejection 契约 = 结果值不外抛（settings-client mutateLlmPiAiOps 单点收敛），无 catch。 */
  private async writeModels(key: string, entries: HostProviderProfile[], notice: string): Promise<boolean> {
    const result = await writeProviderModels(this.deps.remote, key, entries)
    if (result.kind !== 'saved') {
      this.state = { ...this.state, error: result.message }
      this.notify()
      return false
    }
    await this.load()
    this.state = { ...this.state, notice, error: undefined }
    this.notify()
    return true
  }

  private findGroup(key: string): ModelGroupSnapshot | undefined {
    return this.allGroups.find((group) => group.providerKey === key)
  }

  private applyFilter(): void {
    const query = this.state.filter.trim().toLowerCase()
    const sourceFilter = this.state.sourceFilter
    let groups = this.allGroups
    if (sourceFilter !== 'all') {
      groups = groups.filter((group) => (sourceFilter === 'custom' ? group.source === 'custom' : group.source === 'directory' || group.source === 'override'))
    }
    if (query !== '') {
      groups = groups
        .map((group) => ({
          ...group,
          rows: group.rows.filter((row) =>
            row.modelId.toLowerCase().includes(query)
            || row.modelName.toLowerCase().includes(query)
            || group.providerName.toLowerCase().includes(query)
            || group.providerKey.toLowerCase().includes(query)),
        }))
        .filter((group) => group.rows.length > 0)
    }
    this.state = { ...this.state, groups }
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener()
  }
}

/** 新增条目的空白草案（产品默认与供应商表单的模型卡一致：上下文 1M / 双模态 / 支持思考全档）。 */
function blankModelDraft(): ModelDraft {
  return {
    id: '',
    name: '',
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: undefined,
    input: ['text', 'image'],
    thinkingEnabled: true,
    levels: [...THINKING_LEVELS],
    preserve: false,
  }
}

/** 目录模型 → models[] 条目（目录分支字段映射；input 缺省按文本模态——宿主单值词表）。 */
function discoveredToEntry(model: DiscoveredModel): HostProviderProfile {
  const entry: HostProviderProfile = { id: model.id, name: model.name ?? model.id }
  if (typeof model.contextWindow === 'number') entry.contextWindow = model.contextWindow
  if (typeof model.maxTokens === 'number') entry.maxTokens = model.maxTokens
  entry.input = (model.inputModalities ?? []).filter((item) => item === 'text' || item === 'image')
  if (entry.input.length === 0) entry.input = ['text']
  return entry
}

/** 模型清单视图组件 props。 */
export interface ModelsViewProps {
  t: Translate
  model: ModelsListModel
  /** 跳转发起（目标 provider + 可选 model id；返回路径由分区组件承载）。 */
  onJump: (provider: string, model?: string) => void
  /** 空态接入引导（V9 步骤 1：清单空态给下一步动作——切回供应商视图）。 */
  onGoToProviders: () => void
}

/** 渲染模型清单操作台（筛选行 + 来源 chip + 分组列表 + 空态矩阵 + 上报面）。 */
export function ModelsView({ t, model, onJump, onGoToProviders }: ModelsViewProps) {
  const state = useSyncExternalStore(
    (listener) => model.subscribe(listener),
    () => model.getSnapshot(),
    () => model.getSnapshot(),
  )
  if (state.status === 'unavailable') {
    // 快照失败/缺席显形（MF-1-5）：与 providers 视图同款降级文案 + 重试按钮（直调
    // model.load()；视图切换时的重建重读保留为兜底通道）。
    return (
      <div className="ms-note ms-note-warn">
        {t('models.snapshotUnavailable')}
        <button type="button" className="ms-button" onClick={() => { void model.load() }}>{t('models.retryLoad')}</button>
      </div>
    )
  }
  if (state.status === 'loading') {
    return <div className="ms-note">{t('providers.loading')}</div>
  }
  const keywordEmpty = state.filter.trim() === ''
  return (
    <div className="ms-models">
      <div className="ms-models-toolbar">
        <input
          className="ms-input ms-models-filter"
          value={state.filter}
          placeholder={t('models.viewFilter')}
          aria-label={t('models.viewFilter')}
          onChange={(event: { target: { value: string } }) => { model.setFilter(event.target.value) }}
        />
        <span className="ms-source-chips" role="group" aria-label={t('models.sourceFilter')}>
          {SOURCE_FILTERS.map((candidate) => (
            <button
              key={candidate}
              type="button"
              className={`ms-source-chip${state.sourceFilter === candidate ? ' ms-source-chip-active' : ''}`}
              aria-pressed={state.sourceFilter === candidate}
              onClick={() => { model.setSourceFilter(candidate) }}
            >
              {t(sourceFilterKey(candidate))}
            </button>
          ))}
        </span>
      </div>
      {state.groups.length === 0 && keywordEmpty && !state.providersExist && (
        <div className="ms-empty">
          <div className="ms-empty-title">{t('models.emptyNoProviders')}</div>
          {/* 空态矩阵的下一步动作（V9 步骤 1「清单空态给接入引导」，与供应商视图空态引导卡同构） */}
          <button type="button" className="ms-button ms-button-primary" onClick={onGoToProviders}>
            {t('models.emptyGoProviders')}
          </button>
        </div>
      )}
      {state.groups.length === 0 && keywordEmpty && state.sourceFilter === 'all' && state.providersExist && (
        <div className="ms-empty">
          <div className="ms-empty-title">{t('models.emptyNoModelsButProviders')}</div>
          <button type="button" className="ms-button ms-button-primary" onClick={onGoToProviders}>
            {t('models.emptyGoProviders')}
          </button>
        </div>
      )}
      {state.groups.length === 0 && !keywordEmpty && (
        <div className="ms-empty">
          <div className="ms-empty-title">{t('models.emptyNoMatch', { q: state.filter.trim() })}</div>
          <button type="button" className="ms-button" onClick={() => { model.clearFilter() }}>{t('models.clearFilter')}</button>
        </div>
      )}
      {state.groups.length === 0 && keywordEmpty && state.sourceFilter !== 'all' && state.providersExist && (
        <div className="ms-empty">
          <div className="ms-empty-title">{t('models.emptySourceFiltered')}</div>
          <button type="button" className="ms-button" onClick={() => { model.setSourceFilter('all') }}>{t('models.sourceFilterAll')}</button>
        </div>
      )}
      {state.groups.map((group) => {
        // 分组渲染内联在视图函数里（load-tsx 夹具单次渲染语义不递归函数组件——组内元素
        // 要在单棵元素树上可断言，与旧清单视图的行内渲染同形态）。
        const editingHere = state.editing !== undefined && state.editing.key === group.providerKey
        return (
          <div key={group.providerKey} className="ms-model-group">
            <div className="ms-model-group-head">
              <span className="ms-row-name">{group.providerName}</span>
              <span className={`ms-badge ms-source-badge-${group.source}`}>{t(sourceKey(group.source))}</span>
              <span className="ms-badge">{countBadgeText(t, group)}</span>
              {group.source === 'managed' && <span className="ms-row-note">{t('providers.managedNote')}</span>}
              {group.source === 'override' && <span className="ms-row-note">{t('models.overrideNote')}</span>}
              <span className="ms-row-actions">
                {group.source !== 'managed' && (
                  <button type="button" className="ms-button" onClick={() => { onJump(group.providerKey) }}>
                    {t('action.locate')}
                  </button>
                )}
                {group.source === 'directory' && group.directoryModels.length > 0 && (
                  <button type="button" className="ms-button" onClick={() => { void model.customizeFromDirectory(group.providerKey) }}>
                    {t('models.customizeFromDirectory')}
                  </button>
                )}
                {(group.source === 'custom' || (group.source === 'directory' && group.directoryModels.length === 0)) && (
                  <button type="button" className="ms-button" onClick={() => { model.beginAdd(group.providerKey) }}>
                    {t('models.addModel')}
                  </button>
                )}
              </span>
            </div>
            {group.directoryError !== undefined && (
              <div className="ms-note ms-note-err">{group.directoryError}</div>
            )}
            <div className="ms-model-list">
              {group.rows.map((row, index) => {
                const rowEditing = editingHere && state.editing !== undefined && !state.editing.isNew && state.editing.index === index
                return (
                  <div key={`${row.modelId}:${index}`} className="ms-model-list-row">
                    <span className="ms-model-list-name">{row.modelName}</span>
                    <span className="ms-model-list-id">{row.modelId}</span>
                    <span className="ms-model-list-field">{row.contextWindow}</span>
                    <span className="ms-model-list-field">{row.maxTokens}</span>
                    <span className="ms-model-list-field">{row.inputModalities}</span>
                    {row.reasoning !== '' && <span className="ms-model-list-field">{row.reasoning}</span>}
                    <span className="ms-row-actions">
                      {group.source === 'custom' && (
                        <>
                          <button type="button" className="ms-button" onClick={() => { model.beginEdit(group.providerKey, index) }}>
                            {t('action.edit')}
                          </button>
                          <button
                            type="button"
                            className="ms-button ms-button-danger"
                            onClick={() => { void model.removeModel(group.providerKey, index) }}
                          >
                            {t('models.removeModel')}
                          </button>
                        </>
                      )}
                      {group.source === 'directory' && (
                        <button type="button" className="ms-button" onClick={() => { void model.copyToCustom(group.providerKey, row.modelId) }}>
                          {t('models.copyToCustom')}
                        </button>
                      )}
                    </span>
                    {rowEditing && state.editing !== undefined && (
                      <div className="ms-model-row-edit">
                        <ModelEdit t={t} draft={state.editing.draft} onChange={(draft) => { model.setEditDraft(draft) }} />
                        <span className="ms-row-actions">
                          <button type="button" className="ms-button ms-button-primary" onClick={() => { void model.saveEdit() }}>
                            {t('models.editSave')}
                          </button>
                          <button type="button" className="ms-button" onClick={() => { model.cancelEdit() }}>
                            {t('action.cancel')}
                          </button>
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
              {editingHere && state.editing !== undefined && state.editing.isNew && (
                <div className="ms-model-row-new">
                  <div className="ms-model-row-edit">
                    <ModelEdit t={t} draft={state.editing.draft} onChange={(draft) => { model.setEditDraft(draft) }} />
                    <span className="ms-row-actions">
                      <button type="button" className="ms-button ms-button-primary" onClick={() => { void model.saveEdit() }}>
                        {t('models.editSave')}
                      </button>
                      <button type="button" className="ms-button" onClick={() => { model.cancelEdit() }}>
                        {t('action.cancel')}
                      </button>
                    </span>
                  </div>
                </div>
              )}
              {group.rows.length === 0 && state.editing === undefined && (
                <div className="ms-row-note">{t('models.emptyNoModelsButProviders')}</div>
              )}
            </div>
          </div>
        )
      })}
      {state.notice !== undefined && <div className="ms-note ms-note-ok" role="status">{state.notice}</div>}
      {state.error !== undefined && <div className="ms-error" role="alert">{state.error}</div>}
    </div>
  )
}

// ── 分组拼装工具 ────────────────────────────────────────────────────────────

/** 推理档位索引：provider/model → 档位名列表（catalog 派生；缺席空列表）。 */
function buildReasoningIndex(catalog: ModelCatalogLike | undefined): Map<string, string[]> {
  const index = new Map<string, string[]>()
  for (const group of catalog?.groups ?? []) {
    for (const model of group.models) {
      const efforts = model.reasoning?.efforts?.map((effort) => effort.name) ?? []
      index.set(`${group.id}:${model.id}`, efforts)
    }
  }
  return index
}

/** 托管 provider 组：模型清单 = catalog 分组（同一注册表派生，与对话流选择器一致）；只读。 */
function managedGroup(entry: ConfigurableProviderRow, catalog: ModelCatalogLike | undefined, t: Translate): ModelGroupSnapshot {
  const group = catalog?.groups.find((candidate) => candidate.id === entry.provider)
  const rows = (group?.models ?? []).map((model) => ({
    modelId: model.id,
    modelName: model.name,
    contextWindow: t('models.fieldMissing'),
    maxTokens: t('models.fieldMissing'),
    inputModalities: t('models.fieldMissing'),
    reasoning: (model.reasoning?.efforts ?? []).map((effort) => effort.name).join(' / '),
  }))
  return { providerKey: entry.provider, providerName: entry.displayName, source: 'managed', rows, directoryModels: [], directoryError: undefined, customEntries: [] }
}

/** 自定义清单组（字段从设置快照条目直读；推理标注从 catalog 补）。 */
function customGroup(
  entry: ConfigurableProviderRow,
  models: Record<string, unknown>[],
  reasoning: Map<string, string[]>,
  t: Translate,
): ModelGroupSnapshot {
  const missing = t('models.fieldMissing')
  const rows = models.map((model) => {
    const modelId = typeof model.id === 'string' ? model.id : ''
    return {
      modelId,
      modelName: typeof model.name === 'string' && model.name !== '' ? model.name : modelId,
      contextWindow: typeof model.contextWindow === 'number' ? String(model.contextWindow) : missing,
      maxTokens: typeof model.maxTokens === 'number' ? String(model.maxTokens) : missing,
      inputModalities: modalitiesLabel(model.input, missing),
      reasoning: (reasoning.get(`${entry.provider}:${modelId}`) ?? []).join(' / '),
    }
  })
  return { providerKey: entry.provider, providerName: entry.displayName, source: 'custom', rows, directoryModels: [], directoryError: undefined, customEntries: [...models] }
}

/** 目录默认态 / 覆盖态组（目录分支字段；缺失标未提供；覆盖态组只读标注；
 * directoryError = 目录读取失败提示行，MF-1-18）。 */
function directoryGroup(
  entry: ConfigurableProviderRow,
  models: DiscoveredModel[],
  reasoning: Map<string, string[]>,
  overrideOnly: boolean,
  t: Translate,
  directoryError: string | undefined,
): ModelGroupSnapshot {
  const missing = t('models.fieldMissing')
  const rows = models.map((model) => ({
    modelId: model.id,
    modelName: model.name ?? model.id,
    contextWindow: typeof model.contextWindow === 'number' ? String(model.contextWindow) : missing,
    maxTokens: typeof model.maxTokens === 'number' ? String(model.maxTokens) : missing,
    inputModalities: modalitiesLabel(model.inputModalities, missing),
    reasoning: (reasoning.get(`${entry.provider}:${model.id}`) ?? []).join(' / '),
  }))
  return {
    providerKey: entry.provider,
    providerName: entry.displayName,
    source: overrideOnly ? 'override' : 'directory',
    rows,
    directoryModels: [...models],
    directoryError,
    customEntries: [],
  }
}

/** 来源态 → locale key。 */
function sourceKey(source: ModelGroupSnapshot['source']): 'models.sourceCustom' | 'models.sourceDirectory' | 'models.sourceOverride' | 'providers.managedBadge' {
  if (source === 'custom') return 'models.sourceCustom'
  if (source === 'override') return 'models.sourceOverride'
  if (source === 'managed') return 'providers.managedBadge'
  return 'models.sourceDirectory'
}

/** 来源筛选值 → locale key。 */
function sourceFilterKey(value: ModelSourceFilter): 'models.sourceFilterAll' | 'models.sourceFilterCustom' | 'models.sourceFilterDirectory' {
  if (value === 'custom') return 'models.sourceFilterCustom'
  if (value === 'directory') return 'models.sourceFilterDirectory'
  return 'models.sourceFilterAll'
}

/** 组头清单态徽章文案（目录默认态注明只读；托管组素计数）。 */
function countBadgeText(t: Translate, group: ModelGroupSnapshot): string {
  if (group.source === 'custom') return t('models.customCountBadge', { n: group.rows.length })
  if (group.source === 'directory' || group.source === 'override') return t('models.directoryCountBadge', { n: group.rows.length })
  return t('models.countBadge', { n: group.rows.length })
}

function modalitiesLabel(modalities: unknown, missing: string): string {
  if (!Array.isArray(modalities) || modalities.length === 0) return missing
  return modalities.map((item) => item === 'image' ? 'image' : 'text').join(' · ')
}

function asRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 取值形态（非守卫）：不是 record 时给 undefined，供条件表达式取值用。 */
function recordOf(value: unknown): Record<string, unknown> | undefined {
  return asRecord(value) ? value : undefined
}

function isNonEmptyRecord(value: unknown): boolean {
  const record = asRecord(value)
  return record !== undefined && Object.keys(record).length > 0
}
