#!/usr/bin/env node
/**
 * 浏览器半场构建：esbuild 打包为单文件 CJS + 宿主 factory 壳（设计 D1 / §3.3.1）。
 * 多包适配（设计 D10）：包清单与每包构建声明来自 scripts/workspace-packages.mjs，
 * 逐包构建——每包产出各自的 lib/client.js（浏览器半场）与 Node 半场产物；断言逻辑
 * （壳结构断言 + 模块基线审计）仍单处归属，逐包复用同一套。
 *
 * 产物形态（与宿主内置包的实测形态对齐，AS13）：
 *
 *   window.__ModuleLoader__.load({
 *     id: "<包名>",
 *     factory: (require) => {
 *       var module = { exports: {} };
 *       var exports = module.exports;
 *       Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
 *       …样式注入…
 *       …bundle 体…
 *       return module.exports;
 *     }
 *   })
 *
 * 为什么是这个形态：宿主契约只要求「一段向 `window.__ModuleLoader__.load` 注册 `{id, factory}`
 * 的脚本」，且 factory 内所有副作用延迟到物化时执行。宿主自己的产物也是同一套 CJS 脚手架
 * （`var module` / `var exports` 遮蔽外部同名绑定），照抄它最稳。
 *
 * 三处自持决策：
 *   ① **模块基线 = 产物 require 的唯一合法域**。external 清单直接取自
 *      `scripts/check-require-baseline.mjs` 的 `BASELINE_MODULES`（单一来源，防两处漂移），
 *      构建末尾再用同一模块的审计函数自验——避免「配置了 external 但产物里仍出现基线外
 *      require」（例如某个被内联的依赖自己再 require 了别的包）。
 *   ② **CSS 不走 CSS Modules**。`client/` 下的 `*.css` 按路径序拼成一段纯文本，在 factory 执行时
 *      插一个 `<style>` 进 `document.head`（显式注入函数，`textContent` 赋值不受 HTML 转义影响）。
 *      类名隔离靠命名约定（各包用自己的类名前缀）。样式内容是单一来源：**目录扫描**，
 *      因此源码里的 `import './x.css'` 只作声明用途（esbuild 侧 `loader: {'.css': 'empty'}`），
 *      不会出现「构建器注入一次 + 代码里再注入一次」的双写。
 *   ③ **Node 半场随构建一起落位**。两种形态（见 scripts/workspace-packages.mjs 的注释）：
 *      根包 = 源入口逐字拷进 lib/（单 import 纯 ESM 无需转译）；子包 = lib/ 下 *.ts 源经
 *      esbuild transform 成同名 *.js（保持 ESM 与 import 路径原样、不打包——每个 exports
 *      子路径是宿主 loader 独立 import 的入口）。这样 `files` 清单只带 `lib/`，安装后
 *      `main` 指向的入口必然存在。
 *
 * 失败语义（一律 exit 1，不静默通过）：
 *   · 任一包的浏览器半场入口缺失 → 可行动失败信息（缺哪个文件、怎么补）。
 *   · esbuild 不可解析 → 指名 devDependency 与安装命令。
 *   · 产物越过模块基线 / 壳结构不符 → 指出具体条目，且不落盘。
 *
 * `--self-test`：在 os.tmpdir 下用合成入口 + 合成 CSS 跑完整打包、包装、结构断言、模块基线审计，
 * **不写任何包的 lib/**。因此「管线本身能工作」在没有 client/ 源码的时段也能自证。自检同时覆盖
 * 四条失败支（基线外 require / 未安装依赖 / 入口缺失 / 壳结构断言），证明它们真的会红。
 *
 * 用法：
 *   node scripts/build-client.mjs                  # 逐包产出 lib/index.js + lib/client.js
 *   node scripts/build-client.mjs --self-test      # 管线自检（不写 lib/）
 *   node scripts/build-client.mjs --out <dir>      # 产出到指定目录（默认 lib；相对各包目录）
 *
 * 只依赖 node 内置模块 + devDependencies 的 esbuild。
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BASELINE_MODULES, auditBundle } from './check-require-baseline.mjs'
import { workspacePackages, WORKSPACE_ROOT } from './workspace-packages.mjs'

const ROOT = WORKSPACE_ROOT
const CLIENT_DIR = 'client'
const DEFAULT_OUT_DIR = 'lib'

/** 构建失败：携带逐行可行动信息，由 main 统一打 stderr 并 exit 1。 */
class BuildFailure extends Error {
  constructor(lines) {
    super(lines.join('\n'))
    this.lines = lines
  }
}

