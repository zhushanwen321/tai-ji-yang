import {
  REWRITE_ASSET_IDS,
  REWRITE_RULES,
  compileAnchor,
  detectAssetGeneration
} from "./rules.js";
function applyRuleToText(ruleId, text, context) {
  const rule = REWRITE_RULES.find((r) => r.id === ruleId);
  if (!rule) throw new Error(`unknown rewrite rule id: ${ruleId}`);
  const regex = rule.locator === "regex" ? new RegExp(rule.anchor, "g") : compileAnchor(rule.anchor);
  let hitCount = 0;
  const next = text.replace(regex, (...args) => {
    const match = args[0];
    const replacement = typeof rule.replacement === "function" ? rule.replacement(match, context) : (
      // 经函数回传，规避 String.replace 对字符串替换里 $ 序列的模式解释
      rule.replacement
    );
    if (replacement !== match) hitCount += 1;
    return replacement;
  });
  return { text: next, hitCount };
}
function applyRewrites(inputs, context = {}) {
  const texts = { ...inputs };
  const assetGeneration = detectAssetGeneration(texts);
  const records = [];
  for (const rule of REWRITE_RULES) {
    for (const asset of rule.targets) {
      const { text, hitCount } = applyRuleToText(rule.id, texts[asset], context);
      texts[asset] = text;
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
        summary: hitCount > 0 ? `replaced ${hitCount} occurrence(s)` : "no replacement performed (anchor not found, or context missing — possible OD drift)"
      });
    }
  }
  return { texts, records };
}
export {
  REWRITE_ASSET_IDS,
  REWRITE_RULES,
  applyRewrites
};
