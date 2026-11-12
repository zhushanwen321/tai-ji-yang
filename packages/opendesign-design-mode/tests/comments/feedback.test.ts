/**
 * 评论回注服务单测（U3；RL1 / RL6 + D4 / D6 消息契约 + 元素锚点 D7 载荷扩展）。
 *
 * 断言结构：
 * 1. 消息构造三段（D6）：自报身份行 / 围栏 JSON 载荷可解析且恰四字段（无锚点）/ 改稿
 *    指引行；source 五字段（D3：kind + form:'notice' + summary 首句截断 + artifactPath +
 *    threadId；RL1：kind = COMMENT_SOURCE_KIND，≠ 'user'，≠ 质量环 LINT_SOURCE_KIND）；
 *    id 唯一（randomUUID）。锚点扩展（D7）：载荷带 anchor 时围栏 JSON 恰五字段且指令
 *    文本追加锚点语义说明与保留锚点指令两句——source 五字段零结构变更。
 * 2. deliverComment 双通道与回写对账（RL6）：running → steer、idle → followup（两者返回
 *    delivered）；查无活 Agent 与 agents 服务缺席 → no-agent；steer / followup 抛错 →
 *    inject-error——每分支断言「返回值 === 读盘 thread.delivery」（含 deliveredAt 有无）。
 * 3. 投递周期内容：.create 载荷 text = 首评、.reply 载荷 text = 末条追加（D6「.reply 追加
 *    的载荷含线程 id 与追加文本」）、.retry 与首评同走 deliverComment 同一分流（D4）；
 *    带锚点线程的 reply 载荷恒带首评锚点（D7——锚点首评定案不可变，D1）。
 * 4. 边界（AX3 fail-fast）：对已 delivered 线程重复投递 = 状态机表外，deliverComment 在
 *    回写点抛 CommentTransitionError，盘上状态不变。
 *
 * store 侧用真文件（mkdtemp 临时会话目录）走真实落盘链路——RL6 对账的落盘侧必须读盘
 * 验证，mock 不得替身。agents 双打沿用质量环 feedback.test.ts 同款脚手架形态。
 * 编号口径：裸编号分域归属——既有段落（回注消息 / 投递分流）的 D/AX/RL 属
 * opendesign-comment-loop 包；元素锚点段的 D1 / D7 属 opendesign-comment-anchor 包
 * （本设计包）；引用其他设计包的同形编号须带域前缀。
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildCommentMessage,
  COMMENT_SUMMARY_MAX_CHARS,
  deliverComment,
  type CommentMessagePayload,
  type DeliverCommentInput,
} from '../../lib/comments/feedback.js'
import { COMMENT_SOURCE_KIND, type CommentAnchor, type CommentThread } from '../../lib/comments/contract.js'
import {
  appendCommentReply,
  createCommentThread,
  readCommentsFile,
  retryCommentDelivery,
} from '../../lib/comments/store.js'
import { CommentTransitionError } from '../../lib/comments/thread.js'
import { LINT_SOURCE_KIND, type FeedbackUserMessage } from '../../lib/quality/feedback.js'

// ── 测试脚手架 ───────────────────────────────────────────────────────────────

const SESSION_ID = 'comment-session'
const AT = '2026-11-11T08:00:00.000Z'
const AT2 = '2026-11-11T09:30:00.000Z'
const FIRST_COMMENT = '主视觉配色太艳，压暗一档'

interface AgentStub {
  status?: string
  steer: ReturnType<typeof vi.fn>
  followup: ReturnType<typeof vi.fn>
}

function makeAgent(
  status?: string,
  behavior: { steerThrows?: boolean; followupThrows?: boolean } = {},
): AgentStub {
  return {
    status,
    steer: vi.fn(() => {
      if (behavior.steerThrows) throw new Error('agent disposed mid-steer')
    }),
    followup: vi.fn(() => {
      if (behavior.followupThrows) throw new Error('agent disposed mid-followup')
    }),
  }
}

/** 宿主 ctx 双打：agents 服务按注册表供给；getThrows 模拟服务缺席（cordis proxy getter 抛错）。 */
function makeCtx(registry: Map<string, AgentStub> | undefined, opts: { getThrows?: boolean } = {}): unknown {
  return {
    get(name: string): unknown {
      if (opts.getThrows) throw new Error(`service ${name} not available`)
      return registry
    },
  }
}

const tmpRoots: string[] = []

afterEach(async () => {
  while (tmpRoots.length > 0) {
    const root = tmpRoots.pop()
    if (root !== undefined) await rm(root, { recursive: true, force: true })
  }
})

