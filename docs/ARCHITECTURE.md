# 架构（当前实际形态）

本文描述 tai-ji-yang-shell 的当前实际架构：一个以 DSH（DeepSeek Harness）组合包形态交付的插件，负责「打开就认得出是太极」与「会话按项目组织」。本文解释每个机制是什么、为什么这样设计。上游权威来源与开发审查规则见 `docs/DSH-PLUGIN-RULES.md`；用户手册（安装/卸载/排障）见仓库根 `README.md`。本包是本仓 pnpm 多包 workspace 的根包；容器级包结构见下节「多包总览」。

## 多包总览

本仓是 pnpm 多包 workspace：`pnpm-workspace.yaml` 声明 `packages/*`，功能型子包逐个落 `packages/<name>/`，每包都是独立的 DSH 插件包，可独立安装到不同 profile，包与包互不牵连。包清单登记两处、一处对账：`scripts/workspace-packages.mjs` 登记每包的构建声明（包名 / 目录 / 浏览器半场入口 / Node 半场产物形态 / preset 登记），并在每次构建与检查时与 `pnpm-workspace.yaml` 的实际包目录对账，两边不同步即失败。容器级协作规范（包边界、逐包构建与检查、依赖与产物纪律）见 `AGENTS.md` 的「包结构」节。

| 包 | 目录 | 职责 | 用户文档 |
|----|------|------|----------|
| `tai-ji-yang-shell`（根包） | `.`（仓根） | 太极视觉身份（染色三层 + 槽位贡献）与项目分组侧栏 | 仓库根 `README.md`（正文主体） |
| `opendesign-design-mode`（子包） | `packages/opendesign-design-mode` | OpenDesign 设计模式：preset 入口 + 设计预览面板 + 资产定位 / 会话组装 / 材质化 / 质量环 / 协议登记 | `packages/opendesign-design-mode/README.md` |

本文以下章节描述根包 tai-ji-yang-shell 的架构；子包架构见文末「子包 opendesign-design-mode 架构简述」节。

## 1. 包形态：单包承载两个半场

本包在 profile 里是单行条目（`cordis.patch.yml` 的 `- id: tai-ji-yang-shell`），两个半场同包交付，因此生命周期一致（同装、同卸、同禁用）：

| 半场 | 源 | 安装后入口 | 职责 |
|------|------|------|------|
| Node 半场 | `index.js` | `lib/index.js`（`package.json` 的 `main` 与 `exports['.']`） | 首次绘制前样式注入、壳信息注入、插件 Config 声明、profile 能力探针 |
| 浏览器半场 | `client/` | `lib/client.js`（`exports['./client']`，`dsh.client` 指向） | 主题覆盖层、槽位贡献、持久通道、项目分组浏览器 |

manifest 关键字段（`scripts/check-manifest.mjs` 逐项看守）：

- `dsh.client.platform: 'web'`：浏览器半场只在 web 承载的 profile（`web`、`desktop`、含 web 应用层的自定义 profile）装载；非 web profile 下宿主静默跳过浏览器半场，Node 半场探针负责给出诊断（见第 2 节）。
- `dsh.client.inject`：8 个**包名**，只决定这些包的脚本先于本包抵达页面（加载排序），与本包源码导出的 inject 服务名是两个同名不同义的机制（见第 3 节）。
- `dsh.bundle.patch: './cordis.patch.yml'`：组合声明，宿主按它把本包行插进 profile。
- 版本门禁双字段：`engines.dsh` 与 `peerDependencies['@deepseek-ai/dsh']` 声明同一范围。宿主的兼容性评估只读 peerDependencies 里名为 `@deepseek-ai/dsh`（或以 `@deepseek-ai/dsh-` 开头）的条目，`engines.dsh` 整段不被读取——只写 engines 等于没有门禁，故两字段必须同时存在且一致。

## 2. Node 半场（`index.js`）

### 2.1 首次绘制前样式注入（职责一）

`apply(ctx)` 订阅宿主事件 `webserver/index-inject`。宿主每次渲染 index 页都 emit 该事件（语义 = 收集当前注入表），本包每次推两行：

