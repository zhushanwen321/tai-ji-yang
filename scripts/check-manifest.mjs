#!/usr/bin/env node
/**
 * 最小 manifest 自检：package.json 契约（五字段齐备 + exports 各条件路径存在）+ cordis.patch.yml 结构
 * + 依赖键集边界 + **浏览器半场的宿主服务声明**。多包适配（设计 D10）：对 workspace 每个包
 * 逐包执行（包清单来自 scripts/workspace-packages.mjs，与 pnpm-workspace.yaml 声明对账）；
 * 断言逻辑仍单处归属本文件——通用断言逐包跑，包特有断言按包声明选择。
 *
 * 最后一项通用断言（版本门禁双字段）源自 2026-11-07 真机验收的发现（见 p1-shell-identity ledger「D3 真机验收」）：
 * 宿主版本门禁只读 peerDependencies 里名为 @deepseek-ai/dsh（或 dsh- 前缀）的键，engines.dsh
 * 不被读取——只写 engines.dsh 等于没有门禁。
 *
 * **注意与 package.json 的 `dsh.client.inject` 区分**：那是**包名**（脚本抵达排序，宿主
 * `client-modules` 的 `arriveDependency` 消费）；这里是模块 `exports.inject` 的**服务名**
 * （ctx 读取门控）。两者同名不同义，不可互相替代——声明了浏览器半场的包两个都要。
 *
 * 只依赖 node 内置模块（不引 js-yaml，保持零依赖前提）：cordis.patch.yml 的合法性以「非空
 * 且首行为 `- ` 条目」这一最小结构检查替代完整 YAML 解析；preset 注册断言同样是文本级
 * （见 checkPresetRegistration 的注释，按 workspace-packages.mjs 的 preset 登记执行）。
 * 退出码 0 = 全部通过，1 = 至少一项失败（失败项逐条打到 stderr）。
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { workspacePackages, WORKSPACE_ROOT } from './workspace-packages.mjs'

const ROOT = WORKSPACE_ROOT
const FORBIDDEN_PREFIX = '@deepseek-ai/dsh-client-'
const CLIENT_INJECT = [
  '@deepseek-ai/dsh-client-ui-layout',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-ui-settings',
  '@deepseek-ai/dsh-client-ui-theme',
  '@deepseek-ai/dsh-api-remotes',
  // 项目分组浏览器（sidebar.workspaces 整槽替换）的三个前置包：sessions 数据服务、
  // useSessions/useSessionStatus 数据钩子（ui-session provideRoot）、uiWorkspace 动作
  // 服务与 useWorkspaces 钩子（ui-workspace）
  '@deepseek-ai/dsh-api-session-controller',
  '@deepseek-ai/dsh-client-ui-session',
  '@deepseek-ai/dsh-client-ui-workspace',
]
/**
 * 浏览器半场必须导出的宿主服务名（根包 `client/apply.ts` 的 `export const inject`）。
 *
 * 取值 = 该文件实际读到的 ctx 面，与 `ClientApplyContext` 的字段一一对应：
 *   slots（品牌三槽 + 外观行）/ locale（内联字典，apply 第一步读它）/ theme（覆盖层 + 模式按钮）/
 *   configForms + remote（持久通道；remote 承载 configForms.get 订阅的设置失效通知）。
 *
 * remote 的四个嵌套路径（settings/llm/credentials/session）必须与父级一起逐个声明：
 * 宿主把嵌套路径按整串服务名解析，只声明父级 'remote' 时读 ctx.remote.settings 照样抛
 * without inject（2026-11-12 真机验收 assembly/console-clean 双 FAIL 的根因）。
 *
 * 为什么必须写死在这里而不从源码推断：这条断言的价值恰在于「源码改了但忘了同步 inject」时会红——
 * 若从源码读 inject 再比对自身，任何改动都自动通过，断言退化为恒绿。
 */
const REQUIRED_SERVICE_INJECT = [
  'slots',
  'locale',
  'theme',
  'configForms',
  'remote',
  'remote.settings',
  'remote.llm',
  'remote.credentials',
  'remote.session',
]

