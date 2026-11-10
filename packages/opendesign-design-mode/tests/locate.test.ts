/**
 * 资产定位器 + 清单发现 + 版本画像 + 默认读取器测试（V1 任务书 U2a）。
 *
 * fixture：V1 设计包 U0 共享 fixture（tests/fixtures/mini-od 默认布局形态、drift-od 漂移形态）；
 * 「roster 缺件」「超已知版本」「深层清单」「清单穿越声明」四种异常/边界形态在测试内
 * 以临时树构造（mkdtemp + 复制 drift-od 场景包改字段），不落 tests/fixtures/ 目录——
 * 它们是定位层行为用例，不是多单元共享的资产样本。例外：U1 资产目录 fixture
 * （tests/fixtures/asset-catalog，full + missing-dirs 两变体）登记在 tests/fixtures/
 * 且被 compose.test.ts 共享消费（清单段断言的同源输入），不适用上一句。
 *
 * 断言结构（V1 任务书验收条款对账）：
 * 1. 定位/发现/画像正确（mini-od：默认布局、三层版本、特征校验）
 * 2. 多候选选定规则：环境变量覆盖 > 渠道优先级 > 路径序（含不可用候选顺延）
 * 3. 漂移 fixture（清单非默认位置）仍可定位（V1 设计包 A6/V6 探测层）
 * 4. 未核实版本警告标记（specVersion 超已知集合 → verified=false）
 * 5. roster 缺件显式失败（V1 设计包 SI2：恢复动作「重装 OpenDesign」）
 * 6. 平台策略接口：darwin 走 macOS、其余平台空位；深度限制；默认读取器声明/穿越两道校验
 * 7. 三目录派生与资产摘要扫描（impl-plan U1：deriveCatalogDirs + buildAssetCatalog 三态
 *    降级；fixture asset-catalog/full + missing-dirs + 真机对账组——full 被 compose.test
 *    共享消费）
 * 编号口径：本文件裸编号（U/D/AX/AS/SC/RL/UD/SI/GPK 等）默认属 opendesign-assets-quality 设计包（本轮）；V1 设计包域编号带「V1 设计包 / V1·」前缀。
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { collectAssetCandidates, type LocateEnvHints } from '../lib/locate/platform.js'
import { collectMacOsCandidates } from '../lib/locate/platform-macos.js'
import {
  discoverManifest,
  listDeclaredRosterPaths,
  MANIFEST_SEARCH_MAX_DEPTH,
  ManifestValidationError,
} from '../lib/locate/manifest-discovery.js'
import {
  buildVersionProfile,
  deriveCatalogDirs,
  locateOdAssets,
  readRosterAsset,
  VERIFIED_SPEC_VERSIONS,
} from '../lib/locate/version-profile.js'
import {
  buildAssetCatalog,
  buildCraftCatalog,
  buildDesignSystemCatalog,
  buildShapeTemplateCatalog,
  parseSkillFrontmatter,
} from '../lib/locate/asset-catalog.js'
import type { OdAssetCandidate, VersionProfile } from '../lib/types.js'

const fixturesRoot = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures')
/** 默认布局形态的资源根（清单在 plugins/_official/scenarios/od-next-strategy/）。 */
const miniRoot = join(fixturesRoot, 'mini-od')
/** 漂移形态的资源根（清单在 upgraded/v2/od-next-strategy/，非默认位置）。 */
const driftRoot = join(fixturesRoot, 'drift-od')
const miniScenario = join(miniRoot, 'plugins', '_official', 'scenarios', 'od-next-strategy')
const driftScenario = join(driftRoot, 'upgraded', 'v2', 'od-next-strategy')
/** 真机清单 fixture 的资源根（real-od 默认布局形态；OpenDesign.app 安装版 2.0.4 场景包完整副本）。 */
const realOdRoot = join(fixturesRoot, 'real-od')
const realOdScenario = join(realOdRoot, 'plugins', '_official', 'scenarios', 'od-next-strategy')

// —— 临时树：异常形态构造（用后统一清理）——
const tempRoots: string[] = []
afterAll(() => {
  for (const dir of tempRoots) rmSync(dir, { recursive: true, force: true })
})

function makeTempDir(label: string): string {
  const dir = mkdtempSync(join(resolve(process.env.TMPDIR ?? '/tmp'), `od-locate-${label}-`))
  tempRoots.push(dir)
  return dir
}

