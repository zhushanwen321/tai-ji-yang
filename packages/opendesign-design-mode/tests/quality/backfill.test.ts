/**
 * 锚属性补写器单测（单元 U1：防线/生成/注释/共存四组，RL1/RL5/RL6 的单测层、V7 的共存层）。
 *
 * 断言结构：
 * 1. 防线组（RL1）：非 UTF-8 Buffer 返原字节 + gaveUp:'utf8'；引号配对失败标签零插入
 *    （且防线按标签逐个生效：坏标签跳过 + 好标签正常补写）；属性值含 > 的双/单引号完整
 *    形态插入在真实标签边界（不走查必修 1 的升级防线）；合法输入输出快照逐字节比对
 *    （Buffer.equals）；
 * 2. 生成组（RL5）：同输入两次调用输出逐字节一致（确定性）；同内容两 section 查重后缀
 *    区分；原文既有同 hash 值时新插入带后缀；空 section 窗口（空串/极短串）不抛错、
 *    相邻空 section 窗口不同不撞值；
 * 3. 注释组（RL6）：注释内教学示例零插入且注释段逐字保留（AS10 语义）；
 * 4. 共存组（V7）：已带 data-screen-label 的标签跳过（查重集合只收 data-od-id 值）、
 *    无属性标签正常插入 data-od-id。
 *
 * 期望值计算：G2 规格常量（属性名 / id 前缀 / 指纹窗口 / hash 位数）从
 * lib/quality/backfill.js import 复用（单一登记处，本文件不重复字面量定义）；hash 按
 * G2 规格以 node:crypto 同构复算——对拍可捕捉窗口偏移 / 漏 trim / 位数错等实现漂移。
 *
 * 编号口径：本文件裸编号（U/D/AS/G/RL/V 等）默认属 opendesign-anchor-backfill 设计包
 * （本轮）；引用其他设计包的同形编号一律带域前缀。
 */
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  FINGERPRINT_HASH_CHARS,
  FINGERPRINT_WINDOW,
  OD_ANCHOR_ATTR,
  OD_SECTION_ID_PREFIX,
  backfillAnchors,
} from '../../lib/quality/backfill.js'

/** G2 规格的期望 id：指纹 → 'od-sec-' + sha256 前 8 位 hex（常量 import 复用）。 */
function expectedId(fingerprint: string): string {
  const hash = createHash('sha256').update(fingerprint, 'utf8').digest('hex')
  return OD_SECTION_ID_PREFIX + hash.slice(0, FINGERPRINT_HASH_CHARS)
}

/** 实现同口径的指纹输入：起始标签结束 > 之后 FINGERPRINT_WINDOW 字符原文去首尾空白。 */
function fingerprintAfterTag(input: string, tagEnd: number): string {
  return input.slice(tagEnd + 1, tagEnd + 1 + FINGERPRINT_WINDOW).trim()
}

/** 标记串之后第一个 > 的位置（简单标签的结束点定位；属性值含 > 的标签用例手工定位）。 */
function tagEndOf(input: string, marker: string): number {
  const at = input.indexOf('>', input.indexOf(marker))
  expect(at, `fixture 定位失败：${marker} 之后无 >`).toBeGreaterThan(-1)
  return at
}

/** G2 插入文本形态：结束 > 之前、前导一个空格。 */
function attrText(id: string): string {
  return ` ${OD_ANCHOR_ATTR}="${id}"`
}

/** ≥256 字符的 section 内容（指纹窗口截断点落在其内部，窗口语义稳定可复算）。 */
function longBody(ch: string): string {
  return '<p>' + ch.repeat(300) + '</p>'
}

