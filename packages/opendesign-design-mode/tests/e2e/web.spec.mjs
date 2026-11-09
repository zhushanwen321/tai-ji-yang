/**
 * opendesign-design-mode 双版本 e2e —— web 版（0.1.7 隔离 DSH_HOME）。
 *
 * 场景编排（设计 §4.1 V1-V11 的 L3 可脚本化子集；验收计划表 A1/A3b/A4/A5/A6/A13/A14/A15）：
 *   S1 A1/V1+RL1 —— preset 可见性（roster 卡片 custom 分组 + 选择器菜单）+ 提示词注入
 *      （会话日志 system 节点含 OD core/路由特征句）+ 默认会话行为不变（standard 会话无设计内容）
 *      + 材质化落盘（.od-frames/ 四文件，D8）。
 *   S2 A3b/A14+RL6/RL8 —— 预览面板交互（fixture 产物经伺服路由载入 iframe、脚本可执行）
 *      + 产物脚本隔离探针（fetch 不带宿主 cookie、伺服根非产物不可读、open 路由响应不可得）。
 *   S3 A4/V4 —— doctor 命令八项分节断言（/opendesign-doctor 输出 DOM）。
 *   S4 A5/V5+RL5 —— 无资产环境（资源根指向空目录）：roster broken（选择器不出现该模式、
 *      设置页诊断含安装指引）+ 默认 preset 不受影响；SI3 假阳性形态（清单损坏）：
 *      诊断文案区分「未检测到」与「检测失败请重启 DSH 重试」。
 *   S5 A6/V6 —— 资产漂移 fixture（清单在非默认相对位置）仍可定位 + 画像版本正确。
 *   S6 A13/V9+RL7 —— resume 代际重组：gen1 创建会话 → 关实例 → 换 gen2 资产 → resume →
 *      新一轮 system 节点反映 gen2、无 gen1 残留句 → doctor 代际提示在场。
 *   S7 A15/V11 —— git fixture 项目目录连续三次设计会话（一次换资产）：新增文件恰为
 *      .od-frames/ 四文件、幂等、git status 无 tracked 变更（反向断言）。
 *
 * 真实模型对话（V2/V3/V7 的模型行为段）不在本套件（exec-plan：L4 场景归 D3 验收阶段）。
 * 无 API key 的隔离实例上发消息：system 提示词在 provider 调用前已提交会话日志
 * （dsh-agent-loop step() 先 project 后 stream，亲读核实）——本套件全部注入断言走该通道。
 *
 * 真机驱动纪律：进程生命周期（安装/启动/URL 解析/探活/按 PID 清理）复用项目 verification
 * skill 的 runner 库（scripts/verify/lib/*，此前会话交付的未跟踪在途资产——只 import 不改写）；
 * 会话日志断言通道 = `--patch` overlay 把 dsh-session-persistence-jsonl 切到 compression:none
 * （宿主公开配置机制，非宿主源码改动）。收尾按记录的 PID 杀进程组，禁 pkill。
 *
 * 运行：node packages/opendesign-design-mode/tests/e2e/web.spec.mjs（仓根执行；退出码 0 = 全绿）。
 * 环境变量：DSH_BIN（缺省 PATH 上的 dsh，须为 0.1.7-rc.2）、KEEP_E2E_STATE=1（保留隔离 home 供排障）。
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
const require = createRequire(path.join(REPO_ROOT, 'package.json'))

const playwright = require('playwright')
const { probeUrl, killProcessTree, installPlugin } = await import(
  path.join(REPO_ROOT, 'scripts', 'verify', 'lib', 'dsh-process.mjs')
)
const { dshSpawnCommand, parseDshUrlLine } = await import(
  path.join(REPO_ROOT, 'scripts', 'verify', 'lib', 'args.mjs')
)
const { openVerifyPage, bootInto } = await import(
  path.join(REPO_ROOT, 'scripts', 'verify', 'lib', 'browser.mjs')
)

const DSH_BIN = process.env.DSH_BIN ?? 'dsh'
const KEEP_STATE = process.env.KEEP_E2E_STATE === '1'

/** 本轮全部隔离状态与证据的根（os.tmpdir 下，OS 生命周期回收；KEEP_STATE 时保留供排障）。 */
const RUN_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'opendesign-e2e-'))
const TEMPLATE_HOME = path.join(RUN_ROOT, 'template-home')
const WORKSPACE_ROOT = path.join(RUN_ROOT, 'workspaces')
fs.mkdirSync(WORKSPACE_ROOT, { recursive: true })
/** 全部自启进程的 PID（收尾按 PID 杀进程组；禁 pkill）。 */
const livePids = []

// ── 断言 harness ─────────────────────────────────────────────────────────────

/** 单条断言失败（携带场景与步骤定位）。 */
class AssertionError extends Error {}

/**
 * 步骤内断言。失败抛 {@link AssertionError}，由场景 runner 捕获归因到步骤。
 * @param {boolean} cond
 * @param {string} message - 期望 vs 实际的可定位描述。
 */
function assert(cond, message) {
  if (!cond) throw new AssertionError(message)
}

