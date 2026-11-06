#!/usr/bin/env node
/**
 * 最小 manifest 自检：package.json 契约 + cordis.patch.yml 结构 + 依赖键集边界。
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
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-ui-settings',
  '@deepseek-ai/dsh-client-ui-theme',
  '@deepseek-ai/dsh-api-remotes',
]
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

if (results.includes(false)) {
  console.error(`\nmanifest 检查失败 ${results.filter((ok) => !ok).length} 项`)
  process.exit(1)
}
console.log('\nmanifest 检查全部通过')
