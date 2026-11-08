#!/usr/bin/env node
/**
 * RL5 静态自检：每个包浏览器半场产物 `lib/client.js` 里的 `require("…")` 字面量集合 ⊆ 宿主
 * 模块表基线。多包适配（设计 D10）：包清单来自 scripts/workspace-packages.mjs，逐包审计
 * 同一基线（宿主模块表是仓级契约，各包共用）。
 *
 * 为什么需要这条断言（设计 AS7 / D1 / D3）：宿主只 seed 11 个平台模块（`PLATFORM_MODULES`）。
 * bundle 里任何超出这 11 项、又没在 `dsh.client.external` 声明并有供给方的 require，组合期直接
 * 被拒（或运行时解析失败）。本仓裁决为「零 npm 运行时依赖」，因此基线就是全部合法取值。
 *
 * 为什么用「解析产物」而不是「扫源码」：源码里的 import 会经打包器重写成别的形态（内联 / 改名 /
 * interop 包装），只有产物里的 require 才是最终向宿主发出的请求。扫产物同样能覆盖到打包器
 * 引入的间接 require（如 jsx runtime 的 interop 辅助）。
 *
 * 三种输入状态（设计缺口补丁，见 ledger D1 第二轮裁决 7）：
 *   ① 产物缺失 —— 浏览器半场源入口尚未落盘的包。此时给出可行动失败信息并**显式标注
 *      「未执行检查」**（不冒充通过）；`--strict` 或 `CHECK_STRICT=1` 下以失败退出，供后续 Gate 强制。
 *   ② 产物存在且合规 —— exit 0。
 *   ③ 产物存在但有基线外 require / 非字面量 require —— exit 1。
 *
 * 负样本自证（每次运行都跑，与目标是否存在无关）：合成一份含基线外 require 的假产物，断言它
 * 被拒；再合成一份合规产物与非字面量 require，断言两边判定都正确。这样「断言恒绿」的空检查
 * 形态会被自己抓出来。
 *
 * 只依赖 node 内置模块。退出码 0 = 通过（或目标缺失且非严格模式），1 = 至少一项失败。
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { workspacePackages, WORKSPACE_ROOT } from './workspace-packages.mjs'

/**
 * 宿主冻结模块表基线（11 项，AS7 实证：`packages/client/web/src/platform.ts` 的 PLATFORM_MODULES）。
 * 这是本仓与宿主之间唯一的模块契约，也是 `scripts/build-client.mjs` 的 external 清单唯一来源。
 * 增删必须先改宿主侧事实，不接受「先加一项试试」。
 */
export const BASELINE_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  'zod',
  '@tanstack/react-virtual',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

