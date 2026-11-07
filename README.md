# tai-ji-yang-shell

太极（TaiJi）的视觉身份插件，以 **DSH 组合包**（bundle）形态交付：装进 DeepSeek Harness（下称 DSH）的 web 类型 profile 后，打开即呈现太极的六种配色、圆角与字重、双鱼标与产品名、设置页的外观行。

本包只负责「打开就认得出是太极」这一层。对话流、会话管理、模型切换、工具调用、右栏面板等日常能力全部走 DSH 原生，本包不接管、不替换。

一个包同时承载两个半场（单包 = profile 里的单行条目，两个半场的生命周期因此一致）：

| 半场 | 产物 | 职责 |
|------|------|------|
| Node 半场 | 源 `index.js`；安装后入口 = `lib/index.js`（`package.json` 的 `main`） | 订阅宿主 `webserver/index-inject`，把首帧样式行推入注入表；装载期检查 profile 是否具备 web 承载能力并给出可行动诊断 |
| 浏览器半场 | `client/` → 安装后的 `lib/client.js` | 经宿主 `window.__ModuleLoader__.load({ id, factory })` 契约物化；装配主题 token 覆盖层、结构值（圆角与字重/行高）、品牌槽与外观行，以及持久状态通道 |

## 前置条件

- **DSH**：需满足本包的 `engines.dsh` 范围 `>=0.1.7-rc.2 <0.3.0`（见「版本门禁」）。
- **pnpm**：`dsh plugin` 把参数原样转发给 pnpm，因此安装与卸载要求 PATH 上有 pnpm。
- **构建机**：Node ≥ 18（打包器 esbuild 0.25 的要求）。
- **产物先构建、再安装**：本包运行时不安装任何宿主 client 包，`lib/client.js` 必须由本仓的构建命令产出（见下一节）。

## 构建

`package.json` 的 `files` 只带 `lib/`、`cordis.patch.yml` 与 `README.md`，因此安装的前提是先把产物构建出来：

```bash
pnpm install                      # 安装 devDependencies（打包器）
node scripts/build-client.mjs     # 产出 lib/index.js（Node 半场）与 lib/client.js（浏览器半场）
```

- 构建只依赖本仓与 npm 上可得的通用打包器，不引用任何 DSH 源码仓库路径。
- 包管理器统一为 pnpm，唯一权威锁文件 = 仓库根的 `pnpm-lock.yaml`（npm 的 `package-lock.json` 不入库：pnpm 不读它，混入库会让复现构建失去基准）。
- 产物自带自检：浏览器半场的 `require` 字面量必须落在宿主模块基线内、注入行不得含结束标签、被禁 token 不得出现。
- 首次 `pnpm install` 可能被 pnpm ≥10 拦下打包器的安装脚本，按「排障 → build scripts approval」处理。

## 安装

### 本地路径安装

```bash
# 1. 取本仓并构建（上一节），得到一个同时含 lib/index.js 与 lib/client.js 的目录
# 2. 装进 web 类型 profile
dsh plugin --profile web add <本仓绝对路径>
# 3. 启动
dsh web
```

`dsh plugin add` 会把这个目录作为 `link:` 依赖写进 profile（相对路径会被解析成绝对路径），并因为本包声明了 `dsh.bundle` 而把它追加进 profile 的 `dsh.profile.bundles`。tarball 方式记的是 `file:` spec。装完用 `dsh --profile web --dump-config` 能看到本包这一层（以 `# == tai-ji-yang-shell` 开头）。

### git 安装

```bash
dsh plugin --profile web add git+https://github.com/zhushanwen321/tai-ji-yang.git#<commit-sha>
```

git 安装拉取的是**源码，不是构建产物**：pnpm 只在包声明了 `prepare` 脚本时才会在安装期构建，而本包不声明 `prepare`、也不定义 `postinstall`。因此从 git 安装前必须确认目标 commit 已包含 `lib/` 产物；否则改成下面两种方式之一：

```bash
# 构建产物打包后安装（推荐：不需要任何安装期构建权限，也不依赖 pnpm 的 prepare 放行）
pnpm pack                                  # 产出 tai-ji-yang-shell-<version>.tgz
dsh plugin --profile web add ./tai-ji-yang-shell-<version>.tgz
```

无论本地路径、tarball 还是 git，都建议锁定具体 commit 或具体版本，避免后续推送悄悄改变实际运行的代码。

### 桌面应用（desktop profile）

桌面应用独占 `desktop` profile —— 系统 PATH 上的 npm 版 `dsh` 会直接拒绝（`profile "desktop" is managed exclusively by the Electron application`），必须改用**桌面应用自带的 CLI**（`DeepSeek Harness.app` 内的 `runtime/cli/bin/dsh`，它的 `desktop-host` 入口被授予 desktop profile 的管理权限）：

1. 先启动一次桌面应用，让它初始化 `desktop` profile；
2. **完全退出**桌面应用，然后用应用自带的 CLI 安装：`<应用内>/runtime/cli/bin/dsh plugin --profile desktop add <本仓绝对路径>`；
3. 重新打开桌面应用。