async function makeHarness(opts: { registry?: Map<string, AgentStub>; getThrows?: boolean } = {}): Promise<{
  cwd: string
  registry: Map<string, AgentStub>
}> {
  const cwd = await mkdtemp(join(tmpdir(), 'od-comment-feedback-'))
  tmpRoots.push(cwd)
  const registry = opts.registry ?? new Map<string, AgentStub>()
  return { cwd, registry }
}

function deliver(ctx: unknown, cwd: string, thread: CommentThread, at?: string) {
  const input: DeliverCommentInput = { ctx, sessionId: SESSION_ID, cwd, thread, ...(at !== undefined ? { at } : {}) }
  return deliverComment(input)
}

/** 经真实 store 建线程（首评默认文案、产物 index.html、时刻 AT；anchor 可选，D7 锚点场景）。 */
async function createThread(cwd: string, text = FIRST_COMMENT, anchor?: CommentAnchor): Promise<CommentThread> {
  return createCommentThread(cwd, { artifactPath: 'index.html', text, ...(anchor === undefined ? {} : { anchor }) }, AT)
}

/** 读盘取线程（RL6 落盘侧对账的唯一可信源——不读内存对象）。 */
async function persistedThread(cwd: string, threadId: string): Promise<CommentThread> {
  const file = await readCommentsFile(cwd)
  const found = file.threads.find((thread) => thread.id === threadId)
  if (found === undefined) throw new Error(`测试脚手架：线程 ${threadId} 未落盘`)
  return found
}

/** 注入通道上的消息（缺省最近一次；agent stub 收到的即 buildCommentMessage 产物，按同一形状读回）。 */
function injectedMessage(agent: AgentStub, channel: 'steer' | 'followup', which: 'first' | 'last' = 'last'): FeedbackUserMessage {
  const calls = channel === 'steer' ? agent.steer.mock.calls : agent.followup.mock.calls
  const call = which === 'first' ? calls[0] : calls[calls.length - 1]
  if (call === undefined) throw new Error(`测试脚手架：${channel} 未被调用`)
  return call[0] as FeedbackUserMessage
}

function messageText(message: FeedbackUserMessage): string {
  expect(message.content).toHaveLength(1)
  expect(message.content[0]?.type).toBe('text')
  return message.content[0]?.text ?? ''
}

/** 提取围栏 JSON 载荷（```json 围栏；缺失或不可解析直接抛错 = 断言失败）。 */
function parseFencedPayload(text: string): Record<string, unknown> {
  const match = /```json\n([\s\S]*?)\n```/.exec(text)
  if (match === null) throw new Error('围栏 JSON 载荷缺失')
  return JSON.parse(match[1] as string) as Record<string, unknown>
}

// ── 1. 消息构造三段与来源标记（D6 / RL1）─────────────────────────────────────

