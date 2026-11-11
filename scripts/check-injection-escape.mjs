#!/usr/bin/env node
/**
 * p1-shell-identity 红灯 RL6 / 验收 V10 静态自检：Node 半场推入注入表的行不含结束标签。多包适配（opendesign-design-mode 设计 D10）：包清单
 * 来自 scripts/workspace-packages.mjs，逐包加载 Node 半场入口——有 index-inject 注入贡献的
 * 包按注入行契约断言（根包形态），无注入贡献的包显式播报跳过（不冒充覆盖）。
 *
 * 为什么需要这条断言（p1-shell-identity 设计 AS5 / D6）：宿主的注入行 `style` 分支把 text 原样嵌进一个 style
 * 元素（`packages/host/webserver/src/injections.ts` 的 `renderRow`），
 * 因此 text 里一旦出现该元素的结束标签，页面解析会在该处提前封住元素，后续 CSS
 * 变成页面文本、页面结构被破坏。`IndexInjection` 的类型注释对 style / script 两种行都有
 * 同一条约束。
 *
 * 检查方式：动态 import Node 半场入口，用假 ctx 触发一次 `webserver/index-inject`，
 * 拿真实推入的行做断言（不是扫源码的字符串猜测）；再对一份合成的坏行做一次负样本，
 * 证明这条断言确实会红（而不是恒绿的空检查）。
 *
 * 只依赖 node 内置模块。退出码 0 = 通过，1 = 至少一项失败（失败项打到 stderr）。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { workspacePackages, WORKSPACE_ROOT } from './workspace-packages.mjs'

// 结束标签字面量按拼接构造：本文件自身不应含这两个字面量（否则扫描口径会被自己污染）。
const STYLE_END = `</${'style'}`
const SCRIPT_END = `</${'script'}`

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

/** 断言一行注入满足 style 行的全部约束（结构 + 结束标签）。 */
function assertRow(row, index) {
  if (row === null || typeof row !== 'object') throw new Error(`第 ${index} 行不是对象`)
  if (row.kind !== 'style') throw new Error(`第 ${index} 行 kind 应为 style，实为 ${String(row.kind)}`)
  if (typeof row.text !== 'string' || row.text === '') throw new Error(`第 ${index} 行 text 缺失或非字符串`)
  const keys = Object.keys(row).sort()
  if (keys.length !== 2 || keys[0] !== 'kind' || keys[1] !== 'text') {
    throw new Error(`第 ${index} 行应只含 kind/text，实为 ${keys.join(', ')}`)
  }
  const lower = row.text.toLowerCase()
  if (lower.includes(STYLE_END)) throw new Error(`第 ${index} 行 text 含 style 元素的结束标签，会提前封住 head 里的 <style>`)
  if (lower.includes(SCRIPT_END)) throw new Error(`第 ${index} 行 text 含 script 元素的结束标签`)
}

/** 断言一行注入满足 global 行的全部约束（结构 + JSON 可序列化）。
 *
 * 结束标签防护在宿主侧（`renderRow` 的 global 分支对 `<` 做 `\u003c` 转义），插件侧只需
 * 保证行的形状与值可序列化——宿主对其做 JSON.stringify 嵌进 `globalThis["…"] = <json>`。
 */
function assertGlobalRow(row, index) {
  if (row === null || typeof row !== 'object') throw new Error(`第 ${index} 行不是对象`)
  if (row.kind !== 'global') throw new Error(`第 ${index} 行 kind 应为 global，实为 ${String(row.kind)}`)
  if (typeof row.name !== 'string' || row.name === '') throw new Error(`第 ${index} 行 name 缺失或非字符串`)
  const keys = Object.keys(row).sort()
  if (keys.length !== 3 || keys[0] !== 'kind' || keys[1] !== 'name' || keys[2] !== 'value') {
    throw new Error(`第 ${index} 行应只含 kind/name/value，实为 ${keys.join(', ')}`)
  }
  try {
    if (JSON.stringify(row.value) === undefined) throw new Error('value 不可 JSON 序列化')
  } catch (error) {
    throw new Error(`第 ${index} 行 value 不可 JSON 序列化：${error instanceof Error ? error.message : String(error)}`)
  }
}

/** 用假 ctx 触发一次注入收集，返回推入的行。
 *
 * 假 ctx 的职责只在于「让装配入口跑完并把行交出来」，因此除订阅外还给 `effect`（装载期
 * 探针的反注册器登记口）、`get`（服务探询）、`logger`（诊断出口）与 `inject`（服务注入面，
 * M2 路由适配器经它挂装配）四个最小替身：缺 `effect` 会让装载期探针在装配时抛
 * 「ctx.effect is not a function」，那是替身缺口而非被测代码缺陷。
 * `get` 一律返回 `undefined`（无 webServer / 无 loader）不改变本脚本的断言范围：本脚本只核
 * 注入行，不核诊断；`inject` 不执行回调（等价「llm 服务不在本树」形态，路由装配不在本脚本
 * 断言范围）。
 */
