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
import { en, zh } from '../../client/preview-tab/locales.js'

/**
 * 评论写通道客户端封装单测（opendesign-comment-loop §3.1 面板 UI 段；U4）。
 *
 * 组件测试基建评估（前置评估结论，2026-11-11）：仓内无 react/react-dom/jsdom（client 打包
 * 的 react 是 external require，运行时由宿主模块表提供），渲染型组件测试不可用——UI 呈现
 * 降级为 e2e（A4 场景由 U6/D3 承接）。本文件覆盖渲染之下可单测的纯逻辑层：
 * 1. 状态徽标四值映射（设计 §3.1 面板 UI 段「状态徽标四值直接映射 delivery + status」
 *    的纯函数半区）：delivery 四值 → locales 文案 key，
 *    且每个 key 在 zh/en 字典都有条目（key 拼错 = 面板显示裸 key，此处红灯）；
 * 2. 「重试投递」可用性真值表（设计 §3.1「失败两态且 lifecycle 为 open 时显示『重试投递』
 *    按钮」的纯函数半区；D5 转移⑤：仅
 *    open × no-agent / open × inject-error）；
 * 3. fetch 封装：相对路径路由族（常量从 contract.ts import）、POST 载荷、GET query、
 *    非 2xx / 非法 JSON / 越形响应统一收拢为失败态（不抛错——面板错误态的来源）。
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
    expect(zhKeys.filter(key => key.startsWith('comments.'))).toHaveLength(21)
  })
})
