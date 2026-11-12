/**
 * 产物伺服 host 子插件：webServer 前缀路由（U6 终态实现）。
 *
 * 语义权威 = V1 设计包 D7：伺服根定死 = 会话 cwd（会话工作目录）。路由地址带会话维度——
 * `/opendesign/artifacts/<sessionId>/<产物相对路径>`，每个请求按 URL 的 session 段经
 * resolveSessionCwdById（lib/serve/session-cwd.ts，与材质化落点共用同一函数）解析该会话
 * 的工作目录作为伺服根；会话不可得或 cwd 不可得时 404 fail-closed，绝不回退部署级目录
 * ——用户为会话选择非默认工作区时，伺服根必须跟着会话走（V1 设计包 D7：伺服根小于会话 cwd 即断
 * 产物相对引用；回退部署目录正是本文件旧实现被一致性审查打回的差距）。每个请求第一步过
 * connection.requestRejection 鉴权围栏（未认证 401 / Host-Origin 不可信 403，围栏语义
 * 归属 connection 服务，本包不复制其判定）；URL 相对路径与 cwd 拼接后经 realpath
 * 规范化，必须仍落在 cwd 内——.. 与绝对路径穿越（含符号链接逃逸）一律 403；cwd 内可读
 * 是 V1 设计包 D7 已接受的暴露面（cookie 持有者 = 用户本人，与直接读自己项目目录同权限）。
 * HTML 产物直接返回不消毒：产物可信性由预览面板 iframe 的 sandbox 隔离承载（U7 落地，
 * V1 设计包 D7 缓解决策——消毒会破坏原型的可交互语义，origin 隔离替代）。
 *
 * 形态先例 = DSH 仓 packages/host/open-in-app/src/index.ts（每 handler 第一步围栏 +
 * ctx.effect 登记 disposer + JSON 错误体）与 packages/host/webserver/src/index.ts
 * （register 的 exact/prefix 路由契约）。监听绑定与通配拒绝归 webServer 配置层所有，
 * 本包只注册路由、不触碰监听配置——DSH webserver 红线（不可通配绑定 host）在本包
 * 无可破坏面。
 *
 * 路由前缀 = /opendesign/artifacts（形态对齐 open-in-app shared 路由约定：PATH 供
 * webServer.register，ROUTE = 去前导斜杠的 document 相对形态供浏览器侧寻址）。U7 预览
 * 面板的 iframe 载入同一前缀 + 同一 session 段形态（client/present-card-link.ts 的
 * artifactRouteUrlFor / artifactRouteUrlForPath 构造；U6 侧形态由 tests/serve.test.ts
 * 锁定，client 侧漂移在 U8 e2e 暴露）。
 * 编号口径：本文件编号默认属 V1 设计包（opendesign-design-mode impl-plan）；其他设计包域编号带包名前缀（opendesign-assets-quality / p1-shell-identity）。
 */

