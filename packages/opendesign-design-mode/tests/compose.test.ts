/**
 * 提示词组装器单测（U3）。
 *
 * fixture：U0 共享 fixture（tests/fixtures/mini-od，默认布局形态；资产原文为 0.25.1 检出
 * 摘录）。组装链走真实管线：buildVersionProfile 定位 fixture → bundle.readRosterAsset 直读
 * → U4 改写器 → 占位符防御 → 事实块 → 路由段。
 *
 * 断言结构（任务书 U3 验收条款对账）：
 * 1. 拼接顺序与 OD 组装契约同构（core → orchestration → 事实块 → 路由段；逐字纪律抽查）
 * 2. 占位符零残留（组装产物 + 占位符替换逻辑的白名单过滤行为——RL3 断言对象）
 * 3. 路由段含八类任务档绝对路径与设计系统清单、不含排除五档路径（D6 白名单）
 * 4. media 段报缺语义在组装产物中在场（D6 ①④⑤ 抽样 + motion-design 条目级压制指令）
 * 5. 注入文本特征串全量清零（$OD_BIN / Integration 视图——RL3 的组装管线断言，
 *    fixture 含完整 D6④ 段供段锚命中；自产段由 4/5 的分组断言分别覆盖）
 * 6. 事实块形态（od-next-context 格式、结束标签转义、最小集合两字段 + deck 槽接口）
 * 7. persona 静态注册一次（found 注册 / missing 与 error 激活失败）
 */
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { composeSystemPrompt } from '../lib/compose/bundle.js'
import { renderContextFacts } from '../lib/compose/context-facts.js'
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
import { buildVersionProfile, locateOdAssets } from '../lib/locate/version-profile.js'
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
/** 路由段（本单元自产内容）——特征串清零断言的作用域。 */
const ROUTING_TEXT = composed.text.slice(routingStart)
/** 事实块段（本单元自产内容），位于注入文本与路由段之间。 */
const FACTS_TEXT = composed.text.slice(composed.text.indexOf('<od-next-context'), routingStart)
/** 注入文本（core + orchestration 的改写产物），位于组装产物开头与事实块之间。 */
const INJECTED_TEXT = composed.text.slice(0, composed.text.indexOf('<od-next-context'))

// —— 临时树：缺档降级用例（用后清理）——
const tempRoots: string[] = []
afterEach(() => {
  for (const dir of tempRoots) rmSync(dir, { recursive: true, force: true })
  tempRoots.length = 0
  vi.mocked(locateOdAssets).mockReset()
})

describe('组装顺序与 OD 组装契约同构（core → orchestration → 事实块 → 路由段）', () => {
  it('四段先后序正确（marker 索引单调递增）', () => {
    const coreAt = composed.text.indexOf('# OD Next Core System Prompt（fixture 摘录）')
    const orchAt = composed.text.indexOf('# OD Next General Orchestration（fixture 摘录）')
    const factsAt = composed.text.indexOf('<od-next-context kind="fact" name="device-frames">')
    const routingAt = routingStart
    expect(coreAt).toBeGreaterThanOrEqual(0)
    expect(orchAt).toBeGreaterThan(coreAt)
    expect(factsAt).toBeGreaterThan(orchAt)
    expect(routingAt).toBeGreaterThan(factsAt)
  })

  it('段间连接形态 = OD 组装的 sections.join 分隔（恰 3 处）', () => {
    expect((composed.text.match(/\n\n---\n\n/g) ?? []).length).toBe(3)
  })

  it('逐字纪律：core/orchestration 未被组装层重排（保留段原文在场）', () => {
    // fixture core 的保留段（D6② 素材优先级子块的收尾句）与 orchestration 的保留句逐字在场。
    expect(composed.text).toContain(
      'Every image lands as a local file or inline data URI referenced relatively;',
    )
    expect(composed.text).toContain('A task ID alone is not a delivered file.')
  })

  it('改写器在组装链内运行（D6① 替换发生且命中记录随产物返回）', () => {
    const record = composed.rewriteRecords.find(
      (entry) => entry.ruleId === 'r5-core-standalone-image-delivery',
    )
    expect(record?.hitCount).toBe(1)
    expect(record?.asset).toBe('core-system-prompt')
  })
})

describe('占位符零残留（RL3 断言对象）', () => {
  it('组装产物不含占位符字面（fixture 基线文本本无占位符）', () => {
    expect(composed.text).not.toContain('{{SKILL_CATALOG}}')
    expect(composed.text).not.toContain('{{SKILL_ROOT}}')
    expect(composed.text).not.toContain('{{')
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

describe('路由段：八类路径 + 设计系统清单 + 排除五档不进清单（D6 白名单）', () => {
  it('八类任务档绝对路径齐备（逐类断言）', () => {
    for (const id of ROUTED_TASK_PROFILES) {
      expect(ROUTING_TEXT).toContain(join(miniScenario, 'assets', 'task-profiles', `${id}.md`))
    }
  })

  it('设计系统目录清单在场（组装期扫描 mini-od/design-systems）', () => {
    expect(ROUTING_TEXT).toContain('- sample-brand')
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
    const routing = renderRoutingSegment({ scenarioRoot: scenario, designSystemNames: [] })
    expect(routing).toContain('missing from the current OpenDesign installation')
    // 其余在场条目不受影响（仍给出读取指针）。
    expect(routing).toContain(join(scenario, 'assets', 'task-profiles', 'prototype.md'))
    // 空设计系统清单的显式指引（不发明品牌）。
    expect(routing).toContain('No design-system directories were found')
  })
})

describe('media 段报缺语义在组装产物中在场（D6 抽样）', () => {
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

describe('注入文本特征串全量清零（RL3 的组装管线断言）', () => {
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
})
