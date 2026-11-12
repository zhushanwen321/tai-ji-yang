/**
 * 质量环监听器单测（U5；RL2 / RL6 / RL8 / RL10 的单测层 + SI3 生命周期 + D4 过滤防抖）。
 *
 * 断言结构（任务书七组中监听器承担的组：真实写盘触发 / 防抖 / 过滤 / 哨兵 / 快照 / preset
 * 过滤 / report 落盘）：
 * 1. 真实写盘触发（RL2）：临时目录真实写 .html → 防抖后回调携带检查发现与会话产物分类；
 * 2. 防抖合并（D4）：同文件窗口内多次写盘合并为一次检查，窗口外重写为新一次检查；
 * 3. 过滤（D4）：.od-frames 与 .od-quality 任意层级排除、非监听后缀零读取、.htm 与子目录
 *    递归在域内；环间隔离（comment-loop 设计包 D7/AX6；comment-loop·RL2 / comment-loop·V7）：
 *    .od-comments 下写文件零质量环回调，同目录产物照常触发（两环互不误触）；
 * 4. 完整性哨兵（RL8 / SI1 ②）：无文末 </html> 的半写零检查零记录（不耗额度留待重查），
 *    补全后同一文件重查放行；哨兵纯函数边界（尾随空白 / 大小写 / 中段标签）；
 * 5. 快照豁免三类命中分类（RL10 / D5④）：resume 上一代产物豁免出快照照常回注、陌生既有
 *    文件只记录不回注、快照外新写零命中也记身份行（真实回注器接线验证身份行落盘）；
 * 6. 生命周期（SI3）：started 行落盘；目录不可达启动自毁（destroyed 行 + 回调 + 不自动重建）；
 * 7. preset 过滤零侵入（RL6 / V7 形态，index.js 接线层）：非设计 preset 零监听零记录、
 *    设计 preset 起监听进检查环（写盘 → 身份行 + 发现行全链）、同会话换代无双监听、
 *    进程卸载统一撤除。
 *
 * 真实性口径：监听/防抖/哨兵/快照全部走真实 fs.watch 与真实写盘（RL2 的「真实写盘触发」
 * 本体）；检查函数用 lintArtifact 正源注入，回注器在第 5/7 组用真实 createQualityFeedbackHandler
 * 接线（agents 服务缺席 → 放弃回注仅落记录，恰好验证记录面）。
 *
 * 锚属性补写集成组（opendesign-anchor-backfill 设计包 §3.3；「锚补写·」前缀编号均属该包，
 * 与上行 assets-quality 域同号编号语义不同）：资格硬边界（锚补写·RL2 / V4，G1 谓词）=
 * 快照内无身份记录文件字节不变零补写行；防自循环二轮幂等（锚补写·RL3 / V6，D5）= 补写
 * 写回触发的二轮事件身份行仍 1 行、回注指纹 duplicate、补写行 inserted=0；检查链次序
 * （锚补写·RL4 / D1）= 注入的 lintArtifact 捕获入参断言 lint 恒见补写后内容；写回前并发
 * 复核（锚补写·RL8 / D6 ③）= backfillAnchors 注入桩在 D6 窗口内同步改写文件（mtime/size
 * 变化）断言写回放弃；resume 资格（锚补写·V8 / D2）= 有身份记录的快照内文件改稿后补写
 * 执行；防线放弃集成（锚补写·V5 / A5 watcher 集成段，纯函数防线组之外的接线层）= 非 UTF-8
 * 与引号不平衡畸形标签产物走真实检查链：文件字节逐字节不变、inserted=0 行落盘（utf8 形态
 * 带 gaveUp:'utf8'、畸形形态记 skipped 计数）+ lint 照常跑原文出 missing-section-anchor。
 * 补写桩真实落盘形态：桩内 writeFileSync 保证模型窗口内写盘先于主链 stat 复核
 * （async writeFile 与复核 stat 竞态会让防线假触发/假放行）。
 * 编号口径：本文件裸编号（U/D/AX/AS/SC/RL/UD/SI/GPK 等）默认属 opendesign-assets-quality 设计包（本轮）；V1 设计包域编号带「V1 设计包 / V1·」前缀；opendesign-comment-loop 设计包编号带「comment-loop·」前缀（环间隔离组的 comment-loop·RL2 / comment-loop·V7 与 assets-quality 域同号 RL2/V7 语义不同：前者 = .od-comments 写入不触发质量环与两环隔离场景，后者 = 真实写盘触发与非设计会话零侵入）；opendesign-anchor-backfill 设计包编号带「锚补写·」前缀。
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { apply } from '../../lib/index.js'
import { backfillAnchors, type BackfillResult } from '../../lib/quality/backfill.js'
import {
  createQualityFeedbackHandler,
  qualityReportPath,
  type QualityReportLine,
} from '../../lib/quality/feedback.js'
import { lintArtifact, type LintFinding } from '../../lib/quality/lint.js'
import {
  DEFAULT_DEBOUNCE_MS,
  isCompleteHtml,
  isWatchedArtifactPath,
  startSessionWatcher,
  type SessionWatcherController,
  type WatchedFindingsInput,
} from '../../lib/quality/watcher.js'

// ── 测试脚手架 ───────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 25
/** 防抖窗口充分倍数：写盘事件到达 + 防抖落定 + 检查回调的最大等待余量。 */
const SETTLE_MS = DEBOUNCE_MS * 8

const P0_HTML =
  '<!doctype html><html><body><div style="background:linear-gradient(90deg,#a855f7,#ec4899)">x</div><h2>✨</h2></body></html>'
const CLEAN_HTML = '<!doctype html><html><body><p>clean page</p></body></html>'
/**
 * 缺锚属性 section 的干净产物（锚补写集成组载体）：两个 section 均无 data-od-id /
 * data-screen-label，无其他 lint 命中——补写后 lint 零发现（missing-section-anchor 对补写
 * 成功的产物恒不触发，锚补写·RL4 的断言前提）。
 */
const UNANCHORED_SECTIONS_HTML =
  '<!doctype html><html><body><section class="hero"><h2>Hero</h2><p>alpha copy</p></section><section class="foot"><p>beta copy</p></section></body></html>'
/**
 * 缺锚属性 section + P0 命中（锚补写·RL3 专用）：补写后仍剩 purple-gradient P0——第一轮
 * 回注放弃（no-agent）、二轮回注走内容指纹 duplicate（D5 三处幂等之一可观测）。
 */
const UNANCHORED_P0_HTML =
  '<!doctype html><html><body><section><div style="background:linear-gradient(90deg,#a855f7,#ec4899)">x</div></section></body></html>'

const tmpRoots: string[] = []
const liveWatchers: SessionWatcherController[] = []

afterEach(async () => {
  while (liveWatchers.length > 0) {
    const watcher = liveWatchers.pop()
    watcher?.dispose()
  }
  while (tmpRoots.length > 0) {
    const root = tmpRoots.pop()
    if (root !== undefined) await rm(root, { recursive: true, force: true })
  }
})

async function makeCwd(prefix = 'od-watcher-'): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), prefix))
  tmpRoots.push(cwd)
  return cwd
}

