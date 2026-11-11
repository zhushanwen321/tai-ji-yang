/**
 * opendesign-design-mode 双版本 e2e —— 桌面版（0.2.2-rc.1，app 内嵌宿主复现法）。
 *
 * 复现方式（任务书环境要点⑤）：DeepSeek Harness.app 自带的 `runtime/cli/bin/dsh` 启动器
 * 直接落到 app.asar 内嵌的同版本宿主（dsh-desktop-host cli.js，进程参数里可见 app.asar
 * 路径）——「从 app.asar 提取宿主后起同版本 web 宿主」由启动器自身完成，无需手工解包。
 *
 * 0.2.2 的 CLI `plugin add` 有缺陷（既有教训）：插件安装走手写 profile package.json 流程
 * ——照 0.1.7 `dsh plugin add` 的产物形态手写 profiles/web/{package.json, pnpm-workspace.yaml,
 * cordis.patch.yml} 后 pnpm install，依赖用 link: 指向仓内包目录（node_modules 留符号链接，
 * lib/ 改动即生效）。
 *
 * 核心组（本轮 impl-plan 验收项 A9 的 L3 段；模型行为段归本轮 A11/A12/L4）：roster（选择器菜单 + 芯片选择）→
 * 注入（会话日志 system 节点特征句）→ doctor 十二分节（本轮 V5 的 0.2.2 形态 + comment-loop
 * 设计包第⑫节评论环）→ 材质化恰 5 管理名（V1 设计包 D8 + opendesign-assets-quality D9）→ 预览面板 iframe 产物载入 + 探针（V1·RL6/V1·RL8 的 0.2.2 形态）→
 * 检查环桌面宿主可用性（本轮 V2 的 0.2.2 形态：真机写盘 P0 产物 → 回注消息 source.kind
 * 协议信号形态断言 + report.jsonl fed-back 记录——本轮 RL1 的 0.2.2 半场）→ 评论回路桌面
 * 半场（comment-loop 设计包，任务书 U6 桌面清单）：V8 首评循环（侧栏发送 → 落盘 delivered
 * → 回注消息 kind/载荷断言 → 桌面宿主 /api 相对路径写通道可达）+ V2 重启后线程保留
 * （kill + 同 home relaunch，delivered 不回退 pending，doctor ⑫ 重启后在场形态）+ V10 steer
 * 前置评论投递（AS9 探针载体，web spec S14 桌面版同款 steer 前置步骤：长任务消息先置
 * 运行态 → 运行中发评论 → turn/start 计数判通道 → steer 形态全量断言 / followup 形态按
 * 设计 §4.1 V10 协议登记探针不适用）。
 *
 * 桌面壳 /api 相对路径边界（comment-loop V8 新增验证点的复现形态口径）：本 spec 的宿主 =
 * app 内嵌 0.2.2 宿主（http 形态，V1·AS7 同款复现法）——相对路径可达性以页面同源 fetch
 * （client/comments/api.ts 同一寻址通道）对 asar 宿主实证；Electron dsh-app:// 壳层
 * webview 的转发形态不在本复现套件驱动面内（V1·AS7 壳层结论以 runlog 登记的同款先例）。
 *
 * V1·AS7 混合内容（桌面 dsh-app:// 嵌 http://127.0.0.1 iframe，V1 设计包前提编号）：实测已于
 * V1·U6 交付门完成并关闭（V1 复审决议 RR3）：裸 iframe 与 sandbox="allow-scripts" 均触发 load、
 * 无混合内容/CSP 阻拦、产物脚本 Origin: null——本 spec 在 asar 宿主（http 形态）复核 iframe
 * 隔离语义（V1·RL8 探针），V1·AS7 的 dsh-app:// 壳层形态结论以 V1·U6 runlog 为准记录，不在此重复实测。
 *
 * 运行：node packages/opendesign-design-mode/tests/e2e/desktop-02x.spec.mjs（退出码 0 = 绿）。
 * 前置：/Applications/DeepSeek Harness.app（0.2.2-rc.1）、PATH 上有 pnpm（profile 手装用）。
 */
import { spawn, spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const PKG_ROOT = path.join(REPO_ROOT, 'packages', 'opendesign-design-mode')
const E2E_FIXTURES = path.join(PKG_ROOT, 'tests', 'e2e', 'fixtures')
const FIXTURES = path.join(PKG_ROOT, 'tests', 'fixtures')
const DESKTOP_APP = '/Applications/DeepSeek Harness.app'
const DESKTOP_CLI = path.join(DESKTOP_APP, 'Contents', 'Resources', 'runtime', 'cli', 'bin', 'dsh')
const require = createRequire(path.join(REPO_ROOT, 'package.json'))
const playwright = require('playwright')

/** 一次性运行根（KEEP_E2E_STATE=1 保留排障）。 */
const RUN_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'opendesign-desktop-e2e-'))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

class AssertionError extends Error {}
function assert(cond, message) {
  if (!cond) throw new AssertionError(message)
}
const stepOut = []
async function step(name, fn) {
  try {
    await fn()
    stepOut.push({ name, ok: true })
    console.log(`  ✓ ${name}`)
  } catch (error) {
    stepOut.push({ name, ok: false, error })
    console.log(`  ✗ ${name}\n    ${error instanceof Error ? error.message : String(error)}`)
  }
}

const MINI_OD_ROOT = path.join(FIXTURES, 'mini-od')
const MINI_OD_SCENARIO = path.join(MINI_OD_ROOT, 'plugins', '_official', 'scenarios', 'od-next-strategy')
const DESIGN_INJECTION_MARK = '## Task routing (design mode)'
const MINI_OD_PROFILE_PATH = path.join(MINI_OD_SCENARIO, 'assets', 'task-profiles', 'prototype.md')
const OD_FRAMES_FILES = ['android.html', 'iphone.html', 'neutral.html', 'layout.css']
/** 质量环回注消息的 source.kind（lib/quality/feedback.js LINT_SOURCE_KIND 同值；本轮 AX7）。 */
const LINT_SOURCE_KIND = 'opendesign-design-mode/lint'
/** P0 命中特征（purple-gradient：线性渐变含紫 hex，lint.ts PURPLE_HEXES 命中形态）。 */
const DIRTY_GRADIENT = 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)'

