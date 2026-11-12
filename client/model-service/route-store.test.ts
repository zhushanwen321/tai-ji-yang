import { describe, expect, it, vi } from 'vitest'
import { moveMember, RoutesListModel, ROUTES_FIELD, WHITELIST_FIELD , parseRegistrationError } from './route-store'
import type { PluginConfigFormLike } from './credentials-client'
import type { ConfigFormSnapshotLike } from '../persist'
import type { RouteEntry } from './route-evaluate'
import type { ModelServiceHost } from './settings-client'

/**
 * RoutesListModel 单测（AF-1-1 回归锁定）：commit 成功后的重读读镜像视图，镜像快照滞后于
 * set 落盘时会以旧 revision 旧值整段重建 state——revision 倒退栅栏必须挡住这类回放
 * （state.whitelist 不弹回），同时不得破坏两条正常路径：subscribe 带新 revision 快照的
 * 前进对账、宿主拒绝写时回落 Config 真值。
 *
 * 路由交互定稿增测（本文件第二批）：renameRoute 改名重派生 + 白名单迁移、saveRoute 拒绝
 * 回传、selectableProviders 快照口径（未接入目录 route 不直出）、注册探测的 id 占用识别
 * （物理 provider 撞 taiji-route-* 形态）、moveMember 排序数据交换。
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
    // 首败重试一次（persist.ts save 同款「重读一次再试」）：连续失败 = 两次 set。
    expect(form.sets).toHaveLength(2)
    // 回落完成后显式上报必须在场（SC9/文件头自声明；终态同步 F1-11：notice 不随重读
    // 重建被吞——load 以 emptySnapshot 展开重建 state，先置后读会清掉上报）。
    expect(model.getSnapshot().notice).toBe('写入被宿主拒绝，已恢复为当前保存值')
  })

  it('首败重试即接受（revision 栅栏拒绝的恢复路径）：写入落盘、无上报（路由卡即时保存连发的丢失修复）', async () => {
    const form = fakeConfigForm(readySnapshot({ revision: 1, whitelist: [] }))
    // 首次 set 携带过期栅栏被拒（镜像滞后于前一次写入），宿主拒绝时已自做镜像重读，
    // 第二次 set 用新栅栏——接受。
    let calls = 0
    form.set = async (field: string, value: unknown) => {
      calls += 1
      form.sets.push({ field, value })
      return calls > 1
    }
    const model = new RoutesListModel({ remote: fakeRemote(), configForm: form })
    await model.pending

    const accepted = await model.toggleWhitelist('verify-route')
    expect(accepted).toBe(true)
    expect(form.sets).toHaveLength(2)
    expect(model.getSnapshot().whitelist).toEqual(['verify-route'])
    // 重试成功不上报（notice/error 双无）。
    expect(model.getSnapshot().notice).toBeUndefined()
    expect(model.getSnapshot().error).toBeUndefined()
  })
})

/** 探测面可脚本化的假宿主（快照 providers 段 / 注册表 / 目录可注入）。 */
function probeRemote(options: {
  registered?: string[]
  providers?: Record<string, unknown>
  directory?: { provider: string; displayName: string }[]
} = {}): ModelServiceHost {
  return {
    settings: {
      describe: async () => ({
        ok: true,
        value: { writable: true, namespaces: [{ ns: 'llm-pi-ai', value: { providers: options.providers ?? {} }, revision: 1 }] },
      }),
      mutate: async () => ({ ok: true, value: { ns: 'llm-pi-ai' } }),
    },
    llm: {
      listProviders: async () => ({ ok: true, value: (options.registered ?? []).map((id) => ({ id, name: id })) }),
      listConfigurableProviders: async () => ({
        ok: true,
        value: (options.directory ?? []).map((row) => ({ provider: row.provider, displayName: row.displayName, settingsNs: 'llm-pi-ai', settingsPath: ['providers', row.provider] })),
      }),
      discoverModels: async () => ({ ok: true, value: [] }),
    },
    credentials: {
      describe: async () => ({ ok: true, value: {} }),
      set: async () => ({ ok: true, value: undefined }),
      unset: async () => ({ ok: true, value: undefined }),
    },
  }
}

/** 带自定义 routes/whitelist 的 Config 快照。 */
function routesSnapshot(routes: RouteEntry[], whitelist: string[]): ConfigFormSnapshotLike {
  return { status: 'ready', value: { routes, whitelist }, revision: 1, writable: true }
}