- **style 行**：15 个核心 alias token 的声明，每 token 只写一个值表达式 `light-dark(亮, 暗)`——亮暗两支由页面已有的 `color-scheme` 选定，本包不做任何偏好判断。配套一条画布底色规则（排除 darwin 桌面形态：该形态画布由 `.frame` 自绘，且宿主在 darwin 有更高特异性的透明底规则）。
- **global 行**：壳信息，属性名 `__TAIJI_SHELL_INFO__`（`SHELL_INFO_GLOBAL`）。宿主把它渲染成 head 里先于一切脚本的 `globalThis` 赋值，浏览器半场品牌区读它渲染版本行。值 = 本包版本 + 运行中的 DSH 版本；桌面形态从进程 argv 命名的 asar 运行时根读 app-boot 包版本，CLI 形态从插件安装位置向上解析 `@deepseek-ai/dsh/package.json`。任一支解析不到即缺席该字段，品牌区降级只显本包版本。

为什么用 `light-dark()` 而不是在 Node 侧判断明暗：Node 半场读不到页面偏好（偏好属宿主 settings 域）。若用 `@media (prefers-color-scheme: dark)` 自行判断，「偏好=固定暗 + 系统=亮」的组合会整段给错亮支；若以宿主脚本写下的 body 属性为判据，该属性写入晚于首绘。`light-dark()` 以解析期已存在的 `color-scheme` 为准，四种偏好组合从首次绘制起即正确，用户切换偏好时本包无需监听。不支持该函数的引擎让声明整体失效（逐 token 退回宿主配色），失败形态是「不生效」而非「错配」。

选择器特异性是硬约束：宿主把 alias 声明在 `body` 与 `body[data-ds-dark-theme]` 两处，首次绘制前样式用 `html body`（压过前者）与 `html body[data-ds-dark-theme]`（压过后者的默认值）两个选择器共写同一组取值，属性挂载前后都不会跳支。

### 2.2 插件 Config 声明（职责二）

`Config` 导出声明四个 `.volatile()` 字段，命名空间 = 本包 profile 行 id：

| 字段 | 内容 | 说明 |
|------|------|------|
| `appearance` | 上次点选的配色 id | 缺席 = 从未点选，回落包默认色玄 |
| `projects` | 项目表（`{id, name}` 数组，数组序即排序） | 空数组缺省由 sanitize 收敛 |
| `assignments` | 会话归属映射（SessionId → projectId） | 映射到空串或无映射 = 默认项目 |
| `expanded` | 展开中的项目 id 列表 | 悬空 id 视为未展开 |

为什么 Config 在 Node 半场导出：宿主的设置命名空间取自插件模块的 `Config` 导出，package.json 没有任何 Config 声明通道；浏览器半场不声明 Config 时其持久读写整段失效。为什么 `volatile()` 不可省：宿主的 volatile 表单机制只保留 volatile 字段，一个都没有的 Config 命名空间不会出现在设置描述里，读写恒被拒。volatile 的语义是「值持久、更新不触发插件重挂载」——改一个项目名不该让整个浏览器半场重新装配。

不设 default：默认色玄是包内默认而非持久值，用户没点选过时字段应当缺席；项目字段的缺省由浏览器半场装载期 sanitize 兜底脏数据。

### 2.3 profile 能力探针（职责三）

宿主对非 web profile 静默跳过浏览器半场，用户只能看到「界面毫无变化」。Node 半场在装配期探测 `ctx.get('webServer')`（web 承载层提供的唯一服务名），缺失时记一条指向本包、含改装路径的错误日志。判定依据是确定性事实而非时间窗：宿主按并发装配各行，webserver 行自身带依赖注入，同步快照会在正常 web profile 上误报——故先查服务在场，再等装配期结算（loader await）后重读一次，仍缺失才报告。探针不阻塞装配（在装配里等待会自锁），以独立微任务链推进，反注册器登记进 `ctx.effect`，插件卸载后不再补报。缺 web 承载时注入订阅照旧在位（该事件永不 emit，监听惰性无害），装配不因探针结果分叉——这是「不注册任何会失败的槽位贡献」纪律。

### 2.4 取值口径：首次绘制最小集

Node 半场只承载默认色玄这一套的「宿主默认 palette 之上的最小差异」（15 个核心 token），不建六色副本。六色双模表的唯一权威在浏览器半场 `client/theme/tokens.ts`；选了非默认配色的用户，首次绘制先呈现玄、页面装载后立即被浏览器半场覆盖层换成所选配色，偏差窗口只在装载区间。把六种配色都搬进 Node 侧等于维护两处取值一致性，是明确不做的事。首次绘制 15 token 与浏览器半场基值表逐 token 同值，由 `client/theme/tokens.spec.ts` 的漂移断言看守——否则默认色用户在页面装载瞬间会看到一次跳色。