/** 场景步骤：逐条记录，全部通过 = 场景绿；任一失败归因到步骤名。 */
function step(results, name, fn) {
  try {
    fn()
    results.push({ name, ok: true })
    console.log(`    ✓ ${name}`)
  } catch (error) {
    results.push({ name, ok: false, error })
    console.log(`    ✗ ${name}\n      ${error instanceof Error ? error.message : String(error)}`)
  }
}
/** 异步步骤（同 step，Promise 语义）。 */
async function stepAsync(results, name, fn) {
  try {
    await fn()
    results.push({ name, ok: true })
    console.log(`    ✓ ${name}`)
  } catch (error) {
    results.push({ name, ok: false, error })
    console.log(`    ✗ ${name}\n      ${error instanceof Error ? error.message : String(error)}`)
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// ── fixture 特征串（运行时从 fixture 文件提取，fixture 改动不致断言漂移）──────────

/** mini-od 场景包目录（manifest 所在；路由段任务档绝对路径的锚）。 */
const MINI_OD_SCENARIO = path.join(
  FIXTURES, 'mini-od', 'plugins', '_official', 'scenarios', 'od-next-strategy',
)
/** 设计会话注入文本的稳定特征：U3 路由段标题（自产内容，两代 fixture 同形）。 */
const DESIGN_INJECTION_MARK = '## Task routing (design mode)'
/** mini-od 注入文本的资产特征：路由段里的 prototype 任务档绝对路径。 */
const MINI_OD_PROFILE_PATH = path.join(MINI_OD_SCENARIO, 'assets', 'task-profiles', 'prototype.md')
/** resume gen1 特征句 A（fixture 文件内含；断言「不含」用）。 */
const GEN1_SENTENCE = 'deliver the actual image file'
/** resume gen2 特征句 B（升级模拟句；断言「含」用）。 */
const GEN2_SENTENCE = 'report the media capability gap'

for (const [file, mark] of [
  [path.join(E2E_FIXTURES, 'resume-gen1', 'assets', 'core-system-prompt.md'), GEN1_SENTENCE],
  [path.join(E2E_FIXTURES, 'resume-gen2', 'assets', 'core-system-prompt.md'), GEN2_SENTENCE],
]) {
  assert(fs.readFileSync(file, 'utf8').includes(mark), `fixture 特征句缺席：${file} 应含 ${JSON.stringify(mark)}`)
}

// ── 隔离实例生命周期 ─────────────────────────────────────────────────────────

/**
 * 模板 home：一次性把两包装进 web profile（pnpm 安装最贵，只做一次；其余场景克隆它）。
 * 克隆保留 node_modules 里的仓内符号链接（指向本仓 lib/，改动即生效）。
 */
async function ensureTemplateHome() {
  fs.mkdirSync(TEMPLATE_HOME, { recursive: true })
  for (const repo of [REPO_ROOT, PKG_ROOT]) {
    const outcome = installPlugin({ dshBin: DSH_BIN, dshHome: TEMPLATE_HOME, profile: 'web', repo })
    if (!outcome.ok) {
      throw new Error(`模板 home 插件安装失败（${repo}）：${outcome.reason}\n${outcome.hint}\n${outcome.output.slice(-800)}`)
    }
  }
}

/**
 * 场景实例：克隆模板 home → seed 默认工作区（指向场景工作目录）→ 自启隔离 dsh web
 * （compression:none patch + OD_RESOURCE_ROOT fixture 覆盖）→ 探活就绪。
 * @param {object} input
 * @param {string} input.label - 场景名（home 目录名成分）。
 * @param {string} input.fixtureRoot - OD_RESOURCE_ROOT 覆盖值（fixture 资产根）。
 * @param {string} input.workspaceDir - 会话工作目录（seed 进默认工作区；须已存在）。
 * @returns {Promise<{ url: string, home: string, page: import('playwright').Page, close(): Promise<void> }>}
 */
async function withInstance({ label, fixtureRoot, workspaceDir }) {
  const home = path.join(RUN_ROOT, `home-${label}`)
  fs.cpSync(TEMPLATE_HOME, home, { recursive: true })
  fs.rmSync(path.join(home, 'sessions'), { recursive: true, force: true })
  fs.rmSync(path.join(home, 'storages'), { recursive: true, force: true })

  // 默认工作区 seed：路径必须是 realpath（宿主 attachSession 按 realpath 对账，/tmp 符号链接
  // 环境实测：非 realpath 形态 seed 会让会话 attach 失败）。
  fs.mkdirSync(path.join(home, 'storages'), { recursive: true })
  const workspaceId = crypto.randomUUID()
  const workspaceReal = fs.realpathSync(workspaceDir)
  fs.writeFileSync(path.join(home, 'storages', 'workspace.json'), JSON.stringify({
    unit: { name: 'workspace', version: 2 },
    global: {
      initialized: true,
      workspaceIds: [workspaceId],
      archivedSessionIds: [],
      pinnedSessionIds: [],
      defaultWorkspaceId: workspaceId,
    },
    tables: {
      workspaces: {
        [workspaceId]: {
          path: workspaceReal,
          title: path.basename(workspaceDir),
          sessionIds: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    },
  }, null, 2))

  // 会话日志切未压缩 JSONL（断言通道）：patch 只覆盖 compression，root 沿用宿主基线表达式。
  const patchFile = writeSessionLogPatch(home)
  return startInstance({ label, home, fixtureRoot, patchFile, cwd: workspaceDir })
}

/** 写会话日志 patch（compression:none 断言通道；root 沿用宿主基线表达式）。 */
function writeSessionLogPatch(home) {
  const patchFile = path.join(home, 'e2e-patch.yml')
  fs.writeFileSync(patchFile, [
    '# e2e 观察用 overlay（U8）：会话日志落盘为未压缩 JSONL，供 system 节点断言',
    '- id: session-persistence-jsonl',
    '  config:',
    "    root: !!js dshHomePath('sessions')",
    '    compression: none',
    '',
  ].join('\n'))
  return patchFile
}

/**
 * 自启隔离 dsh web（--patch + OD_RESOURCE_ROOT 覆盖）→ stdout 解析认证 URL → 探活 → 开页面。
 * 失败即按 PID 收场（不留孤儿）；stopInstance 按 PID 杀进程组。
 *
 * cwd = 场景工作目录：0.1.7 无 working-directory 服务，伺服根回退 process.cwd()
 * （lib/serve/artifacts-route.ts resolveServeRoot 的缺席语义）——把 dsh 进程落在工作目录，
 * 伺服根与会话 cwd（seed 工作区）对齐，这正是用户「cd 项目目录 && dsh web」的启动形态。
 */
async function startInstance({ label, home, fixtureRoot, patchFile, cwd }) {
  // --patch 是 launcher 旗标，必须位于 --profile 之前（dsh CLI 实测：放在 profile 之后报 unknown option）；
  // dsh bin 可能是 .js 形态（dshSpawnCommand 返回 [node, bin]），展开后再拼 launcher 参数。
  const [dshFile, ...dshPrefix] = dshSpawnCommand(DSH_BIN)
  const child = spawn(dshFile, [
    ...dshPrefix, '--patch', patchFile, '--profile', 'web', '--no-open', '--port', '0',
  ], {
    env: { ...process.env, DSH_HOME: home, OD_RESOURCE_ROOT: fixtureRoot },
    cwd: cwd !== undefined ? fs.realpathSync(cwd) : undefined,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true, // 进程组长：stop 按组终止（runner 库同纪律）
  })
  livePids.push(child.pid)

  // 从 stdout 解析认证 URL（不猜端口不猜 token；token 含 - 与 _，正则 [A-Za-z0-9_-]+ 同款纪律）。
  let output = ''
  child.stdout.on('data', (chunk) => { output += String(chunk) })
  child.stderr.on('data', (chunk) => { output += `[stderr] ${String(chunk)}` })
  const deadline = Date.now() + 60000
  let url = null
  while (url === null && Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`dsh web 提前退出（label=${label}）：\n${output.slice(-2000)}`)
    }
    for (const line of output.split('\n')) {
      const parsed = parseDshUrlLine(line)
      if (parsed !== null) { url = parsed.url; break }
    }
    if (url !== null) break
    await sleep(200)
  }
  if (url === null) {
    await stopInstance(child.pid)
    throw new Error(`等待 dsh web URL 行超时（label=${label}）。输出尾部：\n${output.slice(-2000)}`)
  }

  // HTTP 探活（进程活着 ≠ 就绪；runner 库同语义）。
  let probe = { ok: false, reason: 'not probed' }
  const probeDeadline = Date.now() + 30000
  while (Date.now() < probeDeadline) {
    probe = await probeUrl(url)
    if (probe.ok) break
    await sleep(300)
  }
  if (!probe.ok) {
    await stopInstance(child.pid)
    throw new Error(`dsh web 探活失败（label=${label}）：${probe.reason}`)
  }

  const session = await openVerifyPage(playwright, { url })
  await bootInto(session.page)
  await clearModalGates(session.page)

  return {
    url,
    home,
    page: session.page,
    async close() {
      await session.close()
      await stopInstance(child.pid)
    },
  }
}

/**
 * 清掉残留引导弹窗（bootInto 的门类循环有时早于第二个弹窗渲染完成就退出，
 * 留下带遮罩的 API key 引导框——0.1.7 实测其「Save and continue」在无 key 时禁用，
 * Escape 不一定可关）。策略：可见门类按钮优先点，其次 Escape，直到遮罩消失（预算 10s）。
 */
async function clearModalGates(page) {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => ({
      masked: Array.from(document.querySelectorAll('[class*="_mask_"]')).some((el) => el.offsetWidth > 0),
      dialog: Array.from(document.querySelectorAll('[role="dialog"]')).some((el) => el.offsetWidth > 0),
    }))
    if (!state.masked && !state.dialog) return
    const gate = page.locator('button:visible', { hasText: /Configure later|Skip|Not now|稍后|跳过|继续|Continue/i }).first()
    if (await gate.isVisible().catch(() => false)) {
      await gate.click().catch(() => {})
    } else {
      await page.keyboard.press('Escape').catch(() => {})
    }
    await page.waitForTimeout(500)
  }
}