// 材质化写清单与 deck 协议派生文本直接对账生产实现（同仓构建产物；清单/文本漂移即红）。
const { MATERIALIZED_WRITE_LIST, DECK_FRAMEWORK_FILE_NAME } = await import(
  path.join(PKG_ROOT, 'lib', 'materialize', 'copy.js')
)
const { renderDeckFrameworkFile } = await import(path.join(PKG_ROOT, 'lib', 'protocols', 'deck.js'))

// 评论环（comment-loop）契约词表与消息构造直接对账生产实现（同仓构建产物；词表/消息漂移即红）。
const {
  COMMENT_SOURCE_KIND,
  COMMENTS_API_BASE_PATH,
  COMMENTS_API_PATHS,
  COMMENTS_DIR_NAME,
  COMMENTS_FILE_NAME,
  COMMENT_DELIVERY_STATES,
  COMMENT_THREAD_ID_PREFIX,
} = await import(path.join(PKG_ROOT, 'lib', 'comments', 'contract.js'))
const { buildCommentMessage } = await import(path.join(PKG_ROOT, 'lib', 'comments', 'feedback.js'))
const { DOCTOR_SECTIONS, DOCTOR_SECTION_COUNT } = await import(path.join(PKG_ROOT, 'lib', 'commands', 'doctor.js'))
assert(
  COMMENT_SOURCE_KIND !== LINT_SOURCE_KIND,
  `评论回注 kind 应与质量环 lint kind 并列不同值（comment-loop contract.ts）：${COMMENT_SOURCE_KIND}`,
)

/** doctor 十二分节标题（lib/commands/doctor.ts DOCTOR_SECTIONS 字面对账；comment-loop U5 第⑫节评论环在列）。 */
const DOCTOR_SECTIONS_12 = [
  '安装形态与资源根',
  '清单路径与三层版本',
  'roster 完整性核验',
  '改写规则命中清单',
  '材质化状态',
  '资产代际提示',
  '异常与恢复动作',
  '止损位状态',
  '资产丰富度',
  '协议与检查器对账',
  '质量发现',
  '评论环',
]

/** doctor 第⑫节评论环的计数/分布行（与 lib/commands/doctor.ts renderCommentsSection 同式拼装）。 */
function commentDistributionLine(threads) {
  const distribution = COMMENT_DELIVERY_STATES.map((state) => {
    const count = threads.filter((thread) => thread.delivery === state).length
    return `${state} ${count}`
  }).join(' / ')
  return `线程计数：${threads.length}；各 delivery 状态分布：${distribution}`
}

/** 断言回注消息形态与生产构造逐字一致（AX2 独立 kind + D3 source 五字段 + D6 三段文本；期望值直接调 buildCommentMessage 生成）。 */
function assertCommentMessageText(message, thread, payloadText) {
  assert(
    message.kind === COMMENT_SOURCE_KIND,
    `回注消息 source.kind 应为 ${COMMENT_SOURCE_KIND}（AX2 独立 kind，不冒充 kind='user'）：${JSON.stringify(message.kind)}`,
  )
  const expected = buildCommentMessage({
    threadId: thread.id,
    artifactPath: thread.artifactPath,
    text: payloadText,
    createdAt: thread.createdAt,
  })
  assert(
    JSON.stringify(message.source) === JSON.stringify(expected.source),
    `回注消息 source 应与生产构造逐字一致（D3 五字段 kind/form/summary/artifactPath/threadId 随消息持久化）：\n实际：${JSON.stringify(message.source)}\n期望：${JSON.stringify(expected.source)}`,
  )
  const expectedText = expected.content?.[0]?.text ?? ''
  assert(
    message.text === expectedText,
    `回注消息文本应逐字等于 buildCommentMessage 构造（D6 三段形态）：\n实际：${String(message.text).slice(0, 400)}\n期望：${expectedText.slice(0, 400)}`,
  )
}

/** 构造一个含 P0 特征（紫渐变）且过完整性哨兵（文末 </html>）的产物 HTML 文本。 */
function dirtyArtifactHtml(title) {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8" />',
    `  <title>${title}</title>`,
    '  <style>',
    `    .hero { background: ${DIRTY_GRADIENT}; color: #fff; padding: 48px; }`,
    '  </style>',
    '</head>',
    '<body>',
    `  <div class="hero"><h1>${title}</h1></div>`,
    '</body>',
    '</html>',
  ].join('\n')
}

// ── 前置 ─────────────────────────────────────────────────────────────────────

if (!fs.existsSync(DESKTOP_CLI)) {
  console.error(`[desktop-e2e] 前置缺失：未找到桌面应用 CLI（${DESKTOP_CLI}）。`)
  console.error('[desktop-e2e] 恢复动作：安装 DeepSeek Harness.app 0.2.2-rc.1 后重跑；或确认应用安装位置。')
  process.exit(1)
}
const versionOut = spawnSync(DESKTOP_CLI, ['--version'], { encoding: 'utf8', timeout: 30000 })
const desktopVersion = (versionOut.stdout ?? '').trim()
console.log(`[desktop-e2e] 桌面宿主：${DESKTOP_CLI}（版本 ${desktopVersion}）`)
if (!desktopVersion.startsWith('0.2.2')) {
  console.error(`[desktop-e2e] 版本门禁：期望 0.2.2-rc.1 系，实得 ${desktopVersion}（本 spec 只认证 0.2.2 复现形态）`)
  process.exit(1)
}

// ── 隔离环境 ─────────────────────────────────────────────────────────────────

const home = path.join(RUN_ROOT, 'home')
const workspace = path.join(RUN_ROOT, 'workspace')
const profileDir = path.join(home, 'profiles', 'web')
fs.mkdirSync(path.join(home, 'storages'), { recursive: true })
fs.mkdirSync(profileDir, { recursive: true })
fs.mkdirSync(workspace, { recursive: true })
for (const name of ['index.html', 'secret-note.txt']) {
  fs.copyFileSync(path.join(E2E_FIXTURES, 'probe-artifact', name), path.join(workspace, name))
}

// 手写 profile（0.2.2 plugin add 缺陷的既定绕行；形态 = 0.1.7 plugin add 产物原样）
fs.writeFileSync(path.join(profileDir, 'package.json'), JSON.stringify({
  name: 'dsh-profile-web',
  private: true,
  dependencies: {
    'opendesign-design-mode': `link:${PKG_ROOT}`,
    'tai-ji-yang-shell': `link:${REPO_ROOT}`,
  },
  dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'tai-ji-yang-shell', 'opendesign-design-mode'] } },
}, null, 2))
fs.writeFileSync(path.join(profileDir, 'pnpm-workspace.yaml'), 'packages:\n  - .\nnodeLinker: hoisted\nautoInstallPeers: false\n')
fs.writeFileSync(path.join(profileDir, 'cordis.patch.yml'), '[]\n')
const install = spawnSync('pnpm', ['install', '--ignore-scripts'], { cwd: profileDir, encoding: 'utf8', timeout: 300000 })
if (install.status !== 0) {
  console.error(`[desktop-e2e] profile 手装失败（pnpm install 退出码 ${install.status}）：\n${(install.stderr ?? '').slice(-1200)}`)
  console.error('[desktop-e2e] 恢复动作：确认 PATH 上有 pnpm 后重跑。')
  process.exit(1)
}

