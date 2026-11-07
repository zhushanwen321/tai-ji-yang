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

  it('15 个 token 名与设计 §3.3.2 集合一致（13 白名单 alias + sidebar-fill + state-done）', () => {
    expect(THEME_TOKEN_NAMES).toHaveLength(15)
    expect(new Set(THEME_TOKEN_NAMES).size).toBe(15)
    expect(THEME_TOKEN_NAMES).toContain('--dsw-alias-state-done-primary')
    expect(THEME_TOKEN_NAMES).toContain('--dsw-specific-sidebar-fill')
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
  it('玄的双模表与首帧样式逐 token 同值同格式', () => {
    // index.js 以 `${token}: light-dark(${light}, ${dark});` 拼行，逐 token 做子串断言
    for (const name of THEME_TOKEN_NAMES) {
      const modes = THEME_TOKEN_TABLES.xuan[name]
      expect(FIRST_FRAME_STYLE, `首帧样式缺少或改动了 ${name}`).toContain(
        `${name}: light-dark(${modes.light}, ${modes.dark})`,
      )
    }
  })

  it('首帧样式声明的 token 数 = 15（首帧不藏第六个 token，覆盖层也不扩）', () => {
    const declarations = FIRST_FRAME_STYLE.match(FIRST_FRAME_DECLARATION_RE) ?? []
    expect(declarations).toHaveLength(THEME_TOKEN_NAMES.length)
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

  it('黛蓝/暖墨的暗支取各自 preset 块值（阶梯 + 文字档 + accent）', () => {
    const dailan = THEME_TOKEN_TABLES.dailan
    expect(dailan['--dsw-alias-bg-base'].dark).toBe('#16171e')
    expect(dailan['--dsw-alias-bg-layer-2'].dark).toBe('#2e2f3a')
    expect(dailan['--dsw-specific-sidebar-fill'].dark).toBe('#262836')
    expect(dailan['--dsw-alias-brand-primary'].dark).toBe('#8b9cc8')
    expect(dailan['--dsw-alias-label-secondary'].dark).toBe('#8f909b')

    const nuanmo = THEME_TOKEN_TABLES.nuanmo
    expect(nuanmo['--dsw-alias-bg-base'].dark).toBe('#171614')
    expect(nuanmo['--dsw-alias-bg-layer-2'].dark).toBe('#302d28')
    expect(nuanmo['--dsw-specific-sidebar-fill'].dark).toBe('#272421')
    expect(nuanmo['--dsw-alias-brand-primary'].dark).toBe('#cbbc93')
    expect(nuanmo['--dsw-alias-label-secondary'].dark).toBe('#97928a')
  })

  it('青墨/朱印的亮支只改 accent 族（朱印另改 danger）', () => {
    const qingmo = THEME_TOKEN_TABLES.qingmo
    expect(qingmo['--dsw-alias-brand-primary'].light).toBe('#356b7a')
    // 青墨不碰阶梯与文字档：与皓同值
    expect(qingmo['--dsw-alias-bg-base'].light).toBe(THEME_TOKEN_TABLES.hao['--dsw-alias-bg-base'].light)
    expect(qingmo['--dsw-alias-state-error-primary'].light).toBe(
      THEME_TOKEN_TABLES.hao['--dsw-alias-state-error-primary'].light,
    )

    const zhuyin = THEME_TOKEN_TABLES.zhuyin
    expect(zhuyin['--dsw-alias-brand-primary'].light).toBe('#9c4335')
    expect(zhuyin['--dsw-alias-state-error-primary'].light).toBe('#b23855')
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
