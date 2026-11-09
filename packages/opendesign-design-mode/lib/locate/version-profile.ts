/**
 * 版本画像 + 默认读取器（设计 §3.1 资产层的画像与直连段；任务书 U2a 职责 4）。
 *
 * 版本画像：对候选列表逐个做清单发现（discoverManifest），按选定规则取第一个完整可用候选：
 *   环境变量覆盖（override 恒最先）> 渠道优先级（正式 > Beta > Prerelease > Preview）> 路径序。
 * 候选不可用（not-found / broken）时顺延下一候选；全部尽墨时 missing（零候选或全 not-found）
 * 与 error（存在 broken——已装但资产损坏）两形态分开，供 persona 的 SI3 区分文案消费。
 * profile.candidates 保留全部候选，doctor（U2b）报告「全部候选与选中依据」的源数据。
 *
 * 默认读取器（UD2：无适配器注册表骨架，直连）：readRosterAsset 读清单 roster 内声明的资产
 * 文本，无版本分支——V1 唯一读取路径就是它；OD 升级后的失配由 doctor 的版本警告与改写命中
 * 清单暴露（D9 止损位），不在读取层做版本分叉。
 *
 * 版本核实（UD2）：verified = 清单 specVersion ∈ VERIFIED_SPEC_VERSIONS（对 OD 0.25.1 与
 * OpenDesign.app 安装版 2.0.4 真机清单核实过的规范版本）。verified=false 不是错误——画像照常
 * 产出，doctor 对未核实版本出警告（versionProfile 在手即可与已核实版本比对告警，无需注册表）。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  OD_CHANNEL_PRIORITY,
  type OdAssetCandidate,
  type VersionProfile,
} from '../types.js'
import {
  discoverManifest,
  isPathWithin,
  listDeclaredRosterPaths,
  ManifestValidationError,
  type DiscoveredManifest,
  type OdManifestShape,
} from './manifest-discovery.js'
import { collectAssetCandidates, locateEnvHints, OD_RESOURCE_ROOT_ENV, type LocateEnvHints } from './platform.js'

/**
 * 已核实的 OD Next 规范版本（specVersion 值域）。'1.0.0' 两个真机来源核实：OD 0.25.1 真实
 * 清单（fixture $fixtureSource 注明 0.25.1 检出核实）与 OpenDesign.app 安装版 2.0.4 清单
 * 实测 specVersion = 1.0.0（2026-11-09 真机核对，tests/fixtures/real-od 完整副本锁定，
 * locate.test.ts 真机断言组守护）。OD 后续版本清单的 specVersion 若变化，真机核对通过后
 * 把新值追加于此。
 */
export const VERIFIED_SPEC_VERSIONS: readonly string[] = ['1.0.0']

/** 版本画像构建结局（三态语义与 persona 的 SI3 文案区分对齐）。 */
export type VersionProfileResult =
  | { status: 'found'; profile: VersionProfile }
  | { status: 'missing' }
  | { status: 'error'; reason: string }

/** 选定优先序键：渠道序（OD_CHANNEL_PRIORITY）为主键，路径字典序为同级 tiebreak（设计「> 路径序」）。 */
function selectionKey(candidate: OdAssetCandidate): [number, string] {
  const index = OD_CHANNEL_PRIORITY.indexOf(candidate.channel)
  return [index === -1 ? OD_CHANNEL_PRIORITY.length : index, candidate.resourceRoot]
}

/** 候选按选定优先序排列（override 恒最先；同渠道取路径字典序在前者）。 */
function sortBySelectionOrder(candidates: OdAssetCandidate[]): OdAssetCandidate[] {
  return [...candidates].sort((a, b) => {
    const [aChannel, aPath] = selectionKey(a)
    const [bChannel, bPath] = selectionKey(b)
    return aChannel !== bChannel ? aChannel - bChannel : aPath.localeCompare(bPath)
  })
}

/**
 * 选定依据的人类可读描述（doctor「多候选与选中依据」的 selectedBy 源文本）。
 * 胜出渠道只有一个候选时依据是渠道优先级；同渠道多个候选时渠道优先级分不出胜负，
 * 胜负由路径序 tiebreak 决定——依据随之变为路径序。
 */
function describeSelection(winner: OdAssetCandidate, sorted: OdAssetCandidate[]): string {
  if (winner.channel === 'override') return `环境变量 ${OD_RESOURCE_ROOT_ENV} 覆盖`
  const sameChannelCount = sorted.filter((candidate) => candidate.channel === winner.channel).length
  if (sameChannelCount > 1) return `路径序（同渠道多候选按路径排序；渠道 ${winner.channel}）`
  return `渠道优先级（${winner.channel}）`
}

/**
 * 从候选列表构建版本画像。
 *
 * @param candidates - 候选资源根列表（顺序不敏感；函数内部按选定规则排序）。
 * @returns 三态结局：found（含完整画像）/ missing（零候选或全部 not-found）/ error（存在 broken）。
 */
