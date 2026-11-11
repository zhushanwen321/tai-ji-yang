import { mkdirSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  COMMENTS_DIR_NAME,
  COMMENTS_FILE_VERSION,
  COMMENT_TEXT_MAX_LENGTH,
  COMMENT_THREAD_ID_PREFIX,
  type CommentThread,
} from '../../lib/comments/contract.js'
import {
  appendCommentReply,
  COMMENT_LOCK_STALE_MS,
  commentsFilePath,
  commentsLockPath,
  createCommentThread,
  CommentStoreCorruptError,
  CommentStoreLockError,
  CommentStoreValidationError,
  CommentThreadNotFoundError,
  findCommentThread,
  parseCommentsFileText,
  readCommentsFile,
  resolveCommentThread,
  retryCommentDelivery,
  setCommentDelivery,
} from '../../lib/comments/store.js'
import { CommentTransitionError } from '../../lib/comments/thread.js'

/**
 * 评论数据域 store 单测（U1，RL4 / RL7）：
 * - 增改查落盘形态（create / appendReply / resolve / setDelivery / retry 走真实写路径）；
 * - RL4：并发写（多请求经进程内互斥队列交错）后文件 parse 恒成功、线程无丢失；并发
 *   期间持续读侧轮询零失败（rename 原子替换——任何瞬间盘上要么完整旧文件要么完整新
 *   文件，无半写可见态）；
 * - RL7：损坏文件读侧抛 CommentStoreCorruptError 不自动重建、写侧拒写且损坏字节原样
 *   保留（防数据丢失）；
 * - lock 文件协议：新鲜锁等待超时抛 CommentStoreLockError、陈旧锁（超 COMMENT_LOCK_STALE_MS）
 *   夺锁自愈、事务结束锁不残留。
 * 编号口径：本文件裸编号（D/UC/RL 等）属 opendesign-comment-loop 设计包。
 */

const AT_T0 = '2026-01-01T00:00:00.000Z'
const AT_T1 = '2026-01-01T01:00:00.000Z'
const AT_T2 = '2026-01-01T02:00:00.000Z'
const AT_T3 = '2026-01-01T03:00:00.000Z'

let cwd: string

beforeEach(async () => {
  cwd = await mkdtemp(path.join(tmpdir(), 'od-comments-store-'))
})

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true })
})

/** 盘上真实文件直接 parse（不经 readCommentsFile，验证落盘字节本身）。 */
function readRawThreads(): CommentThread[] {
  const raw = readFileSync(commentsFilePath(cwd), 'utf8')
  return (JSON.parse(raw) as { version: number; threads: CommentThread[] }).threads
}

/** 测试夹具：手工预置 .od-comments/ 目录（模拟盘上已有数据文件/lock 的场景）。 */
function ensureCommentsDir(): void {
  mkdirSync(path.join(cwd, COMMENTS_DIR_NAME), { recursive: true })
}

async function expectStoreError(promise: Promise<unknown>, errorClass: new (detail: string) => Error): Promise<void> {
  try {
    await promise
    expect.unreachable(`应抛 ${errorClass.name}`)
  } catch (error) {
    expect(error).toBeInstanceOf(errorClass)
  }
}

