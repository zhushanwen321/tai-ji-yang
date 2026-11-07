import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { coerceThemeId, isThemeId, resolveTheme, resolveThemeTokens } from './resolve'
import { DEFAULT_THEME_ID, THEMES, THEME_IDS, THEME_TOKEN_TABLES } from './tokens'

/**
 * 读 resolve.ts 源码（剥掉块注释与行注释）做静态断言。
 *
 * 为什么用源码断言而不是行为断言：「跨族不改写宿主偏好」的违反形态（某次改动给 resolve
 * 接了 ctx 并在换族时调 setTheme）在行为层很难暴露——单测里没有真宿主。注释里必然会出现
 * setTheme / theme.register 字样（说明为什么不调），故先剥注释再扫。
 */
const RESOLVE_SOURCE = readFileSync(new URL('./resolve.ts', import.meta.url), 'utf8')
const RESOLVE_CODE = RESOLVE_SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '')

describe('resolve 纯求值语义', () => {
  it('每个配色 id 解析到自己的双模表', () => {
    for (const id of THEME_IDS) {
      expect(resolveThemeTokens(id)).toBe(THEME_TOKEN_TABLES[id])
    }
  })

  it('重复解析返回同一结果（无隐藏状态、无副作用、不依赖环境）', () => {
    const first = resolveThemeTokens('dailan')
    const second = resolveThemeTokens('dailan')
    expect(second).toBe(first)
    expect(resolveTheme('qingmo')).toBe(THEMES.qingmo)
  })

  it('resolve* 不收 ctx（签名元数 = 1）——跨族选色没有宿主可写', () => {
    expect(resolveThemeTokens.length).toBe(1)
    expect(resolveTheme.length).toBe(1)
    expect(coerceThemeId.length).toBe(1)
  })

  it('coerceThemeId：合法值原样通过，缺失/非法/异类型回落默认色（玄）', () => {
    expect(coerceThemeId('zhuyin')).toBe('zhuyin')
    expect(coerceThemeId(undefined)).toBe(DEFAULT_THEME_ID)
    expect(coerceThemeId(null)).toBe(DEFAULT_THEME_ID)
    expect(coerceThemeId('')).toBe(DEFAULT_THEME_ID)
    expect(coerceThemeId('DAILAN')).toBe(DEFAULT_THEME_ID)
    expect(coerceThemeId('light')).toBe(DEFAULT_THEME_ID) // 宿主明暗值不是配色 id
    expect(coerceThemeId(42)).toBe(DEFAULT_THEME_ID)
    expect(coerceThemeId({ id: 'hao' })).toBe(DEFAULT_THEME_ID)
  })

  it('isThemeId 只认六个合法 id', () => {
    for (const id of THEME_IDS) expect(isThemeId(id)).toBe(true)
    for (const value of ['', 'xuan ', 'system', 'dark', 'taiji', 0, null, undefined]) {
      expect(isThemeId(value)).toBe(false)
    }
  })

  it('resolveTheme 暴露族归属（外观行「当前模式仍是对应族」的展示数据源）', () => {
    expect(resolveTheme('dailan').family).toBe('dark')
    expect(resolveTheme('hao').family).toBe('light')
    expect(resolveTheme('xuan').familyDefault).toBe(true)
    expect(resolveTheme('qingmo').familyDefault).toBe(false)
  })
})

describe('跨族不改写宿主偏好（D2 本轮裁决方案 A，一等约束）', () => {
  it('源码（剥注释后）不含 setTheme / theme.register 调用', () => {
    expect(RESOLVE_CODE).not.toMatch(/\bsetTheme\s*\(/)
    expect(RESOLVE_CODE).not.toMatch(/\btheme\s*\.\s*register\s*\(/)
  })

  it('源码（剥注释后）不碰 DOM 与浏览器存储——纯求值无环境依赖', () => {
    expect(RESOLVE_CODE).not.toMatch(/\bdocument\b/)
    expect(RESOLVE_CODE).not.toMatch(/\bwindow\b/)
    expect(RESOLVE_CODE).not.toMatch(/\blocalStorage\b/)
    expect(RESOLVE_CODE).not.toMatch(/\bmatchMedia\b/)
  })

  it('跨族解析不依赖当前明暗：亮族色的暗支是暗族默认那套（V2 第 ④ 步取值依据）', () => {
    // resolve 只按 id 求值——宿主偏好为 dark 时点选皓，拿到的是皓表的暗列（= 玄暗值），
    // 界面不会因此变亮；宿主偏好值本包一次都不写。
    expect(resolveThemeTokens('hao')['--dsw-alias-bg-base'].dark).toBe(
      resolveThemeTokens('xuan')['--dsw-alias-bg-base'].dark,
    )
    expect(resolveThemeTokens('hao')['--dsw-alias-bg-base'].dark).toBe('#18181b')
  })
})
