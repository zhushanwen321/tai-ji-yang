import { describe, expect, it } from 'vitest'
import {
  checkCredentialRefAvailable,
  collectProfileRefs,
  credentialRefFor,
  isSelfManagedRef,
  registerPendingUnset,
  retryPendingUnsets,
  PENDING_UNSETS_FIELD,
  type CredentialsRemoteLike,
} from './credentials-client'
import type { ConfigFormLike, ConfigFormSnapshotLike } from '../persist'

/**
 * credentials-client 单测（dsh-model-service D7 的查重两支与待清理联动）：
 *   · 查重判定 = 凭据文件存在性 + 本 profile apiKeyEnv 枚举（不判归属，D7 查重句）；
 *     a 支 = profile 查得到持有者 / b 支 = 查不到（可能来自其他 profile）。
 *   · ownRef 豁免 = 当前编辑 provider 的既有 apiKeyEnv（重填重试通道）。
 *   · pendingCredentialUnsets：登记幂等、重试成功即移除（整字段写回）、失败保留、
 *     Config 未被服务 skipped；登记/写回失败均不外抛（返回 failed 或清单保留——挂载
 *     链 void…then 无 catch，U13 失败边界）。
 *   · ref 前缀形态判定（TAIJI_ 前缀 → 自建路径；宿主派生 <ROUTE>_API_KEY → 跨 profile 确认）。
 */

/** 假 Config 表单：内存段 + 写记录（整字段写回断言的载体）；failSet 注入写回失败（U13 边界）。 */
function fakeForm(initial: { status?: 'ready' | 'unavailable'; value?: Record<string, unknown>; failSet?: boolean } = {}) {
  let status = initial.status ?? 'ready'
  let failSet = initial.failSet ?? false
  let value: Record<string, unknown> | undefined = initial.value
  const writes: { field: string; value: unknown }[] = []
  const form: ConfigFormLike = {
    getSnapshot(): ConfigFormSnapshotLike {
      return { status, value, revision: 1, writable: status === 'ready' }
    },
    subscribe: () => () => {},
    async set(field, next) {
      if (failSet) throw new Error('config write rejected')
      writes.push({ field, value: next })
      value = { ...(value ?? {}), [field]: next }
      return true
    },
  }
  return { form, writes, setUnavailable: () => { status = 'unavailable' }, setFailSet: (next: boolean) => { failSet = next } }
}

/** 假凭据通道：可配置已存在 refs 与失败注入。 */
function fakeCredentials(existing: string[] = [], failUnset: (ref: string) => boolean = () => false) {
  const configured = new Set(existing)
  const unsetCalls: string[] = []
  const credentials: CredentialsRemoteLike = {
    async describe(refs) {
      return Object.fromEntries(refs.map((ref) => [ref, { configured: configured.has(ref), writable: true }]))
    },
    async set(ref) { configured.add(ref) },
    async unset(ref) {
      unsetCalls.push(ref)
      if (failUnset(ref)) throw new Error('credential service down')
      configured.delete(ref)
    },
  }
  return { credentials, configured, unsetCalls }
}

describe('checkCredentialRefAvailable 查重两支（V4 步骤 9 的分支判定）', () => {
  it('凭据文件无该 ref → 放行', async () => {
    const { credentials } = fakeCredentials([])
    const verdict = await checkCredentialRefAvailable({ credentials, profileRefs: ['OTHER_KEY'] }, 'TAIJI_VERIFY_A_KEY', undefined)
    expect(verdict).toEqual({ ok: true })
  })

  it('ref 是当前编辑 provider 的既有 apiKeyEnv → 放行（重填重试通道，不是撞名）', async () => {
    const { credentials } = fakeCredentials(['TAIJI_VERIFY_A_KEY'])
    const verdict = await checkCredentialRefAvailable({ credentials, profileRefs: [] }, 'TAIJI_VERIFY_A_KEY', 'TAIJI_VERIFY_A_KEY')
    expect(verdict).toEqual({ ok: true })
  })

  it('ref 已存在 + 本 profile 查得到持有者 → a 支（本 profile 供应商或宿主分区供应商的派生 ref）', async () => {
    const { credentials } = fakeCredentials(['TAIJI_VERIFY_A_KEY'])
    const verdict = await checkCredentialRefAvailable(
      { credentials, profileRefs: ['TAIJI_VERIFY_A_KEY'] },
      'TAIJI_VERIFY_A_KEY',
      undefined,
    )
    expect(verdict).toEqual({ ok: false, branch: 'a' })
  })

  it('ref 已存在 + 本 profile 查不到持有者 → b 支（可能来自其他 profile 的同名供应商）', async () => {
    const { credentials } = fakeCredentials(['TAIJI_LONELY_KEY'])
    const verdict = await checkCredentialRefAvailable(
      { credentials, profileRefs: ['SOME_OTHER_KEY'] },
      'TAIJI_LONELY_KEY',
      undefined,
    )
    expect(verdict).toEqual({ ok: false, branch: 'b' })
  })

  it('collectProfileRefs 从快照 providers 枚举 apiKeyEnv（a/b 分支的判定输入）', () => {
    expect(collectProfileRefs({
      a: { apiKeyEnv: 'TAIJI_A_KEY' },
      b: { displayName: '无凭据' },
      broken: 'not-a-record',
    })).toEqual(['TAIJI_A_KEY'])
  })
})

