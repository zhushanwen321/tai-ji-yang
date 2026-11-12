/**
 * 质量环监听器（U5；机制权威 = 设计 D4 / 错配处置 SI1 / SI3 / 快照豁免 D5④）。
 *
 * 职责：会话选定设计 preset 时对会话目录起 fs.watch 递归监听（宿主 agent-preset/selected
 * 事件接线在 lib/index.js；selected 含 resume 重组路径——resume 时监听器同样启动，上一代
 * 产物经身份记录豁免出快照，是声明行为非缺陷）。过滤链 = .html/.htm 后缀 − .od-frames/
 * （材质化根）− .od-quality/（检查记录目录）− .od-comments/（评论数据目录，comment-loop
 * 设计包 D7/AX6 环间隔离）；同文件事件防抖合并（缺省 800ms，实施期可调
 * 参数）；完整性哨兵 = 文末 </html> 判定（缺失视为可能半写：跳过本次、不耗回注额度、
 * 留待下次事件重查——SI1 ②）；监听启动快照（盘上既有 .html 清单 − report.jsonl 产物身份
 * 豁免集）驱动三类命中分类（D5④，RL10）：
 *   - resume-artifact：持身份记录（上一代产物）→ 豁免出快照、照常回注；
 *   - unrecognized-existing：快照内且无身份记录（用户项目页面/构建产物/vendored 文件）
 *     → 只记录不回注（防驱动模型改它从未写过的文件）；
 *   - session-artifact：快照外新写 → 记一行产物写盘身份行（零命中也记）后走正常回注通道。
 * 生命周期 = 进程 effect（lib/index.js 的监听器集合，卸载即撤）+ 错误/目录不可达自毁并把
 * started/destroyed+原因写 .od-quality/report.jsonl（SI3），不自动重建（重建需新的会话目录
 * 事件，保持单向生命周期）。每设计会话一个监听器，非设计会话零监听（preset 过滤在 index.js）。
 *
 * 已知边界（D4 登记）：会话结束后监听器残存（宿主无会话结束事件）——残存期写盘经回注器
 * 查无活 Agent 放弃回注仅落记录；0.2.2 会话中切工作目录（working-directory/change）后监听器
 * 固定旧目录（UD7，登记不消费该事件）；Linux 内核旧版 fs.watch 无递归支持时启动自毁降级
 * （AX5 显式降级：destroyed 行 + onDestroyed 回调，不静默假活）。
 *
 * 锚属性补写接线（opendesign-anchor-backfill 设计包 §3.3；下文「锚补写·」前缀编号均属该包，
 * 与上行裸编号的 assets-quality 域区分）：checkFile 检查链次序 = Buffer 读盘 → 完整性哨兵 →
 * 三类命中分类 → 补写 → lint → 回注（锚补写·D1）；补写资格谓词（锚补写·D2 守护 G1）=
 * session-artifact / resume-artifact 具备资格，unrecognized-existing 绝不补写（用户项目文件
 * 字节不变硬边界，判定材料 = classify() 现算结果零旁路状态）；写回三道防线（锚补写·D6）=
 * UTF-8 无损校验与引号配对防线在补写器 lib/quality/backfill.ts 内 + 写回前 stat mtime/size
 * 复核封读-改-写竞争（基准 = 读盘后紧跟 stat；残余盲区两形态登记于锚补写·D6 残余盲区段：
 * ① 字节数不变且同 mtime 粒度内的连续写——本机 APFS 亚毫秒精度实测可分辨；② 读盘与基准
 * stat 取样间隙内写盘 → 基准记录新写盘状态而读盘 buffer 为旧内容 → 复核判 unchanged →
 * 旧内容补写版静默覆盖模型新内容（微秒级间隙，概率远低于毫秒窗口，设计登记接受）），
 * 防线放弃或零插入时原文本直通；补写步骤未预期异常
 * catch + warn 后检查链继续跑 lint 与回注（锚补写·D6 显式新形态裁决，比 lint 异常的中断处置
 * 宽——补写位于链中，中断会拖垮核心检查；不写 report 行，gaveUp 词表保持封闭）；防自循环
 * （锚补写·D5）= 不吞事件零新增状态，补写写回触发的二轮事件走全检查链靠三处既有幂等收敛
 * （补写器无插入 + 回注内容指纹 duplicate + 身份行 identityWritten 去重）；每次补写执行
 * （含 no-op 与放弃）经 appendQualityReportLine 记 anchor-backfill 行（锚补写·D7，schema
 * 在 feedback.ts 词表；no-op 也记，「检查过但无需补」与「从没检查过」在 doctor 可区分）。
 * 编号口径：本文件裸编号（U/D/AX/AS/SC/RL/UD/SI/GPK 等）默认属 opendesign-assets-quality 设计包（本轮）；V1 设计包域编号带「V1 设计包 / V1·」前缀。
 */

