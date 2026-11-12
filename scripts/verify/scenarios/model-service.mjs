/**
 * model-service 场景：模型服务接入 / 追加分区与撤除 / 密钥零泄漏与保存链路
 * （dsh-model-service V1/V3/V4/V5/V6/V9 的可自动化断言子集；V2 仅来源态标注经 V9 断言，
 * 其余部分归 D3 真机验收）。
 *
 * 前置：只能对隔离 profile 跑（需要 --dsh-bin + --dsh-home 自启模式）——场景要读隔离
 * DSH_HOME 的设置文档（cordis.patch.yml）与凭据文件（.credentials.yaml）并对其做零泄漏
 * 断言；--url 模式不拥有实例与文件 → 显式 degrade + 恢复动作，绝不静默跳过。
 *
 * 断言范围：
 *  V3（追加分区，RL4）：设置导航「模型」与「模型服务」并存；点模型服务渲染插件页（三视图
 *    切换条）；点宿主「模型」渲染宿主原生页（无串页——.ms-section 收起）。
 *  V1（接入全流程）：全新隔离 home 先断言供应商视图为空态（V9 步骤 1——清单只显示已接入
 *    条目，未接入的内置目录 route 不直出）；随后经插件分区添加供应商：
 *    添加是三步流程——内置支断言候选列表与窄表单（端点/协议编辑面不存在、只填密钥）；
 *    自定义支走全表单：零模型保存被拒并给「至少添加一个模型或先执行发现」指引（保存前置）；
 *    手动添加模型后保存成功，设置文档出现 providers.<key>（apiKeyEnv 为 ref 名、无明文密钥）
 *    + 凭据文件出现对应 ref（先设置后凭据的两处落盘，V1 步骤 5/6）；不重启宿主（页面无
 *    reload 标记不变）宿主「模型」分区可见该供应商（pi-ai 目录热重算，V1 步骤 7/9/RL2）。
 *  V1 步骤 11 / RL3（冲突重试）：第一个客户端保持展开体打开（不重新打开）；第二个客户端
 *    （同 URL 新标签页，同一宿主进程的第二个 web 连接）编辑同一供应商的显示名并保存成功
 *    （revision 前移）；回到第一个客户端在仍打开的展开体上加模型保存——settings/conflict
 *    触发自动重读重试一次成功，设置文档中双方改动（新显示名 + 新模型条目）均保留。
 *    构造偏差登记：设计原文的第二写者是宿主「模型」分区（其编辑会话与插件展开体在同一
 *    面板互斥——宿主 renderSlot only:active 切换分区即卸载，展开体无法跨分区存活）；
 *    脚本以第二个 web 连接承载第二写者，冲突-重读-重试-双方保留的机制断言等价
 *    （真机 D3 可另按宿主分区写者复验）；机制本体另有单测（settings-client 冲突重试分支）。
 *  V4（密钥零泄漏 + 保存链路）：设置文档与插件 Config 行无密钥字面（sk- 前缀扫描）；同名
 *    供应商二次保存被 route 预检拒绝且设置文档零写入（检查点 U1「预检 → 查重 → mutate →
 *    set」顺序的自动可达部分）；凭据 ref 撞名的 b 支文案（V4 步骤 9，RL10 补建项）：直改
 *    凭据文件写入无引用者 ref（宿主凭据服务运行中热加载）后经插件分区创建派生同名 ref 的
 *    供应商，断言保存被拒 + 跨 profile 占用文案 + 设置文档零写入 + 改名重试成功；a 支文案
 *    （宿主「模型」分区创建 taiji-* 路由供应商）的宿主表单自动化构造未建立，登记
 *    notProvable；删除供应商后设置文档条目与凭据 ref 均清除（V4 步骤 5，无孤儿密钥）。
 *  V9（模型清单操作台）：按供应商分组的组头（供应商名 + 来源徽章 + 清单态徽章）；关键词
 *    筛选空态 + 清除动作（V9 步骤 5）与来源筛选 chip；行内编辑保存的写路径（writeProviderModels
 *    整段写回落盘）；目录默认组（内置供应商零填写接入 = 目录默认态）的「复制到自定义清单」
 *    （整体替换语义显式提示：toast「目录默认已被替换」+ 组徽章翻转）；宿主托管只读组视
 *    隔离实例的注册情况存在（无托管行时登记 notProvable，不假红）。
 *
 *  M2 段（路由卡工作台）：V5 的新建即配置（新卡就地命名、派生 id 落盘）、同名二次创建加
 *    序号区分、成员管线即时保存与拖拽排序（move 语义成员序翻转，判定源 = readRouteMemberModels
 *    的 routes 段成员序）、G18「供应商已删」标注；V6 的对话流可见开关（role=switch，白名单
 *    checkbox 的语义化）勾选/取消/恢复与悬挂清理的 Config 侧语义（插件 Config 落盘
 *    whitelist/routes 断言——SC8 权威写入的可观察事实）；V7 的注册失败就地改名修复路径
 *    （物理 provider 占用 taiji-route-p-1 → 中文路由派生 id 撞宿主 → 卡头红徽 + 修复条 →
 *    就地改名 → 警告条退场）；对话流真实报错需真实端点，notProvable 登记。
 *
 * 本场景不发任何模型对话请求（V1 步骤 8 / V5 步骤 5-8 / V7 的流式与错误断言需要真实可用
 * 端点，归 D3 真机）。
 */
import { chmodSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { bootInto } from '../lib/browser.mjs'

export const meta = {
  id: 'model-service',
  title: '模型服务接入与路由',
  description: '分区并存无串页 / 接入全流程与热重算 / 冲突重读重试双方保留 / 密钥零泄漏与保存链路 / 模型清单操作台（分组、来源筛选、行内编辑、复制到自定义清单） / 路由卡工作台（新建即配置、就地改名、成员拖拽排序、对话流可见开关、注册失败就地修复、悬挂清理）',
}

/**
 * 设置文档与凭据文件的轮询等待（宿主落盘是异步的，给最多 5s）。
 * cond 允许同步布尔与返回 Promise 的异步谓词（await 对同步返回值原样通过）——判定必须
 * await：漏 await 时 Promise 对象恒真，轮询第一次就假绿（run() 开头的自证断言守护这一点）。
 */
export async function waitFor(cond, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await cond()) return true
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  return await cond()
}

/**
 * 从 cordis.patch.yml 文本提取 tai-ji-yang-shell config 的 whitelist 字段值（条目 id 数组）。
 * 判定只落在 whitelist 键自身的值域，不受 routes 段路由 id/name（deriveRouteId 派生，取消
 * 勾选不删 routes）同名文本干扰——whitelist 断言必须走这里，禁止全文件 includes。
 * 两种实测序列化形态（DSH 宿主 dump）都支持：空/短值 flow 形态 `whitelist: []`、
 * 非空 block 形态 `whitelist:` 换行更深缩进 `- 条目`。键不存在返回 null（调用方按未落盘处理）。
 */
