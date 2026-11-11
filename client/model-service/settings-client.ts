/**
 * client/model-service/settings-client.ts —— 宿主设置文档 llm-pi-ai 命名空间的读写封装
 * （dsh-model-service §3.3 D3 核心：物理 provider 与模型写宿主设置文档）。
 *
 * 定位（AX2）：用户可编辑拓扑的唯一权威是宿主设置文档的 llm-pi-ai 命名空间
 * （providers.<route>）；本模块是该权威的**唯一写入点**（浏览器半场侧），承担 D3 采用段的
 * 全部机制：provider key 保存前预检（拦宿主 prepareRoutes 的 DUPLICATE_ADAPTER 整批拒绝）、
 * revision 快照约定（expectedRevision 取自展开体打开时与保存成功回执，保存不重取）、
 * settings/conflict 的重读一次重试一次（非盲重试，对齐 client/persist.ts:177-205 先例形态）、
 * 读改写只发字段级 path ops（不整替换既有 profile——宿主「模型」分区写的字段不丢）、
 * 写入后回读校验（宿主 schema 未声明的静默接受字段标注「宿主不消费」，AS17）。
 *
 * 保存顺序（D3/D7 锚定，检查点 U1）：provider key 预检 → 凭据 ref 查重 → settings.mutate →
 * credentials.set。查重命中任一即拒绝，后两环节零执行——设置文档与凭据文件零写入。
 * 本模块编排顺序，凭据查重的判定由 credentials-client 提供（经依赖注入传入，避免模块环）。
 *
 * 宿主契约（逐条实测，见任务书检查点）：
 *   · mutate(ns, ops, expectedRevision?)（dsh-api-settings-controller/lib/index.js:414-433）：
 *     ops = {op:'set'|'unset', path:[...], value?}（dsh-settings/lib/index.js:488-496），路径
 *     寻址 ops「resolved against the section as stored rather than against whatever the caller
 *     last read」——冲突重试时同形 ops 落在最新存储视图上，双方改动按路径保留（AS11）。
 *   · providers.<route> 全路径 volatile（dsh-llm-pi-ai/lib/index.js:1047），可经 mutate 写。
 *   · 冲突分类 settings/conflict（details 含 expected/actual），拒绝分类 settings/rejected
 *     （同包 :478-496）；RemoteError 形状 {code, message, details, isDSHRemoteError}
 *     （dsh-api-gateway/lib/client.js:17-38）。
 *   · 先例同构：宿主「模型」分区自身也按「表单打开时的 revision 提交 + 保存回执刷新」工作
 *     （.tmp/dsh-client-ui-settings-models.client.js :1724-1744 createOnce / :2053-2059 applyOnce），
 *     D3 的 revision 约定与宿主自身行为一致。
 *
 * 风格：无 any、无 eslint-disable；不 import 任何 dsh-client 包（D3 纪律，宿主面用最小
 * 结构类型声明）。
 */
import { isSelfManagedRef, type PendingUnsetRegistration } from './credentials-client'
import { checkRouteConflict, deriveCredentialRef } from './provider-key'
import type { RouteEntry } from './route-evaluate'

/** 宿主 llm-pi-ai 命名空间 id = 其 profile 行 id（本机 cordis.patch.yml 实证：`- id: llm-pi-ai`）。 */
export const LLM_PI_AI_NS = 'llm-pi-ai'

/** settings.mutate 的路径寻址操作（宿主 dsh-settings 的 ops 形状）。 */
export interface SettingsOp {
  op: 'set' | 'unset'
  path: (string | number)[]
  value?: unknown
}

/** 宿主 settings 命名空间视图的最小同构（describe/mutate 的返回；只取本模块消费的字段）。 */
export interface SettingsNamespaceViewLike {
  ns: string
  /** redactSecrets 视图下的 volatile 段。 */
  value?: Record<string, unknown>
  /** 下一次写入的 revision 栅栏。 */
  revision?: number
}

/** 宿主 settings remote 的最小同构（ctx.remote.settings 的本模块消费面）。 */
export interface SettingsRemoteLike {
  describe(): Promise<{ writable: boolean; namespaces: SettingsNamespaceViewLike[] }>
  mutate(ns: string, ops: SettingsOp[], expectedRevision?: number): Promise<SettingsNamespaceViewLike>
}

