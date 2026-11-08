/**
 * /opendesign-doctor —— 设计模式诊断命令（U2b；语义权威 = 设计 D9 八项报告）。
 *
 * 八项报告：① 安装形态与资源根（多候选并存列全部候选与选中依据）② 清单路径与三层版本
 * ③ roster 完整性核验（逐文件存在性）④ 改写规则命中清单（消费 U4 applyRewrites 记录，含
 * 规则脆弱度标记）⑤ 材质化状态（作用域 = 当前会话工作目录，写入落点清单；预铺后为空即
 * 异常并归入错误项）⑥ 资产代际提示（resume 旧会话时历史轮次可能与当前资产不同代）
 * ⑦ 逐项异常的恢复动作（重装 OD / 升级本插件 / 重启 DSH）⑧ stop-loss 止损位状态
 * （对照 D9 三判据，触发即输出「建议方案级重审」警示）。
 *
 * 输出形态：纯文本结构化报告（分节标题 + 行式条目），供会话内直接阅读与 e2e DOM 断言
 * （U8 A4 场景断言分节标题字面——分节名经 {@link DOCTOR_SECTIONS} 常量导出供测试对账）。
 *
 * 改写命中清单的产生方式：命令执行时对当前资产的 core / orchestration 文本**现场重放**
 * applyRewrites（与组装层同一规则集、同一编排）。D9 的止损位判据来源 = 该命中清单——
 * 报告的是「当前资产 × 当前规则集」的适配态，会话组装时点与诊断时点之间的资产升级由
 * 第⑥项代际提示覆盖。命令名依据：DSH commands registry 的名字校验为 `/^[a-z][a-z0-9_-]*$/u`
 * （0.1.7-rc.2 与 0.2.2-rc.1 双版本亲读核实，带冒号的名字注册即抛 TypeError），设计文档
 * V4 的「/opendesign:doctor」字面在 registry 上不可注册，实际注册名 = `opendesign-doctor`
 * （冲突登记见 runlog，待设计文档对账裁决）。
 *
 * 宿主契约：CommandDefinition 形态（DSH packages/interaction/commands 先例
 * @deepseek-ai/dsh-command-goal）：inject ['commands'] + ctx.commands.register；
 * handler 返回 { kind: 'success', text }，text 由派发 UI 直接渲染。
 * 会话工作目录探测（第⑤项作用域）：workingDirectory 服务是 0.2.x 引入（0.1.7 base patch
 * 无此行，亲读核实），故不作 inject 依赖（0.1.7 上会让本行永久 pending），改 handler 内
 * 运行时可选探测：服务在 → workingDirectory.get(session)；否则回退 session.header.cwd
 * （两版本 session header 均带 cwd 字段）；都不可得 → null（报告「目录未知」，非错误）。
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { applyRewrites, type RewriteApplyRecord } from '../rewrite/apply.js'
import { listDeclaredRosterPaths, type OdManifestShape } from '../locate/manifest-discovery.js'
import { locateOdAssets, readRosterAsset, type VersionProfileResult } from '../locate/version-profile.js'
import { MATERIALIZED_FILE_NAMES, OD_FRAMES_DIR } from '../materialize/copy.js'
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
 * 八个分节的标题字面（U8 A4：分节名常量导出供测试对账；行内形态 = `【N/8】<标题>`）。
 * 顺序即报告节序，键名 = 节语义（对账时按键取字面）。
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
} as const

/** 分节标题的渲染行（`【N/8】标题`）；测试与 e2e 按此形态断言。 */
export function doctorSectionLine(index: number, title: string): string {
  return `【${index}/8】${title}`
}

/** 三类标准恢复动作（任务书⑦；文案与 types.ts 两形态诊断文案同族）。 */
export const DOCTOR_RECOVERY_ACTIONS = {
  reinstallOd: '恢复动作：重装 OpenDesign，然后重启 DSH。',
  upgradePlugin: '恢复动作：升级本插件到适配当前 OpenDesign 资产的版本（改写规则随插件版本更新），然后重启 DSH。',
  restartDsh: '恢复动作：重启 DSH（材质化在新会话创建时无条件全量重铺；.od-frames/ 目录可安全删除后重建）。',
} as const

