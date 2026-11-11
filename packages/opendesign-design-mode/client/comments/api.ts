/**
 * client/comments/api.ts —— 评论写通道的浏览器半场 fetch 封装（opendesign-comment-loop §3.1
 * 面板 UI 段 / D2 写通道路由族）。
 *
 * 路径常量单处归属 lib/comments/contract.ts（client 直接 import 它：该模块是纯类型 + 常量、
 * 无 node 依赖，进浏览器 bundle 无基线风险——与 present-card-link.ts 不 import artifacts-route
 * 的原因相反，那里是 Node 半场入口）。fetch 用 document 相对路径（web 同源路由 / 桌面壳
 * dsh-app:// 转发，与产物伺服路由 OPENDESIGN_ARTIFACTS_ROUTE 同寻址形态）；鉴权由宿主
 * /api 共享层承担（AX5），本封装不带凭据。
 *
 * wire 形态（与 lib/serve/comments-api.ts 的路由处理器对齐；载荷字段 = 设计 D2 摘录）：
 *   GET  基路径 ?sessionId=… → 2xx JSON {threads: CommentThread[]}；评论数据文件损坏 /
 *   任何非 2xx / 响应体不可解析 → ok=false（面板显示错误态，不返回空列表伪装正常——comment-loop·V9）。
 *   POST .create {sessionId, artifactPath, text} / .reply {sessionId, threadId, text} /
 *   .retry {sessionId, threadId} / .resolve {sessionId, threadId, resolved:true} →
 *   2xx JSON = 落盘后的 CommentThread（含投递结果 delivery 字段）；失败 → ok=false。
 *   响应体按最小结构校验（thread 字段形态 + 词表收窄）后才交给面板，防御性拒绝越形响应。
 *
 * 本文件还承载面板呈现语义的纯判定（无 react 依赖，tests/comments 单测直测）：
 *   deliveryBadgeKey —— 状态徽标四值映射（pending|delivered|no-agent|inject-error →
 *   locales 的 badge 文案 key；delivered 文案用「已发送」非「已送达」，§3.1 面板 UI 段）；
 *   canRetryDelivery —— 「重试投递」按钮可用性（D5 转移⑤：仅 open × no-agent /
 *   open × inject-error；pending 未投递过、delivered 不重投、resolved 不重投旧内容）。
 */

import {
  COMMENTS_API_BASE_PATH,
  COMMENT_DELIVERY_STATES,
  COMMENT_THREAD_STATUSES,
  type CommentDelivery,
  type CommentThread,
  type CommentThreadStatus,
} from '../../lib/comments/contract'

/** GET 基路径一次拉取的结果（错误态收拢为 ok=false，不区分损坏与不可达——面板同一错误态呈现）。 */
export type CommentsListOutcome =
  | { ok: true; threads: readonly CommentThread[] }
  | { ok: false; status?: number }

/** 一次写操作（create/reply/retry/resolve）的结果（ok=false = HTTP/解析层失败，非投递失败）。 */
export type CommentMutationOutcome =
  | { ok: true; thread: CommentThread }
  | { ok: false; status?: number }

/** POST .create 的载荷（D2：评论挂当前预览产物，面板自动携带 artifactPath——D8 文件级挂靠）。 */
export interface CommentCreateInput {
  readonly sessionId: string
  readonly artifactPath: string
  readonly text: string
}

/** POST .reply 的载荷（resolved 线程追加自动回 open——重开语义在服务端状态机，D5 转移④）。 */
export interface CommentReplyInput {
  readonly sessionId: string
  readonly threadId: string
  readonly text: string
}

/** POST .retry / .resolve 的载荷（resolve 恒 resolved:true——重开由 .reply 承载，D2）。 */
export interface CommentThreadRef {
  readonly sessionId: string
  readonly threadId: string
}

/** 评论写通道的消费面（面板只经它触达宿主，不感知路径与 wire 细节）。 */
export interface CommentsApi {
  /** GET 基路径：会话全量线程列表（面板按当前产物 artifactPath 过滤呈现）。 */
  list(sessionId: string, signal?: AbortSignal): Promise<CommentsListOutcome>
  /** POST .create：新线程 + 投递，返回落盘后的线程。 */
  create(input: CommentCreateInput): Promise<CommentMutationOutcome>
  /** POST .reply：线程内追加评论（resolved 自动重开）。 */
  reply(input: CommentReplyInput): Promise<CommentMutationOutcome>
  /** POST .retry：失败态纯重投（仅 open × no-agent / open × inject-error 适用，D5⑤）。 */
  retry(input: CommentThreadRef): Promise<CommentMutationOutcome>
  /** POST .resolve：标记已解决（不触发投递）。 */
  resolve(input: CommentThreadRef): Promise<CommentMutationOutcome>
}

