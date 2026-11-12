/**
 * client/settings/model-service/models-view.tsx —— 模型清单视图（dsh-model-service G16，M1）。
 *
 * 四层数据源（SC3）：session.modelCatalog（注册表派生：id/name/推理档位——托管 provider 行与
 * 推理标注的来源）+ 设置快照（可编辑态判定与自定义条目字段）+ discoverModels 目录分支
 * （目录默认态与覆盖态的 contextWindow/maxTokens/inputModalities，provider 命中目录零网络，
 * AS7）+ 目录清单（托管 provider 只读行）。缺失字段标注「未提供」（宿主 catalog 只含
 * id/name/reasoning，其余字段只有目录分支才有）。
 *
 * 来源态标注（D11）：自定义（custom，可编辑 → 跳转定位）/ 目录默认（directory，定位动作）/
 * 目录默认+覆盖（override，M1 只读）/ 宿主托管（managed，只读行）。跳转态（目标
 * provider/model + 返回路径）由分区组件承载（section.tsx），本视图只发起 onJump。
 *
 * 空态矩阵（V9 步骤 1/5）：目录无任何 provider → 「尚未接入供应商」+ 接入引导（跳供应商
 * 视图）；有 provider 无模型 → 「供应商已接入，但还没有模型」+ 同款接入引导；筛选无结果 →
 * 「没有匹配「{q}」的模型」+ 清除动作。
 */
import { useSyncExternalStore } from 'react'
import {
  LLM_PI_AI_NS,
  listProviderDirectory,
  readLlmPiAi,
  unwrapRemote,
  type ConfigurableProviderRow,
} from '../../model-service/settings-client'
import { discoverProviderModels, type DiscoveredModel } from '../../model-service/discovery'
import type { Translate } from './model-edit'
import type { ModelCatalogLike, SessionRemoteLike } from './section'
import type { ModelServiceHost } from '../../model-service/settings-client'

/** 清单行快照。 */
export interface ModelListRow {
  providerKey: string
  providerName: string
  modelId: string
  modelName: string
  /** 来源态（D11 四态标注）。 */
  source: 'custom' | 'directory' | 'override' | 'managed'
  /** 行内动作：custom/directory 可跳转定位，managed/override 只读。 */
  jumpable: boolean
  contextWindow: string
  maxTokens: string
  inputModalities: string
  /** 推理档位（modelCatalog 的 efforts 名拼接；空串 = 不渲染该列）。 */
  reasoning: string
}

/** 清单视图快照。 */
export interface ModelsListSnapshot {
  status: 'loading' | 'ready'
  rows: ModelListRow[]
  /** 目录里是否存在任何 provider（空态矩阵的分流依据）。 */
  providersExist: boolean
  filter: string
}

/** 视图构造依赖（session 缺席时托管行与推理标注缺失——宽松降级，不阻塞目录行）。 */
export interface ModelsListModelDeps {
  remote: ModelServiceHost & { session?: SessionRemoteLike }
  t: Translate
}

/**
 * 模型清单视图模型：四层拼装的会话内权威（纯 TS，可独立单测）。
 */
export class ModelsListModel {
  private readonly deps: ModelsListModelDeps
  private readonly listeners = new Set<() => void>()
  private state: ModelsListSnapshot
  private allRows: ModelListRow[] = []
  /** 构造时启动的首读。 */
  readonly pending: Promise<void>

  constructor(deps: ModelsListModelDeps) {
    this.deps = deps
    this.state = { status: 'loading', rows: [], providersExist: false, filter: '' }
    this.pending = this.load()
  }

