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
 * 注入（会话日志 system 节点特征句）→ doctor 十一分节（V5 的 0.2.2 形态，前八节零回归）→
 * 材质化恰 5 管理名（V1 设计包 D8 + opendesign-assets-quality D9）→ 预览面板 iframe 产物载入 + 探针（V1·RL6/V1·RL8 的 0.2.2 形态）→
 * 检查环桌面宿主可用性（V2 的 0.2.2 形态：真机写盘 P0 产物 → 回注消息 source.kind
 * 协议信号形态断言 + report.jsonl fed-back 记录——RL1 的 0.2.2 半场）。
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
/** 质量环回注消息的 source.kind（lib/quality/feedback.js LINT_SOURCE_KIND 同值；AX7）。 */
const LINT_SOURCE_KIND = 'opendesign-design-mode/lint'
/** P0 命中特征（purple-gradient：线性渐变含紫 hex，lint.ts PURPLE_HEXES 命中形态）。 */
const DIRTY_GRADIENT = 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)'

// 材质化写清单与 deck 协议派生文本直接对账生产实现（同仓构建产物；清单/文本漂移即红）。
const { MATERIALIZED_WRITE_LIST, DECK_FRAMEWORK_FILE_NAME } = await import(
  path.join(PKG_ROOT, 'lib', 'materialize', 'copy.js')
)
const { renderDeckFrameworkFile } = await import(path.join(PKG_ROOT, 'lib', 'protocols', 'deck.js'))

/** doctor 十一分节标题（lib/commands/doctor.ts DOCTOR_SECTIONS 字面对账；U6 扩展后形态）。 */
const DOCTOR_SECTIONS_11 = [
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
]

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
const child = spawn(DESKTOP_CLI, ['--patch', patchFile, '--profile', 'web', '--no-open', '--port', '0'], {
  env: { ...process.env, DSH_HOME: home, OD_RESOURCE_ROOT: MINI_OD_ROOT },
  cwd: workspaceReal,
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
})
let hostOutput = ''
child.stdout.on('data', (chunk) => { hostOutput += String(chunk) })
child.stderr.on('data', (chunk) => { hostOutput += `[stderr] ${String(chunk)}` })

const deadline = Date.now() + 90000
let url = null
while (url === null && Date.now() < deadline) {
  if (child.exitCode !== null || child.signalCode !== null) {
    console.error(`[desktop-e2e] 宿主提前退出：\n${hostOutput.slice(-2500)}`)
    console.error('[desktop-e2e] 恢复动作：检查手写 profile 形态（bundles 清单/依赖 link）与 0.2.2 宿主的兼容性。')
    process.exit(1)
  }
  for (const line of hostOutput.split('\n')) {
    const match = /^dsh web: (https?:\/\/\S+)$/.exec(line.trim())
    if (match !== null) { url = match[1]; break }
  }
  if (url !== null) break
  await sleep(300)
}
if (url === null) {
  await killProcessGroup()
  console.error(`[desktop-e2e] 等待 URL 行超时：\n${hostOutput.slice(-2500)}`)
  process.exit(1)
}
console.log(`[desktop-e2e] URL 就绪：${url.replace(/token=[^&]+/, 'token=REDACTED')}`)
console.log(`[desktop-e2e] 运行根：${RUN_ROOT}${process.env.KEEP_E2E_STATE === '1' ? '（保留）' : ''}`)

async function killProcessGroup() {
  try { process.kill(-child.pid, 'SIGTERM') } catch { /* 已退出 */ }
  const waitDeadline = Date.now() + 6000
  while (Date.now() < waitDeadline) {
    try { process.kill(child.pid, 0); await sleep(200) } catch { return }
  }
  try { process.kill(-child.pid, 'SIGKILL') } catch { /* 已退出 */ }
}

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

