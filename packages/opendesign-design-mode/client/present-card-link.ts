/**
 * client/present-card-link.ts —— 设计产物的地址契约（U7 职责 4 的落点）。
 *
 * **present 交付卡片点击 → 设计面板的路由链路**（宿主侧既有行为；U7 实读 DSH 仓核实，
 * 全程走在宿主公开契约上，插件侧无需也无法改宿主）：
 *
 *   交付卡片预览点击（ui-deliverables PresentedFileCard 的 onPreview）
 *   → ui-chat 的 openFile(path)（conversation.chat.turnTail 的 owner props，apply.ts:272）
 *   → fileAddressFor(sessionId, cwd, resolveWorkspacePath(...))——workspace 内的路径一律落成
 *     `dsh-resource://file/session/<sessionId>/<path>` 的 session 作用域地址（dsh-util-
 *     workspace-path fileAddressFor:92-99：相对路径与 workspace 内绝对路径都归 session 作用域）
 *   → ctx.sidebarRight.openResource(address)——右侧栏注册表按 patterns 候选 + canOpen 否决 +
 *     优先级带排序认领（ui-sidebar-right tab-registry.ts 的 VS Code 式地址解析）。
 *
 * **本包的认领形态**（preview-tab/index.tsx 注册的 design tab 定义）：
 *   patterns = `dsh-resource://file/[\s\S]+`（含 `:` 的全地址形态，ui-sidebar-documentpreview
 *   definition.ts:50 同款写法）；canOpen 收窄到「session 作用域 + workspace 相对路径 +
 *   .html/.htm 后缀」；优先级带缺省 extension——高于 documentpreview 对全部 file 地址的
 *   fallback 带认领，故 HTML 产物的卡片点击与本包发起的 openResource 都路由进设计面板；
 *   非 HTML 文件被 canOpen 否决，回落通用文件预览。地址形态与 patterns 的对齐点 = 本文件
 *   的解析与判定函数，定义注册与面板体共用同一份。
 *
 * 「复制路径 + 面板列表打开」的退化路径不需要：卡片点击链路已在宿主公开契约上闭环。
 * 面板内产物列表（artifact-list.tsx）仍保留，职责是「openResource 地址路由之外的第二入口」
 * （设计 U7：面板内产物列表兜底），不是卡片链路的替代品。
 *
 * 本文件不 import 任何宿主包（零宿主包依赖红线）：file 地址语法按 dsh-util-workspace-path
 * file-address.ts 的公开语义做局部同构解析（segment 编码、`:` 保留字面），不 import 其模块。
 */

/** design tab 在 tab 体系里的实现身份（sidebar.right.pane.tab 槽的 dispatch key）。 */
export const OPENDESIGN_TAB_ID = 'opendesign-design-mode/design-preview'

/** design tab 的类型判别符（openTab 按名取用的 kind）。 */
export const OPENDESIGN_TAB_KIND = 'opendesignArtifact'

/** 面板文案的私有 locale 命名空间（宿主既有命名空间之外，不与任何宿主包撞 key）。 */
export const DESIGN_PANEL_LOCALE_NS = 'opendesign.designPanel'

/**
 * 产物伺服路由前缀的 document 相对形态（iframe 与面板 fetch 的寻址形态；完整地址 =
 * `<前缀>/<sessionId>/<产物相对路径>`，session 段由本文件的构造函数拼装——伺服根按
 * 会话解析，D7「伺服根 = 会话 cwd」，lib/serve/artifacts-route.ts 的 parseArtifactRoute
 * 是服务侧对偶）。
 *
 * 字面值来源 = lib/serve/artifacts-route.ts 的 `OPENDESIGN_ARTIFACTS_PREFIX_ROUTE`（U6）。
 * 不直接 import 的原因：该模块是 Node 半场入口（顶层 import node:fs/promises），浏览器
 * bundle 引它会把 node 依赖拖进产物、越过宿主模块基线（check-require-baseline 拒绝）。
 * U6 侧的注册形态与常量字面由 tests/serve.test.ts 的「注册形态」组锁定；两侧漂移会在
 * U8 e2e（RL2/RL6）暴露。
 */
export const OPENDESIGN_ARTIFACTS_ROUTE = 'opendesign/artifacts'

/** file 地址的 session 作用域前缀（dsh-resource://file/session/<sessionId>/<path>）。 */
const FILE_SESSION_PREFIX = 'dsh-resource://file/session/'

