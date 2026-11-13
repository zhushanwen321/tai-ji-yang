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

const t = (key: keyof typeof modelServiceZh, params?: Record<string, unknown>) => {
  let text = modelServiceZh[key]
  for (const [name, value] of Object.entries(params ?? {})) text = text.replaceAll(`{${name}}`, String(value))
  return text
}

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

// ── 评审修复 r1（G2 组：MF-1-4 保存链路异常捕获 / MF-1-18 目录失败显形）──────────────
// MF-1-1 后异常捕获单点移入 settings-client 写通道（结果值收敛），本文件的用例改断言
// 「saving 复位 + 错误条带通道异常原文与重试指引」的收敛文案。

describe('保存链路异常收敛（MF-1-4 saving 复位语义 / MF-1-1 写通道收敛为结果值）', () => {
  /** 可脚本化 mutate 的 remote（编辑流零 diff 时 ops 为空数组，回执 providers.yanshi 供回读）。 */
  function editableRemote() {
    const remote = fakeRemote()
    const profile = { displayName: 'Yanshi', api: 'openai-completions', baseURL: 'http://y/v1', models: [{ id: 'a', name: 'A', input: ['text'], reasoningEfforts: false }] }
    remote.settings.describe = async () => ({ ok: true, value: { writable: true, namespaces: [{ ns: 'llm-pi-ai', value: { providers: { yanshi: profile } }, revision: 2 }] } })
    remote.settings.mutate = async () => ({ ok: true, value: { ns: 'llm-pi-ai', value: { providers: { yanshi: profile } }, revision: 3 } })
    return { remote, profile }
  }

  it('mutate 传输层 reject：saveProvider 收敛为 rejected 结果值——saving 复位、错误条带可重试指引（按钮不再永久禁用）', async () => {
    const { remote } = editableRemote()
    remote.settings.mutate = () => Promise.reject(new Error('transport down'))
    const model = makeModel([{ id: 'a', name: 'A', input: ['text'], reasoningEfforts: false }], { remote })
    await model.save()
    const snapshot = model.getSnapshot()
    expect(snapshot.saving).toBe(false)
    expect(snapshot.error).toBe('宿主设置写入失败（llm-pi-ai 命名空间）：transport down。请确认宿主设置服务可用后重试。')

    // 通道恢复后再次保存可成功（saving 未卡死的回归证明）。
    remote.settings.mutate = async () => ({ ok: true, value: { ns: 'llm-pi-ai', value: { providers: { yanshi: { displayName: 'Yanshi', models: [] } } }, revision: 4 } })
    await model.save()
    const recovered = model.getSnapshot()
    expect(recovered.saving).toBe(false)
    expect(recovered.error).toBeUndefined()
  })

  it('新建全表单的 route 预检 unwrapRemote throw 同样收敛为 rejected（saving 复位）', async () => {
    const remote = editableRemote().remote
    remote.llm.listProviders = () => Promise.reject(new Error('llm remote down'))
    const model = makeModel([], {
      remote,
      target: { key: '', isNew: true, customOnly: true, narrow: false },
      existing: undefined,
    })
    model.addModel() // 自定义新建至少一条模型（保存前置）
    model.setDisplayName('New Provider') // 派生 key 进入预检链路
    await model.save()
    const snapshot = model.getSnapshot()
    expect(snapshot.saving).toBe(false)
    expect(snapshot.error).toBe('保存供应商未能完成（宿主通道异常：llm remote down）。请确认宿主服务可用后重试。')
  })
})