describe('create：新建线程落盘形态（D5 ① 初始态）', () => {
  it('新会话目录首次 create：自动建 .od-comments/，文件 {version:1, threads:[1 条 open × pending]}', async () => {
    const thread = await createCommentThread(cwd, { artifactPath: 'landing.html', text: '主视觉配色太艳' }, AT_T0)
    expect(thread.id.startsWith(COMMENT_THREAD_ID_PREFIX)).toBe(true)
    expect(thread.status).toBe('open')
    expect(thread.delivery).toBe('pending')
    expect(thread.replies).toEqual([])
    expect(thread.createdAt).toBe(AT_T0)
    expect(thread.updatedAt).toBe(AT_T0)
    expect('deliveredAt' in thread).toBe(false)
    // 盘上形态（真实字节）
    const raw = JSON.parse(readFileSync(commentsFilePath(cwd), 'utf8')) as { version: number; threads: CommentThread[] }
    expect(raw.version).toBe(COMMENTS_FILE_VERSION)
    expect(raw.threads).toHaveLength(1)
    expect(raw.threads[0]).toEqual(thread)
    expect(statSync(path.join(cwd, COMMENTS_DIR_NAME)).isDirectory()).toBe(true)
  })

  it('空 text / 超限 text / 空 artifactPath 拒绝（CommentStoreValidationError），零落盘', async () => {
    await expectStoreError(createCommentThread(cwd, { artifactPath: 'a.html', text: '' }, AT_T0), CommentStoreValidationError)
    await expectStoreError(
      createCommentThread(cwd, { artifactPath: 'a.html', text: 'x'.repeat(COMMENT_TEXT_MAX_LENGTH + 1) }, AT_T0),
      CommentStoreValidationError,
    )
    await expectStoreError(createCommentThread(cwd, { artifactPath: '', text: '正常' }, AT_T0), CommentStoreValidationError)
    expect(() => statSync(commentsFilePath(cwd))).toThrow() // 文件未创建
    expect(() => statSync(path.join(cwd, COMMENTS_DIR_NAME))).toThrow() // 目录也未创建
  })

  it('同一会话连续 create：两条线程同文件共存（append-only 入库）', async () => {
    const a = await createCommentThread(cwd, { artifactPath: 'a.html', text: '第一条' }, AT_T0)
    const b = await createCommentThread(cwd, { artifactPath: 'b.html', text: '第二条' }, AT_T1)
    const threads = readRawThreads()
    expect(threads.map((t) => t.id)).toEqual([a.id, b.id])
  })
})

describe('appendReply：追加与 reopen（D5 ④）', () => {
  it('open 线程追加：replies +1、状态保持 open × pending', async () => {
    const thread = await createCommentThread(cwd, { artifactPath: 'a.html', text: '首条' }, AT_T0)
    const updated = await appendCommentReply(cwd, thread.id, '补充：还有字号问题', AT_T1)
    expect(updated.replies).toEqual([{ text: '补充：还有字号问题', at: AT_T1 }])
    expect(updated.status).toBe('open')
    expect(updated.delivery).toBe('pending')
    expect(updated.updatedAt).toBe(AT_T1)
    expect(readRawThreads()[0]?.replies).toHaveLength(1)
  })

  it('reopen：resolved × delivered 线程追加 → open × pending，deliveredAt 清除（验收条款）', async () => {
    const thread = await createCommentThread(cwd, { artifactPath: 'a.html', text: '首条' }, AT_T0)
    await setCommentDelivery(cwd, thread.id, 'delivered', AT_T1)
    const resolved = await resolveCommentThread(cwd, thread.id, AT_T2)
    expect(resolved.status).toBe('resolved')
    expect(resolved.delivery).toBe('delivered')
    expect(resolved.deliveredAt).toBe(AT_T1)
    const reopened = await appendCommentReply(cwd, thread.id, '重开：标题字号太大', AT_T3)
    expect(reopened.status).toBe('open')
    expect(reopened.delivery).toBe('pending')
    expect('deliveredAt' in reopened).toBe(false)
    expect(reopened.replies).toEqual([{ text: '重开：标题字号太大', at: AT_T3 }])
    const onDisk = readRawThreads()[0]
    expect(onDisk?.status).toBe('open')
    expect(onDisk?.delivery).toBe('pending')
    expect(onDisk?.deliveredAt).toBeUndefined()
  })

  it('线程不存在抛 CommentThreadNotFoundError；空文本追加拒绝', async () => {
    await expectStoreError(appendCommentReply(cwd, 'c_missing', 'text', AT_T0), CommentThreadNotFoundError)
    const thread = await createCommentThread(cwd, { artifactPath: 'a.html', text: '首条' }, AT_T0)
    await expectStoreError(appendCommentReply(cwd, thread.id, '', AT_T1), CommentStoreValidationError)
  })
})

