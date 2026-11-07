#!/usr/bin/env node
/**
 * V8 自检：装错 profile 时 Node 半场给出可行动诊断，装在 web profile 时不误报。
 *
 * 断言的对象是真实装配行为，不是源码字符串：
 *   - 用真 `@deepseek-ai/cordis` 的 Context 装载 `index.js`（真 `ctx.effect` / 真 fiber 卸载），
 *     `webServer` 与 `loader` 用假服务供给——探针只读这两个服务名，装配语义与宿主一致。
 *   - 日志用 `ctx.logger.exporter` 捕获消息对象（含 `type` / `name`），因此「error 级 + 归属名是
 *     本包」这两条都能断言，而不是只 grep 一段文本。
 *
 * 六个场景（前五个是正/负行为断言，第六个证明断言非常绿）：
 *   A. web 承载已就位 → 不报（web / desktop profile 的常态）；
 *   B. 无 web 承载，Loader 立即结算 → 报一条，且文案含四段（本包 / web 类型 profile / 浏览器半场 /
 *      改装出路）；
 *   C. 装配期暂时无 web 承载、结算时已就位 → 不报。**这条是误报防线**：宿主并发装配各行，
 *      webserver 行自身 `inject: [webStartup]`，同步快照会在正常 web profile 上误报；
 *   D. 结算前插件被卸载 → 不报（卸载后不留噪音日志）；
 *   E. 无 Loader（手工装配树即完整树）→ 立即报一条；
 *   F. 负对照：把「无条件报」的假实现喂给 C 的断言，必须被拒——证明 C 不是恒绿的空检查。
 *
 * 另一个副作用断言（D9 的「不注册任何会失败的槽位贡献」）：缺 web 承载时 `apply` 不抛，且
 * `webserver/index-inject` 订阅照旧在（注入表照旧推一行、事件永不 emit 也不产生错误）。
 *
 * 只依赖 node 内置模块与本仓的 `@deepseek-ai/cordis` peer（devDependencies 未装时给出可行动失败）。
 * 退出码 0 = 全部通过，1 = 至少一项失败（失败项逐条打到 stderr）。
 */
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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

async function checkAsync(label, fn) {
  try {
    await fn()
    results.push(true)
    console.log(`✔ ${label}`)
  } catch (error) {
    results.push(false)
    console.error(`✘ ${label}: ${error.message}`)
  }
}

/** 让出宏任务：探针的判定链是「微任务 → loader.await → 判定」，两条微任务足够，留一拍余量。 */
function tick() {
  return new Promise((resolve) => setTimeout(resolve, 5))
}

const cordis = await import('@deepseek-ai/cordis').catch((error) => {
  console.error(`✘ 无法加载 @deepseek-ai/cordis（peer 依赖未安装？先在仓库根执行 pnpm install）: ${error.message}`)
  process.exit(1)
})

const entry = await import(pathToFileURL(ENTRY).href).catch((error) => {
  console.error(`✘ 无法加载 Node 半场入口 ${ENTRY}: ${error.message}`)
  process.exit(1)
})

/**
 * 装配一个最小宿主：可选的 `webServer` / `loader` 假服务 + 日志捕获。
 *
 * @param options.inject - 额外供给的假服务（`webServer` / `loader`）。
 * @param options.applyPlugin - 被装配的实现（`{ name, apply }`）；负对照用它换成坏实现。
 * @returns `ctx`（真 Context）、`logs`（捕获的日志数组）、`fiber`（插件 fiber）、`dispose`。
 */
async function mount({ inject = {}, applyPlugin = entry } = {}) {
  const ctx = new cordis.Context()
  const logs = []
  ctx.logger.exporter({
    levels: { default: 0 },
    export: (message) => logs.push(message),
  })
  for (const [name, value] of Object.entries(inject)) ctx.provide(name, value)
  const fiber = await ctx.plugin({ name: applyPlugin.name, apply: applyPlugin.apply })
  return { ctx, logs, fiber, dispose: () => fiber.dispose() }
}

/** 本包归属的 error 日志（按名字与级别筛，不看无关日志）。 */
function shellErrors(logs) {
  return logs.filter((message) => message.type === 'error' && message.name === entry.name)
}

/** 断言日志里恰有一条本包的 error，且文案覆盖 V8 要求的四段信息。 */
function assertOneActionableError(logs) {
  const errors = shellErrors(logs)
  if (errors.length !== 1) throw new Error(`本包应报 1 条 error，实为 ${errors.length} 条（全部日志 ${logs.length} 条）`)
  const text = errors[0].args.map((arg) => String(arg)).join(' ')
  for (const fragment of ['本包', 'web 类型', 'profile', '浏览器半场', '改装到 web profile']) {
    if (!text.includes(fragment)) throw new Error(`诊断文案缺「${fragment}」：${text}`)
  }
  if (!text.includes(entry.name)) throw new Error('诊断文案没有指向本包（未出现包名）')
}

