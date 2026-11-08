/**
 * 资产定位的平台策略接口（设计 D3）。
 *
 * 职责边界：策略只产出候选资源根列表（OdAssetCandidate[]），验证与解析平台无关——清单发现
 * （manifest-discovery.ts）与版本画像（version-profile.ts）不感知平台。候选列表已按选定规则
 * 的优先序排好（环境变量覆盖恒最先 > 渠道优先级 > 路径序），消费方按序取第一个可用候选即
 * 是设计 §3.1 的多候选选定语义。
 *
 * 平台覆盖（G7）：V1 仅 macOS（darwin）有实策略；Windows 布局未核实、Linux 无官方预构建，
 * 二者留接口空位返回空候选——后续平台实现是纯增量（往 PLATFORM_STRATEGIES 加一行映射），
 * 不触碰平台无关层。
 *
 * 环境线索经 LocateEnvHints 显式传入而非直读 process：测试注入假环境树与假 env，不依赖真机
 * /Applications 状态。OD_RESOURCE_ROOT 常量归 types.ts（与 OD daemon 覆盖变量同名同语义）。
 */
import { resolve } from 'node:path'
import type { OdAssetCandidate } from '../types.js'
import { collectMacOsCandidates } from './platform-macos.js'

/**
 * 资源根环境变量覆盖名（平台策略消费的环境线索键）。
 *
 * 归属说明：此常量放本文件而非 types.ts——lib/*.js 是 .ts 的编译影子（DSH 宿主运行时加载
 * .js，vitest 对显式 .js import 命中同名影子文件），U1 的影子 types.js 不含本单元新增常量，
 * 运行时 import 会拿到 undefined；而 env 变量名本就是平台策略接口层的环境线索语义，内聚在
 * 策略接口处归属成立（types.ts 回归纯类型扩展，运行时零痕迹，影子无需同步）。
 *
 * 值与 OD daemon 自身的资源根覆盖变量同名同语义（apps/daemon/src/daemon-paths.ts 的
 * RESOURCE_ROOT_ENV）：对齐命名让两边的覆盖指向同一开关，不新造词。非空（trim 后）即视为
 * 覆盖候选，渠道记 override，恒排候选列表最前。
 */
export const OD_RESOURCE_ROOT_ENV = 'OD_RESOURCE_ROOT'

/** 平台策略的环境线索：进程 env 的注入形态 + 目标平台（缺省形态见 locateEnvHints）。 */
export interface LocateEnvHints {
  /** 环境变量（定位器只读不写；测试注入合成 env）。 */
  env: Record<string, string | undefined>
  /** 目标平台（process.platform 同值域）。 */
  platform: NodeJS.Platform
  /**
   * macOS app 枚举根（仅 darwin 策略消费；缺省 = 真机 /Applications）。测试注入临时目录
   * 构造四渠道假 app 树，单测不依赖真机安装状态。
   */
  applicationsDir?: string
}

/** 平台策略：枚举本平台全部候选资源根（含环境变量覆盖，已按优先序排列）。 */
export interface PlatformAssetStrategy {
  /** 枚举候选根列表。返回顺序即选定优先序（override 恒最先）。 */
  collectCandidates(hints: LocateEnvHints): OdAssetCandidate[]
}

/**
 * 平台策略注册表（设计 §3.1「资产定位器按平台注册策略」）。键 = process.platform 值域；
 * 未注册平台（含 win32/linux）走空策略 = V1 接口空位。
 */
const PLATFORM_STRATEGIES: Partial<Record<NodeJS.Platform, PlatformAssetStrategy>> = {
  darwin: { collectCandidates: collectMacOsCandidates },
}

/** 未注册平台的空策略：零候选 → 上层画像结果为 missing（未装形态，设计 GL5）。 */
const EMPTY_STRATEGY: PlatformAssetStrategy = { collectCandidates: () => [] }

/** 默认环境线索：真实进程的 env 与平台、真机 /Applications。 */
export function locateEnvHints(): LocateEnvHints {
  return { env: process.env, platform: process.platform }
}

/**
 * 读取环境变量覆盖的资源根（trim 后非空才生效；返回已 resolve 的绝对路径）。
 * 各平台策略共用同一覆盖语义（覆盖候选恒排最前，渠道记 override）。
 */
export function resourceRootOverride(env: Record<string, string | undefined>): string | null {
  const raw = env[OD_RESOURCE_ROOT_ENV]?.trim()
  if (raw === undefined || raw.length === 0) return null
  return resolve(raw)
}

/**
 * 枚举当前平台的候选资源根列表（已按选定优先序排列；U2a 定位链入口）。
 *
 * @param hints - 环境线索；缺省取真实进程环境（locateEnvHints）。
 * @returns 候选列表（可能为空——未注册平台零候选、macOS 未装且无覆盖也零候选）。
 */
export function collectAssetCandidates(hints: LocateEnvHints = locateEnvHints()): OdAssetCandidate[] {
  const strategy = PLATFORM_STRATEGIES[hints.platform] ?? EMPTY_STRATEGY
  return strategy.collectCandidates(hints)
}
