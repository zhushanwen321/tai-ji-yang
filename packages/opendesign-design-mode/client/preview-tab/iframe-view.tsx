/**
 * client/preview-tab/iframe-view.tsx —— 设计产物的 iframe 呈现层（U7；设计 D7 缓解落地）。
 *
 * **sandbox 红线**：iframe 一律 `sandbox="allow-scripts"` 且**不含** allow-same-origin——
 * 产物脚本被隔离在恒不同源的 opaque origin 中运行，无法以宿主同源身份携带 cookie 发起
 * 请求、无法读取伺服根内文件、无法触碰宿主域（设计 D7 影响分析的缓解机制；RL8 由 U8 e2e
 * 机器断言，桌面真实宿主上的形态已由 U6 交付门探针实测：load 触发、脚本可执行、产物请求
 * Origin: null、宿主读 iframe 被同源策略拒绝——见 U6 runlog）。**不得为交互便利追加
 * allow-same-origin**：那等于把 cwd 读写权交回产物脚本，D7 的缓解随之失效。
 *
 * **加载态**：先以面板自身对同一路由发一次 HEAD 探针再挂 iframe——沙箱（无
 * allow-same-origin）使父页面读不到 iframe 文档与响应状态（隔离语义的直接后果），错误
 * 分辨只能由同源探针承载：200 → 挂 iframe；404 / 403 → 带恢复动作的失败行；其余状态码
 * 与传输失败 → 通用失败行。iframe 的 onLoad 只用来撤加载指示，不承载错误判定。
 * url 变化即重探并重挂（key 随 url 变化），产物内相对引用（.od-frames/ 设备壳）由
 * iframe 自身按其文档基址解析，不经本组件。
 *
 * 形态先例：ui-sidebar-documentpreview 的 LoadingIndicator（加载指示覆盖在内容位上）；
 * 本文件按本包「零宿主包依赖」纪律用结构类型与本地实现。
 */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import './panel.css'

/** 面板文案翻译函数（宿主 locale 渲染机理合成，{name} 形式插值）。 */
export type PanelTranslate = (key: string, params?: Record<string, string | number>) => string

/** HEAD 探针的终态词表。 */
type ProbeState =
  | { phase: 'probing' }
  | { phase: 'ready'; loaded: boolean }
  | { phase: 'failed'; kind: 'notFound' | 'forbidden' | 'error'; status?: number }

/** 一次 HEAD 探针的结果（ok=false 时带失败类别与可选状态码）。 */
type ProbeOutcome = { ok: true } | { ok: false; kind: 'notFound' | 'forbidden' | 'error'; status?: number }

/**
 * 对伺服路由做一次 HEAD 探针（GET/HEAD 白名单内；面板自身请求携带宿主鉴权，围栏语义
 * 与 iframe 导航同源）。任何拒绝与传输失败都归入对应失败类别，不向上抛。
 */
async function probeArtifactRoute(url: string, signal: AbortSignal): Promise<ProbeOutcome> {
  try {
    const response = await fetch(url, { method: 'HEAD', signal })
    if (response.ok) return { ok: true }
    if (response.status === 404) return { ok: false, kind: 'notFound', status: response.status }
    if (response.status === 403) return { ok: false, kind: 'forbidden', status: response.status }
    return { ok: false, kind: 'error', status: response.status }
  } catch {
    return { ok: false, kind: 'error' }
  }
}

/**
 * 设计产物的 iframe 视图：探针 → 失败行（带重试）/ iframe + 加载指示。
 *
 * @param props.url - 产物伺服路由 URL（document 相对形态，present-card-link 构造）。
 * @param props.name - 产物文件名（iframe 的可访问名与加载指示的指称）。
 * @param props.t - 面板文案。
 */
export function ArtifactIframeView(props: { url: string; name: string; t: PanelTranslate }): ReactNode {
  const { url, name, t } = props
  const [state, setState] = useState<ProbeState>({ phase: 'probing' })
  const [probeToken, setProbeToken] = useState(0)

  // 探针与 abort 生命周期：url 或重试令牌变化即重探；卸载/重探撤上一轮（过期响应不写状态）。
  useEffect(() => {
    const controller = new AbortController()
    setState({ phase: 'probing' })
    void probeArtifactRoute(url, controller.signal).then((outcome) => {
      if (controller.signal.aborted) return
      setState(outcome.ok ? { phase: 'ready', loaded: false } : { phase: 'failed', kind: outcome.kind, status: outcome.status })
    })
    return () => controller.abort()
  }, [url, probeToken])

  if (state.phase === 'failed') {
    const detail = state.kind === 'notFound'
      ? t('frame.notFound')
      : state.kind === 'forbidden'
        ? t('frame.forbidden')
        : t('frame.error', { status: state.status ?? '—' })
    return (
      <div className="odp-view">
        <div className="odp-note" role="status">
          <span>{detail}</span>
          <button type="button" className="odp-button" onClick={() => { setProbeToken(token => token + 1) }}>
            {t('frame.reload')}
          </button>
        </div>
      </div>
    )
  }

  const loading = state.phase === 'probing' || !state.loaded
  return (
    <div className="odp-view">
      <div className="odp-frame-body">
        {state.phase === 'ready' && (
          // D7 缓解红线：sandbox 只放脚本、不放同源（文件头注释；RL8 e2e 断言的缓解机制）。
          <iframe
            key={url}
            className="odp-frame"
            src={url}
            sandbox="allow-scripts"
            title={name}
            onLoad={() => { setState(state => (state.phase === 'ready' ? { ...state, loaded: true } : state)) }}
          />
        )}
        {loading && (
          <div className="odp-frame-loading" role="status">{t('frame.loading')}</div>
        )}
      </div>
    </div>
  )
}
