/**
 * client/settings/model-service/provider-edit-body.tsx —— 供应商展开体（dsh-model-service
 * §3.3 D3/D6/D7/D11，M1）。
 *
 * 结构（与 projects/store.ts 同款「纯 TS 模型 + 薄渲染」）：ProviderEditModel 持全部表单与
 * 交互状态（测试夹具的 useRef/useState 每次渲染重置，真相必须在模型里），ProviderEditBody
 * 只读快照渲染、动作转回模型。
 *
 * 模型区两互斥态（D11，宿主 resolveRouteModels 硬语义 AX10）：
 *   · 目录默认态——models 草案为空：目录模型经 discoverModels 目录分支只读展示（零网络），
 *     「保持目录默认」说明；保存时 models 字段不出现在写入值（既有 models[] 经 unset op
 *     清除 = 恢复目录默认）。仅目录型 provider（目录清单 declared=false）适用。
 *   · 自定义清单态——models 草案非空：逐条可编辑，「目录默认已被替换」明示；保存整组写入。
 *   · modelOverrides 第三态（有覆盖无 models）：「目录默认 + 覆盖」只读展示，M1 不开放编辑。
 *   · 自定义 provider（declared=true，非目录）：只有自定义清单一态，保存前置 = 至少一条
 *     模型（空集会被宿主解析拒绝，AS14），否则拒绝保存并给「至少添加一个模型或先执行
 *     发现」指引。
 *
 * compat 6 项（D6）：essential 3（thinkingFormat / supportsDeveloperRole /
 * supportsReasoningEffort）常显 + advanced 3（supportsStore / supportsUsageInStreaming /
 * supportsFinishReason——宿主 COMPLETIONS_COMPAT_GATE 声明序中 essential 之外的前三项）；
 * 可用性按所选协议对照宿主 COMPAT_GATES（协议不提供的字段标「一期不开放」且不可编辑，
 * AS13「不存在的字段标注不可用」）。草稿 compat 以存量 compat 为底合并编辑（读改写只动
 * 本次编辑的字段，宿主既有 compat 字段不丢）。
 *
 * 保存链路：ProviderEditModel.save() → settings-client.saveProvider（顺序与预检编排在那里，
 * 检查点 U1）；结果四分支渲染（route 撞名 / ref 占用 a·b / 宿主拒绝 / 成功）。
 */
import { useSyncExternalStore } from 'react'
import {
  checkCredentialRefAvailable,
  collectProfileRefs,
  credentialRefFor,
} from '../../model-service/credentials-client'
import {
  discoverProviderModels,
  type DiscoveredModel,
  type DiscoveryOutcome,
} from '../../model-service/discovery'
import {
  deriveProviderKey,
} from '../../model-service/provider-key'
import {
  saveProvider,
  thinkingEffortsOf,
  undeclaredFieldPaths,
  type HostProviderProfile,
  type ModelDraft,
  type ModelServiceHost,
  type ProviderDraft,
} from '../../model-service/settings-client'
import { ModelEdit, type Translate } from './model-edit'

// ── 常量（宿主契约字段集，逐字面对照 dsh-llm-pi-ai/lib/index.js）─────────────

/** 协议表（supportedProtocols 的声明序；界面下拉同序）。 */
const PROTOCOLS = ['openai-completions', 'openai-responses', 'anthropic-messages'] as const

/** thinkingFormat 的合法词形（SUPPORTED_THINKING_FORMATS，:306-318）。 */
const THINKING_FORMATS = [
  'openai', 'deepseek', 'openrouter', 'together', 'baseten', 'zai', 'qwen',
  'chat-template', 'qwen-chat-template', 'string-thinking', 'ant-ling',
] as const

/**
 * 本表单 6 个 compat 字段按协议的可用性（宿主 COMPAT_GATES :381-412 逐字面：全部 6 字段
 * 仅 openai-completions offer；openai-responses 只 offer supportsDeveloperRole；
 * anthropic-messages 一个不 offer）。
 */
const COMPAT_AVAILABILITY: Record<string, Record<string, boolean>> = {
  'openai-completions': {
    thinkingFormat: true,
    supportsDeveloperRole: true,
    supportsReasoningEffort: true,
    supportsStore: true,
    supportsUsageInStreaming: true,
    supportsFinishReason: true,
  },
  'openai-responses': {
    thinkingFormat: false,
    supportsDeveloperRole: true,
    supportsReasoningEffort: false,
    supportsStore: false,
    supportsUsageInStreaming: false,
    supportsFinishReason: false,
  },
  'anthropic-messages': {
    thinkingFormat: false,
    supportsDeveloperRole: false,
    supportsReasoningEffort: false,
    supportsStore: false,
    supportsUsageInStreaming: false,
    supportsFinishReason: false,
  },
}