### 卸载

```bash
dsh plugin --profile web remove tai-ji-yang-shell
```

卸载会同时移除 profile 依赖与对应的组合包层：页面重载后本包写下的 token 覆盖层与槽位贡献撤除，配色选择随 profile 行一并消失，宿主外观回到装前原状（本包从不写宿主主题偏好）。

## profile 适用性（三类）

本包的浏览器半场只在 `dsh.client.platform === 'web'` 的 profile 里装载；非 web 类型 profile 下宿主会静默跳过浏览器半场，因此本包在 Node 半场加了一条指向本包的诊断日志。

| 类别 | profile | 结果 | 说明 |
|------|---------|------|------|
| ① web 类型 | `web`、`desktop` | 两个半场都装载，界面生效 | 呈现太极配色与品牌位，设置页出现外观行 |
| ② 非 web 应用型 | `headless`、`sdk`、`sdk-minimal`、`acp` | 只有 Node 半场装载，浏览器半场不装载 | 这些 profile 没有 web 承载，界面不会有任何变化；宿主日志里有一条明确指向本包的错误，说明只支持 web 类型 profile |
| ③ 自定义 profile | `dsh plugin --profile <name> add ...` 建出的任意 profile | 取决于它是否含 web 承载层 | 需要 profile 的 bundle 列表含 web 应用层（例如由 `dsh --profile <name> --from-default-profile web` 建出的 profile）；只含 base 的自定义 profile 归入类别 ② |

类别 ② 的「装上但界面无变化」是该类 profile 的正常表现，不是本包故障：按日志提示改装到 web profile 即可。

## 版本门禁

本包声明：

```json
"engines": { "dsh": ">=0.1.7-rc.2 <0.3.0" }
```

- 范围取宽（覆盖当前主版本的全部 rc，直到下一个 minor 之前）：DSH 的 rc 迭代属于常规发版，不该把本包挡在门外；上界 `<0.3.0` 挡住破坏性升级。
- 门禁语义是「不满足即阻止」：宿主在安装与 profile 启动时拒绝，并给出可行动的提示，而不是装上后运行时崩溃。
- 本包**不**在 `peerDependencies` 里声明任何 `@deepseek-ai/dsh-*`：一旦声明，宿主会改用 peer 门禁，与宽范围门禁冲突。
- 版本行为因宿主版本而异：0.1.7 的 `plugin` 命令不检查 `engines.dsh`（写任何值都不影响该版本安装）；0.2.2 起按范围拒绝并给出豁免命令。落在范围外且已确认兼容时，可显式豁免（**承担崩溃与数据丢失风险**，只对该包与该 DSH 版本的组合生效）：

```bash
dsh plugin --profile web allow-version tai-ji-yang-shell@<版本> --dsh-version <当前 DSH 版本> --accept-risk
```

## 已知差异（明确不承诺）

布局几何归宿主私有，本包不写、也不承诺对齐：栏宽、卡缝（4px 分隔）、窗口顶条高度、对话区宽度、mac 材质（vibrancy）。装了本包后这些几何与宿主原生一致，而不是太极桌面版的几何。

其余登记差异：

- **代码高亮 / 工具 JSON 面板 / 附件文件图标**保持宿主自带的彩色字面色板（不染成太极灰阶）：这三处是内容区的高差异化信息载体，改色会削弱其信息功能。
- **字号与字体**完全交回宿主：本包不写字族与字号轴，⌘+/⌘- 与字体选择照常生效。
- **第三方主题插件**不承诺共存：本包以 token 覆盖层表达配色，与其他覆盖层叠加的结果不做保证。
- **产品图标**不替换：宿主逐 id 的图标契约需逐个重制，不在本包范围。
- 装错 profile（非 web 类型）时界面不会有任何变化（见「profile 适用性」类别 ②）。

## 排障

**1. 装完界面没有任何变化**

按顺序核对：① 装的是不是 web 类型 profile（非 web 类型见「profile 适用性」类别 ②，日志有本包诊断）；② 是否已按「非 HMR profile 需停机重启」重新启动；③ DSH 插件页里本包是否已启用；④ `lib/client.js` 是否真的构建出来了（只产出 Node 半场时浏览器半场不会物化，宿主会报 client bundle 缺失）。

**2. 非 HMR profile：装完必须停机重启，不能即时生效**

有 HMR 的应用型 profile（`web`、`desktop`，base 的 `hmr` 行在 profile 上下文里是启用的）装完即生效；没有 HMR 的 profile（`headless`、`sdk`、`acp` 显式关掉 base 的 `hmr` 行，`sdk-minimal` 不基于 base 因此也没有 hmr 行）在装完新包后返回 `restart-required`（0.2.2 起还附带 `restartReason: no-hmr`），含义是「这个 profile 只在启动时应用变更」。处置：停止 DSH，再执行一次同一条 `dsh plugin ... add`，然后启动 profile。以 0.1.7 实装为例，插件管理在无 HMR 的 profile 里对正在运行的组合包直接以 `stop-profile` 拒绝移除（0.2.2 的对应提示文案是：停机后执行 `dsh plugin --profile <profile> remove <bundle>`）。

