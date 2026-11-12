import { describe, expect, it } from 'vitest'
import {
  deleteProvider,
  levelsToEfforts,
  listProviderDirectory,
  listRegisteredRoutes,
  modelFromDraft,
  modelToDraft,
  prettifyId,
  profileDiffOps,
  profileFromDraft,
  readLlmPiAi,
  routeReferencesOf,
  saveProvider,
  THINKING_LEVELS,
  undeclaredFieldPaths,
  writeProviderModels,
  type CredentialsRemoteLike,
  type LlmRemoteLike,
  type ModelDraft,
  type ModelServiceHost,
  type RemoteResult,
  type SettingsNamespaceViewLike,
  type SettingsOp,
  type SettingsRemoteLike,
} from './settings-client'
import { deriveCredentialRef, isValidProviderKeyShape } from './provider-key'
import type { RouteEntry } from './route-evaluate'

/**
 * settings-client 单测（dsh-model-service 检查点 U1 的机器化部分）：
 *   · 保存顺序：provider key 预检 → 凭据 ref 查重 → settings.mutate → credentials.set；
 *     查重拒绝时后两环节零执行（决策 7 查重句时点锚定）；窄表单新建跳过 route 预检。
 *   · settings/conflict 的重读一次重试一次（非盲重试，RL3 单进程分支）；连续失败四段式。
 *   · 读改写字段级 diff：只发编辑字段、不碰 apiKeyEnv/headers（V1 步骤 10 不丢字段）；
 *     窄表单只 diff models（displayName/api/baseURL/compat 不发 op）。
 *   · 思考档位 levels↔reasoningEfforts 写读往返保真：同名映射 / false / preserve 三分支
 *     （AS15 逐档核对：值 ∈ THINKING_LEVELS 词表）。
 *   · 回读校验 undeclaredFieldPaths（AS17「宿主不消费」）。
 *   · provider-key 消费方集成：route 预检查重、ref 派生（AX11）；prettifyId 显示名规则。
 */

/** 事件记录面（保存链路的调用序断言载体）。 */
function makeRecorder() {
  const calls: string[] = []
  return {
    calls,
    mark(name: string) { calls.push(name) },
  }
}

/** 假 settings remote：可脚本化的 describe/mutate（bumpRevision 供冲突场景模拟他写者提交；
 * 返回按宿主 typert 网关真实形态包 RemoteResult，业务失败由 mutateImpl 注入 {ok:false}）。 */
function fakeSettings(options: {
  providers?: Record<string, unknown>
  revision?: number
  mutateImpl?: (ns: string, ops: SettingsOp[], expectedRevision?: number) => Promise<RemoteResult<SettingsNamespaceViewLike> | undefined>
} = {}): SettingsRemoteLike & {
  mutations: { ns: string; ops: SettingsOp[]; revision?: number }[]
  bumpRevision(): void
} {
  const mutations: { ns: string; ops: SettingsOp[]; revision?: number }[] = []
  let revision = options.revision ?? 7
  return {
    mutations,
    bumpRevision() { revision += 1 },
    async describe() {
      return {
        ok: true,
        value: {
          writable: true,
          namespaces: [{
            ns: 'llm-pi-ai',
            value: { providers: options.providers ?? {} },
            revision,
          }],
        },
      }
    },
    async mutate(ns, ops, expectedRevision) {
      mutations.push({ ns, ops, revision: expectedRevision })
      const injected = options.mutateImpl !== undefined ? await options.mutateImpl(ns, ops, expectedRevision) : undefined
      if (injected !== undefined) return injected
      revision += 1
      return { ok: true, value: { ns: 'llm-pi-ai', value: { providers: options.providers ?? {} }, revision } }
    },
  }
}

/** 假 llm remote：routes = 已注册适配器 route 集合。 */
function fakeLlm(routes: string[]): LlmRemoteLike & { configurable: { provider: string; displayName: string; settingsNs: string; settingsPath: string[] }[] } {
  return {
    async listProviders() { return { ok: true, value: routes.map((id) => ({ id, name: id })) } },
    async listConfigurableProviders() {
      return {
        ok: true,
        value: routes.map((provider) => ({ provider, displayName: provider, settingsNs: 'llm-pi-ai', settingsPath: ['providers', provider] })),
      }
    },
    async discoverModels() { return { ok: true, value: [] } },
    configurable: [],
  }
}

/** 假 credentials remote：记录调用序、可配置已存在 refs。 */
function fakeCredentials(existingRefs: string[] = [], recorder = makeRecorder()): CredentialsRemoteLike & { setCalls: { ref: string; value: string }[] } {
  const setCalls: { ref: string; value: string }[] = []
  const configured = new Set(existingRefs)
  return {
    setCalls,
    async describe(refs) {
      recorder.mark('credentials.describe')
      return { ok: true, value: Object.fromEntries(refs.map((ref) => [ref, { configured: configured.has(ref), writable: true }])) }
    },
    async set(ref, value) {
      recorder.mark('credentials.set')
      setCalls.push({ ref, value })
      configured.add(ref)
      return { ok: true, value: undefined }
    },
    async unset(ref) {
      recorder.mark('credentials.unset')
      configured.delete(ref)
      return { ok: true, value: undefined }
    },
  }
}

function makeHost(parts: { settings?: SettingsRemoteLike; llm?: LlmRemoteLike; credentials?: CredentialsRemoteLike } = {}): ModelServiceHost {
  return {
    settings: parts.settings ?? fakeSettings(),
    llm: parts.llm ?? fakeLlm(['deepseek-official']),
    credentials: parts.credentials ?? fakeCredentials(),
  }
}

