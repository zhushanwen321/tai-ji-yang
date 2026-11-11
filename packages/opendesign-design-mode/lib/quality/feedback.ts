/**
 * 质量环回注器（U5；机制权威 = 设计 D5 / 公理 AX7 / 状态副本 SC4 / SC5）。
 *
 * 职责（D5 采用项）：P0 发现 → 构造 UserMessage 字面量（source.kind =
 * 'opendesign-design-mode/lint'，文本自报质量环身份 + 逐发现检查项/片段/修复指引 +
 * 作用域句「仅修复你本会话产出的 HTML」+「修复后无需回复本消息」）→ 经 ctx.get('agents')
 * 取该会话 Agent：status 为 running 时 steer（注入当前轮）、否则 followup（自动开新轮）；
 * 查无活 Agent 放弃回注仅落记录。防噪音四件套中的进程内两件在本模块：
 * ①内容指纹去重（文件内容 sha256 + P0 检查项 id 集的组合指纹；Map 键 = cwd 相对路径；
 *   SC4 进程内存、重启即清——重启后重复回注一次是可接受的幂等代价，不落盘持久化）；
 * ②每会话每文件回注上限（缺省 2 次，仅完整内容命中消耗——完整性哨兵跳过的半写不会
 *   到达本模块，天然不消耗额度；超限 P0 与 P1/P2 同落发现记录，doctor 第⑪节呈现）。
 *
 * .od-quality/report.jsonl 行格式（SC5 唯一权威，追加式 JSONL；本模块是全部记录行的
 * 唯一写侧——watcher.ts 的生命周期行经 appendQualityReportLine 写入，doctor 第⑪节读侧
 * 消费；行格式由本单元定义，U6 依赖此契约）：
 *   {"type":"artifact","at":"<ISO>","path":"<cwd 相对路径>"}
 *     —— 产物写盘身份记录：监听期间快照外写盘经完整性哨兵后记一行，零 P0 命中也记
 *        （身份记录是回查数据不是发现）；resume 后下一代监听器按 path 回查构建豁免集（D5④）。
 *   {"type":"finding","at":"<ISO>","path":"…","severity":"P0"|"P1"|"P2","id":"…",
 *    "message":"…","fix":"…","snippet":"…","reason":"<FindingRecordReason>"}
 *     —— 检查发现记录：每发现一行；reason = 本次检查运行的回注裁决（fed-back 行只标 P0，
 *        同运行的 P1/P2 行标 p1p2）。
 *   {"type":"watcher","at":"<ISO>","event":"started"|"destroyed","cwd":"…","reason":"…"}
 *     —— 监听器生命周期（SI3）：destroyed 必带 reason；started 带 cwd。
 *
 * AX7 红线：回注消息 source.kind 用包专有标识且文本开头自报身份，绝不冒充用户发言。
 * 宿主 UserMessage 是开放字面量（role/content/source 三件，AS2 实读：llm message.ts 的
 * MessageBase + 宿主 webhook/time-context 插件先例）——本包零 npm 运行时依赖，直接构造
 * 字面量不经宿主工厂，id 用 node:crypto randomUUID。
 * 编号口径：本文件裸编号（U/D/AX/AS/SC/RL/UD/SI/GPK 等）默认属 opendesign-assets-quality 设计包（本轮）；V1 设计包域编号带「V1 设计包 / V1·」前缀。
 */

import { createHash, randomUUID } from 'node:crypto'
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import type { LintFinding, LintSeverity } from './lint.js'

/** 会话目录内检查发现记录的子目录名（监听过滤器排除项之一，D4）。 */
export const QUALITY_DIR_NAME = '.od-quality'

/** 检查发现记录文件名（SC5：每会话独立文件、追加式，随会话目录生命周期）。 */
export const QUALITY_REPORT_NAME = 'report.jsonl'

/** 会话 cwd → report.jsonl 绝对路径（写侧 appendQualityReportLine 与读侧共用同一拼装）。 */
export function qualityReportPath(cwd: string): string {
  return path.join(cwd, QUALITY_DIR_NAME, QUALITY_REPORT_NAME)
}

/** 发现记录行的回注裁决词表（reason 字段取值；doctor 第⑪节按此呈现「为什么没回注」）。 */
export type FindingRecordReason =
  | 'fed-back' // P0 已回注（steer/followup 送达会话）
  | 'p1p2' // P1/P2 建议级——仅记录不回注（D5 ③）
  | 'duplicate' // 内容指纹已回注过（同内容同发现）——仅记录不回注（SI2）
  | 'limit' // 超过每会话每文件回注上限——仅记录不回注（防死循环）
  | 'no-agent' // 查无活 Agent（会话已结束 / agents 服务缺席）——放弃回注仅落记录
  | 'inject-error' // steer/followup 调用抛错——放弃回注仅落记录
  | 'unrecognized-existing' // 陌生既有文件（监听启动快照内且无身份记录）——只记录不回注（V10，D5 ④）

