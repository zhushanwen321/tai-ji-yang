import { describe, expect, it } from 'vitest'

import {
  COMMENTS_API_ACTION_PATHS,
  COMMENTS_API_BASE_PATH,
  COMMENTS_API_PATHS,
  COMMENT_DELIVERY_STATES,
  COMMENT_SOURCE_KIND,
  COMMENT_TEXT_MAX_LENGTH,
  COMMENT_THREAD_ID_PREFIX,
  COMMENTS_DIR_NAME,
  COMMENTS_FILE_NAME,
  COMMENTS_FILE_VERSION,
  COMMENT_THREAD_STATUSES,
} from '../../lib/comments/contract.js'
import { LINT_SOURCE_KIND } from '../../lib/quality/feedback.js'

/**
 * 评论回路共享契约单测（u-foundation）：断言 contract.ts 登记的常量值与设计 §3.1 摘录
 * 逐字一致（数据文件落点与版本 / 线程 id 前缀 / 文本上限 / delivery 与 lifecycle 词表 /
 * 路由族五条 / 来源 kind），并锁边界——词表恰四值恰两值、路由族恰五条、无重复成员。
 * U1/U2/U3/U4 全部从 contract.ts import 这些词表；本测试红 = 词表漂移，下游全部失准。
 * 编号口径：本文件裸编号（D/AX 等）属 opendesign-comment-loop 设计包。
 */
describe('评论回路共享契约（lib/comments/contract）', () => {
  it('评论数据文件落点与 schema 版本逐字一致（D1：会话工作目录 .od-comments/comments.json，version=1）', () => {
    expect(COMMENTS_DIR_NAME).toBe('.od-comments')
    expect(COMMENTS_FILE_NAME).toBe('comments.json')
    expect(COMMENTS_FILE_VERSION).toBe(1)
  })

  it('线程 id 前缀与文本上限逐字一致（D1 / D2：c_ 前缀、上限 10000）', () => {
    expect(COMMENT_THREAD_ID_PREFIX).toBe('c_')
    expect(COMMENT_TEXT_MAX_LENGTH).toBe(10000)
  })

  it('lifecycle 词表恰两值且无重复（AX3：open|resolved）', () => {
    expect(COMMENT_THREAD_STATUSES).toEqual(['open', 'resolved'])
    expect(new Set(COMMENT_THREAD_STATUSES).size).toBe(COMMENT_THREAD_STATUSES.length)
  })

  it('delivery 词表恰四值且无重复（AX3 边界：pending|delivered|no-agent|inject-error）', () => {
    expect(COMMENT_DELIVERY_STATES).toEqual(['pending', 'delivered', 'no-agent', 'inject-error'])
    expect(COMMENT_DELIVERY_STATES).toHaveLength(4)
    expect(new Set(COMMENT_DELIVERY_STATES).size).toBe(4)
  })

  it('路由族基路径与四个 POST 动作后缀逐字一致（D2）', () => {
    expect(COMMENTS_API_BASE_PATH).toBe('/api/opendesign-design-mode.comments')
    expect(COMMENTS_API_ACTION_PATHS).toEqual(['.create', '.reply', '.retry', '.resolve'])
  })

  it('路由族全集恰五条且无重复（D2 边界：GET 基路径 + 四条 POST 完整路径）', () => {
    expect(COMMENTS_API_PATHS).toEqual([
      '/api/opendesign-design-mode.comments',
      '/api/opendesign-design-mode.comments.create',
      '/api/opendesign-design-mode.comments.reply',
      '/api/opendesign-design-mode.comments.retry',
      '/api/opendesign-design-mode.comments.resolve',
    ])
    expect(COMMENTS_API_PATHS).toHaveLength(5)
    expect(new Set(COMMENTS_API_PATHS).size).toBe(5)
    // GET 基路径 = 词表首条，四个动作路径都在基路径域内
    expect(COMMENTS_API_PATHS[0]).toBe(COMMENTS_API_BASE_PATH)
    for (const action of COMMENTS_API_ACTION_PATHS) {
      expect(COMMENTS_API_PATHS).toContain(COMMENTS_API_BASE_PATH + action)
    }
  })

  it('回注来源 kind 独立登记且与质量环 kind 并列不同值（D3 / AX2）', () => {
    expect(COMMENT_SOURCE_KIND).toBe('opendesign-design-mode/comment')
    expect(LINT_SOURCE_KIND).toBe('opendesign-design-mode/lint')
    expect(COMMENT_SOURCE_KIND).not.toBe(LINT_SOURCE_KIND)
  })
})
