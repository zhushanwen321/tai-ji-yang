/**
 * 提示词组装器单测（V1 U3 + opendesign-assets-quality U2）。
 *
 * fixture：U0 共享 fixture（tests/fixtures/mini-od，默认布局形态；资产原文为 0.25.1 检出
 * 摘录）+ U1 资产目录 fixture（tests/fixtures/asset-catalog，真机形态摘录与缺失/损坏变体）。
 * 组装链走真实管线：buildVersionProfile 定位 fixture → bundle.readRosterAsset 直读 → U4
 * 改写器 → 占位符防御 → 事实块（含 craft 指路块）→ 路由段（含形状包清单段与 ppt 协议
 * 指针）→ 设计系统清单段。
 *
 * 断言结构（单元任务书验收条款对账）：
 * 1. 拼接顺序与 OD 组装契约同构（core → orchestration → 事实块 → 路由段 → 设计系统段
 *    → panel 协议段；逐字纪律抽查）
 * 2. 占位符零残留（组装产物 + 占位符替换逻辑的白名单过滤行为——V1 设计包 RL3 断言对象；panel
 *    槽位三标记是 D8 有意形态，单列断言）
 * 3. 路由段含八类任务档绝对路径、不含排除五档路径（V1 设计包 D6 白名单）
 * 4. media 段报缺语义在组装产物中在场（V1 设计包 D6 ①④⑤ 抽样 + motion-design 条目级压制指令）
 * 5. 注入文本特征串全量清零（$OD_BIN / Integration 视图——V1 设计包 RL3 的组装管线断言，
 *    fixture 含完整 V1 设计包 D6④ 段供段锚命中；自产段由 4/5 的分组断言分别覆盖）
 * 6. 事实块形态（od-next-context 格式、结束标签转义、最小集合两字段 + deck 槽接口）
 * 7. persona 静态注册一次（found 注册 / missing 与 error 激活失败；od-persona config
 *    两键通道 = U3b）
 * 8.（U2）craft 指路块（D1：根路径 + 消费指引；目录缺失整体省略）
 * 9.（U2）形状包清单段（D2：一行一包 + 根路径声明 + 中文项摘录 + ppt 条目协议指针）
 * 10.（U2）设计系统清单段（D3：manifest 感知 name/category + 深层文件指路）
 * 11.（U2）降级空段形态（mini-od 无三目录：craft 块省略 + 两清单段空指引，AX5）
 * 12.（U2）注入体积断言（RL7：真机组装全文行数 ≤ N，N=1700 由真机实测校准登记 runlog）
 * 13.（U3b）panel 评审团协议段（D8：段序尾部追加、缺省兜底 PANEL_PROTOCOL_DEFAULTS、
 *    panelParams 数值通道、槽位占位标记保留 + 自填指引在场）
 */
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { composeSystemPrompt } from '../lib/compose/bundle.js'
import { renderContextFacts } from '../lib/compose/context-facts.js'
import { renderDesignSystemsSegment } from '../lib/compose/design-systems.js'
import {
  SKILL_CATALOG_PLACEHOLDER,
  SKILL_ROOT_PLACEHOLDER,
  renderTaskProfileCatalog,
  replaceInjectionPlaceholders,
  taskProfilesRoot,
} from '../lib/compose/placeholders.js'
import { renderRoutingSegment } from '../lib/compose/task-routing.js'
import {
  OD_PERSONA_SECTION_NAME,
  OD_PERSONA_SECTION_ORDER_KEY,
  apply as personaApply,
  probeDiagnostic,
  type PersonaContext,
} from '../lib/persona.js'
import { buildAssetCatalog, buildDesignSystemCatalog, buildShapeTemplateCatalog } from '../lib/locate/asset-catalog.js'
import { buildVersionProfile, deriveCatalogDirs, locateOdAssets } from '../lib/locate/version-profile.js'
import {
  OD_MISSING_MESSAGE,
  OD_PROBE_FAILED_MESSAGE,
  OdProbeError,
  ROUTED_TASK_PROFILES,
  type VersionProfile,
} from '../lib/types.js'

const fixturesRoot = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures')
/** 默认布局形态的资源根（清单在 plugins/_official/scenarios/od-next-strategy/）。 */
const miniRoot = join(fixturesRoot, 'mini-od')
const miniScenario = join(miniRoot, 'plugins', '_official', 'scenarios', 'od-next-strategy')
/** 资产目录 fixture（U1）：full = 三目录齐备（真机形态摘录 + 损坏/缺席变体）。 */
const catalogFullRoot = join(fixturesRoot, 'asset-catalog', 'full')

