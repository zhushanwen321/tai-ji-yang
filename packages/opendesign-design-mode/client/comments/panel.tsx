/**
 * client/comments/panel.tsx —— 评论侧栏（面板壳层组件，非 iframe 内；opendesign-comment-loop
 * §3.1 面板 UI 段 / D8 文件级挂靠）。
 *
 * 形态：iframe 预览模式下常驻右缘折叠条（竖排「评论」条钮）；展开显示当前产物的评论
 * 线程列表 + 新评论输入框 + 线程内追加输入。挂载裁决在 preview-tab/index.tsx（设计会话
 * 探测 true 且有当前产物才挂——非设计会话不出现，与面板现状同源的 .od-frames 探测）。
 *
 * 数据纪律（AX1/SC2）：权威是会话工作目录的评论数据文件；本组件是无内存态的派生视图——
 * 展开与每次操作成功后都经 GET 基路径重拉重建，不缓存、不反向写。GET 失败（含评论数据
 * 文件损坏）统一显示错误态（文案指引 /opendesign-doctor），不返回空列表伪装正常（comment-loop·V9）。
 *
 * 状态徽标四值映射与「重试投递」可用性判定在 api.ts（纯函数，单测直测）；本组件只渲染。
 * resolved 线程显示已解决标记、无重试钮；追加评论经 .reply 自动重开（服务端状态机裁决）。
 */

import { useEffect, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { COMMENT_TEXT_MAX_LENGTH, type CommentThread } from '../../lib/comments/contract'
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

/** 侧栏整体（折叠条 / 展开面板的裁决点）。 */
export function CommentsSidebar(props: {
  sessionId: string
  artifactPath: string
  t: PanelTranslate
}): ReactNode {
  const { sessionId, artifactPath, t } = props
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
      onCollapse={() => { setExpanded(false) }}
    />
  )
}

/** 侧栏展开面板的加载态（error = GET 失败含数据损坏；ready.threads 已按当前产物过滤）。 */
type CommentsLoadState =
  | { phase: 'loading' }
  | { phase: 'ready'; threads: readonly CommentThread[] }
  | { phase: 'error' }

/** 侧栏展开面板：拉取 → 线程列表（当前产物）→ 底部新评论输入。 */
function CommentsPanel(props: {
  sessionId: string
  artifactPath: string
  t: PanelTranslate
  onCollapse: () => void
}): ReactNode {
  const { sessionId, artifactPath, t, onCollapse } = props
  const [state, setState] = useState<CommentsLoadState>({ phase: 'loading' })
  const [reloadToken, setReloadToken] = useState(0)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendFailed, setSendFailed] = useState(false)

  // 视图重建（SC2）：展开 / 切换产物 / 任意操作成功后经 GET 重拉；abort 撤上一轮。
  useEffect(() => {
    const controller = new AbortController()
    setState({ phase: 'loading' })
    void commentsApi.list(sessionId, controller.signal).then((outcome: CommentsListOutcome) => {
      if (controller.signal.aborted) return
      setState(outcome.ok
        ? { phase: 'ready', threads: outcome.threads.filter(thread => thread.artifactPath === artifactPath) }
        : { phase: 'error' })
    })
    return () => controller.abort()
  }, [sessionId, artifactPath, reloadToken])

  const refresh = (): void => { setReloadToken(token => token + 1) }

  const submitDraft = (): void => {
    const text = draft.trim()
    if (text === '' || sending) return
    setSending(true)
    setSendFailed(false)
    void commentsApi.create({ sessionId, artifactPath, text }).then((outcome) => {
      setSending(false)
      if (outcome.ok) {
        setDraft('')
        refresh()
      } else {
        setSendFailed(true)
      }
    })
  }

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
                  <ThreadItem key={thread.id} thread={thread} sessionId={sessionId} t={t} onChanged={refresh} />
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
        <button type="button" className="odp-button" aria-label={t('comments.close')} onClick={onCollapse}>
          {t('comments.close')}
        </button>
      </div>
      {state.phase === 'error' && (
        <div className="odp-note" role="status">{t('comments.loadError')}</div>
      )}
      {threadList}
      <div className="odp-comments-composer">
        <textarea
          className="odp-comment-input"
          value={draft}
          maxLength={COMMENT_TEXT_MAX_LENGTH}
          placeholder={t('comments.inputPlaceholder')}
          aria-label={t('comments.inputPlaceholder')}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => { setDraft(event.target.value) }}
        />
        {sendFailed && <div className="odp-note" role="status">{t('comments.sendError')}</div>}
        <button
          type="button"
          className="odp-button"
          disabled={sending || draft.trim() === ''}
          onClick={() => { submitDraft() }}
        >
          {sending ? t('comments.sending') : t('comments.send')}
        </button>
      </div>
    </div>
  )
}

/** 单条线程：文本 + 追加列表 + 状态徽标 + 操作（重试/已解决标记）+ 追加输入。 */
function ThreadItem(props: {
  thread: CommentThread
  sessionId: string
  t: PanelTranslate
  onChanged: () => void
}): ReactNode {
  const { thread, sessionId, t, onChanged } = props
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
    <div className="odp-thread" role="listitem">
      <div className="odp-thread-meta">
        {thread.status === 'resolved' && (
          <span className="odp-resolved-mark">{t('comments.resolvedMark')}</span>
        )}
        <span className="odp-badge">{t(deliveryBadgeKey(thread.delivery))}</span>
      </div>
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
