/**
 * 评论数据文件读写（U1；机制权威 = 设计 §3.3 D1「会话级单文件 .od-comments/comments.json」
 * 与公理 AX1「评论数据的唯一权威是会话工作目录下的评论数据文件」）。
 *
 * 写入协议（D1 + impl-plan U1 责任声明）：
 *   1. 进程内互斥队列（per-cwd Promise 链）串行化同一进程的全部读-改-写事务——消费方
 *      （U2 comments-api 路由处理器 / U3 delivery 回写）在 Node 单线程事件循环下多请求
 *      于 await 点交错，队列保证事务无交错（RL4「多请求交错后 parse 恒成功」的支柱）；
 *   2. lock 文件跨进程兜底（D1 已按 impl-plan U1 责任声明回写 lock 维度：本设计当前无
 *      跨进程写者，lock 定位为防未来跨进程写者误入 + 崩溃残留自愈的双重保险防线）：
 *      wx 独占创建，已存在时按
 *      mtime 陈旧判定夺锁，否则有限轮询等待，超时抛 CommentStoreLockError（不无限等）；
 *   3. 持锁临界区内全同步 fs（读现有文件 → 变换 → 临时文件 → renameSync 原子替换）——
 *      临界区无 await 无交错点；rename 同目录原子性保证任何瞬间盘上要么完整旧文件要么
 *      完整新文件、无半写可见态（UC11）。
 *
 * 损坏语义（D1 / RL7 防数据丢失）：parse 失败或结构不符抛 CommentStoreCorruptError——
 * 读侧报错不自动重建（GET 错误态与 doctor 第⑫节 parse 健康度由调用方呈现，V9 四处理
 * 一致），写侧拒写（事务开头读现有文件即抛，损坏原样保留，绝不覆盖）。
 *
 * 时间戳口径：ISO 8601 字符串（contract.ts）；写函数带可选 at 参数（调用方传投递/操作
 * 时刻，缺省当前时刻）——U3 投递结果回写用真实时刻，单测传固定值断言确定性。
 * 编号口径：本文件裸编号（D/AX/RL/UC/V 等）属 opendesign-comment-loop 设计包。
 */

