/**
 * 质量环监听器单测（U5；RL2 / RL6 / RL8 / RL10 的单测层 + SI3 生命周期 + D4 过滤防抖）。
 *
 * 断言结构（任务书七组中监听器承担的组：真实写盘触发 / 防抖 / 过滤 / 哨兵 / 快照 / preset
 * 过滤 / report 落盘）：
 * 1. 真实写盘触发（RL2）：临时目录真实写 .html → 防抖后回调携带检查发现与会话产物分类；
 * 2. 防抖合并（D4）：同文件窗口内多次写盘合并为一次检查，窗口外重写为新一次检查；
 * 3. 过滤（D4）：.od-frames 与 .od-quality 任意层级排除、非监听后缀零读取、.htm 与子目录
 *    递归在域内；
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
 */

import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { apply } from '../../lib/index.js'
import {
  createQualityFeedbackHandler,
  qualityReportPath,
  type QualityReportLine,
} from '../../lib/quality/feedback.js'
import { lintArtifact } from '../../lib/quality/lint.js'
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
  /** 等待下一次 onFindings 回调（deferred 队列；先挂后写保证不丢事件）。 */
  nextEvent(): Promise<WatchedFindingsInput>
}

async function startHarness(
  cwd: string,
  opts: { debounceMs?: number; withRealFeedback?: boolean } = {},
): Promise<WatcherHarness> {
  const events: WatchedFindingsInput[] = []
  const destroyReasons: string[] = []
  const warns: string[] = []
  const resolvers: Array<(input: WatchedFindingsInput) => void> = []
  const feedback = opts.withRealFeedback === true
    ? createQualityFeedbackHandler({ ctx: {}, sessionId: 'watcher-test', cwd })
    : undefined
  const controller = await startSessionWatcher({
    cwd,
    ...(opts.debounceMs !== undefined ? { debounceMs: opts.debounceMs } : {}),
    lintArtifact,
    onFindings: (input) => {
      events.push(input)
      void feedback?.(input)
      const resolve = resolvers.shift()
      resolve?.(input)
    },
    onDestroyed: (reason) => destroyReasons.push(reason),
    logger: { warn: (message: string) => warns.push(message) },
  })
  liveWatchers.push(controller)
  return {
    controller,
    events,
    destroyReasons,
    warns,
    nextEvent: () => new Promise<WatchedFindingsInput>((resolve) => resolvers.push(resolve)),
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
    // report.jsonl 落盘：started 行（RL9 监听器生命周期半场）
    await until(() => reportLines(cwd).some((line) => line.type === 'watcher' && line.event === 'started'))
    expect(await readReport(cwd)).toHaveLength(1)
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
    const resumeEvent = h.nextEvent()
    await writeFile(join(cwd, 'a.html'), P0_HTML, 'utf8')
    expect((await resumeEvent).kind).toBe('resume-artifact')

    // ②陌生既有文件触碰 → 快照内且无身份记录 → 只记录不回注
    const strangerEvent = h.nextEvent()
    await writeFile(join(cwd, 'b.html'), P0_HTML, 'utf8')
    expect((await strangerEvent).kind).toBe('unrecognized-existing')

    // ③快照外新写（clean 零命中形态）→ 本会话产物
    const freshEvent = h.nextEvent()
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
    const next = h.nextEvent()
    await writeFile(join(cwd, 'a.html'), P0_HTML, 'utf8')
    expect((await next).kind).toBe('resume-artifact') // 损坏行不破坏 a.html 的豁免
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
    await writeFile(join(cwd, 'loop.html'), P0_HTML, 'utf8')
    await until(() => {
      const report = reportLines(cwd)
      return report.some((line) => line.type === 'artifact' && line.path === 'loop.html') &&
        report.some((line) => line.type === 'finding' && line.reason === 'no-agent')
    })
    const report = reportLines(cwd)
    expect(report.filter((line) => line.type === 'artifact')).toHaveLength(1)
    expect(report.some((line) => line.type === 'finding' && line.id === 'purple-gradient')).toBe(true)
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