## 3. 浏览器半场（`client/`）

### 3.1 物化契约与装配序

产物是一段 `window.__ModuleLoader__.load({ id, factory })` 注册脚本；页面装载时宿主调用 factory（传入模块表 require），样式注入与 bundle 体在此时执行，最终返回 `module.exports` 并调用其 `apply(ctx)`。

装配序是硬约束，`client/apply.ts` 是唯一装配入口：

1. **locale**（内联双语字典，命名空间 `taiji.shell`）——必须最先：声明了 `locale` 的槽位由宿主渲染机合成翻译座位，缺字典会报错；之后所有槽位注册都声明该命名空间。
2. **持久通道**（`AppearancePersistence`）——只读初值不写；主题层首装表要取它读到的持久值。
3. **主题覆盖层 + 结构覆盖层**——首装即注册（新装用户打开就必须看到默认色玄，不等第一次点选）。
4. **持久值镜像订阅**——持久值首次到达时换层；经 `ctx.effect` 托管。
5. **ProjectStore**——projects/assignments/expanded 三字段的会话内权威；设置页与侧栏浏览器共用同一实例。
6. **品牌三槽** → **外观行** → **composer 快速配色 chip** → **设置「太极」分区** → **项目分组浏览器** → **会话头状态图标**（详见第 7 节总表）。
7. **反注册持久通道镜像订阅**——form 本体归宿主 ConfigForms 服务所有（跨插件共享），本包只撤自己的监听。

`client/apply.ts` 导出 `inject = ['slots', 'locale', 'theme', 'configForms', 'remote', 'sessions', 'uiWorkspace']`——这是**服务名**声明：宿主 fiber context 是带拦截器的 Proxy，未声明就读 `ctx.<service>` 会直接抛错，浏览器半场整体装载失败（页面白屏而首次绘制前样式照常注入的半死态）。它与 manifest 的 `dsh.client.inject`（包名，加载排序）不可互相替代，两者都要。该声明由机检看守：`scripts/check-manifest.mjs` 断言这条导出形态存在，并强制其中前五项（slots / locale / theme / configForms / remote）必须都在声明内；`sessions` 与 `uiWorkspace` 是项目分组浏览器消费的服务（见第 8 节），按装配入口实际消费的宿主服务如实声明，不在机检强制清单内。

### 3.2 CSS 交付形态

`client/` 下全部 `*.css` 由构建脚本按路径序拼接为一段纯文本，factory 执行时以固定 id 注入一个 `<style>` 进 `document.head`（同 id 已在则覆盖内容，幂等）。不走 CSS Modules：类名隔离靠 `taiji-` 前缀命名约定。例外是会话头与 hero 的**宿主侧重塑 CSS**（第 9、10 节），它们选择宿主元素而非本包类名。

## 4. 构建链与安装链

构建（`node scripts/build-client.mjs`）：

1. esbuild 打包 `client/apply.ts`（CJS、目标 es2022、JSX automatic runtime、不压缩、inline sourcemap）。external 清单 = 宿主模块基线 11 项（见 `docs/DSH-PLUGIN-RULES.md` 第 3 节），产物 require 全部落在基线内。
2. 套 factory 壳（固定 id = 包名、CJS 脚手架、CSS 注入块置于 bundle 体之前），壳结构逐条断言 + 模块基线审计，失败不落盘。
3. `lib/index.js` = `index.js` 逐字拷贝（纯 ESM 单 import，无需转译）。两个半场一起落盘，不产出「只有半个产物」的中间态。

安装（`dsh plugin add`）：目录作为 `link:` 依赖写进 profile 的 package.json，本包因声明 `dsh.bundle` 被追加进 `dsh.profile.bundles`，patch 行进 profile 组合。git 安装不保证在安装期执行构建，本包也不声明 `prepare`/`postinstall`，因此目标 commit 必须已含 `lib/` 产物——这是 `lib/` 随仓库交付的原因（见 `docs/DSH-PLUGIN-RULES.md` 偏离登记 P-5）。

首次绘制时序不变量（两种宿主形态同构）：宿主 emit 注入表（collect）→ 行渲染进 head（web 形态在 HTML 文本解析期即生效；desktop 形态在 ready 后逐行追加）→ 启动门控放开 → 应用挂载。样式行必须在门控放开前进 document，由 `tests/injection-precedes-mount.spec.ts` 以 mock 形态按事件顺序断言。

