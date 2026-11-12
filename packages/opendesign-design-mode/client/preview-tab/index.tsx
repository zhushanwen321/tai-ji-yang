/**
 * client/preview-tab/index.tsx —— 设计预览面板的浏览器半场入口（U7 终态实现；V1 设计包 D7）。
 *
 * 职责（本文件 = tab 注册 + 面板体；地址契约与呈现层分属 present-card-link.ts 与
 * iframe-view.tsx / artifact-list.tsx）：
 *   1. 经 `ctx.sidebarRightTabs` 注册右侧栏 design tab 类型（可停靠/分屏/浮动）：地址认领
 *      走 ui-sidebar-right 的公开注册入口——patterns 全地址候选 + canOpen 收窄（形态照
 *      ui-schedule / ui-sidebar-documentpreview 范例），优先级带显式 extension（本包是
 *      宿主外类型，且必须压过 documentpreview 对全部 file 地址的 fallback 认领才能接到
 *      HTML 产物；认领范围收窄到设计会话，见 present-card-link.ts 文件头）。guide 入口
 *      胶囊提供「打开面板页（产物列表兜底）」的无地址入口。
 *   2. 把面板体注册进 keyed `sidebar.right.pane.tab` 槽（key = tab 定义 id，dispatch
 *      即按它路由）；槽位声明 `locale:` 让渲染机理合成 t 座位，组件只用本地状态、不设
 *      store。面板体两模式：地址可解析为产物 → iframe 视图；否则（guide 页面地址）→
 *      产物列表兜底，行点击在本面板内载入 iframe。
 *   3. 拾取桥接线（opendesign-comment-anchor U4）：面板体是桥的宿主侧端点与评论编排方——
 *      picked → resolvePickTarget 补齐 artifactPath/sessionId → commentsApi.create →
 *      submit-result 回执；就绪态管理（ready 前评论模式开关与定位按钮禁用）、anchors
 *      下发（线程 id+序号+sel）与 locate/anchors-status（misses 标侧栏条目失效态）。
 *      桥报文判定与控制器在 pick-bridge.ts（react-free，单测直驱）。
 *
 * 装配序（本包纪律）：locale 字典先于 tab 类型与面板槽位的注册（t 座位按 (命名空间,
 * revision) 合成，缺字典 fail-loud）。贡献点（字典 / tab 类型 / 槽位）一律经 ctx.effect
 * 托管——slots.inject 与 sidebarRightTabs.register 都返还 disposer，卸载即撤除。
 *
 * 零宿主包依赖红线：不 import 任何 dsh-client 包；宿主服务全部走最小结构类型
 * （PreviewApplyContext），产物 require 字面量 ⊆ 宿主模块基线（check-require-baseline）。
 */

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { CommentThread } from '../lib/comments/contract'
import {
  DESIGN_PANEL_LOCALE_NS,
  GENERIC_PREVIEW_KIND,
  OPENDESIGN_TAB_ID,
  OPENDESIGN_TAB_KIND,
  artifactRouteUrlFor,
  artifactRouteUrlForPath,
  artifactSessionIdOf,
  artifactTitleFor,
  canOpenArtifactAddress,
  isArtifactName,
  probeDesignSession,
} from '../present-card-link'
import { ArtifactIframeView, type PanelTranslate } from './iframe-view'
import { ArtifactList, type ArtifactLister } from './artifact-list'
import { CommentsSidebar } from '../comments/panel'
import { createCommentsApi, type CommentsApi } from '../comments/api'
import {
  anchorsOfThreads,
  createPickBridge,
  resolvePickTarget,
  type PickBridge,
  type PickTarget,
} from './pick-bridge'
import { en, zh } from './locales'
import './panel.css'

/**
 * 本包浏览器半场消费的宿主服务名（fiber inject 声明；ctx.<name> 未声明即读即抛——
 * 根包 apply.ts 的 2026-11-07 真机教训）。取值 = apply 实际读到的 ctx 面，不多写。
 */
export const inject = ['slots', 'sidebarRightTabs', 'sidebarRight', 'locale', 'remote', 'remote.workspaceFiles'] as const

