/**
 * 锚属性补写器（纯函数）：对产物 HTML 的 Buffer 补写 section 起始标签缺失的
 * data-od-id 属性——Buffer 进、{补写后 Buffer, 插入清单, 跳过/放弃计数} 出，零 I/O
 * （不读盘不写盘，写回由质量环检查函数接线承载，设计 §3.3 D1：补写步骤位于完整性哨兵
 * 后、三类命中分类后、lint 前——补写后内容供 lint 与回注消费，missing-section-anchor
 * 对补写成功的产物恒不触发）。
 *
 * 判定口径（设计 §3.3 D4，与 lint P2-1 完全对齐——lintArtifact 的 P2-1 检查段同正则
 * 同语义）：
 * ① 匹配 /<section\b[^>]*>/gi 的全部起始标签（不区分顶层或嵌套，与 lint 统计口径一致）；
 * ② 注释区间排除（AS10，lint 注释剥离前置的同款语义）：先扫描原文收集 <!--...--> 区间，
 *    匹配起点落在区间内的跳过；写回在原文执行（保注释）；
 * ③ 已带 data-od-id= 或 data-screen-label= 的标签跳过（与 lint 的 tagged 判定同一正则）；
 * ④ 引号上下文感知边界校验（补写器独有的写盘防线，lint 只读不写故不需要）：自标签头起
 *    扫描，遇 " 或 ' 进入对应引号上下文、至同种引号再次出现，上下文内的 > 不算标签结束；
 *    仅当找到「处于引号上下文之外的 >」（此时其前引号已全部配对完成）时该标签视为边界
 *    完整、可插入，否则跳过。双引号与单引号属性值同权校验（防 data-note='a>b' 这类含
 *    > 的属性值把 [^>]* 截断在值中间、插入点落在属性值内写坏文件）。
 *
 * id 生成（设计 §3.3 D3 + 守护 G2）：值 = 'od-sec-' + section 内容哈希前 8 位 hex
 * （指纹输入 = 该 section 起始标签结束后 256 字符原文，去首尾空白，sha256）；同文件
 * 查重 = 本次已生成值集合 + 原文中既有 data-od-id 值集合（不含 data-screen-label 的
 * 值——它不是锚 id 词表成员），冲突追加 -2/-3 序号后缀保证同文件唯一。策略依据 = 失效
 * 语义的安全性：模型改稿丢弃属性后插件重补，内容已变则新 hash ≠ 旧 hash，旧评论锚点
 * 选择器失配 = 显式失效；序号式按位置重排存在静默指错路径，故不采用。
 *
 * UTF-8 无损校验（设计 §3.3 D6 第一道防线）：buffer.toString('utf8') 后按字节长度
 * 比对，不通过返回 gaveUp:'utf8' 且原 Buffer 原样返回（零插入）——非 UTF-8 产物解码
 * 会替换坏字节，写回 = 破坏原文件。
 *
 * 编号口径：本文件裸编号（U/D/AS/G/RL/V 等）默认属 opendesign-anchor-backfill 设计包
 * （本轮）；引用其他设计包（opendesign-comment-loop / opendesign-comment-anchor /
 * opendesign-assets-quality / V1 代 opendesign-design-mode）的同形编号一律带域前缀
 * （形态如「comment-anchor·D1」「V1 设计包 D8」），防止跨包同号撞号。
 */
import { createHash } from 'node:crypto'

/** 锚属性名（G2 规格常量，本模块唯一登记处；下游禁字面量复制）。 */
export const OD_ANCHOR_ATTR = 'data-od-id'

/** section 锚 id 前缀（G2）。 */
export const OD_SECTION_ID_PREFIX = 'od-sec-'

/** 内容指纹窗口：section 起始标签结束后取多少字符原文作指纹输入（G2）。 */
export const FINGERPRINT_WINDOW = 256

/** 内容指纹哈希位数：sha256 hex 取前 N 位（G2）。 */
export const FINGERPRINT_HASH_CHARS = 8