describe('防线组（RL1）', () => {
  it('非 UTF-8 Buffer 返回原字节且 gaveUp utf8（D6 ①）', () => {
    const raw = Buffer.from('<html><body><section class="hero"></section></body></html>', 'utf8')
    const bytes = Array.from(raw)
    bytes.splice(13, 0, 0xff, 0xfe) // 中段插入 UTF-8 非法序列（会被替换字符污染）
    const bad = Buffer.from(bytes)
    const result = backfillAnchors(bad)
    expect(result.gaveUp).toBe('utf8')
    expect(result.inserted).toEqual([])
    expect(result.skipped).toBe(0)
    expect(result.buffer.equals(bad)).toBe(true)
  })

  it('引号配对失败标签零插入（单引号 / 双引号形态）', () => {
    for (const quote of ["'", '"'] as const) {
      const html = `<html><body><section data-note=${quote}unclosed>b</section></body></html>`
      const result = backfillAnchors(Buffer.from(html, 'utf8'))
      expect(result.gaveUp).toBeUndefined()
      expect(result.inserted).toEqual([])
      expect(result.skipped).toBe(1)
      expect(result.buffer.toString('utf8')).toBe(html)
    }
  })

  it('防线按标签逐个生效：引号坏标签跳过、好标签正常补写', () => {
    const input = `<section data-note='a>b\n<section class="ok"><p>x</p></section>`
    const result = backfillAnchors(Buffer.from(input, 'utf8'))
    expect(result.inserted).toHaveLength(1)
    expect(result.skipped).toBe(1)
    // 连续子串同时锁两侧：坏标签（引号未配对直到文本末尾）未插入，紧随的好标签已插入
    expect(result.buffer.toString('utf8')).toContain(
      `<section data-note='a>b\n<section class="ok" ${OD_ANCHOR_ATTR}="`,
    )
  })

  it('属性值含 > 的双/单引号完整形态：插入在真实标签边界（引号上下文防线）', () => {
    for (const quote of ["'", '"'] as const) {
      const input = `<section data-note=${quote}a>b${quote}><p>x</p></section>`
      const end = input.indexOf('><p>') // 真实标签结束 >（引号配对完成后的那个，非值内的 >）
      const id = expectedId(fingerprintAfterTag(input, end))
      const result = backfillAnchors(Buffer.from(input, 'utf8'))
      expect(result.inserted).toEqual([{ id }])
      expect(result.skipped).toBe(0)
      expect(result.buffer.toString('utf8')).toBe(
        `<section data-note=${quote}a>b${quote}${attrText(id)}><p>x</p></section>`,
      )
    }
  })

  it('合法输入输出快照逐字节比对（两个 section 全补写）', () => {
    const input = [
      '<html><body>',
      '<section class="hero">',
      '  <h1>Landing</h1>',
      '</section>',
      '<section class="foot">',
      '  <p>bye</p>',
      '</section>',
      '</body></html>',
    ].join('\n')
    const id1 = expectedId(fingerprintAfterTag(input, tagEndOf(input, '<section class="hero"')))
    const id2 = expectedId(fingerprintAfterTag(input, tagEndOf(input, '<section class="foot"')))
    const want = [
      '<html><body>',
      `<section class="hero"${attrText(id1)}>`,
      '  <h1>Landing</h1>',
      '</section>',
      `<section class="foot"${attrText(id2)}>`,
      '  <p>bye</p>',
      '</section>',
      '</body></html>',
    ].join('\n')
    const result = backfillAnchors(Buffer.from(input, 'utf8'))
    expect(result.skipped).toBe(0)
    expect(result.inserted.map((ins) => ins.id)).toEqual([id1, id2])
    expect(result.buffer.equals(Buffer.from(want, 'utf8'))).toBe(true)
    expect(result.buffer.toString('utf8')).toBe(want)
  })
})