describe('resolve 与 setDelivery：状态转移落盘（D5 ②③）', () => {
  it('resolve：open → resolved、delivery 原样保留', async () => {
    const thread = await createCommentThread(cwd, { artifactPath: 'a.html', text: '首条' }, AT_T0)
    await setCommentDelivery(cwd, thread.id, 'no-agent', AT_T1)
    const resolved = await resolveCommentThread(cwd, thread.id, AT_T2)
    expect(resolved.status).toBe('resolved')
    expect(resolved.delivery).toBe('no-agent') // D5 ③：delivery 不变、不触发投递
    expect(readRawThreads()[0]?.delivery).toBe('no-agent')
  })

  it('已 resolved 线程再 resolve 抛 CommentTransitionError（表外，D5 ③），盘上文件不动', async () => {
    const thread = await createCommentThread(cwd, { artifactPath: 'a.html', text: '首条' }, AT_T0)
    await resolveCommentThread(cwd, thread.id, AT_T1)
    const before = readFileSync(commentsFilePath(cwd))
    try {
      await resolveCommentThread(cwd, thread.id, AT_T2)
      expect.unreachable('表外转移必须抛错')
    } catch (error) {
      expect(error).toBeInstanceOf(CommentTransitionError)
    }
    expect(readFileSync(commentsFilePath(cwd)).equals(before)).toBe(true)
  })

  it('setDelivery：pending → delivered 写 deliveredAt；→ no-agent / inject-error 不写', async () => {
    const t1 = await createCommentThread(cwd, { artifactPath: 'a.html', text: '一' }, AT_T0)
    const delivered = await setCommentDelivery(cwd, t1.id, 'delivered', AT_T1)
    expect(delivered.delivery).toBe('delivered')
    expect(delivered.deliveredAt).toBe(AT_T1)
    const t2 = await createCommentThread(cwd, { artifactPath: 'a.html', text: '二' }, AT_T0)
    const noAgent = await setCommentDelivery(cwd, t2.id, 'no-agent', AT_T1)
    expect(noAgent.delivery).toBe('no-agent')
    expect('deliveredAt' in noAgent).toBe(false)
    const t3 = await createCommentThread(cwd, { artifactPath: 'a.html', text: '三' }, AT_T0)
    const injectError = await setCommentDelivery(cwd, t3.id, 'inject-error', AT_T1)
    expect(injectError.delivery).toBe('inject-error')
    expect('deliveredAt' in injectError).toBe(false)
  })

  it('非 pending 态 setDelivery 抛 CommentTransitionError（deliver 仅从 open × pending 出发）', async () => {
    const thread = await createCommentThread(cwd, { artifactPath: 'a.html', text: '首条' }, AT_T0)
    await setCommentDelivery(cwd, thread.id, 'delivered', AT_T1)
    await expectStoreError(setCommentDelivery(cwd, thread.id, 'inject-error', AT_T2), CommentTransitionError)
  })
})

describe('retry：失败态纯重投（D5 ⑤）', () => {
  it('open × no-agent 与 open × inject-error 可重投回 pending', async () => {
    const t1 = await createCommentThread(cwd, { artifactPath: 'a.html', text: '一' }, AT_T0)
    await setCommentDelivery(cwd, t1.id, 'no-agent', AT_T1)
    const retried1 = await retryCommentDelivery(cwd, t1.id, AT_T2)
    expect(retried1.status).toBe('open')
    expect(retried1.delivery).toBe('pending')
    const t2 = await createCommentThread(cwd, { artifactPath: 'a.html', text: '二' }, AT_T0)
    await setCommentDelivery(cwd, t2.id, 'inject-error', AT_T1)
    const retried2 = await retryCommentDelivery(cwd, t2.id, AT_T2)
    expect(retried2.delivery).toBe('pending')
    expect(readRawThreads().map((t) => t.delivery)).toEqual(['pending', 'pending'])
  })

  it('表外重投抛错：pending 无从重投、delivered 不接受重投、resolved 不重投旧内容', async () => {
    const t1 = await createCommentThread(cwd, { artifactPath: 'a.html', text: '一' }, AT_T0)
    await expectStoreError(retryCommentDelivery(cwd, t1.id, AT_T1), CommentTransitionError) // open × pending
    const t2 = await createCommentThread(cwd, { artifactPath: 'a.html', text: '二' }, AT_T0)
    await setCommentDelivery(cwd, t2.id, 'delivered', AT_T1)
    await expectStoreError(retryCommentDelivery(cwd, t2.id, AT_T2), CommentTransitionError) // open × delivered
    const t3 = await createCommentThread(cwd, { artifactPath: 'a.html', text: '三' }, AT_T0)
    await setCommentDelivery(cwd, t3.id, 'no-agent', AT_T1)
    await resolveCommentThread(cwd, t3.id, AT_T2)
    await expectStoreError(retryCommentDelivery(cwd, t3.id, AT_T3), CommentTransitionError) // resolved × no-agent
  })
})