/** workspaceFiles.list 的目录列举返回（dsh-api-workspace-files 公开 wire 类型的局部同构）。 */
interface WorkspaceListing {
  readonly path: string
  readonly truncated: boolean
  readonly entries: readonly {
    readonly name: string
    readonly type: 'file' | 'directory' | 'other'
    readonly size?: number
  }[]
}

/** 本包浏览器半场用到的宿主 context（最小结构类型；不 import 任何 dsh-client 包）。 */
export interface PreviewApplyContext {
  /** 登记启动副作用并拿到 fiber 生命周期托管（卸载时反序执行 disposer）。 */
  effect(callback: () => (() => void) | void, label?: string): void
  /** locale 服务：register 挂字典，bind 把命名空间绑成翻译函数（thunk，逐次读当前语言）。 */
  locale: {
    register(ns: string, dictionaries: Record<string, Record<string, string>>): unknown
    bind(ns: string): PanelTranslate
  }
  /** 右侧栏 tab 类型注册表（ui-sidebar-right 的公开注册面）。 */
  sidebarRightTabs: {
    register(definition: {
      readonly id: string
      readonly kind: string
      readonly keepMounted?: boolean
      readonly patterns?: readonly string[]
      readonly priority?: 'extension' | 'builtin' | 'fallback'
      readonly canOpen?: (address: string) => boolean
      readonly title: (address: string) => string
      readonly guide?: readonly {
        readonly id: string
        readonly order: number
        readonly title: () => string
        readonly description?: () => string
      }[]
    }): () => void
  }
  /**
   * 右侧栏资源打开面（ui-sidebar-right ISidebarRight 的局部同构；只取弹回通道消费的
   * 形态）。非设计会话产物经具名 kind 原位弹回通用文件预览——具名打开跳过认领排序，
   * 该 kind 的 canOpen 仍然生效（FF6 认领范围裁决的回退通道）。
   */
  sidebarRight: {
    openResource(address: string, options?: {
      readonly kind?: string
      readonly replaceTab?: string
    }): void
  }
  /** 槽位注册面（inject 声明后注入面板体；register 返还 disposer）。 */
  slots: {
    inject(key: string, callback: () => (() => void) | void): unknown
    register(options: { name: string; key: string; locale?: string }, component: unknown): () => void
  }
  /** workspace 文件列举 remote（产物列表兜底的数据源）。 */
  remote: {
    workspaceFiles: {
      /**
       * 列举会话 workspace 内一个目录的直接子项（scope = 会话 id，path = workspace 相对路径）。
       * 运行时实际返回 typert 结果包装 {ok, value}（宿主 face.ts:377 同款；esbuild 无类型门禁，
       * 此处签名按解包后形态声明不逐字对齐 wire 类型），消费侧按 {ok, value} 解包。
       */
      list(scope: string, path: string, signal: AbortSignal): Promise<WorkspaceListing>
    }
  }
}

/** 面板体读到的 tab 信息面（ui-sidebar-right tab-info 的局部同构；只取本包消费的字段）。 */
interface DesignTabInfo {
  readonly tab: {
    readonly id: string
    readonly contentId: string
    readonly navigation: { readonly address: string; readonly revision: number }
    readonly signal: AbortSignal
  }
}

/**
 * 构造产物列表器（面板槽位的闭包捕获依赖——服务不经槽 props，本仓项目分组浏览器同款装配）。
 *
 * 列举范围 = 会话 workspace 根一层；根目录寻址用 `'.'`（list 的 path 参数拒绝空串，
 * workspace 相对路径语法中 `'.'` 即根）。远端失败收拢为 ok=false（RemoteError 不向上抛）。
 */
function createArtifactLister(ctx: PreviewApplyContext): ArtifactLister {
  return async (sessionId, signal) => {
    try {
      // typert remote 返回 {ok, value} 结果包装（0.1.7 实测；宿主 sidebar-files 同款解包）——
      // 直接把包装当 listing 解构会让 entries 落 undefined（U8 e2e 实测修正，2026-11-09）。
      const outcome = await ctx.remote.workspaceFiles.list(sessionId, '.', signal)
      if (signal.aborted) return { ok: false, artifacts: [], truncated: false }
      if (!outcome.ok) return { ok: false, artifacts: [], truncated: false }
      const listing = outcome.value
      const artifacts = listing.entries
        // 目录列举返回的是裸文件名（无路径段、无编码形态），后缀判定即可，不必绕地址解析
        .filter(entry => entry.type === 'file' && isArtifactName(entry.name))
        .map(entry => ({ path: entry.name, name: entry.name }))
      return { ok: true, artifacts, truncated: listing.truncated }
    } catch {
      return { ok: false, artifacts: [], truncated: false }
    }
  }
}

