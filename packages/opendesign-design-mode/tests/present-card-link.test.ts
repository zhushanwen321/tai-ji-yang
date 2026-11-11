/**
 * 地址契约单测（present-card-link：canOpen 矩阵 + 设计会话探测缓存，FF6 认领范围裁决）。
 *
 * present-card-link 是浏览器半场的纯模块（零 import），node 下直接可测；fetch 用
 * vi.stubGlobal 桩（探测走伺服路由 URL，本测不引伺服——URL 形态断言只查路由前缀与
 * session 段编码，伺服行为归 serve.test.ts）。
 *
 * 断言结构（FF6 裁决：认领范围收窄到设计会话，乐观认领 + 探测弹回）：
 * 1. canOpen 地址矩阵：session 作用域 .html/.htm 认领（未知会话乐观）；非 HTML、绝对
 *    路径、非 session 作用域、畸形地址否决（既有语义不回归）；
 * 2. 探测定案：标记 200 → 会话 true → 认领；404 → 会话 false → canOpen 直接否决
 *    （弹回后的后续点击不再进面板）；fetch 抛错 → 不缓存、按可认领处理（窄化不放大故障）；
 * 3. 在途去重：并发探测同会话只发一次请求；
 * 4. 会话段解码：sessionId 带保留字符（%2F 场景按段解码，不越段）。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  artifactSessionIdOf,
  canOpenArtifactAddress,
  GENERIC_PREVIEW_KIND,
  knownDesignSession,
  OPENDESIGN_ARTIFACTS_ROUTE,
  probeDesignSession,
  resetDesignSessionCache,
} from '../client/present-card-link.js'

const addr = (sessionId: string, path: string): string =>
  `dsh-resource://file/session/${sessionId}/${path}`

let fetchCalls = 0

function stubFetch(handler: (url: string) => { ok: boolean; status: number }): void {
  fetchCalls = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | RequestInfo) => {
    fetchCalls += 1
    return handler(String(url))
  }))
}

beforeEach(() => {
  resetDesignSessionCache()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('canOpen 地址矩阵（既有语义不回归）', () => {
  it('session 作用域 HTML 地址认领（未知会话乐观）', () => {
    expect(canOpenArtifactAddress(addr('s1', 'index.html'))).toBe(true)
    expect(canOpenArtifactAddress(addr('s1', 'a/b.Page.Htm'))).toBe(true)
  })

  it('非 HTML / 绝对路径 / 非 session 作用域 / 畸形地址否决', () => {
    expect(canOpenArtifactAddress(addr('s1', 'notes.md'))).toBe(false)
    expect(canOpenArtifactAddress(addr('s1', '/etc/passwd.html'))).toBe(false)
    expect(canOpenArtifactAddress('dsh-resource://file/C:/proj/index.html')).toBe(false)
    expect(canOpenArtifactAddress('dsh-resource://file/session/s1')).toBe(false)
    expect(canOpenArtifactAddress('dsh-resource://file/session/s1/')).toBe(false)
    expect(canOpenArtifactAddress('not-a-design-address')).toBe(false)
  })
})

describe('设计会话探测与认领交互', () => {
  it('标记 200 → 会话判设计会话，canOpen 认领', async () => {
    stubFetch(() => ({ ok: true, status: 200 }))
    await expect(probeDesignSession('d1')).resolves.toBe(true)
    expect(knownDesignSession('d1')).toBe(true)
    expect(canOpenArtifactAddress(addr('d1', 'index.html'))).toBe(true)
  })

  it('标记 404 → 会话判非设计会话，canOpen 直接否决（弹回后的后续点击不再进面板）', async () => {
    stubFetch(() => ({ ok: false, status: 404 }))
    await expect(probeDesignSession('n1')).resolves.toBe(false)
    expect(knownDesignSession('n1')).toBe(false)
    expect(canOpenArtifactAddress(addr('n1', 'index.html'))).toBe(false)
  })

  it('fetch 抛错（伺服不可达）→ 不缓存、按可认领处理', async () => {
    stubFetch(() => { throw new Error('server down') })
    await expect(probeDesignSession('x1')).resolves.toBe(true)
    expect(knownDesignSession('x1')).toBeUndefined()
    expect(canOpenArtifactAddress(addr('x1', 'index.html'))).toBe(true)
  })

  it('并发探测同会话只发一次请求（在途去重）', async () => {
    stubFetch(() => ({ ok: true, status: 200 }))
    const [a, b] = await Promise.all([probeDesignSession('s9'), probeDesignSession('s9')])
    expect(a).toBe(true)
    expect(b).toBe(true)
    expect(fetchCalls).toBe(1)
  })

  it('缓存生效：已定案会话的后续探测零请求', async () => {
    stubFetch(() => ({ ok: true, status: 200 }))
    await probeDesignSession('c1')
    fetchCalls = 0
    await expect(probeDesignSession('c1')).resolves.toBe(true)
    expect(fetchCalls).toBe(0)
  })

  it('canOpen 预热未知会话（乐观认领路径触发探测）', async () => {
    stubFetch(() => ({ ok: true, status: 200 }))
    expect(canOpenArtifactAddress(addr('w1', 'index.html'))).toBe(true)
    await vi.waitFor(() => expect(knownDesignSession('w1')).toBe(true))
  })
})

describe('探测 URL 与会话段解码', () => {
  it('探测走伺服路由的标记文件路径（前缀 + session 段 + 材质化标记）', async () => {
    let seen = ''
    stubFetch((url) => { seen = url; return { ok: true, status: 200 } })
    await probeDesignSession('s 7')
    expect(seen).toBe(
      `${OPENDESIGN_ARTIFACTS_ROUTE}/${encodeURIComponent('s 7')}/${encodeURIComponent('.od-frames')}/${encodeURIComponent('deck-framework.md')}`,
    )
  })

  it('artifactSessionIdOf 取地址的 session 段（不可解析形态 undefined）', () => {
    expect(artifactSessionIdOf(addr('s1', 'a/index.html'))).toBe('s1')
    expect(artifactSessionIdOf('dsh-resource://file/session/s1')).toBeUndefined()
    expect(artifactSessionIdOf('dsh-resource://file/C:/x.html')).toBeUndefined()
  })

  it('弹回通道的具名 kind 字面值锁定（宿主 ui-sidebar-documentpreview TEXTPREVIEW_KIND）', () => {
    expect(GENERIC_PREVIEW_KIND).toBe('text')
  })
})
