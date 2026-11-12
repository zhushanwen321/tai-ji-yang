import { describe, expect, it, vi } from 'vitest'

import {
  canRetryDelivery,
  createCommentsApi,
  deliveryBadgeKey,
  isCommentThread,
  type CommentsListOutcome,
} from '../../client/comments/api.js'
import {
  COMMENTS_API_BASE_PATH,
  type CommentDelivery,
  type CommentThread,
  COMMENT_DELIVERY_STATES,
  COMMENT_THREAD_STATUSES,
} from '../../lib/comments/contract.js'
import { PICK_SCRIPT_SOURCE } from '../../lib/comments/pick-script.js'
import { en, zh } from '../../client/preview-tab/locales.js'
import {
  CONTENT_PROBE_INTERVAL_MS,
  PICK_BRIDGE_INBOUND_ACTIONS,
  PICK_BRIDGE_MESSAGE_PREFIX,
  PICK_BRIDGE_OUTBOUND_ACTIONS,
  PICK_BRIDGE_PROTOCOL_VERSION,
  PICK_PAYLOAD_INVALID_REASON,
  anchorsOfThreads,
  createPickBridge,
  parseInboundPickMessage,
  probeArtifactRoute,
  probeArtifactVersion,
  resolvePickTarget,
  type PickAnchorEntry,
} from '../../client/preview-tab/pick-bridge.js'

/**
 * 评论写通道客户端封装单测（opendesign-comment-loop §3.1 面板 UI 段；U4 +
 * opendesign-comment-anchor U4：拾取桥宿主侧纯逻辑直驱）。
 *
 * 组件测试基建评估（前置评估结论，2026-11-11）：仓内无 react/react-dom/jsdom（client 打包
 * 的 react 是 external require，运行时由宿主模块表提供），渲染型组件测试不可用——UI 呈现
 * 降级为 e2e（A4 场景由 U6/D3 承接）。本文件覆盖渲染之下可单测的纯逻辑层：
 * 1. 状态徽标四值映射 + 「重试投递」可用性真值表（既有面板呈现语义纯函数半区）；
 * 2. fetch 封装：相对路径路由族、POST 载荷（.create 含 anchor 可选参数——UD2 向后兼容）、
 *    非 2xx / 非法 JSON / 越形响应统一收拢为失败态；
 * 3. 桥报文守卫（G1/RL5 面板侧负路径，消息处理函数直驱）：伪造 source / 错 v / 错前缀 /
 *    词表外动作 / 空帧窗口全部静默忽略；
 * 4. 桥控制器直驱（D8(a) 就绪门控 + D6 picked 失败回执 + D8(b) 失效回报）；
 * 5. 内容版本探针（D8(c)）与探针失败态联动（伺服 404/403 时评论模式禁用、既有线程
 *    追加/resolve 不受影响——V6 步⑥ 的单测半区，联动全路径归 e2e）；
 * 6. picked 落点补齐（resolvePickTarget：地址解析路径优先、兜底选中路径，与现直发同源）；
 * 7. 桥词表两侧对账（G1 唯一登记：客户端常量 × pick-script 源串同前缀同词表）。
 * 「非设计会话不出现」（设计 §3.1 面板 UI 段出现条件）的裁决链 = probeDesignSession 探测语义
 * （tests/present-card-link.test.ts 已锁）+ index.tsx 挂载条件（designSession === true），
 * 渲染行为归 e2e。
 */

/** 一条通过最小结构校验的线程 fixture（字段集 = contract.ts CommentThread）。 */
function threadFixture(overrides: Partial<CommentThread> = {}): CommentThread {
  return {
    id: 'c_test001',
    artifactPath: 'index.html',
    text: '主视觉配色太艳，压暗一档',
    replies: [],
    status: 'open',
    createdAt: '2026-11-11T00:00:00.000Z',
    updatedAt: '2026-11-11T00:00:00.000Z',
    delivery: 'delivered',
    ...overrides,
  }
}

