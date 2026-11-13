/**
 * client/model-service/route-errors.ts —— 路由成员可用性标注的 locale 键映射（G18）。
 *
 * 生产消费面（MF-1-9 死导出清理后的唯一导出）：memberAvailabilityLocaleKeys——routes-view.tsx
 * 成员行可用性标注（三布尔 → locale 键清单）经它取键。口径：路由视图的注册冲突状态条
 * （V7 步骤 6）不经本模块——route-store 以列表差集探测触发、routes-view 直取 locale 键
 * route.registrationFailed / registrationFailedNext；Node 半场抛错消息（index.js）无界面侧
 * 机器解析——detail 前缀仅供人读。
 *
 * 界面文案纪律：视图层文案一律经 locale 字典（双语对账由 locale.test 保证），禁在 TS 里
 * 写用户可见文案。既定例外（评审 MF-1-15 登记）：模型服务数据层（settings-client.ts /
 * credentials-client.ts / discovery.ts）的错误与恢复文案在 TS 内以中文硬编码，不经字典
 * ——它们逐字包裹宿主英文原文与动态参数（revision / ref / key / 字段清单），模板化收益
 * 低且产品定位中文优先；视图层对这些结果的框架与提示行（保存/删除失败前缀、接入占用
 * 提示等）仍一律走 locale 字典。
 */

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