/** 包特有断言的登记：断言逻辑仍在本文件内，按包名选择执行集合（单处归属的两层含义）。 */

/** 根包特有：dsh.client.inject 的精确裁决（8 项）与浏览器半场 inject 服务覆盖。 */
const ROOT_ONLY_CHECKS = new Set(['@zhushanwen/tai-ji-yang-shell'])

/**
 * preset 注册断言（U1 验收条款③ / p1-shell-identity RL1 的注册面机器化）：**按登记执行**——只有
 * scripts/workspace-packages.mjs 登记了 `preset` 字段的包才跑本断言（config.id 裁决值取
 * 自登记，单一权威）；未登记的子包显式播报不适用，避免「所有子包都被假定有 preset」的
 * 误伤（未来出现无 preset 的功能子包时无需改本文件）。
 *
 * 断言 cordis.patch.yml 含一行 `@deepseek-ai/dsh-agent-preset` 声明，其 config 内
 * id/name/description/order 齐备，且 config.plugins 显式声明「standard 全量基线 + 本包四
 * 子插件」（2026-11-09 用户裁决方案 B：OD 模式不收窄原生工具面。DSH preset 无隐式工具
 * 基线，全部子插件逐项声明）：DSH 原生子插件以两版本 standard.patch.yml 实名的并集为准
 * （含跨版本缺包 / 标准本禁而行 disabled 的成员——disabled 行也在声明面内）+ 本包四子插件
 * （persona / doctor 命令 / 设计面板 client / 产物伺服 host，本包内声明形态 = name 以本包
 * 名为前缀的 exports 子路径说明符）。
 *
 * 实现口径：文本级（零 YAML 依赖）。agent-preset 行之后、缩进更深的 `config:` 块内做行
 * 扫描——preset 行的字段与 plugins 全部子插件行都在该块内；缩进结构由本断言与 patch 产物
 * 同仓演进保证（断言改口径时同步改 patch，反之亦然）。
 */
const PRESET_PLUGINS_REQUIRED = [
  '@deepseek-ai/dsh-agent-instructions',
  '@deepseek-ai/dsh-time-context',
  '@deepseek-ai/dsh-tool-bash',
  '@deepseek-ai/dsh-tool-pwsh',
  '@deepseek-ai/dsh-tool-fs',
  '@deepseek-ai/dsh-tool-fs-search',
  '@deepseek-ai/dsh-tool-jobs',
  '@deepseek-ai/dsh-tool-schedule',
  '@deepseek-ai/dsh-skill-filesystem',
  '@deepseek-ai/dsh-tool-skill',
  '@deepseek-ai/dsh-command-goal',
  '@deepseek-ai/dsh-tool-goal',
  '@deepseek-ai/dsh-plan-mode',
  '@deepseek-ai/dsh-compaction-basic',
  '@deepseek-ai/dsh-command-compact',
  '@deepseek-ai/dsh-compaction-tool-result-pruner',
  '@deepseek-ai/dsh-tool-subagent-control',
  '@deepseek-ai/dsh-tool-subagent-control/list-agents',
  '@deepseek-ai/dsh-tool-subagent',
  '@deepseek-ai/dsh-workflow-ptc',
  '@deepseek-ai/dsh-tool-workflow',
  '@deepseek-ai/dsh-tool-ralph',
  '@deepseek-ai/dsh-tool-ask-user',
  '@deepseek-ai/dsh-tool-todo',
  '@deepseek-ai/dsh-tool-web',
  '@deepseek-ai/dsh-tool-present',
  '@deepseek-ai/dsh-plugin-manager/tools',
  '@deepseek-ai/dsh-plugin-market/tools',
]

/** preset config.id 的裁决值不在本文件写死：取自 workspace-packages.mjs 的 preset 登记（单一权威）。 */

