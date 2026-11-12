/**
 * client/preview-tab/pick-bridge.ts —— 拾取桥宿主侧的纯逻辑层（opendesign-comment-anchor
 * U4：G1 报文契约面板侧实现 + D8(a) 就绪握手门控 + D8(c) 内容版本探针 + picked 落点补齐）。
 *
 * 不 import react：仓内无 react/jsdom 测试基建（client 的 react 是宿主运行时 external
 * require），vitest 无法 import 任何 react 文件——本文件把「渲染之下可单测直驱」的桥判定
 * 与控制器独立成模块，tests/comments/api.test.ts 的 RL5 负路径 / 失败回执 / 探针失败态
 * 联动都在此直驱（渲染形态归 e2e，分工同 tests/comments/api.test.ts 文件头结论）。
 *
 * 桥报文契约 v1（守护 G1，唯一登记处 = 设计文档守护表；本文件是面板侧实现，与
 * lib/comments/pick-script.ts 脚本侧对账）：
 *   报文 = {v:1, type:'odp-pick:<动作>', payload}；
 *   脚本→面板动作 = ready / picked / anchors-status；面板→脚本动作 = pick-mode / anchors / locate / submit-result；
 *   面板侧只处理 event.source === 本 iframe.contentWindow 且 v===1 且 type 以 'odp-pick:'
 *   开头的入站，其余静默忽略——同页多插件、浏览器扩展、产物自身脚本都可能 postMessage
 *   （SI1：source 是对象同一性比较，其余发送方拿不到本 iframe 的 contentWindow 引用，
 *   无法伪造）。
 *
 * 编号口径：本文件裸编号（G1/D8/SI/RL 前缀）属 opendesign-comment-anchor 设计包。
 */

import {
  COMMENT_TEXT_MAX_LENGTH,
  isCommentAnchor,
  type CommentAnchor,
  type CommentThread,
} from '../../lib/comments/contract'
import { artifactPathOf, artifactSessionIdOf } from '../present-card-link'

/** 桥协议版本（G1 报文 v 字段；与脚本侧 PROTOCOL_VERSION 同值，词表测试锁定两侧对齐）。 */
export const PICK_BRIDGE_PROTOCOL_VERSION = 1

/** 桥报文 type 前缀（G1；与脚本侧 MSG_PREFIX 同值）。 */
export const PICK_BRIDGE_MESSAGE_PREFIX = 'odp-pick:'

/** 脚本→面板动作词表（G1 恰三项；词表外入站静默忽略）。 */
export const PICK_BRIDGE_INBOUND_ACTIONS = ['ready', 'picked', 'anchors-status'] as const

/** 面板→脚本动作词表（G1 恰四项）。 */
export const PICK_BRIDGE_OUTBOUND_ACTIONS = ['pick-mode', 'anchors', 'locate', 'submit-result'] as const

export type PickBridgeInboundAction = (typeof PICK_BRIDGE_INBOUND_ACTIONS)[number]

type PickBridgeOutboundAction = (typeof PICK_BRIDGE_OUTBOUND_ACTIONS)[number]

/** 内容版本探针的轮询间隔（D8(c)：5 秒定时 + 聚焦/可见性恢复；e2e RL7 的判定窗口以它为界）。 */
export const CONTENT_PROBE_INTERVAL_MS = 5000

/** picked 载荷非法时 submit-result 的回执原因（脚本输入框行内呈现；双语形态与脚本自身兜底文案一致——文案不同：本条是载荷非法回执，脚本兜底是提交失败重试提示，lib/comments/pick-script.ts showPanelError）。 */
export const PICK_PAYLOAD_INVALID_REASON = 'Invalid pick payload. 评论载荷非法'

/** 入站 message 的最小结构视图（真实 MessageEvent 的结构子集；测试可直接造对象）。 */
export interface BridgeMessageEventLike {
  readonly source: unknown
  readonly data: unknown
}

/** 一条通过 G1 三重校验的入站报文（payload 按动作各自校验，解析层不深检）。 */
export interface ParsedInboundPickMessage {
  readonly action: PickBridgeInboundAction
  readonly payload: unknown
}