const LITERAL_REQUIRE_RE = /require\s*\(\s*(?:"([^"\n]*)"|'([^'\n]*)')\s*\)/g
const REQUIRE_CALL_RE = /\brequire\s*\(/g

/**
 * 解析产物文本，收集 require 请求。
 * 非字面量 require（`require(name)` / 拼接过）无法静态判定目标，一律记为违规——基线断言
 * 的前提是「请求在构建期已知」，绕过它的写法等于把裁决权交给运行时。
 */
export function auditBundle(source) {
  const literals = []
  for (const match of source.matchAll(LITERAL_REQUIRE_RE)) literals.push(match[1] ?? match[2])

  const calls = [...source.matchAll(REQUIRE_CALL_RE)].length
  const nonLiteralCount = calls - literals.length

  const unique = [...new Set(literals)].sort()
  const outsideBaseline = unique.filter((name) => !BASELINE_MODULES.includes(name))
  const violations = []
  if (outsideBaseline.length > 0) {
    violations.push(
      `产物 require 了宿主模块表基线之外的字面量: ${outsideBaseline.join(', ')}`,
    )
  }
  if (nonLiteralCount > 0) {
    violations.push(
      `产物含 ${nonLiteralCount} 处非字面量 require（目标在构建期不可判定，基线断言无法成立）`,
    )
  }
  return { literals: unique, outsideBaseline, calls, nonLiteralCount, violations }
}

const NEGATIVE_SAMPLES = [
  {
    id: '基线外 require',
    text: 'window.__ModuleLoader__.load({ id: "sample", factory: (require) => { const lodash = require("lodash"); return require("react"); } });',
    expect: ['lodash'],
  },
  {
    id: '非字面量 require',
    text: 'window.__ModuleLoader__.load({ id: "sample", factory: (require) => { return require(computedName); } });',
    expect: ['非字面量'],
  },
]

const POSITIVE_SAMPLE = [
  'window.__ModuleLoader__.load({ id: "sample", factory: (require) => {',
  '  const runtime = require("react/jsx-runtime");',
  '  const store = require("@deepseek-ai/dsh-client-store");',
  '  return { runtime, store };',
  '} });',
].join('\n')

/** 负样本自证：证明「基线外 / 非字面量」两类违规真的会被拒，且合规产物不会被误报。 */
function selfTestFailures() {
  const failures = []
  for (const sample of NEGATIVE_SAMPLES) {
    const result = auditBundle(sample.text)
    if (result.violations.length === 0) {
      failures.push(`负样本「${sample.id}」未被拒绝，说明基线断言失效`)
      continue
    }
    const joined = result.violations.join(' ')
    for (const needle of sample.expect) {
      if (!joined.includes(needle)) failures.push(`负样本「${sample.id}」的失败信息缺少「${needle}」定位`)
    }
  }
  const positive = auditBundle(POSITIVE_SAMPLE)
  if (positive.violations.length > 0) {
    failures.push(`合规样本被误报: ${positive.violations.join(' / ')}`)
  }
  return failures
}

function isStrict() {
  return process.argv.includes('--strict') || process.env.CHECK_STRICT === '1'
}

function main() {
  const strict = isStrict()
  let hardFailures = 0
  let skippedMissing = 0

  const failures = selfTestFailures()
  if (failures.length > 0) {
    console.error('✘ 负样本自证失败（基线断言本身不可信）:')
    for (const failure of failures) console.error(`  - ${failure}`)
    process.exitCode = 1
    return
  }
  console.log('✔ 负样本自证：基线外 require 与非字面量 require 均被拒绝，合规样本无误报')

  for (const pkg of workspacePackages()) {
    const pkgLabel = pkg.dir === '.' ? pkg.name : pkg.dir
    const bundlePath = join(WORKSPACE_ROOT, pkg.dir, 'lib', 'client.js')

    if (!existsSync(bundlePath)) {
      skippedMissing += 1
      const lines = [
        `⚠ [${pkgLabel}] 未执行检查（目标缺失，本次不构成通过）: ${join(pkg.dir, 'lib', 'client.js')} 不存在`,
        `   该产物由 node scripts/build-client.mjs 生成，其入口 ${pkg.clientEntry} 尚未落盘`,
        `   补齐路径: 落盘 ${pkg.clientEntry} → 执行 node scripts/build-client.mjs → 再跑本脚本`,
        '   负样本自证已通过（规则本身可信），但正向断言没有被执行过——不要把这一行读成「检查通过」',
        `   当前模式: ${strict ? 'strict（目标缺失即失败，退出码 1）' : 'lenient（默认；目标缺失时退出码 0 但显式播报缺口）'}`,
      ]
      console.warn(lines.join('\n'))
      if (strict) hardFailures += 1
      continue
    }
    if (!statSync(bundlePath).isFile()) {
      console.error(`✘ [${pkgLabel}] ${bundlePath} 不是普通文件`)
      hardFailures += 1
      continue
    }
    const source = readFileSync(bundlePath, 'utf8')
    if (source.trim() === '') {
      console.error(`✘ [${pkgLabel}] ${join(pkg.dir, 'lib', 'client.js')} 为空文件，不是有效产物`)
      hardFailures += 1
      continue
    }

    const result = auditBundle(source)
    if (result.violations.length > 0) {
      console.error(`✘ [${pkgLabel}] ${join(pkg.dir, 'lib', 'client.js')} 的 require 集合越过宿主模块基线:`)
      for (const violation of result.violations) console.error(`  - ${violation}`)
      console.error(`  基线: ${BASELINE_MODULES.join(', ')}`)
      console.error('  依据: 设计 AS7 / D1 / D3——宿主只 seed 11 个平台模块，超出即需 dsh.client.external 供给方。')
      hardFailures += 1
      continue
    }
    console.log(
      `✔ [${pkgLabel}] require 字面量全部落在宿主模块基线内（${result.literals.length} 项: ${result.literals.join(', ') || '无'}）`,
    )
  }

  if (hardFailures > 0) {
    console.error(`\n基线检查失败 ${hardFailures} 项${strict && skippedMissing > 0 ? `（含 ${skippedMissing} 个缺失目标——strict 模式下缺失即失败）` : ''}`)
    process.exitCode = 1
    return
  }
  console.log(`\n基线检查完成（${workspacePackages().length} 个包${skippedMissing > 0 ? `，${skippedMissing} 个目标缺失已显式播报` : ''}）`)
}

const selfHref = pathToFileURL(resolve(process.argv[1] ?? '')).href
if (import.meta.url === selfHref) main()
