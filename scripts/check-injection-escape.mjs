#!/usr/bin/env node
/**
 * RL6 / V10 静态自检：Node 半场推入注入表的行不含结束标签。
 *
 * 为什么需要这条断言（设计 AS5 / D6）：宿主的注入行 `style` 分支把 text 原样嵌进一个 style
 * 元素（`packages/host/webserver/src/injections.ts` 的 `renderRow`），
 * 因此 text 里一旦出现该元素的结束标签，页面解析会在该处提前闭合元素，后续 CSS
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
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// 结束标签字面量按拼接构造：本文件自身不应含这两个字面量（否则扫描口径会被自己污染）。
const STYLE_END = `</${'style'}`
const SCRIPT_END = `</${'script'}`

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ENTRY = join(ROOT, 'index.js')
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
  if (lower.includes(STYLE_END)) throw new Error(`第 ${index} 行 text 含 style 元素的结束标签，会提前闭合 head 里的 <style>`)
  if (lower.includes(SCRIPT_END)) throw new Error(`第 ${index} 行 text 含 script 元素的结束标签`)
}

/** 用假 ctx 触发一次注入收集，返回推入的行。 */
function collectRows(module, label) {
  const rows = []
  const ctx = {
    on(name, listener) {
      if (name !== 'webserver/index-inject') throw new Error(`${label}: 订阅了非预期的宿主事件 ${String(name)}`)
      listener(rows)
      return () => {}
    },
  }
  module.apply(ctx)
  return rows
}

const entry = await import(pathToFileURL(ENTRY).href).catch((error) => {
  console.error(`✘ 无法加载 Node 半场入口 ${ENTRY}: ${error.message}`)
  process.exit(1)
})

const packageJson = (() => {
  try {
    return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  } catch (error) {
    console.error(`✘ package.json 不可读: ${error.message}`)
    process.exit(1)
  }
})()

check('Node 半场导出了 apply 与插件名', () => {
  if (typeof entry.apply !== 'function') throw new Error('index.js 未导出 apply 函数')
  if (entry.name !== packageJson.name) throw new Error(`插件名 ${String(entry.name)} 与 package.json name ${packageJson.name} 不一致`)
})

check('apply 订阅 webserver/index-inject 并向表推恰好一行 style', () => {
  const rows = collectRows(entry, '首次 emit')
  if (rows.length !== 1) throw new Error(`一次 emit 应推 1 行，实为 ${rows.length} 行`)
  assertRow(rows[0], 0)
})

check('两次 emit 各自推一行（不是「首帧快照」语义）', () => {
  const first = collectRows(entry, '第 1 次 emit')
  const second = collectRows(entry, '第 2 次 emit')
  if (first.length !== 1 || second.length !== 1) throw new Error(`两次 emit 各应为 1 行，实为 ${first.length} / ${second.length}`)
  if (first[0].text !== second[0].text) throw new Error('两次 emit 推出的行文本不一致，注入表语义要求「推当前行」')
})

check('推入的行与导出的 FIRST_FRAME_ROW 同一取值', () => {
  const rows = collectRows(entry, '取值一致性')
  const exported = entry.FIRST_FRAME_ROW
  if (exported === undefined) throw new Error('index.js 未导出 FIRST_FRAME_ROW，无法做行与文本的一致性对拍')
  assertRow(exported, 0)
  if (rows[0].text !== exported.text) throw new Error('推入的行文本与导出的 FIRST_FRAME_ROW.text 不一致')
})

check('负样本：含结束标签的行会被本断言拒绝（证明断言非常绿）', () => {
  let rejected = false
  try {
    assertRow({ kind: 'style', text: `body { color: red } ${STYLE_END}` }, 0)
  } catch {
    rejected = true
  }
  if (!rejected) throw new Error('合成坏行未被拒绝，说明结束标签断言失效')
})

if (results.includes(false)) {
  console.error(`\n注入行自检失败 ${results.filter((ok) => !ok).length} 项`)
  process.exit(1)
}
console.log('\n注入行自检全部通过')