/** 注入桩 fetch 的 api（记录调用；respond 可抛错模拟传输失败）。 */
function apiWithStub(respond: (url: string, init: RequestInit | undefined) => Response | never) {
  const calls: { url: string; init?: RequestInit }[] = []
  const fetchStub = vi.fn(async (url: string | URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    return respond(String(url), init)
  })
  return { api: createCommentsApi(fetchStub as unknown as typeof fetch), calls }
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

/** 桥控制器测试的假 iframe contentWindow（记录出站报文；postMessage 形态 = 真窗口子集）。 */
function fakeFrameWindow(): { sent: { v: number; type: string; payload: unknown }[]; postMessage(message: unknown): void } {
  const sent: { v: number; type: string; payload: unknown }[] = []
  return {
    sent,
    postMessage(message: unknown): void {
      sent.push(message as { v: number; type: string; payload: unknown })
    },
  }
}

/** 桥控制器测试装配（submitPick 注入桩 + onReady/onMisses spy + 假窗口）。 */
function bridgeWithStub(submitPick: (payload: { anchor: unknown; text: unknown }) => Promise<{ ok: true; threadId: string } | { ok: false; reason: string }>) {
  const win = fakeFrameWindow()
  const onReady = vi.fn()
  const onMisses = vi.fn()
  const bridge = createPickBridge({ submitPick, onReady, onMisses })
  return { bridge, win, onReady, onMisses }
}

/** 让微任务链（submitPick → .then → postMessage）跑完。 */
const flushMicrotasks = (): Promise<void> => new Promise(resolve => { setTimeout(resolve, 0) })

/** HEAD 探针测试的桩 fetch（记录调用；headers 按 name 小写应答）。 */
function fetchStatus(status: number, headers: Record<string, string> = {}) {
  const calls: { url: string; init?: RequestInit }[] = []
  const impl = vi.fn(async (url: string | URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    } as unknown as Response
  })
  return { calls, impl: impl as unknown as typeof fetch }
}

/** 传输失败桩（fetch 抛错——伺服不可达）。 */
function fetchThrowing(): typeof fetch {
  return (async () => { throw new TypeError('network down') }) as unknown as typeof fetch
}

describe('状态徽标四值映射（deliveryBadgeKey，§3.1 面板 UI 段）', () => {
  it('delivery 四值逐一映射到各自文案 key（pending=待送达 / delivered=已发送 / no-agent / inject-error）', () => {
    expect(deliveryBadgeKey('pending')).toBe('comments.badge.pending')
    expect(deliveryBadgeKey('delivered')).toBe('comments.badge.delivered')
    expect(deliveryBadgeKey('no-agent')).toBe('comments.badge.noAgent')
    expect(deliveryBadgeKey('inject-error')).toBe('comments.badge.injectError')
  })

  it('四值徽标 key 在 zh 与 en 字典都有条目（key 拼错 = 面板显示裸 key，此处红灯）', () => {
    for (const delivery of COMMENT_DELIVERY_STATES) {
      const key = deliveryBadgeKey(delivery)
      expect(zh, `zh 缺 ${key}`).toHaveProperty(key)
      expect(en, `en 缺 ${key}`).toHaveProperty(key)
    }
  })

  it('delivered 文案用「已发送」不用「已送达」（提交后取消的宿主语义边界，§3.1 摘录）', () => {
    expect(zh['comments.badge.delivered']).toBe('已发送')
    expect(zh['comments.badge.delivered']).not.toContain('送达')
  })
})

describe('「重试投递」可用性（canRetryDelivery，D5 转移⑤）', () => {
  it('open × no-agent / open × inject-error 可重试（设计 §3.1：失败态显示重试投递按钮）', () => {
    expect(canRetryDelivery({ status: 'open', delivery: 'no-agent' })).toBe(true)
    expect(canRetryDelivery({ status: 'open', delivery: 'inject-error' })).toBe(true)
  })

  it('open × pending / open × delivered 不可重试（pending 未投递过、delivered 不重投）', () => {
    expect(canRetryDelivery({ status: 'open', delivery: 'pending' })).toBe(false)
    expect(canRetryDelivery({ status: 'open', delivery: 'delivered' })).toBe(false)
  })

  it('resolved × 失败态不可重试（恢复走 .reply 追加，与 delivered 态同款处理）', () => {
    for (const delivery of COMMENT_DELIVERY_STATES) {
      expect(canRetryDelivery({ status: 'resolved', delivery })).toBe(false)
    }
  })
})

