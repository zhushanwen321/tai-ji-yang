import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createTsxLoader } from '../../testing/load-tsx'
import { modelServiceZh } from '../../locale'
import type { ConfigurableProviderRow, RemoteResult } from '../../model-service/settings-client'
import type { PluginConfigFormLike } from '../../model-service/credentials-client'
import type { ProvidersFormState, ProvidersListSnapshot, ProvidersListModel, ProvidersListModelDeps } from './providers-view'

/**
 * 供应商视图模型单测（供应商接入交互重设计）。锁死 ProvidersListModel 的可机器化行为：
 *   · 清单口径反转：llm-pi-ai 行源 = 快照 providers 已存在的条目（含宿主侧创建的仅
 *     apiKeyEnv 条目）；未接入的目录 route 不直出；托管只读行（settingsNs 非本命名空间）
 *     保持现行只读形态；快照有而目录无的 key = 自定义型；
 *   · 挂载态单判别字段 form：none（纯列表）/ addflow（choose → pick-builtin）/
 *     edit（mount: inline 行内展开 | standalone 独立新建）五种形态与翻转语义；
 *   · expand：目录型行 → 窄表单编辑；自定义行 → 全表单编辑。
 */

const VIEW_PATH = fileURLToPath(new URL('./providers-view.tsx', import.meta.url))

interface ViewModule {
  ProvidersListModel: new (deps: ProvidersListModelDeps) => ProvidersListModel
}

const loader = createTsxLoader()
const viewModule = loader.load(VIEW_PATH) as unknown as ViewModule

const t = (key: keyof typeof modelServiceZh, params?: Record<string, unknown>) => {
  let text = modelServiceZh[key]
  for (const [name, value] of Object.entries(params ?? {})) text = text.replaceAll(`{${name}}`, String(value))
  return text
}

/** 目录行（settingsNs 决定托管/可编辑归属；declared 决定目录型/自定义型）。 */
function directoryRow(provider: string, options: { declared?: boolean; ns?: string; displayName?: string } = {}): ConfigurableProviderRow {
  return {
    provider,
    displayName: options.displayName ?? provider,
    settingsNs: options.ns ?? 'llm-pi-ai',
    settingsPath: ['providers', provider],
    ...(options.declared === undefined ? {} : { declared: options.declared }),
  }
}

/** 假通道：providers 段 + 目录可配置；返回按宿主 typert 网关真实形态包 RemoteResult。 */
function fakeDeps(options: {
  providers?: Record<string, Record<string, unknown>>
  directory?: ConfigurableProviderRow[]
} = {}): ProvidersListModelDeps {
  return {
    remote: {
      settings: {
        describe: async () => ({
          ok: true,
          value: { writable: true, namespaces: [{ ns: 'llm-pi-ai', value: { providers: options.providers ?? {} }, revision: 3 }] },
        }),
        mutate: async () => ({ ok: true, value: { ns: 'llm-pi-ai' } }),
      },
      llm: {
        listProviders: async () => ({ ok: true, value: [] }),
        listConfigurableProviders: async (): Promise<RemoteResult<ConfigurableProviderRow[]>> => ({ ok: true, value: options.directory ?? [] }),
        discoverModels: async () => ({ ok: true, value: [] }),
      },
      credentials: {
        describe: async () => ({ ok: true, value: {} }),
        set: async () => ({ ok: true, value: undefined }),
        unset: async () => ({ ok: true, value: undefined }),
      },
    },
    t,
    configForm: {
      getSnapshot: () => ({ status: 'ready' as const, value: {}, revision: 1, writable: true }),
      subscribe: () => () => {},
      set: async () => true,
    } satisfies PluginConfigFormLike,
    onSaved: () => {},
  }
}

async function makeModel(options: Parameters<typeof fakeDeps>[0] = {}): Promise<ProvidersListModel> {
  const model = new viewModule.ProvidersListModel(fakeDeps(options))
  await model.pending
  return model
}