## 5. 主题层（`client/theme/`）

### 5.1 取值权威与跨族语义

`tokens.ts` 是六色取值的唯一权威：六色（暗族 玄/黛蓝/暖墨，亮族 皓/青墨/朱印）× 20 个 alias token 的 `{light, dark}` 双模表，逐条抄自太极侧样式源（`packages/renderer/src/style.css`），不臆造。跨族回落语义 = 太极自身解析语义：预设色只在所属族内生效，跨族列回落族默认值（暗族三色的亮列 = 皓的值，亮族三色的暗列 = 玄的值）。

### 5.2 覆盖机制

宿主 `theme.overrideTokens(source, tokens)` 按 source 叠一层覆盖并返回 disposer；同 source 重调即整层替换（无撤销重建、无闪烁）。换色 = 同 source 换新表；**明暗模式与跟随系统始终归宿主偏好**，本包一次都不写它（换配色与改明暗是两个独立意图；跨族点选不改宿主偏好，代价由外观行同屏的三段模式按钮消解）。覆盖层 disposer 是普通闭包、无 fiber 绑定，必须挂 `ctx.effect` 才随插件卸载执行；effect 里读的始终是最新一层的 disposer（按「每次换层登记新 effect」做会在 fiber 上堆积历史层且撤不掉现行层）。

### 5.3 三层染色

1. **静态调色板重定义**（`palette.ts`）：把宿主 `--dsw-static-deepseek-*`（品牌蓝 10 档）整层改成灰绿阶梯（强调档随所选配色 accent 派生），`--dsw-static-neutral-bluish-*`（带蓝偏中性 22 档）整层去蓝为锌灰/纸白阶梯。宿主约百个经 `var()` 引用这两张表的 alias 自动跟随，宿主将来新增的同源 alias 也自动吃到——改调色板一次胜过逐个枚举。`--dsw-static-blue-*`（终端 ANSI 功能色）等其余 static 表不动，保住功能色语义。静态表与 alias 表在同一主题层一次叠入：换色时整层替换，alias 与 static 调色板永远同色相。
2. **alias 职能分色**（`tokens.ts` 的 20 token）：15 个核心档（背景/文字/边框/状态色）+ 5 个职能档——链接保持太极正蓝（不随品牌色）、对话气泡用中性抬高层、深度思考标签用思考紫。
3. **字体复合简写安全重写 + 圆角**（`structure.ts`，独立结构层）：圆角四档映射宿主 radius 前四档；30 条 `--dsw-font-*` 复合简写整串重写——只替换字重与行高两段（太极 500/600/700 三档与 1.32/1.62/1.4 三档行高），字号与字族表达式逐字保留宿主 `var()` 原样，⌘+/⌘- 与字族选择不受影响。为什么重写复合简写：宿主组件只消费复合简写，独立字重/行高子 token 的消费点为零——只覆盖子 token 不会产生任何视觉效果。安全形态与宿主源的对账护栏见 `docs/DSH-PLUGIN-RULES.md`。

`resolve.ts` 是纯求值模块：不接 ctx、不碰 DOM、不调宿主写入口；对源码剥注释后有静态断言（该纪律防「求值函数偷偷接上宿主偏好写入」）。

## 6. 持久通道

唯一持久通道 = 插件 Config（命名空间 = profile 行 id）。为什么不用 localStorage：卸载时本包代码已不再执行，没有任何执行者能删浏览器存储里的键，「卸载即清除」永远不可达；插件 Config 存在 profile 组合的本包行上，行被移除配置即随之消失，不需要本包参与清理。

通道形态（配色与项目域共用同一套模式，`persist.ts` 与 `projects/store.ts`）：

