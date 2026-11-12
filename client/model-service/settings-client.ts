/**
 * client/model-service/settings-client.ts —— 宿主设置文档 llm-pi-ai 命名空间的读写封装
 * （dsh-model-service §3.3 D3 核心：物理 provider 与模型写宿主设置文档）。
 *
 * 定位（AX2）：用户可编辑拓扑的唯一权威是宿主设置文档的 llm-pi-ai 命名空间
 * （providers.<route>）；本模块是该权威的**唯一写入点**（浏览器半场侧），承担 D3 采用段的
 * 全部机制：provider key 保存前预检（拦宿主 prepareRoutes 的 DUPLICATE_ADAPTER 整批拒绝）、
 * revision 快照约定（expectedRevision 取自展开体打开时与保存成功回执，保存不重取）、
 * settings/conflict 的重读一次重试一次（非盲重试，对齐 client/persist.ts:177-205 先例形态）、
 * 读改写只发字段级 path ops（不整替换既有 profile——宿主「模型」分区写的字段不丢；
 * models[] 条目级未建模字段经 ModelDraft.raw 并回，MF-1-5）；写入后回读校验（宿主 schema
 * 未声明的静默接受字段标注「宿主不消费」，AS17；回执与写入值逐 op 覆盖比对——回执是
 * schema 物化投影、多出的默认键不视为不符，写入值内的键缺失或被改写按 rejected 上报，
 * MF-1-14 / MF-2-1）。
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
 *   · typert 网关对全部 remote RPC 统一 Result 包装（dsh-api-gateway/lib/index.js：encodeRpcResult
 *     成功 resolve {ok:true,value}，rpcFailure 失败 resolve {ok:false,error:{code,message,details}}）
 *     ——业务失败不 reject，消费方按 ok 分支判定，throw/catch 判失败对 resolve 型失败永不命中。
 *   · 先例同构：宿主「模型」分区自身也按「表单打开时的 revision 提交 + 保存回执刷新」工作
 *     （宿主全局安装目录内 @deepseek-ai/dsh-client-ui-settings-models 包产物 client.js 的
 *     createOnce / applyOnce 两段；宿主升级随动——以其当时实现为准），D3 的 revision 约定
 *     与宿主自身行为一致（D3 evidence 有独立留档）。
 *
 * 风格：无 any、无 lint 禁用注释；不 import 任何 dsh-client 包（D3 纪律，宿主面用最小
 * 结构类型声明）。
 */
import { isSelfManagedRef, type PendingUnsetRegistration } from './credentials-client'
import { checkRouteConflict, deriveCredentialRef } from './provider-key'
import { unwrapRemote, type RemoteResult } from './remote-result'
import type { RouteEntry } from './route-evaluate'

// Result 包装与解包的权威定义在 remote-result.ts（独立文件防 credentials-client 反向引用成环），
// 此处 re-export：本模块的导入面（ModelServiceHost / unwrapRemote / RemoteResult）不变。
export { unwrapRemote, type RemoteResult }

/** 宿主 llm-pi-ai 命名空间 id = 其 profile 行 id（本机 cordis.patch.yml 实证：`- id: llm-pi-ai`）。 */
export const LLM_PI_AI_NS = 'llm-pi-ai'

/** settings.mutate 的路径寻址操作（宿主 dsh-settings 的 ops 形状）。 */
export interface SettingsOp {
  op: 'set' | 'unset'
  path: (string | number)[]
  value?: unknown
}

/**
 * 宿主 typert 网关的 remote RPC 统一返回包装与解包辅助：权威定义在 remote-result.ts，
 * 经上方 re-export 从本模块可用（RemoteResult / unwrapRemote）。
 */

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
  describe(): Promise<RemoteResult<{ writable: boolean; namespaces: SettingsNamespaceViewLike[] }>>
  mutate(ns: string, ops: SettingsOp[], expectedRevision?: number): Promise<RemoteResult<SettingsNamespaceViewLike>>
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
  listProviders(): Promise<RemoteResult<{ id: string; name: string }[]>>
  listConfigurableProviders(): Promise<RemoteResult<ConfigurableProviderRow[]>>
  /** 模型发现（AS7：provider 命中目录零网络短路；请求/返回形状见 discovery.ts）。 */
  discoverModels(settingsNs: string, request: {
    provider?: string
    baseURL?: string
    api?: string
    apiKey?: string
  }): Promise<RemoteResult<{ id: string; name?: string; contextWindow?: number; maxTokens?: number; inputModalities?: ('text' | 'image')[] }[]>>
}