describe('目录模型读取失败显形（MF-1-18：不再静默降级为空清单）', () => {
  it('目录默认态构造期探测失败 → directoryError 携带恢复动作，目录行区渲染错误提示行', async () => {
    const remote = fakeRemote()
    remote.llm.discoverModels = async () => ({ ok: false, error: { code: 'llm/discovery', message: 'no model listing available', details: {} } })
    const model = makeModel([], { remote, catalogProviderKeys: new Set(['yanshi']) })
    await new Promise((resolve) => setTimeout(resolve, 0)) // 构造期 void loadDirectoryModels 落地
    const snapshot = model.getSnapshot()
    expect(snapshot.directoryError).toContain(modelServiceZh['models.directoryLoadFailed'])
    expect(snapshot.directoryError).toContain('请手动添加模型') // recovery 文案在场（可行动）
    expect(snapshot.directoryModels).toEqual([])
    // 渲染面：目录默认态提示行（ms-note-err）在场，区分「目录无模型」与「读取失败」。
    const props: ProviderEditBodyProps = { t, model, focusModel: undefined, onCancel: () => {} }
    const tree = bodyModule.ProviderEditBody(props) as Parameters<typeof collectElements>[0]
    const texts = elementsOf(tree).map(textOf).join('\n')
    expect(texts).toContain(snapshot.directoryError ?? '')
  })

  it('探测成功 → directoryError 复位为 undefined（失败提示不残留）', async () => {
    const remote = fakeRemote()
    remote.llm.discoverModels = async () => ({ ok: true, value: [{ id: 'd1', name: 'D1' }] })
    const model = makeModel([], { remote, catalogProviderKeys: new Set(['yanshi']) })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const snapshot = model.getSnapshot()
    expect(snapshot.directoryError).toBeUndefined()
    expect(snapshot.directoryModels).toEqual([{ id: 'd1', name: 'D1' }])
  })
})

describe('新建撞他端接入（MF-1-12：refused-existing 分支给刷新指引）', () => {
  it('窄表单新建冲突重读见 key 已存在 → notice 给「已在其他窗口接入」指引，saving 复位', async () => {
    const remote = fakeRemote()
    // 首发被拒（他端接入推进 revision）；重读显示 zai 已存在（apiKeyEnv 为他端写入）。
    remote.settings.mutate = async () => ({ ok: false, error: { code: 'settings/conflict', message: 'stale revision', details: {} } })
    remote.settings.describe = async () => ({ ok: true, value: { writable: true, namespaces: [{ ns: 'llm-pi-ai', value: { providers: { zai: { apiKeyEnv: 'OTHER_WINDOW_KEY' } } }, revision: 9 }] } })
    const model = makeModel([], {
      remote,
      target: { key: 'zai', isNew: true, customOnly: false, narrow: true, catalogName: 'Z.ai' },
      existing: undefined,
    })
    model.setApiKeyValue('sk-x')
    await model.save()
    const snapshot = model.getSnapshot()
    expect(snapshot.saving).toBe(false)
    expect(snapshot.notice?.kind).toBe('err')
    expect(snapshot.notice?.text).toBe(modelServiceZh['save.refTakenElsewhere'])
    expect(snapshot.error).toBeUndefined()
  })
})

// ── 评审修复 r4（G1 组：MF-1-6 受控输入清场 / MF-1-11 窄表单空保存判据单点）──────────