const failWith = (lines) => {
  throw new BuildFailure(lines)
}

/** 相对仓库根的路径（仓外路径原样返回，便于自检场景定位）。 */
function relPath(absPath) {
  const rel = relative(ROOT, absPath)
  return rel.startsWith('..') ? absPath : rel.split('\\').join('/')
}

/** 解析 esbuild；缺失时说清「装什么、怎么装」，而不是抛出裸 ERR_MODULE_NOT_FOUND。 */
async function loadEsbuild() {
  try {
    const module = await import('esbuild')
    const build = module.build ?? module.default?.build
    const transform = module.transform ?? module.default?.transform
    if (typeof build !== 'function') failWith(['✘ esbuild 模块已加载但未导出 build 函数', `   模块导出: ${Object.keys(module).join(', ')}`])
    if (typeof transform !== 'function') failWith(['✘ esbuild 模块未导出 transform 函数（子包 Node 半场转译依赖它）', `   模块导出: ${Object.keys(module).join(', ')}`])
    return { build, transform }
  } catch (error) {
    if (error instanceof BuildFailure) throw error
    failWith([
      '✘ 无法解析打包器 esbuild',
      `   原因: ${error.message}`,
      '   esbuild 是本仓的 devDependency（package.json → devDependencies.esbuild = ^0.25.0），只服务构建期',
      '   补齐方式: 在本仓根执行 `pnpm install`，然后重跑本脚本',
    ])
  }
}

/** 递归收集目录下的 CSS 文件（按相对路径排序，保证拼接顺序稳定可复算）。 */
function collectCssFiles(dirAbs) {
  const files = []
  const walk = (absPath) => {
    const stat = statSync(absPath)
    if (stat.isDirectory()) {
      for (const name of readdirSync(absPath).sort()) {
        if (name === 'node_modules' || name.startsWith('.')) continue
        walk(join(absPath, name))
      }
      return
    }
    if (stat.isFile() && absPath.endsWith('.css')) files.push(absPath)
  }
  if (existsSync(dirAbs)) walk(dirAbs)
  return files.sort((left, right) => relPath(left).localeCompare(relPath(right)))
}

/** 递归收集目录下的 TS 文件（子包 Node 半场转译对象；跳过产物与测试）。 */
function collectTsFiles(dirAbs) {
  const files = []
  const walk = (absPath) => {
    const stat = statSync(absPath)
    if (stat.isDirectory()) {
      for (const name of readdirSync(absPath).sort()) {
        if (name === 'node_modules' || name.startsWith('.')) continue
        walk(join(absPath, name))
      }
      return
    }
    if (stat.isFile() && /\.(ts|mts)$/.test(absPath) && !/\.(test|spec)\./.test(absPath)) files.push(absPath)
  }
  if (existsSync(dirAbs)) walk(dirAbs)
  return files.sort((left, right) => relPath(left).localeCompare(relPath(right)))
}

/** 把 CSS 文件拼成一段文本，每段前带来源注释，便于从产物回查出处。 */
function concatCss(files) {
  return files
    .map((file) => `/* ${relPath(file)} */\n${readFileSync(file, 'utf8').trim()}`)
    .join('\n\n')
}

/**
 * 样式注入块：在 factory 内执行，幂等（同 id 的 style 元素已就位则复用并覆盖内容，
 * 避免 HMR / 重复物化叠出两份）。用 `textContent` 赋值，CSS 里的引号与尖括号无需转义。
 */
