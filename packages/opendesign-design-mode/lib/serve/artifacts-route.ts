/**
 * 产物伺服 host 子插件：webServer 前缀路由（U6 终态实现）。
 *
 * 语义权威 = 设计 D7：伺服根定死 = 会话 cwd（会话工作目录）。每个请求第一步过
 * connection.requestRejection 鉴权围栏（未认证 401 / Host-Origin 不可信 403，围栏语义
 * 归属 connection 服务，本包不复制其判定）；URL 相对路径与 cwd 拼接后经 realpath
 * 规范化，必须仍落在 cwd 内——.. 与绝对路径穿越（含符号链接逃逸）一律 403；cwd 内可读
 * 是 D7 已接受的暴露面（cookie 持有者 = 用户本人，与直接读自己项目目录同权限）。
 * HTML 产物直接返回不消毒：产物可信性由预览面板 iframe 的 sandbox 隔离承载（U7 落地，
 * D7 缓解决策——消毒会破坏原型的可交互语义，origin 隔离替代）。
 *
 * 形态先例 = DSH 仓 packages/host/open-in-app/src/index.ts（每 handler 第一步围栏 +
 * ctx.effect 登记 disposer + JSON 错误体）与 packages/host/webserver/src/index.ts
 * （register 的 exact/prefix 路由契约）。监听绑定与通配拒绝归 webServer 配置层所有，
 * 本包只注册路由、不触碰监听配置——DSH webserver 红线（不可通配绑定 host）在本包
 * 无可破坏面。
 *
 * cwd 通道（设计 U6 检查点的核实结论，runlog 有全文）：`ctx.workingDirectory
 * .defaultDirectory`——@deepseek-ai/dsh-working-directory 的部署级回退目录（base bundle
 * 组成行；会话无显式 cwd 时 workingDirectory.get(session) 兜底到的正是该值），服务缺席
 * 时回退 process.cwd() 保持同语义。U5 材质化落点必须经 resolveServeRoot 取同一通道，
 * 「伺服根 = 材质化目标」由此结构性成立，而非靠两边各自约定。
 *
 * 路由前缀 = /opendesign/artifacts（形态对齐 open-in-app shared 路由约定：PATH 供
 * webServer.register，ROUTE = 去前导斜杠的 document 相对形态供浏览器侧寻址）。U7 预览
 * 面板的 iframe 载入同一前缀（前缀定名已记 runlog，U7 消费）。
 */

import { readFile, realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, resolve, sep } from 'node:path'

/** Cordis 插件名（preset plugins 行的行内标识）。 */
export const name = 'od-serve'

/** 本行消费的宿主服务：web 承载层 + 请求围栏（connection 的浏览器鉴权与 Host-Origin 棚栏）。 */
export const inject = ['webServer', 'connection']

/** 伺服路由前缀（webServer.register 的绝对路径形态，kind: 'prefix'）。 */
export const OPENDESIGN_ARTIFACTS_PREFIX_PATH = '/opendesign/artifacts'

/** 同前缀的 document 相对形态（浏览器侧寻址用；open-in-app shared 路由约定）。 */
export const OPENDESIGN_ARTIFACTS_PREFIX_ROUTE = OPENDESIGN_ARTIFACTS_PREFIX_PATH.slice(1)

/** node:http 交换的本包最小结构视图（零宿主包依赖；运行时形态即 IncomingMessage/ServerResponse）。 */
interface ServeRequest {
  readonly url?: string | undefined
  readonly method?: string | undefined
  readonly headers: Record<string, string | string[] | undefined>
}

interface ServeResponse {
  statusCode: number
  setHeader(name: string, value: string): unknown
  end(body?: Buffer | string): unknown
}

/** 围栏服务的消费视图（结构局部类型化，先例 = open-in-app 的 OpenInAppConnection）。 */
interface ServeConnection {
  requestRejection(request: { readonly headers: ServeRequest['headers'] }): 401 | 403 | undefined
}

/** 工作目录服务的消费视图（cwd 通道；完整服务见 @deepseek-ai/dsh-working-directory）。 */
interface ServeWorkingDirectory {
  readonly defaultDirectory?: string | undefined
}

/** 产物扩展名 → content-type（产物为 HTML 页面与其相对引用的静态资源；D7 伺服面）。 */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.pdf': 'application/pdf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

/**
 * 按扩展名给 content-type；未知扩展名（含无扩展名）一律 application/octet-stream——
 * 浏览器对 octet-stream 不做渲染嗅探，未知形态的产物资源宁可下载也不误渲染。
 */
export function contentTypeFor(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  if (dot <= -1) return 'application/octet-stream'
  return CONTENT_TYPES[fileName.slice(dot).toLowerCase()] ?? 'application/octet-stream'
}

