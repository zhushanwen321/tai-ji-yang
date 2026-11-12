/**
 * client/comments/panel.tsx —— 评论侧栏（面板壳层组件，非 iframe 内；opendesign-comment-loop
 * §3.1 面板 UI 段 + opendesign-comment-anchor U4/D3 入口唯一化改造）。
 *
 * 形态：iframe 预览模式下常驻右缘折叠条（竖排「评论」条钮）；展开显示当前产物的评论
 * 线程列表 + 线程内追加输入。**首评直发输入框已移除（D3 入口唯一化）**：新建线程的唯一
 * 入口 = 产物内拾取（侧栏头部「评论模式」开关经桥驱动 iframe 内拾取交互，picked 经桥
 * 回面板落盘）；侧栏保留线程列表、线程内追加（reply，不产生新锚点）、resolve/重开、
 * 失败重试与定位。挂载裁决在 preview-tab/index.tsx（设计会话探测 true 且有当前产物才挂）。
 *
 * 桥联动（D8）：定位按钮与评论模式开关的就绪态由面板体下发（ready = iframe 内拾取脚本
 * 完成握手）；anchors-status 回报的失效线程集以 missedThreadIds 下发——失效条目呈「锚点
 * 失效」标注且定位按钮禁用（失效锚点无可定位对象，D1 已接受代价的恢复路径条款）；线程
 * 列表经 onThreads 上报面板体（anchors 下发集的唯一数据源，SC2 派生视图）。
 *
 * 数据纪律（AX1/SC2）：权威是会话工作目录的评论数据文件；本组件是无内存态的派生视图——
 * 展开与每次操作成功后都经 GET 基路径重拉重建，不缓存、不反向写。GET 失败（含评论数据
 * 文件损坏）统一显示错误态（文案指引 /opendesign-doctor），不返回空列表伪装正常（comment-loop·V9）。
 *
 * 状态徽标四值映射与「重试投递」可用性判定在 api.ts（纯函数，单测直测）；本组件只渲染。
 * resolved 线程显示已解决标记、无重试钮；追加评论经 .reply 自动重开（服务端状态机裁决）。
 * 评论产物伺服成败与本侧栏解耦（D3 已接受代价登记）：iframe 探针失败时侧栏照常挂载，
 * 既有线程的追加/resolve/重试不受影响，仅评论模式开关与定位按钮因未就绪呈禁用态。
 */

