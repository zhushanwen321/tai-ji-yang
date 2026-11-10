/**
 * doctor 诊断命令测试（U2b 八节 + opendesign-assets-quality U6 扩十一节）。
 *
 * fixture：U0 共享 fixture（tests/fixtures/mini-od 默认布局、drift-od 漂移形态）+ U1 资产
 * 目录 fixture（asset-catalog/full 真机形态摘录、missing-dirs 缺失变体，第⑨节消费）；异常
 * 形态（roster 缺件 / 失配文本 / 材质化空落点 / 第⑩节合成 git clone / 第⑪节 report.jsonl）
 * 在测试内以临时树构造（复制 fixture 场景包改内容、git init 合成仓、appendQualityReportLine
 * 真实写侧落行），不落 tests/fixtures/ 目录——它们是 doctor 层的行为用例。
 *
 * 断言结构（任务书验收条款对账）：
 * 1. 十一节结构断言（V1 八节零回归：前八节标题字面与次序不变 + 三新节标题 + 总数 11）
 * 2. 正常 fixture 资产根十一项齐备（分节标题字面 = DOCTOR_SECTIONS 常量；各节内容锚点）
 * 3. 缺失项带恢复动作（未装形态 / roster 缺件 error 形态 / 材质化空落点与部分缺失形态）
 * 4. 命中清单与 apply 记录一致（doctor 第④节逐行 == 测试侧独立重放 applyRewrites 的记录行）
 * 5. 止损位触发形态构造（evaluateStopLoss 单元边界 + 失配文本 fixture 全链路「建议方案级重审」）
 * 6. 命令注册形态（apply 经假 ctx 断言 registry 契约：名字校验、definitionId、handler 返回）
 * 7. 会话工作目录探测的跨版本形态（0.2.x 服务 / 0.1.7 header.cwd / 都不可得 null）
 * 8. 第⑨节：丰富度计数 fixture 对账（craft 册数口径 / 解析异常包清单 / 注入行数）与
 *    目录缺失降级恢复文案（任务书验收条款④）
 * 9. 第⑩节：对账三态 fixture 断言（合成 git clone：ok / drift / 无法比对各自可证伪，
 *    RL5；任务书验收条款②）与 clone 探测单元（GPK1 命令口径）
 * 10. 第⑪节：report.jsonl 读侧断言（U5 三行型真写侧落行 + 损坏行容忍 + 无记录未启动
 *     原因，RL9；任务书验收条款③）
 * 编号口径：本文件裸编号（U/D/AX/AS/SC/RL/UD/SI/GPK 等）默认属 opendesign-assets-quality 设计包（本轮）；V1 设计包域编号带「V1 设计包 / V1·」前缀。
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

import {
  apply,
  buildDoctorReport,
  buildProtocolAnchorChecks,
  DOCTOR_COMMAND_NAME,
  DOCTOR_DEFINITION_ID,
  DOCTOR_REPORT_TITLE,
  DOCTOR_RECOVERY_ACTIONS,
  DOCTOR_SECTIONS,
  DOCTOR_SECTION_COUNT,
  doctorSectionLine,
  evaluateStopLoss,
  FINDING_REASON_LABELS,
  probeSourceClone,
  reconcileProtocolAnchor,
  resolveSessionCwd,
  rewriteRecordLine,
  type ProtocolAnchorCheck,
} from '../lib/commands/doctor.js'
import { buildVersionProfile, readRosterAsset, type VersionProfileResult } from '../lib/locate/version-profile.js'
import { applyRewrites, type RewriteApplyRecord } from '../lib/rewrite/apply.js'
import { appendQualityReportLine } from '../lib/quality/feedback.js'
import { materializeAssets } from '../lib/materialize/copy.js'

const fixturesRoot = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures')
/** 默认布局形态的资源根（清单在 plugins/_official/scenarios/od-next-strategy/）。 */
const miniRoot = join(fixturesRoot, 'mini-od')
/** drift-od 的场景包（最小 roster：4 项声明，复制改字段构造异常形态）。 */
const driftScenario = join(fixturesRoot, 'drift-od', 'upgraded', 'v2', 'od-next-strategy')
const miniScenario = join(miniRoot, 'plugins', '_official', 'scenarios', 'od-next-strategy')
/** U1 资产目录 fixture：full = 三目录齐备（真机形态摘录 + 损坏变体），第⑨节丰富度计数用。 */
const catalogFullRoot = join(fixturesRoot, 'asset-catalog', 'full')

// —— 临时树：异常形态构造（用后统一清理）——
const tempRoots: string[] = []
afterAll(() => {
  for (const dir of tempRoots) rmSync(dir, { recursive: true, force: true })
})

function makeTempDir(label: string): string {
  const dir = mkdtempSync(join(resolve(process.env.TMPDIR ?? '/tmp'), `od-doctor-${label}-`))
  tempRoots.push(dir)
  return dir
}

/** 复制 drift-od 场景包到临时目录，返回场景包目录。 */
function copyDriftScenario(label: string): string {
  const tree = join(makeTempDir(label), 'od-next-strategy')
  cpSync(driftScenario, tree, { recursive: true })
  return tree
}

/**
 * 富资产资源根（第⑨节丰富度计数 fixture）：mini-od（合法清单）+ U1 asset-catalog/full
 * 的三目录并入（craft 2 册 / design-templates 3 包含 1 损坏 / design-systems 4 品牌含 2
 * 损坏——计数口径与 locate.test.ts fixture 组一致，U1 登记点）。
 */
function makeEnrichedResourceRoot(label: string): string {
  const root = makeTempDir(label)
  cpSync(miniRoot, root, { recursive: true })
  cpSync(join(catalogFullRoot, 'craft'), join(root, 'craft'), { recursive: true })
  cpSync(join(catalogFullRoot, 'design-templates'), join(root, 'design-templates'), { recursive: true })
  rmSync(join(root, 'design-systems'), { recursive: true, force: true })
  cpSync(join(catalogFullRoot, 'design-systems'), join(root, 'design-systems'), { recursive: true })
  return root
}

// —— 第⑩节合成 git clone（三态 fixture；git 不可用时显式播报跳过，不静默）——
let gitAvailable: boolean | null = null

