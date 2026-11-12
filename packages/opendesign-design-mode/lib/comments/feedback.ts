/**
 * 评论回注服务（U3；机制权威 = 设计 §3.1 回注服务段 + §3.3 D4 / D6，公理 AX2 / AX4）。
 *
 * 职责三件（§3.1 回注服务段）：
 *   1. buildCommentMessage——消息文本三段（comment-loop·D6）：①自报身份行（[opendesign-design-mode
 *      面板评论] 设计面板收到用户对产物的评论，非用户聊天发言）②围栏 JSON 载荷
 *      （threadId/artifactPath/text/createdAt + 可选 anchor，D7；.reply 追加时 text = 追加
 *      文本，载荷恒含线程 id 与线程首评锚点）③改稿指引行（请读该产物源码按评论修改，写盘
 *      即完成交付，无需回复本消息；载荷带 anchor 时其后追加锚点语义说明与保留锚点指令两句）。
 *      消息形状复用质量环 FeedbackUserMessage 字面量（宿主 UserMessage 开放形状，零依赖
 *      直构）。source = comment-loop·D3 采用条款五字段（comment-loop·AX2：独立 kind，永不
 *      冒充 kind='user'）：{ kind, form:'notice', summary:评论首句截断, artifactPath,
 *      threadId }——结构化字段随 user/message 事件持久化（宿主 MessageSourceMap 开放），
 *      为 GenUI 卡片演进预留数据。
 *   2. deliverComment——复用 lib/quality/feedback.ts 的 deliverFeedback 双通道分流
 *      （AX4：插件到会话的投递入口唯一，评论环与质量环共用同一实现，不另起投递通道；
 *      agent 运行中 steer / 空闲 followup；查无活 Agent = no-agent；调用抛错 = inject-error）。
 *   3. 投递结果回写 thread.delivery（store.setCommentDelivery，D5 转移②仅 open × pending
 *      出发）——返回值与落盘态恒一致（RL6 对账；表外转移由状态机 fail-fast 抛
 *      CommentTransitionError，本模块不 catch 吞）。
 *
 * delivered 语义（D4）：已提交投递（steer 或 followup 调用成功返回即记 delivered）——
 * 提交后宿主回合结束取消在途 steer 属宿主语义（UD3），不改变评论环记录、不误标失败。
 *
 * 投递周期内容（.create 首评 / .reply 追加 / .retry 重投共用同一分流，D4「.retry 重投
 * 走同一分流」）：载荷 text = 当前待投递周期的内容——线程无 replies 取首评 text，有
 * replies 取末条追加文本。不变量依据：append-reply 从任意组合态出发都把 delivery 重置
 * 为 pending（D5 转移④），线程一旦存在追加，其后的未决投递周期必属末条追加（首评周期
 * 在追加发生前必然已终结），「末条 reply 优先」恒等于待投递内容。
 *
 * 编号口径：裸编号分域归属——既有段落（回注消息 / 投递分流）的 D/AX/RL/UD 属
 * opendesign-comment-loop 包；元素锚点段的 D1 / D7 属 opendesign-comment-anchor 包
 * （本设计包）；引用其他设计包的同形编号须带域前缀。
 */

import { randomUUID } from 'node:crypto'

import { deliverFeedback, type FeedbackUserMessage } from '../quality/feedback.js'
import { COMMENT_SOURCE_KIND, type CommentAnchor, type CommentThread } from './contract.js'
import { setCommentDelivery } from './store.js'
import type { DeliverOutcome } from './thread.js'

// ── 消息构造（comment-loop·D6：自报身份句式 + 围栏 JSON 载荷 + 改稿指引；
//    comment-loop·D3：source 五字段；D7：载荷可选 anchor 与锚点指令句）──────

/**
 * 围栏 JSON 载荷字段（comment-loop·D6 采用条款四字段 + D7 可选 anchor，恰此五项——
 * 新增字段属设计变更，不在本模块私加）。
 */
export interface CommentMessagePayload {
  /** 线程 id（.reply 追加与 .retry 重投的载荷同含线程 id，comment-loop·D6）。 */
  threadId: string
  /** 评论挂靠的产物路径（会话相对路径，模型视角可直接用文件工具定位）。 */
  artifactPath: string
  /** 待投递评论文本（首评或末条追加，见文件头「投递周期内容」）。 */
  text: string
  /** 线程创建时刻（ISO 8601 字符串）。 */
  createdAt: string
  /** 元素锚点（D7：线程带锚点时存在；任何投递周期恒带线程首评锚点——D1 不可变不变量）。 */
  anchor?: CommentAnchor
}

/**
 * 评论摘要（source.summary）的截断上限（D3「评论首句截断」）——宿主 boundContextSummary
 * 同值先例（dsh-llm CONTEXT_SUMMARY_MAX_CHARS = 120，notice 形态摘要的上界）。
 */
export const COMMENT_SUMMARY_MAX_CHARS = 120

/**
 * 评论首句摘要（D3 source.summary）：取评论文本首行，超长按宿主 boundContextSummary 同款
 * 形态截断（上限 COMMENT_SUMMARY_MAX_CHARS、截后留省略号）——与宿主 notice 形态
 * （tool-jobs 先例）的摘要上界对齐，producer 折叠行的摘要不因长评论撑爆。
 */
