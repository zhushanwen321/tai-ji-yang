import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * fixture 完整性断言（U0 验收）：两棵 fixture 树的子目录与关键文件存在性、清单样本可解析性、
 * README 索引与语义锚点。断言对象是 fixture 数据本身，不是任何产品实现——
 * 五个单测消费方（U2a locate / U3 compose / U4 rewrite / U5 materialize / U6 serve）
 * 依赖本测试锁定的锚点写作各自单测；OD 升级后的对账入口见 tests/fixtures/README.md。
 */

const thisDir = dirname(fileURLToPath(import.meta.url))
const fixturesRoot = resolve(thisDir, 'fixtures')
const e2eFixturesRoot = resolve(thisDir, 'e2e', 'fixtures')

// 迷你 OD 场景包目录（默认相对位置形态，与 OD 装机布局同构）与漂移形态清单位置。
const scenarioDir = join(fixturesRoot, 'mini-od', 'plugins', '_official', 'scenarios', 'od-next-strategy')
const driftScenarioDir = join(fixturesRoot, 'drift-od', 'upgraded', 'v2', 'od-next-strategy')

/** 清单 fixture 的最小类型（只声明断言消费的字段；非 OD schema 全量）。 */
interface FixtureResource {
  path: string
  version: string
}
interface FixtureTaskProfile {
  taskType: string
  path: string
  version: string
  rollout: string
  projectKinds: string[]
  resources?: FixtureResource[]
}
interface FixtureManifest {
  specVersion: string
  version: string
  compat?: { agentSkills?: Array<{ path: string }> }
  od: {
    kind: string
    scenario: string
    strategy: {
      id: string
      assets: {
        core: { path: string; version: string }
        orchestration: { path: string; version: string }
        taskProfiles: FixtureTaskProfile[]
        taskProfileMapping?: { path: string; version: string }
      }
    }
    context?: {
      skills?: Array<{ path: string }>
      assets?: string[]
    }
    pipeline: { stages: Array<{ id: string; atoms: string[] }> }
  }
}

function readText(absolutePath: string): string {
  return readFileSync(absolutePath, 'utf8')
}

/**
 * 归一空白后的文本：fixture 正文沿用 OD 原文的 markdown 软换行（约 80 列折行），
 * 特征段断言按语义串匹配而非物理行——跨行断开的特征串同样必须可断言。
 */
function normalized(text: string): string {
  return text.replace(/\s+/g, ' ')
}

function readManifest(absolutePath: string): FixtureManifest {
  return JSON.parse(readFileSync(absolutePath, 'utf8')) as FixtureManifest
}

