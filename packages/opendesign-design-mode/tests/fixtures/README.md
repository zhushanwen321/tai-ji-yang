# tests/fixtures/ 目录索引

单测共享 fixture 树。消费方单元（实施计划 §2）：U2a locate（定位/发现/画像）、U3 compose（组装）、U4 rewrite（改写扫描）、U5 materialize（材质化）、U6 serve（产物路由）。

上游参照（只读）：OpenDesign 仓 `plugins/_official/scenarios/od-next-strategy/` 与 `design-systems/`（0.25.1 检出，2026-11-09 摘录核实；`real-od/` 树的上游是 OpenDesign.app 安装版 2.0.4 资产）。**升级对账方法**：每个 fixture 文件头部注释标注来源 OD 路径与原文行号区间，OD 升级后按注释逐文件对账更新；清单类 JSON 的来源注释在其 `$fixtureSource` 顶层键。

## 子目录一览

| 目录 | 内容（一句话） | 消费方 | 来源 OD 路径 |
|------|----------------|--------|--------------|
| `mini-od/plugins/_official/scenarios/od-next-strategy/` | 迷你 OD 场景包：`open-design.json` 清单样本（od.kind=scenario、strategy.id 含 od-next-strategy、三层版本、pipeline.stages、6 个 rollout=active 任务档）+ `assets/` 内 core/orchestration 摘录与 13 个任务档样本 + `references/`、`SKILL.md` 声明目标小样本 | U2a（清单发现/roster 核验/画像）、U3（core+orchestration 拼接、路由路径）、U4（特征串与反指令扫描）、U5（prototype.resources 材质化清单） | OD 仓 `plugins/_official/scenarios/od-next-strategy/open-design.json` 及 `assets/` 同名文件 |
| `mini-od/plugins/_official/scenarios/od-next-strategy/assets/task-profiles/prototype{,/device-frames}` | 材质化源语义：prototype.md 的 `.od-frames/` 落点表 + 设备壳四文件（android.html/iphone.html/neutral.html/layout.css，语义等价样本——保留 `.phone-content` 内容槽、`@layer od-layout` 分层与核心原语类名） | U5（无条件重铺：逐字节一致、幂等、源变更后新内容——RL4）、U6（产物相对资源引用） | OD 仓 `.../task-profiles/prototype.md`（L200-208/L247/L447）与 `.../task-profiles/prototype/{device-frames/,layout.css}` |
| `mini-od/design-systems/sample-brand/` | 设计系统样本目录（DESIGN.md + tokens.css 小样本，`:root` token 形态） | U3（组装期设计系统目录清单扫描）、U4（设计系统读取命令路径化后模型直读目标——D5） | OD 仓 `design-systems/<name>/`（打包源 = 仓根 `design-systems/` 整树 → Resources/design-systems，`tools/pack/src/resources/index.ts` BUNDLED_RESOURCE_TREES 核实） |
| `drift-od/upgraded/v2/od-next-strategy/` | 资产漂移形态：同一迷你树语义的清单放在非默认相对位置（默认形态 = mini-od 的 `plugins/_official/scenarios/od-next-strategy/`），版本字段整体上调一档（3.3.8→3.4.0），roster 裁至 4 项声明 | U2a（漂移定位仍命中 glob、版本画像报告实际版本、roster 核验——A6/V6 探测层） | 形态模拟自 OD 仓清单迁移史（daemon TS 目录 → 插件资产目录，`docs/prompt-composition.md` 迁移记录）；文件正文为最小样本非摘录 |
| `real-od/assets/` | 真机 2.x 代际措辞摘录：core（机器契约边界段 / Route and stage limits 全节 / Skill 边界条目 / real-first 段）与 orchestration（ship-on-write 节 / Full Plan 第 9-10 步与计划停轮段 / 媒体 Skill 加载段 / plan_ready 输出要求），逐段注释标注真机原文行号 | U4（新代规则 generation=current-only 的命中断言、legacy-only 规则零命中预期断言、资产代际探测 current 形态） | OpenDesign.app 安装版 2.0.4（`.../scenarios/od-next-strategy/assets/` 同名文件；清单 version 2.0.4，core 资产 2.2.1、orchestration 资产 2.0.2） |
| `real-od/plugins/_official/scenarios/od-next-strategy/` | 真机清单完整副本：open-design.json（version 2.0.4、specVersion 实测 1.0.0）+ roster 声明件全量随附（SKILL.md、core/orchestration、4 个任务档、prototype 设备壳四件、task-profile-mapping；唯一省略非声明件 AGENTS.md）——默认布局形态，roster 核验可在真机清单上完整通过 | U2a（真机清单发现/特征校验/roster 核验/版本画像三层版本与 specVersion verified 判定） | OpenDesign.app 安装版 2.0.4（`.../scenarios/od-next-strategy/` 完整拷贝，2026-11-09 真机对账；来源注释见清单 `$fixtureSource`） |
| `artifacts/` | 普通产物样本 index.html（相对引用 `.od-frames/` 设备壳与 layout.css） | U6（合法产物 200 + 相对资源可达，与穿越拒绝用例对照——RL2）、U5（材质化落点与产物引用的联动语义） | 本仓 fixture，无 OD 原文（产物形态参照设计 AS5） |

