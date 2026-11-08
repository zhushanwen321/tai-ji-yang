/**
 * 搜索式清单发现（设计 D3：glob 找 open-design.json + od.kind/id 内容特征校验 + roster 核验）。
 *
 * 为什么搜索而非硬编码路径：OD 资产目录是观察级依赖（UD1）且历史上发生过迁移（PR2）——
 * 漂移形态（清单不在默认相对位置）也必须可定位（验收 A6/V6）。本模块对候选资源根做
 * **深度受限**遍历（Resources 目录树大，限深是性能边界，见 MANIFEST_SEARCH_MAX_DEPTH），
 * 对每个 open-design.json 做内容特征校验（od.kind=scenario + strategy.id 含 od-next-strategy，
 * 已在 OD 0.25.1 资产原文核实），特征命中后再做 roster 核验。
 *
 * SI2 收窄：清单存在 ≠ 资产可用。特征命中的清单若声明 roster 缺件，显式失败
 * （ManifestValidationError，恢复动作「重装 OpenDesign」），绝不静默放行——残缺资产进
 * 会话就是「提示词残缺的坏会话」（公理 AX5 的探测层形态）。
 *
 * 零第三方依赖：遍历用 node:fs 手写受限 DFS，不引 glob 库（本包零 npm 运行时依赖纪律）。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import type { ManifestVersions } from '../types.js'

/**
 * 清单搜索的目录深度上限（相对资源根的目录层数）。默认装机布局为 4 层
 * （plugins/_official/scenarios/<name>/open-design.json），漂移 fixture 形态为 3 层，
 * 留 2 层迁移余量 = 6。超深的 open-design.json 不在发现范围内——这是记录在案的性能边界
 * （设计 U2 检查点），不是发现缺陷；OD 若迁移到更深位置，上调本常量并按 fixture 对账。
 */
export const MANIFEST_SEARCH_MAX_DEPTH = 6

/** 清单特征锚（设计 D3 证据：锚点已在 OD 0.25.1 资产原文核实）。 */
const MANIFEST_OD_KIND = 'scenario'
const MANIFEST_STRATEGY_ID_MARKER = 'od-next-strategy'

/** 清单文件名（搜索目标；OD Next 插件清单的唯一命名）。 */
const MANIFEST_FILENAME = 'open-design.json'

/** roster 缺件 / 清单损坏的显式失败（SI2：清单存在 ≠ 资产可用）。 */
export class ManifestValidationError extends Error {
  /** 缺失或损坏的清单文件绝对路径（doctor 逐项定位用）。 */
  readonly manifestPath: string

  constructor(message: string, manifestPath: string) {
    super(message)
    this.name = 'ManifestValidationError'
    this.manifestPath = manifestPath
  }
}

/** open-design.json 的最小消费形状（只声明本包读取的字段；非 OD schema 全量）。 */
export interface OdManifestShape {
  version?: string
  specVersion?: string
  compat?: { agentSkills?: Array<{ path?: string }> }
  od: {
    kind?: string
    scenario?: string
    strategy?: {
      id?: string
      assets?: {
        core?: { path?: string; version?: string }
        orchestration?: { path?: string; version?: string }
        taskProfiles?: Array<{
          taskType?: string
          path?: string
          resources?: Array<{ path?: string }>
        }>
        taskProfileMapping?: { path?: string }
      }
    }
    context?: { skills?: Array<{ path?: string }>; assets?: string[] }
  }
}

/** 特征校验通过的一个清单（发现层产出，画像层消费）。 */
export interface DiscoveredManifest {
  /** 该清单所属的候选资源根（发现时的输入根）。 */
  resourceRoot: string
  /** 清单文件绝对路径。 */
  manifestPath: string
  /** 清单所在场景包目录（"./assets/..." 相对路径的解析根）。 */
  scenarioRoot: string
  /** 已解析的清单内容（特征校验已通过）。 */
  manifest: OdManifestShape
  /** 清单三层版本（manifest 版本 / specVersion / 资产版本 = core.version）。 */
  versions: ManifestVersions
}

/** 单个候选资源根的发现结局。 */
export type ManifestDiscoveryResult =
  | { status: 'found'; discovered: DiscoveredManifest }
  | { status: 'not-found' }
  | { status: 'broken'; error: ManifestValidationError }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

/**
 * 内容特征校验：JSON 解析 + od.kind=scenario + strategy.id 含 od-next-strategy。
 * 不匹配（含解析失败）返回 null——调用方跳过该文件继续搜（同一资源根下可能并存其他
 * scenario 的清单，特征不匹配不是错误）。
 */
function parseStrategyManifest(manifestPath: string): OdManifestShape | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch {
    return null
  }
  if (!isRecord(parsed) || !isRecord(parsed.od)) return null
  const od = parsed.od as Record<string, unknown>
  if (od.kind !== MANIFEST_OD_KIND) return null
  const strategy = isRecord(od.strategy) ? (od.strategy as Record<string, unknown>) : undefined
  const strategyId = strategy?.['id']
  if (typeof strategyId !== 'string' || !strategyId.includes(MANIFEST_STRATEGY_ID_MARKER)) {
    return null
  }
  return parsed as unknown as OdManifestShape
}

/**
 * 收集清单声明的全部 roster 相对路径（声明面 = compat.agentSkills / od.context.skills /
 * od.context.assets / core / orchestration / taskProfiles 及其 resources / taskProfileMapping，
 * 与 OD 0.25.1 清单的三处声明面同构）。只收集「声明了的」——未声明的字段不参与 roster 核验。
 */