/** 断言没有任何本包 error。 */
function assertNoShellError(logs, label) {
  const errors = shellErrors(logs)
  if (errors.length !== 0) {
    const text = errors.map((message) => message.args.map((arg) => String(arg)).join(' ')).join(' | ')
    throw new Error(`${label}：不应报 error，实报 ${errors.length} 条：${text}`)
  }
}

const fakeLoader = (settle) => ({ await: settle })

await checkAsync('A. web 承载已就位时不报（web / desktop profile 常态）', async () => {
  const { logs, dispose } = await mount({
    inject: { loader: fakeLoader(() => Promise.resolve()), webServer: { port: 3080, protocol: 'http:' } },
  })
  await tick()
  assertNoShellError(logs, '承载就位')
  await dispose()
})

await checkAsync('B. 无 web 承载且 Loader 已结算时报一条可行动 error', async () => {
  const { logs, dispose } = await mount({ inject: { loader: fakeLoader(() => Promise.resolve()) } })
  await tick()
  assertOneActionableError(logs)
  await dispose()
})

await checkAsync('C. 装配期暂缺、结算时已就位时不报（误报防线）', async () => {
  let releaseWebServer
  const arrival = new Promise((resolve) => { releaseWebServer = resolve })
  const { ctx, logs, dispose } = await mount({ inject: { loader: fakeLoader(() => arrival) } })
  await tick()
  assertNoShellError(logs, '结算前')
  // 结算前把承载供给上，再放开 loader.await：探针的判定在结算之后重读服务。
  ctx.provide('webServer', { port: 3080, protocol: 'http:' })
  releaseWebServer()
  await tick()
  assertNoShellError(logs, '结算后')
  await dispose()
})

await checkAsync('D. 结算前卸载插件时不报（卸载不留噪音）', async () => {
  let releaseSettle
  const settle = new Promise((resolve) => { releaseSettle = resolve })
  const { logs, dispose } = await mount({ inject: { loader: fakeLoader(() => settle) } })
  await dispose()
  releaseSettle()
  await tick()
  assertNoShellError(logs, '卸载后')
})

await checkAsync('E. 无 Loader（手工装配树）时立即报一条', async () => {
  const { logs, dispose } = await mount()
  await tick()
  assertOneActionableError(logs)
  await dispose()
})

await checkAsync('负对照：C 的断言能拒绝「无条件报」的实现（证明断言非常绿）', async () => {
  const alwaysReports = {
    name: entry.name,
    apply(ctx) {
      // 故意不探针：无视承载直接报，模拟「同步判定」会在正常 web profile 上误报的形态。
      ctx.on('webserver/index-inject', () => {})
      ctx.effect(() => {
        ctx.logger.error(entry.NO_WEB_CARRIER_MESSAGE + entry.NO_WEB_CARRIER_HINT)
        return () => {}
      })
    },
  }
  let releaseWebServer
  const arrival = new Promise((resolve) => { releaseWebServer = resolve })
  const { ctx, logs, dispose } = await mount({ inject: { loader: fakeLoader(() => arrival) }, applyPlugin: alwaysReports })
  await tick()
  ctx.provide('webServer', { port: 3080, protocol: 'http:' })
  releaseWebServer()
  await tick()
  let rejected = false
  try {
    assertNoShellError(logs, '结算后')
  } catch {
    rejected = true
  }
  await dispose()
  if (!rejected) throw new Error('坏实现未被 C 的断言拒绝：断言恒绿，V8 防线失效')
})

await checkAsync('F. 缺承载时 apply 不抛，注入订阅照旧（缺承载不产生失败贡献）', async () => {
  const { ctx, dispose } = await mount()
  const rows = []
  ctx.emit('webserver/index-inject', rows, {})
  if (rows.length !== 1) throw new Error(`缺承载时注入订阅应仍在（推 1 行），实推 ${rows.length} 行`)
  if (rows[0]?.kind !== 'style') throw new Error(`注入行 kind 应为 style，实为 ${String(rows[0]?.kind)}`)
  await dispose()
})

if (results.includes(false)) {
  console.error(`\nprofile 能力探针自检失败 ${results.filter((ok) => !ok).length} 项`)
  process.exit(1)
}
console.log('\nprofile 能力探针自检全部通过')
