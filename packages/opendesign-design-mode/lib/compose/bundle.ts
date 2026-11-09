/**
 * 提示词组装编排（OD 组装契约的会话组装层落点；权威依据 = 设计 §3.1 / D4 / D6 + 任务书 U3 职责 1）。
 *
 * OD Next 组装契约（AS6，initial-prompt-bundle-service + strategy-package.ts:104-116 亲读核实）：
 * 注入文本 = core + orchestration 逐字原文；占位符由组装方替换；任务档支撑资源材质化落盘
 * 而非拼进提示词。本模块的组装序与其同构、任务档位唯一偏离（D4：DSH 会话任务首轮问答后才
 * 选定，任务档经路由指令段由模型自读）：
 *
 *   1. 清单读锚：从 open-design.json 取 core/orchestration 声明路径（不硬编码——资产目录
 *      属观察级依赖且历史上迁移过，PR2）；
 *   2. 默认读取器直读两文本（U2a readRosterAsset：roster 声明校验 + 防穿越）；
 *   3. 逐字拼接（verbatim 纪律：core/orchestration 原文不经本层改写，改写是 U4 改写器的
 *      职责——本层只编排与过滤），段间连接形态对齐 OD 组装（sections.join('\n\n---\n\n')）；
 *   4. U4 改写器（applyRewrites，designSystemsRoot 取资产根下 design-systems/）；
 *   5. 占位符替换（OD 升级防御，渲染白名单与路由过滤共用，见 placeholders.ts）；
 *   6. 基本事实块（context-facts.ts，最小集合）；
 *   7. 路由指令段（task-routing.ts，含组装期 design-systems/ 目录名扫描）。
 *
 * 逐字纪律的验证口：拼接发生在改写之前、占位符与事实块路由段都在拼接之后追加——任何一段
 * 的内部顺序都不经本层重排。改写命中记录随产物返回（doctor 的改写命中清单数据源）。
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { applyRewrites, type RewriteApplyRecord } from '../rewrite/apply.js'
import type { OdManifestShape } from '../locate/manifest-discovery.js'
import { readRosterAsset } from '../locate/version-profile.js'
import type { VersionProfile } from '../types.js'
import { renderContextFacts } from './context-facts.js'
import { replaceInjectionPlaceholders } from './placeholders.js'
import { renderRoutingSegment } from './task-routing.js'

/** 资产根下设计系统目录实名（D4/D5 的直读目标根；OD 装机与 fixture 布局同实名）。 */
const DESIGN_SYSTEMS_DIR = 'design-systems'

/** 注入段之间的连接形态（OD 组装 sections.join 的同款分隔）。 */
const SECTION_SEPARATOR = '\n\n---\n\n'

/** 组装源不可用（清单结构漂移 / 声明资产读不到）时抛出；message 含恢复动作（AX5）。 */
export class OdComposeSourceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OdComposeSourceError'
  }
}

/** 组装产物：完整系统提示词文本 + 改写命中记录（doctor 逐条可见性的数据源）。 */
export interface ComposedBundle {
  text: string
  rewriteRecords: RewriteApplyRecord[]
}

/** 组装入参（profile = U2a 定位链的 found 产物）。 */
export interface ComposeBundleInput {
  profile: VersionProfile
}

/**
 * 组装期扫描资产根下 design-systems/ 的目录名清单（D4：目录名即品牌标识）。
 *
 * 目录不存在（老生成代安装）返回空清单——设计系统直读是增强能力而非 roster 声明件，
 * 缺目录不是装配失败形态；路由段对空清单有显式指引（task-routing.ts）。
 */
export function scanDesignSystemNames(resourceRoot: string): string[] {
  let entries: ReturnType<typeof readdirSync>
  try {
    entries = readdirSync(join(resourceRoot, DESIGN_SYSTEMS_DIR), { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

/** 从清单取注入资产声明路径（core/orchestration 的 "./assets/..." 相对路径）。 */
function requiredInjectionAssetPath(manifest: OdManifestShape, manifestPath: string, kind: 'core' | 'orchestration'): string {
  const path = manifest.od.strategy?.assets?.[kind]?.path
  if (typeof path !== 'string' || path === '') {
    throw new OdComposeSourceError(
      `OpenDesign 资产清单结构漂移：od.strategy.assets.${kind}.path 缺失（${manifestPath}）。`
        + 'OD 升级后清单结构变化需适配本插件。恢复动作：运行 /opendesign-doctor 检查清单，'
        + '或向插件仓报告该 OD 版本的清单结构。',
    )
  }
  return path
}

/**
 * 组装完整系统提示词（persona section 的静态注册产物；会话创建时点语义由注册层承载）。
 *
 * @param input ComposeBundleInput（VersionProfile 必为 locate/build 的 found 结局）。
 * @returns 组装产物（文本 + 改写命中记录）。
 * @throws OdComposeSourceError - 清单缺注入资产声明（结构漂移，AX5 显式失败）。
 * @throws ManifestValidationError / Error - 默认读取器的声明校验与读取失败（U2a 契约）。
 */
export function composeSystemPrompt(input: ComposeBundleInput): ComposedBundle {
  const { profile } = input
  const manifest = JSON.parse(readFileSync(profile.manifestPath, 'utf8')) as OdManifestShape
  const corePath = requiredInjectionAssetPath(manifest, profile.manifestPath, 'core')
  const orchestrationPath = requiredInjectionAssetPath(manifest, profile.manifestPath, 'orchestration')

  // 逐字拼接：读原文 → 各自过改写器（U4 的规则按资产定向，OD 侧同样是分文本处理）→
  // 原文先后排列。改写放在拼接前后对最终文本等价（规则不跨资产匹配），但按资产处理让
  // 命中记录的 asset 字段忠实（doctor 逐条定位依赖它）。
  const core = readRosterAsset(profile, corePath)
  const orchestration = readRosterAsset(profile, orchestrationPath)

  const designSystemsRoot = join(profile.resourceRoot, DESIGN_SYSTEMS_DIR)
  const { texts, records } = applyRewrites(
    { 'core-system-prompt': core, 'general-orchestration': orchestration },
    { designSystemsRoot },
  )

  const injected = replaceInjectionPlaceholders(
    texts['core-system-prompt'] + SECTION_SEPARATOR + texts['general-orchestration'],
    profile.scenarioRoot,
  )
  const facts = renderContextFacts()
  const routing = renderRoutingSegment({
    scenarioRoot: profile.scenarioRoot,
    designSystemNames: scanDesignSystemNames(profile.resourceRoot),
  })
  const text = [injected, facts, routing].join(SECTION_SEPARATOR)
  return { text, rewriteRecords: records }
}