describe('GET 基路径封装（api.list）', () => {
  it('走相对路径 GET 基路径 + sessionId query（路径常量从 contract.ts import）', async () => {
    const { api, calls } = apiWithStub(() => jsonResponse(200, { threads: [] }))
    const controller = new AbortController()
    await api.list('sess-1', controller.signal)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(`${COMMENTS_API_BASE_PATH}?sessionId=${encodeURIComponent('sess-1')}`)
    expect(calls[0]?.init?.method).toBeUndefined() // GET（fetch 缺省方法）
    expect(calls[0]?.init?.signal).toBe(controller.signal)
  })

  it('2xx {threads:[…]} → ok=true 且线程逐项通过结构校验', async () => {
    const fixture = threadFixture()
    const { api } = apiWithStub(() => jsonResponse(200, { threads: [fixture] }))
    const outcome: CommentsListOutcome = await api.list('sess-1')
    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(outcome.threads).toEqual([fixture])
  })

  it('非 2xx（含损坏文件的错误态标记）→ ok=false 不抛错（不返回空列表伪装正常，comment-loop·V9）', async () => {
    const { api } = apiWithStub(() => jsonResponse(500, { code: 'comments-corrupt', message: 'parse failed' }))
    const outcome = await api.list('sess-1')
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.status).toBe(500)
  })

  it('非法 JSON（损坏响应体）→ ok=false 不抛错', async () => {
    const calls: { url: string }[] = []
    const fetchStub = vi.fn(async (url: string | URL | RequestInfo) => {
      calls.push({ url: String(url) })
      return {
        ok: true,
        status: 200,
        json: async () => { throw new SyntaxError('Unexpected token') },
      } as Response
    })
    const api = createCommentsApi(fetchStub as unknown as typeof fetch)
    const outcome = await api.list('sess-1')
    expect(outcome.ok).toBe(false)
  })

  it('越形响应（threads 缺失 / 非数组 / 线程项缺字段 / delivery 出词表）→ ok=false', async () => {
    const badBodies = [
      {},
      { threads: 'nope' },
      { threads: [{ id: 'c_x' }] },
      { threads: [threadFixture({ delivery: 'wat' as CommentDelivery })] },
      { threads: [threadFixture({ status: 'closed' as CommentThread['status'] })] },
    ]
    for (const body of badBodies) {
      const { api } = apiWithStub(() => jsonResponse(200, body))
      const outcome = await api.list('sess-1')
      expect(outcome.ok, `越形响应被拒收：${JSON.stringify(body)}`).toBe(false)
    }
  })

  it('fetch 抛错（伺服不可达）→ ok=false 不抛错', async () => {
    const calls: { url: string }[] = []
    const fetchStub = vi.fn(async (url: string | URL | RequestInfo) => {
      calls.push({ url: String(url) })
      throw new TypeError('network down')
    })
    const api = createCommentsApi(fetchStub as unknown as typeof fetch)
    expect((await api.list('sess-1')).ok).toBe(false)
  })
})

describe('POST 动作封装（create/reply/retry/resolve，D2 路由族）', () => {
  it('.create：POST 基路径+.create，载荷 {sessionId, artifactPath, text}，2xx 线程 → ok=true', async () => {
    const fixture = threadFixture({ delivery: 'pending' })
    const { api, calls } = apiWithStub(() => jsonResponse(200, fixture))
    const outcome = await api.create({ sessionId: 'sess-1', artifactPath: 'index.html', text: '压暗一档' })
    expect(calls[0]?.url).toBe(COMMENTS_API_BASE_PATH + '.create')
    expect(calls[0]?.init?.method).toBe('POST')
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      sessionId: 'sess-1',
      artifactPath: 'index.html',
      text: '压暗一档',
    })
    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(outcome.thread).toEqual(fixture)
  })

  it('.create 带 anchor（UD2 扩展）：载荷含元素锚点，2xx 线程 → ok=true', async () => {
    const fixture = threadFixture({ anchor: { level: 'id', sel: '#hero' } })
    const { api, calls } = apiWithStub(() => jsonResponse(200, fixture))
    const outcome = await api.create({
      sessionId: 'sess-1',
      artifactPath: 'index.html',
      text: '压暗一档',
      anchor: { level: 'id', sel: '#hero' },
    })
    expect(calls[0]?.url).toBe(COMMENTS_API_BASE_PATH + '.create')
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      sessionId: 'sess-1',
      artifactPath: 'index.html',
      text: '压暗一档',
      anchor: { level: 'id', sel: '#hero' },
    })
    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(outcome.thread).toEqual(fixture)
  })

  it('.create 无 anchor：载荷不含 anchor 键（旧客户端兼容形态，RL4 的载荷半区）', async () => {
    const { api, calls } = apiWithStub(() => jsonResponse(200, threadFixture()))
    await api.create({ sessionId: 's', artifactPath: 'a.html', text: 'x' })
    const body = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>
    expect(Object.prototype.hasOwnProperty.call(body, 'anchor')).toBe(false)
  })

  it('.reply / .retry / .resolve 各走对应后缀路径；.resolve 载荷恒含 resolved:true', async () => {
    const fixture = threadFixture()
    const { api, calls } = apiWithStub(() => jsonResponse(200, fixture))
    await api.reply({ sessionId: 's', threadId: 'c_1', text: '追加' })
    await api.retry({ sessionId: 's', threadId: 'c_1' })
    await api.resolve({ sessionId: 's', threadId: 'c_1' })
    expect(calls.map(call => call.url)).toEqual([
      COMMENTS_API_BASE_PATH + '.reply',
      COMMENTS_API_BASE_PATH + '.retry',
      COMMENTS_API_BASE_PATH + '.resolve',
    ])
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ sessionId: 's', threadId: 'c_1', text: '追加' })
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({ sessionId: 's', threadId: 'c_1' })
    expect(JSON.parse(String(calls[2]?.init?.body))).toEqual({ sessionId: 's', threadId: 'c_1', resolved: true })
  })

  it('非 2xx / 越形线程 / 传输失败 → ok=false 不抛错', async () => {
    const failStub = apiWithStub(() => jsonResponse(400, { code: 'bad-request' }))
    expect((await failStub.api.create({ sessionId: 's', artifactPath: 'a.html', text: 'x' })).ok).toBe(false)

    const malformed = apiWithStub(() => jsonResponse(200, { id: 'c_x' }))
    expect((await malformed.api.create({ sessionId: 's', artifactPath: 'a.html', text: 'x' })).ok).toBe(false)

    const throwing = apiWithStub(() => { throw new TypeError('network down') })
    expect((await throwing.api.retry({ sessionId: 's', threadId: 'c_1' })).ok).toBe(false)
  })
})

