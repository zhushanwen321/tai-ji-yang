/**
 * 材质化器：会话创建时把设备壳支撑文件从 OD 源资产无条件全量重铺进会话工作目录
 * （V1 设计包 U5；语义权威 = V1 设计包 D8，写入影响登记 ①-④）。
 *
 * V1 设计包 D8 的无条件语义——实现里不存在任何失效/跳过/比对分支：
 *   - 不按落点目录存在性跳过（V1 设计包 SI1：目录存在只说明某次材质化发生过，不蕴含内容一致——
 *     OD 升级后源已变而目录内容是旧的，存在性跳过会让模型拿到与提示词不匹配的设备壳）；
 *   - 不做源 hash 比对、无失效判定（全量重铺成本 = 4 个小文件毫秒级写盘，判定机制的收入不抵概念成本）；
 *   - 不按任务条件触发（V1 无会话内运行时，任务选定是对话行为，插件侧无触发依据）；
 *   - 落点既有内容无条件覆盖（V1 设计包 D8 ④ 判定：落点收在 .od-frames/ 约定子目录内，常态覆盖对象 =
 *     旧版本资产镜像；用户手写内容占用管理名被覆盖的概率极低，显式接受——
 *     感知通道 = doctor 材质化状态报告落点清单）。
 *
 * deck 协议供给形态（opendesign-assets-quality D9；V1 设计包 R-deck-degrade 降级裁决经 opendesign-assets-quality AS5 推翻后更新）：第 5 个铺盘文件
 * `.od-frames/deck-framework.md`——内容非 OD 静态资产复制件，而是 lib/protocols/deck.ts 的
 * 派生登记文本（renderDeckFrameworkFile()：适用限定句 + Existing deck 兼容段 + New deck
 * 规范段三段结构，正源 = OD 源码仓 packages/contracts 的协议常量，AX3 例外 + 版本锚登记），
 * 与 4 个 manifest 复制件同目录同批、同无条件重铺语义。文件名 = 上游约定（任务档 ppt.md
 * L216 fallback 明文引用 .od-frames/deck-framework.md，OD contracts
 * OD_NEXT_MANAGED_RESOURCE_FILES 与 daemon device-frames.ts L121-126 组文同名——自造名将使
 * OD 升级后 fallback 扑空）。体积分档依据（opendesign-assets-quality D9）：deck 协议文本含整页骨架 HTML，不进提示词
 * 注入，模型经任务档路由段指针（ppt 条目，U2）自读全文。
 *
 * 管理名清单与 OD contracts 的 OD_NEXT_MANAGED_RESOURCE_FILES 同源同集（4 复制件 +
 * deck-framework.md 派生件）。
 *
 * AX2 红线：源侧只读（readFile 清单与资源文件），写侧只有调用方传入 cwd 之下 .od-frames/；
 * 源清单/源资源缺失或清单结构漂移时 fail-fast 抛错（AX5 显式降级语义——材质化失败抛错由
 * lib/index.js 的 agent-preset/selected 事件监听捕获记 logger.error（不阻断会话），落点
 * 状态由 doctor 第⑤项感知，绝不静默产出残缺副本）。
 * 编号口径：本文件编号跨两代设计包——V1 设计包（opendesign-design-mode）域编号带「V1 设计包 / V1·」前缀；裸编号默认属 opendesign-assets-quality 设计包（本轮）。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { renderDeckFrameworkFile } from '../protocols/deck.js'
import type { MaterializeManifest, MaterializedFile } from '../types.js'

/** 材质化落点子目录实名（与 OD contracts OD_NEXT_DEVICE_FRAME_ROOT 同源，V1 设计包 D8 ①）。 */
export const OD_FRAMES_DIR = '.od-frames'

/** deck 协议铺盘文件实名（上游约定名，见文件头 opendesign-assets-quality D9 段）。 */
export const DECK_FRAMEWORK_FILE_NAME = 'deck-framework.md'

/**
 * 材质化管理名清单（V1 设计包 D8 ①：manifest 清单资源复制件，恰 4 文件——语义保持「复制件」
 * 不含派生件，消费方（context-facts 壳清单、doctor ⑤ 既有逐文件检查）按此口径派生）。
 */
export const MATERIALIZED_FILE_NAMES = [
  'android.html',
  'iphone.html',
  'neutral.html',
  'layout.css',
] as const

/**
 * 材质化完整写清单（V1 设计包 D8 ① + opendesign-assets-quality D9：恰 5 文件 = 复制件 4 + deck-framework.md 派生登记件；
 * MaterializeManifest.files 与 doctor 材质化状态逐文件检查以此为准）。
 */
export const MATERIALIZED_WRITE_LIST: readonly string[] = [
  ...MATERIALIZED_FILE_NAMES,
  DECK_FRAMEWORK_FILE_NAME,
]

const MANAGED_NAMES: ReadonlySet<string> = new Set(MATERIALIZED_FILE_NAMES)

/** 源资产不可用（清单读不了 / 结构漂移 / 声明的资源文件缺失）时抛出；message 含恢复动作。 */
export class MaterializeSourceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MaterializeSourceError'
  }
}

/** 清单内单个资源声明（只关心 path；OD 清单 schema 的 resource.path 相对清单文件所在目录）。 */
interface ResourceEntry {
  path?: unknown
}

/** open-design.json 中材质化所需的最小结构（其余字段与本模块无关，不解析）。 */
interface ScenarioManifestShape {
  od?: {
    strategy?: {
      assets?: {
        taskProfiles?: unknown
      }
    }
  }
}

