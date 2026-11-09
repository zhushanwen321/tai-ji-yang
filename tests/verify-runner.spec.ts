import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * verify-taiji-yang 验收 runner 的合成测试（不启动真实 DSH、不发模型请求）：
 *
 *  1. 参数安全 —— 模式互斥、~/.dsh 拒绝、路径穿越拒绝、非回环 URL 拒绝、执行形态解析
 *  2. 证据契约 —— summary.jsonl 每步一行、verdict 三态与判定基准、artifactsDir 根镜像、
 *     D3 退出码映射（fail=1 / degraded=0（--strict 2）/ pass=0）
 *  3. 失败支 —— 断言失败判 fail；场景抛错落断言；runner CLI 参数错误 exit 2 + JSON
 *  4. 硬编码扫描 —— scripts/verify 源码无跨仓路径、无本机绝对路径、无具体 token、URL 无具体端口
 *  5. 进程清理 —— 合成假 dsh bin（本地 http fixture）：URL 行解析、探活就绪、stop 后进程退出；
 *     URL 行缺席时超时失败且不留孤儿进程
 *
 * 合成 fixture 全部落临时目录，测试结束清理。
 */

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const VERIFY_DIR = path.join(REPO, 'scripts', 'verify')

// runner 产物无类型声明（.mjs）；测试侧用最小结构类型承接，未知收 unknown
interface ArgsModule {
  parseVerifyArgs(argv: string[], homedir: string): unknown
  safeTokenOrReason(value: string, label: string): string | null
  isLoopbackUrl(url: string): boolean
  dshSpawnCommand(dshBin: string): string[]
  parseDshUrlLine(line: string): { url: string, token: string } | null
  redactToken(url: string): string
  resolveArtifactsLayout(input: { artifactsDir?: string, runId: string, homedir: string }): { artifactsDir: string, runDir: string }
  KNOWN_SCENARIO_IDS: string[]
}
interface EvidenceModule {
  createEvidence(input: Record<string, unknown>): {
    step(input: Record<string, unknown>): Record<string, unknown>
    assert(name: string, passed: boolean, opts?: Record<string, unknown>): boolean
    degrade(reason: string, recovery: string): unknown
    notProvable(reason: string): unknown
    judge(overrides?: Record<string, unknown>): { file: string, payload: VerdictPayload }
    writeVerdict(input: Record<string, unknown>): { file: string, payload: VerdictPayload }
    report(input?: Record<string, unknown>): string
    attach(name: string, content: string): string
    assertionTotal: number
    assertionFailed: number
  }
  mirrorToArtifactsRoot(dir: string, input: { verdict: VerdictPayload, summaryLines: Record<string, unknown>[] }): string
  writeAggregateVerdict(dir: string, input: { results: { scenario: string, verdict: string, blockers?: string[], deviations?: string[], notProvable?: string[] }[], scenarioList: string[], runId: string, repo: string, meta?: Record<string, unknown>, summaryLines?: Record<string, unknown>[] }): VerdictPayload
  exitCodeFor(verdict: string, strict: boolean): number
  resolveHeadCommit(repo: string): string
}
interface DshModule {
  launchDshWeb(input: { dshBin: string, dshHome: string, profile: string, port?: number, timeoutMs?: number, extraArgs?: string[] }): Promise<{
    url: string, token: string, pid: number, stop(): Promise<void>
  }>
  probeUrl(url: string, timeoutMs?: number): Promise<{ ok: boolean, status?: number, reason?: string }>
  killProcessTree(pid: number, opts?: { graceMs?: number }): Promise<void>
  installPlugin(input: Record<string, unknown>): { ok: boolean, reason?: string, hint?: string }
  assertIsolatedHome(dshHome: string, homedir: string): string
  redactOutputTail(output: string): string
  commandExists(dshBin: string | undefined, pathEnv?: string): boolean
}
interface FreshnessModule {
  checkLibFresh(repo: string): { ok: boolean, checks: { name: string, ok: boolean, detail: string }[], hint?: string }
}

const verdictPayload = (raw: unknown): VerdictPayload => raw as VerdictPayload
interface VerdictPayload {
  verdict: 'pass' | 'fail' | 'degraded'
  test_evidence: string
  deviations: string[]
  blockers: string[]
  notProvable: string[]
  meta: Record<string, unknown>
}

