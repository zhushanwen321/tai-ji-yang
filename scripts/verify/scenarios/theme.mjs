/**
 * theme 场景：配色切换（六色覆盖层 + 持久通道的真实验收）。
 *
 * 路径：composer 快速配色 chip（client/input/appearance-chip.tsx）优先——boot 后空会话
 * 即可见，不需要导航设置页；chip 不可达时尝试设置页外观行
 * （client/settings/appearance-row.tsx），再不可达 = 显式 degrade + 恢复动作。
 *
 * 断言范围：
 *  - 按当前解析支选同族非当前色 → --dsw-alias-brand-primary 解析值变化（覆盖层真换表）
 *  - reload 后仍所选色（持久通道 = 插件 Config volatile，跨会话事实）
 *  - 恢复进入前选中态（测试不把复用实例留在目标色，也不覆盖用户原选色）
 *
 * 不写宿主主题偏好、不触发明暗模式（领域边界：明暗归宿主）。不发模型请求。
 */
import { bootInto, collectAppearance } from '../lib/browser.mjs'

export const meta = {
  id: 'theme',
  title: '配色切换与持久',
  description: 'chip/外观行切换配色 → token 换表 → reload 后持久 → 恢复默认',
}

/** 默认色与各明暗支的候选目标：只选与当前解析支不同列的族内目标，防跨族回落造成假红。 */
const DEFAULT_NAME = '玄'
const TARGET_CANDIDATES = {
  light: ['青墨', '朱印'],
  dark: ['黛蓝', '暖墨'],
}

export async function run(ctx) {
  const { page, recorder, ev, log } = ctx

  const baseline = await collectAppearance(page)
  ev.step({ step: 'theme.collect', stats: { chip: baseline.chipVisible, row: baseline.rowPresent, brandPrimary: baseline.brandPrimaryResolved } })

  // 判定默认基线：当前色可能已是默认玄（隔离新 profile 的常态），也可能是别的色（复用实例）。
  // 场景只要求「切到目标色 → 变化 → 持久 → 回默认」，基线值动态取。
  const before = baseline.brandPrimaryResolved
  if (before === undefined || before === '') {
    ev.degrade('读取不到 --dsw-alias-brand-primary 解析值（token 覆盖层未生效或宿主无该 token）',
      '确认目标实例装了本包且品牌栈在场（brand 场景先过）；核对宿主 theme token 清单')
    return
  }

  // 打开配色入口
  let opened = false
  if (baseline.chipVisible) {
    await page.locator('.taiji-appearance-chip').first().click().catch(() => {})
    await page.waitForTimeout(300)
    opened = await page.locator('.taiji-appearance-chip-palette').isVisible().catch(() => false)
    if (!opened) ev.step({ step: 'theme.chip.open', exitCode: 1, stats: { reason: 'chip 点击后色卡未弹出' } })
  }
  if (!opened && baseline.rowPresent && baseline.rowSwatchCount >= 6) {
    ev.step({ step: 'theme.path', stats: { path: 'settings-row' } })
    opened = true // 外观行 swatch 直接可见，无需开层
  }
  if (!opened) {
    ev.degrade('配色入口不可达（composer chip 不可见且设置页外观行未就绪）',
      '确认页面处于空会话态（chip 在 composer 工具行）；或手动进入设置页后用 --url 模式重跑')
    return
  }

  // 六色入口齐备（chip 以弹层后的实际 swatch 数为准，设置行以既有行断言数为准）
  const swatchCount = baseline.chipVisible
    ? await page.locator('.taiji-appearance-chip-swatch').count()
    : baseline.rowSwatchCount
  ev.assert('六色配色入口齐备', swatchCount === 6, { expected: '6', actual: String(swatchCount) })

  // 当前选中态：chip 弹层里的 aria-pressed 是唯一可见事实；读不到时回落默认玄。
  const activeName = baseline.chipVisible
    ? (await page.locator('.taiji-appearance-chip-swatch[aria-pressed="true"]').first()
      .getAttribute('aria-label').catch(() => null)) ?? DEFAULT_NAME
    : (await page.locator('.taiji-appearance-swatch[aria-pressed="true"]').first()
      .locator('.taiji-appearance-swatch-name').textContent().catch(() => null)) ?? DEFAULT_NAME
  const scheme = baseline.colorScheme === 'dark' ? 'dark' : 'light'
  // 只在同族候选里选一个非当前色：跨族色在另一解析支会回落默认值，断言会假红。
  const targetName = TARGET_CANDIDATES[scheme].find((name) => name !== activeName) ?? TARGET_CANDIDATES[scheme][0]
  const restoreName = activeName
  ev.step({ step: 'theme.target', stats: { scheme, activeName, targetName, restoreName } })

  // 点目标色 swatch
  let targetClicked = false
  let restored = false
  try {
    targetClicked = opened && baseline.chipVisible
      ? await page.locator(`.taiji-appearance-chip-swatch[aria-label="${targetName}"]`).first().click().catch(() => false) !== false
      : await page.locator('.taiji-appearance-swatch', { hasText: targetName }).first().click().catch(() => false) !== false
    if (!targetClicked) {
      ev.degrade(`目标色「${targetName}」swatch 点击失败（色卡结构变化？）`,
        '核对 client/input/appearance-chip.tsx 的 swatch aria-label 与实际宿主渲染；必要时人工驱动')
      return
    }
    await page.waitForTimeout(500)
    const afterSwitch = await collectAppearance(page)
    ev.step({ step: 'theme.switch', stats: { targetClicked, brandPrimary: afterSwitch.brandPrimaryResolved } })
    ev.assert('切换后 brand-primary 解析值变化（覆盖层换表）', afterSwitch.brandPrimaryResolved !== before, {
      expected: `≠ ${before}`,
      actual: String(afterSwitch.brandPrimaryResolved),
    })

    // 持久：reload 后仍所选色
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    await bootInto(page)
    const afterReload = await collectAppearance(page)
    ev.step({ step: 'theme.reload', stats: { brandPrimary: afterReload.brandPrimaryResolved } })
    ev.assert('reload 后仍所选配色（插件 Config 持久通道）', afterReload.brandPrimaryResolved === afterSwitch.brandPrimaryResolved, {
      expected: String(afterSwitch.brandPrimaryResolved),
      actual: String(afterReload.brandPrimaryResolved),
    })
  } finally {
    // 从点中目标色起，失败路径也必须恢复进入前选中态，不把复用实例的原选色覆盖掉。
    if (targetClicked) {
      if (baseline.chipVisible) {
        await page.locator('.taiji-appearance-chip').first().click().catch(() => {})
        await page.waitForTimeout(300)
        restored = await page.locator(`.taiji-appearance-chip-swatch[aria-label="${restoreName}"]`).first().click().catch(() => false) !== false
      }
      if (!restored && baseline.rowPresent) {
        restored = await page.locator('.taiji-appearance-swatch', { hasText: restoreName }).first().click().catch(() => false) !== false
      }
      await page.waitForTimeout(500)
    }
  }
  if (targetClicked) {
    const finalState = await collectAppearance(page)
    ev.step({ step: 'theme.restore', exitCode: restored ? 0 : 1, stats: { restored, brandPrimary: finalState.brandPrimaryResolved } })
    ev.assert('恢复进入前配色（brand-primary 回基线）', finalState.brandPrimaryResolved === before, {
      expected: String(before),
      actual: String(finalState.brandPrimaryResolved),
    })
  }

  await ev.shot(page, 'theme')
  ev.attach('console.txt', recorder.text())
  log('theme 场景完成')
}