import { randomBytes, randomUUID } from 'node:crypto'
import { closeSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import {
  COMMENT_DELIVERY_STATES,
  COMMENT_TEXT_MAX_LENGTH,
  COMMENT_THREAD_ID_PREFIX,
  COMMENT_THREAD_STATUSES,
  COMMENTS_DIR_NAME,
  COMMENTS_FILE_NAME,
  COMMENTS_FILE_VERSION,
  type CommentDelivery,
  type CommentThread,
  type CommentsFile,
} from './contract.js'
import { applyThreadTransition, createInitialThreadFields, type DeliverOutcome } from './thread.js'

/** lock 文件名（COMMENTS_DIR_NAME 下；写事务独占持有，事务结束即删）。 */
export const COMMENTS_LOCK_NAME = 'comments.json.lock'

/**
 * lock 陈旧阈值毫秒数（impl-plan U1 责任声明授权补充：按面板单用户场景取保守值）。
 * 依据：单用户场景一次写事务 = 读现有文件 + 变换 + 写临时文件 + rename，百 KB 级数据
 * 在本地磁盘为毫秒级（量级上界 << 100ms）；5000ms 是该上界 50 倍余量——活跃事务不可
 * 能持锁这么久，超时只能说明持锁进程已崩溃残留（泄漏），夺锁自愈。取保守值而非贴着
 * 最坏事务时长，是为了绝不误夺活跃锁：误夺 = 双写者并发 = 半写风险，宁可多等。
 */
export const COMMENT_LOCK_STALE_MS = 5000

/** lock 被占时的轮询等待总上限毫秒数（单用户场景无真实跨进程竞争者，纯兜底防无限等）。 */
export const COMMENT_LOCK_WAIT_MS = 2000

/** lock 轮询间隔毫秒数。 */
export const COMMENT_LOCK_POLL_MS = 25

/** 会话 cwd → comments.json 绝对路径（全部读写侧共用同一拼装，与 qualityReportPath 同形态）。 */
export function commentsFilePath(cwd: string): string {
  return path.join(cwd, COMMENTS_DIR_NAME, COMMENTS_FILE_NAME)
}

/** 会话 cwd → lock 文件绝对路径。 */
export function commentsLockPath(cwd: string): string {
  return path.join(cwd, COMMENTS_DIR_NAME, COMMENTS_LOCK_NAME)
}

// ── 可辨识错误（调用方按 instanceof 分流；恢复动作写进 message）──────────────

/** 评论数据文件损坏（parse 失败或结构不符；读侧上抛呈现、写侧拒写防覆盖，RL7）。 */
export class CommentStoreCorruptError extends Error {
  override readonly name = 'CommentStoreCorruptError'

  constructor(detail: string) {
    super(
      `评论数据文件损坏（读侧报错不自动重建 / 写侧拒写，D1）：${detail}；` +
        `恢复动作：手工修复 ${COMMENTS_FILE_NAME} 或整文件删除重建（插件不自动重建，doctor 第⑫节同源呈现）`,
    )
  }
}

/** lock 等待超时（持锁者超过等待上限仍活跃；数据未动，稍后重试或人工检查残留锁）。 */
export class CommentStoreLockError extends Error {
  override readonly name = 'CommentStoreLockError'

  constructor(detail: string) {
    super(`评论数据文件写锁获取失败：${detail}；恢复动作：稍后重试，若持续失败检查残留 lock 文件`)
  }
}

/** 指定线程不存在（id 误传或文件被手工改动；调用方呈现，不静默）。 */
export class CommentThreadNotFoundError extends Error {
  override readonly name = 'CommentThreadNotFoundError'

  constructor(threadId: string) {
    super(`评论线程不存在：${threadId}；恢复动作：经 GET 基路径拉取线程列表核对 id`)
  }
}

/** 载荷校验失败（文本空/超限等；调用方返回 400 级错误，与 D2 路由校验同权级）。 */
export class CommentStoreValidationError extends Error {
  override readonly name = 'CommentStoreValidationError'

  constructor(detail: string) {
    super(`评论载荷校验拒绝：${detail}`)
  }
}

// ── 读侧 ────────────────────────────────────────────────────────────────────

/** 文件缺席 → 初始空形态（不落盘——首次 create 时才建目录建文件）。 */
function emptyCommentsFile(): CommentsFile {
  return { version: COMMENTS_FILE_VERSION, threads: [] }
}

/** 线程条目最小结构校验（拒损坏不拒未来：只校验类型与词表成员，不校验长度/时间戳格式/id 前缀）。 */
function isCommentThreadLike(value: unknown): value is CommentThread {
  if (typeof value !== 'object' || value === null) return false
  const t = value as Record<string, unknown>
  if (typeof t.id !== 'string' || t.id.length === 0) return false
  if (typeof t.artifactPath !== 'string' || t.artifactPath.length === 0) return false
  if (typeof t.text !== 'string') return false
  if (!Array.isArray(t.replies)) return false
  for (const reply of t.replies) {
    if (typeof reply !== 'object' || reply === null) return false
    const r = reply as Record<string, unknown>
    if (typeof r.text !== 'string' || typeof r.at !== 'string') return false
  }
  if (typeof t.status !== 'string' || !COMMENT_THREAD_STATUSES.includes(t.status as CommentThread['status'])) return false
  if (typeof t.delivery !== 'string' || !COMMENT_DELIVERY_STATES.includes(t.delivery as CommentDelivery)) return false
  if (typeof t.createdAt !== 'string' || t.createdAt.length === 0) return false
  if (typeof t.updatedAt !== 'string' || t.updatedAt.length === 0) return false
  if (t.deliveredAt !== undefined && (typeof t.deliveredAt !== 'string' || t.deliveredAt.length === 0)) return false
  return true
}

/**
 * 解析评论数据文件文本（JSON.parse + 结构校验）。
 * 任何不符抛 CommentStoreCorruptError——parse 健康度唯一判定点（读侧 GET / doctor
 * 第⑫节 / 写事务开头共用同一实现，保证 V9 四处理损坏语义一致）。
 */
export function parseCommentsFileText(raw: string, source: string): CommentsFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch (error) {
    throw new CommentStoreCorruptError(`${source} JSON.parse 失败：${error instanceof Error ? error.message : String(error)}`)
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new CommentStoreCorruptError(`${source} 顶层非对象`)
  }
  const obj = parsed as Record<string, unknown>
  if (obj.version !== COMMENTS_FILE_VERSION) {
    throw new CommentStoreCorruptError(`${source} version=${String(obj.version)} 非 ${COMMENTS_FILE_VERSION}（形态不兼容）`)
  }
  if (!Array.isArray(obj.threads)) {
    throw new CommentStoreCorruptError(`${source} threads 非数组`)
  }
  for (const thread of obj.threads) {
    if (!isCommentThreadLike(thread)) {
      throw new CommentStoreCorruptError(`${source} threads 含结构不符的线程条目（字段缺失或词表外取值）`)
    }
  }
  return { version: COMMENTS_FILE_VERSION, threads: obj.threads as CommentThread[] }
}