import { readFile, realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

import { PICK_SCRIPT_SOURCE } from '../comments/pick-script.js'
import { OD_FRAMES_DIR } from '../materialize/copy.js'
import { registerCommentsApiRoutes, type CommentsApiScope } from './comments-api.js'
import { resolveSessionCwdById } from './session-cwd.js'

/** Cordis 插件名（preset plugins 行的行内标识）。 */
export const name = 'od-serve'

/** 本行消费的宿主服务：web 承载层 + 请求围栏（connection）+ 会话注册表（sessions，cwd 通道）。 */
export const inject = ['webServer', 'connection', 'sessions']

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

/** 产物扩展名 → content-type（产物为 HTML 页面与其相对引用的静态资源；V1 设计包 D7 伺服面）。 */
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

// ── 伺服注入与内容版本（opendesign-comment-anchor D4 / D8(c)）────────────────

/** 注入标签开口（data 属性供测试与调试在响应里识别注入段；桥报文契约的伺服侧承载点）。 */
const PICK_SCRIPT_TAG_OPEN = '<script data-od-pick="1">'

/**
 * 注入谓词（D4：拾取脚本只该到达被评审的产物文档；独立导出供单测直驱）。
 *
 * 三条件逐条对应 RL3 的机器断言边界：GET 请求（HEAD 只探版本不执行脚本）×
 * content-type 为 text/html（非 HTML 资源不注）× 产物相对路径不以 .od-frames/ 段开头
 * （设备壳支撑文件是产物运行时依赖而非评审对象，壳内无拾取脚本——GL1 已接受边界；
 * 路径形参传磁盘真实落点相对伺服根的余段，realpath 归一化后的落点才是权威事实）。
 *
 * @param method - 请求方法（GET 之外的任何值含 undefined 都不注）。
 * @param contentType - 响应 content-type（含 charset 的完整值）。
 * @param relativePath - 落点相对伺服根的路径（node:path.relative 形态，POSIX 或 '\\' 分隔）。
 */
export function shouldInjectPickScript(method: string | undefined, contentType: string, relativePath: string): boolean {
  if (method !== 'GET') return false
  if (!contentType.startsWith('text/html')) return false
  const firstSegment = relativePath.split(sep)[0] ?? ''
  return firstSegment !== OD_FRAMES_DIR
}

/**
 * HTML 尾部注入拾取脚本（D4：最后一个 </body> 前插一个内联 <script> 标签，文档无
 * </body> 时尾接；独立导出供单测直驱）。注入只发生在内存响应体上——磁盘产物字节不变
 * 是 RL3 的机器断言项；注入幂等（每次响应独立拼接，无状态，重复请求结果一致）。
 *
 * @param html - 磁盘读出的产物 HTML 文本（UTF-8 无损解码形态）。
 */
export function injectPickScript(html: string): string {
  const tag = `${PICK_SCRIPT_TAG_OPEN}${PICK_SCRIPT_SOURCE}</script>`
  const at = html.toLowerCase().lastIndexOf('</body>')
  if (at <= -1) return `${html}${tag}`
  return `${html.slice(0, at)}${tag}${html.slice(at)}`
}

/**
 * 产物 HTML 的内容版本标头值（D8(c)/AS9 改稿可见性的版本凭据：文件 mtime+size 摘要，
 * 弱校验器 W/ 形态——mtime 对任何写盘动作前进（含同内容重写），假阳性 = 无谓重挂一次
 * 且重挂幂等自动恢复，信号-蕴涵语义见设计 SI3）。本地伺服毫秒级 stat 读取，不读内容
 * 算 hash（SI3 裁决：假阳性代价小不值当）。
 */
export function etagFor(mtimeMs: number, size: number): string {
  return `W/"${mtimeMs.toString(16)}-${size.toString(16)}"`
}

/** 一条产物请求地址的解析终态（parseArtifactRoute 的返回词表）。 */
export type ArtifactRouteParse =
  | { status: 'route'; sessionId: string; artifactRoute: string }
  | { status: 'empty' }
  | { status: 'malformed' }

/**
 * 请求 pathname → sessionId 段 + 产物余段（路由地址的会话维度解析，单测直驱）。
 *
 * 规则：前缀余段（pathname 减去前缀）剥掉首部的结构性 '/'（webServer prefix 匹配形态
 * prefix/<rest> 的分隔符，不属于用户寻址）——余段第一段 = sessionId（decodeURIComponent
 * 还原，失败 → malformed）；其余段保持字面 '/' 连接后交 resolveArtifactPath（它在解码
 * 后做穿越判定，编码形态的 %2e%2e（..）与 %2f（/）无法绕过）。session 段在解码前按字面
 * '/' 切分：sessionId 内的 %2f 不会把段切碎，产物段的编码形态原样下传。
 *
 * @param pathname - 请求 URL 的 pathname（含前缀；调用方先做过前缀复查）。
 */
export function parseArtifactRoute(pathname: string): ArtifactRouteParse {
  const stripped = pathname.slice(OPENDESIGN_ARTIFACTS_PREFIX_PATH.length).replace(/^\/+/, '')
  // 前缀根本身（无任何段）：目录无列举语义，且无 session 段可言。
  if (stripped === '') return { status: 'empty' }
  const slash = stripped.indexOf('/')
  if (slash <= -1) return { status: 'empty' } // 只有 session 段无产物段，也无从寻址
  let sessionId: string
  try {
    sessionId = decodeURIComponent(stripped.slice(0, slash))
  } catch {
    return { status: 'malformed' }
  }
  if (sessionId === '') return { status: 'empty' } // 空 session 段（webServer 不会送来，直驱防御）
  return { status: 'route', sessionId, artifactRoute: stripped.slice(slash + 1) }
}

/** 一条产物请求的解析终态（resolveArtifactPath 的返回词表）。 */
export type ArtifactResolution =
  | { status: 'file'; path: string }
  | { status: 'missing' }
  | { status: 'forbidden' }
  | { status: 'malformed' }

/**
 * 产物余段 → 会话 cwd 内绝对路径的安全解析核心（路由行为的唯一裁决点，单测直驱）。
 *
 * 规则（V1 设计包 D7 / RL2）：
 *   1. 产物余段（pathname 减去前缀与 session 段，字面 '/' 连接）经 decodeURIComponent
 *      还原；先解码后判定，编码形态的 %2e%2e（..）与 %2f（/）无法绕过后续判定；
 *   2. 解码失败（畸形百分号转义）→ malformed；含 NUL → forbidden；绝对路径寻址
 *      （解码后以 / 开头，产物只以相对路径寻址）→ forbidden；
 *   3. 拼接 cwd 后先做词法包含判定（resolve 归一化 ..，不依赖目标存在），再 realpath
 *      规范化（消解符号链接）后复判包含——两层任一落点不在 cwd 内（含 symlink 指向
 *      cwd 外）→ forbidden；
 *   4. 落点必须是普通文件（目录无列举语义，空余段即前缀根也 404）→ 其余一律 missing。
 *
 * @param rootReal - 伺服根的 realpath 规范化形态（调用方先对根做 realpath）。
 * @param artifactRoute - 产物余段（parseArtifactRoute 的 artifactRoute，未解码形态）。
 */
export async function resolveArtifactPath(rootReal: string, artifactRoute: string): Promise<ArtifactResolution> {
  if (artifactRoute === '') return { status: 'missing' }
  let relative: string
  try {
    relative = decodeURIComponent(artifactRoute)
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
 * 单条产物请求的完整处置（围栏 → 方法 → 地址解析 → 会话 cwd → 解析 → 读盘 → 响应）。
 *
 * @param ctx - Cordis 插件上下文（围栏服务与会话 cwd 通道经它取用）。
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
  // 会话维度解析（V1 设计包 D7：伺服根定死 = 会话 cwd）：URL session 段 → 该会话的工作目录，
  // 与材质化落点共用 resolveSessionCwdById 同一通道（U6 检查点「伺服根与材质化目标
  // 统一 = 会话 cwd」的结构承载）。会话不可得 / cwd 不可得 → 404 fail-closed，不回退
  // 部署级目录（回退即伺服根指向会话工作区之外，产物相对引用与暴露面判定全部失锚）。
  const parsed = parseArtifactRoute(pathname)
  if (parsed.status === 'empty') {
    sendJson(res, 404, { code: 'not-found', message: 'artifact route requires a session segment' })
    return
  }
  if (parsed.status === 'malformed') {
    sendJson(res, 400, { code: 'bad-request', message: 'session segment contains a malformed percent-escape' })
    return
  }
  const sessionCwd = resolveSessionCwdById(ctx, parsed.sessionId)
  if (sessionCwd === null) {
    sendJson(res, 404, { code: 'session-unknown', message: 'artifact route session has no working directory' })
    return
  }
  const rootReal = await realpath(sessionCwd).catch(() => undefined)
  if (rootReal === undefined) {
    sendJson(res, 404, { code: 'root-missing', message: 'session working directory does not exist' })
    return
  }
  const resolution = await resolveArtifactPath(rootReal, parsed.artifactRoute)
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
  // 内容版本凭据（D8(c)）：读盘后补 stat 取 mtime+size；读盘与 stat 之间被移除（本地
  // 竞态）时 ETag 缺席——探针按无版本处理至多重挂一次（幂等），不影响正文伺服。
  const fileStat = await stat(resolution.path).catch(() => undefined)
  res.statusCode = 200
  const contentType = contentTypeFor(resolution.path)
  res.setHeader('content-type', contentType)
  res.setHeader('cache-control', 'no-store')
  // HTML 响应附内容版本标头（GET 与 HEAD 同头——面板版本探针走 HEAD 比对，D8(c)）。
  if (contentType.startsWith('text/html') && fileStat !== undefined) {
    res.setHeader('etag', etagFor(fileStat.mtimeMs, fileStat.size))
  }
  // 注入谓词（D4）：GET × text/html × 非设备壳路径，只在内存响应体上追加注入段。
  // 注入前验证 UTF-8 无损（decode→encode 逐字还原才注入）：非 UTF-8 编码的产物 HTML
  // 解码会替换坏字节，宁可放弃注入也不改磁盘字节对应的响应内容（RL3 精神）。
  if (shouldInjectPickScript(req.method, contentType, relative(rootReal, resolution.path))) {
    const html = body.toString('utf8')
    if (Buffer.byteLength(html, 'utf8') === body.length) {
      res.end(Buffer.from(injectPickScript(html), 'utf8'))
      return
    }
  }
  // HTML 不消毒直接返回（V1 设计包 D7 裁决）：产物可信性由 U7 预览 iframe 的 sandbox 隔离承载。
  // D4 细化：不消毒但可附加注入脚本——产物内容本身（磁盘字节）一字不动。
  if (req.method === 'GET') res.end(body)
  else res.end()
}

/**
 * 产物伺服 + 评论写通道装配入口：webServer 前缀路由注册与评论路由族注册，
 * 生命周期各自挂 effect（卸载即撤除）。
 *
 * @param ctx - Cordis 插件上下文（preset 组合 scope）。
 */
export function apply(ctx: unknown): void {
  const host = ctx as {
    inject?: (deps: readonly string[], callback: (scope: CommentsApiScope) => void) => unknown
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
  // 评论写通道路由族（opendesign-comment-loop D2 / AX5）：经 connection.fetch 注册器挂
  // /api 共享鉴权层覆盖的 exact 路由——不经 webServer 路由（那条路线需在 handler 内复制
  // 宿主信任判定，D2 明示不采用）。inject 子 scope 携带 connection 服务（baoyu 产线
  // 同款 `ctx.inject(['connection'], sub => …)` 形态）；服务缺席时 cordis 令 scope
  // pending，服务就位后注册照常发生，装配侧无需重试逻辑。
  host.inject?.(['connection'], (scope) => registerCommentsApiRoutes(scope, ctx))
}
