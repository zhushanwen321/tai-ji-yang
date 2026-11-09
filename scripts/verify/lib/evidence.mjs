/**
 * 取证原语：summary.jsonl（每步一行）/ assertions.jsonl / 截图 / 文本附件 / report.md /
 * verdict.json（+ artifactsDir 根镜像）。
 *
 * 机读字段对齐 dev-flow D3 wrapper 的消费契约（与 taiji 侧 verify-taiji runner 同构）：
 *  - verdict.json 顶层 = verdict / test_evidence / deviations / blockers / notProvable / meta；
 *  - meta 必带 headCommit / host / scenario / runId（任务契约要求）；
 *  - summary.jsonl 每行 = { step, command, exitCode, stats?, channel?, at }；
 *  - verdict 三态：pass | fail | degraded（fail exit 1；degraded 缺省 0、--strict 时 2）。
 *
 * 证据目录不入库（.gitignore 的 test-results/ 与技能数据目录承接）；绝不落隔离 DSH_HOME
 * （清理阶段会整树删除）。
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** 文件名净化：只留安全字符，超长截断。 */
function safeName(name) {
  return String(name)
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

/** 读 HEAD commit；非 git 环境（或 git 失败）回落 'unknown'，不阻塞取证。 */
function resolveHeadCommit(repo) {
  try {
    return execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return 'unknown'
  }
}

/**
 * 建一个场景级取证器。调用方在场景结束时调 writeVerdict，主 runner 负责把 verdict 与
 * summary 镜像到 artifactsDir 根（D3 引擎事实依据只读根）。
 * @param {object} input
 * @param {string} input.runDir - 该场景的证据目录（证据必须落在这里，不落实例目录）。
 * @param {string} input.scenario - 场景 id。
 * @param {string} input.repo - 仓根（headCommit 取 git rev-parse 的基准）。
 * @param {string} input.runId
 * @param {Record<string, unknown>} [input.meta] - 附加 meta（如 dshHome 是否隔离）。
 */
export function createEvidence({ runDir, scenario, repo, runId, meta = {} }) {
  if (!runDir) throw new Error('createEvidence 需要 runDir')
  const dir = path.resolve(runDir)
  fs.mkdirSync(dir, { recursive: true })

  const summaryFile = path.join(dir, 'summary.jsonl')
  const assertionsFile = path.join(dir, 'assertions.jsonl')
  const steps = []
  const assertions = []
  const degradations = []
  const notProvableItems = []
  let failedAssertions = 0

  const appendJsonl = (file, obj) => {
    fs.appendFileSync(file, `${JSON.stringify(obj)}\n`, 'utf8')
  }

  return {
    runDir: dir,
    scenario,

    get assertionTotal() {
      return assertions.length
    },
    get assertionFailed() {
      return failedAssertions
    },
    get steps() {
      return steps
    },
    get degradations() {
      return degradations
    },

    /** 追加一行步骤（summary.jsonl 每步一行；command 缺省回落 step 名）。 */
    step({ step, command, exitCode = 0, stats, channel } = {}) {
      const line = {
        step,
        command: command ?? step,
        exitCode,
        ...(stats !== undefined ? { stats } : {}),
        ...(channel !== undefined ? { channel } : {}),
        at: new Date().toISOString(),
      }
      appendJsonl(summaryFile, line)
      steps.push(line)
      return line
    },

    /**
     * 记一条断言。failed 时调用方判定场景 fail；显式降级（前置缺失但有恢复动作）走
     * degrade()，不算断言失败。
     */
    assert(name, passed, { expected, actual, channel } = {}) {
      const record = {
        name,
        ok: Boolean(passed),
        ...(channel !== undefined ? { channel } : {}),
        ...(expected !== undefined ? { expected } : {}),
        ...(actual !== undefined ? { actual } : {}),
        at: new Date().toISOString(),
      }
      appendJsonl(assertionsFile, record)
      assertions.push(record)
      if (!record.ok) failedAssertions += 1
      return record.ok
    },

    /**
     * 显式降级登记：前置缺失 / 通道不可达，给恢复动作。有降级时 verdict 至多 degraded，
     * 不许假 pass（任务契约：场景缺前置必须 degraded/failed 并给恢复动作）。
     */
    degrade(reason, recovery) {
      const record = { reason, recovery, at: new Date().toISOString() }
      degradations.push(record)
      appendJsonl(summaryFile, { step: 'degraded', command: reason, exitCode: 0, stats: { recovery }, at: record.at })
      return record
    },

    /**
     * 不可证明项登记：本 runner 的通道无法证明的断言（含原因）。进 verdict 的
     * notProvable 清单；有该项时 verdict 至多 degraded。
     */
    notProvable(reason) {
      const record = { reason, at: new Date().toISOString() }
      notProvableItems.push(record)
      appendJsonl(summaryFile, { step: 'not-provable', command: reason, exitCode: 0, at: record.at })
      return record
    },

    /** 截图落 <runDir>/<name>.png。 */
    async shot(page, name, options = {}) {
      const file = path.join(dir, `${safeName(name)}.png`)
      if (options.clip) await page.screenshot({ path: file, clip: options.clip })
      else await page.screenshot({ path: file })
      return file
    },

    /** 文本附件（DOM 探针输出 / 控制台行 / 命令输出）。 */
    attach(name, content) {
      const base = safeName(name)
      const file = path.join(dir, base.includes('.') ? base : `${base}.txt`)
      fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2), 'utf8')
      return file
    },

    /**
     * 判定并写 verdict.json。判定基准：断言失败 = fail；无失败但有降级或不可证明项 =
     * degraded；否则 pass。调用方传 verdict 可强制覆盖（如聚合层判定）。
     */
    judge(overrides = {}) {
      let verdict
      if (failedAssertions > 0) verdict = 'fail'
      else if (degradations.length > 0 || notProvableItems.length > 0) verdict = 'degraded'
      else verdict = 'pass'
      // 机读 verdict 自带失败事实与恢复动作，聚合层不再只有状态词。
      const derivedBlockers = assertions
        .filter((a) => !a.ok)
        .map((a) => `${a.name}；actual=${a.actual === undefined ? '(缺席)' : String(a.actual)}`)
      const derivedDeviations = degradations.map((d) => `${d.reason}；恢复：${d.recovery}`)
      return this.writeVerdict({
        verdict,
        blockers: overrides.blockers ?? derivedBlockers,
        deviations: overrides.deviations ?? derivedDeviations,
        ...overrides,
      })
    },

    /**
     * 写 verdict.json（三态；顶层字段冻结，与 D3 wrapper 对齐）。
     * @param {object} input
     * @param {'pass' | 'fail' | 'degraded'} input.verdict
     * @param {string[]} [input.blockers] - 阻塞项（失败原因摘要 + 恢复动作）。
     * @param {string[]} [input.deviations] - 与期望的偏离（仍在设计内）。
     * @param {string[]} [input.notProvable] - 本 runner 无法证明的项（含原因）。
     */
    writeVerdict({ verdict, blockers = [], deviations = [], notProvable }) {
      if (!['pass', 'fail', 'degraded'].includes(verdict)) {
        throw new Error(`verdict 取值必须是 pass|fail|degraded，收到 ${String(verdict)}`)
      }
      const notProvableList = notProvable ?? notProvableItems.map((n) => n.reason)
      const payload = {
        verdict,
        test_evidence: [
          `runDir=${dir}`,
          `scenario=${scenario}`,
          `assertions=${assertions.length}(failed=${failedAssertions})`,
          `steps=${steps.length}`,
          `degradations=${degradations.length}`,
          `summary=${path.join(dir, 'summary.jsonl')}`,
        ].join(' ; '),
        deviations,
        blockers,
        notProvable: notProvableList,
        meta: {
          scenario,
          runId,
          headCommit: resolveHeadCommit(repo),
          host: os.hostname(),
          generatedAt: new Date().toISOString(),
          assertions: { total: assertions.length, failed: failedAssertions },
          degraded: degradations.map((d) => d.reason),
          ...meta,
        },
      }
      const file = path.join(dir, 'verdict.json')
      fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
      return { file, payload }
    },

    /** 人读报告（期望 vs 实际 + 降级与恢复动作）。 */
    report({ title, summary } = {}) {
      const lines = []
      lines.push(`# ${title ?? `verify-taiji-yang · ${scenario}`}`)
      lines.push('')
      lines.push(`- 生成时间：${new Date().toISOString()}`)
      lines.push(`- 场景：${scenario}`)
      lines.push(`- 证据目录：\`${dir}\``)
      if (summary) lines.push(`- 摘要：${summary}`)
      lines.push('')
      lines.push('## 断言（期望 vs 实际）')
      lines.push('')
      if (assertions.length === 0) lines.push('（无断言记录）')
      else {
        lines.push('| 结果 | 断言 | 期望 | 实际 |')
        lines.push('|------|------|------|------|')
        for (const a of assertions) {
          const cell = (v) => (v === undefined ? '' : String(typeof v === 'string' ? v : JSON.stringify(v)).replace(/\|/g, '\\|').slice(0, 300))
          lines.push(`| ${a.ok ? 'PASS' : 'FAIL'} | ${a.name} | ${cell(a.expected)} | ${cell(a.actual)} |`)
        }
      }
      lines.push('')
      lines.push('## 降级与恢复动作')
      lines.push('')
      if (degradations.length === 0) lines.push('（无）')
      else for (const d of degradations) lines.push(`- ${d.reason}；恢复：${d.recovery}`)
      lines.push('')
      lines.push('## 附件')
      lines.push('')
      for (const f of fs.readdirSync(dir).sort()) {
        const st = fs.statSync(path.join(dir, f))
        if (st.isFile() && f !== 'report.md') lines.push(`- \`${f}\`（${st.size} B）`)
      }
      lines.push('')
      const file = path.join(dir, 'report.md')
      fs.writeFileSync(file, lines.join('\n'), 'utf8')
      return file
    },
  }
}