// —— persona 测试的定位链注入点：mock locateOdAssets（readRosterAsset 等其余导出保持原样）——
vi.mock('../lib/locate/version-profile.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/locate/version-profile.js')>()
  return { ...actual, locateOdAssets: vi.fn(actual.locateOdAssets) }
})

function fixtureProfile(): VersionProfile {
  const result = buildVersionProfile([{ resourceRoot: miniRoot, channel: 'stable' }])
  expect(result.status).toBe('found')
  if (result.status !== 'found') throw new Error('unreachable: fixture 画像必为 found')
  return result.profile
}

const profile = fixtureProfile()
const composed = composeSystemPrompt({ profile })
const routingStart = composed.text.indexOf('## Task routing (design mode)')
const designSystemsStart = composed.text.indexOf('### Design systems installed on this machine')
/** panel 协议段锚（U3b 编排区尾段；设计系统段切片的下界）。 */
const panelStart = composed.text.indexOf('[Panel jury protocol — DSH session form]')
/** 路由段（本单元自产内容，U2 起不含设计系统清单节）——特征串清零断言的作用域。 */
const ROUTING_TEXT = composed.text.slice(routingStart, designSystemsStart)
/** 设计系统清单段（本单元自产内容，独立注入段；U3b 起 panel 段在其后，切片止于段锚）。 */
const DESIGN_SYSTEMS_TEXT = composed.text.slice(designSystemsStart, panelStart)
/** 事实块段（本单元自产内容），位于注入文本与路由段之间。 */
const FACTS_TEXT = composed.text.slice(composed.text.indexOf('<od-next-context'), routingStart)
/** 注入文本（core + orchestration 的改写产物），位于组装产物开头与事实块之间。 */
const INJECTED_TEXT = composed.text.slice(0, composed.text.indexOf('<od-next-context'))
/** U1 资产目录 fixture 的完整摘要（形状包 / 设计系统清单段断言的输入）。 */
const catalogFull = buildAssetCatalog(deriveCatalogDirs(catalogFullRoot))
/** 真机 OD 资产根（对账锚，同 locate.test.ts；impl-plan 风险表「包计数漂移」行与设计包 UD2/AS9 登记：OD 升级后复跑对账）。 */
const realAssetRoot = '/Applications/Open Design.app/Contents/Resources/open-design'
const hasRealAssetRoot = existsSync(realAssetRoot)
/** RL7 体积断言基准：真机 2.0.4 实测 1421 行（2026-11-10 复测，构成 = 非 panel 段 1266 + panel 段常量 155；U2 登记基线 1263 与实测非 panel 段差 3 行——段分隔 4→5 占 1 行（U3b runlog 登记），其余 2 行为 U2/U3b 间自产段微调、未逐行归因），+19% 余量容纳 OD 升级包数增长（runlog 登记；panel 段为派生常量不占漂移余量）。 */
const RL7_MAX_TOTAL_LINES = 1700

// —— 临时树：缺档降级用例（用后清理）——
const tempRoots: string[] = []
afterEach(() => {
  for (const dir of tempRoots) rmSync(dir, { recursive: true, force: true })
  tempRoots.length = 0
  vi.mocked(locateOdAssets).mockReset()
})

