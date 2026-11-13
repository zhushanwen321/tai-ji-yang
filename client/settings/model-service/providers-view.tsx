/**
 * client/settings/model-service/providers-view.tsx —— 供应商视图（dsh-model-service M1/D2/D3/D7；
 * 供应商接入交互重设计后清单口径反转）。
 *
 * 清单口径：llm-pi-ai 命名空间的行源 = readLlmPiAi 快照 providers 里**已存在**的条目（含
 * 宿主侧创建的仅 apiKeyEnv 条目）——未接入的目录 route 不再直出。listProviderDirectory
 * 仍拉取，用于：(a) 每行的 catalogType 判定（declared !== true）与目录显示名回落；
 * (b) 托管只读行（settingsNs 非 llm-pi-ai 的目录行，宿主包注册的 deepseek-account /
 * deepseek-official 等，注明由宿主管理，AX2：插件只读展示、不写）；(c) 添加流程的内置
 * 目录候选。快照有而目录无的 key = 自定义型（保留独立循环）。
 *
 * 添加流程（三步）：「添加供应商」→ choose（两张卡：内置 / 自定义）→ 内置 → pick-builtin
 * （列出目录中 llm-pi-ai 命名空间、未被快照 providers 占用的条目）→ 选定打开窄表单；
 * 自定义 → 现行全表单。步骤可返回上一级；弹层语义与展开体互斥（同一时间只有一个表单挂载）。
 *
 * 凭据徽章（configured / missing）经 credentials.describe 批量读；快照 unavailable（宿主没装
 * dsh-llm-pi-ai）→ 显式降级文案。空态矩阵（V9）：无任何 provider → 「尚未接入任何供应商」+
 * 添加引导卡；只有托管行 → 「暂无可编辑供应商（现有供应商由宿主管理）」。
 *
 * 删除供应商（D3 删除流程 + D7 删除侧）：两段确认；第一击进入确认态时经 routeReferencesOf
 * 从插件 Config 的 routes 快照计算受影响路由，被引用时警告列出路由名（用户确认后继续删除——
 * D3 删除流程原文）；待删 ref 非 TAIJI_ 前缀（宿主侧派生）时确认文案另附跨 profile 确认
 * 提示，确认才 unset（取消 = 条目与 ref 均不动——第二击不发生）。
 *
 * 跳转定位（模型清单 → 本视图）：jumpTarget 到达时展开目标 provider 并聚焦模型行。
 */
import { useEffect, useSyncExternalStore } from 'react'
import { isSelfManagedRef, registerPendingUnset, type PluginConfigFormLike } from '../../model-service/credentials-client'
import { ROUTES_FIELD } from '../../model-service/config-fields'
import { sanitizeRoutes } from '../../model-service/route-evaluate'
import {
  LLM_PI_AI_NS,
  listProviderDirectory,
  readLlmPiAi,
  deleteProvider,
  routeReferencesOf,
  unwrapRemote,
  type ConfigurableProviderRow,
  type HostProviderProfile,
  type ModelServiceHost,
} from '../../model-service/settings-client'
import { ProviderEditBody, ProviderEditModel, type Translate } from './provider-edit-body'
import type { JumpTarget } from './section'

/** 供应商行快照。 */
export interface ProviderRow {
  /** provider route key。 */
  key: string
  /** 展示名（存量 displayName 优先，回落目录行名/route key）。 */
  name: string
  /** llm-pi-ai 行（可编辑）。 */
  editable: boolean
  /** 目录型 provider（pi-ai 安装目录含该 route；模型区可有目录默认态）。 */
  catalogType: boolean
  /** 来源命名空间（托管行展示用）。 */
  sourceNs: string
  /** 存量 profile（无 profile 的目录 route = 从未配置过）。 */
  profile: HostProviderProfile | undefined
  /** apiKeyEnv（存量凭据引用）。 */
  ref: string | undefined
  /** 凭据徽章（describe 批量读的结果；未读到 = missing）。 */
  credentialConfigured: boolean
  /** 自定义清单条数（目录默认态为 0）。 */
  modelCount: number
  /** modelOverrides 第三态（只读展示标注）。 */
  overrideOnly: boolean
}

