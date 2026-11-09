#!/usr/bin/env node
/**
 * verify-taiji-yang 验收 runner：真实 DSH 宿主验收的执行入口。
 *
 * 两种执行形态（互斥）：
 *   ① 连接已为测试启动的实例：node scripts/verify/run.mjs --url "http://127.0.0.1:<端口>/?token=<token>"
 *   ② 自启隔离实例：node scripts/verify/run.mjs --dsh-bin <dsh> --dsh-home <临时目录> [--port <n>]
 *      形态 ② 在隔离 DSH_HOME 里 `dsh plugin add` 本仓 → 启动 dsh web → 从 stdout 解析
 *      认证 URL（不猜端口不猜 token）；.js 形态的 --dsh-bin 用当前 node 执行。
 *
 * 生命周期：参数安全校验 → doctor（lib 新鲜度 + URL 活性 + 装配 + 控制台）→ 逐场景串行
 * （brand → head → theme → projects → lifecycle，卸载类场景永远最后）→ 证据落盘 →
 * 按 PID 收尾（SIGTERM 进程组 → 宽限后 SIGKILL；不做按名字的宽泛进程匹配）。
 * doctor 与场景间的任何失败都走统一 finally：先关浏览器，再按 PID 停自启实例。
 *
 * D3 契约（dev-flow wrapper 消费）：
 *   - 退出码 fail=1 / degraded=0（--strict 时 2）/ pass=0；参数或 doctor 错误 exit 2；
 *   - verdict.json + summary.jsonl 镜像落 --artifacts-dir 根（引擎事实依据只读根）；
 *   - verdict 三态 pass|fail|degraded，meta 带 headCommit / host / dshVersion / scenario / runId。
 *
 * 证据目录：<artifacts-dir>/<runId>/<scenarioId>/；同一 runId 已有证据时拒绝复用，
 * 防止多次运行的步骤追加互相污染。证据绝不落隔离 DSH_HOME。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { parseVerifyArgs, redactToken, resolveArtifactsLayout } from './lib/args.mjs'
import { bootInto, openVerifyPage } from './lib/browser.mjs'
import { assertIsolatedHome, installPlugin, launchDshWeb, redactOutputTail } from './lib/dsh-process.mjs'
import { checkConsoleClean, checkPageAssembly, checkUrlLiveness } from './lib/page-doctor.mjs'
import { checkLibFresh } from './lib/freshness.mjs'
import {
  createEvidence,
  exitCodeFor,
  mirrorToArtifactsRoot,
  writeAggregateVerdict,
} from './lib/evidence.mjs'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(SCRIPT_DIR, '..', '..')
const SCENARIO_DIR = path.join(SCRIPT_DIR, 'scenarios')

const argv = process.argv.slice(2)
const asJson = argv.includes('--json')

/** 日志行：--json 模式走 stderr（stdout 留给最终 verdict JSON），人读模式走 stdout。 */
function logLine(line) {
  const text = `[verify-taiji-yang] ${line}`
  if (asJson) process.stderr.write(`${text}\n`)
  else process.stdout.write(`${text}\n`)
}

/** 结构化提前退出：写一次 JSON 后抛给统一边界，保证 finally 清理执行。 */
class RunExit extends Error {
  constructor(code, reason, hint) {
    super(reason)
    this.code = code
    this.hint = hint
  }
}

function failExit(reason, hint) {
  process.stdout.write(`${JSON.stringify({ ok: false, reason, hint })}\n`)
  throw new RunExit(2, reason, hint)
}

// ── 1. 参数安全 ────────────────────────────────────────────────────────────
const parsed = parseVerifyArgs(argv, os.homedir())
if (!parsed.ok) {
  process.stdout.write(`${JSON.stringify({ ok: false, reason: parsed.reason, hint: parsed.hint })}\n`)
  process.exitCode = 2
  process.exit(2)
}

const layout = resolveArtifactsLayout({ artifactsDir: parsed.artifactsDir, runId: parsed.runId, homedir: os.homedir() })
const artifactsDir = layout.artifactsDir
const runDir = layout.runDir
if (fs.existsSync(runDir) && fs.readdirSync(runDir).length > 0) {
  process.stdout.write(`${JSON.stringify({
    ok: false,
    reason: `runId 已有证据目录：${runDir}`,
    hint: '换一个 --run-id 后重跑；同一 runId 复用会把多次运行的证据混在一起',
  })}\n`)
  process.exitCode = 2
  process.exit(2)
}
fs.mkdirSync(runDir, { recursive: true })

logLine(`runId=${parsed.runId} mode=${parsed.mode} scenarios=${parsed.scenarios.join(',')} artifacts=${artifactsDir}`)
if (parsed.mode === 'url') logLine(`url=${redactToken(parsed.url)}`)

/** 隔离自启实例句柄（stop 按 PID 进程组收尾；--keep 时保留并明示 PID）。 */
let dshSession = null
/** 浏览器会话统一交给 cleanup，信号与异常路径都不留孤儿。 */
let verifySession = null