**3. 包被解析到了别的目录**

若你重建/移动了本地 checkout，或换了一份源码副本，宿主可能发现「已安装的包现在解析到另一个目录」，从而拒绝发布新的运行映射（0.2.2 起以 `restart-required` + `restartReason: package-moved` 报告，组合保持不变）。处置：先移除，再按新路径安装。

```bash
dsh plugin --profile web remove tai-ji-yang-shell
dsh plugin --profile web add <新的本仓绝对路径>
```

**4. build scripts approval：安装期脚本需要显式授权**

pnpm ≥10 在获得显式允许前不执行依赖的安装脚本（git 安装要用 `prepare` 构建时必然撞上）。宿主会把修法直接打出来：把 pnpm 打印的**确切包键**复制进该 profile 的 `pnpm-workspace.yaml`：

```yaml
allowBuilds:
  tai-ji-yang-shell: true
```

然后重新执行 add。请把这项授权理解为「允许该包的代码在安装时于你的机器上执行」，只对源码可信的包授权，并锁定 commit。本包当前不定义 `postinstall`；这一条主要覆盖 git 安装（未来若新增 `prepare`）与依赖自带的安装脚本。

**5. 安装日志里有 `missing peer` 警告（cordis / schemastery）**

本包有两个 peer：`@deepseek-ai/cordis` 与 `@deepseek-ai/schemastery`（运行时都由宿主提供，不由插件安装）。git 或 registry 方式安装时 pnpm 会做 peer 检查并打印对应的 `missing peer` 警告，两类都要排查：`@deepseek-ai/cordis` 缺失 = 宿主 Cordis 运行时那一份没被解析到（Node 半场的 `ctx` 与 `apply(ctx)` 签名都来自它）；`@deepseek-ai/schemastery` 缺失 = 插件 `Config` 声明用的 schema 库没被解析到（`dsh plugin add` 的安装锚点是 dsh 自身 package.json，插件 import 向上解析即命中宿主那一份，单一副本）。宿主侧以模块表供给，不影响装载。要静音警告可保持用本地路径 / tarball 安装。

**6. 版本门禁拒绝安装或启动**

报 unmet `engines.dsh`：把 DSH 调整到范围内，或按「版本门禁」显式豁免（承担风险）。

**7. 想确认本包这一层真的被组合进来**

```bash
dsh --profile web --dump-config      # 组合后的 entry 列表；本包这一层以 "# == tai-ji-yang-shell" 开头
```

## 开发约定（本包自身的边界）

- 不注册第三方主题 id、不写宿主主题偏好（否则「跟随系统」失效）；配色走宿主 token 覆盖层，明暗模式归宿主。
- 不写宿主字族、字号轴与布局几何变量；结构值只覆盖圆角与字重/行高一类独立子 token。
- 每个贡献点（覆盖层、结构 CSS、槽位、外观行、locale 字典）都挂在 `ctx.effect` 上并返回 disposer，卸载即撤除。
- 持久状态（配色 id）存宿主管辖的插件 Config，不用浏览器 localStorage：卸载时本包代码已不再执行，Config 随 profile 行一并消失才是可达的清理路径。
- 浏览器半场的 `require` 只落在宿主模块表基线内；`package.json` 的 `dependencies` 为空，两个对等依赖（`@deepseek-ai/cordis` 与 `@deepseek-ai/schemastery`）都走 `peerDependencies`（宿主 `dsh-settings` 同款惯例，且 `dsh plugin add` 的安装锚点是 dsh 自身 package.json，插件 import 向上解析即命中宿主那一份，单一副本）。

## 静态自检

一键入口（静态断言 → 构建 → 全仓单测，固定顺序）：

```bash
node scripts/check-all.mjs              # 全跑；--static 只跑静态断言、--skip-build 跳过构建
```

单项脚本（各自由产出单元维护，断言逻辑只此一处）：

```bash
node scripts/check-manifest.mjs          # package.json 契约（含 exports 路径存在性）+ patch 结构 + 依赖键集边界
node scripts/check-no-host-deps.mjs      # 不含 @deepseek-ai/dsh-client-* 依赖
node scripts/check-require-baseline.mjs  # 产物 require 字面量 ⊆ 宿主模块基线
node scripts/check-injection-escape.mjs  # 注入行不含结束标签
node scripts/check-forbidden-tokens.mjs  # 字族 / 字号 / 复合简写 / 宿主几何变量 / theme.register
node scripts/check-profile-probe.mjs     # V8 自检：装错 profile 时 Node 半场报可行动诊断、不误报
```

构建入口（`check-all.mjs` 的构建段即调它）：

```bash
node scripts/build-client.mjs            # 产出 lib/client.js 与 lib/index.js
node scripts/build-client.mjs --self-test  # 12 项自证，含四条失败支证明会红
```

## License

Private
