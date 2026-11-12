/**
 * 评论回路共享契约（单处归属；本设计包 U1 store / U1 thread / U2 comments-api / U3 feedback /
 * U4 面板经相对路径 import，禁止各自字面量复制——词表漂移即状态机与路由对不上）。
 *
 * 形状来源：opendesign-comment-loop 设计 §3.1（D1 评论数据文件 / D2 写通道路由族 /
 * D3 来源标记 / D5 lifecycle × delivery 双维状态机 / D8 文件级定位）+ 元素锚点段形状来源
 * opendesign-comment-anchor 设计 §3.3 D1（CommentAnchor 值对象 / 三级降级序词表）。
 * 本文件只承载类型与常量词表，不含运行时逻辑：状态机转移表在 lib/comments/thread.ts（U1），
 * 文件读写在 lib/comments/store.ts（U1），路由注册在 lib/serve/comments-api.ts（U2）。
 * 编号口径：裸编号分域归属——既有段落（线程 schema / 路由族 / 来源标记）的 D/AX/GL 属
 * opendesign-comment-loop 包，元素锚点段的 D1 属 opendesign-comment-anchor 包（以段落归属
 * 区分两包同形编号）；引用其他设计包（V1 代 / 二轮 opendesign-assets-quality）的同形编号
 * 须带域前缀。
 */

// ── 评论数据文件（D1：会话工作目录下的唯一权威，AX1）────────────────────────

/** 评论数据目录名（会话工作目录下；质量环监听排除词表 U5 与产物伺服透传读取同用此名）。 */
export const COMMENTS_DIR_NAME = '.od-comments'

/** 评论数据文件名（COMMENTS_DIR_NAME 下单文件权威；D1——不按产物拆旁文件）。 */
export const COMMENTS_FILE_NAME = 'comments.json'

/** 评论数据文件 schema 版本（parse 侧以它判定形态兼容）。 */
export const COMMENTS_FILE_VERSION = 1

/** 评论线程 id 前缀（c_ 前缀随机标识，D1；生成逻辑在 store，前缀契约登记于此）。 */
export const COMMENT_THREAD_ID_PREFIX = 'c_'

/** 评论文本上限字符数（D2 载荷校验：空文本与超限拒绝；首条 text 与追加 replies 同受此限）。 */
export const COMMENT_TEXT_MAX_LENGTH = 10000

// ── 线程 schema（D1 字段集；状态机维度见 D5 / AX3）─────────────────────────

/** 评论线程生命周期状态（AX3 的 lifecycle 维度；schema 字段名沿用 status）。 */
export type CommentThreadStatus = 'open' | 'resolved'

/** lifecycle 词表（恰两值；词表数组供边界测试与遍历消费，类型以它成员收窄）。 */
export const COMMENT_THREAD_STATUSES: readonly CommentThreadStatus[] = ['open', 'resolved']

/** 评论投递状态（AX3 的 delivery 维度；四值与 lifecycle 正交）。 */
export type CommentDelivery = 'pending' | 'delivered' | 'no-agent' | 'inject-error'

/**
 * delivery 词表（恰四值）：pending = 落盘后投递前瞬态；delivered = 已提交投递（提交后宿主
 * 取消在途 steer 属宿主语义，不回改本状态，D4）；no-agent = 查无活 Agent 落盘不投递；
 * inject-error = 投递调用报错。
 */
export const COMMENT_DELIVERY_STATES: readonly CommentDelivery[] = ['pending', 'delivered', 'no-agent', 'inject-error']

// ── 元素锚点（opendesign-comment-anchor 设计 D1：评论线程挂靠产物的元素级指称）──

/** 锚点级别（三级降级序的落级；生成逻辑在拾取脚本 U3，词表唯一登记于此，下游禁字面量复制）。 */
export type CommentAnchorLevel = 'id' | 'data' | 'path'

/**
 * 锚点级别词表（恰三值；三级降级序 id → data → path，D1）：
 * id = 元素有 id（sel = '#<id>'）；
 * data = 自身或最近祖先带既有产物锚属性 data-od-id / data-screen-label（sel 为对应属性
 * 选择器——对齐既有产物锚属性而非新造属性名，D1 不采用栏）；
 * path = 否则（sel 为从产物根可达元素的 tag:nth-of-type(i) 链）。
 */
export const ANCHOR_LEVELS: readonly CommentAnchorLevel[] = ['id', 'data', 'path']

/** 锚点选择器上限字符数（写入侧校验边界；收敛载荷面、防写通道被塞大载荷，D1 效果栏红线）。 */
export const ANCHOR_SEL_MAX_LENGTH = 500

/** 元素锚点值对象（同一指称的两个属性一体承载——不拍平成顶层 anchorSel/anchorLevel 两字段，D1）。 */
export interface CommentAnchor {
  /** 锚点级别（词表见 ANCHOR_LEVELS）。 */
  level: CommentAnchorLevel
  /** 元素定位选择器（1..ANCHOR_SEL_MAX_LENGTH 字符；CSS 选择器形态随级别，D1）。 */
  sel: string
}