/**
 * 解析伺服根（U6 检查点结论的代码落点；U5 材质化落点消费同一函数）。
 *
 * @param ctx - Cordis 插件上下文。workingDirectory 服务缺席（极简组合）时回退宿主进程
 *   启动目录——与 workingDirectory 服务自身的构造回退（config.defaultDirectory ??
 *   process.cwd()）同语义，保证「伺服根 = 会话默认工作目录」在两种组合形态下都成立。
 */
export function resolveServeRoot(ctx: unknown): string {
  // 服务存在性探测必须 try/catch 包裹属性读取（0.1.7 e2e 实测，U8 修正 2026-11-09）：
  // 0.1.7 无 working-directory 行，cordis ctx 读未在本行 inject 声明的服务属性即抛
  // （可选链 `?.` 拦不住 proxy getter 的抛错），抛错会沿 webServer.handle 的兜底变成
  // 空 400——「服务不在」按缺席语义回退 process.cwd()，与 workingDirectory 服务自身的
  // 构造回退（config.defaultDirectory ?? process.cwd()）同语义。
  let workingDirectory: ServeWorkingDirectory | undefined
  try {
    workingDirectory = (ctx as { workingDirectory?: ServeWorkingDirectory } | null)?.workingDirectory
  } catch {
    // 0.1.7：服务行不在 → 回退
  }
  const directory = workingDirectory?.defaultDirectory
  return typeof directory === 'string' && directory.length > 0 ? directory : process.cwd()
}

/** 一条产物请求的解析终态（resolveArtifactPath 的返回词表）。 */
export type ArtifactResolution =
  | { status: 'file'; path: string }
  | { status: 'missing' }
  | { status: 'forbidden' }
  | { status: 'malformed' }

/**
 * URL 路径 → cwd 内绝对路径的安全解析核心（路由行为的唯一裁决点，单测直驱）。
 *
 * 规则（设计 D7 / RL2）：
 *   1. 前缀余段（pathname 减去前缀）剥掉首部的结构性 '/'（webServer prefix 匹配形态
 *      prefix/<rest> 的分隔符，不属于用户寻址）——再经 decodeURIComponent 还原；先解码
 *      后判定，编码形态的 %2e%2e（..）与 %2f（/）无法绕过后续判定；
 *   2. 解码失败（畸形百分号转义）→ malformed；含 NUL → forbidden；绝对路径寻址
 *      （解码后以 / 开头，产物只以相对路径寻址）→ forbidden；
 *   3. 拼接 cwd 后先做词法包含判定（resolve 归一化 ..，不依赖目标存在），再 realpath
 *      规范化（消解符号链接）后复判包含——两层任一落点不在 cwd 内（含 symlink 指向
 *      cwd 外）→ forbidden；
 *   4. 落点必须是普通文件（目录无列举语义，前缀根本身也 404）→ 其余一律 missing。
 *
 * @param rootReal - 伺服根的 realpath 规范化形态（调用方先对根做 realpath）。
 * @param pathname - 请求 URL 的 pathname（含前缀）。
 */
export async function resolveArtifactPath(rootReal: string, pathname: string): Promise<ArtifactResolution> {
  const stripped = pathname.slice(OPENDESIGN_ARTIFACTS_PREFIX_PATH.length).replace(/^\/+/, '')
  if (stripped === '') return { status: 'missing' }
  let relative: string
  try {
    relative = decodeURIComponent(stripped)
  } catch {
    return { status: 'malformed' }
  }
  if (relative.includes('\0') || isAbsolute(relative)) return { status: 'forbidden' }
  const candidate = join(rootReal, relative)
  // 词法包含判定在前：.. 归一化后落在 cwd 外即为越权——不依赖目标存在（realpath 对
  // 不存在的逃逸目标会 ENOENT，只给 missing 会让「穿越被拒 403」变成看运气的形态）。
  const lexical = resolve(candidate)
  if (lexical !== rootReal && !lexical.startsWith(rootReal + sep)) return { status: 'forbidden' }
  let real: string
  try {
    real = await realpath(lexical)
  } catch {
    return { status: 'missing' }
  }
  const inside = real === rootReal || real.startsWith(rootReal + sep)
  if (!inside) return { status: 'forbidden' }
  const info = await stat(real).catch(() => undefined)
  return info?.isFile() === true ? { status: 'file', path: real } : { status: 'missing' }
}