/** 补写结果（单元 U1 契约：Buffer 进、{补写后 Buffer, 插入清单, 跳过/放弃计数} 出）。 */
export interface BackfillResult {
  /** 补写后的完整产物内容（零插入或放弃时为输入 Buffer 原样返回）。 */
  buffer: Buffer
  /** 本次实际插入的锚 id 清单（值已含查重后缀，与 buffer 中写入值一致）。 */
  inserted: Array<{ id: string }>
  /** 跳过计数（已带属性 + 畸形 + 注释内，设计 D7 词表口径）。 */
  skipped: number
  /** 放弃原因（仅防线触发时携带；当前唯一值 'utf8' = UTF-8 无损校验未过，D6 ①）。 */
  gaveUp?: 'utf8'
}

// ── 判定口径（D4，与 lint P2-1 同口径）─────────────────────────────────────

/** section 起始标签匹配（lint P2-1 统计口径同款：全部起始标签，不区分顶层或嵌套）。 */
const SECTION_TAG_RE = /<section\b[^>]*>/gi

/**
 * 注释区间（lint 注释剥离前置同款正则，AS10：lintArtifact 以 <!--[\s\S]*?--> 剥注释）。
 */
const COMMENT_RE = /<!--[\s\S]*?-->/g

/**
 * tagged 判定（lint P2-1 的 tagged 过滤同形正则，大小写敏感与 lint 保持同口径）：
 * data-od-id= 或 data-screen-label= 任一命中即视为已带锚属性。
 */
const TAGGED_RE = new RegExp(`${OD_ANCHOR_ATTR}\\s*=|data-screen-label\\s*=`)

/**
 * 原文既有锚属性值收集（查重集合输入，G2）：双引号 / 单引号 / 无引号三形态全收；词边界
 * 防误收 foo-data-od-id= 形态。含注释区间内的值——保守方向（教学示例值也避开：多避开
 * 只多一个后缀，漏收会重值，两害取其轻）。
 */
const EXISTING_ID_RE = new RegExp(
  `\\b${OD_ANCHOR_ATTR}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\\u0060]+))`,
  'gi',
)

/**
 * 对一份产物 HTML 补写全部可补 section 起始标签的 data-od-id 属性（判定流程见文件头）。
 * 纯函数：不读盘不写盘、无模块级可变状态（三个全局正则在入口复位 lastIndex——同进程
 * 多次调用互不污染，防自循环第二轮检查与测试确定性断言都依赖这一点）。
 *
 * @param buffer 产物 HTML 原始字节（非 UTF-8 时放弃补写，原样返回）
 */
