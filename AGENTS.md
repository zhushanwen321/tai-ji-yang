# tai-ji-yang-shell 项目规范

本文件是 main worktree（项目根）的 agent 协作规范。项目 = `tai-ji-yang-shell`：太极工作台（taiji）的 **DSH 插件版**，以 **DSH 组合包**（bundle：装进 DeepSeek Harness（下称 DSH）web 类型 profile 的单行插件条目）形态交付「打开即太极」的视觉身份与项目分组侧栏。对话流、模型切换、工具调用等日常能力全部走 DSH 原生，本包不接管。

功能范围、构建安装、版本门禁与排障的权威文档是 `README.md`；本文件只写开发协作规范。

## 架构：单包双半场

一个包同时承载两个半场（单包 = profile 里的单行条目，两个半场生命周期一致）：

| 半场 | 源 | 产物 | 职责 |
|------|----|------|------|
| Node 半场 | `index.js` | `lib/index.js`（package.json `main`） | 订阅宿主 `webserver/index-inject`，把首次绘制前的样式与版本信息行推入注入表；声明插件 Config；装载期检查 profile 是否具备 web 承载能力并给出可行动诊断 |
| 浏览器半场 | `client/` | `lib/client.js`（package.json exports `./client`） | 经宿主 `window.__ModuleLoader__.load(...)` 契约物化；装配染色三层（静态调色板重定义 / token 职能分色 / 字体复合简写安全重写）、品牌与设置槽位贡献、项目分组侧栏（`sidebar.workspaces` 整槽替换 + 持久通道） |

`client/` 按职责分目录（theme / brand / head / input / locale / projects / settings / persist / testing），目录级设计见 `docs/ARCHITECTURE.md`。

## 多包结构

本仓是 pnpm 多包 workspace（单包仓 → 多包容器，设计 D10）：根包 = `tai-ji-yang-shell`，功能型子包逐个落 `packages/<name>/`（当前：`packages/opendesign-design-mode`——OpenDesign 设计模式插件包）。

- **包清单登记处（两处、一处对账）**：`pnpm-workspace.yaml` 声明 `packages/*` 通配；`scripts/workspace-packages.mjs` 登记每包的构建声明（包名 / 目录 / 浏览器半场入口 / Node 半场产物形态），并在每次构建与检查时与 `pnpm-workspace.yaml` 的实际包目录对账——两边不同步即失败。加新包时两处同批登记。
- **构建与检查逐包执行**：`node scripts/build-client.mjs` 逐包产出各包 `lib/`；六个 check 脚本（`check-manifest` 等）对每包跑同一套通用断言，包特有断言按包选择（断言逻辑仍单处归属各自脚本）。`pnpm check:static` / `pnpm check` 的语义不变，覆盖面 = 全部包。
- **子包结构**（`packages/opendesign-design-mode/`）：`package.json`（双入口：main → `lib/index.js`、exports `./client` → `lib/client.js`，外加四个 preset 子插件子路径入口）、`cordis.patch.yml`（insert 本包主行 + agent-preset 行，preset 的 `config.plugins` 八项显式声明——四个 DSH 原生工具 + 四个本包子插件）、`lib/`（host 半源码与产物）、`client/`（浏览器半场源码）。子包的 preset 注册、资产定位、提示词组装与预览面板的设计依据见该包内源码注释与设计文档（opendesign-design-mode）。
- **包边界纪律**：各包源码、产物、patch 互不越界；根包（shell 包）的 `client/`、`lib/`、`tests/` 既有文件是包级领地，子包改动不触及。

## 文档索引

| 文档 | 内容 |
|------|------|
| `README.md` | 权威入口：构建、安装（web / desktop profile）、profile 适用性、版本门禁、已知差异、排障、静态自检 |
| `docs/ARCHITECTURE.md` | 架构与设计裁决：半场职责、染色三层、槽位贡献、持久模型 |
| `docs/DSH-PLUGIN-RULES.md` | DSH 插件开发纪律：宿主契约、版本门禁双字段、安装期行为、宿主破坏性变更跟进 |

文档修改一律终态模式：只写当前怎么做，不写沿革与迁移史；历史靠 git 可追溯。

## 常用命令

一律在 worktree 根（本文件所在目录）执行：

```bash
pnpm install                 # 安装 devDependencies（Cordis / Schemastery / esbuild / vitest）；esbuild 安装脚本已由 pnpm-workspace.yaml 预批放行
pnpm build                   # 产出 lib/index.js 与 lib/client.js（= node scripts/build-client.mjs）
pnpm build:self-test         # 构建器自证（含失败支证明会红）
pnpm test                    # 全仓 vitest 单测
pnpm test <路径>             # 增量：只跑受影响的测试文件
pnpm check                   # 一键自检：六个静态断言 → 构建 → 全仓单测（= node scripts/check-all.mjs）
pnpm check:static            # 只跑六个静态断言
```

单项静态断言脚本（断言逻辑只此一处，归属各自产出单元）：

