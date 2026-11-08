import { describe, expect, it } from 'vitest'
import { PLUGIN_ENTRY_ID } from '../persist'
import { DEFAULT_PROJECT_ID, ProjectStore } from './store'

/**
 * ProjectStore 单测（设计 §1 概念模型 / §2.1 数据与持久层的机器可判部分）。
 *
 * mock 形态照 client/apply.test.ts 的 FakeForm 模式（宿主语义：接受则折回镜像、拒绝则先
 * 重读一次再返回 false）；被测模块的引入链 react-free（store → persist → theme/resolve），
 * 可直接 import，无需 tsx 夹具。锁死五件事：
 *   · sanitize：脏数据（非对象条目 / 缺 id 缺 name / 重复 id / 非法类型）装载期收敛；
 *   · CRUD / 排序 / 归属：整字段写的内容、乐观 notify、幂等与非法入参拒绝；
 *   · 写入被拒 → 重读重试一次 → 仍拒 → 四段式上报，且会话内不回滚；
 *   · 外部快照采纳（含在途写入的序号防护）；
 *   · dispose 幂等与订阅反注册。
 */

/** 单次 form.set 的记录。 */
interface FormCall {
  field: string
  value: unknown
}

/** 假宿主：可控的镜像状态、写入结果队列与（可选的）手动放行闸门。 */
function createHarness(options: {
  section?: Record<string, unknown>
  status?: 'loading' | 'ready' | 'unavailable'
  writeResults?: boolean[]
  rejectWith?: Error
  /** true = 每次 set 挂起，等 releaseGate 放行（测在途写入防护）。 */
  gated?: boolean
} = {}) {
  let status: 'loading' | 'ready' | 'unavailable'
    = options.status ?? (options.section === undefined ? 'loading' : 'ready')
  let value: Record<string, unknown> | undefined = options.section
  let revision = 7
  const listeners = new Set<() => void>()
  const setCalls: FormCall[] = []
  const writeResults = [...(options.writeResults ?? [true])]
  const reports: string[] = []
  const gates: Array<(accepted: boolean) => void> = []

  const notify = () => {
    for (const listener of [...listeners]) listener()
  }
  const foldBack = (field: string, next: unknown) => {
    value = { ...(value ?? {}), [field]: next }
  }

  const form = {
    getSnapshot: () => ({ status, value, revision, writable: true }),
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set(field: string, next: unknown): Promise<boolean> {
      setCalls.push({ field, value: next })
      if (options.rejectWith !== undefined) return Promise.reject(options.rejectWith)
      if (options.gated) return new Promise<boolean>((resolve) => { gates.push(resolve) })
      const accepted = writeResults.length > 0 ? (writeResults.shift() as boolean) : true
      // 宿主语义（ConfigFormController.mutate / recover）：接受则折回镜像；拒绝则先重读
      // 一次镜像再返回 false。两条路都会触发一次订阅通知。
      if (accepted) foldBack(field, next)
      if (status !== 'unavailable') status = 'ready'
      revision += 1
      notify()
      return Promise.resolve(accepted)
    },
  }

  const host = {
    configForms: {
      get(entryId: string) {
        expect(entryId).toBe(PLUGIN_ENTRY_ID)
        return form
      },
    },
    logger: {
      error(message: string) { reports.push(message) },
      warn() {},
    },
  }

  return {
    host,
    setCalls,
    reports,
    /** 追加写入结果队列（供「先失败后成功」的多段场景中途续注）。 */
    queueResults(...results: boolean[]) {
      writeResults.push(...results)
    },
    /** 镜像外部变更（另一窗口写 / describe 折叠）→ 通知订阅者。 */
    answerMirror(section: Record<string, unknown>) {
      status = 'ready'
      value = section
      revision += 1
      notify()
    },
    /** 命名空间变成未被服务（行未激活 / Host 未导出 Config）。 */
    makeUnavailable() {
      status = 'unavailable'
      value = undefined
      notify()
    },
    /** 放行一个挂起的 gated 写入；accepted=true 时按宿主语义折回镜像并通知。 */
    releaseGate(accepted: boolean) {
      const resolve = gates.shift()
      if (resolve === undefined) throw new Error('没有挂起的写入可放行')
      const last = setCalls[setCalls.length - 1]
      if (last === undefined) throw new Error('放行前没有任何 set 记录')
      if (accepted) foldBack(last.field, last.value)
      if (status !== 'unavailable') status = 'ready'
      revision += 1
      notify()
      resolve(accepted)
    },
    listenerCount: () => listeners.size,
  }
}

