/**
 * /opendesign-doctor —— 设计模式诊断命令（U2b 八项 + opendesign-assets-quality U6 扩展
 * 三项 = 十一项报告；语义权威 = 设计 D9 八项报告 + D10⑨⑩⑪ 扩展）。
 *
 * 十一项报告：① 安装形态与资源根（多候选并存列全部候选与选中依据）② 清单路径与三层版本
 * ③ roster 完整性核验（逐文件存在性）④ 改写规则命中清单（消费 U4 applyRewrites 记录，含
 * 规则脆弱度标记）⑤ 材质化状态（作用域 = 当前会话工作目录，写入落点清单 = 5 文件完整写
 * 清单；预铺后为空即异常并归入错误项）⑥ 资产代际提示（resume 旧会话时历史轮次可能与当前
 * 资产不同代）⑦ 逐项异常的恢复动作（重装 OD / 升级本插件 / 重启 DSH）⑧ stop-loss 止损位
 * 状态（对照 D9 三判据，触发即输出「建议方案级重审」警示）——以上 V1 八节零回归；
 * ⑨ 资产丰富度（D10⑨：craft 册数 = 规则书口径排除两个元文件、形状包数与解析异常数、
 * 设计系统 manifest 命中数、各清单段注入行数；降级形态带恢复动作：目录缺失 → 检查资产
 * 根与 OD 安装完整性指引、解析异常 → 包清单与升级对账指引）；⑩ 协议与检查器对账（D7/
 * D10⑩/AX3 对账义务：panel/deck 两协议与反 AI 味检查项清单的版本锚登记、源码仓 clone
 * 探测（git -C <用户登记路径> rev-parse --show-toplevel，路径经命令参数登记不写死）、
 * 逐协议比对 ok/drift/无法比对三态 + 各自恢复动作、clone HEAD 滞后已知信息行）；
 * ⑪ 质量发现（D10⑪/SC5：读会话目录 .od-quality/report.jsonl 呈现 P0/P1/P2 发现（含回注
 * 裁决）、监听器生命周期状态与产物写盘身份记录（D5④ 快照豁免回查数据源）；无记录时报
 * 「本轮会话无检查记录」+ 监听器未启动原因）。
 *
 * 输出形态：纯文本结构化报告（分节标题 + 行式条目），供会话内直接阅读与 e2e DOM 断言
 * （U8 A4 场景断言分节标题字面——分节名经 {@link DOCTOR_SECTIONS} 常量导出供测试对账）。
 *
 * 改写命中清单的产生方式：命令执行时对当前资产的 core / orchestration 文本**现场重放**
 * applyRewrites（与组装层同一规则集、同一编排）。D9 的止损位判据来源 = 该命中清单——
 * 报告的是「当前资产 × 当前规则集」的适配态，会话组装时点与诊断时点之间的资产升级由
 * 第⑥项代际提示覆盖。命令名依据：DSH commands registry 的名字校验为 `/^[a-z][a-z0-9_-]*$/u`
 * （0.1.7-rc.2 与 0.2.2-rc.1 双版本亲读核实，带冒号的名字注册即抛 TypeError），故命令
 * 实名 = `opendesign-doctor`（无冒号）；设计文档 D9 已按此约束登记命令名。
 *
 * 宿主契约：CommandDefinition 形态（DSH packages/interaction/commands 先例
 * @deepseek-ai/dsh-command-goal）：inject ['commands'] + ctx.commands.register；
 * handler 返回 { kind: 'success', text }，text 由派发 UI 直接渲染。
 * 会话工作目录探测（第⑤⑪项作用域）：workingDirectory 服务是 0.2.x 引入（0.1.7 base patch
 * 无此行，亲读核实），故不作 inject 依赖（0.1.7 上会让本行永久 pending），改 handler 内
 * 运行时可选探测：服务在 → workingDirectory.get(session)；否则回退 session.header.cwd
 * （两版本 session header 均带 cwd 字段）；都不可得 → null（报告「目录未知」，非错误）。
 * 源码仓 clone 路径登记通道（第⑩项）：CommandInvocation.rawInput（宿主命令行上命令名
 * 之后的原文，/opendesign-doctor <clone 路径> 形态；宿主 commands/src/index.ts 契约实读）。
 * 持久 config 通道（preset plugins 行 config）归 cordis.patch.yml（U3a 领地），本命令按
 * 设计 D7 检查点备案的缺省形态交付：未登记 = 「无法比对」态 + 登记路径的恢复动作指引。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { applyRewrites, type RewriteApplyRecord } from '../rewrite/apply.js'
import { ruleAppliesToGeneration } from '../rewrite/rules.js'
import { listDeclaredRosterPaths, type OdManifestShape } from '../locate/manifest-discovery.js'
import { locateOdAssets, readRosterAsset, deriveCatalogDirs, type VersionProfileResult } from '../locate/version-profile.js'
import { buildAssetCatalog } from '../locate/asset-catalog.js'
import { MATERIALIZED_WRITE_LIST, OD_FRAMES_DIR } from '../materialize/copy.js'
import {
  PROTOCOL_VERSION_ANCHORS,
  PROTOCOL_SOURCE_REPO_URL,
} from '../protocols/anchors.js'
import { LINT_SOURCE_ANCHOR } from '../quality/lint.js'
import {
  qualityReportPath,
  type FindingRecordReason,
  type QualityReportLine,
} from '../quality/feedback.js'
import type { VersionProfile } from '../types.js'

/** Cordis 插件名（preset plugins 行 od-doctor 的行内标识，与 cordis.patch.yml 对账）。 */
export const name = 'od-doctor'

/** 本行消费的宿主服务：命令注册面（@deepseek-ai/dsh-commands）。 */
export const inject = ['commands']

/** slash 命令名（registry 名字校验见文件头；用户输入形态 = `/opendesign-doctor`）。 */
export const DOCTOR_COMMAND_NAME = 'opendesign-doctor'

/** registry 内的插件自有稳定 id（CommandDefinition.definitionId）。 */
export const DOCTOR_DEFINITION_ID = 'opendesign-design-mode/commands/doctor'

/** 报告首行标题（U8 A4 DOM 断言对账点之一）。 */
export const DOCTOR_REPORT_TITLE = 'OpenDesign 设计模式诊断报告'