describe('生成组（RL5）', () => {
  const input = '<html><body>\n<section><p>one</p></section>\n<section><p>two</p></section>\n</body></html>'

  it('同输入两次调用输出逐字节一致（确定性）', () => {
    const a = backfillAnchors(Buffer.from(input, 'utf8'))
    const b = backfillAnchors(Buffer.from(input, 'utf8'))
    expect(a.buffer.equals(b.buffer)).toBe(true)
    expect(a.inserted).toEqual(b.inserted)
    expect(a.skipped).toBe(b.skipped)
  })

  it('同内容两 section 查重后缀区分（对称 section：-2 后缀）', () => {
    const body = longBody('x')
    const sec = `<section>${body}</section>`
    const id = expectedId(body.slice(0, FINGERPRINT_WINDOW))
    const result = backfillAnchors(Buffer.from(`${sec}\n${sec}`, 'utf8'))
    expect(result.inserted.map((ins) => ins.id)).toEqual([id, `${id}-2`])
  })

  it('原文既有同 hash 值时新插入带后缀（查重集合含既有值）', () => {
    const body = longBody('y')
    const id = expectedId(body.slice(0, FINGERPRINT_WINDOW))
    const input = `<section ${OD_ANCHOR_ATTR}="${id}"><p>guard</p></section>\n<section>${body}</section>`
    const result = backfillAnchors(Buffer.from(input, 'utf8'))
    expect(result.skipped).toBe(1) // 既有锚属性的 section 按 tagged 跳过
    expect(result.inserted).toEqual([{ id: `${id}-2` }])
    expect(result.buffer.toString('utf8')).toContain(attrText(`${id}-2`))
  })

  it('相邻空 section 不抛错且窗口不同不撞值', () => {
    const result = backfillAnchors(Buffer.from('<section></section><section></section>', 'utf8'))
    expect(result.inserted).toHaveLength(2)
    const ids = result.inserted.map((ins) => ins.id)
    expect(ids[0]).not.toBe(ids[1])
    const idShape = new RegExp(`^${OD_SECTION_ID_PREFIX}[0-9a-f]{${FINGERPRINT_HASH_CHARS}}$`)
    for (const id of ids) expect(id).toMatch(idShape)
    expect(ids.some((id) => id.endsWith('-2'))).toBe(false)
  })

  it('指纹输入为空串（起始标签紧邻文本末尾）不抛错、sha256 空串仍可算', () => {
    const result = backfillAnchors(Buffer.from('<section>', 'utf8'))
    expect(result.skipped).toBe(0)
    expect(result.inserted).toEqual([{ id: expectedId('') }])
  })
})

describe('注释组（RL6）', () => {
  it('纯教学示例（注释内 section）零插入且输出逐字节等于原文', () => {
    const input = '<html><body><!-- 教学示例：<section> 不是真实标签 --></body></html>'
    const result = backfillAnchors(Buffer.from(input, 'utf8'))
    expect(result.gaveUp).toBeUndefined()
    expect(result.inserted).toEqual([])
    expect(result.skipped).toBe(1)
    expect(result.buffer.toString('utf8')).toBe(input)
  })

  it('注释段逐字保留、真实 section 正常补写', () => {
    const comment = '<!-- 教学示例：<section class="demo"> 里粘贴段落 -->'
    const input = `<html><body>\n${comment}\n<section class="real">\n<p>real</p>\n</section>\n</body></html>`
    const end = tagEndOf(input, '<section class="real"')
    const id = expectedId(fingerprintAfterTag(input, end))
    const result = backfillAnchors(Buffer.from(input, 'utf8'))
    expect(result.inserted).toEqual([{ id }])
    expect(result.skipped).toBe(1)
    const output = result.buffer.toString('utf8')
    expect(output).toContain(comment) // 注释段逐字保留 = 注释内 <section> 未被插入属性（AS10）
    expect(output).toBe(
      `<html><body>\n${comment}\n<section class="real"${attrText(id)}>\n<p>real</p>\n</section>\n</body></html>`,
    )
  })
})

describe('共存组（V7）', () => {
  it('已带 data-screen-label 的标签原样跳过、无属性标签正常插入', () => {
    const slide1 = '<section data-screen-label="01 Title">\n<p>a</p>\n</section>'
    const slide2 = '<section class="plain">\n<p>b</p>\n</section>'
    const input = `${slide1}\n${slide2}`
    const id2 = expectedId(fingerprintAfterTag(input, tagEndOf(input, '<section class="plain"')))
    const result = backfillAnchors(Buffer.from(input, 'utf8'))
    expect(result.inserted).toEqual([{ id: id2 }])
    expect(result.skipped).toBe(1)
    expect(result.buffer.toString('utf8')).toBe(`${slide1}\n<section class="plain"${attrText(id2)}>\n<p>b</p>\n</section>`)
    expect(result.buffer.toString('utf8')).toContain(slide1) // slide1 逐字节原样
  })

  it('查重集合只收 data-od-id 的值、不收 data-screen-label 的值（V7 走查对齐）', () => {
    const body = longBody('z')
    const id = expectedId(body.slice(0, FINGERPRINT_WINDOW))
    const labeled = `<section data-screen-label="${id}">\n<p>a</p>\n</section>`
    const result = backfillAnchors(Buffer.from(`${labeled}\n<section>${body}</section>`, 'utf8'))
    // 既有值恰为 screen-label 的展示值：若查重集合误收它，新插入会错带 -2 后缀
    expect(result.inserted).toEqual([{ id }])
  })
})