function commentSummary(text: string): string {
  const firstLine = text.split('\n')[0] ?? ''
  return firstLine.length <= COMMENT_SUMMARY_MAX_CHARS
    ? firstLine
    : `${firstLine.slice(0, COMMENT_SUMMARY_MAX_CHARS - 1)}…`
}

/**
 * 构造一条评论回注消息（comment-loop·D6 三段：自报身份 / 围栏 JSON / 改稿指引；
 * comment-loop·AX2：source.kind 独立登记不冒充用户发言——宿主以 kind==='user' 判定
 * 人类在场，评论消息绝不取该值；comment-loop·D3：source 五字段随消息持久化，不采用
 * GenUI 卡片的关键理由即这些结构化字段已为卡片演进预留全部数据；D7：载荷带 anchor 时
 * 指令文本追加锚点语义说明与保留锚点指令两句——保留指令走回注消息而非常驻提示词，
 * 语义恰好出现在需要的那一回合）。
 */
export function buildCommentMessage(payload: CommentMessagePayload): FeedbackUserMessage {
  const fencedJson = JSON.stringify(
    {
      threadId: payload.threadId,
      artifactPath: payload.artifactPath,
      text: payload.text,
      createdAt: payload.createdAt,
      ...(payload.anchor === undefined ? {} : { anchor: payload.anchor }),
    },
    null,
    2,
  )
  // 锚点两句只在载荷带 anchor 时追加：锚点语义句解释 anchor.sel，无锚点载荷没有它的
  // 消费对象；无锚点消息文本与既有形态逐字一致（零结构变更）。
  const anchorLines =
    payload.anchor === undefined
      ? []
      : [
          'anchor.sel 为 CSS 选择器，可在产物 HTML 源码中据此定位元素（id 级最可靠）',
          '改稿写盘时保留既有元素的 id 与 data-od-id / data-screen-label 锚属性值，使已有评论不失效',
        ]
  const text = [
    '[opendesign-design-mode 面板评论] 设计面板收到用户对产物的评论，非用户聊天发言',
    '',
    '```json',
    fencedJson,
    '```',
    '',
    '请读该产物源码按评论修改，写盘即完成交付，无需回复本消息',
    ...anchorLines,
  ].join('\n')
  return {
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: {
      kind: COMMENT_SOURCE_KIND,
      form: 'notice',
      summary: commentSummary(payload.text),
      artifactPath: payload.artifactPath,
      threadId: payload.threadId,
    },
  }
}

// ── 投递与回写（D4：复用 deliverFeedback 双通道 → setCommentDelivery 对账落盘）──

export interface DeliverCommentInput {
  /** 宿主 ctx（agents 服务经 ctx.get('agents') 读取；服务缺席由 deliverFeedback 归 no-agent）。 */
  ctx: unknown
  sessionId: string
  /** 会话 cwd（thread.delivery 回写落点根）。 */
  cwd: string
  /** 待投递线程快照（store create/appendReply/retry 的返回值；消息是历史快照，AX1）。 */
  thread: CommentThread
  /** 回写时刻（缺省当前时刻；单测传固定值断言确定性）。 */
  at?: string
}

/**
 * 投递一条评论并回写结果（D4 事务边界：构造 → deliverFeedback 投递 → setCommentDelivery
 * 回写 → 返回投递结果；U2 路由处理器在 store 落盘后调用本函数，返回值直接回面板）。
 * 返回 DeliverOutcome（delivered | no-agent | inject-error）＝落盘 thread.delivery（RL6）。
 * 回写遇状态机表外（如对非 pending 线程投递）抛 CommentTransitionError——调用方 bug 的
 * fail-fast，不静默吞（AX3）；此时消息已注入而记录未变，由调用方按错误呈现。
 */
export async function deliverComment(input: DeliverCommentInput): Promise<DeliverOutcome> {
  const message = buildCommentMessage(commentMessagePayloadOf(input.thread))
  const delivered = deliverFeedback(input.ctx, input.sessionId, message)
  // steered / followup 归并 delivered（D4：已提交投递即 delivered，通道差异不入状态机）；
  // no-agent / inject-error 原样落盘（词表与 CommentDelivery 正交维共用，contract.ts）。
  const outcome: DeliverOutcome = delivered === 'steered' || delivered === 'followup' ? 'delivered' : delivered
  await setCommentDelivery(input.cwd, input.thread.id, outcome, input.at)
  return outcome
}

/**
 * 线程快照 → 围栏 JSON 载荷（投递周期内容推导见文件头「投递周期内容」不变量）。
 * anchor 恒取线程首评锚点（D7）：追加 / 重投周期照带——锚点首评定案后不可变（D1），
 * 每轮回注都可定位是保留指令生效的前提。
 */
function commentMessagePayloadOf(thread: CommentThread): CommentMessagePayload {
  const latestReply = thread.replies[thread.replies.length - 1]
  return {
    threadId: thread.id,
    artifactPath: thread.artifactPath,
    text: latestReply !== undefined ? latestReply.text : thread.text,
    createdAt: thread.createdAt,
    ...(thread.anchor === undefined ? {} : { anchor: thread.anchor }),
  }
}