/** 复制 drift-od 场景包（最小 roster：4 项声明）到临时目录，返回场景包目录。 */
function copyDriftScenario(label: string): string {
  const tree = join(makeTempDir(label), 'od-next-strategy')
  cpSync(driftScenario, tree, { recursive: true })
  return tree
}

/** 手工构造最小画像（读取器校验用例用；不走完整定位链）。 */
function manualProfile(scenarioRoot: string): VersionProfile {
  const manifestPath = join(scenarioRoot, 'open-design.json')
  return {
    resourceRoot: scenarioRoot,
    manifestPath,
    scenarioRoot,
    versions: {},
    candidates: [],
    selectedBy: '',
    verified: true,
  }
}

function expectFound(result: ReturnType<typeof buildVersionProfile>): VersionProfile {
  expect(result.status).toBe('found')
  if (result.status !== 'found') throw new Error('unreachable')
  return result.profile
}

describe('macOS 平台策略（collectMacOsCandidates）', () => {
  it('四渠道 app 存在性枚举：候选只含真实在场的 app，按渠道优先级序排列', () => {
    const appDir = makeTempDir('apps')
    // 只装两个渠道（Beta 与 Preview），断言枚举不发明不存在的渠道且顺序正确。
    for (const appName of ['Open Design Beta.app', 'Open Design Preview.app']) {
      const resources = join(appDir, appName, 'Contents', 'Resources')
      mkdirSync(resources, { recursive: true })
    }
    const candidates = collectMacOsCandidates({ env: {}, platform: 'darwin', applicationsDir: appDir })
    expect(candidates.map((candidate) => candidate.channel)).toEqual(['beta', 'preview'])
    expect(candidates[0]?.resourceRoot).toBe(join(appDir, 'Open Design Beta.app', 'Contents', 'Resources'))
    expect(candidates[1]?.resourceRoot).toBe(join(appDir, 'Open Design Preview.app', 'Contents', 'Resources'))
  })

  it('环境变量 OD_RESOURCE_ROOT 覆盖：候选恒排最前，渠道记 override，路径已 resolve', () => {
    const appDir = makeTempDir('apps-override')
    mkdirSync(join(appDir, 'Open Design.app', 'Contents', 'Resources'), { recursive: true })
    const relativeOverride = join(appDir, 'somewhere', '..', 'override-root')
    const candidates = collectMacOsCandidates({
      env: { OD_RESOURCE_ROOT: relativeOverride },
      platform: 'darwin',
      applicationsDir: appDir,
    })
    expect(candidates[0]).toEqual({ resourceRoot: resolve(relativeOverride), channel: 'override' })
    expect(candidates[1]?.channel).toBe('stable')
    expect(candidates).toHaveLength(2)
  })

  it('覆盖值为空白字符串时忽略（与 OD daemon 的 cleanOptionalPath 语义一致）', () => {
    const appDir = makeTempDir('apps-blank')
    const candidates = collectMacOsCandidates({
      env: { OD_RESOURCE_ROOT: '   ' },
      platform: 'darwin',
      applicationsDir: appDir,
    })
    expect(candidates).toHaveLength(0)
  })
})

describe('平台策略接口（collectAssetCandidates）', () => {
  it('darwin 平台走 macOS 策略（applicationsDir 注入生效，不依赖真机 /Applications）', () => {
    const appDir = makeTempDir('apps-darwin')
    mkdirSync(join(appDir, 'Open Design.app', 'Contents', 'Resources'), { recursive: true })
    const hints: LocateEnvHints = { env: {}, platform: 'darwin', applicationsDir: appDir }
    expect(collectAssetCandidates(hints)).toHaveLength(1)
  })

  it('未注册平台（win32/linux）返回空候选——V1 接口空位（V1 设计包 G7），不为空平台发明路径', () => {
    for (const platform of ['win32', 'linux'] as const) {
      expect(collectAssetCandidates({ env: {}, platform })).toEqual([])
    }
  })
})