function renderStyleInjection(styleId, cssLiteral) {
  return [
    '\t\t// 样式注入：普通 CSS 文本 + 显式注入（设计 D1；不用 CSS Modules，类名靠包内约定前缀隔离）',
    '\t\t(() => {',
    `\t\t\tvar STYLE_ID = ${JSON.stringify(styleId)};`,
    '\t\t\tvar CSS = ' + cssLiteral + ';',
    '\t\t\tvar existing = document.getElementById(STYLE_ID);',
    '\t\t\tif (existing !== null) {',
    '\t\t\t\texisting.textContent = CSS;',
    '\t\t\t\treturn;',
    '\t\t\t}',
    '\t\t\tvar style = document.createElement("style");',
    '\t\t\tstyle.id = STYLE_ID;',
    '\t\t\tstyle.textContent = CSS;',
    '\t\t\tdocument.head.appendChild(style);',
    '\t\t})();',
  ].join('\n')
}

/** 套上宿主 factory 壳：`window.__ModuleLoader__.load({ id, factory })`。 */
function wrapBundle(body, css, pkgName, styleId) {
  return `${[
    'window.__ModuleLoader__.load({',
    `\tid: ${JSON.stringify(pkgName)},`,
    '\tfactory: (require) => {',
    '\t\tvar module = { exports: {} };',
    '\t\tvar exports = module.exports;',
    '\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });',
    renderStyleInjection(styleId, JSON.stringify(css)),
    body.trimEnd(),
    '\t\treturn module.exports;',
    '\t}',
    '});',
  ].join('\n')}\n`
}

/** 产物壳结构断言：逐条列 needle，缺任一条即失败（含脚手架行，宿主按该形态解包）。 */
function buildShapeChecks(pkgName, styleId) {
  return [
    ['window.__ModuleLoader__.load', '缺少宿主工厂注册调用 window.__ModuleLoader__.load(...)'],
    [`id: "${pkgName}"`, `factory 壳的 id 必须与字面包名一致（期望 ${pkgName}）`],
    ['factory: (require) =>', 'factory 必须是 `(require) => …` 形态（宿主按该签名注入模块表）'],
    ['var module = { exports: {} };', '缺少 `var module = { exports: {} };` 脚手架（bundle 体的 CJS 语义依赖它）'],
    ['var exports = module.exports;', '缺少 `var exports = module.exports;` 脚手架'],
    ['return module.exports;', 'factory 必须以 `return module.exports;` 结尾'],
    [`var STYLE_ID = "${styleId}"`, '样式注入块缺失，或注入用的 style 元素 id 与本脚本约定不一致'],
    ['document.head.appendChild(style);', '样式注入必须在 factory 内完成（副作用延迟到物化）'],
  ]
}

/** 结构 + 模块基线一起断言；失败即不落盘，并列出全部违规（不逐条中断）。 */
function assertBundleShape(source, label, shapeChecks) {
  const failures = shapeChecks.filter(([needle]) => !source.includes(needle)).map(([, message]) => message)
  const audit = auditBundle(source)
  failures.push(...audit.violations)
  if (failures.length > 0) {
    failWith([`✘ ${label} 未通过构建期自检:`, ...failures.map((failure) => `   - ${failure}`)])
  }
  return audit
}

/**
 * 打一次包并返回包装后的产物（不落盘）。
 * `extraExternal` 只给自检用：让合成入口引用可解析但落在基线外的包，从而单独验证基线审计。
 */
