/**
 * 页面侧 doctor 检查（run.mjs 与 doctor CLI 共用）：URL 活性 / 装配 / 控制台清洁。
 * 库形态：不启动任何进程、不开浏览器——页面与实例由调用方给。
 */
import { collectBrand } from './browser.mjs'
import { probeUrl } from './dsh-process.mjs'
import { redactToken } from './args.mjs'

/**
 * URL 活性检查。
 * @param {string} url
 * @returns {Promise<{ name: string, ok: boolean, detail: string }>}
 */
export async function checkUrlLiveness(url) {
  const probe = await probeUrl(url)
  return {
    name: 'url-liveness',
    ok: probe.ok,
    detail: probe.ok ? `HTTP ${probe.status}` : `${probe.reason}（${redactToken(url)}）`,
  }
}

/**
 * 页面装配检查：品牌栈 + 壳信息 global（Node 半场注入证据）。
 * @param {import('playwright').Page} page - 已 boot 的页面。
 * @param {string} expectedVersion - 本包 package.json 版本（壳信息 version 段对照）。
 * @returns {Promise<{ checks: { name: string, ok: boolean, detail: string }[], brand: object }>}
 */
export async function checkPageAssembly(page, expectedVersion) {
  const brand = await collectBrand(page)
  const checks = [
    {
      name: 'assembly: 品牌栈在场（浏览器半场装配完成）',
      ok: brand.stackText !== null,
      detail: brand.stackText === null ? '页面无 .taiji-brand-stack（半场未物化或装错 profile）' : String(brand.stackText).slice(0, 60),
    },
    {
      name: 'assembly: 壳信息 global 在场（Node 半场注入）',
      ok: brand.shellInfo !== null && typeof brand.shellInfo.version === 'string' && brand.shellInfo.version !== '',
      detail: brand.shellInfo === null ? 'globalThis.__TAIJI_SHELL_INFO__ 缺席（注入行未生效）' : `version=${brand.shellInfo.version} dshVersion=${brand.shellInfo.dshVersion ?? '(缺席)'}`,
    },
    {
      name: 'assembly: 壳信息 version 与本包版本一致',
      ok: brand.shellInfo !== null && brand.shellInfo.version === expectedVersion,
      detail: `expected v${expectedVersion} actual ${brand.shellInfo?.version ?? '(缺席)'}`,
    },
  ]
  return { checks, brand }
}

/**
 * 控制台清洁检查：无 Slot 崩溃。
 * @param {{ slotCrashes(): { kind: string, level: string, text: string }[] }} recorder
 * @returns {{ name: string, ok: boolean, detail: string }}
 */
export function checkConsoleClean(recorder) {
  const crashes = recorder.slotCrashes()
  return {
    name: 'console-clean: 无 Slot 崩溃',
    ok: crashes.length === 0,
    detail: crashes.length === 0 ? '无错误级控制台输出' : crashes.slice(0, 5).map((c) => c.text.slice(0, 200)).join(' | '),
  }
}
