# DSH 插件开发与审查规则

本文是 tai-ji-yang-shell 的 DSH 契约登记处。上游规则不在这里复制全文；本文只记录本项目必须执行的约束、机器检查分工，以及与通用插件实践不同的明确决策。当前架构见 `docs/ARCHITECTURE.md`。

## 1. 权威顺序

DSH 公共 API 仍可能变化。使用 Service、Event、Slot、Theme、Config 或 Client 模块契约时，按以下顺序核实：

1. 当前安装并实际运行的 DSH：通过 `cordis_inspect_query`、`Slots.listSubTree`、Theme token 清单和实际装配结果确认。
2. 当前安装包的 README、类型声明和发布产物。
3. DSH 源码仓文档与源码，用于解释运行机制。

本地源码仓不能代替运行时核实。文档与运行结果不一致时，先确认是否使用了不同 DSH 版本，再决定代码或文档哪侧需要调整。

上游权威入口：

- [插件开发技能](https://github.com/deepseek-ai/deepseek-harness/blob/main/packages/preset/agent-preset/skills/cordis-plugin-development/SKILL.md)
- [稳定性与 UI 实践](https://github.com/deepseek-ai/deepseek-harness/blob/main/packages/preset/agent-preset/skills/cordis-plugin-development/references/practices.md)
- [Host 插件与组合包](https://github.com/deepseek-ai/deepseek-harness/blob/main/packages/preset/agent-preset/skills/cordis-plugin-development/references/host-plugin.md)
- [Client 插件](https://github.com/deepseek-ai/deepseek-harness/blob/main/packages/preset/agent-preset/skills/cordis-plugin-development/references/ui-plugin.md)
- [测试政策](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/testing.md)
- [扩展点选择](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/architecture.md#where-new-behavior-goes)

## 2. Manifest、组合与版本

- `package.json` 必须保留 `type: module`、`dsh.bundle.patch`、`dsh.client.platform: web` 和 `./client` 导出。
- `dsh.client.inject` 只声明 Client 包的激活顺序；浏览器源码导出的 `inject` 声明服务依赖。两者名称相似，不能互相替代。
- `engines.dsh` 与 `peerDependencies['@deepseek-ai/dsh']` 必须存在且范围一致。当前宿主兼容性评估读取后者；只写前者不能形成有效门禁。
- DSH 升级后，重新核实本包使用的 Service、Event、Slot、模块基线和样式契约。升级涉及破坏性变化时，同步更新范围、代码、测试与升级说明。
- 新增文件时检查 `exports` 与 `files`，确保实际分发包包含运行时需要的全部资源。

机器主责：`scripts/check-manifest.mjs`。Reviewer 只补查机器未覆盖的语义，例如声明的兼容范围是否有真实验收支撑。

## 3. 依赖与 Client 模块边界

本包没有 npm `dependencies`。Cordis、Schemastery 和 DSH 由宿主提供，声明为 peer；测试实际使用的 Cordis 与 Schemastery 同时显式列入 `devDependencies`。

`pnpm-workspace.yaml` 关闭 `autoInstallPeers`，防止开发环境把整套 DSH 运行时自动拉入。不得为了让测试通过而把 `@deepseek-ai/dsh` 或 `@deepseek-ai/dsh-client-*` 加进运行时依赖。

浏览器产物只使用宿主模块表已经提供的模块。当前基线由 `scripts/check-require-baseline.mjs` 的 `BASELINE_MODULES` 唯一登记，包括 React、Cordis、zod、宿主 store/slots 等 11 项。基线存在不代表可以随意增加 Client 包依赖；新增引用前必须确认当前宿主确实提供且该用法属于公开契约。

- 不从 CDN 或第二个 React 副本加载 UI 运行库。
- 不替换应用根节点，不挂第二个应用，不在组件所有范围之外写 DOM。
- 样式优先使用 `--dsw-alias-*` token；字面色只允许用于本包 artwork 或已登记的功能色决策。
- Slot 注册必须有明确所有者，list Slot 必须有稳定 `id`。

机器主责：`check-no-host-deps`、`check-require-baseline`、`build-client` 的产物审计。Reviewer 负责检查新增 API 使用是否有运行时证据。

## 4. 生命周期与持久状态

- 注册、订阅、定时器、主题覆盖层和监听器都必须由 `ctx.effect` 或对应注册上下文持有清理函数（disposer）。
- 注册到其他上下文时，插件自身也要保留清理路径，不能假设外层插件卸载一定会清理它。
- 可选服务通过 `inject` 或 `ctx.get` 按当前宿主契约使用；服务缺失时应保持不激活或给出可行动诊断，不能在正常 web profile 上误报。
- 不新增 DSH Session 事件 `type`，不写实验性 `plugin:` 记录。需要持久状态时优先使用宿主提供的存储服务。
- 本包配置只经插件 Config 读写，不直接改写用户 profile 的 `cordis.patch.yml`，不把秘密信息写入普通 Config。
- 浏览器 localStorage、sessionStorage、IndexedDB 不是本包持久通道。

机器主责：`tests/uninstall-cleanliness.spec.ts`、装配测试和 profile 探针。真实禁用、卸载与配置残留由 `verify-taiji-yang` 验证。

## 5. 首次绘制与页面注入

Node 半场只提供默认配色的最小差异和版本信息，不复制六色表。样式值通过 `light-dark()` 跟随宿主 `color-scheme`，不自行读取系统偏好或等待 body 属性。

注入行只允许当前已声明的 `style` 与 `global` 类型，不推入额外脚本或 HTML。任何动态值都必须可安全序列化，注入文本不得包含结束标签。

机器主责：`check-injection-escape`、`tests/injection-precedes-mount.spec.ts`。真实页面首次绘制与版本行由浏览器验收检查。

## 6. 有意偏离登记

以下形态与通用插件实践不同，但属于本包的产品目标和明确架构决策。Reviewer 不得仅凭「使用了全局 CSS」或「替换了 Slot」重复报警；应检查决策理由和护栏是否仍成立。

| 编号 | 项目决策 | 理由 | 失效信号与护栏 |
|---|---|---|---|
| P-1 | 保留宿主会话头 DOM，以全局 CSS 重塑布局 | 整槽替换会使 utilities 与 corner 子 Slot 失去渲染者 | 选择器限定在会话头；只使用结构属性/local 名；双宿主真实验收；新增 utilities 占用者时复核隐藏规则 |
| P-2 | 重定义宿主品牌蓝和偏蓝中性色的静态调色板 | 本包本身就是完整视觉身份层，alias 自动跟随比逐组件覆盖更稳定 | 功能色清单保持不变；宿主新增 token 与六色切换验收；不把字面色扩散到代码和 ANSI |
| P-3 | 重写字体复合简写 | 宿主组件实际消费复合简写，独立字重/行高 token 不产生目标效果 | 只改字重和行高；`host-font-sheet.spec.ts` 逐字核对字号和字族表达式 |
| P-4 | 整槽替换 `sidebar.workspaces` | 项目分组轴与宿主目录工作区列表不可折中共存 | 使用负优先级；禁用/卸载回落宿主；不重声明宿主子 Slot；真实验证会话动作 |
| P-5 | `lib/` 构建产物随 git 交付 | 当前 git 安装通道不保证在安装期执行构建，目标 commit 必须包含可装载产物 | 构建确定性检查；源与产物同批提交；安装测试使用已提交产物 |
| P-6 | Node 半场另持默认色最小 token 集 | 浏览器模块装载前就需要避免宿主品牌色闪现 | 只允许默认色最小差异，不复制六色；与浏览器基值对账；首次绘制验收 |

新增偏离必须在同批改动中登记「通用实践、项目决策、理由、护栏」。没有登记不代表不能实现，但 Reviewer 应把它当作需要解释的设计变化，而不是默认接受。

## 7. 测试与审查分工

确定性规则必须由脚本判定，不交给模型重复判断：

1. `check-all.mjs` 依次执行静态断言、真实构建和全量 Vitest。
2. `build-client --self-test` 证明构建管线及失败支有效。
3. 实际组合加载测试通过 Loader 或宿主入口加载实际组合与构建产物，不能只用手工 mock Context 代替。
4. `verify-taiji-yang` 检查目标 DSH 版本中的实际能力、明暗主题、控制台、禁用和卸载。
5. `review-fix-loop` 使用 `.agents/reviewers/` 中的项目 reviewer，只补充业务语义、架构边界、宿主契约和生命周期审查。

Reviewer 报告问题时必须给出文件、行号、证据和修复方向。涉及运行时行为的否定性结论必须先读实际实现或运行探针；无法核实的标记为未核实，不能写成事实。

## 8. 安装与升级操作

用户 profile 的安装、启用、禁用和移除走 DSH 的 `plugin_manager` 或 `dsh plugin` 正常入口，不手工编辑用户 profile 的 package.json 或 patch 文件。

测试需要完全隔离的 profile 时，可以在测试自有临时目录中构造 fixture；不得把测试环境的修复步骤应用到用户真实 profile。DSH 返回 `restart-required`、`package-moved` 或 `failed` 时，按实际状态处理，不能把「文件已写入」当成已经生效。

安装后至少确认：

- 保存状态与激活状态一致；
- 需要重启时已经完成重启；
- 实际 Slot、设置项或宿主能力可观察；
- 控制台没有 Slot 崩溃；
- 测试改变的状态已经恢复或位于一次性隔离环境。
