/**
 * client/preview-tab/locales.ts —— 设计面板的内联双语字典（U7）。
 *
 * 形态裁决与本仓根包 client/locale.ts 同源：`{zh, en}` 内联字典经 `ctx.locale.register`
 * 注册（不建 locale/*.json 文件族）；key 集以 zh 为权威源，en 按同一 key 集对齐。
 * 命名空间 = `opendesign.designPanel`（present-card-link.ts 的 DESIGN_PANEL_LOCALE_NS，
 * 单处定义两侧共用），不与任何宿主包撞 key。字典必须先于面板槽位首次渲染注册
 * （槽位声明 `locale:` 后渲染机理由 (命名空间, revision) 合成 t 标准座位），装配序
 * 由 preview-tab/index.tsx 的 apply 保证（locale → tab 类型 → 面板槽位）。
 */

/** 简体中文字典（key 集权威源）。 */
export const zh = {
  /** 页面地址（guide 入口打开）下的面板标题。 */
  'panel.title': '设计预览',
  /** 右侧栏 guide 页的入口胶囊。 */
  'guide.title': '设计预览',
  'guide.desc': '预览本会话产出的设计文件（原型 / 演示稿），或从产物列表打开。',
  /** iframe 视图的加载指示。 */
  'frame.loading': '正在载入产物…',
  /** HEAD 探针 404：产物不存在。 */
  'frame.notFound': '产物文件不存在或已被移动。可让模型重新生成，或从产物列表打开。',
  /** HEAD 探针 403：越出会话工作目录（伺服围栏拒绝）。 */
  'frame.forbidden': '该文件在会话工作目录之外，预览被拒绝。',
  /** 其余状态码与传输失败（{status} = 状态码，未知时为 —）。 */
  'frame.error': '产物载入失败（状态码 {status}）。',
  /** 失败行与列表失败行的重试钮。 */
  'frame.reload': '重新载入',
  /** 列表加载指示。 */
  'list.loading': '正在读取产物列表…',
  /** 列表空态。 */
  'list.empty': '当前目录还没有 HTML 产物。模型产出设计文件后会出现在这里。',
  /** 列表读取失败。 */
  'list.error': '产物列表读取失败。',
  /** 列表被服务端条目上限截断的提示。 */
  'list.truncated': '产物较多，列表已截断。',
  /** 列表 → iframe 视图的返回钮。 */
  'list.back': '返回产物列表',
  /** 评论侧栏（右缘折叠条与展开面板共用标题）。 */
  'comments.title': '评论',
  /** 折叠条的展开钮可访问名。 */
  'comments.open': '展开评论',
  /** 展开面板的收起钮。 */
  'comments.close': '收起',
  /** 侧栏拉取评论列表的加载指示。 */
  'comments.loading': '正在读取评论…',
  /** GET 失败（含评论数据文件损坏）的错误态：指引 /opendesign-doctor 诊断恢复。 */
  'comments.loadError': '评论数据不可读。请运行 /opendesign-doctor 诊断，按其指引修复后重试。',
  /** 当前产物还没有评论线程。 */
  'comments.empty': '这个产物还没有评论。在下方输入即可把反馈发给模型。',
  /** 状态徽标四值（delivery 直接映射；pending 为提交往返期间的本地瞬态）。 */
  'comments.badge.pending': '待送达',
  'comments.badge.delivered': '已发送',
  'comments.badge.noAgent': '未送达-无可用会话',
  'comments.badge.injectError': '发送失败',
  /** 「重试投递」钮（仅 open × no-agent / open × inject-error 显示）。 */
  'comments.retry': '重试投递',
  /** 线程的「标记已解决」钮。 */
  'comments.resolve': '标记已解决',
  /** 已解决线程的标记文本。 */
  'comments.resolvedMark': '已解决',
  /** 新评论输入区（placeholder 兼作可访问名）。 */
  'comments.inputPlaceholder': '输入对当前产物的评论…',
  /** 发送钮；请求往返期间显示发送中并禁用。 */
  'comments.send': '发送',
  'comments.sending': '发送中…',
  /** POST 失败（网络/校验拒绝）的行内提示。 */
  'comments.sendError': '发送失败，请重试。',
  /** 线程内追加输入与追加钮（resolved 线程追加自动重开）。 */
  'comments.replyPlaceholder': '追加评论…',
  'comments.reply': '追加',
  /** 线程操作（追加/重试/解决）失败的行内提示。 */
  'comments.actionError': '操作失败，请重试。',
  /** 产物列表行的评论计数徽标可访问名（{count} = 线程数）。 */
  'comments.rowCount': '{count} 条评论',
} as const

/** 英文字典（与 zh 同 key 集）。 */
export const en: Record<keyof typeof zh, string> = {
  'panel.title': 'Design preview',
  'guide.title': 'Design preview',
  'guide.desc': 'Preview design artifacts produced in this session (prototypes / decks), or open one from the artifact list.',
  'frame.loading': 'Loading artifact…',
  'frame.notFound': 'The artifact file does not exist or has moved. Ask the model to regenerate it, or open it from the artifact list.',
  'frame.forbidden': 'That file is outside the session working directory; preview is refused.',
  'frame.error': 'Failed to load the artifact (status {status}).',
  'frame.reload': 'Reload',
  'list.loading': 'Reading the artifact list…',
  'list.empty': 'No HTML artifacts in the current directory yet. Files the model produces will appear here.',
  'list.error': 'Failed to read the artifact list.',
  'list.truncated': 'Many artifacts; the list was truncated.',
  'list.back': 'Back to artifact list',
  'comments.title': 'Comments',
  'comments.open': 'Show comments',
  'comments.close': 'Collapse',
  'comments.loading': 'Reading comments…',
  'comments.loadError': 'Comment data is unreadable. Run /opendesign-doctor to diagnose, then follow its guidance.',
  'comments.empty': 'No comments on this artifact yet. Type below to send feedback to the model.',
  'comments.badge.pending': 'Pending',
  'comments.badge.delivered': 'Sent',
  'comments.badge.noAgent': 'Not delivered - no active agent',
  'comments.badge.injectError': 'Delivery failed',
  'comments.retry': 'Retry delivery',
  'comments.resolve': 'Mark resolved',
  'comments.resolvedMark': 'Resolved',
  'comments.inputPlaceholder': 'Comment on this artifact…',
  'comments.send': 'Send',
  'comments.sending': 'Sending…',
  'comments.sendError': 'Failed to send; please try again.',
  'comments.replyPlaceholder': 'Add a comment…',
  'comments.reply': 'Add',
  'comments.actionError': 'Action failed; please try again.',
  'comments.rowCount': '{count} comments',
}