interface WatcherHarness {
  controller: SessionWatcherController
  events: WatchedFindingsInput[]
  destroyReasons: string[]
  warns: string[]
  /**
   * 等待下一次 onFindings 回调（deferred 队列；先挂后写保证不丢事件）。match 供按
   * relativePath 对位：macOS FSEvents 对监听注册前预置的写盘存在补发事件（实测探针，
   * 见 runlog），无参 FIFO 对位会被补发事件抢配——多文件分类断言须按 path 等待。
   */
  nextEvent(match?: (input: WatchedFindingsInput) => boolean): Promise<WatchedFindingsInput>
  /**
   * 轮询形态的事件等待（预算内轮询 events 队列按序消费）：macOS FSEvents 高频开关
   * watch 流时偶发事件延迟/丢失（U2 实施期压力实测，见 runlog），deferred 形态
   * （nextEvent）在事件不达时硬挂到 vitest 5s 用例超时；轮询形态 3s 预算内给出
   * 明确报错。锚补写集成组统一走此形态。
   */
  waitEvent(match?: (input: WatchedFindingsInput) => boolean): Promise<WatchedFindingsInput>
}

async function startHarness(
  cwd: string,
  opts: {
    debounceMs?: number
    withRealFeedback?: boolean
    /** 回注器 ctx 注入（withRealFeedback 时生效）；缺省 {} = agents 缺席放弃回注形态。 */
    feedbackCtx?: unknown
    /** 检查函数注入（缺省正源 lintArtifact）；锚补写·RL4 时序用例经包装捕获 lint 入参。 */
    lintArtifact?: (html: unknown) => LintFinding[]
    /** 补写函数注入（缺省正源 backfillAnchors）；锚补写·RL8 并发防护用例经此注入 D6 窗口桩。 */
    backfillAnchors?: (buffer: Buffer) => BackfillResult
  } = {},
): Promise<WatcherHarness> {
  const events: WatchedFindingsInput[] = []
  const destroyReasons: string[] = []
  const warns: string[] = []
  const resolvers: Array<{ match?: (input: WatchedFindingsInput) => boolean; resolve: (input: WatchedFindingsInput) => void }> = []
  const feedback = opts.withRealFeedback === true
    ? createQualityFeedbackHandler({ ctx: opts.feedbackCtx ?? {}, sessionId: 'watcher-test', cwd })
    : undefined
  const controller = await startSessionWatcher({
    cwd,
    ...(opts.debounceMs !== undefined ? { debounceMs: opts.debounceMs } : {}),
    lintArtifact: opts.lintArtifact ?? lintArtifact,
    ...(opts.backfillAnchors !== undefined ? { backfillAnchors: opts.backfillAnchors } : {}),
    onFindings: (input) => {
      events.push(input)
      void feedback?.(input)
      // 按对位谓词分派：首个 match 命中（或无谓词）的等待者收事件；不命中者继续等
      // （事件仍进 events 数组，信息不丢）。无谓词等待者永远首位命中 = 既有 FIFO 形态。
      const index = resolvers.findIndex((entry) => entry.match === undefined || entry.match(input))
      if (index >= 0) {
        const [entry] = resolvers.splice(index, 1)
        entry.resolve(input)
      }
    },
    onDestroyed: (reason) => destroyReasons.push(reason),
    logger: { warn: (message: string) => warns.push(message) },
  })
  liveWatchers.push(controller)
  const consumed = { count: 0 }
  return {
    controller,
    events,
    destroyReasons,
    warns,
    nextEvent: (match) =>
      new Promise<WatchedFindingsInput>((resolve) => {
        resolvers.push(match === undefined ? { resolve } : { match, resolve })
      }),
    waitEvent: async (match) => {
      // 队头未消费事件命中 match（或无 match）即消费；不命中 = 等待的事件未到，继续轮询
      await until(() => {
        const head = events[consumed.count]
        return head !== undefined && (match === undefined || match(head))
      })
      const input = events[consumed.count]
      consumed.count += 1
      return input as WatchedFindingsInput
    },
  }
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function until(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now()
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('条件等待超时（fs.watch 事件或落盘未在预算内到达）')
    await delay(10)
  }
}

// ── 1. 真实写盘触发（RL2）────────────────────────────────────────────────────

describe('真实写盘触发（临时目录真实写盘 → 防抖后检查回调）', () => {
  it('写 P0 产物 HTML：回调携带相对路径、会话产物分类与非空 P0 发现', async () => {
    const cwd = await makeCwd()
    const h = await startHarness(cwd)
    const next = h.nextEvent()
    await writeFile(join(cwd, 'index.html'), P0_HTML, 'utf8')
    const input = await next
    expect(input.relativePath).toBe('index.html')
    expect(input.kind).toBe('session-artifact')
    expect(input.content).toBe(P0_HTML)
    expect(input.findings.some((f) => f.id === 'purple-gradient')).toBe(true)
    expect(input.findings.some((f) => f.id === 'emoji-icon')).toBe(true)
    // report.jsonl 落盘：started 行（RL9 监听器生命周期半场）+ 锚补写 no-op 行（锚补写·D7：
    // P0_HTML 无 section，补写器零插入也记 inserted=0 行——「检查过但无需补」可区分语义；
    // 本组实锁该行在场与 inserted=0 值，补写行二轮 no-op 语义另有锚补写·RL3 用例锁值）；
    // 回注侧零动作断言保持：零身份行、零发现行
    await until(() => reportLines(cwd).some((line) => line.type === 'watcher' && line.event === 'started'))
    await until(() => reportLines(cwd).some((line) => line.type === 'anchor-backfill'))
    const report = await readReport(cwd)
    expect(report.filter((line) => line.type === 'watcher')).toHaveLength(1)
    const backfillRows = report.filter((line) => line.type === 'anchor-backfill')
    expect(backfillRows).toHaveLength(1) // D7 no-op 落行：零插入也记（「检查过但无需补」可区分）
    expect(backfillRows[0]?.inserted).toBe(0)
    expect(backfillRows[0]?.path).toBe('index.html')
    expect(report.filter((line) => line.type === 'artifact' || line.type === 'finding')).toHaveLength(0)
  })
})

/** report.jsonl 同步轮询读（until 谓词消费；文件未就绪/未落盘返回空表）。 */
function reportLines(cwd: string): QualityReportLine[] {
  try {
    const raw = readFileSync(qualityReportPath(cwd), 'utf8')
    return raw
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as QualityReportLine)
  } catch {
    return []
  }
}

// ── 2. 防抖合并（D4）────────────────────────────────────────────────────────

describe('同文件事件防抖合并', () => {
  it('窗口内三次写盘合并为一次检查，最终内容以末次写盘为准', async () => {
    const cwd = await makeCwd()
    const h = await startHarness(cwd)
    const next = h.nextEvent()
    await writeFile(join(cwd, 'index.html'), CLEAN_HTML.replace('clean page', 'v1'), 'utf8')
    await delay(DEBOUNCE_MS / 2)
    await writeFile(join(cwd, 'index.html'), CLEAN_HTML.replace('clean page', 'v2'), 'utf8')
    await delay(DEBOUNCE_MS / 2)
    await writeFile(join(cwd, 'index.html'), CLEAN_HTML.replace('clean page', 'v3'), 'utf8')
    const input = await next
    await delay(SETTLE_MS)
    expect(h.events).toHaveLength(1)
    expect(input.content).toBe(CLEAN_HTML.replace('clean page', 'v3'))
  })

  it('窗口外重写为新一次检查（防抖不吞后续事件）', async () => {
    const cwd = await makeCwd()
    const h = await startHarness(cwd)
    const first = h.nextEvent()
    await writeFile(join(cwd, 'index.html'), CLEAN_HTML, 'utf8')
    await first
    const second = h.nextEvent()
    await delay(SETTLE_MS) // 确认窗口完全过期
    await writeFile(join(cwd, 'index.html'), P0_HTML, 'utf8')
    const input = await second
    expect(h.events).toHaveLength(2)
    expect(input.findings.length).toBeGreaterThan(0)
  })
})

