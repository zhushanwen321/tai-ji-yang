/**
 * 验收 runner 的参数解析与安全校验（纯函数，无进程副作用，可被单测直测）。
 *
 * 设计约束（来源：verify-taiji-yang 技能契约）：
 *  - 两种执行形态二选一：`--url`（连接已为测试启动的实例）或 `--dsh-bin` + `--dsh-home`
 *    （runner 在隔离 DSH_HOME 里自启 dsh web）。缺一或同时给两套都拒绝。
 *  - 测试环境必须显式给隔离 DSH_HOME 或测试 URL：自启模式缺 `--dsh-home` 直接拒绝，
 *    绝不回落到用户真实 `~/.dsh`（runner 写的是临时目录，碰用户 profile 属事故）。
 *  - run-id / profile 等落盘路径成分只允许 `[A-Za-z0-9._-]` 且禁止 `..`
 *    （防 `--run-id '../../tmp'` 式路径穿越）。
 *  - `--url` 只接受本机回环地址：验收 URL 自带 token，禁止把凭据指向远端主机。
 *  - 不硬编码 token / 端口 / 本机绝对路径：一切由调用方给或从 dsh stdout 解析。
 */
import path from 'node:path'

/** 落盘路径成分的安全形态：首字符字母数字（防 `-` 开头被当 flag），禁止路径分隔符与 `..`。 */
const SAFE_TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/** dsh web URL 行前缀（宿主 web-app 的就绪行；URL 后可带宿主附加括注，如 `(LAN: ...)`）。 */
const DSH_URL_LINE_PREFIX = 'dsh web: '

/** loopback 主机名集合：验收 URL 的 host 必须落在其中（token 只绑本机）。 */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])

/** 所有带值 flag：解析位置参数时跳过它们的值，避免把值误当场景名。 */
const VALUE_FLAGS = new Set([
  'url',
  'dsh-bin',
  'dsh-home',
  'port',
  'profile',
  'scenarios',
  'artifacts-dir',
  'run-id',
  'timeout-ms',
  'dsh-arg',
])

export const KNOWN_SCENARIO_IDS = ['brand', 'head', 'theme', 'projects', 'lifecycle']

/**
 * 解析失败形态：reason 面向调用方，hint 给恢复动作（错误信息必须可操作）。
 * @typedef {{ ok: false, reason: string, hint: string }} ParseFailure
 */

/**
 * 解析成功形态。mode = 'url'（连接已有实例）| 'dsh'（自启隔离实例）。
 * @typedef {{
 *   ok: true,
 *   mode: 'url' | 'dsh',
 *   url?: string,
 *   dshBin?: string,
 *   dshHome?: string,
 *   port?: number,
 *   profile: string,
 *   scenarios: string[],
 *   artifactsDir?: string,
 *   runId: string,
 *   strict: boolean,
 *   keep: boolean,
 *   headless: boolean,
 *   timeoutMs: number,
 *   dshArgs: string[],
 * }} ParsedVerifyArgs
 */

/** 取 `--<name> <value>` 形态的单值。 */
function flagValue(argv, name) {
  const index = argv.indexOf(`--${name}`)
  if (index === -1) return undefined
  return argv[index + 1]
}

function hasFlag(argv, name) {
  return argv.includes(`--${name}`)
}

/** 收集可重复 flag（`--dsh-arg <a> --dsh-arg <b>` 形态），跳过相邻 flag。 */
function collectValues(argv, name) {
  const values = []
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === `--${name}`) {
      const value = argv[i + 1]
      if (value !== undefined && !value.startsWith('--')) values.push(value)
    }
  }
  return values
}

/** 位置参数 = 非 flag 且不在任何带值 flag 消费位上的参数。 */
function positionalArgs(argv) {
  const rest = []
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token.startsWith('--')) {
      if (VALUE_FLAGS.has(token.slice(2))) i += 1
      continue
    }
    rest.push(token)
  }
  return rest
}

/**
 * 校验落盘路径成分。返回 null = 合法；返回字符串 = 拒绝理由（面向调用方）。
 * @param {string} value
 * @param {string} label - flag 名，用于错误信息。
 */
