/**
 * 材质化器：会话创建时把设备壳支撑文件从 OD 源资产无条件全量重铺进会话工作目录
 * （U5；语义权威 = 设计 D8，写入影响登记 ①-④）。
 *
 * D8 的无条件语义——实现里不存在任何失效/跳过/比对分支：
 *   - 不按落点目录存在性跳过（SI1：目录存在只说明某次材质化发生过，不蕴含内容一致——
 *     OD 升级后源已变而目录内容是旧的，存在性跳过会让模型拿到与提示词不匹配的设备壳）；
 *   - 不做源 hash 比对、无失效判定（全量重铺成本 = 4 个小文件毫秒级写盘，判定机制的收入不抵概念成本）；
 *   - 不按任务条件触发（V1 无会话内运行时，任务选定是对话行为，插件侧无触发依据）；
 *   - 落点既有内容无条件覆盖（D8 ④ 判定：落点收在 .od-frames/ 约定子目录内，常态覆盖对象 =
 *     旧版本资产镜像；用户手写内容占用管理名被覆盖的概率极低，显式接受——
 *     感知通道 = doctor 材质化状态报告落点清单）。
 *
 * deck 指令供给形态（RR5，R-deck-degrade 已裁决）：**注指令块形态，不落盘**——本模块写清单恰
 * 4 文件（android.html / iphone.html / neutral.html / layout.css），此为终态形态而非待定项。
 * 裁决依据（2026-11-09 亲读 OD 仓）：
 *   - deck-framework.md 在 OD 源资产根不存在静态文件：清单 ppt 档 resources 为空（本仓 fixture
 *     与 OD 0.25.1 真实清单一致），该文件由 OD daemon 运行时动态生成
 *     （apps/daemon/src/strategies/od-next/device-frames.ts L121-126）——铺文件形态要求插件自产
 *     内容（复刻 OD contracts 的 render 函数文本进插件仓），即把流程提示词写死，违反 AX3
 *     （OD 升级后副本过期、无跟随）；本设计「不实现 OD manifest 所有权机制」是同一减法方向。
 *   - 注指令块形态把 deck 协议供给交给组装层（U3）：OD 先例同构——注入块由 daemon 组装代码
 *     生成（packages/contracts/src/prompts/od-next-strategy.ts:549-561，
 *     `<od-next-context kind="instruction" name="deck-framework">`），本就是组装时点职责。
 *   - 与 ppt.md 任务档原文兼容（OD 原文 L216）："use the host deck protocol if it is already in
 *     context; otherwise read .od-frames/deck-framework.md"——注入块在场即命中
 *     "already in context" 分支，模型不因文件缺失而降级。
 *   终态结论：两形态纯 DSH 均无供给源，V1 deck 协议恒空槽（ppt 档按「protocol 不在场」分支
 *   降级），协议级翻页/打印归 M2 后续版本；「组装层若按铺文件形态实现则变 5 文件」的条件
 *   分支已随裁决排除，材质化器保持纯复制器语义。
 *
 * 管理名清单与 OD contracts 的 OD_NEXT_MANAGED_RESOURCE_FILES 同源，差 = deck-framework.md
 * （上条形态决策所致；OD 升级若把 deck-framework.md 变为静态清单资源，deck 供给形态随组装层
 * 一并适配，材质化器保持纯复制器语义不变）。
 *
 * AX2 红线：源侧只读（readFile 清单与资源文件），写侧只有调用方传入 cwd 之下 .od-frames/；
 * 源清单/源资源缺失或清单结构漂移时 fail-fast 抛错（AX5 显式降级语义——材质化失败抛错由
 * lib/index.js 的 agent-preset/selected 事件监听捕获记 logger.error（不阻断会话），落点
 * 状态由 doctor 第⑤项感知，绝不静默产出残缺副本）。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { MaterializeManifest, MaterializedFile } from '../types.js'

/** 材质化落点子目录实名（与 OD contracts OD_NEXT_DEVICE_FRAME_ROOT 同源，D8 ①）。 */
export const OD_FRAMES_DIR = '.od-frames'

/**
 * 材质化管理名清单（D8 ① 写清单 = 恰此 4 文件；D8 ④「OD 管理名恰为同 5 文件名」中的第 5 名
 * deck-framework.md 因注指令块形态不在此列，见文件头注释）。
 */
export const MATERIALIZED_FILE_NAMES = [
  'android.html',
  'iphone.html',
  'neutral.html',
  'layout.css',
] as const

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
 * 无条件全量重铺（D8）。
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

  // 收集重铺计划：全量扫描全部任务档的资源声明（D8 全量语义——V1 无会话内运行时，
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

  // 无条件覆盖写入：mkdir recursive 幂等（不以存在为跳过条件），writeFile 直接覆盖（D8 ④）。
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

  return { targetRoot, files }
}