/**
 * 构造面板体组件（闭包携带列表器、弹回通道与评论写通道）。
 *
 * 模式分发（唯一裁决 = present-card-link 的地址解析）：navigation.address 可解析为产物
 * → iframe 视图（openResource 与交付卡片点击路由到的形态）；否则（guide 打开的页面地址
 * 等非产物地址）→ 产物列表兜底，行点击在本面板内载入 iframe（返回钮回列表）。
 *
 * 会话维度（FF6 认领范围裁决的执行点）：canOpen 对未探测会话乐观认领（同步否决函数
 * 无会话→preset 查询入口），面板体探测所属会话（present-card-link 的材质化标记伺服
 * 可达性），非设计会话在产物地址模式经弹回通道原位交回通用文件预览（具名 kind 跳过
 * 认领排序——本 tab 的认领在该会话由此退出）。探测结果同时是评论元素的挂载裁决：
 * 评论侧栏只在 iframe 模式 × 设计会话 × 有当前产物时出现（opendesign-comment-loop
 * §3.1 面板 UI 段「出现条件 = 设计会话判定，与面板现状同源」）；列表兜底模式只对
 * 设计会话拉取各产物的评论计数（.odp-row 徽标），非设计会话列表现状不变（comment-loop·V5）。
 */
function createDesignPanelBody(
  listArtifacts: ArtifactLister,
  bounceToGenericPreview: (address: string, tabId: string) => void,
  commentsApi: CommentsApi,
) {
  return function DesignPreviewTab(props: {
    useTabInfo: () => DesignTabInfo
    sessionId: string
    t: PanelTranslate
  }): ReactNode {
    const { useTabInfo, sessionId, t } = props
    const { tab } = useTabInfo()
    // 兜底模式的选中产物（地址寻址模式不消费；面板卸载即随组件消亡，不设持久状态）
    const [fallback, setFallback] = useState<{ path: string; name: string } | undefined>(undefined)
    // 设计会话判定（探测终态；undefined = 在途/未探测——评论元素在定案 true 前不出现）
    const [designSession, setDesignSession] = useState<boolean | undefined>(undefined)
    // 各产物的评论线程数（列表行徽标；仅设计会话拉取，失败缺省无徽标不打扰列表主功能）
    const [commentCounts, setCommentCounts] = useState<ReadonlyMap<string, number> | undefined>(undefined)
    // ── 拾取桥接线（U4：面板 = 桥宿主侧端点 + 评论编排方，opendesign-comment-anchor D5/D8）──
    // frameReady：脚本 ready 握手终态（ready 前评论模式开关与定位按钮禁用，D8(a)）
    const [frameReady, setFrameReady] = useState(false)
    // pickMode：评论模式开关当前态（经桥 pick-mode 出站驱动 iframe 内拾取交互）
    const [pickMode, setPickMode] = useState(false)
    // missedThreadIds：anchors-status 回报的锚点失效线程集（侧栏条目失效态数据源，D8(b)）
    const [missedThreadIds, setMissedThreadIds] = useState<ReadonlySet<string>>(() => new Set<string>())
    // threads：当前产物的线程列表（侧栏拉取后上报；anchors 下发集由它现算）
    const [threads, setThreads] = useState<readonly CommentThread[]>([])
    // commentReloadToken：拾取提交成功后的侧栏重拉信号（重拉 → threads 变化 → anchors 重发）
    const [commentReloadToken, setCommentReloadToken] = useState(0)

    const address = tab.navigation.address
    const routeUrl = artifactRouteUrlFor(address)
    const iframe = routeUrl !== undefined
      ? { url: routeUrl, name: artifactTitleFor(address) }
      : fallback !== undefined
        ? { url: artifactRouteUrlForPath(sessionId, fallback.path), name: fallback.name }
        : undefined
    // 评论落点补齐（U4：地址解析路径优先、兜底选中路径，与现直发同源——resolvePickTarget
    // 是唯一裁决点，单测直驱）；列表模式无当前产物 → null（评论侧栏与拾取桥都不挂载）
    const pickTarget = resolvePickTarget(address, fallback, sessionId)
    const artifactPath = pickTarget?.artifactPath
    const commentsSessionId = pickTarget?.sessionId ?? sessionId

    // 会话探测（乐观认领的最终裁决 + 评论元素挂载条件）：非设计会话在产物地址模式
    // 原位弹回通用文件预览。依赖 tab.id——replaceTab 以本 tab 为落点，弹回即关闭本
    // tab，effect 随卸载取消。
    useEffect(() => {
      const target = artifactSessionIdOf(address) ?? sessionId
      const tabId = tab.id
      const addressed = routeUrl !== undefined
      let cancelled = false
      void probeDesignSession(target).then((design) => {
        if (cancelled) return
        setDesignSession(design)
        if (!design && addressed) bounceToGenericPreview(address, tabId)
      })
      return () => { cancelled = true }
    }, [address, routeUrl, sessionId, tab.id, bounceToGenericPreview])

    // 列表兜底模式的设计会话评论计数（iframe 模式不拉——侧栏自己按当前产物拉全量）。
    // 失败（含数据损坏）静默缺省：列表是兜底主功能，徽标不出现即可，错误态由侧栏承载。
    useEffect(() => {
      if (routeUrl !== undefined || designSession !== true) {
        setCommentCounts(undefined)
        return
      }
      const controller = new AbortController()
      void commentsApi.list(sessionId, controller.signal).then((outcome) => {
        if (controller.signal.aborted) return
        if (!outcome.ok) { setCommentCounts(undefined); return }
        const counts = new Map<string, number>()
        for (const thread of outcome.threads) {
          counts.set(thread.artifactPath, (counts.get(thread.artifactPath) ?? 0) + 1)
        }
        setCommentCounts(counts)
      })
      return () => controller.abort()
    }, [routeUrl, designSession, sessionId, commentsApi])

    // 桥控制器（懒初始化，实例随面板体生命周期）：picked 落点在渲染期已定案（pickTarget），
    // 闭包经 latest-ref 读当次值——控制器不随渲染重建，就绪态/模式态/锚点集不因重渲染丢失。
    const bridgeContextRef = useRef<{ pickTarget: PickTarget | null; t: PanelTranslate }>({ pickTarget, t })
    bridgeContextRef.current = { pickTarget, t }
    const bridgeRef = useRef<PickBridge | undefined>(undefined)
    if (bridgeRef.current === undefined) {
      bridgeRef.current = createPickBridge({
        submitPick: async ({ anchor, text }) => {
          const { pickTarget: target, t: translate } = bridgeContextRef.current
          if (target === null) return { ok: false, reason: translate('comments.sendError') }
          // 补齐同源（resolvePickTarget）：sessionId/artifactPath 与侧栏挂载用同一份现算值
          const outcome = await commentsApi.create({
            sessionId: target.sessionId,
            artifactPath: target.artifactPath,
            text,
            anchor,
          })
          if (!outcome.ok) return { ok: false, reason: translate('comments.sendError') }
          // 成功 → 侧栏重拉 → threads 变化 → anchors 重发（新线程徽章随重发到达，D8(a)）
          setCommentReloadToken(token => token + 1)
          return { ok: true, threadId: outcome.thread.id }
        },
        onReady: () => { setFrameReady(true) },
        onMisses: (misses) => { setMissedThreadIds(new Set(misses.map(miss => miss.threadId))) },
      })
    }
    const bridge = bridgeRef.current

    // anchors 随线程变化下发（D8(a)：ready 前由桥记态、握手 flush 补发；线程增删后重发，
    // 徽章随之重建——面板无需区分「首发」与「重发」两种时序）
    useEffect(() => {
      bridge.setAnchors(anchorsOfThreads(threads))
    }, [bridge, threads])

    // 切换产物（iframe url 变化）：评论模式与失效态跟产物走，清空待新产物数据上报；
    // 桥侧置态即可——新文档 ready 握手时 flush 补发（url 重挂同时使就绪态复位）
    useEffect(() => {
      setPickMode(false)
      bridge.setPickMode(false)
      setMissedThreadIds(new Set<string>())
      setThreads([])
    }, [bridge, iframe?.url])

    const handleFrameWindow = (frameWindow: unknown): void => {
      bridge.setFrameWindow(frameWindow)
      // 换窗即失就绪（D8(a)）：评论模式开关与定位按钮回到禁用态，等新文档 ready 二次握手
      setFrameReady(false)
    }
    const togglePickMode = (): void => {
      const next = !pickMode
      setPickMode(next)
      bridge.setPickMode(next)
    }
    const locateThread = (thread: CommentThread): void => {
      if (!frameReady || thread.anchor === undefined) return
      bridge.locate(thread.anchor.sel)
    }

    if (iframe === undefined) {
      return (
        <div className="odp-body">
          <ArtifactList
            listArtifacts={listArtifacts}
            sessionId={sessionId}
            onSelect={setFallback}
            t={t}
            commentCounts={commentCounts}
          />
        </div>
      )
    }
    return (
      <div className="odp-body odp-body--split">
        <div className="odp-main">
          {routeUrl === undefined && (
            <div className="odp-note">
              <button type="button" className="odp-button" onClick={() => { setFallback(undefined) }}>
                {t('list.back')}
              </button>
            </div>
          )}
          <ArtifactIframeView
            url={iframe.url}
            name={iframe.name}
            t={t}
            onBridgeMessage={bridge.handleMessage}
            onFrameWindow={handleFrameWindow}
          />
        </div>
        {designSession === true && artifactPath !== undefined && (
          <CommentsSidebar
            sessionId={commentsSessionId}
            artifactPath={artifactPath}
            t={t}
            ready={frameReady}
            pickMode={pickMode}
            missedThreadIds={missedThreadIds}
            reloadToken={commentReloadToken}
            onThreads={setThreads}
            onTogglePickMode={togglePickMode}
            onLocate={locateThread}
          />
        )}
      </div>
    )
  }
}