describe('selectableProviders 快照口径（路由交互定稿 A4）', () => {
  it('只列 providers 快照已存在的条目；taiji-route-* 前缀剔除；未接入的目录 route 不直出', async () => {
    const remote = probeRemote({
      providers: {
        alpha: { displayName: 'Alpha', models: [{ id: 'a1', name: 'A1' }, { id: '' }] },
        'taiji-route-x': { displayName: '幽灵', models: [] },
        beta: {},
      },
      directory: [
        { provider: 'alpha', displayName: 'Alpha 目录名' },
        { provider: 'beta', displayName: 'Beta 目录名' },
        { provider: 'zeta', displayName: 'Zeta（未接入）' },
      ],
    })
    const model = new RoutesListModel({ remote, configForm: fakeConfigForm(routesSnapshot([], [])) })
    await model.pending
    const selectable = model.getSnapshot().selectableProviders
    // 快照存在且可枚举：alpha（displayName 优先）+ beta（displayName 缺失 → 目录名回落）。
    expect(selectable.map((row) => ({ key: row.key, name: row.name }))).toEqual([
      { key: 'alpha', name: 'Alpha' },
      { key: 'beta', name: 'Beta 目录名' },
    ])
    // 模型清单收窄：空 id 条目丢弃。
    expect(selectable[0].models).toEqual([{ id: 'a1', name: 'A1' }])
    // 未接入的 zeta 不直出、taiji-route-* 不直出。
    expect(selectable.some((row) => row.key === 'zeta')).toBe(false)
    expect(selectable.some((row) => row.key === 'taiji-route-x')).toBe(false)
  })

  it('llm-pi-ai 快照缺席（宿主未装）时选择器为空（不虚构目录候选）', async () => {
    const remote = probeRemote({
      registered: [],
      directory: [{ provider: 'alpha', displayName: 'Alpha' }],
    })
    remote.settings.describe = async () => ({ ok: true, value: { writable: true, namespaces: [] } })
    const model = new RoutesListModel({ remote, configForm: fakeConfigForm(routesSnapshot([], [])) })
    await model.pending
    expect(model.getSnapshot().selectableProviders).toEqual([])
  })
})

describe('注册探测的 id 占用识别（V7 可构造形态）', () => {
  const routes: RouteEntry[] = [
    { id: 'p-1', name: '验证路由', members: [] },
    { id: 'p-2', name: '另一条', members: [] },
  ]

  it('id 被物理 provider 占用（providers 段含 taiji-route-p-1 条目）→ 判注册失败', async () => {
    const remote = probeRemote({
      registered: ['taiji-route-p-1', 'taiji-route-p-2'],
      providers: { 'taiji-route-p-1': { displayName: '占用者' } },
    })
    const model = new RoutesListModel({ remote, configForm: fakeConfigForm(routesSnapshot(routes, [])) })
    await model.pending
    // p-1 的宿主 id 归物理适配器（DUPLICATE_ADAPTER 拒注册），p-2 真注册成功。
    expect(model.getSnapshot().registrationFailed).toEqual(['p-1'])
  })

  it('无占用时维持原判定：注册表缺 taiji-route-<id> 即失败', async () => {
    const remote = probeRemote({ registered: ['taiji-route-p-1'] })
    const model = new RoutesListModel({ remote, configForm: fakeConfigForm(routesSnapshot(routes, [])) })
    await model.pending
    expect(model.getSnapshot().registrationFailed).toEqual(['p-2'])
  })
})

