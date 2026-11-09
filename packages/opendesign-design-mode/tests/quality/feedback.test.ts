/**
 * 质量环回注器单测（U5；RL1 单测半场 / RL3 / RL9 + D5 消息契约）。
 *
 * 断言结构（任务书七组中回注器承担的组：去重 / 上限 / report 落盘 / 消息形态 / 双通道）：
 * 1. P0 门槛与双通道（RL1 mock agents 断言调用形态）：running → steer、idle → followup、
 *    消息形态五要素（自报身份 / 检查项 id / 片段 / 修复指引 / 作用域句 + 无需回复句）；
 * 2. 查无活 Agent 放弃回注仅落记录（no-agent 两形态：注册表查无 / agents 服务缺席）+
 *    注入抛错 error envelope（inject-error）+ 放弃不消耗额度边界；
 * 3. 指纹去重（RL3）：同内容同发现 → duplicate 零二次注入；异内容 / 异发现集 → 新指纹再注入；
 * 4. 每会话每文件上限：缺省 2（登记值锁定）、超限仅记录（limit）、自定义上限覆盖；
 * 5. 产物身份行（D5④）：session-artifact 零命中也记且同路径一代只记一行、resume/unrecognized
 *    两 kind 不写身份行；
 * 6. report.jsonl 落盘（RL9）：发现行 reason 词表逐形态落盘、fed-back 运行中 P1/P2 行标
 *    p1p2、读侧 readArtifactIdentityPaths 损坏行容忍；
 * 7. 边界：P0 findings 直接构造（回注器契约独立于检查器实现）、空发现 no-findings。
 *
 * 检查函数不注入：回注器消费的是 LintFinding[] 结构契约（lint.ts 导出类型），发现用例
 * 直接构造——本套件测回注裁决，检查行为归 lint.test.ts（RL4）。
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  appendQualityReportLine,
  buildLintFeedbackMessage,
  createQualityFeedbackHandler,
  DEFAULT_MAX_FEEDBACKS_PER_FILE,
  LINT_SOURCE_KIND,
  qualityReportPath,
  readArtifactIdentityPaths,
  type FeedbackOutcome,
  type FindingRecordReason,
  type LintFinding,
  type QualityFindingInput,
  type QualityReportLine,
} from '../../lib/quality/feedback.js'

// ── 测试脚手架 ───────────────────────────────────────────────────────────────

const SESSION_ID = 'quality-session'
const P0_CONTENT = '<!doctype html><html><body>artifact-v1</body></html>'

const P0_GRADIENT: LintFinding = {
  severity: 'P0',
  id: 'purple-gradient',
  message: 'Found a violet/purple gradient using #a855f7 — anti-slop list says no.',
  fix: 'Replace the gradient with a flat surface.',
  snippet: 'linear-gradient(90deg, #a855f7, #ec4899)',
}

const P1_CAPS: LintFinding = {
  severity: 'P1',
  id: 'all-caps-no-tracking',
  message: 'Selector sets uppercase without letter-spacing.',
  fix: 'Add letter-spacing: 0.08em.',
}

interface AgentStub {
  status?: string
  steer: ReturnType<typeof vi.fn>
  followup: ReturnType<typeof vi.fn>
}

function makeAgent(status?: string, behavior: { steerThrows?: boolean } = {}): AgentStub {
  return {
    status,
    steer: vi.fn(() => {
      if (behavior.steerThrows) throw new Error('agent disposed mid-inject')
    }),
    followup: vi.fn(),
  }
}

/** 宿主 ctx 双打：agents 服务按注册表供给；getThrows 模拟服务缺席（cordis proxy getter 抛错）。 */
function makeCtx(registry: Map<string, AgentStub> | undefined, opts: { getThrows?: boolean } = {}): unknown {
  return {
    get(name: string): unknown {
      if (opts.getThrows) throw new Error(`service ${name} not available`)
      return registry
    },
  }
}

const tmpRoots: string[] = []

afterEach(async () => {
  while (tmpRoots.length > 0) {
    const root = tmpRoots.pop()
    if (root !== undefined) await rm(root, { recursive: true, force: true })
  }
})