describe('消息构造三段与来源标记（D6 / RL1）', () => {
  const PAYLOAD: CommentMessagePayload = {
    threadId: 'c_unit-test',
    artifactPath: 'pages/index.html',
    text: '主视觉配色太艳，压暗一档',
    createdAt: AT,
  }

  it('三段结构逐字成立：身份行（首行）/ 围栏 JSON 可解析且恰四字段 / 改稿指引行（末行）', () => {
    const message = buildCommentMessage(PAYLOAD)
    expect(message.role).toBe('user')
    expect(typeof message.id).toBe('string')
    expect(message.content).toHaveLength(1)
    const text = messageText(message)

    // ①自报身份行 = 首行（D6 句式逐字）
    const lines = text.split('\n')
    expect(lines[0]).toBe('[opendesign-design-mode 面板评论] 设计面板收到用户对产物的评论，非用户聊天发言')

    // ②围栏 JSON：可解析、恰四字段、值与入参一致
    const parsed = parseFencedPayload(text)
    expect(Object.keys(parsed).sort()).toEqual(['artifactPath', 'createdAt', 'text', 'threadId'])
    expect(parsed).toEqual({ ...PAYLOAD })

    // ③改稿指引行 = 末行（D6 句式逐字）
    expect(lines[lines.length - 1]).toBe('请读该产物源码按评论修改，写盘即完成交付，无需回复本消息')
  })

  it('RL1：source.kind 独立登记（= COMMENT_SOURCE_KIND，≠ user，≠ 质量环 lint kind）', () => {
    const message = buildCommentMessage(PAYLOAD)
    expect(message.source.kind).toBe(COMMENT_SOURCE_KIND)
    expect(message.source.kind).not.toBe('user')
    expect(message.source.kind).not.toBe(LINT_SOURCE_KIND)
  })

  it('D3：source 恰五字段（kind + form:\'notice\' + summary 首句 + artifactPath + threadId）', () => {
    const message = buildCommentMessage(PAYLOAD)
    expect(Object.keys(message.source).sort()).toEqual(['artifactPath', 'form', 'kind', 'summary', 'threadId'])
    expect(message.source).toEqual({
      kind: COMMENT_SOURCE_KIND,
      form: 'notice',
      summary: '主视觉配色太艳，压暗一档', // 单行且未超上限——summary = 原文
      artifactPath: PAYLOAD.artifactPath,
      threadId: PAYLOAD.threadId,
    })
  })

  it('D3：summary 取评论首行且超长截断（上限 COMMENT_SUMMARY_MAX_CHARS，截后留省略号）', () => {
    // 多行评论：summary 只取首行
    const multiline = buildCommentMessage({ ...PAYLOAD, text: '首行内容\n第二行内容' })
    expect(multiline.source.summary).toBe('首行内容')
    // 首行超上限：截到上限 -1 字符 + 省略号（宿主 boundContextSummary 同款形态）
    const overlong = `${'艳'.repeat(COMMENT_SUMMARY_MAX_CHARS + 10)}\n第二行`
    const truncated = buildCommentMessage({ ...PAYLOAD, text: overlong })
    expect(truncated.source.summary).toBe(`${'艳'.repeat(COMMENT_SUMMARY_MAX_CHARS - 1)}…`)
    expect((truncated.source.summary as string).length).toBe(COMMENT_SUMMARY_MAX_CHARS)
  })

  it('id 唯一（randomUUID）：同载荷两次构造 id 不同', () => {
    expect(buildCommentMessage(PAYLOAD).id).not.toBe(buildCommentMessage(PAYLOAD).id)
  })

  it('D7：首评带锚点时围栏 JSON 恰五字段（+ anchor）且指令文本追加锚点语义与保留锚点两句', () => {
    const anchor: CommentAnchor = { level: 'id', sel: '#hero-title' }
    const message = buildCommentMessage({ ...PAYLOAD, anchor })

    // source 五字段零结构变更：anchor 只进围栏载荷，不进 source
    expect(Object.keys(message.source).sort()).toEqual(['artifactPath', 'form', 'kind', 'summary', 'threadId'])

    // 围栏 JSON：恰五字段（四字段 + anchor），anchor 值原样透传
    const parsed = parseFencedPayload(messageText(message))
    expect(Object.keys(parsed).sort()).toEqual(['anchor', 'artifactPath', 'createdAt', 'text', 'threadId'])
    expect(parsed.anchor).toEqual(anchor)

    // 指令文本追加两句（改稿指引行之后）：锚点语义说明 + 保留锚点指令
    const lines = messageText(message).split('\n')
    const guideIndex = lines.indexOf('请读该产物源码按评论修改，写盘即完成交付，无需回复本消息')
    expect(guideIndex).toBeGreaterThan(-1)
    expect(lines[guideIndex + 1]).toBe('anchor.sel 为 CSS 选择器，可在产物 HTML 源码中据此定位元素（id 级最可靠）')
    expect(lines[guideIndex + 2]).toBe('改稿写盘时保留既有元素的 id 与 data-od-id / data-screen-label 锚属性值，使已有评论不失效')
  })
})

// ── 2. deliverComment 双通道与回写对账（RL6 / D4 delivered 语义）──────────────

