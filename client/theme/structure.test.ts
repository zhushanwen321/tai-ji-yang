import { describe, expect, it } from 'vitest'
import { FONT_TOKENS, RADIUS_TOKENS, STRUCTURE_TOKENS } from './structure'

/** 复合简写 = `--dsw-font-<名>`（无子 token 后缀）；本包一个都不许碰（D7 / RL9）。 */
const COMPOUND_SHORTHAND_RE = /^--dsw-font-(?!.*-(?:font-weight|line-height)$)[a-z0-9-]+$/
const ALLOWED_SUBTOKEN_RE = /^--dsw-font-[a-z0-9-]*-(?:font-weight|line-height)$/
const FORBIDDEN_SUBTOKEN_RE = /-(?:font-size|font-family)$/

describe('圆角四档', () => {
  it('四档取太极值 4/6/8/12（style.css :root 圆角四档），映射到宿主 radius 前四档', () => {
    expect(Object.keys(RADIUS_TOKENS)).toEqual([
      '--dsw-radius-xs',
      '--dsw-radius-sm',
      '--dsw-radius-md',
      '--dsw-radius-lg',
    ])
    expect(RADIUS_TOKENS['--dsw-radius-xs']).toEqual({ light: '4px', dark: '4px' })
    expect(RADIUS_TOKENS['--dsw-radius-sm']).toEqual({ light: '6px', dark: '6px' })
    expect(RADIUS_TOKENS['--dsw-radius-md']).toEqual({ light: '8px', dark: '8px' })
    expect(RADIUS_TOKENS['--dsw-radius-lg']).toEqual({ light: '12px', dark: '12px' })
  })

  it('不覆盖太极无对应档的宿主 xl/panel', () => {
    expect(RADIUS_TOKENS).not.toHaveProperty('--dsw-radius-xl')
    expect(RADIUS_TOKENS).not.toHaveProperty('--dsw-radius-panel')
  })
})