import { useEffect, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { COMMENT_TEXT_MAX_LENGTH, type CommentAnchorLevel, type CommentThread } from '../../lib/comments/contract'
import {
  canRetryDelivery,
  createCommentsApi,
  deliveryBadgeKey,
  type CommentsApi,
  type CommentsListOutcome,
} from './api'
import type { PanelTranslate } from '../preview-tab/iframe-view'

/** 写通道消费面（fetch 封装单处装配；无渲染级注入需求——组件测试为纯逻辑单测 + e2e）。 */
const commentsApi: CommentsApi = createCommentsApi()

/** 锚点级别 → 文案 key（穷尽 Record，词表加值即编译错；D1 三级降级序的侧栏呈现名）。 */
const ANCHOR_LEVEL_LABEL_KEYS: Record<CommentAnchorLevel, string> = {
  id: 'comments.anchor.id',
  data: 'comments.anchor.data',
  path: 'comments.anchor.path',
}

/** 侧栏整体（折叠条 / 展开面板的裁决点）。 */
export function CommentsSidebar(props: {
  sessionId: string
  artifactPath: string
  t: PanelTranslate
  /** 拾取脚本就绪态（ready 前评论模式开关与定位按钮禁用——D8(a) 就绪握手终态）。 */
  ready: boolean
  /** 评论模式开关当前态（面板体持有，经桥 pick-mode 出站）。 */
  pickMode: boolean
  /** 锚点失效线程 id 集（anchors-status 回报；命中集中条目呈失效态）。 */
  missedThreadIds: ReadonlySet<string>
  /** 拾取提交成功后的重拉信号（面板体递增；本组件以此为重拉依赖）。 */
  reloadToken: number
  /** 线程列表上报（面板体 anchors 下发集的数据源；卸载/加载失败上报空集）。 */
  onThreads: (threads: readonly CommentThread[]) => void
  /** 评论模式开关切换（面板体经桥出站；仅 ready 态可触发——按钮禁用态是唯一入口）。 */
  onTogglePickMode: () => void
  /** 条目定位（面板体经桥 locate 出站；仅 ready × 未失效 × 带锚点可触发）。 */
  onLocate: (thread: CommentThread) => void
}): ReactNode {
  const { sessionId, artifactPath, t, ready, pickMode, missedThreadIds, reloadToken, onThreads, onTogglePickMode, onLocate } = props
  const [expanded, setExpanded] = useState(false)
  if (!expanded) {
    return (
      <button
        type="button"
        className="odp-comments-tab"
        aria-label={t('comments.open')}
        title={t('comments.title')}
        onClick={() => { setExpanded(true) }}
      >
        <span className="odp-comments-tab-label">{t('comments.title')}</span>
      </button>
    )
  }
  return (
    <CommentsPanel
      sessionId={sessionId}
      artifactPath={artifactPath}
      t={t}
      ready={ready}
      pickMode={pickMode}
      missedThreadIds={missedThreadIds}
      reloadToken={reloadToken}
      onThreads={onThreads}
      onTogglePickMode={onTogglePickMode}
      onLocate={onLocate}
      onCollapse={() => { setExpanded(false) }}
    />
  )
}

/** 侧栏展开面板的加载态（error = GET 失败含数据损坏；ready.threads 已按当前产物过滤）。 */
type CommentsLoadState =
  | { phase: 'loading' }
  | { phase: 'ready'; threads: readonly CommentThread[] }
  | { phase: 'error' }

/** 侧栏展开面板：拉取 → 线程列表（当前产物）→ 头部评论模式开关（首评入口唯一化，D3）。 */
function CommentsPanel(props: {
  sessionId: string
  artifactPath: string
  t: PanelTranslate
  ready: boolean
  pickMode: boolean
  missedThreadIds: ReadonlySet<string>
  reloadToken: number
  onThreads: (threads: readonly CommentThread[]) => void
  onTogglePickMode: () => void
  onLocate: (thread: CommentThread) => void
  onCollapse: () => void
}): ReactNode {
  const {
    sessionId, artifactPath, t, ready, pickMode, missedThreadIds, reloadToken,
    onThreads, onTogglePickMode, onLocate, onCollapse,
  } = props
  const [state, setState] = useState<CommentsLoadState>({ phase: 'loading' })
  const [reloadLocalToken, setReloadLocalToken] = useState(0)

  // 视图重建（SC2）：展开 / 切换产物 / 任意操作成功后经 GET 重拉；abort 撤上一轮。
  // 线程列表同步上报面板体（anchors 数据源）；卸载上报空集——旧产物的锚点集不下发新产物。
  useEffect(() => {
    const controller = new AbortController()
    setState({ phase: 'loading' })
    void commentsApi.list(sessionId, controller.signal).then((outcome: CommentsListOutcome) => {
      if (controller.signal.aborted) return
      const threads = outcome.ok
        ? outcome.threads.filter(thread => thread.artifactPath === artifactPath)
        : []
      onThreads(threads)
      setState(outcome.ok ? { phase: 'ready', threads } : { phase: 'error' })
    })
    return () => {
      controller.abort()
      onThreads([])
    }
  }, [sessionId, artifactPath, reloadToken, reloadLocalToken, onThreads])

  const refresh = (): void => { setReloadLocalToken(token => token + 1) }

  // 列表区：ready 渲染线程列表 / 空态；loading 渲染加载指示；error 不渲染加载行——
  // 错误态行（上方 odp-note）是 error 相的唯一呈现（comment-loop·V9 终态口径，加载行
  // 与错误态行同屏会让用户误判仍在加载）。
  const threadList = state.phase === 'ready'
    ? (
        state.threads.length === 0
          ? <div className="odp-note">{t('comments.empty')}</div>
          : (
              <div className="odp-comments-list" role="list">
                {state.threads.map(thread => (
                  <ThreadItem
                    key={thread.id}
                    thread={thread}
                    sessionId={sessionId}
                    t={t}
                    ready={ready}
                    missed={missedThreadIds.has(thread.id)}
                    onLocate={onLocate}
                    onChanged={refresh}
                  />
                ))}
              </div>
            )
      )
    : state.phase === 'loading'
      ? <div className="odp-note" role="status">{t('comments.loading')}</div>
      : null

  return (
    <div className="odp-comments-panel">
      <div className="odp-comments-head">
        <span className="odp-comments-title">{t('comments.title')}</span>
        {/* 评论模式开关（D3：首评唯一入口的驱动钮；demo 形态 = 侧栏头部工具栏按钮）。
            ready 前禁用（tooltip 说明产物加载中——D8(a) 就绪态管理的用户可见面）。 */}
        <button
          type="button"
          className="odp-button"
          aria-pressed={pickMode}
          disabled={!ready}
          title={!ready ? t('comments.pickNotReady') : t('comments.pickModeTitle')}
          aria-label={t('comments.pickMode')}
          onClick={onTogglePickMode}
        >
          {t('comments.pickMode')}
        </button>
        <button type="button" className="odp-button" aria-label={t('comments.close')} onClick={onCollapse}>
          {t('comments.close')}
        </button>
      </div>
      {state.phase === 'error' && (
        <div className="odp-note" role="status">{t('comments.loadError')}</div>
      )}
      {threadList}
    </div>
  )
}

/** 单条线程：元信息 + 锚点行 + 文本 + 追加列表 + 状态徽标 + 操作（定位/重试/解决）+ 追加输入。 */
function ThreadItem(props: {
  thread: CommentThread
  sessionId: string
  t: PanelTranslate
  ready: boolean
  missed: boolean
  onLocate: (thread: CommentThread) => void
  onChanged: () => void
}): ReactNode {
  const { thread, sessionId, t, ready, missed, onLocate, onChanged } = props
  const [replyDraft, setReplyDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionFailed, setActionFailed] = useState(false)

  /** 任一操作成功后清输入并回调重拉（权威重建）；失败显示行内提示。 */
  const runAction = (action: () => Promise<{ ok: boolean }>): void => {
    if (busy) return
    setBusy(true)
    setActionFailed(false)
    void action().then((outcome) => {
      setBusy(false)
      if (outcome.ok) {
        setReplyDraft('')
        onChanged()
      } else {
        setActionFailed(true)
      }
    })
  }

  const submitReply = (): void => {
    const text = replyDraft.trim()
    if (text === '') return
    runAction(() => commentsApi.reply({ sessionId, threadId: thread.id, text }))
  }

  return (
    <div className={missed ? 'odp-thread odp-thread--missed' : 'odp-thread'} role="listitem">
      <div className="odp-thread-meta">
        {thread.status === 'resolved' && (
          <span className="odp-resolved-mark">{t('comments.resolvedMark')}</span>
        )}
        {/* 锚点失效态（D8(b)）：anchors-status 回报驱动，不依赖用户先点定位。 */}
        {missed && <span className="odp-anchor-missed">{t('comments.anchorMissed')}</span>}
        <span className="odp-badge">{t(deliveryBadgeKey(thread.delivery))}</span>
      </div>
      {thread.anchor !== undefined && (
        // 条目锚点行（D1）：级别名 + 选择器原样（data 级 sel 本身即实际锚属性选择器
        // [data-od-id="<值>"]，实际属性名随 sel 直呈——不另行转写）。
        <div className="odp-thread-anchor">
          <span className="odp-thread-anchor-level">{t(ANCHOR_LEVEL_LABEL_KEYS[thread.anchor.level])}</span>
          <code className="odp-thread-anchor-sel">{thread.anchor.sel}</code>
        </div>
      )}
      <div className="odp-thread-text">{thread.text}</div>
      {thread.replies.length > 0 && (
        <div className="odp-thread-replies">
          {thread.replies.map((reply, index) => (
            <div key={`${thread.id}#${index}`} className="odp-reply">{reply.text}</div>
          ))}
        </div>
      )}
      {actionFailed && <div className="odp-note" role="status">{t('comments.actionError')}</div>}
      <div className="odp-thread-actions">
        {/* 定位回跳（GL3/D8(b)）：仅就绪 × 带锚点可用；失效条目禁用（无可定位对象，
            不发起 locate——D1 已接受代价的恢复路径条款）。 */}
        {thread.anchor !== undefined && (
          <button
            type="button"
            className="odp-button"
            disabled={!ready || missed}
            title={missed ? t('comments.anchorMissed') : undefined}
            onClick={() => { onLocate(thread) }}
          >
            {t('comments.locate')}
          </button>
        )}
        {canRetryDelivery(thread) && (
          <button
            type="button"
            className="odp-button"
            disabled={busy}
            onClick={() => { runAction(() => commentsApi.retry({ sessionId, threadId: thread.id })) }}
          >
            {t('comments.retry')}
          </button>
        )}
        {thread.status === 'open' && (
          <button
            type="button"
            className="odp-button"
            disabled={busy}
            onClick={() => { runAction(() => commentsApi.resolve({ sessionId, threadId: thread.id })) }}
          >
            {t('comments.resolve')}
          </button>
        )}
      </div>
      <div className="odp-reply-composer">
        <input
          type="text"
          className="odp-reply-input"
          value={replyDraft}
          maxLength={COMMENT_TEXT_MAX_LENGTH}
          placeholder={t('comments.replyPlaceholder')}
          aria-label={t('comments.replyPlaceholder')}
          onChange={(event: ChangeEvent<HTMLInputElement>) => { setReplyDraft(event.target.value) }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') { submitReply() }
          }}
        />
        <button
          type="button"
          className="odp-button"
          disabled={busy || replyDraft.trim() === ''}
          onClick={() => { submitReply() }}
        >
          {t('comments.reply')}
        </button>
      </div>
    </div>
  )
}
