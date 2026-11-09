/**
 * opendesign-design-mode 的共享契约类型（单处归属；U2a/U2b/U3/U5/U6/U7 经相对路径 import）。
 *
 * 形状来源：设计文档 §3.1 各层描述（资产层 / 会话组装层 / 预览层 / 诊断）与验收场景
 * V4（清单三层版本）/ D6（改写命中清单）/ D8（材质化写入清单）/ D9（doctor 八项）。
 * 本文件只承载类型与常量词表，不含运行时逻辑；U1 阶段先立契约，实现单元按此填实。
 */

// ── 资产层（U2a 定位器 / U2b doctor 消费）────────────────────────────────────

/** OD 安装渠道（macOS /Applications 下四种渠道命名 + 环境变量覆盖）。 */
export type OdChannel = 'override' | 'stable' | 'beta' | 'prerelease' | 'preview'

/** 渠道优先级序（选定规则第二优先级：正式 > Beta > Prerelease > Preview；override 恒最先）。 */
export const OD_CHANNEL_PRIORITY: readonly OdChannel[] = ['override', 'stable', 'beta', 'prerelease', 'preview']

/** 资产定位候选：一个候选资源根及其来源渠道。 */
export interface OdAssetCandidate {
  /** 候选资源根绝对路径（app 的 Contents/Resources）。 */
  resourceRoot: string
  /** 该候选的来源渠道。 */
  channel: OdChannel
}

/** open-design.json 清单的三层版本（验收场景 V4：manifest 版本 / specVersion / 资产版本）。 */
export interface ManifestVersions {
  /** 清单自身的 version 字段。 */
  manifestVersion?: string
  /** 清单的 specVersion 字段（OD Next 规范版本）。 */
  specVersion?: string
  /** 清单 od 节的资产版本。 */
  assetVersion?: string
}

/** 版本画像：定位结果 + 版本三层 + 候选列表（设计 §3.1 资产层）。 */
export interface VersionProfile {
  /** 选定的资源根绝对路径。 */
  resourceRoot: string
  /** open-design.json 清单文件绝对路径。 */
  manifestPath: string
  /**
   * 清单所在场景包目录（manifestPath 的父目录；清单内 "./assets/..." 相对路径的解析根）。
   * 默认读取器与组装器（U3 任务档绝对路径）都以它为锚——不加此字段则每个消费方都得从
   * manifestPath 自行推导同一件事。
   */
  scenarioRoot: string
  /** 清单三层版本。 */
  versions: ManifestVersions
  /** 全部候选根与渠道（doctor 报告多候选并存时的选中依据）。 */
  candidates: OdAssetCandidate[]
  /** 选定依据的人类可读描述（环境变量覆盖 / 渠道优先级 / 路径序）。 */
  selectedBy: string
  /** 版本是否已核实（未核实时 doctor 出警告，设计 UD2）。 */
  verified: boolean
}

// ── 启动探测（U1 persona 激活时点；U2a 填实定位逻辑）──────────────────────────

/**
 * persona 激活时点的启动探测结果（SI3 两形态区分的载体）：
 *   - missing：探测完成、零候选（未装 OD）→ 文案「未检测到 OpenDesign，请安装后重启 DSH」；
 *   - error：探测本身失败（IO 异常 / 慢挂载 / 权限）→ 文案「OpenDesign 资产检测失败，请重启 DSH 重试」。
 * 两形态不得合并：把 error 报成 missing 会把「已装但探测瞬时失败」误导成未装（SI3 假阳性方向）。
 */
export type OdProbeOutcome =
  | { status: 'found'; resourceRoot: string }
  | { status: 'missing' }
  | { status: 'error'; reason: string }

/** 探测失败（missing / error）时随 diagnostic 激活失败抛出的错误——message 即 roster broken 诊断文案。 */
export class OdProbeError extends Error {}

/** 未安装形态的诊断文案（验收条款② / 场景 V5 与「重启重试」文案可区分）。 */
export const OD_MISSING_MESSAGE = '未检测到 OpenDesign，请安装后重启 DSH。'

/** 探测失败形态的诊断文案（SI3 假阳性收窄：瞬时失败给重试指引而非误判未装）。 */
export const OD_PROBE_FAILED_MESSAGE = 'OpenDesign 资产检测失败，请重启 DSH 重试。'

// ── 会话组装层（U3 组装器 / U4 改写器 / U2b doctor 消费）───────────────────────

/** 路由指令段注册的任务档类别（八类 HTML 文件产物型，设计 D6；排除五档不在此列）。 */
export const ROUTED_TASK_PROFILES = [
  'prototype',
  'ppt',
  'document',
  'marketing',
  'motion-design',
  'hyperframes',
  'web-clone',
  'webgl',
] as const

export type RoutedTaskProfile = (typeof ROUTED_TASK_PROFILES)[number]

/**
 * 改写器的一条命中记录（doctor 改写命中清单的逐条形态，设计 D9）。
 * 命中记录契约唯一权威 = lib/rewrite/apply.ts；此处 re-export 保持 import 路径兼容。
 */
export type { RewriteApplyRecord } from './rewrite/apply.js'

// ── 材质化（U5 消费；doctor 材质化状态报告落点清单，D8）───────────────────────

/** 材质化写入的一个文件。 */
export interface MaterializedFile {
  /** 管理名（.od-frames/ 内的文件名，如 android.html）。 */
  name: string
  /**
   * 源资产绝对路径（manifest 清单资源复制件）。派生登记件（deck-framework.md，D9——
   * 内容生成自 lib/protocols/deck.ts，非 OD 静态资产复制）无源资产路径，缺省。
   */
  sourcePath?: string
  /** 写入字节数。 */
  bytes: number
}

/** 材质化写入清单（会话创建时无条件全量重铺的落点记录，设计 D8/D9）。 */
export interface MaterializeManifest {
  /** 写入落点根（会话工作目录的 .od-frames/ 子目录）。 */
  targetRoot: string
  /** 写入文件清单（恰 5 文件 = materialize/copy.ts 的 MATERIALIZED_WRITE_LIST）。 */
  files: MaterializedFile[]
}