/**
 * 锚点载荷形状校验（写入侧，D1）：对象、level ∈ 词表、sel 非空且 ≤ ANCHOR_SEL_MAX_LENGTH。
 * 只校验载荷形状：data 级属性值的选择器安全检查（含引号/反斜杠的值落 path 级）属生成侧，
 * 在拾取脚本（U3）；读侧宽容由 store 可选字段 parse 承载（旧文件无 anchor 合法，
 * COMMENTS_FILE_VERSION 恒 1）。
 */
export function isCommentAnchor(value: unknown): value is CommentAnchor {
  if (typeof value !== 'object' || value === null) return false
  const a = value as Record<string, unknown>
  if (typeof a.level !== 'string' || !ANCHOR_LEVELS.includes(a.level as CommentAnchorLevel)) return false
  if (typeof a.sel !== 'string' || a.sel.length === 0 || a.sel.length > ANCHOR_SEL_MAX_LENGTH) return false
  return true
}

/** 追加评论（replies 数组元素；追加经 .reply 路由，D2）。 */
export interface CommentThreadReply {
  /** 追加评论文本（1..COMMENT_TEXT_MAX_LENGTH 字符，与首条同限）。 */
  text: string
  /** 追加时刻（ISO 8601 字符串，与全文件时间戳口径一致）。 */
  at: string
}

/** 评论线程（一条用户评论及其状态与后续消息的记录体；字段集 = 设计 §3.1 数据域）。 */
export interface CommentThread {
  /** 线程 id（COMMENT_THREAD_ID_PREFIX 前缀随机标识）。 */
  id: string
  /** 评论挂靠的产物路径（会话相对路径；文件级定位粒度 D8，随当前预览产物自动携带）。 */
  artifactPath: string
  /** 首条评论文本（1..COMMENT_TEXT_MAX_LENGTH 字符）。 */
  text: string
  /** 元素锚点（首评拾取定案；一经写入不可变——追加 replies 不改写，D1；旧文件无此字段合法）。 */
  anchor?: CommentAnchor
  /** 追加评论（resolved 线程追加自动回 open 并把 delivery 重置为 pending，D5 转移④）。 */
  replies: CommentThreadReply[]
  /** 生命周期状态（open|resolved；状态转移裁决在 lib/comments/thread.ts，表外抛错）。 */
  status: CommentThreadStatus
  /** 创建时刻（ISO 8601 字符串）。 */
  createdAt: string
  /** 最近更新时刻（ISO 8601 字符串）。 */
  updatedAt: string
  /** 投递状态（词表见 COMMENT_DELIVERY_STATES）。 */
  delivery: CommentDelivery
  /** 最近一次成功提交投递的时刻（ISO 8601 字符串；delivery 未达 delivered 前无值）。 */
  deliveredAt?: string
}

/** 评论数据文件顶层形态（.od-comments/comments.json 的 JSON schema）。 */
export interface CommentsFile {
  /** schema 版本（恒 COMMENTS_FILE_VERSION）。 */
  version: typeof COMMENTS_FILE_VERSION
  /** 线程全集（无删除/归档路由——历史不删是有意接受，D1）。 */
  threads: CommentThread[]
}

// ── 写通道路由族（D2：connection.fetch 注册 /api 域，共五条 = 四 POST + GET 基路径）──

/**
 * 评论写通道基路径（即 GET 基路径：线程全量列表，面板拉取）。
 * 域归 /api 前缀 = 宿主共享鉴权层覆盖（AS2），插件不在 handler 内自查鉴权（AX5）。
 */
export const COMMENTS_API_BASE_PATH = '/api/opendesign-design-mode.comments'

/** 四个 POST 动作路径后缀（完整路径 = COMMENTS_API_BASE_PATH + 后缀，D2）。 */
export const COMMENTS_API_ACTION_PATHS = ['.create', '.reply', '.retry', '.resolve'] as const

/** POST 动作后缀类型。 */
export type CommentsApiActionPath = (typeof COMMENTS_API_ACTION_PATHS)[number]

/** 路由族全集恰五条（GET 基路径 + 四条 POST 动作完整路径；注册与测试以此数组为准）。 */
export const COMMENTS_API_PATHS: readonly string[] = [
  COMMENTS_API_BASE_PATH,
  ...COMMENTS_API_ACTION_PATHS.map((action) => COMMENTS_API_BASE_PATH + action),
]

// ── 回注消息来源标记（D3 / AX2：独立 kind，永不冒充 kind='user'）────────────

/**
 * 评论回注消息来源 kind（与既有质量环 LINT_SOURCE_KIND = 'opendesign-design-mode/lint'
 * 并列不同值，lib/quality/feedback.ts:119；宿主聊天流对未知 kind 按持久 kind 标签呈现，AS3）。
 */
export const COMMENT_SOURCE_KIND = 'opendesign-design-mode/comment'