describe('ref 前缀形态判定（D7 删除侧的机器信号）', () => {
  it('TAIJI_ 前缀 → 自建路径；宿主派生形态（<ROUTE>_API_KEY）→ 非自建（跨 profile 确认）', () => {
    expect(isSelfManagedRef('TAIJI_VERIFY_A_KEY')).toBe(true)
    expect(isSelfManagedRef('YANSHI_API_KEY')).toBe(false)
    expect(isSelfManagedRef('OPENCODE_GO_API_KEY')).toBe(false)
  })

  it('credentialRefFor 与 provider-key 派生一致（TAIJI_<KEY 大写连字符转下划线>_KEY）', () => {
    expect(credentialRefFor('verify-a')).toBe('TAIJI_VERIFY_A_KEY')
    expect(credentialRefFor('yanshi-api')).toBe('TAIJI_YANSHI_API_KEY')
  })
})

describe('pendingCredentialUnsets 待清理联动（D7/AX9）', () => {
  it('登记：追加 ref 整字段写回；重复登记幂等（零写入）', async () => {
    const { form, writes } = fakeForm({ value: { pendingCredentialUnsets: ['TAIJI_A_KEY'] } })
    expect(await registerPendingUnset(form, 'TAIJI_B_KEY')).toEqual({ ok: true })
    expect(writes).toEqual([{ field: PENDING_UNSETS_FIELD, value: ['TAIJI_A_KEY', 'TAIJI_B_KEY'] }])
    expect(await registerPendingUnset(form, 'TAIJI_A_KEY')).toEqual({ ok: true })
    expect(writes).toHaveLength(1) // 幂等：已在清单不重复写
  })

  it('登记写回失败：返回 failed（不外抛，detail 供调用方拼人工清理指引）', async () => {
    const { form, writes } = fakeForm({ value: {}, failSet: true })
    const result = await registerPendingUnset(form, 'TAIJI_A_KEY')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.detail).toContain('config write rejected')
    expect(writes).toHaveLength(0) // 清单零写入，ref 未入清单
  })

  it('Config 未被服务（unavailable）：登记如实上报 failed（ref 未入清单，调用方给人工清理指引）', async () => {
    const { form, writes } = fakeForm({ status: 'unavailable' })
    const result = await registerPendingUnset(form, 'TAIJI_A_KEY')
    expect(result).toEqual({ ok: false, detail: expect.stringContaining('未被服务') })
    expect(writes).toHaveLength(0)
  })

  it('重试：成功即移出清单并整字段写回；失败保留；恢复后重试完成', async () => {
    let badKeyFailures = 0
    const { form, writes } = fakeForm({ value: { pendingCredentialUnsets: ['TAIJI_OK_KEY', 'TAIJI_BAD_KEY'] } })
    const { credentials, unsetCalls } = fakeCredentials(['TAIJI_OK_KEY', 'TAIJI_BAD_KEY'], (ref) => {
      // 瞬时故障只发生一次：BAD_KEY 首次 unset 失败（凭据服务不可用的模拟），恢复后成功。
      if (ref === 'TAIJI_BAD_KEY' && badKeyFailures === 0) {
        badKeyFailures += 1
        return true
      }
      return false
    })
    const first = await retryPendingUnsets(form, credentials)
    expect(first.removed).toEqual(['TAIJI_OK_KEY'])
    expect(first.kept).toEqual(['TAIJI_BAD_KEY'])
    expect(first.skipped).toBe(false)
    expect(unsetCalls.sort()).toEqual(['TAIJI_BAD_KEY', 'TAIJI_OK_KEY'])
    expect(writes).toEqual([{ field: PENDING_UNSETS_FIELD, value: ['TAIJI_BAD_KEY'] }])

    // 下次打开分区重试（服务恢复）：BAD_KEY 移出，清单清空。
    const second = await retryPendingUnsets(form, credentials)
    expect(second.removed).toEqual(['TAIJI_BAD_KEY'])
    expect(second.kept).toEqual([])
    expect(writes).toHaveLength(2)
    expect(writes[1].value).toEqual([])
  })

  it('Config 未被服务：重试 skipped（清单原样保留，不制造写入）', async () => {
    const { form, writes } = fakeForm({ status: 'unavailable', value: { pendingCredentialUnsets: ['TAIJI_A_KEY'] } })
    const { credentials } = fakeCredentials([])
    const result = await retryPendingUnsets(form, credentials)
    expect(result.skipped).toBe(true)
    expect(result.removed).toHaveLength(0)
    expect(writes).toHaveLength(0)
  })

  it('unset 对不存在的 ref 幂等（宿主 dsh-credentials-local 契约）：重试空清单安全', async () => {
    const { form, writes } = fakeForm({ value: {} })
    const { credentials } = fakeCredentials([])
    const result = await retryPendingUnsets(form, credentials)
    expect(result.removed).toEqual([])
    expect(writes).toHaveLength(0)
  })

  it('重试写回失败：不外抛，清单原样保留（removed 并回 kept 如实反映清单持有态）', async () => {
    const { form, writes } = fakeForm({ value: { pendingCredentialUnsets: ['TAIJI_A_KEY'] }, failSet: true })
    const { credentials } = fakeCredentials(['TAIJI_A_KEY'])
    const result = await retryPendingUnsets(form, credentials) // 若写回外抛，此行即未处理拒绝（挂载链无 catch）
    expect(result.removed).toEqual(['TAIJI_A_KEY']) // 凭据文件侧已清理（unset 成功）
    expect(result.kept).toEqual(['TAIJI_A_KEY']) // 清单写回失败 → ref 仍在清单，下次打开分区自愈
    expect(writes).toHaveLength(0)
  })
})