/** 添加流程 pick-builtin 步骤的候选条目（目录显示名 + route key 注记）。 */
export interface BuiltinCandidate {
  key: string
  /** 目录显示名（listConfigurableProviders 的 displayName）。 */
  name: string
  /** 目录型（declared !== true）——候选行的徽章判定。 */
  catalogType: boolean
}

/**
 * 表单挂载态（单判别字段）：同一时间只有一个表单挂载——互斥由类型构造保证，不再靠
 * 多字段写点纪律与逐字复位清单维持（对齐 models-view 的单判别对象形态）。
 */
export type ProvidersFormState =
  | { kind: 'none' }
  | { kind: 'addflow'; step: 'choose' | 'pick-builtin'; candidates: BuiltinCandidate[] }
  | { kind: 'edit'; model: ProviderEditModel; mount: 'inline' | 'standalone' }

/** 供应商视图快照（引用稳定）。 */
export interface ProvidersListSnapshot {
  status: 'loading' | 'ready' | 'unavailable'
  rows: ProviderRow[]
  /**
   * 表单挂载态：none = 纯列表；addflow = 添加流（choose = 选接入方式两卡；
   * pick-builtin = 内置目录候选列表，candidates 进入该步骤时计算）；edit = 展开体
   * （mount: inline = 行内展开编辑，standalone = 添加流落表单后的独立新建挂载点）。
   */
  form: ProvidersFormState
  /**
   * 删除确认态（两段确认第一击后；routes = 受影响路由名——D3 删除流程的警告数据源）。
   * 与表单挂载真交可并存：武装不清 form（两段确认第一击不拆表单），挂载翻转清武装。
   */
  deleteArmed: { key: string; crossProfile: boolean; ref: string | undefined; name: string; routes: string[] } | undefined
  notice: string | undefined
  error: string | undefined
}

/** 视图构造依赖。 */
export interface ProvidersListModelDeps {
  remote: ModelServiceHost
  t: Translate
  configForm: PluginConfigFormLike
  /** 保存成功后的列表刷新回调（无外部依赖时的缺省 = 自身重读）。 */
  onSaved?: () => void
}

/**
 * 供应商视图模型：目录行、凭据徽章、展开/删除交互的会话内权威（纯 TS，可独立单测）。
 */
export class ProvidersListModel {
  private readonly deps: ProvidersListModelDeps
  private readonly listeners = new Set<() => void>()
  private state: ProvidersListSnapshot
  /** 打开时的 llm-pi-ai 快照（展开体构造的输入；刷新后更新）。 */
  private snapshot: Awaited<ReturnType<typeof readLlmPiAi>> | undefined
  /** 最近一次目录读结果（添加流程候选与 expand 的目录名回落源；刷新后更新）。 */
  private directory: ConfigurableProviderRow[] = []
  /** 构造时启动的首读（测试用 await model.pending 等待就绪）。 */
  readonly pending: Promise<void>
  /** 跳转聚焦的模型 id（展开体渲染高亮用）。 */
  focusModelId: string | undefined = undefined

  constructor(deps: ProvidersListModelDeps) {
    this.deps = deps
    this.state = {
      status: 'loading',
      rows: [],
      form: { kind: 'none' },
      deleteArmed: undefined,
      notice: undefined,
      error: undefined,
    }
    this.pending = this.load()
  }