/** 清单内相对路径（"./assets/..." 形态）→ 场景包目录下的绝对路径。 */
function manifestPath(scenarioRoot: string, manifestPathValue: string): string {
  return join(scenarioRoot, manifestPathValue.replace(/^\.\//, ''))
}

/** 收集清单声明的全部 roster 相对路径（compat/context/strategy 三处声明面）。 */
function declaredRosterPaths(manifest: FixtureManifest): string[] {
  const paths: string[] = []
  for (const skill of manifest.compat?.agentSkills ?? []) paths.push(skill.path)
  for (const skill of manifest.od.context?.skills ?? []) paths.push(skill.path)
  for (const asset of manifest.od.context?.assets ?? []) paths.push(asset)
  paths.push(manifest.od.strategy.assets.core.path)
  paths.push(manifest.od.strategy.assets.orchestration.path)
  for (const profile of manifest.od.strategy.assets.taskProfiles) {
    paths.push(profile.path)
    for (const resource of profile.resources ?? []) paths.push(resource.path)
  }
  const mapping = manifest.od.strategy.assets.taskProfileMapping
  if (mapping !== undefined) paths.push(mapping.path)
  return paths
}

const miniManifestPath = join(scenarioDir, 'open-design.json')
const miniManifest = readManifest(miniManifestPath)

describe('单测 fixture：mini-od 迷你资产树', () => {
  it('清单样本可 JSON 解析且身份特征齐备（od.kind=scenario、id 含 od-next-strategy）', () => {
    expect(miniManifest.od.kind).toBe('scenario')
    expect(miniManifest.od.strategy.id).toContain('od-next-strategy')
    expect(miniManifest.od.scenario).toBe('od-next-strategy-v2')
    expect(miniManifest.od.strategy.schema).toBe('open-design.bundled-strategy/v2')
  })

  it('三层版本字段齐备（manifest 版本 / specVersion / 资产版本）', () => {
    expect(miniManifest.version).toBe('3.3.8')
    expect(miniManifest.specVersion).toBe('1.0.0')
    expect(miniManifest.od.strategy.assets.core.version).toBe('3.2.0')
    expect(miniManifest.od.strategy.assets.orchestration.version).toBe('3.2.0')
  })

  it('pipeline.stages 三阶段齐备（discovery/plan/generate）', () => {
    expect(miniManifest.od.pipeline.stages.map((stage) => stage.id)).toEqual([
      'discovery',
      'plan',
      'generate',
    ])
  })

  it('taskProfiles 为 6 个 rollout=active 档，prototype 声明材质化四资源', () => {
    const profiles = miniManifest.od.strategy.assets.taskProfiles
    expect(profiles.map((profile) => profile.taskType)).toEqual([
      'prototype',
      'ppt',
      'marketing',
      'hyperframes',
      'discovery',
      'motion-design',
    ])
    for (const profile of profiles) expect(profile.rollout).toBe('active')
    const prototype = profiles.find((profile) => profile.taskType === 'prototype')
    expect(prototype).toBeDefined()
    expect(prototype?.resources?.map((resource) => resource.path)).toEqual([
      './assets/task-profiles/prototype/device-frames/iphone.html',
      './assets/task-profiles/prototype/device-frames/android.html',
      './assets/task-profiles/prototype/device-frames/neutral.html',
      './assets/task-profiles/prototype/layout.css',
    ])
    // deck 是 projectKind 字段值而非任务档名（设计 D6 命名事实）。
    const ppt = profiles.find((profile) => profile.taskType === 'ppt')
    expect(ppt?.projectKinds).toEqual(['deck'])
  })

  it('清单声明的 roster 文件全部真实存在（声明面 = compat/context/strategy 三处）', () => {
    const paths = declaredRosterPaths(miniManifest)
    expect(paths.length).toBeGreaterThan(0)
    for (const relative of paths) {
      expect(existsSync(manifestPath(scenarioDir, relative)), relative).toBe(true)
    }
  })

  it('13 个任务档文件齐备（8 路由档 + discovery + 媒体三档 + live-artifact）', () => {
    const taskProfilesDir = join(scenarioDir, 'assets', 'task-profiles')
    const expected = [
      'prototype.md',
      'ppt.md',
      'document.md',
      'marketing.md',
      'motion-design.md',
      'hyperframes.md',
      'web-clone.md',
      'webgl.md',
      'discovery.md',
      'image.md',
      'video.md',
      'audio.md',
      'live-artifact.md',
    ]
    for (const name of expected) {
      expect(existsSync(join(taskProfilesDir, name)), name).toBe(true)
    }
  })

  it('core 摘录含改写器特征段（D6 ①②⑤：反包装句 / 命令特征串 / Skill 引用 / 界面指引）', () => {
    const core = normalized(readText(join(scenarioDir, 'assets', 'core-system-prompt.md')))
    // D6 ①：独立图片交付段（反 HTML 包装指令原文）。
    expect(core).toContain('For standalone image generation, deliver the actual image file.')
    expect(core).toContain('Do not add an HTML wrapper')
    // D6 ⑤：媒体 production-step 句。
    expect(core).toContain('Source code alone is not rendered media.')
    // RL3 特征串域：媒体 stock 命令（$OD_BIN 必现于命令形态）。
    expect(core).toContain('$OD_BIN')
    expect(core).toContain('media stock-search')
    // D6 ②：fallback 段的 Skill 加载引用（随 ④ 移除的目标）。
    expect(core).toContain('od-next-media-inputs')
    // 界面指引段（RL3 Integration 特征串来源）。
    expect(core).toContain("Integration view's Skills tab")
  })

  it('orchestration 摘录含改写器特征段（D6 ③④⑤ + 两轮协议/question-form）', () => {
    const orchestration = normalized(readText(join(scenarioDir, 'assets', 'general-orchestration.md')))
    // D6 ⑤：独立媒体交付分句（RL3 抓不住、由 U4 反指令短语断言兜底的域）。
    expect(orchestration).toContain('For standalone media this is the real media file')
    // D6 ③：独立媒体反 HTML 包装句。
    expect(orchestration).toContain('Do not add an HTML wrapper')
    // D6 ④：媒体 Skill 加载段整段（命令特征串载体）。
    expect(orchestration).toContain('$OD_BIN')
    expect(orchestration).toContain('skill show od-next-media-inputs')
    // 两轮协议与表单协议标记（两轮协议单轮化 / question-form 文本化规则的处置对象）。
    expect(orchestration).toContain('<od-production-ready')
    expect(orchestration).toContain('question-form')
  })

  it('全量目录占位符只出现在 discovery 样本（设计 D6 核实锚点）', () => {
    const discovery = readText(join(scenarioDir, 'assets', 'task-profiles', 'discovery.md'))
    expect(discovery).toContain('{{SKILL_CATALOG}}')
    // 注入范围两文件（core/orchestration）不含该占位符——若出现即 fixture 摘录失真。
    const core = readText(join(scenarioDir, 'assets', 'core-system-prompt.md'))
    const orchestration = readText(join(scenarioDir, 'assets', 'general-orchestration.md'))
    expect(core).not.toContain('{{SKILL_CATALOG}}')
    expect(orchestration).not.toContain('{{SKILL_CATALOG}}')
  })

  it('设备壳四文件存在且语义要素齐备（内容槽 / 分层声明）', () => {
    const deviceFramesDir = join(scenarioDir, 'assets', 'task-profiles', 'prototype')
    const iphone = readText(join(deviceFramesDir, 'device-frames', 'iphone.html'))
    const android = readText(join(deviceFramesDir, 'device-frames', 'android.html'))
    const neutral = readText(join(deviceFramesDir, 'device-frames', 'neutral.html'))
    const layoutCss = readText(join(deviceFramesDir, 'layout.css'))
    // 三个壳共享的应用内容槽实名（产物注入点）。
    for (const [name, html] of [
      ['iphone.html', iphone],
      ['android.html', android],
      ['neutral.html', neutral],
    ] as const) {
      expect(html).toContain('.phone-content')
      expect(html.length, name).toBeGreaterThan(0)
    }
    // layout.css 的分层声明实名。
    expect(layoutCss).toContain('@layer od-layout')
    expect(layoutCss).toContain('.od-stack')
  })

  it('设计系统样本目录含 DESIGN.md 与 tokens.css（D5 直读目标形态）', () => {
    const designSystemDir = join(fixturesRoot, 'mini-od', 'design-systems', 'sample-brand')
    expect(statSync(designSystemDir).isDirectory()).toBe(true)
    const design = readText(join(designSystemDir, 'DESIGN.md'))
    const tokens = readText(join(designSystemDir, 'tokens.css'))
    expect(design).toContain('# Design System')
    expect(tokens).toContain(':root')
  })
})

describe('单测 fixture：drift-od 资产漂移形态', () => {
  const driftManifest = readManifest(join(driftScenarioDir, 'open-design.json'))

  it('清单位于非默认相对位置且可解析，身份特征与 mini-od 同源', () => {
    // 默认形态 = mini-od 的 plugins/_official/scenarios/od-next-strategy/；漂移树迁移到 upgraded/v2/。
    expect(existsSync(join(driftScenarioDir, 'open-design.json'))).toBe(true)
    expect(driftManifest.od.kind).toBe('scenario')
    expect(driftManifest.od.strategy.id).toContain('od-next-strategy')
    expect(driftManifest.od.pipeline.stages.map((stage) => stage.id)).toEqual([
      'discovery',
      'plan',
      'generate',
    ])
  })

  it('版本整体高于 mini-od（模拟 OD 升级，供版本画像断言实际版本）', () => {
    expect(driftManifest.version).toBe('3.4.0')
    expect(driftManifest.version).not.toBe(miniManifest.version)
    expect(driftManifest.od.strategy.assets.core.version).toBe('3.2.1')
    expect(driftManifest.od.strategy.assets.core.version).not.toBe(
      miniManifest.od.strategy.assets.core.version,
    )
  })

  it('漂移清单声明的 roster 文件全部存在（漂移树内自洽）', () => {
    const paths = declaredRosterPaths(driftManifest)
    expect(paths.length).toBeGreaterThan(0)
    for (const relative of paths) {
      expect(existsSync(manifestPath(driftScenarioDir, relative)), relative).toBe(true)
    }
  })
})

describe('单测 fixture：real-od 真机 2.x 措辞摘录', () => {
  // OpenDesign.app 安装版 2.0.4 的注入资产措辞（真机对账 2026-11-09）：新代规则
  // （generation=current-only）的命中域；与 mini-od（0.25.1 旧代）构成双代际对账。
  const realOdAssetsDir = join(fixturesRoot, 'real-od', 'assets')

  it('两份摘录在场且正文含 2.x 代际标记串、不含旧代协议特征串（代际探测 current 形态的 fixture 基座）', () => {
    const core = normalized(readText(join(realOdAssetsDir, 'core-system-prompt.md')))
    const orchestration = normalized(readText(join(realOdAssetsDir, 'general-orchestration.md')))
    // 2.x 代际标记（detectAssetGeneration 的 current 判据来源）。
    expect(core).toContain('the V2 machine contract specifies')
    expect(orchestration).toContain('the V2 machine contract specifies')
    // 旧代协议特征串在 2.x 资产中不存在（改写器 legacy-only 规则在此树上零命中的事实基座）。
    expect(core).not.toContain('production-ready')
    expect(orchestration).not.toContain('production-ready')
    expect(core).not.toContain('question-form')
    expect(orchestration).not.toContain('question-form')
  })

  it('core 摘录含新代规则锚段（续轮两句 / 机器契约块 / real-first 生成回退分句 / Integration 界面指引）', () => {
    const core = normalized(readText(join(realOdAssetsDir, 'core-system-prompt.md')))
    // R3 续轮两句（r3-core-planning-continuation-2x / r3-core-production-continuation-2x 的锚）。
    expect(core).toContain('Build starts only in the production continuation.')
    expect(core).toContain('after the production continuation arrives, execute exactly what was frozen.')
    // 机器契约块（r3-core-machine-contract-2x 的锚）。
    expect(core).toContain('Write them into the hidden structured blocks the V2 machine contract specifies')
    // real-first 生成回退分句（r5-core-image-generation-fallback-2x 的锚）。
    expect(core).toContain('fall back to image generation only when no suitable asset can be acquired')
    // 保留断言基座：stand-in 禁令与占位披露（不被误伤）。
    expect(core).toContain('never generate a fake stand-in for a real referent')
    expect(core).toContain('design the placeholder — never ship a gray box')
    // R2 界面指引（cross-generation，两代同形）。
    expect(core).toContain("the Integration view's Skills tab")
    expect(core).toContain('State the limitation plainly and point at the Skills tab instead.')
  })

  it('orchestration 摘录含新代规则锚段（计划停轮段 / 第 10 步契约输出 / 媒体 Skill 段 / plan_ready 输出）与保留质检禁令', () => {
    const orchestration = normalized(readText(join(realOdAssetsDir, 'general-orchestration.md')))
    // R3 计划停轮段与第 10 步（r3-orch-plan-stop-continuation-2x / r3-orch-plan-contract-emission-2x 的锚）。
    expect(orchestration).toContain('The request and clarification turns stop after this planning output.')
    expect(orchestration).toContain('Emit a strict Plan Contract and Runtime State for Open Design to parse.')
    // D6④ 2.x 段（r5-orch-media-input-skill-section-2x 的锚；命令特征串载体）。
    expect(orchestration).toContain('load the `od-next-media-inputs` Skill if its complete, still-valid body is not already in context')
    expect(orchestration).toContain('$OD_BIN')
    // plan_ready 输出两条锚。
    expect(orchestration).toContain('Emit the complete Task Profile, Full Plan, and completion standards in the hidden structured blocks')
    expect(orchestration).toContain("The Run's execution mode, production routes, and Preflight results stay in the machine contract")
    // 保留断言基座：质检禁令六条与新代交付默认句（不被误伤）。
    expect(orchestration).toContain('Screen captures, rendering, render review, or frame extraction')
    expect(orchestration).toContain('Writing the primary HTML deliverable to disk IS the delivery')
  })
})

describe('单测 fixture：artifacts 产物样本', () => {
  it('产物样本存在且以相对路径引用材质化设备壳', () => {
    const artifact = readText(join(fixturesRoot, 'artifacts', 'index.html'))
    expect(artifact).toContain('./.od-frames/neutral.html')
    expect(artifact).toContain('./.od-frames/layout.css')
  })
})

describe('e2e fixture 树完整性', () => {
  it('两棵树各有 README 索引且覆盖各自子目录', () => {
    const fixturesReadme = readText(join(fixturesRoot, 'README.md'))
    for (const dir of ['mini-od', 'drift-od', 'real-od', 'artifacts']) {
      expect(fixturesReadme).toContain(dir)
    }
    const e2eReadme = readText(join(e2eFixturesRoot, 'README.md'))
    for (const dir of ['empty-assets', 'si3-broken-manifest', 'probe-artifact', 'resume-gen1', 'resume-gen2']) {
      expect(e2eReadme).toContain(dir)
    }
  })

  it('无资产环境目录存在且为空（除保位文件外无任何资产）', () => {
    const emptyAssetsDir = join(e2eFixturesRoot, 'empty-assets')
    expect(statSync(emptyAssetsDir).isDirectory()).toBe(true)
    expect(existsSync(join(emptyAssetsDir, 'open-design.json'))).toBe(false)
  })

  it('SI3 形态：清单文件存在但损坏不可解析（「已装但探测失败」）', () => {
    const brokenManifestPath = join(e2eFixturesRoot, 'si3-broken-manifest', 'open-design.json')
    expect(existsSync(brokenManifestPath)).toBe(true)
    const broken = readFileSync(brokenManifestPath, 'utf8')
    expect(() => JSON.parse(broken)).toThrow()
    expect(existsSync(join(e2eFixturesRoot, 'si3-broken-manifest', 'README.md'))).toBe(true)
  })

  it('探针产物含三组探针与 DOM 契约节点，非产物文件带 canary 串', () => {
    const probe = readText(join(e2eFixturesRoot, 'probe-artifact', 'index.html'))
    // 探针 1：宿主 open-in-app POST open 路由（路径实名 = OPEN_IN_APP_OPEN_PATH）。
    expect(probe).toContain("'/open-in-app/open'")
    expect(probe).toContain("method: 'POST'")
    // 探针 2：伺服根内非产物文件。
    expect(probe).toContain("'./secret-note.txt'")
    // 探针 3：宿主 cookie 读取。
    expect(probe).toContain('document.cookie')
    // DOM 契约：聚合节点 + 三个独立节点。
    for (const id of ['probe-results', 'probe-open', 'probe-secret', 'probe-cookie']) {
      expect(probe).toContain(`id="${id}"`)
    }
    const secretNote = readText(join(e2eFixturesRoot, 'probe-artifact', 'secret-note.txt'))
    expect(secretNote).toContain('SECRET-NOTE-CANARY')
  })

  it('resume 两代树：版本与提示词内容的可断言差异齐备，各自 roster 自洽', () => {
    const gen1Manifest = readManifest(join(e2eFixturesRoot, 'resume-gen1', 'open-design.json'))
    const gen2Manifest = readManifest(join(e2eFixturesRoot, 'resume-gen2', 'open-design.json'))
    // 版本号差异（模拟 OD 升级）。
    expect(gen1Manifest.version).toBe('3.3.7')
    expect(gen2Manifest.version).toBe('3.3.9')
    expect(gen1Manifest.od.strategy.assets.core.version).toBe('3.2.0')
    expect(gen2Manifest.od.strategy.assets.core.version).toBe('3.2.1')
    // 身份特征同源且合法。
    for (const manifest of [gen1Manifest, gen2Manifest]) {
      expect(manifest.od.kind).toBe('scenario')
      expect(manifest.od.strategy.id).toContain('od-next-strategy')
    }
    // 内容差异：句 A（OD 原文摘录，gen1 特征）vs 句 B（升级模拟句，gen2 特征）。
    const gen1Core = normalized(readText(join(e2eFixturesRoot, 'resume-gen1', 'assets', 'core-system-prompt.md')))
    const gen2Core = normalized(readText(join(e2eFixturesRoot, 'resume-gen2', 'assets', 'core-system-prompt.md')))
    const sentenceA = 'For standalone image generation, deliver the actual image file.'
    const sentenceB = 'report the media capability gap and offer an HTML source deliverable instead.'
    expect(gen1Core).toContain(sentenceA)
    expect(gen1Core).not.toContain(sentenceB)
    expect(gen2Core).toContain(sentenceB)
    expect(gen2Core).not.toContain(sentenceA)
    // 两代树各自 roster 声明文件齐备。
    for (const [scenarioRoot, manifest] of [
      [join(e2eFixturesRoot, 'resume-gen1'), gen1Manifest],
      [join(e2eFixturesRoot, 'resume-gen2'), gen2Manifest],
    ] as const) {
      for (const relative of declaredRosterPaths(manifest)) {
        expect(existsSync(manifestPath(scenarioRoot, relative)), relative).toBe(true)
      }
    }
  })
})