describe('CommentThread 最小结构校验（isCommentThread）', () => {
  it('合法线程通过；非对象 / 缺字段 / 词表外出值拒绝', () => {
    expect(isCommentThread(threadFixture())).toBe(true)
    expect(isCommentThread(null)).toBe(false)
    expect(isCommentThread('c_x')).toBe(false)
    expect(isCommentThread({ ...threadFixture(), id: '' })).toBe(false)
    expect(isCommentThread({ ...threadFixture(), replies: 'nope' })).toBe(false)
    expect(isCommentThread({ ...threadFixture(), delivery: 'queued' })).toBe(false)
    expect(isCommentThread({ ...threadFixture(), status: 'archived' })).toBe(false)
    expect(isCommentThread({ ...threadFixture(), createdAt: 123 as unknown as string })).toBe(false)
  })
})

describe('locales 双字典同 key 集（zh 权威，en 对齐——既有装配序约束的静态半区）', () => {
  it('en 与 zh 的 key 集完全一致（含新增 comments.* 全量 key）', () => {
    const zhKeys = Object.keys(zh).sort()
    const enKeys = Object.keys(en).sort()
    expect(enKeys).toEqual(zhKeys)
    // 21 既有（inputPlaceholder/send/sending 随 D3 直发框移除）+ 8 新增（pickMode/
    // pickModeTitle/pickNotReady/anchor.id/anchor.data/anchor.path/anchorMissed/locate）
    expect(zhKeys.filter(key => key.startsWith('comments.'))).toHaveLength(26)
  })

  it('直发时代的三个 key 已随 D3 入口唯一化移除（残留 = 直发通道复活的信号，红灯）', () => {
    for (const removed of ['comments.inputPlaceholder', 'comments.send', 'comments.sending']) {
      expect(zh, `zh 不应再有 ${removed}`).not.toHaveProperty(removed)
      expect(en, `en 不应再有 ${removed}`).not.toHaveProperty(removed)
    }
  })

  it('评论模式开关与锚点行的新 key 在 zh/en 都有条目（key 拼错 = 面板显示裸 key，红灯）', () => {
    for (const key of [
      'comments.pickMode',
      'comments.pickModeTitle',
      'comments.pickNotReady',
      'comments.anchor.id',
      'comments.anchor.data',
      'comments.anchor.path',
      'comments.anchorMissed',
      'comments.locate',
    ]) {
      expect(zh, `zh 缺 ${key}`).toHaveProperty(key)
      expect(en, `en 缺 ${key}`).toHaveProperty(key)
    }
  })
})

// ── 拾取桥宿主侧（opendesign-comment-anchor U4：G1/RL5 负路径 + D8 直驱）────────