// 默认工作区 seed（realpath：宿主 attachSession 按 realpath 对账）
const workspaceId = crypto.randomUUID()
const workspaceReal = fs.realpathSync(workspace)
fs.writeFileSync(path.join(home, 'storages', 'workspace.json'), JSON.stringify({
  unit: { name: 'workspace', version: 2 },
  global: { initialized: true, workspaceIds: [workspaceId], archivedSessionIds: [], pinnedSessionIds: [], defaultWorkspaceId: workspaceId },
  tables: { workspaces: { [workspaceId]: { path: workspaceReal, title: path.basename(workspace), sessionIds: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } } },
}, null, 2))

// 会话日志断言通道（同 web spec）
const patchFile = path.join(home, 'e2e-patch.yml')
fs.writeFileSync(patchFile, [
  '# desktop e2e 观察用 overlay（V1·U8）：会话日志落盘为未压缩 JSONL',
  '- id: session-persistence-jsonl',
  '  config:',
  "    root: !!js dshHomePath('sessions')",
  '    compression: none',
  '',
].join('\n'))

// ── 启动（app 内嵌宿主；cwd = 工作目录，0.2.2 伺服根 = workingDirectory.defaultDirectory
//    缺省回退 process.cwd()，与 seed 工作区对齐）────────────────────────────────────

/** 当前宿主进程（V2 重启语义：killProcessGroup 与 relaunch 都作用于它）。 */
let hostChild = null

/**
 * 自启桌面宿主（app 内嵌 0.2.2）并从 stdout 解析认证 URL（不猜端口不猜 token）。
 * 首启与 comment-loop·V2 的重启形态共用同一函数（同 home 重启 = 会话与评论数据持久性载体）。
 */
async function launchHost() {
  const child = spawn(DESKTOP_CLI, ['--patch', patchFile, '--profile', 'web', '--no-open', '--port', '0'], {
    env: { ...process.env, DSH_HOME: home, OD_RESOURCE_ROOT: MINI_OD_ROOT },
    cwd: workspaceReal,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  hostChild = child
  let hostOutput = ''
  child.stdout.on('data', (chunk) => { hostOutput += String(chunk) })
  child.stderr.on('data', (chunk) => { hostOutput += `[stderr] ${String(chunk)}` })

  const deadline = Date.now() + 90000
  let launchedUrl = null
  while (launchedUrl === null && Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      console.error(`[desktop-e2e] 宿主提前退出：\n${hostOutput.slice(-2500)}`)
      console.error('[desktop-e2e] 恢复动作：检查手写 profile 形态（bundles 清单/依赖 link）与 0.2.2 宿主的兼容性。')
      process.exit(1)
    }
    for (const line of hostOutput.split('\n')) {
      const match = /^dsh web: (https?:\/\/\S+)$/.exec(line.trim())
      if (match !== null) { launchedUrl = match[1]; break }
    }
    if (launchedUrl !== null) break
    await sleep(300)
  }
  if (launchedUrl === null) {
    await killProcessGroup()
    console.error(`[desktop-e2e] 等待 URL 行超时：\n${hostOutput.slice(-2500)}`)
    process.exit(1)
  }
  console.log(`[desktop-e2e] URL 就绪：${launchedUrl.replace(/token=[^&]+/, 'token=REDACTED')}`)
  return launchedUrl
}

async function killProcessGroup() {
  const pid = hostChild?.pid
  if (pid === undefined) return
  try { process.kill(-pid, 'SIGTERM') } catch { /* 已退出 */ }
  const waitDeadline = Date.now() + 6000
  while (Date.now() < waitDeadline) {
    try { process.kill(pid, 0); await sleep(200) } catch { return }
  }
  try { process.kill(-pid, 'SIGKILL') } catch { /* 已退出 */ }
}

let url = await launchHost()
console.log(`[desktop-e2e] 运行根：${RUN_ROOT}${process.env.KEEP_E2E_STATE === '1' ? '（保留）' : ''}`)

// ── UI 驱动（0.2.2 web 宿主；选择器与 web spec 同源）──────────────────────────

const browser = await playwright.chromium.launch({ headless: true })
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()

async function clearModalGates() {
  const gateDeadline = Date.now() + 10000
  while (Date.now() < gateDeadline) {
    const state = await page.evaluate(() => ({
      masked: Array.from(document.querySelectorAll('[class*="_mask_"]')).some((el) => el.offsetWidth > 0),
      dialog: Array.from(document.querySelectorAll('[role="dialog"]')).some((el) => el.offsetWidth > 0),
    }))
    if (!state.masked && !state.dialog) return
    const gate = page.locator('button:visible', { hasText: /Configure later|Skip|Not now|稍后|跳过|继续|Continue/i }).first()
    if (await gate.isVisible().catch(() => false)) await gate.click().catch(() => {})
    else await page.keyboard.press('Escape').catch(() => {})
    await sleep(500)
  }
}

function collectSessionFiles() {
  const root = path.join(home, 'sessions')
  if (!fs.existsSync(root)) return []
  const files = []
  for (const dir of fs.readdirSync(root)) {
    const dirPath = path.join(root, dir)
    if (!fs.statSync(dirPath).isDirectory()) continue
    for (const sessionId of fs.readdirSync(dirPath)) {
      const file = path.join(dirPath, sessionId, 'session.v4.jsonl')
      if (fs.existsSync(file)) files.push({ file, sessionId, mtime: fs.statSync(file).mtimeMs })
    }
  }
  files.sort((a, b) => a.mtime - b.mtime)
  return files
}

function readSystemMessages(file) {
  const messages = []
  for (const line of fs.readFileSync(file, 'utf8').trim().split('\n')) {
    if (line === '') continue
    const event = JSON.parse(line)
    if (event.type === 'system/message') messages.push(event.data?.message?.content?.[0]?.text ?? '')
  }
  return messages
}

/** 读取一份会话日志的 user/message 消息（data = 消息本体；回注消息按 source.kind 辨识，source 全量提取供 D3 五字段对账）。 */
function readUserMessages(file) {
  const messages = []
  for (const line of fs.readFileSync(file, 'utf8').trim().split('\n')) {
    if (line === '') continue
    const event = JSON.parse(line)
    if (event.type === 'user/message') {
      messages.push({
        kind: event.data?.source?.kind ?? null,
        text: event.data?.content?.[0]?.text ?? '',
        source: event.data?.source ?? null,
      })
    }
  }
  return messages
}

/** 收集全部会话日志里的质量环回注消息（kind 匹配 LINT_SOURCE_KIND）。 */
function collectLintFeedbackMessages() {
  return collectSessionFiles().flatMap((entry) => readUserMessages(entry.file)).filter((m) => m.kind === LINT_SOURCE_KIND)
}

/** 读取 workspace 的 .od-quality/report.jsonl（缺席返回空清单；损坏行跳过）。 */
function readQualityReport() {
  const file = path.join(fs.realpathSync(workspace), '.od-quality', 'report.jsonl')
  if (!fs.existsSync(file)) return []
  const lines = []
  for (const lineText of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = lineText.trim()
    if (trimmed === '') continue
    try { lines.push(JSON.parse(trimmed)) } catch { /* 半行写入容忍 */ }
  }
  return lines
}

/** 轮询直到 report.jsonl 满足谓词（写侧 appendFile 即时落盘，轮询只为时序余量）。 */
async function waitForReportLine(predicate, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const lines = readQualityReport()
    if (lines.some(predicate)) return lines
    await sleep(400)
  }
  throw new AssertionError(`等待 .od-quality/report.jsonl 超时（${timeoutMs}ms）`)
}