function ensureGitAvailable(): boolean {
  if (gitAvailable === null) {
    try {
      execFileSync('git', ['--version'], { stdio: ['ignore', 'pipe', 'ignore'] })
      gitAvailable = true
    } catch {
      gitAvailable = false
    }
  }
  if (!gitAvailable) {
    console.warn('[skip] git 命令不可用，第⑩节合成 clone 组跳过——无法比对态用例不依赖 git，仍在本组覆盖')
  }
  return gitAvailable
}

/** 合成 git clone：init + 两次独立 commit，返回 { 路径, 首次 HEAD, 二次 HEAD }（两 HEAD 必不等）。 */
function makeSyntheticClone(label: string): { dir: string; firstHead: string; secondHead: string } {
  const dir = makeTempDir(label)
  const git = (args: string[]): string =>
    execFileSync('git', ['-c', 'user.name=doctor-test', '-c', 'user.email=doctor-test@example.invalid', ...args], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  git(['init'])
  writeFileSync(join(dir, 'panel.ts'), 'export const skeleton = "v1"\n')
  git(['add', 'panel.ts'])
  git(['commit', '-m', 'first'])
  const firstHead = git(['rev-parse', 'HEAD'])
  writeFileSync(join(dir, 'panel.ts'), 'export const skeleton = "v2 changed"\n')
  git(['add', 'panel.ts'])
  git(['commit', '-m', 'second'])
  const secondHead = git(['rev-parse', 'HEAD'])
  return { dir, firstHead, secondHead }
}

/** mini-od 单候选画像（found 形态）。 */
function miniProfileResult(): VersionProfileResult {
  return buildVersionProfile([{ resourceRoot: miniRoot, channel: 'stable' }])
}

/** DSH commands registry 的名字校验（0.1.7-rc.2 与 0.2.2-rc.1 双版本同款，对账锚）。 */
const DSH_COMMAND_NAME_PATTERN = /^[a-z][a-z0-9_-]*$/u

/** 测试侧重放改写（与 doctor 第④节同一输入：清单声明的 core/orchestration + design-systems 根）。 */
function replayRewriteRecords(): RewriteApplyRecord[] {
  const result = miniProfileResult()
  if (result.status !== 'found') throw new Error('mini-od 画像应 found')
  const manifest = JSON.parse(readFileSync(result.profile.manifestPath, 'utf8')) as {
    od?: { strategy?: { assets?: { core?: { path?: string }; orchestration?: { path?: string } } } }
  }
  const corePath = manifest.od?.strategy?.assets?.core?.path
  const orchestrationPath = manifest.od?.strategy?.assets?.orchestration?.path
  if (typeof corePath !== 'string' || typeof orchestrationPath !== 'string') {
    throw new Error('fixture 清单缺 core/orchestration 声明')
  }
  return applyRewrites({
    'core-system-prompt': readRosterAsset(result.profile, corePath),
    'general-orchestration': readRosterAsset(result.profile, orchestrationPath),
  }, { designSystemsRoot: join(miniRoot, 'design-systems') }).records
}

describe('命令注册形态（apply 经假 ctx 断言 registry 契约）', () => {
  it('注册名合法（DSH registry 名字校验 [a-z][a-z0-9_-]*，冒号不可注册）、definitionId 与描述齐备', () => {
    expect(DOCTOR_COMMAND_NAME).toMatch(DSH_COMMAND_NAME_PATTERN)
    expect(DOCTOR_COMMAND_NAME).not.toContain(':')
    expect(DOCTOR_DEFINITION_ID).toBe('opendesign-design-mode/commands/doctor')

    const registered: Array<{ name: string; description: string; handler: unknown }> = []
    const fakeCtx = {
      commands: {
        register: (definition: { name: string; description: string; handler: unknown }) => {
          registered.push(definition)
          return () => undefined
        },
      },
    }
    apply(fakeCtx)
    expect(registered).toHaveLength(1)
    const definition = registered[0]!
    expect(definition.name).toBe(DOCTOR_COMMAND_NAME)
    expect(definition.description.length).toBeGreaterThan(0)
    expect(typeof definition.handler).toBe('function')
  })

  it('handler 返回 success + 报告全文（首行 = 报告标题；任意定位结局都产出八节）', () => {
    let captured: { name: string; handler: (invocation: { agent?: unknown }) => unknown } | undefined
    apply({
      commands: {
        register: (definition) => {
          captured = definition as typeof captured
          return () => undefined
        },
      },
    })
    const result = captured?.handler({ agent: undefined }) as { kind: string; text: string }
    expect(result.kind).toBe('success')
    expect(result.text.startsWith(DOCTOR_REPORT_TITLE)).toBe(true)
    for (const [index, title] of Object.values(DOCTOR_SECTIONS).entries()) {
      expect(result.text).toContain(doctorSectionLine(index + 1, title))
    }
  })
})

describe('十一节结构断言（V1 八节零回归 + U6 三新节）', () => {
  /** V1 既有八节的标题字面（逐字锁——零回归面：字面、次序、键序都不得变化）。 */
  const V1_EIGHT_SECTION_TITLES = [
    '安装形态与资源根',
    '清单路径与三层版本',
    'roster 完整性核验',
    '改写规则命中清单',
    '材质化状态',
    '资产代际提示',
    '异常与恢复动作',
    '止损位状态',
  ] as const

  it('分节常量共 11 键：前 8 键 = V1 原标题原序（零回归），后 3 键 = U6 新节标题', () => {
    expect(DOCTOR_SECTION_COUNT).toBe(11)
    const keys = Object.keys(DOCTOR_SECTIONS)
    expect(keys).toHaveLength(11)
    // 前 8 键逐字对账（V1 八节零回归：标题字面与键序不变）。
    expect(keys.slice(0, 8)).toEqual(['install', 'manifest', 'roster', 'rewrite', 'materialize', 'generation', 'recovery', 'stopLoss'])
    for (const [index, title] of V1_EIGHT_SECTION_TITLES.entries()) {
      expect(DOCTOR_SECTIONS[keys[index] as keyof typeof DOCTOR_SECTIONS]).toBe(title)
    }
    // 新增三节（D10⑨⑩⑪）。
    expect(DOCTOR_SECTIONS.assetRichness).toBe('资产丰富度')
    expect(DOCTOR_SECTIONS.protocolAudit).toBe('协议与检查器对账')
    expect(DOCTOR_SECTIONS.qualityFindings).toBe('质量发现')
  })

  it('标题行形态扩为 【N/11】：V1 节与新节同构渲染，编号连续', () => {
    expect(doctorSectionLine(1, DOCTOR_SECTIONS.install)).toBe('【1/11】安装形态与资源根')
    expect(doctorSectionLine(8, DOCTOR_SECTIONS.stopLoss)).toBe('【8/11】止损位状态')
    expect(doctorSectionLine(9, DOCTOR_SECTIONS.assetRichness)).toBe('【9/11】资产丰富度')
    expect(doctorSectionLine(10, DOCTOR_SECTIONS.protocolAudit)).toBe('【10/11】协议与检查器对账')
    expect(doctorSectionLine(11, DOCTOR_SECTIONS.qualityFindings)).toBe('【11/11】质量发现')
  })

  it('任意定位结局都产出十一节：missing 形态报告仍含全部标题行（含三新节的降级形态）', () => {
    const report = buildDoctorReport({ profileResult: { status: 'missing' }, sessionCwd: null })
    for (const [index, title] of Object.values(DOCTOR_SECTIONS).entries()) {
      expect(report).toContain(doctorSectionLine(index + 1, title))
    }
    // 三新节的降级形态随缺失结局就地呈现。
    expect(report).toContain('资产未定位，无资产丰富度可报告（见第①节）')
    expect(report).toContain('【10/11】协议与检查器对账')
    expect(report).toContain('会话工作目录未知，无法读取检查记录')
  })
})

describe('正常 fixture 资产根：八项齐备（八节标题 + 各节内容锚点）', () => {
  it('mini-od + 已预铺会话目录：八节全在，各节内容正确', async () => {
    const result = miniProfileResult()
    expect(result.status).toBe('found')
    if (result.status !== 'found') return
    const profile = result.profile

    // 会话工作目录：真跑材质化（5 文件完整写清单落盘），doctor 第⑤节报告该落点清单。
    const sessionCwd = makeTempDir('session')
    const materialized = await materializeAssets({ manifestPath: profile.manifestPath, cwd: sessionCwd })
    expect(materialized.files).toHaveLength(5)

    const report = buildDoctorReport({ profileResult: result, sessionCwd })

    // 报告骨架：首行标题 + 八节标题字面（DOCTOR_SECTIONS 常量与 doctorSectionLine 行形态）。
    expect(report.startsWith(DOCTOR_REPORT_TITLE)).toBe(true)
    for (const [index, title] of Object.values(DOCTOR_SECTIONS).entries()) {
      expect(report).toContain(doctorSectionLine(index + 1, title))
    }

    // ① 安装形态与资源根：资源根、选中依据、全部候选与选中标记。
    expect(report).toContain(`- 资源根：${resolve(miniRoot)}`)
    expect(report).toContain('选中依据：')
    expect(report).toContain(`- ${resolve(miniRoot)}（渠道 stable） ← 已选中`)

    // ② 清单路径与三层版本（mini-od：3.3.8 / 1.0.0 / 3.2.0，specVersion 已核实）。
    expect(report).toContain(`- 清单路径：${profile.manifestPath}`)
    expect(report).toContain('manifest 版本：3.3.8')
    expect(report).toContain('specVersion：1.0.0（已核实）')
    expect(report).toContain('资产版本（core.version）：3.2.0')

    // ③ roster 完整性：逐文件在场 + 结论行。
    expect(report).toContain('声明文件共 ')
    expect(report).toContain('✓ ./assets/core-system-prompt.md')
    expect(report).toContain('结论：全部声明文件在场。')

    // ④ 改写命中清单：记录总数行 + 逐条行（逐条一致性由下一 describe 锁）。
    expect(report).toContain('- 规则应用记录共 ')
    expect(report).toContain('脆弱度')

    // ⑤ 材质化状态：会话目录、落点、五管理名（完整写清单含 deck-framework.md）在场、结论。
    expect(report).toContain(`- 会话工作目录：${sessionCwd}`)
    expect(report).toContain(join(sessionCwd, '.od-frames'))
    for (const fileName of ['android.html', 'iphone.html', 'neutral.html', 'layout.css', 'deck-framework.md']) {
      expect(report).toContain(`✓ ${fileName}（`)
    }
    expect(report).toContain('结论：5 个管理名全部在场（写入落点清单如上）。')

    // ⑥ 资产代际提示：当前版本 + resume 不同代提示。
    expect(report).toContain('当前资产版本：core v3.2.0')
    expect(report).toContain('resume 的旧会话')
    expect(report).toContain('可能不同代')

    // ⑦ 正常形态无异常。
    expect(report).toContain('未发现异常。')

    // ⑧ 止损位：三判据逐条（判据③不可观测说明恒在）。
    expect(report).toContain('判据① 核心段改写规则失配 ≥3 条：')
    expect(report).toContain('判据② 默认读取器无法产出可注入文本：未触发')
    expect(report).toContain('判据③ 连续两个 OD 版本升级均需重写全部规则：不在单次诊断可观测范围')
  })

  it('fixture 为原文摘录形态（非完整副本）：语义段锚零命中使止损位触发属预期，第⑧节给重审警示', () => {
    // mini-od 摘录只收录关键段——多数语义段规则在此形态零命中，判据①触发不是缺陷；
    // 本断言锁定「触发形态有警示输出」，完整命中不触发的语义由止损位 describe 的单元用例锁。
    const report = buildDoctorReport({ profileResult: miniProfileResult(), sessionCwd: null })
    expect(report).toContain('⚠ 建议方案级重审')
    expect(report).toContain('触发（')
  })
})

describe('缺失项带恢复动作', () => {
  it('未装形态（missing）：第①节安装指引 + 第⑦节汇总恢复动作，八节骨架仍在', () => {
    const report = buildDoctorReport({ profileResult: { status: 'missing' }, sessionCwd: null })
    for (const [index, title] of Object.values(DOCTOR_SECTIONS).entries()) {
      expect(report).toContain(doctorSectionLine(index + 1, title))
    }
    expect(report).toContain('未检测到 OpenDesign 安装')
    expect(report).toContain('安装 OpenDesign')
    expect(report).toContain('资产未定位')
    // 第⑦节汇总行的节名前缀 = 发生异常的节（第①节标题），非第⑦节自身标题。
    expect(report).toContain(`1. 【${DOCTOR_SECTIONS.install}】未检测到 OpenDesign 安装`)
    expect(report).not.toContain('未发现异常。')
  })

  it('探测失败形态（error / roster 缺件）：reason 与「重装 OpenDesign」恢复动作齐备', () => {
    const tree = copyDriftScenario('doctor-roster-missing')
    rmSync(join(tree, 'assets', 'core-system-prompt.md'))
    const result = buildVersionProfile([{ resourceRoot: dirname(tree), channel: 'beta' }])
    expect(result.status).toBe('error')
    const report = buildDoctorReport({ profileResult: result, sessionCwd: null })
    expect(report).toContain('OpenDesign 资产探测失败')
    expect(report).toContain(DOCTOR_RECOVERY_ACTIONS.reinstallOd)
    expect(report).toContain(`1. 【${DOCTOR_SECTIONS.install}】`)
  })

  it('材质化空落点（预铺后为空即异常）：归入错误项 + 第⑦节汇总「重启 DSH」恢复动作', () => {
    const sessionCwd = makeTempDir('empty-frames')
    mkdirSync(join(sessionCwd, '.od-frames'), { recursive: true })
    const report = buildDoctorReport({ profileResult: miniProfileResult(), sessionCwd })
    expect(report).toContain('材质化异常：落点目录存在但 5 个管理名全部缺失')
    expect(report).toContain(DOCTOR_RECOVERY_ACTIONS.restartDsh)
    expect(report).toContain(`【${DOCTOR_SECTIONS.materialize}】材质化异常`)
    expect(report).not.toContain('未发现异常。')
  })

  it('材质化部分缺失（全量重铺语义应写清单 5 文件齐备）：逐文件标记 + 异常项', () => {
    const sessionCwd = makeTempDir('partial-frames')
    mkdirSync(join(sessionCwd, '.od-frames'), { recursive: true })
    writeFileSync(join(sessionCwd, '.od-frames', 'android.html'), '<html></html>')
    const report = buildDoctorReport({ profileResult: miniProfileResult(), sessionCwd })
    expect(report).toContain('✓ android.html（')
    expect(report).toContain('材质化异常：4 个管理名缺失')
    expect(report).toContain('iphone.html、neutral.html、layout.css、deck-framework.md')
  })

  it('未核实版本（specVersion 超集合）：第②节警告 + 升级本插件恢复动作', () => {
    const tree = copyDriftScenario('doctor-unverified')
    const manifestPath = join(tree, 'open-design.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
    manifest['specVersion'] = '9.9.9'
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
    const result = buildVersionProfile([{ resourceRoot: dirname(tree), channel: 'preview' }])
    expect(result.status).toBe('found')
    const report = buildDoctorReport({ profileResult: result, sessionCwd: null })
    expect(report).toContain('specVersion：9.9.9（未核实——超出本插件已核实集合')
    expect(report).toContain('升级本插件')
  })
})

describe('命中清单与 apply 记录一致', () => {
  it('第④节逐行 == 测试侧独立重放 applyRewrites 的记录行（37 条全对账）', () => {
    const records = replayRewriteRecords()
    // mini-od 摘录 × 规则清单 = 每规则 × 每目标资产一条记录（U4 规则清单的笛卡尔展开，
    // 含 legacy-only 与 current-only 两代规则）。
    expect(records.length).toBe(37)
    const report = buildDoctorReport({ profileResult: miniProfileResult(), sessionCwd: null })
    for (const record of records) {
      expect(report).toContain(rewriteRecordLine(record))
    }
    // 命中统计行与重放一致。
    const hit = records.filter((record) => record.hitCount > 0).length
    expect(report).toContain(`- 规则应用记录共 ${records.length} 条（命中 ${hit} 条 / 零命中 ${records.length - hit} 条`)
    // 资产代际探测行在场（mini-od = 0.25.1 旧代形态）。
    expect(report).toContain('- 资产代际探测：legacy')
  })

  it('记录行形态契约：命中/失配/防御性零命中三态标记与摘要、脆弱度字段逐项在场', () => {
    const records = replayRewriteRecords()
    const hitRecord = records.find((record) => record.hitCount > 0)
    expect(hitRecord).toBeDefined()
    expect(rewriteRecordLine(hitRecord!)).toContain('[✓]')
    expect(rewriteRecordLine(hitRecord!)).toContain(`→ ${hitRecord!.asset} → ${hitRecord!.summary}`)
    expect(rewriteRecordLine(hitRecord!)).toContain(`（脆弱度 ${hitRecord!.fragility}）`)

    const misfire = records.find((record) => record.locator === 'semantic-anchor' && record.hitCount === 0)
    expect(misfire).toBeDefined()
    expect(rewriteRecordLine(misfire!)).toContain('[✗ 失配]')

    const defensiveZero = records.find((record) => record.locator === 'regex' && record.hitCount === 0)
    expect(defensiveZero).toBeDefined()
    expect(rewriteRecordLine(defensiveZero!)).toContain('[—]')
  })
})

describe('止损位状态（V1 设计包 D9 三判据）', () => {
  /**
   * 构造合成记录：semantic-anchor 规则 × hitCount（模拟全命中基线与失配翻转）。
   * 代际字段默认 cross-generation × current（恒适用）——代际裁决语义由下方专用用例锁。
   */
  function syntheticRecord(
    id: string,
    hitCount: number,
    generation: RewriteApplyRecord['generation'] = 'cross-generation',
    assetGeneration: RewriteApplyRecord['assetGeneration'] = 'current',
  ): RewriteApplyRecord {
    const isAnchor = !id.startsWith('r1-') && !id.includes('residual')
    return {
      ruleId: id,
      ruleName: `规则 ${id}`,
      family: 'two-turn-protocol',
      asset: 'core-system-prompt',
      locator: isAnchor ? 'semantic-anchor' : 'regex',
      fragility: 'high',
      generation,
      assetGeneration,
      hitCount,
      summary: hitCount > 0 ? `replaced ${hitCount} occurrence(s)` : 'no replacement performed',
    }
  }

  /** 全命中基线：22 条语义段规则命中 + R1 与残余兜底 regex 零命中（正常形态）。 */
  function baselineRecords(): RewriteApplyRecord[] {
    const anchorIds = Array.from({ length: 22 }, (_, index) => `r-anchor-${index}`)
    const regexIds = ['r1-defensive', 'r3-residual-marker-phrase', 'r4-residual-question-form-term']
    return [
      ...anchorIds.map((id) => syntheticRecord(id, 1)),
      ...regexIds.map((id) => syntheticRecord(id, 0)),
    ]
  }

  it('判据①边界：全命中基线不触发；失配 2 条不触发；失配 3 条触发（≥3 阈值）', () => {
    const baseline = baselineRecords()
    expect(evaluateStopLoss(baseline, false).criterion1Triggered).toBe(false)
    expect(evaluateStopLoss(baseline, false).triggered).toBe(false)

    const twoMisfires = [...baseline.slice(3), ...baseline.slice(0, 2).map((record) => ({ ...record, hitCount: 0 }))]
    expect(evaluateStopLoss(twoMisfires, false).criterion1Triggered).toBe(false)

    const threeMisfires = [...baseline.slice(3), ...baseline.slice(0, 3).map((record) => ({ ...record, hitCount: 0 }))]
    const evaluation = evaluateStopLoss(threeMisfires, false)
    expect(evaluation.criterion1Triggered).toBe(true)
    expect(evaluation.misfires).toHaveLength(3)
    expect(evaluation.triggered).toBe(true)
  })

  it('判据②：读取不可用即触发（与判据①独立；无失配也触发）', () => {
    const evaluation = evaluateStopLoss(baselineRecords(), true)
    expect(evaluation.criterion1Triggered).toBe(false)
    expect(evaluation.criterion2Triggered).toBe(true)
    expect(evaluation.triggered).toBe(true)
    // 判据③固定不可由单次命令观测（无跨升级历史数据源）。
    expect(evaluation.criterion3Triggered).toBe(false)
  })

  it('失配文本 fixture 全链路：裁掉锚段使失配 ≥3，第⑧节触发「建议方案级重审」并逐条列出失配规则', () => {
    // fixture 造失配：core 换成不含任何锚句的普通文本 → 指向 core 的语义段规则全部零命中。
    const tree = copyDriftScenario('doctor-misfire')
    writeFileSync(join(tree, 'assets', 'core-system-prompt.md'), 'Neutral core text with no rewrite anchors at all.\n')
    const result = buildVersionProfile([{ resourceRoot: dirname(tree), channel: 'beta' }])
    expect(result.status).toBe('found')
    const report = buildDoctorReport({ profileResult: result, sessionCwd: null })
    expect(report).toContain('触发（')
    expect(report).toContain('条失配）')
    expect(report).toContain('⚠ 建议方案级重审：止损位判据已触发（V1 设计包 V2 真桥接提前或改写策略重构）。')
    // 代际不可判（无代际标记串）→ 全部按适用保守处理，失配照常计数。
    expect(report).toContain('- 资产代际探测：unknown')
    // 失配逐条行带规则 id / 资产 / 脆弱度（判据①的数据源 = 第④节命中清单；行形态见 renderStopLossSection）。
    expect(report).toContain('core-system-prompt，脆弱度 high）：锚未命中')
  })

  it('代际外零命中不计失配：legacy-only × current 与 current-only × legacy 均为预期形态', () => {
    // legacy-only 规则在 2.x（current）资产上零命中 = 预期（真机对账 2026-11-09 后的正常形态）。
    const legacyOnCurrent = [
      syntheticRecord('r-legacy-a', 1),
      syntheticRecord('r-legacy-b', 1),
      syntheticRecord('r-legacy-c', 1),
      syntheticRecord('r-legacy-dead', 0, 'legacy-only', 'current'),
    ]
    const evaluation = evaluateStopLoss(legacyOnCurrent, false)
    expect(evaluation.criterion1Triggered).toBe(false)
    expect(evaluation.misfires).toHaveLength(0)
    // current-only 规则在旧代（legacy）资产上零命中 = 预期。
    const currentOnLegacy = [
      syntheticRecord('r-anchor-a', 1, 'legacy-only', 'legacy'),
      syntheticRecord('r-anchor-b', 1, 'legacy-only', 'legacy'),
      syntheticRecord('r-anchor-c', 1, 'legacy-only', 'legacy'),
      syntheticRecord('r-current-dead', 0, 'current-only', 'legacy'),
    ]
    expect(evaluateStopLoss(currentOnLegacy, false).misfires).toHaveLength(0)
  })

  it('代际适用的零命中仍是失配：unknown 代际保守按适用；代际内零命中照常触发判据①', () => {
    // 代际探测 unknown → 全部按适用（保守方向：宁可多报失配，不漏报漂移）；失配 ≥3 触发判据①。
    const unknownGen = [
      syntheticRecord('r-x-a', 1, 'cross-generation', 'unknown'),
      syntheticRecord('r-x-dead-1', 0, 'legacy-only', 'unknown'),
      syntheticRecord('r-x-dead-2', 0, 'legacy-only', 'unknown'),
      syntheticRecord('r-x-dead-3', 0, 'legacy-only', 'unknown'),
    ]
    const evaluation = evaluateStopLoss(unknownGen, false)
    expect(evaluation.criterion1Triggered).toBe(true)
    expect(evaluation.misfires).toHaveLength(3)
    // 代际适用的语义段规则零命中（current-only × current）照常计失配并触发判据①。
    const applicableZero = [
      syntheticRecord('r-y-a', 1, 'current-only', 'current'),
      syntheticRecord('r-y-dead-1', 0, 'current-only', 'current'),
      syntheticRecord('r-y-dead-2', 0, 'current-only', 'current'),
      syntheticRecord('r-y-dead-3', 0, 'current-only', 'current'),
    ]
    const applicableEvaluation = evaluateStopLoss(applicableZero, false)
    expect(applicableEvaluation.criterion1Triggered).toBe(true)
    expect(applicableEvaluation.misfires).toHaveLength(3)
  })

  it('记录行三态标记按代际解释：代际外零命中标「仅旧代生效 / 仅新代生效」，代际适用零命中标「失配」', () => {
    expect(rewriteRecordLine(syntheticRecord('r-hit', 1, 'legacy-only', 'legacy'))).toContain('[✓]')
    expect(rewriteRecordLine(syntheticRecord('r-miss-applicable', 0, 'current-only', 'current'))).toContain('[✗ 失配]')
    expect(rewriteRecordLine(syntheticRecord('r-miss-legacy', 0, 'legacy-only', 'current'))).toContain('[— 仅旧代生效]')
    expect(rewriteRecordLine(syntheticRecord('r-miss-current', 0, 'current-only', 'legacy'))).toContain('[— 仅新代生效]')
    // regex 记录不受代际影响（防御性/残余兜底的零命中恒为正常形态）。
    expect(rewriteRecordLine(syntheticRecord('r1-defensive', 0, 'cross-generation', 'current'))).toContain('[—]')
  })
})

describe('第⑨节 资产丰富度（fixture 计数对账 + 降级恢复文案，D10⑨）', () => {
  it('富资产 fixture：craft 册数（排除两元文件）/ 形状包与解析异常 / manifest 命中 / 注入行数逐项对账', () => {
    const root = makeEnrichedResourceRoot('doctor-rich')
    const result = buildVersionProfile([{ resourceRoot: root, channel: 'stable' }])
    expect(result.status).toBe('found')
    if (result.status !== 'found') return
    const report = buildDoctorReport({ profileResult: result, sessionCwd: null })

    // craft 册数 = 规则书口径（anti-ai-slop.md + state-coverage.md；README/FUTURE_SECTIONS 排除，D10⑨）。
    expect(report).toContain('- craft 手册：2 册（规则书口径，排除 README.md 与 FUTURE_SECTIONS.md 两个元文件）')
    // 形状包 3 个（broken-skill / dashboard / web-prototype-taste-brutalist），解析异常 1 个（broken-skill）。
    expect(report).toContain('- 形状包：3 个（解析异常 1 个）')
    expect(report).toContain('- ⚠ 解析异常 1 个包（broken-skill；降级仅目录名）。')
    expect(report).toContain(DOCTOR_RECOVERY_ACTIONS.catalogParseError)
    // 设计系统 manifest 命中 4 个（airbnb / broken-brand / partial-brand / plain-brand），解析异常 2 个。
    expect(report).toContain('- 设计系统 manifest 命中：4 个（解析异常 2 个）')
    expect(report).toContain('- ⚠ 解析异常 2 个包（broken-brand、partial-brand；降级仅目录名）。')
    // 各清单段注入行数（一行一包口径）+ craft 指路块在场。
    expect(report).toContain('- 清单段注入行数：形状包清单段 3 行 / 设计系统清单段 4 行（一行一包口径）；craft 指路块：注入（craft/ 在场）。')
  })

  it('目录缺失降级（mini-od 无 craft/design-templates）：缺失行带资产根完整性恢复动作，注入行数计 0', () => {
    const report = buildDoctorReport({ profileResult: miniProfileResult(), sessionCwd: null })
    expect(report).toContain('- ✗ craft 手册：craft/ 目录缺失')
    expect(report).toContain('craft 指路块整体省略')
    expect(report).toContain('- ✗ 形状包：design-templates/ 目录缺失')
    expect(report).toContain('形状包清单段降级为空（0 行）')
    // 恢复动作文案（任务书验收条款④：目录缺失→检查资产根与 OD 安装完整性指引）。
    expect(report).toContain(DOCTOR_RECOVERY_ACTIONS.checkAssetRoot)
    expect(report).toContain('检查资产根（资源根见第①节）与 OD 安装完整性')
    // design-systems 在场（sample-brand 无 manifest → 命中 0、异常 0，D3 分母口径）；注入行数如实计 0。
    expect(report).toContain('- 设计系统 manifest 命中：0 个（解析异常 0 个）')
    expect(report).toContain('- 清单段注入行数：形状包清单段 0 行 / 设计系统清单段 0 行（一行一包口径）；craft 指路块：省略（craft/ 缺失时整体省略，D1/AX5）。')
    // 第⑨节降级不并入第⑦节汇总（V1「未发现异常」零回归面）。
    expect(report).toContain('未发现异常。')
  })

  it('资产未定位（missing）：第⑨节报无资产丰富度可报告，不探测目录', () => {
    const report = buildDoctorReport({ profileResult: { status: 'missing' }, sessionCwd: null })
    expect(report).toContain('- 资产未定位，无资产丰富度可报告（见第①节）。')
  })
})

describe('第⑩节 协议与检查器对账（三态 fixture + clone 探测单元，opendesign-assets-quality D7/D10⑩/GPK1）', () => {
  /** 合成锚工厂：registeredCommit 由用例给定（合成 clone 的 HEAD），其余字段取登记形态。 */
  function syntheticCheck(registeredCommit: string): ProtocolAnchorCheck {
    return {
      id: 'panel',
      label: 'panel 评审团协议',
      registeredCommit,
      registeredSha256: '03efc005cedb33d61194b80b73f37d28dc517d762deff9f94fb3e575765569d0',
      basis: '合成 fixture 骨架口径',
    }
  }

  it('登记锚清单：两协议 + 检查项清单三行，字段来自登记处（PROTOCOL_VERSION_ANCHORS + LINT_SOURCE_ANCHOR）', () => {
    const checks = buildProtocolAnchorChecks()
    expect(checks.map((check) => check.id)).toEqual(['panel', 'deck', 'lint'])
    for (const check of checks) {
      expect(check.registeredCommit).toBe('20c49e75c9164bb592cfc299d366884ed79f9914')
      expect(check.label.length).toBeGreaterThan(0)
      expect(check.basis.length).toBeGreaterThan(0)
    }
    // 协议带骨架哈希；检查项清单移植无骨架哈希（比对基准 = commit）。
    expect(checks[0]!.registeredSha256).toMatch(/^[0-9a-f]{64}$/u)
    expect(checks[2]!.registeredSha256).toBeNull()
  })

  it('clone 探测单元（GPK1 口径）：git rev-parse --show-toplevel 退出 0 = available + HEAD；未登记 / 非 git 目录 = 不可用', () => {
    if (!ensureGitAvailable()) return
    const clone = makeSyntheticClone('doctor-probe')
    const probe = probeSourceClone(clone.dir)
    expect(probe.status).toBe('available')
    expect(probe.head).toBe(clone.secondHead)
    expect(probe.head).toMatch(/^[0-9a-f]{40}$/u)
    // macOS TMPDIR 经 /var → /private/var 符号链接：双侧 realpath 规范化后比对。
    expect(realpathSync(probe.toplevel ?? '/nonexistent')).toBe(realpathSync(clone.dir))

    // 未登记 → unregistered（不带原因外泄路径）。
    expect(probeSourceClone(null)).toMatchObject({ status: 'unregistered', head: null })
    expect(probeSourceClone('   ')).toMatchObject({ status: 'unregistered' })
    // 非 git 目录 → unavailable + 可行动原因。
    const plain = makeTempDir('doctor-probe-plain')
    const failed = probeSourceClone(plain)
    expect(failed.status).toBe('unavailable')
    expect(failed.head).toBeNull()
    expect(failed.reason).toContain('路径不是 git 仓库目录')
  })

  it('三态单元：HEAD = 登记 commit → ok（内容寻址等价）；HEAD 已变化 → drift；探测未通过 → 无法比对', () => {
    if (!ensureGitAvailable()) return
    const clone = makeSyntheticClone('doctor-tri')
    const probeNow = probeSourceClone(clone.dir)

    // ok 支路：登记 commit == 探测 HEAD（真实场景 = clone 停在登记提取 commit；合成仓以
    // 当前 HEAD 作登记值验证同一判定式——HEAD 相等即 ok，与 commit 来源无关）。
    expect(reconcileProtocolAnchor(syntheticCheck(clone.secondHead), probeNow)).toMatchObject({
      status: 'ok',
      cloneHead: clone.secondHead,
      cannotCompareReason: null,
    })

    // drift 态：登记 commit 停留在首次 HEAD（模拟提取时点锚），clone 已前进 → 正源已变化，保守判 drift。
    const drifted = reconcileProtocolAnchor(syntheticCheck(clone.firstHead), probeNow)
    expect(drifted.status).toBe('drift')
    expect(drifted.cloneHead).toBe(clone.secondHead)
    expect(drifted.cannotCompareReason).toBeNull()

    // 无法比对态：未登记 / 非 git 目录。
    expect(reconcileProtocolAnchor(syntheticCheck(clone.secondHead), probeSourceClone(null))).toMatchObject({
      status: 'cannot-compare',
      cloneHead: null,
    })
    expect(reconcileProtocolAnchor(syntheticCheck(clone.secondHead), probeSourceClone(join(clone.dir, 'nonexistent'))))
      .toMatchObject({ status: 'cannot-compare' })
  })

  it('报告级三态·无法比对（未登记）：三行无法比对 + 登记路径恢复动作 + 已知信息行', () => {
    const report = buildDoctorReport({ profileResult: miniProfileResult(), sessionCwd: null })
    expect(report).toContain('- 源码仓 clone 探测：未登记。')
    expect(report).toContain('- ⚠ panel 评审团协议：无法比对（未登记源码仓 clone 路径）。')
    expect(report).toContain('- ⚠ deck 演示稿协议：无法比对（未登记源码仓 clone 路径）。')
    expect(report).toContain('- ⚠ 反 AI 味检查项清单：无法比对（未登记源码仓 clone 路径）。')
    expect(report).toContain(DOCTOR_RECOVERY_ACTIONS.registerSourceClone)
    // 版本锚登记行（AX3：登记锚恒在场——无论 clone 状态）。
    expect(report).toContain('panel 评审团协议：登记 commit 20c49e75c9164bb592cfc299d366884ed79f9914、骨架 sha256 03efc005')
    expect(report).toContain('反 AI 味检查项清单：登记 commit 20c49e75c9164bb592cfc299d366884ed79f9914、无骨架哈希（比对基准 = commit）')
    // clone HEAD 滞后已知信息行（任务书 ⑩ 字段）。
    expect(report).toContain('clone HEAD 可能滞后于本机安装版本——ok 态以登记锚为准')
  })

  it('报告级三态·drift（合成 clone 已前进）：逐协议 drift 行 + 重新提取恢复动作', () => {
    if (!ensureGitAvailable()) return
    const clone = makeSyntheticClone('doctor-report-drift')
    const report = buildDoctorReport({ profileResult: miniProfileResult(), sessionCwd: null, sourceClonePath: clone.dir })
    expect(report).toContain(`- 源码仓 clone 探测：${clone.dir}（HEAD ${clone.secondHead}）`)
    expect(report).toContain('- ✗ panel 评审团协议：drift（clone HEAD ')
    expect(report).toContain('≠ 登记 commit 20c49e75c9164bb592cfc299d366884ed79f9914——正源已变化，登记骨架哈希不可再视为正源哈希）。')
    expect(report).toContain(DOCTOR_RECOVERY_ACTIONS.reExtractAnchor)
    expect(report).toContain('- 已知信息：clone HEAD 可能滞后于本机安装版本——ok 态以登记锚为准')
  })

  it('报告级三态·探测失败（非 git 目录登记）：无法比对行 + 失败原因', () => {
    const plain = makeTempDir('doctor-report-plain')
    const report = buildDoctorReport({ profileResult: miniProfileResult(), sessionCwd: null, sourceClonePath: plain })
    expect(report).toContain(`- 源码仓 clone 探测：${plain}（探测失败：路径不是 git 仓库目录，或 git 命令不可用）。`)
    expect(report).toContain('- ⚠ panel 评审团协议：无法比对（路径不是 git 仓库目录，或 git 命令不可用）。')
    expect(report).toContain(DOCTOR_RECOVERY_ACTIONS.registerSourceClone)
  })
})

describe('第⑪节 质量发现（report.jsonl 读侧 + 无记录降级，D10⑪/SC5/RL9）', () => {
  /** 装饰用例会话目录：经 U5 真写侧（appendQualityReportLine）落三行型记录 + 一行损坏行。 */
  async function makeSessionWithReport(label: string): Promise<string> {
    const sessionCwd = makeTempDir(label)
    await appendQualityReportLine(sessionCwd, { type: 'watcher', at: '2026-11-10T00:00:00.000Z', event: 'started' })
    await appendQualityReportLine(sessionCwd, {
      type: 'finding',
      at: '2026-11-10T00:00:01.000Z',
      path: 'src/dashboard.html',
      severity: 'P0',
      id: 'purple-gradient',
      message: 'Purple/violet gradient background detected',
      fix: 'Replace with the brand palette tokens',
      reason: 'fed-back',
    })
    await appendQualityReportLine(sessionCwd, {
      type: 'finding',
      at: '2026-11-10T00:00:02.000Z',
      path: 'src/dashboard.html',
      severity: 'P1',
      id: 'accent-overuse',
      message: 'Accent color used for more than 10% of elements',
      reason: 'p1p2',
    })
    await appendQualityReportLine(sessionCwd, { type: 'artifact', at: '2026-11-10T00:00:03.000Z', path: 'src/dashboard.html' })
    // 损坏行（追加式记录容忍半行写入——U5 读侧同款口径）。
    await appendQualityReportLine(sessionCwd, {
      type: 'finding',
      at: '2026-11-10T00:00:04.000Z',
      path: 'other.html',
      severity: 'P2',
      id: 'missing-section-anchor',
      message: 'x',
      reason: 'unrecognized-existing',
    })
    const reportFile = join(sessionCwd, '.od-quality', 'report.jsonl')
    const lines = readFileSync(reportFile, 'utf8').split('\n').filter((line) => line.trim() !== '')
    writeFileSync(reportFile, `${lines.join('\n')}\n{"type":"finding","at":"trunc`)
    return sessionCwd
  }

  it('读侧呈现：监听器状态 + 分级发现汇总与回注裁决 + 产物写盘身份记录；损坏行跳过并计数', async () => {
    const sessionCwd = await makeSessionWithReport('doctor-qf-full')
    const report = buildDoctorReport({ profileResult: miniProfileResult(), sessionCwd })
    expect(report).toContain('- 监听器状态：运行中推定（按 report.jsonl 最后一条生命周期记录：最近 started 2026-11-10T00:00:00.000Z；进程重启后未刷新，可能已停止）；累计启动 1 次 / 自毁 0 次。')
    expect(report).toContain('- 检查发现：共 3 条（P0 1 / P1 1 / P2 1）。')
    expect(report).toContain('  - [P0] purple-gradient — src/dashboard.html（已回注送达会话）：Purple/violet gradient background detected')
    expect(report).toContain('  - [P1] accent-overuse — src/dashboard.html（P1/P2 仅记录不回注）：')
    expect(report).toContain('  - [P2] missing-section-anchor — other.html（陌生既有文件只记录不回注）：')
    expect(report).toContain('- 产物写盘身份记录：1 条（快照豁免的回查数据源，D5④）。')
    expect(report).toContain('  - src/dashboard.html（2026-11-10T00:00:03.000Z）')
    expect(report).toContain('- ⚠ 1 行损坏已跳过（追加式记录容忍半行写入）。')
  })

  it('监听器自毁态：destroyed 事件带原因呈现；reason 词表七键齐备（契约锁）', async () => {
    const sessionCwd = makeTempDir('doctor-qf-destroyed')
    await appendQualityReportLine(sessionCwd, { type: 'watcher', at: '2026-11-10T01:00:00.000Z', event: 'started' })
    await appendQualityReportLine(sessionCwd, { type: 'watcher', at: '2026-11-10T01:00:05.000Z', event: 'destroyed', reason: 'watch-error' })
    const report = buildDoctorReport({ profileResult: miniProfileResult(), sessionCwd })
    expect(report).toContain('- 监听器状态：已自毁（按 report.jsonl 最后一条生命周期记录：最近 destroyed 2026-11-10T01:00:05.000Z；原因：watch-error）；累计启动 1 次 / 自毁 1 次。')

    // U5 FindingRecordReason 词表与 doctor 呈现词表逐键对账（新裁决值漏登记即红灯）。
    expect(Object.keys(FINDING_REASON_LABELS).sort()).toEqual(
      ['duplicate', 'fed-back', 'inject-error', 'limit', 'no-agent', 'p1p2', 'unrecognized-existing'].sort(),
    )
  })

  it('无记录降级（文件不存在）：报无检查记录 + 监听器未启动原因（任务书验收条款④）', () => {
    const sessionCwd = makeTempDir('doctor-qf-empty')
    const report = buildDoctorReport({ profileResult: miniProfileResult(), sessionCwd })
    expect(report).toContain(`- 本轮会话无检查记录（${join(sessionCwd, '.od-quality', 'report.jsonl')} 不存在）。`)
    expect(report).toContain('- 监听器未启动原因：质量环监听器仅随设计 preset 会话启动（agent-preset/selected 事件按 presetId 过滤）；普通会话零监听零检查（V7 零侵入形态），监听器启动即失败自毁且记录未落盘时同样表现为本形态。')
  })

  it('会话工作目录未知：第⑪节报目录未知，不抛错', () => {
    const report = buildDoctorReport({ profileResult: miniProfileResult(), sessionCwd: null })
    expect(report).toContain('- 会话工作目录未知，无法读取检查记录（不影响本报告其余各项）。')
  })
})

describe('会话工作目录探测（resolveSessionCwd 跨版本形态）', () => {
  const session = { header: { cwd: '/header/cwd' } }

  it('0.2.x：workingDirectory 服务在 → 服务值优先（get(session)）', () => {
    const ctx = { workingDirectory: { get: (s: unknown) => (s === session ? '/wd/value' : '/other') } }
    expect(resolveSessionCwd(ctx, { session })).toBe('/wd/value')
  })

  it('0.1.7：服务不存在 → 回退 session.header.cwd', () => {
    expect(resolveSessionCwd({}, { session })).toBe('/header/cwd')
    expect(resolveSessionCwd(undefined, { session })).toBe('/header/cwd')
  })

  it('都不可得 → null（材质化节报「目录未知」，不抛错）；服务 get 抛错同样回退 header', () => {
    expect(resolveSessionCwd({}, undefined)).toBeNull()
    expect(resolveSessionCwd({}, {})).toBeNull()
    expect(resolveSessionCwd({}, { session: {} })).toBeNull()
    const throwing = { workingDirectory: { get: () => { throw new Error('session not ready') } } }
    expect(resolveSessionCwd(throwing, { session })).toBe('/header/cwd')
  })
})