/** listConfigurableProviders 的行形状（dsh-llm wire 契约，generated client 实读核对）。 */
export interface ConfigurableProviderRow {
  provider: string
  displayName: string
  settingsNs: string
  settingsPath: string[]
  /** false = 该 route 在 pi-ai 安装目录内（目录型 provider）；true = 手 declares 的路由。 */
  declared?: boolean
  error?: string
}

/** 宿主 llm remote 的最小同构（ctx.remote.llm 的本模块消费面；发现通道形状见 discovery.ts）。 */
export interface LlmRemoteLike {
  listProviders(): Promise<{ id: string; name: string }[]>
  listConfigurableProviders(): Promise<ConfigurableProviderRow[]>
  /** 模型发现（AS7：provider 命中目录零网络短路；请求/返回形状见 discovery.ts）。 */
  discoverModels(settingsNs: string, request: {
    provider?: string
    baseURL?: string
    api?: string
    apiKey?: string
  }): Promise<{ id: string; name?: string; contextWindow?: number; maxTokens?: number; inputModalities?: ('text' | 'image')[] }[]>
}

/** 凭据 remote 的最小同构（ctx.remote.credentials；详细契约在 credentials-client）。 */
export interface CredentialsRemoteLike {
  describe(refs: string[]): Promise<Record<string, { configured: boolean; source?: string; writable: boolean }>>
  set(ref: string, value: string): Promise<void>
  unset(ref: string): Promise<void>
}

/** 本模块用到的宿主面集合。 */
export interface ModelServiceHost {
  settings: SettingsRemoteLike
  llm: LlmRemoteLike
  credentials: CredentialsRemoteLike
  logger?: { error(message: string): void; warn(message: string): void }
}

/** 凭据 ref 查重的注入面（实现 = credentials-client.checkCredentialRefAvailable）。 */
export type CredentialRefGuard = (ref: string, ownRef: string | undefined) => Promise<RefCheckResult>

/** 凭据 ref 查重结果（credentials-client 的契约，此处只消费）。 */
export type RefCheckResult = { ok: true } | { ok: false; branch: 'a' | 'b' }

/**
 * 宿主 provider profile 的读取形态（loose record）：写入侧字段集按宿主 schema 逐字面
 * 收窄（见 PROFILE_DECLARED_FIELDS / MODEL_DECLARED_FIELDS），读取侧保持宽松——宿主升级
 * 加字段时读改写不丢（AX2 权威在宿主，插件不得因类型收窄删宿主字段）。
 */
export type HostProviderProfile = Record<string, unknown>

/** 一条模型条目的编辑草案（模型编辑表单 ↔ 宿主 models[] 条目的映射载体）。 */
export interface ModelDraft {
  id: string
  name: string
  contextWindow: number | undefined
  maxTokens: number | undefined
  input: ('text' | 'image')[]
  /**
   * 思考策略（D6 三档映射 + 无思考）：all = 全档位 / on-off = 开·关 / high-max = 高·最高 /
   * none = 非思考模型 / preserve = 既有条目的 reasoningEfforts 不匹配三档形态时的原样保留态
   * （读改写逐字写回，用户未编辑推理档位不产生 models diff——D3「只替换用户本次编辑的字段」
   * 的保真形态；不可被用户主动选择，点任一策略按钮即覆盖）。
   */
  thinkingStrategy: 'all' | 'on-off' | 'high-max' | 'none' | 'preserve'
  /** preserve 态携带的原始 reasoningEfforts 值（写回逐字透传；undefined = 既有条目省略该字段，写回同样省略）。 */
  reasoningEffortsRaw?: unknown
}

/** 供应商编辑草案（展开体表单的提交形态）。 */
export interface ProviderDraft {
  /** provider key（新建时由显示名派生；编辑既有 provider 时固定不可改）。 */
  key: string
  /** 是否新建（决定预检与 ops 形态：新建整条 set / 编辑字段级 diff）。 */
  isNew: boolean
  displayName: string
  baseURL: string
  api: string
  /** 用户新输入的密钥明文；空串 = 本次不写密钥（保留既有 apiKeyEnv）。 */
  apiKeyValue: string
  /** 本次编辑显式设置的 compat 字段（仅协议 gate 内可用项；键 = 宿主 schema 字段名）。 */
  compat: Record<string, boolean | string>
  models: ModelDraft[]
}

