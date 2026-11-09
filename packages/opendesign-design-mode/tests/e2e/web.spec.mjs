/**
 * opendesign-design-mode 双版本 e2e —— web 版（0.1.7 隔离 DSH_HOME）。
 *
 * 场景编排（opendesign-assets-quality 设计 §4.1 V1-V10 的 L3 可脚本化子集 + V1 既有回归面；
 * 验收计划表 A8 的 web 宿主半场——A11/A12 的模型行为段归 L4，不在本套件）：
 *   S1 V1+V3+V4注入形态 —— preset 可见性（roster 卡片 + 选择器菜单 + deck 协议信号文案）+
 *      默认会话行为不变（standard 会话无设计内容）+ 设计会话注入断言（rich-assets fixture：
 *      形状包清单段含 dashboard 条目与 zh 触发词、craft 指路块根路径、manifest 感知设计系统
 *      清单行、panel 评审团协议段、ppt 条目 deck 协议指针）+ 材质化落盘恰 5 文件（4 复制件
 *      + .od-frames/deck-framework.md，内容与 lib/materialize/copy.js renderDeckFrameworkFile
 *      派生文本逐字一致，D8+D9）。
 *   S2 V5+V8缺省态 —— doctor 十一分节齐全（前八节 V1 零回归）；⑨ 资产丰富度非降级形态
 *      （craft 3 册 / 形状包 1 / manifest 命中 1）；⑩ 协议对账未登记态（无法比对 + 登记指引
 *      + 已知信息行）；⑪ 质量发现监听器运行形态（V2 场景前置核对）。
 *   S3 V2+V10 —— 质量环回注（真机写盘）：陌生既有文件触碰只记录不回注（V10/RL10）→
 *      快照外新写 P0 产物照常回注（V2/RL1 真机半场）→ 回注消息协议信号形态（user/message
 *      事件 data.source.kind=opendesign-design-mode/lint + 文本含检查项 id/修复指引/作用域句）→
 *      同内容重写指纹去重（回注消息计数不变 + duplicate 记录恰一行，SI2/RL3）。
 *   S4 V7 —— 非设计会话零侵入：standard 会话写 P0 HTML，零监听零回注（preset 过滤，
 *      .od-quality/ 不出现、事件流无 lint 消息）。
 *   S5 V6+RL5 —— 无资产环境（资源根指向空目录）：roster broken + 默认 preset 不受影响；
 *      SI3 假阳性形态（清单损坏）：诊断文案区分「未检测到」与「检测失败请重启 DSH 重试」。
 *   S6 V6漂移 —— 资产漂移 fixture（清单在非默认相对位置）仍可定位 + 画像版本正确。
 *   S7 V9+RL7 —— resume 代际重组 + resume 检查环不变量（RL10）：gen1 创建设计会话 →
 *      写 P0 产物回注（followup）→ 关实例换 gen2 资产 → resume → 新一轮 system 节点反映
 *      gen2、无 gen1 残留句 → doctor ⑪ 读出检查记录 → 同文件同内容重写触发第二代回注
 *      （指纹进程内重启即清的幂等代价，SC4）→ 再写同内容记 duplicate 不再回注。
 *   S8 V11写入形态 —— git fixture 项目目录连续三次设计会话（一次换资产）：.od-frames/
 *      恰 5 管理名（4 复制件 + deck-framework.md，gen2 无壳声明轮 deck-framework.md 无条件
 *      重铺）、幂等、git status 无 tracked 变更（反向断言）。
 *   S9 A9/A10/A11 —— shell 包共存回归：verify runner 以 --url 连共存实例跑 brand+projects、
 *      以自启形态对共存 home 跑 lifecycle（卸载 shell）——「preset 注册与 UI 注入不干扰
 *      shell 包」只在 opendesign 在场（两包共存 profile）时才可证明，单装态结果不作数。
 *
 * 真实模型自纠行为（V2 的模型修复段）不在本套件（验收计划 A11：L4 归交付后行为观察）。
 * 无 API key 的隔离实例上发消息：system 提示词在 provider 调用前已提交会话日志
 * （dsh-agent-loop step() 先 commit 后 request，亲读核实）——注入断言走该通道；质量环
 * 回注经宿主 agents 服务的 followup 开新轮，UserMessage 同样在 provider 调用前 commit
 * （agent-loop agent.ts:471 session.append('user/message', message)，data = 消息本体）。
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
/** rich-assets 场景包目录（三目录齐备 fixture；V1 清单段/指路块断言的资产根）。 */
const RICH_ROOT = path.join(E2E_FIXTURES, 'rich-assets')
const RICH_SCENARIO = path.join(RICH_ROOT, 'plugins', '_official', 'scenarios', 'od-next-strategy')
/** 设计会话注入文本的稳定特征：U3 路由段标题（自产内容，各代 fixture 同形）。 */
const DESIGN_INJECTION_MARK = '## Task routing (design mode)'
/** mini-od 注入文本的资产特征：路由段里的 prototype 任务档绝对路径。 */
const MINI_OD_PROFILE_PATH = path.join(MINI_OD_SCENARIO, 'assets', 'task-profiles', 'prototype.md')
/** rich-assets 注入文本的资产特征：路由段里的 prototype 任务档绝对路径。 */
const RICH_PROFILE_PATH = path.join(RICH_SCENARIO, 'assets', 'task-profiles', 'prototype.md')
/** resume gen1 特征句 A（fixture 文件内含；断言「不含」用）。 */
const GEN1_SENTENCE = 'deliver the actual image file'
/** resume gen2 特征句 B（升级模拟句；断言「含」用）。 */
const GEN2_SENTENCE = 'report the media capability gap'
/** 质量环回注消息的 source.kind（lib/quality/feedback.js LINT_SOURCE_KIND 同值；AX7 协议信号形态）。 */
const LINT_SOURCE_KIND = 'opendesign-design-mode/lint'
/** P0 命中特征（purple-gradient：线性渐变含紫 hex，lint.ts PURPLE_HEXES 命中形态）。 */
const DIRTY_GRADIENT = 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)'

