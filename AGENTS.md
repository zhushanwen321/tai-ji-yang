# tai-ji-yang 项目规范（多包 workspace）

本文件是 main worktree（仓库根）的 agent 协作规范。本仓是 pnpm 多包 workspace，交付物是若干**独立的 DSH 插件包**（DSH 组合包 bundle：装进 DeepSeek Harness（下称 DSH）web 类型 profile 的单行插件条目）：根包 `tai-ji-yang-shell` 交付太极视觉身份、项目分组侧栏与模型服务能力（自有供应商接入 + 路由虚拟模型），子包 `packages/opendesign-design-mode` 交付 OpenDesign 设计模式。包与包互不牵连，各自可独立安装到不同 profile。对话流、工具调用等日常能力全部走 DSH 原生，插件不接管；模型清单在宿主原生能力之上叠加根包的路由虚拟模型（`taiji-route-*`），其余模型面仍归宿主。

构建、安装、版本门禁、发布与排障的权威文档是 `README.md`；本文件只写开发协作规范。

## 包结构

| 包 | 目录 | 形态 | 职责 |
|----|------|------|------|
| `tai-ji-yang-shell`（根包） | `.`（仓根） | 单包双半场 | 太极视觉身份（染色三层 + 槽位贡献）、项目分组侧栏（项目是插件侧逻辑分组概念，与 DSH 工作区无关）与模型服务（自有供应商接入 + 路由虚拟模型，设置页「模型服务」分区） |
| `opendesign-design-mode` | `packages/opendesign-design-mode` | 双半场（Node 半场源码内联在 `lib/*.ts`） | OpenDesign 设计模式：preset 入口 + 设计预览面板 + 资产定位 / 会话组装 / 材质化 |

- **包清单登记处（两处、一处对账）**：`pnpm-workspace.yaml` 声明 `packages/*` 通配；`scripts/workspace-packages.mjs` 登记每包的构建声明（包名 / 目录 / 浏览器半场入口 / Node 半场产物形态 / preset 登记），并在每次构建与检查时与 `pnpm-workspace.yaml` 的实际包目录对账——两边不同步即失败。加新子包：`packages/<name>/` 建包 + 两处同批登记；带 preset 的包在登记表加 `preset` 字段（preset 注册断言按登记执行，无登记的子包显式播报不适用）。
- **构建与检查逐包执行**：`node scripts/build-client.mjs` 逐包产出各包 `lib/`；七个 check 脚本对每包跑同一套通用断言，包特有断言按登记选择（断言逻辑仍单处归属各自脚本）。`pnpm check:static` / `pnpm check` 的覆盖范围 = 全部包，任一包红灯即整体红灯。
- **包边界纪律**：各包源码、产物、patch 互不越界；根包的 `client/`、`lib/`、`tests/` 既有文件是根包领地，子包改动不触及。开发工具（esbuild / vitest / playwright / typescript / cordis / schemastery）只在根包 `devDependencies` 声明，子包零依赖声明、靠 workspace 安装共享。
- **根包双半场**：一个包同时承载两个半场（单包 = profile 里的单行条目，两个半场生命周期一致）：

  | 半场 | 源 | 产物 | 职责 |
  |------|----|------|------|
  | Node 半场 | `index.js` | `lib/index.js`（package.json `main`） | 订阅宿主 `webserver/index-inject`，把首次绘制前的样式与版本信息行推入注入表；声明插件 Config；装载期检查 profile 是否具备 web 承载能力并给出可行动诊断；模型路由的 LLM 适配器（`taiji-route-*` 注册、成员级时间窗求值、求值转发与错误码词表） |
  | 浏览器半场 | `client/` | `lib/client.js`（package.json exports `./client`） | 经宿主 `window.__ModuleLoader__.load(...)` 契约物化；装配染色三层（静态调色板重定义 / token 职能分色 / 字体复合简写安全重写）、品牌与设置槽位贡献、项目分组侧栏（`sidebar.workspaces` 整槽替换 + 持久通道）、模型服务分区（供应商 / 模型清单 / 路由三视图 + 宿主设置文档与凭据通道封装） |

  `client/` 按职责分目录（theme / brand / head / input / locale / projects / settings / settings/model-service / model-service / persist / testing），目录级设计见 `docs/ARCHITECTURE.md`。

