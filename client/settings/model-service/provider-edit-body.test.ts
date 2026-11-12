import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { collectElements, createTsxLoader, textOf, type FakeElement } from '../../testing/load-tsx'
import { modelServiceZh } from '../../locale'
import type { ProviderEditBodyProps, ProviderEditModel, ProviderEditModelDeps } from './provider-edit-body'

/**
 * 供应商展开体模型单测（一致性修复 r1：U6 恢复目录默认两段确认；供应商接入交互重设计：
 * 窄表单 / refPreview 真实值 / U10 reasoningEfforts 自由选集归档）。锁死 ProviderEditModel
 * 的可机器化行为（快照状态流，不经渲染）：
 *   · U6：「恢复目录默认」第一击进入确认态（restoreArmed）→ 警示键 models.restoreDirectoryWarning
 *     由渲染层消费（此处断言状态流：进入确认态/取消/确认/清单变更退出确认态）；
 *   · U10：存量 models[] 读入草案时 reasoningEfforts 按新语义归档——键值完全同名 → 自由选集
 *     （enabled + levels），显式 false → 非思考，其他一切形态 → preserve 原样保留态（携带
 *     原始值，写回逐字透传——见 settings-client.test 的写入侧用例）；
 *   · 窄表单：target.narrow 进快照，渲染面无端点/协议/compat 编辑；
 *   · refPreview：编辑既有条目显示真实 apiKeyEnv（缺陷修复），仅新建显示派生 ref。
 */

const BODY_PATH = fileURLToPath(new URL('./provider-edit-body.tsx', import.meta.url))

interface BodyModule {
  ProviderEditModel: new (deps: ProviderEditModelDeps) => ProviderEditModel
  ProviderEditBody: (props: ProviderEditBodyProps) => unknown
}

const loader = createTsxLoader()
const bodyModule = loader.load(BODY_PATH) as unknown as BodyModule

const t = (key: keyof typeof modelServiceZh) => modelServiceZh[key]

/** 假宿主通道（构造器只在目录默认态才探目录；本文件用例均带存量 models，探测面不触发；
 * remote 返回按宿主 typert 网关真实形态包 RemoteResult）。 */
function fakeRemote() {
  return {
    settings: {
      describe: async () => ({ ok: true, value: { writable: true, namespaces: [] } }),
      mutate: async () => ({ ok: true, value: { ns: 'llm-pi-ai' } }),
    },
    llm: {
      listProviders: async () => ({ ok: true, value: [] }),
      listConfigurableProviders: async () => ({ ok: true, value: [] }),
      discoverModels: async () => ({ ok: true, value: [] }),
    },
    credentials: {
      describe: async () => ({ ok: true, value: {} }),
      set: async () => ({ ok: true, value: undefined }),
      unset: async () => ({ ok: true, value: undefined }),
    },
  }
}

function makeModel(existingModels: Record<string, unknown>[], overrides: Partial<ProviderEditModelDeps> = {}): ProviderEditModel {
  return new bodyModule.ProviderEditModel({
    remote: fakeRemote(),
    t,
    target: { key: 'yanshi', isNew: false, customOnly: false, narrow: false },
    revision: 1,
    existing: { displayName: 'Yanshi', api: 'openai-completions', baseURL: 'http://y/v1', models: existingModels },
    providers: {},
    onSaved: () => {},
    ...overrides,
  })
}