const baseDraft = {
  key: 'verify-a',
  isNew: true,
  narrow: false,
  displayName: 'Verify A',
  baseURL: 'http://127.0.0.1:9/v1',
  api: 'openai-completions',
  apiKeyValue: 'sk-test-value',
  compat: {},
  models: [{ id: 'm1', name: 'M1', contextWindow: 8192, maxTokens: 4096, input: ['text' as const], thinkingEnabled: true, levels: ['off', 'high'], preserve: false }],
}

describe('saveProvider 保存顺序（检查点 U1）', () => {
  it('顺序 = 预检(llm.listProviders) → 凭据查重(describe) → settings.mutate → credentials.set', async () => {
    const recorder = makeRecorder()
    const llm = fakeLlm(['deepseek-official'])
    const originalList = llm.listProviders
    llm.listProviders = async () => { recorder.mark('precheck.listProviders'); return originalList.call(llm) }
    const settings = fakeSettings()
    const originalMutate = settings.mutate.bind(settings)
    settings.mutate = async (ns, ops, rev) => { recorder.mark('settings.mutate'); return originalMutate(ns, ops, rev) }
    const credentials = fakeCredentials([], recorder)
    const host = makeHost({ settings, llm, credentials })

    const result = await saveProvider(host, {
      draft: baseDraft,
      revision: 7,
      existing: undefined,
      refGuard: async () => { recorder.mark('refGuard'); return { ok: true } },
    })
    expect(result.kind).toBe('saved')
    expect(recorder.calls).toEqual(['precheck.listProviders', 'refGuard', 'settings.mutate', 'credentials.set'])
  })

  it('凭据查重拒绝：settings.mutate 与 credentials.set 零执行（两文件零写入）', async () => {
    const recorder = makeRecorder()
    const settings = fakeSettings()
    const originalMutate = settings.mutate.bind(settings)
    settings.mutate = async (ns, ops, rev) => { recorder.mark('settings.mutate'); return originalMutate(ns, ops, rev) }
    const credentials = fakeCredentials([], recorder)
    const host = makeHost({ settings, credentials })

    const result = await saveProvider(host, {
      draft: baseDraft,
      revision: 7,
      existing: undefined,
      refGuard: async () => ({ ok: false, branch: 'a' as const }),
    })
    expect(result.kind).toBe('refused-ref')
    expect(recorder.calls).not.toContain('settings.mutate')
    expect(recorder.calls).not.toContain('credentials.set')
    expect(settings.mutations).toHaveLength(0)
    expect(credentials.setCalls).toHaveLength(0)
  })

  it('provider key 撞已注册 route：拒绝保存，凭据查重与写入零执行', async () => {
    const recorder = makeRecorder()
    const settings = fakeSettings()
    const llm = fakeLlm(['verify-a'])
    const originalList = llm.listProviders
    llm.listProviders = async () => { recorder.mark('precheck.listProviders'); return originalList.call(llm) }
    const credentials = fakeCredentials([], recorder)
    const host = makeHost({ settings, llm, credentials })

    const result = await saveProvider(host, {
      draft: baseDraft,
      revision: 7,
      existing: undefined,
      refGuard: async () => { recorder.mark('refGuard'); return { ok: true } },
    })
    expect(result.kind).toBe('refused-route')
    expect(recorder.calls).toEqual(['precheck.listProviders'])
    expect(settings.mutations).toHaveLength(0)
  })

  it('窄表单新建（key = 内置目录 route）跳过 route 预检：目录 route 必然已注册，写配置而非注册新 route', async () => {
    const recorder = makeRecorder()
    const settings = fakeSettings()
    const originalMutate = settings.mutate.bind(settings)
    settings.mutate = async (ns, ops, rev) => { recorder.mark('settings.mutate'); return originalMutate(ns, ops, rev) }
    const llm = fakeLlm(['deepseek-official']) // 目录 route 已注册：全表单新建同名必被拒
    const originalList = llm.listProviders
    llm.listProviders = async () => { recorder.mark('precheck.listProviders'); return originalList.call(llm) }
    const credentials = fakeCredentials([], recorder)
    const host = makeHost({ settings, llm, credentials })

    const result = await saveProvider(host, {
      draft: { ...baseDraft, key: 'deepseek-official', narrow: true },
      revision: 7,
      existing: undefined,
      refGuard: async () => { recorder.mark('refGuard'); return { ok: true } },
    })
    expect(result.kind).toBe('saved')
    expect(recorder.calls).toEqual(['refGuard', 'settings.mutate', 'credentials.set']) // 无预检句
    // 写入值无 displayName/api/baseURL（narrow 写入面）。
    const ops = settings.mutations[0]?.ops ?? []
    const value = ops[0]?.value as Record<string, unknown>
    expect('displayName' in value).toBe(false)
    expect('baseURL' in value).toBe(false)
    expect('api' in value).toBe(false)
  })

  it('不写密钥（重填重试豁免形态外）时跳过凭据查重与 set：只发 settings.mutate', async () => {
    const recorder = makeRecorder()
    const settings = fakeSettings()
    const originalMutate = settings.mutate.bind(settings)
    settings.mutate = async (ns, ops, rev) => { recorder.mark('settings.mutate'); return originalMutate(ns, ops, rev) }
    const llm = fakeLlm(['deepseek-official'])
    const originalList = llm.listProviders
    llm.listProviders = async () => { recorder.mark('precheck.listProviders'); return originalList.call(llm) }
    const credentials = fakeCredentials([], recorder)
    const host = makeHost({ settings, llm, credentials })

    const result = await saveProvider(host, {
      draft: { ...baseDraft, apiKeyValue: '' },
      revision: 7,
      existing: undefined,
      refGuard: async () => { recorder.mark('refGuard'); return { ok: true } },
    })
    expect(result.kind).toBe('saved')
    expect(result.kind === 'saved' && result.refConfigured).toBe(true)
    expect(recorder.calls).toEqual(['precheck.listProviders', 'settings.mutate'])
  })
})