/** 命令执行输入（宿主侧探测产物；纯函数化报告便于单测）。 */
export interface DoctorReportInput {
  /** 资产定位结局（locateOdAssets 产物；missing / error / found 三态）。 */
  profileResult: VersionProfileResult
  /** 当前会话工作目录（探测不可得时 null → 材质化状态报告「目录未知」）。 */
  sessionCwd: string | null
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
 * 失配判定 = locator 为 semantic-anchor 且 hitCount 为 0 的记录（锚应当命中却未命中）。
 * 两类「正常零命中」不计入失配：R1（locator=regex，防御性规则，注入文本基线零命中）与
 * 残余兜底两条 regex（正常形态零命中；命中 >0 是段锚漂移的旁证，在第④节以提示行展示）。
 */
export function evaluateStopLoss(records: readonly RewriteApplyRecord[], readerUnavailable: boolean): StopLossEvaluation {
  const misfires = records.filter((record) => record.locator === 'semantic-anchor' && record.hitCount === 0)
  const criterion1Triggered = misfires.length >= 3
  return {
    criterion1Triggered,
    misfires,
    criterion2Triggered: readerUnavailable,
    criterion3Triggered: false,
    triggered: criterion1Triggered || readerUnavailable,
  }
}

/** 一条 apply 记录在第④节的展示行（规则名 / 命中资产 / 替换结果摘要 / 脆弱度）；导出供测试对账。 */
export function rewriteRecordLine(record: RewriteApplyRecord): string {
  const marker = record.hitCount > 0 ? '[✓]' : record.locator === 'semantic-anchor' ? '[✗ 失配]' : '[—]'
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

/** 第⑤节：材质化状态（作用域 = 会话工作目录；D8 ④ 覆盖语义的感知通道）。 */
function renderMaterializeSection(sessionCwd: string | null, issues: DoctorIssue[]): string {
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
  for (const fileName of MATERIALIZED_FILE_NAMES) {
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
  if (missingNames.length === MATERIALIZED_FILE_NAMES.length) {
    const message = `材质化异常：落点目录存在但 ${MATERIALIZED_FILE_NAMES.length} 个管理名全部缺失（预铺后为空即异常）。${DOCTOR_RECOVERY_ACTIONS.restartDsh}`
    issues.push({ section: DOCTOR_SECTIONS.materialize, message })
    lines.push(`- ✗ ${message}`)
  } else if (missingNames.length > 0) {
    const message = `材质化异常：${missingNames.length} 个管理名缺失（${missingNames.join('、')}；D8 为无条件全量重铺，四文件应齐备）。${DOCTOR_RECOVERY_ACTIONS.restartDsh}`
    issues.push({ section: DOCTOR_SECTIONS.materialize, message })
    lines.push(`- ✗ ${message}`)
  } else {
    lines.push(`- 结论：${MATERIALIZED_FILE_NAMES.length} 个管理名全部在场（写入落点清单如上）。`)
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
  const lines: string[] = [
    `- 规则应用记录共 ${records.length} 条（命中 ${hit} 条 / 零命中 ${records.length - hit} 条；零命中含防御性规则基线形态与残余兜底未触发形态，见逐条标记）：`,
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

/**
 * 构建八项诊断报告（纯函数：输入探测产物与会话目录，输出全文）。
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
 */
export function resolveSessionCwd(hostCtx: unknown, agent: unknown): string | null {
  const session = (agent as { session?: unknown } | undefined)?.session
  const workingDirectory = (hostCtx as { workingDirectory?: { get?: (s: unknown) => unknown } } | undefined)
    ?.workingDirectory
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
      handler: (invocation: { agent?: unknown }) => { kind: 'success'; text: string } | { kind: 'error'; text: string }
    }) => () => void
  }
}): void {
  ctx.commands.register({
    definitionId: DOCTOR_DEFINITION_ID,
    name: DOCTOR_COMMAND_NAME,
    description: '诊断 OpenDesign 设计模式：资产定位、清单版本、roster 完整性、改写命中、材质化与止损位状态',
    handler: (invocation) => {
      const text = buildDoctorReport({
        profileResult: locateOdAssets(),
        sessionCwd: resolveSessionCwd(ctx, invocation?.agent),
      })
      return { kind: 'success', text }
    },
  })
}
