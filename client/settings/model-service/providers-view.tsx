/**
 * client/settings/model-service/providers-view.tsx —— 供应商视图（dsh-model-service M1/D2/D3/D7）。
 *
 * 列表读 listConfigurableProviders 全量目录（AS 已核实：目录 = pi-ai 安装目录全部 route +
 * 当前 profiles 声明的 route，declared=false = 目录型）：
 *   · llm-pi-ai 行可编辑（展开体 = provider-edit-body）；
 *   · 其余行（deepseek-account / deepseek-official 等宿主包注册的托管 provider）只读，注明
 *     由宿主管理、凭据编辑指向宿主「模型」分区（AX2：插件只读展示、不写）。
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
import { sanitizeRoutes } from '../../model-service/route-evaluate'
import { ROUTES_FIELD } from '../../model-service/route-store'
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

/** 供应商视图快照（引用稳定）。 */
export interface ProvidersListSnapshot {
  status: 'loading' | 'ready' | 'unavailable'
  rows: ProviderRow[]
  /** 展开中的编辑模型（新建与编辑共用）。 */
  editing: ProviderEditModel | undefined
  /** 当前编辑是否新建。 */
  addingNew: boolean
  /** 删除确认态（两段确认第一击后；routes = 受影响路由名——D3 删除流程的警告数据源）。 */
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
  /** 构造时启动的首读（测试用 await model.pending 等待就绪）。 */
  readonly pending: Promise<void>
  /** 跳转聚焦的模型 id（展开体渲染高亮用）。 */
  focusModelId: string | undefined = undefined

  constructor(deps: ProvidersListModelDeps) {
    this.deps = deps
    this.state = { status: 'loading', rows: [], editing: undefined, addingNew: false, deleteArmed: undefined, notice: undefined, error: undefined }
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

  /** 展开既有 provider 的编辑体（跳转定位与列表「编辑」共用）。 */
  expand(key: string, focusModel?: string): void {
    const row = this.state.rows.find((candidate) => candidate.key === key)
    if (row === undefined || !row.editable || this.snapshot === undefined) return
    const editing = new ProviderEditModel({
      remote: this.deps.remote,
      t: this.deps.t,
      target: { key, isNew: false, customOnly: !row.catalogType },
      revision: this.snapshot.revision,
      existing: row.profile,
      providers: this.snapshot.providers,
      onSaved: () => { void this.reloadKeepingEditing(editing) },
    })
    this.focusModelId = focusModel
    this.state = { ...this.state, editing, addingNew: false, deleteArmed: undefined }
    this.notify()
  }

  /** 新建供应商（展开体 key 随显示名派生；保存前置 = 至少一条模型）。 */
  startAdd(): void {
    if (this.snapshot === undefined) return
    const editing = new ProviderEditModel({
      remote: this.deps.remote,
      t: this.deps.t,
      target: { key: '', isNew: true, customOnly: true },
      revision: this.snapshot.revision,
      existing: undefined,
      providers: this.snapshot.providers,
      onSaved: () => { void this.reloadAndCollapse() },
    })
    this.focusModelId = undefined
    this.state = { ...this.state, editing, addingNew: true, deleteArmed: undefined }
    this.notify()
  }

  /** 收起编辑体（不落任何草稿）。 */
  collapse(): void {
    this.state = { ...this.state, editing: undefined, addingNew: false }
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

  /** 第二击：真正删除（跨 profile 确认语义 = 用户点了第二击即确认）。 */
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

  private async reloadKeepingEditing(_editing: ProviderEditModel): Promise<void> {
    // 保存成功：刷新行数据与徽章（编辑模型的 diff 基线与 revision 已随回执自更新），保持展开。
    await this.load()
    this.deps.onSaved?.()
  }

  private async reloadAndCollapse(): Promise<void> {
    await this.load()
    this.collapse()
  }

  /** 目录行 + 快照 providers → 视图行（union：快照有而目录未刷新的 route 也列出）。 */
  private buildRows(directory: ConfigurableProviderRow[], providers: Record<string, HostProviderProfile>): ProviderRow[] {
    const rows = new Map<string, ProviderRow>()
    for (const entry of directory) {
      const editable = entry.settingsNs === LLM_PI_AI_NS
      const profile = editable ? asRecord(providers[entry.provider]) : undefined
      rows.set(entry.provider, {
        key: entry.provider,
        name: typeof profile?.displayName === 'string' && profile.displayName !== '' ? profile.displayName : entry.displayName,
        editable,
        catalogType: entry.declared !== true,
        sourceNs: entry.settingsNs,
        profile,
        ref: typeof profile?.apiKeyEnv === 'string' ? profile.apiKeyEnv : undefined,
        credentialConfigured: false,
        modelCount: Array.isArray(profile?.models) ? profile.models.length : 0,
        overrideOnly: profile !== undefined
          && !(Array.isArray(profile.models) && profile.models.length > 0)
          && isNonEmptyRecord(profile.modelOverrides),
      })
    }
    for (const [key, profile] of Object.entries(providers)) {
      if (rows.has(key)) continue
      rows.set(key, {
        key,
        name: typeof profile.displayName === 'string' && profile.displayName !== '' ? profile.displayName : key,
        editable: true,
        catalogType: false,
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
          <button type="button" className="ms-button ms-button-primary" onClick={() => { model.startAdd() }}>
            {t('providers.emptyAddGuide')}
          </button>
        </div>
      )}
      {state.rows.length > 0 && editableRows.length === 0 && (
        <div className="ms-empty">
          <div className="ms-empty-title">{t('providers.emptyManagedOnly')}</div>
          <button type="button" className="ms-button ms-button-primary" onClick={() => { model.startAdd() }}>
            {t('providers.emptyAddGuide')}
          </button>
        </div>
      )}
      {editableRows.length > 0 && (
        <div className="ms-providers-actions">
          <button type="button" className="ms-button ms-button-primary" onClick={() => { model.startAdd() }}>
            {t('action.addProvider')}
          </button>
        </div>
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
          const expanded = state.editing !== undefined && !state.addingNew && state.editing.key === row.key
          const armed = state.deleteArmed?.key === row.key
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
              {armed && (
                <div className={`ms-note ${armed.crossProfile || armed.routes.length > 0 ? 'ms-note-warn' : 'ms-note-err'}`}>
                  {armed.routes.length > 0 && (
                    <span>{t('delete.routeReferences', { routes: armed.routes.join('、') })}</span>
                  )}
                  <span>
                    {armed.crossProfile
                      ? t('delete.crossProfileConfirm', { ref: armed.ref ?? '' })
                      : t('delete.confirmDraft', { name: armed.name })}
                  </span>
                  <button type="button" className="ms-button" onClick={() => { model.cancelDelete() }}>{t('action.cancel')}</button>
                </div>
              )}
              {expanded && state.editing !== undefined && (
                <ProviderEditBody
                  t={t}
                  model={state.editing}
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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined
}

function isNonEmptyRecord(value: unknown): boolean {
  const record = asRecord(value)
  return record !== undefined && Object.keys(record).length > 0
}