- 读 = 镜像快照 `getSnapshot()`，三态：`loading`（未答）/ `ready`（已服务）/ `unavailable`（命名空间未被服务）。
- 写 = 整字段写 `form.set(field, value)`，带 revision 栅栏；被拒后本层用重读出的新栅栏再试一次（宿主拒绝时自做的那次重读只进镜像、不重放写入，必须有人补发）；连续失败显式上报，失败文案四段式（本包 + 位置 + 事实 + 出路）。
- 会话内权威 = 内存值：写入失败不回退当前会话的呈现，重载后回到持久值或默认。配色域用户点选后本会话不再采纳迟到的持久值；项目域外部快照始终采纳（多窗口编辑的数据，外部事实才是收敛方向），唯一例外是本会话有写入在途时跳过镜像通知（在途期间的通知可能是写前旧值，采纳等于回滚）。
- 项目域整写整读：数组/dict 字段不做深层路径写，任何变更 = 全量读 → 内存改 → 整字段写回（宿主的 volatile 路径判定不下钻数组索引）。
- 悬空数据（指向已删项目的映射/展开 id）无危害：消费侧视为未映射/未展开，惰性容忍，只有删除项目动作本身剔除其映射。

默认项目 id 固定为空串：空 id = 「未归类兜底聚合」的标志，不可重命名不可删除；「归回默认项目」= 删除映射键，不写空串占位。

## 7. 槽位贡献总表

| 宿主槽 | kind | 本包身份 | 优先级/排序 | 占位策略 |
|--------|------|----------|------------|----------|
| `conversation.hero.brand.mark` | single | hero 品牌区组件 | -5（-10..0 窗口内避让） | 替换宿主鱼标回落 |
| `sidebar.brand.mark` | single | 双鱼标小标 | -5（同上） | 同上 |
| `sidebar.brand.name` | single | 品牌栈（产品名 + 版本行） | -5（同上） | 替换宿主本地构建文案 |
| `settings.general.item` | list | id `appearance` | priority -5、order 5 | **同 id 遮蔽**内置外观行（另起一行会出现两条「外观」） |
| `conversation.input.left` | list | id `taiji-appearance` | order 100 | 新格追加，不遮蔽 |
| `settings.section` | list | id `taiji` | order 25（末位） | 新格追加；插件分区排在宿主内置分区之后 |
| `sidebar.workspaces` | single | 项目分组浏览器 | -10 起向下找空闲 | **整槽替换**（见第 8 节） |
| `conversation.session.header.actions` | list | id `taiji-status-icon` | priority -1 | 追加，多占用者共存（见第 9 节） |

single 槽的槽规则 = 按 priority 升序、数值最小者渲染，同优先级二次注册直接抛错。本包注册前先读槽内现有占用，目标值被占则步进找最近空闲值（品牌槽界内 -10..0；浏览器槽下界 -100），区间占满则**不注册并告警，回落宿主原生占用者**——失败可见，不静默错位，也不让装配失败。list 槽注册必须带 id（条目身份，缺 id 宿主直接抛错）。

外观行与 composer chip 共用同一配色控制器实例：两处点选指向同一持久通道与换层，无双写。「太极」设置分区只读当前配色状态 + 项目管理，刻意不透传换色入口——换色的唯一写入口是外观行（与 chip），状态页出现第二个写入口会打破这一分工。

## 8. 项目分组浏览器（`client/projects/`）

`sidebar.workspaces` 整槽替换：本包以负优先级压过宿主官方工作区列表，渲染太极式项目分组列表。替换是形态级的——分组轴整个换成插件侧 Project（与宿主目录工作区正交的逻辑分组概念），与官方列表不可折中共存。注册不传 children：宿主在该槽的 entry 上仍声明着子槽，同名声明会抛错；动作服务（打开/新建/归档/置顶走宿主 `uiWorkspace`，重命名走宿主 `sessions` 公开合同）经闭包捕获，不经 props。降级路径见第 7 节。

派生层 `derive.ts` 是纯函数：输入 = 宿主三路事实（会话列表快照/状态表/工作区集合）+ 本包项目数据 + 当前选中 id，输出 = 分组视图模型，组件层零派生逻辑。宿主语义逐条照抄（当前选中判据、行可见性、行状态优先级、子会话计数），两处刻意差异登记在案：分组轴换 Project、blank 当前会话置顶组首。行状态判据（待交互 > 运行 > 完成未读 > idle）与会话头图标共用同一套优先级。

新会话归组：点组头「+」→ 宿主新建会话 → 记 pending 项目 id 与当时的当前会话 → 快照出现「新建且无映射且是当前选中」的会话时消费 pending（一次性）；当前会话漂移到不可消费形态时 pending 过期清除——pending 不永久劫持后续新建的会话。

展开态持久：单一数据源 = store 快照，本地开合走「乐观覆盖先行 + 整字段持久」，覆盖带写时刻的快照引用作基线，store 一换引用覆盖即失效——过期的本地集合永远不会整写回 store 销毁持久值。