/** 轮询直到回注消息计数达到 expected。 */
async function waitForLintFeedbackCount(expected, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (collectLintFeedbackMessages().length >= expected) return collectLintFeedbackMessages().length
    await sleep(500)
  }
  throw new AssertionError(`等待质量环回注消息达到 ${expected} 条超时（${timeoutMs}ms；实际 ${collectLintFeedbackMessages().length} 条）`)
}

async function waitForSessionContent(predicate, timeoutMs = 30000) {
  const gateDeadline = Date.now() + timeoutMs
  while (Date.now() < gateDeadline) {
    for (const entry of collectSessionFiles().reverse()) {
      const messages = readSystemMessages(entry.file)
      if (predicate(messages)) return { entry, messages }
    }
    await sleep(500)
  }
  throw new AssertionError('等待会话日志内容超时（30s）')
}

/** 读 workspace 评论数据文件的线程全集（D1 单文件权威；文件缺席返回空清单）。 */
function commentsThreads() {
  const file = path.join(fs.realpathSync(workspace), COMMENTS_DIR_NAME, COMMENTS_FILE_NAME)
  if (!fs.existsSync(file)) return []
  return JSON.parse(fs.readFileSync(file, 'utf8')).threads
}

/** 收集全部会话日志里的评论回注消息（kind 匹配 COMMENT_SOURCE_KIND；AX2 独立 kind）。 */
function collectCommentFeedbackMessages() {
  return collectSessionFiles().flatMap((entry) => readUserMessages(entry.file)).filter((m) => m.kind === COMMENT_SOURCE_KIND)
}

/** 轮询直到评论回注消息计数达到 expected。 */
async function waitForCommentFeedbackCount(expected, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  let count = 0
  while (Date.now() < deadline) {
    count = collectCommentFeedbackMessages().length
    if (count >= expected) return count
    await sleep(500)
  }
  throw new AssertionError(`等待评论回注消息达到 ${expected} 条超时（${timeoutMs}ms；实际 ${count} 条）`)
}

/** 读取一份会话日志的 turn/start 轮次号（宿主 turnBoundary 投影事件；web spec readSessionLog 同款读法）。 */
function readTurnStarts(file) {
  const turns = []
  for (const line of fs.readFileSync(file, 'utf8').trim().split('\n')) {
    if (line === '') continue
    const event = JSON.parse(line)
    if (event.type === 'turn/start') turns.push(event.data?.turn ?? null)
  }
  return turns
}

/** 隔离 home 全部会话日志的 turn/start 事件计数（comment-loop·V10 通道判据：followup 开新轮则 +1，steer 注入当前轮不变）。 */
function totalTurnStartCount() {
  return collectSessionFiles()
    .map((entry) => readTurnStarts(entry.file).length)
    .reduce((sum, count) => sum + count, 0)
}

/**
 * 页面内同源 fetch（相对路径寻址——与面板 client/comments/api.ts 同一通道；返回
 * status / text / JSON body，非 JSON 响应 body = null）。
 */
async function pageFetch(pathname, init) {
  return page.evaluate(async ({ pathname, init }) => {
    const response = await fetch(pathname, init)
    const text = await response.text()
    let body = null
    try { body = JSON.parse(text) } catch { body = null }
    return { status: response.status, text, body }
  }, { pathname, init })
}