// ── 3. 过滤（D4：排除目录 + 后缀 + 递归）────────────────────────────────────

describe('监听过滤（后缀 + 排除目录任意层级 + 子目录递归）', () => {
  it('.od-frames 与 .od-quality 任意层级、非监听后缀零触发；子目录 .htm 递归触发', async () => {
    const cwd = await makeCwd()
    const h = await startHarness(cwd)
    await mkdir(join(cwd, '.od-frames'), { recursive: true })
    await mkdir(join(cwd, '.od-quality'), { recursive: true })
    await mkdir(join(cwd, 'assets', '.od-frames'), { recursive: true })
    await mkdir(join(cwd, 'pages'), { recursive: true })
    await writeFile(join(cwd, '.od-frames', 'frame.html'), P0_HTML, 'utf8')
    await writeFile(join(cwd, '.od-quality', 'notes.html'), P0_HTML, 'utf8')
    await writeFile(join(cwd, 'assets', '.od-frames', 'nested-frame.html'), P0_HTML, 'utf8')
    await writeFile(join(cwd, 'plain.txt'), P0_HTML, 'utf8')
    await writeFile(join(cwd, 'backup.html.bak'), P0_HTML, 'utf8')
    await delay(SETTLE_MS)
    expect(h.events).toHaveLength(0)

    const next = h.nextEvent()
    await writeFile(join(cwd, 'pages', 'nested.htm'), P0_HTML, 'utf8')
    const input = await next
    expect(input.relativePath).toBe('pages/nested.htm')
    expect(input.kind).toBe('session-artifact')
  })

  it('过滤与哨兵纯函数边界直驱（大小写后缀 / 排除段 / 尾随空白 / 中段标签非文末）', () => {
    expect(isWatchedArtifactPath('index.html')).toBe(true)
    expect(isWatchedArtifactPath('PAGE.HTML')).toBe(true)
    expect(isWatchedArtifactPath('notes.htm')).toBe(true)
    expect(isWatchedArtifactPath('sub/dir/x.html')).toBe(true)
    expect(isWatchedArtifactPath('.od-frames/deck-framework.md')).toBe(false)
    expect(isWatchedArtifactPath('.od-quality/report.jsonl')).toBe(false)
    expect(isWatchedArtifactPath('assets/.od-frames/x.html')).toBe(false)
    // .od-comments 环间隔离（comment-loop D7/AX6）：目录内监听后缀文件同样排除（显式
    // 意图声明，不依赖 .json 后缀过滤的侥幸）。
    expect(isWatchedArtifactPath('.od-comments/comments.json')).toBe(false)
    expect(isWatchedArtifactPath('.od-comments/snapshot.html')).toBe(false)
    expect(isWatchedArtifactPath('assets/.od-comments/x.html')).toBe(false)
    expect(isWatchedArtifactPath('x.html.bak')).toBe(false)
    expect(isWatchedArtifactPath('index.ts')).toBe(false)
    expect(isWatchedArtifactPath('')).toBe(false)

    expect(isCompleteHtml('<html><body>x</body></html>')).toBe(true)
    expect(isCompleteHtml('<html><body>x</body></html>\n')).toBe(true)
    expect(isCompleteHtml('<html><body>x</body></html>  \n\t')).toBe(true)
    expect(isCompleteHtml('<HTML><BODY>X</BODY></HTML>')).toBe(true)
    expect(isCompleteHtml('<html><body></html><script>tail</script>')).toBe(false)
    expect(isCompleteHtml('<html><body>half')).toBe(false)
    expect(isCompleteHtml('')).toBe(false)
    expect(DEFAULT_DEBOUNCE_MS).toBe(800) // D4 登记缺省窗口锁定
  })
})

// ── 3b. 环间隔离（comment-loop 设计包 D7/AX6；comment-loop·RL2 / comment-loop·V7 两环互不误触）───────────

/** comment-loop·V7 形态的最小评论数据文件载荷（含一个新线程；schema 合法性由 comments store 单测锁）。 */
const COMMENTS_FILE_JSON = JSON.stringify({
  version: 1,
  threads: [
    {
      id: 'c_watcher-isolation-thread',
      artifactPath: 'index.html',
      text: '主视觉配色太艳，压暗一档',
      replies: [],
      status: 'open',
      createdAt: '2026-11-11T00:00:00.000Z',
      updatedAt: '2026-11-11T00:00:00.000Z',
      delivery: 'pending',
    },
  ],
})

describe('环间隔离（.od-comments 下写文件零质量环回调，comment-loop D7/AX6）', () => {
  it('写 .od-comments/comments.json（含新线程）与目录内 .html：零回调零记录；同目录 P0 产物照常触发（comment-loop·V7 两环互不误触）', async () => {
    const cwd = await makeCwd()
    const h = await startHarness(cwd)
    await mkdir(join(cwd, '.od-comments'), { recursive: true })
    // 评论数据写入（json 后缀）+ 评论目录内监听后缀文件（最强排除形态：意图声明独立于后缀过滤成立）
    await writeFile(join(cwd, '.od-comments', 'comments.json'), COMMENTS_FILE_JSON, 'utf8')
    await writeFile(join(cwd, '.od-comments', 'snapshot.html'), P0_HTML, 'utf8')
    await delay(SETTLE_MS)
    expect(h.events).toHaveLength(0)
    // 记录面零痕迹：无身份行无发现行（started 生命周期行除外——零质量环动作，comment-loop·V7 ③）
    expect((await readReport(cwd)).filter((line) => line.type !== 'watcher')).toEqual([])

    // 监听器仍活的对照面：同会话目录 P0 产物正常进检查环（零回调非监听器死亡所致）
    const next = h.nextEvent()
    await writeFile(join(cwd, 'loop.html'), P0_HTML, 'utf8')
    const input = await next
    expect(input.relativePath).toBe('loop.html')
    expect(input.kind).toBe('session-artifact')
    expect(input.findings.length).toBeGreaterThan(0)
  })
})

// ── 4. 完整性哨兵（RL8 / SI1 ②）─────────────────────────────────────────────

