/**
 * 降级改写器规则应用编排。
 *
 * 输入两个注入资产文本（core-system-prompt / general-orchestration），按 rules.ts 的规则清单
 * 顺序逐条应用，产出改写后文本与逐条命中记录（RewriteApplyRecord[]，供 doctor 的「改写规则
 * 命中清单」消费——代际适用规则零命中（hitCount = 0）= 锚失配信号，是 OD 升级漂移的第一
 * 发现通道，不静默跳过；代际外规则的零命中是预期形态，按 rules.ts 的 generation 字段解释）。
 * 资产代际探测基于改写前原文（改写会替换掉代际标记串），逐记录冗余携带使记录自包含。
 *
 * RewriteApplyRecord 的最终契约归 lib/types.ts（U1 范围）；U1 未就绪期此处内联最小定义，
 * types.ts 落地后迁移并对齐（见单元 deviations 登记）。
 */

import {
  REWRITE_ASSET_IDS,
  REWRITE_RULES,
  compileAnchor,
  detectAssetGeneration,
  type RewriteAssetGeneration,
  type RewriteAssetId,
  type RewriteContext,
  type RewriteFragility,
  type RewriteLocatorKind,
  type RewriteRuleFamily,
  type RewriteRuleGeneration,
} from './rules.js'

export interface RewriteApplyRecord {
  ruleId: string
  ruleName: string
  family: RewriteRuleFamily
  /** 命中资产 */
  asset: RewriteAssetId
  locator: RewriteLocatorKind
  fragility: RewriteFragility
  /** 规则生效代际（自规则清单透传；doctor 按代际适用性解释零命中） */
  generation: RewriteRuleGeneration
  /** 本次应用的资产代际探测结局（逐记录冗余携带使记录自包含；探测基于改写前原文） */
  assetGeneration: RewriteAssetGeneration
  /** 实际替换次数；0 = 锚未命中（代际适用时 = OD 升级失配信号，doctor 按此暴露漂移） */
  hitCount: number
  /** 替换结果摘要（供 doctor 逐条展示） */
  summary: string
}

export interface RewriteAssetTexts {
  'core-system-prompt': string
  'general-orchestration': string
}

export interface RewriteApplyOutput {
  texts: RewriteAssetTexts
  records: RewriteApplyRecord[]
}

function applyRuleToText(
  ruleId: string,
  text: string,
  context: RewriteContext,
): { text: string; hitCount: number } {
  const rule = REWRITE_RULES.find((r) => r.id === ruleId)
  if (!rule) throw new Error(`unknown rewrite rule id: ${ruleId}`)
  const regex =
    rule.locator === 'regex'
      ? new RegExp(rule.anchor, 'g')
      : compileAnchor(rule.anchor)
  let hitCount = 0
  const next = text.replace(regex, (...args: unknown[]) => {
    const match = args[0] as string
    const replacement =
      typeof rule.replacement === 'function'
        ? rule.replacement(match, context)
        : // 经函数回传，规避 String.replace 对字符串替换里 $ 序列的模式解释
          (rule.replacement as string)
    // hitCount = 实际替换次数；锚命中但 no-op（如 R1 缺 context）不计
    if (replacement !== match) hitCount += 1
    return replacement
  })
  return { text: next, hitCount }
}

/** 按规则清单顺序对全部资产应用改写；每条规则 × 每个目标资产产出一条记录（零命中也记录） */
export function applyRewrites(
  inputs: RewriteAssetTexts,
  context: RewriteContext = {},
): RewriteApplyOutput {
  const texts: RewriteAssetTexts = { ...inputs }
  // 代际探测基于改写前原文：改写本身会替换掉代际标记串（如 V2 machine contract 段），
  // 改写后再探测会失真。
  const assetGeneration = detectAssetGeneration(texts)
  const records: RewriteApplyRecord[] = []
  for (const rule of REWRITE_RULES) {
    for (const asset of rule.targets) {
      const { text, hitCount } = applyRuleToText(rule.id, texts[asset], context)
      texts[asset] = text
      records.push({
        ruleId: rule.id,
        ruleName: rule.name,
        family: rule.family,
        asset,
        locator: rule.locator,
        fragility: rule.fragility,
        generation: rule.generation,
        assetGeneration,
        hitCount,
        summary:
          hitCount > 0
            ? `replaced ${hitCount} occurrence(s)`
            : 'no replacement performed (anchor not found, or context missing — possible OD drift)',
      })
    }
  }
  return { texts, records }
}

export { REWRITE_ASSET_IDS, REWRITE_RULES }
export type { RewriteAssetId, RewriteContext, RewriteRuleFamily }
