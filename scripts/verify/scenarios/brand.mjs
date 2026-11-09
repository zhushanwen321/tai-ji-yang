/**
 * brand 场景：打开即认得出是太极（README 的第一层承诺）。
 *
 * 断言范围（依据本仓源码）：
 *  - 侧栏品牌栈在场：产品名文案 = locale 的 brand.name（太极 / TaiJi）
 *    —— client/brand/name.tsx 渲染 .taiji-brand-stack / .taiji-brand-name
 *  - 版本行：`v{本包} · dsh v{宿主}`；宿主版本解析不到时降级只显 `v{本包}`（合法形态，
 *    登记 deviation 不判 fail——README「已登记」的降级路径）；版本行不得裁切
 *  - 壳信息 global（__TAIJI_SHELL_INFO__）在场，version 段 = package.json 版本
 *  - hero 首屏品牌区在场（空会话态；有会话态 hero 本就不渲染，此时登记不判错）
 *  - 无 Slot 崩溃
 *
 * 证据：品牌栈截图 + 控制台全量附件。
 */
import { collectBrand } from '../lib/browser.mjs'

export const meta = {
  id: 'brand',
  title: '品牌区与版本行',
  description: '侧栏品牌栈 / 版本行 / hero 首屏 / 壳信息注入 / 无 Slot 崩溃',
}

export async function run(ctx) {
  const { page, recorder, ev, log, packageVersion } = ctx
  const brand = await collectBrand(page)
  ev.step({ step: 'brand.collect', stats: { stackText: brand.stackText, shellInfo: brand.shellInfo } })

  // ① 品牌栈在场
  ev.assert('品牌栈在场（浏览器半场装配可见信号）', brand.stackText !== null, {
    expected: '.taiji-brand-stack 渲染',
    actual: brand.stackText === null ? '缺席' : String(brand.stackText).slice(0, 60),
  })
  if (brand.stackText === null) {
    ev.degrade('品牌栈缺席：浏览器半场未物化（装错 profile / lib 缺失 / 宿主静默跳过）',
      '确认目标实例装的是 web 承载 profile（README「profile 适用性」），并看宿主日志有无 client bundle 缺失')
    return
  }

  // ② 产品名
  ev.assert('产品名文案 = 太极 / TaiJi', brand.nameText === '太极' || brand.nameText === 'TaiJi', {
    expected: '太极 | TaiJi',
    actual: String(brand.nameText),
  })

  // ③ 壳信息 global：Node 半场注入证据
  ev.assert('壳信息 global 在场且 version = 本包版本', brand.shellInfo !== null && brand.shellInfo.version === packageVersion, {
    expected: `version=${packageVersion}`,
    actual: brand.shellInfo === null ? '__TAIJI_SHELL_INFO__ 缺席' : `version=${brand.shellInfo.version}`,
  })

  // ④ 版本行：`v{本包} · dsh v{宿主}`；宿主版本缺席 = 登记降级（合法路径，不假 pass 不误报）
  const versionRe = new RegExp(`^v${packageVersion.replace(/\./g, '\\.')}(?: · dsh v[^v].*)?$`)
  const versionOk = brand.versionText !== null && versionRe.test(String(brand.versionText).trim())
  ev.assert('版本行文案 v{本包}[ · dsh v{宿主}]', versionOk, {
    expected: `v${packageVersion} 或 v${packageVersion} · dsh v<宿主>`,
    actual: brand.versionText === null ? '版本行缺席' : String(brand.versionText),
  })
  if (versionOk && (brand.shellInfo?.dshVersion === undefined || brand.shellInfo?.dshVersion === null)) {
    ev.degrade('宿主版本解析缺席，品牌栈降级只显本包版本（合法路径，但与预期「CLI/桌面形态能解析」不符）',
      '查宿主日志的壳信息注入；确认 dsh 安装形态（npm 全局 / 桌面应用）')
  }
  ev.assert('版本行不被裁切', brand.versionClipped === false || brand.versionText === null, {
    expected: 'scrollHeight <= clientHeight',
    actual: String(brand.versionClipped),
  })

  // ⑤ hero 首屏品牌区（空会话态；有会话态本就不渲染）
  const hasSessionRows = await page.locator('.taiji-pb-row').count() > 0
  if (brand.heroPresent) {
    ev.assert('hero 首屏品牌区在场', true, { expected: '空会话首屏渲染 .taiji-hero-area', actual: '在场' })
  } else if (hasSessionRows) {
    ev.degrade('hero 未出现且页面已有会话（hero 只在空会话首屏渲染）',
      '用全新隔离 profile（无会话态）重跑 brand 场景以覆盖 hero 断言')
  } else {
    ev.assert('hero 首屏品牌区在场（空会话态）', false, {
      expected: '.taiji-hero-area 渲染',
      actual: '空会话态但 hero 缺席（检查 hero 槽注册与优先级避让日志）',
    })
  }

  // ⑥ 无 Slot 崩溃
  const crashes = recorder.slotCrashes()
  ev.assert('无 Slot 崩溃', crashes.length === 0, {
    expected: '0 条错误级控制台输出',
    actual: crashes.length === 0 ? '0 条' : crashes.slice(0, 3).map((c) => c.text.slice(0, 160)).join(' | '),
  })

  // 证据：品牌栈区域截图（侧栏左上）+ 控制台
  await ev.shot(page, 'brand', { clip: { x: 0, y: 0, width: 320, height: 240 } })
  await ev.shot(page, 'brand-full')
  ev.attach('console.txt', recorder.text())
  log('brand 场景完成')
}