- **子包形态**：Node 半场源码在 `lib/*.ts`，经 esbuild transform 成同名 `.js` 同仓入库（不打包——每个 exports 子路径是宿主 loader 独立 import 的入口）；浏览器半场在 `client/preview-tab/`；`cordis.patch.yml` 声明本包主行 + preset 行（preset 的 `config.plugins` = DSH standard 模式全量基线 + 本包四子插件，逐项显式声明——DSH preset 无隐式工具基线）。用户侧说明见 `packages/opendesign-design-mode/README.md`。

## 文档索引

| 文档 | 内容 |
|------|------|
| `README.md` | 权威入口：构建、安装（web / desktop profile）、profile 适用性、版本门禁、模型服务能力、发布、已知差异、排障、静态自检 |
| `docs/ARCHITECTURE.md` | 架构与设计裁决：多包总览、半场职责、染色三层、槽位贡献、持久模型 |
| `docs/DSH-PLUGIN-RULES.md` | DSH 插件开发纪律（对每个包生效）：宿主契约、版本门禁双字段、安装期行为、宿主设置文档跨命名空间写入（模型服务）、有意偏离登记（P 系列 + D 系列）、宿主破坏性变更跟进 |
| `packages/opendesign-design-mode/README.md` | 子包用户说明：功能、安装、诊断命令、V1 边界 |

文档修改一律终态模式：只写当前怎么做，不写沿革与迁移史；历史靠 git 可追溯。

## 常用命令

一律在仓根（本文件所在目录）执行：

```bash
pnpm install                 # 安装 devDependencies（全 workspace 一次装齐）；esbuild 安装脚本已由 pnpm-workspace.yaml 预批放行
pnpm build                   # 逐包产出各包 lib/（= node scripts/build-client.mjs）
pnpm build:self-test         # 构建器自证（含失败支证明会红）
pnpm test                    # 全仓 vitest 单测（含子包单测；排除 .agents/workflows/tests 与子包 e2e）
pnpm test <路径>             # 增量：只跑受影响的测试文件
pnpm test:e2e:design-mode    # 子包真实宿主 e2e（node 直跑，需本机 DSH 与构建产物；不进 pnpm check）
pnpm check                   # 一键自检：七个静态断言 → 逐包构建 → 全仓单测（= node scripts/check-all.mjs）
pnpm check:static            # 只跑七个静态断言（逐包）
pnpm changeset               # 开发期写变更集（发版素材，见「发布」节）
pnpm changeset version       # 发版准备：消费变更集，bump 版本并生成 CHANGELOG（本地执行后 commit）
pnpm workflows:build         # 从 .agents/workflows/src 单源重建双平台 workflow 产物
pnpm workflows:check         # 校验 workflow 产物未过期
pnpm workflows:test          # workflow 构建与双平台结构测试
```

单项静态断言脚本（断言逻辑只此一处，归属各自产出单元；全部逐包执行）：

