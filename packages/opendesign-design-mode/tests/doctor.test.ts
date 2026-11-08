/**
 * doctor 诊断命令测试（U2b）。
 *
 * fixture：U0 共享 fixture（tests/fixtures/mini-od 默认布局、drift-od 漂移形态）；异常形态
 * （roster 缺件 / 失配文本 / 材质化空落点）在测试内以临时树构造（复制 fixture 场景包改内容），
 * 不落 tests/fixtures/ 目录——它们是 doctor 层的行为用例。
 *
 * 断言结构（任务书验收条款对账）：
 * 1. 正常 fixture 资产根八项齐备（八个分节标题字面 = DOCTOR_SECTIONS 常量；各节内容锚点）
 * 2. 缺失项带恢复动作（未装形态 / roster 缺件 error 形态 / 材质化空落点与部分缺失形态）
 * 3. 命中清单与 apply 记录一致（doctor 第④节逐行 == 测试侧独立重放 applyRewrites 的记录行）
 * 4. 止损位触发形态构造（evaluateStopLoss 单元边界 + 失配文本 fixture 全链路「建议方案级重审」）
 * 5. 命令注册形态（apply 经假 ctx 断言 registry 契约：名字校验、definitionId、handler 返回）
 * 6. 会话工作目录探测的跨版本形态（0.2.x 服务 / 0.1.7 header.cwd / 都不可得 null）
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

import {
  apply,
  buildDoctorReport,
  DOCTOR_COMMAND_NAME,
  DOCTOR_DEFINITION_ID,
  DOCTOR_REPORT_TITLE,
  DOCTOR_RECOVERY_ACTIONS,
  DOCTOR_SECTIONS,
  doctorSectionLine,
  evaluateStopLoss,
  resolveSessionCwd,
  rewriteRecordLine,
} from '../lib/commands/doctor.js'
import { buildVersionProfile, readRosterAsset, type VersionProfileResult } from '../lib/locate/version-profile.js'
import { applyRewrites, type RewriteApplyRecord } from '../lib/rewrite/apply.js'
import { materializeAssets } from '../lib/materialize/copy.js'

const fixturesRoot = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures')
/** 默认布局形态的资源根（清单在 plugins/_official/scenarios/od-next-strategy/）。 */
const miniRoot = join(fixturesRoot, 'mini-od')
/** drift-od 的场景包（最小 roster：4 项声明，复制改字段构造异常形态）。 */
const driftScenario = join(fixturesRoot, 'drift-od', 'upgraded', 'v2', 'od-next-strategy')
const miniScenario = join(miniRoot, 'plugins', '_official', 'scenarios', 'od-next-strategy')

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

describe('正常 fixture 资产根：八项齐备（八节标题 + 各节内容锚点）', () => {
  it('mini-od + 已预铺会话目录：八节全在，各节内容正确', async () => {
    const result = miniProfileResult()
    expect(result.status).toBe('found')
    if (result.status !== 'found') return
    const profile = result.profile

    // 会话工作目录：真跑 U5 材质化（四文件落盘），doctor 第⑤节报告该落点清单。
    const sessionCwd = makeTempDir('session')
    const materialized = await materializeAssets({ manifestPath: profile.manifestPath, cwd: sessionCwd })
    expect(materialized.files).toHaveLength(4)

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

    // ⑤ 材质化状态：会话目录、落点、四管理名在场、结论。
    expect(report).toContain(`- 会话工作目录：${sessionCwd}`)
    expect(report).toContain(join(sessionCwd, '.od-frames'))
    for (const fileName of ['android.html', 'iphone.html', 'neutral.html', 'layout.css']) {
      expect(report).toContain(`✓ ${fileName}（`)
    }
    expect(report).toContain('结论：4 个管理名全部在场（写入落点清单如上）。')

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
    expect(report).toContain('材质化异常：落点目录存在但 4 个管理名全部缺失')
    expect(report).toContain(DOCTOR_RECOVERY_ACTIONS.restartDsh)
    expect(report).toContain(`【${DOCTOR_SECTIONS.materialize}】材质化异常`)
    expect(report).not.toContain('未发现异常。')
  })

  it('材质化部分缺失（D8 全量重铺语义应四文件齐备）：逐文件标记 + 异常项', () => {
    const sessionCwd = makeTempDir('partial-frames')
    mkdirSync(join(sessionCwd, '.od-frames'), { recursive: true })
    writeFileSync(join(sessionCwd, '.od-frames', 'android.html'), '<html></html>')
    const report = buildDoctorReport({ profileResult: miniProfileResult(), sessionCwd })
    expect(report).toContain('✓ android.html（')
    expect(report).toContain('材质化异常：3 个管理名缺失')
    expect(report).toContain('iphone.html、neutral.html、layout.css')
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
  it('第④节逐行 == 测试侧独立重放 applyRewrites 的记录行（28 条全对账）', () => {
    const records = replayRewriteRecords()
    // mini-od 摘录 × 规则清单 = 每规则 × 每目标资产一条记录（U4 规则清单的笛卡尔展开）。
    expect(records.length).toBe(28)
    const report = buildDoctorReport({ profileResult: miniProfileResult(), sessionCwd: null })
    for (const record of records) {
      expect(report).toContain(rewriteRecordLine(record))
    }
    // 命中统计行与重放一致。
    const hit = records.filter((record) => record.hitCount > 0).length
    expect(report).toContain(`- 规则应用记录共 ${records.length} 条（命中 ${hit} 条 / 零命中 ${records.length - hit} 条`)
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

describe('止损位状态（D9 三判据）', () => {
  /** 构造合成记录：semantic-anchor 规则 × hitCount（模拟全命中基线与失配翻转）。 */
  function syntheticRecord(id: string, hitCount: number): RewriteApplyRecord {
    const isAnchor = !id.startsWith('r1-') && !id.includes('residual')
    return {
      ruleId: id,
      ruleName: `规则 ${id}`,
      family: 'two-turn-protocol',
      asset: 'core-system-prompt',
      locator: isAnchor ? 'semantic-anchor' : 'regex',
      fragility: 'high',
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
    expect(report).toContain('⚠ 建议方案级重审：止损位判据已触发（V2 真桥接提前或改写策略重构）。')
    // 失配逐条行带规则 id / 资产 / 脆弱度（判据①的数据源 = 第④节命中清单；行形态见 renderStopLossSection）。
    expect(report).toContain('core-system-prompt，脆弱度 high）：锚未命中')
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