/** 按记录 PID 杀进程组（SIGTERM → 兜底 SIGKILL；runner 库实现）。 */
async function stopInstance(pid) {
  const index = livePids.indexOf(pid)
  if (index !== -1) livePids.splice(index, 1)
  await killProcessTree(pid)
}

// ── UI 驱动助手（选择器全部为宿主结构属性 / 本包 odp- 类名，无构建期 hash）──────

/**
 * 在 hero 选择默认工作区（seed 的场景工作目录）。芯片 aria-label 恒为 'Choose workspace'，
 * 选中后可见文案变为工作区标题（0.1.7 实测）。
 */
async function pickWorkspace(page, workspaceDir) {
  const title = path.basename(workspaceDir)
  await page.getByRole('button', { name: 'Choose workspace' }).click()
  await page.locator('[role="menuitem"]', { hasText: title }).first().click()
  await page.waitForTimeout(800)
  const chipText = await page.getByRole('button', { name: 'Choose workspace' }).textContent()
  if (chipText === null || !chipText.includes(title)) {
    throw new AssertionError(`工作区选择未生效：芯片文案 ${JSON.stringify(chipText?.trim())} 不含 ${JSON.stringify(title)}`)
  }
}

/**
 * 打开 preset 芯片菜单并返回菜单项文本清单（新会话选择器 roster 的 healthy 子集）。
 * 结束时按 Escape 收起菜单。
 * @returns {Promise<string[]>}
 */
async function readPickerItems(page) {
  const chip = page.locator('button[aria-haspopup="menu"][title*="agent preset"]').first()
  await chip.click()
  await page.waitForTimeout(500)
  const items = await page.evaluate(() => Array.from(document.querySelectorAll('[role="menuitem"]'))
    .map((el) => (el.textContent ?? '').trim()))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  return items
}

/** 在 hero 把 preset 选为设计模式（芯片 staged pick；对 blank 会话立即生效）。 */
async function pickDesignPreset(page) {
  const chip = page.locator('button[aria-haspopup="menu"][title*="agent preset"]').first()
  await chip.click()
  await page.waitForTimeout(400)
  await page.locator('[role="menuitem"]', { hasText: 'OpenDesign 设计模式' }).first().click()
  await page.waitForTimeout(1200)
  const chipText = await chip.textContent()
  if (chipText === null || !chipText.includes('OpenDesign 设计模式')) {
    throw new AssertionError(`设计 preset 选择未生效：芯片文案 ${JSON.stringify(chipText?.trim())}`)
  }
}

/**
 * 发送一条用户消息并等到回合跑完（无 API key 的隔离实例上，回合以 MISSING_CREDENTIAL
 * 失败收场——system 提示词在 provider 调用前已提交会话日志，该失败文案即「回合已跑」信号）。
 */
async function sendUserMessage(page, text) {
  const composer = page.locator('[contenteditable="true"]').first()
  await composer.click()
  await page.keyboard.type(text)
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Send message' }).click()
  await page.waitForFunction(
    () => document.body.innerText.includes('MISSING_CREDENTIAL') || document.body.innerText.includes('This turn failed'),
    undefined,
    { timeout: 45000 },
  )
  await page.waitForTimeout(1500) // 落盘 batch flush 余量
}

/**
 * 在会话内执行 /opendesign-doctor 并返回页面全文（命令输出直接渲染在会话流）。
 * 前置：当前会话已存在（至少发过一条消息）。
 */
async function runDoctor(page) {
  const composer = page.locator('[contenteditable="true"]').first()
  await composer.click()
  await page.keyboard.type('/opendesign-doctor')
  await page.waitForTimeout(1500)
  const option = page.getByRole('option', { name: /opendesign-doctor/ }).first()
  const optionCount = await option.count()
  if (optionCount === 0) throw new AssertionError('/opendesign-doctor 未出现在 slash 命令菜单')
  await option.click()
  await page.waitForTimeout(2500)
  return page.evaluate(() => document.body.innerText)
}

/**
 * 读取设置页 Agent presets 分区的 roster 形态（卡片 id / 分组标题 / broken 徽标 / 诊断文案）。
 * 打开设置 → Agent presets → 抓 DOM → Escape 收起。
 */
async function readSettingsRoster(page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.waitForTimeout(900)
  await page.getByText('Agent presets', { exact: true }).first().click()
  await page.waitForTimeout(1500)
  const roster = await page.evaluate(() => ({
    groups: Array.from(document.querySelectorAll('h3')).map((h) => (h.textContent ?? '').trim()),
    cards: Array.from(document.querySelectorAll('[data-agent-preset-id]')).map((el) => ({
      id: el.getAttribute('data-agent-preset-id'),
      text: (el.textContent ?? '').trim(),
      alert: el.querySelector('[role="alert"]')?.textContent?.trim() ?? null,
      broken: el.textContent?.includes('Failed to load') ?? false,
    })),
  }))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  return roster
}

/** 打开右侧栏设计面板（guide 入口，无地址形态 → 产物列表兜底）。 */
async function openDesignPanel(page) {
  await page.getByRole('button', { name: 'Open right sidebar' }).click()
  await page.waitForTimeout(900)
  await page.getByText('Design preview').first().click()
  await page.waitForTimeout(1500)
  const body = await page.locator('.odp-body').count()
  if (body === 0) throw new AssertionError('设计面板未打开（.odp-body 缺席）')
}