function readWhitelistEntries(patchText) {
  const sectionStart = patchText.indexOf('tai-ji-yang-shell')
  if (sectionStart < 0) return null
  const lines = patchText.slice(sectionStart).split('\n')
  const keyIdx = lines.findIndex((line) => /^\s*whitelist:/.test(line))
  if (keyIdx < 0) return null
  const keyLine = lines[keyIdx]
  const inline = keyLine.slice(keyLine.indexOf('whitelist:') + 'whitelist:'.length).trim()
  if (inline !== '') {
    const inner = inline.replace(/^\[/, '').replace(/\]$/, '').trim()
    return inner === '' ? [] : inner.split(',').map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
  }
  const keyIndent = (keyLine.match(/^\s*/) ?? [''])[0].length
  const entries = []
  for (let i = keyIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === '') continue
    if ((line.match(/^\s*/) ?? [''])[0].length <= keyIndent) break
    const item = line.trim()
    if (item.startsWith('- ')) entries.push(item.slice(2).trim().replace(/^['"]|['"]$/g, ''))
  }
  return entries
}

/**
 * waitFor 自证（check-credentials-hygiene.mjs 的负样本纪律同源）：恒 false 的异步 cond
 * 必须超时后返回 false（漏 await 时恒真——轮询失效），同步 true cond 必须立即通过
 * （await 不得误拦既有同步调用点）。返回失败描述清单，空 = 通过。
 */
export async function waitForSelfTestFailures() {
  const failures = []
  const started = Date.now()
  if (await waitFor(async () => false, 450) !== false) {
    failures.push('恒 false 的异步 cond 未按超时返回 false——waitFor 轮询判定漏 await（假绿回归）')
  }
  if (Date.now() - started < 400) {
    failures.push('异步 cond 的等待耗时不足 400ms——waitFor 未真正轮询到超时')
  }
  if (await waitFor(() => true, 1000) !== true) {
    failures.push('同步 true cond 未立即通过——await 改写破坏了同步谓词兼容')
  }
  return failures
}

/**
 * 从 cordis.patch.yml 文本按路由 id 提取 routes 段该路由的成员 model 序（成员顺序 = 优先级，
 * 拖拽排序断言的判定源）。判定窗口 = 该路由条目行（`- id: <routeId>`）到下一个同级路由条目
 * 或 whitelist 键为止；只取窗口内的 `model:` 值行，不受 providers 段模型条目（`- id:` 形态）
 * 与 routes 段其他路由文本干扰。路由不存在返回 []。
 */
function readRouteMemberModels(patchText, routeId) {
  const lines = patchText.split('\n')
  const startIdx = lines.findIndex((line) => new RegExp(`^\\s*-\\s*id:\\s*${routeId}\\s*$`).test(line))
  if (startIdx < 0) return []
  const entryIndent = (lines[startIdx].match(/^\s*/) ?? [''])[0].length
  const models = []
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*whitelist:/.test(line)) break
    const nextRoute = /^\s*-\s*id:/.exec(line)
    if (nextRoute !== null && (line.match(/^\s*/) ?? [''])[0].length <= entryIndent) break
    const model = /^\s*model:\s*(\S+)\s*$/.exec(line)
    if (model !== null) models.push(model[1].replace(/^['"]|['"]$/g, ''))
  }
  return models
}

/** 打开设置面板（宿主触发钮 aria-label 跟随语言，候选依次试）。 */
async function openSettings(page) {
  const candidates = ['设置', 'Settings', '偏好设置', 'Preferences']
  for (const label of candidates) {
    const trigger = page.locator(`[aria-haspopup="dialog"][aria-label="${label}"]`).first()
    if (await trigger.isVisible().catch(() => false)) {
      await trigger.click()
      await page.locator('[data-shortcut-modal="settings"]').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
      return page.locator('[data-shortcut-modal="settings"]').isVisible().catch(() => false)
    }
  }
  return false
}

/** 点设置导航条目（按可见文本），返回是否点到。 */
async function clickNav(page, label) {
  const cell = page.locator('[data-shortcut-modal="settings"] nav button', { hasText: label }).first()
  if (!(await cell.isVisible().catch(() => false))) return false
  await cell.click()
  await page.waitForTimeout(400)
  return true
}

/**
 * 进入自定义供应商全表单：添加入口 → choose 卡选「自定义」（添加是两步流程：先选接入方式，
 * 再进表单）。清单口径反转后「添加供应商」打开的是接入方式选择卡，全表单创建必须走此入口。
 */
async function openCustomAddForm(page) {
  await page.locator('.ms-section .ms-button-primary', { hasText: '添加供应商' }).first().click()
  await page.waitForTimeout(300)
  await page.locator('.ms-section .ms-addflow-card', { hasText: '自定义' }).first().click()
  await page.waitForTimeout(300)
}

/** 当前高亮导航条目文本（无串页断言的对照面）。 */
async function activeNavLabel(page) {
  return page.locator('[data-shortcut-modal="settings"] nav button[aria-current="true"]').first()
    .textContent().catch(() => null)
}

/** 供 key 派生：显示名 → kebab（与 client/model-service/provider-key.ts 同规则的最小复刻）。 */
function deriveKey(displayName) {
  return displayName
    .toLowerCase()
    .replace(/[\s_.]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * 直改凭据文件：向 version 1 布局的 refs 段插入一个 ref（dsh-credentials-local 的存储布局
 * `version: 1` + 两空格缩进的 `REF: 值`）。b 支构造通道（RL10 补建项：直改凭据文件是决策 7
 * 边缘二登记的同型入口）。权限保原样（新建给 0600）——宿主 assertOwnerOnly 拒绝
 * group/other 可读的凭据文件，放宽权限会让热加载保留旧快照（reload warn）。
 */
function appendCredentialRef(file, ref, value) {
  const current = existsSync(file) ? readFileSync(file, 'utf8') : 'version: 1\nrefs:\n'
  const mode = existsSync(file) ? statSync(file).mode & 0o777 : 0o600
  const lines = current.split('\n')
  const refsAt = lines.findIndex((line) => line.trimEnd() === 'refs:')
  const entry = `  ${ref}: ${value}`
  const next = refsAt >= 0
    ? [...lines.slice(0, refsAt + 1), entry, ...lines.slice(refsAt + 1)].join('\n')
    : `${current}${current.endsWith('\n') || current === '' ? '' : '\n'}${entry}\n`
  writeFileSync(file, next, { mode })
  chmodSync(file, mode)
}

/** 直改凭据文件：移除一个 ref 行（b 支收尾清理；宿主 unset 对缺席 ref 幂等，同纪律）。 */
function removeCredentialRef(file, ref) {
  if (!existsSync(file)) return
  const mode = statSync(file).mode & 0o777
  const next = readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith(`${ref}:`))
    .join('\n')
  writeFileSync(file, next, { mode })
  chmodSync(file, mode)
}

export async function run(ctx) {
  const { page, recorder, ev, log, mode, dsh } = ctx

  if (mode !== 'dsh' || dsh === null) {
    ev.notProvable('URL 模式无法断言设置文档/凭据文件落盘与零泄漏（runner 不拥有隔离实例）')
    ev.degrade('model-service 前置缺失：--url 模式无隔离 DSH_HOME 文件访问权',
      '用 --dsh-bin <dsh> --dsh-home <临时目录> 自启隔离实例重跑 model-service 场景')
    ev.attach('console.txt', recorder.text())
    return
  }

  // waitFor 自证先于一切场景断言（本场景多处断言以 waitFor 的轮询结果为准——轮询机制
  // 自身失效时后续断言不可信，必须先红）。
  const waitSelfTest = await waitForSelfTestFailures()
  ev.assert('waitFor 轮询自证（异步恒 false cond 超时返回 false、同步 true cond 立即通过）', waitSelfTest.length === 0, {
    expected: '轮询机制按 await 判定',
    actual: waitSelfTest.join('; ') || '通过',
  })

  const profileDir = join(dsh.dshHome, 'profiles', dsh.profile)
  const patchFile = join(profileDir, 'cordis.patch.yml')
  const credentialsFile = join(dsh.dshHome, '.credentials.yaml')
  const stamp = Date.now().toString(36)
  const providerName = `verify-${stamp}`
  const providerKey = deriveKey(providerName)
  const credentialRef = `TAIJI_${providerKey.replace(/-/g, '_').toUpperCase()}_KEY`
  const secretValue = `sk-verify-${stamp}-${Math.random().toString(36).slice(2, 10)}`
  ev.step({ step: 'model-service.setup', stats: { providerName, providerKey, credentialRef } })

  // ── V9 步骤 1（全新隔离 home 的目录列表形态）+ V3 步骤 1（导航并存）──────────
  if (!(await openSettings(page))) {
    ev.degrade('设置面板打不开（宿主触发钮 aria-label 未命中候选文案）',
      '核对宿主 settings.trigger 的 locale 文案后把候选列表补进 openSettings()')
    ev.attach('console.txt', recorder.text())
    return
  }
  ev.step({ step: 'settings.open' })

  const navHasModelServices = await page.locator('[data-shortcut-modal="settings"] nav button', { hasText: '模型服务' }).isVisible().catch(() => false)
  const navHasHostModels = await page.locator('[data-shortcut-modal="settings"] nav button', { hasText: '模型' }).first().isVisible().catch(() => false)
  ev.assert('V3/导航并存：宿主「模型」与插件「模型服务」两条条目都在', navHasModelServices && navHasHostModels, {
    expected: '两条导航条目并存（D2 追加形态）',
    actual: `模型服务=${String(navHasModelServices)} 宿主模型=${String(navHasHostModels)}`,
  })

  if (!(await clickNav(page, '模型服务'))) {
    ev.degrade('「模型服务」导航条目点不开（label thunk 未渲染出中文文本？）',
      '确认页面语言为中文或把 clickNav 候选补英文「Model Services」')
    ev.attach('console.txt', recorder.text())
    return
  }
  const sectionVisible = await page.locator('.ms-section').isVisible().catch(() => false)
  ev.assert('V3/点模型服务渲染插件页（.ms-section 在场）', sectionVisible, {
    expected: '.ms-section 渲染',
    actual: String(sectionVisible),
  })
  // 三视图切换条齐备（供应商 / 模型清单 / 模型路由）。
  const tabCount = await page.locator('.ms-section .ms-viewbar-button').count()
  ev.assert('V3/三视图切换条齐备', tabCount === 3, { expected: '3', actual: String(tabCount) })

  // V9 步骤 1 = 全新实例清单只显示已接入条目：宿主 pi-ai bundle 把内置 provider 全量声明进
  // 目录（settingsNs 恒 "llm-pi-ai"），但全新 home 的 providers 段为空——清单口径反转后未
  // 接入的目录 route 不直出，供应商视图呈空态矩阵（「尚未接入任何供应商」；若隔离实例有
  // 宿主托管行则呈「暂无可编辑供应商」——两支都是反转口径的可观察事实）。
  const emptyTitle = await page.locator('.ms-section .ms-empty-title').first().textContent().catch(() => null)
  const emptyMatrixShown = emptyTitle !== null && (emptyTitle.includes('尚未接入') || emptyTitle.includes('暂无可编辑'))
  const unconnectedRowCount = await page.locator('.ms-section .ms-provider-item').count()
  ev.assert('V9/全新实例供应商视图呈空态（未接入目录 route 不直出）', emptyMatrixShown, {
    expected: '空态标题（尚未接入 / 暂无可编辑）',
    actual: `title=${String(emptyTitle)} rows=${String(unconnectedRowCount)}`,
  })

  // V3/无串页：点宿主「模型」条目，宿主原生页渲染、插件页收起。
  if (!(await clickNav(page, '模型'))) {
    ev.degrade('宿主「模型」导航条目点不开', '核对宿主 nav 标签语言（模型/Models）后补候选')
    ev.attach('console.txt', recorder.text())
    return
  }
  const sectionCollapsed = !(await page.locator('.ms-section').isVisible().catch(() => false))
  const activeLabel = await activeNavLabel(page)
  ev.assert('V3/无串页：点宿主「模型」后插件页收起且高亮落在宿主条目', sectionCollapsed && activeLabel !== null && !activeLabel.includes('模型服务'), {
    expected: '.ms-section 不渲染 + active = 宿主「模型」',
    actual: `collapsed=${String(sectionCollapsed)} active=${String(activeLabel)}`,
  })
  ev.step({ step: 'v3.coexist', stats: { activeLabel } })

  // ── V1：接入全流程 ──────────────────────────────────────────────────────
  if (!(await clickNav(page, '模型服务'))) return
  // 添加供应商（引导卡与顶部按钮同一动作；取顶部 .ms-providers-actions 的主钮）。
  const addButtons = page.locator('.ms-section .ms-button-primary', { hasText: '添加供应商' })
  if (!(await addButtons.first().isVisible().catch(() => false))) {
    ev.degrade('「添加供应商」入口不可见（空态引导卡按钮与顶部按钮都没渲染？）',
      '核对 ProvidersView 的空态/按钮渲染分支与 locale 键 providers.emptyAddGuide')
    ev.attach('console.txt', recorder.text())
    return
  }
  // 添加流程第一步（选接入方式）：内置支 → pick-builtin 候选列表 → 窄表单断言后取消；
  // 随后走自定义支（全表单）完成 V1 的设置文档/凭据文件落盘断言。
  await addButtons.first().click()
  await page.waitForTimeout(300)
  const builtinCard = page.locator('.ms-section .ms-addflow-card', { hasText: '内置' })
  if (!(await builtinCard.isVisible().catch(() => false))) {
    ev.degrade('添加流程「接入方式」两卡未渲染（choose 步骤缺失？）',
      '核对 ProvidersView 的 addingStep 渲染分支与 locale 键 addflow.builtinTitle/addflow.customTitle')
    ev.attach('console.txt', recorder.text())
    return
  }
  await builtinCard.click()
  await page.waitForTimeout(300)
  const candidateCount = await page.locator('.ms-section .ms-addflow-item').count()
  ev.assert('V1/添加流程内置支：候选列表列出内置目录中未接入条目', candidateCount > 0, {
    expected: 'ms-addflow-item > 0（全新 home 全部内置条目未接入）',
    actual: String(candidateCount),
  })
  await page.locator('.ms-section .ms-addflow-item .ms-button', { hasText: '接入' }).first().click()
  await page.waitForTimeout(300)
  const narrowBody = page.locator('.ms-edit-body').first()
  const narrowNoteVisible = await narrowBody.locator('.ms-narrow-note').isVisible().catch(() => false)
  const endpointFieldAbsent = !(await narrowBody.locator('.ms-field', { hasText: 'API 端点' }).isVisible().catch(() => false))
  const protocolFieldAbsent = !(await narrowBody.locator('.ms-field', { hasText: '协议' }).isVisible().catch(() => false))
  const narrowPasswordVisible = await narrowBody.locator('input[type="password"]').first().isVisible().catch(() => false)
  ev.assert('V1/窄表单（内置目录型）：说明条在场、端点与协议编辑面不存在、密钥输入在场',
    narrowNoteVisible && endpointFieldAbsent && protocolFieldAbsent && narrowPasswordVisible, {
      expected: 'narrow-note + 密钥输入在场；端点/协议 ms-field 缺席',
      actual: `note=${String(narrowNoteVisible)} endpointAbsent=${String(endpointFieldAbsent)} protocolAbsent=${String(protocolFieldAbsent)} password=${String(narrowPasswordVisible)}`,
    })
  await narrowBody.locator('.ms-button', { hasText: '取消' }).first().click()
  await page.waitForTimeout(300)

  // 自定义支：全表单创建（端点/协议/显示名手动填写）。
  await openCustomAddForm(page)

  const fillField = async (label, value) => {
    const field = page.locator('.ms-edit-body .ms-field', { hasText: label }).first()
    await field.locator('input').fill(value)
  }
  await fillField('显示名称', providerName)
  await fillField('API 端点', 'http://127.0.0.1:9/v1') // 不可达端点：保存写设置不需要网络可达
  await page.locator('.ms-edit-body input[type="password"]').first().fill(secretValue)

  // V1 步骤 4a：零模型保存被拒 + 指引文案（自定义 provider 空清单保存前置）。
  await page.locator('.ms-edit-body .ms-button-primary', { hasText: '保存并接入' }).first().click()
  await page.waitForTimeout(400)
  const blockedText = await page.locator('.ms-edit-body .ms-note-warn', { hasText: '至少添加一个模型' }).first().textContent().catch(() => null)
  ev.assert('V1/零模型保存前置：保存被拒并给「至少添加一个模型或先执行发现」指引', blockedText !== null, {
    expected: 'models.saveBlockedEmpty 文案渲染',
    actual: String(blockedText),
  })

  // 手动添加一条模型后保存。
  await page.locator('.ms-edit-body .ms-button', { hasText: '手动添加模型' }).first().click()
  await page.waitForTimeout(200)
  // 模型卡新交互锚点：空白草案默认 = 上下文 1M 档（1048576）+ 支持思考勾选（产品默认，可改）。
  const contextDefault = await page.locator('.ms-model-edit-context').first().inputValue().catch(() => null)
  const thinkingDefault = await page.locator('.ms-model-edit-thinking-wrap input[type="checkbox"]').first().isChecked().catch(() => false)
  ev.assert('V1/模型卡空白草案默认：上下文 1M 档 + 支持思考勾选', contextDefault === '1048576' && thinkingDefault === true, {
    expected: "select value='1048576' + checkbox checked",
    actual: `context=${String(contextDefault)} thinking=${String(thinkingDefault)}`,
  })
  await page.locator('.ms-model-edit-id').first().fill('verify-model')
  await page.locator('.ms-model-edit-name').first().fill('Verify Model')
  await page.locator('.ms-edit-body .ms-button-primary', { hasText: '保存并接入' }).first().click()
  const savedVisible = await waitFor(async () =>
    page.locator('.ms-edit-body .ms-note-ok', { hasText: '已保存' }).isVisible().catch(() => false))
  ev.assert('V1/保存成功回执（已保存提示）', savedVisible, { expected: 'ms-note-ok「已保存」', actual: String(savedVisible) })

  // V1 步骤 5：设置文档出现 providers.<key>，apiKeyEnv 是 ref 名、无明文密钥。
  const patchWritten = await waitFor(() => existsSync(patchFile) && readFileSync(patchFile, 'utf8').includes(`  ${providerKey}:`), 8000)
  const patchText = patchWritten ? readFileSync(patchFile, 'utf8') : ''
  ev.assert('V1/设置文档写入 providers.<key>（provider key 为 ASCII kebab）', patchText.includes(`providers:`) && patchWritten, {
    expected: `cordis.patch.yml 的 llm-pi-ai 行出现 ${providerKey}`,
    actual: patchWritten ? '已写入' : '8s 内未出现',
  })
  ev.assert('V1/apiKeyEnv 为 ref 名', patchText.includes(`${credentialRef}`), {
    expected: credentialRef,
    actual: patchWritten ? 'ref 名在文档' : '文档未写入',
  })

  // V1 步骤 6：凭据文件出现对应 ref（先设置后凭据的两处落盘均完成）。
  const credWritten = await waitFor(() => existsSync(credentialsFile) && readFileSync(credentialsFile, 'utf8').includes(credentialRef), 8000)
  ev.assert('V1/凭据文件写入 ref（credentials.set 落盘）', credWritten, {
    expected: `.credentials.yaml 出现 ${credentialRef}`,
    actual: credWritten ? '已写入' : '8s 内未出现',
  })

  // V1/热重算不重启（RL2）：页面无 reload（注入标记存活）+ 宿主「模型」分区可见该供应商
  // （宿主模型分区读 pi-ai 目录——目录已含新 provider 即热重算完成的可观察事实）。
  await page.evaluate(() => { window.__verifyNoReload = true })
  const hostSeesProvider = await (async () => {
    if (!(await clickNav(page, '模型'))) return false
    const seen = await page.locator('[data-shortcut-modal="settings"]', { hasText: providerName }).first().isVisible().catch(() => false)
    await clickNav(page, '模型服务')
    return seen
  })()
  const markerAlive = await page.evaluate(() => window.__verifyNoReload === true)
  ev.assert('V1/宿主「模型」分区可见插件创建的供应商（热重算，无需重启）', hostSeesProvider, {
    expected: '宿主模型分区出现该供应商（V1 步骤 9）',
    actual: String(hostSeesProvider),
  })
  ev.assert('V1/断言期间页面未重载（无重启路径）', markerAlive, { expected: '注入标记存活', actual: String(markerAlive) })

  // ── V1 步骤 11 / RL3：conflict → 重读重试一次成功，双方改动保留 ────────────
  // 写者一（page）：展开体保持打开——重新进入分区后再次展开同一供应商。
  await page.locator('.ms-provider-item', { hasText: providerName }).first().locator('.ms-button', { hasText: '编辑' }).first().click()
  await page.waitForTimeout(300)
  // 写者二（第二个 web 连接，同一宿主进程）：改显示名并保存成功（revision 前移）。
  const second = await page.context().newPage()
  let secondSaved = false
  try {
    await second.goto(page.url(), { waitUntil: 'domcontentloaded' })
    await bootInto(second)
    if (await openSettings(second)) {
      if (await clickNav(second, '模型服务')) {
        await second.locator('.ms-provider-item', { hasText: providerName }).first().locator('.ms-button', { hasText: '编辑' }).first().click()
        await second.waitForTimeout(300)
        const renamed = `${providerName}-b`
        await second.locator('.ms-edit-body .ms-field', { hasText: '显示名称' }).first().locator('input').fill(renamed)
        await second.locator('.ms-edit-body .ms-button-primary', { hasText: '保存并接入' }).first().click()
        secondSaved = await waitFor(() =>
          second.locator('.ms-edit-body .ms-note-ok', { hasText: '已保存' }).isVisible().catch(() => false), 8000)
        ev.assert('V1-11/第二写者保存成功（revision 前移）', secondSaved, { expected: '第二客户端改名保存成功', actual: String(secondSaved) })
      }
    }
  } finally {
    await second.close().catch(() => {})
  }

  // 写者一（展开体仍打开、持有的 revision 已过期）：加一条模型后保存 → conflict → 自动重试。
  await page.locator('.ms-edit-body .ms-button', { hasText: '手动添加模型' }).first().click()
  await page.waitForTimeout(200)
  await page.locator('.ms-model-edit-id').nth(1).fill('verify-model-2')
  await page.locator('.ms-model-edit-name').nth(1).fill('Verify Model 2')
  await page.locator('.ms-edit-body .ms-button-primary', { hasText: '保存并接入' }).first().click()
  // 等待条件必须是「保存回执」本体（已保存）：自定义清单态的「目录默认已被替换」ms-note-warn
  // 常显，不带 hasText 的回执等待会在保存仍在飞行时首查即真，后续读文档与写入竞态（假红）。
  const retrySaved = await waitFor(async () =>
    page.locator('.ms-edit-body .ms-note-ok, .ms-edit-body .ms-note-warn', { hasText: '已保存' }).first().isVisible().catch(() => false), 10000)
  ev.assert('V1-11/冲突后保存有终态回执（自动重读重试，无需手工干预）', retrySaved, {
    expected: '保存回执（成功或凭据警告）在 10s 内出现',
    actual: String(retrySaved),
  })
  const patchAfterConflict = readFileSync(patchFile, 'utf8')
  const renameKept = patchAfterConflict.includes(`${providerName}-b`)
  const modelKept = patchAfterConflict.includes('verify-model-2')
  ev.assert('V1-11/双方改动均保留（改名 + 新模型条目）', renameKept && modelKept, {
    expected: '设置文档同时含第二写者改名与第一写者新模型',
    actual: `rename=${String(renameKept)} model=${String(modelKept)}`,
  })
  ev.step({ step: 'v1.conflictRetry', stats: { secondSaved, renameKept, modelKept } })

  // ── V4：密钥零泄漏 + 保存链路顺序 ────────────────────────────────────────
  // 设置文档与插件 Config 行无密钥字面（凭据文件持密钥是权威语义，不在扫描范围）。
  const patchLeak = patchAfterConflict.includes(secretValue)
  ev.assert('V4/设置文档零密钥字面（只有 ref 名）', !patchLeak, {
    expected: 'cordis.patch.yml 不含 sk-verify-… 明文',
    actual: patchLeak ? '命中明文（泄漏）' : '零命中',
  })

  // 同名供应商二次保存 → route 预检拒绝 + 设置文档零写入（检查点顺序的可自动化部分）。
  if (!(await clickNav(page, '模型服务'))) return
  await openCustomAddForm(page)
  await page.locator('.ms-edit-body .ms-field', { hasText: '显示名称' }).first().locator('input').fill(providerName)
  await page.locator('.ms-edit-body .ms-field', { hasText: 'API 端点' }).first().locator('input').fill('http://127.0.0.1:9/v1')
  await page.locator('.ms-edit-body .ms-button', { hasText: '手动添加模型' }).first().click()
  await page.waitForTimeout(200)
  await page.locator('.ms-model-edit-id').first().fill('dup-model')
  await page.locator('.ms-edit-body .ms-button-primary', { hasText: '保存并接入' }).first().click()
  await page.waitForTimeout(600)
  const routeRefusal = await page.locator('.ms-edit-body .ms-note-err', { hasText: '同名' }).first().isVisible().catch(() => false)
  ev.assert('V4/provider key 撞已注册 route：预检拒绝保存并提示改名', routeRefusal, {
    expected: 'refused-route 文案（save.refTakenRoute）',
    actual: String(routeRefusal),
  })
  const dupNotWritten = !readFileSync(patchFile, 'utf8').includes('dup-model')
  ev.assert('V4/预检拒绝时设置文档零写入', dupNotWritten, {
    expected: 'dup-model 不出现在文档',
    actual: String(dupNotWritten),
  })
  // 收起拒绝的展开体，不把草稿留在界面。
  await page.locator('.ms-edit-body .ms-button', { hasText: '取消' }).first().click().catch(() => {})

  // ── V4 步骤 9（b 支）：直改凭据文件写入无引用者 ref → 保存被拒 + 跨 profile 占用文案 ──
  // RL10 补建项：b 支判定只看凭据文件存在性与本 profile apiKeyEnv 枚举（决策 7 查重句），
  // 「直接编辑凭据文件」正是本场景已具备的通道（credentialsFile 直读直写）。宿主凭据服务
  // 带文件 watcher（运行中热加载，debounce 100ms）——无需重启宿主，设计 RL10 的「重启后
  // 加载」探针前提以更强形态成立。a 支（宿主「模型」分区创建 taiji-* 路由供应商录密钥）
  // 需宿主分区创建表单的自动化构造，本场景未建立，notProvable 登记（见下方）。
  const lonelyName = `verify-lonely-${stamp}`
  const lonelyKey = deriveKey(lonelyName)
  const lonelyRef = `TAIJI_${lonelyKey.replace(/-/g, '_').toUpperCase()}_KEY`
  ev.step({ step: 'v4.refCheckB', stats: { lonelyName, lonelyKey, lonelyRef } })
  appendCredentialRef(credentialsFile, lonelyRef, `sk-lonely-${stamp}`)
  await page.waitForTimeout(1500) // watcher 热加载（debounce 100ms + awaitWriteFinish）留足裕量
  await openCustomAddForm(page)
  await page.locator('.ms-edit-body .ms-field', { hasText: '显示名称' }).first().locator('input').fill(lonelyName)
  await page.locator('.ms-edit-body .ms-field', { hasText: 'API 端点' }).first().locator('input').fill('http://127.0.0.1:9/v1')
  // 输入密钥（触发保存链路的凭据查重环节）；provider key 与已注册 route 不同名，不触发预检，
  // 保证拒绝只能来自凭据查重（V4 步骤 9 的 b 支构造前提）。
  await page.locator('.ms-edit-body input[type="password"]').first().fill(`sk-lonely-${stamp}-value`)
  await page.locator('.ms-edit-body .ms-button', { hasText: '手动添加模型' }).first().click()
  await page.waitForTimeout(200)
  await page.locator('.ms-model-edit-id').first().fill('lonely-model')
  await page.locator('.ms-edit-body .ms-button-primary', { hasText: '保存并接入' }).first().click()
  const refTakenB = await waitFor(async () =>
    page.locator('.ms-edit-body .ms-note-err', { hasText: '其他 profile' }).first().isVisible().catch(() => false), 8000)
  ev.assert('V4 步骤 9 b 支/凭据 ref 撞无引用者 ref：保存被拒并出现跨 profile 占用提示', refTakenB, {
    expected: 'save.refTakenB 文案（可能来自其他 profile 的同名供应商）',
    actual: String(refTakenB),
  })
  const lonelyNotWritten = !readFileSync(patchFile, 'utf8').includes(`  ${lonelyKey}:`)
  ev.assert('V4 步骤 9 b 支/查重拒绝时设置文档零写入', lonelyNotWritten, {
    expected: `providers.${lonelyKey} 不出现在文档`,
    actual: String(lonelyNotWritten),
  })
  // 更换显示名后重试成功（派生 ref 不再撞名——拒绝是查重而非通道故障的反证）。
  await page.locator('.ms-edit-body .ms-field', { hasText: '显示名称' }).first().locator('input').fill(`${lonelyName}-b`)
  await page.locator('.ms-edit-body .ms-button-primary', { hasText: '保存并接入' }).first().click()
  const lonelySaved = await waitFor(async () =>
    page.locator('.ms-edit-body .ms-note-ok', { hasText: '已保存' }).isVisible().catch(() => false), 8000)
  ev.assert('V4 步骤 9 b 支/更换显示名后重试成功', lonelySaved, {
    expected: '保存成功回执（已保存提示）',
    actual: String(lonelySaved),
  })
  // 收尾：删除重试创建的供应商、移除直改写入的 ref（场景自清洁；后续断言不受残留影响）。
  await page.locator('.ms-edit-body .ms-button', { hasText: '取消' }).first().click().catch(() => {})
  const lonelyItem = page.locator('.ms-provider-item', { hasText: `${lonelyName}-b` }).first()
  await lonelyItem.locator('.ms-button', { hasText: '删除供应商' }).first().click()
  await page.waitForTimeout(300)
  await lonelyItem.locator('.ms-button', { hasText: '再点确认删除' }).first().click()
  await waitFor(() => !readFileSync(patchFile, 'utf8').includes(`  ${lonelyKey}-b:`), 8000)
  removeCredentialRef(credentialsFile, lonelyRef)

  ev.notProvable('V4 步骤 9 a 支（本 profile 持有者的撞名文案）：需在宿主「模型」分区经其创建表单写入 taiji-* 路由供应商并录密钥，宿主分区表单的自动化选择器勘察未建立（非通道缺失，是构造未建立），归 D3 真机复验；a 支判定分支由 credentials-client 单测覆盖')
  ev.notProvable('V4 步骤 6（unset 失败 → 待清理清单重试）：需让凭据服务在删除动作时不可用，自动构造超出本场景通道；重试机制由 credentials-client 单测覆盖')

  // V9：模型清单操作台——分组组头 / 来源 chip / 行内编辑写路径 / 目录默认组复制到自定义清单。
  await page.locator('.ms-section .ms-viewbar-button', { hasText: '模型清单' }).first().click()
  // 视图就绪等待（四层拼装含宿主 IPC，冷启动首读偶发秒级抖动——固定 sleep 会把抖动放大成
  // fill 硬超时；就绪锚点 = 工具行（筛选输入 + 来源 chip），loading 态不渲染它）。
  await page.waitForSelector('.ms-models-toolbar', { state: 'visible', timeout: 20000 })
  const customGroup = page.locator('.ms-model-group', { hasText: providerName }).first()
  const customGroupVisible = await customGroup.isVisible().catch(() => false)
  const customBadge = await customGroup.locator('.ms-badge', { hasText: '自定义清单' }).first().textContent().catch(() => null)
  ev.assert('V9/分组组头渲染（自定义组：供应商名 + 来源徽章 + 清单态徽章）', customGroupVisible && customBadge !== null, {
    expected: 'ms-model-group（verify-<stamp>）+「自定义清单 · N 个」徽章',
    actual: `group=${String(customGroupVisible)} badge=${String(customBadge)}`,
  })
  // 关键词筛选空态（既有 V9 步骤 5 语义保留）。
  await page.locator('.ms-models-filter').first().fill('不存在的模型名')
  await page.waitForTimeout(300)
  const filterEmpty = await page.locator('.ms-empty-title', { hasText: '没有匹配' }).first().isVisible().catch(() => false)
  ev.assert('V9/关键词筛选无结果空态（含筛选词）', filterEmpty, { expected: '没有匹配「…」的模型', actual: String(filterEmpty) })
  const clearVisible = await page.locator('.ms-empty .ms-button', { hasText: '清除筛选' }).first().isVisible().catch(() => false)
  await page.locator('.ms-empty .ms-button', { hasText: '清除筛选' }).first().click().catch(() => {})
  ev.assert('V9/筛选空态给清除动作且可点', clearVisible, { expected: '清除筛选按钮', actual: String(clearVisible) })

  // 来源筛选 chip：目录默认 chip 下自定义组退场，「全部」复位。
  await page.locator('.ms-source-chip', { hasText: '目录默认' }).first().click()
  const customHiddenByChip = await waitFor(async () => !(await customGroup.isVisible().catch(() => false)), 4000)
  ev.assert('V9/来源筛选 chip（目录默认）下自定义组隐藏', customHiddenByChip, {
    expected: '自定义组退场',
    actual: String(customHiddenByChip),
  })
  await page.locator('.ms-source-chip', { hasText: '全部' }).first().click()
  await waitFor(async () => customGroup.isVisible().catch(() => false), 4000)

  // 行内编辑写路径（writeProviderModels 整段写回）：编辑行 → 改显示名 → 保存 → patch models[] 出现新名。
  await customGroup.locator('.ms-button', { hasText: '编辑' }).first().click()
  await page.waitForTimeout(300)
  await page.locator('.ms-model-row-edit .ms-model-edit-name').first().fill('Verify Model Renamed')
  await page.locator('.ms-model-row-edit .ms-button-primary', { hasText: '保存' }).first().click()
  const renamedInPatch = await waitFor(() => readFileSync(patchFile, 'utf8').includes('Verify Model Renamed'), 8000)
  ev.assert('V9/行内编辑保存（writeProviderModels 整段写回落盘）', renamedInPatch, {
    expected: 'patch 的 providers 段出现改名后的条目（Verify Model Renamed）',
    actual: renamedInPatch ? '已写入' : '8s 内未出现',
  })

  // 目录默认组 + 复制到自定义清单：接入一个内置目录供应商且不写模型（models[] 缺席 = 目录
  // 默认态），组头徽章「目录默认 · N 个（只读）」+「自定义此清单」动作；复制首行 = 整体替换
  // 语义（toast 注明「目录默认已被替换」+ 组徽章翻转自定义清单 + patch 写入该条目）。
  await page.locator('.ms-section .ms-viewbar-button', { hasText: '供应商' }).first().click()
  await page.waitForTimeout(300)
  const builtinCardAgain = page.locator('.ms-section .ms-button-primary', { hasText: '添加供应商' })
  if (!(await builtinCardAgain.first().isVisible().catch(() => false))) return
  await builtinCardAgain.first().click()
  await page.waitForTimeout(300)
  if (!(await page.locator('.ms-section .ms-addflow-card', { hasText: '内置' }).first().isVisible().catch(() => false))) return
  await page.locator('.ms-section .ms-addflow-card', { hasText: '内置' }).first().click()
  await page.waitForTimeout(300)
  const builtinItem = page.locator('.ms-addflow-item').first()
  const builtinDisplayName = (await builtinItem.textContent().catch(() => ''))?.trim() ?? ''
  await builtinItem.locator('.ms-button', { hasText: '接入' }).first().click()
  await page.waitForTimeout(300)
  // 窄表单零填写保存 = 目录默认态（端点/协议/清单由目录解析；保存空清单即保持目录默认）。
  await page.locator('.ms-edit-body .ms-button-primary', { hasText: '保存并接入' }).first().click()
  const builtinSaved = await waitFor(async () =>
    page.locator('.ms-edit-body .ms-note-ok, .ms-edit-body .ms-note-warn', { hasText: '已保存' }).first().isVisible().catch(() => false), 8000)
  ev.assert('V9/内置目录供应商零填写接入（目录默认态）', builtinSaved && builtinDisplayName !== '', {
    expected: '窄表单保存回执（目录默认保持）',
    actual: `saved=${String(builtinSaved)} name=${builtinDisplayName}`,
  })
  await page.locator('.ms-edit-body .ms-button', { hasText: '取消' }).first().click().catch(() => {})
  await page.locator('.ms-section .ms-viewbar-button', { hasText: '模型清单' }).first().click()
  await page.waitForTimeout(400)
  const dirGroup = page.locator('.ms-model-group', { hasText: builtinDisplayName }).first()
  const dirBadge = await dirGroup.locator('.ms-badge', { hasText: '目录默认' }).first().textContent().catch(() => null)
  const customizeVisible = await dirGroup.locator('.ms-button', { hasText: '自定义此清单' }).first().isVisible().catch(() => false)
  ev.assert('V9/目录默认组（组头徽章「目录默认 · N 个（只读）」+ 自定义此清单动作）', dirBadge !== null && customizeVisible, {
    expected: '目录默认徽章 + 自定义此清单按钮',
    actual: `badge=${String(dirBadge)} customize=${String(customizeVisible)}`,
  })
  await dirGroup.locator('.ms-button', { hasText: '复制到自定义清单' }).first().click()
  const replacedToast = await waitFor(async () =>
    page.locator('.ms-note-ok', { hasText: '目录默认已被替换' }).first().isVisible().catch(() => false), 6000)
  const dirBadgeFlipped = await waitFor(async () =>
    (await dirGroup.locator('.ms-badge', { hasText: '自定义清单' }).first().textContent().catch(() => null)) !== null, 6000)
  ev.assert('V9/复制到自定义清单（整体替换语义显式提示：toast + 组徽章翻转）', replacedToast && dirBadgeFlipped, {
    expected: '「目录默认已被替换」toast + 组徽章翻转为自定义清单',
    actual: `toast=${String(replacedToast)} badge=${String(dirBadgeFlipped)}`,
  })
  // 收尾：删除内置目录供应商（无密钥引用，删除即 unset 条目；恢复目录默认的干净底座）。
  await page.locator('.ms-section .ms-viewbar-button', { hasText: '供应商' }).first().click()
  await page.waitForTimeout(300)
  const builtinItemRow = page.locator('.ms-provider-item', { hasText: builtinDisplayName }).first()
  await builtinItemRow.locator('.ms-button', { hasText: '删除供应商' }).first().click()
  await page.waitForTimeout(300)
  await builtinItemRow.locator('.ms-button', { hasText: '再点确认删除' }).first().click()
  await waitFor(async () => !(await builtinItemRow.isVisible().catch(() => false)), 8000)

  // 宿主托管只读组：切回模型清单视图再断言（隔离实例未登录 DeepSeek 账号时目录可能没有
  // 托管行——存在才断言）。
  await page.locator('.ms-section .ms-viewbar-button', { hasText: '模型清单' }).first().click()
  await page.waitForSelector('.ms-models-toolbar', { state: 'visible', timeout: 20000 })
  const managedGroupVisible = await page.locator('.ms-model-group .ms-source-badge-managed').first().isVisible().catch(() => false)
  if (!managedGroupVisible) {
    ev.notProvable('V9/宿主托管 provider 只读组：隔离实例未配置宿主托管供应商（deepseek-account/official），目录无托管行；真机已登录实例复验')
  }

  // ── V4 步骤 4/5：删除供应商 → 条目与 ref 均清除（无孤儿密钥）────────────────
  if (!(await clickNav(page, '模型服务'))) return
  // 前段 V9 已切到模型清单视图；分区保持挂载时 nav 重击当前分区不重置内部视图——显式
  // 切回供应商视图再走删除流程。
  await page.locator('.ms-section .ms-viewbar-button', { hasText: '供应商' }).first().click().catch(() => {})
  await page.waitForTimeout(300)
  const item = page.locator('.ms-provider-item', { hasText: providerName }).first()
  await item.locator('.ms-button', { hasText: '删除供应商' }).first().click()
  await page.waitForTimeout(300)
  await item.locator('.ms-button', { hasText: '再点确认删除' }).first().click()
  const goneInPatch = await waitFor(() => !readFileSync(patchFile, 'utf8').includes(`  ${providerKey}:`), 8000)
  const refGone = await waitFor(() => !readFileSync(credentialsFile, 'utf8').includes(credentialRef), 8000)
  ev.assert('V4/删除后设置文档条目清除', goneInPatch, {
    expected: `providers.${providerKey} 从文档消失`,
    actual: String(goneInPatch),
  })
  ev.assert('V4/删除后凭据 ref 清除（无孤儿密钥）', refGone, {
    expected: `${credentialRef} 从凭据文件消失`,
    actual: String(refGone),
  })

  // ── M2 段：V5 路由卡工作台 / V6 对话流可见开关与悬挂 / V7 注册失败就地改名修复 ──
  // 断言范围（真机 D3 补全的部分逐条 notProvable 登记）：
  //  V5（步骤 1-2 派生 id 语义 + 步骤 9 G18 标注；步骤 10 需宿主「模型」分区删除表单自动化，
  //    归 D3）：路由视图空态 → 新建即配置（新卡就地命名，派生 id 落盘）→ 同名二次创建不被
  //    拒、派生 id 加序号区分 → 删第二条恢复 → 成员管线添加成员引用 m2 供应商（即时保存
  //    落盘 routes 段）→ 拖拽排序（把手 → 目标行，move 语义成员序翻转落盘）→ 删除成员供应商
  //    后成员行「供应商已删」标注。
  //  V6（步骤 1/2/3/5/6 的 Config 侧语义）：对话流可见开关（role=switch，白名单 checkbox 的
  //    语义化）勾选 → whitelist 落盘；取消 → 移除；恢复 → 重写；删除路由 → 白名单条目转悬挂
  //    （「路由已删除」标注 + 不自动清理）；批量清理只移除悬挂条目；空白名单 = 全不暴露
  //    （判定统一读 whitelist 段值域——readWhitelistEntries；对话流选择器侧归 D3）。
  //  V7（就地改名修复路径的可构造形态）：物理 provider 的 key 占用 taiji-route-p-1（自定义
  //    provider key 不拦该形态）→ 中文路由名派生 id p-1 撞宿主（DUPLICATE_ADAPTER）→ 卡头
  //    红徽 + 修复条 → 就地改名「验证路由2」（派生 p-2，不撞）→ 警告条退场（注册自动重试
  //    恢复）。探测侧的占用识别（快照 providers 段含 taiji-route-* 条目 = 物理占用）见
  //    route-store probeDerived；成员不可用的对话流真实报错归 D3。

  const m2ProviderName = `verify-m2-${stamp}`
  const m2ProviderKey = deriveKey(m2ProviderName)
  ev.step({ step: 'model-service.m2.setup', stats: { m2ProviderName, m2ProviderKey } })

  // M2 前置：创建一个供应商 + 两条模型（拖拽排序需要两个可分辨的成员；端点不可达不影响配置写入）。
  if (!(await clickNav(page, '模型服务'))) return
  await openCustomAddForm(page)
  await page.locator('.ms-edit-body .ms-field', { hasText: '显示名称' }).first().locator('input').fill(m2ProviderName)
  await page.locator('.ms-edit-body .ms-field', { hasText: 'API 端点' }).first().locator('input').fill('http://127.0.0.1:9/v1')
  await page.locator('.ms-edit-body .ms-button', { hasText: '手动添加模型' }).first().click()
  await page.waitForTimeout(200)
  await page.locator('.ms-model-edit-id').nth(0).fill('m2-model')
  await page.locator('.ms-model-edit-name').nth(0).fill('M2 Model')
  await page.locator('.ms-edit-body .ms-button', { hasText: '手动添加模型' }).first().click()
  await page.waitForTimeout(200)
  await page.locator('.ms-model-edit-id').nth(1).fill('m2-model-2')
  await page.locator('.ms-model-edit-name').nth(1).fill('M2 Model 2')
  await page.locator('.ms-edit-body .ms-button-primary', { hasText: '保存并接入' }).first().click()
  const m2Saved = await waitFor(() => readFileSync(patchFile, 'utf8').includes(`  ${m2ProviderKey}:`), 8000)
  ev.assert('M2 前置/供应商创建落盘', m2Saved, {
    expected: `cordis.patch.yml 出现 ${m2ProviderKey}`,
    actual: m2Saved ? '已写入' : '8s 内未出现',
  })

  /** 路由卡定位：按卡头派生 id 徽章全文匹配（路由名可能互为子串，徽章全文才是身份）。 */
  const routeCard = (id) => page.locator('.ms-route-card').filter({
    has: page.locator('.ms-badge-catalog', { hasText: new RegExp(`^${id}$`) }),
  }).first()

  /** 新建即配置（A3）：点「+ 新建路由」追加展开态新卡 → 卡头名点击就地改名 → Enter 提交。
   * 先等卡数自增再点卡头名（last() 在新卡未挂载时会点中既有卡——创建是 store 异步写）。 */
  const createAndNameRoute = async (name) => {
    const before = await page.locator('.ms-route-card').count()
    await page.locator('.ms-routes-actions .ms-button-primary', { hasText: '新建路由' }).first().click()
    await waitFor(async () => (await page.locator('.ms-route-card').count()) === before + 1, 6000)
    await page.locator('.ms-route-card .ms-route-name').last().click()
    await page.locator('.ms-route-name-input').first().fill(name)
    await page.locator('.ms-route-name-input').first().press('Enter')
    await waitFor(() => readFileSync(patchFile, 'utf8').includes(name), 6000)
    await page.waitForTimeout(300)
  }

  // V5 步骤 1 前半 + 空态矩阵：路由视图空态「还没有路由」。
  await page.locator('.ms-section .ms-viewbar-button', { hasText: '模型路由' }).first().click()
  await page.waitForTimeout(400)
  const routesEmpty = await page.locator('.ms-empty-title', { hasText: '还没有路由' }).first().isVisible().catch(() => false)
  ev.assert('V5/路由视图空态矩阵（无路由新建引导）', routesEmpty, {
    expected: 'routes.emptyNoRoutes 文案',
    actual: String(routesEmpty),
  })

  // V5 步骤 2：新建即配置（新卡就地命名）；同名二次创建不被拒、派生 id 加序号区分；删第二条恢复。
  await createAndNameRoute('verify-route')
  const firstRouteVisible = await routeCard('verify-route').isVisible().catch(() => false)
  ev.assert('V5/新建卡就地命名成功（卡渲染 + Config 落盘派生 id）', firstRouteVisible, {
    expected: 'ms-route-card（id 徽章 verify-route）',
    actual: String(firstRouteVisible),
  })
  await createAndNameRoute('verify-route')
  const routeCards = await page.locator('.ms-route-card').count()
  const secondIdVisible = await routeCard('verify-route-2').isVisible().catch(() => false)
  ev.assert('V5/同名路由二次创建不被拒：两条并存且派生 id 加序号区分（决策 5）', routeCards === 2 && secondIdVisible, {
    expected: '2 张卡，第二条 id = verify-route-2',
    actual: `cards=${String(routeCards)} secondId=${String(secondIdVisible)}`,
  })
  // 删第二条：切换选中（verify-route 卡编辑成员）→ verify-route-2 卡收起露卡脚 → 两段确认。
  await routeCard('verify-route').locator('.ms-button', { hasText: '编辑成员' }).first().click()
  await page.waitForTimeout(300)
  await routeCard('verify-route-2').locator('.ms-button', { hasText: '删除路由' }).first().click()
  await page.waitForTimeout(200)
  await routeCard('verify-route-2').locator('.ms-button', { hasText: '再点确认删除' }).first().click()
  await waitFor(() => !readFileSync(patchFile, 'utf8').includes('verify-route-2'), 6000)
  ev.step({ step: 'v5.derivedId', stats: { routeCards, secondIdVisible } })

  // V5 成员管线（即时保存语义）：verify-route 卡已选中 → 添加成员（默认 = 首个已接入供应商
  // 首模型）→ 第二个成员选 m2-model-2 → routes 段落盘。
  const routeBody = routeCard('verify-route').locator('.ms-route-card-body')
  await routeBody.locator('.ms-button', { hasText: '添加成员' }).first().click()
  await page.waitForTimeout(200)
  const providerSelect = routeBody.locator('.ms-select[aria-label="成员供应商"]').first()
  await providerSelect.selectOption({ label: m2ProviderName }).catch(async () => {
    // selectOption 按 label 兜底失败时按 value（provider key）再试。
    await providerSelect.selectOption(m2ProviderKey)
  })
  const routeSaved = await waitFor(() => readFileSync(patchFile, 'utf8').includes('m2-model'), 6000)
  ev.assert('V5/成员管线即时保存落盘（成员引用物理 provider/model）', routeSaved, {
    expected: '插件 Config routes 段出现成员 m2-model',
    actual: routeSaved ? '已写入' : '6s 内未出现',
  })
  await routeBody.locator('.ms-button', { hasText: '添加成员' }).first().click()
  await page.waitForTimeout(200)
  const modelSelect1 = routeBody.locator('.ms-select[aria-label="成员模型"]').nth(1)
  await modelSelect1.selectOption('m2-model-2').catch(() => {})
  await waitFor(() => readFileSync(patchFile, 'utf8').includes('m2-model-2'), 6000)

  // V5 拖拽排序（定稿 A2）：把手 → 目标行 dragTo，move 语义翻转成员序并即时落盘。
  const memberModelsBefore = readRouteMemberModels(readFileSync(patchFile, 'utf8'), 'verify-route')
  await routeBody.locator('.ms-drag-handle').first().dragTo(routeBody.locator('.ms-route-member-row').nth(1))
  const dragFlipped = await waitFor(() => {
    const models = readRouteMemberModels(readFileSync(patchFile, 'utf8'), 'verify-route')
    return models.length === 2 && models[0] === memberModelsBefore[1] && models[1] === memberModelsBefore[0]
  }, 6000)
  ev.assert('V5/成员拖拽排序落盘（move 语义翻转成员序）', dragFlipped, {
    expected: `成员序 ${JSON.stringify([memberModelsBefore[1], memberModelsBefore[0]])}`,
    actual: `before=${JSON.stringify(memberModelsBefore)} flipped=${String(dragFlipped)}`,
  })

  // V6 步骤 1：对话流可见开关（role=switch）勾选 → Config whitelist 落盘（SC8 权威语义）。
  const visibleSwitch = routeCard('verify-route').locator('input[role="switch"]').first()
  await visibleSwitch.check()
  // 判定对象 = whitelist 字段的值（readWhitelistEntries 提取）——全文件 includes('verify-route')
  // 会被 routes 段路由 id/name 结构性命中，勾没勾都绿，属无效验证。
  const whitelistWritten = await waitFor(() => (readWhitelistEntries(readFileSync(patchFile, 'utf8')) ?? []).includes('verify-route'), 6000)
  ev.assert('V6/对话流可见开关勾选落盘（whitelist 含 verify-route）', whitelistWritten, {
    expected: '插件 Config whitelist 段出现 verify-route',
    actual: String(whitelistWritten),
  })
  // 空态退场是异步 UI 更新：与本场景其余断言一致走 waitFor 轮询，不即时读一次 DOM。
  const emptyMatrixGone = await waitFor(async () => {
    const emptyVisible = await page.locator('.ms-empty-title', { hasText: '已配置路由，但白名单还没有勾选' }).first().isVisible().catch(() => false)
    return !emptyVisible
  }, 6000)
  ev.assert('V6/有路由未勾可见开关的空态指向在勾选后消失', emptyMatrixGone, {
    expected: 'routes.emptyNotWhitelisted 空态退场',
    actual: String(emptyMatrixGone),
  })

  // V6 步骤 2/3：取消 → whitelist 移除；重新勾选 → 恢复（Config 侧启停语义）。
  await visibleSwitch.uncheck()
  const whitelistCleared = await waitFor(() => {
    const entries = readWhitelistEntries(readFileSync(patchFile, 'utf8'))
    return entries !== null && !entries.includes('verify-route')
  }, 6000)
  ev.assert('V6/取消对话流可见即从白名单移除（Config 侧）', whitelistCleared, {
    expected: 'whitelist 不再含 verify-route',
    actual: String(whitelistCleared),
  })
  // 重新勾选（AF-1-1 纵深加固）：先等 UI 呈现上一步取消的真值（isChecked()=false）再点
  // ——弹回窗口内开关仍是勾选态时 check() 对已勾选元素立即返回不点击（playwright check()
  // 官方契约），写入静默丢失；消除对 UI 同步时序的隐式依赖，防 no-op 回归。
  const uncheckedSettled = await waitFor(async () => !(await visibleSwitch.isChecked().catch(() => false)), 6000)
  ev.assert('V6/重新勾选前 UI 已呈现未勾选态（取消在界面生效）', uncheckedSettled, {
    expected: 'switch isChecked() = false',
    actual: String(uncheckedSettled),
  })
  await visibleSwitch.check()
  // 勾选后确认落盘：不等落盘就进后续删除流程会让悬挂断言吃进写入竞态。
  const whitelistRestored = await waitFor(() => (readWhitelistEntries(readFileSync(patchFile, 'utf8')) ?? []).includes('verify-route'), 6000)
  ev.assert('V6/重新勾选落盘（whitelist 恢复含 verify-route）', whitelistRestored, {
    expected: 'whitelist 恢复含 verify-route',
    actual: String(whitelistRestored),
  })

  // V7：注册失败就地改名修复（可构造形态 = 物理 provider 占用 taiji-route-p-1）。
  // 先建占用供应商：自定义全表单，显示名 taiji-route-p-1（派生 key 即占用形态）+ 一条模型。
  if (!(await clickNav(page, '模型服务'))) return
  await page.locator('.ms-section .ms-viewbar-button', { hasText: '供应商' }).first().click().catch(() => {})
  await page.waitForTimeout(300)
  await openCustomAddForm(page)
  await page.locator('.ms-edit-body .ms-field', { hasText: '显示名称' }).first().locator('input').fill('taiji-route-p-1')
  await page.locator('.ms-edit-body .ms-field', { hasText: 'API 端点' }).first().locator('input').fill('http://127.0.0.1:9/v1')
  await page.locator('.ms-edit-body .ms-button', { hasText: '手动添加模型' }).first().click()
  await page.waitForTimeout(200)
  await page.locator('.ms-model-edit-id').first().fill('squat-model')
  await page.locator('.ms-edit-body .ms-button-primary', { hasText: '保存并接入' }).first().click()
  const squatSaved = await waitFor(() => readFileSync(patchFile, 'utf8').includes('  taiji-route-p-1:'), 8000)
  ev.assert('V7/占用供应商落盘（物理 provider key = taiji-route-p-1）', squatSaved, {
    expected: 'providers.taiji-route-p-1 出现在设置文档（taiji-route-* 适配器被物理 provider 占用）',
    actual: squatSaved ? '已写入' : '8s 内未出现',
  })

  // 中文路由名 → 派生 id p-1（deriveProviderKey 非 ASCII 序号回落）→ 撞占用 → 注册失败。
  await page.locator('.ms-section .ms-viewbar-button', { hasText: '模型路由' }).first().click()
  await page.waitForTimeout(400)
  await createAndNameRoute('验证路由')
  // 卡头红徽 + 修复条是异步探测派生（注册链路 volatile-update + store 探测 RPC），走 waitFor。
  const failedRoute = routeCard('p-1')
  const fixStripShown = await waitFor(async () =>
    failedRoute.locator('.ms-route-fix').isVisible().catch(() => false), 10000)
  const failedBadgeShown = await failedRoute.locator('.ms-badge-missing', { hasText: '注册失败' }).first().isVisible().catch(() => false)
  ev.assert('V7/派生 id 撞宿主：卡头红徽（注册失败）+ 卡内修复条（原因 + 恢复指引 + 就地改名）', fixStripShown && failedBadgeShown, {
    expected: 'route.registrationFailed 文案 + 注册失败徽章 + ms-route-fix 在场',
    actual: `fix=${String(fixStripShown)} badge=${String(failedBadgeShown)}`,
  })

  // 就地改名修复：修复条内输入新名（验证路由2 → 派生 p-2，不撞占用）→ 改名并重试 →
  // 白名单迁移 + 注册自动重试 → 警告条退场。
  await page.locator('.ms-route-fix input').first().fill('验证路由2')
  await page.locator('.ms-route-fix .ms-button', { hasText: '改名并重试' }).first().click()
  const fixedRoute = routeCard('p-2')
  const fixStripGone = await waitFor(async () => {
    const cardVisible = await fixedRoute.isVisible().catch(() => false)
    const stripVisible = await fixedRoute.locator('.ms-route-fix').isVisible().catch(() => false)
    return cardVisible && !stripVisible
  }, 10000)
  ev.assert('V7/就地改名后警告条退场（新 id 重派生 + 注册自动重试恢复）', fixStripGone, {
    expected: '卡以新 id p-2 在场且修复条退场',
    actual: String(fixStripGone),
  })

  // V7 收尾清理：删除占用供应商与改名路由（不带走 whitelist 底座——p-2 路由未勾选）。
  await page.locator('.ms-section .ms-viewbar-button', { hasText: '供应商' }).first().click()
  await page.waitForTimeout(300)
  const squatItem = page.locator('.ms-provider-item', { hasText: 'taiji-route-p-1' }).first()
  await squatItem.locator('.ms-button', { hasText: '删除供应商' }).first().click()
  await page.waitForTimeout(300)
  await squatItem.locator('.ms-button', { hasText: '再点确认删除' }).first().click()
  await waitFor(() => !readFileSync(patchFile, 'utf8').includes('  taiji-route-p-1:'), 8000)
  await page.locator('.ms-section .ms-viewbar-button', { hasText: '模型路由' }).first().click()
  await page.waitForTimeout(300)
  // p-2 卡当前是选中态（改名后跟随选中）——先切换选中态收起它（点自身编辑成员 = toggle 收起），
  // 卡脚的删除路由入口才在场；两段确认删除。
  await fixedRoute.locator('.ms-button', { hasText: '编辑成员' }).first().click()
  await page.waitForTimeout(300)
  await fixedRoute.locator('.ms-button', { hasText: '删除路由' }).first().click()
  await page.waitForTimeout(200)
  await fixedRoute.locator('.ms-button', { hasText: '再点确认删除' }).first().click()
  await waitFor(() => !readFileSync(patchFile, 'utf8').includes('验证路由2'), 6000)

  // V5 步骤 9（G18）：删除成员供应商 → 路由成员行「供应商已删」标注（白名单条目转悬挂见 V6 步骤 4）。
  await page.locator('.ms-section .ms-viewbar-button', { hasText: '供应商' }).first().click()
  await page.waitForTimeout(300)
  const m2Item = page.locator('.ms-provider-item', { hasText: m2ProviderName }).first()
  await m2Item.locator('.ms-button', { hasText: '删除供应商' }).first().click()
  // 删除前警告断言（D3 接线：requestDelete 经 routeReferencesOf 计算 → 确认区列出受影响路由；
  // 该删除是场景内唯一被路由引用供应商的删除点，verify-route 成员在成员管线已引用 m2 供应商）。
  const routeWarnVisible = await waitFor(async () => {
    const warn = m2Item.locator('.ms-note-warn', { hasText: '被路由引用' }).first()
    const visible = await warn.isVisible().catch(() => false)
    const text = visible ? await warn.textContent().catch(() => '') : ''
    return visible && (text ?? '').includes('verify-route')
  }, 6000)
  ev.assert('V5 步骤 9/删除前路由引用警告（确认区列出 verify-route）', routeWarnVisible, {
    expected: '确认区 ms-note-warn「被路由引用（verify-route）」',
    actual: String(routeWarnVisible),
  })
  await m2Item.locator('.ms-button', { hasText: '再点确认删除' }).first().click()
  await waitFor(() => !readFileSync(patchFile, 'utf8').includes(`  ${m2ProviderKey}:`), 8000)
  await page.locator('.ms-section .ms-viewbar-button', { hasText: '模型路由' }).first().click()
  // 标注是异步探测派生（route-store 探测面：删除供应商 → 宿主 document-updated 广播 → 镜像
  // 重读 → store 重读 + 探测 RPC 完成才有数据），与本场景其余断言一致走 waitFor 轮询——
  // 固定 600ms 后单次读 DOM 在删除传播链偏慢时假红（a-model-service-20261111230104 实测：
  // 删除前警告 waitFor 轮询 6s 内绿，徽章在固定 600ms 处缺席）。
  const providerMissingBadge = await waitFor(async () =>
    page.locator('.ms-route-member-row .ms-badge-missing', { hasText: '供应商已删' }).first().isVisible().catch(() => false), 6000)
  ev.assert('V5 步骤 9/成员行可用性标注（供应商已删，G18）', providerMissingBadge, {
    expected: 'ms-badge-missing「供应商已删」（成员管线行内常显）',
    actual: String(providerMissingBadge),
  })

  // V6 步骤 4 前半：删除唯一白名单路由 → 白名单条目转悬挂（「路由已删除」标注，不自动清理）。
  // verify-route 卡在此前未选中（V7 收尾只动 p-2 卡）——卡脚删除入口直接在场。
  const verifyCard = routeCard('verify-route')
  await verifyCard.locator('.ms-button', { hasText: '删除路由' }).first().click()
  await page.waitForTimeout(200)
  await verifyCard.locator('.ms-button', { hasText: '再点确认删除' }).first().click()
  await waitFor(async () => {
    const visible = await page.locator('.ms-hanging .ms-badge-missing', { hasText: '路由已删除' }).first().isVisible().catch(() => false)
    return visible
  }, 6000)
  const hangingVisible = await page.locator('.ms-hanging .ms-badge-missing', { hasText: '路由已删除' }).first().isVisible().catch(() => false)
  ev.assert('V6/删除路由后白名单条目转悬挂（标注「路由已删除」，不自动清理）', hangingVisible, {
    expected: '悬挂标注（ms-hanging）',
    actual: String(hangingVisible),
  })

  // V6 步骤 5：批量清理失效条目（只移除悬挂条目）→ Config whitelist 清空。
  await page.locator('.ms-section .ms-button', { hasText: '清理失效条目' }).first().click()
  const hangingCleared = await waitFor(async () => {
    const visible = await page.locator('.ms-hanging').first().isVisible().catch(() => false)
    return !visible
  }, 6000)
  ev.assert('V6/批量清理失效条目（悬挂清空）', hangingCleared, {
    expected: '悬挂区退场',
    actual: String(hangingCleared),
  })

  // V6 步骤 6 前半：空白名单 = 全不暴露（Config whitelist 空断言；对话流选择器侧归 D3）。
  // 提取统一走 readWhitelistEntries（值域判定），不再各自内联 split。
  const blankWhitelist = await waitFor(() => {
    const entries = readWhitelistEntries(readFileSync(patchFile, 'utf8'))
    return entries !== null && entries.length === 0
  }, 6000)
  ev.assert('V6/空白名单 = 全不暴露（Config whitelist 空）', blankWhitelist, {
    expected: 'whitelist 无路由条目',
    actual: String(blankWhitelist),
  })

  // V7 可达子集收尾：对话流真实报错需真实端点，归 D3（注册失败形态已按上方可构造路径覆盖）。
  ev.notProvable('V7 步骤 1-5（成员不可用的对话流具体失败 + 物理模型对照）：发消息需要真实可用端点，归 D3 真机；成员不可用的机制终结形态由 index.test.ts 假上游单测覆盖（ROUTE_MEMBER_UNAVAILABLE 保留原始码与 cause）')

  ev.attach('console.txt', recorder.text())
}