/** 一条可被设计面板认领的 file 地址的解析结果。 */
interface ParsedArtifactAddress {
  /** 地址所属会话（路由 URL 的 session 段——伺服根按会话解析的寻址凭据）。 */
  sessionId: string
  /** workspace 相对路径（各段已解码，`/` 连接）。 */
  path: string
}

/** 按文件名后缀判定是否设计产物形态（.html / .htm，大小写不敏感）。 */
export function isArtifactName(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.endsWith('.html') || lower.endsWith('.htm')
}

/**
 * 解析一条候选地址为产物地址（canOpen 与路由 URL 构造的唯一裁决点）。
 *
 * 收窄规则（与伺服路由的语义对齐，路由侧行为见 lib/serve/artifacts-route.ts）：
 *   · 只认 session 作用域（present 卡片与文件链接的产物地址形态；absolute 作用域回落通用预览）；
 *   · path 必须 workspace 相对——绝对形态（`/` 开头、盘符段、UNC 空首段）在伺服路由上必然
 *     被围栏拒绝，早拒省一次必然失败的打开；
 *   · 最后一段必须是 .html/.htm。
 * 解析全程 try/catch：畸形百分号转义返回 undefined（canOpen 是路由热路径上的否决函数，
 * 任何输入都不允许它抛）。
 */
function parseArtifactAddress(address: string): ParsedArtifactAddress | undefined {
  if (!address.startsWith(FILE_SESSION_PREFIX)) return undefined
  const rest = address.slice(FILE_SESSION_PREFIX.length)
  const slash = rest.indexOf('/')
  if (slash <= 0) return undefined // 无 sessionId，或 sessionId 后没有 path 段（裸会话根）
  try {
    const sessionId = decodeURIComponent(rest.slice(0, slash))
    const segments = rest.slice(slash + 1).split('/').map(decodeURIComponent)
    const path = segments.join('/')
    if (path === '' || segments[0] === '') return undefined // 空路径 / UNC 空首段
    if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) return undefined // 绝对形态
    if (!isArtifactName(segments[segments.length - 1] ?? '')) return undefined
    return { sessionId, path }
  } catch {
    return undefined
  }
}

/**
 * design tab 定义的 canOpen：否决一切非「session 作用域的 HTML 相对产物地址」。
 * 恒不抛（见 parseArtifactAddress）。
 */
export function canOpenArtifactAddress(address: string): boolean {
  return parseArtifactAddress(address) !== undefined
}

/**
 * 产物地址的 tab chip 文本：解码最后一段（documentpreview 的 basenameOf 同语义——
 * 只短化显示文本，地址本身仍是内容身份）。解析失败时原文显示，优于拒绝显示。
 */
export function artifactTitleFor(address: string): string {
  const name = address.slice(address.lastIndexOf('/') + 1)
  if (name === '') return address
  try {
    return decodeURIComponent(name)
  } catch {
    return name
  }
}

/** workspace 相对路径 → 伺服路由的 path 段（逐段 component 编码后以 `/` 连接；伺服侧整段解码）。 */
function encodeArtifactRoutePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

/**
 * 产物地址 → 伺服路由 URL（document 相对形态；web 与桌面双通的寻址形态：web 下相对
 * document base 即同源路由，桌面下 dsh-app:// 的相对路径由壳层 web-document 转发给宿主）。
 * 地址 = `<前缀>/<sessionId>/<产物相对路径>`——session 段是伺服根解析的寻址凭据（伺服根
 * = 该会话 cwd，D7），不可省略。不可认领的地址返回 undefined——调用方以
 * canOpenArtifactAddress 分流后不会见到它。
 */
export function artifactRouteUrlFor(address: string): string | undefined {
  const parsed = parseArtifactAddress(address)
  if (parsed === undefined) return undefined
  return artifactRouteUrlForSession(parsed.sessionId, parsed.path)
}

/**
 * 会话 id + workspace 相对路径 → 伺服路由 URL（面板内产物列表的行点击用：列表来自
 * workspaceFiles 的目录列举，拿到的是相对路径而非地址，用面板所在会话构造同一路由）。
 */
export function artifactRouteUrlForPath(sessionId: string, path: string): string {
  return artifactRouteUrlForSession(sessionId, path.replace(/^\.?\//, ''))
}

/** sessionId + 相对路径 → 路由 URL 的唯一拼装点（session 段与路径段逐段编码后 / 连接）。 */
function artifactRouteUrlForSession(sessionId: string, relative: string): string {
  return `${OPENDESIGN_ARTIFACTS_ROUTE}/${encodeURIComponent(sessionId)}/${encodeArtifactRoutePath(relative)}`
}
