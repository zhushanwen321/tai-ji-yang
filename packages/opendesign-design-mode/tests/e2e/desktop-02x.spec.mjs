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
 * 核心组（验收计划表 A8 的 L3 段；模型行为段归 D3）：roster（选择器菜单 + 芯片选择）→
 * 注入（会话日志 system 节点特征句）→ doctor 八项 → 预览面板 iframe 产物载入 + 探针
 * （RL6/RL8 的 0.2.2 形态）。
 *
 * AS7 混合内容（桌面 dsh-app:// 嵌 http://127.0.0.1 iframe）：实测已于 U6 交付门完成并关闭
 * （RR3）：裸 iframe 与 sandbox="allow-scripts" 均触发 load、无混合内容/CSP 阻拦、产物脚本
 * Origin: null——本 spec 在 asar 宿主（http 形态）复核 iframe 隔离语义（RL8 探针），AS7 的
 * dsh-app:// 壳层形态结论以 U6 runlog 为准记录，不在此重复实测。
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
  '# desktop e2e 观察用 overlay（U8）：会话日志落盘为未压缩 JSONL',
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
    assert(!sys.includes('$OD_BIN'), '注入文本含 $OD_BIN 特征串（RL3 命令清零失效）')
  })

  await step('doctor：八项分节齐全（V4 的 0.2.2 形态）', async () => {
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
    const sections = ['安装形态与资源根', '清单路径与三层版本', 'roster 完整性核验', '改写规则命中清单', '材质化状态', '资产代际提示', '异常与恢复动作', '止损位状态']
    sections.forEach((title, index) => {
      assert(body.includes(`【${index + 1}/8】${title}`), `缺分节 ${index + 1}/8 ${title}`)
    })
  })

  await step('预览：fixture 产物载入 iframe 且探针呈隔离形态（RL6/RL8 的 0.2.2 形态）', async () => {
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

  await step('AS7 衔接结论：asar 宿主 http 形态 iframe 隔离语义复核通过（dsh-app:// 壳层形态以 U6 交付门实测为准：无混合内容阻拦，RR3 关闭）', async () => {
    // 本 spec 的宿主 = app 内嵌 0.2.2 宿主（http 形态）。上一断言的探针已复核 sandbox
    // 隔离（open 路由拒、非产物不可读、cookie SecurityError）。桌面壳（dsh-app:// 源嵌
    // http://127.0.0.1 iframe）的混合内容实测由 U6 交付门探针完成：load 触发、脚本执行、
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