/** 等一条纯微任务链（attempt ×2 → report）排空。 */
const flush = () => new Promise<void>((resolve) => { setTimeout(resolve, 0) })

describe('装载期 sanitize（脏数据收敛）', () => {
  it('projects 过滤非对象 / 缺 id / 缺 name / 空 id（默认项目保留字）/ 重复 id / 非法类型；assignments 只留 string→string', () => {
    const harness = createHarness({
      section: {
        appearance: 'xuan',
        projects: [
          { id: 'p1', name: '一' },
          { id: 'p2' }, // 无 name
          { name: '无名' }, // 无 id
          { id: '', name: '空id' }, // '' 是默认项目保留字
          { id: 'p1', name: '重复id' }, // 重复 id（保留首个）
          { id: 42, name: '数字id' }, // id 非字符串
          { id: 'p3', name: '   ' }, // name 全空白（等价无名）
          '垃圾', // 非对象条目
          null,
        ],
        assignments: { s1: 'p1', s2: 123, s3: null, s4: {}, s5: 'ghost' },
      },
    })
    const store = new ProjectStore(harness.host)
    expect(store.getState()).toEqual({
      projects: [{ id: 'p1', name: '一' }],
      // s5 指向不存在的项目：悬空映射保留（派生层视为未映射，惰性清理——设计 §3）
      assignments: { s1: 'p1', s5: 'ghost' },
    })
    expect(store.getStatus()).toBe('ready')
  })

  it('字段整体类型不符（非数组 / 非对象）→ 收敛为空，不炸装载', () => {
    const harness = createHarness({ section: { projects: 'oops', assignments: [1, 2] } })
    const store = new ProjectStore(harness.host)
    expect(store.getState()).toEqual({ projects: [], assignments: {} })
  })

  it('镜像未答（loading）→ 空状态 + loading；首答到达即采纳并通知', () => {
    const harness = createHarness()
    const store = new ProjectStore(harness.host)
    expect(store.getStatus()).toBe('loading')
    expect(store.getState()).toEqual({ projects: [], assignments: {} })
    let notified = 0
    store.subscribe(() => { notified += 1 })
    harness.answerMirror({ projects: [{ id: 'p1', name: '一' }], assignments: {} })
    expect(notified).toBe(1)
    expect(store.getStatus()).toBe('ready')
    expect(store.getState().projects).toEqual([{ id: 'p1', name: '一' }])
  })
})