describe('RL4：并发写无半写、无丢失（进程内互斥队列 + 原子替换）', () => {
  it('两条 create 并发（Promise.all 交错）：两条线程均落盘、parse 恒成功', async () => {
    const [a, b] = await Promise.all([
      createCommentThread(cwd, { artifactPath: 'a.html', text: '并发一' }, AT_T0),
      createCommentThread(cwd, { artifactPath: 'b.html', text: '并发二' }, AT_T1),
    ])
    expect(a.id).not.toBe(b.id)
    const threads = readRawThreads()
    expect(threads).toHaveLength(2)
    expect(threads.map((t) => t.text).sort()).toEqual(['并发一', '并发二'])
  })

  it('create 与 appendReply 交错并发：目标线程追加不丢、无异常', async () => {
    const first = await createCommentThread(cwd, { artifactPath: 'a.html', text: '首条' }, AT_T0)
    await Promise.all([
      createCommentThread(cwd, { artifactPath: 'b.html', text: '第二条' }, AT_T1),
      appendCommentReply(cwd, first.id, '交错追加', AT_T1),
    ])
    const threads = readRawThreads()
    expect(threads).toHaveLength(2)
    expect(threads.find((t) => t.id === first.id)?.replies).toEqual([{ text: '交错追加', at: AT_T1 }])
  })

  it('并发写期间读侧持续轮询：parse 零失败（rename 原子替换无半写可见态）', async () => {
    let polls = 0
    let pollError: unknown
    let running = true
    const poller = (async () => {
      while (running) {
        try {
          const file = await readCommentsFile(cwd)
          JSON.parse(JSON.stringify(file)) // 完整深读
          polls++
        } catch (error) {
          pollError = error
          return
        }
        await new Promise((resolve) => { setTimeout(resolve, 2) })
      }
    })()
    const base = await createCommentThread(cwd, { artifactPath: 'c.html', text: '底条' }, AT_T0)
    await Promise.all([
      createCommentThread(cwd, { artifactPath: 'a.html', text: '轮询一' }, AT_T1),
      createCommentThread(cwd, { artifactPath: 'b.html', text: '轮询二' }, AT_T1),
      appendCommentReply(cwd, base.id, '轮询中追加', AT_T2),
    ])
    running = false
    await poller
    expect(pollError).toBeUndefined()
    expect(polls).toBeGreaterThan(0)
    const file = await readCommentsFile(cwd)
    expect(file.threads).toHaveLength(3)
  })
})

describe('RL7：损坏文件读侧报错不重建、写侧拒写', () => {
  it('非法 JSON：readCommentsFile 抛 CommentStoreCorruptError；create 拒写且损坏字节原样保留', async () => {
    const broken = '{version:1, threads:[' // 非法 JSON
    ensureCommentsDir()
    writeFileSync(commentsFilePath(cwd), broken, 'utf8')
    await expectStoreError(readCommentsFile(cwd), CommentStoreCorruptError)
    await expectStoreError(
      createCommentThread(cwd, { artifactPath: 'a.html', text: '损坏期写入' }, AT_T0),
      CommentStoreCorruptError,
    )
    expect(readFileSync(commentsFilePath(cwd), 'utf8')).toBe(broken) // 不被覆盖重建（防数据丢失）
  })

  it('结构不符同样判损坏（顶层非对象 / version 不符 / threads 非数组 / 线程条目 delivery 词表外）', () => {
    expect(() => parseCommentsFileText('null', 'x.json')).toThrow(CommentStoreCorruptError)
    expect(() => parseCommentsFileText('[]', 'x.json')).toThrow(CommentStoreCorruptError)
    expect(() => parseCommentsFileText('{"version":2,"threads":[]}', 'x.json')).toThrow(CommentStoreCorruptError)
    expect(() => parseCommentsFileText('{"version":1,"threads":"nope"}', 'x.json')).toThrow(CommentStoreCorruptError)
    expect(() => parseCommentsFileText(
      '{"version":1,"threads":[{"id":"c_x","artifactPath":"a.html","text":"t","replies":[],"status":"open","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z","delivery":"half-sent"}]}',
      'x.json',
    )).toThrow(CommentStoreCorruptError)
    // 正常最小线程可过校验（拒损坏不拒未来）
    expect(() => parseCommentsFileText(
      '{"version":1,"threads":[{"id":"c_x","artifactPath":"a.html","text":"t","replies":[],"status":"open","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z","delivery":"pending"}]}',
      'x.json',
    )).not.toThrow()
  })

  it('appendReply / setDelivery 对损坏文件同样拒写（写事务统一入口），损坏字节不变', async () => {
    const broken = '{"version":1,"threads":[]'
    ensureCommentsDir()
    writeFileSync(commentsFilePath(cwd), broken, 'utf8')
    await expectStoreError(appendCommentReply(cwd, 'c_any', '追加', AT_T0), CommentStoreCorruptError)
    await expectStoreError(setCommentDelivery(cwd, 'c_any', 'delivered', AT_T1), CommentStoreCorruptError)
    expect(readFileSync(commentsFilePath(cwd), 'utf8')).toBe(broken)
  })

  it('损坏消除后写路径恢复（手工修复即恢复——doctor 指引的恢复动作）', async () => {
    ensureCommentsDir()
    writeFileSync(commentsFilePath(cwd), 'broken', 'utf8')
    await expectStoreError(readCommentsFile(cwd), CommentStoreCorruptError)
    writeFileSync(commentsFilePath(cwd), JSON.stringify({ version: COMMENTS_FILE_VERSION, threads: [] }), 'utf8')
    const thread = await createCommentThread(cwd, { artifactPath: 'a.html', text: '修复后首条' }, AT_T0)
    expect(thread.status).toBe('open')
  })
})

