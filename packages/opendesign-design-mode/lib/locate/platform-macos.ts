/**
 * macOS 资产定位策略（设计 D3：四渠道命名 app + 环境变量覆盖）。
 *
 * 枚举语义：/Applications（或注入的枚举根）下四种渠道命名的 app 的 Contents/Resources，
 * 存在性核验（existsSync）通过的进入候选列表；环境变量 OD_RESOURCE_ROOT（与 OD daemon 的
 * 资源根覆盖变量同名同语义，见 types.ts）非空时生成 override 候选恒排最前。
 *
 * 返回顺序即选定优先序（version-profile.ts 按序取第一个可用候选）：
 *   override > stable（Open Design.app）> beta > prerelease > preview
 * 与 types.ts 的 OD_CHANNEL_PRIORITY 一致；同渠道在 macOS 下至多一个 app，无同级并列。
 *
 * 目录布局为观察级依赖（UD1，OD 历史上发生过目录迁移），本策略只固定「app 名 + Contents/
 * Resources」这一层；清单位置由搜索式发现处理（manifest-discovery.ts），不在本层硬编码。
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { OdAssetCandidate, OdChannel } from '../types.js'
import { resourceRootOverride, type LocateEnvHints } from './platform.js'

/** 渠道候选的 app 名 → 渠道（数组顺序 = 渠道优先级序；override 不经 app 枚举）。 */
const CHANNEL_APPS: ReadonlyArray<readonly [appName: string, channel: Exclude<OdChannel, 'override'>]> = [
  ['Open Design.app', 'stable'],
  ['Open Design Beta.app', 'beta'],
  ['Open Design Prerelease.app', 'prerelease'],
  ['Open Design Preview.app', 'preview'],
]

/**
 * 枚举 macOS 候选资源根。
 *
 * @param hints - 环境线索；applicationsDir 缺省 = /Applications（测试注入临时树）。
 * @returns 候选列表（override 恒最先，其余按 CHANNEL_APPS 的渠道优先级序）。
 */
export function collectMacOsCandidates(hints: LocateEnvHints): OdAssetCandidate[] {
  const candidates: OdAssetCandidate[] = []
  const override = resourceRootOverride(hints.env)
  if (override !== null) candidates.push({ resourceRoot: override, channel: 'override' })
  const appDir = hints.applicationsDir ?? '/Applications'
  for (const [appName, channel] of CHANNEL_APPS) {
    const resources = join(appDir, appName, 'Contents', 'Resources')
    if (existsSync(resources)) candidates.push({ resourceRoot: resources, channel })
  }
  return candidates
}