describe('renameRoute（改名重派生 + 白名单迁移，路由交互定稿 B）', () => {
  it('新 id 派生替换旧条目，白名单旧 id 同步迁移，成员原样保留', async () => {
    const routes: RouteEntry[] = [
      { id: 'old', name: 'Old', members: [{ provider: 'alpha', model: 'a1', order: 1, condition: { type: 'none' } }] },
    ]
    const form = fakeConfigForm(routesSnapshot(routes, ['old', 'ghost']))
    const model = new RoutesListModel({ remote: fakeRemote(), configForm: form })
    await model.pending

    const updated = await model.renameRoute('old', 'New Route')
    expect(updated).toEqual({ id: 'new-route', name: 'New Route', members: routes[0].members })
    expect(model.getSnapshot().routes[0].id).toBe('new-route')
    // 白名单迁移只动旧 id（悬挂条目 ghost 不受影响）。
    expect(model.getSnapshot().whitelist).toEqual(['new-route', 'ghost'])
    // 提交次序先 whitelist 迁移后 routes 替换：两笔独立整字段写无跨字段事务，失败落在
    // 第二笔 routes 侧时旧路由完整在场、新 id 只表现为悬挂条目（用户重试即可收敛）。
    expect(form.sets).toEqual([
      { field: WHITELIST_FIELD, value: ['new-route', 'ghost'] },
      { field: ROUTES_FIELD, value: model.getSnapshot().routes },
    ])
  })

  it('新名撞其余路由 id 时派生加序号；旧 id 自身不占位（可改回同形 id）', async () => {
    const routes: RouteEntry[] = [
      { id: 'x', name: 'X', members: [] },
      { id: 'x-2', name: 'X two', members: [] },
    ]
    const model = new RoutesListModel({ remote: fakeRemote(), configForm: fakeConfigForm(routesSnapshot(routes, [])) })
    await model.pending

    const updated = await model.renameRoute('x', 'x-2')
    // 旧 id x 与旧白名单条目不参与查重，新名 x-2 撞第二条 → 加序号。
    expect(updated?.id).toBe('x-2-2')
  })

  it('宿主拒绝写入时返回 undefined 且回落旧值（notice 上报在场）', async () => {
    const form = fakeConfigForm(routesSnapshot([{ id: 'old', name: 'Old', members: [] }], ['old']))
    form.setAccepted = false
    const model = new RoutesListModel({ remote: fakeRemote(), configForm: form })
    await model.pending

    const updated = await model.renameRoute('old', 'New')
    expect(updated).toBeUndefined()
    expect(model.getSnapshot().notice).toBe('写入被宿主拒绝，已恢复为当前保存值')
  })

  it('空名或未知路由 id：不动作（返回 undefined，零写入）', async () => {
    const form = fakeConfigForm(routesSnapshot([{ id: 'old', name: 'Old', members: [] }], []))
    const model = new RoutesListModel({ remote: fakeRemote(), configForm: form })
    await model.pending
    expect(await model.renameRoute('old', '   ')).toBeUndefined()
    expect(await model.renameRoute('missing', 'New')).toBeUndefined()
    expect(form.sets).toHaveLength(0)
  })

  it('共享 revision 推进 + 滞后镜像投递改名前内容：state 保持新 id + 单发收敛重写', async () => {
    const before: RouteEntry[] = [{ id: 'old', name: 'Old', members: [] }]
    const form = fakeConfigForm(routesSnapshot(before, ['old']))
    const model = new RoutesListModel({ remote: fakeRemote(), configForm: form })
    await model.pending

    const updated = await model.renameRoute('old', 'New')
    expect(updated?.id).toBe('new')
    // 滞后镜像投递改名前内容（revision 被其他命名空间写入推进到 5 > appliedRevision，
    // 内容 = 覆写前值）：revision 栅栏放行，内容级回放守卫须拦下——rename 走
    // writeRoutesAndWhitelist 原子提交通道（登记齐全），滞后内容命中 preImages 不采纳。
    // （修复前：rename 裸 commit 绕过 trackPreImage/lastWritten 登记，lastWritten 为
    // undefined 时内容守卫不触发，滞后内容被当外部变更采纳，route id 弹回旧值。）
    const setsBefore = form.sets.length
    form.deliver({ status: 'ready', value: { routes: before, whitelist: ['old'] }, revision: 5, writable: true })
    await settle()
    await settle()
    expect(model.getSnapshot().routes.map((route) => route.id)).toEqual(['new'])
    expect(model.getSnapshot().whitelist).toEqual(['new'])
    // 单发收敛重写恰好一轮（ROUTES + WHITELIST 两个裸 set）。
    expect(form.sets.length).toBe(setsBefore + 2)
    // 同内容再次投递：reconciledFor 防抖，不再重写。
    form.deliver({ status: 'ready', value: { routes: before, whitelist: ['old'] }, revision: 6, writable: true })
    await settle()
    await settle()
    expect(form.sets.length).toBe(setsBefore + 2)
    expect(model.getSnapshot().routes.map((route) => route.id)).toEqual(['new'])
  })

  it('滞后镜像投递两笔之间的中间态（routes 旧 + whitelist 新）：同样命中回放守卫不采纳', async () => {
    const before: RouteEntry[] = [{ id: 'old', name: 'Old', members: [] }]
    const form = fakeConfigForm(routesSnapshot(before, ['old']))
    const model = new RoutesListModel({ remote: fakeRemote(), configForm: form })
    await model.pending

    await model.renameRoute('old', 'New')
    // 中间态（第一笔已落盘、第二笔未达的镜像快照）：由原子通道的 trackPreImageContent
    // 登记（routes 旧 + whitelist 新），命中 preImages → 不当外部变更采纳（否则会话写入
    // 权威让位，乐观 routes 弹回）。
    form.deliver({
      status: 'ready',
      value: { routes: before, whitelist: ['new'] },
      revision: 5,
      writable: true,
    })
    await settle()
    await settle()
    expect(model.getSnapshot().routes.map((route) => route.id)).toEqual(['new'])
    expect(model.getSnapshot().whitelist).toEqual(['new'])
  })

  it('改名全程零中间态 notify：乐观更新一次到位，新 id 不闪现「路由已删除」标注（MF-2-3）', async () => {
    const before: RouteEntry[] = [{ id: 'old', name: 'Old', members: [] }]
    const form = fakeConfigForm(routesSnapshot(before, ['old']))
    const model = new RoutesListModel({ remote: fakeRemote(), configForm: form })
    await model.pending
    const observed: { routes: string[]; whitelist: string[]; hanging: string[] }[] = []
    model.subscribe(() => {
      const snap = model.getSnapshot()
      observed.push({ routes: snap.routes.map((route) => route.id), whitelist: [...snap.whitelist], hanging: [...snap.hanging] })
    })

    await model.renameRoute('old', 'New')
    // 每一帧 notify 都不得呈现中间态：whitelist 已迁移新 id 而 routes 仍旧（新 id 判悬挂）
    // 的帧在分两笔提交时可见（修复前首帧 hanging = ['new']），原子通道一帧到位。
    expect(observed.length).toBeGreaterThan(0)
    for (const frame of observed) {
      expect(frame.hanging).not.toContain('new')
      if (frame.whitelist.includes('new')) expect(frame.routes).toContain('new')
    }
    const final = model.getSnapshot()
    expect(final.routes.map((route) => route.id)).toEqual(['new'])
    expect(final.whitelist).toEqual(['new'])
    expect(final.hanging).toEqual([])
  })
})