async function buildBundle({ entryPath, clientDir, esbuild, extraExternal = [], pkgName, styleId }) {
  const result = await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    // JSX 走宿主模块表里的 react/jsx-runtime（automatic runtime），不引入第二份 React
    jsx: 'automatic',
    // CSS 内容由本脚本统一承载（见文件头 ②）；源码里的 import 只作声明用途
    loader: { '.css': 'empty', '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl' },
    external: [...BASELINE_MODULES, ...extraExternal],
    // 产物必须可读可对账：不压缩。sourcemap 用 inline——write:false 下 esbuild 不支持 external，
    // 且外置 .map 会让 files 清单多一项、安装后还得跟着搬
    minify: false,
    sourcemap: 'inline',
    legalComments: 'inline',
    charset: 'utf8',
    logLevel: 'silent',
    absWorkingDir: ROOT,
  })

  // write:false 且未给 outfile 时 esbuild 把产出路径记为 "<stdout>"，两种形态都接受
  const jsOutput =
    result.outputFiles.find((file) => file.path.endsWith('.js')) ??
    result.outputFiles.find((file) => file.path === '<stdout>')
  if (jsOutput === undefined) {
    failWith([
      '✘ 打包器未产出 JS 文本',
      `   实际产出: ${result.outputFiles.map((file) => relPath(file.path)).join(', ') || '无'}`,
      '   这是打包器行为异常，请核对 esbuild 版本与本次配置',
    ])
  }

  const cssFiles = collectCssFiles(clientDir)
  const wrapped = wrapBundle(jsOutput.text, concatCss(cssFiles), pkgName, styleId)
  const audit = assertBundleShape(wrapped, `产物（入口 ${relPath(entryPath)}）`, buildShapeChecks(pkgName, styleId))
  return { source: wrapped, audit, cssFiles }
}

/** 入口缺失的可行动失败。 */
function missingEntryFailure(pkg, entryPath) {
  return [
    `✘ 浏览器半场入口缺失: ${relPath(entryPath)}`,
    `   该文件是 ${pkg.name} 的浏览器半场入口（scripts/workspace-packages.mjs 登记），落盘前无法打包`,
    `   补齐路径: 落盘 ${relPath(resolve(ROOT, pkg.dir, pkg.clientEntry))} → 重跑 node scripts/build-client.mjs → 产出 ${join(pkg.dir, DEFAULT_OUT_DIR, 'client.js')}`,
    '   现在可做的事: node scripts/build-client.mjs --self-test（用合成入口自证打包管线，不写 lib/）',
  ]
}

/** 根包 Node 半场产物 = 源入口的逐字拷贝（单 import 的纯 ESM，无需转译）。 */
function copyNodeHalf(pkg, outDirAbs) {
  const sourcePath = resolve(ROOT, pkg.dir, pkg.nodeHalf.source)
  if (!existsSync(sourcePath)) {
    failWith([`✘ Node 半场入口缺失: ${relPath(sourcePath)}`, '   补齐后重跑构建'])
  }
  writeFileSync(join(outDirAbs, 'index.js'), readFileSync(sourcePath, 'utf8'), 'utf8')
}

/** 子包 Node 半场产物 = lib/ 下 *.ts 源的 esbuild transform（保持 ESM 与 import 路径原样）。 */
async function transpileNodeHalf(pkg, esbuild, outDirAbs) {
  const libDir = resolve(ROOT, pkg.dir, 'lib')
  const tsFiles = collectTsFiles(libDir)
  for (const sourcePath of tsFiles) {
    const { code } = await esbuild.transform(readFileSync(sourcePath, 'utf8'), {
      loader: 'ts',
      format: 'esm',
      target: 'node18',
      // transform 不解析 import：路径原样保留（源码按 Node ESM 约定写 .js 后缀，指向产物）
      charset: 'utf8',
      sourcefile: sourcePath,
      logLevel: 'silent',
    })
    const outRel = relative(libDir, sourcePath).replace(/\.(ts|mts)$/, '.js')
    const outPath = join(outDirAbs, outRel)
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, code, 'utf8')
  }
  return tsFiles
}