/** essential 3 + advanced 3（D6 分组；advanced = COMPLETIONS gate 声明序中 essential 外前三）。 */
const COMPAT_ESSENTIAL = ['thinkingFormat', 'supportsDeveloperRole', 'supportsReasoningEffort'] as const
const COMPAT_ADVANCED = ['supportsStore', 'supportsUsageInStreaming', 'supportsFinishReason'] as const
const COMPAT_BOOLEAN_FIELDS: readonly string[] = [
  'supportsDeveloperRole', 'supportsReasoningEffort', 'supportsStore', 'supportsUsageInStreaming', 'supportsFinishReason',
]

/** compat 字段界面清单（分组 + boolean/form 区分）。 */
interface CompatFieldSpec {
  field: string
  labelKey: 'compat.field.thinkingFormat' | 'compat.field.supportsDeveloperRole' | 'compat.field.supportsReasoningEffort' | 'compat.field.supportsStore' | 'compat.field.supportsUsageInStreaming' | 'compat.field.supportsFinishReason'
  essential: boolean
}

const COMPAT_FIELDS: CompatFieldSpec[] = [
  { field: 'thinkingFormat', labelKey: 'compat.field.thinkingFormat', essential: true },
  { field: 'supportsDeveloperRole', labelKey: 'compat.field.supportsDeveloperRole', essential: true },
  { field: 'supportsReasoningEffort', labelKey: 'compat.field.supportsReasoningEffort', essential: true },
  { field: 'supportsStore', labelKey: 'compat.field.supportsStore', essential: false },
  { field: 'supportsUsageInStreaming', labelKey: 'compat.field.supportsUsageInStreaming', essential: false },
  { field: 'supportsFinishReason', labelKey: 'compat.field.supportsFinishReason', essential: false },
]

// ── ProviderEditModel ───────────────────────────────────────────────────────

/** 发现流程的界面态。 */
export interface DiscoveryState {
  running: boolean
  /** 上一次探测结果（catalog = 目录自有；endpoint = 真实探测；failed = 可行动失败）。 */
  outcome: DiscoveryOutcome | undefined
  /** 确认写入的勾选集（索引）。 */
  selected: number[]
  /** 探测错误文案（failed 时渲染）。 */
  error: string | undefined
}

/** 展开体的快照形态（引用稳定：变更时整体替换）。 */
export interface ProviderEditSnapshot {
  displayName: string
  baseURL: string
  api: string
  apiKeyValue: string
  /** 派生预览（displayName 空时 undefined）。 */
  keyPreview: string | undefined
  refPreview: string | undefined
  /** compat 草案（以存量 compat 为底合并编辑；含宿主侧未知字段，读侧按 typeof 收窄）。 */
  compat: Record<string, unknown>
  models: ModelDraft[]
  /** 目录默认态（models 空）= true。 */
  directoryMode: boolean
  /** 自定义 provider（非目录）= true：无目录默认态可回。 */
  customOnly: boolean
  /** modelOverrides 第三态（只读）。 */
  overrideOnly: boolean
  discovery: DiscoveryState
  /** 恢复目录默认的两段确认态（第一击后 true；警示文案 restoreDirectoryWarning 随之渲染）。 */
  restoreArmed: boolean
  saving: boolean
  /** 保存前置拒绝文案（空清单等）。 */
  blockedMessage: string | undefined
  /** 错误文案（宿主拒绝 / 冲突连续失败）。 */
  error: string | undefined
  /** 结果提示（保存成功 / ref 占用拒绝 / ref 未配置等）。 */
  notice: { kind: 'ok' | 'warn' | 'err'; text: string } | undefined
  /** 回读校验：宿主 schema 未声明字段（「宿主不消费」标注）。 */
  undeclared: string[]
  /** 目录默认态的目录模型清单（只读展示）。 */
  directoryModels: DiscoveredModel[]
}

/** 展开体的构造依赖。 */
export interface ProviderEditModelDeps {
  remote: ModelServiceHost
  t: Translate
  /** 编辑目标：key 固定；isNew = 新建；customOnly = 非目录 provider（declared=true）。 */
  target: { key: string; isNew: boolean; customOnly: boolean }
  /** 打开时快照（D3：revision 随之持有，保存不重取；existing 是存量 profile）。 */
  revision: number | undefined
  existing: HostProviderProfile | undefined
  /** 本 profile 的 providers 段（凭据查重的 apiKeyEnv 枚举源）。 */
  providers: Record<string, HostProviderProfile>
  /** 已知目录型 provider key 集合（listConfigurableProviders 的 declared=false 行；探测
   * 请求归一的判据——目录型宿主短路不看 baseURL，见 discovery.discoverProviderModels）。 */
  catalogProviderKeys?: ReadonlySet<string>
  /** 保存成功回调（父级刷新列表；本模型不回写父状态）。 */
  onSaved: () => void
}