describe('lock 文件协议（impl-plan U1 责任声明授权）', () => {
  it('正常事务结束后 lock 不残留', async () => {
    await createCommentThread(cwd, { artifactPath: 'a.html', text: '首条' }, AT_T0)
    expect(() => statSync(commentsLockPath(cwd))).toThrow() // ENOENT = 无残留
  })

  it('事务抛错（含校验拒绝）后 lock 同样不残留', async () => {
    await createCommentThread(cwd, { artifactPath: 'a.html', text: '首条' }, AT_T0)
    await expectStoreError(appendCommentReply(cwd, 'c_missing', 'x', AT_T1), CommentThreadNotFoundError)
    expect(() => statSync(commentsLockPath(cwd))).toThrow()
  })

  it('新鲜 lock 被占：等待超时抛 CommentStoreLockError，数据文件不动', { timeout: 8000 }, async () => {
    await createCommentThread(cwd, { artifactPath: 'a.html', text: '首条' }, AT_T0)
    const before = readFileSync(commentsFilePath(cwd))
    writeFileSync(commentsLockPath(cwd), JSON.stringify({ pid: 999999, at: new Date().toISOString() }), 'utf8')
    await expectStoreError(
      createCommentThread(cwd, { artifactPath: 'b.html', text: '锁期写入' }, AT_T1),
      CommentStoreLockError,
    )
    expect(readFileSync(commentsFilePath(cwd)).equals(before)).toBe(true)
  })

  it('陈旧 lock（mtime 超陈旧阈值）：判泄漏夺锁，事务成功落盘', async () => {
    const staleTime = new Date(Date.now() - COMMENT_LOCK_STALE_MS - 1000)
    ensureCommentsDir()
    writeFileSync(commentsLockPath(cwd), JSON.stringify({ pid: 999999, at: staleTime.toISOString() }), 'utf8')
    utimesSync(commentsLockPath(cwd), staleTime, staleTime)
    const thread = await createCommentThread(cwd, { artifactPath: 'a.html', text: '夺锁后首条' }, AT_T0)
    expect(thread.status).toBe('open')
    expect(() => statSync(commentsLockPath(cwd))).toThrow() // 夺锁事务结束后无残留
  })
})

describe('读侧与查询辅助', () => {
  it('文件缺席 → 初始空形态（不自动落盘文件）', async () => {
    const file = await readCommentsFile(cwd)
    expect(file).toEqual({ version: COMMENTS_FILE_VERSION, threads: [] })
    expect(() => statSync(commentsFilePath(cwd))).toThrow()
  })

  it('findCommentThread：命中返回该线程，未命中抛 CommentThreadNotFoundError', async () => {
    const thread = await createCommentThread(cwd, { artifactPath: 'a.html', text: '首条' }, AT_T0)
    const file = await readCommentsFile(cwd)
    expect(findCommentThread(file.threads, thread.id).id).toBe(thread.id)
    expect(() => findCommentThread(file.threads, 'c_missing')).toThrow(CommentThreadNotFoundError)
  })
})