## fixture 关键内容与断言锚点

改写器（U4）fixture 扫描所依赖的特征内容只存在于下列文件的**正文**（不在注释中——注释若含特征串会污染「改写后无残留」断言）：

- `core-system-prompt.md`：独立图片交付反包装段（原文 L114-119）、媒体 production-step 句（L148）、video-motion 例外段（L157-164）、Skill 界面指引段含 Integration 界面特征串（L186-208）、Imagery by type 段含媒体 stock 命令（`$OD_BIN` 特征串，L287-288）与 Skill 加载引用（L293）、生成门控（L299-304）。
- `general-orchestration.md`：交付默认段独立媒体分句（L18-22）、独立媒体反包装句（L52-54）、两轮协议段含续轮标记与 question-form 用法（L88-99）、媒体 Skill 加载段整段含命令特征串（L215-236）。
- `discovery.md`：全量目录占位符段（`{{SKILL_CATALOG}}`，原文 L11-15）——该占位符在 13 个任务档中仅出现于本档（设计 D6 排除理由锚点）；core/orchestration 样本中不得出现（`fixtures.test.ts` 断言）。
- 媒体三档 + live-artifact（image/video/audio/live-artifact.md）：排除五档样本——文件真实存在（清单 `od.context.assets` 已声明），使「注入文本不含这四档路径」的白名单过滤断言（RL3）非空洞。
- `real-od/assets/core-system-prompt.md`：机器契约边界段（真机 L58-69）、Route and stage limits 全节（L113-139，含「planning-only + Build 续轮」与「production 续轮」两条锚）、Skill 边界条目（L179-199，Integration 界面特征串在两代资产中同形）、real-first 段（L254-270，含生成回退分句锚）。
- `real-od/assets/general-orchestration.md`：ship-on-write 节（真机 L83-108，保留断言）、Full Plan 第 9-10 步与计划停轮段（L229-237，两条续轮/契约锚）、媒体 Skill 加载段整段（L487-509，命令特征串载体——D6④ 的 2.x 形态）、plan_ready 输出要求（L540-553，两条机器块锚）。该树正文含 2.x 代际标记串（`fixtures.test.ts` 以此断言 detectAssetGeneration 的 current 形态）、不含旧代协议特征串。

## 与 e2e fixture 的边界

e2e 场景专用 fixture（无资产环境、SI3 假阳性形态、探针产物、resume 两代树）在 `tests/e2e/fixtures/`，索引见其 README；漂移场景 e2e（V6）复用本目录 `drift-od/`。
