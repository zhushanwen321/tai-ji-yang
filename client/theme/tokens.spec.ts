import { describe, expect, it } from 'vitest'
import { FIRST_FRAME_STYLE } from '../../index.js'
import {
  DEFAULT_THEME_ID,
  THEMES,
  THEME_IDS,
  THEME_TOKEN_NAMES,
  THEME_TOKEN_TABLES,
  type ThemeId,
} from './tokens'

/** index.js 首帧样式里 token 声明的计数（`--dsw-xxx: light-dark(` 形态）。 */
const FIRST_FRAME_DECLARATION_RE = /--dsw-[a-z0-9-]+: light-dark\(/g

describe('tokens 表结构', () => {
  it('六个配色 id 齐备，默认色为玄（D2 默认值：暗族首色）', () => {
    expect(THEME_IDS).toEqual(['xuan', 'dailan', 'nuanmo', 'hao', 'qingmo', 'zhuyin'])
    expect(DEFAULT_THEME_ID).toBe('xuan')
    expect(Object.keys(THEMES)).toEqual([...THEME_IDS])
  })

  it('每个值都是 { light, dark } 双字符串（宿主 validateOverrides 的硬约束，AS11）', () => {
    for (const id of THEME_IDS) {
      const table = THEME_TOKEN_TABLES[id]
      expect(Object.keys(table).sort(), `${id} 的 token 名集合`).toEqual([...THEME_TOKEN_NAMES].sort())
      for (const name of THEME_TOKEN_NAMES) {
        const modes = table[name]
        expect(modes, `${id} / ${name}`).toBeTypeOf('object')
        expect(modes.light, `${id} / ${name} 亮支`).toBeTypeOf('string')
        expect(modes.dark, `${id} / ${name} 暗支`).toBeTypeOf('string')
        expect(modes.light.length, `${id} / ${name} 亮支非空`).toBeGreaterThan(0)
        expect(modes.dark.length, `${id} / ${name} 暗支非空`).toBeGreaterThan(0)
      }
    }
  })

  it('32 个 token 名 = P1 核心 15 个 + 层 2 职能分色 5 个 + 模型服务派生档 12 个', () => {
    expect(THEME_TOKEN_NAMES).toHaveLength(32)
    expect(new Set(THEME_TOKEN_NAMES).size).toBe(32)
    expect(THEME_TOKEN_NAMES).toContain('--dsw-alias-state-done-primary')
    expect(THEME_TOKEN_NAMES).toContain('--dsw-specific-sidebar-fill')
    expect(THEME_TOKEN_NAMES).toContain('--dsw-alias-link')
    expect(THEME_TOKEN_NAMES).toContain('--dsw-specific-bubble')
    expect(THEME_TOKEN_NAMES).toContain('--dsw-alias-label-deep-diving')
    // 派生档（dsh-model-service D10）：soft/ring 8 个 + ink 4 个，--taiji-* 前缀，
    // 顺序 = soft/ring 四族在前（brand/err/warn/ok）、ink 四档在后
    expect(THEME_TOKEN_NAMES.slice(20)).toEqual([
      '--taiji-brand-soft',
      '--taiji-brand-ring',
      '--taiji-err-soft',
      '--taiji-err-ring',
      '--taiji-warn-soft',
      '--taiji-warn-ring',
      '--taiji-ok-soft',
      '--taiji-ok-ring',
      '--taiji-ink',
      '--taiji-ink-err',
      '--taiji-ink-warn',
      '--taiji-ink-ok',
    ])
  })

  it('元数据的族归属与 taiji useTaijiThemes 一致（玄/黛蓝/暖墨暗，皓/青墨/朱印亮）', () => {
    const familyOf = (id: ThemeId) => THEMES[id].family
    expect(familyOf('xuan')).toBe('dark')
    expect(familyOf('dailan')).toBe('dark')
    expect(familyOf('nuanmo')).toBe('dark')
    expect(familyOf('hao')).toBe('light')
    expect(familyOf('qingmo')).toBe('light')
    expect(familyOf('zhuyin')).toBe('light')
    // 玄/皓 是族默认（preset 为空），四个预设色带各自 preset id
    expect(THEMES.xuan.preset).toBe('')
    expect(THEMES.hao.preset).toBe('')
    expect(THEMES.dailan.preset).toBe('dailan')
    expect(THEMES.nuanmo.preset).toBe('nuanmo')
    expect(THEMES.qingmo.preset).toBe('qingmo')
    expect(THEMES.zhuyin.preset).toBe('zhuyin')
  })
})

describe('与 index.js 首帧样式的一致性（V1 第 ④ 步：mount 前后不跳色）', () => {
  // 首帧表 = P1 核心 15 个（层 2 职能分色的消费点都在 mount 后的组件里，boot 区间没有渲染内容）
  const FIRST_FRAME_NAMES = THEME_TOKEN_NAMES.slice(0, 15)

  it('玄的双模表与首帧样式逐 token 同值同格式', () => {
    // index.js 以 `${token}: light-dark(${light}, ${dark});` 拼行，逐 token 做子串断言
    for (const name of FIRST_FRAME_NAMES) {
      const modes = THEME_TOKEN_TABLES.xuan[name]
      expect(FIRST_FRAME_STYLE, `首帧样式缺少或改动了 ${name}`).toContain(
        `${name}: light-dark(${modes.light}, ${modes.dark})`,
      )
    }
  })

  it(`首帧样式声明的 token 数 = ${FIRST_FRAME_NAMES.length}（首帧不藏第六个 token，层 2 的 5 个不进首帧）`, () => {
    const declarations = FIRST_FRAME_STYLE.match(FIRST_FRAME_DECLARATION_RE) ?? []
    expect(declarations).toHaveLength(FIRST_FRAME_NAMES.length)
  })
})

describe('双模取值（逐条抄自太极 style.css）', () => {
  it('玄 = :root 暗值，皓 = [data-theme=light] 亮值', () => {
    const xuan = THEME_TOKEN_TABLES.xuan
    const hao = THEME_TOKEN_TABLES.hao
    // 玄暗支：内容层 #18181b / 框架层侧栏 #242428 / 青玉 accent
    expect(xuan['--dsw-alias-bg-base'].dark).toBe('#18181b')
    expect(xuan['--dsw-specific-sidebar-fill'].dark).toBe('#242428')
    expect(xuan['--dsw-alias-brand-primary'].dark).toBe('#7fb89c')
    expect(xuan['--dsw-alias-label-primary'].dark).toBe('#e6e6e6')
    // 皓亮支：宣纸 #f7f6f3 / 墨黑 #2b2a28 / 深青玉 #43765d
    expect(hao['--dsw-alias-bg-base'].light).toBe('#f7f6f3')
    expect(hao['--dsw-specific-sidebar-fill'].light).toBe('#eef1ea')
    expect(hao['--dsw-alias-brand-primary'].light).toBe('#43765d')
    expect(hao['--dsw-alias-label-primary'].light).toBe('#2b2a28')
  })

  it('黛蓝/暖墨的暗支取各自 preset 块值（阶梯 + 文字档 + state-idle + accent）', () => {
    const dailan = THEME_TOKEN_TABLES.dailan
    expect(dailan['--dsw-alias-bg-base'].dark).toBe('#16171e')
    expect(dailan['--dsw-alias-bg-layer-2'].dark).toBe('#2e2f3a')
    expect(dailan['--dsw-specific-sidebar-fill'].dark).toBe('#262836')
    expect(dailan['--dsw-alias-label-secondary'].dark).toBe('#8f909b')
    // state-idle：dailan 块重声明 --neutral-dim（:root 暗值 #6e6e6e 不适用）
    expect(dailan['--dsw-alias-state-idle-primary'].dark).toBe('#6d6e79')
    expect(dailan['--dsw-alias-brand-primary'].dark).toBe('#8b9cc8')

    const nuanmo = THEME_TOKEN_TABLES.nuanmo
    expect(nuanmo['--dsw-alias-bg-base'].dark).toBe('#171614')
    expect(nuanmo['--dsw-alias-bg-layer-2'].dark).toBe('#302d28')
    expect(nuanmo['--dsw-specific-sidebar-fill'].dark).toBe('#272421')
    expect(nuanmo['--dsw-alias-label-secondary'].dark).toBe('#97928a')
    // state-idle：nuanmo 块重声明 --neutral-dim
    expect(nuanmo['--dsw-alias-state-idle-primary'].dark).toBe('#716c64')
    expect(nuanmo['--dsw-alias-brand-primary'].dark).toBe('#cbbc93')
  })

  it('青墨/朱印的亮支只改 accent 族（朱印另改 danger，两者各改 link 压深档）', () => {
    const qingmo = THEME_TOKEN_TABLES.qingmo
    expect(qingmo['--dsw-alias-brand-primary'].light).toBe('#356b7a')
    expect(qingmo['--dsw-alias-link'].light).toBe('#2d6cd4')
    // 青墨不碰阶梯与文字档：与皓同值
    expect(qingmo['--dsw-alias-bg-base'].light).toBe(THEME_TOKEN_TABLES.hao['--dsw-alias-bg-base'].light)
    expect(qingmo['--dsw-alias-state-error-primary'].light).toBe(
      THEME_TOKEN_TABLES.hao['--dsw-alias-state-error-primary'].light,
    )

    const zhuyin = THEME_TOKEN_TABLES.zhuyin
    expect(zhuyin['--dsw-alias-brand-primary'].light).toBe('#9c4335')
    expect(zhuyin['--dsw-alias-state-error-primary'].light).toBe('#b23855')
    expect(zhuyin['--dsw-alias-link'].light).toBe('#3163c8')
  })
})

describe('层 2 职能分色（taiji 职能分色裁决：主行动青玉 / 链接正蓝 / 气泡中性 / 思考紫）', () => {
  it('link 保持正蓝：玄暗支 #4d8dff（:root L75）/ 皓亮支 #2e6ae0（L307），黛蓝/暖墨暗支取各自 preset 块 link-c', () => {
    expect(THEME_TOKEN_TABLES.xuan['--dsw-alias-link'].dark).toBe('#4d8dff')
    expect(THEME_TOKEN_TABLES.hao['--dsw-alias-link'].light).toBe('#2e6ae0')
    expect(THEME_TOKEN_TABLES.dailan['--dsw-alias-link'].dark).toBe('#6196f0')
    expect(THEME_TOKEN_TABLES.nuanmo['--dsw-alias-link'].dark).toBe('#5b8fdd')
  })

  it('bubble 是中性 elevated 色不是 accent 色：暗族 = bg-elevated 派生 / 亮族独立档 #fefefe（L285）', () => {
    expect(THEME_TOKEN_TABLES.xuan['--dsw-specific-bubble']).toEqual({ light: '#fefefe', dark: '#323236' })
    // demo 注释：黛蓝/暖墨的 --bubble 逐块等于同块 --elevated（#31333e / #35322c）
    expect(THEME_TOKEN_TABLES.dailan['--dsw-specific-bubble'].dark).toBe('#31333e')
    expect(THEME_TOKEN_TABLES.nuanmo['--dsw-specific-bubble'].dark).toBe('#35322c')
  })

  it('label-deep-diving 对齐 taiji --reasoning 思考紫（与 state-done 同源值）', () => {
    const xuan = THEME_TOKEN_TABLES.xuan
    expect(xuan['--dsw-alias-label-deep-diving']).toEqual(xuan['--dsw-alias-state-done-primary'])
    expect(xuan['--dsw-alias-label-deep-diving-shimmer'].light).toBe('#8a80b3')
    expect(xuan['--dsw-alias-label-deep-diving-shimmer'].dark).toBe('#a39bbd')
  })
})

describe('跨族支 = 对族默认（taiji resolveTaijiTheme 回落语义，D2 方案 A）', () => {
  it('暗族三色的亮支 = 皓的亮值（跨族不借暗族 accent，防首帧跳色）', () => {
    for (const id of ['xuan', 'dailan', 'nuanmo'] as const) {
      for (const name of THEME_TOKEN_NAMES) {
        expect(THEME_TOKEN_TABLES[id][name].light, `${id} 亮支 / ${name}`).toBe(
          THEME_TOKEN_TABLES.hao[name].light,
        )
      }
    }
  })

  it('亮族三色的暗支 = 玄的暗值', () => {
    for (const id of ['hao', 'qingmo', 'zhuyin'] as const) {
      for (const name of THEME_TOKEN_NAMES) {
        expect(THEME_TOKEN_TABLES[id][name].dark, `${id} 暗支 / ${name}`).toBe(
          THEME_TOKEN_TABLES.xuan[name].dark,
        )
      }
    }
  })

  it('预设覆盖只落在自己族那一列（另一列恒等于族默认，无跨族渗漏）', () => {
    const familyDefaultOf = (id: ThemeId): ThemeId => (THEMES[id].family === 'dark' ? 'xuan' : 'hao')
    const touched = (id: ThemeId, column: 'light' | 'dark'): string[] => {
      const base = THEME_TOKEN_TABLES[familyDefaultOf(id)]
      return THEME_TOKEN_NAMES.filter((name) => THEME_TOKEN_TABLES[id][name][column] !== base[name][column])
    }
    // 暗族预设只改暗列；亮族预设只改亮列
    expect(touched('dailan', 'light')).toEqual([])
    expect(touched('nuanmo', 'light')).toEqual([])
    expect(touched('qingmo', 'dark')).toEqual([])
    expect(touched('zhuyin', 'dark')).toEqual([])
    // 且各自确实改了东西（防「回归成恒等表」的空转）
    expect(touched('dailan', 'dark').length).toBeGreaterThan(0)
    expect(touched('nuanmo', 'dark').length).toBeGreaterThan(0)
    expect(touched('qingmo', 'light').length).toBeGreaterThan(0)
    expect(touched('zhuyin', 'light').length).toBeGreaterThan(0)
  })
})

// ── 模型服务分区派生档（dsh-model-service D10：soft/ring 8 + ink 4）──────────────

/** sRGB 8bit 单通道 → 线性光（WCAG 2.x relative luminance 定义的通道变换）。 */
function channelToLinear(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** WCAG 相对亮度。 */
function luminance(rgb: [number, number, number]): number {
  return 0.2126 * channelToLinear(rgb[0]) + 0.7152 * channelToLinear(rgb[1]) + 0.0722 * channelToLinear(rgb[2])
}

/** WCAG 对比度（亮者 +0.05 为分子）。 */
function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** 解析本表用到的两种色值形态：#rrggbb 与 rgba(r, g, b[, a])。 */
function parseColor(value: string): { rgb: [number, number, number]; alpha: number } {
  const hex = /^#([0-9a-f]{6})$/i.exec(value)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], alpha: 1 }
  }
  const rgba = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/.exec(value)
  if (rgba) {
    return {
      rgb: [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])],
      alpha: Number(rgba[4]),
    }
  }
  throw new Error(`token.spec 色值解析器不支持的形态：${value}`)
}

