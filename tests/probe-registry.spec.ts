/**
 * probe-registry 契约测试：发布后 registry 探测的判定分级（published / failed / 首发延迟
 * 警告 / 网络错误重试）与 name@version 解析。fetch 与 sleep 全部注入伪实现，零网络。
 */
import { describe, expect, it } from 'vitest'
import { parseReleaseTag, probeRelease } from '../scripts/release/probe-registry.mjs'

const res = (status: number) => ({ status })
const noSleep = () => Promise.resolve()

describe('parseReleaseTag', () => {
  it('普通包名与 scoped 包名都按最后一个 @ 切分', () => {
    expect(parseReleaseTag('tai-ji-yang-shell@0.1.0')).toEqual({ name: 'tai-ji-yang-shell', version: '0.1.0' })
    expect(parseReleaseTag('@zhushanwen/pi-ask-user@4.0.0')).toEqual({ name: '@zhushanwen/pi-ask-user', version: '4.0.0' })
  })
  it('预发布版本号可解析', () => {
    expect(parseReleaseTag('tai-ji-yang-shell@0.0.1-rc.1')).toEqual({ name: 'tai-ji-yang-shell', version: '0.0.1-rc.1' })
  })
  it('非 name@version 形态（触发 tag / 纯包名 / 无版本数字）返回 null', () => {
    expect(parseReleaseTag('npm-release-20261109')).toBeNull()
    expect(parseReleaseTag('tai-ji-yang-shell')).toBeNull()
    expect(parseReleaseTag('pkg@latest')).toBeNull()
    expect(parseReleaseTag('')).toBeNull()
  })
})

describe('probeRelease 判定分级', () => {
  it('版本端点 200 → published（一次命中即返回）', async () => {
    const calls: string[] = []
    const fetchImpl = (async (url: string) => {
      calls.push(url)
      return res(200)
    }) as typeof fetch
    const outcome = await probeRelease('pkg-a', '1.0.0', { retries: 3, delayMs: 0, fetchImpl, sleep: noSleep })
    expect(outcome.status).toBe('published')
    expect(calls).toHaveLength(1)
  })

  it('包存在而新版本持续 404 → 重试耗尽后 failed', async () => {
    const fetchImpl = (async (url: string) =>
      url.endsWith('/1.0.0') ? res(404) : res(200)) as typeof fetch
    const outcome = await probeRelease('pkg-a', '1.0.0', { retries: 2, delayMs: 0, fetchImpl, sleep: noSleep })
    expect(outcome.status).toBe('failed')
  })

  it('包本身 404（首发新包）→ cdn-delay 警告形态，不判失败', async () => {
    const fetchImpl = (async () => res(404)) as typeof fetch
    const outcome = await probeRelease('pkg-new', '0.1.0', { retries: 2, delayMs: 0, fetchImpl, sleep: noSleep })
    expect(outcome.status).toBe('cdn-delay')
  })

  it('网络错误计入重试：先错后成 → published；一直错 → error', async () => {
    let n = 0
    let failFirst = (async () => {
      n += 1
      if (n === 1) throw new Error('ECONNRESET')
      return res(200)
    }) as typeof fetch
    expect((await probeRelease('pkg-a', '1.0.0', { retries: 3, delayMs: 0, fetchImpl: failFirst, sleep: noSleep })).status).toBe('published')

    failFirst = (async () => {
      throw new Error('ECONNRESET')
    }) as typeof fetch
    const outcome = await probeRelease('pkg-a', '1.0.0', { retries: 2, delayMs: 0, fetchImpl: failFirst, sleep: noSleep })
    expect(outcome.status).toBe('error')
    expect(outcome.detail).toContain('ECONNRESET')
  })

  it('CDN 延迟后上线：第 2 次探测 200 → published（unknown-package 不提前终止）', async () => {
    let n = 0
    const fetchImpl = (async () => {
      n += 1
      return res(n >= 2 ? 200 : 404)
    }) as typeof fetch
    const outcome = await probeRelease('pkg-new', '0.1.0', { retries: 3, delayMs: 0, fetchImpl, sleep: noSleep })
    expect(outcome.status).toBe('published')
  })
})
