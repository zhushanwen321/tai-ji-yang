import { describe, expect, it } from 'vitest'
import { FONT_SHORTHAND_TOKENS, RADIUS_TOKENS, STRUCTURE_TOKENS } from './structure'

/**
 * 复合简写安全重写的形态契约（层 3）：
 *   `[italic ]<weight> <宿主 size 表达式逐字>/<taiji unitless 行高> <宿主 family 引用逐字>`
 * size/family 表达式必须与宿主 gradient-shadow-text.css 当前字面逐段一致（本测试固定期望集
 * + host-font-sheet.spec.ts 对宿主源对账，双保险）；weight/行高只写 taiji 三档。
 */
const SHORTHAND_RE =
  /^(?:italic )?(500|600|700) (.+)\/(\d+(?:\.\d+)?) (var\(--dsw-font-family\)|var\(--ds-font-family-code\))$/
const COMPOUND_SHORTHAND_RE = /^--dsw-font-(?!.*-(?:font-weight|line-height|font-size|font-family|font-style)$)[a-z0-9-]+$/
const FORBIDDEN_SUBTOKEN_RE = /-(?:font-size|font-family|font-style)$/

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

describe('字体复合简写重写（层 3：载体从无效子 token 换成宿主实际消费的简写）', () => {
  it('名单完整性：宿主 30 个复合简写主体（17 markdown + 13 UI 阶梯）全部在表、一个不多', () => {
    expect(Object.keys(FONT_SHORTHAND_TOKENS).sort()).toEqual([
      '--dsw-font-base-16',
      '--dsw-font-base-strong-16',
      '--dsw-font-l-20',
      // JS sort() 是逐字符字典序：m-18 的 '-'（45）< markdown-* 的 'a'（97），排在所有 markdown 之前
      '--dsw-font-m-18',
      '--dsw-font-markdown-base',
      '--dsw-font-markdown-base-italic',
      '--dsw-font-markdown-base-strong',
      '--dsw-font-markdown-base-strong-italic',
      '--dsw-font-markdown-code',
      '--dsw-font-markdown-code-block',
      '--dsw-font-markdown-code-block-small',
      '--dsw-font-markdown-h1',
      '--dsw-font-markdown-h2',
      '--dsw-font-markdown-h3',
      '--dsw-font-markdown-h4',
      '--dsw-font-markdown-small',
      '--dsw-font-markdown-small-italic',
      '--dsw-font-markdown-small-strong',
      '--dsw-font-markdown-small-strong-italic',
      '--dsw-font-markdown-table',
      '--dsw-font-markdown-table-head',
      '--dsw-font-s-14',
      '--dsw-font-s-strong-14',
      '--dsw-font-xl-24',
      '--dsw-font-xs-13',
      '--dsw-font-xs-strong-13',
      '--dsw-font-xxs-12',
      '--dsw-font-xxs-strong-12',
      '--dsw-font-xxxs-11',
      '--dsw-font-xxxs-strong-11',
    ])
  })

  it('每个键都是复合简写主体（不碰 -font-size / -font-family / -font-style / 字族总 token）', () => {
    for (const name of Object.keys(FONT_SHORTHAND_TOKENS)) {
      expect(name, `${name} 不是复合简写主体`).toMatch(COMPOUND_SHORTHAND_RE)
      expect(name, `${name} 落在字号/字族/字形子 token 上`).not.toMatch(FORBIDDEN_SUBTOKEN_RE)
    }
    expect(FONT_SHORTHAND_TOKENS).not.toHaveProperty('--dsw-font-family')
  })

  it('每值形态：[italic ]太极 weight 档 / size 段 / unitless 太极行高 / 宿主 family var 引用', () => {
    for (const [name, modes] of Object.entries(FONT_SHORTHAND_TOKENS)) {
      const match = modes.light.match(SHORTHAND_RE)
      expect(match, `${name} 不符合安全重写形态（实际值 "${modes.light}"）`).not.toBeNull()
      expect(['1.32', '1.62', '1.4'], `${name} 行高不在太极三档`).toContain(match![3])
      expect(modes.dark, `${name} 结构值双模同值`).toBe(modes.light)
    }
  })

  it('size 表达式与宿主字面逐段一致（逐字期望集；宿主改 size 计算式时本表必须同步）', () => {
    // 期望 = 宿主 gradient-shadow-text.css 各简写的 size 段（含 calc/delta 形态与缺省值），逐字抄录
    const expectedSizes: Record<string, string> = {
      '--dsw-font-markdown-h1': 'calc(21px + var(--dsh-content-font-delta))',
      '--dsw-font-markdown-h2': 'calc(19px + var(--dsh-content-font-delta))',
      '--dsw-font-markdown-h3': 'calc(18px + var(--dsh-content-font-delta))',
      '--dsw-font-markdown-h4': 'var(--dsh-content-font-size, 14px)',
      '--dsw-font-markdown-base': 'var(--dsh-content-font-size, 14px)',
      '--dsw-font-markdown-base-strong': 'var(--dsh-content-font-size, 14px)',
      '--dsw-font-markdown-base-italic': 'var(--dsh-content-font-size, 14px)',
      '--dsw-font-markdown-base-strong-italic': 'var(--dsh-content-font-size, 14px)',
      '--dsw-font-markdown-table': 'var(--dsh-content-font-size-secondary, 13px)',
      '--dsw-font-markdown-table-head': 'var(--dsh-content-font-size-secondary, 13px)',
      '--dsw-font-markdown-small': '12px',
      '--dsw-font-markdown-small-strong': '12px',
      '--dsw-font-markdown-small-italic': '12px',
      '--dsw-font-markdown-small-strong-italic': '12px',
      '--dsw-font-markdown-code': 'calc(12px + var(--dsh-code-font-delta))',
      '--dsw-font-markdown-code-block': 'var(--dsh-code-font-size, 11px)',
      '--dsw-font-markdown-code-block-small': 'var(--dsh-code-font-size, 11px)',
      '--dsw-font-xl-24': '24px',
      '--dsw-font-l-20': '20px',
      '--dsw-font-m-18': '16px',
      '--dsw-font-base-16': '16px',
      '--dsw-font-base-strong-16': '16px',
      '--dsw-font-s-14': '14px',
      '--dsw-font-s-strong-14': '14px',
      '--dsw-font-xs-13': '13px',
      '--dsw-font-xs-strong-13': '13px',
      '--dsw-font-xxs-12': '12px',
      '--dsw-font-xxs-strong-12': '12px',
      '--dsw-font-xxxs-11': '11px',
      '--dsw-font-xxxs-strong-11': '11px',
    }
    for (const [name, expected] of Object.entries(expectedSizes)) {
      const match = FONT_SHORTHAND_TOKENS[name].light.match(SHORTHAND_RE)
      expect(match, `${name} 形态不合法`).not.toBeNull()
      expect(match![2].replace(/\s+/g, ' '), `${name} size 段与宿主字面不一致`).toBe(expected)
    }
    // 代码族挂 code 字族轴、其余挂 UI 字族轴（与宿主一致）
    expect(FONT_SHORTHAND_TOKENS['--dsw-font-markdown-code-block'].light).toContain('var(--ds-font-family-code)')
    expect(FONT_SHORTHAND_TOKENS['--dsw-font-markdown-base'].light).toContain('var(--dsw-font-family)')
  })

  it('weight 映射抽查：宿主 400 常规档 → 500；strong 档 → 600；h1-h3 保持 700；italic 前缀保留', () => {
    const weightOf = (name: string) => FONT_SHORTHAND_TOKENS[name].light.match(SHORTHAND_RE)![1]
    expect(weightOf('--dsw-font-markdown-base')).toBe('500')
    expect(weightOf('--dsw-font-markdown-h1')).toBe('700')
    expect(weightOf('--dsw-font-markdown-h4')).toBe('600')
    expect(weightOf('--dsw-font-base-strong-16')).toBe('600')
    expect(FONT_SHORTHAND_TOKENS['--dsw-font-markdown-base-italic'].light.startsWith('italic 500')).toBe(true)
    expect(FONT_SHORTHAND_TOKENS['--dsw-font-markdown-base-strong-italic'].light.startsWith('italic 600')).toBe(true)
  })
})

describe('结构层全表', () => {
  it('= 圆角 + 字体复合简写（无键碰撞）', () => {
    expect(Object.keys(STRUCTURE_TOKENS)).toHaveLength(
      Object.keys(RADIUS_TOKENS).length + Object.keys(FONT_SHORTHAND_TOKENS).length,
    )
    for (const name of Object.keys(RADIUS_TOKENS)) {
      expect(STRUCTURE_TOKENS[name]).toEqual(RADIUS_TOKENS[name])
    }
  })
})