export function safeTokenOrReason(value, label) {
  if (!SAFE_TOKEN_RE.test(value) || value.includes('..')) {
    return `${label} 非法：${JSON.stringify(value)}（只允许字母数字与 . _ -，禁止路径分隔符与 ".."，防证据目录穿越）`
  }
  return null
}

/** URL 是否本机回环（验收 URL 带 token，只允许指向本机）。 */
export function isLoopbackUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    return LOOPBACK_HOSTS.has(parsed.hostname) || LOOPBACK_HOSTS.has(parsed.host)
  } catch {
    return false
  }
}

/** 去掉结尾多余斜杠并拒根目录；返回 null 表示非法。 */
function normalizeDir(rawDir) {
  const resolved = rawDir === '/' ? '/' : rawDir.replace(/\/+$/, '') || '/'
  return resolved === '/' ? null : resolved
}

/**
 * 解析 runner argv。任何拒绝都返回 ParseFailure，由调用方决定输出与退出码。
 * @param {string[]} argv - process.argv.slice(2)。
 * @param {string} homedir - 当前用户家目录（注入便于单测；校验 `--dsh-home` 不得是 `~/.dsh`）。
 * @returns {ParsedVerifyArgs | ParseFailure}
 */
export function parseVerifyArgs(argv, homedir) {
  const url = flagValue(argv, 'url')
  const dshBin = flagValue(argv, 'dsh-bin')
  const dshHomeRaw = flagValue(argv, 'dsh-home')

  // 模式互斥 + 必选其一
  if (url !== undefined && (dshBin !== undefined || dshHomeRaw !== undefined)) {
    return { ok: false, reason: '--url 与 --dsh-bin/--dsh-home 互斥（连接已有实例与自启隔离实例二选一）', hint: '只保留一种模式的参数后重试' }
  }
  if (url === undefined && dshBin === undefined) {
    return {
      ok: false,
      reason: '缺少执行模式：需要 --url <测试URL> 或 --dsh-bin <dsh可执行> + --dsh-home <隔离目录>',
      hint: '示例：node scripts/verify/run.mjs --url "http://127.0.0.1:<端口>/?token=<token>" --scenarios brand\n'
        + '      或 node scripts/verify/run.mjs --dsh-bin dsh --dsh-home /tmp/verify-dsh-home --scenarios all',
    }
  }
  if (dshBin !== undefined && dshHomeRaw === undefined) {
    return {
      ok: false,
      reason: '自启模式必须显式给 --dsh-home（隔离 DSH 目录）',
      hint: 'runner 默认拒绝触碰用户真实 ~/.dsh；给一个临时目录，如 --dsh-home /tmp/verify-taiji-yang-home',
    }
  }

  // --url 模式的安全边界：回环 + 协议
  if (url !== undefined && !isLoopbackUrl(url)) {
    return {
      ok: false,
      reason: `--url 必须是本机回环地址（127.0.0.1 / localhost / [::1]），收到 ${JSON.stringify(url)}`,
      hint: 'dsh web 的 token 只绑本机；验收一律连本机实例',
    }
  }

  // 隔离校验：--dsh-home 不得解析到用户真实 DSH 目录、家目录根或文件系统根
  let dshHome
  if (dshHomeRaw !== undefined) {
    const expanded = dshHomeRaw === '~' || dshHomeRaw.startsWith('~/') ? `${homedir}${dshHomeRaw.slice(1)}` : dshHomeRaw
    const protectedDsh = path.join(homedir, '.dsh')
    if (expanded === protectedDsh || expanded.startsWith(`${protectedDsh}/`)) {
      return {
        ok: false,
        reason: '--dsh-home 指向用户真实 DSH 目录或其子路径（~/.dsh/**），runner 默认拒绝',
        hint: '给一个一次性目录（如 mktemp -d 的产物）；验收状态都应落在临时环境',
      }
    }
    const normalized = normalizeDir(expanded)
    if (normalized === null || normalized === homedir.replace(/\/+$/, '')) {
      return { ok: false, reason: `--dsh-home 不能是家目录或文件系统根：${expanded}`, hint: '给一个专用子目录，如 /tmp/verify-taiji-yang-home' }
    }
    dshHome = normalized
  }

  // 落盘路径成分
  const runId = flagValue(argv, 'run-id') ?? defaultRunId()
  const runIdProblem = safeTokenOrReason(runId, '--run-id')
  if (runIdProblem !== null) return { ok: false, reason: runIdProblem, hint: '改用字母数字与 . _ - 组成的 id' }
  const profile = flagValue(argv, 'profile') ?? 'web'
  const profileProblem = safeTokenOrReason(profile, '--profile')
  if (profileProblem !== null) return { ok: false, reason: profileProblem, hint: 'profile 名必须是单一目录名' }

  // 端口
  const portRaw = flagValue(argv, 'port')
  let port
  if (portRaw !== undefined) {
    if (!/^\d+$/.test(portRaw)) return { ok: false, reason: `--port 必须是数字，收到 ${JSON.stringify(portRaw)}`, hint: '如 --port 3080；0 = 让操作系统派一个空闲端口' }
    port = Number(portRaw)
  }

  // 超时
  const timeoutRaw = flagValue(argv, 'timeout-ms')
  let timeoutMs = 120000
  if (timeoutRaw !== undefined) {
    if (!/^\d+$/.test(timeoutRaw)) return { ok: false, reason: `--timeout-ms 必须是数字，收到 ${JSON.stringify(timeoutRaw)}`, hint: '毫秒数，如 --timeout-ms 180000' }
    timeoutMs = Number(timeoutRaw)
  }

  // 场景清单：缺省 all；支持内置 id 列表与场景文件路径；多个位置参数合并成清单
  const positional = positionalArgs(argv)
  const scenariosRaw = flagValue(argv, 'scenarios') ?? (positional.length > 0 ? positional.join(',') : undefined)
  let scenarios
  if (scenariosRaw === undefined || scenariosRaw === 'all') {
    scenarios = [...KNOWN_SCENARIO_IDS]
  } else {
    scenarios = scenariosRaw.split(',').map((entry) => entry.trim()).filter((entry) => entry !== '')
    if (scenarios.length === 0) {
      return {
        ok: false,
        reason: '--scenarios 清单为空（不能生成“零断言 pass”）',
        hint: '用逗号分隔内置场景 id，或省略该参数跑 all',
      }
    }
    const unknown = scenarios.filter((entry) => !KNOWN_SCENARIO_IDS.includes(entry) && !entry.endsWith('.mjs'))
    if (unknown.length > 0) {
      return {
        ok: false,
        reason: `未知场景：${unknown.join(', ')}（内置：${KNOWN_SCENARIO_IDS.join(', ')}）`,
        hint: '用逗号分隔内置场景 id，或给场景 .mjs 文件路径',
      }
    }
    // 卸载会移除插件，后续场景失去被测对象；参数层强制 lifecycle 最后，避免静默跳场景。
    const lifecycleIndex = scenarios.findIndex((entry) => path.basename(entry, '.mjs') === 'lifecycle')
    if (lifecycleIndex !== -1 && lifecycleIndex !== scenarios.length - 1) {
      return {
        ok: false,
        reason: 'lifecycle 场景必须排在最后（卸载后其余场景不可执行）',
        hint: `调整顺序为 ...,${scenarios.filter((entry) => path.basename(entry, '.mjs') !== 'lifecycle').join(',')},lifecycle`,
      }
    }
  }

  const artifactsDirRaw = flagValue(argv, 'artifacts-dir')
  let artifactsDir
  if (artifactsDirRaw !== undefined) {
    const normalized = normalizeDir(artifactsDirRaw)
    if (normalized === null || normalized === homedir.replace(/\/+$/, '')) {
      return { ok: false, reason: `--artifacts-dir 不能是家目录或文件系统根：${artifactsDirRaw}`, hint: '给一个具体目录，verdict.json 会写在这个目录根上' }
    }
    artifactsDir = normalized
  }

  // 证据绝不落隔离 DSH_HOME 内：显式目录与缺省根都要判，防调用方把隔离 home 建在缺省根下。
  if (dshHome !== undefined) {
    const defaultArtifactsRoot = path.join(homedir, '.agents', 'skill-data', 'verify-taiji-yang')
    const effectiveArtifacts = path.resolve(artifactsDir ?? defaultArtifactsRoot)
    const homeReal = path.resolve(dshHome)
    const relativeToHome = path.relative(homeReal, effectiveArtifacts)
    if (relativeToHome === '' || (!relativeToHome.startsWith('..') && !path.isAbsolute(relativeToHome))) {
      return {
        ok: false,
        reason: `证据目录不得等于或位于 --dsh-home 内（清理会删除证据）：${effectiveArtifacts}`,
        hint: '给一个独立证据目录（如 /tmp/taiji-yang-verify），与隔离 DSH_HOME 分开',
      }
    }
  }

  return {
    ok: true,
    mode: url !== undefined ? 'url' : 'dsh',
    url,
    dshBin,
    dshHome,
    port,
    profile,
    scenarios,
    artifactsDir,
    runId,
    strict: hasFlag(argv, 'strict'),
    keep: hasFlag(argv, 'keep'),
    headless: !hasFlag(argv, 'headed'),
    timeoutMs,
    dshArgs: collectValues(argv, 'dsh-arg'),
  }
}

