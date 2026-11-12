import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createTsxLoader } from '../../testing/load-tsx'
import { modelServiceZh } from '../../locale'
import type { ConfigurableProviderRow, RemoteResult } from '../../model-service/settings-client'
import type { PluginConfigFormLike } from '../../model-service/credentials-client'
import type { ProvidersListModel, ProvidersListModelDeps } from './providers-view'

/**
 * 供应商视图模型单测（供应商接入交互重设计）。锁死 ProvidersListModel 的可机器化行为：
 *   · 清单口径反转：llm-pi-ai 行源 = 快照 providers 已存在的条目（含宿主侧创建的仅
 *     apiKeyEnv 条目）；未接入的目录 route 不直出；托管只读行（settingsNs 非本命名空间）
 *     保持现行只读形态；快照有而目录无的 key = 自定义型；
 *   · 添加流程步骤态：choose（两卡）→ pick-builtin（目录中未被占用的内置条目）→ 窄表单 /
 *     自定义全表单；步骤可返回与退出，与展开体互斥；
 *   · expand：目录型行 → 窄表单编辑；自定义行 → 全表单编辑。
 */

const VIEW_PATH = fileURLToPath(new URL('./providers-view.tsx', import.meta.url))

interface ViewModule {
  ProvidersListModel: new (deps: ProvidersListModelDeps) => ProvidersListModel
}

const loader = createTsxLoader()
const viewModule = loader.load(VIEW_PATH) as unknown as ViewModule

const t = (key: keyof typeof modelServiceZh) => modelServiceZh[key]

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
    expect(model.getSnapshot().addingStep).toBe('choose')
    model.pickBuiltin()
    const snapshot = model.getSnapshot()
    expect(snapshot.addingStep).toBe('pick-builtin')
    expect(snapshot.builtinCandidates.map((candidate) => candidate.key)).toEqual(['zai', 'moonshot'])
    expect(snapshot.builtinCandidates[0].name).toBe('Z.ai')
    expect(snapshot.builtinCandidates[0].catalogType).toBe(true)
  })

  it('startNarrowAdd：窄表单新建（narrow + isNew + 目录名）；步骤态清空；与展开体互斥', async () => {
    const model = await makeModel({
      providers: {},
      directory: [directoryRow('zai', { displayName: 'Z.ai' })],
    })
    model.startAddFlow()
    model.pickBuiltin()
    model.startNarrowAdd('zai', 'Z.ai')
    const snapshot = model.getSnapshot()
    expect(snapshot.addingStep).toBeUndefined()
    expect(snapshot.addingNew).toBe(true)
    expect(snapshot.editing).toBeDefined()
    const editSnapshot = snapshot.editing?.getSnapshot()
    expect(editSnapshot?.narrow).toBe(true)
    expect(editSnapshot?.catalogName).toBe('Z.ai')
  })

  it('返回与退出：backToChoose 回第一步；cancelAddFlow / collapse 清空步骤态', async () => {
    const model = await makeModel({
      providers: {},
      directory: [directoryRow('zai', { displayName: 'Z.ai' })],
    })
    model.startAddFlow()
    model.pickBuiltin()
    model.backToChoose()
    expect(model.getSnapshot().addingStep).toBe('choose')
    expect(model.getSnapshot().builtinCandidates).toHaveLength(0)
    model.cancelAddFlow()
    expect(model.getSnapshot().addingStep).toBeUndefined()
    model.startAddFlow()
    model.collapse()
    expect(model.getSnapshot().addingStep).toBeUndefined()
  })

  it('startAdd（自定义卡）：全表单新建（narrow=false），步骤态清空', async () => {
    const model = await makeModel({})
    model.startAddFlow()
    model.startAdd()
    const snapshot = model.getSnapshot()
    expect(snapshot.addingNew).toBe(true)
    expect(snapshot.addingStep).toBeUndefined()
    expect(snapshot.editing?.getSnapshot().narrow).toBe(false)
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
    expect(model.getSnapshot().editing?.getSnapshot().narrow).toBe(true)
    model.collapse()
    model.expand('my-custom')
    const snapshot = model.getSnapshot().editing?.getSnapshot()
    expect(snapshot?.narrow).toBe(false)
    expect(snapshot?.customOnly).toBe(true)
  })
})