describe('保存成功后密钥清场（MF-1-6：受控输入的模型回流，AX1 生效）', () => {
  /** 编辑流 remote：mutate 回执带 providers.yanshi（保存成功路径的回读底座）。 */
  function saveableRemote() {
    const remote = fakeRemote()
    const profile = { displayName: 'Yanshi', api: 'openai-completions', baseURL: 'http://y/v1', models: [{ id: 'a', name: 'A', input: ['text'], reasoningEfforts: false }] }
    remote.settings.describe = async () => ({ ok: true, value: { writable: true, namespaces: [{ ns: 'llm-pi-ai', value: { providers: { yanshi: profile } }, revision: 2 }] } })
    remote.settings.mutate = async () => ({ ok: true, value: { ns: 'llm-pi-ai', value: { providers: { yanshi: profile } }, revision: 3 } })
    return remote
  }

  it('B1 保存成功：快照 apiKeyValue 清空，渲染的密钥输入 value 跟随为空串（非受控 defaultValue 无 DOM 写回通道的修复）', async () => {
    const remote = saveableRemote()
    const model = makeModel([{ id: 'a', name: 'A', input: ['text'], reasoningEfforts: false }], { remote })
    model.setApiKeyValue('sk-once')
    await model.save()
    const snapshot = model.getSnapshot()
    expect(snapshot.notice?.kind).toBe('ok')
    expect(snapshot.apiKeyValue).toBe('')
    // 渲染面：受控输入的 value 跟随快照清空（此前非受控输入无 DOM 写回通道，AX1 失效）。
    const props: ProviderEditBodyProps = { t, model, focusModel: undefined, onCancel: () => {} }
    const tree = bodyModule.ProviderEditBody(props) as Parameters<typeof collectElements>[0]
    const passwordInputs = elementsOf(tree).filter((element) => element.props.type === 'password')
    expect(passwordInputs).toHaveLength(1)
    expect(passwordInputs[0].props.value).toBe('')
  })

  it('B3 保存失败（宿主拒绝）：已输入密钥保留（失败分支不清模型值），输入 value 仍显示', async () => {
    const remote = saveableRemote()
    remote.settings.mutate = async () => ({ ok: false, error: { code: 'settings/rejected', message: 'schema violation', details: {} } })
    const model = makeModel([{ id: 'a', name: 'A', input: ['text'], reasoningEfforts: false }], { remote })
    model.setApiKeyValue('sk-keep')
    await model.save()
    const snapshot = model.getSnapshot()
    expect(snapshot.error).toBeDefined()
    expect(snapshot.apiKeyValue).toBe('sk-keep')
    const props: ProviderEditBodyProps = { t, model, focusModel: undefined, onCancel: () => {} }
    const tree = bodyModule.ProviderEditBody(props) as Parameters<typeof collectElements>[0]
    const passwordInputs = elementsOf(tree).filter((element) => element.props.type === 'password')
    expect(passwordInputs).toHaveLength(1)
    expect(passwordInputs[0].props.value).toBe('sk-keep')
  })
})

describe('窄表单空保存判据单点（MF-1-11：快照派生布尔 saveBlocked）', () => {
  /** 取渲染树里的主保存按钮（ms-button-primary 且文案 = action.save）。 */
  function saveButtonOf(model: ProviderEditModel) {
    const props: ProviderEditBodyProps = { t, model, focusModel: undefined, onCancel: () => {} }
    const tree = bodyModule.ProviderEditBody(props) as Parameters<typeof collectElements>[0]
    return elementsOf(tree)
      .filter((element) => {
        const className = element.props.className
        return typeof className === 'string' && className.split(/\s+/).includes('ms-button-primary')
      })
      .find((button) => textOf(button) === modelServiceZh['action.save'])
  }

  it('新建窄表单零填写：saveBlocked=true（按钮禁用 + title 指引）；输入密钥即解除', () => {
    const model = makeModel([], {
      target: { key: 'deepseek-official', isNew: true, customOnly: false, narrow: true, catalogName: 'DeepSeek Official' },
      existing: undefined,
    })
    expect(model.getSnapshot().saveBlocked).toBe(true)
    const blocked = saveButtonOf(model)
    expect(blocked).toBeDefined()
    expect(blocked!.props.disabled).toBe(true)
    expect(blocked!.props.title).toBe(modelServiceZh['provider.narrowEmptyBlocked'])
    model.setApiKeyValue('sk-x')
    expect(model.getSnapshot().saveBlocked).toBe(false)
    expect(saveButtonOf(model)!.props.disabled).toBe(false)
  })

  it('编辑既有目录型条目（isNew=false、directoryMode、空密钥）：saveBlocked=false，保存按钮可点（不再被空密钥过拦——行为修正）', () => {
    const model = makeModel([], {
      target: { key: 'deepseek-official', isNew: false, customOnly: false, narrow: true, catalogName: 'DeepSeek Official' },
      existing: { apiKeyEnv: 'DEEPSEEK_OFFICIAL_API_KEY', models: [] },
    })
    const snapshot = model.getSnapshot()
    expect(snapshot.narrow).toBe(true)
    expect(snapshot.directoryMode).toBe(true)
    expect(snapshot.apiKeyValue).toBe('')
    expect(snapshot.models).toHaveLength(0)
    expect(snapshot.saveBlocked).toBe(false)
    const button = saveButtonOf(model)
    expect(button).toBeDefined()
    expect(button!.props.disabled).toBe(false)
    expect(button!.props.title).toBeUndefined()
  })
})