let cleaningUp = false
async function cleanup(signal) {
  if (cleaningUp) return
  cleaningUp = true
  if (signal !== undefined) logLine(`收到 ${signal}，清理中`)
  if (verifySession !== null) {
    await verifySession.close().catch(() => {})
    verifySession = null
  }
  if (dshSession !== null) {
    if (parsed.keep) {
      logLine(`--keep：dsh web 进程保留 pid=${dshSession.pid}（收尾请按 PID 处理；隔离 home=${parsed.dshHome}）`)
    } else {
      await dshSession.stop()
      logLine('dsh web 进程已按 PID 停止')
    }
  }
}
process.once('SIGINT', () => void cleanup('SIGINT').then(() => process.exit(130)))
process.once('SIGTERM', () => void cleanup('SIGTERM').then(() => process.exit(130)))

let aggregate = null
/** 跨场景累计：提前失败时也要用它们写一根镜像 fail verdict，避免旧 pass 误导 D3。 */
const results = []
const aggregateSummary = []
try {
  // ── 2. 装配目标实例 ──────────────────────────────────────────────────────
  const isolationMeta = { mode: parsed.mode }
  if (parsed.mode === 'dsh') {
    try {
      isolationMeta.dshHome = assertIsolatedHome(parsed.dshHome, os.homedir())
    } catch (error) {
      failExit(error instanceof Error ? error.message : String(error), '给一个一次性隔离目录')
    }
    logLine(`安装本包进隔离 profile（${parsed.profile}）…`)
    const install = installPlugin({ dshBin: parsed.dshBin, dshHome: isolationMeta.dshHome, profile: parsed.profile, repo: REPO })
    if (!install.ok) {
      // 安装输出是排障证据：先落 artifacts 根，再给指向该文件的失败信息。
      const installOutput = path.join(artifactsDir, 'plugin-add-output.txt')
      fs.mkdirSync(artifactsDir, { recursive: true })
      fs.writeFileSync(installOutput, `${redactOutputTail(install.output)}\n`, 'utf8')
      failExit(install.reason, `${install.hint}；完整输出：${installOutput}`)
    }
    logLine('安装完成，启动 dsh web …')
    try {
      dshSession = await launchDshWeb({
        dshBin: parsed.dshBin,
        dshHome: isolationMeta.dshHome,
        profile: parsed.profile,
        port: parsed.port,
        extraArgs: parsed.dshArgs,
        timeoutMs: parsed.timeoutMs,
        onLine: (line) => logLine(`dsh: ${redactOutputTail(line)}`),
      })
    } catch (error) {
      failExit(redactOutputTail(error instanceof Error ? error.message : String(error)), '先单独跑 node scripts/verify/doctor.mjs --dsh-bin ... --dsh-home ... 定位启动失败')
    }
    logLine(`dsh web 就绪 pid=${dshSession.pid} url=${redactToken(dshSession.url)}`)
  }

  const targetUrl = parsed.mode === 'url' ? parsed.url : dshSession.url

  // ── 3. doctor（lib 新鲜度 + URL 活性；装配与控制台在页面连上后检查）──────
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'))
  const fresh = checkLibFresh(REPO)
  if (!fresh.ok) {
    failExit('lib 产物落后于源码（doctor lib-fresh 未过）', fresh.hint)
  }
  const liveness = await checkUrlLiveness(targetUrl)
  if (!liveness.ok) {
    failExit(`测试 URL 不可达：${liveness.detail}`, '确认实例已启动且 URL 含 token；或改用 --dsh-bin/--dsh-home 自启形态')
  }

  // ── 4. 打开页面 + 装配检查（硬门：不绿不进场景）──────────────────────────
  let session
  try {
    const playwright = await import('playwright')
    session = await openVerifyPage(playwright, { url: targetUrl, headless: parsed.headless })
  } catch (error) {
    failExit(`浏览器启动失败：${error instanceof Error ? error.message : String(error)}`, '确认 playwright 已安装（pnpm install）；runner 只用全新临时上下文，不读用户浏览器 profile')
  }
  verifySession = session
  await bootInto(session.page)

  const assembly = await checkPageAssembly(session.page, pkg.version)
  for (const check of assembly.checks) {
    logLine(`doctor ${check.ok ? 'PASS' : 'FAIL'} ${check.name} — ${check.detail}`)
  }
  const consoleCheck = checkConsoleClean(session.recorder)
  logLine(`doctor ${consoleCheck.ok ? 'PASS' : 'FAIL'} ${consoleCheck.name} — ${consoleCheck.detail}`)
  const doctorFailures = [...assembly.checks.filter((c) => !c.ok)]
  if (!consoleCheck.ok) doctorFailures.push(consoleCheck)
  if (doctorFailures.length > 0) {
    failExit(
      `doctor 未全绿，不进入场景：${doctorFailures.map((c) => `${c.name} — ${c.detail}`).join(' | ')}`,
      '按 FAIL 项恢复（常见：重新 pnpm build 后重跑；Slot 崩溃看 console.txt）',
    )
  }

  // ── 5. 逐场景串行 ────────────────────────────────────────────────────────
  for (const scenarioRef of parsed.scenarios) {
    const scenarioPath = scenarioRef.endsWith('.mjs')
      ? path.resolve(scenarioRef)
      : path.join(SCENARIO_DIR, `${scenarioRef}.mjs`)
    let mod
    try {
      mod = await import(pathToFileURL(scenarioPath).href)
    } catch (error) {
      failExit(`场景加载失败 ${scenarioRef}：${error instanceof Error ? error.message : String(error)}`, '确认场景文件存在且可导入')
    }
    const meta = mod.meta ?? {}
    const scenarioId = String(meta.id ?? path.basename(scenarioRef, '.mjs'))
    const ev = createEvidence({
      runDir: path.join(runDir, scenarioId),
      scenario: scenarioId,
      repo: REPO,
      runId: parsed.runId,
      meta: { ...isolationMeta, headless: parsed.headless, strict: parsed.strict, dshVersion: assembly.brand.shellInfo?.dshVersion ?? 'unknown' },
    })
    logLine(`场景 ${scenarioId} 开始（${meta.title ?? ''}）`)
    const t0 = Date.now()
    try {
      await mod.run({
        page: session.page,
        recorder: session.recorder,
        ev,
        log: logLine,
        url: targetUrl,
        mode: parsed.mode,
        dsh: parsed.mode === 'dsh'
          ? { dshBin: parsed.dshBin, dshHome: isolationMeta.dshHome, profile: parsed.profile }
          : null,
        repo: REPO,
        packageVersion: pkg.version,
        meta,
      })
    } catch (error) {
      ev.step({ step: 'scenario.run', exitCode: 1, stats: { error: error instanceof Error ? error.message : String(error) } })
      ev.assert('场景执行未抛错', false, {
        expected: 'run() 正常返回',
        actual: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      })
    }
    const { payload } = ev.judge()
    ev.report({ title: `verify-taiji-yang · ${scenarioId}` })
    results.push({
      scenario: scenarioId,
      verdict: payload.verdict,
      blockers: payload.blockers,
      deviations: payload.deviations,
      notProvable: payload.notProvable,
    })
    aggregateSummary.push(...ev.steps)
    mirrorToArtifactsRoot(artifactsDir, { verdict: payload, summaryLines: ev.steps })
    logLine(`场景 ${scenarioId} = ${payload.verdict}（${Date.now() - t0}ms；断言 ${ev.assertionTotal - ev.assertionFailed}/${ev.assertionTotal}）`)

    // 参数层已强制 lifecycle 最后；这里是防御性中止，防止自定义路径误排序后继续驱动已卸载页。
    if (scenarioId === 'lifecycle' && results.length < parsed.scenarios.length) {
      logLine('lifecycle 已卸载本包：中止剩余场景（卸载类场景必须排在最后）')
      break
    }
  }

  // ── 6. 聚合 verdict + 退出码 ─────────────────────────────────────────────
  verifySession = null
  await session.close()
  await cleanup()
  aggregate = writeAggregateVerdict(artifactsDir, {
    results,
    scenarioList: parsed.scenarios,
    runId: parsed.runId,
    repo: REPO,
    meta: { dshVersion: assembly.brand.shellInfo?.dshVersion ?? 'unknown' },
    summaryLines: aggregateSummary,
  })
} catch (error) {
  // 提前失败也重写根镜像为 fail：D3 引擎只读根，不能让上一个场景的 pass 残留误导判定。
  try {
    writeAggregateVerdict(artifactsDir, {
      results,
      scenarioList: parsed.scenarios,
      runId: parsed.runId,
      repo: REPO,
      summaryLines: aggregateSummary,
    })
  } catch {
    // 取证盘不可写时保留原始错误；不再遮蔽第一失败原因。
  }
  if (error instanceof RunExit) {
    process.exitCode = error.code
  } else {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      reason: redactOutputTail(error instanceof Error ? error.message : String(error)),
      hint: '查看上方日志定位；自启实例与浏览器已由统一清理边界收尾',
    })}\n`)
    process.exitCode = 2
  }
} finally {
  await cleanup()
}

if (aggregate === null) {
  // cleanup 后到此仍无聚合结果 = 提前退出路径；退出码已由 catch 设置。
  process.exit(process.exitCode === 0 ? 2 : process.exitCode)
}
const code = exitCodeFor(aggregate.verdict, parsed.strict)
if (asJson) {
  process.stdout.write(`${JSON.stringify({ ok: aggregate.verdict !== 'fail', verdict: aggregate.verdict, exitCode: code, scenarios: aggregate.meta.scenarios, artifactsDir })}\n`)
} else {
  logLine(`聚合 verdict = ${aggregate.verdict}（exit ${code}；证据在 ${artifactsDir}）`)
}
process.exitCode = code
