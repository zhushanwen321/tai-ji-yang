import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createTsxLoader } from '../../testing/load-tsx'
import { modelServiceZh } from '../../locale'
import type { ProviderEditModel, ProviderEditModelDeps } from './provider-edit-body'

/**
 * 供应商展开体模型单测（一致性修复 r1：U6 恢复目录默认两段确认 / U10 reasoningEfforts
 * 无损归档）。锁死 ProviderEditModel 的可机器化行为（快照状态流，不经渲染）：
 *   · U6：「恢复目录默认」第一击进入确认态（restoreArmed）→ 警示键 models.restoreDirectoryWarning
 *     由渲染层消费（此处断言状态流：进入确认态/取消/确认/清单变更退出确认态）；
 *   · U10：存量 models[] 读入草案时 reasoningEfforts 与 D6 三档映射精确相等才归档策略，
 *     不匹配 → preserve 原样保留态（携带原始值，写回逐字透传——见 settings-client.test 的
 *     写入侧用例），用户未编辑推理档位不产生 models diff。
 */

const BODY_PATH = fileURLToPath(new URL('./provider-edit-body.tsx', import.meta.url))

interface BodyModule {
  ProviderEditModel: new (deps: ProviderEditModelDeps) => ProviderEditModel
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
    target: { key: 'yanshi', isNew: false, customOnly: false },
    revision: 1,
    existing: { displayName: 'Yanshi', api: 'openai-completions', baseURL: 'http://y/v1', models: existingModels },
    providers: {},
    onSaved: () => {},
    ...overrides,
  })
}

const FULL_LEVELS = { off: 'off', minimal: 'minimal', low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' }

describe('存量 models[] 读入草案：reasoningEfforts 无损归档（U10，D3 读改写保真）', () => {
  it('三档形态精确匹配才归档：全集七档 = all / {off,high} = on-off / {off,high,max:xhigh} = high-max', () => {
    const model = makeModel([
      { id: 'a', name: 'A', input: ['text'], reasoningEfforts: FULL_LEVELS },
      { id: 'b', name: 'B', input: ['text'], reasoningEfforts: { off: 'off', high: 'high' } },
      { id: 'c', name: 'C', input: ['text'], reasoningEfforts: { off: 'off', high: 'high', max: 'xhigh' } },
    ]).getSnapshot().models
    expect(model.map((draft) => draft.thinkingStrategy)).toEqual(['all', 'on-off', 'high-max'])
    expect(model[0].reasoningEffortsRaw).toBeUndefined()
  })

  it('非三档形态归 preserve 并携带原始值：子集字典 / off 值空串的字典 / 值拼写不同的字典', () => {
    const subset = { off: 'off', low: 'low' }
    const emptyOff = { off: '', high: 'high' }
    const alienSpelling = { off: 'off', high: 'high', max: 'max' } // 三键但 max 拼写非 xhigh
    const model = makeModel([
      { id: 'a', name: 'A', input: ['text'], reasoningEfforts: subset },
      { id: 'b', name: 'B', input: ['text'], reasoningEfforts: emptyOff },
      { id: 'c', name: 'C', input: ['text'], reasoningEfforts: alienSpelling },
    ]).getSnapshot().models
    expect(model.map((draft) => draft.thinkingStrategy)).toEqual(['preserve', 'preserve', 'preserve'])
    expect(model[0].reasoningEffortsRaw).toEqual(subset)
    expect(model[1].reasoningEffortsRaw).toEqual(emptyOff)
    expect(model[2].reasoningEffortsRaw).toEqual(alienSpelling)
  })

  it('省略 reasoningEfforts（宿主语义 = 沿用目录能力）与 false（非思考）分别归 preserve 省略态与 none', () => {
    const model = makeModel([
      { id: 'a', name: 'A', input: ['text'] },
      { id: 'b', name: 'B', input: ['text'], reasoningEfforts: false },
    ]).getSnapshot().models
    expect(model[0].thinkingStrategy).toBe('preserve')
    expect(model[0].reasoningEffortsRaw).toBeUndefined() // 写回时同样省略该字段
    expect(model[1].thinkingStrategy).toBe('none')
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