/**
 * 宿主 profile schema 声明的顶层字段（dsh-llm-pi-ai/lib/index.js:1013-1045 的 profile
 * object 22 字段，字面逐一抄录）——回读校验用：写入后回读仍存在的此清单之外的字段 =
 * 宿主 schema 未声明、被非严格解析静默接受（AS17），界面标注「宿主不消费」。
 */
export const PROFILE_DECLARED_FIELDS: readonly string[] = [
  'apiKeyEnv', 'displayName', 'api', 'baseURL', 'models', 'modelOverrides', 'compat',
  'defaultContextWindow', 'defaultMaxTokens', 'defaultInput', 'headers', 'reasoning',
  'thinkingBudgets', 'cacheRetention', 'transport', 'timeoutMs', 'websocketConnectTimeoutMs',
  'streamIdleTimeoutMs', 'maxRequestImageBytes', 'requestImagePixelBudget', 'requestImageMaxBytes',
  'retryPolicy',
]

/** 宿主 models[] 条目 schema 声明的字段（同文件 :1000-1006：id required + modelFields 六项）。 */
export const MODEL_DECLARED_FIELDS: readonly string[] = [
  'id', 'name', 'contextWindow', 'maxTokens', 'input', 'reasoningEfforts', 'compat',
]

/**
 * 本表单可编辑的顶层字段（读改写的 ops 只发这份清单内的 diff；apiKeyEnv / headers /
 * modelOverrides / retryPolicy 等不在其中——它们是宿主或其他编辑面的字段，本表单不触碰，
 * 读改写后原样保留，V1 步骤 10 的「不丢插件写入的字段」由此成立）。
 */
const EDITABLE_PROFILE_FIELDS: readonly string[] = ['displayName', 'api', 'baseURL', 'models', 'compat']

/** 宿主 llm-pi-ai 命名空间快照（展开体打开时读入；revision 随之持有）。 */
export interface LlmPiAiSnapshot {
  /** 命名空间是否被服务（false = 宿主没装 dsh-llm-pi-ai，视图给降级文案）。 */
  available: boolean
  /** 文档是否可写（宿主 describe 的 writable；false 时保存动作降级禁用）。 */
  writable: boolean
  /** 打开时的 revision 栅栏（D3：保存带它提交，不重取）。 */
  revision: number | undefined
  /** 存量 providers 段（route → profile，redactSecrets 视图）。 */
  providers: Record<string, HostProviderProfile>
}

/**
 * 读 llm-pi-ai 命名空间快照（打开展开体/视图激活时调用；写入后回读同用此函数）。
 */
export async function readLlmPiAi(settings: SettingsRemoteLike): Promise<LlmPiAiSnapshot> {
  const described = await settings.describe()
  const view = described.namespaces.find((candidate) => candidate.ns === LLM_PI_AI_NS)
  if (view === undefined) {
    return { available: false, writable: false, revision: undefined, providers: {} }
  }
  const section = view.value
  const providers: Record<string, HostProviderProfile> = {}
  if (section !== undefined && isRecord(section.providers)) {
    for (const [key, profile] of Object.entries(section.providers)) {
      if (isRecord(profile)) providers[key] = profile
    }
  }
  return {
    available: true,
    writable: described.writable === true,
    revision: typeof view.revision === 'number' ? view.revision : undefined,
    providers,
  }
}

/** listConfigurableProviders 全量目录（供应商视图的行来源）。 */
export async function listProviderDirectory(llm: LlmRemoteLike): Promise<ConfigurableProviderRow[]> {
  return llm.listConfigurableProviders()
}

/** listProviders 的已注册 route 集合（provider key 预检的查重源，D3 预检句）。 */
export async function listRegisteredRoutes(llm: LlmRemoteLike): Promise<string[]> {
  const providers = await llm.listProviders()
  return providers.map((provider) => provider.id)
}