export function backfillAnchors(buffer: Buffer): BackfillResult {
  // D6 ① UTF-8 无损校验：解码后字节数与原 Buffer 不等长 = 坏字节已被替换字符污染，
  // 任何写回都会破坏原文件——放弃补写，原 Buffer 原样返回（零插入）。
  const html = buffer.toString('utf8')
  if (Buffer.byteLength(html, 'utf8') !== buffer.length) {
    return { buffer, inserted: [], skipped: 0, gaveUp: 'utf8' }
  }
  SECTION_TAG_RE.lastIndex = 0
  COMMENT_RE.lastIndex = 0
  EXISTING_ID_RE.lastIndex = 0
  const commentSpans = collectCommentSpans(html)
  const usedIds = collectExistingAnchorIds(html)
  const insertions: Array<{ pos: number; text: string; id: string }> = []
  let skipped = 0
  for (let m = SECTION_TAG_RE.exec(html); m !== null; m = SECTION_TAG_RE.exec(html)) {
    const tagStart = m.index
    // ② 注释区间排除（AS10）：匹配起点落在 <!--...--> 区间内 = 教学示例，非真实标签
    if (commentSpans.some((span) => tagStart >= span.start && tagStart < span.end)) {
      skipped += 1
      continue
    }
    // ③ tagged 跳过：已带 data-od-id= 或 data-screen-label=（与 lint tagged 判定同正则）
    if (TAGGED_RE.test(m[0])) {
      skipped += 1
      continue
    }
    // ④ 引号上下文感知边界校验：引号未配对 = 标签边界不确定，跳过保原字节（防线目标 =
    // 插入点永不落在属性值内，AS12）
    const tagEnd = findTagEnd(html, tagStart)
    if (tagEnd === undefined) {
      skipped += 1
      continue
    }
    // id 生成（D3/G2）：标签结束后 256 字符原文去首尾空白 → sha256 前 8 位 hex；
    // sha256 对空串有定义（空 section 紧邻结束标签的窗口为极短串或空串，不抛错）
    const fingerprint = html.slice(tagEnd + 1, tagEnd + 1 + FINGERPRINT_WINDOW).trim()
    const base = OD_SECTION_ID_PREFIX + sha256Hex(fingerprint).slice(0, FINGERPRINT_HASH_CHARS)
    const id = uniqueId(base, usedIds)
    usedIds.add(id)
    // 插入形态（G2）：起始标签结束字符 > 之前、前导一个空格
    insertions.push({ pos: tagEnd, text: ` ${OD_ANCHOR_ATTR}="${id}"`, id })
  }
  if (insertions.length === 0) {
    return { buffer, inserted: [], skipped }
  }
  // 写回在原文执行（AS10 保注释）：注释区间已排除，插入点永不落在注释内；
  // insertions 按 tagEnd 升序且互不重叠（全局正则 exec 顺序保证），顺序拼接即正确
  const parts: string[] = []
  let cursor = 0
  for (const ins of insertions) {
    parts.push(html.slice(cursor, ins.pos), ins.text)
    cursor = ins.pos
  }
  parts.push(html.slice(cursor))
  return {
    buffer: Buffer.from(parts.join(''), 'utf8'),
    inserted: insertions.map((ins) => ({ id: ins.id })),
    skipped,
  }
}

/** 收集全文 <!--...--> 区间（匹配起点判定用；正则与 lint 注释剥离同款）。 */
function collectCommentSpans(html: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = []
  for (let m = COMMENT_RE.exec(html); m !== null; m = COMMENT_RE.exec(html)) {
    spans.push({ start: m.index, end: m.index + m[0].length })
  }
  return spans
}

/** 收集原文既有 data-od-id 值集合（G2 查重集合的既有值半边；不含 data-screen-label 值）。 */
function collectExistingAnchorIds(html: string): Set<string> {
  const ids = new Set<string>()
  for (let m = EXISTING_ID_RE.exec(html); m !== null; m = EXISTING_ID_RE.exec(html)) {
    const value = m[1] ?? m[2] ?? m[3]
    if (value !== undefined) ids.add(value)
  }
  return ids
}

/**
 * 引号上下文感知的标签结束点查找（D4 ④）：自标签头起逐字符扫描，遇 " 或 ' 进入对应
 * 引号上下文、至同种引号再次出现退出；上下文内的 > 不算标签结束。返回值 = 第一个处于
 * 引号上下文之外的 > 位置（此时其前引号已全部配对完成——「最后一个 > 在上下文外」与
 * 「全部引号已配对」两个条件在此合一同真）；扫到原文末尾仍无上下文外 > = 引号未配对、
 * 边界不完整，返回 undefined（调用方跳过该标签）。
 */
function findTagEnd(html: string, tagStart: number): number | undefined {
  let quote: '"' | "'" | null = null
  for (let i = tagStart; i < html.length; i += 1) {
    const ch = html[i]
    if (quote !== null) {
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === '>') return i
  }
  return undefined
}

/** 指纹哈希（D3/G2）：sha256 hex。空串输入有定义（空 section 窗口边界，不抛错）。 */
function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

/**
 * 同文件查重（D3/G2）：base 或其带后缀形态已存在时追加 -2/-3 递增序号，保证同文件唯一。
 */
function uniqueId(base: string, used: Set<string>): string {
  if (!used.has(base)) return base
  let n = 2
  while (used.has(`${base}-${n}`)) n += 1
  return `${base}-${n}`
}