describe('组装顺序与 OD 组装契约同构（core → orchestration → 事实块 → 路由段 → 设计系统段 → panel 协议段）', () => {
  it('六段先后序正确（marker 索引单调递增；panel 段 = U3b 编排区尾部追加）', () => {
    const coreAt = composed.text.indexOf('# OD Next Core System Prompt（fixture 摘录）')
    const orchAt = composed.text.indexOf('# OD Next General Orchestration（fixture 摘录）')
    const factsAt = composed.text.indexOf('<od-next-context kind="fact" name="device-frames">')
    const routingAt = routingStart
    const designSystemsAt = designSystemsStart
    const panelAt = composed.text.indexOf('[Panel jury protocol — DSH session form]')
    expect(coreAt).toBeGreaterThanOrEqual(0)
    expect(orchAt).toBeGreaterThan(coreAt)
    expect(factsAt).toBeGreaterThan(orchAt)
    expect(routingAt).toBeGreaterThan(factsAt)
    expect(designSystemsAt).toBeGreaterThan(routingAt)
    expect(panelAt).toBeGreaterThan(designSystemsAt)
  })

  it('段间连接形态 = OD 组装的 sections.join 分隔（恰 5 处）', () => {
    expect((composed.text.match(/\n\n---\n\n/g) ?? []).length).toBe(5)
  })

  it('逐字纪律：core/orchestration 未被组装层重排（保留段原文在场）', () => {
    // fixture core 的保留段（V1 设计包 D6② 素材优先级子块的收尾句）与 orchestration 的保留句逐字在场。
    expect(composed.text).toContain(
      'Every image lands as a local file or inline data URI referenced relatively;',
    )
    expect(composed.text).toContain('A task ID alone is not a delivered file.')
  })

  it('改写器在组装链内运行（V1 设计包 D6① 替换发生且命中记录随产物返回）', () => {
    const record = composed.rewriteRecords.find(
      (entry) => entry.ruleId === 'r5-core-standalone-image-delivery',
    )
    expect(record?.hitCount).toBe(1)
    expect(record?.asset).toBe('core-system-prompt')
  })
})

describe('占位符零残留（V1 设计包 RL3 断言对象；panel 槽位标记是 D8 有意形态，单列断言）', () => {
  it('组装产物不含 OD 注入资产占位符字面（SKILL_CATALOG / SKILL_ROOT，全文域）', () => {
    expect(composed.text).not.toContain('{{SKILL_CATALOG}}')
    expect(composed.text).not.toContain('{{SKILL_ROOT}}')
  })

  it('注入资产域泛化 {{ 清零（V1 设计包 RL3 防御域 = core/orchestration 改写产物）', () => {
    expect(INJECTED_TEXT).not.toContain('{{')
  })

  it('全文 {{ 字面清零（宿主 system-prompt 装配器对注入文本跑变量插值：任何 {{...}} 残留都 fail-fast——U7 真机缺陷修复后，panel 槽位以 [[token]] 形态保留）', () => {
    const tokens = [...new Set(composed.text.match(/\{\{[^{}]*\}\}/g) ?? [])]
    expect(tokens).toEqual([])
  })

  it('替换逻辑：占位符文本经白名单过滤渲染（OD 升级防御行为）', () => {
    const rendered = replaceInjectionPlaceholders(
      `catalog:\n${SKILL_CATALOG_PLACEHOLDER}\nroot: ${SKILL_ROOT_PLACEHOLDER}`,
      miniScenario,
    )
    // 八类档各一行读取指针，形态对齐 OD renderDeliverableSkillCatalog 的 Read 指针。
    const readLines = rendered.split('\n').filter((line) => line.startsWith('- '))
    expect(readLines).toHaveLength(ROUTED_TASK_PROFILES.length)
    for (const id of ROUTED_TASK_PROFILES) {
      expect(rendered).toContain(`- ${id}: Read ${join(miniScenario, 'assets', 'task-profiles', `${id}.md`)}`)
    }
    // {{SKILL_ROOT}} → 任务档目录绝对路径。
    expect(rendered).toContain(taskProfilesRoot(miniScenario))
    expect(taskProfilesRoot(miniScenario)).toBe(join(miniScenario, 'assets', 'task-profiles'))
    // 替换后零残留。
    expect(rendered).not.toContain('{{')
  })

  it('白名单过滤：媒体三档与 discovery/live-artifact 不进渲染源（与路由过滤同一函数）', () => {
    const catalog = renderTaskProfileCatalog(miniScenario)
    for (const excluded of ['image.md', 'video.md', 'audio.md', 'discovery.md', 'live-artifact.md']) {
      expect(catalog).not.toContain(excluded)
    }
  })

  it('无占位符文本原样返回（V1 基线 no-op 形态）', () => {
    const sample = 'plain injection text without placeholders'
    expect(replaceInjectionPlaceholders(sample, miniScenario)).toBe(sample)
  })
})

