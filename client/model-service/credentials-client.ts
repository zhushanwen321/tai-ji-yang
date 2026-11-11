/**
 * client/model-service/credentials-client.ts —— 凭据通道封装（dsh-model-service §3.3 D7/AX1/AX9）。
 *
 * 密钥红线（AX1）：密钥材料只经宿主凭据通道（ctx.remote.credentials）读写，唯一权威是宿主
 * 凭据文件（$DSH_HOME/.credentials.yaml，DSH_HOME 级、同 HOME 多 profile 共享——SC5，ref
 * 命名空间跨 profile 全局）；插件任何产物只出现 ref 名（apiKeyEnv），永不出现密钥明文。
 *
 * ref 派生（provider-key 复用）：TAIJI_<KEY 大写、连字符转下划线>_KEY，形态必满足宿主 ref
 * 正则 ^[A-Za-z_][A-Za-z0-9_]*$（dsh-api-settings-controller/lib/index.js:45 schema）。
 *
 * 写入前查重（D7 查重句，时点锚定 = 保存提交前、settings.mutate 之前；编排顺序在
 * settings-client.saveProvider，本模块只提供判定）：ref 已存在于凭据文件且不是当前编辑
 * provider 的既有 apiKeyEnv → 拒绝，提示文案按持有者可见性分两支——
 *   a) 本 profile 查得到持有者（枚举 llm-pi-ai providers 的 apiKeyEnv 值命中）：本 profile
 *      内供应商或宿主分区供应商的派生 ref；
 *   b) 本 profile 查不到持有者：可能来自其他 profile 的同名供应商（凭据文件跨 profile 共享）。
 *
 * 删除侧（D7）：按 ref 前缀形态判定——TAIJI_ 前缀 → 自建路径常规 unset；非 TAIJI_ 前缀
 * （既有 provider 宿主侧派生，如 route 名 yanshi → YANSHI_API_KEY）→ UI 先出跨 profile
 * 确认提示，确认才 unset（同 DSH_HOME 其他 profile 可能共用一把密钥）。
 *
 * 待清理清单（AX9）：unset 失败 → 写插件 Config 的 pendingCredentialUnsets 字段（index.js
 * volatile 声明，整写整读纪律）；打开分区时 retryPendingUnsets 幂等重试（宿主 unset 对不存在
 * 的 ref 幂等，dsh-credentials-local/lib/index.js:517-519），成功即从清单移除。
 */

import { PLUGIN_ENTRY_ID, type ConfigFormLike } from '../persist'
import { deriveCredentialRef } from './provider-key'

/** 宿主 credentials remote 的最小同构（describe/set/unset，dsh-api-settings-controller CredentialsController）。 */
export interface CredentialsRemoteLike {
  /** 批量读凭据状态（至多 64 个；返回按 ref 键控的 configured/source/writable 视图）。 */
  describe(refs: string[]): Promise<Record<string, { configured: boolean; source?: string; writable: boolean }>>
  /** 写入一个 ref（值单向过线，无读回通道；失败抛 RemoteError credential/rejected）。 */
  set(ref: string, value: string): Promise<void>
  /** 移除一个 ref（对不存在的 ref 幂等；失败抛 RemoteError credential/rejected）。 */
  unset(ref: string): Promise<void>
}

/** 插件 Config 表单面（读写 pendingCredentialUnsets；与 persist.ts 的 ConfigFormLike 同构）。 */
export interface PluginConfigFormLike extends ConfigFormLike {}

/** 待清理清单字段名（index.js Config 的 volatile 字段）。 */
export const PENDING_UNSETS_FIELD = 'pendingCredentialUnsets'

/** ref 查重结果：ok = 可写；branch a/b = 拒绝（文案两支见 D7，UI 层按 branch 取 locale）。 */
export type RefCheckResult = { ok: true } | { ok: false; branch: 'a' | 'b' }

/** 查重判定的输入面：凭据通道 + 本 profile llm-pi-ai providers 的 apiKeyEnv 枚举（来自 settings 快照）。 */
export interface RefCheckDeps {
  credentials: CredentialsRemoteLike
  /** 本 profile 各 provider 已声明的 apiKeyEnv 值集合（settings-client.readLlmPiAi 的 providers 派生）。 */
  profileRefs: Iterable<string>
}

/**
 * 写入前查重（判定 = 凭据文件存在性 + 枚举本 profile providers 的 apiKeyEnv 值；不判归属——
 * 宿主不记创建者、插件无来源记录，归属无机器可靠信号，D7 原文）。
 *
 * @param ref - 本次要写入的 ref（TAIJI_ 派生）。
 * @param ownRef - 当前编辑 provider 的既有 apiKeyEnv（无则 undefined）：命中自身时放行
 *   （重填同一把密钥是重试通道，不是撞名）。
 */
export async function checkCredentialRefAvailable(deps: RefCheckDeps, ref: string, ownRef: string | undefined): Promise<RefCheckResult> {
  const views = await deps.credentials.describe([ref])
  const info = views[ref]
  if (info === undefined || info.configured !== true) return { ok: true } // 凭据文件不存在该 ref
  if (ref === ownRef) return { ok: true } // 当前 provider 自己的既有 ref（重填重试）
  const profileRefs = new Set(deps.profileRefs)
  return profileRefs.has(ref) ? { ok: false, branch: 'a' } : { ok: false, branch: 'b' }
}