describe('settings/conflict 重读重试（RL3 单进程分支）', () => {
  it('第一次 mutate 报 settings/conflict → describe 重读一次 → 第二次 mutate 成功（非盲重试：带新 revision）', async () => {
    const recorder = makeRecorder()
    let attempt = 0
    const settings = fakeSettings({
      mutateImpl: async () => {
        attempt += 1
        if (attempt === 1) {
          // 他写者已提交：存储视图 revision 前移，然后本次写入被拒（resolve {ok:false}，
          // 宿主网关对业务失败不 reject 的真实形态）。
          settings.bumpRevision()
          return { ok: false, error: { code: 'settings/conflict', message: 'stale revision', details: { expected: 7, actual: 8 } } }
        }
        return undefined
      },
    })
    const originalMutate = settings.mutate.bind(settings)
    settings.mutate = async (ns, ops, rev) => { recorder.mark(`settings.mutate(rev=${String(rev)})`); return originalMutate(ns, ops, rev) }
    const originalDescribe = settings.describe.bind(settings)
    settings.describe = async () => { recorder.mark('settings.describe'); return originalDescribe() }
    const credentials = fakeCredentials([], recorder)
    const llm = fakeLlm(['deepseek-official'])
    const originalList = llm.listProviders
    llm.listProviders = async () => { recorder.mark('precheck.listProviders'); return originalList.call(llm) }
    const host = makeHost({ settings, llm, credentials })

    const result = await saveProvider(host, {
      draft: baseDraft,
      revision: 7,
      existing: undefined,
      refGuard: async () => { recorder.mark('refGuard'); return { ok: true } },
    })
    expect(result.kind).toBe('saved')
    expect(settings.mutations).toHaveLength(2)
    expect(settings.mutations[0].revision).toBe(7)
    expect(settings.mutations[1].revision).toBe(8) // 重读后的最新栅栏（他写者提交后 describe 返回 8）
    expect(recorder.calls).toEqual([
      'precheck.listProviders', 'refGuard', 'settings.mutate(rev=7)',
      'settings.describe', 'settings.mutate(rev=8)', 'credentials.set',
    ])
  })

  it('连续两次 conflict：返回 rejected 四段式（含命名空间与字段 + 出路），不再重试第三次', async () => {
    const conflict: RemoteResult<SettingsNamespaceViewLike> = { ok: false, error: { code: 'settings/conflict', message: 'stale again', details: { expected: 8, actual: 9 } } }
    const settings = fakeSettings({ mutateImpl: async () => conflict })
    const host = makeHost({ settings })
    const result = await saveProvider(host, {
      draft: baseDraft,
      revision: 7,
      existing: undefined,
      refGuard: async () => ({ ok: true }),
    })
    expect(result.kind).toBe('rejected')
    if (result.kind === 'rejected') {
      expect(result.message).toContain('llm-pi-ai')
      expect(result.message).toContain('providers.verify-a')
      expect(result.message).toContain('重新打开')
    }
    expect(settings.mutations).toHaveLength(2)
  })

  it('凭据 set 失败不回滚设置：saved + refConfigured=false + 重填重试指引', async () => {
    const settings = fakeSettings()
    const credentials = fakeCredentials([])
    // 业务失败是 resolve 型 {ok:false}（宿主网关不 reject 的真实形态）。
    credentials.set = async () => ({ ok: false, error: { code: 'credential/rejected', message: 'credential service down', details: {} } })
    const host = makeHost({ settings, credentials })
    const result = await saveProvider(host, {
      draft: baseDraft,
      revision: 7,
      existing: undefined,
      refGuard: async () => ({ ok: true }),
    })
    expect(result.kind).toBe('saved')
    expect(result.kind === 'saved' && result.refConfigured).toBe(false)
    expect(result.kind === 'saved' ? result.refMessage : '').toContain('重填密钥重试')
  })
})