/**
 * 入站报文解析（G1 面板侧三重校验，独立导出供单测直驱 RL5 负路径）：
 * 来源（event.source 与当前 iframe contentWindow 对象同一）→ 版本（v===1）→ 前缀
 * （type 以 'odp-pick:' 开头且余段 ∈ 脚本→面板词表）。任一不满足返回 null（调用方静默
 * 忽略，不区分违规类别——G1 明文「不满足即静默忽略」）；frameWindow 空值（iframe 未挂载）
 * 恒 null，防 event.source 为空值时的假同源匹配。
 */
export function parseInboundPickMessage(
  event: BridgeMessageEventLike,
  frameWindow: unknown,
): ParsedInboundPickMessage | null {
  if (frameWindow === null || frameWindow === undefined) return null
  if (event.source !== frameWindow) return null
  if (typeof event.data !== 'object' || event.data === null) return null
  const data = event.data as { v?: unknown; type?: unknown; payload?: unknown }
  if (data.v !== PICK_BRIDGE_PROTOCOL_VERSION) return null
  if (typeof data.type !== 'string' || !data.type.startsWith(PICK_BRIDGE_MESSAGE_PREFIX)) return null
  const action = data.type.slice(PICK_BRIDGE_MESSAGE_PREFIX.length)
  if (!(PICK_BRIDGE_INBOUND_ACTIONS as readonly string[]).includes(action)) return null
  return { action: action as PickBridgeInboundAction, payload: data.payload }
}

/** 面板下发的锚点集条目（D8(a)：线程 id + 序号 + sel；序号 = 侧栏列表序，1 起）。 */
export interface PickAnchorEntry {
  readonly threadId: string
  readonly ordinal: number
  readonly sel: string
}

/** anchors-status 的未命中条目（D8(b)：脚本报未命中清单，全命中无消息——面板默认全命中）。 */
export interface PickAnchorMiss {
  readonly threadId: string
  readonly ordinal: number
  readonly sel: string
}

/**
 * 当前产物线程列表 → anchors 下发集（D8(a)：只下发带锚点的线程——旧文件无 anchor 字段
 * 合法但无可寻址对象；序号取线程在列表中的位置，与侧栏条目顺序一致）。
 */
export function anchorsOfThreads(threads: readonly CommentThread[]): PickAnchorEntry[] {
  const entries: PickAnchorEntry[] = []
  threads.forEach((thread, index) => {
    if (thread.anchor !== undefined) {
      entries.push({ threadId: thread.id, ordinal: index + 1, sel: thread.anchor.sel })
    }
  })
  return entries
}

/**
 * anchors-status 载荷 → 未命中清单（宽容解析：非数组/缺字段条目逐条过滤，threadId 是
 * 面板标失效态的唯一对账键；不抛错——桥报文是跨沙箱输入，按不可信数据处理）。
 */
export function parseAnchorMisses(payload: unknown): PickAnchorMiss[] {
  if (!Array.isArray(payload)) return []
  const misses: PickAnchorMiss[] = []
  for (const item of payload) {
    if (typeof item !== 'object' || item === null) continue
    const record = item as { threadId?: unknown; ordinal?: unknown; sel?: unknown }
    if (typeof record.threadId !== 'string' || record.threadId === '') continue
    misses.push({
      threadId: record.threadId,
      ordinal: typeof record.ordinal === 'number' ? record.ordinal : 0,
      sel: typeof record.sel === 'string' ? record.sel : '',
    })
  }
  return misses
}

/** picked 载荷的最小校验（D5：anchor 载荷形状与 contract CommentAnchor 同构；文本 1..上限）。 */
function parsePickedPayload(payload: unknown): { anchor: CommentAnchor; text: string } | null {
  if (typeof payload !== 'object' || payload === null) return null
  const record = payload as { anchor?: unknown; text?: unknown }
  if (!isCommentAnchor(record.anchor)) return null
  if (typeof record.text !== 'string' || record.text.length === 0 || record.text.length > COMMENT_TEXT_MAX_LENGTH) {
    return null
  }
  return { anchor: record.anchor, text: record.text }
}

/** 面板调写通道后的拾取提交终态（D6 回执协议：无论成败必经桥出站 submit-result）。 */
export type PickSubmitOutcome =
  | { ok: true; threadId: string }
  | { ok: false; reason: string }