/** report.jsonl 单行词表（判别字段 type；doctor 第⑪节读侧按 type 分流呈现）。 */
export type QualityReportLine =
  | { type: 'artifact'; at: string; path: string }
  | {
    type: 'finding'
    at: string
    path: string
    severity: LintSeverity
    id: string
    message: string
    fix?: string
    snippet?: string
    reason: FindingRecordReason
  }
  | { type: 'watcher'; at: string; event: 'started' | 'destroyed'; cwd?: string; reason?: string }

/**
 * 追加一行检查发现记录（自动创建 .od-quality/ 目录；追加式，绝不改写既有行）。
 * 写失败向上抛给调用方处置（watcher 记 logger 降级、回注器随发现裁决上抛为
 * inject-error 同级失败）——降级 ≠ 吞错。
 */
export async function appendQualityReportLine(cwd: string, line: QualityReportLine): Promise<void> {
  const file = qualityReportPath(cwd)
  await mkdir(path.dirname(file), { recursive: true })
  await appendFile(file, `${JSON.stringify(line)}\n`, 'utf8')
}

/**
 * 读侧：按 report.jsonl 的产物写盘身份记录构建豁免集（cwd 相对路径集合）。
 * resume 会话监听器启动时消费（D5④：上一代产物豁免出快照、改写照常回注）。
 * 文件缺席返回空集（全新会话形态）；损坏行跳过（追加式记录容忍半行写入）。
 */
export async function readArtifactIdentityPaths(cwd: string): Promise<Set<string>> {
  let raw: string
  try {
    raw = await readFile(qualityReportPath(cwd), 'utf8')
  } catch {
    return new Set()
  }
  const out = new Set<string>()
  for (const lineText of raw.split('\n')) {
    const trimmed = lineText.trim()
    if (!trimmed) continue
    try {
      const parsed = JSON.parse(trimmed) as { type?: unknown; path?: unknown }
      if (parsed.type === 'artifact' && typeof parsed.path === 'string' && parsed.path.length > 0) {
        out.add(parsed.path)
      }
    } catch {
      // 损坏行跳过——身份记录是回查数据，单行损坏不破坏其余行的豁免语义
    }
  }
  return out
}

// ── 回注消息构造（D5 / AX7）────────────────────────────────────────────────

/** 回注消息的 source.kind（包专有标识；宿主开放字符串——AS2 实读 time-context 先例）。 */
export const LINT_SOURCE_KIND = 'opendesign-design-mode/lint'

/** 宿主 UserMessage 的最小字面量形状（零依赖内联声明；完整类型见宿主 llm message.ts）。 */
export interface FeedbackUserMessage {
  id: string
  role: 'user'
  content: ReadonlyArray<{ type: 'text'; text: string }>
  /** 宿主 MessageSourceMap 开放形状（插件可声明任意字段并随 user/message 事件持久化）——kind 之外评论环另带 form/summary/artifactPath/threadId（评论设计 D3）。 */
  source: { kind: string } & Record<string, unknown>
}

/**
 * 构造一条 P0 回注消息（AX7：文本开头自报质量环身份，不冒充用户发言；D5：逐发现
 * 检查项/片段/修复指引 + 作用域句 + 无需回复句）。文件标识 = cwd 相对路径（模型视角
 * 可直接用文件工具定位）。
 */
export function buildLintFeedbackMessage(
  relativePath: string,
  p0Findings: readonly LintFinding[],
): FeedbackUserMessage {
  const items = p0Findings.map((finding, index) => {
    const lines = [
      `${index + 1}. [${finding.id}] ${finding.message}`,
      finding.snippet ? `   片段：${finding.snippet}` : undefined,
      finding.fix ? `   修复指引：${finding.fix}` : undefined,
    ].filter((line): line is string => line !== undefined)
    return lines.join('\n')
  })
  const text = [
    '[opendesign-design-mode 质量环] 反 AI 味检查发现以下 P0 问题（宿主侧机器检查，非用户发言；文件：' +
      `${relativePath}）：`,
    '',
    ...items,
    '',
    '作用域：仅修复你本会话产出的 HTML；会话目录中非你产出的文件命中仅报告，勿改动。',
    '修复后无需回复本消息。',
  ].join('\n')
  return {
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: LINT_SOURCE_KIND },
  }
}

// ── 回注控制器（P0 门槛 + 去重 + 上限 + 记录裁决）────────────────────────────