describe('字重/行高只走独立子 token（D7 红线 / RL9）', () => {
  it('每个字体 token 都是 --dsw-font-* 的 -font-weight 或 -line-height 子 token', () => {
    for (const name of Object.keys(FONT_TOKENS)) {
      expect(name, `${name} 不是受允许的子 token`).toMatch(ALLOWED_SUBTOKEN_RE)
    }
  })

  it('不覆盖复合简写、-font-size / -font-family 子 token、字族总 token', () => {
    for (const name of Object.keys(FONT_TOKENS)) {
      expect(name, `${name} 是复合简写或字族/字号 token`).not.toMatch(COMPOUND_SHORTHAND_RE)
      expect(name, `${name} 落在字号/字族子 token 上`).not.toMatch(FORBIDDEN_SUBTOKEN_RE)
      expect(name).not.toBe('--dsw-font-family')
    }
    // 抽查几个必须不在表里的高危名
    for (const absent of [
      '--dsw-font-markdown-base',
      '--dsw-font-markdown-base-font-size',
      '--dsw-font-markdown-base-font-family',
      '--dsw-font-family',
      '--dsw-font-base-16',
    ]) {
      expect(FONT_TOKENS).not.toHaveProperty(absent)
    }
  })

  it('字重取值 ∈ 太极三档 {500,600,700}，行高 ∈ {1.32,1.62,1.4}', () => {
    for (const [name, modes] of Object.entries(FONT_TOKENS)) {
      if (name.endsWith('-font-weight')) {
        expect(['500', '600', '700'], `${name} 字重`).toContain(modes.light)
      } else {
        expect(['1.32', '1.62', '1.4'], `${name} 行高`).toContain(modes.light)
      }
      // 结构值 scheme-invariant：两列同值（宿主仍强制双字符串，AS11）
      expect(modes.dark, `${name} 双模同值`).toBe(modes.light)
    }
  })

  it('字重/行高确实有覆盖（防回归成空表让 D7 静默失效）', () => {
    const weights = Object.keys(FONT_TOKENS).filter((name) => name.endsWith('-font-weight'))
    const leadings = Object.keys(FONT_TOKENS).filter((name) => name.endsWith('-line-height'))
    expect(weights.length).toBeGreaterThanOrEqual(19)
    expect(leadings.length).toBeGreaterThanOrEqual(29)
  })

  it('覆盖集完整性（U6 固定）：宿主 30 个字重 + 30 个行高子 token 中，凡宿主默认值 ≠ 太极目标值的档位全部在表内', () => {
    // 期望集 = 对宿主 gradient-shadow-text.css 全量子 token 逐档比对（宿主默认值 → 太极目标）后的结果。
    // 未收录的 11 个字重档与 1 个行高档均为「宿主默认值已等于太极目标」，无需覆盖：
    //   · 字重 —— h1/h2/h3 宿主 700 = --fw-bold；h4 / base-strong / base-strong-italic /
    //     small-strong / small-strong-italic / xl-24 宿主 600 = --fw-mid；l-20 / m-18 宿主 500 = --fw-text
    //   · 行高 —— l-20 宿主 28px/20px = 1.4 = --m-leading-ui
    // 增删任一键都必须显式改这里——防结构覆盖集静默漂移（漏覆盖 = 识别度损失，多覆盖 = 越权）。
    expect(Object.keys(FONT_TOKENS).filter((name) => name.endsWith('-font-weight')).sort()).toEqual([
      '--dsw-font-base-16-font-weight',
      '--dsw-font-base-strong-16-font-weight',
      '--dsw-font-markdown-base-font-weight',
      '--dsw-font-markdown-base-italic-font-weight',
      '--dsw-font-markdown-code-block-font-weight',
      '--dsw-font-markdown-code-block-small-font-weight',
      '--dsw-font-markdown-code-font-weight',
      '--dsw-font-markdown-small-font-weight',
      '--dsw-font-markdown-small-italic-font-weight',
      '--dsw-font-markdown-table-font-weight',
      '--dsw-font-markdown-table-head-font-weight',
      '--dsw-font-s-14-font-weight',
      '--dsw-font-s-strong-14-font-weight',
      '--dsw-font-xs-13-font-weight',
      '--dsw-font-xs-strong-13-font-weight',
      '--dsw-font-xxs-12-font-weight',
      '--dsw-font-xxs-strong-12-font-weight',
      '--dsw-font-xxxs-11-font-weight',
      '--dsw-font-xxxs-strong-11-font-weight',
    ])
    expect(Object.keys(FONT_TOKENS).filter((name) => name.endsWith('-line-height')).sort()).toEqual([
      '--dsw-font-base-16-line-height',
      '--dsw-font-base-strong-16-line-height',
      '--dsw-font-m-18-line-height',
      '--dsw-font-markdown-base-italic-line-height',
      '--dsw-font-markdown-base-line-height',
      '--dsw-font-markdown-base-strong-italic-line-height',
      '--dsw-font-markdown-base-strong-line-height',
      '--dsw-font-markdown-code-block-line-height',
      '--dsw-font-markdown-code-block-small-line-height',
      '--dsw-font-markdown-code-line-height',
      '--dsw-font-markdown-h1-line-height',
      '--dsw-font-markdown-h2-line-height',
      '--dsw-font-markdown-h3-line-height',
      '--dsw-font-markdown-h4-line-height',
      '--dsw-font-markdown-small-italic-line-height',
      '--dsw-font-markdown-small-line-height',
      '--dsw-font-markdown-small-strong-italic-line-height',
      '--dsw-font-markdown-small-strong-line-height',
      '--dsw-font-markdown-table-head-line-height',
      '--dsw-font-markdown-table-line-height',
      '--dsw-font-s-14-line-height',
      '--dsw-font-s-strong-14-line-height',
      '--dsw-font-xl-24-line-height',
      '--dsw-font-xs-13-line-height',
      '--dsw-font-xs-strong-13-line-height',
      '--dsw-font-xxs-12-line-height',
      '--dsw-font-xxs-strong-12-line-height',
      '--dsw-font-xxxs-11-line-height',
      '--dsw-font-xxxs-strong-11-line-height',
    ])
  })
})

describe('结构层全表', () => {
  it('= 圆角 + 字重/行高（无键碰撞）', () => {
    expect(Object.keys(STRUCTURE_TOKENS)).toHaveLength(
      Object.keys(RADIUS_TOKENS).length + Object.keys(FONT_TOKENS).length,
    )
    for (const name of Object.keys(RADIUS_TOKENS)) {
      expect(STRUCTURE_TOKENS[name]).toEqual(RADIUS_TOKENS[name])
    }
  })
})