describe('桥报文守卫（parseInboundPickMessage，G1/RL5 面板侧负路径直驱）', () => {
  const frame = fakeFrameWindow()
  /** 以指定 source/data 驱动解析（source 缺省 = 本帧窗口，即合法来源）。 */
  const parse = (data: unknown, source: unknown = frame) => parseInboundPickMessage({ source, data }, frame)

  it('三类合法入站（ready/picked/anchors-status）解析通过，payload 原样携带', () => {
    expect(parse({ v: 1, type: 'odp-pick:ready', payload: {} })).toEqual({ action: 'ready', payload: {} })
    expect(parse({ v: 1, type: 'odp-pick:picked', payload: { anchor: { level: 'id', sel: '#x' }, text: 't' } }))
      .toEqual({ action: 'picked', payload: { anchor: { level: 'id', sel: '#x' }, text: 't' } })
    expect(parse({ v: 1, type: 'odp-pick:anchors-status', payload: [{ threadId: 'c_1' }] }))
      .toEqual({ action: 'anchors-status', payload: [{ threadId: 'c_1' }] })
  })

  it('负路径·伪造来源（source 非本 iframe contentWindow）→ null 静默忽略', () => {
    const message = { v: 1, type: 'odp-pick:ready', payload: {} }
    expect(parse(message, { otherWindow: true })).toBeNull()
    expect(parse(message, null)).toBeNull()
    // source 为空值 × frameWindow 为空值（iframe 未挂载）的组合同样恒拒（防假同源匹配）
    expect(parseInboundPickMessage({ source: undefined, data: message }, undefined)).toBeNull()
  })

  it('负路径·错版本（v=2 / v 缺失）→ null 静默忽略', () => {
    expect(parse({ v: 2, type: 'odp-pick:ready', payload: {} })).toBeNull()
    expect(parse({ type: 'odp-pick:ready', payload: {} })).toBeNull()
    expect(parse({ v: '1', type: 'odp-pick:ready', payload: {} })).toBeNull()
  })

  it('负路径·错前缀（opd-pick / odp-pickx / 无前缀）→ null 静默忽略', () => {
    expect(parse({ v: 1, type: 'opd-pick:ready', payload: {} })).toBeNull()
    expect(parse({ v: 1, type: 'odp-pickx:ready', payload: {} })).toBeNull()
    expect(parse({ v: 1, type: 'ready', payload: {} })).toBeNull()
  })

  it('负路径·词表外动作（出站动作伪装入站 / 未知动作）→ null 静默忽略', () => {
    expect(parse({ v: 1, type: 'odp-pick:locate', payload: {} })).toBeNull()
    expect(parse({ v: 1, type: 'odp-pick:submit-result', payload: {} })).toBeNull()
    expect(parse({ v: 1, type: 'odp-pick:pick-mode', payload: {} })).toBeNull()
    expect(parse({ v: 1, type: 'odp-pick:anchors', payload: [] })).toBeNull()
    expect(parse({ v: 1, type: 'odp-pick:', payload: {} })).toBeNull()
  })

  it('负路径·非对象报文与未挂载 iframe（空帧窗口恒拒）→ null', () => {
    expect(parse('hello')).toBeNull()
    expect(parse(42)).toBeNull()
    expect(parseInboundPickMessage({ source: frame, data: { v: 1, type: 'odp-pick:ready' } }, null)).toBeNull()
    expect(parseInboundPickMessage({ source: undefined, data: { v: 1, type: 'odp-pick:ready' } }, undefined)).toBeNull()
  })

  it('入站动作词表恰三项、出站恰四项（G1 恰七动作；漂移即两侧对不上，红灯）', () => {
    expect(PICK_BRIDGE_INBOUND_ACTIONS).toEqual(['ready', 'picked', 'anchors-status'])
    expect(PICK_BRIDGE_OUTBOUND_ACTIONS).toEqual(['pick-mode', 'anchors', 'locate', 'submit-result'])
  })
})