describe('路由段：八类路径 + 排除五档不进清单（V1 设计包 D6 白名单）', () => {
  it('八类任务档绝对路径齐备（逐类断言）', () => {
    for (const id of ROUTED_TASK_PROFILES) {
      expect(ROUTING_TEXT).toContain(join(miniScenario, 'assets', 'task-profiles', `${id}.md`))
    }
  })

  it('路由段不含设计系统清单节（U2 起迁移为独立段，见设计系统段组断言）', () => {
    expect(ROUTING_TEXT).not.toContain('### Design systems installed on this machine')
  })

  it('排除五档路径不进清单（媒体三档 + discovery + live-artifact）', () => {
    for (const excluded of ['image.md', 'video.md', 'audio.md', 'discovery.md', 'live-artifact.md']) {
      expect(ROUTING_TEXT).not.toContain(excluded)
    }
  })

  it('首轮选择引导 + 选定自读 + 会话内切换三项指令在场', () => {
    expect(ROUTING_TEXT).toContain('plain\n  numbered text question')
    expect(ROUTING_TEXT).toContain('Read the chosen task profile file in full')
    expect(ROUTING_TEXT).toContain('switch task kinds within this session')
  })

  it('motion-design 条目附成片报缺指令，措辞不含宿主特征串', () => {
    expect(ROUTING_TEXT).toContain('final-cut MP4 rendering and every media CLI command')
    expect(ROUTING_TEXT).toContain('deliver\n   the source alone')
    expect(ROUTING_TEXT).not.toContain('$OD_BIN')
    expect(ROUTING_TEXT).not.toContain('$OD_NODE_BIN')
    expect(ROUTING_TEXT).not.toContain('$OD_WORKSPACE')
    expect(ROUTING_TEXT).not.toContain('{{')
  })

  it('缺档降级：任务档文件缺失的条目显式报缺，不指向死路径（AX5，临时树构造）', () => {
    const dir = mkdtempSync(join(resolve(process.env.TMPDIR ?? '/tmp'), 'od-compose-missing-'))
    tempRoots.push(dir)
    const scenario = join(dir, 'od-next-strategy')
    cpSync(miniScenario, scenario, { recursive: true })
    rmSync(join(scenario, 'assets', 'task-profiles', 'document.md'))
    const routing = renderRoutingSegment({ scenarioRoot: scenario, shapeTemplates: catalogFull.shapeTemplates })
    expect(routing).toContain('missing from the current OpenDesign installation')
    // 其余在场条目不受影响（仍给出读取指针）。
    expect(routing).toContain(join(scenario, 'assets', 'task-profiles', 'prototype.md'))
  })
})

describe('media 段报缺语义在组装产物中在场（V1 设计包 D6 抽样）', () => {
  it('D6① core 独立图片交付段替换语义在场', () => {
    expect(composed.text).toContain('Design mode V1 has no image, video, or audio production pipeline')
    expect(composed.text).not.toContain('deliver the actual image file')
  })

  it('D6⑤a core 媒体 production-step 句反转为源码即交付物', () => {
    expect(composed.text).toContain('source code is the deliverable for motion and media-adjacent work')
    expect(composed.text).not.toContain('Source code alone is not rendered media')
  })

  it('D6④ orchestration Media input Skill 段整段报缺化（段锚在 fixture 上命中）', () => {
    const record = composed.rewriteRecords.find(
      (entry) => entry.ruleId === 'r5-orch-media-input-skill-section',
    )
    expect(record?.hitCount).toBe(1)
    expect(record?.asset).toBe('general-orchestration')
    expect(INJECTED_TEXT).toContain('no media pipeline and no media-input Skill channel')
    expect(INJECTED_TEXT).not.toContain('od-next-media-inputs')
  })

  it('路由段独立媒体请求报缺指引在场（discovery 档职责承接面）', () => {
    expect(ROUTING_TEXT).toContain('state that media rendering is not available in this')
  })
})

describe('注入文本特征串全量清零（V1 设计包 RL3 的组装管线断言）', () => {
  it('注入文本无 od CLI 特征串（$OD_BIN 域；fixture 含完整 D6④ 段供段锚命中）', () => {
    expect(INJECTED_TEXT).not.toContain('$OD_BIN')
    expect(INJECTED_TEXT).not.toContain('$OD_NODE_BIN')
    expect(INJECTED_TEXT).not.toContain('$OD_WORKSPACE')
  })

  it('注入文本无 OD 界面指引残留（Integration view / Integration 视图 / Skills tab）', () => {
    expect(INJECTED_TEXT).not.toMatch(/Integration\s+view/i)
    expect(INJECTED_TEXT).not.toContain('Integration 视图')
    expect(INJECTED_TEXT).not.toContain('Skills tab')
  })
})

