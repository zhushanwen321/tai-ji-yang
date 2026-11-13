#!/usr/bin/env node
/**
 * p1-shell-identity 红灯 RL7 静态自检：每个包的 dependencies 与 peerDependencies 键集不含 @deepseek-ai/dsh-client-*。
 * 多包适配（设计 D10）：包清单来自 scripts/workspace-packages.mjs，逐包执行同一断言。
 *
 * 为什么需要这条断言（p1-shell-identity 设计 §3.3.3 / D3「零 npm 运行时依赖」裁决）：npm 上 @deepseek-ai/dsh-client-*
 * 的 latest 与 DSH 当前主版本差两代（ui-slots latest = 0.0.1-rc.1，next 才是 0.2.2-rc.1），
 * 且 @deepseek-ai/dsh-api-remotes 在 0.2.2 根本没有发布。插件一旦声明这些依赖，用户装包时
 * pnpm 会照常解析 latest，装出来的包要么缺 API 要么版本不符；宿主的模块表只认自己供给的那份
 * 实例，两份副本的 Symbol 与单例槽不共享，运行时会出现跨实例读写。
 *
 * 只检查 dependencies 与 peerDependencies：这两项才会随包分发并参与用户侧解析。
 * devDependencies 只服务本仓自检（类型声明等），不随包安装，因此不在断言范围内。
 *
 * 只依赖 node 内置模块。退出码 0 = 通过，1 = 至少一项失败（失败项打到 stderr）。
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { workspacePackages, WORKSPACE_ROOT } from './workspace-packages.mjs'

const FORBIDDEN_PREFIX = '@deepseek-ai/dsh-client-'
const CHECKED_FIELDS = ['dependencies', 'peerDependencies']

/** 读取并解析 package.json；失败即抛，交由主流程显式报错。 */
function readManifest(pkgDir) {
  const manifestPath = join(WORKSPACE_ROOT, pkgDir, 'package.json')
  if (!existsSync(manifestPath)) throw new Error(`package.json 不存在: ${manifestPath}`)
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    throw new Error(`package.json 不是合法 JSON: ${error.message}`)
  }
}

/** 逐字段收集被禁的 client 依赖键。 */
function findForbidden(manifest) {
  const offenders = []
  for (const field of CHECKED_FIELDS) {
    const value = manifest[field]
    if (value === undefined) continue
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      offenders.push(`${field} 不是对象`)
      continue
    }
    for (const name of Object.keys(value)) {
      if (name.startsWith(FORBIDDEN_PREFIX)) offenders.push(`${field}: ${name}`)
    }
  }
  return offenders
}

const failures = []
for (const pkg of workspacePackages()) {
  const pkgLabel = pkg.dir === '.' ? pkg.name : pkg.dir
  let offenders
  try {
    offenders = findForbidden(readManifest(pkg.dir))
  } catch (error) {
    failures.push(`[${pkgLabel}] ${error.message}`)
    continue
  }
  if (offenders.length > 0) {
    failures.push(`[${pkgLabel}] ${CHECKED_FIELDS.join(' / ')} 含被禁的宿主 client 依赖: ${offenders.join(', ')}`)
    continue
  }
  console.log(`✔ [${pkgLabel}] ${CHECKED_FIELDS.join(' / ')} 不含 ${FORBIDDEN_PREFIX}* 依赖`)
}

if (failures.length > 0) {
  console.error('✘ 宿主 client 依赖检查失败:')
  for (const failure of failures) console.error(`  - ${failure}`)
  console.error('\n依据: p1-shell-identity 设计 §3.3.3（D3 零 npm 运行时依赖）——这些包由宿主模块表供给，不由插件安装。')
  process.exit(1)
}
