/**
 * 评论写通道路由族（opendesign-comment-loop U2；机制权威 = 设计 §3.1 写通道段 +
 * §3.3 D2 / D4，公理 AX5「写通道唯一走宿主 connection 服务的 fetch 注册器」）。
 *
 * 注册形态（D2 采用条款，baoyu 产线先例）：od-serve 同子插件内 ctx.inject(['connection'])
 * 经 `sub.connection.fetch.register({ path, methods, requestBody: 'buffered', fetch })`
 * 注册 /api/opendesign-design-mode.comments 路由族五条——POST .create（落盘新线程 + 投递 +
 * 返回最终线程）、POST .reply（追加评论，resolved 自动回 open 且 delivery 重置 pending 后
 * 投递）、POST .retry（失败态纯重投不写新文本；delivered / pending / resolved 拒绝）、
 * POST .resolve（状态变更不投递）、GET 基路径（线程全量列表，损坏文件返回错误态标记）。
 *
 * 鉴权归属（AX5 / D2）：路由挂在宿主 connection 的 /api 共享通道上，Host-Origin 围栏与
 * 浏览器认证由共享 handler 层（connection.admit）在分发前完成——本文件 handler 不自查
 * 任何额外鉴权（复制宿主信任判定 = D2 明示不采用的 webServer 路线），也不判定会话类型
 * （与产物伺服路由 artifacts-route.ts 同一权级口径）。
 *
 * 载荷校验（D2 / V4）：sessionId 指向不存在的会话 404 fail-closed（resolveSessionCwdById
 * 同一通道，绝不回退部署级目录）；text 非空且 ≤ COMMENT_TEXT_MAX_LENGTH（400，store
 * validateCommentText 同一判定）；artifactPath 仅接受会话内相对路径、无 `..` 段（任务书
 * 明示输入契约），落点经词法 resolve + realpath 包含判定双层防护（照 artifacts-route.ts
 * resolveArtifactPath 同权级——realpath 对缺席目标不可判定，逐级上探最深存在祖先补全
 * 包含判定，防「父级符号链接指外 + 叶子缺席」逃逸）；校验全部先于任何 store 写动作，
 * 拒绝路径零落盘副作用（V4 判据）。
 *
 * 事务边界（D4）：写路由处理器内顺序完成 store 落盘（create/appendReply/retry 后线程
 * 必为 open × pending）→ deliverComment 投递并回写 delivery（lib/comments/feedback.ts，
 * U3）→ 重读线程以最终落盘态回面板。失败路径（no-agent / inject-error）落状态不抛异常；
 * 状态机表外转移（并发 .resolve 与投递竞态等调用方 bug）由 CommentTransitionError
 * fail-fast 映射 409，不静默吞（AX3）。
 *
 * Request/Response 为 Node 18+ 全局（宿主 connection bridge 同款交换载体）。
 * 编号口径：本文件裸编号（D/AX/V/RL 等）属 opendesign-comment-loop 设计包。
 */

import { realpath } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'

import { deliverComment } from '../comments/feedback.js'
import {
  COMMENTS_API_ACTION_PATHS,
  COMMENTS_API_BASE_PATH,
  type CommentThread,
} from '../comments/contract.js'
import {
  appendCommentReply,
  CommentStoreCorruptError,
  CommentStoreLockError,
  CommentStoreValidationError,
  CommentThreadNotFoundError,
  createCommentThread,
  findCommentThread,
  readCommentsFile,
  resolveCommentThread,
  retryCommentDelivery,
  validateCommentText,
} from '../comments/store.js'
import { CommentTransitionError } from '../comments/thread.js'
import { resolveSessionCwdById } from './session-cwd.js'

// ── 注册面（宿主 connection 服务的结构局部消费视图）─────────────────────────

/** connection 服务 exact fetch 路由的本包消费视图（宿主 ConnectionFetchRoute 结构局部化，先例 = artifacts-route 的 ServeConnection）。 */
export interface CommentsFetchRoute {
  /** 绝对路径（/api 域内；宿主共享鉴权层覆盖的唯一含义就是落在这个通道）。 */
  readonly path: string
  /** 本路由认领的方法（不匹配方法由宿主共享通道分发兜底，handler 不自行 405）。 */
  readonly methods: readonly ('GET' | 'POST')[]
  /** 请求体缓冲模式（载荷为 KB 级 JSON，D2 明示 buffered）。 */
  readonly requestBody: 'buffered'
  /** fetch 形态 handler：接收 WHATWG Request，返回 Response（bridge 负责物理传输）。 */
  readonly fetch: (request: Request) => Promise<Response>
}