describe('saveRoute 回传与 moveMember 数据交换（路由交互定稿 A2/A8）', () => {
  it('saveRoute 接受时回传 true（成员即时保存通道的 toast 依据）', async () => {
    const routes: RouteEntry[] = [{ id: 'a', name: 'A', members: [] }]
    const model = new RoutesListModel({ remote: fakeRemote(), configForm: fakeConfigForm(routesSnapshot(routes, [])) })
    await model.pending
    expect(await model.saveRoute({ id: 'a', name: 'A', members: [{ provider: 'p', model: 'm', order: 1, condition: { type: 'none' } }] })).toBe(true)
    expect(model.getSnapshot().routes[0].members).toHaveLength(1)
  })

  it('moveMember：move 语义（from 移到 to，其余顺移）、order 重排、原数组不动', () => {
    const source = [
      { provider: 'p1', model: 'm1', order: 1, condition: { type: 'none' } },
      { provider: 'p2', model: 'm2', order: 2, condition: { type: 'none' } },
      { provider: 'p3', model: 'm3', order: 3, condition: { type: 'none' } },
    ]
    const moved = moveMember(source, 0, 2)
    expect(moved.map((member) => member.provider)).toEqual(['p2', 'p3', 'p1'])
    expect(moved.map((member) => member.order)).toEqual([1, 2, 3])
    expect(source.map((member) => member.provider)).toEqual(['p1', 'p2', 'p3'])
  })

  it('moveMember：越界或原位返回原数组引用（调用方以引用同异判无操作）', () => {
    const source = [
      { provider: 'p1', model: 'm1', order: 1, condition: { type: 'none' } },
      { provider: 'p2', model: 'm2', order: 2, condition: { type: 'none' } },
    ]
    expect(moveMember(source, 0, 0)).toBe(source)
    expect(moveMember(source, 0, -1)).toBe(source)
    expect(moveMember(source, 0, 5)).toBe(source)
    expect(moveMember(source, 5, 0)).toBe(source)
  })
})