import { watch, type FSWatcher } from 'node:fs'
import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { backfillAnchors, type BackfillResult } from './backfill.js'
import { lintArtifact, type LintFinding } from './lint.js'
import { appendQualityReportLine, readArtifactIdentityPaths, type WatchedArtifactKind } from './feedback.js'

/** 监听后缀词表（产物 HTML；大小写不敏感）。 */
export const WATCHED_EXTENSIONS = ['.html', '.htm'] as const

/**
 * 监听排除目录名（任意层级命中即排除：材质化根 .od-frames/ 与检查记录 .od-quality/，D4；
 * 评论数据 .od-comments/ 为环间隔离的显式意图声明——comment-loop 设计包 D7/AX6，与 .json
 * 后缀过滤构成双保险：评论数据目录内的监听后缀文件同样排除，不依赖后缀侥幸）。
 */
export const EXCLUDED_DIR_NAMES: ReadonlySet<string> = new Set(['.od-frames', '.od-quality', '.od-comments'])

/** 同文件事件防抖窗口缺省毫秒数（D4 登记值 800，实施期可调）。 */
export const DEFAULT_DEBOUNCE_MS = 800

/**
 * 判定相对路径是否在监听域内（.html/.htm 后缀 + 任意层级不含排除目录）。
 * 路径一律 '/' 分隔（fs.watch filename 经 normalizeRelPath 归一）。
 */