/** 快照 providers → 本 profile 的 apiKeyEnv 值枚举（查重 a/b 分支的判定输入）。 */
export function collectProfileRefs(providers: Record<string, unknown>): string[] {
  const refs: string[] = []
  for (const profile of Object.values(providers)) {
    if (typeof profile !== 'object' || profile === null) continue
    const apiKeyEnv = (profile as Record<string, unknown>).apiKeyEnv
    if (typeof apiKeyEnv === 'string' && apiKeyEnv.length > 0) refs.push(apiKeyEnv)
  }
  return refs
}

/**
 * TAIJI_ 前缀判定（D7 删除侧的唯一机器可判定信号）：TAIJI_ 前缀 = 插件自建路径（常规
 * unset）；其余（宿主分区派生形态 <ROUTE 大写>_API_KEY）= 既有 provider 路径，unset 前
 * 须跨 profile 确认。已知漏网边缘（宿主 route 命名 taiji-* 亦派生 TAIJI_ 前缀）登记于 D7
 * 采用段，属设计接受的三重巧合代价，此处如实按前缀判定。
 */
export function isSelfManagedRef(ref: string): boolean {
  return ref.startsWith('TAIJI_')
}

/** 待清理清单的读取形态（sanitize 后；脏条目容忍丢弃）。 */
function sanitizePending(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
}

/** Config 段的宽形态读取（persist.ts 的 AppearanceSection 是窄视图；本字段在宽段里）。 */
function sectionValue(snapshot: { value: unknown }): Record<string, unknown> | undefined {
  return typeof snapshot.value === 'object' && snapshot.value !== null ? snapshot.value as Record<string, unknown> : undefined
}

/** 登记结果：ok = ref 已写入待清理清单；failed = 未入清单（Config 未被服务或写回失败），detail 供调用方拼人工清理指引。 */
export type PendingUnsetRegistration = { ok: true } | { ok: false; detail: string }

/**
 * 登记一个待清理 ref（幂等：已在清单中不重复写；整字段写回）。失败不外抛（persist.ts
 * attempt 先例：写回异常收敛成结果值）——AX9/D7 的孤儿密钥防线依赖登记落盘，登记失败若
 * 静默，ref 既不在凭据文件侧被清理、又不在待清理清单里，无任何信号残留；返回 failed 让
 * 调用方给用户可见降级提示（宿主凭据界面人工清理），Config 未被服务同理如实上报。
 */
export async function registerPendingUnset(form: PluginConfigFormLike, ref: string): Promise<PendingUnsetRegistration> {
  const snapshot = form.getSnapshot()
  if (snapshot.status !== 'ready') return { ok: false, detail: '插件 Config 未被服务，待清理登记通道缺失' }
  const pending = sanitizePending(sectionValue(snapshot)?.[PENDING_UNSETS_FIELD])
  if (pending.includes(ref)) return { ok: true }
  try {
    await form.set(PENDING_UNSETS_FIELD, [...pending, ref])
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) }
  }
  return { ok: true }
}

/** 重试结果（UI 与 verify 场景消费；removed/kept 都是 ref 名；kept = 清单实际仍持有的 ref）。 */
export interface PendingUnsetRetry {
  removed: string[]
  kept: string[]
  /** Config 未被服务（快照 unavailable）时 true：本次未尝试，清单原样保留。 */
  skipped: boolean
}

/**
 * 幂等重试待清理清单（打开分区时调用；「下次启动」路径由 M2 的 Node 半场凭据预检顺带接管）：
 * 逐个 unset，成功即移出清单，失败保留；清单有变化才整字段写回（无变化零写入）。
 * 写回失败不外抛（挂载效应 void…then 链无 catch，section.tsx）：清单原样保留（快照未变，
 * removed 并回 kept 如实反映清单持有态），下次打开分区重试自愈（宿主 unset 幂等）。
 */
export async function retryPendingUnsets(form: PluginConfigFormLike, credentials: CredentialsRemoteLike): Promise<PendingUnsetRetry> {
  const snapshot = form.getSnapshot()
  if (snapshot.status !== 'ready') return { removed: [], kept: [], skipped: true }
  const pending = sanitizePending(sectionValue(snapshot)?.[PENDING_UNSETS_FIELD])
  const removed: string[] = []
  const kept: string[] = []
  for (const ref of pending) {
    try {
      await credentials.unset(ref)
      removed.push(ref)
    } catch {
      kept.push(ref)
    }
  }
  if (removed.length > 0) {
    try {
      await form.set(PENDING_UNSETS_FIELD, kept)
    } catch {
      kept.push(...removed)
    }
  }
  return { removed, kept, skipped: false }
}

/** 便捷转发：key → ref（组件侧展示「将写入的凭据引用」时用）。 */
export function credentialRefFor(key: string): string {
  return deriveCredentialRef(key)
}

/** 本模块归属日志前缀（与 persist.ts 的 PLUGIN_ENTRY_ID 同源）。 */
export const CREDENTIALS_LOG_PREFIX = PLUGIN_ENTRY_ID