const FULL_LEVELS = { off: 'off', minimal: 'minimal', low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' }

/** 组件树 → 元素清单（collectElements 的入参收窄）。 */
function elementsOf(root: unknown): FakeElement[] {
  return collectElements(root as FakeElement)
}

describe('既有目录型 provider 的测试连接（终态同步 F1-19，AS7 短路归一）', () => {
  /** 捕获 discoverModels 请求的假 remote（宿主 typert 网关真实形态包 RemoteResult）。 */
  function capturingRemote() {
    const remote = fakeRemote()
    const seen: Record<string, unknown>[] = []
    remote.llm.discoverModels = async (_ns: string, request: Record<string, unknown>) => {
      seen.push(request)
      return { ok: true as const, value: [{ id: 'dir-model-1', name: 'Directory Model' }] }
    }
    return { remote, seen }
  }

  it('目录型 provider（集合命中）带 baseURL 草稿探测：请求归一为 {provider} 无 baseURL，outcome 判 catalog 而非 endpoint', async () => {
    const { remote, seen } = capturingRemote()
    const model = makeModel([], { remote, catalogProviderKeys: new Set(['yanshi']) })
    await model.pending // 构造时的 loadDirectoryModels 先落地（第一次请求）
    await model.discover() // 第二次请求：测试连接（草稿 baseURL='http://y/v1' 非空）
    expect(model.getSnapshot().discovery.outcome).toEqual({ kind: 'catalog', models: [{ id: 'dir-model-1', name: 'Directory Model' }] })
    expect(seen).toHaveLength(2)
    // 宿主短路不看 baseURL：构造首读与测试连接两次请求归一后端点草稿都不参与
    // （outcome=catalog 与宿主实际路径一致）；api 仅测试连接随草稿过线。
    expect(seen[0]).toEqual({ provider: 'yanshi' })
    expect(seen[1]).toEqual({ provider: 'yanshi', api: 'openai-completions' })
  })

  it('自定义 provider（customOnly，不在目录集合）同场景走真实端点探测：请求带 baseURL，outcome 判 endpoint', async () => {
    const { remote, seen } = capturingRemote()
    const model = makeModel([{ id: 'a', name: 'A', input: ['text'] }], {
      remote,
      target: { key: 'yanshi', isNew: false, customOnly: true },
    })
    await model.pending
    await model.discover()
    expect(model.getSnapshot().discovery.outcome).toEqual({ kind: 'endpoint', models: [{ id: 'dir-model-1', name: 'Directory Model' }] })
    expect(seen).toHaveLength(1)
    expect(seen[0]).toEqual({ provider: 'yanshi', baseURL: 'http://y/v1', api: 'openai-completions' })
  })
})

describe('存量 models[] 读入草案：reasoningEfforts 自由选集归档（U10，D3 读改写保真）', () => {
  it('键值完全同名的字典归自由选集（全集与子集都 enabled，levels=键集合；不携带 raw）', () => {
    const model = makeModel([
      { id: 'a', name: 'A', input: ['text'], reasoningEfforts: FULL_LEVELS },
      { id: 'b', name: 'B', input: ['text'], reasoningEfforts: { off: 'off', high: 'high' } },
    ]).getSnapshot().models
    expect(model[0].thinkingEnabled).toBe(true)
    expect(model[0].levels).toEqual(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
    expect(model[0].preserve).toBe(false)
    expect(model[1].thinkingEnabled).toBe(true)
    expect(model[1].levels).toEqual(['off', 'high'])
    expect(model[1].preserve).toBe(false)
  })

  it('值≠键的字典归 preserve 并携带原始值（off 值空串 / 值拼写不同）', () => {
    const emptyOff = { off: '', high: 'high' }
    const alienSpelling = { off: 'off', high: 'high', max: 'xhigh' } // 三键但 max 值≠键（历史「高·最高」映射形态）
    const model = makeModel([
      { id: 'a', name: 'A', input: ['text'], reasoningEfforts: emptyOff },
      { id: 'c', name: 'C', input: ['text'], reasoningEfforts: alienSpelling },
    ]).getSnapshot().models
    expect(model.map((draft) => draft.preserve)).toEqual([true, true])
    expect(model[0].preserveRaw).toEqual(emptyOff)
    expect(model[1].preserveRaw).toEqual(alienSpelling)
  })

  it('省略 reasoningEfforts（宿主语义 = 沿用目录能力）与 false（非思考）分别归 preserve 省略态与非思考', () => {
    const model = makeModel([
      { id: 'a', name: 'A', input: ['text'] },
      { id: 'b', name: 'B', input: ['text'], reasoningEfforts: false },
    ]).getSnapshot().models
    expect(model[0].preserve).toBe(true)
    expect(model[0].preserveRaw).toBeUndefined() // 写回时同样省略该字段
    expect(model[1].preserve).toBe(false)
    expect(model[1].thinkingEnabled).toBe(false)
    expect(model[1].levels).toEqual([])
  })
})

describe('窄表单（内置目录型：目录型新增与目录型编辑）', () => {
  it('target.narrow 进快照；存量 apiKeyEnv 的 refPreview 显示真实值（缺陷修复：不再一律显示派生 ref）', () => {
    const model = makeModel([], {
      target: { key: 'deepseek-official', isNew: false, customOnly: false, narrow: true, catalogName: 'DeepSeek Official' },
      existing: { apiKeyEnv: 'DEEPSEEK_OFFICIAL_API_KEY', models: [] },
    })
    const snapshot = model.getSnapshot()
    expect(snapshot.narrow).toBe(true)
    expect(snapshot.catalogName).toBe('DeepSeek Official')
    expect(snapshot.refPreview).toBe('DEEPSEEK_OFFICIAL_API_KEY')
    expect(snapshot.keyPreview).toBe('deepseek-official')
  })

  it('新建（无既有条目）的 refPreview 显示派生 ref；目录名进快照', () => {
    const model = makeModel([], {
      target: { key: 'deepseek-official', isNew: true, customOnly: false, narrow: true, catalogName: 'DeepSeek Official' },
      existing: undefined,
    })
    const snapshot = model.getSnapshot()
    expect(snapshot.narrow).toBe(true)
    expect(snapshot.refPreview).toBe('TAIJI_DEEPSEEK_OFFICIAL_KEY')
  })

  it('全表单编辑既有条目：refPreview 同样显示真实 apiKeyEnv（缺陷修复作用于两种形态）', () => {
    const model = makeModel([], {
      existing: { apiKeyEnv: 'YANSHI_API_KEY', displayName: 'Yanshi', models: [] },
    })
    expect(model.getSnapshot().refPreview).toBe('YANSHI_API_KEY')
  })

  it('窄表单渲染：无「API 端点 / 协议 / 协议兼容」编辑面；说明条、目录徽章、密钥输入在场', () => {
    const model = makeModel([], {
      target: { key: 'deepseek-official', isNew: false, customOnly: false, narrow: true, catalogName: 'DeepSeek Official' },
      existing: { apiKeyEnv: 'DEEPSEEK_OFFICIAL_API_KEY', models: [] },
    })
    const props: ProviderEditBodyProps = { t, model, focusModel: undefined, onCancel: () => {} }
    const tree = bodyModule.ProviderEditBody(props) as Parameters<typeof collectElements>[0]
    const elements = elementsOf(tree)
    const texts = elements.map(textOf).join('\n')
    expect(texts).toContain(modelServiceZh['provider.narrowNote'])
    expect(texts).toContain('DeepSeek Official')
    expect(texts).toContain(modelServiceZh['providers.catalogBadge'])
    // 可编辑字段只剩 API 密钥一个（端点/协议/显示名三个 ms-field 不渲染）；
    // 「协议」二字命中说明条文本，编辑面缺席用字段数与 compat 头文案判定。
    const fields = elements.filter((element) => {
      const className = element.props.className
      return typeof className === 'string' && className.split(/\s+/).includes('ms-field')
    })
    expect(fields).toHaveLength(1)
    expect(texts).not.toContain(modelServiceZh['provider.compat'])
    expect(elements.filter((element) => element.props.type === 'password')).toHaveLength(1)
  })

  it('全表单渲染：端点 / 协议 / compat 编辑面在场（形态对照）', () => {
    const model = makeModel([{ id: 'a', name: 'A', input: ['text'], reasoningEfforts: false }])
    const props: ProviderEditBodyProps = { t, model, focusModel: undefined, onCancel: () => {} }
    const tree = bodyModule.ProviderEditBody(props) as Parameters<typeof collectElements>[0]
    const texts = elementsOf(tree).map(textOf).join('\n')
    expect(texts).toContain(modelServiceZh['provider.baseURL'])
    expect(texts).toContain(modelServiceZh['provider.compat'])
  })
})

describe('恢复目录默认的两段确认（U6，D11 采用段警示语义）', () => {
  const customList = [{ id: 'a', name: 'A', input: ['text'], reasoningEfforts: false }]

  it('第一击进入确认态（restoreArmed=true，models 保留）；警示键 models.restoreDirectoryWarning 在字典（渲染层消费源）', () => {
    const model = makeModel(customList)
    expect(model.getSnapshot().restoreArmed).toBe(false)
    model.requestRestoreDirectory()
    const snapshot = model.getSnapshot()
    expect(snapshot.restoreArmed).toBe(true)
    expect(snapshot.models).toHaveLength(1) // 进入确认态不清草案——第二击才清
    expect(modelServiceZh['models.restoreDirectoryWarning']).toContain('{n}')
  })

  it('退出确认态：restoreArmed=false，models 草案不动', () => {
    const model = makeModel(customList)
    model.requestRestoreDirectory()
    model.cancelRestoreDirectory()
    expect(model.getSnapshot().restoreArmed).toBe(false)
    expect(model.getSnapshot().models).toHaveLength(1)
  })

  it('第二击确认：models 清空、转目录默认态、确认态随之清除', () => {
    const model = makeModel(customList)
    model.requestRestoreDirectory()
    model.confirmRestoreDirectory()
    const snapshot = model.getSnapshot()
    expect(snapshot.models).toHaveLength(0)
    expect(snapshot.directoryMode).toBe(true)
    expect(snapshot.restoreArmed).toBe(false)
  })

  it('边界：customOnly（非目录 provider）与清单为空时不进入确认态；确认期间清单变更退出确认态', () => {
    const customOnlyModel = makeModel(customList, { target: { key: 'y', isNew: false, customOnly: true } })
    customOnlyModel.requestRestoreDirectory()
    expect(customOnlyModel.getSnapshot().restoreArmed).toBe(false)

    const emptyModel = makeModel([])
    emptyModel.requestRestoreDirectory()
    expect(emptyModel.getSnapshot().restoreArmed).toBe(false)

    const armed = makeModel(customList)
    armed.requestRestoreDirectory()
    armed.addModel()
    expect(armed.getSnapshot().restoreArmed).toBe(false)
  })
})