/** 取 edit 形态的挂载态（非 edit 形态 = 测试失败：断言已在前，此处只做类型收窄）。 */
function expectEditForm(form: ProvidersListSnapshot['form']): Extract<ProvidersFormState, { kind: 'edit' }> {
  if (form.kind !== 'edit') throw new Error(`expected edit form, got kind=${String(form.kind)}`)
  return form
}

describe('清单口径反转（未接入目录 route 不直出）', () => {
  it('快照 providers 已存在的条目成为行（含仅 apiKeyEnv 的宿主侧条目）；未接入目录 route 不出现', async () => {
    const model = await makeModel({
      providers: {
        'my-custom': { displayName: '我的自定义', models: [{ id: 'm1', name: 'M1', input: ['text'] }] },
        'deepseek-official': { apiKeyEnv: 'DEEPSEEK_OFFICIAL_API_KEY' }, // 仅 apiKeyEnv：宿主侧创建
      },
      directory: [
        directoryRow('deepseek-official', { displayName: 'DeepSeek Official' }),
        directoryRow('zai', { displayName: 'Z.ai' }), // 目录里有但未接入：不直出
        directoryRow('deepseek-account', { ns: 'deepseek-account', displayName: 'DeepSeek 账号' }), // 托管行
      ],
    })
    const { rows } = model.getSnapshot()
    const keys = rows.map((row) => row.key)
    expect(keys).toContain('my-custom')
    expect(keys).toContain('deepseek-official')
    expect(keys).not.toContain('zai')
    // 目录型判定：目录命中（declared 缺省 !== true）= 目录型；目录缺席 = 自定义型。
    const official = rows.find((row) => row.key === 'deepseek-official')
    expect(official?.catalogType).toBe(true)
    expect(official?.name).toBe('DeepSeek Official') // 无存量 displayName → 目录显示名回落
    expect(official?.ref).toBe('DEEPSEEK_OFFICIAL_API_KEY')
    const custom = rows.find((row) => row.key === 'my-custom')
    expect(custom?.catalogType).toBe(false)
    expect(custom?.name).toBe('我的自定义')
    expect(custom?.modelCount).toBe(1)
  })

  it('托管行（settingsNs 非本命名空间）保持只读形态；declared=true 的已接入条目 = 自定义型', async () => {
    const model = await makeModel({
      providers: { 'hand-route': { displayName: '手工路由', apiKeyEnv: 'X' } },
      directory: [
        directoryRow('deepseek-account', { ns: 'deepseek-account' }),
        directoryRow('hand-route', { declared: true, displayName: 'Hand Route' }),
      ],
    })
    const { rows } = model.getSnapshot()
    const managed = rows.find((row) => row.key === 'deepseek-account')
    expect(managed?.editable).toBe(false)
    expect(managed?.profile).toBeUndefined()
    const hand = rows.find((row) => row.key === 'hand-route')
    expect(hand?.editable).toBe(true)
    expect(hand?.catalogType).toBe(false) // declared=true：非目录型（全表单编辑）
  })

  it('无任何已接入条目 → 行集只含托管行（空态矩阵按行集渲染）', async () => {
    const model = await makeModel({
      providers: {},
      directory: [directoryRow('deepseek-account', { ns: 'deepseek-account' })],
    })
    const { rows } = model.getSnapshot()
    expect(rows).toHaveLength(1)
    expect(rows[0].editable).toBe(false)
  })
})