function collectRows(module, label) {
  const rows = []
  const ctx = {
    on(name, listener) {
      if (name !== 'webserver/index-inject') throw new Error(`${label}: 订阅了非预期的宿主事件 ${String(name)}`)
      listener(rows)
      return () => {}
    },
    get() { return undefined },
    logger: { error() {}, warn() {}, info() {}, debug() {} },
    effect(execute) {
      const dispose = execute()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    inject(_names, _callback) {
      return () => {}
    },
  }
  module.apply(ctx)
  return rows
}

const NEGATIVE_ROW = { kind: 'style', text: `body { color: red } ${STYLE_END}` }

/** 每包一项：有 index-inject 注入贡献的包做契约断言；无贡献的包显式播报（不冒充覆盖）。 */
for (const pkg of workspacePackages()) {
  const pkgLabel = pkg.dir === '.' ? pkg.name : pkg.dir
  const entryPath = join(WORKSPACE_ROOT, pkg.dir, pkg.dir === '.' ? 'index.js' : 'lib/index.js')
  const entry = await import(pathToFileURL(entryPath).href).catch((error) => {
    console.error(`✘ [${pkgLabel}] 无法加载 Node 半场入口 ${entryPath}: ${error.message}`)
    results.push(false)
    return undefined
  })
  if (entry === undefined) continue

  const hasInjectContribution = typeof entry.apply === 'function'
    && typeof entry.FIRST_FRAME_ROW !== 'undefined' // 注入贡献的契约标志（style 行常量导出）
  if (!hasInjectContribution) {
    console.log(`✔ [${pkgLabel}] 无 index-inject 注入贡献（不适用注入行契约；显式跳过，不冒充覆盖）`)
    continue
  }

  const label = (text) => `[${pkgLabel}] ${text}`

  const packageJson = pkg.manifest

  check(label('Node 半场导出了 apply 与插件名'), () => {
    if (typeof entry.apply !== 'function') throw new Error('Node 半场入口未导出 apply 函数')
    if (entry.name !== packageJson.name) throw new Error(`插件名 ${String(entry.name)} 与 package.json name ${packageJson.name} 不一致`)
  })

  check(label('apply 订阅 webserver/index-inject 并向表推 style + global 各一行'), () => {
    const rows = collectRows(entry, '首次 emit')
    if (rows.length !== 2) throw new Error(`一次 emit 应推 2 行（style + global），实为 ${rows.length} 行`)
    assertRow(rows[0], 0)
    assertGlobalRow(rows[1], 1)
    if (rows[1].name !== entry.SHELL_INFO_GLOBAL) throw new Error(`global 行 name 应为 SHELL_INFO_GLOBAL（${String(entry.SHELL_INFO_GLOBAL)}），实为 ${String(rows[1].name)}`)
  })

  check(label('两次 emit 各自推当前两行（不是「首帧快照」语义）'), () => {
    const first = collectRows(entry, '第 1 次 emit')
    const second = collectRows(entry, '第 2 次 emit')
    if (first.length !== 2 || second.length !== 2) throw new Error(`两次 emit 各应为 2 行，实为 ${first.length} / ${second.length}`)
    if (first[0].text !== second[0].text) throw new Error('两次 emit 推出的行文本不一致，注入表语义要求「推当前行」')
    if (JSON.stringify(first[1].value) !== JSON.stringify(second[1].value)) {
      throw new Error('两次 emit 推出的 global 行值不一致，注入表语义要求「推当前行」')
    }
  })

  check(label('推入的行与导出的 FIRST_FRAME_ROW 同一取值'), () => {
    const rows = collectRows(entry, '取值一致性')
    const exported = entry.FIRST_FRAME_ROW
    if (exported === undefined) throw new Error('未导出 FIRST_FRAME_ROW，无法做行与文本的一致性对拍')
    assertRow(exported, 0)
    if (rows[0].text !== exported.text) throw new Error('推入的行文本与导出的 FIRST_FRAME_ROW.text 不一致')
  })

  check(label('负样本：含结束标签的行会被本断言拒绝（证明断言非常绿）'), () => {
    let rejected = false
    try {
      assertRow(NEGATIVE_ROW, 0)
    } catch {
      rejected = true
    }
    if (!rejected) throw new Error('合成坏行未被拒绝，说明结束标签断言失效')
  })

  check(label('负样本：global 行缺 name / value 不可序列化会被本断言拒绝'), () => {
    let rejectedName = false
    try {
      assertGlobalRow({ kind: 'global', value: { version: '0.1.0' } }, 0)
    } catch {
      rejectedName = true
    }
    if (!rejectedName) throw new Error('缺 name 的 global 行未被拒绝，说明结构断言失效')
    let rejectedValue = false
    try {
      assertGlobalRow({ kind: 'global', name: 'x', value: { bad: BigInt(1) } }, 0)
    } catch {
      rejectedValue = true
    }
    if (!rejectedValue) throw new Error('value 含 BigInt 的 global 行未被拒绝，说明可序列化断言失效')
  })
}

if (results.includes(false)) {
  console.error(`\n注入行自检失败 ${results.filter((ok) => !ok).length} 项`)
  process.exit(1)
}
console.log('\n注入行自检全部通过')