/** CommentThread 的最小结构校验（越形响应拒收；字段集与词表 = contract.ts 权威）。 */
export function isCommentThread(value: unknown): value is CommentThread {
  if (typeof value !== 'object' || value === null) return false
  const thread = value as Partial<CommentThread>
  return typeof thread.id === 'string' && thread.id !== ''
    && typeof thread.artifactPath === 'string'
    && typeof thread.text === 'string'
    && Array.isArray(thread.replies)
    && (COMMENT_THREAD_STATUSES as readonly string[]).includes(thread.status as CommentThreadStatus)
    && (COMMENT_DELIVERY_STATES as readonly string[]).includes(thread.delivery as CommentDelivery)
    && typeof thread.createdAt === 'string'
    && typeof thread.updatedAt === 'string'
}

/** 一次 fetch 响应的 JSON 解析（非 2xx / 解析失败返回 undefined，调用方收拢为失败态）。 */
async function readJsonOk(response: Response): Promise<unknown | undefined> {
  if (!response.ok) return undefined
  try {
    return await response.json() as unknown
  } catch {
    return undefined
  }
}

/** fetch 实现注入点（缺省 globalThis.fetch；测试可注入桩，产品路径不传）。 */
export function createCommentsApi(fetchImpl?: typeof fetch): CommentsApi {
  const doFetch = fetchImpl ?? globalThis.fetch.bind(globalThis)

  const postThread = async (
    action: '.create' | '.reply' | '.retry' | '.resolve',
    payload: Record<string, unknown>,
  ): Promise<CommentMutationOutcome> => {
    try {
      const response = await doFetch(COMMENTS_API_BASE_PATH + action, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await readJsonOk(response)
      if (!isCommentThread(body)) return { ok: false, status: response.status }
      return { ok: true, thread: body }
    } catch {
      return { ok: false }
    }
  }

  return {
    async list(sessionId, signal) {
      try {
        const response = await doFetch(
          `${COMMENTS_API_BASE_PATH}?sessionId=${encodeURIComponent(sessionId)}`,
          { signal },
        )
        const body = await readJsonOk(response)
        if (typeof body !== 'object' || body === null) return { ok: false, status: response.status }
        const threads = (body as { threads?: unknown }).threads
        if (!Array.isArray(threads) || !threads.every(thread => isCommentThread(thread))) {
          return { ok: false, status: response.status }
        }
        return { ok: true, threads }
      } catch {
        return { ok: false }
      }
    },
    create: (input) => postThread('.create', { ...input }),
    reply: (input) => postThread('.reply', { ...input }),
    retry: (input) => postThread('.retry', { ...input }),
    resolve: (input) => postThread('.resolve', { ...input, resolved: true }),
  }
}

/** 状态徽标四值映射（delivery 词表 → locales 的 badge 文案 key；穷尽 Record，加值即编译错）。 */
const DELIVERY_BADGE_KEYS: Record<CommentDelivery, string> = {
  pending: 'comments.badge.pending',
  delivered: 'comments.badge.delivered',
  'no-agent': 'comments.badge.noAgent',
  'inject-error': 'comments.badge.injectError',
}

/** 线程状态徽标的文案 key（pending 徽标文案 = 「待送达」；往返期间的「发送中」是提交动作指示）。 */
export function deliveryBadgeKey(delivery: CommentDelivery): string {
  return DELIVERY_BADGE_KEYS[delivery]
}

/**
 * 「重试投递」按钮可用性（D5 转移⑤：仅 open × no-agent / open × inject-error）。
 * resolved × 失败态不显示（恢复走对同线程 .reply 追加，与 delivered 态同款处理）。
 */
export function canRetryDelivery(thread: Pick<CommentThread, 'status' | 'delivery'>): boolean {
  return thread.status === 'open' && (thread.delivery === 'no-agent' || thread.delivery === 'inject-error')
}