describe('完整性哨兵（半写跳过不耗额度，补全重查放行）', () => {
  it('半写（无文末 </html>）零检查零记录；补全后同一文件重查放行', async () => {
    const cwd = await makeCwd()
    const h = await startHarness(cwd)
    const halfHtml = P0_HTML.replace('</html>', '')
    await writeFile(join(cwd, 'half.html'), halfHtml, 'utf8')
    await delay(SETTLE_MS)
    expect(h.events).toHaveLength(0)
    // 记录面零痕迹：无身份行无发现行（started 生命周期行除外；额度在回注器侧，半写根本不会到达回注器）
    expect((await readReport(cwd)).filter((line) => line.type !== 'watcher')).toEqual([])

    const next = h.nextEvent()
    await writeFile(join(cwd, 'half.html'), P0_HTML, 'utf8') // 补全 → 重查
    const input = await next
    expect(input.relativePath).toBe('half.html')
    expect(input.kind).toBe('session-artifact')
    expect(input.findings.length).toBeGreaterThan(0)
  })

  it('读取失败（写后即删）放弃本次检查，监听器存活（SI1 ①「读取失败放弃」）', async () => {
    const cwd = await makeCwd()
    const h = await startHarness(cwd)
    await writeFile(join(cwd, 'gone.html'), P0_HTML, 'utf8')
    await delay(DEBOUNCE_MS / 2)
    await rm(join(cwd, 'gone.html'), { force: true }) // 防抖落定前删除
    await delay(SETTLE_MS)
    expect(h.events).toHaveLength(0)
    expect(h.controller.destroyed).toBe(false)
    expect(h.destroyReasons).toEqual([])

    const next = h.nextEvent()
    await writeFile(join(cwd, 'back.html'), P0_HTML, 'utf8') // 监听器仍活着
    const input = await next
    expect(input.relativePath).toBe('back.html')
  })
})

// ── 5. 快照豁免三类命中分类（RL10 / D5④）────────────────────────────────────

describe('快照豁免三类命中分类（resume 豁免 / 陌生既有 / 快照外新写）', () => {
  it('三类分类逐类断言：resume-artifact 照常回注、unrecognized-existing 只记录、session-artifact 记身份行', async () => {
    const cwd = await makeCwd()
    // 预置会话目录盘面：a.html = 上一代产物（持身份记录）；b.html = 陌生既有（无身份记录）。
    await mkdir(join(cwd, '.od-quality'), { recursive: true })
    await writeFile(
      qualityReportPath(cwd),
      `${JSON.stringify({ type: 'artifact', at: '2026-11-10T00:00:00.000Z', path: 'a.html' })}\n`,
      'utf8',
    )
    await writeFile(join(cwd, 'a.html'), P0_HTML, 'utf8')
    await writeFile(join(cwd, 'b.html'), P0_HTML, 'utf8')

    const h = await startHarness(cwd) // 启动快照 = {a.html, b.html}，豁免集 = {a.html}

    // ①resume 上一代产物改写（同内容重写）→ 豁免出快照、照常回注通道
    // （按 path 对位等待：FSEvents 对预置写盘有补发事件，裸 FIFO 会被 b.html 的补发检查抢配）
    const resumeEvent = h.nextEvent((input) => input.relativePath === 'a.html')
    await writeFile(join(cwd, 'a.html'), P0_HTML, 'utf8')
    expect((await resumeEvent).kind).toBe('resume-artifact')

    // ②陌生既有文件触碰 → 快照内且无身份记录 → 只记录不回注
    const strangerEvent = h.nextEvent((input) => input.relativePath === 'b.html')
    await writeFile(join(cwd, 'b.html'), P0_HTML, 'utf8')
    expect((await strangerEvent).kind).toBe('unrecognized-existing')

    // ③快照外新写（clean 零命中形态）→ 本会话产物
    const freshEvent = h.nextEvent((input) => input.relativePath === 'c.html')
    await writeFile(join(cwd, 'c.html'), CLEAN_HTML, 'utf8')
    expect((await freshEvent).kind).toBe('session-artifact')
  })

  it('真实回注器接线：快照外新写零命中也记身份行（D5④ 身份记录是回查数据不是发现）', async () => {
    const cwd = await makeCwd()
    const h = await startHarness(cwd, { withRealFeedback: true }) // agents 缺席 → 放弃回注仅落记录
    await writeFile(join(cwd, 'fresh.html'), CLEAN_HTML, 'utf8')
    await until(() => {
      const report = reportLines(cwd)
      return report.some((line) => line.type === 'artifact' && line.path === 'fresh.html')
    })
    const report = reportLines(cwd)
    expect(report.filter((line) => line.type === 'artifact')).toHaveLength(1)
    expect(report.filter((line) => line.type === 'finding')).toHaveLength(0) // 零命中零发现行
  })

  it('豁免集构建自 report.jsonl 实盘（脏行容忍）：损坏行不影响其余 artifact 行的豁免语义', async () => {
    const cwd = await makeCwd()
    await mkdir(join(cwd, '.od-quality'), { recursive: true })
    await writeFile(
      qualityReportPath(cwd),
      [
        '{"type":"artifact","at":"2026-11-10T00:00:00.000Z","path":"a.html"}',
        '{"type":"finding","trunc', // 半行损坏
        `${JSON.stringify({ type: 'finding', at: '2026-11-10T00:00:01.000Z', path: 'a.html', severity: 'P0', id: 'purple-gradient', message: 'm', reason: 'no-agent' })}`,
        '',
      ].join('\n'),
      'utf8',
    )
    await writeFile(join(cwd, 'a.html'), P0_HTML, 'utf8')
    const h = await startHarness(cwd)
    // fs.watch（macOS FSEvents）流激活间隙（同锚补写·V8 用例的实测加固，见 runlog）：
    // 注册后零间隙写盘的事件可丢失；轮询形态等待替代 deferred 硬挂（时序加固，断言语义不变）
    await delay(100)
    await writeFile(join(cwd, 'a.html'), P0_HTML, 'utf8')
    expect((await h.waitEvent((input) => input.relativePath === 'a.html')).kind).toBe('resume-artifact') // 损坏行不破坏 a.html 的豁免
  })
})

// ── 6. 生命周期（SI3：started/destroyed 落盘 + 目录不可达自毁不自动重建）──────