/**
 * 十一个分节的标题字面（U8 A4 + U6 扩展：分节名常量导出供测试对账；行内形态 =
 * `【N/11】<标题>`）。顺序即报告节序，键名 = 节语义（对账时按键取字面）。
 * 前 8 键为 V1 既有节（零回归面），后 3 键为 opendesign-assets-quality U6 新增
 * （D10：⑨ 资产丰富度 / ⑩ 协议与检查器对账 / ⑪ 质量发现）。
 */
export const DOCTOR_SECTIONS = {
  install: '安装形态与资源根',
  manifest: '清单路径与三层版本',
  roster: 'roster 完整性核验',
  rewrite: '改写规则命中清单',
  materialize: '材质化状态',
  generation: '资产代际提示',
  recovery: '异常与恢复动作',
  stopLoss: '止损位状态',
  assetRichness: '资产丰富度',
  protocolAudit: '协议与检查器对账',
  qualityFindings: '质量发现',
} as const

/** 分节总数（标题行分母与结构断言共用，防字面量漂移）。 */
export const DOCTOR_SECTION_COUNT = Object.keys(DOCTOR_SECTIONS).length

/** 分节标题的渲染行（`【N/11】标题`）；测试与 e2e 按此形态断言。 */
export function doctorSectionLine(index: number, title: string): string {
  return `【${index}/${DOCTOR_SECTION_COUNT}】${title}`
}

/**
 * 标准恢复动作文案（任务书⑦三类 + U6 新增节各自的降级/漂移恢复动作；文案与 types.ts
 * 两形态诊断文案同族）。新节异常不并入第⑦节汇总（V1 ⑦ 零回归面），恢复动作随各自
 * 节内就地展示（D10「降级形态各带恢复动作」）。
 */
export const DOCTOR_RECOVERY_ACTIONS = {
  reinstallOd: '恢复动作：重装 OpenDesign，然后重启 DSH。',
  upgradePlugin: '恢复动作：升级本插件到适配当前 OpenDesign 资产的版本（改写规则随插件版本更新），然后重启 DSH。',
  restartDsh: '恢复动作：重启 DSH（材质化在新会话创建时无条件全量重铺；.od-frames/ 目录可安全删除后重建）。',
  /** D10⑨ 目录缺失降级：资产根完整性指引。 */
  checkAssetRoot: '恢复动作：检查资产根（资源根见第①节）与 OD 安装完整性——重装 OpenDesign 后重启 DSH。',
  /** D10⑨ 解析异常降级：包清单 + 升级对账指引。 */
  catalogParseError: '恢复动作：核对上述包的清单文件（SKILL.md frontmatter / manifest.json），并做升级对账（OD 升级引入新 frontmatter 或 manifest 形态时升级本插件适配），然后重启 DSH。',
  /** D10⑩ clone 未登记 / 探测失败：登记路径指引（GPK1）。 */
  registerSourceClone: '恢复动作：重新运行 /opendesign-doctor 并附 OpenDesign 源码仓 clone 路径参数（例：/opendesign-doctor <clone 路径>），登记后本节按 git 内容寻址逐协议比对。',
  /** D10⑩ 漂移态：重新提取登记指引。 */
  reExtractAnchor: '恢复动作：升级本插件（新版随插件重新提取登记版本锚），或按登记锚重新提取正源骨架并重登记版本锚，然后重启 DSH。',
} as const

/** 命令执行输入（宿主侧探测产物；纯函数化报告便于单测）。 */
export interface DoctorReportInput {
  /** 资产定位结局（locateOdAssets 产物；missing / error / found 三态）。 */
  profileResult: VersionProfileResult
  /** 当前会话工作目录（探测不可得时 null → 材质化状态报告「目录未知」）。 */
  sessionCwd: string | null
  /**
   * 用户登记的 OpenDesign 源码仓 clone 路径（第⑩节正源可达性探测输入；GPK1——路径是
   * 用户登记项不写死）。缺省 null = 未登记，第⑩节逐协议报「无法比对」+ 登记指引。
   */
  sourceClonePath?: string | null
}

/** 一节异常（就地展示 + 第⑦节汇总）；message 含恢复动作。 */
interface DoctorIssue {
  section: string
  message: string
}

/** 止损位三判据的评估产物（D9 判据①②可由单次诊断观测，③需跨升级历史）。 */
export interface StopLossEvaluation {
  /** 判据①：核心段改写规则失配 ≥3 条。 */
  criterion1Triggered: boolean
  /** 失配记录（semantic-anchor 锚未命中；含规则名/脆弱度供第④⑧节展示）。 */
  misfires: RewriteApplyRecord[]
  /** 判据②：默认读取器无法产出可注入文本（core/orchestration 读取失败）。 */
  criterion2Triggered: boolean
  /** 判据③固定不可由单次命令观测（无跨升级历史数据源），恒 false。 */
  criterion3Triggered: false
  /** 任一判据触发 = 建议方案级重审。 */
  triggered: boolean
}

/**
 * 止损位评估（D9 三判据；数据源 = 改写命中清单与读取可用性）。
 *
 * 失配判定 = locator 为 semantic-anchor 且 hitCount 为 0 且规则在资产代际上适用的记录
 * （锚应当命中却未命中）。两类「正常零命中」不计入失配：R1（locator=regex，防御性规则，
 * 注入文本基线零命中）、残余兜底两条 regex（正常形态零命中；命中 >0 是段锚漂移的旁证，
 * 在第④节以提示行展示），以及代际外规则的零命中（legacy-only 规则在 2.x 资产上、
 * current-only 规则在 0.25.x 资产上均为预期形态，规则自带 generation 字段裁决；
 * 代际探测为 unknown 时全部按适用处理——保守方向：宁可多报失配，不漏报漂移）。
 */
export function evaluateStopLoss(records: readonly RewriteApplyRecord[], readerUnavailable: boolean): StopLossEvaluation {
  const misfires = records.filter(
    (record) =>
      record.locator === 'semantic-anchor'
      && record.hitCount === 0
      && ruleAppliesToGeneration(record.generation, record.assetGeneration),
  )
  const criterion1Triggered = misfires.length >= 3
  return {
    criterion1Triggered,
    misfires,
    criterion2Triggered: readerUnavailable,
    criterion3Triggered: false,
    triggered: criterion1Triggered || readerUnavailable,
  }
}

