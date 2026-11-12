/**
 * client/preview-tab/iframe-view.tsx —— 设计产物的 iframe 呈现层（U7；V1 设计包 D7 缓解落地；
 * opendesign-comment-anchor U4：拾取桥的宿主侧承载 + 改稿可见性重挂）。
 *
 * **sandbox 红线**：iframe 一律 `sandbox="allow-scripts"` 且**不含** allow-same-origin——
 * 产物脚本被隔离在恒不同源的 opaque origin 中运行，无法以宿主同源身份携带 cookie 发起
 * 请求、无法读取伺服根内文件、无法触碰宿主域（V1 设计包 D7 影响分析的缓解机制；RL8 由 U8 e2e
 * 机器断言，桌面真实宿主上的形态已由 U6 交付门探针实测：load 触发、脚本可执行、产物请求
 * Origin: null、宿主读 iframe 被同源策略拒绝——见 U6 runlog）。**不得为交互便利追加
 * allow-same-origin**：那等于把 cwd 读写权交回产物脚本，V1 设计包 D7 的缓解随之失效。
 *
 * **加载态**：先以面板自身对同一路由发一次 HEAD 探针再挂 iframe——沙箱（无
 * allow-same-origin）使父页面读不到 iframe 文档与响应状态（隔离语义的直接后果），错误
 * 分辨只能由同源探针承载：200 → 挂 iframe；404 / 403 → 带恢复动作的失败行；其余状态码
 * 与传输失败 → 通用失败行。iframe 的 onLoad 只用来撤加载指示，不承载错误判定。
 * url 变化即重探并重挂（key 随 url 变化），产物内相对引用（.od-frames/ 设备壳）由
 * iframe 自身按其文档基址解析，不经本组件。
 *
 * **拾取桥承载（U4，D5/D8(a)）**：本组件持有 iframe 元素 ref，把 contentWindow 报给
 * 面板体（G1 来源校验的对象同一性基准）并注册 window message 监听——入站报文经
 * pick-bridge 的 G1 三重校验（source === 本 iframe contentWindow × v1 × odp-pick: 前缀）
 * 后转发面板体处理（ready 握手 / picked / anchors-status）；未通过校验的报文在此静默。
 *
 * **改稿可见性（U4，D8(c)/AS9/SI3）**：产物就绪后对当前 URL 跑内容版本探针（5 秒定时 +
 * 窗口聚焦/可见性恢复触发，HEAD 比对伺服附着的 ETag）——版本变化即递增 iframe key 重挂，
 * 新文档的拾取脚本重新 ready 握手、徽章按重发的锚点集重建。探针失败/无版本标头按无证据
 * 处理（不重挂——写盘窗口的瞬时 404 与传输抖动不该翻转视图）；探针生命周期随 iframe
 * 卸载/组件卸载终止。
 *
 * 形态先例：ui-sidebar-documentpreview 的 LoadingIndicator（加载指示覆盖在内容位上）；
 * 本文件按本包「零宿主包依赖」纪律用结构类型与本地实现。
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import './panel.css'
import {
  CONTENT_PROBE_INTERVAL_MS,
  parseInboundPickMessage,
  probeArtifactRoute,
  probeArtifactVersion,
  type ParsedInboundPickMessage,
} from './pick-bridge'

/** 面板文案翻译函数（宿主 locale 渲染机理合成，{name} 形式插值）。 */
export type PanelTranslate = (key: string, params?: Record<string, string | number>) => string

/** HEAD 探针的终态词表。 */
type ProbeState =
  | { phase: 'probing' }
  | { phase: 'ready'; loaded: boolean }
  | { phase: 'failed'; kind: 'notFound' | 'forbidden' | 'error'; status?: number }

/**
 * 设计产物的 iframe 视图：探针 → 失败行（带重试）/ iframe + 加载指示 + 桥承载 + 版本探针。
 *
 * @param props.url - 产物伺服路由 URL（document 相对形态，present-card-link 构造）。
 * @param props.name - 产物文件名（iframe 的可访问名与加载指示的指称）。
 * @param props.t - 面板文案。
 * @param props.onBridgeMessage - 通过 G1 校验的入站桥报文转发（面板体桥控制器消费）。
 * @param props.onFrameWindow - iframe contentWindow 上报（挂载/重挂/卸载；null = 卸载）。
 */
