#!/usr/bin/env node
/**
 * 多包 workspace 的包枚举单源（设计 D10：单包仓 → 多包容器）。
 *
 * 仓根 = tai-ji-yang-shell；功能型子包逐个落 `packages/<name>/`。构建（build-client.mjs）
 * 与六个静态检查脚本（check-*.mjs）都从这里拿包清单与每包的构建声明——清单改动只动本
 * 文件，检查脚本与构建器不各自维护包列表（两处漂移会让「新包漏检」静默通过）。
 *
 * `workspacePackages()` 每次调用都把本文件的登记与 `pnpm-workspace.yaml` 的 packages 声明
 * 对账（glob 展开后的实际包目录集合必须一致）：加了包忘了登记构建声明、或登记了包没进
 * workspace 声明，都会在这一步失败，而不是留给某个检查脚本静默漏检。
 *
 * 只依赖 node 内置模块。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 仓库根（本文件位于 <root>/scripts/）。 */
export const WORKSPACE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Node 半场产物的两种形态：
 *   - copy-entry：源入口是包目录下的单文件 ESM（无需转译），构建 = 逐字拷进 lib/（根包形态）；
 *   - transpile-lib：lib/ 下的 *.ts 源经 esbuild transform 成同名 *.js（保持 ESM 与 import
 *     路径原样，不打包——每个 exports 子路径是宿主 loader 独立 import 的入口）。
 * 两种形态下「源码与产物同批入库」纪律不变。
 */

/** 根包：tai-ji-yang-shell（单包时代的全部资产仍在仓根）。 */
export const ROOT_PACKAGE = {
  name: 'tai-ji-yang-shell',
  dir: '.',
  clientEntry: 'client/apply.ts',
  nodeHalf: { kind: 'copy-entry', source: 'index.js' },
}

/** 子包登记（每加一个功能型子包：此处登记一行 + pnpm-workspace.yaml 已有 packages/* 通配）。 */
export const CHILD_PACKAGES = [
  {
    name: 'opendesign-design-mode',
    dir: 'packages/opendesign-design-mode',
    clientEntry: 'client/preview-tab/index.tsx',
    nodeHalf: { kind: 'transpile-lib' },
  },
]

/**
 * 展开 pnpm-workspace.yaml 的 packages 声明为实际包目录集合。
 *
 * 只支持本仓用到的形态（目录名 / 以 `*` 结尾的段通配，如 `packages/*`）；用到更复杂的
 * glob 时在这里扩展。`*` 只匹配一层目录，跳过 node_modules 与点开头目录。
 *
 * @param {string} pattern - workspace 声明的 glob。
 * @returns {string[]} 匹配到的相对目录（含 package.json 的），按字典序。
 */
function expandPattern(pattern) {
  const segments = pattern.split('/')
  const results = ['']
  for (const segment of segments) {
    const next = []
    for (const base of results) {
      const baseAbs = join(WORKSPACE_ROOT, base)
      if (!segment.includes('*')) {
        const candidate = base === '' ? segment : `${base}/${segment}`
        if (existsSync(join(baseAbs, segment))) next.push(candidate)
        continue
      }
      if (!existsSync(baseAbs)) continue
      for (const name of readdirSync(baseAbs).sort()) {
        if (name === 'node_modules' || name.startsWith('.')) continue
        next.push(base === '' ? name : `${base}/${name}`)
      }
    }
    results.splice(0, results.length, ...next)
  }
  return results.filter((dir) => existsSync(join(WORKSPACE_ROOT, dir, 'package.json')))
}

/** 读 pnpm-workspace.yaml 的 `packages:` 段（文本级：本仓该段是简单的 `- <glob>` 列表）。 */
function readWorkspaceGlobs() {
  const text = readFileSync(join(WORKSPACE_ROOT, 'pnpm-workspace.yaml'), 'utf8')
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((line) => line.trim() === 'packages:')
  if (start < 0) throw new Error('pnpm-workspace.yaml 缺少 packages: 声明——多包 workspace 的包清单必须声明在此')
  const globs = []
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '' || line.startsWith('#')) continue
    if (!/^\s*- /.test(line)) break // packages: 段结束（下一个顶层键）
    const glob = line.trim().slice(2).trim().replace(/^['"]|['"]$/g, '')
    if (glob !== '') globs.push(glob)
  }
  if (globs.length === 0) throw new Error('pnpm-workspace.yaml 的 packages: 段为空')
  return globs
}

/**
 * workspace 全部包（根包在前、子包按登记序），并把本文件登记与 pnpm-workspace.yaml 声明
 * 对账——不一致即抛（可行动信息指名缺哪侧登记）。
 *
 * @returns {Array<{name: string, dir: string, clientEntry: string, nodeHalf: object, manifest: object}>}
 */
export function workspacePackages() {
  const declared = new Set(readWorkspaceGlobs().flatMap((glob) => expandPattern(glob)))
  const registered = [...CHILD_PACKAGES.map((pkg) => pkg.dir), ROOT_PACKAGE.dir]

  const unregistered = [...declared].filter((dir) => !registered.includes(dir))
  const undeclared = registered.filter((dir) => dir !== '.' && !declared.has(dir))
  const problems = []
  if (unregistered.length > 0) {
    problems.push(`以下包目录已在 pnpm-workspace.yaml 声明但未在 scripts/workspace-packages.mjs 登记（构建与检查会漏掉它们）: ${unregistered.join(', ')}`)
  }
  if (undeclared.length > 0) {
    problems.push(`以下包目录已登记但 pnpm-workspace.yaml 的 packages 声明覆盖不到: ${undeclared.join(', ')}`)
  }
  if (problems.length > 0) {
    throw new Error(['workspace 包清单对账失败：', ...problems.map((p) => `  - ${p}`), '  补齐方式: 两边同批登记（scripts/workspace-packages.mjs 的 CHILD_PACKAGES + pnpm-workspace.yaml 的 packages 段）'].join('\n'))
  }

  return [ROOT_PACKAGE, ...CHILD_PACKAGES].map((pkg) => ({
    ...pkg,
    manifest: JSON.parse(readFileSync(join(WORKSPACE_ROOT, pkg.dir, 'package.json'), 'utf8')),
  }))
}