async function makeHarness(opts: {
  registry?: Map<string, AgentStub>
  getThrows?: boolean
  maxFeedbacksPerFile?: number
} = {}): Promise<{
  cwd: string
  handler: (input: QualityFindingInput) => Promise<FeedbackOutcome>
  registry: Map<string, AgentStub>
}> {
  const cwd = await mkdtemp(join(tmpdir(), 'od-feedback-'))
  tmpRoots.push(cwd)
  const registry = opts.registry ?? new Map<string, AgentStub>()
  const handler = createQualityFeedbackHandler({
    ctx: makeCtx(opts.getThrows ? undefined : registry, opts),
    sessionId: SESSION_ID,
    cwd,
    ...(opts.maxFeedbacksPerFile !== undefined ? { maxFeedbacksPerFile: opts.maxFeedbacksPerFile } : {}),
  })
  return { cwd, handler, registry }
}

async function readReport(cwd: string): Promise<QualityReportLine[]> {
  try {
    const raw = await readFile(qualityReportPath(cwd), 'utf8')
    return raw
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as QualityReportLine)
  } catch {
    return []
  }
}

function reasonsOf(report: QualityReportLine[]): FindingRecordReason[] {
  return report
    .filter((line): line is Extract<QualityReportLine, { type: 'finding' }> => line.type === 'finding')
    .map((line) => line.reason)
}

function artifactPaths(report: QualityReportLine[]): string[] {
  return report
    .filter((line): line is Extract<QualityReportLine, { type: 'artifact' }> => line.type === 'artifact')
    .map((line) => line.path)
}

function steerMessages(registry: Map<string, AgentStub>): Array<Record<string, unknown>> {
  const agent = registry.get(SESSION_ID)
  if (!agent) throw new Error('agent stub missing')
  return agent.steer.mock.calls.map((call) => call[0] as Record<string, unknown>)
}

// ── 1. P0 门槛与双通道（RL1 mock agents 调用形态）────────────────────────────

describe('P0 门槛与双通道（running → steer / idle → followup）', () => {
  it('running agent：P0 走 steer 注入当前轮，消息形态五要素齐备（AX7 来源自报不冒充用户）', async () => {
    const agent = makeAgent('running')
    const { cwd, handler, registry } = await makeHarness({ registry: new Map([[SESSION_ID, agent]]) })
    const outcome = await handler({ kind: 'session-artifact', relativePath: 'index.html', content: P0_CONTENT, findings: [P0_GRADIENT] })

    expect(outcome).toEqual({ action: 'steered' })
    expect(agent.steer).toHaveBeenCalledTimes(1)
    expect(agent.followup).not.toHaveBeenCalled()

    const message = steerMessages(registry)[0]
    expect(message.role).toBe('user')
    expect(typeof message.id).toBe('string')
    expect(message.source).toEqual({ kind: LINT_SOURCE_KIND })
    expect(LINT_SOURCE_KIND).toBe('opendesign-design-mode/lint')
    const content = message.content as ReadonlyArray<{ type: string; text: string }>
    expect(content).toHaveLength(1)
    expect(content[0].type).toBe('text')
    const text = content[0].text
    expect(text).toContain('[opendesign-design-mode 质量环]')
    expect(text).toContain('index.html')
    expect(text).toContain('[purple-gradient]')
    expect(text).toContain('片段：linear-gradient(90deg, #a855f7, #ec4899)')
    expect(text).toContain(`修复指引：${P0_GRADIENT.fix}`)
    expect(text).toContain('仅修复你本会话产出的 HTML')
    expect(text).toContain('修复后无需回复本消息')
    // 记录面：fed-back 运行落发现行（P0 标 fed-back）
    expect(reasonsOf(await readReport(cwd))).toEqual(['fed-back'])
  })

  it('idle agent：P0 走 followup 自动开新轮', async () => {
    const agent = makeAgent('idle')
    const { handler, registry } = await makeHarness({ registry: new Map([[SESSION_ID, agent]]) })
    const outcome = await handler({ kind: 'session-artifact', relativePath: 'index.html', content: P0_CONTENT, findings: [P0_GRADIENT] })

    expect(outcome).toEqual({ action: 'followup' })
    expect(agent.followup).toHaveBeenCalledTimes(1)
    expect(agent.steer).not.toHaveBeenCalled()
    expect(steerMessages(registry)).toHaveLength(0)
  })

  it('P1/P2-only：零注入仅记录（reason p1p2，D5 ③ 仅 P0 回注）', async () => {
    const agent = makeAgent('running')
    const { cwd, handler } = await makeHarness({ registry: new Map([[SESSION_ID, agent]]) })
    const outcome = await handler({ kind: 'session-artifact', relativePath: 'index.html', content: P0_CONTENT, findings: [P1_CAPS] })

    expect(outcome).toEqual({ action: 'recorded-only', reason: 'p1p2' })
    expect(agent.steer).not.toHaveBeenCalled()
    expect(agent.followup).not.toHaveBeenCalled()
    expect(reasonsOf(await readReport(cwd))).toEqual(['p1p2'])
  })
})

