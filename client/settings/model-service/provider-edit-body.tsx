/**
 * client/settings/model-service/provider-edit-body.tsx —— 供应商展开体（dsh-model-service
 * §3.3 D3/D6/D7/D11，M1；供应商接入交互重设计后双形态）。
 *
 * 结构（与 projects/store.ts 同款「纯 TS 模型 + 薄渲染」）：ProviderEditModel 持全部表单与
 * 交互状态（测试夹具的 useRef/useState 每次渲染重置，真相必须在模型里），ProviderEditBody
 * 只读快照渲染、动作转回模型。
 *
 * 表单两形态（target.narrow，交互重设计）：
 *   · 窄表单（内置目录型：目录型新增与目录型编辑）——顶部说明「API 端点与协议由内置目录
 *     解析」；供应商名只读展示 + 目录型徽章；保存标识与凭据引用行；API 密钥输入；模型区。
 *     不渲染 displayName / API 端点 / 协议 / compat 六项编辑区；保存时这四者不进写入面
 *     （profileFromDraft 不写、profileDiffOps 不发 op——见 settings-client 的 narrow 字段）。
 *   · 全表单（自定义型：非目录 provider 与自定义新建）——完整字段面，同原形态。
 *
 * 模型区两互斥态（D11，宿主 resolveRouteModels 硬语义 AX10）：
 *   · 目录默认态——models 草案为空：目录模型经 discoverModels 目录分支只读展示（零网络，
 *     通道只返回 id/显示名/输入模态——摘要不虚构其余字段），「保持目录默认」说明；保存时
 *     models 字段不出现在写入值（既有 models[] 经 unset op 清除 = 恢复目录默认）。
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
  COMPAT_AVAILABILITY,
  modelToDraft,
  prettifyId,
  PROTOCOLS,
  saveProvider,
  THINKING_FORMATS,
  THINKING_LEVELS,
  undeclaredFieldPaths,
  type HostProviderProfile,
  type ModelDraft,
  type ModelServiceHost,
  type ProviderDraft,
} from '../../model-service/settings-client'
import { DEFAULT_CONTEXT_WINDOW, ModelEdit, type Translate } from './model-edit'

// ── 常量（宿主契约词表镜像已安家 settings-client 词表区，MF-1-12；此处只留产品侧分组）──

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
  /** 窄表单（内置目录型）：端点/协议/显示名/compat 不渲染、不进写入面。 */
  narrow: boolean
  /** 内置目录条目的目录显示名（窄表单身份行的回落源；存量 displayName 优先）。 */
  catalogName: string | undefined
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
  /** 目录模型读取失败提示（MF-1-18：失败显形——携带恢复动作，区分「目录无模型」与「读取失败」）。 */
  directoryError: string | undefined
  /**
   * 派生布尔（MF-1-11）：窄表单空保存判据（与 precondition 同源，见 narrowEmptyBlockedForm）。
   * 保存按钮 disabled 与提示 title 只读本字段，不再各自内联条件——同一裁决单点。
   */
  saveBlocked: boolean
}