describe('搜索式清单发现（discoverManifest）', () => {
  it('mini-od：默认布局命中，manifestPath / scenarioRoot / 三层版本正确', () => {
    const result = discoverManifest(miniRoot)
    expect(result.status).toBe('found')
    if (result.status !== 'found') return
    expect(result.discovered.manifestPath).toBe(join(miniScenario, 'open-design.json'))
    expect(result.discovered.scenarioRoot).toBe(miniScenario)
    expect(result.discovered.versions).toEqual({
      manifestVersion: '3.3.8',
      specVersion: '1.0.0',
      assetVersion: '3.2.0',
    })
  })

  it('drift-od：清单在非默认相对位置（upgraded/v2/）仍命中（V1 设计包 A6/V6 漂移形态）', () => {
    const result = discoverManifest(driftRoot)
    expect(result.status).toBe('found')
    if (result.status !== 'found') return
    expect(result.discovered.manifestPath).toBe(join(driftScenario, 'open-design.json'))
    expect(result.discovered.versions.manifestVersion).toBe('3.4.0')
    expect(result.discovered.versions.assetVersion).toBe('3.2.1')
  })

  it('空目录与不存在路径 → not-found（未装形态，非错误）', () => {
    expect(discoverManifest(makeTempDir('empty')).status).toBe('not-found')
    expect(discoverManifest(join(makeTempDir('ghost'), 'no-such-dir')).status).toBe('not-found')
  })

  it('特征不匹配的 open-design.json（od.kind 非 scenario）→ not-found，不当目标清单', () => {
    const dir = makeTempDir('foreign')
    writeFileSync(join(dir, 'open-design.json'), JSON.stringify({ od: { kind: 'other-thing' } }))
    expect(discoverManifest(dir).status).toBe('not-found')
  })

  it('清单超深度上限不发现（限深是记录在案的性能边界，默认 4 层 + 余量 2）', () => {
    expect(MANIFEST_SEARCH_MAX_DEPTH).toBe(6)
    const deep = makeTempDir('deep')
    const plantScenario = (levels: number): void => {
      let target = deep
      for (let i = 0; i < levels; i += 1) target = join(target, `seg${i}`)
      mkdirSync(target, { recursive: true })
      cpSync(driftScenario, target, { recursive: true })
    }
    // 7 层目录：超出上限 6，不发现。
    plantScenario(MANIFEST_SEARCH_MAX_DEPTH + 1)
    expect(discoverManifest(deep).status).toBe('not-found')
    // 6 层目录（上限内）：同树命中——证明 not-found 来自限深而非其他原因。
    plantScenario(MANIFEST_SEARCH_MAX_DEPTH)
    expect(discoverManifest(deep).status).toBe('found')
  })
})

describe('roster 核验（V1 设计包 SI2：清单存在 ≠ 资产可用）', () => {
  it('清单声明文件缺失 → broken，message 带缺失路径与恢复动作「重装 OpenDesign」', () => {
    const tree = copyDriftScenario('missing')
    rmSync(join(tree, 'assets', 'core-system-prompt.md'))
    expect(existsSync(join(tree, 'open-design.json'))).toBe(true)
    const result = discoverManifest(tree)
    expect(result.status).toBe('broken')
    if (result.status !== 'broken') return
    expect(result.error).toBeInstanceOf(ManifestValidationError)
    expect(result.error.message).toContain('./assets/core-system-prompt.md')
    expect(result.error.message).toContain('重装 OpenDesign')
    expect(result.error.manifestPath).toBe(join(tree, 'open-design.json'))
  })

  it('mini-od 全部声明在场 → found（发现成功即 roster 核验已通过）', () => {
    expect(discoverManifest(miniRoot).status).toBe('found')
  })
})