describe('桥控制器直驱（createPickBridge）：就绪握手与出站门控（D8(a)）', () => {
  const OK_SUBMIT = async (): Promise<{ ok: true; threadId: string }> => ({ ok: true, threadId: 'c_new' })

  it('未就绪：置态与 locate 一律不出站（D8(a) 时序门控——ready 前的报文会落进无人接收的旧文档）', () => {
    const { bridge, win } = bridgeWithStub(OK_SUBMIT)
    bridge.setPickMode(true)
    bridge.setAnchors([{ threadId: 'c_9', ordinal: 1, sel: '#x' }])
    bridge.locate('#x')
    expect(win.sent).toHaveLength(0)
    expect(bridge.isReady()).toBe(false)
  })

  it('ready 握手：flush pick-mode 当前态与 anchors 当前集，onReady 触发、misses 重置', () => {
    const { bridge, win, onReady, onMisses } = bridgeWithStub(OK_SUBMIT)
    bridge.setPickMode(true)
    bridge.setAnchors([{ threadId: 'c_9', ordinal: 1, sel: '#x' }])
    bridge.setFrameWindow(win)
    bridge.handleMessage({ action: 'ready', payload: {} })
    expect(onReady).toHaveBeenCalledTimes(1)
    expect(bridge.isReady()).toBe(true)
    expect(win.sent).toEqual([
      { v: PICK_BRIDGE_PROTOCOL_VERSION, type: 'odp-pick:pick-mode', payload: { enabled: true } },
      { v: PICK_BRIDGE_PROTOCOL_VERSION, type: 'odp-pick:anchors', payload: [{ threadId: 'c_9', ordinal: 1, sel: '#x' }] },
    ])
    expect(onMisses).toHaveBeenCalledWith([])
  })

  it('就绪后：anchors/pick-mode/locate 即时出站且报文形态 = G1 v1 前缀', () => {
    const { bridge, win } = bridgeWithStub(OK_SUBMIT)
    bridge.setFrameWindow(win)
    bridge.handleMessage({ action: 'ready', payload: {} })
    win.sent.length = 0
    const entries: PickAnchorEntry[] = [
      { threadId: 'c_1', ordinal: 1, sel: '#a' },
      { threadId: 'c_3', ordinal: 3, sel: '[data-od-id="hero"]' },
    ]
    bridge.setAnchors(entries)
    bridge.setPickMode(false)
    bridge.locate('#a')
    expect(win.sent).toEqual([
      { v: 1, type: 'odp-pick:anchors', payload: entries },
      { v: 1, type: 'odp-pick:pick-mode', payload: { enabled: false } },
      { v: 1, type: 'odp-pick:locate', payload: { sel: '#a' } },
    ])
  })

  it('anchors-status：onMisses 收未命中 threadId 清单；越形条目逐条过滤（桥报文按不可信数据处理）', () => {
    const { bridge, onMisses } = bridgeWithStub(OK_SUBMIT)
    bridge.handleMessage({ action: 'anchors-status', payload: [
      { threadId: 'c_1', ordinal: 1, sel: '#a', hit: false },
      { ordinal: 2, sel: '#b' },
      'junk',
    ] })
    expect(onMisses).toHaveBeenCalledWith([{ threadId: 'c_1', ordinal: 1, sel: '#a' }])
    bridge.handleMessage({ action: 'anchors-status', payload: 'junk' })
    expect(onMisses).toHaveBeenLastCalledWith([])
  })

  it('重挂（win→null→win2）：换窗即失就绪、出站停用，重新 ready 后按当前态 flush（D8(a) 重载协议）', () => {
    const { bridge, win: win1 } = bridgeWithStub(OK_SUBMIT)
    const win2 = fakeFrameWindow()
    bridge.setFrameWindow(win1)
    bridge.handleMessage({ action: 'ready', payload: {} })
    bridge.setPickMode(true) // 就绪中置态：即时出站（flush 2 条 + pick-mode 1 条）
    expect(win1.sent).toHaveLength(3)
    bridge.setFrameWindow(null)
    expect(bridge.isReady()).toBe(false)
    bridge.setPickMode(false) // 失就绪后置态：仅记态，不出站
    expect(win1.sent).toHaveLength(3)
    bridge.setFrameWindow(win2)
    expect(bridge.isReady()).toBe(false)
    bridge.handleMessage({ action: 'ready', payload: {} })
    expect(win2.sent).toEqual([
      { v: 1, type: 'odp-pick:pick-mode', payload: { enabled: false } },
      { v: 1, type: 'odp-pick:anchors', payload: [] },
    ])
  })
})