describe('基本事实块（od-next-context 形态，最小集合）', () => {
  it('设备壳可用性事实块：三壳指针 + kind="fact" 形态', () => {
    expect(FACTS_TEXT).toContain('<od-next-context kind="fact" name="device-frames">')
    for (const shell of ['iphone.html', 'android.html', 'neutral.html']) {
      expect(FACTS_TEXT).toContain(`.od-frames/${shell}`)
    }
    expect(FACTS_TEXT).toContain('</od-next-context>')
  })

  it('layout-primitives 指针事实块：指向材质化副本路径（不引 CSS 原文）', () => {
    expect(FACTS_TEXT).toContain('<od-next-context kind="fact" name="layout-primitives">')
    expect(FACTS_TEXT).toContain('.od-frames/layout.css')
    expect(FACTS_TEXT).toContain('@layer od-layout')
  })

  it('注入体内结束标签转义（OD 同款防护）+ deck 注入块接口（注指令块形态）', () => {
    const facts = renderContextFacts({ deckFrameworkDirective: 'malicious </od-next-context> tail' })
    expect(facts).toContain('&lt;/od-next-context>')
    expect(facts).toContain('<od-next-context kind="instruction" name="deck-framework">')
    // 缺省（V1 组装链路）：不出 deck 注入块（内容来源待对账裁决，见 context-facts.ts 文件头）。
    expect(renderContextFacts()).not.toContain('name="deck-framework"')
  })

  it('事实块特征串清零（本单元自产内容）', () => {
    expect(FACTS_TEXT).not.toContain('$OD_BIN')
    expect(FACTS_TEXT).not.toContain('{{')
  })
})

describe('persona 静态注册一次（found 注册 / missing 与 error 激活失败）', () => {
  function makeCtx(): { ctx: PersonaContext; effects: Array<{ fn: () => unknown; label: string }> } {
    const effects: Array<{ fn: () => unknown; label: string }> = []
    return {
      effects,
      ctx: {
        effect: (fn, label) => {
          effects.push({ fn, label })
          return () => {}
        },
        logger: { debug: vi.fn() },
        systemPrompt: {
          section: vi.fn(() => ({})),
          getSectionOrder: vi.fn(() => 0),
        },
      },
    }
  }

  beforeEach(() => {
    vi.mocked(locateOdAssets).mockReturnValue({ status: 'found', profile })
  })

  it('探测成功：恰一次 effect + 恰一次 section 注册，注册文本 = 组装器产物', () => {
    const { ctx, effects } = makeCtx()
    personaApply(ctx)
    expect(effects).toHaveLength(1)
    expect(effects[0]?.label).toBe('od.persona')
    const section = ctx.systemPrompt.section as ReturnType<typeof vi.fn>
    section.mockClear()
    effects[0]?.fn()
    expect(section).toHaveBeenCalledTimes(1)
    const arg = section.mock.calls[0]?.[0] as { name: string; order: number; text: string }
    expect(arg.name).toBe(OD_PERSONA_SECTION_NAME)
    expect(arg.name).toBe('deployment:persona-prefix')
    expect(arg.order).toBe(0)
    expect(ctx.systemPrompt.getSectionOrder).toHaveBeenCalledWith(OD_PERSONA_SECTION_ORDER_KEY)
    expect(arg.text).toBe(composed.text)
  })

  it('未装形态（missing）：以未安装诊断激活失败，不注册任何 section', () => {
    vi.mocked(locateOdAssets).mockReturnValue({ status: 'missing' })
    const { ctx, effects } = makeCtx()
    expect(() => personaApply(ctx)).toThrow(OdProbeError)
    expect(() => personaApply(ctx)).toThrow(OD_MISSING_MESSAGE)
    expect(effects).toHaveLength(0)
  })

  it('探测失败形态（error）：以重启重试诊断激活失败，错误信息携带原因', () => {
    vi.mocked(locateOdAssets).mockReturnValue({ status: 'error', reason: 'fixture 注入的探测错误' })
    const { ctx, effects } = makeCtx()
    expect(() => personaApply(ctx)).toThrow(OdProbeError)
    try {
      personaApply(ctx)
    } catch (error) {
      expect((error as Error).message).toContain(OD_PROBE_FAILED_MESSAGE)
      expect((error as Error).message).toContain('fixture 注入的探测错误')
    }
    expect(effects).toHaveLength(0)
  })

  it('诊断文案翻译：found 无文案、missing 未安装文案、error 重试文案', () => {
    expect(probeDiagnostic({ status: 'found', resourceRoot: '/x' })).toBeUndefined()
    expect(probeDiagnostic({ status: 'missing' })).toBe(OD_MISSING_MESSAGE)
    expect(probeDiagnostic({ status: 'error', reason: 'boom' })).toContain('boom')
  })

  it('od-persona config 两键进组装产物（U3b：panelScoreThreshold / panelMaxRounds 通道）', () => {
    const { ctx, effects } = makeCtx()
    personaApply(ctx, { panelScoreThreshold: 9.5, panelMaxRounds: 5 })
    effects[0]?.fn()
    const section = ctx.systemPrompt.section as ReturnType<typeof vi.fn>
    const arg = section.mock.calls[0]?.[0] as { text: string }
    expect(arg.text).toContain('threshold="9.5"')
    expect(arg.text).toContain('maxRounds="5"')
  })
})