for (const [file, mark] of [
  [path.join(E2E_FIXTURES, 'resume-gen1', 'assets', 'core-system-prompt.md'), GEN1_SENTENCE],
  [path.join(E2E_FIXTURES, 'resume-gen2', 'assets', 'core-system-prompt.md'), GEN2_SENTENCE],
]) {
  assert(fs.readFileSync(file, 'utf8').includes(mark), `fixture 特征句缺席：${file} 应含 ${JSON.stringify(mark)}`)
}
/** rich-assets 三目录在場自检（fixture 自身损坏早失败，不落到场景里报含糊错）。 */
for (const required of [
  path.join(RICH_ROOT, 'design-templates', 'dashboard', 'SKILL.md'),
  path.join(RICH_ROOT, 'craft', 'state-coverage.md'),
  path.join(RICH_ROOT, 'design-systems', 'sample-brand', 'manifest.json'),
]) {
  assert(fs.existsSync(required), `rich-assets fixture 缺文件：${required}`)
}

// 材质化写清单与 deck 协议派生文本直接对账生产实现（同仓构建产物；清单/文本漂移即红）。
const { MATERIALIZED_WRITE_LIST, DECK_FRAMEWORK_FILE_NAME } = await import(
  path.join(PKG_ROOT, 'lib', 'materialize', 'copy.js')
)
const { renderDeckFrameworkFile } = await import(path.join(PKG_ROOT, 'lib', 'protocols', 'deck.js'))
assert(
  JSON.stringify([...MATERIALIZED_WRITE_LIST].sort()) ===
  JSON.stringify(['android.html', DECK_FRAMEWORK_FILE_NAME, 'iphone.html', 'layout.css', 'neutral.html'].sort()),
  `材质化写清单形态不对：${JSON.stringify(MATERIALIZED_WRITE_LIST)}`,
)
const DECK_FILE_EXPECTED = renderDeckFrameworkFile()
assert(
  DECK_FILE_EXPECTED.includes('# HTML deck host protocol')
    && DECK_FILE_EXPECTED.includes('## Existing deck or selected template')
    && DECK_FILE_EXPECTED.includes('## New deck only'),
  'deck 协议铺盘文本应含三段结构（适用限定句 + Existing deck 兼容段 + New deck 规范段）',
)

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
 * cwd = 场景工作目录：伺服根按会话解析（lib/serve/artifacts-route.ts 按 URL session 段经
 * resolveSessionCwdById 取会话 cwd，与材质化同一通道）——把 dsh 进程落在工作目录，会话
 * cwd（header.cwd / workingDirectory）即 seed 工作区，伺服根、材质化落点与探针产物随之
 * 对齐。这正是用户「cd 项目目录 && dsh web」的启动形态；进程 cwd 不再是伺服根的直接来源。
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
  await page.waitForTimeout(3500) // 十一节报告（含 ⑩⑪ 的探测与记录读取）渲染余量
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