/** fs 错误是否指定错误码（ENOENT / EEXIST 等 Node fs 错误的 code 字段）。 */
function isFsCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === code
}

/**
 * 读侧：读评论数据文件全量（GET 基路径列表、doctor 第⑫节消费）。
 * 文件不存在 → 初始空形态（正常态非损坏）；损坏 → CommentStoreCorruptError 上抛
 * （不自动重建、不返回空列表伪装正常，V9 判据）；其余 fs 错误（权限等）原样上抛。
 */
export async function readCommentsFile(cwd: string): Promise<CommentsFile> {
  let raw: string
  try {
    raw = await readFile(commentsFilePath(cwd), 'utf8')
  } catch (error) {
    if (isFsCode(error, 'ENOENT')) return emptyCommentsFile()
    throw error
  }
  return parseCommentsFileText(raw, commentsFilePath(cwd))
}

// ── 写事务（互斥队列 + lock + 原子替换；store 全部写动作的唯一入口）─────────

/** per-cwd 进程内互斥队列（Promise 链尾；同 cwd 事务严格串行，跨 cwd 互不阻塞）。 */
const transactionQueues = new Map<string, Promise<unknown>>()

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms) })
}

/**
 * lock 文件独占创建（wx = O_EXCL）；EEXIST（已被占）返回 false，其余错误原样抛。
 * lock 内容写 pid 与获取时刻（诊断用；陈旧判定以 mtime 为准——内容时钟不可靠）。
 */
function tryAcquireLockSync(lockFile: string): boolean {
  let fd: number
  try {
    fd = openSync(lockFile, 'wx')
  } catch (error) {
    if (isFsCode(error, 'EEXIST')) return false
    throw error
  }
  try {
    writeFileSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), 'utf8')
  } finally {
    closeSync(fd)
  }
  return true
}

/**
 * 获取 lock：未被占即取；被占且已陈旧（mtime 距今超 COMMENT_LOCK_STALE_MS）先夺后重试
 * 创建；未陈旧则轮询等待至 COMMENT_LOCK_WAIT_MS 超时抛 CommentStoreLockError。
 */
async function acquireLock(lockFile: string): Promise<void> {
  const deadline = Date.now() + COMMENT_LOCK_WAIT_MS
  for (;;) {
    if (tryAcquireLockSync(lockFile)) return
    let stale = false
    try {
      stale = Date.now() - statSync(lockFile).mtimeMs > COMMENT_LOCK_STALE_MS
    } catch {
      continue // stat 失败 = lock 刚被释放（竞态窗口），下轮重试创建
    }
    if (stale) {
      // 泄漏自愈（impl-plan U1 责任声明授权的兜底）：持锁进程已崩溃残留，删除后下轮重夺。
      // 本设计无跨进程写者（D1），他进程同判陈旧的竞态窗口纯理论；重夺走 wx
      // 独占创建，失败即再判，不放大窗口。
      try {
        unlinkSync(lockFile)
      } catch {
        continue
      }
      continue
    }
    if (Date.now() >= deadline) {
      throw new CommentStoreLockError(`lock 被占且未陈旧（等待 ${COMMENT_LOCK_WAIT_MS}ms 超时）：${lockFile}`)
    }
    await sleep(COMMENT_LOCK_POLL_MS)
  }
}