/**
 * 草案 → 宿主 profile 值（新 provider 的整条写入值）。
 *
 * 字段集刻意收窄到本表单拥有的面（displayName/api/baseURL/models + 协议可用时的 compat）：
 * 不写宿主 schema 的其余字段（缺省 = 宿主按默认值/目录能力解析），不写 apiKeyEnv 之外的
 * 任何凭据形态字段。models 条目按宿主 modelProfile 形状逐字段写；思考策略按 D6 映射成
 * reasoningEfforts 字典或 false（AS15 已核对宿主校验规则）。
 */
export function profileFromDraft(draft: ProviderDraft): HostProviderProfile {
  const profile: HostProviderProfile = {
    displayName: draft.displayName,
    api: draft.api,
    baseURL: draft.baseURL,
  }
  // 目录默认态（草案空清单）不写 models：缺省 = 宿主按目录模型解析（保持目录默认语义的
  // 写入面）；既有 models[] 的清除由 profileDiffOps 的 unset op 承担（恢复目录默认动作）。
  if (draft.models.length > 0) profile.models = draft.models.map(modelFromDraft)
  if (Object.keys(draft.compat).length > 0) profile.compat = { ...draft.compat }
  return profile
}

/** 模型草案 → 宿主 models[] 条目（D6 思考策略映射表，宿主 THINKING_LEVELS 全集逐档）。 */
export function modelFromDraft(draft: ModelDraft): HostProviderProfile {
  const entry: HostProviderProfile = { id: draft.id, name: draft.name }
  if (draft.contextWindow !== undefined) entry.contextWindow = draft.contextWindow
  if (draft.maxTokens !== undefined) entry.maxTokens = draft.maxTokens
  entry.input = [...draft.input]
  if (draft.thinkingStrategy === 'none') {
    entry.reasoningEfforts = false
  } else if (draft.thinkingStrategy === 'preserve') {
    // 原样保留（D3 读改写保真）：非三档形态的既有值逐字写回（不改写宿主权威数据）；
    // undefined = 既有条目省略该字段，写回同样省略（宿主语义 = 沿用安装目录能力）。
    if (draft.reasoningEffortsRaw !== undefined) entry.reasoningEfforts = draft.reasoningEffortsRaw
  } else {
    // wire spelling 按 pi-ai 协议 spelling（level 名本身即 wire 词形；off 带值合法——
    // resolveModelReasoning「off with a value sends that value」）。
    entry.reasoningEfforts = thinkingEffortsOf(draft.thinkingStrategy)
  }
  return entry
}