describe('picked 处理与 submit-result 回执（D6：无论成败必经桥回执，失败回执是红灯项）', () => {
  const READY = { anchor: { level: 'id', sel: '#hero' }, text: '压暗一档' }

  function readyBridge(submitPick: (payload: { anchor: unknown; text: unknown }) => Promise<{ ok: true; threadId: string } | { ok: false; reason: string }>) {
    const driven = bridgeWithStub(submitPick)
    driven.bridge.setFrameWindow(driven.win)
    driven.bridge.handleMessage({ action: 'ready', payload: {} })
    driven.win.sent.length = 0
    return driven
  }

  it('合法 picked → submitPick 收到 {anchor,text}；成功 → submit-result {ok:true,threadId}', async () => {
    const submitPick = vi.fn(async () => ({ ok: true as const, threadId: 'c_new' }))
    const { bridge, win } = readyBridge(submitPick)
    bridge.handleMessage({ action: 'picked', payload: READY })
    expect(submitPick).toHaveBeenCalledWith(READY)
    await flushMicrotasks()
    expect(win.sent).toEqual([
      { v: 1, type: 'odp-pick:submit-result', payload: { ok: true, threadId: 'c_new' } },
    ])
  })

  it('picked 失败路径（D6/V6 步⑤单测半区）→ submit-result {ok:false, reason}——脚本保文本行内重试', async () => {
    const { bridge, win } = readyBridge(async () => ({ ok: false, reason: '发送失败，请重试。' }))
    bridge.handleMessage({ action: 'picked', payload: READY })
    await flushMicrotasks()
    expect(win.sent).toEqual([
      { v: 1, type: 'odp-pick:submit-result', payload: { ok: false, reason: '发送失败，请重试。' } },
    ])
  })

  it('非法 picked（level 词表外 / 空 sel / 空 text / 缺 text / 非对象）→ submitPick 不调、回执固定原因（无声忽略会让脚本输入框永久挂起）', async () => {
    const submitPick = vi.fn(async () => ({ ok: true as const, threadId: 'c_new' }))
    const { bridge, win } = readyBridge(submitPick)
    const invalidPayloads = [
      { anchor: { level: 'attribute', sel: '#x' }, text: 'x' },
      { anchor: { level: 'id', sel: '' }, text: 'x' },
      { anchor: { level: 'id', sel: '#x' }, text: '' },
      { anchor: { level: 'id', sel: '#x' } },
      { anchor: { level: 'id', sel: '#x' }, text: 42 },
      'junk',
    ]
    for (const payload of invalidPayloads) {
      bridge.handleMessage({ action: 'picked', payload })
      await flushMicrotasks()
      expect(submitPick, `非法载荷不应触达写通道：${JSON.stringify(payload)}`).not.toHaveBeenCalled()
      expect(win.sent).toEqual([
        { v: 1, type: 'odp-pick:submit-result', payload: { ok: false, reason: PICK_PAYLOAD_INVALID_REASON } },
      ])
      win.sent.length = 0
    }
  })
})

describe('锚点集计算（anchorsOfThreads，D8(a)：线程 id+序号+sel）', () => {
  it('带锚点线程按列表序下发；无锚点旧线程占序号但不下发（D1 读侧宽容的桥侧对偶）', () => {
    const withId = threadFixture({ id: 'c_1', anchor: { level: 'id', sel: '#a' } })
    const legacyNoAnchor = threadFixture({ id: 'c_2' })
    const withData = threadFixture({ id: 'c_3', anchor: { level: 'data', sel: '[data-od-id="hero"]' } })
    expect(anchorsOfThreads([withId, legacyNoAnchor, withData])).toEqual([
      { threadId: 'c_1', ordinal: 1, sel: '#a' },
      { threadId: 'c_3', ordinal: 3, sel: '[data-od-id="hero"]' },
    ])
    expect(anchorsOfThreads([legacyNoAnchor])).toEqual([])
  })
})

describe('picked 落点补齐（resolvePickTarget：地址解析路径优先、兜底选中路径——U4 检查点单测锁定）', () => {
  it('路由地址模式：artifactPath 与 sessionId 都取自地址解析（与现直发同源）', () => {
    expect(resolvePickTarget('dsh-resource://file/session/sess-1/index.html', undefined, 'panel-sess')).toEqual({
      artifactPath: 'index.html',
      sessionId: 'sess-1',
    })
    expect(resolvePickTarget('dsh-resource://file/session/sess-1/a/b/page.html', { path: 'ignored.html' }, 'panel-sess')).toEqual({
      artifactPath: 'a/b/page.html',
      sessionId: 'sess-1',
    })
    expect(resolvePickTarget('dsh-resource://file/session/sess-1/my%20page.html', undefined, 'panel-sess')).toEqual({
      artifactPath: 'my page.html',
      sessionId: 'sess-1',
    })
  })

  it('兜底模式（地址不可解析为产物）：选中路径 + 面板所在会话', () => {
    expect(resolvePickTarget('dsh-resource://file/session/sess-2/notes.md', { path: 'picked.html' }, 'panel-sess')).toEqual({
      artifactPath: 'picked.html',
      sessionId: 'panel-sess',
    })
    expect(resolvePickTarget('not-a-resource-address', { path: 'picked.html' }, 'panel-sess')).toEqual({
      artifactPath: 'picked.html',
      sessionId: 'panel-sess',
    })
  })

  it('列表模式无当前产物 → null（拾取 UI 不挂载，picked 不可达）', () => {
    expect(resolvePickTarget('not-a-resource-address', undefined, 'panel-sess')).toBeNull()
  })
})