describe('内容级回放守卫（共享 revision 计数下滞后内容蒙混栅栏的防护）', () => {
  function whitelistSnapshot(revision: number, whitelist: string[]): ConfigFormSnapshotLike {
    return {
      status: 'ready',
      value: { routes: [{ id: 'verify-route', name: 'verify-route', members: [] }], whitelist },
      revision,
      writable: true,
    }
  }

  it('revision 被外部写入推进的滞后内容不采纳：state 保留会话写入值 + 单发收敛重写', async () => {
    const form = fakeConfigForm(whitelistSnapshot(1, []))
    const model = new RoutesListModel({ remote: fakeRemote(), configForm: form })
    await model.pending
    await model.toggleWhitelist('verify-route')
    // toggle 已接受（applied = 2）。滞后镜像投递：revision 5（被其他命名空间写入推进）+
    // 内容 = 覆写前值（whitelist 空）——栅栏放行、内容守卫拦下。
    const setsBefore = form.sets.length
    form.deliver(whitelistSnapshot(5, []))
    await settle()
    await settle()
    expect(model.getSnapshot().whitelist).toEqual(['verify-route'])
    // 单发收敛：内容收敛重写恰好一轮（ROUTES + WHITELIST 两个裸 set）。
    expect(form.sets.length).toBe(setsBefore + 2)
    // 同内容再次投递：reconciledFor 防抖，不再重写。
    form.deliver(whitelistSnapshot(6, []))
    await settle()
    await settle()
    expect(form.sets.length).toBe(setsBefore + 2)
    expect(model.getSnapshot().whitelist).toEqual(['verify-route'])
  })

  it('真外部变更（内容 ≠ 会话写入值 ≠ 覆写前值）照常采纳：会话写入权威让位', async () => {
    const form = fakeConfigForm(whitelistSnapshot(1, []))
    const model = new RoutesListModel({ remote: fakeRemote(), configForm: form })
    await model.pending
    await model.toggleWhitelist('verify-route')
    // 其他窗口把 whitelist 改成另一条目：revision 前进 + 内容既非写入值也非覆写前值。
    form.deliver(whitelistSnapshot(5, ['other-route']))
    await settle()
    await settle()
    expect(model.getSnapshot().whitelist).toEqual(['other-route'])
    // 此后镜像回放外部内容照常采纳（无写入权威时无条件采纳）。
    form.deliver(whitelistSnapshot(6, ['other-route', 'another']))
    await settle()
    await settle()
    expect(model.getSnapshot().whitelist).toEqual(['other-route', 'another'])
  })

  it('收敛重写被拒不置位 reconciledFor：下一次同内容投递能再次尝试收敛', async () => {
    const form = fakeConfigForm(whitelistSnapshot(1, []))
    const model = new RoutesListModel({ remote: fakeRemote(), configForm: form })
    await model.pending
    await model.toggleWhitelist('verify-route')
    // 滞后内容投递，但收敛重写的两个裸 set 均被宿主拒绝（返回 false 不抛异常）——
    // 不置位 reconciledFor（修复前：先置位，被拒后同内容投递永久跳过收敛）。
    form.setAccepted = false
    form.deliver(whitelistSnapshot(5, []))
    await settle()
    await settle()
    // 乐观状态保留（滞后内容未采纳），收敛尝试发生过（两个被拒的裸 set）。
    expect(model.getSnapshot().whitelist).toEqual(['verify-route'])
    const setsAfterRefused = form.sets.length
    // 同内容再次投递（revision 继续前进）：再次尝试收敛一轮（ROUTES + WHITELIST）。
    form.deliver(whitelistSnapshot(6, []))
    await settle()
    await settle()
    expect(form.sets.length).toBe(setsAfterRefused + 2)
    expect(model.getSnapshot().whitelist).toEqual(['verify-route'])
  })

  it('删除路由的悬挂在乐观更新即重算（不等镜像回读——V6 步骤 4 的可观察事实不再依赖滞后镜像）', async () => {
    const form = fakeConfigForm(whitelistSnapshot(1, ['verify-route']))
    const model = new RoutesListModel({ remote: fakeRemote(), configForm: form })
    await model.pending
    expect(model.getSnapshot().hanging).toEqual([])

    await model.deleteRoute('verify-route')
    expect(model.getSnapshot().routes).toEqual([])
    // 删除已乐观生效：hanging = whitelist ∖ routes 立即呈现（镜像滞后/毒回放不再吞掉它）。
    expect(model.getSnapshot().hanging).toEqual(['verify-route'])
  })
})