/**
 * 一条 apply 记录在第④节的展示行（规则名 / 命中资产 / 替换结果摘要 / 脆弱度）；导出供测试对账。
 * 零命中按代际适用性分标记：代际适用的语义段规则零命中 = [✗ 失配]（漂移信号）；
 * 代际外规则零命中 = [— 仅旧代生效 / 仅新代生效]（预期形态，非漂移）。
 */
export function rewriteRecordLine(record: RewriteApplyRecord): string {
  const applicable = ruleAppliesToGeneration(record.generation, record.assetGeneration)
  const marker = record.hitCount > 0
    ? '[✓]'
    : record.locator === 'regex'
      ? '[—]'
      : applicable
        ? '[✗ 失配]'
        : record.generation === 'legacy-only'
          ? '[— 仅旧代生效]'
          : '[— 仅新代生效]'
  const fragility = `脆弱度 ${record.fragility}`
  return `- ${marker} ${record.ruleName}（${record.ruleId}）→ ${record.asset} → ${record.summary}（${fragility}）`
}

/** 读取清单 JSON（roster 核验与 core/orchestration 路径解析共用）；失败返回 null。 */
function readManifest(profile: VersionProfile): OdManifestShape | null {
  try {
    return JSON.parse(readFileSync(profile.manifestPath, 'utf8')) as unknown as OdManifestShape
  } catch {
    return null
  }
}