describe('表单挂载态（单判别字段 form）', () => {
  it('五种挂载态逐一以判别形态出现：none → choose → pick-builtin → standalone 新建 → inline 展开', async () => {
    const model = await makeModel({
      providers: { 'deepseek-official': { apiKeyEnv: 'X' } },
      directory: [
        directoryRow('deepseek-official', { displayName: 'DeepSeek Official' }),
        directoryRow('zai', { displayName: 'Z.ai' }),
      ],
    })
    expect(model.getSnapshot().form).toEqual({ kind: 'none' }) // 1 纯列表
    model.startAddFlow()
    expect(model.getSnapshot().form).toEqual({ kind: 'addflow', step: 'choose', candidates: [] }) // 2 choose
    model.pickBuiltin()
    expect(model.getSnapshot().form).toEqual({ // 3 pick-builtin（未被占用的目录条目为候选）
      kind: 'addflow',
      step: 'pick-builtin',
      candidates: [{ key: 'zai', name: 'Z.ai', catalogType: true }],
    })
    model.startNarrowAdd('zai', 'Z.ai')
    expect(expectEditForm(model.getSnapshot().form).mount).toBe('standalone') // 4 独立新建
    model.collapse()
    model.expand('deepseek-official')
    const inline = expectEditForm(model.getSnapshot().form) // 5 行内展开编辑
    expect(inline.mount).toBe('inline')
    expect(inline.model.key).toBe('deepseek-official')
  })

  it('删除武装与表单挂载可并存：requestDelete 不清 form；挂载翻转清武装', async () => {
    const model = await makeModel({
      providers: { 'my-custom': { displayName: '我的自定义' } },
      directory: [directoryRow('my-custom', { declared: true })],
    })
    model.expand('my-custom')
    model.requestDelete('my-custom')
    const armed = model.getSnapshot()
    expect(armed.deleteArmed?.key).toBe('my-custom')
    expect(armed.form.kind).toBe('edit') // 武装不拆表单（两段确认第一击）
    model.startAddFlow() // 挂载翻转（进入添加流）清武装
    expect(model.getSnapshot().deleteArmed).toBeUndefined()
  })
})

describe('添加流程（choose → pick-builtin → 窄表单 / 全表单）', () => {
  it('startAddFlow → choose；pickBuiltin 列出目录中未被占用的 llm-pi-ai 条目（托管 ns 与已接入条目不出现）', async () => {
    const model = await makeModel({
      providers: { 'deepseek-official': { apiKeyEnv: 'X' } },
      directory: [
        directoryRow('deepseek-official', { displayName: 'DeepSeek Official' }),
        directoryRow('zai', { displayName: 'Z.ai' }),
        directoryRow('moonshot', { displayName: 'Moonshot' }),
        directoryRow('deepseek-account', { ns: 'deepseek-account', displayName: 'DeepSeek 账号' }),
      ],
    })
    model.startAddFlow()
    expect(model.getSnapshot().form).toEqual({ kind: 'addflow', step: 'choose', candidates: [] })
    model.pickBuiltin()
    expect(model.getSnapshot().form).toEqual({
      kind: 'addflow',
      step: 'pick-builtin',
      candidates: [
        { key: 'zai', name: 'Z.ai', catalogType: true },
        { key: 'moonshot', name: 'Moonshot', catalogType: true },
      ],
    })
  })

  it('startNarrowAdd：窄表单新建（narrow + isNew + 目录名）；挂载翻转到 standalone 编辑（单值即互斥）', async () => {
    const model = await makeModel({
      providers: {},
      directory: [directoryRow('zai', { displayName: 'Z.ai' })],
    })
    model.startAddFlow()
    model.pickBuiltin()
    model.startNarrowAdd('zai', 'Z.ai')
    const editForm = expectEditForm(model.getSnapshot().form)
    expect(editForm.mount).toBe('standalone')
    const editSnapshot = editForm.model.getSnapshot()
    expect(editSnapshot.narrow).toBe(true)
    expect(editSnapshot.catalogName).toBe('Z.ai')
  })

  it('返回与退出：backToChoose 回第一步并丢弃候选；cancelAddFlow / collapse 清挂载态', async () => {
    const model = await makeModel({
      providers: {},
      directory: [directoryRow('zai', { displayName: 'Z.ai' })],
    })
    model.startAddFlow()
    model.pickBuiltin()
    model.backToChoose()
    expect(model.getSnapshot().form).toEqual({ kind: 'addflow', step: 'choose', candidates: [] })
    model.cancelAddFlow()
    expect(model.getSnapshot().form).toEqual({ kind: 'none' })
    model.startAddFlow()
    model.collapse()
    expect(model.getSnapshot().form).toEqual({ kind: 'none' })
  })

  it('startAdd（自定义卡）：全表单新建（narrow=false），挂载翻转到 standalone 编辑', async () => {
    const model = await makeModel({})
    model.startAddFlow()
    model.startAdd()
    const editForm = expectEditForm(model.getSnapshot().form)
    expect(editForm.mount).toBe('standalone')
    expect(editForm.model.getSnapshot().narrow).toBe(false)
  })
})