## 9. 会话头（`client/head/`）

架构裁决：**不整槽替换** `conversation.session.header`。宿主槽位的子槽渲染座位只注入给自带 children 声明的注册项，而子槽声明权唯一、在宿主手里——整槽替换的占用者拿不到渲染座位，utilities（「打开方式」按钮）与 corner（右侧栏开关）两个子槽就失去渲染者，换头等于丢按钮。故采用「宿主 DOM 保留 + 全局 CSS 重塑 + actions 槽追加」的组合：

- **CSS 重塑**（`session-header.css`）：40px 单行容器、标题 14px 次要色、第二行标签页压成分段控件并归位行尾；隐藏宿主会话 More actions 与只读预设标签，保留视图 More 菜单，用于视图折叠和自定义。选择器纪律：宿主类名带构建期 hash、随宿主构建漂移，故一律使用**结构属性或 local 名子串**（`[class*="titleRow"]`、`[role="tablist"]`）；整表作用域收在会话头常驻结构属性的 `:has()` 之下，不外溢。两代宿主 DOM 结构差异（标签页单层/双层）在同一张表内按层分流命中。
- **actions 槽追加**：13px 会话状态图标（run 旋转 / warn / done / idle 不渲染），四态派生与 `derive.ts` 同判据。actions 是 list 槽，多占用者合法共存，追加不遮蔽。

## 10. 品牌区（`client/brand/`）

- **双鱼标几何**：6 条 SVG path 逐字抄自太极侧 `TaijiLogo.vue`，几何禁改（改几何回源头复刻）；currentColor 继承行内文字色，随明暗令牌自然反转，不引入第二套取色。**不旋转**：太极侧鱼标动画默认开，本包刻意静态——宿主自身品牌标全是静态形态，补动画属设计没要求的视觉扩展（此决策可被后续裁决翻转）。
- **hero 首屏品牌区**：放大双鱼标 + 产品名 + 欢迎语，竖排居中。宿主槽容器无裁剪（侦查证据在源文件头注释），尺寸自定。宿主自己的标题组不受该槽控制，与本品牌区同屏会双欢迎语——本包注入一条通过 `:has()` 选择本组件所在容器的作用域 CSS 隐藏它：不删宿主 DOM、可逆、卸载即回滚。
- **侧栏品牌栈**：产品名（文字 span，取值抄太极侧词条）+ 版本行（读 Node 半场的壳信息 global；缺席降级只显产品名）。

## 11. locale

内联双语字典（`locale.ts`，命名空间 `taiji.shell`），经宿主 locale 服务注册，不建多语言 JSON 文件族——本包文案量小，拆文件族是零收益目录开销。zh/en 的 key 集相等与非空由单测断言。词条取值逐条抄太极侧对应词条；槽位注册声明 `locale:` 后宿主渲染机合成翻译座位，语言切换由宿主重读 thunk 跟随，无需重新注册。

## 12. 禁用与卸载语义

- **禁用（disable）**：fiber 卸载，全部贡献点随 `ctx.effect` 反序撤销——token 覆盖层、槽位注册、locale 字典、注入订阅、镜像订阅、探针待决判定。Config 数据留存。
- **卸载（remove）**：profile 行移除，Config 随行消失（配色选择、项目数据一并清除），不需要本包代码参与清理。本包从不写宿主主题偏好，卸载后宿主外观回到装前原状。曾点选过配色的 profile 上，宿主会把 Config 物化进用户 patch 层且移除时不清该行，留下一条悬空引用警告——这是宿主对任何声明 Config 的插件的统一行为，不是本包缺陷，手工删该行即可消除。
- 槽位注册的 disposer 由宿主挂进调用者 fiber 的 effect（宿主契约）；覆盖层 disposer 无 fiber 绑定，由本包显式托管——两类途径最终都随 fiber 卸载执行，三处痕迹（覆盖层/槽位/持久记录）在卸载后全部消失，机器可判部分由 `tests/uninstall-cleanliness.spec.ts` 看守。

## 13. 边界（明确不承诺）