describe('读改写字段级 diff（V1 步骤 10）', () => {
  const existing = {
    apiKeyEnv: 'EXISTING_KEY',
    displayName: 'Old Name',
    api: 'openai-completions',
    baseURL: 'http://old/v1',
    headers: { 'x-custom': 'keep-me' },
    modelOverrides: { legacy: { name: 'Legacy' } },
    models: [{ id: 'm1', name: 'M1', contextWindow: 8192, maxTokens: 4096, input: ['text'], reasoningEfforts: false }],
  }

  it('编辑 displayName/baseURL/models 只发这三个字段的 set op；apiKeyEnv/headers/modelOverrides 不出现在 ops', () => {
    const ops = profileDiffOps(existing, {
      key: 'verify-a',
      isNew: false,
      narrow: false,
      displayName: 'New Name',
      baseURL: 'http://new/v1',
      api: 'openai-completions',
      apiKeyValue: '', // 不重填密钥：保留既有 apiKeyEnv
      compat: {},
      models: [{ id: 'm1', name: 'M1', contextWindow: 16384, maxTokens: 4096, input: ['text'], thinkingEnabled: false, levels: [], preserve: false }],
    }, 'verify-a')
    const paths = ops.map((op) => op.path.join('.'))
    expect(paths.sort()).toEqual(['providers.verify-a.baseURL', 'providers.verify-a.displayName', 'providers.verify-a.models'])
    expect(ops.every((op) => op.op === 'set')).toBe(true)
  })

  it('未变更字段不发 op（diff 为空即零写入）', () => {
    const ops = profileDiffOps(existing, {
      key: 'verify-a',
      isNew: false,
      narrow: false,
      displayName: 'Old Name',
      baseURL: 'http://old/v1',
      api: 'openai-completions',
      apiKeyValue: '',
      compat: {},
      models: [{ id: 'm1', name: 'M1', contextWindow: 8192, maxTokens: 4096, input: ['text'], thinkingEnabled: false, levels: [], preserve: false }],
    }, 'verify-a')
    expect(ops).toHaveLength(0)
  })

  it('目录默认态（草案空清单）：既有 models 发 unset op（恢复目录默认），其余字段保留', () => {
    const ops = profileDiffOps(existing, {
      key: 'verify-a',
      isNew: false,
      narrow: false,
      displayName: 'Old Name',
      baseURL: 'http://old/v1',
      api: 'openai-completions',
      apiKeyValue: '',
      compat: {},
      models: [],
    }, 'verify-a')
    expect(ops).toEqual([{ op: 'unset', path: ['providers', 'verify-a', 'models'] }])
  })

  it('窄表单编辑：只 diff models——displayName/api/baseURL/compat 不发 op（宿主侧既有值原样保留）', () => {
    const existingFull = {
      ...existing,
      compat: { supportsDeveloperRole: true },
    }
    const ops = profileDiffOps(existingFull, {
      key: 'verify-a',
      isNew: false,
      narrow: true,
      displayName: 'Ignored', // 窄表单不携带显示名/端点/协议编辑，值进不了写入面
      baseURL: 'http://ignored/v1',
      api: 'openai-completions',
      apiKeyValue: '',
      compat: { supportsDeveloperRole: true },
      models: [{ id: 'm1', name: 'M1', contextWindow: 16384, maxTokens: 4096, input: ['text'], thinkingEnabled: false, levels: [], preserve: false }],
    }, 'verify-a')
    const paths = ops.map((op) => op.path.join('.'))
    expect(paths).toEqual(['providers.verify-a.models'])
  })

  it('窄表单编辑且 models 未变：零 op（跳过三字段与 compat 的 diff，宿主侧值原样保留）', () => {
    const ops = profileDiffOps(existing, {
      key: 'verify-a',
      isNew: false,
      narrow: true,
      displayName: 'Ignored',
      baseURL: 'http://ignored/v1',
      api: 'openai-completions',
      apiKeyValue: '',
      compat: {},
      models: [{ id: 'm1', name: 'M1', contextWindow: 8192, maxTokens: 4096, input: ['text'], thinkingEnabled: false, levels: [], preserve: false }],
    }, 'verify-a')
    expect(ops).toHaveLength(0)
  })

  it('保存成功回执刷新 diff 基线由调用方持有（ProviderEditModel 职责）；本层返回 written profile 供其采纳', async () => {
    const settings = fakeSettings({ providers: { 'verify-a': existing } })
    const host = makeHost({ settings })
    const result = await saveProvider(host, {
      draft: {
        key: 'verify-a', isNew: false, narrow: false, displayName: 'New Name', baseURL: 'http://new/v1',
        api: 'openai-completions', apiKeyValue: '', compat: {},
        models: [{ id: 'm1', name: 'M1', contextWindow: 8192, maxTokens: 4096, input: ['text'], thinkingEnabled: false, levels: [], preserve: false }],
      },
      revision: 7,
      existing,
      refGuard: async () => ({ ok: true }),
    })
    expect(result.kind).toBe('saved')
    if (result.kind === 'saved') expect(result.undeclared).toEqual([])
  })
})

describe('思考档位映射（AS15 逐档核对：值 ∈ THINKING_LEVELS 词表）', () => {
  it('levels 逐档同名映射：全集七档 = THINKING_LEVELS 全集逐档；子集 = 声明子集，未声明档不写键', () => {
    expect(levelsToEfforts([...THINKING_LEVELS])).toEqual({
      off: 'off', minimal: 'minimal', low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max',
    })
    expect(levelsToEfforts(['off', 'high'])).toEqual({ off: 'off', high: 'high' })
    // 宿主校验规则：非 off 档 wire 值非空串、至少一个 off 以外档位——同名映射天然满足。
    for (const [level, wire] of Object.entries(levelsToEfforts([...THINKING_LEVELS]))) {
      expect(wire.length, `${level} wire 非空`).toBeGreaterThan(0)
      expect(THINKING_LEVELS).toContain(wire)
    }
  })

  it('enabled=false 写 reasoningEfforts:false；enabled=true 写同名映射字典；preserve 逐字透传（modelFromDraft 三分支）', () => {
    const off = modelFromDraft({ id: 'm', name: 'M', contextWindow: 1, maxTokens: 1, input: [], thinkingEnabled: false, levels: [], preserve: false })
    expect(off.reasoningEfforts).toBe(false)
    const on = modelFromDraft({ id: 'm', name: 'M', contextWindow: 1, maxTokens: 1, input: [], thinkingEnabled: true, levels: ['low', 'xhigh'], preserve: false })
    expect(on.reasoningEfforts).toEqual({ low: 'low', xhigh: 'xhigh' })
    const raw = { off: '', high: 'high' }
    const kept = modelFromDraft({ id: 'm', name: 'M', contextWindow: 1, maxTokens: 1, input: [], thinkingEnabled: false, levels: [], preserve: true, preserveRaw: raw })
    expect(kept.reasoningEfforts).toBe(raw)
  })

  it('目录默认态草案不写 models 键（保持目录默认的写入面）', () => {
    const profile = profileFromDraft({ ...baseDraft, models: [] })
    expect('models' in profile).toBe(false)
  })

  it('窄表单新建整条 set：displayName/api/baseURL 不在写入值（端点/协议/显示名由内置目录解析）', () => {
    const profile = profileFromDraft({
      ...baseDraft,
      narrow: true,
      models: [{ id: 'm', name: 'M', contextWindow: 1048576, maxTokens: 4096, input: ['text'], thinkingEnabled: true, levels: ['high'], preserve: false }],
    }, 'TAIJI_VERIFY_A_KEY')
    expect('displayName' in profile).toBe(false)
    expect('api' in profile).toBe(false)
    expect('baseURL' in profile).toBe(false)
    expect(profile.apiKeyEnv).toBe('TAIJI_VERIFY_A_KEY')
    expect(Array.isArray(profile.models)).toBe(true)
  })
})