export function buildVersionProfile(candidates: OdAssetCandidate[]): VersionProfileResult {
  if (candidates.length === 0) return { status: 'missing' }
  const sorted = sortBySelectionOrder(candidates)
  let firstBroken: { candidate: OdAssetCandidate; error: ManifestValidationError } | null = null
  for (const candidate of sorted) {
    const result = discoverManifest(candidate.resourceRoot)
    if (result.status === 'not-found') continue
    if (result.status === 'broken') {
      if (firstBroken === null) firstBroken = { candidate, error: result.error }
      continue
    }
    const discovered: DiscoveredManifest = result.discovered
    const profile: VersionProfile = {
      resourceRoot: discovered.resourceRoot,
      manifestPath: discovered.manifestPath,
      scenarioRoot: discovered.scenarioRoot,
      versions: discovered.versions,
      candidates: sorted,
      selectedBy: describeSelection(candidate, sorted),
      verified: VERIFIED_SPEC_VERSIONS.includes(discovered.versions.specVersion ?? ''),
    }
    return { status: 'found', profile }
  }
  if (firstBroken !== null) {
    return {
      status: 'error',
      reason: `候选 ${firstBroken.candidate.resourceRoot}（渠道 ${firstBroken.candidate.channel}）资产不可用：`
        + firstBroken.error.message,
    }
  }
  return { status: 'missing' }
}

/**
 * 一站式定位：枚举当前平台候选 + 构建画像（persona 启动探测与 doctor 的主入口）。
 *
 * @param hints - 环境线索；缺省取真实进程环境（locateEnvHints）。
 */
export function locateOdAssets(hints: LocateEnvHints = locateEnvHints()): VersionProfileResult {
  return buildVersionProfile(collectAssetCandidates(hints))
}

/**
 * 资产根直系子目录三目录路径集（AS8：craft/、design-templates/、design-systems/ 与
 * plugins/ 同根——本机安装资源树实测，V1 画像的 resourceRoot 即此根）。
 */
export interface AssetCatalogDirs {
  /** craft/ 工艺手册目录绝对路径。 */
  craftRoot: string
  /** design-templates/ 形状包目录绝对路径。 */
  shapeTemplatesRoot: string
  /** design-systems/ 设计系统包目录绝对路径。 */
  designSystemsRoot: string
}

/**
 * 从资源根派生三目录路径（纯路径计算，不做存在性探测——目录是否在场由
 * asset-catalog 的各扫描函数在读取时判定并降级，AX5 存在性容错）。
 */
export function deriveCatalogDirs(resourceRoot: string): AssetCatalogDirs {
  return {
    craftRoot: join(resourceRoot, 'craft'),
    shapeTemplatesRoot: join(resourceRoot, 'design-templates'),
    designSystemsRoot: join(resourceRoot, 'design-systems'),
  }
}

/**
 * 默认读取器：读清单 roster 内声明的资产文本（UD2 直连，无版本分支）。
 *
 * 两道校验后直读：
 *   1. 声明校验——relativePath 必须在清单声明的 roster 集合内（"./" 前缀归一后比对），
 *      拒绝读清单之外任意文件；
 *   2. 防穿越——解析后的绝对路径必须落在场景包目录内。
 *
 * @param profile - 版本画像（locateOdAssets / buildVersionProfile 的 found 产物）。
 * @param relativePath - 清单内的相对路径（"./assets/core-system-prompt.md" 形态）。
 * @returns 资产文本（utf8）。
 * @throws ManifestValidationError - 路径不在清单声明集合内（含清单本身已不可解析）。
 * @throws Error - 路径穿越出场景包目录，或文件读取失败。
 */
export function readRosterAsset(profile: VersionProfile, relativePath: string): string {
  let manifest: OdManifestShape
  try {
    manifest = JSON.parse(readFileSync(profile.manifestPath, 'utf8')) as unknown as OdManifestShape
  } catch (error) {
    throw new ManifestValidationError(
      `OpenDesign 资产清单不可读取或解析失败（${profile.manifestPath}）：${error instanceof Error ? error.message : String(error)}。`
        + '恢复动作：重装 OpenDesign，然后重启 DSH。',
      profile.manifestPath,
    )
  }
  // 声明集合与请求路径做同一归一（去 "./" 前缀）后再比对——清单声明保留原文（"./assets/..."
  // 形态），读取请求两种形态都放行。
  const normalized = relativePath.replace(/^\.\//, '')
  const declared = listDeclaredRosterPaths(manifest).map((path) => path.replace(/^\.\//, ''))
  if (!declared.includes(normalized)) {
    throw new ManifestValidationError(
      `路径 "${relativePath}" 不在清单声明的 roster 集合内（${profile.manifestPath}），默认读取器只读清单声明过的资产。`,
      profile.manifestPath,
    )
  }
  const absolute = join(profile.scenarioRoot, normalized)
  if (!isPathWithin(profile.scenarioRoot, absolute)) {
    throw new Error(
      `路径 "${relativePath}" 解析后越出场景包目录（${profile.scenarioRoot}），已拒绝读取。`,
    )
  }
  return readFileSync(absolute, 'utf8')
}
