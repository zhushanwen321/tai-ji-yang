/**
 * 设计模式的 persona 子插件：preset 组合内的系统提示词注入行 + 启动资产探测。
 *
 * 终态形态（U3 填实）：探测成功 = 调组装器（lib/compose/bundle.ts）产出完整设计模式系统
 * 提示词（core + orchestration 改写拼接 + 占位符防御 + 事实块 + 路由指令段），经
 * `ctx.systemPrompt.section` 注册（静态一次，preset 作用域，文本不随会话中途更新——
 * 任务档切换是模型自读行为，见路由指令段）。探测失败 = 以携带安装指引的 diagnostic
 * **激活失败**（apply 抛 {@link OdProbeError}），宿主 agent-preset-registry 把该错误记为
 * preset 的 broken 字段：新会话选择器自动过滤 broken preset、设置页显示诊断文案与恢复
 * 动作。绝不进入「提示词残缺的坏会话」（公理 AX5）。
 *
 * 为什么探测放在 persona 行而不是包主行（lib/index.js）：preset 组合的行是 registry-owned
 * scope 的子行，子行激活失败被 registry 审计捕获 → preset broken（roster 可见的降级）；
 * 包主行失败是 profile 装配错误（整个包挂掉），不是设计内的降级形态。
 *
 * 诊断文案两形态（{@link OD_MISSING_MESSAGE} / {@link OD_PROBE_FAILED_MESSAGE}）：探测
 * **完成**且零候选/零可用 = 未安装（安装指引）；探测**本身**失败（资产损坏 / IO 异常）=
 * 请重启重试——把后者报成前者会让「已装但资产损坏」的用户误判为未装（SI3 假阳性方向）。
 *
 * section 注册的宿主契约（2026-11-09 实测两目标版本核实，桌面 0.2.2-rc.1 与 web CLI
 * 0.1.7-rc.2 的 dsh-system-prompt 一致，runlog 已登记）：
 *   - section 名 = 部署 persona 前缀槽实名（dsh-persona 行同款机制）：preset 作用域内
 *     同名 section 遮蔽全局注册的部署 persona——设计模式会话的身份由 OD Next core 承担，
 *     宿主默认 persona 让位（dsh-persona 行文档写明的 preset 身份替换机制）；
 *   - order 经 `getSectionOrder('DEPLOYMENT_PERSONA_PREFIX')` 运行时取值（= 0，两版本一致），
 *     不写死数字——宿主调整段落编排时跟随；
 *   - 不带 complete 标记：section 渲染为「若干段落之一」（工具说明等宿主段落保留）；
 *     complete 会把本段变成唯一系统提示词、砍掉全部工具段落（0.2.2-rc.1 assemble 语义亲读）。
 */
import { locateOdAssets, type VersionProfileResult } from './locate/version-profile.js'
import { composeSystemPrompt } from './compose/bundle.js'
import {
  OD_MISSING_MESSAGE,
  OD_PROBE_FAILED_MESSAGE,
  OdProbeError,
  type OdProbeOutcome,
} from './types.js'

/** Cordis 插件名（preset plugins 行的行内标识）。 */
export const name = 'od-persona'

/** 本行消费的宿主服务：systemPrompt = 提示词段落注册表（DSH dsh-system-prompt 服务）。 */
export const inject = ['systemPrompt']

/**
 * persona section 名 = 部署 persona 前缀槽实名（dsh-persona 行的 PERSONA_PREFIX_SECTION
 * 同值）：preset 作用域内同名注册遮蔽全局部署 persona（身份替换机制，见文件头）。
 */
export const OD_PERSONA_SECTION_NAME = 'deployment:persona-prefix'

/** section 编次的宿主查询键（运行时取值，两目标版本实测均为 0）。 */
export const OD_PERSONA_SECTION_ORDER_KEY = 'DEPLOYMENT_PERSONA_PREFIX'

/**
 * 定位链三态结局 → 探测三态（found 只保留探测契约需要的资源根；画像本体留在定位链）。
 *
 * 探测链路无独立导出入口（apply 直调 locateOdAssets），测试注入走两条实际通道：
 * 单测 = 模块级 vi.mock locateOdAssets（compose.test.ts 的注入点）；e2e = OD_RESOURCE_ROOT
 * 环境变量覆盖（tests/e2e/web.spec.mjs）。
 */
function toProbeOutcome(result: VersionProfileResult): OdProbeOutcome {
  if (result.status === 'found') return { status: 'found', resourceRoot: result.profile.resourceRoot }
  if (result.status === 'missing') return { status: 'missing' }
  return { status: 'error', reason: result.reason }
}

/** 把探测结果翻译成带恢复动作的 diagnostic 文案（missing 与 error 两形态，见文件头）。 */
export function probeDiagnostic(outcome: OdProbeOutcome): string | undefined {
  if (outcome.status === 'found') return undefined
  if (outcome.status === 'missing') return OD_MISSING_MESSAGE
  return `${OD_PROBE_FAILED_MESSAGE}（探测错误：${outcome.reason}）`
}

/**
 * persona 行装配入口：探测失败即激活失败（preset broken）；成功则静态注册一个 section，
 * 文本 = 组装器对当前资产的完整组装产物。
 *
 * @param ctx - Cordis 插件上下文（preset 组合 scope）；systemPrompt 服务经 inject 注入。
 */
export function apply(ctx: PersonaContext): void {
  const located = locateOdAssets()
  const diagnostic = probeDiagnostic(toProbeOutcome(located))
  if (diagnostic !== undefined) {
    // 激活失败：registry 审计捕获本错误 → preset broken → 选择器过滤 + 设置页诊断。
    throw new OdProbeError(diagnostic)
  }
  if (located.status !== 'found') {
    // 类型收窄守卫（diagnostic 已判 found，运行时不可达）。
    throw new OdProbeError(OD_PROBE_FAILED_MESSAGE + '（探测结局与诊断判定不一致）')
  }
  const bundle = composeSystemPrompt({ profile: located.profile })
  ctx.effect(() => ctx.systemPrompt.section({
    name: OD_PERSONA_SECTION_NAME,
    order: ctx.systemPrompt.getSectionOrder(OD_PERSONA_SECTION_ORDER_KEY),
    text: bundle.text,
  }), 'od.persona')
  ctx.logger.debug(
    `OpenDesign 设计模式 persona section 已注册（资产根 ${located.profile.resourceRoot}，`
    + `提示词 ${bundle.text.length} 字符，改写命中记录 ${bundle.rewriteRecords.length} 条）`,
  )
}

/**
 * persona 行消费的宿主上下文最小面（按实际消费的成员声明；非宿主全量类型）。
 * systemPrompt 服务的成员面以 DSH dsh-system-prompt 0.1.7-rc.2 / 0.2.2-rc.1 实测为准。
 */
export interface PersonaContext {
  /** 效果注册（ctx.effect 包裹让 section 随行卸载撤除——宿主贡献点纪律）。 */
  effect(fn: () => unknown, label: string): unknown
  /** 结构化日志（宿主 logger 服务成员子集）。 */
  logger: { debug(message: string): void }
  /** 提示词段落注册表（dsh-system-prompt 服务成员子集）。 */
  systemPrompt: {
    section(section: { name: string; order: number; text: string }): unknown
    getSectionOrder(name: string): number
  }
}