describe('modelToDraft 读侧归档（levels↔reasoningEfforts 往返保真）', () => {
  it('键值完全同名的字典 → enabled + levels=键集合（全集与子集都归自由选集，写回逐字一致）', () => {
    const full = modelToDraft({ id: 'a', name: 'A', input: ['text'], reasoningEfforts: levelsToEfforts([...THINKING_LEVELS]) })
    expect(full.thinkingEnabled).toBe(true)
    expect(full.preserve).toBe(false)
    expect(full.levels).toEqual([...THINKING_LEVELS])
    const subset = modelToDraft({ id: 'b', name: 'B', input: ['text'], reasoningEfforts: { off: 'off', low: 'low' } })
    expect(subset.thinkingEnabled).toBe(true)
    expect(subset.preserve).toBe(false)
    expect(subset.levels).toEqual(['off', 'low'])
    // 往返：读侧归档 → 写侧映射，与既有值逐字段一致（无损）。
    expect(modelFromDraft(subset).reasoningEfforts).toEqual({ off: 'off', low: 'low' })
    expect(modelFromDraft(full).reasoningEfforts).toEqual(levelsToEfforts([...THINKING_LEVELS]))
  })

  it('显式 false → enabled=false + levels=[]，写回 false（无损）', () => {
    const draft = modelToDraft({ id: 'a', name: 'A', input: ['text'], reasoningEfforts: false })
    expect(draft.thinkingEnabled).toBe(false)
    expect(draft.levels).toEqual([])
    expect(draft.preserve).toBe(false)
    expect(modelFromDraft(draft).reasoningEfforts).toBe(false)
  })

  it('值≠键的字典 / 省略字段 / 未知结构 → preserve（携带原始值，写回逐字透传）', () => {
    const emptyOff = { off: '', high: 'high' }
    const alienKey = { custom: 'low' }
    const drafts = [
      modelToDraft({ id: 'a', name: 'A', input: ['text'], reasoningEfforts: emptyOff }),
      modelToDraft({ id: 'b', name: 'B', input: ['text'], reasoningEfforts: alienKey }),
      modelToDraft({ id: 'c', name: 'C', input: ['text'], reasoningEfforts: 'unknown-shape' }),
      modelToDraft({ id: 'd', name: 'D', input: ['text'] }), // 省略字段：preserve 省略态（写回同样省略）
    ]
    for (const draft of drafts) {
      expect(draft.preserve).toBe(true)
      expect(draft.thinkingEnabled).toBe(false)
    }
    expect(drafts[0].preserveRaw).toEqual(emptyOff)
    expect(drafts[1].preserveRaw).toEqual(alienKey)
    expect(drafts[2].preserveRaw).toBe('unknown-shape')
    expect(drafts[3].preserveRaw).toBeUndefined()
    // 写回：raw 字典逐字透传；省略态同样省略字段。
    expect(modelFromDraft(drafts[0]).reasoningEfforts).toEqual(emptyOff)
    expect(modelFromDraft(drafts[2]).reasoningEfforts).toBe('unknown-shape')
    expect('reasoningEfforts' in modelFromDraft(drafts[3])).toBe(false)
  })

  it('上下文窗口非档位数字（宿主侧既有值如 1000000）读入与写回无损', () => {
    const draft = modelToDraft({ id: 'a', name: 'A', input: ['text'], contextWindow: 1000000, reasoningEfforts: false })
    expect(draft.contextWindow).toBe(1000000)
    expect(modelFromDraft(draft).contextWindow).toBe(1000000)
  })
})

describe('prettifyId 显示名自动生成规则', () => {
  it('全小写段：每段首字母大写化（my-model-v1 → My Model V1）', () => {
    expect(prettifyId('my-model-v1')).toBe('My Model V1')
    expect(prettifyId('step-5-preview')).toBe('Step 5 Preview')
  })

  it('任一段含大写：整体只换连字符保持原大小写（GLM-5.3 → GLM 5.3）', () => {
    expect(prettifyId('GLM-5.3')).toBe('GLM 5.3')
    expect(prettifyId('o3-Mini-High')).toBe('o3 Mini High')
  })

  it('空 id 与空段：返回空串/空段不抛错', () => {
    expect(prettifyId('')).toBe('')
    expect(prettifyId('a--b')).toBe('A  B')
  })
})

describe('回读校验 undeclaredFieldPaths（AS17）', () => {
  it('宿主 schema 未声明的顶层/条目字段被标出；声明字段不误报', () => {
    const paths = undeclaredFieldPaths({
      displayName: 'X', api: 'openai-completions', baseURL: 'http://x/v1',
      models: [{ id: 'm', name: 'M', contextWindow: 1, maxTokens: 1, input: ['text'], reasoningEfforts: false, turboMode: true }],
      legacyFlag: 'whatever',
    })
    expect(paths.sort()).toEqual(['legacyFlag', 'models[0].turboMode'])
  })
})