/**
 * 无条件全量重铺（V1 设计包 D8）。
 *
 * @param input.manifestPath open-design.json 清单绝对路径（资源相对路径以它所在目录为基准解析，
 *   与 OD 清单 schema 一致；调用方传 VersionProfile.manifestPath 或测试直传 fixture 路径）。
 * @param input.cwd 会话工作目录；写入落点恒为 `<cwd>/.od-frames/`（AX2：OD 安装目录零写入）。
 * @returns MaterializeManifest（落点根 + 写入文件清单；实际消费方 = lib/index.js 的事件接线
 *   与 tests/materialize.test.ts 的契约断言。doctor 第⑤项材质化状态按磁盘实态读取，不经本返回值）。
 */
export async function materializeAssets(input: {
  manifestPath: string
  cwd: string
}): Promise<MaterializeManifest> {
  const manifestDir = path.dirname(input.manifestPath)

  let raw: string
  try {
    raw = await readFile(input.manifestPath, 'utf8')
  } catch (err) {
    throw new MaterializeSourceError(
      `无法读取 OD 资产清单 ${input.manifestPath}：${(err as Error).message}。` +
        '恢复动作：运行 /opendesign-doctor 检查资产定位与完整性，确认 OpenDesign 安装未损坏。',
    )
  }

  let parsed: ScenarioManifestShape
  try {
    parsed = JSON.parse(raw) as ScenarioManifestShape
  } catch (err) {
    throw new MaterializeSourceError(
      `OD 资产清单不是合法 JSON：${input.manifestPath}（${(err as Error).message}）。` +
        '恢复动作：运行 /opendesign-doctor 检查清单完整性，确认 OpenDesign 安装未损坏。',
    )
  }

  const taskProfiles = parsed.od?.strategy?.assets?.taskProfiles
  if (!Array.isArray(taskProfiles)) {
    throw new MaterializeSourceError(
      `OD 资产清单结构漂移：od.strategy.assets.taskProfiles 缺失或非数组（${input.manifestPath}）。` +
        '恢复动作：运行 /opendesign-doctor 检查清单版本，OD 升级后结构变化需适配本插件。',
    )
  }

  // 收集重铺计划：全量扫描全部任务档的资源声明（V1 设计包 D8 全量语义——V1 无会话内运行时，
  // 任务选定在首轮问答后，材质化不分任务），basename 命中管理名才落盘（OD daemon 同款
  // 过滤语义：任务档 md 等非管理名资源经模型自读进入上下文，不走落盘）。
  const plan = new Map<string, string>() // 管理名 → 源文件绝对路径
  for (const [profileIndex, profile] of taskProfiles.entries()) {
    const resources = (profile as { resources?: unknown }).resources
    if (resources === undefined) continue
    if (!Array.isArray(resources)) {
      throw new MaterializeSourceError(
        `OD 资产清单结构漂移：taskProfiles[${profileIndex}].resources 非数组（${input.manifestPath}）。` +
          '恢复动作：运行 /opendesign-doctor 检查清单版本。',
      )
    }
    for (const [resourceIndex, resource] of resources.entries()) {
      const resourcePath = (resource as ResourceEntry).path
      if (typeof resourcePath !== 'string' || resourcePath === '') {
        throw new MaterializeSourceError(
          `OD 资产清单结构漂移：taskProfiles[${profileIndex}].resources[${resourceIndex}].path 缺失` +
            `（${input.manifestPath}）。恢复动作：运行 /opendesign-doctor 检查清单版本。`,
        )
      }
      const name = resourcePath.split('/').pop() ?? ''
      if (!MANAGED_NAMES.has(name)) continue
      const sourcePath = path.resolve(manifestDir, resourcePath)
      const previous = plan.get(name)
      if (previous !== undefined && previous !== sourcePath) {
        throw new MaterializeSourceError(
          `OD 资产清单冲突：管理名 ${name} 被声明指向两个不同源（${previous} 与 ${sourcePath}）。` +
            `落点唯一（${OD_FRAMES_DIR}/${name}），无法同时重铺两份内容。` +
            '恢复动作：运行 /opendesign-doctor 检查清单，OD 升级后结构变化需适配本插件。',
        )
      }
      plan.set(name, sourcePath)
    }
  }

  // 无条件覆盖写入：mkdir recursive 幂等（不以存在为跳过条件），writeFile 直接覆盖（V1 设计包 D8 ④）。
  const targetRoot = path.join(input.cwd, OD_FRAMES_DIR)
  await mkdir(targetRoot, { recursive: true })

  const files: MaterializedFile[] = []
  const ordered = [...plan.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  for (const [name, sourcePath] of ordered) {
    let content: Buffer
    try {
      content = await readFile(sourcePath)
    } catch (err) {
      throw new MaterializeSourceError(
        `无法读取 OD 源资产 ${sourcePath}（清单声明的管理名 ${name}）：${(err as Error).message}。` +
          '恢复动作：运行 /opendesign-doctor 检查资产完整性（roster 核验），确认 OpenDesign 安装未损坏。',
      )
    }
    await writeFile(path.join(targetRoot, name), content)
    files.push({ name, sourcePath, bytes: content.byteLength })
  }

  // 第 5 文件：deck 协议铺盘（opendesign-assets-quality D9）——内容 = lib/protocols/deck.ts 派生登记文本
  // （非 OD 静态资产复制件，MaterializedFile.sourcePath 缺省），与复制件同目录同批、
  // 同无条件覆盖语义；写清单恰 5 文件（MATERIALIZED_WRITE_LIST）。
  const deckText = renderDeckFrameworkFile()
  await writeFile(path.join(targetRoot, DECK_FRAMEWORK_FILE_NAME), deckText)
  files.push({ name: DECK_FRAMEWORK_FILE_NAME, bytes: Buffer.byteLength(deckText) })

  return { targetRoot, files }
}