| 脚本 | 看守的契约 |
|------|-----------|
| `scripts/check-manifest.mjs` | 每包 package.json 契约（exports 路径存在性）+ patch 结构 + 依赖键集边界 + preset 注册（按登记） |
| `scripts/check-no-host-deps.mjs` | 每包不含 `@deepseek-ai/dsh-client-*` 运行时依赖 |
| `scripts/check-injection-escape.mjs` | 每包注入行不含结束标签（无注入贡献的包显式跳过） |
| `scripts/check-require-baseline.mjs` | 每包浏览器半场 require 字面量 ⊆ 宿主模块基线 |
| `scripts/check-forbidden-tokens.mjs` | 字族 / 字号 / 复合简写 / 宿主几何变量 / theme.register（逐包扫描） |
| `scripts/check-profile-probe.mjs` | 装错 profile 时 Node 半场报可行动诊断、不误报（无探针机制的包显式跳过） |
| `scripts/check-credentials-hygiene.mjs` | 插件产物零密钥材料：sk- 长串 / Bearer 硬编码 / 密钥字段字面赋值 / apiKeyEnv 字面非大写标识符（ref 名）（逐包扫描，含 lib/ 产物） |

## 测试纪律

- 增量优先：开发中只跑受影响模块的测试（`pnpm test <路径>`）；项目收尾或跨模块改动跑 `pnpm check` 全量。
- 提交前下限是 `pnpm check:static`（pre-commit 会再跑一遍）。
- `client/theme/host-font-sheet.spec.ts` 是根包字体复合简写的升级护栏：需要 `DSH_FONT_SHEET` 环境变量指向宿主源样式表 `gradient-shadow-text.css`（缺省探测本机 DSH 源码仓固定路径）；本地找不到时显式失败并给设置指引，不静默跳过；CI 环境（`CI=true`）没有宿主源码仓，显式跳过并播报说明——该护栏由本地全量与发布前本地检查承担。
- 子包单测（`packages/*/tests/*.test.ts`）随全仓 vitest 收集；子包 e2e 是 node 直跑形态、需要真实 DSH 宿主，走 `pnpm test:e2e:design-mode`，不进 `pnpm check`。
- 报 vitest 入口缺失时先 `pnpm install`。

## 产物与依赖纪律

以下对仓内每个 DSH 插件包生效：

- **lib/ 入库**：各包 `lib/` 是构建产物，但随仓库交付（git 与本地路径安装通道要求 clone 后直接可装），不忽略；提交前先构建，产物与源码同批进 commit。
- **先构建再安装**：运行时不安装任何宿主 client 包，各包 `lib/client.js` 只能由本仓构建命令产出。
- **零 npm 运行时依赖**：每包 `dependencies` 为空；宿主供给的能力走 `peerDependencies`（cordis / schemastery / dsh）与宿主模块表。
- **pnpm 唯一包管理器**：根 `pnpm-lock.yaml` 是全 workspace 唯一权威锁文件（`package-lock.json` 不入库）；`packageManager` 字段固定在根包，安装命令一律用 pnpm。
- Node ≥ 18。
- **版本门禁双字段**：每包的 `engines.dsh` 与 `peerDependencies["@deepseek-ai/dsh"]` 必须一致（机检）；只写 `engines.dsh` 等于没有门禁。

## 发布（npm）

- 流程（changesets，详细 runbook 见 `README.md`「发布」节）：开发期 `pnpm changeset` 为受影响包写变更集（`.changeset/*.md`，随改动 commit）→ 发版前本地 `pnpm changeset version`（bump 版本 + 生成 CHANGELOG.md）并 commit → push 一个 `npm-release-<日期>` tag（**须用户明确授权**）→ GitHub Actions `release-npm` 流水线：frozen install → `pnpm check` 门禁 → 产物一致性检查（构建后 `lib/` 与提交逐字一致）→ `changeset publish`（凭据走仓库 secrets 的 NPM_TOKEN，由用户在 GitHub 配置）→ registry 上线探测。
- **本机禁止一切 publish**：npm 发布一律走 CI；本地只执行 `changeset` / `changeset version`，不执行 `changeset publish`（registry 最终一致性问题曾导致本机发布事故）。
- **新包纳入发布**：包不设 `private: true` 即自动进入 changesets 版本管理与发布范围（无待发变更集则不发版）；内部工具包保持 private，`changeset publish` 自动跳过。

## Git 与提交

