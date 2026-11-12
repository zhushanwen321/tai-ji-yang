/**
 * client/model-service/route-errors.ts —— 路由错误码词表与文案模板的界面侧映射
 * （dsh-model-service D4/G18，错误码词表三条）。
 *
 * 词表三条（D4 采用段）：ROUTE_NO_ACTIVE_MEMBER / ROUTE_MEMBER_UNAVAILABLE /
 * ROUTE_REGISTRATION_FAILED。权威定义在 Node 半场（index.js 抛错侧）。
 *
 * 生产消费面（grep 核实，终态同步登记）：memberAvailabilityLocaleKeys——routes-view.tsx
 * 的成员行可用性标注（G18）经它取 locale 键。注意两点口径：
 *   · 路由视图的注册冲突状态条（V7 步骤 6）不经本模块——route-store 以列表差集探测触发、
 *     routes-view 直取 locale 键 route.registrationFailed / registrationFailedNext；
 *   · parseMemberUnavailableMessage / noActiveMemberLocaleKey / isRouteErrorCode / 词表常量
 *     当前由 index.test.ts 锁定（契约保活），生产链路暂无调用点；RegistrationFailureCopy
 *     接口暂无消费方（保留为「状态条若改走码→文案映射」的预留形态）。
 *
 * Node 半场抛错消息格式（本模块解析的契约，index.js 侧同字面构造）：
 *   ROUTE_NO_ACTIVE_MEMBER  `route "<id>" has no active member: <原因>`
 *   ROUTE_MEMBER_UNAVAILABLE `route "<id>" member "<provider>/<model>" is unavailable: <原因>`
 *
 * 界面文案纪律：视图层文案一律经 locale 字典（双语对账由 locale.test 保证），禁在 TS 里
 * 写用户可见文案。既定例外（评审 MF-1-15 登记）：模型服务数据层（settings-client.ts /
 * credentials-client.ts / discovery.ts）的错误与恢复文案在 TS 内以中文硬编码，不经字典
 * ——它们逐字包裹宿主英文原文与动态参数（revision / ref / key / 字段清单），模板化收益
 * 低且产品定位中文优先；视图层对这些结果的框架与提示行（保存/删除失败前缀、接入占用
 * 提示等）仍一律走 locale 字典。
 */

/** 错误码词表（与 index.js 的构造侧同字面；新增码两侧同步）。 */
export const ROUTE_ERROR_CODES = ['ROUTE_NO_ACTIVE_MEMBER', 'ROUTE_MEMBER_UNAVAILABLE', 'ROUTE_REGISTRATION_FAILED'] as const

export type RouteErrorCode = (typeof ROUTE_ERROR_CODES)[number]

/** 词表成员判定（失败分类展示分派用）。 */
export function isRouteErrorCode(code: string): code is RouteErrorCode {
  return (ROUTE_ERROR_CODES as readonly string[]).includes(code)
}

/** 注册冲突状态条的 locale 键映射（V7 步骤 6：状态条 + 恢复指引）。 */
export interface RegistrationFailureCopy {
  /** 状态条主文案键：route.registrationFailed。 */
  messageKey: 'route.registrationFailed'
  /** 恢复指引键：route.registrationFailedNext。 */
  nextKey: 'route.registrationFailedNext'
  /** 未生效注册的路由名清单（状态条参数 {routes}）。 */
  routeNames: string[]
}

/**
 * 成员不可用的归因（G18 成员行可用性标注的分派依据）。
 *
 * 归因三型对齐 D4 预检链（供应商已删 / 模型不在清单 / 凭据缺失）；`unknown` = 消息格式
 * 解析不到（宿主版本升级改写消息字面等）——按通用不可用标注，不猜。
 */
export type MemberUnavailableReason =
  | { kind: 'provider-missing'; provider: string; model: string }
  | { kind: 'model-missing'; provider: string; model: string }
  | { kind: 'credential-missing'; provider: string; model: string; ref: string }
  | { kind: 'unknown'; provider: string; model: string }

/** 成员不可用文案的 locale 键映射（G18 成员行标注）。 */
export function memberUnavailableLocaleKey(reason: MemberUnavailableReason): {
  messageKey: 'route.memberProviderMissing' | 'route.memberModelMissing' | 'route.memberCredentialMissing' | 'route.memberUnavailable'
} {
  if (reason.kind === 'provider-missing') return { messageKey: 'route.memberProviderMissing' }
  if (reason.kind === 'model-missing') return { messageKey: 'route.memberModelMissing' }
  if (reason.kind === 'credential-missing') return { messageKey: 'route.memberCredentialMissing' }
  return { messageKey: 'route.memberUnavailable' }
}

/**
 * 路由视图成员行可用性标注的 locale 键集合（G18 三型视图侧消费；routes-view 的
 * MemberAvailability 三布尔 → 键清单，一个布尔可命中即给一条标注）。
 */
export function memberAvailabilityLocaleKeys(availability: {
  providerMissing: boolean
  modelMissing: boolean
  credentialMissing: boolean
}): ('route.memberProviderMissing' | 'route.memberModelMissing' | 'route.memberCredentialMissing')[] {
  const keys: ('route.memberProviderMissing' | 'route.memberModelMissing' | 'route.memberCredentialMissing')[] = []
  if (availability.providerMissing) keys.push('route.memberProviderMissing')
  if (availability.modelMissing) keys.push('route.memberModelMissing')
  if (availability.credentialMissing) keys.push('route.memberCredentialMissing')
  return keys
}

/**
 * 从 ROUTE_MEMBER_UNAVAILABLE 的消息提取成员与归因（解析失败按 unknown，不猜）。
 * 消息契约见文件头；provider/model 之外的原因短语不再细分解析——凭据缺失的 ref 归因
 * 只在消息携带 `credential <ref>` 时提取。
 */
export function parseMemberUnavailableMessage(message: string): MemberUnavailableReason | undefined {
  const match = /route "[^"]+" member "([^/"]+)\/([^"]+)" is unavailable: (.+)$/.exec(message)
  if (match === null) return undefined
  const [, provider, model, detail] = match
  const credential = /credential (\S+)/.exec(detail)
  if (detail.startsWith('credential')) {
    return { kind: 'credential-missing', provider, model, ref: credential?.[1] ?? '' }
  }
  if (detail.startsWith('provider')) return { kind: 'provider-missing', provider, model }
  if (detail.startsWith('model')) return { kind: 'model-missing', provider, model }
  return { kind: 'unknown', provider, model }
}

/**
 * 无活跃成员文案的 locale 键（V5 步骤 7 的错误形态）。
 * `hitless` = 成员条件都不命中；`not-exposed` = 路由不存在或白名单未勾选（适配器不暴露）。
 */
export function noActiveMemberLocaleKey(hitless: boolean): { messageKey: 'route.noActiveMember' | 'route.notExposed' } {
  return { messageKey: hitless ? 'route.noActiveMember' : 'route.notExposed' }
}