// ── 2. 查无活 Agent / 注入失败（放弃回注仅落记录）────────────────────────────

describe('查无活 Agent 放弃回注仅落记录（D5）', () => {
  it('注册表查无会话 Agent：no-agent，零注入零额度消耗', async () => {
    const { cwd, handler } = await makeHarness({ registry: new Map() }) // 空注册表
    const outcome = await handler({ kind: 'session-artifact', relativePath: 'index.html', content: P0_CONTENT, findings: [P0_GRADIENT] })

    expect(outcome).toEqual({ action: 'recorded-only', reason: 'no-agent' })
    expect(reasonsOf(await readReport(cwd))).toEqual(['no-agent'])
  })

  it('agents 服务缺席（ctx.get 抛错）：与查无 Agent 同归 no-agent（服务读取失败不拖垮记录）', async () => {
    const { handler } = await makeHarness({ getThrows: true })
    const outcome = await handler({ kind: 'session-artifact', relativePath: 'index.html', content: P0_CONTENT, findings: [P0_GRADIENT] })
    expect(outcome).toEqual({ action: 'recorded-only', reason: 'no-agent' })
  })

  it('注入调用抛错：inject-error（error envelope：失败显式成词，不静默吞）', async () => {
    const agent = makeAgent('running', { steerThrows: true })
    const { cwd, handler, registry } = await makeHarness({ registry: new Map([[SESSION_ID, agent]]) })
    const outcome = await handler({ kind: 'session-artifact', relativePath: 'index.html', content: P0_CONTENT, findings: [P0_GRADIENT] })

    expect(outcome).toEqual({ action: 'recorded-only', reason: 'inject-error' })
    expect(agent.steer).toHaveBeenCalledTimes(1)
    expect(reasonsOf(await readReport(cwd))).toEqual(['inject-error'])
    expect(steerMessages(registry)).toHaveLength(1) // 调用发生过但被宿主拒绝
  })

  it('放弃不消耗额度：两次 no-agent 后额度为零，仍可连续两次送达，第三次才触 limit', async () => {
    const registry = new Map<string, AgentStub>() // 先空注册表（no-agent 两跑）
    const { cwd, handler } = await makeHarness({ registry })
    const input = (content: string): QualityFindingInput => ({ kind: 'session-artifact', relativePath: 'index.html', content, findings: [P0_GRADIENT] })

    expect(await handler(input('v0-a'))).toEqual({ action: 'recorded-only', reason: 'no-agent' })
    expect(await handler(input('v0-b'))).toEqual({ action: 'recorded-only', reason: 'no-agent' })

    const agent = makeAgent('running') // 会话复活（resume 场景）
    registry.set(SESSION_ID, agent)
    expect(await handler(input('v1'))).toEqual({ action: 'steered' })
    expect(await handler(input('v2'))).toEqual({ action: 'steered' })
    expect(await handler(input('v3'))).toEqual({ action: 'recorded-only', reason: 'limit' })
    expect(agent.steer).toHaveBeenCalledTimes(2)
    expect(reasonsOf(await readReport(cwd))).toEqual(['no-agent', 'no-agent', 'fed-back', 'fed-back', 'limit'])
  })
})

// ── 3. 内容指纹去重（RL3：防回注-重写循环）────────────────────────────────────