/** 监听器送来的单次检查结果（kind = watcher 三类命中分类，D5④）。 */
export type WatchedArtifactKind = 'session-artifact' | 'resume-artifact' | 'unrecognized-existing'

export interface QualityFindingInput {
  kind: WatchedArtifactKind
  /** 文件标识 = cwd 相对路径（指纹与上限的键、身份记录与发现记录的 path 字段）。 */
  relativePath: string
  /** 哨兵通过时的文件完整内容（指纹计算用）。 */
  content: string
  findings: readonly LintFinding[]
}

/** 回注裁决结果（action 顶层 + reason 细分；测试与 index 接线层断言消费）。 */
export interface FeedbackOutcome {
  /** no-findings = 零发现（身份行按 kind 语义已处置，无回注无发现记录）。 */
  action: 'no-findings' | 'recorded-only' | 'steered' | 'followup'
  /** action = recorded-only 时的细分原因（FindingRecordReason 词表）。 */
  reason?: FindingRecordReason
}

/** 宿主 agents 服务的最小结构面（AgentRegistry.get(sessionId) → Agent，AS1）。 */
interface AgentsServiceLike {
  get?: (id: string) => SessionAgentLike | undefined
}

interface SessionAgentLike {
  status?: unknown
  steer?: (message: unknown) => void
  followup?: (message: unknown) => void
}

export interface QualityFeedbackOptions {
  /** 宿主 ctx（agents 服务经 ctx.get('agents') 运行时读取；服务缺席按查无活 Agent 处置）。 */
  ctx: unknown
  sessionId: string
  /** 会话 cwd（report.jsonl 落点根）。 */
  cwd: string
  /** 每会话每文件回注上限；缺省 2（D5 ②，防死循环）。 */
  maxFeedbacksPerFile?: number
}

export type QualityFeedbackHandler = (input: QualityFindingInput) => Promise<FeedbackOutcome>

/** 每会话每文件回注上限缺省值（D5 ②登记值）。 */
export const DEFAULT_MAX_FEEDBACKS_PER_FILE = 2

/**
 * 创建一个会话的回注控制器（每会话实例 = 「每会话每文件」的会话维度；指纹与计数
 * 均为进程内存态，随实例生命周期销毁——SC4）。
 *
 * 处理链（D5 判定顺序）：身份行（仅 session-artifact 首次）→ 空发现即返回 →
 * 陌生既有文件只记录 → P0 门槛 → 指纹去重 → 上限 → 双通道注入 → 记录裁决。
 */
export function createQualityFeedbackHandler(options: QualityFeedbackOptions): QualityFeedbackHandler {
  const maxPerFile = options.maxFeedbacksPerFile ?? DEFAULT_MAX_FEEDBACKS_PER_FILE
  const cwd = options.cwd
  /** 已回注指纹（relPath → 指纹）。 */
  const fingerprints = new Map<string, string>()
  /** 已送达回注次数（relPath → 次数；放弃/去重不消耗额度）。 */
  const feedbackCounts = new Map<string, number>()
  /** 本代已写身份行的路径（同路径多次写盘只记一行身份行）。 */
  const identityWritten = new Set<string>()

  return async (input) => {
    const { kind, relativePath, content, findings } = input

    // ①身份行：快照外写盘经哨兵到达此处即记（零 P0 命中也记，D5④）；同路径一代只记一行。
    if (kind === 'session-artifact' && !identityWritten.has(relativePath)) {
      identityWritten.add(relativePath)
      await appendQualityReportLine(cwd, { type: 'artifact', at: nowIso(), path: relativePath })
    }

    if (findings.length === 0) return { action: 'no-findings' }

    // ②陌生既有文件：只记录不回注（防驱动模型改它从未写过的用户文件，V10）。
    if (kind === 'unrecognized-existing') {
      await recordFindings(cwd, relativePath, findings, 'unrecognized-existing')
      return { action: 'recorded-only', reason: 'unrecognized-existing' }
    }

    // ③P0 门槛：仅 P0 回注；P1/P2 仅记录（D5 ③）。
    const p0 = findings.filter((f) => f.severity === 'P0')
    if (p0.length === 0) {
      await recordFindings(cwd, relativePath, findings, 'p1p2')
      return { action: 'recorded-only', reason: 'p1p2' }
    }

    // ④指纹去重：同内容同发现的重复回注不发生，仅落记录（SI2）。
    const fingerprint = contentFingerprint(content, p0)
    if (fingerprints.get(relativePath) === fingerprint) {
      await recordFindings(cwd, relativePath, findings, 'duplicate')
      return { action: 'recorded-only', reason: 'duplicate' }
    }

    // ⑤每文件上限：仅送达计数（放弃/去重不消耗——额度语义 = 「回注次数」）。
    if ((feedbackCounts.get(relativePath) ?? 0) >= maxPerFile) {
      await recordFindings(cwd, relativePath, findings, 'limit')
      return { action: 'recorded-only', reason: 'limit' }
    }

    // ⑥双通道注入：running → steer（同轮自纠）、否则 followup（开新轮）；查无活 Agent 放弃。
    const message = buildLintFeedbackMessage(relativePath, p0)
    const delivered = deliverFeedback(options.ctx, options.sessionId, message)
    if (delivered === 'steered' || delivered === 'followup') {
      fingerprints.set(relativePath, fingerprint)
      feedbackCounts.set(relativePath, (feedbackCounts.get(relativePath) ?? 0) + 1)
      await recordFindings(cwd, relativePath, findings, 'fed-back')
      return { action: delivered }
    }

    // ⑦放弃回注（no-agent / inject-error）：仅落记录（D5「查无活 Agent 放弃回注仅落记录」）。
    await recordFindings(cwd, relativePath, findings, delivered)
    return { action: 'recorded-only', reason: delivered }
  }
}