describe('CRUD / 排序 / 归属：整字段写与乐观 notify', () => {
  function seededStore(extra: { writeResults?: boolean[] } = {}) {
    const harness = createHarness({ section: { projects: [{ id: 'pa', name: '甲' }], assignments: { s1: 'pa' } }, ...extra })
    const store = new ProjectStore(harness.host)
    let notified = 0
    store.subscribe(() => { notified += 1 })
    return { harness, store, notified: () => notified }
  }

  it('createProject：乐观 notify 先于持久化；整字段写全量数组；id 8 字符；返回新建实体', async () => {
    const { harness, store, notified } = seededStore()
    const created = await store.createProject('  乙  ')
    expect(created).toBeDefined()
    expect(created?.name).toBe('乙') // 名字 trim 后入存
    expect(created?.id).toMatch(/^[0-9a-f]{8}$/)
    // 乐观：listener 在写入结算前已被通知（createProject 未 await 时 state 已含新项目）
    expect(notified()).toBe(1)
    expect(store.getState().projects).toEqual([{ id: 'pa', name: '甲' }, { id: created?.id, name: '乙' }])
    await flush()
    expect(harness.setCalls).toEqual([{
      field: 'projects',
      value: [{ id: 'pa', name: '甲' }, { id: created?.id, name: '乙' }],
    }])
  })

  it('createProject 空名 → null，不产生写与通知', async () => {
    const { harness, store, notified } = seededStore()
    expect(await store.createProject('   ')).toBeNull()
    expect(notified()).toBe(0)
    await flush()
    expect(harness.setCalls).toEqual([])
  })

  it('renameProject：全量数组写回且仅目标项改名；未知 id / 默认项目 / 空名 / 同名均不写', async () => {
    const { harness, store, notified } = seededStore()
    expect(await store.renameProject('pa', ' 甲改 ')).toBe(true)
    expect(store.getState().projects).toEqual([{ id: 'pa', name: '甲改' }])
    await flush()
    expect(harness.setCalls).toEqual([{ field: 'projects', value: [{ id: 'pa', name: '甲改' }] }])
    // 非法与幂等入参：不产生第二次写
    expect(await store.renameProject('ghost', '无')).toBe(false)
    expect(await store.renameProject(DEFAULT_PROJECT_ID, '默认')).toBe(false)
    expect(await store.renameProject('pa', '   ')).toBe(false)
    expect(await store.renameProject('pa', '甲改')).toBe(true) // 同名幂等
    await flush()
    expect(harness.setCalls).toHaveLength(1)
    expect(notified()).toBe(1)
  })

  it('deleteProject：先 projects 后 assignments 顺序两次整字段写；剔除指向它的全部映射，其他映射不动', async () => {
    const harness = createHarness({
      section: {
        projects: [{ id: 'pa', name: '甲' }, { id: 'pb', name: '乙' }],
        assignments: { s1: 'pa', s2: 'pa', s3: 'pb' },
      },
    })
    const store = new ProjectStore(harness.host)
    expect(await store.deleteProject('pa')).toBe(true)
    expect(store.getState()).toEqual({
      projects: [{ id: 'pb', name: '乙' }],
      assignments: { s3: 'pb' }, // 指向 pa 的键全部删除 = 归回默认项目
    })
    await flush()
    expect(harness.setCalls.map((call) => call.field)).toEqual(['projects', 'assignments'])
    expect(harness.setCalls[0]?.value).toEqual([{ id: 'pb', name: '乙' }])
    expect(harness.setCalls[1]?.value).toEqual({ s3: 'pb' })
    // 默认项目不可删除；未知 id 不写
    expect(await store.deleteProject(DEFAULT_PROJECT_ID)).toBe(false)
    expect(await store.deleteProject('ghost')).toBe(false)
    expect(harness.setCalls).toHaveLength(2)
  })

  it('reorderProjects：把 dragged 移到 target 之前（跨位 / 前移 / target="" 追加末尾）；无位移与未知 id 不写', async () => {
    const harness = createHarness({
      section: { projects: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }] },
    })
    const store = new ProjectStore(harness.host)
    const ids = () => store.getState().projects.map((project) => project.id)

    expect(await store.reorderProjects('a', 'c')).toBe(true) // a 移到 c 之前
    expect(ids()).toEqual(['b', 'a', 'c'])
    expect(await store.reorderProjects('a', 'b')).toBe(true) // a 移回 b 之前 = 复原原序（真实位移，写一次）
    expect(ids()).toEqual(['a', 'b', 'c'])
    expect(await store.reorderProjects('c', 'a')).toBe(true) // 末位移到首位的 splice 反向支
    expect(ids()).toEqual(['c', 'a', 'b'])
    expect(await store.reorderProjects('b', DEFAULT_PROJECT_ID)).toBe(true) // target='' = 追加末尾
    expect(ids()).toEqual(['c', 'a', 'b']) // b 已在末位 → 无位移
    await flush()
    // 前三次各一次写；第 4 次（无位移）不写 → 共 3 次
    expect(harness.setCalls).toHaveLength(3)
    expect(harness.setCalls.every((call) => call.field === 'projects')).toBe(true)
    // 幂等 / 非法（当前序 [c,a,b]：c 后一位就是 a）
    expect(await store.reorderProjects('a', 'a')).toBe(true) // 自移
    expect(await store.reorderProjects('c', 'a')).toBe(true) // 后一位即目标 → 无位移
    expect(await store.reorderProjects('ghost', 'a')).toBe(false)
    expect(await store.reorderProjects('a', 'ghost')).toBe(false)
    await flush()
    expect(harness.setCalls).toHaveLength(3)
  })

  it('assignSession：整字段写 assignments；归默认 = 删键；幂等与未知项目不写', async () => {
    const harness = createHarness({
      section: { projects: [{ id: 'pa', name: '甲' }], assignments: { s1: 'pa' } },
    })
    const store = new ProjectStore(harness.host)

    expect(await store.assignSession('s2', 'pa')).toBe(true)
    expect(store.getState().assignments).toEqual({ s1: 'pa', s2: 'pa' })
    expect(await store.assignSession('s2', DEFAULT_PROJECT_ID)).toBe(true) // 归默认 = 删键
    expect(store.getState().assignments).toEqual({ s1: 'pa' })
    await flush()
    expect(harness.setCalls.map((call) => call.field)).toEqual(['assignments', 'assignments'])
    expect(harness.setCalls[0]?.value).toEqual({ s1: 'pa', s2: 'pa' })
    expect(harness.setCalls[1]?.value).toEqual({ s1: 'pa' })

    // 幂等：值未变 / 本就未映射又归默认 → 不写
    expect(await store.assignSession('s2', DEFAULT_PROJECT_ID)).toBe(true)
    expect(await store.assignSession('s1', 'pa')).toBe(true)
    // 非法：空 sessionId / 未知项目 id
    expect(await store.assignSession('', 'pa')).toBe(false)
    expect(await store.assignSession('s9', 'ghost')).toBe(false)
    await flush()
    expect(harness.setCalls).toHaveLength(2)
  })
})