describe('deleteProvider 删除链路（D3/D7）', () => {
  it('设置 unset → TAIJI_ 前缀 ref 直接 credentials.unset；全部成功零登记', async () => {
    const recorder = makeRecorder()
    const settings = fakeSettings()
    const originalMutate = settings.mutate.bind(settings)
    settings.mutate = async (ns, ops, rev) => { recorder.mark('settings.mutate'); return originalMutate(ns, ops, rev) }
    const credentials = fakeCredentials([], recorder)
    const host = makeHost({ settings, credentials })
    const pendings: string[] = []
    const result = await deleteProvider(host, {
      key: 'verify-a',
      existing: { apiKeyEnv: deriveCredentialRef('verify-a') },
      crossProfileConfirmed: true,
      registerPendingUnset: async (ref) => { pendings.push(ref); return { ok: true } },
    })
    expect(result.kind).toBe('deleted')
    expect(recorder.calls).toEqual(['settings.mutate', 'credentials.unset'])
    expect(pendings).toHaveLength(0)
  })

  it('unset 失败 → 登记 pendingCredentialUnsets（待清理重试的数据源）', async () => {
    const settings = fakeSettings()
    const credentials = fakeCredentials([])
    credentials.unset = async () => ({ ok: false, error: { code: 'credential/rejected', message: 'down', details: {} } })
    const host = makeHost({ settings, credentials })
    const pendings: string[] = []
    const result = await deleteProvider(host, {
      key: 'verify-a',
      existing: { apiKeyEnv: deriveCredentialRef('verify-a') },
      crossProfileConfirmed: true,
      registerPendingUnset: async (ref) => { pendings.push(ref); return { ok: true } },
    })
    expect(result.kind).toBe('deleted')
    if (result.kind === 'deleted') expect(result.pendingUnset).toBe(deriveCredentialRef('verify-a'))
    expect(pendings).toEqual([deriveCredentialRef('verify-a')])
  })

  it('unset 失败且登记也失败：不外抛，unsetMessage 降级为宿主凭据界面人工清理指引（U13 边界）', async () => {
    const settings = fakeSettings()
    const credentials = fakeCredentials([])
    credentials.unset = async () => ({ ok: false, error: { code: 'credential/rejected', message: 'down', details: {} } })
    const host = makeHost({ settings, credentials })
    const result = await deleteProvider(host, {
      key: 'verify-a',
      existing: { apiKeyEnv: deriveCredentialRef('verify-a') },
      crossProfileConfirmed: true,
      registerPendingUnset: async () => ({ ok: false, detail: 'config write rejected' }),
    })
    expect(result.kind).toBe('deleted')
    if (result.kind === 'deleted') {
      expect(result.pendingUnset).toBe(deriveCredentialRef('verify-a'))
      expect(result.unsetMessage).toContain('手工清理')
      expect(result.unsetMessage).toContain('config write rejected')
    }
  })

  it('非 TAIJI_ 前缀 ref 且未确认跨 profile：凭据零动作（UI 先确认；确认后才走同通道）', async () => {
    const recorder = makeRecorder()
    const credentials = fakeCredentials([], recorder)
    const host = makeHost({ credentials })
    const result = await deleteProvider(host, {
      key: 'yanshi',
      existing: { apiKeyEnv: 'YANSHI_API_KEY' },
      crossProfileConfirmed: false,
      registerPendingUnset: async () => ({ ok: true }),
    })
    expect(result.kind).toBe('deleted')
    if (result.kind === 'deleted') expect(result.pendingUnset).toBeUndefined()
    expect(recorder.calls).not.toContain('credentials.unset')
  })
})

describe('provider-key 消费方集成（AX11）', () => {
  it('listRegisteredRoutes 返回 route id 集合（预检查重源）', async () => {
    const routes = await listRegisteredRoutes(fakeLlm(['a', 'b']))
    expect(routes).toEqual(['a', 'b'])
  })

  it('派生 key 落在合法形态、派生 ref 落在宿主 ref 正则（kebab→大写下划线的变换闭环）', () => {
    expect(isValidProviderKeyShape('verify-a')).toBe(true)
    expect(isValidProviderKeyShape('p-2')).toBe(true)
    const ref = deriveCredentialRef('verify-a')
    expect(ref).toBe('TAIJI_VERIFY_A_KEY')
    expect(/^[A-Za-z_][A-Za-z0-9_]*$/.test(ref)).toBe(true)
  })
})

describe('readLlmPiAi 快照', () => {
  it('命名空间未被服务 → available=false（视图降级文案的数据源）', async () => {
    const settings: SettingsRemoteLike = {
      describe: async () => ({ ok: true, value: { writable: true, namespaces: [{ ns: 'other', revision: 1 }] } }),
      mutate: async () => ({ ok: true, value: { ns: 'llm-pi-ai' } }),
    }
    const snapshot = await readLlmPiAi(settings)
    expect(snapshot.available).toBe(false)
  })

  it('describe 失败 Result（resolve 不 reject）→ readLlmPiAi 把宿主消息抛成 rejection（读降级分支接管）', async () => {
    const settings: SettingsRemoteLike = {
      describe: async () => ({ ok: false, error: { code: 'gateway/internal', message: 'settings service down', details: {} } }),
      mutate: async () => ({ ok: true, value: { ns: 'llm-pi-ai' } }),
    }
    await expect(readLlmPiAi(settings)).rejects.toThrow('settings service down')
  })

  it('listProviderDirectory：成功 Result 解包出数组；失败 Result 抛宿主消息（.catch(() => []) 接管）', async () => {
    const llm = fakeLlm(['a'])
    const rows = await listProviderDirectory(llm)
    expect(Array.isArray(rows)).toBe(true)
    expect(rows).toHaveLength(1)
    llm.listConfigurableProviders = async () => ({ ok: false, error: { code: 'gateway/internal', message: 'llm down', details: {} } })
    await expect(listProviderDirectory(llm)).rejects.toThrow('llm down')
  })

  it('就绪命名空间 → revision/providers 读出（展开体打开时的持有快照）', async () => {
    const settings = fakeSettings({ providers: { a: { displayName: 'A' } }, revision: 42 })
    const snapshot = await readLlmPiAi(settings)
    expect(snapshot.available).toBe(true)
    expect(snapshot.writable).toBe(true)
    expect(snapshot.revision).toBe(42)
    expect(snapshot.providers.a.displayName).toBe('A')
  })
})