export function isWatchedArtifactPath(relativePath: string): boolean {
  if (relativePath.length === 0) return false
  const segments = relativePath.split('/')
  if (segments.some((s) => EXCLUDED_DIR_NAMES.has(s))) return false
  const base = segments[segments.length - 1] ?? ''
  const lower = base.toLowerCase()
  return WATCHED_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

/**
 * 完整性哨兵（SI1 ②）：文末 </html> 判定（允许尾随空白，大小写不敏感）。
 * 缺失 = 可能半写 → 跳过本次检查且不耗回注额度，留待下次事件重查。
 * 已知边界：不含 </html> 结尾的合法片段产物恒跳过（登记不修——跳过侧错误只损失检查覆盖，
 * 放行侧错误会造成半写误报与额度浪费，两害取其轻按设计 D4 取严格判定）。
 */
export function isCompleteHtml(content: string): boolean {
  return /<\/html>\s*$/i.test(content)
}

/** 单次检查结果（哨兵通过后送回注器的载荷；content 供回注器算内容指纹）。 */
export interface WatchedFindingsInput {
  kind: WatchedArtifactKind
  relativePath: string
  content: string
  findings: readonly LintFinding[]
}

export interface SessionWatcherOptions {
  /** 会话工作目录（监听根；report.jsonl 落点根）。 */
  cwd: string
  /** 防抖窗口毫秒数；缺省 DEFAULT_DEBOUNCE_MS（800）。 */
  debounceMs?: number
  /** 检查函数注入；缺省 lib/quality/lint.js 的 lintArtifact。 */
  lintArtifact?: (html: unknown) => LintFinding[]
  /**
   * 补写函数注入；缺省 lib/quality/backfill.js 的 backfillAnchors（锚补写设计包 §3.3 U2，
   * 仿 lintArtifact 注入形态）——RL8 并发防护用例经此注入测试桩：桩在读盘与写回的
   * D6 窗口内先改写文件（使 mtime/size 变化）再调真实补写器，防线触发路径由此构造。
   */
  backfillAnchors?: (buffer: Buffer) => BackfillResult
  /** 每次防抖落定 + 哨兵通过后的检查结果回调（回注器接线点；index.js 注入 feedback handler）。 */
  onFindings?: (input: WatchedFindingsInput) => void | Promise<void>
  /** 自毁回调（SI3：watch-error / start-failed；index.js 记 logger 带恢复动作）。 */
  onDestroyed?: (reason: string) => void
  /** 降级日志通道（report 行写失败 / 检查回调异常记 warn；降级 ≠ 吞错）。 */
  logger?: { warn?: (message: string) => void }
}

export interface SessionWatcherController {
  /** 显式撤销（进程卸载 / 同会话换代）。自毁后调用为无害 no-op。 */
  dispose(): void
  /** 自毁（错误/目录不可达）后 true；显式 dispose 不算自毁。 */
  readonly destroyed: boolean
  /** 自毁原因（destroyed 时非空；词表前缀 watch-error: / start-failed:）。 */
  readonly destroyedReason: string | undefined
}

/**
 * 启动一个会话目录的质量环监听器。启动序 = 快照扫描 + 豁免集构建 → fs.watch 注册 →
 * started 行落盘；目录不可达 / watch 注册失败 → 自毁（destroyed 行 + onDestroyed 回调），
 * 本函数不 reject（启动失败以 destroyed 控制器形态返回，调用方无需 try/catch）。
 */
export async function startSessionWatcher(options: SessionWatcherOptions): Promise<SessionWatcherController> {
  const cwd = options.cwd
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const lint = options.lintArtifact ?? lintArtifact
  const backfill = options.backfillAnchors ?? backfillAnchors
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  let fsWatcher: FSWatcher | undefined
  let disposed = false
  let destroyed = false
  let destroyedReason: string | undefined

  const controller: SessionWatcherController = {
    dispose() {
      if (destroyed) {
        disposed = true
        return
      }
      disposed = true
      closeWatcher()
    },
    get destroyed() {
      return destroyed
    },
    get destroyedReason() {
      return destroyedReason
    },
  }

  function closeWatcher(): void {
    if (fsWatcher !== undefined) {
      try {
        fsWatcher.close()
      } catch {
        // 已关闭的句柄 close 再抛属竞态残留，句柄引用置空即净
      }
      fsWatcher = undefined
    }
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
  }

  function selfDestruct(reason: string): void {
    if (destroyed) return
    destroyed = true
    destroyedReason = reason
    closeWatcher()
    void appendQualityReportLine(cwd, {
      type: 'watcher',
      at: new Date().toISOString(),
      event: 'destroyed',
      reason,
    }).catch((error: unknown) => {
      options.logger?.warn?.(`opendesign-design-mode: 监听器自毁行写盘失败（${cwd}）：${errorMessage(error)}`)
    })
    options.onDestroyed?.(reason)
  }

  async function checkFile(absPath: string, relativePath: string, snapshot: Set<string>, identities: Set<string>): Promise<void> {
    if (destroyed || disposed) return
    let buffer: Buffer
    try {
      buffer = await readFile(absPath) // Buffer 读（锚补写·D6 ①：补写的 UTF-8 无损校验需要原始字节）
    } catch {
      return // 读取失败（写后即删/权限）：放弃本次（SI1 ①「读取失败放弃」）
    }
    // 写回前并发复核的读侧基准（锚补写·D6 ③；读盘后 stat 取 mtime+size 的既有形态）。
    // stat 失败 = 文件在读盘与 stat 之间被移除：基准记为 undefined，写回侧按复核材料
    // 不全不写盘处置（保守方向——写回是增强动作，现状行为本就不写产物）。
    const readStat = await stat(absPath).catch(() => undefined)
    let content = buffer.toString('utf8')
    if (!isCompleteHtml(content)) return // 完整性哨兵：半写跳过，不耗额度，留待重查
    const kind = classify(relativePath, snapshot, identities)
    // 补写步骤（锚补写·D1：哨兵后、分类后、lint 前；资格谓词 = 守护 G1，锚补写·D2）：
    // session-artifact / resume-artifact 具备补写资格，unrecognized-existing 字节不变绝不补。
    if (kind === 'session-artifact' || kind === 'resume-artifact') {
      content = await runBackfillStep(absPath, relativePath, buffer, content, readStat)
    }
    let findings: readonly LintFinding[]
    try {
      findings = lint(content)
    } catch (error: unknown) {
      // 检查器异常不拖垮监听器（分级降级：辅助功能故障不拖垮核心），记 warn 下次事件重查
      options.logger?.warn?.(`opendesign-design-mode: 产物检查异常（${relativePath}）：${errorMessage(error)}`)
      return
    }
    try {
      await options.onFindings?.({ kind, relativePath, content, findings })
    } catch (error: unknown) {
      // 回注器异常不拖垮监听器；失败已由调用方（feedback）自行落记录或此处降级可见
      options.logger?.warn?.(`opendesign-design-mode: 回注处理异常（${relativePath}）：${errorMessage(error)}`)
    }
  }

  /**
   * 补写步骤（锚补写设计包 §3.3 D1/D6）：补写器纯函数判定（UTF-8 无损校验 + 引号配对
   * 防线都在其内）→ 写回前 stat 并发复核 → 写盘 → anchor-backfill 行落盘。返回值恒为
   * 后续 lint 与回注消费的内容：防线放弃或零插入时原文本直通（检查链行为与现状一致），
   * 写回成功时更新为补写后文本。gaveUp 词表：唯一值 'utf8' 随补写结果如实落行。
   */
  async function runBackfillStep(
    absPath: string,
    relativePath: string,
    buffer: Buffer,
    content: string,
    readStat: { mtimeMs: number; size: number } | undefined,
  ): Promise<string> {
    try {
      const result = backfill(buffer)
      // 防线放弃（gaveUp）或零插入（全部已带属性）：原字节不变，no-op 行也记（锚补写·D7）
      if (result.gaveUp !== undefined || result.inserted.length === 0) {
        await recordBackfillLine(relativePath, 0, result.skipped, result.gaveUp)
        return content
      }
      // 写回前并发复核（锚补写·D6 ③）：mtime/size 与读盘基准不一致 = 读盘到写回窗口内
      // 模型又写盘，写回会静默覆盖新改稿——放弃本次补写（记 inserted=0 行，下次事件重查）；
      // 基准或复核 stat 缺失同按放弃处置（复核材料不全不写盘，保守方向）
      const nowStat = await stat(absPath).catch(() => undefined)
      const unchanged =
        nowStat !== undefined &&
        readStat !== undefined &&
        nowStat.mtimeMs === readStat.mtimeMs &&
        nowStat.size === readStat.size
      if (!unchanged) {
        await recordBackfillLine(relativePath, 0, result.skipped)
        return content
      }
      await writeFile(absPath, result.buffer)
      await recordBackfillLine(relativePath, result.inserted.length, result.skipped)
      return result.buffer.toString('utf8')
    } catch (error: unknown) {
      // 补写步骤未预期异常（锚补写·D6 显式新形态裁决，非 lint 异常的中断先例）：warn 后
      // 检查链继续用原文跑 lint 与回注（补写位于链中，中断会让补写 bug 拖垮核心检查）；
      // 不写 report 行（gaveUp 词表保持封闭——异常不是防线判定结果）
      options.logger?.warn?.(`opendesign-design-mode: 锚属性补写异常（${relativePath}）：${errorMessage(error)}`)
      return content
    }
  }

  /**
   * anchor-backfill 行落盘（锚补写设计包 §3.3 D7）：每次补写执行记一行（含 no-op inserted=0
   * 与防线放弃）；行写失败 warn 降级不拖垮检查链（降级 ≠ 吞错）。
   */
  async function recordBackfillLine(
    relativePath: string,
    inserted: number,
    skipped: number,
    gaveUp?: 'utf8',
  ): Promise<void> {
    try {
      await appendQualityReportLine(cwd, {
        type: 'anchor-backfill',
        at: new Date().toISOString(),
        path: relativePath,
        inserted,
        skipped,
        gaveUp,
      })
    } catch (error: unknown) {
      options.logger?.warn?.(`opendesign-design-mode: 补写行写盘失败（${relativePath}）：${errorMessage(error)}`)
    }
  }

  try {
    const [snapshot, identities] = await Promise.all([
      scanWatchedHtmlFiles(cwd),
      readArtifactIdentityPaths(cwd),
    ])
    if (disposed || destroyed) return controller
    fsWatcher = watch(cwd, { recursive: true }, (_event, filename) => {
      if (destroyed || disposed) return
      const relativePath = normalizeRelPath(filename)
      if (relativePath === null || !isWatchedArtifactPath(relativePath)) return
      const absPath = path.join(cwd, relativePath)
      const previous = timers.get(absPath)
      if (previous !== undefined) clearTimeout(previous)
      timers.set(
        absPath,
        setTimeout(() => {
          timers.delete(absPath)
          void checkFile(absPath, relativePath, snapshot, identities)
        }, debounceMs),
      )
    })
    fsWatcher.on('error', (error: Error) => {
      selfDestruct(`watch-error: ${error?.message ?? String(error)}`)
    })
    if (disposed) {
      closeWatcher()
      return controller
    }
  } catch (error: unknown) {
    selfDestruct(`start-failed: ${errorMessage(error)}`)
    return controller
  }

  try {
    await appendQualityReportLine(cwd, {
      type: 'watcher',
      at: new Date().toISOString(),
      event: 'started',
      cwd,
    })
  } catch (error: unknown) {
    options.logger?.warn?.(`opendesign-design-mode: 监听器 started 行写盘失败（${cwd}）：${errorMessage(error)}`)
  }
  return controller
}

/** 三类命中分类（D5④）：持身份记录 → resume；快照内无身份 → 陌生既有；快照外 → 本会话新写。 */
function classify(relativePath: string, snapshot: Set<string>, identities: Set<string>): WatchedArtifactKind {
  if (identities.has(relativePath)) return 'resume-artifact'
  if (snapshot.has(relativePath)) return 'unrecognized-existing'
  return 'session-artifact'
}

/** fs.watch filename 归一：null 不可定位（忽略）；跨平台分隔符归一为 '/'；剥前导 './'。 */
function normalizeRelPath(filename: string | null): string | null {
  if (typeof filename !== 'string' || filename.length === 0) return null
  const normalized = filename.split(path.sep).join('/').replace(/^\.\//, '')
  return normalized.length === 0 ? null : normalized
}

/** 启动快照：递归扫描 cwd 下监听域内的既有产物（排除目录任意层级剔除；目录不可达上抛）。 */
async function scanWatchedHtmlFiles(dir: string): Promise<Set<string>> {
  const out = new Set<string>()
  async function walk(walkDir: string, relPrefix: string): Promise<void> {
    const entries = await readdir(walkDir, { withFileTypes: true })
    for (const entry of entries) {
      const rel = relPrefix === '' ? entry.name : `${relPrefix}/${entry.name}`
      if (entry.isDirectory()) {
        if (EXCLUDED_DIR_NAMES.has(entry.name)) continue
        await walk(path.join(walkDir, entry.name), rel)
      } else if (entry.isFile() && isWatchedArtifactPath(rel)) {
        out.add(rel)
      }
    }
  }
  await walk(dir, '')
  return out
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