describe('监听器生命周期（进程 effect + 自毁 + 生命周期行落盘）', () => {
  it('started 行带 cwd 落盘（doctor ⑪ 监听器状态的登记观测点）', async () => {
    const cwd = await makeCwd()
    await startHarness(cwd)
    await until(() => reportLines(cwd).some((line) => line.type === 'watcher' && line.event === 'started'))
    const started = reportLines(cwd).find(
      (line): line is Extract<QualityReportLine, { type: 'watcher' }> => line.type === 'watcher',
    )
    expect(started?.cwd).toBe(cwd)
  })

  it('目录不可达启动自毁：destroyed 控制器 + destroyed 行（reason start-failed）+ 回调，不自动重建', async () => {
    const root = await makeCwd()
    const missing = join(root, 'not-exists-session-dir')
    const destroyReasons: string[] = []
    const controller = await startSessionWatcher({
      cwd: missing,
      debounceMs: DEBOUNCE_MS,
      lintArtifact,
      onDestroyed: (reason) => destroyReasons.push(reason),
    })
    liveWatchers.push(controller)
    expect(controller.destroyed).toBe(true)
    expect(controller.destroyedReason?.startsWith('start-failed:')).toBe(true)
    expect(destroyReasons).toHaveLength(1)
    // 生命周期行落盘（appendQualityReportLine 自动建目录承载证据）
    await until(() => reportLines(missing).some((line) => line.type === 'watcher' && line.event === 'destroyed'))
    const destroyed = reportLines(missing).find(
      (line): line is Extract<QualityReportLine, { type: 'watcher' }> => line.type === 'watcher' && line.event === 'destroyed',
    )
    expect(destroyed?.reason?.startsWith('start-failed:')).toBe(true)
  })

  it('dispose 后写入零检查（进程卸载通道；dispose 是优雅撤销非自毁）', async () => {
    const cwd = await makeCwd()
    const h = await startHarness(cwd)
    const before = h.nextEvent()
    await writeFile(join(cwd, 'live.html'), P0_HTML, 'utf8')
    await before
    h.controller.dispose()
    await writeFile(join(cwd, 'after.html'), P0_HTML, 'utf8')
    await delay(SETTLE_MS)
    expect(h.events).toHaveLength(1)
    expect(h.controller.destroyed).toBe(false) // 显式 dispose ≠ 自毁
    expect(h.destroyReasons).toEqual([])
  })

  it('目录不可达的自毁与 watch-error 自毁共用 selfDestruct 通道（darwin 实测：rm 被监听目录不触发 error 事件，运行期通道无确定性触发手段，见 runlog）', async () => {
    // 本用例固化已实测的 darwin 行为形态：目录删除只产生 change 事件（filename=目录名，
    // 被后缀过滤忽略），监听器不自毁不报错——SI3 的 watch-error 分支由 start-failed 用例
    // 同通道覆盖（同一 selfDestruct 实现），此处断言删除目录不产生误报事件。
    const cwd = await makeCwd()
    const sub = join(cwd, 'removed')
    await mkdir(sub, { recursive: true })
    const h = await startHarness(cwd)
    await writeFile(join(sub, 'gone.html'), P0_HTML, 'utf8') // 子目录删除前的写盘事件
    await rm(sub, { recursive: true, force: true })
    await delay(SETTLE_MS)
    expect(h.controller.destroyed).toBe(false)
    expect(h.destroyReasons).toEqual([])
    expect(h.events).toHaveLength(0) // 事件若在防抖后落定，文件已删 → 读取失败放弃，零回调
  })
})

// ── 7. preset 过滤零侵入（RL6 / V7 形态；index.js 接线层）────────────────────

/** index.js apply() 的宿主 ctx 双打（effect/on/logger/sessions 最小面）。 */
function makeHostStub(root: string, sessionId: string): {
  ctx: unknown
  emit(selectedSessionId: string, presetId: string): void
  disposeAll(): void
  logs: { debug: string[]; warn: string[]; error: string[] }
} {
  const effectDisposers: Array<() => void> = []
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
  const logs = { debug: [] as string[], warn: [] as string[], error: [] as string[] }
  const ctx = {
    sessions: {
      get: (id: string): unknown => (id === sessionId ? { header: { cwd: root } } : undefined),
    },
    logger: {
      debug: (message: string) => logs.debug.push(message),
      warn: (message: string) => logs.warn.push(message),
      error: (message: string) => logs.error.push(message),
    },
    effect(factory: () => unknown, _label?: string): unknown {
      const disposer = factory()
      if (typeof disposer === 'function') effectDisposers.push(disposer as () => void)
      return disposer
    },
    on(event: string, handler: (...args: unknown[]) => void): () => void {
      const list = listeners.get(event) ?? []
      list.push(handler)
      listeners.set(event, list)
      return () => undefined
    },
  }
  return {
    ctx,
    emit(selectedSessionId: string, presetId: string): void {
      for (const handler of listeners.get('agent-preset/selected') ?? []) handler(selectedSessionId, presetId)
    },
    disposeAll(): void {
      for (const disposer of effectDisposers) disposer()
    },
    logs,
  }
}

describe('preset 过滤零侵入（index.js 接线：非设计 preset 零监听零注入）', () => {
  it('非设计 preset（standard）：零监听零记录，写 P0 产物也无任何检查痕迹（V7 形态）', async () => {
    const cwd = await makeCwd()
    const host = makeHostStub(cwd, 'plain-session')
    apply(host.ctx)
    host.emit('plain-session', 'standard')
    await delay(SETTLE_MS)
    expect(await readReport(cwd)).toEqual([])
    await writeFile(join(cwd, 'intrusion.html'), P0_HTML, 'utf8')
    await delay(SETTLE_MS)
    expect(await readReport(cwd)).toEqual([]) // 零身份行零发现行零生命周期行
    host.disposeAll()
  })

  it('设计 preset（opendesign）：起监听进检查环——写盘 → 身份行 + 发现行全链（回注器放弃仅落记录形态）', async () => {
    const cwd = await makeCwd()
    const host = makeHostStub(cwd, 'design-session')
    apply(host.ctx)
    host.emit('design-session', 'opendesign')
    await until(() => reportLines(cwd).some((line) => line.type === 'watcher' && line.event === 'started'))
    // SC7 进程级观测（监听器启动口）：启动成功一行 debug（自毁口 warn 在 onDestroyed 接线）。
    expect(host.logs.debug.some((m) => m.includes('质量环监听已启动'))).toBe(true)
    await writeFile(join(cwd, 'loop.html'), P0_HTML, 'utf8')
    await until(() => {
      const report = reportLines(cwd)
      return report.some((line) => line.type === 'artifact' && line.path === 'loop.html') &&
        report.some((line) => line.type === 'finding' && line.reason === 'no-agent')
    })
    const report = reportLines(cwd)
    expect(report.filter((line) => line.type === 'artifact')).toHaveLength(1)
    expect(report.some((line) => line.type === 'finding' && line.id === 'purple-gradient')).toBe(true)
    // SC7 进程级观测（回注放弃口）：no-agent 放弃一行 debug——agents 缺席 → 查无活 Agent。
    // 日志打点在 feedback(input).then 里、晚于发现行落盘（index.js 接线实读）——按 until 等
    // 待而非断言即时成立（时序加固，断言语义不变）。
    await until(() => host.logs.debug.some((m) => m.includes('回注放弃（查无活 Agent')))
    host.disposeAll()
  })

  it('SC7 回注放弃口分级：注入调用抛错（inject-error）记 warn 一行，发现仍落记录', async () => {
    const cwd = await makeCwd()
    const host = makeHostStub(cwd, 'inject-error-session')
    // 注入 agents 服务：Agent 在册且 running，steer 调用抛错 → deliverFeedback 归 inject-error。
    const ctxWithAgents = host.ctx as { get?: (name: string) => unknown }
    ctxWithAgents.get = () => ({
      get: () => ({ status: 'running', steer: () => { throw new Error('boom') } }),
    })
    apply(host.ctx)
    host.emit('inject-error-session', 'opendesign')
    await until(() => reportLines(cwd).some((line) => line.type === 'watcher' && line.event === 'started'))
    await writeFile(join(cwd, 'err.html'), P0_HTML, 'utf8')
    await until(() =>
      reportLines(cwd).some((line) => line.type === 'finding' && line.path === 'err.html' && line.reason === 'inject-error'),
    )
    // warn 打点在 feedback(input).then 里、晚于发现行落盘（index.js 接线实读）——until 等待
    // 而非断言即时成立（时序加固，断言语义不变）；negative 断言（debug 零命中）在 warn 到达
    // 后检查才有效。
    await until(() => host.logs.warn.some((m) => m.includes('回注放弃（注入调用失败')))
    expect(host.logs.debug.some((m) => m.includes('回注放弃（查无活 Agent'))).toBe(false)
    host.disposeAll()
  })

  it('同会话重复 selected：换代无双监听（两次触发后写盘只产生一套记录）', async () => {
    const cwd = await makeCwd()
    const host = makeHostStub(cwd, 'resume-session')
    apply(host.ctx)
    host.emit('resume-session', 'opendesign')
    host.emit('resume-session', 'opendesign') // resume 重组路径的重复应答
    await until(() => reportLines(cwd).some((line) => line.type === 'watcher' && line.event === 'started'))
    await delay(SETTLE_MS) // 让两代启动（含竞态窗口）全部落定
    const startedBefore = reportLines(cwd).filter((line) => line.type === 'watcher' && line.event === 'started').length
    await writeFile(join(cwd, 'gen.html'), P0_HTML, 'utf8')
    await until(() => reportLines(cwd).some((line) => line.type === 'artifact' && line.path === 'gen.html'))
    await delay(SETTLE_MS) // 若双监听存在，第二套记录会在此窗口内出现
    expect(startedBefore).toBeGreaterThanOrEqual(1)
    expect(reportLines(cwd).filter((line) => line.type === 'artifact')).toHaveLength(1)
    expect(reportLines(cwd).filter((line) => line.type === 'finding' && line.path === 'gen.html')).toHaveLength(2) // P0 两项各一行，且只有一套
    host.disposeAll()
  })

  it('进程卸载：effect disposer 撤除全部监听器，后续写盘零检查', async () => {
    const cwd = await makeCwd()
    const host = makeHostStub(cwd, 'dispose-session')
    apply(host.ctx)
    host.emit('dispose-session', 'opendesign')
    await until(() => reportLines(cwd).some((line) => line.type === 'watcher' && line.event === 'started'))
    host.disposeAll()
    await writeFile(join(cwd, 'after-dispose.html'), P0_HTML, 'utf8')
    await delay(SETTLE_MS)
    const report = reportLines(cwd)
    expect(report.some((line) => line.type === 'artifact' && line.path === 'after-dispose.html')).toBe(false)
    expect(report.some((line) => line.type === 'finding' && line.path === 'after-dispose.html')).toBe(false)
  })
})

