import { describe, expect, it } from 'vitest'
import {
  checkRouteConflict,
  deriveCredentialRef,
  deriveProviderKey,
  isValidProviderKeyShape,
  satisfiesHostRefShape,
} from './provider-key'

/**
 * 标识派生层单测（dsh-model-service AX11 + D3 预检句 + D7 ref 派生；u-foundation
 * testCommand 指名本文件）。四类用例：ASCII 归一 / 非 ASCII 回落序号 / 查重拒绝 /
 * ref 变换合法性（必满足宿主 ref 正则 ^[A-Za-z_][A-Za-z0-9_]*$）。
 */

describe('ASCII 归一（deriveProviderKey）', () => {
  it('常规显示名：小写化、空白转连字符、剔除非 [a-z0-9-] 字符', () => {
    expect(deriveProviderKey('DeepSeek')).toBe('deepseek')
    expect(deriveProviderKey('DeepSeek Official')).toBe('deepseek-official')
    expect(deriveProviderKey('OpenAI Compat API')).toBe('openai-compat-api')
    expect(deriveProviderKey('My_Provider.Name')).toBe('my-provider-name')
    expect(deriveProviderKey('  Spaced  Out  ')).toBe('spaced-out')
  })

  it('规范形态：连续连字符合并、首尾连字符去除、混合分隔符归一', () => {
    expect(deriveProviderKey('a--b')).toBe('a-b')
    expect(deriveProviderKey('-wrapped-')).toBe('wrapped')
    expect(deriveProviderKey('A_B-C D.E')).toBe('a-b-c-d-e')
  })

  it('保留字符域只含 [a-z0-9-]：数字段与字母开头数字串照常归一', () => {
    expect(deriveProviderKey('GPT-4o')).toBe('gpt-4o')
    expect(deriveProviderKey('3D Viewer')).toBe('3d-viewer')
    // 结果全部满足 kebab 规范形态
    for (const key of [deriveProviderKey('GPT-4o'), deriveProviderKey('3D Viewer')]) {
      expect(isValidProviderKeyShape(key), key).toBe(true)
    }
  })

  it('剔除标点与全角字符，不留空位', () => {
    expect(deriveProviderKey('my (test) provider!')).toBe('my-test-provider')
    expect(deriveProviderKey('供应商（OpenAI）兼容')).toBe('openai')
  })
})

describe('非 ASCII 回落序号（同输入恒同输出，AX11）', () => {
  it('纯中文显示名回落 p-1', () => {
    expect(deriveProviderKey('供应商')).toBe('p-1')
    expect(deriveProviderKey('深度求索')).toBe('p-1')
  })

  it('显示名自带序号段时序号取自输入（「供应商-2」→ p-2，稳定序号）', () => {
    expect(deriveProviderKey('供应商-2')).toBe('p-2')
    expect(deriveProviderKey('备用线路 12')).toBe('p-12')
  })

  it('确定性：同一输入重复派生（含跨时间两次调用）恒同一输出', () => {
    for (const name of ['供应商', '供应商-2', '深度求索（测试）']) {
      const first = deriveProviderKey(name)
      expect(deriveProviderKey(name)).toBe(first)
      expect(deriveProviderKey(name)).toBe(first)
    }
  })

  it('回落形态同样满足 kebab 规范（p 开头，可安全拼接 taiji-route- 前缀）', () => {
    expect(isValidProviderKeyShape(deriveProviderKey('供应商'))).toBe(true)
    expect(isValidProviderKeyShape(deriveProviderKey('供应商-2'))).toBe(true)
    expect(`taiji-route-${deriveProviderKey('供应商')}`).toMatch(/^taiji-route-[a-z0-9-]+$/)
  })
})

describe('查重拒绝（checkRouteConflict，D3 预检句的判定原语）', () => {
  const hostRoutes = ['deepseek-official', 'deepseek-account', 'opencode-go', 'minimax-cn']

  it('key 命中宿主已注册 route → true（调用方拒绝保存并提示改名）', () => {
    expect(checkRouteConflict('opencode-go', hostRoutes)).toBe(true)
    expect(checkRouteConflict('deepseek-official', hostRoutes)).toBe(true)
  })

  it('key 不在 route 集合 → false（可进入保存流程）', () => {
    expect(checkRouteConflict('my-relay', hostRoutes)).toBe(false)
    expect(checkRouteConflict('deepseek-official-x', hostRoutes)).toBe(false)
  })

  it('空 route 集合（全新 profile）永无冲突', () => {
    expect(checkRouteConflict('deepseek-official', [])).toBe(false)
  })

  it('与派生层闭环：显示名派生出的 key 查重可检出与宿主 route 撞名', () => {
    // 用户起名「OpenCode Go」派生出与宿主既有 route 相同的 key——预检必须拦住
    const key = deriveProviderKey('OpenCode Go')
    expect(key).toBe('opencode-go')
    expect(checkRouteConflict(key, hostRoutes)).toBe(true)
  })
})

describe('ref 变换合法性（deriveCredentialRef，D7 派生规则）', () => {
  it('kebab key → TAIJI_<大写、连字符转下划线>_KEY', () => {
    expect(deriveCredentialRef('deepseek-official')).toBe('TAIJI_DEEPSEEK_OFFICIAL_KEY')
    expect(deriveCredentialRef('my-relay')).toBe('TAIJI_MY_RELAY_KEY')
    expect(deriveCredentialRef('p-2')).toBe('TAIJI_P_2_KEY')
    expect(deriveCredentialRef('openai')).toBe('TAIJI_OPENAI_KEY')
  })

  it('全部派生结果满足宿主 ref 正则 ^[A-Za-z_][A-Za-z0-9_]*$', () => {
    const keys = [
      deriveProviderKey('DeepSeek Official'),
      deriveProviderKey('供应商'),
      deriveProviderKey('供应商-2'),
      deriveProviderKey('GPT-4o'),
      deriveProviderKey('3D Viewer'),
      'p-1',
    ]
    for (const key of keys) {
      const ref = deriveCredentialRef(key)
      expect(satisfiesHostRefShape(ref), `${key} → ${ref}`).toBe(true)
      expect(ref.startsWith('TAIJI_'), ref).toBe(true)
    }
  })

  it('宿主正则对非法形态确实拒收（变换合法性与宿主约束对拍——合法由 key 字符集保证）', () => {
    expect(satisfiesHostRefShape('1BAD')).toBe(false)
    expect(satisfiesHostRefShape('HAS-HYPHEN')).toBe(false)
    expect(satisfiesHostRefShape('TAIJI_OK_KEY')).toBe(true)
  })
})