// ── 一致性修复 r1（model-service-save-chain 组）补充：U5 写入目标 / U10 preserve 保真 / U12 引用检索 ──

describe('编辑既有 provider 重填密钥的写入目标（D7：保留既有 apiKeyEnv，不派生孤儿 ref）', () => {
  it('既有 apiKeyEnv 非 TAIJI_ 形态：credentials.set 落既有 ref，不落 key 派生的新 ref', async () => {
    const settings = fakeSettings()
    const credentials = fakeCredentials([])
    const host = makeHost({ settings, credentials })
    const result = await saveProvider(host, {
      draft: { ...baseDraft, key: 'yanshi', isNew: false, apiKeyValue: 'sk-refilled' },
      revision: 7,
      existing: { apiKeyEnv: 'YANSHI_API_KEY', displayName: 'Yanshi', api: 'openai-completions', baseURL: 'http://y/v1' },
      refGuard: async () => ({ ok: true }),
    })
    expect(result.kind).toBe('saved')
    expect(credentials.setCalls).toHaveLength(1)
    expect(credentials.setCalls[0].ref).toBe('YANSHI_API_KEY')
    expect(credentials.setCalls[0].value).toBe('sk-refilled')
  })

  it('查重豁免与写入目标同源：重填既有 ref 自身放行（guard 收到 ownRef = 既有 apiKeyEnv）', async () => {
    const settings = fakeSettings()
    const credentials = fakeCredentials(['YANSHI_API_KEY'])
    const host = makeHost({ settings, credentials })
    const guardCalls: { ref: string; ownRef: string | undefined }[] = []
    const result = await saveProvider(host, {
      draft: { ...baseDraft, key: 'yanshi', isNew: false, apiKeyValue: 'sk-again' },
      revision: 7,
      existing: { apiKeyEnv: 'YANSHI_API_KEY' },
      refGuard: async (ref, ownRef) => { guardCalls.push({ ref, ownRef }); return { ok: true } },
    })
    expect(result.kind).toBe('saved')
    expect(guardCalls).toEqual([{ ref: 'YANSHI_API_KEY', ownRef: 'YANSHI_API_KEY' }])
    expect(credentials.setCalls[0]?.ref).toBe('YANSHI_API_KEY')
  })

  it('既有条目缺失 apiKeyEnv（含新建）：回落 key 派生 ref（原语义不变）', async () => {
    const credentials = fakeCredentials([])
    const host = makeHost({ credentials })
    const result = await saveProvider(host, {
      draft: baseDraft,
      revision: 7,
      existing: undefined,
      refGuard: async () => ({ ok: true }),
    })
    expect(result.kind).toBe('saved')
    expect(credentials.setCalls[0]?.ref).toBe(deriveCredentialRef(baseDraft.key))
  })
})

describe('preserve 原样保留（D3 读改写保真：非同名映射 reasoningEfforts 不被改写）', () => {
  it('modelFromDraft preserve：原始字典逐字写回；raw undefined = 写回省略该字段（沿用目录能力语义）', () => {
    const raw = { off: '', low: 'low' }
    const entry = modelFromDraft({ id: 'm', name: 'M', contextWindow: undefined, maxTokens: undefined, input: ['text'], thinkingEnabled: false, levels: [], preserve: true, preserveRaw: raw })
    expect(entry.reasoningEfforts).toEqual(raw)
    const omitted = modelFromDraft({ id: 'm', name: 'M', contextWindow: undefined, maxTokens: undefined, input: ['text'], thinkingEnabled: false, levels: [], preserve: true })
    expect('reasoningEfforts' in omitted).toBe(false)
  })

  it('打开展开体直接保存（preserve 草案原样回写）：profileDiffOps 零 op——用户未编辑推理档位不发 models set', () => {
    const existing = {
      displayName: 'Yanshi', api: 'openai-completions', baseURL: 'http://y/v1',
      models: [{ id: 'm', name: 'M', input: ['text'], reasoningEfforts: { off: '', low: 'low' } }],
    }
    const draft: ModelDraft = { id: 'm', name: 'M', contextWindow: undefined, maxTokens: undefined, input: ['text'], thinkingEnabled: false, levels: [], preserve: true, preserveRaw: { off: '', low: 'low' } }
    const ops = profileDiffOps(existing, {
      key: 'yanshi', isNew: false, narrow: false, displayName: 'Yanshi', baseURL: 'http://y/v1', api: 'openai-completions',
      apiKeyValue: '', compat: {}, models: [draft],
    }, 'yanshi')
    expect(ops).toHaveLength(0)
  })
})

