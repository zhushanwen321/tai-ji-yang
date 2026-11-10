# tests/fixtures/lint-cases/ 目录索引

反 AI 味检查器（`lib/quality/lint.ts`，本轮 U4）逐检查项 fixture 对账样本（本轮 RL4）。消费方：`tests/quality/lint.test.ts` 的 `CHECK_CASES` 注册表循环——每个检查项一对文件：`<检查项 id>.hit.html`（命中样例，断言该 id 以期望 severity 命中）+ `<检查项 id>.clean.html`（非命中反例，断言全检查项零发现）。

## 来源与对账方法

检查项语义正源 = OpenDesign 仓 `apps/daemon/src/lint-artifact.ts`（nexu-io/open-design@20c49e75c9164bb592cfc299d366884ed79f9914，Apache-2.0）。样本三类出处，逐文件头注释标注：

1. **逐字取自上游测试**（`apps/daemon/tests/lint-artifact.test.ts` 同 commit）：`ai-default-indigo.hit/clean`、`trust-gradient.hit/clean`、`all-caps-no-tracking.hit/clean`；
2. **按正源实现语义派生**：其余检查项的命中形状与阈值边界（如 raw-hex 13 个裸 hex、accent-overuse 7 处引用）；
3. **clean 反例 = 全检查项零发现**：不仅是本检查项反命中——所有 `.clean.html` 同时是全局零发现样本（对其它 15 项也清洁）。

OD 正源升级后对账：以 `lint.ts` 头部版本锚为准，逐项核对检查语义是否漂移，漂移则同步更新对应 fixture 与注册表 severity。