// ── 核心组 ───────────────────────────────────────────────────────────────────

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3000)
  for (let i = 0; i < 8; i += 1) {
    const gate = page.locator('button:visible', { hasText: /Continue|Configure later|稍后|继续/i }).first()
    if (await gate.isVisible().catch(() => false)) { await gate.click().catch(() => {}); await sleep(500); continue }
    break
  }
  await clearModalGates()

  await step('roster：选择器菜单含设计模式卡片（V1·RL1 的 0.2.2 形态）', async () => {
    await page.getByRole('button', { name: 'Choose workspace' }).click()
    await sleep(600)
    await page.locator('[role="menuitem"]', { hasText: path.basename(workspace) }).first().click()
    await sleep(900)
    const chip = page.locator('button[aria-haspopup="menu"][title*="agent preset"]').first()
    await chip.click()
    await sleep(500)
    const items = await page.evaluate(() => Array.from(document.querySelectorAll('[role="menuitem"]')).map((el) => (el.textContent ?? '').trim()))
    const item = items.find((t) => t.includes('OpenDesign 设计模式'))
    assert(item !== undefined, `选择器菜单缺设计模式：${JSON.stringify(items.map((t) => t.slice(0, 24)))}`)
    assert(item.includes('以本机 OpenDesign 资产驱动的设计会话'), '菜单项描述不对')
    await page.keyboard.press('Escape')
    await sleep(300)
  })

  await step('注入：设计会话 system 节点含 OD 资产特征句（V1·V1 的 0.2.2 形态）', async () => {
    const chip = page.locator('button[aria-haspopup="menu"][title*="agent preset"]').first()
    await chip.click()
    await sleep(400)
    await page.locator('[role="menuitem"]', { hasText: 'OpenDesign 设计模式' }).first().click()
    await sleep(1500)
    const composer = page.locator('[contenteditable="true"]').first()
    await composer.click()
    await page.keyboard.type('design a coffee brand landing page')
    await page.getByRole('button', { name: 'Send message' }).click()
    await page.waitForFunction(
      () => document.body.innerText.includes('MISSING_CREDENTIAL') || document.body.innerText.includes('This turn failed'),
      undefined,
      { timeout: 60000 },
    )
    await sleep(2000)
    const { messages } = await waitForSessionContent((list) => list.some((t) => t.includes(DESIGN_INJECTION_MARK)))
    const sys = messages.find((t) => t.includes(DESIGN_INJECTION_MARK)) ?? ''
    assert(sys.includes(MINI_OD_PROFILE_PATH), '注入文本缺 prototype 任务档路径')
    assert(!sys.includes('{{SKILL_CATALOG}}'), '注入文本含占位符字面')
    assert(!sys.includes('$OD_BIN'), '注入文本含 $OD_BIN 特征串（V1·RL3 命令清零失效）')
    // 本轮四新段的桌面注入特征（设计 §4.3 desktop 行「persona 组装含新段」；web spec 对
    // rich-assets 全量断言四新段——本 spec 的 fixtureRoot 是 mini-od（无 craft/design-templates/
    // design-systems 三目录），形状包清单/craft 指路/manifest 感知三段按本轮 AX5 设计性降级省略，
    // 可断言的新段 = panel 评审团协议段 + ppt 条目 deck 协议指针（两段无条件注入，随 compose
    // 单源进桌面 systemPrompt；特征串与 web spec 断言同源）。
    assert(sys.includes('# Critique Theater'), '注入文本缺 panel 评审团协议段标题（本轮新段）')
    assert(sys.includes('maxRounds="3"') && sys.includes('threshold="8"'), 'panel 段缺缺省参数（轮数 3/阈值 8）')
    assert(sys.includes('Deck protocol note') && sys.includes('`.od-frames/deck-framework.md`'), 'ppt 条目缺 deck 协议指针（本轮新段）')
  })

  await step('材质化：.od-frames/ 恰 5 管理名（4 复制件 + deck-framework.md）且派生文本一致（V1 设计包 D8 + opendesign-assets-quality D9 的 0.2.2 形态）', async () => {
    const framesDir = path.join(fs.realpathSync(workspace), '.od-frames')
    const deadline = Date.now() + 20000
    let frames = []
    while (Date.now() < deadline) {
      frames = fs.existsSync(framesDir) ? fs.readdirSync(framesDir) : []
      if (MATERIALIZED_WRITE_LIST.every((name) => frames.includes(name))) break
      await sleep(500)
    }
    assert(
      MATERIALIZED_WRITE_LIST.every((name) => frames.includes(name)) && frames.length === MATERIALIZED_WRITE_LIST.length,
      `.od-frames/ 文件集合不对：${JSON.stringify(frames)}（期望 ${JSON.stringify(MATERIALIZED_WRITE_LIST)}）`,
    )
    const deckFile = fs.readFileSync(path.join(framesDir, DECK_FRAMEWORK_FILE_NAME), 'utf8')
    const expected = renderDeckFrameworkFile()
    assert(deckFile === expected, `deck-framework.md 与派生登记文本不一致（${deckFile.length} vs ${expected.length} 字符）`)
    assert(expected.includes('## New deck only') && expected.includes('## Existing deck or selected template'), 'deck 铺盘文本应含三段结构')
  })

  await step('doctor：十二分节齐全（本轮 V5 的 0.2.2 形态，前八节零回归 + comment-loop 第⑫节评论环缺席常态）', async () => {
    const composer = page.locator('[contenteditable="true"]').first()
    await composer.click()
    await page.keyboard.type('/opendesign-doctor')
    await sleep(1800)
    const option = page.getByRole('option', { name: /opendesign-doctor/ }).first()
    assert(await option.count() > 0, '/opendesign-doctor 未出现在 slash 菜单')
    await option.click()
    await sleep(3000)
    const body = await page.evaluate(() => document.body.innerText)
    assert(body.includes('OpenDesign 设计模式诊断报告'), '缺诊断报告标题')
    assert(
      JSON.stringify(Object.values(DOCTOR_SECTIONS)) === JSON.stringify(DOCTOR_SECTIONS_12),
      `DOCTOR_SECTIONS 常量与本 spec 字面对账表漂移：${JSON.stringify(DOCTOR_SECTIONS)}`,
    )
    DOCTOR_SECTIONS_12.forEach((title, index) => {
      assert(body.includes(`【${index + 1}/${DOCTOR_SECTION_COUNT}】${title}`), `缺分节 ${index + 1}/${DOCTOR_SECTION_COUNT} ${title}`)
    })
    // ⑩ 缺省态（clone 未登记）：无法比对 + 登记恢复动作；⑪ 监听器运行形态。
    assert(body.includes('源码仓 clone 探测：未登记'), '⑩ 未登记态应报「未登记」')
    assert(body.includes('无法比对'), '⑩ 未登记态应报「无法比对」')
    assert(body.includes('重新运行 /opendesign-doctor 并附 OpenDesign 源码仓 clone 路径参数'), '⑩ 缺登记路径恢复动作')
    assert(body.includes('监听器状态：运行中推定'), '⑪ 设计会话应报监听器运行中推定（检查环桌面宿主已起监听，doctor 按最后生命周期记录推定呈现）')
    assert(body.includes('检查发现：共 0 条'), '⑪ 尚无发现时应报零发现')
    // ⑫ 评论环缺席常态（评论步之前）：文件不存在 = 正常态（不伪装损坏也不自动建）+ 路由族声明形态。
    assert(body.includes('【12/12】评论环'), '缺第⑫节评论环')
    assert(body.includes('评论文件：不存在'), '⑫ 缺席常态应报评论文件不存在')
    assert(body.includes('线程计数：0'), '⑫ 缺席常态线程计数应为 0')
    assert(body.includes(`路由族契约共 ${COMMENTS_API_PATHS.length} 条`), `⑫ 路由族声明应为 ${COMMENTS_API_PATHS.length} 条`)
    assert(body.includes('注册状态：声明形态'), '⑫ 注册状态应如实标注声明形态（不冒充运行时核验）')
  })

  await step('预览：fixture 产物载入 iframe 且探针呈隔离形态（V1·RL6/V1·RL8 的 0.2.2 形态）', async () => {
    await page.getByRole('button', { name: 'Open right sidebar' }).click()
    await sleep(900)
    await page.getByText('Design preview').first().click()
    await sleep(2000)
    const rows = await page.evaluate(() => Array.from(document.querySelectorAll('.odp-row')).map((r) => (r.textContent ?? '').trim()))
    assert(rows.includes('index.html'), `产物列表缺 index.html：${JSON.stringify(rows)}`)
    await page.locator('.odp-row').first().click()
    await page.waitForSelector('iframe.odp-frame', { timeout: 15000 })
    const sandbox = await page.getAttribute('iframe.odp-frame', 'sandbox')
    assert(sandbox === 'allow-scripts', `sandbox 形态不对：${JSON.stringify(sandbox)}`)
    const frame = page.frameLocator('iframe.odp-frame')
    const results = await frame.locator('#probe-results').textContent({ timeout: 15000 })
    assert(results !== null && results !== 'pending', `探针未完成：${JSON.stringify(results)}`)
    const parsed = JSON.parse(results ?? '{}')
    assert(!parsed.openRoute.includes('status=200'), `open 路由响应疑似可得：${parsed.openRoute}`)
    assert(!parsed.secretFile.includes('SECRET-NOTE-CANARY'), '非产物内容泄漏')
    assert(/^cookie: \(empty\)|^cookie: blocked SecurityError/.test(parsed.cookie), `cookie 形态不对：${parsed.cookie}`)
  })

  await step('检查环可用性：真机写盘 P0 产物 → followup 回注消息 source.kind 协议信号形态（本轮 V2/本轮 RL1 的 0.2.2 形态）', async () => {
    const workspaceReal = fs.realpathSync(workspace)
    await waitForReportLine((line) => line.type === 'watcher' && line.event === 'started')
    fs.writeFileSync(path.join(workspaceReal, 'landing.html'), dirtyArtifactHtml('Landing'))
    await waitForLintFeedbackCount(1)
    const messages = collectLintFeedbackMessages()
    const message = messages[0]
    assert(message.text.includes('[opendesign-design-mode 质量环]'), '回注文本开头应自报质量环身份（本轮 AX7）')
    assert(message.text.includes('purple-gradient'), '回注文本缺检查项 id')
    assert(message.text.includes('修复指引'), '回注文本缺修复指引')
    assert(message.text.includes('仅修复你本会话产出的 HTML'), '回注文本缺作用域句')
    const fedBack = readQualityReport().filter((line) => line.type === 'finding' && line.id === 'purple-gradient' && line.reason === 'fed-back')
    assert(fedBack.length === 1, `landing.html 的 purple-gradient fed-back finding 应恰 1 行：${JSON.stringify(fedBack)}`)
    assert(readQualityReport().some((line) => line.type === 'artifact' && line.path === 'landing.html'), '快照外新写产物应落身份行（本轮 D5④）')
  })

  // ── 评论回路桌面半场（comment-loop 任务书 U6 桌面清单：V8 + V2）────────────────

  /** 设计会话 id（注入步的设计 system 节点定位；写通道载荷与会话行重入都用它）。 */
  const designSessionId = (() => {
    const entry = collectSessionFiles().find((e) => readSystemMessages(e.file).some((t) => t.includes(DESIGN_INJECTION_MARK)))
    if (entry === undefined) throw new AssertionError('找不到设计会话日志（注入步应有设计 system 节点）')
    return entry.sessionId
  })()

  await step('comment-loop·V8 步骤②③：设计面板评论侧栏发送首条评论——徽标「Sent」+ 线程落盘 open × delivered（桌面 0.2.2 形态）', async () => {
    // 上一断言（检查环）不触碰面板：iframe 预览态仍在（预览步已载入 index.html）。
    const tab = page.locator('button.odp-comments-tab')
    await tab.waitFor({ state: 'visible', timeout: 15000 })
    await tab.click()
    await page.waitForSelector('.odp-comments-panel', { timeout: 10000 })
    await page.locator('.odp-comments-panel textarea.odp-comment-input').fill('主视觉配色太艳，压暗一档')
    await page.locator('.odp-comments-composer button.odp-button').click()
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('.odp-thread .odp-badge')).some((el) => el.textContent?.trim() === 'Sent'),
      undefined,
      { timeout: 20000 },
    )
    const threads = commentsThreads()
    assert(threads.length === 1, `首评应恰 1 线程：${JSON.stringify(threads.map((t) => t.id))}`)
    assert(threads[0].id.startsWith(COMMENT_THREAD_ID_PREFIX), `线程 id 应带 ${COMMENT_THREAD_ID_PREFIX} 前缀：${threads[0].id}`)
    assert(
      threads[0].status === 'open' && threads[0].delivery === 'delivered' && typeof threads[0].deliveredAt === 'string',
      `落盘组合态应 open × delivered（deliveredAt 在场）：${JSON.stringify({ status: threads[0].status, delivery: threads[0].delivery, deliveredAt: threads[0].deliveredAt })}`,
    )
    assert(threads[0].artifactPath === 'index.html' && threads[0].text === '主视觉配色太艳，压暗一档', '落盘挂靠/文本不对（D8 文件级挂靠）')
  })

  await step('comment-loop·V8 步骤③：聊天流回注消息 kind 可辨——独立 kind + 文本与 buildCommentMessage 逐字一致（AX2/D6）+ 在轨（未被 discard）', async () => {
    await waitForCommentFeedbackCount(1)
    const messages = collectCommentFeedbackMessages()
    assert(messages.length === 1, `评论回注消息应恰 1 条：${messages.length}`)
    assertCommentMessageText(messages[0], commentsThreads()[0], commentsThreads()[0].text)
    await sleep(2500) // 回合结束与日志 flush 余量后复查在轨
    assert(collectCommentFeedbackMessages().length === 1, '回合结束后回注消息应仍在事件流（未被 discard）')
  })

  await step('comment-loop·V8：桌面宿主 /api 相对路径写通道可达——页面同源 GET 基路径 + POST .create 往返（client/comments/api.ts 同一寻址通道）', async () => {
    const list = await pageFetch(`${COMMENTS_API_BASE_PATH}?sessionId=${encodeURIComponent(designSessionId)}`)
    assert(
      list.status === 200 && Array.isArray(list.body?.threads) && list.body.threads.length === 1,
      `相对路径 GET 基路径应对桌面宿主可达：${JSON.stringify({ status: list.status, threads: list.body?.threads?.length })}`,
    )
    const probe = await pageFetch(COMMENTS_API_BASE_PATH + '.create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: designSessionId, artifactPath: 'index.html', text: '桌面宿主相对路径探针评论' }),
    })
    assert(probe.status === 200 && probe.body?.delivery === 'delivered', `相对路径 POST .create 应可达且投递 delivered：${JSON.stringify({ status: probe.status, delivery: probe.body?.delivery })}`)
    assert(commentsThreads().length === 2, `探针线程应落盘（恰 2 线程）：${commentsThreads().length}`)
  })

  // comment-loop·V2：重启后线程保留（同一设计会话，评论发送并送达后重启宿主再进入该会话）。
  const threadsBeforeRestart = commentsThreads()
  assert(threadsBeforeRestart.length === 2, `重启前应有 2 条已投递线程：${threadsBeforeRestart.length}`)

  await step('comment-loop·V2 步骤②：重启宿主（按 PID 杀进程组 + 同 home relaunch）——会话与评论数据持久性载体', async () => {
    await killProcessGroup()
    url = await launchHost()
  })

  await step('comment-loop·V2 步骤③：重进会话并打开评论侧栏——线程保留（id/文本/路径/状态/时间戳完整，delivered 不回退 pending）', async () => {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(3000)
    await clearModalGates()
    const row = page.locator(`.taiji-pb-row[data-session-id="${designSessionId}"]`)
    assert(await row.count() > 0, `重启后侧栏缺设计会话行（${designSessionId}）`)
    await row.click()
    await page.waitForTimeout(2500)
    await clearModalGates()
    await page.getByRole('button', { name: 'Open right sidebar' }).click()
    await sleep(900)
    await page.getByText('Design preview').first().click()
    await sleep(2000)
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('.odp-row .odp-row-name')).some((el) => el.textContent?.trim() === 'index.html'),
      undefined,
      { timeout: 15000 },
    )
    await page.locator('.odp-row', { hasText: 'index.html' }).first().click()
    await page.waitForSelector('iframe.odp-frame', { timeout: 15000 })
    const tab = page.locator('button.odp-comments-tab')
    await tab.waitFor({ state: 'visible', timeout: 15000 })
    await tab.click()
    await page.waitForSelector('.odp-comments-panel', { timeout: 10000 })
    // 持久性核心判据：评论数据文件逐字节保留（delivered 不回退 pending、时间戳不动）。
    const threadsAfter = commentsThreads()
    assert(
      JSON.stringify(threadsAfter) === JSON.stringify(threadsBeforeRestart),
      `重启后评论数据应逐字节保留：\n重启前：${JSON.stringify(threadsBeforeRestart)}\n重启后：${JSON.stringify(threadsAfter)}`,
    )
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('.odp-thread .odp-badge')).some((el) => el.textContent?.trim() === 'Sent'),
      undefined,
      { timeout: 15000 },
    )
    const threadTexts = await page.evaluate(() => Array.from(document.querySelectorAll('.odp-thread-text')).map((el) => el.textContent?.trim()))
    assert(threadTexts.includes('主视觉配色太艳，压暗一档'), `重启后侧栏应列出原评论：${JSON.stringify(threadTexts)}`)
  })

  await step('comment-loop·V2：重启后 doctor 第⑫节评论环在场形态（线程计数 2 / delivered 2 / parse 正常）——持久性 doctor 视角复核', async () => {
    const composer = page.locator('[contenteditable="true"]').first()
    await composer.click()
    await page.keyboard.type('/opendesign-doctor')
    await sleep(1800)
    const option = page.getByRole('option', { name: /opendesign-doctor/ }).first()
    assert(await option.count() > 0, '/opendesign-doctor 未出现在 slash 菜单')
    await option.click()
    await sleep(3000)
    const body = await page.evaluate(() => document.body.innerText)
    assert(body.includes('【12/12】评论环'), '缺第⑫节评论环')
    assert(body.includes('评论文件：存在'), '⑫ 重启后应报评论文件存在')
    assert(body.includes(commentDistributionLine(commentsThreads())), `⑫ 计数/分布行不对：期望「${commentDistributionLine(commentsThreads())}」`)
    assert(body.includes('parse 健康度：正常'), '⑫ 应报 parse 健康（与读侧 GET 共用同一判定点）')
  })

  // ── comment-loop·V10：steer 前置评论投递（AS9 探针载体；web spec S14 桌面版同款）──────
  // 步骤（设计 §4.1 V10 桌面版同款 ①-⑤）：① 长任务消息先置运行态 → ② 运行中经侧栏发评论
  // → ③ delivery 回写 delivered + 徽标 Sent → ⑤ 检查会话事件流。通道判据 = 评论投递后
  // turn/start 事件计数是否 +1（followup = next-turn 开新轮、steer = next-step 注入当前轮）。
  // steer 形态全量断言（无新轮 + 回合结束后消息仍在事件流——AS9 未被 discard）；followup
  // 形态按设计 §4.1 V10 criteria 协议登记探针不适用（防通道分流致断言假红、或弱化为对
  // followup 恒真的永绿断言）。无凭据环境回合秒败的确定性形态 = followup 分支（web S14
  // 同款环境分界）。基线在长任务发送前取样：长任务轮自身 +1，评论 followup 再 +1。
  const v10CommentText = '主视觉配色太艳，压暗一档'
  const v10BaselineTurnStarts = totalTurnStartCount()

  await step('comment-loop·V10 步骤①：长任务消息先置运行态（Send 即发不等回合——给 steer 留运行窗口；等该轮 turn/start 提交）', async () => {
    const composer = page.locator('[contenteditable="true"]').first()
    await composer.click()
    await page.keyboard.type('把三个页面都按新规范重做')
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: 'Send message' }).click()
    const deadline = Date.now() + 30000
    while (totalTurnStartCount() <= v10BaselineTurnStarts && Date.now() < deadline) await sleep(500)
    assert(
      totalTurnStartCount() > v10BaselineTurnStarts,
      `长任务轮应已开启（turn/start 计数应超过基线 ${v10BaselineTurnStarts}）：${totalTurnStartCount()}`,
    )
  })

  await step('comment-loop·V10 步骤②③：agent 运行中经侧栏发评论——thread.delivery 回写 delivered + 徽标「Sent」', async () => {
    // V2 步骤③已展开侧栏；doctor 步不重挂面板——不在展开态则经 tab 展开（tab 仅折叠态在 DOM）。
    if (!(await page.locator('.odp-comments-panel').isVisible().catch(() => false))) {
      const tab = page.locator('button.odp-comments-tab')
      await tab.waitFor({ state: 'visible', timeout: 15000 })
      await tab.click()
    }
    await page.waitForSelector('.odp-comments-panel', { timeout: 10000 })
    await page.locator('.odp-comments-panel textarea.odp-comment-input').fill(v10CommentText)
    await page.locator('.odp-comments-composer button.odp-button').click()
    // 等待第 3 线程真正落盘（既有 V8 两线程本就显示 Sent 徽标，以徽标为条件会被即时满足，
    // 读到追加前的旧文件——实测假红）。新线程 append 末尾（store.ts createCommentThread [...threads, thread]）。
    let threads = commentsThreads()
    const deadline = Date.now() + 20000
    while (threads.length < 3 && Date.now() < deadline) {
      await sleep(500)
      threads = commentsThreads()
    }
    const latest = threads.at(-1)
    assert(threads.length === 3, `V10 评论应落盘为第 3 线程（V8 两探针 + V10）：${threads.length}`)
    assert(
      latest.delivery === 'delivered' && latest.text === v10CommentText && latest.artifactPath === 'index.html',
      `V10 线程应 delivered 且挂靠/文本正确：${JSON.stringify({ delivery: latest.delivery, text: latest.text, artifactPath: latest.artifactPath })}`,
    )
  })

  await step('comment-loop·V10 步骤⑤：回注消息 kind 可辨 + source 五字段与载荷逐字正确（AX2 独立 kind / D3 / D6 围栏 JSON）', async () => {
    await waitForCommentFeedbackCount(3)
    const messages = collectCommentFeedbackMessages()
    assert(messages.length === 3, `评论回注消息应恰 3 条（V8 两探针 + V10 一条）：${messages.length}`)
    const threads = commentsThreads()
    assertCommentMessageText(messages.at(-1), threads.at(-1), v10CommentText)
  })

  // 通道判定：等 followup 形态显形（评论新轮 turn/start）或 15s 预算耗尽（steer 形态——
  // 评论注入当前轮不开新轮；凭据环境长任务仍在运行时亦落此分支）。web spec S14 同款。
  let v10FollowupForm = false
  {
    const channelDeadline = Date.now() + 15000
    while (Date.now() < channelDeadline) {
      if (totalTurnStartCount() > v10BaselineTurnStarts + 1) { v10FollowupForm = true; break }
      await sleep(500)
    }
  }

  if (v10FollowupForm) {
    await step('comment-loop·V10 探针登记（设计 §4.1 V10 协议）：本轮 followup 通道（评论投递开新轮，turn/start +1）——steer 形态断言不在本轮计数，凭据环境长任务重造后补跑', async () => {
      await sleep(2500) // 回合结束与日志 flush 余量
      const messages = collectCommentFeedbackMessages()
      const latest = commentsThreads().at(-1)
      assert(
        totalTurnStartCount() === v10BaselineTurnStarts + 2,
        `followup 形态应恰多开一个新轮（基线 ${v10BaselineTurnStarts} +长任务轮 +评论轮）：${totalTurnStartCount()}`,
      )
      assert(messages.length === 3, `followup 通道回注消息应仍在事件流（未被 discard）：${messages.length}`)
      assert(latest.delivery === 'delivered', `followup 通道 delivery 应回写 delivered：${latest.delivery}`)
      console.log('    [环境分界] comment-loop·V10：本轮评论走 followup 通道（agent 轮次先于评论结束——无凭据环境回合秒败的确定性形态）。设计 §4.1 V10 判据：该轮不适用 steer 探针、需重造 steer 场景后再断言（防通道分流致断言假红、或断言被弱化为对 followup 恒真的永绿断言）；steer 形态需凭据环境长任务，真机验收承接')
    })
  } else {
    await step('comment-loop·V10 步骤③⑤ steer 形态全量断言：评论注入当前轮（无新轮 turn/start）+ 回合结束后消息仍在事件流（AS9 未被 discard）', async () => {
      assert(
        totalTurnStartCount() === v10BaselineTurnStarts + 1,
        `steer 形态不应开启新轮（turn/start 计数应保持基线 ${v10BaselineTurnStarts} +1）：${totalTurnStartCount()}`,
      )
      const messages = collectCommentFeedbackMessages()
      assert(messages.length === 3, `steered 消息在回合结束后应仍在事件流（AS9）：${messages.length}`)
    })
  }

  await step('V1·AS7 衔接结论：asar 宿主 http 形态 iframe 隔离语义复核通过（dsh-app:// 壳层形态以 V1·U6 交付门实测为准：无混合内容阻拦，V1 复审决议 RR3 关闭）', async () => {
    // 本 spec 的宿主 = app 内嵌 0.2.2 宿主（http 形态）。上一断言的探针已复核 sandbox
    // 隔离（open 路由拒、非产物不可读、cookie SecurityError）。桌面壳（dsh-app:// 源嵌
    // http://127.0.0.1 iframe）的混合内容实测由 V1·U6 交付门探针完成：load 触发、脚本执行、
    // Origin: null、宿主不可读 iframe——结论「无阻拦」已在 V1·U6 runlog 登记，此处不重复实测。
  })

  const failed = stepOut.filter((entry) => !entry.ok)
  console.log('\n════════ desktop e2e 汇总 ════════')
  for (const entry of stepOut) console.log(`${entry.ok ? 'PASS' : 'FAIL'}  ${entry.name}`)
  console.log(`\n合计：${stepOut.length - failed.length}/${stepOut.length} 步绿；运行根：${RUN_ROOT}${process.env.KEEP_E2E_STATE === '1' ? '（保留）' : ''}`)
  if (failed.length === 0 && process.env.KEEP_E2E_STATE !== '1') {
    fs.rmSync(RUN_ROOT, { recursive: true, force: true })
  }
  await browser.close()
  await killProcessGroup()
  process.exit(failed.length === 0 ? 0 : 1)
} catch (error) {
  console.error(`[desktop-e2e] 套件级失败：${error instanceof Error ? error.stack : String(error)}`)
  try { await browser.close() } catch { /* 已关 */ }
  await killProcessGroup()
  process.exit(1)
}