const loadArgs = async (): Promise<ArgsModule> => (await import('../scripts/verify/lib/args.mjs')) as unknown as ArgsModule
const loadEvidence = async (): Promise<EvidenceModule> => (await import('../scripts/verify/lib/evidence.mjs')) as unknown as EvidenceModule
const loadDsh = async (): Promise<DshModule> => (await import('../scripts/verify/lib/dsh-process.mjs')) as unknown as DshModule
const loadFreshness = async (): Promise<FreshnessModule> => (await import('../scripts/verify/lib/freshness.mjs')) as unknown as FreshnessModule

let tmpRoot = ''
const tmpPath = (name: string): string => path.join(tmpRoot, name)

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-runner-spec-'))
})

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

// ── 1. 参数安全 ────────────────────────────────────────────────────────────

describe('args 参数安全', () => {
  it('缺执行形态拒绝并给可行动 hint', async () => {
    const args = await loadArgs()
    const result = args.parseVerifyArgs([], os.homedir()) as { ok: false, reason: string, hint: string }
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('--url')
    expect(result.hint).toContain('--dsh-home')
  })

  it('自启模式缺 --dsh-home 拒绝（不回落 ~/.dsh）', async () => {
    const args = await loadArgs()
    const result = args.parseVerifyArgs(['--dsh-bin', 'dsh'], os.homedir()) as { ok: false, reason: string }
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('--dsh-home')
  })

  it('--dsh-home 指向用户真实 DSH 目录或其子路径拒绝', async () => {
    const args = await loadArgs()
    for (const form of [`${os.homedir()}/.dsh`, '~/.dsh', `${os.homedir()}/.dsh/profiles/web`, '~/.dsh/profiles/web']) {
      const result = args.parseVerifyArgs(['--dsh-bin', 'dsh', '--dsh-home', form], os.homedir()) as { ok: false, reason: string }
      expect(result.ok).toBe(false)
      expect(result.reason).toContain('.dsh')
    }
  })

  it('--dsh-home 是家目录或根拒绝', async () => {
    const args = await loadArgs()
    for (const form of [os.homedir(), '/', '~']) {
      const result = args.parseVerifyArgs(['--dsh-bin', 'dsh', '--dsh-home', form], os.homedir()) as { ok: false }
      expect(result.ok).toBe(false)
    }
  })

  it('--url 与 --dsh-bin 互斥', async () => {
    const args = await loadArgs()
    const result = args.parseVerifyArgs(
      ['--url', 'http://127.0.0.1:3000/?token=x', '--dsh-bin', 'dsh', '--dsh-home', tmpRoot],
      os.homedir(),
    ) as { ok: false, reason: string }
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('互斥')
  })

  it('--url 非回环地址拒绝（token 只绑本机）', async () => {
    const args = await loadArgs()
    expect(args.isLoopbackUrl('http://127.0.0.1:3000/?token=x')).toBe(true)
    expect(args.isLoopbackUrl('http://localhost:3000/')).toBe(true)
    expect(args.isLoopbackUrl('http://example.com/?token=x')).toBe(false)
    expect(args.isLoopbackUrl('ftp://127.0.0.1/')).toBe(false)
    expect(args.isLoopbackUrl('not-a-url')).toBe(false)
    const result = args.parseVerifyArgs(['--url', 'http://example.com/?token=x'], os.homedir()) as { ok: false, reason: string }
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('回环')
  })

  it('run-id / profile 路径穿越拒绝', async () => {
    const args = await loadArgs()
    for (const bad of ['../escape', 'a/b', 'a\\b', '..', '.hidden-start']) {
      expect(args.safeTokenOrReason(bad, '--run-id')).not.toBeNull()
    }
    expect(args.safeTokenOrReason('run-20261108.1', '--run-id')).toBeNull()
    const parsed = args.parseVerifyArgs(['--url', 'http://127.0.0.1:3000/?token=x', '--run-id', '../escape'], os.homedir()) as { ok: false, reason: string }
    expect(parsed.ok).toBe(false)
  })

  it('--url 形态解析完整（缺省 profile=web、scenarios=all）', async () => {
    const args = await loadArgs()
    const parsed = args.parseVerifyArgs(['--url', 'http://127.0.0.1:3000/?token=x'], os.homedir()) as {
      ok: true, mode: string, url: string, profile: string, scenarios: string[], strict: boolean, timeoutMs: number
    }
    expect(parsed.ok).toBe(true)
    expect(parsed.mode).toBe('url')
    expect(parsed.profile).toBe('web')
    expect(parsed.scenarios).toEqual(args.KNOWN_SCENARIO_IDS)
    expect(parsed.strict).toBe(false)
    expect(parsed.timeoutMs).toBeGreaterThan(0)
  })

  it('未知场景名拒绝；--artifacts-dir 家目录拒绝', async () => {
    const args = await loadArgs()
    const unknown = args.parseVerifyArgs(['--url', 'http://127.0.0.1:3000/?token=x', '--scenarios', 'brand,nope'], os.homedir()) as { ok: false, reason: string }
    expect(unknown.ok).toBe(false)
    expect(unknown.reason).toContain('nope')
    const homeDir = args.parseVerifyArgs(['--url', 'http://127.0.0.1:3000/?token=x', '--artifacts-dir', os.homedir()], os.homedir()) as { ok: false }
    expect(homeDir.ok).toBe(false)
  })

  it('.js 形态 dsh bin 用当前 node 执行', async () => {
    const args = await loadArgs()
    expect(args.dshSpawnCommand('/tmp/dsh-entry.mjs')).toEqual([process.execPath, '/tmp/dsh-entry.mjs'])
    expect(args.dshSpawnCommand('/tmp/dsh-entry.cjs')).toEqual([process.execPath, '/tmp/dsh-entry.cjs'])
    const bin = args.dshSpawnCommand('/usr/local/bin/dsh') as string[]
    expect(bin).toEqual(['/usr/local/bin/dsh'])
  })

  it('证据目录布局：默认根不含 runId，runDir 恰一层 runId（不双重拼接）', async () => {
    const args = await loadArgs()
    const home = '/home/tester'
    const byDefault = args.resolveArtifactsLayout({ artifactsDir: undefined, runId: 'run-1', homedir: home })
    expect(byDefault.artifactsDir).toBe(`${home}/.agents/skill-data/verify-taiji-yang`)
    expect(byDefault.artifactsDir.includes('run-1')).toBe(false)
    expect(byDefault.runDir).toBe(`${home}/.agents/skill-data/verify-taiji-yang/run-1`)
    const explicit = args.resolveArtifactsLayout({ artifactsDir: '/tmp/acc', runId: 'run-2', homedir: home })
    expect(explicit.artifactsDir).toBe('/tmp/acc')
    expect(explicit.runDir).toBe('/tmp/acc/run-2')
    // runId 只出现一层：默认布局下 runDir 相对 artifactsDir 的增量恰为 runId
    expect(explicit.runDir.slice(explicit.artifactsDir.length + 1)).toBe('run-2')
  })

  it('stdout URL 行解析 + token 脱敏', async () => {
    const args = await loadArgs()
    const hit = args.parseDshUrlLine('dsh web: http://127.0.0.1:4321/?token=abcDEF123-456_789')
    expect(hit).not.toBeNull()
    expect(hit?.token).toBe('abcDEF123-456_789')
    expect(args.parseDshUrlLine('listening on 4321')).toBeNull()
    expect(args.parseDshUrlLine('dsh web: not-a-url')).toBeNull()
    const redacted = args.redactToken('http://127.0.0.1:4321/?token=abcDEF123-456_789')
    expect(redacted).toContain('REDACTED')
    expect(redacted).not.toContain('abcDEF123')
  })

  it('URL 行允许宿主附加括注（如 LAN 提示），仍取首个 URL', async () => {
    const args = await loadArgs()
    const hit = args.parseDshUrlLine('dsh web: http://127.0.0.1:4322/?token=lan-token-123 (LAN: http://192.168.1.8:4322/?token=lan-token-123)')
    expect(hit).not.toBeNull()
    expect(hit?.url).toBe('http://127.0.0.1:4322/?token=lan-token-123')
    expect(hit?.token).toBe('lan-token-123')
  })

  it('空场景清单拒绝；lifecycle 必须最后；证据目录不得落隔离 home 内', async () => {
    const args = await loadArgs()
    const empty = args.parseVerifyArgs(['--url', 'http://127.0.0.1:3000/?token=x', '--scenarios', ' , '], os.homedir()) as { ok: false, reason: string }
    expect(empty.ok).toBe(false)
    expect(empty.reason).toContain('清单为空')
    const order = args.parseVerifyArgs(
      ['--url', 'http://127.0.0.1:3000/?token=x', '--scenarios', 'lifecycle,brand'],
      os.homedir(),
    ) as { ok: false, reason: string }
    expect(order.ok).toBe(false)
    expect(order.reason).toContain('lifecycle')
    const inside = args.parseVerifyArgs(
      ['--dsh-bin', 'dsh', '--dsh-home', '/tmp/isolated-home', '--artifacts-dir', '/tmp/isolated-home/evidence'],
      os.homedir(),
    ) as { ok: false, reason: string }
    expect(inside.ok).toBe(false)
    expect(inside.reason).toContain('证据')
    const insideDefaultRoot = args.parseVerifyArgs(
      ['--dsh-bin', 'dsh', '--dsh-home', `${os.homedir()}/.agents/skill-data/verify-taiji-yang`],
      os.homedir(),
    ) as { ok: false, reason: string }
    expect(insideDefaultRoot.ok).toBe(false)
    expect(insideDefaultRoot.reason).toContain('证据')
    const outside = args.parseVerifyArgs(
      ['--dsh-bin', 'dsh', '--dsh-home', '/tmp/isolated-home', '--artifacts-dir', '/tmp/taiji-yang-verify'],
      os.homedir(),
    ) as { ok: true }
    expect(outside.ok).toBe(true)
    const positional = args.parseVerifyArgs(
      ['--url', 'http://127.0.0.1:3000/?token=x', 'brand', 'head'],
      os.homedir(),
    ) as { ok: true, scenarios: string[] }
    expect(positional.ok).toBe(true)
    expect(positional.scenarios).toEqual(['brand', 'head'])
  })
})