// ── 会话日志断言通道（compression:none 的 JSONL）────────────────────────────

/** 收集隔离 home 下全部会话日志（按 mtime 升序）。 */
function collectSessionFiles(home) {
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

/** 读取一份会话日志的 system/message 文本清单与 preset 选定记录。 */
function readSessionLog(file) {
  const systemMessages = []
  const presetSelections = []
  for (const line of fs.readFileSync(file, 'utf8').trim().split('\n')) {
    if (line === '') continue
    const event = JSON.parse(line)
    if (event.type === 'system/message') {
      systemMessages.push(event.data?.message?.content?.[0]?.text ?? '')
    }
    if (event.type === 'agent-preset/selected') {
      presetSelections.push(event.data?.agentPreset ?? '')
    }
  }
  return { systemMessages, presetSelections }
}

/**
 * 轮询会话日志直到谓词满足（落盘有 batch 窗口，轮询而非盲等）。
 * @returns {Promise<{ file: string, log: ReturnType<readSessionLog> }>}
 */
async function waitForSessionLog(home, predicate, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  let lastSeen = 'no session files yet'
  while (Date.now() < deadline) {
    for (const entry of collectSessionFiles(home).reverse()) {
      const log = readSessionLog(entry.file)
      if (predicate(entry, log)) return { file: entry.file, log }
      lastSeen = `${entry.sessionId} sys=${log.systemMessages.length}`
    }
    await sleep(500)
  }
  throw new AssertionError(`等待会话日志超时（${timeoutMs}ms；最后见到：${lastSeen}）`)
}

// ── 场景工作目录 ─────────────────────────────────────────────────────────────

/** 建场景工作目录（可选 git 化；返回 realpath）。 */
function makeWorkspaceDir(label, { git = false } = {}) {
  const dir = fs.mkdtempSync(path.join(WORKSPACE_ROOT, `${label}-`))
  if (git) {
    const run = (args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' })
    run(['init', '-q'])
    run(['-c', 'user.email=e2e@example.invalid', '-c', 'user.name=e2e', 'commit', '--allow-empty', '-q', '-m', 'init'])
    if (run(['log', '--oneline']).status !== 0) throw new Error(`git fixture 初始化失败：${dir}`)
  }
  return dir
}

/** 把探针产物 fixture 拷进工作目录（V10/RL8 的 cwd 内产物 + 非产物文件）。 */
function seedProbeArtifact(dir) {
  for (const name of ['index.html', 'secret-note.txt']) {
    fs.copyFileSync(path.join(E2E_FIXTURES, 'probe-artifact', name), path.join(dir, name))
  }
}

// ── 场景 ─────────────────────────────────────────────────────────────────────

const MINI_OD_ROOT = path.join(FIXTURES, 'mini-od')
const GEN1_ROOT = path.join(E2E_FIXTURES, 'resume-gen1')
const GEN2_ROOT = path.join(E2E_FIXTURES, 'resume-gen2')
const EMPTY_ROOT = path.join(E2E_FIXTURES, 'empty-assets')
const SI3_ROOT = path.join(E2E_FIXTURES, 'si3-broken-manifest')
const DRIFT_ROOT = path.join(FIXTURES, 'drift-od', 'upgraded', 'v2')
/** D8 管理名清单（与 lib/materialize/copy.ts MATERIALIZED_FILE_NAMES 对账）。 */
const OD_FRAMES_FILES = ['android.html', 'iphone.html', 'neutral.html', 'layout.css']

/** 场景 S1（A1/V1+RL1）：roster 可见性 + 注入 + 默认会话不变 + 材质化。 */
async function scenarioV1() {
  const results = []
  const workspace = makeWorkspaceDir('v1')
  const instance = await withInstance({ label: 'v1', fixtureRoot: MINI_OD_ROOT, workspaceDir: workspace })
  try {
    const { page, home } = instance

    await stepAsync(results, 'roster 卡片在 custom 分组且名称/描述正确（RL1 设置页形态）', async () => {
      const roster = await readSettingsRoster(page)
      assert(roster.groups.includes('Custom'), `分组标题缺 Custom：${JSON.stringify(roster.groups)}`)
      const card = roster.cards.find((c) => c.id === 'opendesign')
      assert(card !== undefined, `roster 缺 opendesign 卡片：${JSON.stringify(roster.cards.map((c) => c.id))}`)
      assert(card.text.includes('OpenDesign 设计模式'), `卡片名不对：${JSON.stringify(card.text.slice(0, 80))}`)
      assert(card.text.includes('未装 OpenDesign 时入口显式降级提示'), `卡片描述不对：${JSON.stringify(card.text.slice(0, 160))}`)
      assert(card.broken === false, `卡片不应为 broken：${JSON.stringify(card.alert)}`)
    })

    await stepAsync(results, '新会话选择器菜单含设计模式卡片（RL1 picker 形态）', async () => {
      await pickWorkspace(page, workspace)
      const items = await readPickerItems(page)
      const item = items.find((t) => t.includes('OpenDesign 设计模式'))
      assert(item !== undefined, `选择器菜单缺设计模式：${JSON.stringify(items)}`)
      assert(item.includes('以本机 OpenDesign 资产驱动的设计会话'), `菜单项描述不对：${JSON.stringify(item)}`)
    })

    await stepAsync(results, '默认 preset 行为不变：standard 会话 system 节点无设计内容', async () => {
      await sendUserMessage(page, 'plain session smoke')
      const { log } = await waitForSessionLog(home, (_entry, l) => l.systemMessages.length > 0)
      const sys = log.systemMessages.at(-1) ?? ''
      assert(!sys.includes(DESIGN_INJECTION_MARK), 'standard 会话 system 节点不应含设计路由段')
      assert(!sys.includes(MINI_OD_PROFILE_PATH), 'standard 会话 system 节点不应含设计任务档路径')
    })

    await stepAsync(results, '设计会话：进入设计模式并注入 OD 资产内容（A1/V1 注入断言）', async () => {
      await page.getByRole('button', { name: 'New session' }).first().click()
      await page.waitForTimeout(1000)
      await clearModalGates(page)
      await pickWorkspace(page, workspace)
      await pickDesignPreset(page)
      await sendUserMessage(page, 'design a coffee brand landing page')
      const { log } = await waitForSessionLog(
        home,
        (_entry, l) => l.systemMessages.some((t) => t.includes(DESIGN_INJECTION_MARK)),
        30000,
      )
      assert(log.presetSelections.includes('opendesign'), `preset 选定记录缺失：${JSON.stringify(log.presetSelections)}`)
      const sys = log.systemMessages.find((t) => t.includes(DESIGN_INJECTION_MARK)) ?? ''
      assert(sys.includes(MINI_OD_PROFILE_PATH), '注入文本缺 prototype 任务档绝对路径（路由段）')
      assert(sys.includes('sample-brand'), '注入文本缺设计系统清单（sample-brand）')
    })

    step(results, '注入文本无占位符字面残留（RL3 的 e2e 旁证）', () => {
      const files = collectSessionFiles(home)
      const designLogs = files.map((f) => readSessionLog(f.file)).filter((l) => l.systemMessages.some((t) => t.includes(DESIGN_INJECTION_MARK)))
      assert(designLogs.length > 0, '找不到设计会话日志')
      const all = designLogs.flatMap((l) => l.systemMessages).join('\n')
      assert(!all.includes('{{SKILL_CATALOG}}'), '注入文本含 {{SKILL_CATALOG}} 字面（占位符防御失效）')
    })

    await stepAsync(results, '材质化：.od-frames/ 四管理名落盘且与源逐字节一致（D8）', async () => {
      const framesDir = path.join(workspace, '.od-frames')
      await waitForSessionLog(home, (_entry, l) => l.systemMessages.length > 0, 1000).catch(() => {})
      let frames = []
      const deadline = Date.now() + 20000
      while (Date.now() < deadline) {
        frames = fs.existsSync(framesDir) ? fs.readdirSync(framesDir) : []
        if (OD_FRAMES_FILES.every((name) => frames.includes(name))) break
        await sleep(500)
      }
      assert(
        OD_FRAMES_FILES.every((name) => frames.includes(name)),
        `.od-frames/ 缺管理名：${JSON.stringify(frames)}`,
      )
      assert(frames.length === OD_FRAMES_FILES.length, `.od-frames/ 出现清单外文件：${JSON.stringify(frames)}`)
      const prototypeDir = path.join(MINI_OD_SCENARIO, 'assets', 'task-profiles', 'prototype')
      for (const name of OD_FRAMES_FILES) {
        const written = fs.readFileSync(path.join(framesDir, name))
        // fixture 实布局：三个 html 在 device-frames/ 子目录，layout.css 在 prototype/ 根（与清单 resources 声明一致）
        const source = path.join(prototypeDir, name === 'layout.css' ? name : path.join('device-frames', name))
        assert(written.equals(fs.readFileSync(source)), `材质化副本与源不一致：${name}`)
      }
    })
  } finally {
    await instance.close()
  }
  return results
}

/** 场景 S2+S3（A3b/A14+RL6/RL8 + A4/V4）：预览面板交互 + 探针隔离 + doctor 八项。 */
async function scenarioPanelAndDoctor() {
  const results = []
  const workspace = makeWorkspaceDir('panel')
  seedProbeArtifact(workspace)
  const instance = await withInstance({ label: 'panel', fixtureRoot: MINI_OD_ROOT, workspaceDir: workspace })
  try {
    const { page, home } = instance
    await pickWorkspace(page, workspace)
    await pickDesignPreset(page)
    await sendUserMessage(page, 'design a landing page')

    await stepAsync(results, 'doctor 输出八项分节齐全（A4/V4）', async () => {
      const body = await runDoctor(page)
      const sections = ['安装形态与资源根', '清单路径与三层版本', 'roster 完整性核验', '改写规则命中清单', '材质化状态', '资产代际提示', '异常与恢复动作', '止损位状态']
      assert(body.includes('OpenDesign 设计模式诊断报告'), '缺诊断报告标题')
      sections.forEach((title, index) => {
        assert(body.includes(`【${index + 1}/8】${title}`), `缺分节 ${index + 1}/8 ${title}`)
      })
      assert(body.includes('资源根：'), '缺资源根行')
      assert(body.includes('manifest 版本'), '缺 manifest 版本行')
      assert(body.includes('结论：全部声明文件在场'), 'roster 核验应全过')
    })

    await stepAsync(results, 'doctor 材质化状态报告落点清单（A4 第⑤项）', async () => {
      const body = await runDoctor(page)
      assert(body.includes(path.join(workspace, '.od-frames')), '材质化状态缺写入落点路径')
      assert(body.includes('个管理名全部在场'), '材质化状态缺全在场结论')
    })

    await stepAsync(results, '预览面板：fixture 产物出现在产物列表（A3b 兜底列表）', async () => {
      await openDesignPanel(page)
      const rows = await page.evaluate(() => Array.from(document.querySelectorAll('.odp-row')).map((r) => (r.textContent ?? '').trim()))
      assert(rows.includes('index.html'), `产物列表缺 index.html：${JSON.stringify(rows)}`)
    })

    await stepAsync(results, '预览面板：产物经伺服路由载入 iframe 且 sandbox 只放脚本（RL6/D7）', async () => {
      await page.locator('.odp-row').first().click()
      await page.waitForSelector('iframe.odp-frame', { timeout: 15000 })
      const sandbox = await page.getAttribute('iframe.odp-frame', 'sandbox')
      assert(sandbox === 'allow-scripts', `iframe sandbox 形态不对：${JSON.stringify(sandbox)}（不得含 allow-same-origin）`)
    })

    await stepAsync(results, '产物脚本可执行且探针写 DOM（RL6 交互性）', async () => {
      const frame = page.frameLocator('iframe.odp-frame')
      const results0 = await frame.locator('#probe-results').textContent({ timeout: 15000 })
      assert(results0 !== null && results0 !== 'pending', `探针未产出结果：${JSON.stringify(results0)}`)
    })

    await stepAsync(results, '探针：document.cookie 为空（RL8：fetch 不携带宿主 cookie 的前提语义）', async () => {
      const frame = page.frameLocator('iframe.odp-frame')
      const cookie = await frame.locator('#probe-cookie').textContent({ timeout: 10000 })
      assert(cookie !== null && /^cookie: \(empty\)|^cookie: blocked SecurityError/.test(cookie.trim()), `产物内 cookie 应为隔离形态（空或 SecurityError）：${JSON.stringify(cookie?.slice(0, 160))}`)
    })

    await stepAsync(results, '探针：伺服根非产物文件不可得（RL8：无 canary 泄漏）', async () => {
      const frame = page.frameLocator('iframe.odp-frame')
      const secret = await frame.locator('#probe-secret').textContent({ timeout: 10000 })
      assert(secret !== null && !secret.includes('SECRET-NOTE-CANARY'), `非产物内容泄漏：${JSON.stringify(secret?.slice(0, 160))}`)
    })

    await stepAsync(results, '探针：宿主 open 路由响应不可得（RL8：围栏拒/opaque origin）', async () => {
      const frame = page.frameLocator('iframe.odp-frame')
      const open = await frame.locator('#probe-open').textContent({ timeout: 10000 })
      assert(open !== null && !open.includes('status=200'), `open 路由响应疑似可得：${JSON.stringify(open?.slice(0, 160))}`)
    })
  } finally {
    await instance.close()
  }
  return results
}

/** 本机是否装有真实 OpenDesign.app（V5 的前置条件判定；run6 实测装有机回退路径见下）。 */
const REAL_OD_INSTALLED = ['/Applications/Open Design.app', '/Applications/Open Design Beta.app', '/Applications/Open Design Prerelease.app', '/Applications/Open Design Preview.app']
  .some((p) => fs.existsSync(p))

/**
 * 场景 S4（A5/V5+RL5）：无资产环境降级 + SI3 假阳性形态区分。
 *
 * 前置条件 = 「未安装 OpenDesign 的机器」（fixture README 的假设）。本机已装 OD 时，
 * 定位链的多候选回退（buildVersionProfile：override 候选损坏/缺席 → 落到真机渠道候选）
 * 会把 preset 恢复为 healthy——这是插件的正确定型行为，V5 的 broken 断言在此不可触发。
 * 此时本场景降级为断言「多候选回退」形态（选择器 healthy + doctor 列出坏候选与选中依据），
 * broken 全量断言保留在无 OD 机器分支；降级事实随运行输出呈报（不静默）。
 */
async function scenarioNoAssets() {
  const results = []
  const workspace = makeWorkspaceDir('v5')

  if (REAL_OD_INSTALLED) {
    console.log('    [环境降级] 本机已装 OpenDesign.app：V5/SI3 的 broken 全量断言不可触发（多候选回退到真机渠道），改断言回退形态；broken 断言需在无 OD 机器上补跑')
  }

  // 形态一：资源根指向空目录（未安装形态）
  const missing = await withInstance({ label: 'v5-missing', fixtureRoot: EMPTY_ROOT, workspaceDir: workspace })
  try {
    const { page } = missing
    await pickWorkspace(page, workspace)

    if (!REAL_OD_INSTALLED) {
      await stepAsync(results, '无资产：新会话选择器不出现设计模式（RL5 入口过滤）', async () => {
        const items = await readPickerItems(page)
        assert(!items.some((t) => t.includes('OpenDesign')), `broken preset 不应出现在选择器：${JSON.stringify(items)}`)
        assert(items.some((t) => t.includes('Standard mode')), `healthy preset 应保留：${JSON.stringify(items)}`)
      })

      await stepAsync(results, '无资产：设置页诊断含「未检测到 OpenDesign」安装指引（SI3 第一形态）', async () => {
        const roster = await readSettingsRoster(page)
        const card = roster.cards.find((c) => c.id === 'opendesign')
        assert(card !== undefined, 'broken preset 卡片应在设置页 roster（管理面渲染全量）')
        assert(card.broken, `卡片应带 broken 徽标：${JSON.stringify(card.text.slice(0, 100))}`)
        assert(card.alert !== null && card.alert.includes('未检测到 OpenDesign'), `诊断文案不对：${JSON.stringify(card.alert)}`)
      })
    } else {
      await stepAsync(results, '空 override + 真机候选：选择器 healthy（多候选回退形态，本机已装 OD）', async () => {
        const items = await readPickerItems(page)
        assert(items.some((t) => t.includes('OpenDesign 设计模式')), `回退后设计模式应可用：${JSON.stringify(items.map((t) => t.slice(0, 24)))}`)
      })
    }

    await stepAsync(results, '无资产形态：默认 preset 不受影响（standard 仍在场）', async () => {
      const roster = await readSettingsRoster(page)
      const standard = roster.cards.find((c) => c.id === 'standard')
      assert(standard !== undefined && !standard.broken, 'standard preset 应不受影响')
    })
  } finally {
    await missing.close()
  }

  // 形态二：清单损坏（已装但探测失败，SI3 假阳性收窄方向）
  const si3 = await withInstance({ label: 'v5-si3', fixtureRoot: SI3_ROOT, workspaceDir: workspace })
  try {
    if (!REAL_OD_INSTALLED) {
      await stepAsync(results, '清单损坏：诊断文案报「检测失败请重启 DSH 重试」而非误报未安装（SI3）', async () => {
        const roster = await readSettingsRoster(si3.page)
        const card = roster.cards.find((c) => c.id === 'opendesign')
        assert(card !== undefined && card.broken, 'SI3 形态下 preset 应 broken')
        assert(card.alert !== null && card.alert.includes('重启 DSH 重试'), `文案缺重启指引：${JSON.stringify(card.alert)}`)
        assert(card.alert !== null && !card.alert.includes('未检测到 OpenDesign，请安装'), `SI3 形态误报未安装：${JSON.stringify(card.alert)}`)
      })
    } else {
      await stepAsync(results, '清单损坏 override + 真机候选：doctor 列出坏候选且选中真机渠道（回退形态）', async () => {
        await pickWorkspace(si3.page, workspace)
        await pickDesignPreset(si3.page)
        await sendUserMessage(si3.page, 'doctor candidates check')
        const body = await runDoctor(si3.page)
        assert(body.includes('渠道 override'), 'doctor 应列出 override 候选')
        assert(body.includes('（渠道 stable）') && body.includes('← 已选中'), 'doctor 应标出真机渠道选中项')
        assert(body.includes('manifest 版本'), 'doctor 应报告真机安装的清单版本')
      })
    }
  } finally {
    await si3.close()
  }
  return results
}

/** 场景 S5（A6/V6）：资产漂移 fixture 仍可定位 + 画像版本正确。 */
async function scenarioDrift() {
  const results = []
  const workspace = makeWorkspaceDir('v6')
  const instance = await withInstance({ label: 'v6-drift', fixtureRoot: DRIFT_ROOT, workspaceDir: workspace })
  try {
    const { page, home } = instance
    await pickWorkspace(page, workspace)
    await pickDesignPreset(page)
    await sendUserMessage(page, 'design a landing page')

    await stepAsync(results, '漂移布局：设计 preset 未 broken、会话正常注入（搜索式发现定位到非默认清单位置）', async () => {
      const { log } = await waitForSessionLog(home, (_entry, l) => l.systemMessages.some((t) => t.includes(DESIGN_INJECTION_MARK)))
      const sys = log.systemMessages.find((t) => t.includes(DESIGN_INJECTION_MARK)) ?? ''
      assert(sys.includes(path.join(DRIFT_ROOT, 'od-next-strategy', 'assets', 'task-profiles', 'prototype.md')), '注入文本缺漂移树的 prototype 任务档路径')
    })

    await stepAsync(results, '漂移布局：doctor 画像报告漂移路径与实际版本（V6）', async () => {
      const body = await runDoctor(page)
      assert(body.includes('清单路径：'), '缺清单路径行')
      assert(body.includes(path.join('upgraded', 'v2', 'od-next-strategy')), `清单路径应指向漂移位置：${body.slice(0, 400)}`)
      assert(body.includes('manifest 版本：3.4.0'), `manifest 版本应 3.4.0：${body.slice(0, 600)}`)
    })
  } finally {
    await instance.close()
  }
  return results
}

/** 场景 S6（A13/V9+RL7）：resume 代际重组。 */
async function scenarioResume() {
  const results = []
  const workspace = makeWorkspaceDir('v9')
  const home = path.join(RUN_ROOT, 'home-v9-resume')
  fs.cpSync(TEMPLATE_HOME, home, { recursive: true })
  fs.rmSync(path.join(home, 'sessions'), { recursive: true, force: true })
  fs.rmSync(path.join(home, 'storages'), { recursive: true, force: true })
  fs.mkdirSync(path.join(home, 'storages'), { recursive: true })
  const workspaceId = crypto.randomUUID()
  const workspaceReal = fs.realpathSync(workspace)
  const writeWorkspaceSeed = () => {
    fs.writeFileSync(path.join(home, 'storages', 'workspace.json'), JSON.stringify({
      unit: { name: 'workspace', version: 2 },
      global: { initialized: true, workspaceIds: [workspaceId], archivedSessionIds: [], pinnedSessionIds: [], defaultWorkspaceId: workspaceId },
      tables: { workspaces: { [workspaceId]: { path: workspaceReal, title: path.basename(workspace), sessionIds: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } } },
    }, null, 2))
  }
  writeWorkspaceSeed()
  const patchFile = writeSessionLogPatch(home)
  const launch = (fixtureRoot) => startInstance({ label: 'v9-resume', home, fixtureRoot, patchFile, cwd: workspace })

  let gen1 = null
  let gen2 = null
  try {
    gen1 = await launch(GEN1_ROOT)
    await pickWorkspace(gen1.page, workspace)
    await pickDesignPreset(gen1.page)
    await sendUserMessage(gen1.page, 'start a poster design')
    const gen1Entry = await waitForSessionLog(home, (_entry, l) => l.systemMessages.some((t) => t.includes(GEN1_SENTENCE)) || l.systemMessages.length > 0)
    assert(
      gen1Entry.log.systemMessages.some((t) => t.includes('resume gen1')),
      'gen1 注入文本应含 gen1 资产内容（fixture 正文标记）',
    )
    await gen1.close()
    gen1 = null

    // 资产换代（模拟 OD 升级）：同 home、资源根改指 gen2，重启实例
    writeWorkspaceSeed()
    gen2 = await launch(GEN2_ROOT)
    const gen2Page = gen2.page
    await pickWorkspace(gen2Page, workspace)

    await stepAsync(results, 'resume：侧栏会话行点击重开设计会话且 preset 重挂（V9）', async () => {
      // 侧栏列表顶部是 blank 占位行（'New session'），目标行按 gen1 会话日志的 id 精确点击
      const designEntry = collectSessionFiles(home)
        .map((f) => ({ ...f, log: readSessionLog(f.file) }))
        .find((f) => f.log.systemMessages.some((t) => t.includes('resume gen1')))
      assert(designEntry !== undefined, '找不到 gen1 设计会话日志')
      const row = gen2Page.locator(`.taiji-pb-row[data-session-id="${designEntry.sessionId}"]`)
      assert(await row.count() > 0, `侧栏缺 gen1 会话行（${designEntry.sessionId}）`)
      await row.click()
      await gen2Page.waitForTimeout(2500)
      await clearModalGates(gen2Page)
      // 会话头 preset 标签（AgentPresetLabel）随 roster 读回异步渲染，轮询等它出现；
      // 标签可能不在可视裁剪区内（innerText 不含），按 DOM textContent 判定（0.1.7 实测）
      const labelDeadline = Date.now() + 12000
      let labeled = false
      while (Date.now() < labelDeadline) {
        const has = await gen2Page.evaluate(() => document.documentElement.textContent.includes('OpenDesign 设计模式'))
        if (has) { labeled = true; break }
        await sleep(500)
      }
      assert(labeled, 'resume 后会话头/页面缺设计 preset 标识（preset 未重挂）')
    })

    await stepAsync(results, 'resume：新一轮 system 节点反映 gen2 资产、无 gen1 特征句残留（RL7）', async () => {
      await sendUserMessage(gen2Page, 'continue the poster with a hero section')
      const entry = collectSessionFiles(home)
        .map((f) => ({ ...f, log: readSessionLog(f.file) }))
        .find((f) => f.log.systemMessages.length > 1 || f.log.systemMessages.some((t) => t.includes(GEN2_SENTENCE)))
      assert(entry !== undefined, '找不到 resume 后的会话日志')
      const newest = entry.log.systemMessages.at(-1) ?? ''
      assert(newest.includes(GEN2_SENTENCE), `新轮 system 节点应含 gen2 特征句：${JSON.stringify(newest.slice(0, 200))}`)
      assert(newest.includes('resume gen2'), '新轮 system 节点应含 gen2 资产正文标记')
      assert(!newest.includes(GEN1_SENTENCE), `新轮 system 节点残留 gen1 特征句（旧代际内容）`)
      assert(!newest.includes('resume gen1'), '新轮 system 节点残留 gen1 正文标记')
    })

    await stepAsync(results, 'resume：doctor 提示资产代际差异（V9 doctor 形态）', async () => {
      const body = await runDoctor(gen2Page)
      assert(body.includes('资产代际提示'), 'doctor 缺第⑥节代际提示标题')
      assert(body.includes('resume'), '代际提示未覆盖 resume 场景')
      assert(body.includes('v3.2.1'), `doctor 当前资产版本应为 gen2 的 3.2.1：${body.slice(0, 400)}`)
    })
  } finally {
    if (gen1 !== null) await gen1.close()
    if (gen2 !== null) await gen2.close()
  }
  return results
}

/** 场景 S7（A15/V11）：git fixture 连续三次设计会话（一次换资产）的写入形态。 */
async function scenarioProjectWrites() {
  const results = []
  const workspace = makeWorkspaceDir('v11', { git: true })
  const home = path.join(RUN_ROOT, 'home-v11-writes')
  fs.cpSync(TEMPLATE_HOME, home, { recursive: true })
  fs.rmSync(path.join(home, 'sessions'), { recursive: true, force: true })
  fs.rmSync(path.join(home, 'storages'), { recursive: true, force: true })
  fs.mkdirSync(path.join(home, 'storages'), { recursive: true })
  const workspaceId = crypto.randomUUID()
  const workspaceReal = fs.realpathSync(workspace)
  fs.writeFileSync(path.join(home, 'storages', 'workspace.json'), JSON.stringify({
    unit: { name: 'workspace', version: 2 },
    global: { initialized: true, workspaceIds: [workspaceId], archivedSessionIds: [], pinnedSessionIds: [], defaultWorkspaceId: workspaceId },
    tables: { workspaces: { [workspaceId]: { path: workspaceReal, title: path.basename(workspace), sessionIds: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } } },
  }, null, 2))
  const patchFile = writeSessionLogPatch(home)
  const launch = (fixtureRoot) => startInstance({ label: 'v11-writes', home, fixtureRoot, patchFile, cwd: workspace })
  /** 在当前实例上再造一个设计会话并跑一轮（New session → 选工作区 → 选设计 → 发消息）。 */
  const runDesignSession = async (instance, message) => {
    await instance.page.getByRole('button', { name: 'New session' }).first().click()
    await instance.page.waitForTimeout(1000)
    await clearModalGates(instance.page)
    await pickWorkspace(instance.page, workspace)
    await pickDesignPreset(instance.page)
    await sendUserMessage(instance.page, message)
  }
  const gitStatus = () => spawnSync('git', ['status', '--porcelain'], { cwd: workspace, encoding: 'utf8' }).stdout.trim().split('\n').filter((l) => l !== '')

  let genA = null
  let genB = null
  try {
    genA = await launch(MINI_OD_ROOT)
    await runDesignSession(genA, 'session one: landing page')
    await runDesignSession(genA, 'session two: poster page')

    // 换资产（模拟 OD 升级）后第三次会话：旧产物以新壳重铺（D8 显式接受的行为）
    await genA.close()
    genA = null
    genB = await launch(GEN2_ROOT)
    await runDesignSession(genB, 'session three: deck page')

    step(results, 'V11：新增文件恰为 .od-frames/ 四管理名（D8 清单，注指令块形态不落盘）', () => {
      const framesDir = path.join(workspace, '.od-frames')
      assert(fs.existsSync(framesDir), '.od-frames/ 未落盘')
      const names = fs.readdirSync(framesDir)
      assert(
        OD_FRAMES_FILES.every((name) => names.includes(name)) && names.length === OD_FRAMES_FILES.length,
        `.od-frames/ 文件集合不对：${JSON.stringify(names)}`,
      )
    })

    step(results, 'V11：git status 无 tracked 变更、untracked 恰为 .od-frames/（反向断言 D8 ④）', () => {
      const lines = gitStatus()
      const tracked = lines.filter((l) => !l.startsWith('??'))
      assert(tracked.length === 0, `既有 tracked 文件被改写：${JSON.stringify(tracked)}`)
      const untracked = lines.filter((l) => l.startsWith('??'))
      assert(
        untracked.length === 1 && untracked[0].includes('.od-frames/'),
        `untracked 应恰为 .od-frames/：${JSON.stringify(untracked)}`,
      )
    })

    step(results, 'V11：幂等——重复会话不堆积；升级轮（gen2 不声明壳资源）旧副本原样保留、无清单外写入', () => {
      const framesDir = path.join(workspace, '.od-frames')
      // gen2 清单未声明设备壳资源（重铺计划为空）：既有四文件按 D8 覆盖语义原样保留，
      // 不堆积新文件、不被清除——重铺波及面不变量的升级轮形态。
      const names = fs.readdirSync(framesDir)
      assert(
        OD_FRAMES_FILES.every((name) => names.includes(name)) && names.length === OD_FRAMES_FILES.length,
        `.od-frames/ 文件集合在升级轮后不对：${JSON.stringify(names)}`,
      )
      const projectFiles = fs.readdirSync(workspace)
      assert(
        projectFiles.filter((name) => name !== '.git' && name !== '.od-frames').length === 0,
        `项目目录出现清单外文件：${JSON.stringify(projectFiles)}`,
      )
      // mini-od 轮写下的副本与其源逐字节一致（升级轮之前的覆盖语义已在 S1 断言，这里对账升级轮不清除）
      const prototypeDir = path.join(MINI_OD_SCENARIO, 'assets', 'task-profiles', 'prototype')
      for (const name of OD_FRAMES_FILES) {
        const source = path.join(prototypeDir, name === 'layout.css' ? name : path.join('device-frames', name))
        assert(fs.readFileSync(path.join(framesDir, name)).equals(fs.readFileSync(source)), `升级轮后副本应保持 mini-od 源内容（${name}）`)
      }
    })
  } finally {
    if (genA !== null) await genA.close()
    if (genB !== null) await genB.close()
  }
  return results
}

// ── 主编排 ───────────────────────────────────────────────────────────────────

/** 全局看门狗：卡死（等待永不返回）时按 PID 清场并以失败退出，不留孤儿 dsh。 */
const WATCHDOG_MS = 30 * 60 * 1000
const watchdog = setTimeout(() => {
  console.error(`\n[e2e watchdog] ${WATCHDOG_MS}ms 全局预算耗尽，按 PID 清场退出`)
  for (const pid of [...livePids]) void killProcessTree(pid)
  process.exit(1)
}, WATCHDOG_MS)
watchdog.unref()

try {
  console.log(`[e2e] 仓根：${REPO_ROOT}`)
  console.log(`[e2e] 运行根：${RUN_ROOT}（KEEP_E2E_STATE=1 时保留）`)
  console.log('[e2e] 准备模板 home（安装两包，一次性 pnpm 成本）…')
  await ensureTemplateHome()
  console.log('[e2e] 模板就绪\n')

  const scenarios = [
    ['S1 A1/V1+RL1 roster+注入+默认会话+材质化', scenarioV1],
    ['S2+S3 A3b/A14+RL6/RL8+A4/V4 面板+探针+doctor', scenarioPanelAndDoctor],
    ['S4 A5/V5+RL5 无资产+SI3', scenarioNoAssets],
    ['S5 A6/V6 资产漂移', scenarioDrift],
    ['S6 A13/V9+RL7 resume 代际重组', scenarioResume],
    ['S7 A15/V11 项目目录写入形态', scenarioProjectWrites],
  ]

  const outcome = []
  for (const [title, runner] of scenarios) {
    console.log(`\n=== ${title} ===`)
    try {
      const results = await runner()
      const failed = results.filter((r) => !r.ok)
      outcome.push({ title, ok: failed.length === 0, total: results.length, failed })
    } catch (error) {
      outcome.push({ title, ok: false, total: 0, failed: [{ name: '(场景级异常)', error }] })
      console.log(`    ✗ 场景级异常：${error instanceof Error ? error.stack : String(error)}`)
    }
  }

  console.log('\n════════ e2e 汇总 ════════')
  let green = 0
  for (const entry of outcome) {
    const mark = entry.ok ? 'PASS' : 'FAIL'
    if (entry.ok) green += 1
    console.log(`${mark}  ${entry.title}（断言 ${entry.total - entry.failed.length}/${entry.total}）`)
    for (const failure of entry.failed) {
      console.log(`      失败步骤：${failure.name}`)
      console.log(`        ${failure.error instanceof Error ? failure.error.message : String(failure.error)}`)
    }
  }
  console.log(`\n合计：${green}/${outcome.length} 场景绿；运行根：${RUN_ROOT}${KEEP_STATE ? '（保留）' : ''}`)

  if (green === outcome.length && KEEP_STATE !== '1') {
    fs.rmSync(RUN_ROOT, { recursive: true, force: true })
  }
  process.exit(green === outcome.length ? 0 : 1)
} catch (error) {
  console.error(`\n[e2e] 套件级失败：${error instanceof Error ? error.stack : String(error)}`)
  for (const pid of [...livePids]) await killProcessTree(pid)
  process.exit(1)
}