export interface PickBridgeHandlers {
  /**
   * picked 的落盘委托（面板体补齐 artifactPath/sessionId 后调写通道；成功后由面板体
   * 触发线程重拉 → anchors 重发）。失败返回 ok:false + 用户可读原因（脚本行内呈现）。
   */
  submitPick(payload: { anchor: CommentAnchor; text: string }): Promise<PickSubmitOutcome>
  /** ready 握手到达（面板体解除侧栏控件禁用态的信号）。 */
  onReady(): void
  /** 未命中清单到达（侧栏失效态数据源；ready 握手时以空清单重置——新脚本实例将重探回报）。 */
  onMisses(misses: readonly PickAnchorMiss[]): void
}

export interface PickBridge {
  /** 入站报文入口（iframe-view 的 message 监听经 G1 解析后转发）。 */
  handleMessage(message: ParsedInboundPickMessage): void
  /**
   * iframe 挂载/重挂/卸载时的出站目标更新（null = 卸载）。换窗即失就绪：新文档的脚本
   * 实例须重新 ready 握手（D8(a) 重载协议），握手前出站全部停用。
   */
  setFrameWindow(frameWindow: unknown): void
  /** 评论模式开关（就绪前仅记态，ready 握手时随 flush 一并下发）。 */
  setPickMode(enabled: boolean): void
  /** 当前产物锚点集下发（就绪前仅记态；线程增删后重发，徽章随之重建）。 */
  setAnchors(entries: readonly PickAnchorEntry[]): void
  /** 定位指令（未就绪为静默——UI 侧定位按钮的禁用态是唯一入口，此处兜底）。 */
  locate(sel: string): void
  /** 出站就绪判定（侧栏评论模式开关与定位按钮的禁用态与它同源）。 */
  isReady(): boolean
}

/**
 * 拾取桥控制器（面板侧编排状态机：就绪态 × 评论模式态 × 锚点集 → G1 出站词表）。
 *
 * 就绪门控是本控制器的核心时序约束（D8(a)/SI2）：ready 前的出站会落进旧文档或
 * about:blank 的 contentWindow 无人接收，故一切出站以「当前 frameWindow + ready」为
 * 前提；未就绪时的置态调用只更新内存态，由 ready 握手 flush 补发——面板无需为「脚本
 * 尚未加载」做任何重试逻辑（重载后新脚本实例的 ready 触发幂等重发）。
 */
export function createPickBridge(handlers: PickBridgeHandlers): PickBridge {
  let frameWindow: unknown = null
  let ready = false
  let pickMode = false
  let anchors: readonly PickAnchorEntry[] = []

  const post = (action: PickBridgeOutboundAction, payload: unknown): void => {
    if (!ready || frameWindow === null || frameWindow === undefined) return
    const target = frameWindow as { postMessage(message: unknown, targetOrigin: string): unknown }
    target.postMessage(
      { v: PICK_BRIDGE_PROTOCOL_VERSION, type: PICK_BRIDGE_MESSAGE_PREFIX + action, payload },
      '*',
    )
  }

  const flushHandshake = (): void => {
    // D8(a)：收到 ready 后发 pick-mode 当前态与 anchors 当前集；misses 同步重置——
    // 新脚本实例对新锚点集重探并回报，旧文档的失效结论不再成立。
    post('pick-mode', { enabled: pickMode })
    post('anchors', anchors)
    handlers.onMisses([])
  }

  return {
    isReady: () => ready,
    setFrameWindow(next) {
      if (next === frameWindow) return
      frameWindow = next
      ready = false
    },
    handleMessage(message) {
      if (message.action === 'ready') {
        ready = true
        handlers.onReady()
        flushHandshake()
        return
      }
      if (message.action === 'picked') {
        const payload = parsePickedPayload(message.payload)
        if (payload === null) {
          // 载荷非法也要回执：脚本已进入发送中态（按钮禁用、等待回执），无声忽略会让
          // 输入框永久挂起（D6 回执协议「无论成败必经桥出站」的对偶约束）。
          post('submit-result', { ok: false, reason: PICK_PAYLOAD_INVALID_REASON })
          return
        }
        void handlers.submitPick(payload).then((outcome) => {
          post('submit-result', outcome.ok
            ? { ok: true, threadId: outcome.threadId }
            : { ok: false, reason: outcome.reason })
        })
        return
      }
      // anchors-status：脚本报未命中清单（hit:false 项），面板按 threadId 重标失效态。
      handlers.onMisses(parseAnchorMisses(message.payload))
    },
    setPickMode(enabled) {
      pickMode = enabled
      post('pick-mode', { enabled })
    },
    setAnchors(entries) {
      anchors = entries
      post('anchors', anchors)
    },
    locate(sel) {
      post('locate', { sel })
    },
  }
}

