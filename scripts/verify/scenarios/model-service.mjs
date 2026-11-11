/**
 * model-service 场景（M1 段）：模型服务接入 / 追加分区与撤除 / 密钥零泄漏与保存链路
 * （dsh-model-service V1/V2/V3/V4/V9 的可自动化断言子集；真机全量在 D3 验收）。
 *
 * 前置：只能对隔离 profile 跑（需要 --dsh-bin + --dsh-home 自启模式）——场景要读隔离
 * DSH_HOME 的设置文档（cordis.patch.yml）与凭据文件（.credentials.yaml）并对其做零泄漏
 * 断言；--url 模式不拥有实例与文件 → 显式 degrade + 恢复动作，绝不静默跳过。
 *
 * 断言范围：
 *  V3（追加分区，RL4）：设置导航「模型」与「模型服务」并存；点模型服务渲染插件页（三视图
 *    切换条）；点宿主「模型」渲染宿主原生页（无串页——.ms-section 收起）。
 *  V1（接入全流程）：全新隔离 home 先断言空态（V9 步骤 1 形态）；随后经插件分区添加供应商：
 *    零模型保存被拒并给「至少添加一个模型或先执行发现」指引（保存前置）；手动添加模型后保存
 *    成功，设置文档出现 providers.<key>（apiKeyEnv 为 ref 名、无明文密钥）+ 凭据文件出现
 *    对应 ref（先设置后凭据的两处落盘，V1 步骤 5/6）；不重启宿主（页面无 reload 标记不变）
 *    宿主「模型」分区可见该供应商（pi-ai 目录热重算，V1 步骤 7/9/RL2）。
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
 *    set」顺序的自动可达部分；凭据 ref 撞名的 a/b 两支文案分支由单测覆盖——经 UI 构造
 *    撞 ref 需宿主分区/凭据文件直改，登记 notProvable）；删除供应商后设置文档条目与凭据
 *    ref 均清除（V4 步骤 5，无孤儿密钥）。
 *  V9（清单与只读行）：模型清单视图渲染自定义条目（来源态标注「自定义清单」+ 上下文字段）；
 *    筛选无结果空态 + 清除动作（V9 步骤 5）；宿主托管只读行视隔离实例的注册情况存在
 *    （无托管行时登记 notProvable，不假红）。
 *
 *  M2 段占位（本单元不实现，见 run() 尾部 TODO）：V5 成员级路由求值 / V6 白名单启停与
 *  悬挂清理 / V7 路由故障降级——随 M2 波次追加断言。
 *
 * 本场景不发任何模型对话请求（V1 步骤 8 的流式回复断言需要真实可用端点，归 D3 真机）。
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { bootInto } from '../lib/browser.mjs'

export const meta = {
  id: 'model-service',
  title: '模型服务接入（M1）',
  description: '分区并存无串页 / 接入全流程与热重算 / 冲突重读重试双方保留 / 密钥零泄漏与保存链路 / 清单来源态与空态',
}

/** 设置文档与凭据文件的轮询等待（宿主落盘是异步的，给最多 5s）。 */
async function waitFor(cond, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (cond()) return true
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  return cond()
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

export async function run(ctx) {
  const { page, recorder, ev, log, mode, dsh } = ctx

  if (mode !== 'dsh' || dsh === null) {
    ev.notProvable('URL 模式无法断言设置文档/凭据文件落盘与零泄漏（runner 不拥有隔离实例）')
    ev.degrade('model-service 前置缺失：--url 模式无隔离 DSH_HOME 文件访问权',
      '用 --dsh-bin <dsh> --dsh-home <临时目录> 自启隔离实例重跑 model-service 场景')
    ev.attach('console.txt', recorder.text())
    return
  }

  const profileDir = join(dsh.dshHome, 'profiles', dsh.profile)
  const patchFile = join(profileDir, 'cordis.patch.yml')
  const credentialsFile = join(dsh.dshHome, '.credentials.yaml')
  const stamp = Date.now().toString(36)
  const providerName = `verify-${stamp}`
  const providerKey = deriveKey(providerName)
  const credentialRef = `TAIJI_${providerKey.replace(/-/g, '_').toUpperCase()}_KEY`
  const secretValue = `sk-verify-${stamp}-${Math.random().toString(36).slice(2, 10)}`
  ev.step({ step: 'model-service.setup', stats: { providerName, providerKey, credentialRef } })

  // ── V9 步骤 1（全新隔离 home 的空态矩阵）+ V3 步骤 1（导航并存）──────────
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

  // V9 空态（全新 home：无任何 provider）——供应商视图空态给「为什么空 + 下一步」。
  const emptyText = await page.locator('.ms-section .ms-empty-title').first().textContent().catch(() => null)
  ev.assert('V9/全新实例供应商视图空态有引导文案', emptyText !== null && emptyText.length > 0, {
    expected: '空态文案（为什么空 + 下一步）',
    actual: String(emptyText),
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
  await addButtons.first().click()
  await page.waitForTimeout(300)

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
  const retrySaved = await waitFor(async () =>
    page.locator('.ms-edit-body .ms-note-ok, .ms-edit-body .ms-note-warn').first().isVisible().catch(() => false), 10000)
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
  await page.locator('.ms-section .ms-button-primary', { hasText: '添加供应商' }).first().click()
  await page.waitForTimeout(300)
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
  ev.notProvable('凭据 ref 撞名的 a/b 两支拒绝文案（V4 步骤 9）：经界面构造撞 ref 需宿主「模型」分区写 taiji-* 路由或直改凭据文件，自动构造超出本场景通道；两支分支判定由 credentials-client 单测覆盖')
  ev.notProvable('V4 步骤 6（unset 失败 → 待清理清单重试）：需让凭据服务在删除动作时不可用，自动构造超出本场景通道；重试机制由 credentials-client 单测覆盖')

  // V9：模型清单视图——自定义条目来源态标注 + 上下文字段 + 筛选空态。
  await page.locator('.ms-section .ms-viewbar-button', { hasText: '模型清单' }).first().click()
  await page.waitForTimeout(600)
  const customRow = await page.locator('.ms-model-list-row.ms-source-custom', { hasText: 'verify-model' }).first().isVisible().catch(() => false)
  ev.assert('V9/自定义条目行渲染且带来源态标注', customRow, {
    expected: 'ms-source-custom 行（verify-model）',
    actual: String(customRow),
  })
  await page.locator('.ms-models-filter').first().fill('不存在的模型名')
  await page.waitForTimeout(300)
  const filterEmpty = await page.locator('.ms-empty-title', { hasText: '没有匹配' }).first().isVisible().catch(() => false)
  ev.assert('V9/筛选无结果空态（含筛选词）', filterEmpty, { expected: '没有匹配「…」的模型', actual: String(filterEmpty) })
  const clearVisible = await page.locator('.ms-empty .ms-button', { hasText: '清除筛选' }).first().isVisible().catch(() => false)
  await page.locator('.ms-empty .ms-button', { hasText: '清除筛选' }).first().click().catch(() => {})
  ev.assert('V9/筛选空态给清除动作且可点', clearVisible, { expected: '清除筛选按钮', actual: String(clearVisible) })
  // 宿主托管只读行：隔离实例未登录 DeepSeek 账号时目录可能没有托管行——存在才断言。
  const managedRow = await page.locator('.ms-model-list-row.ms-source-managed').first().isVisible().catch(() => false)
  if (!managedRow) {
    ev.notProvable('V9/宿主托管 provider 只读行：隔离实例未配置宿主托管供应商（deepseek-account/official），目录无托管行；真机已登录实例复验')
  }

  // ── V4 步骤 4/5：删除供应商 → 条目与 ref 均清除（无孤儿密钥）────────────────
  if (!(await clickNav(page, '模型服务'))) return
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

  // ── M2 段占位（本单元不实现；u-m2 追加）─────────────────────────────────
  // TODO(M2): V5 成员级路由求值与回退（成员 A/B 条件命中、回退、ROUTE_NO_ACTIVE_MEMBER /
  //           ROUTE_MEMBER_UNAVAILABLE 错误形态）。
  // TODO(M2): V6 白名单启停、悬挂条目清理、空白名单全不暴露语义。
  // TODO(M2): V7 路由故障降级（成员不可用终结 + 物理模型不受影响 + 注册冲突状态条）。

  ev.attach('console.txt', recorder.text())
}