describe('routeReferencesOf 路由成员引用检索（D3 删除流程的警告源）', () => {
  const routes: RouteEntry[] = [
    { id: 'a', name: '路由甲', members: [{ provider: 'yanshi', model: 'm', order: 0, condition: { type: 'none' } }] },
    { id: 'b', name: '路由乙', members: [{ provider: 'other', model: 'm', order: 0, condition: { type: 'none' } }] },
    { id: 'c', name: '路由丙', members: [{ provider: 'yanshi', model: 'm2', order: 0, condition: { type: 'window' } }] },
  ]

  it('命中成员 provider 的路由返回路由名（多命中保序）；未命中返回空数组', () => {
    expect(routeReferencesOf('yanshi', routes)).toEqual(['路由甲', '路由丙'])
    expect(routeReferencesOf('other', routes)).toEqual(['路由乙'])
    expect(routeReferencesOf('nobody', routes)).toEqual([])
    expect(routeReferencesOf('yanshi', [])).toEqual([])
  })
})

describe('writeProviderModels 模型清单写通道（清单交互定稿 C3）', () => {
  const models = [
    { id: 'm1', name: 'M1', input: ['text'] },
    { id: 'm2', name: 'M2', input: ['text', 'image'], contextWindow: 1048576 },
  ]

  it('往返：describe 取 revision → mutate 整段 set providers.<key>.models → 回执回读', async () => {
    const settings = fakeSettings({ providers: { yanshi: { displayName: 'Yanshi' } }, revision: 7 })
    const result = await writeProviderModels(makeHost({ settings }), 'yanshi', models)
    expect(result.kind).toBe('saved')
    expect(settings.mutations).toEqual([
      { ns: 'llm-pi-ai', ops: [{ op: 'set', path: ['providers', 'yanshi', 'models'], value: models }], revision: 7 },
    ])
    if (result.kind !== 'saved') return
    expect(result.profile.displayName).toBe('Yanshi') // 整字段 path set：清单外字段不在 ops、回执原样
    expect(result.revision).toBe(8) // mutate 回执 revision（宿主写入后前移）
    expect(result.undeclared).toEqual([])
  })

  it('空清单 = unset models（目录默认语义恢复，不写显式空数组）', async () => {
    const settings = fakeSettings({ providers: { yanshi: { models } }, revision: 3 })
    const result = await writeProviderModels(makeHost({ settings }), 'yanshi', [])
    expect(result.kind).toBe('saved')
    expect(settings.mutations[0].ops).toEqual([{ op: 'unset', path: ['providers', 'yanshi', 'models'] }])
    expect(settings.mutations[0].revision).toBe(3)
  })

  it('settings/conflict：重读一次后同形 ops 重发一次（revision 取重读值）', async () => {
    const settings = fakeSettings({
      providers: { yanshi: {} },
      revision: 7,
      // 模拟他写者：旧栅栏提交 → 宿主回 settings/conflict 且 revision 已前移（bump）。
      mutateImpl: (_ns, _ops, expectedRevision) => {
        if (expectedRevision === 7) {
          settings.bumpRevision()
          return Promise.resolve({ ok: false as const, error: { code: 'settings/conflict', message: 'stale', details: {} } })
        }
        return undefined
      },
    })
    const result = await writeProviderModels(makeHost({ settings }), 'yanshi', models)
    expect(result.kind).toBe('saved')
    expect(settings.mutations.map((mutation) => mutation.revision)).toEqual([7, 8]) // 首发旧栅栏 → 重读（8）重发
    expect(settings.mutations[1].ops).toEqual(settings.mutations[0].ops)
  })

  it('连续冲突：四段式文案（含字段路径 / 事实 / 出路），不产生第三次写入', async () => {
    const settings = fakeSettings({
      providers: { yanshi: {} },
      revision: 7,
      mutateImpl: () => {
        settings.bumpRevision()
        return Promise.resolve({ ok: false as const, error: { code: 'settings/conflict', message: 'stale again', details: {} } })
      },
    })
    const result = await writeProviderModels(makeHost({ settings }), 'yanshi', models)
    expect(result.kind).toBe('rejected')
    expect(settings.mutations).toHaveLength(2) // 非盲重试：最多一重
    if (result.kind !== 'rejected') return
    expect(result.message).toContain('providers.yanshi.models')
    expect(result.message).toContain('revision=8')
    expect(result.message).toContain('正在编辑')
  })

  it('非冲突拒绝：宿主消息原样透传（含恢复线索）', async () => {
    const settings = fakeSettings({
      providers: { yanshi: {} },
      mutateImpl: () =>
        Promise.resolve({ ok: false as const, error: { code: 'settings/rejected', message: 'models[0].id is required', details: {} } }),
    })
    const result = await writeProviderModels(makeHost({ settings }), 'yanshi', models)
    expect(result.kind).toBe('rejected')
    if (result.kind !== 'rejected') return
    expect(result.message).toContain('models[0].id is required')
  })

  it('回读校验：写入后回执里 schema 未声明的字段进 undeclared（AS17）', async () => {
    const settings = fakeSettings({
      providers: { yanshi: {} },
      mutateImpl: (ns, ops) => {
        const op = ops[0]
        const injected = [{ id: 'm1', name: 'M1', input: ['text'], unknownField: 1 }]
        return Promise.resolve({ ok: true as const, value: { ns, value: { providers: { yanshi: { models: injected } } }, revision: 9 } })
      },
    })
    const result = await writeProviderModels(makeHost({ settings }), 'yanshi', models)
    expect(result.kind).toBe('saved')
    if (result.kind !== 'saved') return
    expect(result.undeclared).toEqual(['models[0].unknownField'])
  })
})
