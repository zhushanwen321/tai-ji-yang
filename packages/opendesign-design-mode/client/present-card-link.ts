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
 *   .html/.htm 后缀 + 设计会话」；优先级带缺省 extension——高于 documentpreview 对全部
 *   file 地址的 fallback 带认领，故设计会话的 HTML 产物路由进设计面板；非 HTML 文件与
 *   非设计会话被 canOpen 否决，回落通用文件预览。地址形态与 patterns 的对齐点 = 本文件
 *   的解析与判定函数，定义注册与面板体共用同一份。
 *
 * **认领范围的会话维度（FF6 裁决，OD 对齐——挂载范围 ≡ 能力范围）**：canOpen 只认领
 *   设计会话（agent-preset 选定了本包 preset 的会话）的产物地址，判据与宿主侧监听器/
 *   材质化的 presetId 过滤同源（下方 designSessions 探测块）。canOpen 是同步否决函数
 *   （ui-sidebar-right tab-registry.ts:130 契约），会话→preset 在宿主客户端没有查询入口
 *   （SessionSummary 无 preset 字段），故判定走「乐观认领 + 探测弹回」两段：探测已定
 *   false 的会话直接否决；未探测会话乐观认领并由面板体异步探测（材质化标记文件伺服
 *   可达性），非设计会话的地址原位弹回通用文件预览（openResource 具名 kind，preview-tab
 *   的 bounce）。探测不可达时按可认领处理——回退通道兜底，窄化不放大故障。
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
 * 会话解析，V1 设计包 D7「伺服根 = 会话 cwd」，lib/serve/artifacts-route.ts 的
 * parseArtifactRoute 是服务侧对偶）。
 *
 * 字面值来源 = lib/serve/artifacts-route.ts 的 `OPENDESIGN_ARTIFACTS_PREFIX_ROUTE`（U6）。
 * 不直接 import 的原因：该模块是 Node 半场入口（顶层 import node:fs/promises），浏览器
 * bundle 引它会把 node 依赖拖进产物、越过宿主模块基线（check-require-baseline 拒绝）。
 * U6 侧的注册形态与常量字面由 tests/serve.test.ts 的「注册形态」组锁定；两侧漂移会在
 * U8 e2e（RL2/RL6）暴露。
 */
export const OPENDESIGN_ARTIFACTS_ROUTE = 'opendesign/artifacts'

/**
 * 通用文件预览（宿主 ui-sidebar-documentpreview）的 tab kind 字面值。弹回通道用：
 * 非设计会话产物经 `sidebarRight.openResource(address, { kind })` 具名打开跳过认领排序
 * （service.ts:180 语义），原位落回通用预览。不直接 import 的原因同上（宿主包红线）；
 * 字面漂移由弹回路径的 e2e/真机暴露。
 */
export const GENERIC_PREVIEW_KIND = 'text'

/**
 * 设计会话标记文件的 workspace 相对路径（材质化 5 文件之一）。preset 选定事件无条件
 * 全量重铺（V1 设计包 D8，lib/materialize/copy.ts 写清单），resume 路径同样触发——
 * 它的伺服可达性即「本会话是设计会话」的探测凭据，与 lib/index.js 的 presetId 过滤
 * 同一判据源。文件名漂移由 materialize.test.ts 与 e2e S1/S8（恰 5 文件断言）拦截。
 */
const DESIGN_SESSION_MARKER_PATH = '.od-frames/deck-framework.md'

/** sessionId → 设计会话判定（true/false 已探测定案；缺失 = 未知，canOpen 按可认领处理）。 */
const designSessions = new Map<string, boolean>()

/** 在途探测去重（canOpen 预热与面板体探测并发同会话只发一次请求）。 */
const probesInFlight = new Map<string, Promise<boolean>>()

/** 已知会话的设计会话判定；未知返回 undefined。 */
export function knownDesignSession(sessionId: string): boolean | undefined {
  return designSessions.get(sessionId)
}

/**
 * 探测会话是否设计会话并缓存（幂等，在途去重）。响应 ok（含 403 之外的一切 2xx/3xx
 * 到达形态）= 设计会话；非 ok（标记不存在 = preset 从未选定/被清）= 非设计会话；
 * fetch 抛错（伺服不可达）= 不缓存并按可认领处理——返回值只有 false 有行为差异，
 * 探测不可用时维持现状最稳（回退通道兜底，窄化不放大故障）。
 */
export async function probeDesignSession(sessionId: string): Promise<boolean> {
  const known = designSessions.get(sessionId)
  if (known !== undefined) return known
  const inFlight = probesInFlight.get(sessionId)
  if (inFlight !== undefined) return inFlight
  const probe = (async () => {
    try {
      const url = artifactRouteUrlForSession(sessionId, DESIGN_SESSION_MARKER_PATH)
      const response = await fetch(url)
      const design = response.ok
      designSessions.set(sessionId, design)
      probesInFlight.delete(sessionId)
      return design
    } catch {
      probesInFlight.delete(sessionId)
      return true
    }
  })()
  probesInFlight.set(sessionId, probe)
  return probe
}

/** 清空判定缓存与在途探测（测试隔离用；产品路径不消费）。 */
export function resetDesignSessionCache(): void {
  designSessions.clear()
  probesInFlight.clear()
}

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
 * design tab 定义的 canOpen：否决「非 session 作用域 / 非 workspace 相对 / 非 .html/.htm /
 * 已探定的非设计会话」四类地址。未探测会话按可认领处理并顺手预热探测（在途去重）——
 * 乐观分支只覆盖探测未返回的瞬态，面板体的探测弹回是最终裁决。恒不抛（同步否决函数
 * 是路由热路径，见 parseArtifactAddress）。
 */
export function canOpenArtifactAddress(address: string): boolean {
  const parsed = parseArtifactAddress(address)
  if (parsed === undefined) return false
  if (designSessions.get(parsed.sessionId) === false) return false
  void probeDesignSession(parsed.sessionId)
  return true
}

/** 产物地址所属的会话 id（无路径段/非 session 作用域等不可解析形态返回 undefined）。 */
export function artifactSessionIdOf(address: string): string | undefined {
  return parseArtifactAddress(address)?.sessionId
}

/**
 * 产物地址的 workspace 相对路径（不可解析形态返回 undefined）。评论侧栏用它承载评论挂靠
 * （opendesign-comment-loop D8：评论挂当前预览产物，面板自动携带 artifactPath）——
 * 地址→路径的唯一解析点仍在本文件的 parseArtifactAddress，面板不得自行反推。
 */
export function artifactPathOf(address: string): string | undefined {
  return parseArtifactAddress(address)?.path
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
 * = 该会话 cwd，V1 设计包 D7），不可省略。不可认领的地址返回 undefined——调用方以
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