describe('内容指纹去重（文件哈希 + P0 id 集）', () => {
  it('同内容同发现重写：duplicate 零二次注入，仅落记录（SI2 同指纹不再回注）', async () => {
    const agent = makeAgent('running')
    const { cwd, handler, registry } = await makeHarness({ registry: new Map([[SESSION_ID, agent]]) })
    const input: QualityFindingInput = { kind: 'session-artifact', relativePath: 'index.html', content: P0_CONTENT, findings: [P0_GRADIENT] }

    expect(await handler(input)).toEqual({ action: 'steered' })
    expect(await handler(input)).toEqual({ action: 'recorded-only', reason: 'duplicate' })
    expect(agent.steer).toHaveBeenCalledTimes(1)
    expect(reasonsOf(await readReport(cwd))).toEqual(['fed-back', 'duplicate'])
  })

  it('同发现异内容（无关微调重写）：新指纹视为新回注机会，再次注入', async () => {
    const agent = makeAgent('running')
    const { handler } = await makeHarness({ registry: new Map([[SESSION_ID, agent]]) })
    expect(await handler({ kind: 'session-artifact', relativePath: 'index.html', content: P0_CONTENT, findings: [P0_GRADIENT] })).toEqual({ action: 'steered' })
    expect(await handler({ kind: 'session-artifact', relativePath: 'index.html', content: P0_CONTENT.replace('v1', 'v2'), findings: [P0_GRADIENT] })).toEqual({ action: 'steered' })
    expect(agent.steer).toHaveBeenCalledTimes(2)
  })

  it('P0 发现集参与指纹：同内容但 P0 集变化（修复了 emoji-icon 留下 purple-gradient 的反向形态）→ 新指纹再注入', async () => {
    const agent = makeAgent('running')
    const { handler } = await makeHarness({ registry: new Map([[SESSION_ID, agent]]) })
    const emojiP0: LintFinding = { ...P0_GRADIENT, id: 'emoji-icon', message: 'emoji icon found' }
    expect(await handler({ kind: 'session-artifact', relativePath: 'index.html', content: P0_CONTENT, findings: [P0_GRADIENT] })).toEqual({ action: 'steered' })
    expect(await handler({ kind: 'session-artifact', relativePath: 'index.html', content: P0_CONTENT, findings: [emojiP0] })).toEqual({ action: 'steered' })
    expect(agent.steer).toHaveBeenCalledTimes(2)
  })

  it('去重按文件分键：不同文件的相同指纹互不影响（文件标识 = cwd 相对路径）', async () => {
    const agent = makeAgent('running')
    const { handler } = await makeHarness({ registry: new Map([[SESSION_ID, agent]]) })
    expect(await handler({ kind: 'session-artifact', relativePath: 'a.html', content: P0_CONTENT, findings: [P0_GRADIENT] })).toEqual({ action: 'steered' })
    expect(await handler({ kind: 'session-artifact', relativePath: 'b.html', content: P0_CONTENT, findings: [P0_GRADIENT] })).toEqual({ action: 'steered' })
    expect(agent.steer).toHaveBeenCalledTimes(2)
  })
})

// ── 4. 每会话每文件回注上限（D5 ②）──────────────────────────────────────────

describe('每会话每文件回注上限', () => {
  it('登记值锁定：DEFAULT_MAX_FEEDBACKS_PER_FILE === 2', () => {
    expect(DEFAULT_MAX_FEEDBACKS_PER_FILE).toBe(2)
  })

  it('缺省上限 2：第三次不同内容同发现 → limit 仅记录不注入（防死循环）', async () => {
    const agent = makeAgent('running')
    const { cwd, handler } = await makeHarness({ registry: new Map([[SESSION_ID, agent]]) })
    const input = (content: string): QualityFindingInput => ({ kind: 'session-artifact', relativePath: 'index.html', content, findings: [P0_GRADIENT] })

    expect(await handler(input('v1'))).toEqual({ action: 'steered' })
    expect(await handler(input('v2'))).toEqual({ action: 'steered' })
    expect(await handler(input('v3'))).toEqual({ action: 'recorded-only', reason: 'limit' })
    expect(await handler(input('v4'))).toEqual({ action: 'recorded-only', reason: 'limit' })
    expect(reasonsOf(await readReport(cwd))).toEqual(['fed-back', 'fed-back', 'limit', 'limit'])
  })

  it('上限按文件分键：a.html 触 limit 不影响 b.html 的新额度', async () => {
    const agent = makeAgent('running')
    const { handler } = await makeHarness({ registry: new Map([[SESSION_ID, agent]]) })
    const input = (rel: string, content: string): QualityFindingInput => ({ kind: 'session-artifact', relativePath: rel, content, findings: [P0_GRADIENT] })

    expect(await handler(input('a.html', 'v1'))).toEqual({ action: 'steered' })
    expect(await handler(input('a.html', 'v2'))).toEqual({ action: 'steered' })
    expect(await handler(input('a.html', 'v3'))).toEqual({ action: 'recorded-only', reason: 'limit' })
    expect(await handler(input('b.html', 'v1'))).toEqual({ action: 'steered' })
    expect(agent.steer).toHaveBeenCalledTimes(3)
  })

  it('maxFeedbacksPerFile 覆盖为 1：第二次即 limit', async () => {
    const agent = makeAgent('running')
    const { handler } = await makeHarness({ registry: new Map([[SESSION_ID, agent]]), maxFeedbacksPerFile: 1 })
    const input = (content: string): QualityFindingInput => ({ kind: 'session-artifact', relativePath: 'index.html', content, findings: [P0_GRADIENT] })
    expect(await handler(input('v1'))).toEqual({ action: 'steered' })
    expect(await handler(input('v2'))).toEqual({ action: 'recorded-only', reason: 'limit' })
  })
})