/** 按运行裁决落发现记录行（fed-back 时 P0 标 fed-back、其余标 p1p2；其余裁决整批同标）。 */
async function recordFindings(
  cwd: string,
  relativePath: string,
  findings: readonly LintFinding[],
  reason: FindingRecordReason,
): Promise<void> {
  const at = nowIso()
  for (const finding of findings) {
    const lineReason: FindingRecordReason =
      reason === 'fed-back' && finding.severity !== 'P0' ? 'p1p2' : reason
    await appendQualityReportLine(cwd, {
      type: 'finding',
      at,
      path: relativePath,
      severity: finding.severity,
      id: finding.id,
      message: finding.message,
      fix: finding.fix,
      snippet: finding.snippet,
      reason: lineReason,
    })
  }
}

/** 内容指纹 = 文件内容 sha256 + P0 检查项 id 集（排序去重后拼接；D5「文件哈希+命中项 id 集」）。 */
function contentFingerprint(content: string, p0: readonly LintFinding[]): string {
  const ids = [...new Set(p0.map((f) => f.id))].sort()
  return `${createHash('sha256').update(content, 'utf8').digest('hex')}|${ids.join(',')}`
}

/**
 * deliverFeedback 四值结果词表（steered/followup = 已提交投递；no-agent/inject-error =
 * 放弃回注两形态）。导出仅供评论环回注复用（lib/comments/feedback.ts，评论设计 D4 把
 * steered/followup 归并为 delivered 后落 thread.delivery）——词表与行为零变化。
 */
export type DeliveryResult = 'steered' | 'followup' | 'no-agent' | 'inject-error'

/**
 * 双通道注入（AS1 语义：steer = 注入当前轮最近步骤、空闲开新轮；followup = 排队下一轮）。
 * agents 服务读取失败（cordis ctx 读未供给的服务属性即抛，session-cwd.ts 同款纪律）与
 * 查无 Agent 同归 no-agent；注入调用抛错归 inject-error——两类都由调用方落记录不回注。
 * 评论环复用同一分流（评论设计 AX4：插件到会话的投递入口唯一，不另起投递通道）——
 * 本函数是质量环与评论环共用的唯一双通道实现，导出仅为复用，语义零变化。
 */
export function deliverFeedback(
  ctx: unknown,
  sessionId: string,
  message: FeedbackUserMessage,
): DeliveryResult {
  let agents: AgentsServiceLike | undefined
  try {
    const candidate = (ctx as { get?: unknown } | null)?.get
    if (typeof candidate === 'function') agents = (candidate as (n: string) => unknown).call(ctx, 'agents') as AgentsServiceLike | undefined
  } catch {
    return 'no-agent'
  }
  if (agents === null || typeof agents !== 'object' || typeof agents.get !== 'function') return 'no-agent'
  let agent: SessionAgentLike | undefined
  try {
    agent = agents.get(sessionId)
  } catch {
    return 'no-agent'
  }
  if (agent === null || typeof agent !== 'object') return 'no-agent'
  const canSteer = typeof agent.steer === 'function'
  const canFollowup = typeof agent.followup === 'function'
  if (!canSteer && !canFollowup) return 'no-agent'
  try {
    if (agent.status === 'running' && canSteer) {
      agent.steer?.(message)
      return 'steered'
    }
    if (canFollowup) {
      agent.followup?.(message)
      return 'followup'
    }
    return 'no-agent'
  } catch {
    return 'inject-error'
  }
}

function nowIso(): string {
  return new Date().toISOString()
}