/**
 * 证据目录布局（单一权威，run.mjs 与测试共用）：
 *   artifactsDir 缺省 = ~/.agents/skill-data/verify-taiji-yang（不拼 runId）；
 *   runDir = <artifactsDir>/<runId>（场景目录再拼一层 <scenarioId>）。
 * 显式 --artifacts-dir 时原样使用，runId 仍只出现在 runDir 一层。
 * @param {object} input
 * @param {string | undefined} input.artifactsDir - 已过安全校验的显式目录（可缺省）。
 * @param {string} input.runId - 已过安全校验（safeTokenOrReason）。
 * @param {string} input.homedir
 * @returns {{ artifactsDir: string, runDir: string }}
 */
export function resolveArtifactsLayout({ artifactsDir, runId, homedir }) {
  const root = artifactsDir ?? `${homedir}/.agents/skill-data/verify-taiji-yang`
  return { artifactsDir: root, runDir: `${root}/${runId}` }
}

/** 默认 runId：UTC 时间戳（秒级，可排序、复跑可辨识）。 */
export function defaultRunId(now = new Date()) {
  const pad = (n, width) => String(n).padStart(width, '0')
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1, 2)}${pad(now.getUTCDate(), 2)}-${pad(now.getUTCHours(), 2)}${pad(now.getUTCMinutes(), 2)}${pad(now.getUTCSeconds(), 2)}`
}

/**
 * dsh bin 的执行形态：.js / .mjs / .cjs 用当前 node 执行（spawn args 形态返回
 * [process.execPath, bin]），其余按可执行文件直接 spawn（返回 [bin]）。
 * @param {string} dshBin
 * @returns {string[]}
 */
export function dshSpawnCommand(dshBin) {
  if (/\.(?:js|mjs|cjs)$/i.test(dshBin)) return [process.execPath, dshBin]
  return [dshBin]
}

/**
 * 从 dsh stdout 行提取认证 URL 与 token。非 URL 行返回 null。
 * token 只在内存与证据目录（不入库）里流转，公开日志一律走 redactToken。
 * @param {string} line
 * @returns {{ url: string, token: string } | null}
 */
export function parseDshUrlLine(line) {
  const text = line.trim()
  if (!text.startsWith(DSH_URL_LINE_PREFIX)) return null
  // URL 后允许宿主附加说明（如 `(LAN: ...)`）；只取首个非空白 token 作 URL。
  const url = text.slice(DSH_URL_LINE_PREFIX.length).trim().split(/\s+/, 1)[0]
  let token = ''
  try {
    token = new URL(url).searchParams.get('token') ?? ''
  } catch {
    return null
  }
  return { url, token }
}

/** 证据/日志里的 URL 脱敏：token 段替换为 URL 安全的 REDACTED 占位，防凭据落公开日志。 */
export function redactToken(rawUrl) {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.searchParams.has('token')) {
      parsed.searchParams.set('token', 'REDACTED')
      return parsed.toString()
    }
    return rawUrl
  } catch {
    return rawUrl
  }
}
