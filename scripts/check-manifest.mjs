#!/usr/bin/env node
/**
 * 最小 manifest 自检：package.json 契约（五字段齐备 + exports 各条件路径存在）+ cordis.patch.yml 结构
 * + 依赖键集边界 + **浏览器半场的宿主服务声明**。
 *
 * 最后一项是 2026-11-07 真机验收的发现（见 ledger「D3 真机验收」）：宿主 fiber 的 ctx 是带拦截器
 * 的 Proxy，`ctx.<service>` 只有在该 service 已被 provide 或本 fiber 的 inject 表里声明了它时才可读，
 * 否则**抛** `cannot get property "<name>" without inject`。浏览器半场不导出 `inject` 时，`apply`
 * 第一行就抛、fiber 转 failed、宿主 boot 报 `web boot: 1 entry did not activate`——页面整体白屏，
 * 而 Node 半场的首帧样式照常注入（所以「界面有太极色但内容是白的」这种半死态最误导）。
 * 这条断言把该契约钉在可机检的位置：漏声明即红，不等真机。
 *
 * **注意与 package.json 的 `dsh.client.inject` 区分**：那是**包名**（脚本抵达排序，宿主
 * `client-modules` 的 `arriveDependency` 消费）；这里是模块 `exports.inject` 的**服务名**
 * （ctx 读取门控）。两者同名不同义，不可互相替代——本包两个都要。
 *
 * 只依赖 node 内置模块（不引 js-yaml，保持本单元的零依赖前提）：
 * cordis.patch.yml 的合法性以「非空且首行为 `- ` 条目」这一最小结构检查替代完整 YAML 解析。
 * 退出码 0 = 全部通过，1 = 至少一项失败（失败项逐条打到 stderr）。
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FORBIDDEN_PREFIX = '@deepseek-ai/dsh-client-'
const CLIENT_INJECT = [
  '@deepseek-ai/dsh-client-ui-layout',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-ui-settings',
  '@deepseek-ai/dsh-client-ui-theme',
  '@deepseek-ai/dsh-api-remotes',
]
/**
 * 浏览器半场必须导出的宿主服务名（`client/apply.ts` 的 `export const inject`）。
 *
 * 取值 = 该文件实际读到的 ctx 面，与 `ClientApplyContext` 的字段一一对应：
 *   slots（品牌三槽 + 外观行）/ locale（内联字典，apply 第一步读它）/ theme（覆盖层 + 模式按钮）/
 *   configForms + remote（持久通道；remote 承载 configForms.get 订阅的设置失效通知）。
 *
 * 为什么必须写死在这里而不从源码推断：这条断言的价值恰在于「源码改了但忘了同步 inject」时会红——
 * 若从源码读 inject 再比对自身，任何改动都自动通过，断言退化为恒绿。
 */
const REQUIRED_SERVICE_INJECT = ['slots', 'locale', 'theme', 'configForms', 'remote']
const results = []

function check(label, fn) {
  try {
    fn()
    results.push(true)
    console.log(`✔ ${label}`)
  } catch (error) {
    results.push(false)
    console.error(`✘ ${label}: ${error.message}`)
  }
}

const manifest = (() => {
  try {
    return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  } catch (error) {
    return { __parseError: error.message }
  }
})()

function field(path) {
  if (manifest.__parseError) throw new Error(`package.json 不是合法 JSON (${manifest.__parseError})`)
  const value = path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), manifest)
  if (typeof value !== 'string' || value === '') throw new Error(`缺失或非字符串字段: ${path}`)
  return value
}