/**
 * 把场景 verdict 与 summary 镜像到 artifactsDir 根（D3 契约：引擎事实依据只读根）。
 * 多场景串行跑时逐场景覆盖写根镜像——根上的 verdict.json 始终是最近一次场景的结果；
 * 聚合 verdict 由 runner 在全部场景结束后用 writeAggregateVerdict 重写为最终结果。
 * @param {string} artifactsDir
 * @param {{ verdict: object, summaryLines: object[] }} input
 */
export function mirrorToArtifactsRoot(artifactsDir, { verdict, summaryLines }) {
  fs.mkdirSync(artifactsDir, { recursive: true })
  const verdictFile = path.join(artifactsDir, 'verdict.json')
  fs.writeFileSync(verdictFile, `${JSON.stringify(verdict, null, 2)}\n`, 'utf8')
  fs.writeFileSync(path.join(artifactsDir, 'summary.jsonl'), summaryLines.map((line) => JSON.stringify(line)).join('\n') + '\n', 'utf8')
  return verdictFile
}

/**
 * 写聚合 verdict 到 artifactsDir 根：任一 fail = fail；无 fail 有 degraded = degraded；
 * 否则 pass。scenarioList 记进 meta 供 D3 wrapper 与人读核对。
 * @param {string} artifactsDir
 * @param {object} input
 * @param {{ scenario: string, verdict: string, deviations?: string[], blockers?: string[], notProvable?: string[] }[]} input.results
 * @param {string[]} input.scenarioList
 * @param {string} input.runId
 * @param {string} input.repo
 * @param {Record<string, unknown>} [input.meta]
 * @param {Record<string, unknown>[]} [input.summaryLines] - 全部场景步骤，聚合镜像保留完整步骤证据。
 * @returns {object} 聚合 verdict payload（调用方按 exitCodeFor 取退出码）。
 */