// ── opendesign-assets-quality U2：craft 指路块 / 形状包清单段 / ppt 协议指针 / 设计系统段 ──

describe('craft 指路块（D1 指路自读形态，U2）', () => {
  it('craftRoot 传入：fact 块形态 = 根绝对路径 + craft.requires 逐册自读指引', () => {
    const craftRoot = join(catalogFullRoot, 'craft')
    const facts = renderContextFacts({ craftRoot })
    expect(facts).toContain('<od-next-context kind="fact" name="craft">')
    expect(facts).toContain(`"root":"${craftRoot}"`)
    expect(facts).toContain('craft.requires')
    expect(facts).toContain('root/<slug>.md')
    expect(facts).toContain('</od-next-context>')
  })

  it('craftRoot 缺省 / null / 空串：指路块整体省略（AX5 显式降级，D1）', () => {
    expect(renderContextFacts()).not.toContain('name="craft"')
    expect(renderContextFacts({ craftRoot: null })).not.toContain('name="craft"')
    expect(renderContextFacts({ craftRoot: '' })).not.toContain('name="craft"')
  })

  it('组装链降级：mini-od 无 craft/ 目录 → 组装产物不含 craft 块（验收条款②）', () => {
    expect(FACTS_TEXT).not.toContain('name="craft"')
  })
})

describe('形状包清单段（D2 一行一包，U2）', () => {
  const routing = renderRoutingSegment({ scenarioRoot: miniScenario, shapeTemplates: catalogFull.shapeTemplates })

  it('段首声明 design-templates 根路径与目录名映射（验收条款①根路径声明在句）', () => {
    expect(routing).toContain('### Shape templates (design-templates)')
    expect(routing).toContain(`root: \`${catalogFull.shapeTemplates.root}\``)
    expect(routing).toContain('The leading directory name of each line is the package directory under')
  })

  it('一行一包：dashboard 全字段行（目录名 + od.mode + description 首句 + 中文触发词摘录）', () => {
    expect(routing).toContain(
      '- dashboard (mode: prototype) — Admin / analytics dashboard in a single HTML file. — zh: 后台, 管理后台',
    )
  })

  it('字段缺席形态：od.mode 与中文 triggers 缺席的条目按字段省略渲染（U1 口径不计异常）', () => {
    expect(routing).toContain('- web-prototype-taste-brutalist — Swiss industrial-print web prototype.')
  })

  it('解析异常降级条目：仅目录名 + unparsed 标注（U1 降级口径的消费侧形态）', () => {
    expect(routing).toContain('- broken-skill (unparsed — match by directory name only)')
  })

  it('自读指引：brief 匹配后读 SKILL.md 全文 + example.html（无示例页跳过）', () => {
    expect(routing).toContain('read its SKILL.md in full')
    expect(routing).toContain('`example.html` in the same directory when present')
    expect(routing).toContain('templates without an example page skip it')
  })

  it('空清单降级：目录缺失 → 显式空清单指引，不发明形状库（AX5）', () => {
    const missing = buildShapeTemplateCatalog(join(catalogFullRoot, 'no-such-dir'))
    const text = renderRoutingSegment({ scenarioRoot: miniScenario, shapeTemplates: missing })
    expect(text).toContain('No shape-template packages were found')
    expect(text).not.toContain('unparsed')
  })

  it('组装链降级：mini-od 无 design-templates → 组装产物为空清单指引（验收条款②）', () => {
    expect(ROUTING_TEXT).toContain('No shape-template packages were found')
  })
})