/** 展开体的构造依赖。 */
export interface ProviderEditModelDeps {
  remote: ModelServiceHost
  t: Translate
  /**
   * 编辑目标：key 固定；isNew = 新建；customOnly = 非目录 provider（declared=true）；
   * narrow = 内置目录型（窄表单：目录型新增与目录型编辑）；catalogName = 目录显示名
   * （窄表单身份行回落源，新增时唯一来源）。
   */
  target: { key: string; isNew: boolean; customOnly: boolean; narrow: boolean; catalogName?: string }
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

/** 快照的源字段集（saveBlocked 为派生字段，由 finalizeSnapshot 统一重算，不手工写）。 */
type ProviderEditStateFields = Omit<ProviderEditSnapshot, 'saveBlocked'>

/**
 * 窄表单空保存判据（MF-1-11 单点）：新建的窄表单零填写（无密钥且无模型）。窄表单零填写
 * = 写入全字段缺省的空 profile 条目，宿主 settings 视图对该形态视为未设置（describe 条目
 * 延迟出现——隔离实例实测），接入因此不成立。既有条目编辑（isNew=false）不在此列——
 * 不因未输密钥被拦（行为修正：旧按钮判据无 isNew，编辑既有目录型条目会被过拦）。
 */
function narrowEmptyBlockedForm(state: ProviderEditStateFields, target: ProviderEditModelDeps['target']): boolean {
  return state.narrow && target.isNew && state.apiKeyValue.trim() === '' && state.models.length === 0
}

/** 快照终态化：状态写入的唯一出口（见 ProviderEditModel.commit），合并派生字段 saveBlocked。 */
function finalizeSnapshot(state: ProviderEditStateFields, target: ProviderEditModelDeps['target']): ProviderEditSnapshot {
  return { ...state, saveBlocked: narrowEmptyBlockedForm(state, target) }
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
    this.state = finalizeSnapshot({
      displayName: typeof existing?.displayName === 'string' ? existing.displayName : '',
      baseURL: typeof existing?.baseURL === 'string' ? existing.baseURL : '',
      api: typeof existing?.api === 'string' && PROTOCOLS.includes(existing.api) ? existing.api : 'openai-completions',
      apiKeyValue: '',
      narrow: deps.target.narrow,
      catalogName: deps.target.catalogName,
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
      directoryError: undefined,
    }, this.target)
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

  /**
   * 状态写入单点（MF-1-11）：合并 partial 并重算派生字段（saveBlocked）——除构造器外，
   * this.state 只经本方法赋值，派生字段不随写入点漂移。notify 时序归调用方（与既有行为一致）。
   */
  private commit(partial: Partial<ProviderEditSnapshot>): void {
    this.state = finalizeSnapshot({ ...this.state, ...partial }, this.target)
  }

  // ── 表单字段写入 ──

  setDisplayName(value: string): void {
    this.commit({ displayName: value })
    this.refreshKeyPreview()
    this.notify()
  }

  setBaseURL(value: string): void {
    this.commit({ baseURL: value })
    this.notify()
  }

  setApi(value: string): void {
    this.commit({ api: value })
    this.notify()
  }

  setApiKeyValue(value: string): void {
    this.commit({ apiKeyValue: value })
    this.notify()
  }

  /** compat 布尔字段三态：undefined（跟随协议）/ true / false。 */
  setCompatBoolean(field: string, value: boolean | undefined): void {
    const compat: Record<string, unknown> = { ...this.state.compat }
    if (value === undefined) Reflect.deleteProperty(compat, field)
    else compat[field] = value
    this.commit({ compat })
    this.notify()
  }

  /** thinkingFormat 设定（'' = 未设置）。 */
  setCompatThinkingFormat(value: string): void {
    const compat: Record<string, unknown> = { ...this.state.compat }
    if (value === '') Reflect.deleteProperty(compat, 'thinkingFormat')
    else compat.thinkingFormat = value
    this.commit({ compat })
    this.notify()
  }

  // ── 模型区 ──

  /** 手动添加一条空白模型草案（转自定义清单态；清单变更即退出恢复目录的确认态）。
   * 上下文 1M / 双模态 / 支持思考 + 全档位是产品默认（发现通道不返回这些字段，同默认）。 */
  addModel(): void {
    const blank: ModelDraft = {
      id: '',
      name: '',
      contextWindow: DEFAULT_CONTEXT_WINDOW,
      maxTokens: undefined,
      input: ['text', 'image'],
      thinkingEnabled: true,
      levels: [...THINKING_LEVELS],
      preserve: false,
    }
    const models = [...this.state.models, blank]
    this.commit({ models, directoryMode: false, blockedMessage: undefined, restoreArmed: false })
    this.notify()
  }

  /** 更新第 index 条模型草案。 */
  setModel(index: number, draft: ModelDraft): void {
    const models = [...this.state.models]
    models[index] = draft
    this.commit({ models })
    this.notify()
  }

  /** 删除第 index 条模型草案（删空 = 目录默认态；customOnly 时保存会被前置拒绝；清单变更退出确认态）。 */
  removeModel(index: number): void {
    const models = this.state.models.filter((_, at) => at !== index)
    this.commit({ models, directoryMode: models.length === 0 && !this.state.customOnly, restoreArmed: false })
    this.notify()
  }

  // ── 恢复目录默认的两段确认（D11 采用段「明确警示自定义条目将移除、目录模型将恢复」，
  //    形态对齐供应商删除动作：第一击进入确认态并展示警示文案，第二击执行）─────────────

  /** 第一击：进入确认态（警示文案在渲染层展示；无可恢复清单时不进入）。 */
  requestRestoreDirectory(): void {
    if (this.state.customOnly || this.state.models.length === 0) return
    this.commit({ restoreArmed: true })
    this.notify()
  }

  /** 第二击：真正恢复目录默认（清空 models 草案 = 保存时 unset models[]）。 */
  confirmRestoreDirectory(): void {
    this.restoreDirectory()
  }

  /** 退出确认态（models 草案不动）。 */
  cancelRestoreDirectory(): void {
    if (!this.state.restoreArmed) return
    this.commit({ restoreArmed: false })
    this.notify()
  }

  /** 恢复目录默认（D11：清空 models 草案 = 保存时 unset models[]）。 */
  restoreDirectory(): void {
    if (this.state.customOnly || this.state.models.length === 0) return
    this.commit({ models: [], directoryMode: true, restoreArmed: false })
    this.notify()
  }

  /** 目录默认态的目录模型只读清单（挂载时经目录分支拉取，零网络）。失败显形（MF-1-18）：
   * failed outcome 携带可行动 recovery 文案——写入 directoryError 提示行，不再静默丢弃
   * （空清单 = 用户无法区分「目录无模型」与「读取失败」）。 */
  private async loadDirectoryModels(): Promise<void> {
    const outcome = await discoverProviderModels(
      this.deps.remote.llm,
      { provider: this.target.key },
      this.deps.catalogProviderKeys,
    )
    if (outcome.kind === 'failed') {
      this.commit({ directoryError: `${this.deps.t('models.directoryLoadFailed')}：${outcome.recovery}（${outcome.message}）` })
      this.notify()
      return
    }
    this.directoryModels = outcome.models
    this.commit({ directoryModels: outcome.models, directoryError: undefined })
    this.notify()
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
      this.commit({ discovery: { running: false, outcome: undefined, selected: [], error: `${this.deps.t('discovery.failed')}：${this.deps.t('discovery.requireEndpoint')}` } })
      this.notify()
      return
    }
    this.commit({ discovery: { running: true, outcome: undefined, selected: [], error: undefined } })
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
    this.commit({
      discovery: {
        running: false,
        outcome: outcome.kind === 'failed' ? undefined : outcome,
        selected: outcome.kind === 'failed' ? [] : outcome.models.map((_, index) => index),
        error,
      },
    })
    this.notify()
  }