/**
 * 浏览器半场装配入口（factory 壳物化时执行）。
 *
 * @param ctx - 宿主 client context（inject 声明的五项服务）。
 */
export function apply(ctx: PreviewApplyContext): void {
  const t = ctx.locale.bind(DESIGN_PANEL_LOCALE_NS)

  // ① 面板字典（先于任何声明 locale: 的槽位渲染——装配序硬约束，见文件头）
  ctx.effect(() => ctx.locale.register(DESIGN_PANEL_LOCALE_NS, { zh, en }), 'opendesign-design-mode: 面板字典')

  // ② design tab 类型：地址认领（patterns 候选 + canOpen 收窄 + extension 带）与 guide 入口。
  //    keepMounted：预览的是可交互原型，切走再切回保留产物内状态，不重放加载。
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: OPENDESIGN_TAB_ID,
    kind: OPENDESIGN_TAB_KIND,
    keepMounted: true,
    patterns: ['dsh-resource://file/[\\s\\S]+'],
    priority: 'extension',
    canOpen: canOpenArtifactAddress,
    title: (address) => (canOpenArtifactAddress(address) ? artifactTitleFor(address) : t('panel.title')),
    guide: [{
      id: 'design-preview',
      order: 10,
      title: () => t('guide.title'),
      description: () => t('guide.desc'),
    }],
  }), 'opendesign-design-mode: design tab 类型')

  // ③ 面板体：keyed sidebar.right.pane.tab 槽，key = tab 定义 id（dispatch 即按它路由）
  // 弹回通道（FF6 认领范围裁决的回退路径）：非设计会话产物经具名 kind 原位交回通用文件
  // 预览——具名打开跳过认领排序、目标 kind 的 canOpen 仍生效；本 tab 经 replaceTab 同步
  // 关闭。render 路径禁抛：失败保持面板现状（探测缓存的 false 会让该会话后续地址在
  // canOpen 直接否决，不再进入面板）。
  const bounceToGenericPreview = (address: string, tabId: string): void => {
    try {
      ctx.sidebarRight.openResource(address, { kind: GENERIC_PREVIEW_KIND, replaceTab: tabId })
    } catch {
      // 保持面板现状；不向上抛
    }
  }
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: OPENDESIGN_TAB_ID, locale: DESIGN_PANEL_LOCALE_NS },
    createDesignPanelBody(createArtifactLister(ctx), bounceToGenericPreview, createCommentsApi()),
  )), 'opendesign-design-mode: 面板体')
}