/**
 * 展开体模型：表单草案、发现流程、保存动作的会话内权威。
 *
 * 草案初始化（读改写的「先读」时点 = 展开体打开，D3）：既有 provider 读入存量字段
 * （compat 以存量对象为底合并）；新建给协议默认 openai-completions。
 */
export class ProviderEditModel {
  private readonly deps: ProviderEditModelDeps
  private readonly listeners = new Set<() => void>()
  private state: ProviderEditSnapshot
  /** 编辑目标（可变镜像：新建保存成功后翻转为既有 provider 的编辑语义，见 save()）。 */
  private target: ProviderEditModelDeps['target']
  /** 持有的 revision 栅栏（保存成功回执刷新，D3）。 */
  private heldRevision: number | undefined
  /** 字段级 diff 的基线 profile（打开时快照；保存成功后换回执值，二次保存 diff 不失真）。 */
  private diffBase: HostProviderProfile | undefined
  /** 存量 compat 对象（读改写保留底）。 */
  private readonly storedCompat: Record<string, unknown>
  /** 保存前置的目录模型缓存（目录默认态展示）。 */
  private directoryModels: DiscoveredModel[] = []

  constructor(deps: ProviderEditModelDeps) {
    this.deps = deps
    this.target = deps.target
    this.heldRevision = deps.revision
    this.diffBase = deps.existing
    const existing = deps.existing
    this.storedCompat = isRecord(existing?.compat) ? { ...existing.compat } : {}
    const storedModels = Array.isArray(existing?.models) ? existing.models.filter(isRecord) : []
    this.state = {
      displayName: typeof existing?.displayName === 'string' ? existing.displayName : '',
      baseURL: typeof existing?.baseURL === 'string' ? existing.baseURL : '',
      api: typeof existing?.api === 'string' && (PROTOCOLS as readonly string[]).includes(existing.api) ? existing.api : 'openai-completions',
      apiKeyValue: '',
      keyPreview: undefined,
      refPreview: undefined,
      compat: { ...this.storedCompat },
      models: storedModels.map((model) => modelToDraft(model)),
      // customOnly（新建 / 非目录 provider）无目录态可回——与 removeModel / restoreDirectory 的
      // 守卫同语义：只有自定义清单一态（渲染落在自定义分支才有「手动添加模型」可点）。
      directoryMode: storedModels.length === 0 && !deps.target.customOnly,
      customOnly: deps.target.customOnly,
      overrideOnly: storedModels.length === 0 && isNonEmptyRecord(existing?.modelOverrides),
      discovery: { running: false, outcome: undefined, selected: [], error: undefined },
      restoreArmed: false,
      saving: false,
      blockedMessage: undefined,
      error: undefined,
      notice: undefined,
      undeclared: [],
      directoryModels: [],
    }
    this.refreshKeyPreview()
    if (!this.state.customOnly && this.state.directoryMode) void this.loadDirectoryModels()
  }