describe('ppt 条目 deck 协议指针（D9，U2）', () => {
  it('ppt 条目附 .od-frames/deck-framework.md 协议文件指针（上游约定名，材质化铺文件自读）', () => {
    expect(ROUTING_TEXT).toContain('2. Presentation (HTML slides / deck)')
    expect(ROUTING_TEXT).toContain('.od-frames/deck-framework.md')
    expect(ROUTING_TEXT).toContain('Read\n   it with your file tools before producing slide or deck HTML')
  })

  it('指针仅挂 ppt 条目一处（不扩散到其他任务档）', () => {
    expect(ROUTING_TEXT.match(/deck-framework\.md/g)).toHaveLength(1)
  })
})

describe('设计系统清单段（D3 manifest 感知，U2）', () => {
  const dsText = renderDesignSystemsSegment(catalogFull.designSystems)

  it('manifest 感知行：目录名 — name (category) — 在场深层文件指路（airbnb 三全在场）', () => {
    expect(dsText).toContain('### Design systems installed on this machine')
    expect(dsText).toContain(
      '- airbnb — Airbnb (E-Commerce & Retail) — also read: USAGE.md, components.html, tailwind-v4.css',
    )
  })

  it('深层文件缺席形态：三文件皆缺的包无 also-read 段（按包在场列出，D3）', () => {
    expect(dsText).toContain('- plain-brand — Plain Brand (Utilities)\n')
  })

  it('解析异常降级条目：缺 category 与非法 JSON 同口径，仅目录名 + unparsed 标注（D3）', () => {
    expect(dsText).toContain('- broken-brand (unparsed — match by directory name and read the package directory directly)')
    expect(dsText).toContain('- partial-brand (unparsed — match by directory name and read the package directory directly)')
    // 降级条目不出 name/品类与深层指路（「降级仅目录名」契约，U1 deepFiles 恒 false）。
    expect(dsText).not.toContain('- broken-brand — ')
  })

  it('无 manifest 的元目录不进清单（D3：清单段分母 = 品牌包数）', () => {
    expect(dsText).not.toContain('_schema')
  })

  it('段尾品牌读取指引维持 V1 现状（DESIGN.md / tokens.css，D3）', () => {
    expect(dsText).toContain('`<design-systems-root>/<dirName>/DESIGN.md`,')
    expect(dsText).toContain('`tokens.css`, and sibling files directly with your file tools')
  })

  it('空清单降级：目录缺失 → 显式空清单指引（AX5）', () => {
    const missing = buildDesignSystemCatalog(join(catalogFullRoot, 'no-such-dir'))
    expect(renderDesignSystemsSegment(missing)).toContain('No design-system directories were found')
  })

  it('组装链降级：mini-od/design-systems 仅有无 manifest 的 sample-brand → 空清单指引（验收条款②）', () => {
    expect(DESIGN_SYSTEMS_TEXT).toContain('No design-system directories were found')
    expect(DESIGN_SYSTEMS_TEXT).not.toContain('sample-brand')
  })

  it('自产段特征串清零（本单元自产内容纪律）', () => {
    expect(DESIGN_SYSTEMS_TEXT).not.toContain('$OD_BIN')
    expect(DESIGN_SYSTEMS_TEXT).not.toContain('$OD_NODE_BIN')
    expect(DESIGN_SYSTEMS_TEXT).not.toContain('$OD_WORKSPACE')
    expect(DESIGN_SYSTEMS_TEXT).not.toContain('{{')
  })
})

// ── opendesign-assets-quality U3b：panel 评审团协议段接线（D8，编排在 bundle.ts）──