function releaseLockSync(lockFile: string): void {
  try {
    unlinkSync(lockFile)
  } catch {
    // ENOENT = 已被（陈旧夺锁路径）移除——释放幂等，非错误
  }
}

/**
 * 执行一次读-改-写事务（store 全部写动作的唯一入口——单入口规约）：
 * 进程内队列串行 → lock 跨进程兜底 → 读现有文件（损坏即拒写，RL7）→ transform 变换
 * 线程数组并选中受影响线程 → 临时文件 + renameSync 原子替换 → finally 释放 lock。
 * transform 抛错（含状态机表外 CommentTransitionError）= 事务中止，盘上文件不动。
 */
async function withCommentsTransaction<T>(
  cwd: string,
  transform: (threads: CommentThread[]) => { threads: CommentThread[]; selected: T },
): Promise<T> {
  const file = commentsFilePath(cwd)
  const lockFile = commentsLockPath(cwd)
  const queueKey = path.resolve(cwd)
  const previous = transactionQueues.get(queueKey) ?? Promise.resolve()
  const job = previous.then(async (): Promise<T> => {
    await mkdir(path.dirname(file), { recursive: true })
    await acquireLock(lockFile)
    try {
      // 临界区全同步：损坏 → CommentStoreCorruptError（写侧拒写，RL7）
      let current: CommentsFile
      try {
        current = parseCommentsFileText(readFileSync(file, 'utf8'), file)
      } catch (error) {
        if (isFsCode(error, 'ENOENT')) {
          current = emptyCommentsFile()
        } else {
          throw error
        }
      }
      const { threads, selected } = transform(current.threads)
      const tmpFile = `${file}.tmp-${randomBytes(6).toString('hex')}`
      try {
        writeFileSync(tmpFile, `${JSON.stringify({ version: COMMENTS_FILE_VERSION, threads })}\n`, 'utf8')
        renameSync(tmpFile, file) // 同目录 rename 原子替换（无半写可见态，UC11）
      } catch (writeError) {
        try {
          unlinkSync(tmpFile)
        } catch {
          // rename 已成功或临时文件未建成——清理幂等
        }
        throw writeError
      }
      return selected
    } finally {
      releaseLockSync(lockFile)
    }
  })
  transactionQueues.set(queueKey, job.catch(() => undefined))
  return job
}

// ── 线程增改查（impl-plan U1 责任声明四方法 + retry 转移落盘承载）─────────────────────────

/** 校验评论文本（D2 同权级：非空且 ≤ COMMENT_TEXT_MAX_LENGTH；首条与追加同限）。 */
export function validateCommentText(text: string): void {
  if (text.length === 0) {
    throw new CommentStoreValidationError('text 为空（非空且 ≤ 10000 字符）')
  }
  if (text.length > COMMENT_TEXT_MAX_LENGTH) {
    throw new CommentStoreValidationError(`text 超限：${text.length} > ${COMMENT_TEXT_MAX_LENGTH} 字符`)
  }
}

/** 按 id 查线程（找不到抛 CommentThreadNotFoundError，不静默）。 */
export function findCommentThread(threads: readonly CommentThread[], threadId: string): CommentThread {
  const found = threads.find((thread) => thread.id === threadId)
  if (found === undefined) {
    throw new CommentThreadNotFoundError(threadId)
  }
  return found
}

/** create 输入（D2 .create 载荷的数据字段；sessionId 由调用方解析成 cwd）。 */
export interface CreateCommentThreadInput {
  /** 评论挂靠的产物路径（会话相对路径；文件级定位 D8）。 */
  artifactPath: string
  /** 首条评论文本（1..COMMENT_TEXT_MAX_LENGTH 字符）。 */
  text: string
}

/**
 * 新建评论线程并落盘（D5 ①：初始态 open × pending；id = c_ 前缀随机标识）。
 * 首次调用自动建 .od-comments/ 目录与文件；text 校验拒绝不落盘。
 */
