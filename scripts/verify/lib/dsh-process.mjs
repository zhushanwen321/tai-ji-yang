/**
 * 隔离 DSH_HOME 的 dsh web 进程生命周期：安装插件、启动、从 stdout 解析认证 URL、
 * HTTP 探活、按记录 PID（进程组）清理。
 *
 * 安全纪律：
 *  - 一切凭据（URL / token）从启动进程的 stdout 解析或由调用方给，绝不硬编码；
 *  - DSH_HOME 环境变量指向调用方显式给的隔离目录（args 层已拒绝 ~/.dsh）；
 *  - 清理只对自己 spawn 的进程按 PID（负 PID = 进程组）发信号，不做按名字的宽泛进程匹配；
 *  - 安装与启动命令失败时输出尾部日志 + 可行动恢复动作，不静默。
 */
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { dshSpawnCommand, parseDshUrlLine } from './args.mjs'

const PLUGIN_ID = 'tai-ji-yang-shell'

/** sleep（就绪轮询用）。 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * HTTP 探活：URL 可达且返回 HTML 才算就绪（进程活着 ≠ 就绪）。
 * @param {string} url
 * @param {number} timeoutMs - 单次请求超时。
 * @returns {Promise<{ ok: boolean, status?: number, reason?: string }>}
 */
export async function probeUrl(url, timeoutMs = 5000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const initial = await fetch(url, { signal: controller.signal, redirect: 'manual' })
    let response = initial
    // dsh web 的认证 URL 先以 303 写入 HttpOnly Cookie，再转到同源首页。
    // 手工带 Cookie 跟这一次跳转；否则 Node fetch 会在去掉 token 的首页得到 401。
    if (initial.status >= 300 && initial.status < 400) {
      const location = initial.headers.get('location')
      const cookie = initial.headers.get('set-cookie')?.split(';', 1)[0]
      const target = location === null ? null : new URL(location, url)
      if (target === null || cookie === undefined || target.origin !== new URL(url).origin) {
        return { ok: false, status: initial.status, reason: `HTTP ${initial.status}（认证重定向缺同源目标或 Cookie）` }
      }
      response = await fetch(target, { signal: controller.signal, redirect: 'manual', headers: { cookie } })
    }
    if (response.status !== 200) return { ok: false, status: response.status, reason: `HTTP ${response.status}` }
    const body = await response.text()
    // 宿主 index 页必含 #root 挂载点；拿不到正文按不可达处理
    if (!body.includes('id="root"') && !body.includes("<div id='root'>")) {
      return { ok: false, status: response.status, reason: '响应不含 root 挂载点（可能不是 dsh web 页面）' }
    }
    return { ok: true, status: response.status }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timer)
  }
}

/** 进程组终止：SIGTERM → 宽限期内未退 → SIGKILL。以进程组存活为判定，组长提前退出时
 *  仍清理可能忽略信号的后代（负 PID = 整个进程组）。 */
export function killProcessTree(pid, { graceMs = 5000 } = {}) {
  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve()
    }
    const signal = (sig) => {
      try {
        if (process.platform === 'win32') process.kill(pid, sig)
        else process.kill(-pid, sig) // 负 PID = 整个进程组
      } catch {
        // 组不存在 = 清理目标已达成；EPERM 保留由存活轮询兜底
      }
    }
    const groupAlive = () => {
      try {
        if (process.platform === 'win32') process.kill(pid, 0)
        else process.kill(-pid, 0)
        return true
      } catch (error) {
        return error?.code === 'EPERM'
      }
    }
    try {
      signal('SIGTERM')
    } catch {
      finish()
      return
    }
    const poll = setInterval(() => {
      if (!groupAlive()) {
        clearInterval(poll)
        clearTimeout(timer)
        finish()
      }
    }, 200)
    const timer = setTimeout(() => {
      clearInterval(poll)
      signal('SIGKILL')
      setTimeout(finish, 200)
    }, graceMs)
  })
}

/**
 * 在隔离 DSH_HOME 里把本包装进 profile（`dsh plugin --profile <p> add <repo>`）。
 * 同步执行（安装完成才允许启动）；失败抛带恢复动作的错误。
 * @param {object} input
 * @param {string} input.dshBin
 * @param {string} input.dshHome - 隔离目录（调用方已过 args 安全校验）。
 * @param {string} input.profile
 * @param {string} input.repo - 本仓根（lib/ 产物所在）。
 * @param {number} [input.timeoutMs]
 * @returns {{ ok: true, output: string } | { ok: false, reason: string, hint: string, output: string }}
 */