describe('deliverComment 双通道与回写对账（RL6）', () => {
  it('running agent：steer 注入当前轮，返回 delivered 与落盘对账（deliveredAt = 回写时刻）', async () => {
    const agent = makeAgent('running')
    const { cwd, registry } = await makeHarness({ registry: new Map([[SESSION_ID, agent]]) })
    const created = await createThread(cwd)

    const outcome = await deliver(makeCtx(registry), cwd, created, AT2)

    expect(outcome).toBe('delivered')
    expect(agent.steer).toHaveBeenCalledTimes(1)
    expect(agent.followup).not.toHaveBeenCalled()
    // 注入消息与线程快照对账：source 五字段 + 载荷四字段与线程一致
    const message = injectedMessage(agent, 'steer')
    expect(message.source).toEqual({
      kind: COMMENT_SOURCE_KIND,
      form: 'notice',
      summary: FIRST_COMMENT,
      artifactPath: 'index.html',
      threadId: created.id,
    })
    const payload = parseFencedPayload(messageText(message))
    expect(payload).toEqual({ threadId: created.id, artifactPath: 'index.html', text: FIRST_COMMENT, createdAt: AT })
    // RL6：返回值 === 落盘 delivery；delivered 态带 deliveredAt
    const persisted = await persistedThread(cwd, created.id)
    expect(persisted.delivery).toBe('delivered')
    expect(persisted.delivery).toBe(outcome)
    expect(persisted.deliveredAt).toBe(AT2)
    expect(persisted.updatedAt).toBe(AT2)
    expect(persisted.status).toBe('open')
  })

  it('idle agent：followup 开新轮，同归 delivered（同一回写对账）', async () => {
    const agent = makeAgent('idle')
    const { cwd, registry } = await makeHarness({ registry: new Map([[SESSION_ID, agent]]) })
    const created = await createThread(cwd)

    const outcome = await deliver(makeCtx(registry), cwd, created, AT2)

    expect(outcome).toBe('delivered')
    expect(agent.followup).toHaveBeenCalledTimes(1)
    expect(agent.steer).not.toHaveBeenCalled()
    const persisted = await persistedThread(cwd, created.id)
    expect(persisted.delivery).toBe('delivered')
    expect(persisted.delivery).toBe(outcome)
    expect(persisted.deliveredAt).toBe(AT2)
  })

  it('查无活 Agent（空注册表）：no-agent 落盘不投递，零注入无 deliveredAt', async () => {
    const agent = makeAgent('running') // 注册表里没有该会话，stub 仅为断言零注入持有
    const registry = new Map<string, AgentStub>()
    const { cwd } = await makeHarness({ registry })
    const created = await createThread(cwd)

    const outcome = await deliver(makeCtx(registry), cwd, created, AT2)

    expect(outcome).toBe('no-agent')
    expect(agent.steer).not.toHaveBeenCalled()
    expect(agent.followup).not.toHaveBeenCalled()
    const persisted = await persistedThread(cwd, created.id)
    expect(persisted.delivery).toBe('no-agent')
    expect(persisted.delivery).toBe(outcome)
    expect(persisted.deliveredAt).toBeUndefined()
  })

  it('agents 服务缺席（ctx.get 抛错）：与查无 Agent 同归 no-agent', async () => {
    const { cwd } = await makeHarness({ getThrows: true })
    const created = await createThread(cwd)

    const outcome = await deliver(makeCtx(undefined, { getThrows: true }), cwd, created, AT2)

    expect(outcome).toBe('no-agent')
    const persisted = await persistedThread(cwd, created.id)
    expect(persisted.delivery).toBe('no-agent')
    expect(persisted.deliveredAt).toBeUndefined()
  })

  it('steer 抛错：inject-error 落盘（调用发生过但失败显式成词，不静默吞）', async () => {
    const agent = makeAgent('running', { steerThrows: true })
    const { cwd, registry } = await makeHarness({ registry: new Map([[SESSION_ID, agent]]) })
    const created = await createThread(cwd)

    const outcome = await deliver(makeCtx(registry), cwd, created, AT2)

    expect(outcome).toBe('inject-error')
    expect(agent.steer).toHaveBeenCalledTimes(1)
    const persisted = await persistedThread(cwd, created.id)
    expect(persisted.delivery).toBe('inject-error')
    expect(persisted.delivery).toBe(outcome)
    expect(persisted.deliveredAt).toBeUndefined()
  })

  it('followup 抛错：inject-error 落盘（空闲通道失败同权级）', async () => {
    const agent = makeAgent('idle', { followupThrows: true })
    const { cwd, registry } = await makeHarness({ registry: new Map([[SESSION_ID, agent]]) })
    const created = await createThread(cwd)

    const outcome = await deliver(makeCtx(registry), cwd, created, AT2)

    expect(outcome).toBe('inject-error')
    expect(agent.followup).toHaveBeenCalledTimes(1)
    const persisted = await persistedThread(cwd, created.id)
    expect(persisted.delivery).toBe('inject-error')
    expect(persisted.delivery).toBe(outcome)
  })
})

// ── 3. 投递周期内容与同一分流（D4 / D6 .reply 追加）──────────────────────────