/** connection.fetch 注册器消费视图（baoyu 同款 `sub.connection.fetch.register` 形态）。 */
export interface CommentsFetchRegistry {
  register(route: CommentsFetchRoute): unknown
}

/** ctx.inject(['connection']) 子 scope 的消费视图（effect 登记路由、卸载即撤除）。 */
export interface CommentsApiScope {
  effect(factory: () => unknown, label?: string): unknown
  readonly connection: { readonly fetch: CommentsFetchRegistry }
}

/** 动作词表（'.create'/'.reply'/'.retry'/'.resolve' 去点形态；GET 基路径为 list）。 */
type CommentsAction = 'list' | 'create' | 'reply' | 'retry' | 'resolve'

// ── 内部错误（status + code 一体携带；映射单一出口）─────────────────────────

/** 本路由自产的请求侧错误（载荷形态 / 越界 / 会话缺席；恢复动作写进 message）。 */
class CommentsHttpError extends Error {
  override readonly name = 'CommentsHttpError'

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

/** 所有可预期错误的唯一响应映射出口（不在此表的按 500 内部错误呈现，不崩溃不静默）。 */
function toErrorResponse(error: unknown): Response {
  if (error instanceof CommentsHttpError) {
    return jsonResponse(error.status, { code: error.code, message: error.message })
  }
  if (error instanceof CommentStoreValidationError) {
    return jsonResponse(400, { code: 'invalid-payload', message: error.message })
  }
  if (error instanceof CommentThreadNotFoundError) {
    return jsonResponse(404, { code: 'thread-not-found', message: error.message })
  }
  if (error instanceof CommentTransitionError) {
    return jsonResponse(409, { code: 'invalid-transition', message: error.message })
  }
  if (error instanceof CommentStoreCorruptError) {
    // 损坏语义 V9：GET 错误态标记 / POST 拒写零副作用——store 的事务开头读即抛，盘上
    // 字节未被触碰；message 已含恢复动作（手工修复或删除重建，插件不自动重建）。
    return jsonResponse(500, { code: 'comments-corrupt', message: error.message })
  }
  if (error instanceof CommentStoreLockError) {
    return jsonResponse(503, { code: 'comments-lock-timeout', message: error.message })
  }
  return jsonResponse(500, {
    code: 'comments-internal',
    message: error instanceof Error ? error.message : String(error),
  })
}

// ── 响应与载荷基础 ─────────────────────────────────────────────────────────

/** JSON 响应（no-store：状态与错误是每次都需重判的实时事实，artifacts-route 同款口径）。 */
function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/** 解析 JSON 请求体（顶层必须为对象；失败按 400 呈现，不向 bridge 抛未捕获异常）。 */
async function parseJsonBody(request: Request): Promise<Record<string, unknown>> {
  let parsed: unknown
  try {
    parsed = await request.json()
  } catch {
    throw new CommentsHttpError(400, 'bad-request', '请求体不是合法 JSON')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new CommentsHttpError(400, 'invalid-payload', '载荷顶层必须是 JSON 对象')
  }
  return parsed as Record<string, unknown>
}

/** 取非空字符串字段（缺失/类型不符/空串同按 400 呈现，恢复动作 = 修正载荷重发）。 */
function requireStringField(body: Record<string, unknown>, field: string): string {
  const value = body[field]
  if (typeof value !== 'string' || value.length === 0) {
    throw new CommentsHttpError(400, 'invalid-payload', `载荷字段 ${field} 必须是非空字符串`)
  }
  return value
}

/** text 字段必须是字符串（空与超限交由 store 的 validateCommentText 判定，同一 400 词）。 */
function requireTextField(body: Record<string, unknown>): string {
  const value = body.text
  if (typeof value !== 'string') {
    throw new CommentsHttpError(400, 'invalid-payload', '载荷字段 text 必须是字符串')
  }
  return value
}

/** 会话解析（404 fail-closed：不存在的会话不落任何盘，与伺服路由同一通道同一拒绝词）。 */
function requireSessionCwd(ctx: unknown, sessionId: string): string {
  const cwd = resolveSessionCwdById(ctx, sessionId)
  if (cwd === null) {
    throw new CommentsHttpError(404, 'session-unknown', `sessionId 指向的会话不存在或缺工作目录：${sessionId}`)
  }
  return cwd
}

/** 会话根 realpath（404 root-missing：目录缺席无从谈落点包含，artifacts-route 同词）。 */
async function requireSessionRoot(cwd: string): Promise<string> {
  const rootReal = await realpath(cwd).catch(() => undefined)
  if (rootReal === undefined) {
    throw new CommentsHttpError(404, 'root-missing', `会话工作目录不存在：${cwd}`)
  }
  return rootReal
}

// ── artifactPath 落点包含判定（双层防护，照 artifacts-route.ts:155-179 同权级）──

/**
 * artifactPath 是否落在会话工作目录内（词法 resolve + realpath 包含判定的双层防护）。
 *
 * 与产物伺服路由的两点差异都有明确理由：
 *   1. 前置拒绝 `..` 段与绝对路径（任务书对写通道载荷的明示输入契约；伺服路由放行
 *      cwd 内归一化形态是读路由的裁决，写通道按更严的输入契约执行——`..` 段在元数据
 *      路径上无表达力，拒绝零功能损失）；NUL 字节同拒（任何落点都不该含它）。
 *   2. 目标缺席时 realpath 不可判定（ENOENT 不回已解析前缀），逐级上探最深存在祖先
 *      补全包含判定——「cwd 内符号链接指外 + 其下叶子缺席」的逃逸形态由此拦下；
 *      全链缺席最终止于 rootReal（必存在），循环必收敛。
 */
async function isInsideSessionRoot(rootReal: string, artifactPath: string): Promise<boolean> {
  if (artifactPath.includes('\0') || isAbsolute(artifactPath)) return false
  if (artifactPath.split('/').includes('..')) return false
  const lexical = resolve(join(rootReal, artifactPath))
  if (lexical !== rootReal && !lexical.startsWith(rootReal + sep)) return false
  let probe = lexical
  for (;;) {
    try {
      const real = await realpath(probe)
      return real === rootReal || real.startsWith(rootReal + sep)
    } catch {
      const parent = dirname(probe)
      if (parent === probe) return true
      probe = parent
    }
  }
}

/** 落点越界的统一拒绝（403 forbidden；message 点名字段与约束，V4 三类拒绝之一）。 */
async function requireArtifactPathInside(rootReal: string, artifactPath: string): Promise<void> {
  if (await isInsideSessionRoot(rootReal, artifactPath)) return
  throw new CommentsHttpError(
    403,
    'forbidden',
    `artifactPath 越界：必须是不含 .. 段的会话内相对路径且落点不出会话工作目录（收到 ${artifactPath}）`,
  )
}

// ── 五个动作的处理器（校验全部先于 store 写动作：拒绝路径零落盘副作用）────────

/** GET 基路径：线程全量列表（损坏文件抛 CommentStoreCorruptError → 500 错误态标记）。 */
async function handleList(ctx: unknown, url: URL): Promise<Response> {
  const sessionId = url.searchParams.get('sessionId')
  if (sessionId === null || sessionId === '') {
    throw new CommentsHttpError(400, 'invalid-payload', 'GET 基路径需要 query 参数 sessionId')
  }
  const cwd = requireSessionCwd(ctx, sessionId)
  const file = await readCommentsFile(cwd)
  return jsonResponse(200, { version: file.version, threads: file.threads })
}

/** POST .create：落盘新线程 → 投递 → 最终线程回面板。 */
async function handleCreate(ctx: unknown, body: Record<string, unknown>): Promise<Response> {
  const sessionId = requireStringField(body, 'sessionId')
  const artifactPath = requireStringField(body, 'artifactPath')
  const text = requireTextField(body)
  const cwd = requireSessionCwd(ctx, sessionId)
  const rootReal = await requireSessionRoot(cwd)
  await requireArtifactPathInside(rootReal, artifactPath)
  validateCommentText(text)
  const thread = await createCommentThread(cwd, { artifactPath, text })
  return await deliverAndRespond(ctx, sessionId, cwd, thread)
}

/** POST .reply：追加评论（resolved 自动回 open 且 delivery 重置 pending）→ 投递。 */
async function handleReply(ctx: unknown, body: Record<string, unknown>): Promise<Response> {
  const sessionId = requireStringField(body, 'sessionId')
  const threadId = requireStringField(body, 'threadId')
  const text = requireTextField(body)
  const cwd = requireSessionCwd(ctx, sessionId)
  validateCommentText(text) // 拒绝在先：文本越限不产生任何落盘（含 reopen 副作用）
  const thread = await appendCommentReply(cwd, threadId, text)
  return await deliverAndRespond(ctx, sessionId, cwd, thread)
}

/** POST .retry：失败态纯重投不写新文本（pending/delivered/resolved 由状态机表外拒绝 → 409）。 */
async function handleRetry(ctx: unknown, body: Record<string, unknown>): Promise<Response> {
  const sessionId = requireStringField(body, 'sessionId')
  const threadId = requireStringField(body, 'threadId')
  const cwd = requireSessionCwd(ctx, sessionId)
  const thread = await retryCommentDelivery(cwd, threadId)
  return await deliverAndRespond(ctx, sessionId, cwd, thread)
}

/** POST .resolve：状态变更不投递（仅 resolved:true——重开由 .reply 承载，D5 转移④）。 */
async function handleResolve(ctx: unknown, body: Record<string, unknown>): Promise<Response> {
  const sessionId = requireStringField(body, 'sessionId')
  const threadId = requireStringField(body, 'threadId')
  if (body.resolved !== true) {
    throw new CommentsHttpError(400, 'invalid-payload', '载荷字段 resolved 必须为 true；重开已解决线程走 .reply 追加（D5 转移④）')
  }
  const cwd = requireSessionCwd(ctx, sessionId)
  return jsonResponse(200, await resolveCommentThread(cwd, threadId))
}

/**
 * 投递并回最终线程（D4 事务边界的消费侧：store 落盘后的线程必为 open × pending，
 * deliverComment 投递并回写 delivery；重读磁盘拿权威终态——回写是 deliverComment 内部
 * 的独立写事务，直接改写返回线程对象会复刻 store 的 deliveredAt 逻辑，双写即漂移温床）。
 */
async function deliverAndRespond(ctx: unknown, sessionId: string, cwd: string, thread: CommentThread): Promise<Response> {
  await deliverComment({ ctx, sessionId, cwd, thread })
  const file = await readCommentsFile(cwd)
  return jsonResponse(200, findCommentThread(file.threads, thread.id))
}

// ── 分发与注册 ────────────────────────────────────────────────────────────

/** 单请求完整处置（错误一律收拢为 JSON 响应——bridge 对 handler 抛错无兜底语义可依赖）。 */
async function handleCommentsRequest(ctx: unknown, action: CommentsAction, request: Request): Promise<Response> {
  try {
    if (action === 'list') return await handleList(ctx, new URL(request.url))
    const body = await parseJsonBody(request)
    if (action === 'create') return await handleCreate(ctx, body)
    if (action === 'reply') return await handleReply(ctx, body)
    if (action === 'retry') return await handleRetry(ctx, body)
    return await handleResolve(ctx, body)
  } catch (error) {
    return toErrorResponse(error)
  }
}

/**
 * 构造评论写通道路由族（恰五条：GET 基路径 + 四条 POST 动作；路径常量取自 contract.ts，
 * 注册形态与测试共用同一数组词表——漂移即测试红灯）。
 *
 * @param ctx - Cordis 插件上下文（会话 cwd 通道与 agents 服务经它取用；agents 由
 *   deliverComment 内部消费，本文件不直接触达）。
 */
export function createCommentsApiRoutes(ctx: unknown): CommentsFetchRoute[] {
  const actionOf = (actionPath: string): CommentsAction => actionPath.slice(1) as CommentsAction
  return [
    {
      path: COMMENTS_API_BASE_PATH,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: (request) => handleCommentsRequest(ctx, 'list', request),
    },
    ...COMMENTS_API_ACTION_PATHS.map((actionPath) => ({
      path: COMMENTS_API_BASE_PATH + actionPath,
      methods: ['POST'] as const,
      requestBody: 'buffered' as const,
      fetch: (request: Request) => handleCommentsRequest(ctx, actionOf(actionPath), request),
    })),
  ]
}

/**
 * 评论写通道路由族注册（od-serve 装配调用；每条路由独立 effect——任一路由的卸载即撤除
 * 其注册，且 effect 标签携带方法与路径供 doctor 第⑫节路由注册状态探取与单测断言）。
 *
 * @param scope - ctx.inject(['connection']) 子 scope（connection 服务已就位的消费面）。
 * @param ctx - 外层插件上下文（路由 handler 经它取会话 cwd 通道）。
 */
export function registerCommentsApiRoutes(scope: CommentsApiScope, ctx: unknown): void {
  for (const route of createCommentsApiRoutes(ctx)) {
    scope.effect(() => scope.connection.fetch.register(route), `od-serve: ${route.methods.join('|')} ${route.path}`)
  }
}