export function listDeclaredRosterPaths(manifest: OdManifestShape): string[] {
  const paths: string[] = []
  for (const skill of manifest.compat?.agentSkills ?? []) {
    if (typeof skill?.path === 'string') paths.push(skill.path)
  }
  const odContext = manifest.od.context
  for (const skill of odContext?.skills ?? []) {
    if (typeof skill?.path === 'string') paths.push(skill.path)
  }
  paths.push(...asStringArray(odContext?.assets))
  const assets = manifest.od.strategy?.assets
  for (const entry of [assets?.core, assets?.orchestration, assets?.taskProfileMapping]) {
    if (typeof entry?.path === 'string') paths.push(entry.path)
  }
  for (const profile of assets?.taskProfiles ?? []) {
    if (typeof profile?.path === 'string') paths.push(profile.path)
    for (const resource of profile?.resources ?? []) {
      if (typeof resource?.path === 'string') paths.push(resource.path)
    }
  }
  return paths
}

/** 清单内相对路径（"./assets/..." 形态）→ 场景包目录下的绝对路径。 */
function toScenarioAbsolute(scenarioRoot: string, relativePath: string): string {
  return join(scenarioRoot, relativePath.replace(/^\.\//, ''))
}

/**
 * roster 核验：清单声明的全部文件必须真实存在（SI2 显式失败 + 恢复动作）。
 *
 * @throws ManifestValidationError - 任一声明文件缺失；message 列出全部缺失项与恢复动作。
 */
function verifyRoster(manifestPath: string, scenarioRoot: string, manifest: OdManifestShape): void {
  const missing: string[] = []
  for (const relative of listDeclaredRosterPaths(manifest)) {
    const absolute = toScenarioAbsolute(scenarioRoot, relative)
    let exists = false
    try {
      exists = statSync(absolute).isFile()
    } catch {
      exists = false
    }
    if (!exists) missing.push(relative)
  }
  if (missing.length > 0) {
    throw new ManifestValidationError(
      `OpenDesign 资产清单声明了 ${missing.length} 个不存在的文件（${missing.join('、')}）。`
        + '清单存在但资产残缺（安装不完整或被破坏），为避免进入提示词残缺的会话已停止装配。'
        + '恢复动作：重装 OpenDesign，然后重启 DSH。',
      manifestPath,
    )
  }
}

/**
 * 深度受限遍历收集全部 open-design.json 绝对路径（不跟踪符号链接——防循环且不越出资源根）。
 */
function collectManifestFiles(resourceRoot: string): string[] {
  const found: string[] = []
  const walk = (dir: string, depth: number): void => {
    if (depth > MANIFEST_SEARCH_MAX_DEPTH) return
    let entries: ReturnType<typeof readdirSync>
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      const absolute = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(absolute, depth + 1)
      } else if (entry.isFile() && entry.name === MANIFEST_FILENAME) {
        found.push(absolute)
      }
    }
  }
  walk(resourceRoot, 0)
  return found
}

function extractVersions(manifest: OdManifestShape): ManifestVersions {
  return {
    manifestVersion: manifest.version,
    specVersion: manifest.specVersion,
    assetVersion: manifest.od.strategy?.assets?.core?.version,
  }
}

/**
 * 在一个候选资源根内搜索式发现目标清单。
 *
 * 结局语义：
 *   - found：特征命中的清单 + roster 全部在场；
 *   - not-found：资源根不存在 / 遍历不到任何 open-design.json / 只有特征不匹配的清单
 *     （该候选没有目标资产——上游据此计入「未装」方向）；
 *   - broken：特征命中的清单解析后 roster 缺件（SI2 显式失败）。
 *
 * 同一资源根下多个特征命中清单不可能（目标 scenario 唯一）；若真出现（异常形态），
 * 取路径字典序第一个，其余忽略——顺序确定即可，多命中本身由 doctor 层暴露。
 *
 * @param resourceRoot - 候选资源根绝对路径（app 的 Contents/Resources 或覆盖路径）。
 * @returns 发现结局（三态）。
 */
export function discoverManifest(resourceRoot: string): ManifestDiscoveryResult {
  let root: string
  try {
    root = resolve(resourceRoot)
    if (!statSync(root).isDirectory()) return { status: 'not-found' }
  } catch {
    return { status: 'not-found' }
  }

  const manifestFiles = collectManifestFiles(root).sort()
  let broken: ManifestValidationError | null = null
  for (const manifestPath of manifestFiles) {
    const manifest = parseStrategyManifest(manifestPath)
    if (manifest === null) continue
    const scenarioRoot = dirname(manifestPath)
    try {
      verifyRoster(manifestPath, scenarioRoot, manifest)
    } catch (error) {
      // 记录首个 broken 继续搜：同根下若还有完好的目标清单则用它；否则 broken 浮出。
      if (broken === null && error instanceof ManifestValidationError) broken = error
      continue
    }
    return {
      status: 'found',
      discovered: {
        resourceRoot: root,
        manifestPath,
        scenarioRoot,
        manifest,
        versions: extractVersions(manifest),
      },
    }
  }
  if (broken !== null) return { status: 'broken', error: broken }
  return { status: 'not-found' }
}

/** 判断绝对路径是否落在目录内（含目录自身；默认读取器防穿越的共同判定）。 */
export function isPathWithin(base: string, target: string): boolean {
  const resolvedBase = resolve(base)
  const resolvedTarget = resolve(target)
  return resolvedTarget === resolvedBase || resolvedTarget.startsWith(resolvedBase + sep)
}