| 脚本 | 看守的契约 |
|------|-----------|
| `scripts/check-manifest.mjs` | package.json 契约（exports 路径存在性）+ patch 结构 + 依赖键集边界 |
| `scripts/check-no-host-deps.mjs` | 不含 `@deepseek-ai/dsh-client-*` 运行时依赖 |
| `scripts/check-injection-escape.mjs` | 注入行不含结束标签 |
| `scripts/check-require-baseline.mjs` | 浏览器半场 require 字面量 ⊆ 宿主模块基线 |
| `scripts/check-forbidden-tokens.mjs` | 字族 / 字号 / 复合简写 / 宿主几何变量 / theme.register |
| `scripts/check-profile-probe.mjs` | 装错 profile 时 Node 半场报可行动诊断、不误报 |

## 测试纪律

- 增量优先：开发中只跑受影响模块的测试（`pnpm test <路径>`）；项目收尾或跨模块改动跑 `pnpm check` 全量。
- 提交前下限是 `pnpm check:static`（pre-commit 会再跑一遍）。
- `client/theme/host-font-sheet.spec.ts` 是字体复合简写的升级护栏：需要 `DSH_FONT_SHEET` 环境变量指向宿主源样式表 `gradient-shadow-text.css`；缺失时该测试显式失败并在错误信息里给设置指引，不静默跳过。在他机跑全量前先设好该变量。
- 报 vitest 入口缺失时先 `pnpm install`。

## 产物与依赖纪律

- **lib/ 入库**：`lib/index.js` 与 `lib/client.js` 是构建产物，但随仓库交付（git 安装通道要求 clone 后直接可装），不忽略；提交前先构建，产物与源码同批进 commit。
- **先构建再安装**：运行时不安装任何宿主 client 包，`lib/client.js` 只能由本仓构建命令产出。
- **零 npm 运行时依赖**：`dependencies` 为空；宿主供给的能力走 `peerDependencies`（cordis / schemastery / dsh）与宿主模块表。
- **pnpm 唯一包管理器**：`pnpm-lock.yaml` 是唯一权威锁文件（`package-lock.json` 不入库）；`packageManager` 字段固定 pnpm 版本，安装命令一律用 pnpm。
- Node ≥ 18。
- 版本门禁范围在 `engines.dsh` 与 `peerDependencies["@deepseek-ai/dsh"]` 两字段必须一致（机检）；只写 `engines.dsh` 等于没有门禁。

## Git 与提交

- remote 名 = `github`；push 用 `git push github HEAD:<branch>`，必须用户明确授权。
- **完成即提交**：改动验证通过后提交，不留脏工作区；只提交本次会话产生的改动；commit message 用英文。
- 产物目录 `.tmp/`、`.review/`、`test-results/`、`playwright-report/` 不入库（`.gitignore` 已声明），验收证据保存在技能数据目录或临时目录。

## Hooks

- `.githooks/` 随仓交付：`pre-commit` + `install-hooks.sh`（幂等安装器：把钩子拷进当前 worktree 的 git hooks 目录并设 `core.hooksPath`）。
- 本 workspace 内，worktree 就位时 `.bare/hooks/post-checkout` 自动执行安装器；其他环境克隆后手动跑一次 `bash .githooks/install-hooks.sh`。
- pre-commit 内容：跑 `node scripts/check-all.mjs --static`；暂存了 `.agents/workflows/` 下文件时，还要求 `.agents/workflows/scripts/build-workflows.mjs` 存在，并跑其 `--check` 与 workflow 测试（workflow 单源构建门禁）。
- pre-commit 检出的问题必须全部当场修复，禁止 `--no-verify` 绕过。

## 项目级流程路由

项目级技能、reviewer 与 workflow 的随仓根是 `.agents/`（git 跟踪；不采用 workspace 根共享 `.agents` 的形态）。workflow 走单源构建体系：源在 `.agents/workflows/`，由 `.agents/workflows/scripts/build-workflows.mjs` 构建，pre-commit 有对应门禁。

| 场景 | 入口 |
|------|------|
| 技术设计与方案裁决 | tech-design-wf（全局技能） |
| 功能实现 / 修复的开发流程 | dev-flow-wf（全局技能） |
| 审查问题的批量修复循环 | review-fix-loop（全局 saved workflow；项目 reviewer 在 `.agents/reviewers/`） |
| 真实 DSH 宿主验收 | verify-taiji-yang（项目入口，`.agents/`） |
| PR 审查修复 | pr-cr-fix（项目入口，`.agents/`） |

## 领域边界（改代码前必读）

- 不注册第三方主题 id、不写宿主主题偏好（否则「跟随系统」失效）；配色走宿主 token 覆盖层，明暗模式归宿主。
- 不写宿主字族、字号轴与布局几何变量；字体只走复合简写安全重写（只替换字重与行高两段，字号与字族表达式逐字保留宿主原样），圆角走独立子 token。
- 每个贡献点（覆盖层、结构 CSS、槽位、外观行、locale 字典）挂 `ctx.effect` 并返回 disposer，卸载即撤除。
- 持久状态（配色 id、项目与归属映射）存宿主管辖的插件 Config 的 volatile 字段，不用浏览器 localStorage——卸载时插件代码已不再执行，Config 随 profile 行消失才是可达的清理路径。
- 改到上述任一契约时，同步维护对应的静态断言脚本（断言逻辑只此一处）。