  getSnapshot(): ModelsListSnapshot {
    return this.state
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** 设置筛选词（内存过滤，不触发重读）。 */
  setFilter(value: string): void {
    this.state = { ...this.state, filter: value }
    this.applyFilter()
    this.notify()
  }

  /** 清除筛选（筛选空态的清除动作）。 */
  clearFilter(): void {
    this.setFilter('')
  }

  /** 重读四层并拼装（视图激活时可再调——AS10 的拉取式刷新兜底）。 */
  async load(): Promise<void> {
    const t = this.deps.t
    const [directory, snapshot, catalog] = await Promise.all([
      listProviderDirectory(this.deps.remote.llm).catch(() => [] as ConfigurableProviderRow[]),
      readLlmPiAi(this.deps.remote.settings).catch(() => undefined),
      this.deps.remote.session?.modelCatalog().then(unwrapRemote).catch(() => undefined) ?? Promise.resolve(undefined),
    ])
    const rows: ModelListRow[] = []
    const reasoningOf = buildReasoningIndex(catalog)
    // 目录行序 = 目录声明序（宿主 directoryEntries：catalog 在前、declared 在后）。
    for (const entry of directory) {
      const profile = entry.settingsNs === LLM_PI_AI_NS ? recordOf(snapshot?.providers[entry.provider]) : undefined
      if (profile === undefined) {
        // 托管 provider（deepseek-account / deepseek-official）：只读行，模型与推理来自 catalog。
        rows.push(...managedRows(entry, catalog, t))
        continue
      }
      const models = Array.isArray(profile.models) ? profile.models.filter(asRecord) : []
      if (models.length > 0) {
        rows.push(...customRows(entry, models, reasoningOf, t))
        continue
      }
      // 目录默认态 / 覆盖态：目录分支读目录模型（provider 命中目录零网络；未命中且无
      // baseURL 探测失败 → 该 provider 无行，落「供应商已接入但无模型」空态语义）。
      const outcome = await discoverProviderModels(this.deps.remote.llm, { provider: entry.provider })
      if (outcome.kind === 'failed') continue
      rows.push(...directoryRows(entry, outcome.models, reasoningOf, profile, t))
    }
    // 快照有而目录未刷新的 route 补列（custom 语义；字段从条目直读）。
    for (const [key, profile] of Object.entries(snapshot?.providers ?? {})) {
      if (directory.some((entry) => entry.provider === key)) continue
      const models = Array.isArray(profile.models) ? profile.models.filter(asRecord) : []
      rows.push(...customRows(
        { provider: key, displayName: key, settingsNs: LLM_PI_AI_NS, settingsPath: ['providers', key] },
        models,
        reasoningOf,
        t,
      ))
    }
    this.allRows = rows
    this.state = { ...this.state, status: 'ready', providersExist: directory.length > 0 }
    this.applyFilter()
    this.notify()
  }

  private applyFilter(): void {
    const query = this.state.filter.trim().toLowerCase()
    if (query === '') {
      this.state = { ...this.state, rows: this.allRows }
      return
    }
    this.state = {
      ...this.state,
      rows: this.allRows.filter((row) =>
        row.modelId.toLowerCase().includes(query)
        || row.modelName.toLowerCase().includes(query)
        || row.providerName.toLowerCase().includes(query)
        || row.providerKey.toLowerCase().includes(query)),
    }
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener()
  }
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

/** 渲染模型清单视图（筛选行 + 行列表 + 空态矩阵）。 */
export function ModelsView({ t, model, onJump, onGoToProviders }: ModelsViewProps) {
  const state = useSyncExternalStore(
    (listener) => model.subscribe(listener),
    () => model.getSnapshot(),
    () => model.getSnapshot(),
  )
  if (state.status === 'loading') {
    return <div className="ms-note">{t('providers.loading')}</div>
  }
  return (
    <div className="ms-models">
      <input
        className="ms-input ms-models-filter"
        value={state.filter}
        placeholder={t('models.viewFilter')}
        aria-label={t('models.viewFilter')}
        onChange={(event: { target: { value: string } }) => { model.setFilter(event.target.value) }}
      />
      {state.rows.length === 0 && state.filter.trim() !== '' && (
        <div className="ms-empty">
          <div className="ms-empty-title">{t('models.emptyNoMatch', { q: state.filter.trim() })}</div>
          <button type="button" className="ms-button" onClick={() => { model.clearFilter() }}>{t('models.clearFilter')}</button>
        </div>
      )}
      {state.rows.length === 0 && state.filter.trim() === '' && !state.providersExist && (
        <div className="ms-empty">
          <div className="ms-empty-title">{t('models.emptyNoProviders')}</div>
          {/* 空态矩阵的下一步动作（V9 步骤 1「清单空态给接入引导」，与供应商视图空态引导卡同构） */}
          <button type="button" className="ms-button ms-button-primary" onClick={onGoToProviders}>
            {t('models.emptyGoProviders')}
          </button>
        </div>
      )}
      {state.rows.length === 0 && state.filter.trim() === '' && state.providersExist && (
        <div className="ms-empty">
          <div className="ms-empty-title">{t('models.emptyNoModelsButProviders')}</div>
          <button type="button" className="ms-button ms-button-primary" onClick={onGoToProviders}>
            {t('models.emptyGoProviders')}
          </button>
        </div>
      )}
      {state.rows.length > 0 && (
        <div className="ms-model-list">
          {state.rows.map((row, index) => (
            <div key={`${row.providerKey}:${row.modelId}:${index}`} className={`ms-model-list-row ms-source-${row.source}`}>
              <span className="ms-model-list-provider">{row.providerName}</span>
              <span className="ms-model-list-name">{row.modelName}</span>
              <span className="ms-model-list-id">{row.modelId}</span>
              <span className={`ms-badge ms-source-badge-${row.source}`}>{t(sourceKey(row.source))}</span>
              <span className="ms-model-list-field">{row.contextWindow}</span>
              <span className="ms-model-list-field">{row.maxTokens}</span>
              <span className="ms-model-list-field">{row.inputModalities}</span>
              {row.reasoning !== '' && <span className="ms-model-list-field">{row.reasoning}</span>}
              {row.jumpable && (
                <button type="button" className="ms-button" onClick={() => { onJump(row.providerKey, row.modelId) }}>
                  {t('action.locate')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 行拼装工具 ──────────────────────────────────────────────────────────────

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

/** 托管 provider 行：模型清单 = catalog 分组（同一注册表派生，与对话流选择器一致）。 */
function managedRows(entry: ConfigurableProviderRow, catalog: ModelCatalogLike | undefined, t: Translate): ModelListRow[] {
  const group = catalog?.groups.find((candidate) => candidate.id === entry.provider)
  if (group === undefined) return []
  return group.models.map((model) => ({
    providerKey: entry.provider,
    providerName: entry.displayName,
    modelId: model.id,
    modelName: model.name,
    source: 'managed',
    jumpable: false,
    contextWindow: t('models.fieldMissing'),
    maxTokens: t('models.fieldMissing'),
    inputModalities: t('models.fieldMissing'),
    reasoning: (model.reasoning?.efforts ?? []).map((effort) => effort.name).join(' / '),
  }))
}

/** 自定义清单行（字段从设置快照条目直读；推理标注从 catalog 补）。 */
function customRows(
  entry: ConfigurableProviderRow,
  models: Record<string, unknown>[],
  reasoning: Map<string, string[]>,
  t: Translate,
): ModelListRow[] {
  const missing = t('models.fieldMissing')
  return models.map((model) => {
    const modelId = typeof model.id === 'string' ? model.id : ''
    return {
      providerKey: entry.provider,
      providerName: entry.displayName,
      modelId,
      modelName: typeof model.name === 'string' && model.name !== '' ? model.name : modelId,
      source: 'custom',
      jumpable: true,
      contextWindow: typeof model.contextWindow === 'number' ? String(model.contextWindow) : missing,
      maxTokens: typeof model.maxTokens === 'number' ? String(model.maxTokens) : missing,
      inputModalities: modalitiesLabel(model.input, missing),
      reasoning: (reasoning.get(`${entry.provider}:${modelId}`) ?? []).join(' / '),
    }
  })
}

/** 目录默认态 / 覆盖态行（目录分支字段；缺失标未提供）。 */
function directoryRows(
  entry: ConfigurableProviderRow,
  models: DiscoveredModel[],
  reasoning: Map<string, string[]>,
  profile: Record<string, unknown>,
  t: Translate,
): ModelListRow[] {
  const missing = t('models.fieldMissing')
  const overrideOnly = isNonEmptyRecord(profile.modelOverrides)
  return models.map((model) => ({
    providerKey: entry.provider,
    providerName: entry.displayName,
    modelId: model.id,
    modelName: model.name ?? model.id,
    source: overrideOnly ? 'override' : 'directory',
    jumpable: !overrideOnly,
    contextWindow: typeof model.contextWindow === 'number' ? String(model.contextWindow) : missing,
    maxTokens: typeof model.maxTokens === 'number' ? String(model.maxTokens) : missing,
    inputModalities: modalitiesLabel(model.inputModalities, missing),
    reasoning: (reasoning.get(`${entry.provider}:${model.id}`) ?? []).join(' / '),
  }))
}

/** 来源态 → locale key。 */
function sourceKey(source: ModelListRow['source']): 'models.sourceCustom' | 'models.sourceDirectory' | 'models.sourceOverride' | 'providers.managedBadge' {
  if (source === 'custom') return 'models.sourceCustom'
  if (source === 'override') return 'models.sourceOverride'
  if (source === 'managed') return 'providers.managedBadge'
  return 'models.sourceDirectory'
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
