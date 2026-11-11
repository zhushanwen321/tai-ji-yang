/**
 * lib 产物新鲜度核对：lib/index.js 与 index.js 逐字一致、lib/client.js 不落后于 client/ 源码。
 *
 * 这是 doctor 的初筛（不是构建）：client.js 用「源文件 mtime 是否晚于产物 mtime」启发式——
 * 真正的逐字节对账由构建器自证（build-client --self-test）承担，这里只挡「改了源码忘了
 * pnpm build 就跑验收」最常见的假阳性来源。
 */
import fs from 'node:fs'
import path from 'node:path'

/** 递归收集源文件（相对路径形态，排序稳定）。 */
function collectSourceFiles(dirAbs, repoRoot) {
  const files = []
  const walk = (abs) => {
    let entries
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      const child = path.join(abs, entry.name)
      if (entry.isDirectory()) walk(child)
      // CSS 与构建口径一致全量收集（build-client.mjs collectCssFiles 不排除任何 css）
      else if (/\.css$/.test(entry.name)) files.push(path.relative(repoRoot, child))
      // ts/tsx 与构建口径对齐：*.test.* / *.spec.* 不进任何产物（build-client.mjs
      // collectTsFiles 同款排除；浏览器半场是 esbuild 入口打包，测试文件不被入口引用），
      // 不排除会把「只改测试文件未重 build」误判为产物落后
      else if (/\.(?:ts|tsx)$/.test(entry.name) && !/\.(?:test|spec)\./.test(entry.name)) files.push(path.relative(repoRoot, child))
    }
  }
  walk(dirAbs)
  return files
}

/**
 * 核对 lib 产物不落后于源码。
 * @param {string} repo - 仓根绝对路径。
 * @returns {{ ok: boolean, checks: { name: string, ok: boolean, detail: string }[], hint?: string }}
 */
export function checkLibFresh(repo) {
  const checks = []
  const entrySrc = path.join(repo, 'index.js')
  const entryLib = path.join(repo, 'lib', 'index.js')
  const clientLib = path.join(repo, 'lib', 'client.js')
  const clientSrcDir = path.join(repo, 'client')

  // ① Node 半场产物 = 源码逐字拷贝（构建规则），可直接比对
  if (!fs.existsSync(entryLib)) {
    checks.push({ name: 'lib/index.js 在场', ok: false, detail: '产物缺失' })
  } else if (!fs.existsSync(entrySrc)) {
    checks.push({ name: 'lib/index.js 在场', ok: false, detail: '源码 index.js 缺失（仓不完整）' })
  } else {
    const same = fs.readFileSync(entrySrc, 'utf8') === fs.readFileSync(entryLib, 'utf8')
    checks.push({ name: 'lib/index.js 与 index.js 逐字一致', ok: same, detail: same ? '一致' : '内容漂移（产物旧于源码）' })
  }

  // ② 浏览器半场产物在场
  const clientLibExists = fs.existsSync(clientLib)
  checks.push({ name: 'lib/client.js 在场', ok: clientLibExists, detail: clientLibExists ? `${fs.statSync(clientLib).size} B` : '产物缺失' })

  // ③ mtime 初筛：client/ 源文件晚于 lib/client.js = 产物落后（提示先构建）
  let staleSources = []
  if (clientLibExists && fs.existsSync(clientSrcDir)) {
    const libMtime = fs.statSync(clientLib).mtimeMs
    staleSources = collectSourceFiles(clientSrcDir, repo).filter((rel) => {
      try {
        return fs.statSync(path.join(repo, rel)).mtimeMs > libMtime
      } catch {
        return false
      }
    })
  }
  checks.push({
    name: 'client/ 源码不晚于 lib/client.js（mtime 初筛）',
    ok: staleSources.length === 0,
    detail: staleSources.length === 0 ? '无落后源文件' : `落后源文件：${staleSources.slice(0, 8).join(', ')}${staleSources.length > 8 ? ` 等 ${staleSources.length} 个` : ''}`,
  })

  const ok = checks.every((c) => c.ok)
  return {
    ok,
    checks,
    hint: ok ? undefined : '先执行 pnpm build 产出 lib/，再重跑验收（lib/ 随仓库交付，产物旧于源码会让真机验的不是当前代码）',
  }
}