// ── 内容版本探针（D8(c)/AS9：改稿可见性的 HEAD ETag 比对）────────────────────

/** 既有 HEAD 探针的结果（iframe-view 加载态判定用；ok=false 带失败类别与可选状态码）。 */
export type ProbeOutcome = { ok: true } | { ok: false; kind: 'notFound' | 'forbidden' | 'error'; status?: number }

/**
 * 对伺服路由做一次 HEAD 探针（GET/HEAD 白名单内；面板自身请求携带宿主鉴权，围栏语义
 * 与 iframe 导航同源）。任何拒绝与传输失败都归入对应失败类别，不向上抛。
 * fetchImpl 形参 = 测试注入点（缺省 globalThis.fetch；产品路径不传）。
 */
export async function probeArtifactRoute(url: string, signal: AbortSignal, fetchImpl?: typeof fetch): Promise<ProbeOutcome> {
  try {
    const doFetch = fetchImpl ?? globalThis.fetch.bind(globalThis)
    const response = await doFetch(url, { method: 'HEAD', signal })
    if (response.ok) return { ok: true }
    if (response.status === 404) return { ok: false, kind: 'notFound', status: response.status }
    if (response.status === 403) return { ok: false, kind: 'forbidden', status: response.status }
    return { ok: false, kind: 'error', status: response.status }
  } catch {
    return { ok: false, kind: 'error' }
  }
}

/** 内容版本探针的结果（etag undefined = 响应未附版本标头，调用方按无证据处理）。 */
export type VersionProbeOutcome = { ok: true; etag: string | undefined } | { ok: false }

/**
 * 对当前产物 URL 做一次内容版本探针（D8(c)：HEAD 读取伺服附着的 ETag——mtime+size 摘要，
 * 由 lib/serve/artifacts-route.ts 在 HTML 响应上附带）。探针失败（写盘窗口的瞬时 404 /
 * 传输抖动）按无证据处理返回 ok:false，不驱动重挂——视图不被探针故障翻转（SI3 假阳性
 * 治理的对偶：假阴性场景设计内不可达，见设计 SI3 行）。
 */
export async function probeArtifactVersion(url: string, signal: AbortSignal, fetchImpl?: typeof fetch): Promise<VersionProbeOutcome> {
  try {
    const doFetch = fetchImpl ?? globalThis.fetch.bind(globalThis)
    const response = await doFetch(url, { method: 'HEAD', signal })
    if (!response.ok) return { ok: false }
    const etag = response.headers?.get?.('etag')
    return { ok: true, etag: etag === null ? undefined : etag }
  } catch {
    return { ok: false }
  }
}

// ── picked 落点补齐（U4 检查点：地址解析路径优先、兜底选中路径，与现直发同源）──

/** 拾取评论的落盘维度（评论挂靠的产物路径 + 写通道会话）。 */
export interface PickTarget {
  readonly artifactPath: string
  readonly sessionId: string
}

/**
 * picked → 写通道载荷的落点补齐（唯一裁决点，单测直驱）：
 * 地址可解析为产物（routed 模式）→ artifactPath 与 sessionId 都取自地址解析
 * （artifactPathOf / artifactSessionIdOf——与现直发同源，present-card-link 的
 * parseArtifactAddress 是唯一解析入口）；否则（面板内列表行点选的兜底模式）→
 * 选中路径 + 面板所在会话。两皆无（列表模式无当前产物）→ null：拾取 UI 不挂载，
 * picked 不可达，防御性返回。
 */
export function resolvePickTarget(
  address: string,
  fallback: { readonly path: string } | undefined,
  panelSessionId: string,
): PickTarget | null {
  const routedPath = artifactPathOf(address)
  if (routedPath !== undefined) {
    return { artifactPath: routedPath, sessionId: artifactSessionIdOf(address) ?? panelSessionId }
  }
  if (fallback !== undefined) return { artifactPath: fallback.path, sessionId: panelSessionId }
  return null
}