  getSnapshot(): ProviderEditSnapshot {
    return this.state
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** 目标 key（provider route）。 */
  get key(): string {
    return this.target.key
  }

  // ── 表单字段写入 ──

  setDisplayName(value: string): void {
    this.state = { ...this.state, displayName: value }
    this.refreshKeyPreview()
    this.notify()
  }

  setBaseURL(value: string): void {
    this.state = { ...this.state, baseURL: value }
    this.notify()
  }

  setApi(value: string): void {
    this.state = { ...this.state, api: value }
    this.notify()
  }

  setApiKeyValue(value: string): void {
    this.state = { ...this.state, apiKeyValue: value }
    this.notify()
  }

  /** compat 布尔字段三态：undefined（跟随协议）/ true / false。 */
  setCompatBoolean(field: string, value: boolean | undefined): void {
    const compat: Record<string, unknown> = { ...this.state.compat }
    if (value === undefined) Reflect.deleteProperty(compat, field)
    else compat[field] = value
    this.state = { ...this.state, compat }
    this.notify()
  }

  /** thinkingFormat 设定（'' = 未设置）。 */
  setCompatThinkingFormat(value: string): void {
    const compat: Record<string, unknown> = { ...this.state.compat }
    if (value === '') Reflect.deleteProperty(compat, 'thinkingFormat')
    else compat.thinkingFormat = value
    this.state = { ...this.state, compat }
    this.notify()
  }

  // ── 模型区 ──

  /** 手动添加一条空白模型草案（转自定义清单态；清单变更即退出恢复目录的确认态）。 */
  addModel(): void {
    const blank: ModelDraft = { id: '', name: '', contextWindow: undefined, maxTokens: undefined, input: ['text'], thinkingStrategy: 'none' }
    const models = [...this.state.models, blank]
    this.state = { ...this.state, models, directoryMode: false, blockedMessage: undefined, restoreArmed: false }
    this.notify()
  }

  /** 更新第 index 条模型草案。 */
  setModel(index: number, draft: ModelDraft): void {
    const models = [...this.state.models]
    models[index] = draft
    this.state = { ...this.state, models }
    this.notify()
  }

  /** 删除第 index 条模型草案（删空 = 目录默认态；customOnly 时保存会被前置拒绝；清单变更退出确认态）。 */
  removeModel(index: number): void {
    const models = this.state.models.filter((_, at) => at !== index)
    this.state = { ...this.state, models, directoryMode: models.length === 0 && !this.state.customOnly, restoreArmed: false }
    this.notify()
  }

  // ── 恢复目录默认的两段确认（D11 采用段「明确警示自定义条目将移除、目录模型将恢复」，
  //    形态对齐供应商删除动作：第一击进入确认态并展示警示文案，第二击执行）─────────────

  /** 第一击：进入确认态（警示文案在渲染层展示；无可恢复清单时不进入）。 */
  requestRestoreDirectory(): void {
    if (this.state.customOnly || this.state.models.length === 0) return
    this.state = { ...this.state, restoreArmed: true }
    this.notify()
  }

  /** 第二击：真正恢复目录默认（清空 models 草案 = 保存时 unset models[]）。 */
  confirmRestoreDirectory(): void {
    this.restoreDirectory()
  }

  /** 退出确认态（models 草案不动）。 */
  cancelRestoreDirectory(): void {
    if (!this.state.restoreArmed) return
    this.state = { ...this.state, restoreArmed: false }
    this.notify()
  }

  /** 恢复目录默认（D11：清空 models 草案 = 保存时 unset models[]）。 */
  restoreDirectory(): void {
    if (this.state.customOnly || this.state.models.length === 0) return
    this.state = { ...this.state, models: [], directoryMode: true, restoreArmed: false }
    this.notify()
  }

  /** 目录默认态的目录模型只读清单（挂载时经目录分支拉取，零网络）。 */
  private async loadDirectoryModels(): Promise<void> {
    const outcome = await discoverProviderModels(
      this.deps.remote.llm,
      { provider: this.target.key },
      this.deps.catalogProviderKeys,
    )
    if (outcome.kind === 'catalog' || outcome.kind === 'endpoint') {
      this.directoryModels = outcome.models
      this.state = { ...this.state, directoryModels: outcome.models }
      this.notify()
    }
  }

  // ── 发现与连通性 ──

  /**
   * 测试连接 / 发现模型（同一通道，AS7）：草稿端点+协议+密钥（新输入才随请求过线）探测。
   * 既有目录型 provider（catalogProviderKeys 命中）宿主零网络短路返回目录模型——请求由
   * discovery 归一为 {provider} 形态（端点草稿不参与），结果按「目录自有模型」呈现且不
   * 声称端点连通性已验证；自定义 / 新建 provider 带端点草稿做真实端点探测。
   */
  async discover(): Promise<void> {
    if (this.state.discovery.running) return
    const baseURL = this.state.baseURL.trim()
    if (baseURL === '' && this.directoryModels.length === 0) {
      this.state = {
        ...this.state,
        discovery: { running: false, outcome: undefined, selected: [], error: `${this.deps.t('discovery.failed')}：${this.deps.t('discovery.requireEndpoint')}` },
      }
      this.notify()
      return
    }
    this.state = { ...this.state, discovery: { running: true, outcome: undefined, selected: [], error: undefined } }
    this.notify()
    const draftKey = this.target.key !== '' ? this.target.key : undefined
    const outcome = await discoverProviderModels(
      this.deps.remote.llm,
      {
        ...(draftKey !== undefined ? { provider: draftKey } : {}),
        ...(baseURL !== '' ? { baseURL } : {}),
        api: this.state.api,
        ...(this.state.apiKeyValue.trim() !== '' ? { apiKey: this.state.apiKeyValue.trim() } : {}),
      },
      this.deps.catalogProviderKeys,
    )
    const error = outcome.kind === 'failed' ? `${this.deps.t('discovery.failed')}：${outcome.recovery}（${outcome.message}）` : undefined
    this.state = {
      ...this.state,
      discovery: {
        running: false,
        outcome: outcome.kind === 'failed' ? undefined : outcome,
        selected: outcome.kind === 'failed' ? [] : outcome.models.map((_, index) => index),
        error,
      },
    }
    this.notify()
  }

  /** 勾选/取消一个发现结果（确认写入的候选集）。 */
  toggleDiscoverySelect(index: number): void {
    const selected = this.state.discovery.selected.includes(index)
      ? this.state.discovery.selected.filter((at) => at !== index)
      : [...this.state.discovery.selected, index]
    this.state = { ...this.state, discovery: { ...this.state.discovery, selected } }
    this.notify()
  }

  /** 确认写入：勾选的发现结果整组替换为自定义清单（D11：写入 models[] = 整体替换目录默认）。 */
  confirmDiscovery(): void {
    const outcome = this.state.discovery.outcome
    if (outcome === undefined || outcome.kind === 'failed') return
    const models = this.state.discovery.selected
      .sort((left, right) => left - right)
      .flatMap((index) => discoveredToDraft(outcome.models[index]))
    if (models.length === 0) return
    this.state = { ...this.state, models, directoryMode: false, restoreArmed: false, discovery: { running: false, outcome: undefined, selected: [], error: undefined } }
    this.notify()
  }

  // ── 保存 ──

  /** 保存前置（D3/D11）：自定义清单态至少一条模型。返回 undefined = 通过。 */
  private precondition(): string | undefined {
    const wantsCustomList = this.state.customOnly || !this.state.directoryMode
    if (wantsCustomList && this.state.models.length === 0) return this.deps.t('models.saveBlockedEmpty')
    return undefined
  }

  /** 执行保存（结果分支写入 notice/error/blockedMessage；成功后回调父级刷新）。 */
  async save(): Promise<void> {
    if (this.state.saving) return
    const blocked = this.precondition()
    if (blocked !== undefined) {
      this.state = { ...this.state, blockedMessage: blocked, error: undefined, notice: undefined }
      this.notify()
      return
    }
    this.state = { ...this.state, saving: true, blockedMessage: undefined, error: undefined, notice: undefined }
    this.notify()

    const draft: ProviderDraft = {
      // 新建：key 由显示名即时派生（AX11）；编辑：key 固定为既有 route。
      key: this.target.isNew ? deriveProviderKey(this.state.displayName.trim()) : this.target.key,
      isNew: this.target.isNew,
      displayName: this.state.displayName.trim(),
      baseURL: this.state.baseURL.trim(),
      api: this.state.api,
      apiKeyValue: this.state.apiKeyValue.trim(),
      compat: writableCompat(this.state.compat, this.state.api),
      models: this.state.models,
    }
    const result = await saveProvider(this.deps.remote, {
      draft,
      revision: this.heldRevision,
      existing: this.diffBase,
      refGuard: (ref, ownRef) => checkCredentialRefAvailable(
        { credentials: this.deps.remote.credentials, profileRefs: collectProfileRefs(this.deps.providers) },
        ref,
        ownRef,
      ),
    })

    if (result.kind === 'refused-route') {
      this.state = { ...this.state, saving: false, notice: { kind: 'err', text: this.deps.t('save.refTakenRoute') } }
      this.notify()
      return
    }
    if (result.kind === 'refused-ref') {
      this.state = {
        ...this.state,
        saving: false,
        notice: { kind: 'err', text: result.branch === 'a' ? this.deps.t('save.refTakenA') : this.deps.t('save.refTakenB') },
      }
      this.notify()
      return
    }
    if (result.kind === 'rejected') {
      this.state = { ...this.state, saving: false, error: result.message }
      this.notify()
      return
    }

    // 成功：凭据失败不回滚设置（D3 可见可救——徽章「未配置」+ 重填重试）。
    this.heldRevision = result.revision
    this.diffBase = result.profile
    // 新建保存成功：目标翻转为既有 provider 的编辑语义（key 固定、不再走新建预检与整条
    // set）——展开体保持打开时二次保存走字段级 diff，不会撞自身的 route 预检。
    if (this.target.isNew) this.target = { ...this.target, key: draft.key, isNew: false }
    const notice = result.refConfigured
      ? { kind: 'ok' as const, text: this.deps.t('save.saved') }
      : { kind: 'warn' as const, text: `${this.deps.t('credential.missing')}：${result.refMessage ?? ''}` }
    this.state = {
      ...this.state,
      saving: false,
      notice,
      undeclared: result.undeclared,
      apiKeyValue: '', // 密钥不回显（AX1：成功后清草稿；失败时用户在展开体重填）
    }
    this.deps.onSaved()
    this.notify()
  }

  /** 重置错误/提示行（用户再次编辑前清屏）。 */
  dismissMessages(): void {
    if (this.state.error === undefined && this.state.notice === undefined) return
    this.state = { ...this.state, error: undefined, notice: undefined }
    this.notify()
  }

  private refreshKeyPreview(): void {
    const name = this.state.displayName.trim()
    const key = this.target.isNew && name !== '' ? deriveProviderKey(name) : this.target.key
    this.state = {
      ...this.state,
      keyPreview: key !== '' ? key : undefined,
      refPreview: key !== '' ? credentialRefFor(key) : undefined,
    }
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener()
  }
}

// ── ProviderEditBody 组件 ───────────────────────────────────────────────────

/** 展开体组件 props：模型 + 聚焦的模型 id（模型清单跳转定位）+ 收起回调。 */
export interface ProviderEditBodyProps {
  t: Translate
  model: ProviderEditModel
  /** 跳转定位的模型 id（存在时该行加高亮类）。 */
  focusModel: string | undefined
  /** 取消（收起展开体；不落任何草稿）。 */
  onCancel: () => void
}

/** 渲染供应商展开体（全部交互经 model 动作）。 */
export function ProviderEditBody({ t, model, focusModel, onCancel }: ProviderEditBodyProps) {
  const state = useSyncExternalStore(
    (listener) => model.subscribe(listener),
    () => model.getSnapshot(),
    () => model.getSnapshot(),
  )
  const compatWritable = COMPAT_AVAILABILITY[state.api] ?? {}
  return (
    <div className="ms-edit-body">
      {/* 基本字段 */}
      <label className="ms-field">
        <span className="ms-field-label">{t('provider.displayName')}</span>
        <input
          className="ms-input"
          defaultValue={state.displayName}
          onChange={(event: { target: { value: string } }) => { model.setDisplayName(event.target.value) }}
        />
        {state.keyPreview !== undefined && (
          <span className="ms-field-hint">
            {t('provider.keyPreview', { key: state.keyPreview })}
            {state.refPreview !== undefined ? ` · ${t('provider.refPreview', { ref: state.refPreview })}` : ''}
          </span>
        )}
      </label>
      <label className="ms-field">
        <span className="ms-field-label">{t('provider.baseURL')}</span>
        <input
          className="ms-input"
          defaultValue={state.baseURL}
          placeholder="https://api.example.com/v1"
          onChange={(event: { target: { value: string } }) => { model.setBaseURL(event.target.value) }}
        />
      </label>
      <label className="ms-field">
        <span className="ms-field-label">{t('provider.api')}</span>
        <select
          className="ms-select"
          value={state.api}
          onChange={(event: { target: { value: string } }) => { model.setApi(event.target.value) }}
        >
          {PROTOCOLS.map((protocol) => (
            <option key={protocol} value={protocol}>{t(protocolKey(protocol))}</option>
          ))}
        </select>
      </label>
      <label className="ms-field">
        <span className="ms-field-label">{t('provider.apiKey')}</span>
        <input
          className="ms-input"
          type="password"
          defaultValue={state.apiKeyValue}
          onChange={(event: { target: { value: string } }) => { model.setApiKeyValue(event.target.value) }}
        />
      </label>

      {/* compat 6 项（D6：essential 常显 + advanced 一期开放 3；协议不提供的标一期不开放） */}
      <div className="ms-compat">
        <div className="ms-compat-head">{t('provider.compat')}</div>
        {COMPAT_FIELDS.map((spec) => {
          const available = compatWritable[spec.field] === true
          return (
            <div key={spec.field} className="ms-compat-field">
              <span className="ms-field-label">{t(spec.labelKey)}</span>
              {spec.field === 'thinkingFormat' ? (
                <select
                  className="ms-select"
                  value={typeof state.compat.thinkingFormat === 'string' ? state.compat.thinkingFormat : ''}
                  disabled={!available}
                  onChange={(event: { target: { value: string } }) => { model.setCompatThinkingFormat(event.target.value) }}
                >
                  <option value="">—</option>
                  {THINKING_FORMATS.map((format) => (
                    <option key={format} value={format}>{format}</option>
                  ))}
                </select>
              ) : (
                <select
                  className="ms-select"
                  value={state.compat[spec.field] === true ? 'yes' : state.compat[spec.field] === false ? 'no' : ''}
                  disabled={!available}
                  onChange={(event: { target: { value: string } }) => {
                    model.setCompatBoolean(spec.field, event.target.value === '' ? undefined : event.target.value === 'yes')
                  }}
                >
                  <option value="">—</option>
                  <option value="yes">true</option>
                  <option value="no">false</option>
                </select>
              )}
              {!available && <span className="ms-compat-unavailable">{t('compat.unavailable')}</span>}
              {!spec.essential && <span className="ms-compat-tag">advanced</span>}
            </div>
          )
        })}
        <div className="ms-compat-groups">
          <span>{t('compat.groupEssential')}</span>
        </div>
      </div>

      {/* 模型区：两互斥态 + modelOverrides 第三态（D11） */}
      <div className="ms-models-block">
        <div className="ms-models-head">
          <span className="ms-compat-head">{t('provider.modelsSection')}</span>
          <span className={`ms-badge${state.overrideOnly ? ' ms-badge-missing' : state.directoryMode ? ' ms-badge-catalog' : ' ms-badge-custom'}`}>
            {state.overrideOnly ? t('models.sourceOverride') : state.directoryMode ? t('models.sourceDirectory') : t('models.sourceCustom')}
          </span>
        </div>
        {state.overrideOnly ? (
          <div className="ms-note">{t('models.overrideNote')}</div>
        ) : state.directoryMode ? (
          <div className="ms-directory">
            <div className="ms-note ms-note-ok">{t('models.directoryMode')}</div>
            <div className="ms-note">{t('models.catalogNote')}</div>
            {state.directoryModels.map((model) => (
              <div key={model.id} className={`ms-directory-row${focusModel === model.id ? ' ms-row-focus' : ''}`}>
                <span className="ms-directory-name">{model.name ?? model.id}</span>
                <span className="ms-directory-id">{model.id}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="ms-custom">
            <div className="ms-note ms-note-warn">{t('models.directoryReplaced')}</div>
            {state.models.map((draft, index) => (
              <div key={index} className={`ms-model-row${focusModel === draft.id ? ' ms-row-focus' : ''}`}>
                <ModelEdit t={t} draft={draft} onChange={(next) => { model.setModel(index, next) }} />
                <button type="button" className="ms-button ms-button-danger" onClick={() => { model.removeModel(index) }}>×</button>
              </div>
            ))}
            <div className="ms-models-actions">
              <button type="button" className="ms-button" onClick={() => { model.addModel() }}>{t('action.addModel')}</button>
              <button type="button" className="ms-button" disabled={state.discovery.running} onClick={() => { void model.discover() }}>{t('action.discover')}</button>
              {!state.customOnly && (
                <button
                  type="button"
                  className={`ms-button ${state.restoreArmed ? 'ms-button-danger' : ''}`}
                  onClick={() => { state.restoreArmed ? model.confirmRestoreDirectory() : model.requestRestoreDirectory() }}
                >
                  {state.restoreArmed ? t('action.confirmRestore') : t('models.restoreDirectory')}
                </button>
              )}
            </div>
            {state.restoreArmed && (
              <div className="ms-note ms-note-warn">
                <span>{t('models.restoreDirectoryWarning', { n: state.models.length })}</span>
                <button type="button" className="ms-button" onClick={() => { model.cancelRestoreDirectory() }}>{t('action.cancel')}</button>
              </div>
            )}
            {state.customOnly && state.models.length === 0 && (
              <div className="ms-note ms-note-err">{t('models.saveBlockedEmpty')}</div>
            )}
          </div>
        )}
      </div>

      {/* 发现结果确认（勾选 → 确认写入） */}
      {state.discovery.running && <div className="ms-note">{t('discovery.running')}</div>}
      {state.discovery.outcome !== undefined && (
        <div className="ms-discovery">
          <div className="ms-note ms-note-ok">
            {state.discovery.outcome.kind === 'catalog'
              ? t('discovery.catalog', { n: state.discovery.outcome.models.length })
              : t('discovery.endpointOk', { n: state.discovery.outcome.models.length })}
          </div>
          {state.discovery.outcome.kind === 'catalog' && (
            /* 目录短路的替代指引（AS7）：catalog 结果 = 端点连通性未被验证，就地说明替代路径 */
            <div className="ms-note">{t('discovery.catalogNoEndpointTest')}</div>
          )}
          {state.discovery.outcome.models.length === 0 && <div className="ms-note">{t('discovery.none')}</div>}
          {state.discovery.outcome.models.map((candidate, index) => (
            <label key={`${candidate.id}:${index}`} className="ms-check ms-discovery-row">
              <input
                type="checkbox"
                checked={state.discovery.selected.includes(index)}
                onChange={() => { model.toggleDiscoverySelect(index) }}
              />
              <span>{candidate.name ?? candidate.id}</span>
              <span className="ms-directory-id">{candidate.id}</span>
            </label>
          ))}
          {state.discovery.outcome.models.length > 0 && (
            <button type="button" className="ms-button ms-button-primary" onClick={() => { model.confirmDiscovery() }}>
              {t('action.save')}
            </button>
          )}
        </div>
      )}
      {state.discovery.error !== undefined && <div className="ms-note ms-note-err">{state.discovery.error}</div>}

      {/* 连通性（目录默认态也提供测试连接） */}
      {state.directoryMode && !state.overrideOnly && (
        <div className="ms-edit-actions">
          <button type="button" className="ms-button" disabled={state.discovery.running} onClick={() => { void model.discover() }}>
            {t('action.testConnection')}
          </button>
        </div>
      )}

      {/* 提示 / 错误 / 回读校验 */}
      {state.notice !== undefined && (
        <div className={`ms-note ms-note-${state.notice.kind === 'ok' ? 'ok' : state.notice.kind === 'warn' ? 'warn' : 'err'}`} role="status">
          {state.notice.text}
        </div>
      )}
      {state.error !== undefined && <div className="ms-error" role="alert">{state.error}</div>}
      {state.blockedMessage !== undefined && <div className="ms-note ms-note-warn">{state.blockedMessage}</div>}
      {state.undeclared.length > 0 && (
        <div className="ms-note">{t('compat.hostDoesNotConsume', { fields: state.undeclared.join(', ') })}</div>
      )}

      {/* 保存 / 取消 */}
      <div className="ms-edit-actions">
        <button type="button" className="ms-button ms-button-primary" disabled={state.saving} onClick={() => { void model.save() }}>
          {t('action.save')}
        </button>
        <button type="button" className="ms-button" onClick={onCancel}>{t('action.cancel')}</button>
      </div>
    </div>
  )
}

// ── 工具 ────────────────────────────────────────────────────────────────────

/** 协议 id → locale key。 */
function protocolKey(protocol: string): 'provider.protocol.openai-completions' | 'provider.protocol.openai-responses' | 'provider.protocol.anthropic-messages' {
  if (protocol === 'openai-responses') return 'provider.protocol.openai-responses'
  if (protocol === 'anthropic-messages') return 'provider.protocol.anthropic-messages'
  return 'provider.protocol.openai-completions'
}

/** 草案 compat → 本次协议下可写子集（不可用字段不写入；只复制 boolean/string 形态的条目）。 */
function writableCompat(compat: Record<string, unknown>, api: string): Record<string, boolean | string> {
  const gate = COMPAT_AVAILABILITY[api] ?? {}
  const out: Record<string, boolean | string> = {}
  for (const [field, value] of Object.entries(compat)) {
    if (gate[field] === true && (typeof value === 'boolean' || typeof value === 'string')) out[field] = value
  }
  return out
}

/**
 * 存量 models[] 条目 → 编辑草案（未知字段不进草案——它们由字段级 diff 之外的读改写保留面保证）。
 *
 * reasoningEfforts 归档（D3 读改写保真）：字典与 D6 三档映射**精确相等**才归档对应策略
 * （写回值与既有值逐字段一致，用户未编辑推理档位时 models 无 diff）；不匹配的字典 / 布尔与
 * 字典之外的形态 → preserve 原样保留态（草案携带原始值，写回逐字透传，不静默改写宿主权威
 * 数据——宿主「模型」分区可编辑推理等级，非三档形态可达）。
 */
function modelToDraft(model: Record<string, unknown>): ModelDraft {
  const efforts = model.reasoningEfforts
  let thinkingStrategy: ModelDraft['thinkingStrategy']
  let reasoningEffortsRaw: ModelDraft['reasoningEffortsRaw']
  if (isRecord(efforts) && matchesStrategy(efforts, 'high-max')) thinkingStrategy = 'high-max'
  else if (isRecord(efforts) && matchesStrategy(efforts, 'on-off')) thinkingStrategy = 'on-off'
  else if (isRecord(efforts) && matchesStrategy(efforts, 'all')) thinkingStrategy = 'all'
  else if (efforts === false) thinkingStrategy = 'none' // 写回 false，与既有值一致（无损）
  else {
    // 非三档字典（含 off 值为空串的字典）、省略该字段（宿主语义 = 沿用目录能力）或其他
    // 未知形态：原样保留，写回逐字透传。
    thinkingStrategy = 'preserve'
    reasoningEffortsRaw = efforts
  }
  return {
    id: typeof model.id === 'string' ? model.id : '',
    name: typeof model.name === 'string' ? model.name : '',
    contextWindow: typeof model.contextWindow === 'number' ? model.contextWindow : undefined,
    maxTokens: typeof model.maxTokens === 'number' ? model.maxTokens : undefined,
    input: Array.isArray(model.input) ? model.input.filter((item): item is 'text' | 'image' => item === 'text' || item === 'image') : [],
    thinkingStrategy,
    ...(reasoningEffortsRaw !== undefined ? { reasoningEffortsRaw } : {}),
  }
}

/** reasoningEfforts 字典与 D6 三档映射的精确比对（键集与值全等；无损归档的判据）。 */
function matchesStrategy(efforts: Record<string, unknown>, strategy: Exclude<ModelDraft['thinkingStrategy'], 'none' | 'preserve'>): boolean {
  const target = thinkingEffortsOf(strategy)
  const keys = Object.keys(efforts)
  return keys.length === Object.keys(target).length && keys.every((key) => efforts[key] === target[key])
}

/** 发现结果 → 模型草案（目录分支字段齐备时带上下文/输入类型；缺失留空）。 */
function discoveredToDraft(model: DiscoveredModel): ModelDraft[] {
  if (model === undefined || typeof model.id !== 'string' || model.id === '') return []
  return [{
    id: model.id,
    name: model.name ?? model.id,
    contextWindow: typeof model.contextWindow === 'number' ? model.contextWindow : undefined,
    maxTokens: typeof model.maxTokens === 'number' ? model.maxTokens : undefined,
    input: model.inputModalities ?? ['text'],
    thinkingStrategy: 'none',
  }]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyRecord(value: unknown): boolean {
  return isRecord(value) && Object.keys(value).length > 0
}