export function installPlugin({ dshBin, dshHome, profile, repo, timeoutMs = 180000 }) {
  const libEntry = path.join(repo, 'lib', 'index.js')
  const libClient = path.join(repo, 'lib', 'client.js')
  if (!fs.existsSync(libEntry) || !fs.existsSync(libClient)) {
    return {
      ok: false,
      reason: 'lib/ 产物缺失（安装要求 lib/index.js 与 lib/client.js 已构建）',
      hint: '先执行 pnpm build 产出 lib/，再重跑验收',
      output: '',
    }
  }
  const command = dshSpawnCommand(dshBin)
  const result = spawnSync(command[0], [...command.slice(1), 'plugin', '--profile', profile, 'add', repo], {
    encoding: 'utf8',
    timeout: timeoutMs,
    env: { ...process.env, DSH_HOME: dshHome },
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (result.error) {
    return {
      ok: false,
      reason: `dsh plugin add 启动失败：${result.error.message}`,
      hint: result.error.message.includes('ENOENT')
        ? `确认 --dsh-bin 路径存在且可执行：${dshBin}`
        : '检查 dsh 可执行形态（.js 文件会用当前 node 执行）',
      output,
    }
  }
  if (result.status !== 0) {
    const needsPnpm = /pnpm/i.test(output)
    return {
      ok: false,
      reason: `dsh plugin --profile ${profile} add 退出码 ${result.status ?? 'signal'}`,
      hint: needsPnpm
        ? 'dsh plugin 把安装转发给 pnpm：确认 PATH 上有 pnpm 后重试'
        : `看输出定位（隔离 home：${dshHome}）；常见为版本门禁拒绝或 store 迁移问题（见 README 排障）`,
      output,
    }
  }
  return { ok: true, output }
}

/**
 * 自启隔离 dsh web：spawn → 监听 stdout 抓 `dsh web: <url>` 行 → HTTP 探活就绪。
 * 进程以 detached 形态起（作进程组长），stop() 按组终止（按 PID 发信号，不按名字匹配）。
 * @param {object} input
 * @param {string} input.dshBin
 * @param {string} input.dshHome
 * @param {string} input.profile
 * @param {number} [input.port] - 缺省不传 --port（宿主按配置选）；0 = 宿主让 OS 派。
 * @param {string[]} [input.extraArgs] - 透传给 web 子命令的额外参数。
 * @param {number} [input.timeoutMs] - URL 行 + 探活的总预算。
 * @param {(line: string) => void} [input.onLine] - 每行 stdout/stderr 回调（运行日志）。
 * @returns {Promise<{ url: string, token: string, pid: number, stop(): Promise<void>, outputTail(): string }>}
 * @throws {Error} URL 行超时 / 探活失败（message 含 stdout 尾部与恢复动作）。
 */
export async function launchDshWeb({ dshBin, dshHome, profile, port, extraArgs = [], timeoutMs = 120000, onLine }) {
  const command = dshSpawnCommand(dshBin)
  const args = [
    ...command.slice(1),
    '--profile',
    profile,
    '--no-open',
    ...(port !== undefined ? ['--port', String(port)] : []),
    ...extraArgs,
  ]
  const child = spawn(command[0], args, {
    env: { ...process.env, DSH_HOME: dshHome },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true, // 进程组长：stop 按组终止（dsh 可能带子进程）
  })

  const outputLines = []
  const recordLine = (line) => {
    outputLines.push(line)
    if (outputLines.length > 400) outputLines.shift()
    onLine?.(line)
  }
  let stdoutBuffer = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk
    let newlineAt = stdoutBuffer.indexOf('\n')
    while (newlineAt !== -1) {
      recordLine(stdoutBuffer.slice(0, newlineAt))
      stdoutBuffer = stdoutBuffer.slice(newlineAt + 1)
      newlineAt = stdoutBuffer.indexOf('\n')
    }
  })
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk) => {
    for (const line of chunk.split('\n')) if (line !== '') recordLine(`[stderr] ${line}`)
  })

  const outputTail = () => redactOutputTail(outputLines.join('\n').slice(-4000))
  const stop = async () => {
    // 组长已退出时也要清一次：后代进程可能仍在运行。
    await killProcessTree(child.pid)
  }

  // URL 行等待（读 stdout，不猜端口不猜 token）
  const deadline = Date.now() + timeoutMs
  let authUrl = null
  try {
    while (Date.now() < deadline) {
      // 已退出但还没有 URL 行 = 启动失败，立刻带日志报错
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(
          `dsh web 进程提前退出（code=${child.exitCode ?? ''} signal=${child.signalCode ?? ''}）。`
          + `恢复：看下方输出定位（常见为版本门禁 / 端口占用 / profile 损坏）。\n--- dsh 输出尾部 ---\n${outputTail()}`,
        )
      }
      for (const line of outputLines) {
        const parsed = parseDshUrlLine(line)
        if (parsed !== null) {
          authUrl = parsed.url
          break
        }
      }
      if (authUrl !== null) break
      await sleep(200)
    }
    if (authUrl === null) {
      throw new Error(
        `等待 dsh web URL 行超时（${timeoutMs}ms）。恢复：确认该 dsh 版本会打印 "dsh web: <url>" 就绪行；`
        + `也可改用 --url 模式连接已手工启动的实例。\n--- dsh 输出尾部 ---\n${outputTail()}`,
      )
    }
    // HTTP 探活：URL 行出现 ≠ 就绪（监听后仍可能短暂 5xx / 连接拒绝）
    let probe = { ok: false, reason: 'not probed' }
    const probeDeadline = Date.now() + Math.min(timeoutMs, 30000)
    while (Date.now() < probeDeadline) {
      probe = await probeUrl(authUrl)
      if (probe.ok) break
      await sleep(300)
    }
    if (!probe.ok) {
      throw new Error(
        `dsh web URL 探活失败：${probe.reason}。恢复：确认 URL 可在浏览器打开；隔离 home：${dshHome}。`
        + `\n--- dsh 输出尾部 ---\n${outputTail()}`,
      )
    }
    let token = ''
    try {
      token = new URL(authUrl).searchParams.get('token') ?? ''
    } catch {
      token = ''
    }
    return { url: authUrl, token, pid: child.pid, stop, outputTail }
  } catch (error) {
    // 启动失败 = 自己拉起的进程自己收（不留孤儿）
    await stop()
    throw error
  }
}