export function writeAggregateVerdict(artifactsDir, { results, scenarioList, runId, repo, meta = {}, summaryLines = [] }) {
  if (results.length === 0) {
    // 零执行结果不能伪装成 pass；空清单或全部场景被中止时必须显式失败。
    const payload = {
      verdict: 'fail',
      test_evidence: `artifactsDir=${artifactsDir} ; scenarios=${scenarioList.join(',')} ; executed=0`,
      deviations: [],
      blockers: ['没有任何场景产出断言（空清单或执行被中止）'],
      notProvable: [],
      meta: {
        scenario: scenarioList.join(','),
        scenarios: [],
        runId,
        headCommit: resolveHeadCommit(repo),
        host: os.hostname(),
        generatedAt: new Date().toISOString(),
        ...meta,
      },
    }
    mirrorToArtifactsRoot(artifactsDir, { verdict: payload, summaryLines })
    return payload
  }
  const failed = results.filter((r) => r.verdict === 'fail')
  const degraded = results.filter((r) => r.verdict === 'degraded')
  const verdict = failed.length > 0 ? 'fail' : degraded.length > 0 ? 'degraded' : 'pass'
  const payload = {
    verdict,
    test_evidence: `artifactsDir=${artifactsDir} ; scenarios=${scenarioList.join(',')} ; failed=${failed.length} ; degraded=${degraded.length}`,
    deviations: degraded.flatMap((r) => (r.deviations ?? []).map((d) => `${r.scenario}: ${d}`)),
    blockers: failed.flatMap((r) => (r.blockers ?? []).map((b) => `${r.scenario}: ${b}`)),
    notProvable: degraded.flatMap((r) => (r.notProvable ?? []).map((n) => `${r.scenario}: ${n}`)),
    meta: {
      scenario: scenarioList.join(','),
      scenarios: results.map((r) => ({ id: r.scenario, verdict: r.verdict })),
      runId,
      headCommit: resolveHeadCommit(repo),
      host: os.hostname(),
      generatedAt: new Date().toISOString(),
      ...meta,
    },
  }
  mirrorToArtifactsRoot(artifactsDir, { verdict: payload, summaryLines })
  return payload
}

/** D3 契约退出码：fail=1；degraded 缺省 0、--strict 时 2；pass=0。 */
export function exitCodeFor(verdict, strict) {
  if (verdict === 'fail') return 1
  if (verdict === 'degraded') return strict ? 2 : 0
  return 0
}