/** 单包构建：浏览器半场 bundle + Node 半场产物（两个半场一起写，避免「只有半个产物」的中间态）。 */
async function runBuild(pkg, outDirRel, { entryPath, esbuild } = {}) {
  const resolvedEntry = entryPath ?? resolve(ROOT, pkg.dir, pkg.clientEntry)
  if (!existsSync(resolvedEntry)) failWith(missingEntryFailure(pkg, resolvedEntry))
  const es = esbuild ?? await loadEsbuild()

  const { source, audit } = await buildBundle({
    entryPath: resolvedEntry,
    clientDir: resolve(ROOT, pkg.dir, CLIENT_DIR),
    esbuild: es,
    pkgName: pkg.name,
    styleId: `${pkg.name}-styles`,
  })

  const outDirAbs = resolve(ROOT, pkg.dir, outDirRel)
  mkdirSync(outDirAbs, { recursive: true })
  writeFileSync(join(outDirAbs, 'client.js'), source, 'utf8')
  if (pkg.nodeHalf.kind === 'copy-entry') copyNodeHalf(pkg, outDirAbs)
  else await transpileNodeHalf(pkg, es, outDirAbs)

  console.log(`✔ [${pkg.name}] 已产出 ${join(pkg.dir, outDirRel, 'client.js')}（${source.length} 字节）与 Node 半场产物`)
  console.log(
    `✔ [${pkg.name}] 模块基线自检通过：require 字面量 ${audit.literals.length} 项 ⊆ 宿主模块表 ${BASELINE_MODULES.length} 项` +
      (audit.literals.length === 0 ? '（当前产物不引用任何宿主模块）' : `（${audit.literals.join(', ')}）`),
  )
}

/** 自检用：写一份合成 client 源码树（入口 + 一个 CSS 文件），返回目录。 */
function writeSyntheticClient(dirAbs) {
  const themeDir = join(dirAbs, 'theme')
  mkdirSync(themeDir, { recursive: true })
  writeFileSync(
    join(dirAbs, 'apply.ts'),
    [
      "import { jsx } from 'react/jsx-runtime'",
      "import { createStore } from '@deepseek-ai/dsh-client-store'",
      "import './theme/shell.css'",
      'export const apply = () => {',
      "  const node = jsx('div', { children: 'taiji' })",
      '  return { node, store: createStore() }',
      '}',
      '',
    ].join('\n'),
    'utf8',
  )
  writeFileSync(join(themeDir, 'shell.css'), '.taiji-shell-root { color: #2b2a28; }\n', 'utf8')
  return dirAbs
}

/**
 * 管线自检：正向支（合成入口打包 + 壳 + CSS 注入 + 基线审计）与四条失败支（基线外 require /
 * 未安装依赖 / 入口缺失 / 壳结构断言）。不写任何包的 `lib/`。
 */