/** dsh 输出里的公开日志形态：所有 token 查询参数脱敏（标准就绪行 + 异常/多 URL 行都覆盖）。 */
export function redactOutputTail(outputTail) {
  return outputTail
    .split('\n')
    .map((line) => line.replace(/([?&]token=)[^&\s)]+/g, '$1REDACTED'))
    .join('\n')
}

/**
 * 在隔离 DSH_HOME 里跑一条 dsh 子命令（lifecycle 场景的 remove / dump-config 等）。
 * 同步执行，返回结构化结果；调用方按 status 判定并给恢复动作。
 * @param {object} input
 * @param {string} input.dshBin
 * @param {string} input.dshHome
 * @param {string[]} input.args - 子命令参数（如 ['plugin', '--profile', 'web', 'remove', PLUGIN_ID]）。
 * @param {number} [input.timeoutMs]
 * @returns {{ status: number | null, stdout: string, stderr: string, error?: string }}
 */
export function runDshCommand({ dshBin, dshHome, args, timeoutMs = 120000 }) {
  const command = dshSpawnCommand(dshBin)
  const result = spawnSync(command[0], [...command.slice(1), ...args], {
    encoding: 'utf8',
    timeout: timeoutMs,
    env: { ...process.env, DSH_HOME: dshHome },
  })
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    ...(result.error !== undefined ? { error: result.error.message } : {}),
  }
}

/** 取路径的真实位置：目标不存在时回溯到最近存在祖先再拼接，防符号链接父目录绕过。 */
function realPathBestEffort(target) {
  let current = path.resolve(target)
  const tail = []
  for (;;) {
    try {
      const real = fs.realpathSync(current)
      return tail.length === 0 ? real : path.join(real, ...tail.reverse())
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      const parent = path.dirname(current)
      tail.push(path.basename(current))
      if (parent === current) throw error
      current = parent
    }
  }
}

/** 判断 dsh bin 可被 spawn 解析：路径形态查文件；裸命令按 PATH 逐目录查。 */
export function commandExists(dshBin, pathEnv = process.env.PATH ?? '') {
  if (dshBin === undefined || dshBin === '') return false
  if (dshBin.includes('/')) return fs.existsSync(dshBin)
  return pathEnv
    .split(path.delimiter)
    .filter((dir) => dir !== '')
    .some((dir) => {
      const candidate = path.join(dir, dshBin)
      try {
        return fs.statSync(candidate).isFile()
      } catch {
        return false
      }
    })
}

/** 隔离 DSH_HOME 断言：按真实路径比对，等于或位于 ~/.dsh/**、家目录、根之下都拒绝。 */
export function assertIsolatedHome(dshHome, homedir) {
  const resolved = path.resolve(dshHome)
  const real = realPathBestEffort(resolved)
  const realUserHome = realPathBestEffort(path.resolve(homedir))
  const protectedRoot = path.join(realUserHome, '.dsh')
  const insideProtected = relativeInside(protectedRoot, real)
  const insideHome = relativeInside(realUserHome, real)
  if (insideProtected || real === realUserHome || insideHome || real === path.parse(realUserHome).root) {
    throw new Error(`dshHome 真实路径指向受保护目录或其子路径（${resolved} -> ${real}）：拒绝启动`)
  }
  return real
}

/** child 与 root 相等或位于 root 内时返回 true（双方都已 resolve/realpath）。 */
function relativeInside(root, child) {
  const relative = path.relative(root, child)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}