describe('写入被拒 / 失败：重试一次后四段式上报，会话内不回滚', () => {
  it('两次被拒 → 上报一条四段式（包名/命名空间+字段/事实/出路），返回 false，乐观值不回滚', async () => {
    const harness = createHarness({
      section: { projects: [], assignments: {} },
      writeResults: [false, false],
    })
    const store = new ProjectStore(harness.host)
    expect(await store.createProject('甲')).toBeDefined()
    await flush()
    // 第一次 + 重读后重试一次，共两次同字段同值
    expect(harness.setCalls).toHaveLength(2)
    expect(harness.reports).toHaveLength(1)
    const message = harness.reports[0] ?? ''
    expect(message).toContain(PLUGIN_ENTRY_ID)
    expect(message).toContain('projects')
    expect(message).toContain('重读一次后重试仍被拒绝')
    expect(message).toContain('status=ready')
    expect(message).toContain('revision=')
    // 会话内不回滚：新建项目仍在内存里
    expect(store.getState().projects).toHaveLength(1)
    expect(store.getLastError()).toBe(message)
  })

  it('先拒后收（第二次接受）→ 不上报，返回 true', async () => {
    const harness = createHarness({ section: { projects: [], assignments: {} }, writeResults: [false, true] })
    const store = new ProjectStore(harness.host)
    expect(await store.createProject('甲')).toBeDefined()
    await flush()
    expect(harness.setCalls).toHaveLength(2)
    expect(harness.reports).toEqual([])
  })

  it('传输异常不外抛：两次 attempt 后上报文案含传输错误明细', async () => {
    const harness = createHarness({ section: { projects: [], assignments: {} }, rejectWith: new Error('connection lost') })
    const store = new ProjectStore(harness.host)
    await expect(store.createProject('甲')).resolves.toBeDefined()
    await flush()
    expect(harness.setCalls).toHaveLength(2)
    expect(harness.reports).toHaveLength(1)
    expect(harness.reports[0]).toContain('传输错误=connection lost')
  })

  it('命名空间未被服务 → 文案指名 Config 声明问题（volatile），不让人去查 revision', async () => {
    const harness = createHarness({ section: {}, writeResults: [false, false] })
    const store = new ProjectStore(harness.host)
    harness.makeUnavailable()
    expect(await store.createProject('甲')).toBeDefined()
    await flush()
    expect(harness.reports).toHaveLength(1)
    expect(harness.reports[0]).toContain('未被宿主服务')
    expect(harness.reports[0]).toContain('volatile')
  })

  it('成功写入清除未消错误（错误行随订阅通道消失）', async () => {
    const harness = createHarness({ section: { projects: [], assignments: {} }, writeResults: [false, false] })
    const store = new ProjectStore(harness.host)
    await store.createProject('甲')
    await flush()
    expect(store.getLastError()).toBeDefined()
    harness.queueResults(true)
    expect(await store.assignSession('s1', store.getState().projects[0]!.id)).toBe(true)
    expect(store.getLastError()).toBeUndefined()
  })
})

