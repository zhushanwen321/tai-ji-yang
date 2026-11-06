#!/usr/bin/env node
/**
 * RL7 静态自检：package.json 的 dependencies 与 peerDependencies 键集不含 @deepseek-ai/dsh-client-*。
 *
 * 为什么需要这条断言（设计 §3.3.3 / D3「零 npm 运行时依赖」裁决）：npm 上 @deepseek-ai/dsh-client-*
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
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST_PATH = join(ROOT, 'package.json')
const FORBIDDEN_PREFIX = '@deepseek-ai/dsh-client-'
const CHECKED_FIELDS = ['dependencies', 'peerDependencies']

/** 读取并解析 package.json；失败即抛，交由主流程显式报错。 */
function readManifest() {
  if (!existsSync(MANIFEST_PATH)) throw new Error(`package.json 不存在: ${MANIFEST_PATH}`)
  try {
    return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
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

let offenders
try {
  offenders = findForbidden(readManifest())
} catch (error) {
  console.error(`✘ ${error.message}`)
  process.exit(1)
}

if (offenders.length > 0) {
  console.error(`✘ ${CHECKED_FIELDS.join(' / ')} 含被禁的宿主 client 依赖:`)
  for (const offender of offenders) console.error(`  - ${offender}`)
  console.error('\n依据: 设计 §3.3.3（D3 零 npm 运行时依赖）——这些包由宿主模块表供给，不由插件安装。')
  process.exit(1)
}

console.log(`✔ ${CHECKED_FIELDS.join(' / ')} 不含 ${FORBIDDEN_PREFIX}* 依赖`)