describe('panel 评审团协议段（D8 接线，U3b）', () => {
  it('组装产物含 panel 协议段：指引块先于骨架，CRITIQUE_RUN 标记在场（验收条款①）', () => {
    const guidanceAt = composed.text.indexOf('[Panel jury protocol — DSH session form]')
    const skeletonAt = composed.text.indexOf('# Critique Theater (active skill: [[skillId]])')
    expect(guidanceAt).toBeGreaterThanOrEqual(0)
    expect(skeletonAt).toBeGreaterThan(guidanceAt)
    expect(composed.text).toContain('<CRITIQUE_RUN version="1" maxRounds="3" threshold="8" scale="10">')
    expect(composed.text).toContain('<SHIP round="K" composite="N" status="shipped">')
  })

  it('缺省兜底 = PANEL_PROTOCOL_DEFAULTS 数值（阈值 8 / 轮数 3 / 刻度 10 / OD 权重行）', () => {
    expect(composed.text).toContain('maxRounds="3"')
    expect(composed.text).toContain('threshold="8"')
    expect(composed.text).toContain('scale="10"')
    expect(composed.text).toContain('up to maxRounds=3')
    expect(composed.text).toContain('composite >= 8 (on a 0-10 scale)')
    expect(composed.text).toContain('weights: designer=0, critic=0.4, brand=0.2, a11y=0.2, copy=0.2')
  })

  it('config 传入形态：panelParams 数值进产物（od-persona config 的传入通道）', () => {
    const { text } = composeSystemPrompt({
      profile,
      panelParams: { scoreThreshold: 9.5, maxRounds: 5 },
    })
    expect(text).toContain('maxRounds="5"')
    expect(text).toContain('threshold="9.5"')
    expect(text).toContain('composite >= 9.5')
    // 未传的键维持缺省兜底（刻度 10），且缺省阈值形态不再在场。
    expect(text).toContain('scale="10"')
    expect(text).not.toContain('threshold="8"')
  })

  it('config 部分键形态：只传轮数时阈值维持缺省兜底', () => {
    const { text } = composeSystemPrompt({ profile, panelParams: { maxRounds: 2 } })
    expect(text).toContain('maxRounds="2"')
    expect(text).toContain('threshold="8"')
  })

  it('越界参数显式失败：接线层透传 RangeError 不吞错（fail-fast，非 AX5 降级场景）', () => {
    expect(() => composeSystemPrompt({ profile, panelParams: { maxRounds: 0 } })).toThrow(RangeError)
  })

  it('brand/skill 槽位占位标记保留（[[token]] 形态，宿主插值安全）+ 模型自填指引在场（D8 DSH 生产形态）', () => {
    expect(composed.text).toContain('# Critique Theater (active skill: [[skillId]])')
    expect(composed.text).toContain('<BRAND_SOURCE name="[[brandName]]">')
    expect(composed.text).toContain('the selected design-template directory name')
    expect(composed.text).toContain('No brand source selected for this run.')
    expect(composed.text).toContain('ship-on-write')
  })
})

describe('注入体积断言（RL7：真机实测校准，U2）', () => {
  it('真机 2.0.4 资产：组装全文行数 ≤ 1700（N 由实测 1421 校准，runlog 登记）+ 新段真机形态实锚', () => {
    if (!hasRealAssetRoot) {
      // 跳过不是静默：CI / 无 OD 机器上播报说明——体积基准与行形态锚以 runlog 实测登记为准。
      console.warn(`[skip] 真机 OD 资产根不在场（${realAssetRoot}），体积断言跳过`)
      return
    }
    const result = buildVersionProfile([{ resourceRoot: realAssetRoot, channel: 'stable' }])
    expect(result.status).toBe('found')
    if (result.status !== 'found') throw new Error('unreachable: 真机资产画像必为 found')
    const { text } = composeSystemPrompt({ profile: result.profile })
    expect(text.split('\n').length).toBeLessThanOrEqual(RL7_MAX_TOTAL_LINES)
    // 验收条款①的真机落点：中文触发词摘录 + 根路径声明 + manifest 感知行 + craft 块 + 协议指针。
    expect(text).toContain('### Shape templates (design-templates)')
    expect(text).toContain(
      '- dashboard (mode: prototype) — Admin / analytics dashboard in a single HTML file. — zh: 后台, 管理后台',
    )
    expect(text).toContain(
      '- airbnb — Airbnb (E-Commerce & Retail) — also read: USAGE.md, components.html, tailwind-v4.css',
    )
    expect(text).toContain('<od-next-context kind="fact" name="craft">')
    expect(text).toContain('.od-frames/deck-framework.md')
    // panel 协议段真机落点（U3b）：缺省数值形态在真机组装产物同样在场。
    expect(text).toContain('<CRITIQUE_RUN version="1" maxRounds="3" threshold="8" scale="10">')
  })
})