async function runSelfTest() {
  const esbuild = await loadEsbuild()
  const workDir = mkdtempSync(join(tmpdir(), 'taiji-build-selftest-'))
  const clientDir = writeSyntheticClient(join(workDir, 'client'))
  const pkgName = 'self-test-package'
  const styleId = `${pkgName}-styles`
  const shapeChecks = buildShapeChecks(pkgName, styleId)

  const checks = []
  const assert = (label, condition) => checks.push({ label, ok: Boolean(condition) })

  // 正向支
  const { source, audit, cssFiles } = await buildBundle({
    entryPath: join(clientDir, 'apply.ts'),
    clientDir,
    esbuild,
    pkgName,
    styleId,
  })
  assert('正向支: 产物套上宿主 factory 壳（id / factory / 脚手架 / return）', shapeChecks.every(([needle]) => source.includes(needle)))
  assert('正向支: react/jsx-runtime 与 client-store 都保持 external require', ['react/jsx-runtime', '@deepseek-ai/dsh-client-store'].every((name) => audit.literals.includes(name)))
  assert('正向支: CSS 以普通文本注入（不产出 .css 文件）', cssFiles.length === 1 && source.includes('.taiji-shell-root { color: #2b2a28; }'))
  assert('正向支: CSS 注入带来源注释，可从产物回查出处', source.includes(`/* ${relPath(cssFiles[0])} */`))
  assert('正向支: 样式注入位于 factory 内（副作用延迟到物化）', source.indexOf('document.head.appendChild(style);') > source.indexOf('factory: (require) =>'))

  // 失败支 1：基线外 require（用 extraExternal 让它保留成 require 字面量，单独验证基线审计）
  const outsidePath = join(clientDir, 'outside-apply.ts')
  writeFileSync(outsidePath, "import pad from 'lodash'\nexport const apply = () => pad\n", 'utf8')
  assert(
    '失败支: 基线外 require 被构建期自检拒绝',
    await rejects(() => buildBundle({ entryPath: outsidePath, clientDir, esbuild, extraExternal: ['lodash'], pkgName, styleId }), /基线之外/),
  )

  // 失败支 2：未安装的依赖在打包期即失败
  const unresolvedPath = join(clientDir, 'unresolved-apply.ts')
  writeFileSync(unresolvedPath, "import x from 'definitely-not-installed-pkg'\nexport const apply = () => x\n", 'utf8')
  assert(
    '失败支: 未安装依赖在打包期即失败',
    await rejects(() => buildBundle({ entryPath: unresolvedPath, clientDir, esbuild, pkgName, styleId }), /definitely-not-installed-pkg/),
  )

  // 失败支 3：入口缺失 → 可行动信息，且指名文件与归属包
  const absentPath = join(workDir, 'client', 'absent-apply.ts')
  const fakePkg = { name: pkgName, dir: workDir, clientEntry: 'client/absent-apply.ts' }
  let missingMessage = null
  try {
    await runBuild(fakePkg, join(workDir, 'lib'), { esbuild })
  } catch (error) {
    if (error instanceof BuildFailure) missingMessage = error.lines.join('\n')
  }
  assert('失败支: 入口缺失时构建失败（不静默放行）', missingMessage !== null)
  assert('失败支: 入口缺失信息指明缺哪个文件', missingMessage !== null && missingMessage.includes(basename(absentPath)))
  assert('失败支: 入口缺失信息给出下一步命令', missingMessage !== null && missingMessage.includes('--self-test'))

  // 失败支 4：壳结构异常必须被拒（防止包装器被改坏后仍产出自欺产物）
  let shapeRejected = false
  try {
    assertBundleShape('window.__ModuleLoader__.load({ id: "broken" });', '自检用坏产物', shapeChecks)
  } catch {
    shapeRejected = true
  }
  assert('失败支: 壳结构不符时断言拒绝', shapeRejected)

  const failures = checks.filter((check) => !check.ok).map((check) => check.label)
  if (failures.length > 0) {
    failWith(['✘ 构建管线自检失败:', ...failures.map((label) => `   - ${label}`)])
  }

  console.log(`✔ 构建管线自检通过（${checks.length} 项：合成入口打包 → factory 壳 → CSS 注入 → 结构断言 → 模块基线审计）`)
  console.log(`✔ 失败支均已证明会红：基线外 require / 未安装依赖 / 入口缺失（指明 ${'client/absent-apply.ts'} 与归属包）/ 壳结构不符`)
  // 自检产物留在 tmp 只制造噪音；它全部是本次运行生成的合成文件，直接清掉
  rmSync(workDir, { recursive: true, force: true })
  console.log(`  （自检全程在 ${workDir} 内进行并已清理，未写入任何包的 ${DEFAULT_OUT_DIR}/）`)
}

/** 断言一段异步操作以失败告终，且错误信息命中期望模式。 */
async function rejects(run, pattern) {
  try {
    await run()
    return false
  } catch (error) {
    return pattern.test(error instanceof BuildFailure ? error.message : String(error?.message ?? error))
  }
}

async function main() {
  const argv = process.argv.slice(2)
  const selfTest = argv.includes('--self-test')
  const outIndex = argv.indexOf('--out')
  const outDirRel = outIndex >= 0 && argv[outIndex + 1] !== undefined ? argv[outIndex + 1] : DEFAULT_OUT_DIR

  try {
    if (selfTest) {
      await runSelfTest()
      return
    }
    // 逐包构建（包清单来自 scripts/workspace-packages.mjs，与 pnpm-workspace.yaml 声明对账）
    const packages = workspacePackages()
    const esbuild = await loadEsbuild()
    for (const pkg of packages) {
      await runBuild(pkg, outDirRel, { esbuild })
    }
    console.log(`✔ 已逐包构建 ${packages.length} 个包（${packages.map((pkg) => pkg.name).join(', ')}）`)
  } catch (error) {
    if (error instanceof BuildFailure) {
      console.error(error.lines.join('\n'))
      process.exitCode = 1
      return
    }
    console.error(`✘ 构建异常: ${error?.stack ?? error}`)
    process.exitCode = 1
  }
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  await main()
}