/** 凭据 remote 的最小同构（ctx.remote.credentials；详细契约在 credentials-client）。 */
export interface CredentialsRemoteLike {
  describe(refs: string[]): Promise<RemoteResult<Record<string, { configured: boolean; source?: string; writable: boolean }>>>
  set(ref: string, value: string): Promise<RemoteResult<void>>
  unset(ref: string): Promise<RemoteResult<void>>
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

/**
 * 宿主 THINKING_LEVELS 词表（7 档，桌面 0.2.2 asar 内 dsh-llm-pi-ai/lib/index.js 实读）：
 * reasoningEfforts 字典的值（wire 拼写）必须落在此词表内，键名（用户可见档名）由本插件
 * 自由定义、但同名映射形态下键 = 值 = 档名，因此档位选择只在本词表内进行。
 */
export const THINKING_LEVELS: readonly string[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

/** 一条模型条目的编辑草案（模型编辑表单 ↔ 宿主 models[] 条目的映射载体）。 */
export interface ModelDraft {
  id: string
  name: string
  contextWindow: number | undefined
  maxTokens: number | undefined
  input: ('text' | 'image')[]
  /** 思考开关：true = 按 levels 逐档同名映射写 reasoningEfforts 字典；false = 写 false（非思考模型）。 */
  thinkingEnabled: boolean
  /** 已声明档位集合（元素 ∈ THINKING_LEVELS，自由组合；写盘 {level: level}，全集 = 七档逐档）。 */
  levels: string[]
  /**
   * preserve 态：既有 reasoningEfforts 非「false / 键值同名映射字典」的其他一切形态
   * （值≠键的字典、省略字段、未知结构）——原样保留、写回逐字透传，不静默改写宿主权威数据
   * （D3 读改写保真）；用户在 preserve 态勾选思考或点任一档位即转自由选集（preserve 翻 false）。
   */
  preserve: boolean
  /** preserve 态携带的原始 reasoningEfforts 值（写回逐字透传；undefined = 既有条目省略该字段，写回同样省略）。 */
  preserveRaw?: unknown
  /** 显示名已被用户手动编辑（草稿态标志，不入宿主写盘）：false 时显示名跟随 id 经 prettifyId 自动生成。 */
  nameEdited?: boolean
  /** 自定义档输入的草稿值（UI 态，不入宿主写盘；仅驱动行内校验提示的显隐）。 */
  levelInput?: string
  /**
   * 条目级读改写保真载体（MF-1-5）：原始条目中本草案未建模的字段（宿主声明的 compat 与
   * 全部未知字段）——modelFromDraft 写回时原样并回，全表单 diff 与行内编辑两条写路径都
   * 不再整段丢字段。仅当原始条目含未建模字段时由 modelToDraft 携带（新草案无 raw = 无可保留）。
   */
  raw?: Record<string, unknown>
}

/** 本草案建模的 models[] 条目字段（写回面）；清单外字段（compat 与未知字段）经 raw 并回。 */
const MODELED_MODEL_FIELDS: readonly string[] = ['id', 'name', 'contextWindow', 'maxTokens', 'input', 'reasoningEfforts']

/** 供应商编辑草案（展开体表单的提交形态）。 */
export interface ProviderDraft {
  /** provider key（新建时由显示名派生；编辑既有 provider 时固定不可改）。 */
  key: string
  /** 是否新建（决定预检与 ops 形态：新建整条 set / 编辑字段级 diff）。 */
  isNew: boolean
  /**
   * 窄表单（内置目录型的接入与编辑）：API 端点、协议、显示名与 compat 由内置目录解析，
   * 四者均不进写入面（新建整条 set 不写这些字段；编辑 diff 不对它们发 op，宿主侧既有值
   * 原样保留）。窄表单的 key = 目录 route 本身，不做显示名派生。
   */
  narrow: boolean
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

/**
 * 窄表单（内置目录型）的 diff 字段集：只 models。displayName/api/baseURL 由目录解析
 * （跳过 diff，宿主侧既有值原样保留）；compat 编辑面未在窄表单渲染、草案不携带用户编辑，
 * 跳过 diff 防止按非本次编辑的草稿值（协议 gate 过滤后的存量底）误清宿主既有 compat。
 */
const NARROW_EDITABLE_PROFILE_FIELDS: readonly string[] = ['models']

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
  const described = unwrapRemote(await settings.describe())
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
  return unwrapRemote(await llm.listConfigurableProviders())
}

/** listProviders 的已注册 route 集合（provider key 预检的查重源，D3 预检句）。 */
export async function listRegisteredRoutes(llm: LlmRemoteLike): Promise<string[]> {
  const providers = unwrapRemote(await llm.listProviders())
  return providers.map((provider) => provider.id)
}

/**
 * 草案 → 宿主 profile 值（新 provider 的整条写入值）。
 *
 * 全表单：字段集刻意收窄到本表单拥有的面（displayName/api/baseURL/models + 协议可用时的
 * compat）；窄表单（内置目录型）：displayName/api/baseURL 不写（端点、协议、显示名由内置
 * 目录解析，缺省 = 宿主按目录解析）。两者均不写宿主 schema 的其余字段、不写 apiKeyEnv 之外
 * 的任何凭据形态字段。apiKeyEnv 按 D7 只存 ref 名——由 saveProvider 在新建带密钥保存时传入
 * 派生 ref（不传 = 不写，编辑流的字段级 diff 永不触碰它）。models 条目按宿主 modelProfile
 * 形状逐字段写；思考档位按已声明档位集合映射成 reasoningEfforts 字典或 false（AS15 已核对
 * 宿主校验规则）。
 */
export function profileFromDraft(draft: ProviderDraft, apiKeyEnv?: string): HostProviderProfile {
  const profile: HostProviderProfile = {}
  if (!draft.narrow) {
    profile.displayName = draft.displayName
    profile.api = draft.api
    profile.baseURL = draft.baseURL
  }
  if (apiKeyEnv !== undefined) profile.apiKeyEnv = apiKeyEnv
  // 目录默认态（草案空清单）不写 models：缺省 = 宿主按目录模型解析（保持目录默认语义的
  // 写入面）；既有 models[] 的清除由 profileDiffOps 的 unset op 承担（恢复目录默认动作）。
  if (draft.models.length > 0) profile.models = draft.models.map(modelFromDraft)
  if (Object.keys(draft.compat).length > 0) profile.compat = { ...draft.compat }
  return profile
}

/** 模型草案 → 宿主 models[] 条目（思考档位按已声明档位集合映射，宿主 THINKING_LEVELS 词表）。 */
export function modelFromDraft(draft: ModelDraft): HostProviderProfile {
  const entry: HostProviderProfile = { id: draft.id, name: draft.name }
  if (draft.contextWindow !== undefined) entry.contextWindow = draft.contextWindow
  if (draft.maxTokens !== undefined) entry.maxTokens = draft.maxTokens
  entry.input = [...draft.input]
  if (draft.preserve) {
    // 原样保留（D3 读改写保真）：preserve 态的既有值逐字写回（不改写宿主权威数据）；
    // undefined = 既有条目省略该字段，写回同样省略（宿主语义 = 沿用安装目录能力）。
    if (draft.preserveRaw !== undefined) entry.reasoningEfforts = draft.preserveRaw
  } else if (!draft.thinkingEnabled) {
    entry.reasoningEfforts = false
  } else {
    // 已声明档位集合逐档同名映射（键 = 值 = 档名；off 带值合法——resolveModelReasoning
    // 「off with a value sends that value」；全集七档即历史「全部档位」的写盘形态）。
    entry.reasoningEfforts = levelsToEfforts(draft.levels)
  }
  // 条目级读改写保真（MF-1-5）：宿主声明但本草案未建模的字段（compat）与全部未知字段从
  // 原始条目原样并回——全表单保存的整段 diff 与行内编辑的原位替换都不再静默丢字段。
  if (draft.raw !== undefined) {
    for (const [field, value] of Object.entries(draft.raw)) {
      if (MODELED_MODEL_FIELDS.includes(field)) continue
      entry[field] = value
    }
  }
  return entry
}

/**
 * 已声明档位集合 → reasoningEfforts 字典（逐档同名映射）：键 = 用户可见档名，值 = wire 拼写
 * （档名本身即 wire 词形，均 ∈ THINKING_LEVELS 词表——自由键名会写出宿主不接受的 wire 值）。
 */
export function levelsToEfforts(levels: readonly string[]): Record<string, string> {
  return Object.fromEntries(levels.map((level) => [level, level]))
}

/**
 * 模型 id → 显示名（自动生成的唯一来源）：按 `-` 切割换空格；全部段均不含大写字母时每段
 * 首字母大写化（`my-model-v1` → `My Model V1`）；任一段含大写则整体只换连字符、保持原
 * 大小写（`GLM-5.3` → `GLM 5.3` 这类大小写即词形的 id 不被改写）。
 */
export function prettifyId(id: string): string {
  const segments = id.split('-')
  if (segments.some((segment) => /[A-Z]/.test(segment))) return segments.join(' ')
  return segments
    .map((segment) => (segment === '' ? '' : segment.charAt(0).toUpperCase() + segment.slice(1)))
    .join(' ')
}

/**
 * 存量 models[] 条目 → 编辑草案。未建模字段（compat 与未知字段）经 raw 携带原始条目，
 * modelFromDraft 写回时并回（MF-1-5 条目级读改写保真——:329 注释承诺的保留机制由此成立）。
 *
 * reasoningEfforts 归档（D3 读改写保真）：显式 false → 非思考（写回 false 与既有值一致）；
 * 键值同名且可安全重写的字典 → 已声明档位集合（自由组合进 badge 交互，写回同名映射逐字
 * 一致）；其他一切形态（值≠键的字典、省略字段、未知结构，以及同名但宿主写入门必拒的
 * 形态——空字典与仅 off）→ preserve 原样保留态（草案携带原始值，写回逐字透传，不静默
 * 改写宿主权威数据；preserve 往返零 diff 即零写入，宿主 strict 校验不会被触发）。
 */
export function modelToDraft(model: Record<string, unknown>): ModelDraft {
  const efforts = model.reasoningEfforts
  let thinkingEnabled = false
  let levels: string[] = []
  let preserve = false
  let preserveRaw: unknown
  if (efforts === false) {
    thinkingEnabled = false // 写回 false，与既有值一致（无损）
  } else if (isRecord(efforts) && isRewritableEfforts(efforts)) {
    thinkingEnabled = true
    levels = Object.keys(efforts)
  } else {
    // 非 false、非可安全重写的同名映射字典（值≠键、非词表键、空字典、仅 off——后两者是
    // 宿主写入门必拒形态）、省略该字段（宿主语义 = 沿用目录能力）或其他未知形态：
    // 原样保留，写回逐字透传。
    preserve = true
    preserveRaw = efforts
  }
  // 未建模字段存在时携带原始条目（写回并回的保真载体）。
  const hasUnmodeled = Object.keys(model).some((field) => !MODELED_MODEL_FIELDS.includes(field))
  return {
    id: typeof model.id === 'string' ? model.id : '',
    name: typeof model.name === 'string' ? model.name : '',
    contextWindow: typeof model.contextWindow === 'number' ? model.contextWindow : undefined,
    maxTokens: typeof model.maxTokens === 'number' ? model.maxTokens : undefined,
    input: Array.isArray(model.input) ? model.input.filter((item): item is 'text' | 'image' => item === 'text' || item === 'image') : [],
    thinkingEnabled,
    levels,
    preserve,
    ...(preserveRaw !== undefined ? { preserveRaw } : {}),
    ...(hasUnmodeled ? { raw: model } : {}),
  }
}

/**
 * 同名映射字典能否安全归档为自由选集：键值完全同名、键全部 ∈ THINKING_LEVELS 且含 off
 * 以外的档（宿主 resolveModelReasoning：空字典与「off 之外无档」都是 strict 写入门必拒
 * 形态；非词表键同名映射写回会造出宿主不接受的 wire 值——都归 preserve 逐字透传）。
 */
function isRewritableEfforts(efforts: Record<string, unknown>): boolean {
  const keys = Object.keys(efforts)
  return isSameNameEfforts(efforts)
    && keys.every((key) => THINKING_LEVELS.includes(key))
    && keys.some((key) => key !== 'off')
}

/** reasoningEfforts 字典的「键值完全同名」判定（归档为已声明档位集合的判据）。 */
function isSameNameEfforts(efforts: Record<string, unknown>): boolean {
  return Object.entries(efforts).every(([key, value]) => value === key)
}

/**
 * 读改写的 ops（编辑既有 provider）：顶层字段级 diff——只对「本表单可编辑且值确实变了」的
 * 字段发 set op；draft 里删除的字段（如 compat 清空）发 unset op。apiKeyEnv 与清单外字段
 * 永不出现在 ops 里（宿主侧既有值原样保留）。窄表单只 diff models（NARROW_EDITABLE_PROFILE_FIELDS）。
 */
export function profileDiffOps(existing: HostProviderProfile, draft: ProviderDraft, key: string): SettingsOp[] {
  const next = profileFromDraft(draft)
  const fields = draft.narrow ? NARROW_EDITABLE_PROFILE_FIELDS : EDITABLE_PROFILE_FIELDS
  const ops: SettingsOp[] = []
  for (const field of fields) {
    const before = existing[field]
    const after = next[field]
    if (after === undefined) {
      // 存量为物化空形态（[] / {}）不发 unset（MF-3-1）：existing 是 describe 的物化投影，
      // 文档侧缺席的 models/compat 在其中被补为空容器、与真实存储的显式空形态不可区分——
      // 对存储本就缺席的字段 unset 是幂等空操作，diff 侧不产生即消除歧义源头；发出它则
      // 回执物化又补回同空形态，verifyWrittenOps 的「回执仍等于存量原值」判据恒命中，
      // 真实宿主恒 rejected 假失败（窄表单密钥重填被短路在 credentials.set 之前）。
      // 存量为非空容器或非容器原值照常发 unset（用户真实清除动作）。
      if (before !== undefined && !isEmptyContainer(before)) ops.push({ op: 'unset', path: ['providers', key, field] })
      continue
    }
    if (!deepEqualJson(before, after)) ops.push({ op: 'set', path: ['providers', key, field], value: after })
  }
  return ops
}

/** 保存结果（UI 按.kind 分支渲染；refused 三态都不产生任何写入）。 */
export type SaveProviderResult =
  | { kind: 'saved'; profile: HostProviderProfile; revision: number | undefined; refConfigured: boolean; refMessage: string | undefined; undeclared: string[] }
  | { kind: 'refused-route'; message: string }
  | { kind: 'refused-ref'; branch: 'a' | 'b'; message: string }
  /** 新建撞他端接入（MF-1-12）：本端快照之后其他客户端接入了同 key 条目——放弃整条 set 不覆盖。 */
  | { kind: 'refused-existing'; message: string }
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

  // ① provider key 预检：仅新建的全表单（编辑时 key 就是既有 route 本身，查重必然自命中；
  // 窄表单新建的 key = 内置目录 route——该 route 已由 pi-ai 目录注册，预检必然撞名，而窄表单
  // 的意图恰是为既有目录 route 写配置而非注册新 route，跳过预检）。
  if (draft.isNew && !draft.narrow) {
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
  // 宿主网关对业务失败 resolve {ok:false}（不 reject），失败判定按 Result 的 ok/code 走。
  // 新建整条 set 带 apiKeyEnv（D7 只存 ref 名）：本次保存带密钥才写——文档条目引用派生 ref，
  // 宿主解析才有凭据可用（缺失时徽章「未配置」+ 重填重试，D3 可见可救）。
  // 跨端覆盖防护（MF-1-12）：他端在本端快照之后接入同 key 时，整条 set 会覆盖他端字段
  // （窄表单值不含 apiKeyEnv/modelOverrides/compat）。持有 revision 栅栏时他端接入必然推进
  // revision → 首发即 settings/conflict → 冲突分支重读后按下方检查放弃；栅栏缺失（无条件
  // 写、不会触发冲突）时提交前补一次重读检查。
  if (draft.isNew && revision === undefined) {
    const current = await readLlmPiAi(host.settings)
    if (current.providers[draft.key] !== undefined) {
      return { kind: 'refused-existing', message: providerTakenMessage(draft.key) }
    }
  }
  const ops = draft.isNew
    ? [{ op: 'set' as const, path: ['providers', draft.key], value: profileFromDraft(draft, wantsKey ? credentialRef : undefined) }]
    : profileDiffOps(existing ?? {}, draft, draft.key)
  let view: SettingsNamespaceViewLike
  const first = await host.settings.mutate(LLM_PI_AI_NS, ops, revision)
  if (!first.ok) {
    if (first.error.code !== 'settings/conflict') {
      return { kind: 'rejected', message: rejectedMessage(first.error.message) }
    }
    // 非盲重试：重读最新 revision 后同形 ops 再发一次（path ops 按存储视图解析，AS11）。
    const fresh = await readLlmPiAi(host.settings)
    // 新建撞他端接入（MF-1-12）：重读显示 key 已存在 → 放弃整条 set，不覆盖他端条目。
    if (draft.isNew && fresh.providers[draft.key] !== undefined) {
      return { kind: 'refused-existing', message: providerTakenMessage(draft.key) }
    }
    const second = await host.settings.mutate(LLM_PI_AI_NS, ops, fresh.revision)
    if (!second.ok) {
      return { kind: 'rejected', message: settingsConflictFailureMessage(draft.key, second.error.message, fresh.revision) }
    }
    view = second.value
  } else {
    view = first.value
  }

  // 写入后回读校验（AS17）：mutate 返回视图即写入后快照，schema 未声明字段标注「宿主不消费」。
  const writtenProfile = readWrittenProfile(view, draft.key)
  const undeclared = undeclaredFieldPaths(writtenProfile)
  // 写入产物实质校验（MF-1-14 / MF-2-1）：回执与本次 ops 目标值逐 op 覆盖比对——写入值
  // 内的键缺失或被改写（宿主静默丢弃或改写字段）按 rejected 上报而非静默 saved，UI 不得
  // 在产物缺失时呈现成功；回执多出的物化默认键忽略（existing 供 unset op 的原值比对）。
  const missedFields = verifyWrittenOps(ops, writtenProfile, existing)
  if (missedFields.length > 0) {
    return { kind: 'rejected', message: writeMismatchMessage(missedFields) }
  }

  // ④ credentials.set：写入目标与 ② 查重同源（编辑既有 provider 落其既有 apiKeyEnv）。
  // 设置成功凭据失败 → 徽章「未配置」+ 重填重试（不回滚 ③）。业务失败是 resolve 型
  // （{ok:false}），reject 只来自传输层异常，两支都按「已保存、密钥未配置」降级。
  let refConfigured = true
  let refMessage: string | undefined
  if (wantsKey) {
    try {
      const stored = await host.credentials.set(credentialRef, draft.apiKeyValue.trim())
      if (!stored.ok) {
        refConfigured = false
        refMessage = `供应商已保存，但密钥写入凭据文件失败（${stored.error.message}）。请在该供应商的展开体重填密钥重试。`
      }
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
 *   ② settings.mutate unset providers.<key>（无条件写：revision 传 undefined，宿主契约
 *      「undefined writes unconditionally」不触发 settings/conflict；下方 conflict 分支是
 *      防御性保留，按宿主契约不可达——D3 的 revision 快照约定只锚定保存提交，删除的
 *      path unset 按存储视图解析、他写者改动按路径保留，不违反设计）；
 *   ③ 凭据处置：TAIJI_ 前缀（自建）直接 unset，失败登记 pendingCredentialUnsets（登记
 *      本身失败 → unsetMessage 降级为宿主凭据界面人工清理指引，不静默）；
 *      非 TAIJI_ 前缀（宿主侧派生）在 crossProfileConfirmed=true 下同通道 unset（确认
 *      提示由 UI 在调用前完成，取消时 UI 不调本函数）。
 */
export async function deleteProvider(host: ModelServiceHost, params: DeleteProviderParams): Promise<DeleteProviderResult> {
  const ops: SettingsOp[] = [{ op: 'unset', path: ['providers', params.key] }]
  let view: SettingsNamespaceViewLike
  const first = await host.settings.mutate(LLM_PI_AI_NS, ops, undefined)
  if (!first.ok) {
    if (first.error.code !== 'settings/conflict') {
      return { kind: 'rejected', message: rejectedMessage(first.error.message) }
    }
    const fresh = await readLlmPiAi(host.settings)
    const second = await host.settings.mutate(LLM_PI_AI_NS, ops, fresh.revision)
    if (!second.ok) {
      return { kind: 'rejected', message: settingsConflictFailureMessage(params.key, second.error.message, fresh.revision) }
    }
    view = second.value
  } else {
    view = first.value
  }
  // 删除产物实质校验（MF-2-5，saveProvider/writeProviderModels 同款口径）：mutate 回执即
  // 写入后快照——整条 unset 期望回执里该 key 缺席；条目仍在 = 宿主静默吞掉 unset，按
  // rejected 上报而非静默 deleted（否则 UI 报已删而条目下次 load 复活，删除回弹无错误归因）。
  const missedFields = verifyWrittenOps(ops, readWrittenProfile(view, params.key), params.existing)
  if (missedFields.length > 0) {
    return { kind: 'rejected', message: deleteMismatchMessage(missedFields) }
  }

  const ref = typeof params.existing?.apiKeyEnv === 'string' ? params.existing.apiKeyEnv : undefined
  if (ref === undefined || !params.crossProfileConfirmed && !isSelfManagedRef(ref)) {
    // 无凭据引用 / 未确认的宿主侧 ref：条目已删，凭据不动（后者实际不可达——UI 先确认）。
    return { kind: 'deleted', pendingUnset: undefined, unsetMessage: undefined }
  }
  // unset 业务失败是 resolve 型（{ok:false}），reject 只来自传输层异常；两支同走登记降级。
  let unsetFailure: string | undefined
  try {
    const removed = await host.credentials.unset(ref)
    if (!removed.ok) unsetFailure = removed.error.message
  } catch (error) {
    unsetFailure = messageOf(error)
  }
  if (unsetFailure === undefined) {
    return { kind: 'deleted', pendingUnset: undefined, unsetMessage: undefined }
  }
  // 登记失败不外抛：凭据文件侧 unset 已失败、条目已删，此处再抛 = ref 静默失登（孤儿密钥
  // 无信号，AX9 要防的形态）。failed 时降级为人工清理指引，与登记成功文案同经 unsetMessage 呈现。
  const registered = await params.registerPendingUnset(ref)
  return {
    kind: 'deleted',
    pendingUnset: ref,
    unsetMessage: registered.ok
      ? `凭据清理失败（${unsetFailure}），${ref} 已登记待清理清单，打开本分区时自动重试。`
      : `凭据清理失败（${unsetFailure}），且待清理登记失败（${registered.detail}）——请在宿主凭据界面手工清理 ${ref}。`,
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

// ── 模型清单操作台的写通道（清单交互定稿 C3）────────────────────────────────

/** 模型清单写入结果（UI 按 kind 分支渲染；rejected 不产生任何写入——ops 未发或被拒）。 */
export type WriteModelsResult =
  | { kind: 'saved'; profile: HostProviderProfile; revision: number | undefined; undeclared: string[] }
  | { kind: 'rejected'; message: string }

/**
 * 整段写入一个供应商的模型清单（模型清单视图行内编辑/删除/复制/自定义此清单的唯一写通道）：
 * describe 取 revision → mutate 整段 set providers.<key>.models → mutate 回执即写入后快照，
 * 回读校验未声明字段（AS17 同款）。空清单 = unset models 字段（目录默认语义恢复，与供应商
 * 表单「保存空清单即保持目录默认」同口径——整段 set 空数组会在文档里留下显式空清单，与
 * 「缺席 = 按目录解析」的宿主语义相悖）。settings/conflict 重读一次重发一次，第二次仍拒 =
 * 四段式文案上报；非冲突拒绝原样透传宿主消息。
 */
export async function writeProviderModels(remote: ModelServiceHost, key: string, models: HostProviderProfile[]): Promise<WriteModelsResult> {
  const ops: SettingsOp[] = models.length > 0
    ? [{ op: 'set', path: ['providers', key, 'models'], value: models }]
    : [{ op: 'unset', path: ['providers', key, 'models'] }]
  let view: SettingsNamespaceViewLike
  // 存量 profile（写入前快照，物化视图）：空清单 unset 的产物校验用它比对「字段仍是
  // 原值」——物化回执下缺席字段被补为默认值，只有仍等于原值才是「未执行 unset」。
  let existingProfile: HostProviderProfile | undefined
  try {
    const snapshot = await readLlmPiAi(remote.settings)
    existingProfile = snapshot.providers[key]
    const first = await remote.settings.mutate(LLM_PI_AI_NS, ops, snapshot.revision)
    if (!first.ok) {
      if (first.error.code !== 'settings/conflict') {
        return { kind: 'rejected', message: rejectedMessage(first.error.message) }
      }
      // 非盲重试：重读最新 revision 后同形 ops 再发一次（path ops 按存储视图解析，AS11）。
      const fresh = await readLlmPiAi(remote.settings)
      existingProfile = fresh.providers[key]
      const second = await remote.settings.mutate(LLM_PI_AI_NS, ops, fresh.revision)
      if (!second.ok) {
        return { kind: 'rejected', message: modelsConflictFailureMessage(key, second.error.message, fresh.revision) }
      }
      view = second.value
    } else {
      view = first.value
    }
  } catch (error) {
    return { kind: 'rejected', message: `模型清单写入失败：${messageOf(error)}。请确认宿主设置服务可用后重试。` }
  }
  const writtenProfile = readWrittenProfile(view, key)
  // 写入产物实质校验（MF-1-14 / MF-2-1，saveProvider 同款）：回执 models 与写入值覆盖
  // 比对——写入值内的条目/字段缺失或被改写 = 宿主静默丢弃或改写，按 rejected 上报而非
  // 静默 saved；回执物化补齐的默认键（条目 compat 嵌套键等）忽略。
  const missedFields = verifyWrittenOps(ops, writtenProfile, existingProfile)
  if (missedFields.length > 0) {
    return { kind: 'rejected', message: writeMismatchMessage(missedFields) }
  }
  return {
    kind: 'saved',
    profile: writtenProfile,
    revision: typeof view.revision === 'number' ? view.revision : undefined,
    undeclared: undeclaredFieldPaths(writtenProfile),
  }
}

/** 模型清单连续冲突的四段式文案（本包 + 命名空间与字段 + 事实 + 出路，settingsConflictFailureMessage 同构）。 */
function modelsConflictFailureMessage(key: string, message: string, revision: number | undefined): string {
  return `模型清单未能写入宿主设置文档（llm-pi-ai 命名空间 providers.${key}.models）：`
    + `重读一次（revision=${String(revision)}）后重试仍被拒（${message}）。`
    + '可能另一个窗口正在编辑同一供应商的模型清单；请重试一次，仍失败则重新打开本分区再操作。'
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

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** settings/rejected 与凭据链路之外的失败：原样透传宿主消息（含恢复线索）。 */
function rejectedMessage(message: string): string {
  return `宿主拒绝写入模型服务设置（llm-pi-ai 命名空间）：${message}。请检查端点/协议/模型字段是否满足宿主校验后重试。`
}

/** 新建撞他端接入的拒绝文案（MF-1-12：放弃整条 set，不覆盖他端条目）。 */
function providerTakenMessage(key: string): string {
  return `供应商「${key}」已在其他窗口接入；为避免覆盖，本次未写入，请重新打开本分区后编辑该条目。`
}

/**
 * 写入产物实质校验（MF-1-14；MF-2-1 修正比对语义）：mutate 回执是写入后快照——逐 op
 * 比对回执与本次目标值。宿主回执不是逐字回显：settings.describe().find(ns) 的视图是
 * schema 物化投影，profile schema 的 .default(...) 字段在回执里被补齐（宿主实测 5 键
 * 写入物化为 14 键——补 models:[] / compat 嵌套默认键等），逐字整体相等在真实宿主恒
 * false、把实际成功的写入误报成 rejected 假失败。比对语义因此取覆盖判定「写入值 ⊆
 * 回执」（coversWritten）：写入值的每个键在回执中逐字段相等即通过，回执多出的物化
 * 默认键忽略；写入值内的键缺失或被改写仍按 rejected 上报（MF-1-14 的检测力不降）。
 * unset op 的字段判定：物化投影会把文档侧缺席补成默认值，故「字段在回执在场」不再
 * 直接判不符——在场且仍等于存量原值（existing 取自 describe 的物化视图，两侧同为
 * 物化形态、可比）才判「宿主未执行 unset」；值已变为非原值 = unset 落地后的物化默认。
 * 存量原值为物化空形态（[] / {}）的例外（MF-3-1）：unset 对它无实质产物，不判不符
 *（否则真实宿主的存量缺席字段恒假失败）；见分支内注释。
 * 返回不符项清单（整条不符标注 key），空数组 = 产物与写入值一致。
 */
function verifyWrittenOps(ops: SettingsOp[], written: HostProviderProfile, existing: HostProviderProfile | undefined): string[] {
  const missed: string[] = []
  for (const op of ops) {
    if (op.path.length <= 2) {
      if (op.op === 'set' && op.value !== undefined && !coversWritten(written, op.value)) missed.push(`${String(op.path[1])}（整条）`)
      // 整条 unset（deleteProvider 的 providers.<key>）产物判据：回执里该 key 缺席
      //（readWrittenProfile 读不到回落空对象；物化投影只对在场 profile 补默认键，缺席
      // 不会凭空补出）——非空 = 宿主静默吞掉 unset，条目实际未删（MF-2-5）。
      else if (op.op === 'unset' && Object.keys(written).length > 0) missed.push(`${String(op.path[1])}（整条未删除）`)
      continue
    }
    const field = op.path[2]
    if (typeof field !== 'string') continue
    if (op.op === 'set') {
      if (!coversWritten(written[field], op.value)) missed.push(field)
    } else {
      const after = written[field]
      const before = existing?.[field]
      // 未执行 unset 的强信号：回执字段仍等于存量原值（字段缺席或已变为默认物化值 = 已执行）。
      // 存量原值为物化空形态（[] / {}）时不判（MF-3-1）：该形态下 unset 无实质产物——目标态
      // 「缺席」已被物化投影折叠为同空形态，恒判不符会把幂等空操作误报成 rejected 假失败
      //（writeProviderModels 的空清单 unset 路径无法从 diff 源头消除，由本层放行）；存量原值
      // 为非空容器或非容器原值时仍逐字比对——宿主真吞掉 unset（回执仍含原值）照常上报。
      if (after !== undefined && before !== undefined && !isEmptyContainer(before) && deepEqualJson(after, before)) missed.push(field)
    }
  }
  return missed
}

/**
 * 覆盖判定（MF-2-1）：expected 的每个键在 actual 中递归相等即通过；actual 多出的键
 * （宿主 schema 物化补齐的默认键）忽略。数组要求同长逐项——宿主物化只补条目内字段、
 * 不增删重排条目，逐项覆盖天然覆盖「按条目 id 锚定」的建模字段比对，条目内 raw 并回
 * 的未知字段同样在覆盖面内（宿主静默丢弃它们时照常上报）。
 */
function coversWritten(actual: unknown, expected: unknown): boolean {
  if (actual === expected) return true
  if (expected === undefined) return false
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false
    return expected.every((item, index) => coversWritten(actual[index], item))
  }
  if (isRecord(expected)) {
    if (!isRecord(actual)) return false
    return Object.entries(expected).every(([key, value]) => coversWritten(actual[key], value))
  }
  return false
}

/** 回执与写入值不符的上报文案（MF-1-14）。 */
function writeMismatchMessage(missed: string[]): string {
  return `写入已提交，但宿主回执与写入值不符（${missed.join('、')}）——内容可能被宿主静默丢弃或改写；请重试一次，仍失败请检查宿主模型适配器版本。`
}

/** 删除回执与预期不符的上报文案（MF-2-5，writeMismatchMessage 的整条 unset 同构）。 */
function deleteMismatchMessage(missed: string[]): string {
  return `删除已提交，但宿主回执仍含该条目（llm-pi-ai 命名空间 providers 段 ${missed.join('、')}）——删除可能被宿主静默忽略，条目或仍存在；请重试一次，仍失败请重新打开本分区确认条目状态。`
}

/** 连续冲突的四段式文案（本包 + 命名空间与字段 + 事实 + 出路，对齐 persist.ts 口径）。 */
function settingsConflictFailureMessage(key: string, message: string, revision: number | undefined): string {
  return `供应商「${key}」未能写入宿主设置文档（llm-pi-ai 命名空间 providers.${key}）：`
    + `重读一次（revision=${String(revision)}）后重试仍被拒（${message}）。`
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

/**
 * 物化空形态判定：空数组 / 空对象（MF-3-1）。宿主 describe 的物化投影把文档侧缺席的
 * models/compat 补为此形态，与用户显式写入的空形态在投影视图上不可区分——diff 侧对它
 * 不发 unset、判定层对它不判不符，两层共用本判定。
 */
/**
 * 物化空形态判定（真机验收回归 V1-11 扩展）：空数组 / 空对象之外，宿主物化投影还会把
 * 文档缺席的 compat 物化为「键集非空但键值全为空容器」的嵌套形态（实测
 * {chatTemplateKwargs:{}, chatTemplateArgs:{}}）——该形态与「用户真实写入的值」不可区分
 * 于存储层，对它 unset 是幂等空操作（文档侧本就缺席），diff 层不发、判定层放行，两层
 * 共用本判定。递归口径：容器内全部值都是物化空形态（含基元缺失即键值只有空容器）才算；
 * 任何非容器原值（boolean/string/number）出现 = 用户真实配置，照常参与比对。
 */
function isEmptyContainer(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0
  if (!isRecord(value)) return false
  return Object.values(value).every((item) => isEmptyContainer(item))
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
