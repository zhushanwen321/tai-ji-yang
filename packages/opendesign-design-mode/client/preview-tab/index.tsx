/**
 * client/preview-tab/index.tsx —— 设计预览面板的浏览器半场入口（U7 终态实现；V1 设计包 D7）。
 *
 * 职责（本文件 = tab 注册 + 面板体；地址契约与呈现层分属 present-card-link.ts 与
 * iframe-view.tsx / artifact-list.tsx）：
 *   1. 经 `ctx.sidebarRightTabs` 注册右侧栏 design tab 类型（可停靠/分屏/浮动）：地址认领
 *      走 ui-sidebar-right 的公开注册面——patterns 全地址候选 + canOpen 收窄（形态照
 *      ui-schedule / ui-sidebar-documentpreview 范例），优先级带显式 extension（本包是
 *      宿主外类型，且必须压过 documentpreview 对全部 file 地址的 fallback 认领才能接到
 *      HTML 产物；窄化语义见 present-card-link.ts 文件头）。guide 入口胶囊提供「打开面板
 *      页（产物列表兜底）」的无地址入口。
 *   2. 把面板体注册进 keyed `sidebar.right.pane.tab` 槽（key = tab 定义 id，dispatch
 *      即按它路由）；槽位声明 `locale:` 让渲染机理合成 t 座位，组件只用本地状态、不设
 *      store。面板体两模式：地址可解析为产物 → iframe 视图；否则（guide 页面地址）→
 *      产物列表兜底，行点击在本面板内载入 iframe。
 *
 * 装配序（本包纪律）：locale 字典先于 tab 类型与面板槽位的注册（t 座位按 (命名空间,
 * revision) 合成，缺字典 fail-loud）。贡献点（字典 / tab 类型 / 槽位）一律经 ctx.effect
 * 托管——slots.inject 与 sidebarRightTabs.register 都返还 disposer，卸载即撤除。
 *
 * 零宿主包依赖红线：不 import 任何 dsh-client 包；宿主服务全部走最小结构类型
 * （PreviewApplyContext），产物 require 字面量 ⊆ 宿主模块基线（check-require-baseline）。
 */

import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  DESIGN_PANEL_LOCALE_NS,
  OPENDESIGN_TAB_ID,
  OPENDESIGN_TAB_KIND,
  artifactRouteUrlFor,
  artifactRouteUrlForPath,
  artifactTitleFor,
  canOpenArtifactAddress,
  isArtifactName,
} from '../present-card-link'
import { ArtifactIframeView, type PanelTranslate } from './iframe-view'
import { ArtifactList, type ArtifactLister } from './artifact-list'
import { en, zh } from './locales'
import './panel.css'

/**
 * 本包浏览器半场消费的宿主服务名（fiber inject 声明；ctx.<name> 未声明即读即抛——
 * 根包 apply.ts 的 2026-11-07 真机教训）。取值 = apply 实际读到的 ctx 面，不多写。
 */
export const inject = ['slots', 'sidebarRightTabs', 'locale', 'remote', 'remote.workspaceFiles'] as const

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
 * 构造面板体组件（闭包携带列表器）。
 *
 * 模式分发（唯一裁决 = present-card-link 的地址解析）：navigation.address 可解析为产物
 * → iframe 视图（openResource 与交付卡片点击路由到的形态）；否则（guide 打开的页面地址
 * 等非产物地址）→ 产物列表兜底，行点击在本面板内载入 iframe（返回钮回列表）。
 */
function createDesignPanelBody(listArtifacts: ArtifactLister) {
  return function DesignPreviewTab(props: {
    useTabInfo: () => DesignTabInfo
    sessionId: string
    t: PanelTranslate
  }): ReactNode {
    const { useTabInfo, sessionId, t } = props
    const { tab } = useTabInfo()
    // 兜底模式的选中产物（地址寻址模式不消费；面板卸载即随组件消亡，不设持久状态）
    const [fallback, setFallback] = useState<{ path: string; name: string } | undefined>(undefined)

    const address = tab.navigation.address
    const routeUrl = artifactRouteUrlFor(address)
    const iframe = routeUrl !== undefined
      ? { url: routeUrl, name: artifactTitleFor(address) }
      : fallback !== undefined
        ? { url: artifactRouteUrlForPath(sessionId, fallback.path), name: fallback.name }
        : undefined

    if (iframe === undefined) {
      return (
        <div className="odp-body">
          <ArtifactList listArtifacts={listArtifacts} sessionId={sessionId} onSelect={setFallback} t={t} />
        </div>
      )
    }
    return (
      <div className="odp-body">
        {routeUrl === undefined && (
          <div className="odp-note">
            <button type="button" className="odp-button" onClick={() => { setFallback(undefined) }}>
              {t('list.back')}
            </button>
          </div>
        )}
        <ArtifactIframeView url={iframe.url} name={iframe.name} t={t} />
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
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: OPENDESIGN_TAB_ID, locale: DESIGN_PANEL_LOCALE_NS },
    createDesignPanelBody(createArtifactLister(ctx)),
  )), 'opendesign-design-mode: 面板体')
}
