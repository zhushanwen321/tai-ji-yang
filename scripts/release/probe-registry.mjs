#!/usr/bin/env node
/**
 * 发布后 registry 上线探测：对刚发布的每个 `name@version`（changeset publish 会打同名
 * git tag）查询 npm 版本端点，确认包真的可被安装。
 *
 * 判定分级（registry 传播事实，对齐仓库 README「发布」节）：
 *   · 包已存在而新版本重试后仍 404 → 判失败（更新版本通常很快可见，长时缺失 = 发布异常）；
 *   · 包本身 404（首发新包）→ 警告不判败：新包 packument 有分钟级 CDN 传播延迟，发布成功
 *     后立即查不到属正常，等几分钟再 `npm view <pkg> version` 人工复核；
 *   · 网络错误 → 计入重试，重试耗尽按失败处理（最后一次错误随结果打点，便于区分超时与真失败）。
 *
 * 用法：
 *   node scripts/release/probe-registry.mjs                  # 从指向 HEAD 的 git tag 里取 name@version 形态作清单
 *   node scripts/release/probe-registry.mjs pkg@1.0.0 ...    # 显式给清单（本地复核用）
 *   --retries <n>（默认 6） --delay-ms <n>（默认 30000）
 *
 * 零 npm 依赖（fetch 用 Node ≥ 18 的全局实现）；parseReleaseTag / probeRelease 导出供单测
 * 注入 fetch 与 sleep。
 */
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

/** `name@version`（含 scoped 形态 `@scope/name@1.0.0`）→ { name, version }；非该形态返回 null。 */
export function parseReleaseTag(tag) {
  const at = tag.lastIndexOf('@')
  if (at <= 0) return null
  const name = tag.slice(0, at)
  const version = tag.slice(at + 1)
  if (!/^[^/\s]+(\/[^/\s]+)?$/.test(name)) return null
  if (!/^\d/.test(version)) return null
  return { name, version }
}

async function fetchStatus(fetchImpl, name, version) {
  const encoded = name.replace('/', '%2F')
  const versionRes = await fetchImpl(`https://registry.npmjs.org/${encoded}/${version}`)
  if (versionRes.status === 200) return 'published'
  if (versionRes.status !== 404) throw new Error(`版本端点意外状态 ${versionRes.status}（${name}@${version}）`)
  const packumentRes = await fetchImpl(`https://registry.npmjs.org/${encoded}`)
  if (packumentRes.status === 200) return 'missing'
  if (packumentRes.status === 404) return 'unknown-package'
  throw new Error(`包端点意外状态 ${packumentRes.status}（${name}）`)
}

/**
 * 对一个 name@version 做带重试的探测。
 *
 * published 即刻返回；missing / unknown-package / 网络错误都重试（等 CDN 传播）；重试耗尽：
 * missing → failed，unknown-package → cdn-delay（警告），错误 → error。二者均判失败。
 */
export async function probeRelease(name, version, {
  retries = 6,
  delayMs = 30_000,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  let last = 'error'
  let lastDetail = '未执行任何探测'
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      last = await fetchStatus(fetchImpl, name, version)
      lastDetail = `第 ${attempt} 次探测结果 ${last}`
    } catch (error) {
      last = 'error'
      lastDetail = `第 ${attempt} 次探测出错: ${error.message}`
    }
    if (last === 'published') return { status: 'published', detail: `第 ${attempt} 次探测已上线` }
    if (attempt < retries) await sleep(delayMs)
  }
  if (last === 'missing') return { status: 'failed', detail: `${lastDetail}——包已存在但新版本始终 404` }
  if (last === 'unknown-package') return { status: 'cdn-delay', detail: `${lastDetail}——包本身 404，疑似首发 CDN 传播延迟` }
  return { status: 'error', detail: lastDetail }
}

function usage(argv) {
  let retries = 6
  let delayMs = 30_000
  const explicit = []
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--retries') {
      retries = Number(argv[++i])
    } else if (argv[i] === '--delay-ms') {
      delayMs = Number(argv[++i])
    } else {
      explicit.push(argv[i])
    }
  }
  return { retries, delayMs, explicit }
}

export async function main(argv) {
  const { retries, delayMs, explicit } = usage(argv)
  let targets
  if (explicit.length > 0) {
    targets = explicit.map(parseReleaseTag)
    const bad = explicit.filter((t, i) => targets[i] === null)
    if (bad.length > 0) {
      console.error(`参数不是 name@version 形态: ${bad.join(', ')}`)
      return 2
    }
  } else {
    // changeset publish 会对每个刚发布的包打 `name@version` tag（指向发布 commit = 本 CI 的
    // HEAD）；触发用的 npm-* tag 不含 @ 不匹配，天然排除。
    const tags = execFileSync('git', ['tag', '--points-at', 'HEAD'], { encoding: 'utf8' })
      .split(/\r?\n/)
      .filter(Boolean)
    targets = tags.map(parseReleaseTag).filter(Boolean)
  }
  if (targets.length === 0) {
    console.log('没有可探测的 name@version tag——changeset publish 未产生发布 tag（本次无可发布版本），探测通过')
    return 0
  }

  const results = []
  for (const { name, version } of targets) {
    const outcome = await probeRelease(name, version, { retries, delayMs })
    results.push({ name, version, ...outcome })
    const line = `${name}@${version}: ${outcome.status}（${outcome.detail}）`
    if (outcome.status === 'published') console.log(`✔ ${line}`)
    else console.error(`✘ ${line}`)
  }

  const hardFail = results.filter((r) => r.status === 'failed' || r.status === 'error')
  const cdnDelay = results.filter((r) => r.status === 'cdn-delay')
  if (cdnDelay.length > 0) {
    console.warn(
      `警告: ${cdnDelay.map((r) => `${r.name}@${r.version}`).join(', ')} 为首发新包，packument 有分钟级 CDN 传播延迟——` +
        `几分钟后人工复核: npm view <包名> version`,
    )
  }
  if (hardFail.length > 0) {
    console.error(`探测失败 ${hardFail.length} 项——发布结果未在 registry 上线，先核对 changeset publish 步骤日志`)
    return 1
  }
  console.log(`探测完成: ${results.length - cdnDelay.length} 项已上线${cdnDelay.length > 0 ? `，${cdnDelay.length} 项待传播复核` : ''}`)
  return 0
}

// CLI 入口判定：被 import（单测）时不执行 main
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main(process.argv.slice(2)))
}