- remote 名 = `github`；push 用 `git push github HEAD:<branch>`，必须用户明确授权。
- **完成即提交**：改动验证通过后提交，不留脏工作区；只提交本次会话产生的改动；commit message 用英文。
- **显式 pathspec 提交**：多会话 / 多包并行改动是常态，`git add` 一律给具体路径，禁 `git add -A` / `git add .`，防止把他人在途改动带进提交。
- 产物目录 `.tmp/`、`.review/`、`test-results/`、`playwright-report/` 不入库（`.gitignore` 已声明），验收证据保存在技能数据目录或临时目录。

## Hooks

- `.githooks/` 随仓交付：`pre-commit` + `install-hooks.sh`（幂等安装器：把钩子拷进当前 worktree 的 git hooks 目录并设 `core.hooksPath`）。
- 本 workspace 内，worktree 就位时 `.bare/hooks/post-checkout` 自动执行安装器；其他环境克隆后手动跑一次 `bash .githooks/install-hooks.sh`。
- pre-commit 内容：跑 `node scripts/check-all.mjs --static`；跑 `node scripts/check-lib-fresh.mjs`（lib 产物新鲜度：改 client/ 或 index.js 未重 build 即拦截，FF16 防复发；红时先 `pnpm build` 再提交）；暂存了 `.agents/workflows/` 下文件时，还要求 `.agents/workflows/scripts/build-workflows.mjs` 存在，并跑其 `--check` 与 workflow 测试（workflow 单源构建门禁）。
- pre-commit 检出的问题必须全部当场修复，禁止 `--no-verify` 绕过。

## 项目级流程路由

项目级技能、reviewer 与 workflow 的随仓根是 `.agents/`（git 跟踪；不采用 workspace 根共享 `.agents` 的形态）。workflow 走单源构建体系：源在 `.agents/workflows/`，由 `.agents/workflows/scripts/build-workflows.mjs` 构建，pre-commit 有对应门禁。

| 场景 | 入口 |
|------|------|
| 技术设计与方案裁决 | tech-design-wf（全局技能） |
| 功能实现 / 修复的开发流程 | dev-flow-wf（全局技能） |
| 审查问题的批量修复循环 | review-fix-loop（全局 saved workflow；项目 reviewer 在 `.agents/reviewers/`，含子包判据） |
| 真实 DSH 宿主验收（根包 tai-ji-yang-shell） | verify-taiji-yang（项目入口，`.agents/`；只验根包） |
| 真实 DSH 宿主验收（design-mode 子包） | `pnpm test:e2e:design-mode`（`packages/opendesign-design-mode/tests/e2e/`，node 直跑，双版本宿主） |
| PR 审查修复与交付前编排 | pr-cr-fix（项目入口，`.agents/`）；完整链路由仓内 pr-lifecycle workflow 承载 |

## 领域边界（改代码前必读）

以下对仓内**每个 DSH 插件包**生效：

- 不注册第三方主题 id、不写宿主主题偏好（否则「跟随系统」失效）；配色走宿主 token 覆盖层，明暗模式归宿主。
- 不写宿主字族、字号轴与布局几何变量；字体只走复合简写安全重写（只替换字重与行高两段，字号与字族表达式逐字保留宿主原样），圆角走独立子 token。
- 每个贡献点（覆盖层、结构 CSS、槽位、外观行、locale 字典）挂 `ctx.effect` 并返回 disposer，卸载即撤除。
- 持久状态（配色 id、项目与归属映射）存宿主管辖的插件 Config 的 volatile 字段，不用浏览器 localStorage——卸载时插件代码已不再执行，Config 随 profile 行消失才是可达的清理路径。
- 子包 preset 无隐式工具基线：`config.plugins` 必须逐项显式声明（机检）；preset id 登记在 `scripts/workspace-packages.mjs` 并与 patch 声明对账。
- 改到上述任一契约时，同步维护对应的静态断言脚本（断言逻辑只此一处）。