/** JSON 错误体（no-store：越权与缺失是每次都需重判的实时事实，先例 = open-in-app sendJson）。 */
function sendJson(res: ServeResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

/** 405 带唯一支持的方法（HEAD 同 GET 语义，Allow 只标 GET，先例 = open-in-app）。 */
function sendMethodNotAllowed(res: ServeResponse): void {
  res.statusCode = 405
  res.setHeader('allow', 'GET')
  res.end()
}

/** 围栏拒绝：透传 connection 的 401/403 并空体结束（围栏响应语义归属 connection）。 */
function fenceRejected(req: ServeRequest, res: ServeResponse, connection: ServeConnection): boolean {
  const rejection = connection.requestRejection(req)
  if (rejection === undefined) return false
  res.statusCode = rejection
  res.end()
  return true
}

/**
 * 单条产物请求的完整处置（围栏 → 方法 → 解析 → 读盘 → 响应）。
 *
 * @param ctx - Cordis 插件上下文（围栏服务与伺服根经它取用）。
 * @param req - node:http 请求（webServer 前缀路由保证 pathname 已落在本前缀）。
 * @param res - node:http 响应（本 handler 拥有完整响应生命周期）。
 */
async function serveArtifactRequest(ctx: unknown, req: ServeRequest, res: ServeResponse): Promise<void> {
  const connection = (ctx as { connection?: ServeConnection } | null)?.connection
  // 第一步围栏（open-in-app 模式）：任何解析与读盘都在鉴权之后。围栏服务缺席 = fail-closed
  // （全部拒答）——围栏是本路由唯一的门槛，缺它而放行等于无鉴权伺服整个 cwd。
  if (connection === undefined) {
    sendJson(res, 503, { code: 'fence-unavailable', message: 'connection fence service is unavailable' })
    return
  }
  if (fenceRejected(req, res, connection)) return
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendMethodNotAllowed(res)
    return
  }
  let pathname: string
  try {
    pathname = new URL(String(req.url), 'http://localhost').pathname
  } catch {
    sendJson(res, 400, { code: 'bad-request', message: 'request URL is not parseable' })
    return
  }
  // 防御性前缀复查：webServer 的 prefix 匹配只放行「前缀本身 / 前缀 + /」两种形态，
  // 此处再挡一次，使本函数对调用方形态不做隐含假设（直驱单测同样经它）。
  if (pathname !== OPENDESIGN_ARTIFACTS_PREFIX_PATH && !pathname.startsWith(`${OPENDESIGN_ARTIFACTS_PREFIX_PATH}/`)) {
    sendJson(res, 404, { code: 'not-found', message: `no artifact route for ${pathname}` })
    return
  }
  const rootReal = await realpath(resolveServeRoot(ctx)).catch(() => undefined)
  if (rootReal === undefined) {
    sendJson(res, 404, { code: 'root-missing', message: 'session working directory does not exist' })
    return
  }
  const resolution = await resolveArtifactPath(rootReal, pathname)
  if (resolution.status === 'forbidden') {
    sendJson(res, 403, { code: 'forbidden', message: 'path escapes the session working directory' })
    return
  }
  if (resolution.status === 'malformed') {
    sendJson(res, 400, { code: 'bad-request', message: 'path contains a malformed percent-escape' })
    return
  }
  if (resolution.status === 'missing') {
    sendJson(res, 404, { code: 'not-found', message: 'no artifact file at this path' })
    return
  }
  let body: Buffer
  try {
    body = await readFile(resolution.path)
  } catch {
    // realpath 与 readFile 之间文件被移除（同用户机器上的本地竞态）：按缺失答复。
    sendJson(res, 404, { code: 'not-found', message: 'artifact disappeared between resolution and read' })
    return
  }
  res.statusCode = 200
  res.setHeader('content-type', contentTypeFor(resolution.path))
  res.setHeader('cache-control', 'no-store')
  // HTML 不消毒直接返回（D7 裁决）：产物可信性由 U7 预览 iframe 的 sandbox 隔离承载。
  if (req.method === 'GET') res.end(body)
  else res.end()
}

/**
 * 产物伺服装配入口：webServer 前缀路由注册，生命周期挂 ctx.effect（卸载即撤除路由）。
 *
 * @param ctx - Cordis 插件上下文（preset 组合 scope）。
 */
export function apply(ctx: unknown): void {
  const host = ctx as {
    effect(factory: () => unknown, label?: string): unknown
    webServer: {
      register(route: {
        kind: 'prefix'
        path: string
        handler: (req: ServeRequest, res: ServeResponse) => Promise<void>
      }): () => void
    }
  }
  host.effect(() => host.webServer.register({
    kind: 'prefix',
    path: OPENDESIGN_ARTIFACTS_PREFIX_PATH,
    // promise 返还调用方：webServer 的 handle() 对 handler 结果 await 并兜底（400），
    // 单测双打同样以 await 驱动到响应结束，避免半结束态断言。
    handler: (req, res) => serveArtifactRequest(ctx, req, res),
  }), `od-serve: GET ${OPENDESIGN_ARTIFACTS_PREFIX_PATH}/<path>`)
}