// ── 8. 锚补写集成组（opendesign-anchor-backfill 设计包；锚补写·RL2 / RL3 / RL4 / RL8 / V8）──

/** 提取 report 中的 anchor-backfill 行（含类型收窄）。 */
function backfillLines(cwd: string): Array<Extract<QualityReportLine, { type: 'anchor-backfill' }>> {
  return reportLines(cwd).filter(
    (line): line is Extract<QualityReportLine, { type: 'anchor-backfill' }> => line.type === 'anchor-backfill',
  )
}

describe('锚补写资格硬边界（锚补写·RL2 / V4：unrecognized-existing 字节不变零补写行）', () => {
  it('快照内无身份记录文件写盘：文件字节逐字节一致、report 无 anchor-backfill 行、kind 断言', async () => {
    const cwd = await makeCwd()
    await writeFile(join(cwd, 'user-page.html'), UNANCHORED_SECTIONS_HTML, 'utf8') // 快照内预置（无身份记录）
    const h = await startHarness(cwd)
    const rewritten = UNANCHORED_SECTIONS_HTML.replace('alpha copy', 'alpha edited')
    await writeFile(join(cwd, 'user-page.html'), rewritten, 'utf8') // 用户编辑自己的文件
    const input = await h.waitEvent((candidate) => candidate.relativePath === 'user-page.html')
    expect(input.kind).toBe('unrecognized-existing') // G1 谓词：绝不补写
    await delay(SETTLE_MS) // 等检查链（含潜在违规补写）全部落定
    expect(await readFile(join(cwd, 'user-page.html'), 'utf8')).toBe(rewritten) // 逐字节一致
    expect(backfillLines(cwd)).toEqual([]) // V4：不执行补写则不记行
    expect(h.warns).toEqual([]) // 无补写异常降级（步骤整体跳过非异常路径）
  })

  it('对照面：同款缺属性产物快照外新写（session-artifact）正常补写——资格谓词分类驱动成立', async () => {
    const cwd = await makeCwd()
    const h = await startHarness(cwd)
    await writeFile(join(cwd, 'landing.html'), UNANCHORED_SECTIONS_HTML, 'utf8')
    const input = await h.waitEvent((candidate) => candidate.relativePath === 'landing.html')
    expect(input.kind).toBe('session-artifact')
    expect(input.content).toContain('data-od-id="od-sec-') // 回注载荷 = 补写后文本（锚补写·D1）
    await until(() => backfillLines(cwd).length > 0)
    const lines = backfillLines(cwd)
    expect(lines[0]?.inserted).toBe(2)
    expect(lines[0]?.skipped).toBe(0)
    expect(await readFile(join(cwd, 'landing.html'), 'utf8')).toContain('data-od-id="od-sec-') // 已写回
  })
})

describe('锚补写防自循环二轮幂等（锚补写·RL3 / V6：二轮检查链无重复副作用，D5 零状态收敛）', () => {
  it('第一轮补写 inserted=1 + 写回；补写触发的二轮事件自动走全链：身份行仍 1 行、回注指纹 duplicate、补写行 inserted=0', async () => {
    const cwd = await makeCwd()
    // 回注 ctx 注入在册 running Agent（steer 成功）：第一轮真实送达 fed-back 并记录内容
    // 指纹（指纹仅在投递成功后登记，feedback.ts 实读）——二轮同内容同发现走指纹 duplicate
    // 不再投递（D5 三处幂等之「回注内容指纹 duplicate」的可观测锁值）
    const steered: unknown[] = []
    const h = await startHarness(cwd, {
      withRealFeedback: true,
      // ctx.get('agents') → agents registry（内含 get(sessionId) → Agent）双层形态（deliverFeedback 实读对齐）
      feedbackCtx: {
        get: () => ({ get: () => ({ status: 'running', steer: (message: unknown) => steered.push(message) }) }),
      },
    })
    await writeFile(join(cwd, 'landing.html'), UNANCHORED_P0_HTML, 'utf8')
    const first = await h.waitEvent((candidate) => candidate.relativePath === 'landing.html')
    expect(first.kind).toBe('session-artifact')
    // 二轮事件（补写写回触发）经防抖进链：等二轮 anchor-backfill 行（inserted=0）落盘
    await until(() => backfillLines(cwd).length >= 2)
    await until(() =>
      reportLines(cwd).some((line) => line.type === 'finding' && line.path === 'landing.html' && line.reason === 'duplicate'),
    )
    await delay(SETTLE_MS) // 若有第三轮重复副作用在此窗口暴露
    const lines = backfillLines(cwd)
    expect(lines).toHaveLength(2) // 恰两轮：第一轮补写 + 二轮 no-op（D5：无第三轮写盘）
    expect(lines[0]?.inserted).toBe(1)
    expect(lines[1]?.inserted).toBe(0)
    expect(lines[1]?.skipped).toBe(1) // 二轮 tagged 恒等于 sections 数（补写后全带属性）
    // 身份行一代一行（identityWritten 去重，D5 幂等之一）
    expect(reportLines(cwd).filter((line) => line.type === 'artifact' && line.path === 'landing.html')).toHaveLength(1)
    // 回注不增（D5 幂等之二）：第一轮真实投递 fed-back，二轮指纹 duplicate 仅落记录不投递
    expect(steered).toHaveLength(1) // 恰一次投递（第二轮被指纹去重拦下）
    const findings = reportLines(cwd).filter((line) => line.type === 'finding' && line.path === 'landing.html')
    expect(findings.some((line) => line.reason === 'fed-back')).toBe(true)
    expect(findings.some((line) => line.reason === 'duplicate')).toBe(true)
    // 两轮检查链都到达回注回调（events 承载；二轮内容与一轮一致是指纹 duplicate 的前提）
    expect(h.events.length).toBeGreaterThanOrEqual(2)
    expect(h.events[1]?.content).toBe(h.events[0]?.content)
  })

  it('属性值含 > 的产物二轮同样收敛（tagged 判定窗口 = 完整标签串）：首轮 inserted=1、二轮 no-op skipped=1、磁盘恰一个锚属性', async () => {
    const cwd = await makeCwd()
    const h = await startHarness(cwd)
    // AS12 形态：data-note="a>b" 引号配对完整（可补写形态），首轮补写属性落在
    // SECTION_TAG_RE 的 [^>]* 截断点之后——若按截断串判定，二轮看不到补写属性会
    // 再插入 -2 后缀属性（每轮 +31 字节无限膨胀），本用例锁完整串判定的收敛行为
    const html = '<!doctype html><html><body><section data-note="a>b"><p>x</p></section></body></html>'
    await writeFile(join(cwd, 'quoted.html'), html, 'utf8')
    const input = await h.waitEvent((candidate) => candidate.relativePath === 'quoted.html')
    expect(input.kind).toBe('session-artifact')
    expect(input.content).toContain('data-od-id="od-sec-') // 首轮补写后内容进回注
    // 二轮事件（补写写回触发）经防抖进链：等二轮 anchor-backfill 行落盘
    await until(() => backfillLines(cwd).length >= 2)
    await delay(SETTLE_MS) // 若有第三轮重复副作用在此窗口暴露
    const lines = backfillLines(cwd)
    expect(lines).toHaveLength(2) // 恰两轮：首轮补写 + 二轮 no-op（截断窗口判定会 3+ 行不收敛）
    expect(lines[0]?.inserted).toBe(1)
    expect(lines[1]?.inserted).toBe(0)
    expect(lines[1]?.skipped).toBe(1) // 二轮完整标签串含补写属性 → tagged 跳过
    const final = await readFile(join(cwd, 'quoted.html'), 'utf8')
    expect(final.match(/data-od-id=/g)).toHaveLength(1) // 磁盘恰一个锚属性（无膨胀）
  })
})