/** 第③节：roster 逐文件存在性核验（不信任发现时点状态，现查磁盘）。 */
function renderRosterSection(profile: VersionProfile, issues: DoctorIssue[]): string {
  const manifest = readManifest(profile)
  if (manifest === null) {
    const message = `清单文件无法读取或解析（${profile.manifestPath}）。${DOCTOR_RECOVERY_ACTIONS.reinstallOd}`
    issues.push({ section: DOCTOR_SECTIONS.roster, message })
    return [`- ✗ ${message}`]
  }
  const declared = listDeclaredRosterPaths(manifest)
  const lines: string[] = [`- 声明文件共 ${declared.length} 项：`]
  const missing: string[] = []
  for (const relative of declared) {
    const absolute = join(profile.scenarioRoot, relative.replace(/^\.\//, ''))
    let exists = false
    try {
      exists = statSync(absolute).isFile()
    } catch {
      exists = false
    }
    if (exists) {
      lines.push(`  - ✓ ${relative}`)
    } else {
      missing.push(relative)
      lines.push(`  - ✗ ${relative}（缺失）`)
    }
  }
  if (missing.length > 0) {
    const message = `roster 核验失败：${missing.length} 个声明文件缺失（${missing.join('、')}）。${DOCTOR_RECOVERY_ACTIONS.reinstallOd}`
    issues.push({ section: DOCTOR_SECTIONS.roster, message })
    lines.push(`- ✗ ${message}`)
  } else {
    lines.push('- 结论：全部声明文件在场。')
  }
  return lines
}

/**
 * 第⑤节：材质化状态（作用域 = 会话工作目录；D8 ④ 覆盖语义的感知通道）。
 * 逐文件检查 = MATERIALIZED_WRITE_LIST 完整写清单（5 文件 = 复制件 4 + deck-framework.md
 * 派生登记件，D9；U3a 移交项——写清单 4→5 后本节按完整写清单对账）。
 */
function renderMaterializeSection(sessionCwd: string | null, issues: DoctorIssue[]): string[] {
  if (sessionCwd === null) {
    return ['- 会话工作目录未知，无法报告材质化状态（不影响本报告其余各项）。']
  }
  const targetRoot = join(sessionCwd, OD_FRAMES_DIR)
  const lines: string[] = [
    `- 会话工作目录：${sessionCwd}`,
    `- 写入落点（D8 约定子目录）：${targetRoot}`,
  ]
  if (!existsSync(targetRoot)) {
    lines.push('- 状态：尚未预铺（落点目录不存在；材质化在会话创建时无条件全量重铺，新会话首轮前执行本命令即此形态）。')
    return lines
  }
  const present: string[] = []
  const missingNames: string[] = []
  for (const fileName of MATERIALIZED_WRITE_LIST) {
    const absolute = join(targetRoot, fileName)
    let bytes = 0
    let exists = false
    try {
      bytes = statSync(absolute).size
      exists = true
    } catch {
      exists = false
    }
    if (exists) {
      present.push(`  - ✓ ${fileName}（${bytes} 字节）`)
    } else {
      missingNames.push(fileName)
    }
  }
  lines.push(...present)
  if (missingNames.length === MATERIALIZED_WRITE_LIST.length) {
    const message = `材质化异常：落点目录存在但 ${MATERIALIZED_WRITE_LIST.length} 个管理名全部缺失（预铺后为空即异常）。${DOCTOR_RECOVERY_ACTIONS.restartDsh}`
    issues.push({ section: DOCTOR_SECTIONS.materialize, message })
    lines.push(`- ✗ ${message}`)
  } else if (missingNames.length > 0) {
    const message = `材质化异常：${missingNames.length} 个管理名缺失（${missingNames.join('、')}；D8/D9 为无条件全量重铺，写清单 ${MATERIALIZED_WRITE_LIST.length} 文件应齐备）。${DOCTOR_RECOVERY_ACTIONS.restartDsh}`
    issues.push({ section: DOCTOR_SECTIONS.materialize, message })
    lines.push(`- ✗ ${message}`)
  } else {
    lines.push(`- 结论：${MATERIALIZED_WRITE_LIST.length} 个管理名全部在场（写入落点清单如上）。`)
  }
  return lines
}

/** 第④节：现场重放改写规则，产出命中清单行与记录（止损位评估共用同一数据）。 */
function renderRewriteSection(
  profile: VersionProfile,
  issues: DoctorIssue[],
): { lines: string[]; records: RewriteApplyRecord[]; readerUnavailable: boolean } {
  const designSystemsRoot = join(profile.resourceRoot, 'design-systems')
  let records: RewriteApplyRecord[]
  try {
    const manifest = readManifest(profile)
    const corePath = manifest?.od?.strategy?.assets?.core?.path
    const orchestrationPath = manifest?.od?.strategy?.assets?.orchestration?.path
    if (typeof corePath !== 'string' || typeof orchestrationPath !== 'string') {
      throw new Error(`清单缺少 core / orchestration 资产声明（${profile.manifestPath}）`)
    }
    records = applyRewrites({
      'core-system-prompt': readRosterAsset(profile, corePath),
      'general-orchestration': readRosterAsset(profile, orchestrationPath),
    }, { designSystemsRoot }).records
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    const message = `默认读取器无法产出可注入文本（${reason}）。${DOCTOR_RECOVERY_ACTIONS.upgradePlugin}`
    issues.push({ section: DOCTOR_SECTIONS.rewrite, message })
    return {
      lines: [`- ✗ ${message}`, '- 改写命中清单不可产出（判据②命中：默认读取器不可用）。'],
      records: [],
      readerUnavailable: true,
    }
  }
  const hit = records.filter((record) => record.hitCount > 0).length
  // 代际探测产物随记录冗余携带（apply 基于改写前原文探测）；unknown = 代际不可判，零命中全按失配保守处理。
  const assetGeneration = records[0]?.assetGeneration ?? 'unknown'
  const lines: string[] = [
    `- 资产代际探测：${assetGeneration}（legacy = 0.25.x 形态 / current = 真机 2.0.4 形态 / unknown = 按全规则适用保守处理；代际外规则的零命中是预期形态）`,
    `- 规则应用记录共 ${records.length} 条（命中 ${hit} 条 / 零命中 ${records.length - hit} 条；零命中含防御性规则基线形态、残余兜底未触发形态与代际外规则预期形态，见逐条标记）：`,
    ...records.map(rewriteRecordLine),
  ]
  // 旁证提示：残余兜底 regex 命中 >0 说明上游段锚漂移（失配计数已由段锚零命中覆盖，不重复计）。
  const residualHits = records.filter((record) => record.ruleId.endsWith('residual') && record.hitCount > 0)
  if (residualHits.length > 0) {
    lines.push(
      `- ⚠ 残余兜底规则命中 ${residualHits.length} 条（${residualHits.map((record) => record.ruleId).join('、')}）——特征串残余说明上游段锚漂移，见失配标记。`,
    )
  }
  return { lines, records, readerUnavailable: false }
}

/** 第⑧节：止损位状态（D9 三判据逐条 + 触发警示）。 */
function renderStopLossSection(evaluation: StopLossEvaluation): string[] {
  const lines: string[] = [
    `- 判据① 核心段改写规则失配 ≥3 条：${evaluation.criterion1Triggered ? `触发（${evaluation.misfires.length} 条失配）` : `未触发（${evaluation.misfires.length} 条失配）`}`,
    ...evaluation.misfires.map((record) => `  - ✗ ${record.ruleName}（${record.ruleId}，${record.asset}，脆弱度 ${record.fragility}）：锚未命中`),
    `- 判据② 默认读取器无法产出可注入文本：${evaluation.criterion2Triggered ? '触发' : '未触发'}`,
    '- 判据③ 连续两个 OD 版本升级均需重写全部规则：不在单次诊断可观测范围（需跨升级历史记录；升级后若连续两版均见判据①触发，即按本判据处置）。',
  ]
  if (evaluation.triggered) {
    lines.push('- ⚠ 建议方案级重审：止损位判据已触发（V2 真桥接提前或改写策略重构）。')
  } else {
    lines.push('- 结论：可观测判据均未触发。')
  }
  return lines
}

// ── ⑨ 资产丰富度（D10⑨；数据源 = U1 asset-catalog 三目录扫描，与 compose 清单段同源）──

/**
 * 第⑨节：资产丰富度。消费 buildAssetCatalog（与 compose 清单段唯一的探测数据源）报告
 * craft 册数 / 形状包数与解析异常数 / 设计系统 manifest 命中数 / 各清单段注入行数。
 * 降级形态带恢复动作（目录缺失 → 资产根完整性指引；解析异常 → 包清单 + 升级对账指引），
 * 随本节就地展示，不并入第⑦节汇总（V1 ⑦「未发现异常」零回归面不受新节降级影响——
 * 资产目录缺失在未消费三目录的 V1 形态下本就非异常项）。
 */
function renderAssetRichnessSection(profile: VersionProfile | null): string[] {
  if (profile === null) {
    return ['- 资产未定位，无资产丰富度可报告（见第①节）。']
  }
  const catalog = buildAssetCatalog(deriveCatalogDirs(profile.resourceRoot))
  const lines: string[] = []

  if (catalog.craft.present) {
    lines.push(`- craft 手册：${catalog.craft.manualFiles.length} 册（规则书口径，排除 README.md 与 FUTURE_SECTIONS.md 两个元文件）`)
  } else {
    lines.push(`- ✗ craft 手册：craft/ 目录缺失（${catalog.craft.craftRoot}），册数不可清点、craft 指路块整体省略。${DOCTOR_RECOVERY_ACTIONS.checkAssetRoot}`)
  }

  if (catalog.shapeTemplates.present) {
    lines.push(`- 形状包：${catalog.shapeTemplates.entries.length} 个（解析异常 ${catalog.shapeTemplates.parseErrorCount} 个）`)
    appendParseErrorLine(lines, catalog.shapeTemplates.parseErrorCount, degradedNames(catalog.shapeTemplates.entries))
  } else {
    lines.push(`- ✗ 形状包：design-templates/ 目录缺失（${catalog.shapeTemplates.root}），形状包清单段降级为空（0 行）。${DOCTOR_RECOVERY_ACTIONS.checkAssetRoot}`)
  }

  if (catalog.designSystems.present) {
    lines.push(`- 设计系统 manifest 命中：${catalog.designSystems.entries.length} 个（解析异常 ${catalog.designSystems.parseErrorCount} 个）`)
    appendParseErrorLine(lines, catalog.designSystems.parseErrorCount, degradedNames(catalog.designSystems.entries))
  } else {
    lines.push(`- ✗ 设计系统：design-systems/ 目录缺失（${catalog.designSystems.root}），manifest 感知清单段降级为空（0 行）。${DOCTOR_RECOVERY_ACTIONS.checkAssetRoot}`)
  }

  // 各清单段实际注入行数（一行一包口径，D2/D3——与 compose 段的逐包行同源同数）。
  const shapeRows = catalog.shapeTemplates.present ? catalog.shapeTemplates.entries.length : 0
  const systemRows = catalog.designSystems.present ? catalog.designSystems.entries.length : 0
  const craftBlock = catalog.craft.present ? '注入（craft/ 在场）' : '省略（craft/ 缺失时整体省略，D1/AX5）'
  lines.push(`- 清单段注入行数：形状包清单段 ${shapeRows} 行 / 设计系统清单段 ${systemRows} 行（一行一包口径）；craft 指路块：${craftBlock}。`)
  return lines
}

/** 解析异常包的目录名清单（降级仅目录名条目；报告「包清单」供升级对账定位）。 */
function degradedNames(
  entries: readonly { dirName: string; degraded: boolean }[],
): string[] {
  return entries.filter((entry) => entry.degraded).map((entry) => entry.dirName)
}

/** 解析异常 >0 时追加一行包清单 + 升级对账恢复动作（D10⑨「解析异常→包清单与升级对账指引」）。 */
function appendParseErrorLine(lines: string[], count: number, names: readonly string[]): void {
  if (count > 0) {
    lines.push(`- ⚠ 解析异常 ${count} 个包（${names.join('、')}；降级仅目录名）。${DOCTOR_RECOVERY_ACTIONS.catalogParseError}`)
  }
}

// ── ⑩ 协议与检查器对账（D7/D10⑩/AX3 对账义务；GPK1 探测口径）─────────────────

/** 一条对账检查项（协议或检查项清单的登记锚 + 展示标签；登记处见 protocols/anchors.ts 与 lint.ts）。 */
export interface ProtocolAnchorCheck {
  /** 条目标识（panel / deck / lint）。 */
  id: 'panel' | 'deck' | 'lint'
  /** 报告行的展示标签。 */
  label: string
  /** 登记的正源 commit 锚（提取时点）。 */
  registeredCommit: string
  /** 登记的骨架 sha256（检查项清单移植无骨架哈希 → null，比对基准 = commit）。 */
  registeredSha256: string | null
  /** 骨架/清单口径说明（报告行复述）。 */
  basis: string
}

/** 源码仓 clone 探测产物（GPK1：git -C <登记路径> rev-parse --show-toplevel 退出 0 = 可用）。 */
export interface SourceCloneProbe {
  status: 'unregistered' | 'unavailable' | 'available'
  /** 登记的路径原值（未登记 = 空串）。 */
  clonePath: string
  /** available 时：clone HEAD（git rev-parse HEAD，正源版本锚）。 */
  head: string | null
  /** available 时：rev-parse --show-toplevel 的真实仓库根（校验登记路径确为 git 目录）。 */
  toplevel: string | null
  /** 不可用原因（可行动：未登记 / 非 git 目录或 git 命令不可用）。 */
  reason: string | null
}

/**
 * 探测用户登记的源码仓 clone（GPK1 原文口径：`git -C <路径> rev-parse --show-toplevel`
 * 退出 0 视为 clone 可用，再取 `git rev-parse HEAD` 作正源版本锚）。路径是用户登记项，
 * 本函数不写死任何本机路径；git 子进程失败（路径不存在 / 非 git 目录 / git 不可用）
 * 一律归入 unavailable 并带原因，不抛错。
 */
export function probeSourceClone(clonePath: string | null): SourceCloneProbe {
  const trimmed = clonePath === null ? '' : clonePath.trim()
  if (trimmed === '') {
    return { status: 'unregistered', clonePath: '', head: null, toplevel: null, reason: '未登记源码仓 clone 路径' }
  }
  try {
    const toplevel = execFileSync('git', ['-C', trimmed, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    const head = execFileSync('git', ['-C', trimmed, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return { status: 'available', clonePath: trimmed, head, toplevel }
  } catch {
    return {
      status: 'unavailable',
      clonePath: trimmed,
      head: null,
      toplevel: null,
      reason: '路径不是 git 仓库目录，或 git 命令不可用',
    }
  }
}

/** 单条登记锚的比对结局（D10⑩ 三态）。 */
export interface ProtocolAnchorReconciliation {
  check: ProtocolAnchorCheck
  status: 'ok' | 'drift' | 'cannot-compare'
  /** 比对时的 clone HEAD（cannot-compare = null）。 */
  cloneHead: string | null
  /** cannot-compare 原因（其余态 null）。 */
  cannotCompareReason: string | null
}

/**
 * 比对一条登记锚（纯函数：探测产物进，三态出）。
 *
 * 比对口径 = git 内容寻址等价的骨架哈希比对：登记锚记录了「提取时点 commit + 骨架
 * sha256」——clone HEAD 与登记 commit 逐字一致时，正源提取输入逐字一致，同口径提取的
 * 骨架哈希必然等于登记哈希（ok）；HEAD 不一致时正源文本已变化，哈希级确认需按登记锚
 * 重新提取（提取器是提取时点一次性工具不入运行时仓），按保守方向（宁可多报漂移、
 * 不漏报漂移，同第④节代际 unknown 口径）判定 drift。clone 探测未通过 → 无法比对。
 */
export function reconcileProtocolAnchor(check: ProtocolAnchorCheck, probe: SourceCloneProbe): ProtocolAnchorReconciliation {
  if (probe.status !== 'available' || probe.head === null) {
    return {
      check,
      status: 'cannot-compare',
      cloneHead: null,
      cannotCompareReason: probe.reason ?? 'clone 探测未通过',
    }
  }
  return {
    check,
    status: probe.head === check.registeredCommit ? 'ok' : 'drift',
    cloneHead: probe.head,
    cannotCompareReason: null,
  }
}

/** 登记锚清单（版本锚登记处 = protocols/anchors.ts PROTOCOL_VERSION_ANCHORS + lint.ts LINT_SOURCE_ANCHOR）。 */
export function buildProtocolAnchorChecks(): ProtocolAnchorCheck[] {
  const protocolLabels: Record<string, string> = { panel: 'panel 评审团协议', deck: 'deck 演示稿协议' }
  const rows: ProtocolAnchorCheck[] = PROTOCOL_VERSION_ANCHORS.map((anchor) => ({
    id: anchor.protocol,
    label: protocolLabels[anchor.protocol] ?? anchor.protocol,
    registeredCommit: anchor.commit,
    registeredSha256: anchor.skeletonSha256,
    basis: anchor.skeletonBasis,
  }))
  rows.push({
    id: 'lint',
    label: '反 AI 味检查项清单',
    registeredCommit: LINT_SOURCE_ANCHOR.commit,
    registeredSha256: null,
    basis: `${LINT_SOURCE_ANCHOR.upstreamPath}（检查项清单移植，无骨架哈希——比对基准 = commit；${LINT_SOURCE_ANCHOR.license}）`,
  })
  return rows
}

/** 第⑩节渲染（登记锚 + clone 探测 + 逐协议三态 + 恢复动作 + 已知信息行）。 */
function renderProtocolAuditSection(sourceClonePath: string | null): string[] {
  const checks = buildProtocolAnchorChecks()
  const lines: string[] = [
    `- 版本锚登记（AX3 例外：本仓派生副本的登记锚；正源仓 ${PROTOCOL_SOURCE_REPO_URL}）：`,
  ]
  for (const check of checks) {
    const sha = check.registeredSha256 === null ? '无骨架哈希（比对基准 = commit）' : `骨架 sha256 ${check.registeredSha256}`
    lines.push(`  - ${check.label}：登记 commit ${check.registeredCommit}、${sha}（${check.basis}）`)
  }

  const probe = probeSourceClone(sourceClonePath)
  if (probe.status === 'available') {
    lines.push(`- 源码仓 clone 探测：${probe.clonePath}（HEAD ${probe.head}）`)
  } else if (probe.status === 'unregistered') {
    lines.push('- 源码仓 clone 探测：未登记。')
  } else {
    lines.push(`- 源码仓 clone 探测：${probe.clonePath}（探测失败：${probe.reason}）。${DOCTOR_RECOVERY_ACTIONS.registerSourceClone}`)
  }

  lines.push(
    '- 逐协议比对（比对口径 = git 内容寻址：clone HEAD 与登记 commit 逐字一致 ⟺ 同口径提取的骨架哈希与登记哈希一致；HEAD 已变化时保守判定漂移）：',
  )
  for (const check of checks) {
    const outcome = reconcileProtocolAnchor(check, probe)
    if (outcome.status === 'ok') {
      lines.push(`  - ✓ ${check.label}：ok（clone HEAD = 登记提取 commit，骨架哈希比对一致）`)
    } else if (outcome.status === 'drift') {
      lines.push(`  - ✗ ${check.label}：drift（clone HEAD ${outcome.cloneHead} ≠ 登记 commit ${check.registeredCommit}——正源已变化，登记骨架哈希不可再视为正源哈希）。${DOCTOR_RECOVERY_ACTIONS.reExtractAnchor}`)
    } else {
      lines.push(`  - ⚠ ${check.label}：无法比对（${outcome.cannotCompareReason}）。`)
    }
  }
  if (probe.status === 'unregistered') {
    lines.push(`- ${DOCTOR_RECOVERY_ACTIONS.registerSourceClone}`)
  }

  lines.push('- 已知信息：clone HEAD 可能滞后于本机安装版本——ok 态以登记锚为准（本节比对的是用户登记的 clone，非 /Applications 安装盘资产）。')
  return lines
}

// ── ⑪ 质量发现（D10⑪/SC5；读侧消费 U5 feedback.ts 的 report.jsonl 三行型记录）──

/** 发现记录 reason 的中文裁决说明（词表 = U5 FindingRecordReason；doctor 按「为什么没回注」呈现）。 */
export const FINDING_REASON_LABELS: Record<FindingRecordReason, string> = {
  'fed-back': '已回注送达会话',
  p1p2: 'P1/P2 仅记录不回注',
  duplicate: '内容指纹去重未再回注',
  limit: '超每文件回注上限仅记录',
  'no-agent': '查无活 Agent 放弃回注',
  'inject-error': '注入失败放弃回注',
  'unrecognized-existing': '陌生既有文件只记录不回注',
}

/** 读并解析 report.jsonl（追加式记录容忍半行写入：损坏行跳过并计数，同 U5 读侧口径）。 */
function readQualityReportLines(sessionCwd: string): { lines: QualityReportLine[]; corruptCount: number; fileExists: boolean } {
  const file = qualityReportPath(sessionCwd)
  let raw: string
  try {
    raw = readFileSync(file, 'utf8')
  } catch {
    return { lines: [], corruptCount: 0, fileExists: false }
  }
  const lines: QualityReportLine[] = []
  let corruptCount = 0
  for (const lineText of raw.split('\n')) {
    const trimmed = lineText.trim()
    if (trimmed === '') continue
    try {
      lines.push(JSON.parse(trimmed) as QualityReportLine)
    } catch {
      corruptCount += 1
    }
  }
  return { lines, corruptCount, fileExists: true }
}

/** 第⑪节渲染：监听器状态 + 发现清单（含回注裁决）+ 产物写盘身份记录；无记录给未启动原因。 */
function renderQualityFindingsSection(sessionCwd: string | null): string[] {
  if (sessionCwd === null) {
    return ['- 会话工作目录未知，无法读取检查记录（不影响本报告其余各项）。']
  }
  const { lines: reportLines, corruptCount, fileExists } = readQualityReportLines(sessionCwd)
  if (!fileExists || reportLines.length === 0) {
    const where = fileExists ? `${qualityReportPath(sessionCwd)} 为空或全部行损坏` : `${qualityReportPath(sessionCwd)} 不存在`
    return [
      `- 本轮会话无检查记录（${where}）。`,
      '- 监听器未启动原因：质量环监听器仅随设计 preset 会话启动（agent-preset/selected 事件按 presetId 过滤）；普通会话零监听零检查（V7 零侵入形态），监听器启动即失败自毁且记录未落盘时同样表现为本形态。',
    ]
  }

  const out: string[] = []
  if (corruptCount > 0) {
    out.push(`- ⚠ ${corruptCount} 行损坏已跳过（追加式记录容忍半行写入）。`)
  }

  // 监听器生命周期状态：doctor 无进程态感知，只能按 report.jsonl 最后一条生命周期记录推定当前态
  // （resume 后新进程重组会话、宿主不发 agent-preset/selected 时无监听器——最后 started 记录不代表仍在运行，
  // D2 裁决：如实呈现推定性质，不冒充进程态感知），累计次数随行。
  const watcherEvents = reportLines.filter((line): line is Extract<QualityReportLine, { type: 'watcher' }> => line.type === 'watcher')
  if (watcherEvents.length === 0) {
    out.push('- 监听器状态：记录中无监听器生命周期事件（检查记录由其他通道写入或插件版本较早）。')
  } else {
    const starts = watcherEvents.filter((event) => event.event === 'started').length
    const destroys = watcherEvents.filter((event) => event.event === 'destroyed').length
    const last = watcherEvents[watcherEvents.length - 1]!
    const lastText = last.event === 'started'
      ? `运行中推定（按 report.jsonl 最后一条生命周期记录：最近 started ${last.at}；进程重启后未刷新，可能已停止）`
      : `已自毁（按 report.jsonl 最后一条生命周期记录：最近 destroyed ${last.at}${typeof last.reason === 'string' && last.reason !== '' ? `；原因：${last.reason}` : ''}）`
    out.push(`- 监听器状态：${lastText}；累计启动 ${starts} 次 / 自毁 ${destroys} 次。`)
  }

  // 发现清单：severity 汇总 + 逐条行（含回注裁决说明）。
  const findings = reportLines.filter((line): line is Extract<QualityReportLine, { type: 'finding' }> => line.type === 'finding')
  const countBySeverity = { P0: 0, P1: 0, P2: 0 }
  for (const finding of findings) {
    // 记录行来自 JSONL 解析（外部数据）：词表外 severity 只呈现不进汇总计数。
    if (finding.severity === 'P0') countBySeverity.P0 += 1
    else if (finding.severity === 'P1') countBySeverity.P1 += 1
    else if (finding.severity === 'P2') countBySeverity.P2 += 1
  }
  out.push(`- 检查发现：共 ${findings.length} 条（P0 ${countBySeverity.P0} / P1 ${countBySeverity.P1} / P2 ${countBySeverity.P2}）。`)
  for (const finding of findings) {
    const reasonLabel = FINDING_REASON_LABELS[finding.reason] ?? finding.reason
    out.push(`  - [${finding.severity}] ${finding.id} — ${finding.path}（${reasonLabel}）：${finding.message}`)
  }

  // 产物写盘身份记录（D5④ 快照豁免的回查数据源；doctor 与豁免集读同一文件）。
  const artifacts = reportLines.filter((line): line is Extract<QualityReportLine, { type: 'artifact' }> => line.type === 'artifact')
  out.push(`- 产物写盘身份记录：${artifacts.length} 条（快照豁免的回查数据源，D5④）。`)
  for (const artifact of artifacts) {
    out.push(`  - ${artifact.path}（${artifact.at}）`)
  }
  return out
}

/**
 * 构建十一项诊断报告（纯函数：输入探测产物、会话目录与登记的 clone 路径，输出全文）。
 *
 * @param input - {@link DoctorReportInput}（宿主 handler 或测试组装）。
 * @returns 报告全文（分节标题字面与 {@link DOCTOR_SECTIONS} 一致）。
 */
export function buildDoctorReport(input: DoctorReportInput): string {
  const issues: DoctorIssue[] = []
  const sections: string[] = []

  // ── ① 安装形态与资源根 ──
  const installLines: string[] = []
  if (input.profileResult.status === 'found') {
    const profile = input.profileResult.profile
    installLines.push(
      `- 资源根：${profile.resourceRoot}`,
      `- 选中依据：${profile.selectedBy}`,
      `- 全部候选（${profile.candidates.length}）：`,
      ...profile.candidates.map((candidate) =>
        `  - ${candidate.resourceRoot}（渠道 ${candidate.channel}）${candidate.resourceRoot === profile.resourceRoot ? ' ← 已选中' : ''}`,
      ),
    )
  } else if (input.profileResult.status === 'missing') {
    const message = '未检测到 OpenDesign 安装（零候选）。恢复动作：安装 OpenDesign（/Applications/Open Design.app），然后重启 DSH。'
    issues.push({ section: DOCTOR_SECTIONS.install, message })
    installLines.push(`- ✗ ${message}`)
  } else {
    const message = `OpenDesign 资产探测失败：${input.profileResult.reason} ${DOCTOR_RECOVERY_ACTIONS.reinstallOd}`
    issues.push({ section: DOCTOR_SECTIONS.install, message })
    installLines.push(`- ✗ ${message}`)
  }
  sections.push(renderSection(1, DOCTOR_SECTIONS.install, installLines))

  // ── ② 清单路径与三层版本 ──（found 才有画像；missing/error 时该节随 ① 一并缺数据）
  const profile = input.profileResult.status === 'found' ? input.profileResult.profile : null
  const manifestLines: string[] = []
  if (profile === null) {
    manifestLines.push('- 资产未定位，无清单可报告（见第①节）。')
  } else {
    const verifiedLine = profile.verified
      ? '（已核实）'
      : `（未核实——超出本插件已核实集合；${DOCTOR_RECOVERY_ACTIONS.upgradePlugin}）`
    manifestLines.push(
      `- 清单路径：${profile.manifestPath}`,
      `- manifest 版本：${profile.versions.manifestVersion ?? '（未声明）'}`,
      `- specVersion：${profile.versions.specVersion ?? '（未声明）'}${verifiedLine}`,
      `- 资产版本（core.version）：${profile.versions.assetVersion ?? '（未声明）'}`,
    )
  }
  sections.push(renderSection(2, DOCTOR_SECTIONS.manifest, manifestLines))

  // ── ③ roster 完整性核验 ──
  const rosterLines = profile === null
    ? ['- 资产未定位，无法核验（见第①节）。']
    : renderRosterSection(profile, issues)
  sections.push(renderSection(3, DOCTOR_SECTIONS.roster, rosterLines))

  // ── ④ 改写规则命中清单 + 止损位评估数据 ──
  let records: RewriteApplyRecord[] = []
  let readerUnavailable = false
  let rewriteLines: string[]
  if (profile === null) {
    rewriteLines = ['- 资产未定位，改写命中清单不可产出（见第①节）。']
  } else {
    const rendered = renderRewriteSection(profile, issues)
    records = rendered.records
    readerUnavailable = rendered.readerUnavailable
    rewriteLines = rendered.lines
  }
  sections.push(renderSection(4, DOCTOR_SECTIONS.rewrite, rewriteLines))

  // ── ⑤ 材质化状态 ──
  sections.push(renderSection(5, DOCTOR_SECTIONS.materialize, renderMaterializeSection(input.sessionCwd, issues)))

  // ── ⑥ 资产代际提示 ──
  const generationLines: string[] = []
  if (profile !== null) {
    generationLines.push(
      `- 当前资产版本：core v${profile.versions.assetVersion ?? '未知'}（清单 specVersion ${profile.versions.specVersion ?? '未知'}）`,
    )
  }
  generationLines.push(
    '- 提示：若本会话是 resume 的旧会话，历史轮次的系统提示词由旧代资产组装，与上列当前资产版本可能不同代；新轮次以当前资产重新组装为准（SC4 代际边界）。',
  )
  sections.push(renderSection(6, DOCTOR_SECTIONS.generation, generationLines))

  // ── ⑦ 异常与恢复动作（逐项就地展示 + 本节汇总）──
  const recoveryLines = issues.length === 0
    ? ['- 未发现异常。']
    : issues.map((issue, index) => `- ${index + 1}. 【${issue.section}】${issue.message}`)
  sections.push(renderSection(7, DOCTOR_SECTIONS.recovery, recoveryLines))

  // ── ⑧ 止损位状态 ──
  const evaluation = evaluateStopLoss(records, readerUnavailable)
  sections.push(renderSection(8, DOCTOR_SECTIONS.stopLoss, renderStopLossSection(evaluation)))

  // ── ⑨ 资产丰富度 ──（D10⑨；三目录扫描与 compose 清单段同源，降级随节内就地呈现）
  sections.push(renderSection(9, DOCTOR_SECTIONS.assetRichness, renderAssetRichnessSection(profile)))

  // ── ⑩ 协议与检查器对账 ──（D7/D10⑩；登记锚与 clone 三态，资产未定位也可报告——锚登记是插件仓事实）
  sections.push(renderSection(10, DOCTOR_SECTIONS.protocolAudit, renderProtocolAuditSection(input.sourceClonePath ?? null)))

  // ── ⑪ 质量发现 ──（D10⑪/SC5；report.jsonl 读侧，作用域与第⑤节同为会话工作目录）
  sections.push(renderSection(11, DOCTOR_SECTIONS.qualityFindings, renderQualityFindingsSection(input.sessionCwd)))

  return [
    DOCTOR_REPORT_TITLE,
    `（生成时间：${new Date().toISOString()}；求助时请附本报告全文）`,
    '',
    ...sections.join('\n\n').split('\n'),
    '',
  ].join('\n')
}

/** 渲染一节：标题行 + 条目行。 */
function renderSection(index: number, title: string, lines: readonly string[]): string {
  return [doctorSectionLine(index, title), ...lines].join('\n')
}

/**
 * 会话工作目录探测（跨版本形态，见文件头）：
 * workingDirectory 服务（0.2.x）在 → get(session)；否则 session.header.cwd（两版本 header 均带 cwd）。
 * 运行时可选探测，宿主对象形态不对（测试假 agent / 0.1.7 无服务）时一律 null，不抛错。
 *
 * 服务存在性探测必须走 try/catch 包裹的属性读取（0.1.7 实测）：cordis ctx 读未在本行
 * inject 声明的服务属性即抛（不能 declare——0.1.7 无 working-directory 行，declare 会让
 * 本行永久 pending），可选链 `?.` 拦不住 proxy getter 的抛错——「服务不在」与「服务在但
 * 调用失败」都按探测失败处理，回退 header.cwd（U8 e2e 实测修正，2026-11-09）。
 */
export function resolveSessionCwd(hostCtx: unknown, agent: unknown): string | null {
  const session = (agent as { session?: unknown } | undefined)?.session
  let workingDirectory: { get?: (s: unknown) => unknown } | undefined
  try {
    workingDirectory = (hostCtx as { workingDirectory?: { get?: (s: unknown) => unknown } } | undefined)
      ?.workingDirectory
  } catch {
    // 0.1.7：服务行不在，ctx 属性读取即抛（cordis 未声明即读即抛）→ 视为服务缺席
  }
  if (workingDirectory && typeof workingDirectory.get === 'function' && session !== undefined) {
    try {
      const cwd = workingDirectory.get(session)
      if (typeof cwd === 'string' && cwd.length > 0) return cwd
    } catch {
      // 服务探测失败（会话未就绪等）→ 回退 header.cwd
    }
  }
  const headerCwd = (session as { header?: { cwd?: unknown } } | undefined)?.header?.cwd
  return typeof headerCwd === 'string' && headerCwd.length > 0 ? headerCwd : null
}

/**
 * 命令行装配入口：注册 /opendesign-doctor（preset 组合 scope，与 command-goal 先例同形）。
 *
 * @param ctx - Cordis 插件上下文（preset 组合 scope）。
 */
export function apply(ctx: {
  commands: {
    register: (definition: {
      definitionId: string
      name: string
      description: string
      handler: (invocation: { agent?: unknown; rawInput?: unknown }) => { kind: 'success'; text: string } | { kind: 'error'; text: string }
    }) => () => void
  }
}): void {
  ctx.commands.register({
    definitionId: DOCTOR_DEFINITION_ID,
    name: DOCTOR_COMMAND_NAME,
    description: '诊断 OpenDesign 设计模式：资产定位、清单版本、roster 完整性、改写命中、材质化、资产丰富度、协议对账、质量发现与止损位状态',
    handler: (invocation) => {
      // 第⑩节 clone 路径登记通道：命令行上命令名之后的原文（rawInput，宿主 CommandInvocation
      // 契约）；形态 `/opendesign-doctor <clone 路径>`，空/缺省 = 未登记（⑩ 报无法比对 + 指引）。
      const rawInput = invocation?.rawInput
      const sourceClonePath = typeof rawInput === 'string' && rawInput.trim() !== '' ? rawInput.trim() : null
      const text = buildDoctorReport({
        profileResult: locateOdAssets(),
        sessionCwd: resolveSessionCwd(ctx, invocation?.agent),
        sourceClonePath,
      })
      return { kind: 'success', text }
    },
  })
}