- 布局几何（栏宽、卡缝、顶条高度、对话区宽度、桌面材质）归宿主私有，本包不写不对齐。
- 代码高亮、工具 JSON 面板、附件文件图标的功能色保持不动（这些颜色承载高差异化信息，改色会削弱信息功能）。
- 字号与字族轴完全交回宿主；分区独立字号不做（宿主字号维度按内容类型分轴，与按界面分区定档的两套维度对不上，硬映射只能造出无语义档位）。
- 第三方主题插件不承诺共存（覆盖层叠加结果不可保证）；产品图标不替换（逐 id 图标契约需逐个重制）。

## 子包 opendesign-design-mode 架构简述

子包交付 OpenDesign 设计模式：新会话选择器出现「OpenDesign 设计模式」preset 入口，定位本机 OpenDesign（下称 OD）安装资产驱动设计会话，产物在右侧栏设计面板预览；未装 OD 时入口显式降级提示。形态与根包同构的双半场：Node 半场源码在 `lib/*.ts`（经 esbuild transform 成同名 `.js` 同仓入库，不打包——每个 exports 子路径是宿主 loader 独立 import 的入口），浏览器半场在 `client/`。本节是索引级简述，模块级设计裁决以各源码文件头注释为权威（内含设计编号的依据链）。

