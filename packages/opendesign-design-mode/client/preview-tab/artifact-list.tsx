/**
 * client/preview-tab/artifact-list.tsx —— 面板内产物列表兜底（U7；设计 U7「列会话 cwd 下
 * 产物文件，点击载入 iframe」）。
 *
 * 数据源 = 宿主 workspaceFiles 的目录列举 remote（`ctx.remote.workspaceFiles.list`，经
 * index.tsx 闭包捕获传入——服务不经槽 props，本仓项目分组浏览器的同款装配形态）。只列
 * workspace 根一层、只收 .html/.htm 的普通文件项：产物形态开放但 index.html 在根是设计
 * 的既定形态（V1 设计包 D7 否决「产物子树白名单」时给出的形态事实），子目录不递归——列表是兜底
 * 入口而非文件树，递归面留给通用文件预览。`.od-frames/` 是设备壳目录（材质化落点），
 * 类型为 directory，天然不进产物列表。
 *
 * 行点击不发起 openResource 导航：兜底场景的语义是「地址路由之外的第二入口」，点击在本
 * 面板内直接载入 iframe（索引页交换 selectedPath），不依赖路由可达性。
 */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { isArtifactName } from '../present-card-link'
import './panel.css'
import type { PanelTranslate } from './iframe-view'

/** 一行产物：workspace 相对路径（本层 = 文件名）与显示名。 */
export interface ArtifactEntry {
  readonly path: string
  readonly name: string
}

/** 一次产物列举的终态（列表器把远端失败收拢为 ok=false，不向上抛）。 */
export interface ArtifactListOutcome {
  readonly ok: boolean
  readonly artifacts: readonly ArtifactEntry[]
  readonly truncated: boolean
}

/** 产物列举器（index.tsx 按 ctx.remote.workspaceFiles 构造；sessionId → 根层 HTML 文件）。 */
export type ArtifactLister = (sessionId: string, signal: AbortSignal) => Promise<ArtifactListOutcome>

/** 列表加载的视图状态。 */
type ListState =
  | { phase: 'loading' }
  | { phase: 'done'; artifacts: readonly ArtifactEntry[]; truncated: boolean }
  | { phase: 'error' }

/**
 * 面板内产物列表：加载 → 行列表 / 空态 / 失败行。
 *
 * @param props.listArtifacts - 产物列举器（闭包捕获的 remote 面）。
 * @param props.sessionId - 面板所在会话（列表范围 = 该会话 workspace 根）。
 * @param props.onSelect - 行点击回调（索引页交换给 iframe 视图）。
 * @param props.t - 面板文案。
 */
export function ArtifactList(props: {
  listArtifacts: ArtifactLister
  sessionId: string
  onSelect: (entry: ArtifactEntry) => void
  t: PanelTranslate
}): ReactNode {
  const { listArtifacts, sessionId, onSelect, t } = props
  const [state, setState] = useState<ListState>({ phase: 'loading' })
  const [reloadToken, setReloadToken] = useState(0)

  // 会话或重载令牌变化即重列；abort 撤上一轮，过期响应不写状态。
  useEffect(() => {
    const controller = new AbortController()
    setState({ phase: 'loading' })
    void listArtifacts(sessionId, controller.signal).then((outcome) => {
      if (controller.signal.aborted) return
      setState(outcome.ok
        ? { phase: 'done', artifacts: outcome.artifacts, truncated: outcome.truncated }
        : { phase: 'error' })
    })
    return () => controller.abort()
  }, [listArtifacts, sessionId, reloadToken])

  if (state.phase === 'loading') {
    return <div className="odp-note" role="status">{t('list.loading')}</div>
  }
  if (state.phase === 'error') {
    return (
      <div className="odp-note" role="status">
        <span>{t('list.error')}</span>
        <button type="button" className="odp-button" onClick={() => { setReloadToken(token => token + 1) }}>
          {t('frame.reload')}
        </button>
      </div>
    )
  }
  if (state.artifacts.length === 0) {
    return <div className="odp-note">{t('list.empty')}</div>
  }
  return (
    <div className="odp-list" role="list">
      {state.truncated && <div className="odp-note">{t('list.truncated')}</div>}
      {state.artifacts.map(entry => (
        <button
          key={entry.path}
          type="button"
          role="listitem"
          className="odp-row"
          onClick={() => { onSelect(entry) }}
        >
          {entry.name}
        </button>
      ))}
    </div>
  )
}