// ── 5. 产物写盘身份行（D5④：快照豁免的回查数据源）────────────────────────────

describe('产物写盘身份行（零命中也记 / 同路径一代只记一行 / kind 分流）', () => {
  it('session-artifact 零命中也记身份行；同路径重写不重复记行', async () => {
    const { cwd, handler } = await makeHarness({ registry: new Map() })
    const input: QualityFindingInput = { kind: 'session-artifact', relativePath: 'fresh.html', content: P0_CONTENT, findings: [] }

    expect(await handler(input)).toEqual({ action: 'no-findings' })
    expect(await handler(input)).toEqual({ action: 'no-findings' })
    expect(artifactPaths(await readReport(cwd))).toEqual(['fresh.html'])
  })

  it('resume-artifact（上一代产物持身份记录）：不写身份行，命中照常走回注通道', async () => {
    const agent = makeAgent('running')
    const { cwd, handler, registry } = await makeHarness({ registry: new Map([[SESSION_ID, agent]]) })
    const outcome = await handler({ kind: 'resume-artifact', relativePath: 'prev-gen.html', content: P0_CONTENT, findings: [P0_GRADIENT] })

    expect(outcome).toEqual({ action: 'steered' })
    expect(agent.steer).toHaveBeenCalledTimes(1)
    expect(artifactPaths(await readReport(cwd))).toEqual([]) // 身份行归 session-artifact 专属
    expect(reasonsOf(await readReport(cwd))).toEqual(['fed-back'])
  })

  it('unrecognized-existing（陌生既有文件）：只记录不回注（V10 防驱动模型改用户文件）', async () => {
    const agent = makeAgent('running')
    const { cwd, handler } = await makeHarness({ registry: new Map([[SESSION_ID, agent]]) })
    const outcome = await handler({ kind: 'unrecognized-existing', relativePath: 'vendored.html', content: P0_CONTENT, findings: [P0_GRADIENT, P1_CAPS] })

    expect(outcome).toEqual({ action: 'recorded-only', reason: 'unrecognized-existing' })
    expect(reasonsOf(await readReport(cwd))).toEqual(['unrecognized-existing', 'unrecognized-existing'])
    expect(artifactPaths(await readReport(cwd))).toEqual([])
  })

  it('身份行只归 session-artifact 且在发现裁决之前落盘（行序：artifact 行先于 finding 行）', async () => {
    const agent = makeAgent('running')
    const { cwd, handler } = await makeHarness({ registry: new Map([[SESSION_ID, agent]]) })
    await handler({ kind: 'session-artifact', relativePath: 'index.html', content: P0_CONTENT, findings: [P0_GRADIENT] })
    const report = await readReport(cwd)
    expect(report.map((line) => line.type)).toEqual(['artifact', 'finding'])
    const artifact = report[0] as Extract<QualityReportLine, { type: 'artifact' }>
    expect(artifact.path).toBe('index.html')
    expect(artifact.at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

// ── 6. report.jsonl 落盘与读侧契约（RL9）─────────────────────────────────────

describe('report.jsonl 落盘与读侧（doctor ⑪ 读侧行格式契约）', () => {
  it('fed-back 运行中混入的 P1/P2 行标 p1p2（行级 severity 与 reason 正交）', async () => {
    const agent = makeAgent('running')
    const { cwd, handler } = await makeHarness({ registry: new Map([[SESSION_ID, agent]]) })
    await handler({ kind: 'session-artifact', relativePath: 'index.html', content: P0_CONTENT, findings: [P0_GRADIENT, P1_CAPS] })
    const findings = (await readReport(cwd)).filter(
      (line): line is Extract<QualityReportLine, { type: 'finding' }> => line.type === 'finding',
    )
    expect(findings.map((line) => [line.severity, line.reason])).toEqual([['P0', 'fed-back'], ['P1', 'p1p2']])
    expect(findings[0]).toMatchObject({ type: 'finding', path: 'index.html', id: 'purple-gradient', message: P0_GRADIENT.message, fix: P0_GRADIENT.fix, snippet: P0_GRADIENT.snippet })
    expect(findings[0]?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('appendQualityReportLine 自动建目录；readArtifactIdentityPaths 只收 artifact 行并容忍损坏行', async () => {
    const { cwd, handler } = await makeHarness({ registry: new Map() })
    await appendQualityReportLine(cwd, { type: 'watcher', at: '2026-11-10T00:00:00.000Z', event: 'started', cwd })
    // 损坏行（半行写入形态，含换行边界）+ 非 artifact 行夹在中间
    const { appendFile, mkdir } = await import('node:fs/promises')
    await mkdir(join(cwd, '.od-quality'), { recursive: true })
    await appendFile(qualityReportPath(cwd), '{"type":"finding","trunc\n', 'utf8')
    await handler({ kind: 'session-artifact', relativePath: 'gen.html', content: P0_CONTENT, findings: [] })
    const identities = await readArtifactIdentityPaths(cwd)
    expect([...identities]).toEqual(['gen.html'])
    // 文件缺席（全新会话）→ 空集
    const empty = await mkdtemp(join(tmpdir(), 'od-feedback-empty-'))
    tmpRoots.push(empty)
    expect([...await readArtifactIdentityPaths(empty)]).toEqual([])
  })

  it('发现行携带完整 finding 契约字段；snippet 缺席时该字段不落行（scroll-into-view 形态）', async () => {
    const agent = makeAgent('running')
    const scrollP0: LintFinding = { severity: 'P0', id: 'scroll-into-view', message: 'scrollIntoView detected.', fix: 'Use scrollTo().' }
    const { cwd, handler } = await makeHarness({ registry: new Map([[SESSION_ID, agent]]) })
    await handler({ kind: 'session-artifact', relativePath: 'deck.html', content: P0_CONTENT, findings: [scrollP0] })
    const line = (await readReport(cwd)).find(
      (l): l is Extract<QualityReportLine, { type: 'finding' }> => l.type === 'finding',
    )
    expect(line).toMatchObject({ type: 'finding', path: 'deck.html', severity: 'P0', id: 'scroll-into-view', reason: 'fed-back' })
    expect('snippet' in (line ?? {})).toBe(false)
  })
})

// ── 7. 边界与消息构造直驱 ────────────────────────────────────────────────────

describe('边界与消息构造直驱', () => {
  it('空发现 + 非会话产物 kind：no-findings 且零写盘', async () => {
    const { cwd, handler } = await makeHarness({ registry: new Map() })
    const outcome = await handler({ kind: 'resume-artifact', relativePath: 'prev.html', content: P0_CONTENT, findings: [] })
    expect(outcome).toEqual({ action: 'no-findings' })
    expect(await readReport(cwd)).toEqual([])
  })

  it('buildLintFeedbackMessage 直驱：id 唯一（randomUUID）、无 snippet 发现不产片段行、多发现逐条编号', () => {
    const a = buildLintFeedbackMessage('x.html', [P0_GRADIENT])
    const b = buildLintFeedbackMessage('x.html', [P0_GRADIENT])
    expect(a.id).not.toBe(b.id)
    const scroll = buildLintFeedbackMessage('y.html', [
      { severity: 'P0', id: 'scroll-into-view', message: 'm1', fix: 'f1' },
      { severity: 'P0', id: 'filler-copy', message: 'm2', fix: 'f2', snippet: 's2' },
    ])
    const text = (scroll.content[0] as { text: string }).text
    expect(text).toContain('1. [scroll-into-view] m1')
    expect(text).toContain('2. [filler-copy] m2')
    expect(text).toContain('片段：s2')
    expect(text.split('\n').filter((line) => line.includes('片段：'))).toHaveLength(1)
    expect((a.source as { kind: string }).kind).toBe('opendesign-design-mode/lint')
  })
})
