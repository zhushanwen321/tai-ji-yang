/**
 * 设计模式的 persona 子插件：preset 组合内的系统提示词注入行 + 启动资产探测。
 *
 * 终态职责（U3 填实）：探测成功时经 `ctx.systemPrompt.section` 注册设计模式系统提示词
 * （core + orchestration + 路由指令段，组装器产出）；本单元（U1）只立「接口先行、实现可替换」
 * 的探测降级骨架——探测调 {@link probeOdAssets}，失败时以携带安装指引的 diagnostic **激活失败**
 * （apply 抛 {@link OdProbeError}），宿主 agent-preset-registry 把该错误记为 preset 的 broken
 * 字段：新会话选择器自动过滤 broken preset、设置页显示诊断文案与恢复动作。这是设计 §3.1
 * 模式注册层与 SI3 收窄的降级形态——绝不进入「提示词残缺的坏会话」（公理 AX5）。
 *
 * 为什么探测放在 persona 行而不是包主行（lib/index.js）：preset 组合的行是 registry-owned
 * scope 的子行，子行激活失败被 registry 审计捕获 → preset broken（roster 可见的降级）；
 * 包主行失败是 profile 装配错误（整个包挂掉），不是设计内的降级形态。
 *
 * 诊断文案两形态（{@link OD_MISSING_MESSAGE} / {@link OD_PROBE_FAILED_MESSAGE}）：探测**完成**
 * 且零候选 = 未安装（安装指引）；探测**本身**失败（IO 异常 / 慢挂载 / 权限）= 请重启重试——
 * 把后者报成前者会让「已装但启动探测瞬时失败」的用户误判为未装（SI3 假阳性方向，设计 §2.6）。
 *
 * 贡献点纪律：探测成功但 U3 未落盘前，本行不注册任何 section（无贡献点即无 disposer 义务）；
 * U3 落盘后 section 注册走 `ctx.effect(() => ctx.systemPrompt.section(...), 'od.persona')`。
 */
import { existsSync } from 'node:fs'
import {
  OD_MISSING_MESSAGE,
  OD_PROBE_FAILED_MESSAGE,
  OdProbeError,
  type OdProbeOutcome,
} from './types.js'

/** Cordis 插件名（preset plugins 行的行内标识）。 */
export const name = 'od-persona'

/** 本行消费的宿主服务：终态经 systemPrompt 注册 section（U3 起生效）。 */
export const inject = ['systemPrompt']

/**
 * 主渠道的 OD 安装目录名（设计验收场景 V1 的实名：/Applications/Open Design.app）。
 *
 * U1 的最小探测只覆盖主渠道的存在性；Beta / Prerelease / Preview 三渠道命名、环境变量
 * 覆盖与多候选选定规则是 U2a 的核实与实现范围（{@link candidateRoots} 是替换点）。
 */
const PRIMARY_APP_ROOT = '/Applications/Open Design.app/Contents/Resources'

/**
 * 候选资源根枚举（U2a 替换点）。
 *
 * U1 最小实现：主渠道 Contents/Resources 的存在性。U2a 填实为：环境变量覆盖 +
 * 四渠道枚举 + 返回 {@link OdAssetCandidate} 列表（渠道与选定依据随候选给出）。
 *
 * @returns 候选资源根绝对路径列表（可能为空）。
 */
function candidateRoots(): string[] {
  return existsSync(PRIMARY_APP_ROOT) ? [PRIMARY_APP_ROOT] : []
}

/**
 * 启动探测：产出三态结果（found / missing / error）。
 *
 * U2a 填实后本函数改为调用 lib/locate 的定位器并返回完整画像；三态语义（尤其 missing
 * 与 error 的区分）是 persona 诊断文案的契约，保持不变。独立成导出函数是注入点：
 * 测试可替换它模拟三种形态（SI3 假阳性形态的 e2e fixture 同样走这个口）。
 *
 * @returns 探测结果。
 */
export function probeOdAssets(): OdProbeOutcome {
  let roots: string[]
  try {
    roots = candidateRoots()
  } catch (error) {
    return { status: 'error', reason: error instanceof Error ? error.message : String(error) }
  }
  if (roots.length === 0) return { status: 'missing' }
  return { status: 'found', resourceRoot: roots[0] }
}

/** 把探测结果翻译成带恢复动作的 diagnostic 文案（missing 与 error 两形态，见文件头）。 */
export function probeDiagnostic(outcome: OdProbeOutcome): string | undefined {
  if (outcome.status === 'found') return undefined
  if (outcome.status === 'missing') return OD_MISSING_MESSAGE
  return `${OD_PROBE_FAILED_MESSAGE}（探测错误：${outcome.reason}）`
}

/**
 * persona 行装配入口：探测失败即激活失败（preset broken），成功则等待 U3 注册 section。
 *
 * @param ctx - Cordis 插件上下文（preset 组合 scope）。本单元不注册贡献点，仅探针与日志。
 */
export function apply(ctx) {
  const outcome = probeOdAssets()
  const diagnostic = probeDiagnostic(outcome)
  if (diagnostic !== undefined) {
    // 激活失败：registry 审计捕获本错误 → preset broken → 选择器过滤 + 设置页诊断。
    throw new OdProbeError(diagnostic)
  }
  ctx.logger.debug('OpenDesign 资产就绪，persona section 待组装器（U3）接入')
}