  /** 勾选/取消一个发现结果（确认写入的候选集）。 */
  toggleDiscoverySelect(index: number): void {
    const selected = this.state.discovery.selected.includes(index)
      ? this.state.discovery.selected.filter((at) => at !== index)
      : [...this.state.discovery.selected, index]
    this.commit({ discovery: { ...this.state.discovery, selected } })
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
    this.commit({ models, directoryMode: false, restoreArmed: false, discovery: { running: false, outcome: undefined, selected: [], error: undefined } })
    this.notify()
  }

  // ── 保存 ──

  /** 保存前置（D3/D11）：自定义清单态至少一条模型；窄表单空判据与 saveBlocked 同源（MF-1-11）。返回 undefined = 通过。 */
  private precondition(): string | undefined {
    const wantsCustomList = this.state.customOnly || !this.state.directoryMode
    if (wantsCustomList && this.state.models.length === 0) return this.deps.t('models.saveBlockedEmpty')
    if (narrowEmptyBlockedForm(this.state, this.target)) return this.deps.t('provider.narrowEmptyBlocked')
    return undefined
  }

  /** 执行保存（结果分支写入 notice/error/blockedMessage；成功后回调父级刷新）。 */
  async save(): Promise<void> {
    if (this.state.saving) return
    const blocked = this.precondition()
    if (blocked !== undefined) {
      this.commit({ blockedMessage: blocked, error: undefined, notice: undefined })
      this.notify()
      return
    }
    this.commit({ saving: true, blockedMessage: undefined, error: undefined, notice: undefined })
    this.notify()

    const draft: ProviderDraft = {
      // 新建全表单：key 由显示名即时派生（AX11）；编辑与窄表单：key 固定——窄表单新建的
      // key = 所选目录 route（条目身份由目录决定，不经显示名派生）。
      key: this.target.isNew && !this.state.narrow ? deriveProviderKey(this.state.displayName.trim()) : this.target.key,
      isNew: this.target.isNew,
      narrow: this.state.narrow,
      displayName: this.state.displayName.trim(),
      baseURL: this.state.baseURL.trim(),
      api: this.state.api,
      apiKeyValue: this.state.apiKeyValue.trim(),
      compat: writableCompat(this.state.compat, this.state.api),
      models: this.state.models,
    }
    // saveProvider 的 rejection 契约是「不外抛」（MF-1-1：传输异常在写通道内收敛为 rejected
    // 结果值）——结果分支穷尽 saving 复位，调用方无需防御 catch。
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
      this.commit({ saving: false, notice: { kind: 'err', text: this.deps.t('save.refTakenRoute') } })
      this.notify()
      return
    }
    if (result.kind === 'refused-ref') {
      this.commit({ saving: false, notice: { kind: 'err', text: result.branch === 'a' ? this.deps.t('save.refTakenA') : this.deps.t('save.refTakenB') } })
      this.notify()
      return
    }
    if (result.kind === 'refused-existing') {
      // 他端已接入同 key（MF-1-12）：放弃整条 set，用户刷新后编辑既有条目。
      this.commit({ saving: false, notice: { kind: 'err', text: this.deps.t('save.refTakenElsewhere') } })
      this.notify()
      return
    }
    if (result.kind === 'rejected') {
      this.commit({ saving: false, error: result.message })
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
    // 密钥不回显（AX1：成功后清草稿；失败时用户在展开体重填）——受控输入（MF-1-6）下
    // 该清空经模型回流到 DOM，非受控输入无 DOM 写回通道的缺陷由此消除。
    this.commit({ saving: false, notice, undeclared: result.undeclared, apiKeyValue: '' })
    this.deps.onSaved()
    this.notify()
  }