- `cordis.patch.yml`：两行 insert——本包主行（`id: opendesign-design-mode`，承载包级生命周期与跨子插件协调）+ 设计模式 preset 行（`@deepseek-ai/dsh-agent-preset`，新会话选择器入口）。preset 的 `config.plugins` 无隐式工具基线，全部子插件逐项显式声明：DSH standard 模式全量基线（含跨版本缺包行的 disabled 声明）+ 本包四子插件（persona / doctor 命令 / 设计面板 client / 产物伺服 host），其注册声明由 `scripts/check-manifest.mjs` 逐项断言。
- `lib/index.js`：包主行的 host 半入口——订阅宿主 `agent-preset/selected` 事件，在会话选定设计 preset 时触发设备壳文件材质化；同一事件接线质量环监听（`startQualityWatchForSession`，presetId 过滤，监听器集合挂进程 effect），链路 = watcher 监听 → lint 检查 → feedback 仅 P0 回注。
- `lib/persona.ts`：persona 子插件——启动时探测 OD 资产，探测成功则调用组装器产出设计模式系统提示词并注册为 preset 作用域 section；探测失败以携带恢复动作的 diagnostic 激活失败，宿主把该 preset 标记 broken（选择器自动过滤、设置页显示诊断与恢复动作），绝不进入提示词残缺的坏会话。
- `lib/locate/`：OD 资产定位。`manifest-discovery.ts` 搜索式清单发现（受限深度遍历找 `open-design.json` + 内容特征校验 + roster 核验，缺件显式失败）；`version-profile.ts` 版本画像（多候选按「环境变量覆盖 > 渠道优先级 > 路径序」选定，终态三分——可用 / missing（未安装）/ error（已装但资产损坏），供 persona 区分降级文案）+ 默认资产读取器；`asset-catalog.ts` 资产目录摘要扫描（craft / design-templates / design-systems 三目录逐包摘要与三态降级，compose 三个自产段与 doctor ⑨ 的唯一数据源，路径由 `version-profile.ts` 的 `deriveCatalogDirs` 派生）；`platform.ts` / `platform-macos.ts` 平台策略（枚举候选资源根，V1 仅 macOS 有实策略，其余平台留接口空位返回空候选）。
- `lib/compose/`：设计会话组装。`bundle.ts` 组装编排（从清单读声明路径 → 逐字直读 core / orchestration 两文本 → 改写 → 占位符 → 事实块 → 路由指令段）；`context-facts.ts` 基本事实块（设备壳可用性 + layout.css 指针两个最小字段）；`placeholders.ts` 占位符替换（OD 升级防御，渲染经与路由段共用的白名单过滤）；`task-routing.ts` 路由指令段（列出八类可交付任务及其任务档路径 + 形状包清单段 + ppt 条目 deck 协议指针，任务档由模型首轮问答选定后用文件工具自读）；`design-systems.ts` manifest 感知设计系统清单段（name + category + USAGE/components/tailwind 深层文件指路）。
- `lib/materialize/copy.ts`：材质化器——会话创建时把设备壳支撑文件与 deck 协议文件（共 5 个小文件，含 `.od-frames/deck-framework.md` 三段结构：适用限定句 / Existing deck 兼容段 / New deck 规范段——文件名对齐 OD 上游管理名约定，OD 升级后任务档 fallback 直达）无条件全量重铺进会话工作目录的 `.od-frames/` 子目录；纯复制器语义，源侧只读，写侧收在 `.od-frames/` 约定子目录内，失败 fail-fast 由包主行监听记日志（不阻断会话）。
- `lib/rewrite/`：降级改写器。`rules.ts` 五族规则（cli-path / ui-guidance / two-turn-protocol / question-form / media-missing）按资产代际分单（代际按文本标记探测，每条规则声明生效代际）；`apply.ts` 逐条应用并产出逐条命中记录——代际适用规则零命中即规则失配信号，是 OD 升级漂移的第一发现通道。
- `lib/protocols/`：协议文本登记层（本轮 AX3 范围化例外——安装盘无静态源、正源在 OD 源码仓的 daemon 侧协议文本，派生副本进插件仓并承担对账义务）。`panel.ts` 评审团协议骨架（五面板角色/输出标记语法/收敛规则；阈值与轮数从 preset config 读、缺省沿用 OD 缺省 8.0/3；正源 brand/skill 输入槽转为协议段内占位指引）；`deck.ts` deck 协议三段结构派生；`anchors.ts` 版本锚登记与比对纯函数（正源 commit + 骨架 sha256）。对账通道 = doctor 第⑩节。
- `lib/quality/`：质量环。`lint.ts` 反 AI 味检查器纯函数（检查项清单派生自 OD daemon lint-artifact 并附出处标注与版本锚；纯文本匹配零 npm 依赖）；`watcher.ts` 会话目录监听（fs.watch 递归 + .html/.htm 过滤 + 排除 `.od-frames/` 与 `.od-quality/` + 防抖 + 完整性哨兵（文末 `</html>` 判定）+ 快照豁免集（按 report.jsonl 身份记录三类命中分类）+ 错误自毁写回记录）；`feedback.ts` P0 回注器（steer/followup 双通道经宿主 agents 服务；UserMessage 字面量构造，source.kind='opendesign-design-mode/lint' 自报身份 + 作用域句；内容指纹去重 + 每会话每文件回注上限；P1/P2 与超限发现落 `.od-quality/report.jsonl`）。机器检查是宿主侧行为，不解除模型 ship-on-write 禁令；监听器生命周期 = 进程 effect + 错误自毁（宿主无会话结束事件）。
- `lib/serve/`：产物伺服。`artifacts-route.ts` 注册 webServer 前缀路由 `/opendesign/artifacts/<sessionId>/<产物相对路径>`（伺服根 = 会话工作目录，不可得即 404，绝不回退部署级目录；每请求先过鉴权围栏，路径拼接后防穿越校验）；`session-cwd.ts` 是会话工作目录的唯一解析通道（材质化写入目标与伺服根共用同一函数）。
- `lib/commands/doctor.ts`：`/opendesign-doctor` 诊断命令——十一节结构化文本报告（V1 八节：安装形态与资源根、清单路径与版本、roster 完整性、改写规则命中清单、材质化状态、资产代际提示、逐项恢复动作、止损警示；+ ⑨ 资产丰富度（craft 册数/形状包数与解析异常/manifest 命中/清单段注入行数与降级恢复动作）+ ⑩ 协议与检查器对账（版本锚、源码仓 clone 探测——clone 路径经命令参数登记不写死、ok/drift/无法比对三态）+ ⑪ 质量发现（`.od-quality/report.jsonl` 读侧：发现清单与监听器状态——状态按最后记录推定呈现，resume 新进程未刷新时如实标注））。
- `client/`：浏览器半场。`preview-tab/index.tsx` 注册右侧栏 design tab 与面板体（地址可解析为产物时呈现 iframe 视图，否则回落产物列表，行点击在本面板内载入）；`preview-tab/artifact-list.tsx` / `iframe-view.tsx` / `locales.ts` / `panel.css` 是面板的产物列表、iframe 视图、双语字典与样式；`present-card-link.ts` 是产物地址契约（present 交付卡片点击 → 设计面板的路由链路，tab 注册与面板体共用同一份解析判定）。

用户侧说明（功能、安装、诊断命令、V1 边界）见 `packages/opendesign-design-mode/README.md`。

---

静态自检与升级护栏的分工、上游权威来源、有意偏离登记（含本文提及的整槽替换、静态调色板重定义、复合简写重写、`lib/` 入库、零运行时依赖等形态的审查口径）见 `docs/DSH-PLUGIN-RULES.md`。