describe('内容版本探针（D8(c)/AS9：HEAD ETag 比对 + 加载态探针既有语义）', () => {
  const signal = new AbortController().signal

  it('加载态探针：404 → notFound / 403 → forbidden / 其余状态码与传输失败 → error（HEAD 方法）', async () => {
    const notFound = fetchStatus(404)
    expect(await probeArtifactRoute('u', signal, notFound.impl)).toEqual({ ok: false, kind: 'notFound', status: 404 })
    expect(notFound.calls[0]?.init?.method).toBe('HEAD')
    expect(await probeArtifactRoute('u', signal, fetchStatus(403).impl)).toEqual({ ok: false, kind: 'forbidden', status: 403 })
    expect(await probeArtifactRoute('u', signal, fetchStatus(500).impl)).toEqual({ ok: false, kind: 'error', status: 500 })
    expect(await probeArtifactRoute('u', signal, fetchThrowing())).toEqual({ ok: false, kind: 'error' })
    expect(await probeArtifactRoute('u', signal, fetchStatus(200).impl)).toEqual({ ok: true })
  })

  it('版本探针：200 带 etag → 基线可取；200 无 etag → undefined；404/传输失败 → ok:false（无证据不驱动重挂）', async () => {
    expect(await probeArtifactVersion('u', signal, fetchStatus(200, { etag: 'W/"1-2"' }).impl)).toEqual({ ok: true, etag: 'W/"1-2"' })
    expect(await probeArtifactVersion('u', signal, fetchStatus(200).impl)).toEqual({ ok: true, etag: undefined })
    expect(await probeArtifactVersion('u', signal, fetchStatus(404).impl)).toEqual({ ok: false })
    expect(await probeArtifactVersion('u', signal, fetchStatus(403).impl)).toEqual({ ok: false })
    expect(await probeArtifactVersion('u', signal, fetchThrowing())).toEqual({ ok: false })
  })

  it('探针轮询间隔恒 5000ms（D8(c) 节奏常量；e2e RL7 判定窗口以此为依据）', () => {
    expect(CONTENT_PROBE_INTERVAL_MS).toBe(5000)
  })
})

describe('探针失败态联动（V6 步⑥ 单测半区：伺服 404/403 时评论模式禁用、既有线程追加/resolve 不受影响）', () => {
  it('版本探针 404 = 无证据；桥从未就绪（无 iframe contentWindow）→ 开关置态不出站、isReady 恒 false', async () => {
    const signal = new AbortController().signal
    expect(await probeArtifactVersion('u', signal, fetchStatus(404).impl)).toEqual({ ok: false })
    const { bridge, win } = bridgeWithStub(async () => ({ ok: true as const, threadId: 'c_x' }))
    // 探针失败形态下 iframe 不挂载（加载态失败行），contentWindow 与 ready 永不到来
    bridge.setPickMode(true)
    expect(win.sent).toHaveLength(0)
    expect(bridge.isReady()).toBe(false)
  })

  it('既有线程的追加 / resolve 与探针成败零耦合（写通道独立于产物伺服——D3 已接受代价的单测半区）', async () => {
    const fixture = threadFixture()
    const { api } = apiWithStub(() => jsonResponse(200, fixture))
    const reply = await api.reply({ sessionId: 's', threadId: fixture.id, text: '追加' })
    const resolve = await api.resolve({ sessionId: 's', threadId: fixture.id })
    expect(reply.ok).toBe(true)
    expect(resolve.ok).toBe(true)
  })
})

describe('桥词表两侧对账（G1 唯一登记：客户端常量 × pick-script 源串）', () => {
  it('协议版本与前缀同值；七个动作字面量在脚本源串全部命中（任一侧漂移即红灯）', () => {
    expect(PICK_BRIDGE_PROTOCOL_VERSION).toBe(1)
    expect(PICK_BRIDGE_MESSAGE_PREFIX).toBe('odp-pick:')
    expect(PICK_SCRIPT_SOURCE).toContain("'odp-pick:'")
    for (const action of [...PICK_BRIDGE_INBOUND_ACTIONS, ...PICK_BRIDGE_OUTBOUND_ACTIONS]) {
      expect(PICK_SCRIPT_SOURCE, `脚本源串缺动作字面量：${action}`).toContain(`'${action}'`)
    }
  })
})