function patchLines() {
  const patchPath = field('dsh.bundle.patch')
  const absPath = join(ROOT, patchPath)
  if (!existsSync(absPath)) throw new Error(`patch 文件不存在: ${patchPath}`)
  return readFileSync(absPath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
}

/**
 * 收集 exports 各条件指向但不存在的路径（u-foundation 验收条款「五字段齐备并指向存在的路径」的
 * exports 侧履行）：只验「exports 是对象」会让悬空的 types/default 入口静默通过——包看起来
 * 合规，消费者按条件解析时却找不到文件。一次报全（不逐条抛），避免修一条跑一条。
 */
function findDanglingExports(exportsField) {
  const dangling = []
  for (const [subpath, conditions] of Object.entries(exportsField)) {
    if (typeof conditions === 'string') {
      if (!existsSync(join(ROOT, conditions))) dangling.push(`exports['${subpath}'] → ${conditions}`)
      continue
    }
    if (typeof conditions !== 'object' || conditions === null || Array.isArray(conditions)) {
      throw new Error(`exports['${subpath}'] 既不是字符串路径也不是条件对象`)
    }
    for (const [condition, target] of Object.entries(conditions)) {
      if (typeof target !== 'string' || target === '') {
        throw new Error(`exports['${subpath}']['${condition}'] 缺失或非字符串路径`)
      }
      if (!existsSync(join(ROOT, target))) dangling.push(`exports['${subpath}']['${condition}'] → ${target}`)
    }
  }
  return dangling
}

check('package.json 合法 JSON', () => {
  if (manifest.__parseError) throw new Error(manifest.__parseError)
})

check('五项字段齐备（name / dsh.bundle.patch / dsh.client.platform / engines.dsh / exports）', () => {
  field('name')
  field('dsh.bundle.patch')
  field('dsh.client.platform')
  field('engines.dsh')
  const exportsField = manifest.exports
  if (typeof exportsField !== 'object' || exportsField === null || Array.isArray(exportsField)) {
    throw new Error('缺失或非对象字段: exports')
  }
})

check('exports 各条件指向的路径存在', () => {
  if (manifest.__parseError) throw new Error(`package.json 不是合法 JSON (${manifest.__parseError})`)
  const exportsField = manifest.exports
  if (typeof exportsField !== 'object' || exportsField === null || Array.isArray(exportsField)) {
    throw new Error('缺失或非对象字段: exports')
  }
  const dangling = findDanglingExports(exportsField)
  if (dangling.length > 0) throw new Error(`以下导出路径不存在: ${dangling.join('; ')}`)
})

check('dsh.client.inject 恰为裁决的 4 项', () => {
  const inject = manifest.dsh?.client?.inject
  if (!Array.isArray(inject)) throw new Error('dsh.client.inject 不是数组')
  if (inject.length !== CLIENT_INJECT.length || CLIENT_INJECT.some((name) => !inject.includes(name)) || new Set(inject).size !== inject.length) {
    throw new Error(`dsh.client.inject 应为 ${CLIENT_INJECT.join(', ')}，实为 ${inject.join(', ')}`)
  }
})

check('dsh.bundle.patch 指向的文件存在', () => {
  const patchPath = field('dsh.bundle.patch')
  if (!existsSync(join(ROOT, patchPath))) throw new Error(`patch 文件不存在: ${patchPath}`)
})

check('cordis.patch.yml 是数组形态（非空且首行为 "- " 条目）', () => {
  const lines = patchLines()
  if (lines.length === 0) throw new Error('patch 文件为空，不是数组形态')
  if (!lines[0].startsWith('- ')) throw new Error('首行不是 "- " 条目，patch 不是数组形态')
})

check('dependencies / peerDependencies 不含 @deepseek-ai/dsh-client-*', () => {
  for (const name of ['dependencies', 'peerDependencies']) {
    const deps = manifest[name]
    if (deps == null) continue
    const offenders = Object.keys(deps).filter((dep) => dep.startsWith(FORBIDDEN_PREFIX))
    if (offenders.length > 0) throw new Error(`${name} 含被禁的 client 依赖: ${offenders.join(', ')}`)
  }
})

check('浏览器半场导出 inject 且覆盖全部消费的宿主服务', () => {
  const sourcePath = join(ROOT, 'client', 'apply.ts')
  if (!existsSync(sourcePath)) throw new Error(`找不到浏览器半场入口: client/apply.ts（属 U3 单元）`)
  const source = readFileSync(sourcePath, 'utf8')
  // 形态判定：`export const inject = [...]`（允许 as const 与多行）；不认 exports.inject 的动态形态——
  // 本包是 TS 源码经 esbuild 打包，唯一合法形态就是这条 export。
  const match = source.match(/export\s+const\s+inject\s*(?::[^=]+)?=\s*\[([^\]]*)\]/s)
  if (!match) {
    throw new Error(
      'client/apply.ts 未导出 const inject——宿主 fiber 的 ctx 拦截器会令 apply 第一行即抛 ' +
      '「cannot get property \"locale\" without inject」，浏览器半场整体 failed（页面白屏而首帧样式照常注入的半死态）',
    )
  }
  const declared = [...match[1].matchAll(/['"]([^'"\n]+)['"]/g)].map((m) => m[1])
  const missing = REQUIRED_SERVICE_INJECT.filter((name) => !declared.includes(name))
  if (missing.length > 0) {
    throw new Error(`inject 缺少本包实际消费的宿主服务: ${missing.join(', ')}（已声明: ${declared.join(', ') || '无'}）`)
  }
})

if (results.includes(false)) {
  console.error(`\nmanifest 检查失败 ${results.filter((ok) => !ok).length} 项`)
  process.exit(1)
}
console.log('\nmanifest 检查全部通过')