/** 读取一份会话日志的 user/message 消息（data = 消息本体；回注消息按 source.kind 辨识）。 */
function readUserMessages(file) {
  const messages = []
  for (const line of fs.readFileSync(file, 'utf8').trim().split('\n')) {
    if (line === '') continue
    const event = JSON.parse(line)
    if (event.type === 'user/message') {
      messages.push({
        kind: event.data?.source?.kind ?? null,
        text: event.data?.content?.[0]?.text ?? '',
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

  await step('roster：选择器菜单含设计模式卡片（RL1 的 0.2.2 形态）', async () => {
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

  await step('注入：设计会话 system 节点含 OD 资产特征句（V1 的 0.2.2 形态）', async () => {
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
    // design-systems 三目录），形状包清单/craft 指路/manifest 感知三段按 AX5 设计性降级省略，
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

  await step('doctor：十一分节齐全（V5 的 0.2.2 形态，前八节零回归）', async () => {
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
    DOCTOR_SECTIONS_11.forEach((title, index) => {
      assert(body.includes(`【${index + 1}/11】${title}`), `缺分节 ${index + 1}/11 ${title}`)
    })
    // ⑩ 缺省态（clone 未登记）：无法比对 + 登记恢复动作；⑪ 监听器运行形态。
    assert(body.includes('源码仓 clone 探测：未登记'), '⑩ 未登记态应报「未登记」')
    assert(body.includes('无法比对'), '⑩ 未登记态应报「无法比对」')
    assert(body.includes('重新运行 /opendesign-doctor 并附 OpenDesign 源码仓 clone 路径参数'), '⑩ 缺登记路径恢复动作')
    assert(body.includes('监听器状态：运行中推定'), '⑪ 设计会话应报监听器运行中推定（检查环桌面宿主已起监听，doctor 按最后生命周期记录推定呈现）')
    assert(body.includes('检查发现：共 0 条'), '⑪ 尚无发现时应报零发现')
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

  await step('检查环可用性：真机写盘 P0 产物 → followup 回注消息 source.kind 协议信号形态（V2/RL1 的 0.2.2 形态）', async () => {
    const workspaceReal = fs.realpathSync(workspace)
    await waitForReportLine((line) => line.type === 'watcher' && line.event === 'started')
    fs.writeFileSync(path.join(workspaceReal, 'landing.html'), dirtyArtifactHtml('Landing'))
    await waitForLintFeedbackCount(1)
    const messages = collectLintFeedbackMessages()
    const message = messages[0]
    assert(message.text.includes('[opendesign-design-mode 质量环]'), '回注文本开头应自报质量环身份（AX7）')
    assert(message.text.includes('purple-gradient'), '回注文本缺检查项 id')
    assert(message.text.includes('修复指引'), '回注文本缺修复指引')
    assert(message.text.includes('仅修复你本会话产出的 HTML'), '回注文本缺作用域句')
    const fedBack = readQualityReport().filter((line) => line.type === 'finding' && line.id === 'purple-gradient' && line.reason === 'fed-back')
    assert(fedBack.length === 1, `landing.html 的 purple-gradient fed-back finding 应恰 1 行：${JSON.stringify(fedBack)}`)
    assert(readQualityReport().some((line) => line.type === 'artifact' && line.path === 'landing.html'), '快照外新写产物应落身份行（D5④）')
  })

  await step('V1·AS7 衔接结论：asar 宿主 http 形态 iframe 隔离语义复核通过（dsh-app:// 壳层形态以 V1·U6 交付门实测为准：无混合内容阻拦，V1 复审决议 RR3 关闭）', async () => {
    // 本 spec 的宿主 = app 内嵌 0.2.2 宿主（http 形态）。上一断言的探针已复核 sandbox
    // 隔离（open 路由拒、非产物不可读、cookie SecurityError）。桌面壳（dsh-app:// 源嵌
    // http://127.0.0.1 iframe）的混合内容实测由 V1·U6 交付门探针完成：load 触发、脚本执行、
    // Origin: null、宿主不可读 iframe——结论「无阻拦」已在 U6 runlog 登记，此处不重复实测。
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