/** rgba 值按 sRGB 数值空间预混进背景（浏览器 alpha 合成的近似，用于对比度判读）。 */
function blendOverBackground(fg: string, bg: [number, number, number]): [number, number, number] {
  const { rgb, alpha } = parseColor(fg)
  return [0, 1, 2].map((i) => Math.round(rgb[i] * alpha + bg[i] * (1 - alpha))) as [number, number, number]
}

describe('模型服务分区派生档（dsh-model-service D10：soft/ring 8 + ink 4）', () => {
  it('基值（玄暗列/皓亮列）：soft/ring 色相 = 主档同模值同 α 档，ink 亮列压暗 / 暗列主档（err 例外提亮）', () => {
    const xuan = THEME_TOKEN_TABLES.xuan
    const hao = THEME_TOKEN_TABLES.hao
    // soft/ring 的 rgba 三元组 = 主档（brand/err/warn/ok primary）同模值；α：soft 亮 0.12 / 暗 0.18，ring 亮 0.35 / 暗 0.45
    expect(xuan['--taiji-brand-soft']).toEqual({ light: 'rgba(67, 118, 93, 0.12)', dark: 'rgba(127, 184, 156, 0.18)' })
    expect(xuan['--taiji-brand-ring']).toEqual({ light: 'rgba(67, 118, 93, 0.35)', dark: 'rgba(127, 184, 156, 0.45)' })
    expect(xuan['--taiji-err-soft']).toEqual({ light: 'rgba(178, 76, 74, 0.12)', dark: 'rgba(191, 107, 107, 0.18)' })
    expect(xuan['--taiji-err-ring']).toEqual({ light: 'rgba(178, 76, 74, 0.35)', dark: 'rgba(191, 107, 107, 0.45)' })
    expect(xuan['--taiji-warn-soft']).toEqual({ light: 'rgba(151, 118, 41, 0.12)', dark: 'rgba(183, 156, 84, 0.18)' })
    expect(xuan['--taiji-warn-ring']).toEqual({ light: 'rgba(151, 118, 41, 0.35)', dark: 'rgba(183, 156, 84, 0.45)' })
    expect(xuan['--taiji-ok-soft']).toEqual({ light: 'rgba(54, 128, 71, 0.12)', dark: 'rgba(120, 168, 126, 0.18)' })
    expect(xuan['--taiji-ok-ring']).toEqual({ light: 'rgba(54, 128, 71, 0.35)', dark: 'rgba(120, 168, 126, 0.45)' })
    // ink 亮列 = 主档亮值压暗档；暗列 = 主档暗值（err 例外：#bf6b6b on soft 仅 3.7:1，提亮 #d49191）
    expect(xuan['--taiji-ink']).toEqual({ light: '#2f5a46', dark: '#7fb89c' })
    expect(xuan['--taiji-ink-err']).toEqual({ light: '#9a3836', dark: '#d49191' })
    expect(xuan['--taiji-ink-warn']).toEqual({ light: '#7a5d1f', dark: '#b79c54' })
    expect(xuan['--taiji-ink-ok']).toEqual({ light: '#296339', dark: '#78a87e' })
    // 皓 = 亮族默认：派生档两列与玄基值逐字一致（跨族回落语义下皓的暗列 = 玄暗列）
    for (const name of THEME_TOKEN_NAMES.slice(20)) {
      expect(hao[name], `皓 / ${name}`).toEqual(xuan[name])
    }
  })

  it('黛蓝/暖墨暗列只动 brand 族三件（soft/ring/ink），其余九个派生档回落玄暗值', () => {
    for (const id of ['dailan', 'nuanmo'] as const) {
      const table = THEME_TOKEN_TABLES[id]
      const brandPrimary = table['--dsw-alias-brand-primary'].dark
      const triple = brandPrimary === '#8b9cc8' ? '139, 156, 200' : '203, 188, 147'
      // 差异项：soft/ring 同 α 换色相；ink 暗列 = brand 主档值
      expect(table['--taiji-brand-soft'].dark).toBe(`rgba(${triple}, 0.18)`)
      expect(table['--taiji-brand-ring'].dark).toBe(`rgba(${triple}, 0.45)`)
      expect(table['--taiji-ink'].dark).toBe(brandPrimary)
      // 回落项：preset 块未改 err/warn/ok 主档，派生档照抄玄暗列
      for (const name of ['--taiji-err-soft', '--taiji-err-ring', '--taiji-warn-soft', '--taiji-warn-ring', '--taiji-ok-soft', '--taiji-ok-ring', '--taiji-ink-err', '--taiji-ink-warn', '--taiji-ink-ok'] as const) {
        expect(table[name].dark, `${id} / ${name} 回落玄暗列`).toBe(THEME_TOKEN_TABLES.xuan[name].dark)
      }
    }
  })

  it('青墨亮列只动 brand 族三件；朱印动 brand 与 err 两族各三件，其余回落皓亮值', () => {
    const qingmo = THEME_TOKEN_TABLES.qingmo
    expect(qingmo['--taiji-brand-soft'].light).toBe('rgba(53, 107, 122, 0.12)')
    expect(qingmo['--taiji-brand-ring'].light).toBe('rgba(53, 107, 122, 0.35)')
    expect(qingmo['--taiji-ink'].light).toBe('#28535f')
    for (const name of ['--taiji-err-soft', '--taiji-err-ring', '--taiji-warn-soft', '--taiji-warn-ring', '--taiji-ok-soft', '--taiji-ok-ring', '--taiji-ink-err', '--taiji-ink-warn', '--taiji-ink-ok'] as const) {
      expect(qingmo[name].light, `青墨 / ${name} 回落皓亮列`).toBe(THEME_TOKEN_TABLES.hao[name].light)
    }

    const zhuyin = THEME_TOKEN_TABLES.zhuyin
    expect(zhuyin['--taiji-brand-soft'].light).toBe('rgba(156, 67, 53, 0.12)')
    expect(zhuyin['--taiji-brand-ring'].light).toBe('rgba(156, 67, 53, 0.35)')
    expect(zhuyin['--taiji-ink'].light).toBe('#7d3629')
    expect(zhuyin['--taiji-err-soft'].light).toBe('rgba(178, 56, 85, 0.12)')
    expect(zhuyin['--taiji-err-ring'].light).toBe('rgba(178, 56, 85, 0.35)')
    expect(zhuyin['--taiji-ink-err'].light).toBe('#8f2a43')
    // 朱印不改 warn/ok：六族 preset 块对 warn/success 零改动（照抄 taiji style.css 的 preset 覆盖范围）
    for (const name of ['--taiji-warn-soft', '--taiji-warn-ring', '--taiji-ok-soft', '--taiji-ok-ring', '--taiji-ink-warn', '--taiji-ink-ok'] as const) {
      expect(zhuyin[name].light, `朱印 / ${name} 回落皓亮列`).toBe(THEME_TOKEN_TABLES.hao[name].light)
    }
  })

  it('12 个派生档不进首帧样式（FIRST_FRAME_TOKENS 只承载核心 15 个，消费点都在 mount 后）', () => {
    for (const name of THEME_TOKEN_NAMES.slice(20)) {
      expect(FIRST_FRAME_STYLE, `${name} 不应出现在首帧样式`).not.toContain(name)
    }
  })

  it('ink on 对应族 soft 的对比度 ≥ 4.5:1（四族 × 六色 × 双模全 48 组合机器验算，D10 验收口径）', () => {
    const INK_ON_SOFT = [
      ['--taiji-ink', '--taiji-brand-soft'],
      ['--taiji-ink-err', '--taiji-err-soft'],
      ['--taiji-ink-warn', '--taiji-warn-soft'],
      ['--taiji-ink-ok', '--taiji-ok-soft'],
    ] as const
    for (const id of THEME_IDS) {
      const table = THEME_TOKEN_TABLES[id]
      for (const mode of ['light', 'dark'] as const) {
        // soft 消费点的底色取各族对应列的 bg-base（分区界面 soft 底铺在分区背景上）
        const pageBackground = parseColor(table['--dsw-alias-bg-base'][mode]).rgb
        for (const [inkName, softName] of INK_ON_SOFT) {
          const softPixel = blendOverBackground(table[softName][mode], pageBackground)
          const ratio = contrastRatio(parseColor(table[inkName][mode]).rgb, softPixel)
          expect(ratio, `${id} ${mode} ${inkName} on ${softName}`).toBeGreaterThanOrEqual(4.5)
        }
      }
    }
  })
})