export async function createCommentThread(
  cwd: string,
  input: CreateCommentThreadInput,
  at?: string,
): Promise<CommentThread> {
  validateCommentText(input.text)
  if (input.artifactPath.length === 0) {
    throw new CommentStoreValidationError('artifactPath 为空')
  }
  const moment = at ?? new Date().toISOString()
  const thread: CommentThread = {
    id: `${COMMENT_THREAD_ID_PREFIX}${randomUUID()}`,
    artifactPath: input.artifactPath,
    text: input.text,
    replies: [],
    ...createInitialThreadFields(moment),
  }
  return withCommentsTransaction(cwd, (threads) => ({ threads: [...threads, thread], selected: thread }))
}

/**
 * 向既有线程追加评论并落盘（D5 ④ append-reply：任意组合态出发 → open × pending——
 * resolved 自动回 open，delivery 一律重置 pending 且 deliveredAt 清除；追加文本与
 * 首条同受 10000 上限）。线程不存在抛 CommentThreadNotFoundError；表外不可能
 * （append-reply 在转移表内覆盖全部八组合态）。
 */
export async function appendCommentReply(
  cwd: string,
  threadId: string,
  text: string,
  at?: string,
): Promise<CommentThread> {
  validateCommentText(text)
  const moment = at ?? new Date().toISOString()
  return withCommentsTransaction(cwd, (threads) => {
    const current = findCommentThread(threads, threadId)
    const transitioned = applyThreadTransition(current, 'append-reply', { at: moment })
    const appended: CommentThread = { ...transitioned, replies: [...transitioned.replies, { text, at: moment }] }
    return { threads: threads.map((thread) => (thread.id === threadId ? appended : thread)), selected: appended }
  })
}

/**
 * 标记线程已解决（D5 ③ resolve：仅 open 出发 → resolved × 同一 delivery，delivery
 * 不变、不触发投递；对已 resolved 线程再 resolve 属表外，抛 CommentTransitionError）。
 */
export async function resolveCommentThread(
  cwd: string,
  threadId: string,
  at?: string,
): Promise<CommentThread> {
  const moment = at ?? new Date().toISOString()
  return withCommentsTransaction(cwd, (threads) => {
    const current = findCommentThread(threads, threadId)
    const resolved = applyThreadTransition(current, 'resolve', { at: moment })
    return { threads: threads.map((thread) => (thread.id === threadId ? resolved : thread)), selected: resolved }
  })
}

/**
 * 投递结果回写（D5 ② deliver：仅 open × pending 出发 → delivered | no-agent |
 * inject-error；delivered 同时写 deliveredAt。U3 投递后回写、U2 路由处理器消费）。
 */
export async function setCommentDelivery(
  cwd: string,
  threadId: string,
  outcome: DeliverOutcome,
  at?: string,
): Promise<CommentThread> {
  const moment = at ?? new Date().toISOString()
  return withCommentsTransaction(cwd, (threads) => {
    const current = findCommentThread(threads, threadId)
    const updated = applyThreadTransition(current, 'deliver', { deliverOutcome: outcome, at: moment })
    return { threads: threads.map((thread) => (thread.id === threadId ? updated : thread)), selected: updated }
  })
}

/**
 * 失败态纯重投的落盘承载（D5 ⑤ retry：仅 open × no-agent / open × inject-error 出发
 * → open × pending，不写新文本；pending 无从重投、delivered 不接受重投、resolved 不
 * 重投旧内容——表外均抛 CommentTransitionError。U2 POST .retry 路由消费）。
 */
export async function retryCommentDelivery(
  cwd: string,
  threadId: string,
  at?: string,
): Promise<CommentThread> {
  const moment = at ?? new Date().toISOString()
  return withCommentsTransaction(cwd, (threads) => {
    const current = findCommentThread(threads, threadId)
    const retried = applyThreadTransition(current, 'retry', { at: moment })
    return { threads: threads.map((thread) => (thread.id === threadId ? retried : thread)), selected: retried }
  })
}
