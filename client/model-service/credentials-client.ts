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

import { writeConfigFieldRMW } from '../config-form-rmw'
import { type ConfigFormLike } from '../persist'
import { PENDING_UNSETS_FIELD } from './config-fields'
import { deriveCredentialRef } from './provider-key'
import { unwrapRemote, type RemoteResult } from './remote-result'

/**
 * 宿主 credentials remote 的最小同构（describe/set/unset，dsh-api-settings-controller
 * CredentialsController）。方法返回 typert 网关的 Result 包装——业务失败是 resolve 型
 * {ok:false,error}，reject 只来自传输层异常。
 */
export interface CredentialsRemoteLike {
  /** 批量读凭据状态（至多 64 个；返回按 ref 键控的 configured/source/writable 视图）。 */
  describe(refs: string[]): Promise<RemoteResult<Record<string, { configured: boolean; source?: string; writable: boolean }>>>
  /** 写入一个 ref（值单向过线，无读回通道；业务失败 = {ok:false}，错误分类 credential/rejected）。 */
  set(ref: string, value: string): Promise<RemoteResult<void>>
  /** 移除一个 ref（对不存在的 ref 幂等；业务失败 = {ok:false}）。 */
  unset(ref: string): Promise<RemoteResult<void>>
}

/** 插件 Config 表单面（读写 pendingCredentialUnsets；与 persist.ts 的 ConfigFormLike 同构）。 */
export interface PluginConfigFormLike extends ConfigFormLike {}

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
  const views = unwrapRemote(await deps.credentials.describe([ref]))
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
  // 整字段读改写经共享 RMW 助手（writeConfigFieldRMW）：幂等判定在 compute 内（已在清单
  // 零写入）；被拒自动以重读快照重算重发一次（栅栏防线）；接受后校验本端 ref 在场性
  // （内容防线）——缺席说明接受基于滞后快照（revision 已被其他命名空间推进而内容滞后，
  // ConfigFormLike.set 契约），滞后镜像保有被覆盖前的他端成员，以重读内容重算重发挽回
  // （MF-1-2：他端窗口新登记的 ref 不得被静默覆盖）。失败终态如实翻译，让调用方走人工
  // 清理指引文案——登记谎报落盘 = AX9 要防的孤儿密钥形态。
  const outcome = await writeConfigFieldRMW(
    form,
    PENDING_UNSETS_FIELD,
    (current) => {
      const pending = sanitizePending(current)
      return pending.includes(ref) ? { write: false } : { write: true, value: [...pending, ref] }
    },
    (fresh) => sanitizePending(fresh).includes(ref),
  )
  if (outcome.kind === 'accepted') return { ok: true }
  if (outcome.kind === 'not-ready') return { ok: false, detail: '插件 Config 未被服务，待清理登记通道缺失' }
  if (outcome.kind === 'refused') return { ok: false, detail: '待清理登记写入被拒（Config revision 栅栏冲突）' }
  return { ok: false, detail: outcome.detail }
}

/** 重试结果（UI 与 verify 场景消费；removed/kept 都是 ref 名；kept = 清单实际仍持有的 ref）。 */
export interface PendingUnsetRetry {
  removed: string[]
  kept: string[]
  /** Config 未被服务（快照 unavailable）时 true：本次未尝试，清单原样保留。 */
  skipped: boolean
  /**
   * 清单写回连续失败（重发后仍被拒或传输异常）时 true：凭据文件侧已清理（removed 非空）
   * 但清单原样未动（removed 已并回 kept）。消费方据此区分提示——removed.length 在此形态下
   * 只代表凭据侧清理数，不再等同「清单已同步清理 N 条」。
   */
  writeBackFailed: boolean
}

/**
 * 幂等重试待清理清单（打开分区时调用；D7/AX9「下次启动或打开分区时重试」的打开分区
 * 路径——插件装载（启动）路径的重试未实现，取舍登记见设计包 D7 采用段）：
 * 逐个 unset，成功即移出清单，失败保留；清单有变化才整字段写回（无变化零写入）。
 * 写回被拒（set 返回 false）或传输失败都不外抛（挂载效应 void…then 链无 catch，
 * section.tsx）：被拒先按重读快照重发一次，仍失败把 removed 并回 kept 如实反映清单
 * 持有态并置 writeBackFailed（removed 只陈述凭据侧清理事实，消费方不得据其渲染
 * 「清单已同步清理」），下次打开分区重试自愈（宿主 unset 幂等）。
 */
export async function retryPendingUnsets(form: PluginConfigFormLike, credentials: CredentialsRemoteLike): Promise<PendingUnsetRetry> {
  const snapshot = form.getSnapshot()
  if (snapshot.status !== 'ready') return { removed: [], kept: [], skipped: true, writeBackFailed: false }
  const pending = sanitizePending(sectionValue(snapshot)?.[PENDING_UNSETS_FIELD])
  const removed: string[] = []
  const kept: string[] = []
  for (const ref of pending) {
    // unset 业务失败是 resolve 型 {ok:false}（不 reject）——不判 ok 会把失败静默当成功移出
    // 清单；catch 只接管传输层异常。
    try {
      const result = await credentials.unset(ref)
      if (!result.ok) {
        kept.push(ref)
        continue
      }
      removed.push(ref)
    } catch {
      kept.push(ref)
    }
  }
  let writeBackFailed = false
  if (removed.length > 0) {
    // 写回经共享 RMW 助手（writeConfigFieldRMW）：compute 基于**写回时**重读的快照减去本次
    // 已清理（unset 循环耗时期间他端窗口可能新登记——重读比沿用进入函数时的快照更防丢，
    // 与原 fresh 过滤同口径）；被拒自动以重读快照重算重发一次（栅栏防线）；接受后校验
    // removed 成员的缺席性（内容防线）——在场说明接受基于滞后快照，滞后镜像保有被覆盖前
    // 的他端成员，以重读内容重算重发挽回（MF-1-2）。失败终态（被拒 / 传输异常 / 快照未被
    // 服务）把 removed 并回 kept（清单原样，下次打开分区重试自愈——宿主 unset 幂等），
    // 并置 writeBackFailed 让消费方区分提示（凭据侧已清理、清单未同步——按 removed.length
    // 渲染「已清理 N 条」会谎报清单状态）。
    const outcome = await writeConfigFieldRMW(
      form,
      PENDING_UNSETS_FIELD,
      (current) => ({ write: true, value: sanitizePending(current).filter((item) => !removed.includes(item)) }),
      (fresh) => !removed.some((item) => sanitizePending(fresh).includes(item)),
    )
    if (outcome.kind !== 'accepted') {
      kept.push(...removed)
      writeBackFailed = true
    }
  }
  return { removed, kept, skipped: false, writeBackFailed }
}

/** 便捷转发：key → ref（组件侧展示「将写入的凭据引用」时用）。 */
export function credentialRefFor(key: string): string {
  return deriveCredentialRef(key)
}