/** D6 三档映射：全部档位 = THINKING_LEVELS 全集逐档；开·关 / 高·最高 = 声明子集，未声明档不写键。 */
export function thinkingEffortsOf(strategy: Exclude<ModelDraft['thinkingStrategy'], 'none'>): Record<string, string> {
  if (strategy === 'on-off') return { off: 'off', high: 'high' }
  if (strategy === 'high-max') return { off: 'off', high: 'high', max: 'xhigh' }
  return { off: 'off', minimal: 'minimal', low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' }
}

/**
 * 读改写的 ops（编辑既有 provider）：顶层字段级 diff——只对「本表单可编辑且值确实变了」的
 * 字段发 set op；draft 里删除的字段（如 compat 清空）发 unset op。apiKeyEnv 与清单外字段
 * 永不出现在 ops 里（宿主侧既有值原样保留）。
 */
export function profileDiffOps(existing: HostProviderProfile, draft: ProviderDraft, key: string): SettingsOp[] {
  const next = profileFromDraft(draft)
  const ops: SettingsOp[] = []
  for (const field of EDITABLE_PROFILE_FIELDS) {
    const before = existing[field]
    const after = next[field]
    if (after === undefined) {
      if (before !== undefined) ops.push({ op: 'unset', path: ['providers', key, field] })
      continue
    }
    if (!deepEqualJson(before, after)) ops.push({ op: 'set', path: ['providers', key, field], value: after })
  }
  return ops
}

/** 保存结果（UI 按.kind 分支渲染；refused 两态都不产生任何写入）。 */
export type SaveProviderResult =
  | { kind: 'saved'; profile: HostProviderProfile; revision: number | undefined; refConfigured: boolean; refMessage: string | undefined; undeclared: string[] }
  | { kind: 'refused-route'; message: string }
  | { kind: 'refused-ref'; branch: 'a' | 'b'; message: string }
  | { kind: 'rejected'; message: string }

/** 保存参数（revision 由调用方持有——展开体打开时/上次保存回执的快照，D3）。 */
export interface SaveProviderParams {
  draft: ProviderDraft
  /** 持有的 revision 栅栏（打开时快照；undefined = 无条件写——仅在快照缺失时发生）。 */
  revision: number | undefined
  /** 存量 profile（打开时快照里该 route 的值；新建时 undefined）。 */
  existing: HostProviderProfile | undefined
  /** 凭据 ref 查重判定（credentials-client 提供；顺序锚定在 settings.mutate 之前）。 */
  refGuard: CredentialRefGuard
}

/**
 * 保存一个供应商（编排 D3 保存顺序与冲突重试）：
 *   ① 新 key 与 listProviders 已注册 route 查重（拦截 DUPLICATE_ADAPTER 整批拒绝）；
 *   ② 要写密钥时凭据 ref 查重（拒绝 = 本函数整体返回，③④ 零执行）；
 *   ③ settings.mutate（带持有 revision；settings/conflict → 重读一次再发一次，第二次
 *      仍拒 = 四段式文案上报）；
 *   ④ credentials.set（仅当输入了密钥；失败不回滚 ③——供应商已在列表、徽章「未配置」、
 *      重填重试，D3「可见可救」）。
 */
export async function saveProvider(host: ModelServiceHost, params: SaveProviderParams): Promise<SaveProviderResult> {
  const { draft, revision, existing, refGuard } = params

  // ① provider key 预检：仅新建（编辑时 key 就是既有 route 本身，查重必然自命中）。
  if (draft.isNew) {
    const routes = await listRegisteredRoutes(host.llm)
    if (checkRouteConflict(draft.key, routes)) {
      return { kind: 'refused-route', message: `provider key「${draft.key}」与已注册 route 同名，请更换显示名后保存` }
    }
  }

  // ② 凭据 ref 查重（要写密钥时才查；查重拒绝 = 保存动作整体未发生，零写入）。
  // 写入目标（D7：编辑既有 provider 时保留其既有 apiKeyEnv——不重派生、不 unset 旧 ref，
  // 宿主「模型」分区创建的非 TAIJI_ ref 不被孤儿化）；仅既有条目缺失 apiKeyEnv 时
  // （新建 / 无凭据引用的存量条目）回落 key 派生。查重豁免与写入目标同源（ownRef 命中
  // 即重填重试通道，不算撞名）。
  const ownRef = typeof existing?.apiKeyEnv === 'string' ? existing.apiKeyEnv : undefined
  const credentialRef = ownRef ?? deriveCredentialRef(draft.key)
  const wantsKey = draft.apiKeyValue.trim().length > 0
  if (wantsKey) {
    const verdict = await refGuard(credentialRef, ownRef)
    if (!verdict.ok) {
      return { kind: 'refused-ref', branch: verdict.branch, message: `凭据引用 ${credentialRef} 已被占用，请更换显示名后保存` }
    }
  }

  // ③ settings.mutate：新 provider 整条 set / 既有 provider 字段级 diff；冲突重读一次重发一次。
  const ops = draft.isNew
    ? [{ op: 'set' as const, path: ['providers', draft.key], value: profileFromDraft(draft) }]
    : profileDiffOps(existing ?? {}, draft, draft.key)
  let view: SettingsNamespaceViewLike
  try {
    view = await host.settings.mutate(LLM_PI_AI_NS, ops, revision)
  } catch (error) {
    if (!isConflict(error)) return { kind: 'rejected', message: rejectedMessage(error) }
    // 非盲重试：重读最新 revision 后同形 ops 再发一次（path ops 按存储视图解析，AS11）。
    const fresh = await readLlmPiAi(host.settings)
    try {
      view = await host.settings.mutate(LLM_PI_AI_NS, ops, fresh.revision)
    } catch (secondError) {
      return { kind: 'rejected', message: settingsConflictFailureMessage(draft.key, secondError, fresh.revision) }
    }
  }

  // 写入后回读校验（AS17）：mutate 返回视图即写入后快照，schema 未声明字段标注「宿主不消费」。
  const writtenProfile = readWrittenProfile(view, draft.key)
  const undeclared = undeclaredFieldPaths(writtenProfile)

  // ④ credentials.set：写入目标与 ② 查重同源（编辑既有 provider 落其既有 apiKeyEnv）。
  // 设置成功凭据失败 → 徽章「未配置」+ 重填重试（不回滚 ③）。
  let refConfigured = true
  let refMessage: string | undefined
  if (wantsKey) {
    try {
      await host.credentials.set(credentialRef, draft.apiKeyValue.trim())
    } catch (error) {
      refConfigured = false
      refMessage = `供应商已保存，但密钥写入凭据文件失败（${messageOf(error)}）。请在该供应商的展开体重填密钥重试。`
    }
  }

  return {
    kind: 'saved',
    profile: writtenProfile,
    revision: typeof view.revision === 'number' ? view.revision : undefined,
    refConfigured,
    refMessage,
    undeclared,
  }
}

/** 删除结果。 */
export type DeleteProviderResult =
  | { kind: 'deleted'; pendingUnset: string | undefined; unsetMessage: string | undefined }
  | { kind: 'rejected'; message: string }

/** 删除参数。 */
export interface DeleteProviderParams {
  key: string
  /** 该 provider 的存量 profile（读 apiKeyEnv；undefined = 无凭据引用）。 */
  existing: HostProviderProfile | undefined
  /** 跨 profile 确认（非 TAIJI_ 前缀 ref 必须先经 UI 确认为 true 才会走到这里）。 */
  crossProfileConfirmed: boolean
  /** 登记待清理 ref 的通道（credentials-client.registerPendingUnset 的绑定；failed = 登记未落盘，须人工清理指引）。 */
  registerPendingUnset: (ref: string) => Promise<PendingUnsetRegistration>
}

/**
 * 删除供应商（D3 删除流程 + D7 删除侧）：
 *   ① 路由成员引用警告由 UI 在两段确认里完成（routeReferencesOf 是警告数据源——被引用时
 *      列出受影响路由，用户确认后继续删除，D3 原文；本函数不再硬拒绝）；
 *   ② settings.mutate unset providers.<key>（冲突同保存：重读一次重发一次）；
 *   ③ 凭据处置：TAIJI_ 前缀（自建）直接 unset，失败登记 pendingCredentialUnsets（登记
 *      本身失败 → unsetMessage 降级为宿主凭据界面人工清理指引，不静默）；
 *      非 TAIJI_ 前缀（宿主侧派生）在 crossProfileConfirmed=true 下同通道 unset（确认
 *      提示由 UI 在调用前完成，取消时 UI 不调本函数）。
 */
export async function deleteProvider(host: ModelServiceHost, params: DeleteProviderParams): Promise<DeleteProviderResult> {
  const ops: SettingsOp[] = [{ op: 'unset', path: ['providers', params.key] }]
  try {
    await host.settings.mutate(LLM_PI_AI_NS, ops, undefined)
  } catch (error) {
    if (!isConflict(error)) return { kind: 'rejected', message: rejectedMessage(error) }
    const fresh = await readLlmPiAi(host.settings)
    try {
      await host.settings.mutate(LLM_PI_AI_NS, ops, fresh.revision)
    } catch (secondError) {
      return { kind: 'rejected', message: settingsConflictFailureMessage(params.key, secondError, fresh.revision) }
    }
  }

  const ref = typeof params.existing?.apiKeyEnv === 'string' ? params.existing.apiKeyEnv : undefined
  if (ref === undefined || !params.crossProfileConfirmed && !isSelfManagedRef(ref)) {
    // 无凭据引用 / 未确认的宿主侧 ref：条目已删，凭据不动（后者实际不可达——UI 先确认）。
    return { kind: 'deleted', pendingUnset: undefined, unsetMessage: undefined }
  }
  try {
    await host.credentials.unset(ref)
    return { kind: 'deleted', pendingUnset: undefined, unsetMessage: undefined }
  } catch (error) {
    // 登记失败不外抛：凭据文件侧 unset 已失败、条目已删，此处再抛 = ref 静默失登（孤儿密钥
    // 无信号，AX9 要防的形态）。failed 时降级为人工清理指引，与登记成功文案同经 unsetMessage 呈现。
    const registered = await params.registerPendingUnset(ref)
    return {
      kind: 'deleted',
      pendingUnset: ref,
      unsetMessage: registered.ok
        ? `凭据清理失败（${messageOf(error)}），${ref} 已登记待清理清单，打开本分区时自动重试。`
        : `凭据清理失败（${messageOf(error)}），且待清理登记失败（${registered.detail}）——请在宿主凭据界面手工清理 ${ref}。`,
    }
  }
}

/**
 * 路由成员引用检查（D3 删除流程的警告源）：检索 routes[].members[].provider 命中 key 的
 * 路由并返回其名（UI 在删除两段确认里列出受影响路由，用户确认后继续删除）。
 * 数据源 = 插件 Config 的 routes 字段（调用方从 Config 快照读入传入——本模块不持 Config
 * 通道），纯函数可单测。
 */
export function routeReferencesOf(key: string, routes: RouteEntry[]): string[] {
  const names: string[] = []
  for (const route of routes) {
    if (route.members.some((member) => member.provider === key)) names.push(route.name)
  }
  return names
}

/** 回读校验：profile 顶层与 models[] 条目里宿主 schema 未声明的字段路径（「宿主不消费」标注）。 */
export function undeclaredFieldPaths(profile: HostProviderProfile): string[] {
  const paths: string[] = []
  for (const field of Object.keys(profile)) {
    if (!PROFILE_DECLARED_FIELDS.includes(field)) paths.push(field)
  }
  const models = profile.models
  if (Array.isArray(models)) {
    models.forEach((model, index) => {
      if (!isRecord(model)) return
      for (const field of Object.keys(model)) {
        if (!MODEL_DECLARED_FIELDS.includes(field)) paths.push(`models[${index}].${field}`)
      }
    })
  }
  return paths
}

// ── 内部工具 ────────────────────────────────────────────────────────────────

/** settings/conflict 的结构判定（对齐宿主 settingsConflictOf 的判据：code + expected/actual）。 */
function isConflict(error: unknown): boolean {
  return isErrorWithCode(error, 'settings/conflict')
}

function isErrorWithCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === code
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** settings/rejected 与凭据链路之外的失败：原样透传宿主消息（含恢复线索）。 */
function rejectedMessage(error: unknown): string {
  return `宿主拒绝写入模型服务设置（llm-pi-ai 命名空间）：${messageOf(error)}。请检查端点/协议/模型字段是否满足宿主校验后重试。`
}

/** 连续冲突的四段式文案（本包 + 命名空间与字段 + 事实 + 出路，对齐 persist.ts 口径）。 */
function settingsConflictFailureMessage(key: string, error: unknown, revision: number | undefined): string {
  return `供应商「${key}」未能写入宿主设置文档（llm-pi-ai 命名空间 providers.${key}）：`
    + `重读一次（revision=${String(revision)}）后重试仍被拒（${messageOf(error)}）。`
    + '可能另一个窗口正在编辑同一供应商；请关闭后重新打开展开体再保存。'
}

/** mutate 回执视图 → 写入后的 profile（读不到该 route 时回落空对象，标注逻辑照常工作）。 */
function readWrittenProfile(view: SettingsNamespaceViewLike, key: string): HostProviderProfile {
  const section = view.value
  const providers = section !== undefined && isRecord(section.providers) ? section.providers : {}
  const profile = providers[key]
  return isRecord(profile) ? profile : {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** JSON 形态的深比较（宿主存储是 JSON 值域；undefined 视为缺席）。 */
function deepEqualJson(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (left === undefined || right === undefined) return false
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => deepEqualJson(item, right[index]))
  }
  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left)
    const rightKeys = Object.keys(right)
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key) => key in right && deepEqualJson(left[key], right[key]))
  }
  return false
}
