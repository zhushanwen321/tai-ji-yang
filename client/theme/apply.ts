/**
 * client/theme/apply.ts —— 覆盖层的装配与换层（设计 §3.3.2 / D2，AS10 / AX3）。
 *
 * 机制：宿主 `theme.overrideTokens(source, tokens)` 叠加一层 token 覆盖层并返回一个**普通
 * 闭包 disposer**（AS10 实证：无 fiber 绑定——不挂 ctx.effect 就不会随插件卸载执行）。
 * 本文件把 disposer 挂进 `ctx.effect`，并对外提供一个换层函数：
 *
 *   · 同 source 重调 `overrideTokens` = 整层替换（宿主按 source 建 Map，`set` 即覆盖），
 *     因此换色不需要撤销再重建，也不会闪一帧（替换与 publish 在同一次调用内完成）；
 *   · effect 登记的 disposer 读的是**最新一层**的 disposer（闭包变量），卸载时撤除的
 *     永远是当前生效层——若按「每次换层新登记一个 effect」做，fiber 上会堆积历史层
 *     disposer，且旧 disposer 因宿主的层身份校验（`overrides.get(source) !== layer` 时
 *     直接 return）而撤不掉新层，卸载后残留一层覆盖（AX3 / V5 红灯）。
 *
 * 跨族选色不改写宿主偏好（D2 方案 A）：换层只换双模表，不碰宿主管明暗与跟随系统的
 * 三值偏好。本文件同样不出现 setTheme / theme.register。
 */
import { resolveThemeTokens, type ThemeId } from './resolve'
import type { TokenTable } from './tokens'

/**
 * 覆盖层层身份（宿主把它当层名）。主题层用字面包名——D2 原文「source 用本包名（宿主把
 * 它当层身份，重调即替换整层）」。
 */
export const THEME_LAYER_SOURCE = 'tai-ji-yang-shell'

/** 结构层（圆角 / 字重 / 行高）的层身份：与主题层分开，两层可独立换层互不覆盖。 */
export const STRUCTURE_LAYER_SOURCE = 'tai-ji-yang-shell:structure'

/** effect 标签（宿主诊断树按标签展示，卸载排查时能认出是哪一层）。 */
export const THEME_LAYER_LABEL = 'taiji: 主题 token 覆盖层（overrideTokens disposer 经 ctx.effect 托管）'
export const STRUCTURE_LAYER_LABEL = 'taiji: 结构 token 覆盖层（overrideTokens disposer 经 ctx.effect 托管）'

/** 本包用到的宿主 theme 服务面（最小结构类型：不 import 任何 dsh-client 包，D3）。 */
export interface ThemeTokenService {
  /**
   * 叠加一层 token 覆盖层；同 source 重调即整层替换。返回值是移除**这一层**的 disposer
   * （层已被替换后调用它是空操作——宿主按层身份校验）。
   */
  overrideTokens(source: string, tokens: TokenTable): () => void
}

/** 本包用到的宿主 context 面（最小结构类型；真实 ctx 是 Cordis context 的超集）。 */
export interface ThemeApplyContext {
  theme: ThemeTokenService
  /**
   * 登记一个启动副作用并拿到 fiber 生命周期托管：回调立即执行，其返回值（disposer 或
   * disposer 可迭代）在 fiber 卸载（profile 行移除 / disable / HMR 重载）时反序执行。
   */
  effect(callback: () => (() => void) | void, label?: string): void
}

/** 换层函数：把新表叠进同一层（宿主内整层替换 + 重新 publish）。 */
export type TokenLayerSwap = (next: TokenTable) => void

/**
 * 装配一层 token 覆盖层并托管其 disposer。
 *
 * @param ctx - 宿主 context（只用到 `theme.overrideTokens` 与 `effect`）
 * @param source - 层身份（同 source 重调即整层替换）
 * @param initial - 首装表
 * @param label - effect 标签
 * @returns 换层函数；重复传入同一引用是空操作
 */
export function applyTokenLayer(
  ctx: ThemeApplyContext,
  source: string,
  initial: TokenTable,
  label: string,
): TokenLayerSwap {
  // current 初值是 undefined（不是 initial）：否则首装调用会被「同引用空操作」挡掉
  let current: TokenTable | undefined
  let disposeLayer: (() => void) | undefined

  const swap: TokenLayerSwap = (next) => {
    if (next === current) return
    current = next
    disposeLayer = ctx.theme.overrideTokens(source, next)
  }

  swap(initial)
  ctx.effect(() => () => {
    disposeLayer?.()
  }, label)
  return swap
}

/** 配色选择函数：换主题层（纯换表，不写宿主偏好）。 */
export type ThemeSelector = (next: ThemeId) => void

/**
 * 装配主题覆盖层：按 initial 色注册双模表，返回选择器供外观行换色。
 *
 * 首装即注册（D2「默认值」：新装用户打开就必须看到太极默认色玄，不能等用户第一次点选）；
 * 首启不写宿主偏好——宿主是 system 且系统为亮时呈现的是玄的亮支取值（V1 判据）。
 */
export function applyThemeLayer(ctx: ThemeApplyContext, initial: ThemeId): ThemeSelector {
  const swap = applyTokenLayer(ctx, THEME_LAYER_SOURCE, resolveThemeTokens(initial), THEME_LAYER_LABEL)
  return (next) => {
    swap(resolveThemeTokens(next))
  }
}

/** 装配结构覆盖层（圆角 / 字重 / 行高，structure.ts 的表；不随配色变，无需选择器）。 */
export function applyStructureLayer(ctx: ThemeApplyContext, tokens: TokenTable): void {
  applyTokenLayer(ctx, STRUCTURE_LAYER_SOURCE, tokens, STRUCTURE_LAYER_LABEL)
}