/** 读取一份会话日志的 system/message 文本清单、user/message 消息与 preset 选定记录。 */
function readSessionLog(file) {
  const systemMessages = []
  const userMessages = []
  const presetSelections = []
  for (const line of fs.readFileSync(file, 'utf8').trim().split('\n')) {
    if (line === '') continue
    const event = JSON.parse(line)
    if (event.type === 'system/message') {
      systemMessages.push(event.data?.message?.content?.[0]?.text ?? '')
    }
    if (event.type === 'user/message') {
      // user/message 的 data = 消息本体（dsh-agent-loop agent.ts:471 append 载荷）；
      // 回注消息（AX7）以 data.source.kind 自报身份，不冒充用户发言。
      userMessages.push({
        kind: event.data?.source?.kind ?? null,
        text: event.data?.content?.[0]?.text ?? '',
      })
    }
    if (event.type === 'agent-preset/selected') {
      presetSelections.push(event.data?.agentPreset ?? '')
    }
  }
  return { systemMessages, userMessages, presetSelections }
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

// ── 质量环记录读侧（.od-quality/report.jsonl，SC5 行格式 = lib/quality/feedback.js）──

/** 读取会话工作目录的 report.jsonl（缺席返回空清单；损坏行跳过——读侧容忍半行写入）。 */
function readQualityReport(workspace) {
  const file = path.join(workspace, '.od-quality', 'report.jsonl')
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
async function waitForReportLine(workspace, predicate, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  let lastSeen = 'no report yet'
  while (Date.now() < deadline) {
    const lines = readQualityReport(workspace)
    if (lines.some(predicate)) return lines
    lastSeen = `${lines.length} lines`
    await sleep(400)
  }
  throw new AssertionError(`等待 .od-quality/report.jsonl 超时（${timeoutMs}ms；最后见到：${lastSeen}）`)
}

/** 收集隔离 home 下全部会话日志里的质量环回注消息（kind 匹配 LINT_SOURCE_KIND）。 */
function collectLintFeedbackMessages(home) {
  return collectSessionFiles(home)
    .flatMap((entry) => readSessionLog(entry.file).userMessages)
    .filter((message) => message.kind === LINT_SOURCE_KIND)
}

/** 轮询直到回注消息计数达到 expected（并返回当时计数）。 */
async function waitForLintFeedbackCount(home, expected, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  let count = 0
  while (Date.now() < deadline) {
    count = collectLintFeedbackMessages(home).length
    if (count >= expected) return count
    await sleep(500)
  }
  throw new AssertionError(`等待质量环回注消息达到 ${expected} 条超时（${timeoutMs}ms；实际 ${count} 条）`)
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

/** 断言 doctor 输出含全部十一分节标题行（`【N/11】标题`；前八节 = V1 零回归面）。 */
function expectDoctorSections(body) {
  assert(body.includes('OpenDesign 设计模式诊断报告'), '缺诊断报告标题')
  DOCTOR_SECTIONS_11.forEach((title, index) => {
    assert(body.includes(`【${index + 1}/11】${title}`), `缺分节 ${index + 1}/11 ${title}`)
  })
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
const LEGACY_PAGE_HTML = path.join(E2E_FIXTURES, 'legacy-page', 'index.html')
/** D8 复制件管理名清单（与 lib/materialize/copy.ts MATERIALIZED_FILE_NAMES 对账）。 */
const OD_FRAMES_FILES = ['android.html', 'iphone.html', 'neutral.html', 'layout.css']

/** 场景 S1（V1+V3+V4 注入形态）：roster 可见性 + 注入（四新段/指针/panel 段）+ 默认会话不变 + 材质化 5 文件。 */
async function scenarioV1() {
  const results = []
  const workspace = makeWorkspaceDir('v1')
  const instance = await withInstance({ label: 'v1', fixtureRoot: RICH_ROOT, workspaceDir: workspace })
  try {
    const { page, home } = instance

    await stepAsync(results, 'roster 卡片在 custom 分组且名称/描述正确（RL1 设置页形态 + V3 文案回写）', async () => {
      const roster = await readSettingsRoster(page)
      assert(roster.groups.includes('Custom'), `分组标题缺 Custom：${JSON.stringify(roster.groups)}`)
      const card = roster.cards.find((c) => c.id === 'opendesign')
      assert(card !== undefined, `roster 缺 opendesign 卡片：${JSON.stringify(roster.cards.map((c) => c.id))}`)
      assert(card.text.includes('OpenDesign 设计模式'), `卡片名不对：${JSON.stringify(card.text.slice(0, 80))}`)
      assert(card.text.includes('未装 OpenDesign 时入口显式降级提示'), `卡片描述不对：${JSON.stringify(card.text.slice(0, 160))}`)
      assert(card.text.includes('演示稿带 deck 协议信号'), `卡片描述缺 deck 协议信号句（D9 文案回写）：${JSON.stringify(card.text.slice(0, 220))}`)
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
      assert(!sys.includes(RICH_PROFILE_PATH), 'standard 会话 system 节点不应含设计任务档路径')
    })

    await stepAsync(results, '设计会话：注入路由段与 prototype 任务档路径（V1 注入断言）', async () => {
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
      assert(sys.includes(RICH_PROFILE_PATH), '注入文本缺 prototype 任务档绝对路径（路由段）')
    })

    await stepAsync(results, '注入文本含形状包清单段：dashboard 条目 + zh 触发词 + 根路径声明（V1/D2）', async () => {
      const { log } = await waitForSessionLog(home, (_entry, l) => l.systemMessages.some((t) => t.includes('### Shape templates (design-templates)')))
      const sys = log.systemMessages.find((t) => t.includes('### Shape templates (design-templates)')) ?? ''
      assert(sys.includes('### Shape templates (design-templates)'), '缺形状包清单段标题')
      assert(sys.includes(`root: \`${RICH_ROOT}/design-templates\``), '清单段缺 design-templates 根绝对路径声明')
      const entry = sys.split('\n').find((line) => line.startsWith('- dashboard'))
      assert(entry !== undefined, `清单段缺 dashboard 条目：${JSON.stringify(sys.slice(sys.indexOf('Shape templates'), sys.indexOf('Shape templates') + 600))}`)
      assert(entry.includes('mode: prototype'), 'dashboard 条目缺 od.mode 摘录')
      assert(entry.includes('Admin / analytics dashboard'), 'dashboard 条目缺 description 首句摘录')
      assert(entry.includes('zh: 后台, 管理后台'), `dashboard 条目缺中文触发词摘录：${JSON.stringify(entry)}`)
    })

    await stepAsync(results, '注入文本含 craft 指路块：craft/ 根绝对路径（V1/D1 指路自读形态）', async () => {
      const { log } = await waitForSessionLog(home, (_entry, l) => l.systemMessages.some((t) => t.includes('name="craft"')))
      const sys = log.systemMessages.find((t) => t.includes('name="craft"')) ?? ''
      assert(sys.includes('<od-next-context kind="fact" name="craft">'), '缺 craft 事实注入块')
      assert(sys.includes(`"root":"${RICH_ROOT}/craft"`), `craft 块缺 craft/ 根绝对路径：${JSON.stringify(sys.match(/\{[^}]*craft[^}]*\}/)?.[0]?.slice(0, 300))}`)
      assert(sys.includes('craft.requires'), 'craft 块缺消费指引（按形状包 craft.requires 自读）')
    })

    await stepAsync(results, '注入文本含 manifest 感知设计系统清单段：sample-brand 行 + 深层文件指路（V1/D3）', async () => {
      const { log } = await waitForSessionLog(home, (_entry, l) => l.systemMessages.some((t) => t.includes('### Design systems installed on this machine')))
      const sys = log.systemMessages.find((t) => t.includes('### Design systems installed on this machine')) ?? ''
      const entry = sys.split('\n').find((line) => line.startsWith('- sample-brand'))
      assert(entry !== undefined, `设计系统清单段缺 sample-brand 行：${JSON.stringify(sys.slice(0, 500))}`)
      assert(entry.includes('Sample Brand'), '清单行缺 manifest name')
      assert(entry.includes('Technology & SaaS'), '清单行缺 manifest category')
      assert(entry.includes('USAGE.md'), '清单行缺深层文件指路（USAGE.md 在场探测）')
    })

    await stepAsync(results, '注入文本含 panel 评审团协议段：五面板骨架与数值参数（V4 注入形态/D8）', async () => {
      const { log } = await waitForSessionLog(home, (_entry, l) => l.systemMessages.some((t) => t.includes('Critique Theater')))
      const sys = log.systemMessages.find((t) => t.includes('Critique Theater')) ?? ''
      assert(sys.includes('# Critique Theater'), '缺 panel 协议段标题（五面板评审骨架）')
      assert(sys.includes('maxRounds="3"'), 'panel 段缺轮数参数（缺省兜底 3）')
      assert(sys.includes('threshold="8"'), 'panel 段缺收敛阈值参数（缺省兜底 8.0）')
      assert(sys.includes('<CRITIQUE_RUN'), 'panel 段缺评审 wire protocol 标记块')
    })

    await stepAsync(results, '注入文本含 ppt 条目 deck 协议指针（V3/D9 指针 + 自读形态）', async () => {
      const { log } = await waitForSessionLog(home, (_entry, l) => l.systemMessages.some((t) => t.includes('Deck protocol note')))
      const sys = log.systemMessages.find((t) => t.includes('Deck protocol note')) ?? ''
      assert(sys.includes('`.od-frames/deck-framework.md`'), 'ppt 条目缺 deck 协议文件指针（.od-frames/deck-framework.md）')
    })

    step(results, '注入文本无占位符与 od CLI 特征串残留（RL3 的 e2e 旁证）', () => {
      const files = collectSessionFiles(home)
      const designLogs = files.map((f) => readSessionLog(f.file)).filter((l) => l.systemMessages.some((t) => t.includes(DESIGN_INJECTION_MARK)))
      assert(designLogs.length > 0, '找不到设计会话日志')
      const all = designLogs.flatMap((l) => l.systemMessages).join('\n')
      assert(!all.includes('{{SKILL_CATALOG}}'), '注入文本含 {{SKILL_CATALOG}} 字面（占位符防御失效）')
      assert(!all.includes('$OD_BIN'), '注入文本含 $OD_BIN 特征串（改写器对注入文本的命令清零失效）')
      assert(!all.includes('$OD_NODE_BIN'), '注入文本含 $OD_NODE_BIN 特征串（改写器对注入文本的命令清零失效）')
    })

    await stepAsync(results, '材质化：.od-frames/ 恰 5 管理名（4 复制件 + deck-framework.md）落盘且逐字节一致（D8+D9）', async () => {
      const framesDir = path.join(workspace, '.od-frames')
      await waitForSessionLog(home, (_entry, l) => l.systemMessages.length > 0, 1000).catch(() => {})
      let frames = []
      const deadline = Date.now() + 20000
      while (Date.now() < deadline) {
        frames = fs.existsSync(framesDir) ? fs.readdirSync(framesDir) : []
        if (MATERIALIZED_WRITE_LIST.every((name) => frames.includes(name))) break
        await sleep(500)
      }
      assert(
        MATERIALIZED_WRITE_LIST.every((name) => frames.includes(name)),
        `.od-frames/ 缺写清单管理名：${JSON.stringify(frames)}（期望 ${JSON.stringify(MATERIALIZED_WRITE_LIST)}）`,
      )
      assert(frames.length === MATERIALIZED_WRITE_LIST.length, `.od-frames/ 出现清单外文件：${JSON.stringify(frames)}`)
      const prototypeDir = path.join(RICH_SCENARIO, 'assets', 'task-profiles', 'prototype')
      for (const name of OD_FRAMES_FILES) {
        const written = fs.readFileSync(path.join(framesDir, name))
        // fixture 实布局：三个 html 在 device-frames/ 子目录，layout.css 在 prototype/ 根（与清单 resources 声明一致）
        const source = path.join(prototypeDir, name === 'layout.css' ? name : path.join('device-frames', name))
        assert(written.equals(fs.readFileSync(source)), `材质化副本与源不一致：${name}`)
      }
      const deckFile = fs.readFileSync(path.join(framesDir, DECK_FRAMEWORK_FILE_NAME), 'utf8')
      assert(deckFile === DECK_FILE_EXPECTED, `deck-framework.md 与派生登记文本不一致（${deckFile.length} vs ${DECK_FILE_EXPECTED.length} 字符）`)
    })
  } finally {
    await instance.close()
  }
  return results
}

/** 场景 S2+S3（V5 前八节零回归 + 面板 + 探针）：预览面板交互 + 探针隔离 + doctor 十一节（mini-od ⑨ 降级形态）。 */
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

    await stepAsync(results, 'doctor 输出十一分节齐全，前八节零回归（V5）', async () => {
      const body = await runDoctor(page)
      expectDoctorSections(body)
      assert(body.includes('资源根：'), '缺资源根行')
      assert(body.includes('manifest 版本'), '缺 manifest 版本行')
      assert(body.includes('结论：全部声明文件在场'), 'roster 核验应全过')
    })

    await stepAsync(results, 'doctor ⑨ 资产丰富度：mini-od 三目录缺失降级形态带恢复动作（V6 降级口径）', async () => {
      const body = await runDoctor(page)
      assert(body.includes('【9/11】资产丰富度'), '缺第⑨节资产丰富度')
      assert(body.includes('craft/ 目录缺失'), `⑨ 应报 craft 目录缺失降级：${body.slice(body.indexOf('【9/11】'), body.indexOf('【10/11】'))}`)
      assert(body.includes('design-templates/ 目录缺失'), '⑨ 应报形状包目录缺失降级')
      assert(body.includes('检查资产根（资源根见第①节）与 OD 安装完整性'), '⑨ 降级缺资产根完整性恢复动作')
    })

    await stepAsync(results, 'doctor ⑩ 协议对账：登记锚三行 + clone 未登记「无法比对」+ 登记恢复动作（V8 缺省态）', async () => {
      const body = await runDoctor(page)
      assert(body.includes('【10/11】协议与检查器对账'), '缺第⑩节协议对账')
      assert(body.includes('panel 评审团协议'), '⑩ 缺 panel 登记锚行')
      assert(body.includes('deck 演示稿协议'), '⑩ 缺 deck 登记锚行')
      assert(body.includes('反 AI 味检查项清单'), '⑩ 缺检查项清单登记锚行')
      assert(body.includes('源码仓 clone 探测：未登记'), '⑩ 未登记态应报「未登记」')
      assert(body.includes('无法比对'), '⑩ 未登记态应报「无法比对」')
      assert(body.includes('重新运行 /opendesign-doctor 并附 OpenDesign 源码仓 clone 路径参数'), '⑩ 缺登记路径恢复动作')
      assert(body.includes('已知信息：clone HEAD 可能滞后'), '⑩ 缺 clone HEAD 滞后已知信息行')
    })

    await stepAsync(results, 'doctor ⑪ 质量发现：监听器运行形态（设计会话已起监听，V5 第⑪节）', async () => {
      const workspaceReal = fs.realpathSync(workspace)
      await waitForReportLine(workspaceReal, (line) => line.type === 'watcher' && line.event === 'started')
      const body = await runDoctor(page)
      assert(body.includes('【11/11】质量发现'), '缺第⑪节质量发现')
      assert(body.includes('监听器状态：运行中'), `⑪ 应报监听器运行中：${body.slice(body.indexOf('【11/11】'), body.indexOf('【11/11】') + 600)}`)
      assert(body.includes('累计启动 1 次'), '⑪ 监听器累计启动计数不对')
      assert(body.includes('检查发现：共 0 条'), '⑪ 应报零发现（快照内既有文件未触碰不产生记录）')
      assert(body.includes('产物写盘身份记录：0 条'), '⑪ 应报零身份记录（尚未有快照外写盘）')
    })

    await stepAsync(results, 'doctor 材质化状态报告落点清单（第⑤节）', async () => {
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

/**
 * 场景 S2b（V5 第⑨节非降级形态）：rich-assets 三目录齐备 → doctor ⑨ 报真实清点数
 * （craft 册数按规则书口径排除两个元文件、形状包与解析异常、manifest 命中、清单段注入行数）。
 */
async function scenarioDoctorRich() {
  const results = []
  const workspace = makeWorkspaceDir('v5-rich')
  const instance = await withInstance({ label: 'v5-rich', fixtureRoot: RICH_ROOT, workspaceDir: workspace })
  try {
    const { page } = instance
    await pickWorkspace(page, workspace)
    await pickDesignPreset(page)
    await sendUserMessage(page, 'doctor richness check')
    await stepAsync(results, 'doctor ⑨ 资产丰富度非降级：craft 3 册（排除元文件）/ 形状包 1 / manifest 命中 1（V5/D10⑨）', async () => {
      const body = await runDoctor(page)
      assert(body.includes('craft 手册：3 册'), `⑨ craft 册数不对（rich-assets 3 手册 + README 元文件应排除）：${body.slice(body.indexOf('【9/11】'), body.indexOf('【10/11】'))}`)
      assert(body.includes('排除 README.md 与 FUTURE_SECTIONS.md 两个元文件'), '⑨ 缺规则书口径说明')
      assert(body.includes('形状包：1 个（解析异常 0 个）'), '⑨ 形状包计数不对（rich-assets 恰 dashboard 一包）')
      assert(body.includes('设计系统 manifest 命中：1 个（解析异常 0 个）'), '⑨ manifest 命中计数不对（rich-assets 恰 sample-brand 一包）')
      assert(body.includes('形状包清单段 1 行 / 设计系统清单段 1 行'), '⑨ 清单段注入行数不对')
      assert(body.includes('craft 指路块：注入'), '⑨ 应报 craft 指路块注入（craft/ 在场）')
    })
  } finally {
    await instance.close()
  }
  return results
}

/**
 * 场景 S3（V2+V10/RL1 真机半场+RL10）：质量环回注与指纹去重。
 *
 * 时序：设计会话（触发监听启动）→ 会话开始前 seed 的陌生既有文件触碰 → 只记录不回注
 * （V10）→ 快照外新写 P0 产物 → 防抖 + 哨兵 + 检查 → followup 回注（协议信号形态断言）
 * → 同内容重写 → 指纹去重（回注计数不变 + duplicate 记录恰一行）。
 */
async function scenarioQualityLoop() {
  const results = []
  const workspace = makeWorkspaceDir('v2')
  // V10：会话开始前放陌生既有文件（监听启动快照内、无产物身份记录）
  fs.copyFileSync(LEGACY_PAGE_HTML, path.join(workspace, 'legacy-page.html'))
  const instance = await withInstance({ label: 'v2', fixtureRoot: MINI_OD_ROOT, workspaceDir: workspace })
  const workspaceReal = fs.realpathSync(workspace)
  try {
    const { page, home } = instance
    await pickWorkspace(page, workspace)
    await pickDesignPreset(page)
    await sendUserMessage(page, 'design a pricing page')

    await stepAsync(results, '监听器启动记录在场（watcher started 行，V2 前置）', async () => {
      await waitForReportLine(workspaceReal, (line) => line.type === 'watcher' && line.event === 'started')
    })

    await stepAsync(results, 'V10：触碰陌生既有文件——只落 finding 记录（unrecognized-existing），零回注', async () => {
      // 读-改-写回：保持 </html> 文末结尾（过完整性哨兵），内容变化触发 fs.watch
      const file = path.join(workspaceReal, 'legacy-page.html')
      const original = fs.readFileSync(file, 'utf8')
      fs.writeFileSync(file, original.replace('</body>', '  <div aria-hidden="true"></div>\n</body>'))
      await waitForReportLine(workspaceReal, (line) => line.type === 'finding' && line.reason === 'unrecognized-existing')
      const lines = readQualityReport(workspaceReal)
      const hits = lines.filter((line) => line.type === 'finding' && line.id === 'purple-gradient' && line.reason === 'unrecognized-existing')
      assert(hits.length === 1, `陌生既有文件的 purple-gradient finding 应恰 1 行：${JSON.stringify(lines)}`)
      assert(hits[0].path === 'legacy-page.html', `finding path 应为 cwd 相对路径：${JSON.stringify(hits[0])}`)
      assert(collectLintFeedbackMessages(home).length === 0, '陌生既有文件命中不应产生回注消息（V10 零回注）')
    })

    await stepAsync(results, 'V2：快照外新写 P0 产物——防抖后检查，回注消息以包专有 source.kind 注入会话（RL1 真机半场/AX7）', async () => {
      fs.writeFileSync(path.join(workspaceReal, 'pricing.html'), dirtyArtifactHtml('Pricing'))
      await waitForLintFeedbackCount(home, 1)
      const messages = collectLintFeedbackMessages(home)
      const message = messages[0]
      assert(message.text.includes('[opendesign-design-mode 质量环]'), '回注文本开头应自报质量环身份（AX7）')
      assert(message.text.includes('purple-gradient'), '回注文本缺检查项 id')
      assert(message.text.includes('修复指引'), '回注文本缺修复指引')
      assert(message.text.includes('仅修复你本会话产出的 HTML'), '回注文本缺作用域句（V10 作用域声明）')
      assert(message.text.includes('修复后无需回复本消息'), '回注文本缺无需回复句')
    })

    await stepAsync(results, 'V2：report.jsonl 记录链完整——身份行 + finding（fed-back）落盘（RL9/SC5）', async () => {
      await waitForReportLine(workspaceReal, (line) => line.type === 'finding' && line.reason === 'fed-back')
      const lines = readQualityReport(workspaceReal)
      assert(lines.some((line) => line.type === 'artifact' && line.path === 'pricing.html'), `快照外新写产物应有身份行：${JSON.stringify(lines.filter((l) => l.type === 'artifact'))}`)
      const fedBack = lines.filter((line) => line.type === 'finding' && line.id === 'purple-gradient' && line.reason === 'fed-back')
      assert(fedBack.length === 1, `pricing.html 的 purple-gradient fed-back finding 应恰 1 行：${JSON.stringify(fedBack)}`)
      assert(fedBack[0].severity === 'P0', '回注发现 severity 应为 P0')
    })

    await stepAsync(results, 'V2/SI2：同内容重写指纹去重——回注消息计数不变，duplicate 记录恰一行（RL3）', async () => {
      // 同内容重写：内容指纹（sha256 + P0 id 集）不变 → 去重不再回注，仅落 duplicate 记录
      fs.writeFileSync(path.join(workspaceReal, 'pricing.html'), dirtyArtifactHtml('Pricing'))
      await waitForReportLine(workspaceReal, (line) => line.type === 'finding' && line.reason === 'duplicate')
      await sleep(2500) // 第二次写盘的防抖 + 检查 + 回注窗口余量：确认没有第二条回注
      const messages = collectLintFeedbackMessages(home)
      assert(messages.length === 1, `指纹去重后回注消息应仍为 1 条（去重事件计数）：${messages.length}`)
      const duplicates = readQualityReport(workspaceReal).filter((line) => line.type === 'finding' && line.reason === 'duplicate')
      assert(duplicates.length === 1 && duplicates[0].id === 'purple-gradient', `duplicate 记录应恰 1 行（purple-gradient）：${JSON.stringify(duplicates)}`)
    })
  } finally {
    await instance.close()
  }
  return results
}

/**
 * 场景 S4（V7/RL6）：非设计会话零侵入——standard 会话写 P0 HTML 进其工作目录，
 * 零监听（无 .od-quality/ 目录）零回注（事件流无 lint 消息），插件不接管普通会话。
 */
async function scenarioStandardZeroIntrusion() {
  const results = []
  const workspace = makeWorkspaceDir('v7')
  const instance = await withInstance({ label: 'v7', fixtureRoot: MINI_OD_ROOT, workspaceDir: workspace })
  const workspaceReal = fs.realpathSync(workspace)
  try {
    const { page, home } = instance
    await pickWorkspace(page, workspace)
    await sendUserMessage(page, 'plain session writing an html file')

    await stepAsync(results, 'V7：standard 会话写 P0 HTML——零监听（.od-quality/ 不出现）', async () => {
      fs.writeFileSync(path.join(workspaceReal, 'legacy.html'), dirtyArtifactHtml('Plain session page'))
      await sleep(3000) // 防抖（800ms）+ 检查窗口余量：若有监听该窗口内必然产生记录
      assert(!fs.existsSync(path.join(workspaceReal, '.od-quality')), 'standard 会话工作目录不应出现 .od-quality/（零监听）')
    })

    await stepAsync(results, 'V7：standard 会话事件流零回注消息（preset 过滤生效）', async () => {
      const messages = collectSessionFiles(home).flatMap((entry) => readSessionLog(entry.file).userMessages)
      assert(messages.every((message) => message.kind !== LINT_SOURCE_KIND), `standard 会话不应有质量环回注消息：${JSON.stringify(messages.filter((m) => m.kind === LINT_SOURCE_KIND))}`)
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

    // V9 前半：gen1 会话内写 P0 产物 → 监听器回注（followup）。该产物落 report.jsonl
    // 身份行——resume 后新一代监听器据此把它豁免出启动快照（改写照常回注，D5④）。
    await stepAsync(results, 'V9 前半：gen1 会话写 P0 产物并获得回注（第一代检查环）', async () => {
      const workspaceReal = fs.realpathSync(workspace)
      await waitForReportLine(workspaceReal, (line) => line.type === 'watcher' && line.event === 'started')
      fs.writeFileSync(path.join(workspaceReal, 'poster.html'), dirtyArtifactHtml('Poster'))
      await waitForLintFeedbackCount(home, 1)
      const messages = collectLintFeedbackMessages(home)
      assert(messages[0].text.includes('poster.html'), `回注文本应指向产物相对路径：${JSON.stringify(messages[0].text.slice(0, 200))}`)
    })

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

    await stepAsync(results, 'V9：doctor ⑪ 读出 gen1 检查记录——fed-back 发现 + 产物身份记录可回查（RL9/D5④ 读侧）', async () => {
      const body = await runDoctor(gen2Page)
      assert(body.includes('监听器状态'), '⑪ 缺监听器状态行')
      assert(body.includes('[P0] purple-gradient — poster.html'), '⑪ 应呈现 gen1 产物的 P0 发现行')
      assert(body.includes('已回注送达会话'), '⑪ 发现行应带 fed-back 裁决中文说明')
      assert(body.includes('产物写盘身份记录：1 条'), '⑪ 产物写盘身份记录应可回查（D5④ 豁免集数据源）')
      assert(body.includes('poster.html'), '⑪ 身份记录应含 poster.html')
    })

    // V9 后半（resume 后监听器复活与第二代回注）依赖宿主 resume 重组发 agent-preset/selected
    // 事件——0.1.7 实测不发（registry select() 对有历史回合的会话 locked，resume 走投影状态
    // 重挂且幂等不写事件，亲读 packages/preset/agent-preset-registry/src/index.ts:368-377 与
    // 会话日志实读核实）：gen2 进程无新 started 行、同内容重写零回注。自愈接线是设计外新
    // 机制（D4 无此语义），归 U5 领地待裁决；本场景探测两种实态：复活则走 V9 完整断言
    // （0.2.2 或接线补边后形态），未复活则显式播报降级、登记补跑路径（不静默、不固化缺陷）。
    const resumeWatcherRevived = await (async () => {
      const workspaceReal = fs.realpathSync(workspace)
      fs.writeFileSync(path.join(workspaceReal, 'poster.html'), dirtyArtifactHtml('Poster'))
      const deadline = Date.now() + 12000
      while (Date.now() < deadline) {
        const starts = readQualityReport(workspaceReal).filter((l) => l.type === 'watcher' && l.event === 'started').length
        if (starts >= 2) return true
        await sleep(500)
      }
      return false
    })()

    if (resumeWatcherRevived) {
      await stepAsync(results, 'V9/SC4：resume 后同内容重写上一代产物——身份豁免照常回注一次（指纹进程内重启即清的幂等代价）', async () => {
        await waitForLintFeedbackCount(home, 2)
        const messages = collectLintFeedbackMessages(home)
        assert(messages.length === 2, `resume 后同内容首写应恰第二次回注（指纹重启即清 + 身份豁免照常回注）：${messages.length}`)
        assert(messages[1].text.includes('poster.html'), `第二次回注应仍指向 poster.html：${JSON.stringify(messages[1].text.slice(0, 200))}`)
      })

      await stepAsync(results, 'V9/SI2：第二代指纹去重——再次同内容重写不再回注（RL3 的 resume 形态）', async () => {
        const workspaceReal = fs.realpathSync(workspace)
        fs.writeFileSync(path.join(workspaceReal, 'poster.html'), dirtyArtifactHtml('Poster'))
        await waitForReportLine(workspaceReal, (line) => line.type === 'finding' && line.reason === 'duplicate')
        await sleep(2500)
        assert(collectLintFeedbackMessages(home).length === 2, '第二代同内容重写应被指纹去重，回注计数停在 2')
      })
    } else {
      console.log('    [环境降级] 0.1.7 宿主 resume 重组不发 agent-preset/selected 事件（registry select() 对已开局会话 locked）：resume 后质量环监听器不自动复活，V9/SC4+SI2 完整断言跳过——已写入 poster.html 触发实态，待接线补边（自愈通道归 U5 领地裁决）或 0.2.2 桌面宿主验证后补跑')
      results.push({ name: 'V9 后半降级登记：resume 后监听器复活探测（未复活——见场景播报）', ok: true })
    }
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

    step(results, 'V11：新增文件恰为 .od-frames/ 五管理名（D8 清单 4 复制件 + deck-framework.md 派生件）', () => {
      const framesDir = path.join(workspace, '.od-frames')
      assert(fs.existsSync(framesDir), '.od-frames/ 未落盘')
      const names = fs.readdirSync(framesDir)
      assert(
        MATERIALIZED_WRITE_LIST.every((name) => names.includes(name)) && names.length === MATERIALIZED_WRITE_LIST.length,
        `.od-frames/ 文件集合不对：${JSON.stringify(names)}（期望 ${JSON.stringify(MATERIALIZED_WRITE_LIST)}）`,
      )
    })

    step(results, 'V11：git status 无 tracked 变更、untracked 恰为 .od-frames/ 与 .od-quality/（反向断言 D8 ④ + D4 记录目录）', () => {
      const lines = gitStatus()
      const tracked = lines.filter((l) => !l.startsWith('??'))
      assert(tracked.length === 0, `既有 tracked 文件被改写：${JSON.stringify(tracked)}`)
      const untracked = lines.filter((l) => l.startsWith('??'))
      assert(
        untracked.length === 2 && untracked.every((l) => l.includes('.od-frames/') || l.includes('.od-quality/')),
        `untracked 应恰为 .od-frames/ 与 .od-quality/（材质化根 + 质量环记录目录）：${JSON.stringify(untracked)}`,
      )
    })

    step(results, 'V11：幂等——重复会话不堆积；升级轮（gen2 不声明壳资源）旧副本原样保留、无清单外写入', () => {
      const framesDir = path.join(workspace, '.od-frames')
      // gen2 清单未声明设备壳资源（复制件重铺计划为空）：既有四复制件按 D8 覆盖语义原样
      // 保留，deck-framework.md（派生登记件）无条件重铺——不堆积新文件、不被清除，
      // 重铺波及面不变量的升级轮形态。
      const names = fs.readdirSync(framesDir)
      assert(
        MATERIALIZED_WRITE_LIST.every((name) => names.includes(name)) && names.length === MATERIALIZED_WRITE_LIST.length,
        `.od-frames/ 文件集合在升级轮后不对：${JSON.stringify(names)}`,
      )
      const projectFiles = fs.readdirSync(workspace)
      assert(
        projectFiles.filter((name) => name !== '.git' && name !== '.od-frames' && name !== '.od-quality').length === 0,
        `项目目录出现清单外文件：${JSON.stringify(projectFiles)}（.od-quality/ 是质量环记录目录，D4 设计内写入）`,
      )
      // mini-od 轮写下的副本与其源逐字节一致（升级轮之前的覆盖语义已在 S1 断言，这里对账升级轮不清除）
      const prototypeDir = path.join(MINI_OD_SCENARIO, 'assets', 'task-profiles', 'prototype')
      for (const name of OD_FRAMES_FILES) {
        const source = path.join(prototypeDir, name === 'layout.css' ? name : path.join('device-frames', name))
        assert(fs.readFileSync(path.join(framesDir, name)).equals(fs.readFileSync(source)), `升级轮后副本应保持 mini-od 源内容（${name}）`)
      }
      assert(
        fs.readFileSync(path.join(framesDir, DECK_FRAMEWORK_FILE_NAME), 'utf8') === DECK_FILE_EXPECTED,
        '升级轮后 deck-framework.md 应保持派生登记文本（无条件重铺语义）',
      )
    })
  } finally {
    if (genA !== null) await genA.close()
    if (genB !== null) await genB.close()
  }
  return results
}

// ── shell 包共存回归（A9/A10/A11；设计 §4.3 e2e 影响面第一行）───────────────

/** verify runner 子进程（--json：stdout 尾部 JSON 行 = 聚合 verdict；日志走 stderr）。 */
function runVerifyRunner(args) {
  const proc = spawnSync(process.execPath, [
    path.join(REPO_ROOT, 'scripts', 'verify', 'run.mjs'),
    ...args, '--json',
  ], {
    encoding: 'utf8',
    timeout: 420000,
    maxBuffer: 32 * 1024 * 1024,
    // opendesign preset 探测 fixture 化：runner 起的实例同样落在 mini-od 资产根上（共存态确定性，不依赖真机 OD）。
    env: { ...process.env, OD_RESOURCE_ROOT: MINI_OD_ROOT },
  })
  let verdict = null
  for (const line of (proc.stdout ?? '').split('\n').reverse()) {
    const trimmed = line.trim()
    if (trimmed.startsWith('{')) {
      try { verdict = JSON.parse(trimmed); break } catch { /* 尾行非 JSON（日志混入）时继续向前找 */ }
    }
  }
  return { status: proc.status, verdict, output: `${proc.stdout ?? ''}\n${proc.stderr ?? ''}` }
}

/**
 * 场景 S8（A9/A10/A11）：shell 包既有断言场景在两包共存 profile 上的回归。
 *
 * 共存前提即命题：brand/projects/lifecycle 三场景的验收目的 =「新插件安装进同一 profile 后
 * preset 注册与 UI 注入不干扰 shell 包」——只在 opendesign 在场时才可证明（verify runner
 * 自启形态只装 shell 单包，单装态结果不能登记为 A9/A10/A11 通过）。串接形态：
 *  - brand+projects：runner --url 连本套件的两包共存实例（runner 不装包不启实例）；
 *  - lifecycle：runner 自启形态对克隆的共存 home（runner 幂等重 add shell——实测幂等；
 *    opendesign 保持在场）。lifecycle 的固有 degrade（禁用回落无 CLI 通道）按 runner 登记
 *    接受，断言 failed=0 硬性。
 */
async function scenarioShellCoexistRegression() {
  const results = []
  const workspace = makeWorkspaceDir('shell-coexist')
  const artifactsDir = path.join(RUN_ROOT, 'verify-shell-regression')
  fs.mkdirSync(artifactsDir, { recursive: true })

  await stepAsync(results, 'A9/A10：runner --url 连共存实例，brand+projects 回归', async () => {
    const instance = await withInstance({ label: 'shell-coexist', fixtureRoot: MINI_OD_ROOT, workspaceDir: workspace })
    try {
      const { page, home } = instance
      // projects 场景的「当前会话行标记」前置 = 已有会话（缺前置显式 degrade，不假 pass）——先建 standard 会话。
      await pickWorkspace(page, workspace)
      await sendUserMessage(page, 'plain session for shell coexistence regression')
      await waitForSessionLog(home, (_entry, l) => l.systemMessages.length > 0)
      const outcome = runVerifyRunner([
        '--url', instance.url, '--scenarios', 'brand,projects',
        '--artifacts-dir', artifactsDir, '--run-id', `shell-web-${Date.now()}`,
      ])
      assert(outcome.status === 0, `runner 退出码 ${outcome.status}（预期 0）。输出尾部：${outcome.output.slice(-1500)}`)
      assert(outcome.verdict !== null, 'runner verdict JSON 解析失败')
      for (const id of ['brand', 'projects']) {
        const entry = outcome.verdict.scenarios.find((s) => s.id === id)
        assert(entry !== undefined, `runner 结果缺 ${id} 场景：${JSON.stringify(outcome.verdict.scenarios)}`)
        assert(entry.verdict === 'pass', `${id} 场景 verdict=${entry.verdict}（预期 pass）。输出尾部：${outcome.output.slice(-1500)}`)
      }
    } finally {
      await instance.close()
    }
  })

  await stepAsync(results, 'A11：runner 自启共存 home 跑 lifecycle 回归（卸载 shell，opendesign 在场）', async () => {
    const home = path.join(RUN_ROOT, 'home-shell-lifecycle')
    fs.cpSync(TEMPLATE_HOME, home, { recursive: true })
    const runId = `shell-lifecycle-${Date.now()}`
    const outcome = runVerifyRunner([
      '--dsh-bin', DSH_BIN, '--dsh-home', home, '--scenarios', 'lifecycle',
      '--artifacts-dir', artifactsDir, '--run-id', runId,
    ])
    assert(outcome.status === 0, `runner 退出码 ${outcome.status}（预期 0；1=fail 2=doctor/参数错）。输出尾部：${outcome.output.slice(-1500)}`)
    assert(outcome.verdict !== null && outcome.verdict.verdict !== 'fail', `lifecycle 聚合 verdict=${outcome.verdict?.verdict}`)
    // 断言级结果在场景级 verdict.json（runner stdout 聚合 JSON 只带场景 verdict，不带 meta）。
    const scenarioVerdict = JSON.parse(fs.readFileSync(path.join(artifactsDir, runId, 'lifecycle', 'verdict.json'), 'utf8'))
    assert(scenarioVerdict.verdict !== 'fail', `lifecycle 场景 verdict=${scenarioVerdict.verdict}`)
    const failed = scenarioVerdict.meta?.assertions?.failed
    assert(failed === 0, `lifecycle 断言失败 ${JSON.stringify(failed)} 条（degraded 的固有 disable 通道登记不算失败，断言失败算）。输出尾部：${outcome.output.slice(-1500)}`)
  })

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
    ['S1 V1+V3+V4注入 roster+注入四新段+默认会话+材质化5文件', scenarioV1],
    ['S2+S3 V5前八节+⑨降级+⑩未登记+⑪监听 面板+探针+doctor', scenarioPanelAndDoctor],
    ['S2b V5⑨非降级 rich-assets 丰富度清点', scenarioDoctorRich],
    ['S3 V2+V10 质量环回注+指纹去重+陌生既有文件', scenarioQualityLoop],
    ['S4 V7 非设计会话零侵入', scenarioStandardZeroIntrusion],
    ['S5 V6无资产+SI3', scenarioNoAssets],
    ['S6 V6漂移', scenarioDrift],
    ['S7 V9+RL7 resume 代际重组+检查环不变量', scenarioResume],
    ['S8 V11 项目目录写入形态（5 管理名）', scenarioProjectWrites],
    ['S9 A9/A10/A11 shell 包共存回归（runner 串接）', scenarioShellCoexistRegression],
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
