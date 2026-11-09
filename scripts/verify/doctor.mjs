/**
 * 验收 doctor：驱动前体检（任务契约五项）。
 *
 *   1. params        —— 执行形态安全：--url 回环 / --dsh-home 隔离、bin 存在
 *   2. lib-fresh     —— lib 产物不落后源码（freshness.checkLibFresh）
 *   3. url-liveness  —— 测试 URL 可达且是 dsh web 页面（page-doctor.checkUrlLiveness）
 *   4. assembly      —— 本包在目标实例装配完成：品牌栈 + 壳信息 global（page-doctor）
 *   5. console-clean —— 无 Slot 崩溃（page-doctor）
 *
 * 独立 CLI：node scripts/verify/doctor.mjs --url <测试URL> [--headed]
 *           node scripts/verify/doctor.mjs --dsh-bin <bin> --dsh-home <隔离目录> [--profile web]
 * 不给执行形态时拒绝运行（doctor 同样默认拒绝碰 ~/.dsh）。dsh 模式下 doctor 临时拉起
 * 实例并在检查后按 PID 收掉。run.mjs 以库形态复用 lib/page-doctor.mjs 与 lib/freshness.mjs
 * （页面已连上时直接查装配 / 控制台，不重复启动）。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { parseVerifyArgs, redactToken } from './lib/args.mjs'
import { bootInto, openVerifyPage } from './lib/browser.mjs'
import { assertIsolatedHome, commandExists, installPlugin, launchDshWeb, redactOutputTail } from './lib/dsh-process.mjs'
import { checkLibFresh } from './lib/freshness.mjs'
import { checkConsoleClean, checkPageAssembly, checkUrlLiveness } from './lib/page-doctor.mjs'

/** 检查结果行的人读输出；全绿返回 0，任一红返回 1。 */
function summarize(checks) {
  for (const c of checks) process.stdout.write(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name} — ${c.detail}\n`)
  const ok = checks.every((c) => c.ok)
  process.stdout.write(ok ? '\ndoctor GREEN：可以驱动场景\n' : '\ndoctor RED：先按 FAIL 项的 detail 恢复\n')
  return ok ? 0 : 1
}

/** 独立 CLI 入口：执行五项判定并按结果退出。 */
async function main() {
  const argv = process.argv.slice(2)
  const asJson = argv.includes('--json')
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

  const parsed = parseVerifyArgs(argv, os.homedir())
  if (!parsed.ok) {
    process.stdout.write(`${JSON.stringify({ ok: false, reason: parsed.reason, hint: parsed.hint })}\n`)
    return 2
  }

  // ① params：隔离与 bin 存在性。参数检查失败 = 安全门未过，直接返回，不启动实例。
  const paramChecks = []
  let paramsOk = true
  if (parsed.mode === 'dsh') {
    try {
      const isolated = assertIsolatedHome(parsed.dshHome, os.homedir())
      paramChecks.push({ name: 'params: DSH_HOME 隔离', ok: true, detail: isolated })
    } catch (error) {
      paramsOk = false
      paramChecks.push({ name: 'params: DSH_HOME 隔离', ok: false, detail: error instanceof Error ? error.message : String(error) })
    }
    const binExists = commandExists(parsed.dshBin)
    if (!binExists) paramsOk = false
    paramChecks.push({ name: 'params: dsh bin 可解析', ok: binExists, detail: binExists ? String(parsed.dshBin) : `${parsed.dshBin} 不是文件，也不在 PATH 中` })
  } else {
    paramChecks.push({ name: 'params: URL 回环', ok: true, detail: redactToken(parsed.url) })
  }
  if (!paramsOk) {
    const checks = [...paramChecks]
    if (asJson) {
      process.stdout.write(`${JSON.stringify({ ok: false, checks })}\n`)
      return 1
    }
    return summarize(checks)
  }

  // ② lib-fresh
  const fresh = checkLibFresh(repo)
  const freshChecks = fresh.checks.map((c) => ({ name: `lib-fresh: ${c.name}`, ok: c.ok, detail: c.detail }))

  // ③④⑤ 需要页面：dsh 模式临时拉起再按 PID 收掉；url 模式直连
  const runtimeChecks = []
  let session = null
  let dsh = null
  let effectiveUrl = parsed.mode === 'url' ? parsed.url : null
  const cleanup = async () => {
    if (session !== null) await session.close().catch(() => {})
    if (dsh !== null) await dsh.stop()
  }
  let interrupted = false
  const onSignal = (signal) => {
    if (interrupted) return
    interrupted = true
    void Promise.resolve(cleanup()).finally(() => process.exit(130))
  }
  const onSigint = () => onSignal('SIGINT')
  const onSigterm = () => onSignal('SIGTERM')
  process.once('SIGINT', onSigint)
  process.once('SIGTERM', onSigterm)
  try {
    if (parsed.mode === 'dsh') {
      // doctor 与 run 同一装配契约：全新隔离 home 也先安装本包，否则 assembly 必红。
      const install = installPlugin({
        dshBin: parsed.dshBin,
        dshHome: parsed.dshHome,
        profile: parsed.profile,
        repo,
      })
      if (!install.ok) {
        runtimeChecks.push({
          name: 'runtime: 插件安装',
          ok: false,
          detail: `${install.reason}；恢复：${install.hint}；输出尾部：${redactOutputTail(install.output).slice(-600)}`,
        })
        runtimeChecks.push({ name: 'assembly（未执行：安装失败）', ok: false, detail: '先恢复插件安装，再重跑 doctor' })
      } else {
        const launched = await launchDshWeb({
          dshBin: parsed.dshBin,
          dshHome: parsed.dshHome,
          profile: parsed.profile,
          port: parsed.port,
          timeoutMs: parsed.timeoutMs,
        })
        dsh = launched
        effectiveUrl = launched.url
      }
    }
    if (effectiveUrl !== null) {
      const liveness = await checkUrlLiveness(effectiveUrl)
      runtimeChecks.push(liveness)
      if (liveness.ok) {
        const playwright = await import('playwright')
        session = await openVerifyPage(playwright, { url: effectiveUrl, headless: parsed.headless })
        await bootInto(session.page)
        const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'))
        const assembly = await checkPageAssembly(session.page, pkg.version)
        runtimeChecks.push(...assembly.checks)
        runtimeChecks.push(checkConsoleClean(session.recorder))
      } else {
        runtimeChecks.push({ name: 'assembly（未执行：URL 不可达）', ok: false, detail: 'URL 活性未过，装配与控制台检查无法进行' })
      }
    }
  } catch (error) {
    runtimeChecks.push({ name: 'runtime', ok: false, detail: error instanceof Error ? error.message : String(error) })
  } finally {
    await cleanup()
    process.removeListener('SIGINT', onSigint)
    process.removeListener('SIGTERM', onSigterm)
  }

  const checks = [...paramChecks, ...freshChecks, ...runtimeChecks]
  if (asJson) {
    const ok = checks.every((c) => c.ok)
    process.stdout.write(`${JSON.stringify({ ok, checks })}\n`)
    return ok ? 0 : 1
  }
  return summarize(checks)
}

const isDirectRun = process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (isDirectRun) {
  main()
    .then((code) => {
      process.exitCode = code
    })
    .catch((error) => {
      process.stdout.write(`${JSON.stringify({ ok: false, reason: error instanceof Error ? error.message : String(error) })}\n`)
      process.exitCode = 2
    })
}