  /** 重置错误/提示行（用户再次编辑前清屏）。 */
  dismissMessages(): void {
    if (this.state.error === undefined && this.state.notice === undefined) return
    this.commit({ error: undefined, notice: undefined })
    this.notify()
  }

  private refreshKeyPreview(): void {
    const name = this.state.displayName.trim()
    const key = this.target.isNew && !this.state.narrow && name !== '' ? deriveProviderKey(name) : this.target.key
    // 凭据引用预览：编辑既有条目显示其真实 apiKeyEnv（保存目标就是它——D7 写入目标同源）；
    // 仅新建（无既有条目）显示将派生的 ref。一律显示派生值会把既有条目的真实引用显示错。
    const existingRef = typeof this.diffBase?.apiKeyEnv === 'string' ? this.diffBase.apiKeyEnv : undefined
    this.commit({
      keyPreview: key !== '' ? key : undefined,
      refPreview: existingRef ?? (key !== '' ? credentialRefFor(key) : undefined),
    })
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
      {state.narrow ? (
        <>
          {/* 窄表单（内置目录型）：说明条 + 身份行（只读名 + 目录徽章 + 标识/凭据引用）+ 密钥输入。
              端点 / 协议 / compat 编辑面不渲染——由内置目录解析，写入面同样排除（settings-client narrow）。 */}
          <div className="ms-narrow-note">{t('provider.narrowNote')}</div>
          <div className="ms-identity">
            <span className="ms-row-name">{state.displayName !== '' ? state.displayName : state.catalogName ?? model.key}</span>
            <span className="ms-badge ms-badge-catalog">{t('providers.catalogBadge')}</span>
            {state.keyPreview !== undefined && (
              <span className="ms-field-hint">
                {t('provider.keyPreview', { key: state.keyPreview })}
                {state.refPreview !== undefined ? ` · ${t('provider.refPreview', { ref: state.refPreview })}` : ''}
              </span>
            )}
          </div>
          <label className="ms-field">
            <span className="ms-field-label">{t('provider.apiKey')}</span>
            <input
              className="ms-input"
              type="password"
              value={state.apiKeyValue}
              onChange={(event: { target: { value: string } }) => { model.setApiKeyValue(event.target.value) }}
            />
          </label>
        </>
      ) : (
        <>
          {/* 基本字段（文本输入一律受控 value=，MF-1-6：与 select 同纪律，保存清场经模型回流 DOM）。 */}
          <label className="ms-field">
            <span className="ms-field-label">{t('provider.displayName')}</span>
            <input
              className="ms-input"
              value={state.displayName}
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
              value={state.baseURL}
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
              value={state.apiKeyValue}
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
        </>
      )}

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
            {state.directoryError !== undefined && <div className="ms-note ms-note-err">{state.directoryError}</div>}
            {state.directoryModels.map((model) => (
              <div key={model.id} className={`ms-directory-row${focusModel === model.id ? ' ms-row-focus' : ''}`}>
                {/* 目录通道只返回 id/显示名/输入模态（无上下文与思考档位）——摘要不虚构其余字段。 */}
                <span className="ms-directory-name">{model.id}{model.name !== undefined && model.name !== '' ? `（${model.name}）` : ''}</span>
                <span className="ms-directory-id">{modalityWords(model.inputModalities, t)}</span>
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

      {/* 保存 / 取消（禁用与提示只读快照派生布尔 saveBlocked——窄表单空保存判据的唯一裁决，MF-1-11）。 */}
      <div className="ms-edit-actions">
        <button
          type="button"
          className="ms-button ms-button-primary"
          disabled={state.saving || state.saveBlocked}
          title={state.saveBlocked ? t('provider.narrowEmptyBlocked') : undefined}
          onClick={() => { void model.save() }}>
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
 * 目录条目的输入模态中文词（通道只返回 inputModalities；缺失/空 = 空串不显示——不虚构字段）。
 */
function modalityWords(modalities: ('text' | 'image')[] | undefined, t: Translate): string {
  if (modalities === undefined || modalities.length === 0) return ''
  return modalities.map((modality) => t(modality === 'text' ? 'input.text' : 'input.image')).join('+')
}

/**
 * 发现结果 → 模型草案：上下文缺失默认 1M、思考开启 + 全档位（发现通道不返回这些字段，
 * 这是产品默认、用户可改）；显示名缺失按 id 自动生成（prettifyId，nameEdited 未置位 =
 * 后续跟随 id 编辑联动）。
 */
function discoveredToDraft(model: DiscoveredModel): ModelDraft[] {
  if (model === undefined || typeof model.id !== 'string' || model.id === '') return []
  return [{
    id: model.id,
    name: model.name ?? prettifyId(model.id),
    contextWindow: typeof model.contextWindow === 'number' ? model.contextWindow : DEFAULT_CONTEXT_WINDOW,
    maxTokens: typeof model.maxTokens === 'number' ? model.maxTokens : undefined,
    input: model.inputModalities ?? ['text'],
    thinkingEnabled: true,
    levels: [...THINKING_LEVELS],
    preserve: false,
  }]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyRecord(value: unknown): boolean {
  return isRecord(value) && Object.keys(value).length > 0
}