describe('注册探测降级（读取失败不标注 + 近期写入宽限）', () => {
  it('listProviders 读取失败（探测不可用）：registrationFailed 不标注（与 memberAvailability 同口径）', async () => {
    const remote = fakeRemote()
    // 注册表读取整链失败（RPC 拒绝）：修复前降级为空集 → 差集判定把全部路由误标红。
    remote.llm.listProviders = async () => { throw new Error('rpc down') }
    const form = fakeConfigForm(routesSnapshot([{ id: 'r1', name: 'R1', members: [] }], []))
    const model = new RoutesListModel({ remote, configForm: form })
    await model.pending
    expect(model.getSnapshot().registrationFailed).toEqual([])
  })

  it('近期写入宽限：写入后探测先于注册执行不标失败；宽限过期后的探测照常标注', async () => {
    // 只伪造 Date（settle 的 setTimeout 保持真实）：宽限判定基于 writtenAt 与探测时刻差。
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const remote = fakeRemote() // 注册表恒空 = 差集恒在
      const form = fakeConfigForm(routesSnapshot([], []))
      const model = new RoutesListModel({ remote, configForm: form })
      await model.pending
      // 本会话刚写入 fresh（writtenAt = 当前时刻）：探测 RPC 与 Node 半场注册执行无先后
      // 保证，宽限窗（5s）内差集不标失败（防新建路由的暂态假失败）。
      await model.createRoute('Fresh')
      expect(model.getSnapshot().routes.map((route) => route.id)).toEqual(['fresh'])
      expect(model.getSnapshot().registrationFailed).toEqual([])
      // 宽限过期（5s + 1s 余量）后的下一次探测：照常标注。
      vi.advanceTimersByTime(6000)
      await model.load()
      expect(model.getSnapshot().registrationFailed).toEqual(['fresh'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('whitelist 写入不重置既有失败路由标注（宽限锚定 routes 写入时刻，MF-2-2）', async () => {
    const remote = fakeRemote() // 注册表恒空 = 注册恒失败
    // 初始路由非本会话写入（lastWritten 无 routes 写入历史，无宽限）：pending 后标注在场。
    const form = fakeConfigForm(routesSnapshot([{ id: 'a', name: 'A', members: [] }], []))
    const model = new RoutesListModel({ remote, configForm: form })
    await model.pending
    expect(model.getSnapshot().registrationFailed).toEqual(['a'])

    // 勾选该路由（whitelist 写入，触发 commit 内重读 + probeDerived）：修复前 writeWhitelist
    // 同样刷新宽限时刻 → 全部路由进宽限集 → 红徽消失且此后无新 load 即不恢复（whitelist
    // 不影响注册集合，注册状态未变）；修复后宽限仍锚定 routes 写入（本会话无）→ 标注保持。
    await model.toggleWhitelist('a')
    expect(model.getSnapshot().registrationFailed).toEqual(['a'])
  })

  it('routes 写入的宽限窗不被后续 whitelist 写入清除（锚点保留，非清空）', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const remote = fakeRemote()
      const form = fakeConfigForm(routesSnapshot([], []))
      const model = new RoutesListModel({ remote, configForm: form })
      await model.pending
      await model.createRoute('Fresh') // routes 写入 → routesWrittenAt = t0
      expect(model.getSnapshot().registrationFailed).toEqual([]) // 宽限内不标
      await model.toggleWhitelist('fresh') // whitelist 写入：锚点保留（修复不清除宽限）
      expect(model.getSnapshot().registrationFailed).toEqual([])
      // 自 t0 起算宽限过期（whitelist 写入不推迟锚点）后的下一次探测：照常标注。
      vi.advanceTimersByTime(6000)
      await model.load()
      expect(model.getSnapshot().registrationFailed).toEqual(['fresh'])
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('parseRegistrationError（Node 半场诊断透传的解析）', () => {
  it('标准形态：origin + provider id 集 + detail，id 剥 taiji-route- 前缀', () => {
    expect(
      parseRegistrationError('initial taiji-route-desktop-demo: an adapter for provider "x" is already registered'),
    ).toEqual({
      routeIds: ['desktop-demo'],
      origin: 'initial',
      detail: 'an adapter for provider "x" is already registered',
    })
  })

  it('多 provider 集合逐个剥前缀、detail 保留换行', () => {
    expect(
      parseRegistrationError('config-update taiji-route-a,taiji-route-b: line1\nline2'),
    ).toEqual({
      routeIds: ['a', 'b'],
      origin: 'config-update',
      detail: 'line1\nline2',
    })
  })

  it('形态不符（无 origin/scope 结构）原文进 detail', () => {
    expect(parseRegistrationError('some raw error text')).toEqual({
      routeIds: [],
      origin: '',
      detail: 'some raw error text',
    })
  })

  it('undefined / 空串返回 undefined', () => {
    expect(parseRegistrationError(undefined)).toBeUndefined()
    expect(parseRegistrationError('')).toBeUndefined()
  })
})