describe('锚补写检查链次序（锚补写·RL4：lint 恒见补写后内容，D1 次序锁值）', () => {
  it('缺属性产物进检查链：注入的 lintArtifact 捕获入参含 data-od-id、missing-section-anchor 零发现、回注载荷同为补写后文本', async () => {
    const cwd = await makeCwd()
    const lintInputs: unknown[] = []
    const wrappedLint = (html: unknown): LintFinding[] => {
      lintInputs.push(html)
      return lintArtifact(html)
    }
    const h = await startHarness(cwd, { lintArtifact: wrappedLint })
    await writeFile(join(cwd, 'landing.html'), UNANCHORED_SECTIONS_HTML, 'utf8')
    const input = await h.waitEvent((candidate) => candidate.relativePath === 'landing.html')
    // lint 收到的是补写后文本（含锚属性），非磁盘原文——D1 次序「补写在 lint 前」的直接锁值
    expect(lintInputs.length).toBeGreaterThanOrEqual(1)
    for (const lintInput of lintInputs) {
      expect(typeof lintInput).toBe('string')
      expect(String(lintInput)).toContain('data-od-id="od-sec-')
    }
    // 补写后 tagged 恒等于 sections 数：missing-section-anchor 零发现
    expect(input.findings.some((finding) => finding.id === 'missing-section-anchor')).toBe(false)
    // 回注载荷 content 同为补写后文本（二轮回注指纹一致的前提）
    expect(input.content).toContain('data-od-id="od-sec-')
    // 补写行如实：inserted=2 skipped=0 无防线放弃
    await until(() => backfillLines(cwd).length > 0)
    expect(h.warns).toEqual([])
  })
})

describe('锚补写写回前并发复核（锚补写·RL8 / D6 ③：读-改-写竞争放弃补写保模型新内容）', () => {
  it('读盘与写回之间文件被改写（mtime/size 变）：第一轮写回放弃、模型窗口内新写内容不被覆盖、补写行 inserted=0', async () => {
    const cwd = await makeCwd()
    // 模型在 D6 窗口内的新写盘：body 内注释标记区分新旧内容（标记须在 </html> 之前——
    // 哨兵判定文末 </html>，尾后注释会把二轮检查拦成半写形态）
    const modelRewrite = UNANCHORED_SECTIONS_HTML.replace('</body>', '<!-- model wrote during window --></body>')
    let raceArmed = true
    const raceStub = (buffer: Buffer): BackfillResult => {
      // 桩 = backfillAnchors 注入点（设计 §3.3 U2 登记）：仅在第一轮（武装态）于补写计算
      // 完成后、写回复核前的 D6 窗口内同步落盘模型新写内容（writeFileSync 保证先于主链
      // stat 复核——async 写与复核 stat 竞态会让防线假放行），再调真实补写器返回正常结果；
      // 二轮起解除武装走纯正源（否则窗口内写盘每轮重现，防线次次放弃永不补写）。勿用
      // lintArtifact 惯性选桩：lint 在写回之后执行，窗口构造不出来。
      if (raceArmed) {
        raceArmed = false
        writeFileSync(join(cwd, 'race.html'), modelRewrite, 'utf8')
      }
      return backfillAnchors(buffer)
    }
    const h = await startHarness(cwd, { backfillAnchors: raceStub })
    await writeFile(join(cwd, 'race.html'), UNANCHORED_SECTIONS_HTML, 'utf8')
    const input = await h.waitEvent((candidate) => candidate.relativePath === 'race.html')
    expect(input.kind).toBe('session-artifact')
    // 两轮补写行落定：第一轮放弃行（inserted=0）+ 二轮重查补写行（模型新写盘自身触发的事件）
    await until(() => backfillLines(cwd).length >= 2)
    await delay(SETTLE_MS)
    const lines = backfillLines(cwd)
    expect(lines[0]?.inserted).toBe(0) // D6 ③：复核不一致放弃，记 inserted=0 行（下次事件重查）
    expect(lines[1]?.inserted).toBe(2) // 二轮对模型新写内容正常补写（「下次事件重查」成立）
    // 模型新写内容存活未被第一轮旧内容覆盖：注释标记（仅存在于 modelRewrite）仍在盘上，
    // 且已被二轮补写——反证：若第一轮写回成功，modelRewrite 会被读盘原文的补写版覆盖、标记消失
    const final = await readFile(join(cwd, 'race.html'), 'utf8')
    expect(final).toContain('model wrote during window')
    expect(final).toContain('data-od-id="od-sec-')
  })
})