describe('投递周期内容与同一分流（D4 / D6）', () => {
  it('.reply 追加投递：载荷 text = 末条追加文本且线程 id 在载荷（D6 追加形态）', async () => {
    const agent = makeAgent('idle')
    const { cwd, registry } = await makeHarness({ registry: new Map([[SESSION_ID, agent]]) })
    const created = await createThread(cwd)
    expect(await deliver(makeCtx(registry), cwd, created, AT)).toBe('delivered')

    const appended = await appendCommentReply(cwd, created.id, '标题字号太大', AT2)
    const outcome = await deliver(makeCtx(registry), cwd, appended, AT2)

    expect(outcome).toBe('delivered')
    expect(agent.followup).toHaveBeenCalledTimes(2)
    const payload = parseFencedPayload(messageText(injectedMessage(agent, 'followup')))
    expect(payload.threadId).toBe(created.id)
    expect(payload.text).toBe('标题字号太大')
    expect(payload.artifactPath).toBe('index.html')
    const persisted = await persistedThread(cwd, created.id)
    expect(persisted.delivery).toBe('delivered')
    expect(persisted.replies).toEqual([{ text: '标题字号太大', at: AT2 }])
    expect(persisted.deliveredAt).toBe(AT2)
  })

  it('D7：带锚点线程的 reply 投递载荷恒带首评锚点（追加不改写，D1 不可变）', async () => {
    const anchor: CommentAnchor = { level: 'data', sel: '[data-od-id="hero-banner"]' }
    const agent = makeAgent('idle')
    const { cwd, registry } = await makeHarness({ registry: new Map([[SESSION_ID, agent]]) })
    const created = await createThread(cwd, FIRST_COMMENT, anchor)
    expect(await deliver(makeCtx(registry), cwd, created, AT)).toBe('delivered')

    const appended = await appendCommentReply(cwd, created.id, '标题字号太大', AT2)
    expect(appended.anchor).toEqual(anchor) // 追加不改写首评锚点（D1 不可变不变量）
    const outcome = await deliver(makeCtx(registry), cwd, appended, AT2)

    expect(outcome).toBe('delivered')
    expect(agent.followup).toHaveBeenCalledTimes(2)
    // reply 载荷：text = 末条追加文本，anchor 恒为线程首评锚点（D7——每轮回注都可定位）
    const payload = parseFencedPayload(messageText(injectedMessage(agent, 'followup')))
    expect(payload.text).toBe('标题字号太大')
    expect(payload.anchor).toEqual(anchor)
    const persisted = await persistedThread(cwd, created.id)
    expect(persisted.anchor).toEqual(anchor)
  })

  it('.retry 重投走同一分流：no-agent 失败态重投后 delivered，载荷 text = 首评原文（D4）', async () => {
    const { cwd, registry } = await makeHarness({ registry: new Map() }) // 首投：查无活 Agent
    const created = await createThread(cwd)
    expect(await deliver(makeCtx(registry), cwd, created, AT)).toBe('no-agent')

    const retried = await retryCommentDelivery(cwd, created.id, AT2) // open × no-agent → open × pending
    const agent = makeAgent('running')
    registry.set(SESSION_ID, agent) // 会话复活（面板重试场景）
    const outcome = await deliver(makeCtx(registry), cwd, retried, AT2)

    expect(outcome).toBe('delivered')
    expect(agent.steer).toHaveBeenCalledTimes(1)
    const payload = parseFencedPayload(messageText(injectedMessage(agent, 'steer')))
    expect(payload.threadId).toBe(created.id)
    expect(payload.text).toBe(FIRST_COMMENT) // 纯重投：旧内容原文重发，不写新文本
    const persisted = await persistedThread(cwd, created.id)
    expect(persisted.delivery).toBe('delivered')
    expect(persisted.delivery).toBe(outcome)
    expect(persisted.replies).toEqual([])
  })
})

// ── 4. 边界：状态机 fail-fast（AX3，不静默吞）────────────────────────────────

describe('边界：重复投递 = 状态机表外转移（AX3）', () => {
  it('对已 delivered 线程再次投递：回写点抛 CommentTransitionError，盘上状态不变', async () => {
    const agent = makeAgent('running')
    const { cwd, registry } = await makeHarness({ registry: new Map([[SESSION_ID, agent]]) })
    const created = await createThread(cwd)
    expect(await deliver(makeCtx(registry), cwd, created, AT)).toBe('delivered')

    await expect(deliver(makeCtx(registry), cwd, created, AT2)).rejects.toBeInstanceOf(CommentTransitionError)

    const persisted = await persistedThread(cwd, created.id)
    expect(persisted.delivery).toBe('delivered') // 事务中止，状态不被二次回写
    expect(persisted.deliveredAt).toBe(AT) // 首次投递时刻保留，不被重投时刻覆盖
    expect(agent.steer).toHaveBeenCalledTimes(2) // 消息注入先行发生（fail-fast 归调用方 bug）
  })
})