  getSnapshot(): ProvidersListSnapshot {
    return this.state
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** 重读目录与快照（保留展开态；行数据与徽章更新）。 */
  async load(): Promise<void> {
    const [directory, snapshot] = await Promise.all([
      listProviderDirectory(this.deps.remote.llm).catch(() => [] as ConfigurableProviderRow[]),
      readLlmPiAi(this.deps.remote.settings).catch(() => undefined),
    ])
    if (snapshot === undefined || !snapshot.available) {
      this.state = { ...this.state, status: 'unavailable' }
      this.notify()
      return
    }
    this.snapshot = snapshot
    this.directory = directory
    const rows = this.buildRows(directory, snapshot.providers)
    // 凭据徽章：批量 describe（refs ≤ 64 上限内；本视图行数远小于该界）。Result 解包失败转
    // rejection，由 .catch 降级为空表（徽章全 missing）。
    const refs = rows.flatMap((row) => row.ref !== undefined ? [row.ref] : [])
    const described = refs.length > 0
      ? await this.deps.remote.credentials.describe(refs).then(unwrapRemote).catch(() => ({}))
      : {}
    const withBadges = rows.map((row) => ({
      ...row,
      credentialConfigured: row.ref !== undefined && described[row.ref]?.configured === true,
    }))
    this.state = { ...this.state, status: 'ready', rows: withBadges }
    this.notify()
  }

  /** 展开既有 provider 的编辑体（跳转定位与列表「编辑」共用；目录型走窄表单）。 */
  expand(key: string, focusModel?: string): void {
    const row = this.state.rows.find((candidate) => candidate.key === key)
    if (row === undefined || !row.editable || this.snapshot === undefined) return
    // 目录显示名（窄表单身份行的回落源；快照 displayName 缺失时内置目录条目只有目录名可显）。
    const directoryEntry = this.directory.find((candidate) => candidate.provider === key && candidate.settingsNs === LLM_PI_AI_NS)
    const editing = new ProviderEditModel({
      remote: this.deps.remote,
      t: this.deps.t,
      target: {
        key,
        isNew: false,
        customOnly: !row.catalogType,
        narrow: row.catalogType,
        ...(directoryEntry !== undefined ? { catalogName: directoryEntry.displayName } : {}),
      },
      revision: this.snapshot.revision,
      existing: row.profile,
      providers: this.snapshot.providers,
      // 目录型 key 集合（declared=false）：探测请求归一判据（目录型宿主短路不看 baseURL，
      // 见 discovery.discoverProviderModels 第三参说明）。
      catalogProviderKeys: new Set(this.state.rows.filter((candidate) => candidate.catalogType).map((candidate) => candidate.key)),
      onSaved: () => { void this.reloadAfterSave() },
    })
    this.focusModelId = focusModel
    this.state = { ...this.state, form: { kind: 'edit', model: editing, mount: 'inline' }, deleteArmed: undefined }
    this.notify()
  }

  /** 添加流程第一步（选接入方式）：内置卡 → pick-builtin；自定义卡 → 全表单新建。 */
  startAddFlow(): void {
    if (this.snapshot === undefined) return
    this.focusModelId = undefined
    this.state = { ...this.state, form: { kind: 'addflow', step: 'choose', candidates: [] }, deleteArmed: undefined }
    this.notify()
  }

  /** 添加流程第二步（内置目录候选）：列出目录中 llm-pi-ai 命名空间、未被快照 providers 占用的条目。 */
  pickBuiltin(): void {
    if (this.snapshot === undefined) return
    const occupied = new Set(Object.keys(this.snapshot.providers))
    const candidates: BuiltinCandidate[] = this.directory
      .filter((entry) => entry.settingsNs === LLM_PI_AI_NS && !occupied.has(entry.provider))
      .map((entry) => ({ key: entry.provider, name: entry.displayName, catalogType: entry.declared !== true }))
    this.focusModelId = undefined
    this.state = { ...this.state, form: { kind: 'addflow', step: 'pick-builtin', candidates }, deleteArmed: undefined }
    this.notify()
  }

  /** 添加流程返回第一步（候选清单丢弃）。 */
  backToChoose(): void {
    if (this.state.form.kind !== 'addflow') return
    this.state = { ...this.state, form: { kind: 'addflow', step: 'choose', candidates: [] } }
    this.notify()
  }

  /** 退出添加流程（不落任何草稿）。 */
  cancelAddFlow(): void {
    this.state = { ...this.state, form: { kind: 'none' } }
    this.notify()
  }

  /** 选定内置条目：窄表单新建（key = 目录 route；端点/协议/显示名由目录解析，只填密钥）。 */
  startNarrowAdd(key: string, name: string): void {
    if (this.snapshot === undefined) return
    const editing = new ProviderEditModel({
      remote: this.deps.remote,
      t: this.deps.t,
      target: { key, isNew: true, customOnly: false, narrow: true, catalogName: name },
      revision: this.snapshot.revision,
      existing: undefined,
      providers: this.snapshot.providers,
      // 与编辑流同形：保存成功保持展开——回执（已保存/凭据警告）可见可读，用户经「取消」
      // 返回列表（立即收起会让成功回执在渲染后几十毫秒内随卸载消失，任何人都看不到）。
      onSaved: () => { void this.reloadAfterSave() },
    })
    this.focusModelId = undefined
    this.state = { ...this.state, form: { kind: 'edit', model: editing, mount: 'standalone' }, deleteArmed: undefined }
    this.notify()
  }

  /** 新建自定义供应商（添加流程「自定义」卡；全表单，展开体 key 随显示名派生）。 */
  startAdd(): void {
    if (this.snapshot === undefined) return
    const editing = new ProviderEditModel({
      remote: this.deps.remote,
      t: this.deps.t,
      target: { key: '', isNew: true, customOnly: true, narrow: false },
      revision: this.snapshot.revision,
      existing: undefined,
      providers: this.snapshot.providers,
      // 与编辑流同形：保存成功保持展开——回执（已保存/凭据警告）可见可读，用户经「取消」
      // 返回列表（立即收起会让成功回执在渲染后几十毫秒内随卸载消失，任何人都看不到）。
      onSaved: () => { void this.reloadAfterSave() },
    })
    this.focusModelId = undefined
    this.state = { ...this.state, form: { kind: 'edit', model: editing, mount: 'standalone' }, deleteArmed: undefined }
    this.notify()
  }

  /** 收起编辑体（不落任何草稿）。 */
  collapse(): void {
    this.state = { ...this.state, form: { kind: 'none' } }
    this.notify()
  }

  /**
   * 删除两段确认：第一击进入确认态（跨 profile 提示按 ref 前缀形态分派；路由成员引用警告按
   * D3 删除流程从插件 Config routes 快照计算，被引用时列出受影响路由），第二击执行。
   */
  requestDelete(key: string): void {
    const row = this.state.rows.find((candidate) => candidate.key === key)
    if (row === undefined || !row.editable) return
    const ref = row.ref
    const crossProfile = ref !== undefined && !isSelfManagedRef(ref)
    const routes = this.readConfigRoutes()
    const references = routeReferencesOf(key, routes)
    this.state = { ...this.state, deleteArmed: { key, crossProfile, ref, name: row.name, routes: references } }
    this.notify()
  }

  /** 插件 Config routes 字段的读取（快照不可用/未就绪 → 空数组：警告降级，删除动作不拦）。 */
  private readConfigRoutes() {
    const snapshot = this.deps.configForm.getSnapshot()
    if (snapshot.status !== 'ready') return []
    const section = typeof snapshot.value === 'object' && snapshot.value !== null
      ? snapshot.value as Record<string, unknown>
      : {}
    return sanitizeRoutes(section[ROUTES_FIELD])
  }

  /** 第二击：真正删除（跨 profile 确认语义 = 用户点了第二击即确认）。写通道 rejection
   * 契约 = 结果值不外抛（settings-client mutateLlmPiAiOps 单点收敛；待清理登记的 Config
   * 写通道同为结果值，config-form-rmw attemptRMW），无 catch。 */
  async confirmDelete(): Promise<void> {
    const armed = this.state.deleteArmed
    if (armed === undefined || this.snapshot === undefined) return
    this.state = { ...this.state, deleteArmed: undefined, notice: undefined, error: undefined }
    const result = await deleteProvider(this.deps.remote, {
      key: armed.key,
      existing: this.snapshot.providers[armed.key],
      crossProfileConfirmed: true,
      registerPendingUnset: (ref) => registerPendingUnset(this.deps.configForm, ref),
    })
    if (result.kind === 'rejected') {
      this.state = { ...this.state, error: result.message }
      this.notify()
      return
    }
    await this.load()
    if (result.pendingUnset !== undefined) {
      this.state = { ...this.state, notice: result.unsetMessage }
      this.notify()
    }
  }

  /** 取消删除武装（条目与 ref 均不动）。 */
  cancelDelete(): void {
    this.state = { ...this.state, deleteArmed: undefined }
    this.notify()
  }

  dismissNotice(): void {
    this.state = { ...this.state, notice: undefined, error: undefined }
    this.notify()
  }

  private async reloadAfterSave(): Promise<void> {
    // 保存成功：刷新行数据与徽章（编辑模型的 diff 基线与 revision 已随回执自更新），保持展开。
    await this.load()
    this.deps.onSaved?.()
  }

  /**
   * 视图行（清单口径反转）：llm-pi-ai 命名空间的行源 = 快照 providers 里已存在的条目
   * （含宿主侧创建的仅 apiKeyEnv 条目）——未接入的目录 route 不直出。目录数据只用于
   * 托管只读行、catalogType 判定与显示名回落；快照有而目录无的 key = 自定义型。
   */
  private buildRows(directory: ConfigurableProviderRow[], providers: Record<string, HostProviderProfile>): ProviderRow[] {
    const rows = new Map<string, ProviderRow>()
    // 托管只读行：目录中 settingsNs 非 llm-pi-ai 的条目（宿主包注册的托管 provider），现行只读形态直出。
    for (const entry of directory) {
      if (entry.settingsNs === LLM_PI_AI_NS) continue
      rows.set(entry.provider, {
        key: entry.provider,
        name: entry.displayName,
        editable: false,
        catalogType: entry.declared !== true,
        sourceNs: entry.settingsNs,
        profile: undefined,
        ref: undefined,
        credentialConfigured: false,
        modelCount: 0,
        overrideOnly: false,
      })
    }
    // 已接入行：快照 providers（权威 = 宿主设置文档的 llm-pi-ai 命名空间）。
    for (const [key, profile] of Object.entries(providers)) {
      const entry = directory.find((candidate) => candidate.provider === key && candidate.settingsNs === LLM_PI_AI_NS)
      rows.set(key, {
        key,
        name: typeof profile.displayName === 'string' && profile.displayName !== '' ? profile.displayName : entry?.displayName ?? key,
        editable: true,
        catalogType: entry !== undefined && entry.declared !== true,
        sourceNs: LLM_PI_AI_NS,
        profile,
        ref: typeof profile.apiKeyEnv === 'string' ? profile.apiKeyEnv : undefined,
        credentialConfigured: false,
        modelCount: Array.isArray(profile.models) ? profile.models.length : 0,
        overrideOnly: !(Array.isArray(profile.models) && profile.models.length > 0) && isNonEmptyRecord(profile.modelOverrides),
      })
    }
    return [...rows.values()]
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener()
  }
}

/** 供应商视图组件 props。 */
export interface ProvidersViewProps {
  t: Translate
  model: ProvidersListModel
  /** 模型清单跳转目标（到达即展开；消费后回调清空）。 */
  jumpTarget: JumpTarget | undefined
  onJumpConsumed: () => void
}

/** 渲染供应商视图（列表 + 空态矩阵 + 展开体挂载）。 */
export function ProvidersView({ t, model, jumpTarget, onJumpConsumed }: ProvidersViewProps) {
  const state = useSyncExternalStore(
    (listener) => model.subscribe(listener),
    () => model.getSnapshot(),
    () => model.getSnapshot(),
  )
  useEffect(() => {
    if (jumpTarget === undefined) return
    model.expand(jumpTarget.provider, jumpTarget.model)
    onJumpConsumed()
  }, [])

  if (state.status === 'unavailable') {
    return <div className="ms-note ms-note-warn">{t('providers.snapshotUnavailable')}</div>
  }
  if (state.status === 'loading') {
    return <div className="ms-note">{t('providers.loading')}</div>
  }

  const editableRows = state.rows.filter((row) => row.editable)
  const managedRows = state.rows.filter((row) => !row.editable)
  return (
    <div className="ms-providers">
      {state.rows.length === 0 && (
        <div className="ms-empty">
          <div className="ms-empty-title">{t('providers.empty')}</div>
          <button type="button" className="ms-button ms-button-primary" onClick={() => { model.startAddFlow() }}>
            {t('providers.emptyAddGuide')}
          </button>
        </div>
      )}
      {state.rows.length > 0 && editableRows.length === 0 && (
        <div className="ms-empty">
          <div className="ms-empty-title">{t('providers.emptyManagedOnly')}</div>
          <button type="button" className="ms-button ms-button-primary" onClick={() => { model.startAddFlow() }}>
            {t('providers.emptyAddGuide')}
          </button>
        </div>
      )}
      {editableRows.length > 0 && (
        <div className="ms-providers-actions">
          <button type="button" className="ms-button ms-button-primary" onClick={() => { model.startAddFlow() }}>
            {t('action.addProvider')}
          </button>
        </div>
      )}
      {/* 添加流程（choose / pick-builtin）：与编辑体互斥挂载——form 单判别字段，同一时间只有一个表单在树上。 */}
      {state.form.kind === 'addflow' && state.form.step === 'choose' && (
        <div className="ms-addflow">
          <div className="ms-addflow-cards">
            <button type="button" className="ms-addflow-card" onClick={() => { model.pickBuiltin() }}>
              <span className="ms-addflow-card-title">{t('addflow.builtinTitle')}</span>
              <span className="ms-addflow-card-note">{t('addflow.builtinNote')}</span>
            </button>
            <button type="button" className="ms-addflow-card" onClick={() => { model.startAdd() }}>
              <span className="ms-addflow-card-title">{t('addflow.customTitle')}</span>
              <span className="ms-addflow-card-note">{t('addflow.customNote')}</span>
            </button>
          </div>
          <div className="ms-addflow-actions">
            <button type="button" className="ms-button" onClick={() => { model.cancelAddFlow() }}>{t('action.cancel')}</button>
          </div>
        </div>
      )}
      {state.form.kind === 'addflow' && state.form.step === 'pick-builtin' && (
        <div className="ms-addflow">
          <div className="ms-compat-head">{t('addflow.pickTitle')}</div>
          <div className="ms-note">{t('addflow.pickNote')}</div>
          {state.form.candidates.length === 0 && <div className="ms-note">{t('addflow.pickEmpty')}</div>}
          <div className="ms-addflow-list">
            {state.form.candidates.map((candidate) => (
              <div key={candidate.key} className="ms-addflow-item">
                <span className="ms-addflow-item-name">{candidate.name}</span>
                <span className="ms-addflow-item-note">{candidate.key}</span>
                <span className="ms-row-actions">
                  <button
                    type="button"
                    className="ms-button ms-button-primary"
                    onClick={() => { model.startNarrowAdd(candidate.key, candidate.name) }}
                  >
                    {t('addflow.connect')}
                  </button>
                </span>
              </div>
            ))}
          </div>
          <div className="ms-addflow-actions">
            <button type="button" className="ms-button" onClick={() => { model.backToChoose() }}>{t('addflow.back')}</button>
            <button type="button" className="ms-button" onClick={() => { model.cancelAddFlow() }}>{t('action.cancel')}</button>
          </div>
        </div>
      )}
      {/* 新建供应商（standalone 挂载）：编辑体独立挂载点。行循环内 expanded 条件限定
          mount: inline 对新建恒 false，且目录为空时循环体不存在——不加该分支新建体永远不渲染。 */}
      {state.form.kind === 'edit' && state.form.mount === 'standalone' && (
        <ProviderEditBody
          t={t}
          model={state.form.model}
          focusModel={model.focusModelId}
          onCancel={() => { model.collapse() }}
        />
      )}
      <div className="ms-rows">
        {managedRows.map((row) => (
          <div key={row.key} className="ms-row ms-row-managed">
            <span className="ms-row-name">{row.name}</span>
            <span className="ms-badge ms-badge-managed">{t('providers.managedBadge')}</span>
            <span className="ms-row-note">{t('providers.managedNote')}</span>
          </div>
        ))}
        {editableRows.map((row) => {
          const inlineEdit = state.form.kind === 'edit' && state.form.mount === 'inline' ? state.form : undefined
          const expanded = inlineEdit !== undefined && inlineEdit.model.key === row.key
          // armed = 行是否处于删除确认态（布尔）；armedInfo = 确认态数据本体（警示文案的数据源）。
          const armedInfo = state.deleteArmed?.key === row.key ? state.deleteArmed : undefined
          const armed = armedInfo !== undefined
          return (
            <div key={row.key} className="ms-provider-item">
              <div className="ms-row">
                <span className="ms-row-name">{row.name}</span>
                <span className={`ms-badge ${row.catalogType ? 'ms-badge-catalog' : 'ms-badge-custom'}`}>
                  {t(row.catalogType ? 'providers.catalogBadge' : 'providers.customBadge')}
                </span>
                <span className={`ms-badge ${row.credentialConfigured ? 'ms-badge-ok' : 'ms-badge-missing'}`}>
                  {t(row.credentialConfigured ? 'credential.configured' : 'credential.missing')}
                </span>
                <span className="ms-row-note">{t('provider.modelCount', { n: row.modelCount })}</span>
                <span className="ms-row-actions">
                  <button type="button" className="ms-button" onClick={() => { expanded ? model.collapse() : model.expand(row.key) }}>
                    {t(expanded ? 'action.cancel' : 'action.edit')}
                  </button>
                  <button
                    type="button"
                    className={`ms-button ${armed ? 'ms-button-danger' : ''}`}
                    onClick={() => { armed ? void model.confirmDelete() : model.requestDelete(row.key) }}
                  >
                    {armed ? t('action.confirmDelete') : t('action.deleteProvider')}
                  </button>
                </span>
              </div>
              {armedInfo && (
                <div className={`ms-note ${armedInfo.crossProfile || armedInfo.routes.length > 0 ? 'ms-note-warn' : 'ms-note-err'}`}>
                  {armedInfo.routes.length > 0 && (
                    <span>{t('delete.routeReferences', { routes: armedInfo.routes.join('、') })}</span>
                  )}
                  <span>
                    {armedInfo.crossProfile
                      ? t('delete.crossProfileConfirm', { ref: armedInfo.ref ?? '' })
                      : t('delete.confirmDraft', { name: armedInfo.name })}
                  </span>
                  <button type="button" className="ms-button" onClick={() => { model.cancelDelete() }}>{t('action.cancel')}</button>
                </div>
              )}
              {expanded && inlineEdit !== undefined && (
                <ProviderEditBody
                  t={t}
                  model={inlineEdit.model}
                  focusModel={model.focusModelId}
                  onCancel={() => { model.collapse() }}
                />
              )}
            </div>
          )
        })}
      </div>
      {state.notice !== undefined && <div className="ms-note ms-note-warn" role="status">{state.notice}</div>}
      {state.error !== undefined && <div className="ms-error" role="alert">{state.error}</div>}
    </div>
  )
}

function isNonEmptyRecord(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length > 0
}