describe('外部快照采纳与在途写入防护', () => {
  it('外部快照始终采纳覆盖内存值（与配色域「点过不采纳」不同的取舍）', async () => {
    const harness = createHarness({ section: { projects: [{ id: 'pa', name: '甲' }], assignments: {} } })
    const store = new ProjectStore(harness.host)
    await store.createProject('乙')
    await flush()
    expect(store.getState().projects).toHaveLength(2)
    // 另一窗口改了持久数据 → 采纳为内存权威并通知
    let notified = 0
    store.subscribe(() => { notified += 1 })
    harness.answerMirror({ projects: [{ id: 'px', name: '外部' }], assignments: { s1: 'px' } })
    expect(notified).toBe(1)
    expect(store.getState()).toEqual({ projects: [{ id: 'px', name: '外部' }], assignments: { s1: 'px' } })
  })

  it('同一快照重复通知不重复覆盖（值未变不通知）', () => {
    const harness = createHarness({ section: { projects: [{ id: 'pa', name: '甲' }], assignments: {} } })
    const store = new ProjectStore(harness.host)
    let notified = 0
    store.subscribe(() => { notified += 1 })
    harness.answerMirror({ projects: [{ id: 'pa', name: '甲' }], assignments: {} })
    expect(notified).toBe(0)
  })

  it('unavailable 不清内存数据（会话内权威保持），status 跟随', () => {
    const harness = createHarness({ section: { projects: [{ id: 'pa', name: '甲' }], assignments: {} } })
    const store = new ProjectStore(harness.host)
    harness.makeUnavailable()
    expect(store.getStatus()).toBe('unavailable')
    expect(store.getState().projects).toEqual([{ id: 'pa', name: '甲' }])
  })

  it('在途写入期间的外部通知被跳过（防写前旧值覆盖乐观值）；结算后的外部变更照常采纳', async () => {
    const harness = createHarness({ section: { projects: [], assignments: {} }, gated: true })
    const store = new ProjectStore(harness.host)
    let notified = 0
    store.subscribe(() => { notified += 1 })

    const pending = store.createProject('甲')
    expect(store.getState().projects).toHaveLength(1) // 乐观已生效
    // 写入在途时镜像来了「写前旧值 + 外部变更」：不采纳（否则乐观值被冲掉）
    harness.answerMirror({ projects: [{ id: 'px', name: '外部' }], assignments: {} })
    expect(store.getState().projects).toHaveLength(1)
    expect(store.getState().projects[0]?.name).toBe('甲')

    harness.releaseGate(true)
    await expect(pending).resolves.toBeDefined()
    expect(store.getState().projects[0]?.name).toBe('甲') // 回声也不改内存
    // 写入已结算：后续外部变更正常采纳
    harness.answerMirror({ projects: [{ id: 'py', name: '外部2' }], assignments: {} })
    expect(store.getState().projects).toEqual([{ id: 'py', name: '外部2' }])
    expect(notified).toBeGreaterThanOrEqual(2)
  })
})

describe('dispose 与订阅生命周期', () => {
  it('dispose 幂等；镜像订阅与监听全部反注册；此后外部通知不进内存，动作拒绝', () => {
    const harness = createHarness({ section: { projects: [{ id: 'pa', name: '甲' }], assignments: {} } })
    const store = new ProjectStore(harness.host)
    expect(harness.listenerCount()).toBe(1)
    let notified = 0
    const unsubscribe = store.subscribe(() => { notified += 1 })
    expect(typeof unsubscribe).toBe('function')

    store.dispose()
    store.dispose() // 幂等
    expect(harness.listenerCount()).toBe(0)
    unsubscribe()
    harness.answerMirror({ projects: [{ id: 'px', name: '外部' }], assignments: {} })
    expect(notified).toBe(0)
    expect(store.getState().projects).toEqual([{ id: 'pa', name: '甲' }]) // 不再被外部改写
  })

  it('dispose 后动作拒绝且不产生写', async () => {
    const harness = createHarness({ section: { projects: [], assignments: {} } })
    const store = new ProjectStore(harness.host)
    store.dispose()
    expect(await store.createProject('甲')).toBeNull()
    expect(await store.renameProject('pa', 'x')).toBe(false)
    expect(await store.deleteProject('pa')).toBe(false)
    expect(await store.reorderProjects('a', 'b')).toBe(false)
    expect(await store.assignSession('s', 'pa')).toBe(false)
    await flush()
    expect(harness.setCalls).toEqual([])
  })
})