function presetConfigBlock(patchPath, patchLines) {
  const presetIndex = patchLines.findIndex((line) => line.includes("name: '@deepseek-ai/dsh-agent-preset'"))
  if (presetIndex < 0) throw new Error(`patch 未声明 agent-preset 行（name: '@deepseek-ai/dsh-agent-preset'）: ${patchPath}`)
  // 条目作用域锚定：name 行缩进减 2 = 该条目 `- id:` 行的缩进；缩回到该深度即离开本条目
  // （config: 及其子块都比条目缩进深，逐行收进块内）。
  const entryIndent = Math.max(0, patchLines[presetIndex].match(/^\s*/)[0].length - 2)
  const block = []
  for (const line of patchLines.slice(presetIndex + 1)) {
    const indent = line.match(/^\s*/)[0].length
    if (line.trim() !== '' && indent <= entryIndent) break // 下一条目或更浅结构 = preset 行作用域结束
    block.push(line)
  }
  return block
}

function checkPresetRegistration(pkg, patchPath, patchLines) {
  const block = presetConfigBlock(patchPath, patchLines)

  const pluginsIndex = block.findIndex((line) => line.trim() === 'plugins:')
  if (pluginsIndex < 0) throw new Error('preset config.plugins 缺失（preset 无隐式工具基线，子插件必须逐项显式声明）')
  if (!block.some((line) => line.trim().startsWith('config:'))) {
    throw new Error('preset 行缺少 config 块')
  }

  // config 的直接字段区 = plugins: 之前的行（子插件行自身的 id/name 不在检查范围）。
  const configFields = block.slice(0, pluginsIndex)
  for (const fieldName of ['id', 'name', 'description', 'order']) {
    if (!configFields.some((line) => line.trim().startsWith(`${fieldName}:`))) {
      throw new Error(`preset config.${fieldName} 缺失（agent-preset schema 要求 id/name/description/order/plugins，0.1.7 与 0.2.x 双版本包内 lib 实读一致）`)
    }
  }
  if (!configFields.some((line) => line.trim() === `id: ${pkg.preset.id}`)) {
    throw new Error(`preset config.id 应为 ${pkg.preset.id}（roster 与会话归属记录以它为标识；裁决值登记在 scripts/workspace-packages.mjs 的 preset 字段）`)
  }

  const pluginsIndent = block[pluginsIndex].match(/^\s*/)[0].length
  const pluginsBlock = []
  for (const line of block.slice(pluginsIndex + 1)) {
    const indent = line.match(/^\s*/)[0].length
    if (line.trim() !== '' && indent <= pluginsIndent) break
    pluginsBlock.push(line)
  }
  const declaredNames = pluginsBlock
    .map((line) => line.match(/^\s+name: (.+)$/))
    .filter(Boolean)
    .map((match) => match[1])
    .map((name) => name.replace(/^['"]|['"]$/g, ''))

  const missing = PRESET_PLUGINS_REQUIRED.filter((name) => !declaredNames.includes(name))
  if (missing.length > 0) {
    throw new Error(`config.plugins 缺少 DSH 原生子插件显式声明: ${missing.join(', ')}`)
  }
  const ownPrefix = `${pkg.name}/`
  const ownCount = declaredNames.filter((name) => name.startsWith(ownPrefix)).length
  if (ownCount < 4) {
    throw new Error(
      `config.plugins 中本包子插件声明不足 4 项（实为 ${ownCount}）：persona / doctor 命令 / 设计面板 client / 产物伺服 host ` +
        `应各自一行（本包内声明形态 = name 用 ${ownPrefix}<exports 子路径> 说明符）`,
    )
  }
}

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

function field(manifest, path) {
  if (manifest.__parseError) throw new Error(`package.json 不是合法 JSON (${manifest.__parseError})`)
  const value = path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), manifest)
  if (typeof value !== 'string' || value === '') throw new Error(`缺失或非字符串字段: ${path}`)
  return value
}

function patchLines(pkg, manifest) {
  const patchPath = field(manifest, 'dsh.bundle.patch')
  const absPath = join(ROOT, pkg.dir, patchPath)
  if (!existsSync(absPath)) throw new Error(`patch 文件不存在: ${patchPath}`)
  return readFileSync(absPath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '' && !line.trimStart().startsWith('#'))
}

/**
 * 收集 exports 各条件指向但不存在的路径（u-foundation 验收条款「五字段齐备并指向存在的路径」的
 * exports 侧履行）：只验「exports 是对象」会让悬空的 types/default 入口静默通过——包看起来
 * 合规，消费者按条件解析时却找不到文件。一次报全（不逐条抛），避免修一条跑一条。
 */
function findDanglingExports(pkgDir, exportsField) {
  const dangling = []
  for (const [subpath, conditions] of Object.entries(exportsField)) {
    if (typeof conditions === 'string') {
      if (!existsSync(join(ROOT, pkgDir, conditions))) dangling.push(`exports['${subpath}'] → ${conditions}`)
      continue
    }
    if (typeof conditions !== 'object' || conditions === null || Array.isArray(conditions)) {
      throw new Error(`exports['${subpath}'] 既不是字符串路径也不是条件对象`)
    }
    for (const [condition, target] of Object.entries(conditions)) {
      if (typeof target !== 'string' || target === '') {
        throw new Error(`exports['${subpath}']['${condition}'] 缺失或非字符串路径`)
      }
      if (!existsSync(join(ROOT, pkgDir, target))) dangling.push(`exports['${subpath}']['${condition}'] → ${target}`)
    }
  }
  return dangling
}

/** 对一个包跑通用断言集（包名进入标签，输出可定位到包）。 */
function checkPackage(pkg) {
  const manifest = pkg.manifest
  const pkgLabel = pkg.dir === '.' ? pkg.name : pkg.dir
  const label = (text) => `[${pkgLabel}] ${text}`

  check(label('package.json 合法 JSON'), () => {
    if (manifest.__parseError) throw new Error(manifest.__parseError)
  })

  check(label('五项字段齐备（name / dsh.bundle.patch / dsh.client.platform / engines.dsh / exports）'), () => {
    field(manifest, 'name')
    field(manifest, 'dsh.bundle.patch')
    field(manifest, 'dsh.client.platform')
    field(manifest, 'engines.dsh')
    const exportsField = manifest.exports
    if (typeof exportsField !== 'object' || exportsField === null || Array.isArray(exportsField)) {
      throw new Error('缺失或非对象字段: exports')
    }
  })

  check(label('exports 各条件指向的路径存在'), () => {
    if (manifest.__parseError) throw new Error(`package.json 不是合法 JSON (${manifest.__parseError})`)
    const exportsField = manifest.exports
    if (typeof exportsField !== 'object' || exportsField === null || Array.isArray(exportsField)) {
      throw new Error('缺失或非对象字段: exports')
    }
    const dangling = findDanglingExports(pkg.dir, exportsField)
    if (dangling.length > 0) throw new Error(`以下导出路径不存在: ${dangling.join('; ')}`)
  })

  check(label('版本门禁真生效：peerDependencies 含 @deepseek-ai/dsh 且与 engines.dsh 同范围'), () => {
    // 2026-11-07 真机验收发现（p1-shell-identity ledger「D3 真机验收」/ V6 版本门禁两侧）：宿主的版本门禁读的是 **peerDependencies**，
    // 不是 engines.dsh。实装证据（dsh-app-boot 的 evaluatePluginCompatibility）：
    //   if (!Object.hasOwn(fields, "peerDependencies")) return void 0
    //   for (const [name, range] of Object.entries(dependencies)) {
    //     if (name !== "@deepseek-ai/dsh" && !name.startsWith("@deepseek-ai/dsh-")) continue
    //     ... if (!semver.satisfies(runtimeVersion, requirement, {includePrerelease:true})) peers[name] = range
    //   }
    // 即：只认名为 @deepseek-ai/dsh 或以 @deepseek-ai/dsh- 开头的 peer，且 engines.dsh 整段不被读。
    // 实测对照：只写 engines.dsh = ">=9.9.9 <10.0.0"（当前实装 0.1.7-rc.2 明显不在范围）时
    // `dsh plugin add` 照常 exit 0——门禁完全失效；补上 @deepseek-ai/dsh peer 后同一范围被明确拒绝
    // 并给出 allow-version 豁免命令。
    //
    // 这条断言钉住两件事：① peer 必须在（否则门禁不存在）；② 两个字段的范围必须一致
    // （不一致时用户看到的是 peer 的门禁，而 engines.dsh 变成无人读的装饰，文档与行为脱节）。
    const enginesRange = manifest.engines?.dsh
    const peerRange = manifest.peerDependencies?.['@deepseek-ai/dsh']
    if (typeof enginesRange !== 'string' || enginesRange.trim() === '') {
      throw new Error('engines.dsh 缺失或为空')
    }
    if (typeof peerRange !== 'string' || peerRange.trim() === '') {
      throw new Error(
        'peerDependencies 缺少 @deepseek-ai/dsh——宿主版本门禁只读 peerDependencies 里该键（实装 evaluatePluginCompatibility），' +
        'engines.dsh 不被读取；缺此项等于没有版本门禁（实测范围外版本会照常装上）',
      )
    }
    if (peerRange !== enginesRange) {
      throw new Error(`@deepseek-ai/dsh peer 范围(${peerRange})与 engines.dsh(${enginesRange})不一致——两者应同源，避免文档与行为脱节`)
    }
  })

  check(label('dsh.bundle.patch 指向的文件存在'), () => {
    const patchPath = field(manifest, 'dsh.bundle.patch')
    if (!existsSync(join(ROOT, pkg.dir, patchPath))) throw new Error(`patch 文件不存在: ${patchPath}`)
  })

  check(label('cordis.patch.yml 是数组形态（非空且首行为 "- " 条目）'), () => {
    const lines = patchLines(pkg, manifest)
    if (lines.length === 0) throw new Error('patch 文件为空，不是数组形态')
    if (!lines[0].startsWith('- ')) throw new Error('首行不是 "- " 条目，patch 不是数组形态')
  })

  check(label('dependencies / peerDependencies 不含 @deepseek-ai/dsh-client-*'), () => {
    for (const name of ['dependencies', 'peerDependencies']) {
      const deps = manifest[name]
      if (deps == null) continue
      const offenders = Object.keys(deps).filter((dep) => dep.startsWith(FORBIDDEN_PREFIX))
      if (offenders.length > 0) throw new Error(`${name} 含被禁的 client 依赖: ${offenders.join(', ')}`)
    }
  })

  if (ROOT_ONLY_CHECKS.has(pkg.name)) {
    check(label('dsh.client.inject 恰为裁决的 8 项'), () => {
      const inject = manifest.dsh?.client?.inject
      if (!Array.isArray(inject)) throw new Error('dsh.client.inject 不是数组')
      if (inject.length !== CLIENT_INJECT.length || CLIENT_INJECT.some((name) => !inject.includes(name)) || new Set(inject).size !== inject.length) {
        throw new Error(`dsh.client.inject 应为 ${CLIENT_INJECT.join(', ')}，实为 ${inject.join(', ')}`)
      }
    })

    check(label('浏览器半场导出 inject 且覆盖全部消费的宿主服务'), () => {
      const sourcePath = join(ROOT, pkg.dir, 'client', 'apply.ts')
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
  } else if (pkg.preset) {
    if (typeof pkg.preset.id !== 'string' || pkg.preset.id === '') {
      check(label('preset 登记合法'), () => {
        throw new Error('scripts/workspace-packages.mjs 的 preset 登记缺少非空 id 字符串')
      })
    } else {
      const patchPath = field(manifest, 'dsh.bundle.patch')
      check(label('preset 注册面：agent-preset 行 + config.plugins standard 全量基线显式声明'), () => {
        checkPresetRegistration(pkg, patchPath, patchLines(pkg, manifest))
      })
    }
  } else {
    // 无 preset 登记的子包：preset 断言不适用（登记表是判定权威，未登记 ≠ 漏检）
    console.log(`  — [${pkgLabel}] preset 注册断言不适用（未登记 preset；登记后自动纳入本断言）`)
  }
}

for (const pkg of workspacePackages()) {
  checkPackage(pkg)
}

if (results.includes(false)) {
  console.error(`\nmanifest 检查失败 ${results.filter((ok) => !ok).length} 项`)
  process.exit(1)
}
console.log(`\nmanifest 检查全部通过（${workspacePackages().length} 个包逐包执行）`)