describe('expand 展开形态（目录型窄表单 / 自定义全表单）', () => {
  it('目录型行展开 → 窄表单编辑（narrow=true，目录名进快照）；自定义行展开 → 全表单', async () => {
    const model = await makeModel({
      providers: {
        'deepseek-official': { apiKeyEnv: 'X' },
        'my-custom': { displayName: '我的自定义', models: [] },
      },
      directory: [
        directoryRow('deepseek-official', { displayName: 'DeepSeek Official' }),
        directoryRow('my-custom', { declared: true }),
      ],
    })
    model.expand('deepseek-official')
    const catalogForm = expectEditForm(model.getSnapshot().form)
    expect(catalogForm.mount).toBe('inline')
    expect(catalogForm.model.getSnapshot().narrow).toBe(true)
    model.collapse()
    model.expand('my-custom')
    const customForm = expectEditForm(model.getSnapshot().form)
    const snapshot = customForm.model.getSnapshot()
    expect(snapshot.narrow).toBe(false)
    expect(snapshot.customOnly).toBe(true)
  })
})

// ── 评审修复 r1（G2 组：MF-1-4 删除链路异常捕获）─────────────────────────────────

describe('删除链路异常捕获（MF-1-4：confirmDelete 传输层 reject 不静默卡流程）', () => {
  it('mutate 传输层 reject：确认态清除、错误条给可重试指引（MF-1-1 后 deleteProvider 收敛为 rejected 结果值）', async () => {
    const deps = fakeDeps({
      providers: { 'my-custom': { displayName: '我的自定义' } },
      directory: [directoryRow('my-custom', { declared: true })],
    })
    deps.remote.settings.mutate = () => Promise.reject(new Error('transport down'))
    const model = new viewModule.ProvidersListModel(deps)
    await model.pending
    model.requestDelete('my-custom')
    expect(model.getSnapshot().deleteArmed).toBeDefined()
    await model.confirmDelete()
    const snapshot = model.getSnapshot()
    expect(snapshot.deleteArmed).toBeUndefined() // 确认态已消费，不滞留
    expect(snapshot.error).toBe('宿主设置写入失败（llm-pi-ai 命名空间）：transport down。请确认宿主设置服务可用后重试。')
  })

  it('正常删除链路（对照）：unset 成功 → 无错误、行刷新后消失', async () => {
    const providers: Record<string, Record<string, unknown>> = { 'my-custom': { displayName: '我的自定义' } }
    const deps = fakeDeps({ providers, directory: [directoryRow('my-custom', { declared: true })] })
    // fakeDeps 的 mutate 不应用 ops——本用例就地应用 unset，describe（重读）随之看到条目消失。
    deps.remote.settings.mutate = async (_ns: string, ops: { op: string; path: (string | number)[] }[]) => {
      for (const op of ops) {
        if (op.op === 'unset' && op.path[0] === 'providers') delete providers[op.path[1] as string]
      }
      return { ok: true, value: { ns: 'llm-pi-ai' } }
    }
    const model = new viewModule.ProvidersListModel(deps)
    await model.pending
    model.requestDelete('my-custom')
    await model.confirmDelete()
    const snapshot = model.getSnapshot()
    expect(snapshot.error).toBeUndefined()
    expect(snapshot.rows.some((row) => row.key === 'my-custom')).toBe(false)
  })
})