export function ArtifactIframeView(props: {
  url: string
  name: string
  t: PanelTranslate
  onBridgeMessage?: (message: ParsedInboundPickMessage) => void
  onFrameWindow?: (frameWindow: unknown) => void
}): ReactNode {
  const { url, name, t } = props
  const [state, setState] = useState<ProbeState>({ phase: 'probing' })
  const [probeToken, setProbeToken] = useState(0)
  // 改稿可见性的重挂令牌（D8(c)）：版本探针发现 ETag 变化即递增，key 变化重建 iframe。
  const [remountToken, setRemountToken] = useState(0)
  // 桥通道基准与监听回调走 latest-ref：监听/上报 effect 只注册一次，不随渲染回调换身份重跑。
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const onBridgeMessageRef = useRef(props.onBridgeMessage)
  onBridgeMessageRef.current = props.onBridgeMessage
  const onFrameWindowRef = useRef(props.onFrameWindow)
  onFrameWindowRef.current = props.onFrameWindow
  // 内容版本基线（SC3 缓存：当前预览产物的 ETag 值；探针单向跟随、变化即重挂）。
  const etagBaselineRef = useRef<string | undefined>(undefined)

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

  // 桥通道基准上报（G1）：iframe 挂载/重挂/卸载时把 contentWindow 报给面板体；null =
  // 卸载（面板体随即失就绪、出站停用，等新文档 ready 二次握手——D8(a) 重载协议）。
  // 依赖含 remountToken：版本重挂只换 key 不换 url/phase，漏报会让就绪校验停在旧窗口。
  useEffect(() => {
    onFrameWindowRef.current?.(frameRef.current?.contentWindow ?? null)
    return () => { onFrameWindowRef.current?.(null) }
  }, [url, probeToken, state.phase, remountToken])

  // 入站桥监听（D5）：注册一次常驻（不随 iframe 内容重载卸载——SI2 时序锁定）；G1 三重
  // 校验在 parse 内完成（source 与当次事件时刻的 contentWindow 比对），未通过静默丢弃。
  useEffect(() => {
    const handler = (event: MessageEvent): void => {
      const parsed = parseInboundPickMessage(event, frameRef.current?.contentWindow ?? null)
      if (parsed !== null) onBridgeMessageRef.current?.(parsed)
    }
    window.addEventListener('message', handler)
    return () => { window.removeEventListener('message', handler) }
  }, [])

  // 内容版本探针（D8(c)）：就绪后立即取基线（首观察只记基线不重挂），此后 5 秒定时 +
  // 聚焦/可见性恢复触发 HEAD 比对；ETag 变化即换基线并递增重挂令牌（基线即换即走，同一
  // 变化不重复触发）。探针失败/无标头按无证据跳过；卸载/离开就绪态即整体停止。
  useEffect(() => {
    if (state.phase !== 'ready') return
    etagBaselineRef.current = undefined
    let stopped = false
    const controller = new AbortController()
    const runProbe = (): void => {
      void probeArtifactVersion(url, controller.signal).then((outcome) => {
        if (stopped || !outcome.ok || outcome.etag === undefined) return
        const baseline = etagBaselineRef.current
        if (baseline === undefined) {
          etagBaselineRef.current = outcome.etag
          return
        }
        if (outcome.etag !== baseline) {
          etagBaselineRef.current = outcome.etag
          setRemountToken(token => token + 1)
        }
      })
    }
    runProbe()
    const timer = window.setInterval(runProbe, CONTENT_PROBE_INTERVAL_MS)
    const runProbeIfVisible = (): void => {
      if (document.visibilityState === 'visible') runProbe()
    }
    window.addEventListener('focus', runProbeIfVisible)
    document.addEventListener('visibilitychange', runProbeIfVisible)
    return () => {
      stopped = true
      controller.abort()
      window.clearInterval(timer)
      window.removeEventListener('focus', runProbeIfVisible)
      document.removeEventListener('visibilitychange', runProbeIfVisible)
    }
  }, [url, state.phase, remountToken])

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
          // V1 设计包 D7 缓解红线：sandbox 只放脚本、不放同源（文件头注释；RL8 e2e 断言的缓解机制）。
          // key = url@重挂令牌：产物切换与版本重挂（D8(c)）都走 key 重建，新文档脚本重新 ready。
          <iframe
            key={`${url}@${remountToken}`}
            ref={frameRef}
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