describe('锚补写 resume 产物资格（锚补写·V8 / D2：第二代会话改稿补写执行）', () => {
  it('身份记录命中的快照内文件改稿：resume-artifact 补写执行——写回 + 行落盘 + 回注载荷为补写后文本', async () => {
    const cwd = await makeCwd()
    await mkdir(join(cwd, '.od-quality'), { recursive: true })
    await writeFile(
      qualityReportPath(cwd),
      `${JSON.stringify({ type: 'artifact', at: '2026-11-11T00:00:00.000Z', path: 'landing.html' })}\n`,
      'utf8',
    )
    await writeFile(join(cwd, 'landing.html'), UNANCHORED_SECTIONS_HTML, 'utf8') // 快照内 + 身份记录 → resume
    const h = await startHarness(cwd)
    // fs.watch（macOS FSEvents）注册后流激活有延迟——激活前的写盘事件实测可丢失（U2 压力
    // 实测，见 runlog），间隙给流激活留时间（生产形态：监听器启动与首写盘不会同毫秒发生）
    await delay(100)
    const rewritten = UNANCHORED_SECTIONS_HTML.replace('alpha copy', 'alpha v2')
    await writeFile(join(cwd, 'landing.html'), rewritten, 'utf8') // 模型改稿重写（丢弃属性）
    const input = await h.waitEvent((candidate) => candidate.relativePath === 'landing.html')
    expect(input.kind).toBe('resume-artifact') // D2 第二类资格
    expect(input.content).toContain('data-od-id="od-sec-') // 补写后内容进回注通道（session-artifact 同款链路）
    await until(() => backfillLines(cwd).length > 0)
    const lines = backfillLines(cwd)
    expect(lines[0]?.inserted).toBe(2)
    expect(lines[0]?.skipped).toBe(0)
    expect(await readFile(join(cwd, 'landing.html'), 'utf8')).toContain('data-od-id="od-sec-') // 已写回
    expect(h.warns).toEqual([])
  })
})

describe('锚补写异常降级（锚补写·D6 显式新形态裁决：未预期异常不拖垮检查链）', () => {
  it('补写步骤抛错：warn 记日志、检查链继续用原文跑 lint 与回注、不写补写行（gaveUp 词表保持封闭）', async () => {
    const cwd = await makeCwd()
    const h = await startHarness(cwd, {
      // 注入桩直接抛错 = 防线之外的 bug 形态（区别于防线放弃：防线放弃记行，异常不记行）
      backfillAnchors: () => {
        throw new Error('boom')
      },
    })
    await writeFile(join(cwd, 'boom.html'), UNANCHORED_SECTIONS_HTML, 'utf8')
    const input = await h.waitEvent((candidate) => candidate.relativePath === 'boom.html')
    // 检查链未中断（补写位于链中，异常处置比 lint 异常的中断先例更宽）：onFindings 照常收到
    expect(input.kind).toBe('session-artifact')
    expect(input.content).toBe(UNANCHORED_SECTIONS_HTML) // 原文直通（lint 与回注都消费原文）
    expect(input.findings.some((finding) => finding.id === 'missing-section-anchor')).toBe(true) // lint 跑的是原文——补写未生效的直接证据
    expect(h.warns.some((message) => message.includes('锚属性补写异常'))).toBe(true)
    await delay(SETTLE_MS)
    expect(backfillLines(cwd)).toEqual([]) // 不写 report 行（异常不是防线判定结果）
    expect(await readFile(join(cwd, 'boom.html'), 'utf8')).toBe(UNANCHORED_SECTIONS_HTML) // 字节不变
  })
})

describe('锚补写防线放弃集成（锚补写·V5 / A5 watcher 集成段：防线触发保原字节 + 行落盘 + lint 照常）', () => {
  it('非 UTF-8 产物（中段坏字节 + 文末合法 </html>）：文件字节逐字节不变、补写行 inserted=0 gaveUp=utf8、lint 照常出 missing-section-anchor', async () => {
    const cwd = await makeCwd()
    const goodSource = '<!doctype html><html><body><section class="hero"><p>copy </p></section></body></html>'
    const bytes = Array.from(Buffer.from(goodSource, 'utf8'))
    bytes.splice(goodSource.indexOf('</p>'), 0, 0xff, 0xfe) // 文本节点中段坏字节（纯 ASCII fixture：字符位 = 字节位）
    const bad = Buffer.from(bytes)
    const h = await startHarness(cwd)
    await writeFile(join(cwd, 'broken-utf8.html'), bad)
    const input = await h.waitEvent((candidate) => candidate.relativePath === 'broken-utf8.html')
    expect(input.kind).toBe('session-artifact') // 补写步骤有资格执行（防线放弃发生在步骤内，非资格跳过）
    // 原文本直通（V5：检查链不中断，lint 与回注消费解码原文——防线放弃返回值恒为读盘文本）
    expect(input.content).toBe(bad.toString('utf8'))
    // lint 照常跑原文（V5：missing-section-anchor 转补写失败的后备观测信号，防线放弃的文件它仍会报）
    expect(input.findings.some((finding) => finding.id === 'missing-section-anchor')).toBe(true)
    await until(() => backfillLines(cwd).length > 0)
    await delay(SETTLE_MS) // 若有后续轮次补写行（重复事件重查）在此窗口落定后一并检视
    const lines = backfillLines(cwd)
    expect(lines.length).toBeGreaterThanOrEqual(1)
    expect(lines[0]?.path).toBe('broken-utf8.html')
    expect(lines[0]?.inserted).toBe(0) // 防线放弃不写盘：D6 ① 的行侧契约
    expect(lines[0]?.skipped).toBe(0)
    expect(lines[0]?.gaveUp).toBe('utf8') // gaveUp 词表唯一值如实落行（D7）
    // 逐字节不变（V5 ③：写盘后文件与写入 Buffer 全字节比对——解码替换被防线拦在写盘之前）
    expect((await readFile(join(cwd, 'broken-utf8.html'))).equals(bad)).toBe(true)
    expect(h.warns).toEqual([]) // 防线放弃是设计内判定结果（fail-open 不报错不告警，区别于异常降级）
  })

  it('引号不平衡畸形标签产物：文件字节逐字节不变、补写行 inserted=0 + skipped 计数、lint 照常出 missing-section-anchor', async () => {
    const cwd = await makeCwd()
    // 属性值内含 > 且引号全文未配对（findTagEnd 扫到文末无上下文外 >）→ 畸形计入 skipped
    const malformed = '<!doctype html><html><body><section data-note="unclosed><p>x</p></section></body></html>'
    const h = await startHarness(cwd)
    await writeFile(join(cwd, 'malformed.html'), malformed, 'utf8')
    const input = await h.waitEvent((candidate) => candidate.relativePath === 'malformed.html')
    expect(input.kind).toBe('session-artifact')
    expect(input.content).toBe(malformed) // 原文直通（零插入形态，检查链行为与现状一致）
    expect(input.findings.some((finding) => finding.id === 'missing-section-anchor')).toBe(true)
    await until(() => backfillLines(cwd).length > 0)
    await delay(SETTLE_MS)
    const lines = backfillLines(cwd)
    expect(lines.length).toBeGreaterThanOrEqual(1)
    expect(lines[0]?.path).toBe('malformed.html')
    expect(lines[0]?.inserted).toBe(0)
    expect(lines[0]?.skipped).toBe(1) // 畸形标签计入跳过（V5：inserted=0 + skipped 计数）
    expect(lines[0]?.gaveUp).toBeUndefined() // 非 UTF-8 防线形态之外不落 gaveUp（词表封闭：undefined 不落键）
    expect(await readFile(join(cwd, 'malformed.html'), 'utf8')).toBe(malformed) // 逐字节一致
    expect(h.warns).toEqual([])
  })
})
