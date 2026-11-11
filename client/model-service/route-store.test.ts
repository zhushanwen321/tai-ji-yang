import { describe, expect, it } from 'vitest'
import { RoutesListModel, WHITELIST_FIELD } from './route-store'
import type { PluginConfigFormLike } from './credentials-client'
import type { ConfigFormSnapshotLike } from '../persist'
import type { ModelServiceHost } from './settings-client'

/**
 * RoutesListModel 单测（AF-1-1 回归锁定）：commit 成功后的重读读镜像视图，镜像快照滞后于
 * set 落盘时会以旧 revision 旧值整段重建 state——revision 倒退栅栏必须挡住这类回放
 * （state.whitelist 不弹回），同时不得破坏两条正常路径：subscribe 带新 revision 快照的
 * 前进对账、宿主拒绝写时回落 Config 真值。
 */

/** 初始 Config 快照（routes 一条 + 白名单空；revision 可调）。 */
function readySnapshot(options: { revision: number; whitelist: string[] }): ConfigFormSnapshotLike {
  return {
    status: 'ready',
    value: {
      routes: [{ id: 'verify-route', name: 'verify-route', members: [] }],
      whitelist: options.whitelist,
    },
    revision: options.revision,
    writable: true,
  }
}

/** 假插件 Config 表单：快照可脚本化换入（deliver = 宿主镜像送达并触发 subscribe）。 */
function fakeConfigForm(initial: ConfigFormSnapshotLike): PluginConfigFormLike & {
  sets: { field: string; value: unknown }[]
  setAccepted: boolean
  deliver(next: ConfigFormSnapshotLike): void
} {
  let snapshot = initial
  const listeners = new Set<() => void>()
  return {
    sets: [],
    setAccepted: true,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    async set(field, value) {
      this.sets.push({ field, value })
      return this.setAccepted
    },
    deliver(next) {
      snapshot = next
      for (const listener of [...listeners]) listener()
    },
  }
}

/** 假宿主 remote：探测面全空（llm-pi-ai 不可用 → 标注降级为不标注，不干扰被测路径）。 */
function fakeRemote(): ModelServiceHost {
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

/** 放行 subscribe 触发的 void load() 到 state 赋值点（首个 await 前的同步段）。 */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('RoutesListModel revision 倒退栅栏（AF-1-1）', () => {
  it('toggle 后镜像滞后（旧 revision 旧值回放）：state.whitelist 不弹回，乐观写保留', async () => {
    const form = fakeConfigForm(readySnapshot({ revision: 1, whitelist: [] }))
    const model = new RoutesListModel({ remote: fakeRemote(), configForm: form })
    await model.pending
    expect(model.getSnapshot().whitelist).toEqual([])

    await model.toggleWhitelist('verify-route')
    // set 已发出整字段写且被宿主接受，但镜像快照未追平（仍 revision 1、whitelist 空）——
    // commit 后的重读若采纳该旧快照即弹回（修复前红：whitelist 被重建为 []）。
    expect(form.sets).toEqual([{ field: WHITELIST_FIELD, value: ['verify-route'] }])
    expect(model.getSnapshot().whitelist).toEqual(['verify-route'])
  })

  it('subscribe 带新 revision 快照完成对账：前进照常采纳（栅栏只挡倒退）', async () => {
    const form = fakeConfigForm(readySnapshot({ revision: 1, whitelist: [] }))
    const model = new RoutesListModel({ remote: fakeRemote(), configForm: form })
    await model.pending
    await model.toggleWhitelist('verify-route')

    form.deliver(readySnapshot({ revision: 2, whitelist: ['verify-route'] }))
    await settle()
    expect(model.getSnapshot().whitelist).toEqual(['verify-route'])
    expect(model.getSnapshot().status).toBe('ready')
  })

  it('已采纳新 revision 后旧快照重放（subscribe 再触发）：state 不回退', async () => {
    const form = fakeConfigForm(readySnapshot({ revision: 1, whitelist: [] }))
    const model = new RoutesListModel({ remote: fakeRemote(), configForm: form })
    await model.pending
    await model.toggleWhitelist('verify-route')
    form.deliver(readySnapshot({ revision: 2, whitelist: ['verify-route'] }))
    await settle()

    form.deliver(readySnapshot({ revision: 1, whitelist: [] }))
    await settle()
    expect(model.getSnapshot().whitelist).toEqual(['verify-route'])
  })

  it('栅栏拒收滞后回放时探测面照跑：派生标注照常刷新、Config 派生面不被旧快照重建', async () => {
    const remote = fakeRemote()
    const form = fakeConfigForm(readySnapshot({ revision: 1, whitelist: [] }))
    const model = new RoutesListModel({ remote, configForm: form })
    await model.pending
    // 初始注册表空 → verify-route 注册探测失败（V7 registrationFailed 标注在场）。
    expect(model.getSnapshot().registrationFailed).toEqual(['verify-route'])

    await model.toggleWhitelist('verify-route')
    // 写被接受（栅栏前移）后镜像仍滞后在 rev 1；宿主注册表此间前进（探测数据与滞后快照无关）。
    remote.llm.listProviders = async () => ({ ok: true, value: [{ id: 'taiji-route-verify-route', name: 'verify-route' }] })
    form.deliver(readySnapshot({ revision: 1, whitelist: [] }))
    await settle()
    await settle()
    // Config 派生面不被旧快照重建（乐观 whitelist 保留），探测面照常刷新（注册探测通过）。
    expect(model.getSnapshot().whitelist).toEqual(['verify-route'])
    expect(model.getSnapshot().registrationFailed).toEqual([])
  })

  it('非 ready 态重置栅栏：命名空间重开（revision 重新从低值起）后照常采纳', async () => {
    const form = fakeConfigForm(readySnapshot({ revision: 1, whitelist: [] }))
    const model = new RoutesListModel({ remote: fakeRemote(), configForm: form })
    await model.pending
    await model.toggleWhitelist('verify-route')
    form.deliver(readySnapshot({ revision: 2, whitelist: ['verify-route'] }))
    await settle()

    form.deliver({ status: 'unavailable', value: undefined, revision: undefined, writable: false })
    await settle()
    expect(model.getSnapshot().status).toBe('unavailable')

    form.deliver(readySnapshot({ revision: 1, whitelist: [] }))
    await settle()
    expect(model.getSnapshot().status).toBe('ready')
    expect(model.getSnapshot().whitelist).toEqual([])
  })

  it('宿主拒绝写入时回落 Config 真值（拒绝不前移栅栏，重读照常生效）', async () => {
    const form = fakeConfigForm(readySnapshot({ revision: 1, whitelist: [] }))
    form.setAccepted = false
    const model = new RoutesListModel({ remote: fakeRemote(), configForm: form })
    await model.pending

    await model.toggleWhitelist('verify-route')
    // 拒绝 = 宿主侧 revision 未前移 → 栅栏不前移 → commit 后的重读（revision 1 ≥ 1）正常
    // 采纳，state 回落 Config 真值（whitelist 空）。
    expect(model.getSnapshot().whitelist).toEqual([])
    expect(form.sets).toHaveLength(1)
  })
})