// ── 2+3. 证据契约与失败支 ─────────────────────────────────────────────────

describe('evidence 证据契约', () => {
  it('summary.jsonl 每步一行且字段齐全；断言失败计数', async () => {
    const evidence = await loadEvidence()
    const runDir = path.join(tmpRoot, 'ev-basic')
    const ev = evidence.createEvidence({ runDir, scenario: 'brand', repo: tmpRoot, runId: 'r1' })
    ev.step({ step: 'a.collect', stats: { n: 1 }, channel: 'B' })
    ev.step({ step: 'a.assert' })
    expect(ev.assert('真断言', true)).toBe(true)
    expect(ev.assert('假断言', false, { expected: 'x', actual: 'y' })).toBe(false)
    expect(ev.assertionTotal).toBe(2)
    expect(ev.assertionFailed).toBe(1)
    const lines = fs.readFileSync(path.join(runDir, 'summary.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>)
    expect(lines).toHaveLength(2)
    for (const line of lines) {
      expect(line.step).toBeDefined()
      expect(line.command).toBeDefined()
      expect(line.exitCode).toBeDefined()
      expect(line.at).toBeDefined()
    }
    const assertionLines = fs.readFileSync(path.join(runDir, 'assertions.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>)
    expect(assertionLines).toHaveLength(2)
    expect(assertionLines[1].ok).toBe(false)
  })

  it('判定基准：断言失败=fail；降级=degraded；干净=pass；notProvable 也降级', async () => {
    const evidence = await loadEvidence()
    const runA = path.join(tmpRoot, 'ev-fail')
    const evA = evidence.createEvidence({ runDir: runA, scenario: 's', repo: tmpRoot, runId: 'r' })
    evA.assert('必过', true)
    evA.assert('必炸', false)
    const failedPayload = evA.judge().payload
    expect(failedPayload.verdict).toBe('fail')
    expect(failedPayload.blockers).toHaveLength(1)
    expect(failedPayload.blockers[0]).toContain('必炸')

    const runB = path.join(tmpRoot, 'ev-degraded')
    const evB = evidence.createEvidence({ runDir: runB, scenario: 's', repo: tmpRoot, runId: 'r' })
    evB.assert('过', true)
    evB.degrade('前置缺失', '恢复动作')
    const degradedPayload = evB.judge().payload
    expect(degradedPayload.verdict).toBe('degraded')
    expect(degradedPayload.deviations[0]).toContain('恢复动作')

    const runC = path.join(tmpRoot, 'ev-pass')
    const evC = evidence.createEvidence({ runDir: runC, scenario: 's', repo: tmpRoot, runId: 'r' })
    evC.assert('过', true)
    expect(evC.judge().payload.verdict).toBe('pass')

    const runD = path.join(tmpRoot, 'ev-notprovable')
    const evD = evidence.createEvidence({ runDir: runD, scenario: 's', repo: tmpRoot, runId: 'r' })
    evD.notProvable('通道缺失')
    expect(evD.judge().payload.verdict).toBe('degraded')
    expect(evD.judge().payload.notProvable).toEqual(['通道缺失'])
  })

  it('verdict meta 带 headCommit / host / scenario / runId（D3 契约）', async () => {
    const evidence = await loadEvidence()
    const runDir = path.join(tmpRoot, 'ev-meta')
    const ev = evidence.createEvidence({ runDir, scenario: 'head', repo: REPO, runId: 'run-x' })
    const { payload } = ev.writeVerdict({ verdict: 'pass' })
    expect(payload.meta.scenario).toBe('head')
    expect(payload.meta.runId).toBe('run-x')
    expect(typeof payload.meta.headCommit).toBe('string')
    expect(payload.meta.headCommit.length).toBeGreaterThan(0)
    expect(typeof payload.meta.host).toBe('string')
  })

  it('镜像落 artifactsDir 根；聚合 verdict 判定与场景标注', async () => {
    const evidence = await loadEvidence()
    const artifactsDir = path.join(tmpRoot, 'agg')
    const ev = evidence.createEvidence({ runDir: path.join(tmpRoot, 'agg-b'), scenario: 'brand', repo: tmpRoot, runId: 'r' })
    ev.assert('过', true)
    const { payload } = ev.judge()
    const mirrored = evidence.mirrorToArtifactsRoot(artifactsDir, { verdict: payload, summaryLines: [] })
    expect(mirrored).toBe(path.join(artifactsDir, 'verdict.json'))
    expect(fs.existsSync(path.join(artifactsDir, 'verdict.json'))).toBe(true)
    expect(fs.existsSync(path.join(artifactsDir, 'summary.jsonl'))).toBe(true)

    const aggregate = evidence.writeAggregateVerdict(artifactsDir, {
      results: [
        { scenario: 'brand', verdict: 'pass' },
        { scenario: 'head', verdict: 'degraded', notProvable: ['x'] },
        { scenario: 'theme', verdict: 'fail', blockers: ['b1'] },
      ],
      scenarioList: ['brand', 'head', 'theme'],
      runId: 'r',
      repo: tmpRoot,
      meta: { dshVersion: '0.test' },
      summaryLines: [{ step: 'brand.collect', command: 'brand.collect', exitCode: 0, at: '2026-01-01T00:00:00.000Z' }],
    })
    expect(aggregate.verdict).toBe('fail')
    expect(aggregate.meta.dshVersion).toBe('0.test')
    expect(aggregate.blockers).toEqual(['theme: b1'])
    const aggregateSummary = fs.readFileSync(path.join(artifactsDir, 'summary.jsonl'), 'utf8').trim().split('\n')
    expect(aggregateSummary).toHaveLength(1)
    expect(JSON.parse(aggregateSummary[0]).step).toBe('brand.collect')
    const onDisk = JSON.parse(fs.readFileSync(path.join(artifactsDir, 'verdict.json'), 'utf8')) as VerdictPayload
    expect(onDisk.verdict).toBe('fail')
    expect(onDisk.meta.scenarios).toEqual([
      { id: 'brand', verdict: 'pass' },
      { id: 'head', verdict: 'degraded' },
      { id: 'theme', verdict: 'fail' },
    ])
  })

  it('D3 退出码映射：fail=1 / degraded=0（strict 2）/ pass=0', async () => {
    const evidence = await loadEvidence()
    expect(evidence.exitCodeFor('fail', false)).toBe(1)
    expect(evidence.exitCodeFor('fail', true)).toBe(1)
    expect(evidence.exitCodeFor('degraded', false)).toBe(0)
    expect(evidence.exitCodeFor('degraded', true)).toBe(2)
    expect(evidence.exitCodeFor('pass', false)).toBe(0)
    expect(evidence.exitCodeFor('pass', true)).toBe(0)
  })
})

// ── lib 产物新鲜度 ─────────────────────────────────────────────────────────

describe('freshness lib 新鲜度', () => {
  function makeFakeRepo(name: string): string {
    const repo = path.join(tmpRoot, name)
    fs.mkdirSync(path.join(repo, 'lib'), { recursive: true })
    fs.mkdirSync(path.join(repo, 'client'), { recursive: true })
    fs.writeFileSync(path.join(repo, 'index.js'), 'export const v = 1\n')
    fs.writeFileSync(path.join(repo, 'client', 'apply.ts'), 'export {}\n')
    // 产物后写（模拟「源码写完 → 构建」的真实时序：产物 mtime 晚于全部源文件）
    fs.writeFileSync(path.join(repo, 'lib', 'index.js'), 'export const v = 1\n')
    fs.writeFileSync(path.join(repo, 'lib', 'client.js'), 'bundle')
    return repo
  }

  it('产物与源码一致时全绿', async () => {
    const freshness = await loadFreshness()
    const repo = makeFakeRepo('fresh-ok')
    const result = freshness.checkLibFresh(repo)
    expect(result.ok).toBe(true)
    expect(result.hint).toBeUndefined()
  })

  it('Node 半场产物漂移 / 产物缺失失败并给恢复动作', async () => {
    const freshness = await loadFreshness()
    const repo = makeFakeRepo('fresh-drift')
    fs.writeFileSync(path.join(repo, 'index.js'), 'export const v = 2\n')
    const drifted = freshness.checkLibFresh(repo)
    expect(drifted.ok).toBe(false)
    expect(drifted.hint).toContain('pnpm build')

    const missing = freshness.checkLibFresh(path.join(tmpRoot, 'fresh-missing'))
    expect(missing.ok).toBe(false)
  })

  it('client 源文件晚于产物（mtime 初筛）失败', async () => {
    const freshness = await loadFreshness()
    const repo = makeFakeRepo('fresh-mtime')
    const future = new Date(Date.now() + 60_000)
    fs.utimesSync(path.join(repo, 'client', 'apply.ts'), future, future)
    const result = freshness.checkLibFresh(repo)
    expect(result.ok).toBe(false)
    const mtimeCheck = result.checks.find((c) => c.name.includes('mtime'))
    expect(mtimeCheck?.ok).toBe(false)
  })
})

// ── 4. 硬编码扫描 ─────────────────────────────────────────────────────────

describe('硬编码扫描（跨仓路径 / token / 端口 / 本机路径）', () => {
  function runnerSources(): { file: string, text: string }[] {
    const files: { file: string, text: string }[] = []
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const child = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(child)
        else if (entry.name.endsWith('.mjs')) files.push({ file: child, text: fs.readFileSync(child, 'utf8') })
      }
    }
    walk(VERIFY_DIR)
    return files
  }

  it('无本机绝对路径与跨仓路径', () => {
    for (const { file, text } of runnerSources()) {
      expect(text.includes('/Users/'), `${file} 含本机绝对路径`).toBe(false)
      expect(text.includes('tai-ji-workspace'), `${file} 含跨仓路径`).toBe(false)
      expect(text.includes('/tmp/taiji-chipfix'), `${file} 引用临时脚本目录`).toBe(false)
    }
  })

  it('无具体 token 值与 URL 内具体端口', () => {
    const CONCRETE_TOKEN = /token=[A-Za-z0-9_-]{12,}/
    const CONCRETE_PORT_URL = /https?:\/\/[^\s'"`)]*:\d{2,}/
    for (const { file, text } of runnerSources()) {
      expect(CONCRETE_TOKEN.test(text), `${file} 疑似硬编码 token`).toBe(false)
      expect(CONCRETE_PORT_URL.test(text), `${file} 疑似硬编码端口 URL`).toBe(false)
    }
  })

  it('清理只按 PID，无 pkill 宽泛匹配', () => {
    for (const { file, text } of runnerSources()) {
      expect(/\bpkill\b/.test(text), `${file} 出现 pkill`).toBe(false)
    }
  })
})

// ── 5. 进程清理（合成假 dsh bin）────────────────────────────────────────────

describe('dsh 进程生命周期（假 dsh bin fixture）', () => {
  /** 假 dsh bin：起本地 http fixture，打印宿主同形态 URL 行后常驻；SIGTERM 优雅退出。 */
  function writeFakeDsh(name: string, mode: 'serve' | 'silent'): string {
    const file = path.join(tmpRoot, name)
    const serve = [
      "import { createServer } from 'node:http'",
      'const server = createServer((_req, res) => {',
      "  res.writeHead(200, { 'content-type': 'text/html' })",
      "  res.end('<html><body><div id=\"root\"></div></body></html>')",
      '})',
      "server.listen(0, '127.0.0.1', () => {",
      '  const address = server.address()',
      "  const port = typeof address === 'object' && address !== null ? address.port : 0",
      "  console.log(`dsh web: http://127.0.0.1:${port}/?token=fake-verify-runner-token`)",
      '})',
      "process.on('SIGTERM', () => process.exit(0))",
      'setInterval(() => {}, 1000)',
    ].join('\n')
    const silent = [
      "process.on('SIGTERM', () => process.exit(0))",
      'console.log("booting but never ready")',
      'setInterval(() => {}, 1000)',
    ].join('\n')
    fs.writeFileSync(file, mode === 'serve' ? serve : silent)
    return file
  }

  it('探活支持 dsh 303 写认证 Cookie 后转同源首页', async () => {
    const { createServer } = await import('node:http')
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.searchParams.get('token') === 'fixture-token') {
        res.writeHead(303, { location: './', 'set-cookie': 'dsh-auth-fixture=accepted; Path=/; HttpOnly' })
        res.end()
        return
      }
      if (req.headers.cookie === 'dsh-auth-fixture=accepted') {
        res.writeHead(200, { 'content-type': 'text/html' })
        res.end('<html><body><div id="root"></div></body></html>')
        return
      }
      res.writeHead(401)
      res.end('authentication required')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = typeof address === 'object' && address !== null ? address.port : 0
    try {
      const dsh = await loadDsh()
      const probe = await dsh.probeUrl(`http://127.0.0.1:${port}/?token=fixture-token`)
      expect(probe).toEqual({ ok: true, status: 200 })
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    }
  })

  it('自启 → stdout 解析 URL/token → 探活就绪 → stop 后进程退出', async () => {
    const dsh = await loadDsh()
    const home = path.join(tmpRoot, 'dsh-home-ok')
    fs.mkdirSync(home, { recursive: true })
    const bin = writeFakeDsh('fake-dsh-serve.mjs', 'serve')
    const session = await dsh.launchDshWeb({ dshBin: bin, dshHome: home, profile: 'web', timeoutMs: 15000 })
    try {
      expect(session.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/\?token=/)
      expect(session.token).toBe('fake-verify-runner-token')
      expect(session.pid).toBeGreaterThan(0)
      const probe = await dsh.probeUrl(session.url)
      expect(probe.ok).toBe(true)
    } finally {
      await session.stop()
    }
    // stop 后进程确死（kill(pid,0) 抛错 = 不存在）
    await new Promise((resolve) => setTimeout(resolve, 300))
    let alive = true
    try {
      process.kill(session.pid, 0)
    } catch {
      alive = false
    }
    expect(alive).toBe(false)
  }, 30000)

  it('URL 行缺席时按预算失败且不留孤儿进程', async () => {
    const dsh = await loadDsh()
    const home = path.join(tmpRoot, 'dsh-home-silent')
    fs.mkdirSync(home, { recursive: true })
    const bin = writeFakeDsh('fake-dsh-silent.mjs', 'silent')
    await expect(dsh.launchDshWeb({ dshBin: bin, dshHome: home, profile: 'web', timeoutMs: 3000 })).rejects.toThrow(/超时|退出/)
    // catch 分支已按 PID 收尾：轮询确认进程表里无该 bin 的存活进程
    await new Promise((resolve) => setTimeout(resolve, 500))
    const listing = spawnSync('ps', ['-eo', 'pid,command'], { encoding: 'utf8' })
    const survivors = (listing.stdout ?? '').split('\n').filter((line) => line.includes(bin) && !line.includes('ps -eo'))
    expect(survivors).toHaveLength(0)
  }, 30000)

  it('killProcessTree 兜底 SIGKILL：对忽略 SIGTERM 的进程也能停', async () => {
    const stubborn = path.join(tmpRoot, 'stubborn.mjs')
    fs.writeFileSync(stubborn, [
      "process.on('SIGTERM', () => { /* 忽略 SIGTERM */ })",
      'setInterval(() => {}, 1000)',
    ].join('\n'))
    const { spawn } = await import('node:child_process')
    const child = spawn(process.execPath, [stubborn], { detached: true, stdio: 'ignore' })
    child.unref()
    const dsh = await loadDsh()
    await dsh.killProcessTree(child.pid, { graceMs: 800 })
    await new Promise((resolve) => setTimeout(resolve, 300))
    let alive = true
    try {
      process.kill(child.pid, 0)
    } catch {
      alive = false
    }
    expect(alive).toBe(false)
  }, 15000)

  it('失败路径的 dsh 输出也脱敏 token（异常尾部不得泄凭据）', async () => {
    const dsh = await loadDsh()
    const redacted = dsh.redactOutputTail([
      'dsh web: http://127.0.0.1:4323/?token=secret-token-abc (LAN: http://192.168.1.9:4323/?token=secret-token-abc)',
      'error after auth http://127.0.0.1:4323/?token=secret-token-abc&x=1',
    ].join('\n'))
    expect(redacted).not.toContain('secret-token-abc')
    expect(redacted.match(/REDACTED/g)).toHaveLength(3)
  })

  it('DSH_HOME 隔离按真实路径判定，符号链接指向 ~/.dsh 被拒绝', async () => {
    const dsh = await loadDsh()
    const realDsh = path.join(tmpRoot, 'real-dsh')
    fs.mkdirSync(realDsh, { recursive: true })
    const link = path.join(tmpRoot, 'linked-dsh')
    fs.symlinkSync(realDsh, link)
    expect(dsh.assertIsolatedHome(link, os.homedir())).toBe(fs.realpathSync(realDsh))
    const fakeUserHome = path.join(tmpRoot, 'fake-user-home')
    const realProtected = path.join(fakeUserHome, '.dsh')
    fs.mkdirSync(realProtected, { recursive: true })
    const escapeLink = path.join(tmpRoot, 'escape-dsh')
    fs.symlinkSync(realProtected, escapeLink)
    expect(() => dsh.assertIsolatedHome(escapeLink, fakeUserHome)).toThrow(/受保护目录/)
    expect(() => dsh.assertIsolatedHome(path.join(realProtected, 'profiles', 'web'), fakeUserHome)).toThrow(/受保护目录/)
  })

  it('dsh bin 支持 PATH 裸命令与文件路径两种形态', async () => {
    const dsh = await loadDsh()
    const bin = path.join(tmpRoot, 'path-command-dsh')
    fs.writeFileSync(bin, '#!/bin/sh\nexit 0\n')
    fs.chmodSync(bin, 0o755)
    expect(dsh.commandExists(bin)).toBe(true)
    expect(dsh.commandExists('path-command-dsh', tmpRoot)).toBe(true)
    expect(dsh.commandExists('definitely-not-this-command', tmpRoot)).toBe(false)
    expect(dsh.commandExists(undefined)).toBe(false)
  })

  it('installPlugin 对缺 lib 产物直接拒绝（不执行命令）', async () => {
    const dsh = await loadDsh()
    const emptyRepo = path.join(tmpRoot, 'empty-repo')
    fs.mkdirSync(emptyRepo, { recursive: true })
    const result = dsh.installPlugin({ dshBin: 'dsh', dshHome: tmpRoot, profile: 'web', repo: emptyRepo })
    expect(result.ok).toBe(false)
    expect(result.hint).toContain('pnpm build')
  })
})

// ── runner CLI 失败支（真实子进程，零浏览器）─────────────────────────────────

describe('runner CLI 失败支', () => {
  it('缺参数 exit 2 且 stdout 输出可行动 JSON', () => {
    const result = spawnSync(process.execPath, [path.join(VERIFY_DIR, 'run.mjs')], { encoding: 'utf8', timeout: 20000 })
    expect(result.status).toBe(2)
    const payload = JSON.parse(result.stdout) as { ok: boolean, reason: string, hint: string }
    expect(payload.ok).toBe(false)
    expect(payload.hint).toContain('--dsh-home')
  })

  it('--dsh-home 指向 ~/.dsh 时 CLI 层拒绝（不启动任何进程）', () => {
    const result = spawnSync(
      process.execPath,
      [path.join(VERIFY_DIR, 'run.mjs'), '--dsh-bin', 'dsh', '--dsh-home', '~/.dsh'],
      { encoding: 'utf8', timeout: 20000 },
    )
    expect(result.status).toBe(2)
    const payload = JSON.parse(result.stdout) as { ok: boolean, reason: string }
    expect(payload.ok).toBe(false)
    expect(payload.reason).toContain('.dsh')
  })
})
