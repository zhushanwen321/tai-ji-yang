#!/usr/bin/env node
/**
 * 一键自检入口：六个静态断言 + 真实构建 + 全仓单测，串成一条命令。
 *
 * 为什么需要这个文件（而不是把六条命令写进 package.json 的 scripts）：本包的
 * 自检集横跨「构建产物」（lib/client.js）与「仓库存量」（client/*、index.js），
 * 需要固定的执行顺序——先静态断言（快、失败早）、再构建（产出被检对象）、
 * 最后跑单测（含对构建产物的引用）。顺序写在这里可以被测试与文档直接引用，
 * 写进 package.json 的 scripts 段则要拆成三条并靠调用方记住次序。
 *
 * 与各单项脚本的关系：单项脚本（check-*.mjs）是「谁产生谁写」的资产，归属各自
 * 单元；本文件只是编排，不含任何断言逻辑——断言只此一处，避免两处维护漂移。
 *
 * 用法：
 *   node scripts/check-all.mjs            全跑
 *   node scripts/check-all.mjs --static   只跑六个静态断言（不构建、不跑单测）
 *   node scripts/check-all.mjs --skip-build 跳过构建（用仓库存量 lib/ 作被检对象）
 *
 * 退出码：0 = 全部通过；1 = 至少一项失败（失败项逐个打到 stderr，末尾给汇总）。
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const args = process.argv.slice(2)
const staticOnly = args.includes('--static')
const skipBuild = args.includes('--skip-build')

/** 静态断言六项：按「先 manifest（最基础）→ 运行期约束 → 被检对象」排列。 */
const STATIC_CHECKS = [
  'check-manifest.mjs',
  'check-no-host-deps.mjs',
  'check-injection-escape.mjs',
  'check-require-baseline.mjs',
  'check-forbidden-tokens.mjs',
  'check-profile-probe.mjs',
]

/** 构造一条子进程调用；shell: false 避免把路径当 shell 语法解释。 */
function run(label, scriptArgs) {
  const r = spawnSync(process.execPath, scriptArgs, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  const code = r.status === null ? -1 : r.status
  const out = (r.stdout ?? '') + (r.stderr ?? '')
  return { label, code, out }
}

const results = []
function report({ label, code, out }) {
  const mark = code === 0 ? '✔' : '✘'
  console.log(`${mark} ${label}${code === 0 ? '' : ` (exit ${code})`}`)
  if (code !== 0 && out.trim()) {
    // 失败项的输出原样透出：归因需要看具体是哪一条断言红，不是只看汇总
    console.log(out.trimEnd().split('\n').map((l) => `    ${l}`).join('\n'))
  }
  results.push({ label, code })
}

// ── 1. 静态断言 ────────────────────────────────────────────────
console.log('── 静态断言 ─────────────────────────────')
for (const s of STATIC_CHECKS) {
  report({ label: `scripts/${s}`, ...run(s, [join('scripts', s)]) })
}

// ── 2. 真实构建 ────────────────────────────────────────────────
// 构建放在静态断言之后：check-require-baseline 的被检对象就是构建产物。
// 若 lib/ 已存在且传了 --skip-build，则用存量产物（D2/D3 复审时避免重复构建）。
if (!staticOnly && !skipBuild) {
  console.log('── 构建 ─────────────────────────────────')
  report({ label: 'scripts/build-client.mjs', ...run('build', [join('scripts', 'build-client.mjs')]) })
} else if (!staticOnly && skipBuild) {
  const hasArtifact = existsSync(join(root, 'lib', 'client.js'))
  console.log(`── 构建 ─────────────────────────────────`)
  console.log(`  ${hasArtifact ? '✔' : '✘'} lib/client.js 存量产物${hasArtifact ? '存在，跳过构建' : '缺失（--skip-build 无产物可检）'}`)
  results.push({ label: 'lib/client.js 存量', code: hasArtifact ? 0 : 1 })
}

// ── 3. 全仓单测 ────────────────────────────────────────────────
if (!staticOnly) {
  console.log('── 单测 ─────────────────────────────────')
  const vitestEntry = join(root, 'node_modules', 'vitest', 'vitest.mjs')
  if (!existsSync(vitestEntry)) {
    console.log('✘ node_modules/vitest/vitest.mjs 缺失——先执行 pnpm install')
    results.push({ label: 'vitest 入口', code: 1 })
  } else {
    report({ label: 'vitest run（全仓）', ...run('test', [vitestEntry, 'run']) })
  }
}

// ── 汇总 ──────────────────────────────────────────────────────
const failed = results.filter((r) => r.code !== 0)
console.log('── 汇总 ─────────────────────────────────')
console.log(`  ${results.length - failed.length}/${results.length} 项通过`)
if (failed.length > 0) {
  console.error(`一键自检未通过：${failed.map((f) => f.label).join('、')}`)
  process.exit(1)
}
console.log('一键自检全部通过')
