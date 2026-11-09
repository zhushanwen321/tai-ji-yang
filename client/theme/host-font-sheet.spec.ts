/**
 * client/theme/host-font-sheet.spec.ts —— 宿主字体复合简写对账（层 3 的升级护栏）。
 *
 * 本包整串重写宿主的 `--dsw-font-*` 复合简写（只替换 weight 与行高，size/family 表达式
 * 逐字保留，见 structure.ts 头注释）。真实风险 = 宿主升级改了 size 计算式（如
 * content-font-delta 语义变化）时，本包的重写会把新表达式盖回旧值——字号轴被静默冻结。
 * 本测试对宿主源样式表逐 token 对账：
 *
 *   · 名单对齐：宿主全部复合简写主体 == 本包 FONT_SHORTHAND_TOKENS 键集（宿主增删档即红）
 *   · size 段逐字一致（归一空白后比对）
 *   · family 段逐字一致
 *
 * weight / 行高**不**比对——本包就是要改这两段（structure.test.ts 已固定其取值档位）。
 *
 * 宿主样式表定位：`DSH_FONT_SHEET` 环境变量优先；缺省探测本机 DSH 源码仓固定路径（探测串
 * 是对齐磁盘事实的功能性内容，非仓库产物约定）。找不到时**失败**（不静默 skip——那等于
 * 红线失效），错误信息给出设置 DSH_FONT_SHEET 的指引。唯一例外 = CI 环境
 * （`process.env.CI === 'true'`）：公共 CI 拿不到宿主源码仓，本条显式 skip——护栏由本地
 * 全量与发布前本地检查承担。
 */
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FONT_SHORTHAND_TOKENS } from './structure'

/** 宿主源码仓的样式表默认探测路径（本机固定布局；CI/他机用 DSH_FONT_SHEET 覆盖）。 */
const DEFAULT_CANDIDATES = [
  `${process.env.HOME ?? ''}/GitApp/ai-agent/deepseek-harness/packages/client/ui-theme/src/styles/gradient-shadow-text.css`,
]

/** 复合简写主体 = `--dsw-font-<名>`（排除五种子 token 后缀）。 */
const SUBTOKEN_SUFFIX_RE = /-(font-weight|line-height|font-size|font-family|font-style)$/
const HOST_SHORTHAND_DECL_RE = /^\s*(--dsw-font-[a-z0-9-]+)\s*:\s*([^;]+);/gm

/** 与 structure.test.ts 同款的安全重写形态（size/family 两段提取）。 */
const SHORTHAND_VALUE_RE =
  /^(?:italic )?(?:\d{3} )?(.+?)\/[^/]+? (var\(--dsw-font-family\)|var\(--ds-font-family-code\))$/
const OUR_VALUE_RE =
  /^(?:italic )?\d{3} (.+?)\/[\d.]+ (var\(--dsw-font-family\)|var\(--ds-font-family-code\))$/

/** 归一空白（斜杠两侧空格、连续空格）——宿主写 `… / calc(…)`、本包写 `…/1.62`。 */
const normalize = (value: string): string =>
  value.replace(/\s*\/\s*/, '/').replace(/\s+/g, ' ').trim()

/** 从宿主样式表提取全部复合简写主体：token 名 → { size, family } 或解析失败标记。 */
function parseHostSheet(css: string): Map<string, { size: string; family: string } | { parseError: string }> {
  const entries = new Map<string, { size: string; family: string } | { parseError: string }>()
  for (const match of css.matchAll(HOST_SHORTHAND_DECL_RE)) {
    const name = match[1]
    if (SUBTOKEN_SUFFIX_RE.test(name)) continue
    const value = normalize(match[2])
    const parsed = value.match(SHORTHAND_VALUE_RE)
    entries.set(name, parsed ? { size: parsed[1], family: parsed[2] } : { parseError: value })
  }
  return entries
}

function locateHostSheet(): string | undefined {
  if (process.env.DSH_FONT_SHEET && existsSync(process.env.DSH_FONT_SHEET)) return process.env.DSH_FONT_SHEET
  return DEFAULT_CANDIDATES.find(existsSync)
}

describe('宿主字体复合简写对账（升级护栏：宿主改 size 表达式时本表必须同步）', () => {
  // 本地找不到宿主源必须 fail（静默 skip = 红线失效），指引在断言消息里；CI 环境整条显式
  // skip（skipIf 会把本条标记为 skipped 而非静默消失），理由见文件头注释
  it.skipIf(process.env.CI === 'true')('宿主全部简写主体的 size/family 段与本包逐字一致', () => {
    const sheetPath = locateHostSheet()
    expect(
      sheetPath,
      '找不到宿主字体样式表（对账护栏不允许静默跳过）：请设置 DSH_FONT_SHEET=<宿主 gradient-shadow-text.css 路径> 后重跑',
    ).toBeDefined()
    const host = parseHostSheet(readFileSync(sheetPath!, 'utf8'))
    expect(host.size, '宿主样式表一个复合简写都没解析到——解析正则可能已过时').toBeGreaterThan(0)

    const failures: string[] = []
    for (const [name, hostEntry] of host) {
      const ourRaw = FONT_SHORTHAND_TOKENS[name]
      if (ourRaw === undefined) {
        failures.push(`宿主有而本包未重写: ${name}`)
        continue
      }
      const parsed = normalize(ourRaw.light).match(OUR_VALUE_RE)
      if ('parseError' in hostEntry || parsed === null) {
        failures.push(`${name} 解析失败：宿主 "${'parseError' in hostEntry ? hostEntry.parseError : `${hostEntry.size}/…`}" / 本包 "${ourRaw.light}"`)
        continue
      }
      if (hostEntry.size !== parsed[1]) {
        failures.push(`${name} size 段不一致：宿主 "${hostEntry.size}" vs 本包 "${parsed[1]}"（宿主升级改了表达式，本表必须同步）`)
      }
      if (hostEntry.family !== parsed[2]) {
        failures.push(`${name} family 段不一致：宿主 "${hostEntry.family}" vs 本包 "${parsed[2]}"`)
      }
    }
    for (const name of Object.keys(FONT_SHORTHAND_TOKENS)) {
      if (!host.has(name)) failures.push(`本包重写了宿主不存在的简写: ${name}（宿主已删档或名字拼错）`)
    }
    expect(failures, failures.join('\n')).toEqual([])
  })
})