describe('真机清单 fixture（real-od 安装版 2.0.4 完整副本，specVersion 实测锚定）', () => {
  // OpenDesign.app 安装版 2.0.4 真机对账（2026-11-09）：清单实测 specVersion = 1.0.0、
  // manifest version = 2.0.4、core 资产 2.2.1。本组用真机完整副本锁定定位链对真实装机
  // 形态的行为（清单发现 / 特征校验 / roster 核验 / 版本画像），而非仅覆盖迷你模拟树。
  it('清单发现：默认布局命中，特征校验通过（od.kind=scenario、strategy.id 含 od-next-strategy）', () => {
    const result = discoverManifest(realOdRoot)
    expect(result.status).toBe('found')
    if (result.status !== 'found') return
    expect(result.discovered.manifestPath).toBe(join(realOdScenario, 'open-design.json'))
    expect(result.discovered.scenarioRoot).toBe(realOdScenario)
    expect(result.discovered.manifest.od.kind).toBe('scenario')
    expect(result.discovered.manifest.od.strategy?.id).toContain('od-next-strategy')
  })

  it('roster 核验：真机清单声明的全部文件在副本内真实在场（发现 found 即核验通过）', () => {
    const manifest = JSON.parse(
      readFileSync(join(realOdScenario, 'open-design.json'), 'utf8'),
    ) as Parameters<typeof listDeclaredRosterPaths>[0]
    const declared = listDeclaredRosterPaths(manifest)
    // 真机 2.0.4 清单声明面：SKILL.md（compat/context 两处）、core/orchestration、
    // 4 个任务档（prototype 含设备壳四件 resources）、task-profile-mapping。
    for (const relative of [
      './SKILL.md',
      './assets/core-system-prompt.md',
      './assets/general-orchestration.md',
      './assets/task-profiles/prototype.md',
      './assets/task-profiles/ppt.md',
      './assets/task-profiles/marketing.md',
      './assets/task-profiles/hyperframes.md',
      './assets/task-profiles/prototype/device-frames/iphone.html',
      './assets/task-profiles/prototype/device-frames/android.html',
      './assets/task-profiles/prototype/device-frames/neutral.html',
      './assets/task-profiles/prototype/layout.css',
      './references/task-profile-mapping.md',
    ]) {
      expect(declared, relative).toContain(relative)
      expect(existsSync(join(realOdScenario, relative.replace(/^\.\//, ''))), relative).toBe(true)
    }
  })

  it('版本画像：三层版本 = 真机实测值（2.0.4 / 1.0.0 / 2.2.1），specVersion 已核实 verified=true', () => {
    const profile = expectFound(buildVersionProfile([{ resourceRoot: realOdRoot, channel: 'stable' }]))
    expect(profile.versions).toEqual({
      manifestVersion: '2.0.4',
      specVersion: '1.0.0',
      assetVersion: '2.2.1',
    })
    expect(profile.verified).toBe(true)
    expect(VERIFIED_SPEC_VERSIONS).toContain(profile.versions.specVersion)
  })
})

describe('版本画像（buildVersionProfile）与多候选选定规则', () => {
  it('单候选 mini-od：三层版本 / scenarioRoot / verified / selectedBy 齐备', () => {
    const profile = expectFound(buildVersionProfile([{ resourceRoot: miniRoot, channel: 'stable' }]))
    expect(profile.versions).toEqual({
      manifestVersion: '3.3.8',
      specVersion: '1.0.0',
      assetVersion: '3.2.0',
    })
    expect(profile.scenarioRoot).toBe(miniScenario)
    expect(profile.manifestPath).toBe(join(miniScenario, 'open-design.json'))
    expect(profile.resourceRoot).toBe(resolve(miniRoot))
    expect(profile.verified).toBe(true)
    expect(profile.selectedBy).toContain('stable')
    expect(profile.candidates).toHaveLength(1)
  })

  it('漂移候选画像报告实际版本（3.4.0 / 3.2.1）——「报告实际版本」而非写死期望', () => {
    const profile = expectFound(buildVersionProfile([{ resourceRoot: driftRoot, channel: 'beta' }]))
    expect(profile.versions.manifestVersion).toBe('3.4.0')
    expect(profile.versions.assetVersion).toBe('3.2.1')
    expect(profile.verified).toBe(true)
  })

  it('环境变量覆盖 > 渠道优先级：override 候选胜出，selectedBy 注明覆盖来源', () => {
    const profile = expectFound(
      buildVersionProfile([
        { resourceRoot: driftRoot, channel: 'beta' },
        { resourceRoot: miniRoot, channel: 'override' },
      ]),
    )
    expect(profile.resourceRoot).toBe(resolve(miniRoot))
    expect(profile.selectedBy).toContain('OD_RESOURCE_ROOT')
    // 全部候选保留在画像中（doctor「报告全部候选与选中依据」的数据源）。
    expect(profile.candidates.map((candidate) => candidate.channel)).toEqual(['override', 'beta'])
  })

  it('渠道优先级：stable 压过 beta，与输入顺序无关', () => {
    const profile = expectFound(
      buildVersionProfile([
        { resourceRoot: driftRoot, channel: 'beta' },
        { resourceRoot: miniRoot, channel: 'stable' },
      ]),
    )
    expect(profile.resourceRoot).toBe(resolve(miniRoot))
    expect(profile.selectedBy).toContain('渠道优先级')
  })

  it('路径序：同渠道多候选取路径字典序在前者，selectedBy 注明路径序', () => {
    const candidates: OdAssetCandidate[] = [
      { resourceRoot: miniRoot, channel: 'stable' },
      { resourceRoot: driftRoot, channel: 'stable' },
    ]
    const profile = expectFound(buildVersionProfile(candidates))
    // drift-od 路径字典序在 mini-od 之前（d < m）。
    expect(profile.resourceRoot).toBe(resolve(driftRoot))
    expect(profile.versions.manifestVersion).toBe('3.4.0')
    expect(profile.selectedBy).toContain('路径序')
  })

  it('不可用候选顺延：override 指向空目录时落到下一个渠道候选（可用性优先于名义优先级）', () => {
    const empty = makeTempDir('empty-override')
    const profile = expectFound(
      buildVersionProfile([
        { resourceRoot: empty, channel: 'override' },
        { resourceRoot: miniRoot, channel: 'stable' },
      ]),
    )
    expect(profile.resourceRoot).toBe(resolve(miniRoot))
    expect(profile.selectedBy).toContain('渠道优先级')
  })

  it('全部候选均无清单 → missing；broken 候选 → error（reason 含恢复动作与候选定位）', () => {
    const empty = makeTempDir('all-empty')
    expect(buildVersionProfile([{ resourceRoot: empty, channel: 'stable' }]).status).toBe('missing')
    expect(buildVersionProfile([]).status).toBe('missing')

    const brokenTree = copyDriftScenario('profile-broken')
    rmSync(join(brokenTree, 'assets', 'core-system-prompt.md'))
    const result = buildVersionProfile([{ resourceRoot: brokenTree, channel: 'stable' }])
    expect(result.status).toBe('error')
    if (result.status !== 'error') return
    expect(result.reason).toContain('重装 OpenDesign')
    expect(result.reason).toContain(brokenTree)
  })
})

describe('未核实版本警告标记（V1 设计包 UD2：doctor 对未核实版本警告）', () => {
  it('specVersion 超已知核实集合 → 画像照常产出但 verified=false', () => {
    // 已核实集合是实施期事实（OD 0.25.1 检出核实），fixture 断言锁住它的当前值防无意扩缩。
    expect(VERIFIED_SPEC_VERSIONS).toEqual(['1.0.0'])
    const tree = copyDriftScenario('unverified')
    const manifestPath = join(tree, 'open-design.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
    manifest['specVersion'] = '9.9.9'
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
    const profile = expectFound(buildVersionProfile([{ resourceRoot: dirname(tree), channel: 'preview' }]))
    expect(profile.versions.specVersion).toBe('9.9.9')
    expect(profile.verified).toBe(false)
  })
})

describe('默认读取器（readRosterAsset，V1 设计包 UD2 直连无版本分支）', () => {
  it('读清单声明的 roster 资产文本（core 与任务档），内容锚点正确', () => {
    const profile = expectFound(buildVersionProfile([{ resourceRoot: miniRoot, channel: 'stable' }]))
    const core = readRosterAsset(profile, './assets/core-system-prompt.md')
    expect(core).toContain('# OD Next Core System Prompt')
    const prototype = readRosterAsset(profile, './assets/task-profiles/prototype.md')
    expect(prototype.length).toBeGreaterThan(0)
  })

  it('未声明路径拒绝（默认读取器只读清单声明过的资产）', () => {
    const profile = expectFound(buildVersionProfile([{ resourceRoot: miniRoot, channel: 'stable' }]))
    // design-systems 在资源根但不在清单 roster 声明集合——不经读取器（V1 设计包 D5 走组装期扫描直读）。
    expect(() => readRosterAsset(profile, './design-systems/sample-brand/DESIGN.md'))
      .toThrow(ManifestValidationError)
    expect(() => readRosterAsset(profile, '../../../outside.txt')).toThrow(ManifestValidationError)
  })

  it('清单声明越出场景包的路径 → 声明校验放行、穿越校验拦截（防损坏清单外读）', () => {
    const root = makeTempDir('escape')
    const scenario = join(root, 'scenario')
    mkdirSync(scenario, { recursive: true })
    mkdirSync(join(root, 'outside'), { recursive: true })
    writeFileSync(join(root, 'outside', 'canary.txt'), 'CANARY')
    writeFileSync(join(scenario, 'open-design.json'), JSON.stringify({
      od: {
        kind: 'scenario',
        strategy: { id: 'od-next-strategy-test', assets: { core: { path: '../outside/canary.txt' } } },
      },
    }))
    const result = discoverManifest(root)
    expect(result.status).toBe('found')
    const profile = manualProfile(scenario)
    // 声明校验对 '../outside/canary.txt' 放行（在声明集合内），穿越校验拦截（越出场景包目录）。
    expect(() => readRosterAsset(profile, '../outside/canary.txt')).toThrow(/越出/)
  })

  it('清单本身损坏后读取 → ManifestValidationError 带恢复动作', () => {
    const root = makeTempDir('broken-read')
    writeFileSync(join(root, 'open-design.json'), 'not json')
    expect(() => readRosterAsset(manualProfile(root), './assets/core.md')).toThrow(ManifestValidationError)
  })
})

describe('一站式入口（locateOdAssets）', () => {
  it('darwin 注入假 app 树 → found 且画像版本来自 fixture 清单', () => {
    const appDir = makeTempDir('app-tree')
    const resources = join(appDir, 'Open Design.app', 'Contents', 'Resources')
    cpSync(miniRoot, resources, { recursive: true })
    const result = locateOdAssets({ env: {}, platform: 'darwin', applicationsDir: appDir })
    expect(result.status).toBe('found')
    if (result.status !== 'found') return
    expect(result.profile.versions.manifestVersion).toBe('3.3.8')
    expect(statSync(result.profile.manifestPath).isFile()).toBe(true)
  })

  it('未注册平台 → missing（空候选 = 未装形态，走 V1 设计包 GL5 降级）', () => {
    expect(locateOdAssets({ env: {}, platform: 'linux' }).status).toBe('missing')
  })

  it('环境变量覆盖经一站式链路生效（OD_RESOURCE_ROOT 指向 fixture 资源根）', () => {
    const result = locateOdAssets({ env: { OD_RESOURCE_ROOT: miniRoot }, platform: 'darwin' })
    expect(result.status).toBe('found')
    if (result.status !== 'found') return
    expect(result.profile.selectedBy).toContain('OD_RESOURCE_ROOT')
    expect(result.profile.versions.manifestVersion).toBe('3.3.8')
  })
})

// ── 三目录派生与资产摘要扫描（impl-plan U1；fixture：asset-catalog/full 真机形态摘录）──

/** 资产目录 fixture：full = 三目录齐备（真机形态摘录 + 损坏/缺席变体），missing-dirs = 目录缺失变体。 */
const catalogFullRoot = join(fixturesRoot, 'asset-catalog', 'full')
const catalogMissingRoot = join(fixturesRoot, 'asset-catalog', 'missing-dirs')
/** 真机 OD 资产根（对账锚；impl-plan U1 验收「真机资产根三目录探测断言（114 包计数与 s2 登记点一致）」与 V1 设计包 UD2 + opendesign-assets-quality AS9 登记：OD 升级后计数漂移时复跑对账更新登记）。 */
const realAssetRoot = '/Applications/Open Design.app/Contents/Resources/open-design'
const hasRealAssetRoot = existsSync(realAssetRoot)

describe('三目录路径派生（deriveCatalogDirs，AS8 同根直系子目录）', () => {
  it('从资源根派生 craft / design-templates / design-systems 三路径', () => {
    expect(deriveCatalogDirs('/od-root')).toEqual({
      craftRoot: join('/od-root', 'craft'),
      shapeTemplatesRoot: join('/od-root', 'design-templates'),
      designSystemsRoot: join('/od-root', 'design-systems'),
    })
  })
})

describe('资产摘要扫描·fixture 组（asset-catalog/full：真机形态摘录 + 缺失/损坏变体）', () => {
  const catalog = buildAssetCatalog(deriveCatalogDirs(catalogFullRoot))

  it('craft 册数口径：排除 README 与 FUTURE_SECTIONS 两个元文件（D10⑨），排序确定', () => {
    expect(catalog.craft.present).toBe(true)
    expect(catalog.craft.manualFiles).toEqual(['anti-ai-slop.md', 'state-coverage.md'])
    // 目录名直查形态（doctor ⑨ 册数消费同一函数）。
    expect(buildCraftCatalog(join(catalogFullRoot, 'craft')).manualFiles).toHaveLength(2)
  })

  it('形状包扫描：目录条目进清单、AGENTS.md 文件条目排除；dashboard 全字段摘要正确', () => {
    const { entries } = catalog.shapeTemplates
    // full fixture 的 design-templates 下 3 个包目录（AGENTS.md 文件被 isDirectory 过滤）。
    expect(entries.map((entry) => entry.dirName)).toEqual([
      'broken-skill',
      'dashboard',
      'web-prototype-taste-brutalist',
    ])
    const dashboard = entries.find((entry) => entry.dirName === 'dashboard')
    expect(dashboard).toMatchObject({
      degraded: false,
      name: 'dashboard',
      mode: 'prototype',
      descriptionFirstSentence: 'Admin / analytics dashboard in a single HTML file.',
      triggerKeywordsZh: ['后台', '管理后台'],
      craftRequires: ['state-coverage', 'accessibility-baseline', 'laws-of-ux'],
    })
  })

  it('降级三态之一·字段缺席（合法条目）：taste 变体包无 triggers / 无 od.mode，不计解析异常（AS9 口径）', () => {
    const taste = catalog.shapeTemplates.entries.find(
      (entry) => entry.dirName === 'web-prototype-taste-brutalist',
    )
    expect(taste).toMatchObject({
      degraded: false,
      name: 'web-prototype-taste-brutalist',
      mode: null,
      triggerKeywordsZh: [],
      craftRequires: [],
      descriptionFirstSentence: 'Swiss industrial-print web prototype.',
    })
    expect(catalog.shapeTemplates.parseErrorCount).toBe(1) // 仅 broken-skill 一条
  })

  it('降级三态之二·解析异常：frontmatter 损坏 → 条目降级仅目录名并计数', () => {
    const broken = catalog.shapeTemplates.entries.find((entry) => entry.dirName === 'broken-skill')
    expect(broken).toMatchObject({
      degraded: true,
      name: null,
      mode: null,
      descriptionFirstSentence: null,
      triggerKeywordsZh: [],
      craftRequires: [],
    })
    expect(catalog.shapeTemplates.parseErrorCount).toBe(1)
  })

  it('设计系统扫描：manifest 感知摘要 + 深层文件探测；_schema 与 README 文件排除（D3 分母口径）', () => {
    const { entries, parseErrorCount } = catalog.designSystems
    // 仅持 manifest.json 的品牌包进清单：_schema（无 manifest）与 README.md（文件）不进、不计异常。
    expect(entries.map((entry) => entry.dirName)).toEqual([
      'airbnb',
      'broken-brand',
      'partial-brand',
      'plain-brand',
    ])
    const airbnb = entries.find((entry) => entry.dirName === 'airbnb')
    expect(airbnb).toMatchObject({
      degraded: false,
      name: 'Airbnb',
      category: 'E-Commerce & Retail',
      deepFiles: { usage: true, components: true, tailwind: true },
    })
    const plain = entries.find((entry) => entry.dirName === 'plain-brand')
    expect(plain).toMatchObject({
      degraded: false,
      name: 'Plain Brand',
      category: 'Utilities',
      deepFiles: { usage: false, components: false, tailwind: false },
    })
    expect(parseErrorCount).toBe(2)
  })

  it('降级三态之三·解析异常（设计系统侧 D3 同口径）：缺 category 的合法 JSON 与非法 JSON 同计解析异常', () => {
    const { entries } = catalog.designSystems
    expect(entries.find((entry) => entry.dirName === 'partial-brand')).toMatchObject({
      degraded: true,
      name: null,
      category: null,
      deepFiles: { usage: false, components: false, tailwind: false },
    })
    expect(entries.find((entry) => entry.dirName === 'broken-brand')).toMatchObject({ degraded: true })
  })

  it('降级三态之零·目录缺失：missing-dirs 变体 → 缺席目录整体降级空清单（present=false），在场目录照常扫描（AX5）', () => {
    const missing = buildAssetCatalog(deriveCatalogDirs(catalogMissingRoot))
    expect(missing.craft).toEqual({ craftRoot: join(catalogMissingRoot, 'craft'), present: false, manualFiles: [] })
    expect(missing.designSystems).toEqual({
      root: join(catalogMissingRoot, 'design-systems'),
      present: false,
      entries: [],
      parseErrorCount: 0,
    })
    // 在场的 design-templates 照常出条目——降级只作用于缺席目录，会话不破坏。
    expect(missing.shapeTemplates.present).toBe(true)
    expect(missing.shapeTemplates.entries.map((entry) => entry.dirName)).toEqual(['dashboard'])
    expect(missing.shapeTemplates.parseErrorCount).toBe(0)
  })

  it('frontmatter 解析边界：无 frontmatter → null；同名异位键不误收（od.design_system.mode ≠ od.mode）', () => {
    expect(parseSkillFrontmatter('no frontmatter at all')).toBeNull()
    expect(parseSkillFrontmatter('---\nname: x\n')).toBeNull() // 无闭合 ---
    const misnested = parseSkillFrontmatter([
      '---',
      'name: misnested',
      'od:',
      '  design_system:',
      '    mode: decoy-value',
      '  mode: real-value',
      '---',
      '',
    ].join('\n'))
    expect(misnested?.name).toBe('misnested')
    expect(misnested?.odMode).toBe('real-value')
  })
})

describe('真机资产根三目录对账（impl-plan A1；锚 = 设计 s2 唯一登记点分层口径）', () => {
  it('本机 OD 安装在场时：114 形状包 / 152 manifest 命中 / 11 craft 册，具体包摘要与实测一致（不在场显式跳过并播报）', () => {
    if (!hasRealAssetRoot) {
      // 跳过不是静默：CI / 无 OD 机器上播报说明——行为断言已由 fixture 组完整承载，此处是真机对账。
      console.warn(`[skip] 真机 OD 资产根不在场（${realAssetRoot}），真机对账组跳过——fixture 组已覆盖全部行为断言`)
      return
    }
    const catalog = buildAssetCatalog(deriveCatalogDirs(realAssetRoot))

    // s2 唯一登记点：design-templates/ 114 个包目录（115 个 ls 条目含 AGENTS.md 文件）。
    expect(catalog.shapeTemplates.present).toBe(true)
    expect(catalog.shapeTemplates.entries).toHaveLength(114)
    // 分层口径：name/description 全员在场 → 真机零解析异常；triggers 109/114、od.mode 108/114
    // 的缺席包是字段缺席合法形态，不进该计数（AS9）。
    expect(catalog.shapeTemplates.parseErrorCount).toBe(0)
    const dashboard = catalog.shapeTemplates.entries.find((entry) => entry.dirName === 'dashboard')
    expect(dashboard).toMatchObject({
      degraded: false,
      name: 'dashboard',
      mode: 'prototype',
      descriptionFirstSentence: 'Admin / analytics dashboard in a single HTML file.',
      triggerKeywordsZh: ['后台', '管理后台'],
      craftRequires: ['state-coverage', 'accessibility-baseline', 'laws-of-ux'],
    })
    // 字段缺席形态真机复断言（taste 变体包）。
    const taste = catalog.shapeTemplates.entries.find(
      (entry) => entry.dirName === 'web-prototype-taste-brutalist',
    )
    expect(taste).toMatchObject({ degraded: false, mode: null, triggerKeywordsZh: [] })

    // s2 登记点：153 个目录排除 _schema → 152 个 manifest 命中品牌包（D3 分母口径）。
    expect(catalog.designSystems.present).toBe(true)
    expect(catalog.designSystems.entries).toHaveLength(152)
    expect(catalog.designSystems.parseErrorCount).toBe(0)
    const airbnb = catalog.designSystems.entries.find((entry) => entry.dirName === 'airbnb')
    expect(airbnb).toMatchObject({
      degraded: false,
      name: 'Airbnb',
      category: 'E-Commerce & Retail',
      deepFiles: { usage: true, components: true, tailwind: true },
    })
    // 深层文件按包可选的真机缺席形态（实测 tom-modern 无 USAGE.md）。
    const tom = catalog.designSystems.entries.find((entry) => entry.dirName === 'tom-modern')
    expect(tom).toMatchObject({ degraded: false, deepFiles: { usage: false } })

    // s2/D10⑨ 口径：craft/ 13 个 md = 11 册规则书 + 2 元文件。
    expect(catalog.craft.present).toBe(true)
    expect(catalog.craft.manualFiles).toHaveLength(11)
    expect(catalog.craft.manualFiles).toContain('anti-ai-slop.md')
    expect(catalog.craft.manualFiles).not.toContain('README.md')
    expect(catalog.craft.manualFiles).not.toContain('FUTURE_SECTIONS.md')
  })
})
