import { describe, expect, it } from 'vitest'

import {
  ANCHOR_LEVELS,
  ANCHOR_SEL_MAX_LENGTH,
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
  isCommentAnchor,
} from '../../lib/comments/contract.js'
import { LINT_SOURCE_KIND } from '../../lib/quality/feedback.js'

/**
 * 评论回路共享契约单测（u-foundation）：断言 contract.ts 登记的常量值与设计摘录逐字一致
 * （数据文件落点与版本 / 线程 id 前缀 / 文本上限 / delivery 与 lifecycle 词表 /
 * 路由族五条 / 来源 kind），并锁边界——词表恰四值恰两值、路由族恰五条、无重复成员。
 * 元素锚点段断言 opendesign-comment-anchor 设计 §3.3 D1 摘录（词表恰三值 / sel 上限 500 /
 * isCommentAnchor 合法三态与边界拒绝）。
 * U1/U2/U3/U4 全部从 contract.ts import 这些词表；本测试红 = 词表漂移，下游全部失准。
 * 编号口径：线程 schema / 路由 / 来源段裸编号（D/AX 等）属 opendesign-comment-loop 设计包；
 * 元素锚点段 D1 属 opendesign-comment-anchor 设计包。
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

  it('锚点级别词表恰三值且无重复（opendesign-comment-anchor D1：id|data|path 三级降级序）', () => {
    expect(ANCHOR_LEVELS).toEqual(['id', 'data', 'path'])
    expect(ANCHOR_LEVELS).toHaveLength(3)
    expect(new Set(ANCHOR_LEVELS).size).toBe(3)
  })

  it('锚点选择器上限逐字一致（opendesign-comment-anchor D1 效果栏红线：500）', () => {
    expect(ANCHOR_SEL_MAX_LENGTH).toBe(500)
  })

  it('isCommentAnchor 接受合法三态（每级一份代表性 sel 形态，D1）', () => {
    expect(isCommentAnchor({ level: 'id', sel: '#hero' })).toBe(true)
    expect(isCommentAnchor({ level: 'data', sel: '[data-od-id="section-1"]' })).toBe(true)
    expect(isCommentAnchor({ level: 'data', sel: '[data-screen-label="01 Title"]' })).toBe(true)
    expect(isCommentAnchor({ level: 'path', sel: 'main:nth-of-type(1) > div:nth-of-type(2)' })).toBe(true)
  })

  it('isCommentAnchor 拒绝词表外 level（边界：不在 ANCHOR_LEVELS 内一律 false）', () => {
    expect(isCommentAnchor({ level: 'class', sel: '#hero' })).toBe(false)
    expect(isCommentAnchor({ level: 'css', sel: '#hero' })).toBe(false)
    expect(isCommentAnchor({ level: '', sel: '#hero' })).toBe(false)
  })

  it('isCommentAnchor 拒绝空 sel，上限边界恰 500 合法、501 拒绝（D1 写入侧校验）', () => {
    expect(isCommentAnchor({ level: 'id', sel: '' })).toBe(false)
    expect(isCommentAnchor({ level: 'id', sel: 'a'.repeat(ANCHOR_SEL_MAX_LENGTH) })).toBe(true)
    expect(isCommentAnchor({ level: 'id', sel: 'a'.repeat(ANCHOR_SEL_MAX_LENGTH + 1) })).toBe(false)
  })

  it('isCommentAnchor 拒绝非对象与字段形状不符（非对象 / 字段缺失 / sel 非字符串）', () => {
    expect(isCommentAnchor(null)).toBe(false)
    expect(isCommentAnchor(undefined)).toBe(false)
    expect(isCommentAnchor('anchor')).toBe(false)
    expect(isCommentAnchor(42)).toBe(false)
    expect(isCommentAnchor([])).toBe(false)
    expect(isCommentAnchor({ level: 'id' })).toBe(false)
    expect(isCommentAnchor({ sel: '#hero' })).toBe(false)
    expect(isCommentAnchor({ level: 'id', sel: 42 })).toBe(false)
  })
})
