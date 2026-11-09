# tai-ji-yang-shell

太极（TaiJi）的视觉身份与会话组织插件，以 **DSH 组合包**（bundle）形态交付：装进 DeepSeek Harness（下称 DSH）的 web 类型 profile 后，打开即呈现太极的全套外观——六种配色与全量染色、圆角与字重行高、空会话首屏品牌区、composer 快速配色入口、设置页的外观行与「太极」分区——以及太极式的左侧栏会话区：**项目（Project）分组列表**（整槽替换宿主工作区列表；项目是本包的逻辑分组概念，与目录无关，跨设备随 profile 持久）。

本包负责「打开就认得出是太极」与「会话按项目组织」这两层。对话流、模型切换、工具调用、右栏面板等日常能力全部走 DSH 原生，本包不接管。

开发与审查入口：项目规则见 [AGENTS.md](AGENTS.md)，当前架构见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，DSH 插件约束与有意偏离登记见 [docs/DSH-PLUGIN-RULES.md](docs/DSH-PLUGIN-RULES.md)。

外观由「染色 + 界面贡献」两部分构成：

- **染色三层**：① 静态调色板重定义——把宿主 `--dsw-static-deepseek-*`（品牌蓝 10 档）整层改成太极灰绿阶梯（强调档随所选配色派生），`--dsw-static-neutral-bluish-*`（带蓝偏的中性 22 档）整层去蓝为太极锌灰/纸白阶梯；宿主全部引用这两张表的别名 token 自动跟随，宿主将来新增的也一样吃到。② 职能分色——链接保持太极正蓝（不做品牌色）、对话气泡用中性抬高层（不做强调色）、深度思考标签用思考紫。③ 字体复合简写（font shorthand：一个变量同时声明字重/字号/行高/字族）安全重写——只替换字重与行高两段（此前这两档从未生效，现在正文 500、行高 1.32/1.62/1.4 三档真正落地），字号与字族表达式逐字保留宿主原样，⌘+/⌘- 与字族选择不受影响。代码高亮、终端 ANSI 色板等功能色不动。
- **界面贡献**（前三项注册进宿主槽位、新格追加，不替换宿主已有条目）：空会话首屏品牌区（双鱼标放大版 + 产品名「太极」+ 欢迎语）；composer 工具行的快速配色 chip（点击弹出六色色卡，与设置页外观行共用同一控制器与持久状态）；设置页「太极」分区（配色状态页 + 项目管理：建/改名/删除/排序）。第四项是**整槽替换**：侧栏会话区（`sidebar.workspaces`，负优先级阴影宿主官方列表）渲染太极式项目分组列表——默认项目（未归类轻量行，无框无左线）+ 命名项目（组头 + 展开体左缘细线，当前组 accent 细线/非当前极淡）+ 会话行（状态点四态/子会话计数/置顶图钉/相对时间，**行首无品牌图标**）；打开/新建/归档/置顶走宿主 `uiWorkspace` 服务，重命名走宿主 `sessions` 公开合同，项目与归属映射（含组展开态）存本包 Config 的 volatile 字段（跨设备持久；禁用/卸载即回落官方列表——卸载（remove）时项目数据随 profile 行一起清除，禁用（disable）时数据留存）。第五、六项：侧栏品牌行的**版本行**（Node 半场解析本包版本与运行中的 DSH 版本——桌面形态读进程 argv 命名的 asar 运行时根、CLI 形态从安装解析起点向上解析——经宿主 `webserver/index-inject` 的 `global` 注入行递给页面，品牌栈在「太极」下方渲染 `v{本包} · dsh v{宿主}`，宿主版本解析不到时降级只显 `v{本包}`）；**会话头 taiji 化**（40px 单行 + 标题 14px 次要色 + 「对话|轨迹」分段控件归并到标题行右端；宿主 DOM 保留，`conversation.session.header.actions` 槽追加 13px 会话状态图标——整槽替换会让 utilities 子槽（「打开方式」按钮）失去渲染者，故走 CSS 重塑 + 槽位追加；More ⋯ 菜单与只读的预设标签按太极「卡头只留会话级控件」隐藏，其功能入口在侧栏会话行与 utilities 按钮均有等价物）。

一个包同时承载两个半场（单包 = profile 里的单行条目，两个半场的生命周期因此一致）：

| 半场 | 产物 | 职责 |
|------|------|------|
| Node 半场 | 源 `index.js`；安装后入口 = `lib/index.js`（`package.json` 的 `main`） | 订阅宿主 `webserver/index-inject`，把首次绘制前的样式与版本信息行推入注入表；声明插件 Config；装载期检查 profile 是否具备 web 承载能力并给出可行动诊断 |
| 浏览器半场 | `client/` → 安装后的 `lib/client.js` | 经宿主 `window.__ModuleLoader__.load({ id, factory })` 契约物化；装配染色三层（静态调色板重定义、token 职能分色、字体复合简写重写）、结构值（圆角）、品牌与设置槽位贡献、外观行、项目分组浏览器（会话区整槽替换 + ProjectStore 持久通道），以及持久状态通道 |

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
- 安装脚本放行已在仓内声明：`pnpm-workspace.yaml` 的 `allowBuilds` 预批 esbuild，因此 `pnpm install` 干净通过。若用 pnpm < 11（设置仍在 package.json 的 `pnpm` 字段）且仍被拦，执行 `pnpm approve-builds` 勾选 esbuild 即可。

## 安装

### 本地路径安装

```bash
# 1. 取本仓并构建（上一节），得到一个同时含 lib/index.js 与 lib/client.js 的目录
# 2. 装进 web 类型 profile
dsh plugin --profile web add <本仓绝对路径>
# 3. 启动
dsh web          # 等价于 dsh --profile web
```

`dsh plugin add` 会把这个目录作为 `link:` 依赖写进 profile（相对路径会被解析成绝对路径），并因为本包声明了 `dsh.bundle` 而把它追加进 profile 的 `dsh.profile.bundles`。tarball 方式记的是 `file:` spec。装完用 `dsh --profile web --dump-config` 能看到本包这一层（以 `# == tai-ji-yang-shell` 开头）。

**启动后的访问方式**：`dsh web` 会打印一行带 token 的地址并自动打开浏览器——

```
dsh web: http://127.0.0.1:3080/?token=<一长串>
```

token **每次启动都重新生成**，且只绑 127.0.0.1（本机访问）。不想自动开浏览器加 `--no-open`，然后手动粘贴那行地址。**首次进入有两道门**（点一次就没了）：先弹 “Internal Testing Notice”，点 **Continue**；再弹 “Add an API key to get started”，点 **Configure later** 可跳过，不影响看界面（要用模型功能再回来配 key）。

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

desktop profile 被桌面应用**独占管理**：系统 PATH 上的 npm 版 `dsh` 对它一律拒绝（`profile "desktop" is managed exclusively by the Electron application`），`--dump-config` 同样被拒（无论用哪个 CLI——启动与配置导出只归 Electron 应用本体）。唯一被授权的入口是**应用自带的 CLI**，它的 `plugin` 子命令持有 desktop profile 的管理权限。

完整步骤（macOS，应用装在默认位置）：

```bash
# ① 先启动一次桌面应用，让它初始化 desktop profile（~/.dsh/profiles/desktop 已存在则跳过）
open -a "DeepSeek Harness"

# ② 完全退出桌面应用（⌘Q——运行中的应用持有 profile 的锁），然后安装：
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
  plugin --profile desktop add <本仓绝对路径>

# ③ 重新打开桌面应用，界面即生效
open -a "DeepSeek Harness"
```

卸载同样走应用内 CLI（先 ⌘Q 退出应用）：

```bash
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
  plugin --profile desktop remove tai-ji-yang-shell
```

**验证安装**（desktop profile 不能用 `--dump-config`）：看 `~/.dsh/profiles/desktop/package.json` 的 `dependencies` 里出现 `"tai-ji-yang-shell": "link:..."`、`dsh.profile.bundles` 数组末尾多出 `tai-ji-yang-shell` 即在位。

两个桌面版特有的事实：

- **桌面应用自带完整 dsh 运行时**（版本独立于 npm 版，例如应用内 0.2.0-rc.2 + npm 0.1.7-rc.2 可共存），本包的版本门禁按**应用内版本**判定——安装成功即代表在范围内。
- **应用自带 pnpm**（与 PATH 上的 pnpm 共用同一处全局 store），desktop profile 首次安装是全新创建，不会触发下文排障第 9 条的 store 迁移问题。

### 卸载

```bash
dsh plugin --profile web remove tai-ji-yang-shell
```

桌面版卸载见上一节（用应用内 CLI，先 ⌘Q）。

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

本包在**两个字段**里声明同一范围（两者必须一致，`scripts/check-manifest.mjs` 有机检断言看守）：

```json
"engines": { "dsh": ">=0.1.7-rc.2 <0.3.0" },
"peerDependencies": { "@deepseek-ai/dsh": ">=0.1.7-rc.2 <0.3.0" }
```

- 范围取宽（覆盖当前主版本的全部 rc，直到下一个 minor 之前）：DSH 的 rc 迭代属于常规发版，不该把本包挡在门外；上界 `<0.3.0` 挡住破坏性升级。
- **为什么必须写 peerDependencies 而不只写 engines.dsh**：宿主的版本门禁只读 `peerDependencies` 里名为 `@deepseek-ai/dsh`（或以 `@deepseek-ai/dsh-` 开头）的条目，`engines.dsh` 整段不被读取（实际实现 `dsh-app-boot` 的 `evaluatePluginCompatibility`；`dsh/lib` 下 grep `engines` 命中 0 处）。实测对照：只写 `engines.dsh = ">=9.9.9 <10.0.0"`（当前实际实现 0.1.7-rc.2 明显不在范围）时 `dsh plugin add` 照常装成功、无任何拒绝——**只写 engines.dsh 等于没有门禁**。
- 门禁语义是「不满足即阻止」：宿主在安装前拒绝，并给出可行动的提示，而不是装上后运行时崩溃。
- 这与「零 npm 运行时依赖」不冲突：那条禁的是 `@deepseek-ai/dsh-client-*`（由宿主模块表供给的 client 包），而 `@deepseek-ai/dsh` 是**运行时本身**，正是兼容性评估的设计对象。
- 落在范围外且已确认兼容时，可显式豁免（**承担崩溃与数据丢失风险**，只对该包与该 DSH 版本的组合生效）：

```bash
dsh plugin --profile web allow-version tai-ji-yang-shell@<版本> --dsh-version <当前 DSH 版本> --accept-risk
```

**升级 DSH 本体**：npm 版走全局安装——

```bash
npm i -g @deepseek-ai/dsh@latest
dsh --version        # 确认
```

npm 的 `latest` dist-tag 当前指向 0.2.2-rc.1，落在本包范围内（门禁放行）。落在范围内的已发布版本族：`0.1.7-rc.2` / `0.2.0-rc.*` / `0.2.1-*` / `0.2.2-*`。**升级后必须重启正在运行的 DSH**（web profile 的 HMR 只覆盖应用内容，不覆盖宿主本体）。两点提醒：

- 升级 DSH 后 profile 里已装的插件**不需要重装**（依赖与组合层不受宿主升级影响），但建议升级后看一眼启动日志有没有 `did not activate` 一类条目；
- 本包的真机验收在 0.1.7-rc.2 上完成，对 0.2.x 只做过源码级核对（用到的能力都在，见设计文档 AS23）。升级后若发现配色不对/白屏，回退稳定版本：`npm i -g @deepseek-ai/dsh@0.1.7-rc.2`。

桌面版的宿主升级随应用（App Store / 官网下载）走，不走 npm；应用内 CLI 的版本即判定基准。

## 已知差异（明确不承诺）

布局几何归宿主私有，本包不写、也不承诺对齐：栏宽、卡缝（4px 分隔）、窗口顶条高度、对话区宽度、mac 材质（vibrancy）。装了本包后这些几何与宿主原生一致，而不是太极桌面版的几何。

侧栏会话区的登记差异：宿主工作区（目录实体）体系继续存在（hero 选择器、设置），本列表的分组轴只有项目；本包替换的会话区不含内容搜索、工作区树视图、目录选择器（新建会话走宿主 `uiWorkspace` 的当前上下文）；项目分组数据（项目、归属映射与组展开折叠态）全部跨设备随 profile 持久（存本包 Config 的 volatile 字段），没有只存会话内的临时态。

其余登记差异：

- **代码高亮 / 工具 JSON 面板 / 附件文件图标**保持宿主自带的彩色字面色板（不染成太极灰阶）：这三处用高差异化颜色承载内容信息，改色会削弱其信息功能。
- **字号与字体轴**完全交回宿主：本包不写字族与字号，只重写字体复合简写里的字重/行高两段（字号与字族表达式逐字保留，见开头「染色三层」③），⌘+/⌘- 与字体选择照常生效。
- **分区独立字号**不做：太极桌面版的侧栏/对话/抽屉各有独立字号档位；宿主的字号维度只有 text / code / terminal 三种内容类型轴（宿主 `theme-settings.ts` 的 `FONT_ROLES`），侧栏 UI 字号不可独立调。一套按界面分区定档、一套按内容类型定轴，两套维度对不上，硬映射只能造出没有对应语义的档位，故不承诺。
- **第三方主题插件**不承诺共存：本包以 token 覆盖层表达配色，与其他覆盖层叠加的结果不做保证。
- **产品图标**不替换：宿主逐 id 的图标契约需逐个重制，不在本包范围。
- 装错 profile（非 web 类型）时界面不会有任何变化（见「profile 适用性」类别 ②）。

## 排障

**1. 装完界面没有任何变化**

按顺序核对：① 装的是不是 web 类型 profile（非 web 类型见「profile 适用性」类别 ②，日志有本包诊断）；② 是否已按「非 HMR profile 需停机重启」重新启动；③ DSH 插件页里本包是否已启用；④ `lib/client.js` 是否真的构建出来了（只产出 Node 半场时浏览器半场不会物化，宿主会报 client bundle 缺失）。

**2. 非 HMR profile：装完必须停机重启，不能即时生效**

有 HMR 的应用型 profile（`web`、`desktop`，base 的 `hmr` 行在 profile 上下文里是启用的）装完即生效；没有 HMR 的 profile（`headless`、`sdk`、`acp` 显式关掉 base 的 `hmr` 行，`sdk-minimal` 不基于 base 因此也没有 hmr 行）在装完新包后返回 `restart-required`（0.2.2 起还附带 `restartReason: no-hmr`），含义是「这个 profile 只在启动时应用变更」。处置：停止 DSH，再执行一次同一条 `dsh plugin ... add`，然后启动 profile。以 0.1.7 实际实现为例，插件管理在无 HMR 的 profile 里对正在运行的组合包直接以 `stop-profile` 拒绝移除（0.2.2 的对应提示文案是：停机后执行 `dsh plugin --profile <profile> remove <bundle>`）。

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

本包有两个 peer：`@deepseek-ai/cordis` 与 `@deepseek-ai/schemastery`（运行时都由宿主提供，不由插件安装）。git 或 registry 方式安装时 pnpm 会做 peer 检查并打印对应的 `missing peer` 警告，两类都要排查：`@deepseek-ai/cordis` 缺失 = 宿主 Cordis 运行时那一份没被解析到（Node 半场的 `ctx` 与 `apply(ctx)` 签名都来自它）；`@deepseek-ai/schemastery` 缺失 = 插件 `Config` 声明用的 schema 库没被解析到（`dsh plugin add` 的安装解析起点是 dsh 自身 package.json，插件 import 向上解析即命中宿主那一份，单一副本）。宿主侧以模块表供给，不影响装载。要静音警告可保持用本地路径 / tarball 安装。

**6. 版本门禁拒绝安装或启动**

报 unmet `engines.dsh`：把 DSH 调整到范围内，或按「版本门禁」显式豁免（承担风险）。

**7. 想确认本包这一层真的被组合进来**

```bash
dsh --profile web --dump-config      # 组合后的 entry 列表；本包这一层以 "# == tai-ji-yang-shell" 开头
```

**8. 卸载后 `--dump-config` 报 `patch: entry "tai-ji-yang-shell" not found`**

只在**曾经选过配色**的 profile 上出现。原因链条（已实测复现，2026-11-07）：

1. 用户点选配色 → 本包经 `ctx.configForms` 写入插件 Config；
2. 宿主为保存这个值，把本包那一行**物化进 profile 的用户 patch 层**（`profiles/<name>/cordis.patch.yml`），写成 `- id: tai-ji-yang-shell` + `config: { appearance: <配色 id> }`；
3. `dsh plugin remove` 只清 profile 依赖与 `dsh.profile.bundles`，**不清它物化进用户 patch 的行**；
4. 于是该行变成悬空引用，每次 `--dump-config` / 启动都打印一条 `not found` 警告。

**这是宿主行为，不是本包 bug**：任何声明了 `Config` 的 DSH 插件都走同一条路。实测佐证——装完后**从不点选配色**直接卸载，patch 保持 `[]` 完全干净。

影响面：仅一条警告。本包不会因此被装载（行悬空即无 bundle 可组合），token 覆盖层、槽位贡献与配色选择全部随卸载消失，界面回到宿主原状。

要消掉这条警告，手动删掉该 profile patch 里本包那一行（整个 `- id: tai-ji-yang-shell` 块，含其 `config`）：

```bash
$EDITOR ~/.dsh/profiles/<profile>/cordis.patch.yml
```

**9. `[ERR_PNPM_UNEXPECTED_STORE] Unexpected store location`（pnpm 大版本升级后）**

症状（2026-11-07 实机复现）：对已存在的 profile 执行 `dsh plugin ... add` 直接报错，日志说 `node_modules` 链自 `~/.pnpm-store/v10`、而 pnpm 现在要用 `~/Library/pnpm/store/v11`。

成因：profile 是旧版 pnpm（v10 及以前）建的，pnpm 大版本升级会迁移全局 store 位置（v10 → v11），升级后的 pnpm 拒绝在「别人装的 node_modules」上继续操作。这与本包无关，是环境级问题。

修法分两种情况（按 profile 的 `package.json` 里 `dependencies` 是否为空判断）：

```bash
# 情况 A：profile 无任何依赖（dependencies 为 {}，如 web/desktop 的初始态）
# node_modules 只是旧 store 的空壳，删掉重建即可，无任何损失：
rm -rf ~/.dsh/profiles/<profile>/node_modules
# 然后重新执行 dsh plugin --profile <profile> add ...

# 情况 B：profile 有真实依赖（如 dsh-tui 的 @deepseek-harness-tui/dsh-tui）
# 不能用 rm 法，要在交互终端里跑一次迁移安装（会问一句「确认清空 node_modules」，答 y，
# 依赖按 lockfile 从 v11 store 重装）：
cd ~/.dsh/profiles/<profile> && pnpm install
# 然后重新执行 dsh plugin --profile <profile> add ...
```

修完后 `node_modules/.modules.yaml` 的 `storeDir` 会指向新 store（`~/Library/pnpm/store/v11`）。旧 store `~/.pnpm-store/v10` 占数 GB，确认机器上其它项目都不再用它之后可以删除回收空间。

## 多包结构

本仓是 pnpm 多包 workspace：根包 = `tai-ji-yang-shell`（本 README 主体描述的包），功能型子包逐个落 `packages/<name>/`。当前子包：`packages/opendesign-design-mode`——OpenDesign 设计模式插件包（新会话选择器出现「OpenDesign 设计模式」入口，定位本机 OpenDesign 资产驱动设计会话，产物在右侧栏设计面板预览；未装 OpenDesign 时入口显式降级提示）。

- **包清单**：`pnpm-workspace.yaml` 声明 `packages/*`；`scripts/workspace-packages.mjs` 登记每包构建声明并与之对账（不同步即构建/检查失败）。
- **构建**：`pnpm build`（= `node scripts/build-client.mjs`）逐包产出各包 `lib/`；各包产物随仓库交付（与根包同一纪律：`lib/` 入库、先构建再安装）。
- **检查**：`pnpm check:static` / `pnpm check` 对每包执行同一套静态断言（包特有断言按包选择）；任一包红灯即整体红灯。
- **安装**：每包是独立的 DSH 插件（各自的 `cordis.patch.yml` 与 `package.json` 双字段版本门禁），可独立安装到不同 profile；根包与子包互不牵连，卸载其一不影响另一包。

### opendesign-design-mode 的 V1 边界与交付说明

- **可交付范围（V1）**：八类 HTML 文件产物——原型、演示稿（ppt）、文档、营销源码、动效源码（HTML 部分）、HyperFrames 动效源码、网页复刻、webgl。**图片/视频/音频成片生成不在 V1 范围**（依赖 OpenDesign 自身的 media 管线，纯 DSH 环境无等价物）：会话中提出此类请求时模型会如实说明并以 HTML 源码形态替代交付。live-artifact（数据看板自动刷新类产物）同样归后续版本。
- **演示稿形态**：V1 交付为普通单文件 HTML（含模型自带的翻页/打印脚本），OpenDesign 的 deck 宿主协议级翻页与打印分页为后续版本能力。
- **`.od-frames/` 目录**：设计会话会向会话工作目录的 `.od-frames/` 子目录写入 OpenDesign 设备壳支撑文件（4 个小文件，会话创建时全量重铺）。它是产物运行时依赖：删除会断开既有原型对手持壳的引用。建议把 `.od-frames/` 加进项目 `.gitignore`（该目录可随时删除，下次设计会话自动重建）。
- **诊断**：会话内执行 `/opendesign-doctor` 可查看资产定位结果、OpenDesign 版本画像、改写规则命中清单、材质化状态与逐项恢复动作；改写规则出现大面积失配（核心段失配 ≥3 条 / 默认读取器不可用 / 连续两版升级全量重写）时 doctor 会输出「建议方案级重审」警示。
- **资产代际**：插件按文本标记自动识别安装版 OpenDesign 的资产代际并适配（已对 2.0.4 安装资产实测锚定）；doctor 对未能识别代际的版本给出警告。

## 开发约定（本包自身的边界）

开发、审查与有意偏离的完整登记见 [docs/DSH-PLUGIN-RULES.md](docs/DSH-PLUGIN-RULES.md)；双半场与界面贡献的职责边界见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 静态自检

一键入口（静态断言 → 构建 → 全仓单测，固定顺序）：

```bash
pnpm check          # 全跑：静态断言 → 构建 → 全仓单测
pnpm check:static   # 只跑静态断言
pnpm test           # 只跑全仓单测

# 等价的直接入口：node scripts/check-all.mjs（另支持 --skip-build）
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
pnpm build            # 产出 lib/client.js 与 lib/index.js
pnpm build:self-test  # 12 项自证，含四条失败支证明会红
```

全仓单测里的 `client/theme/host-font-sheet.spec.ts` 是字体复合简写的**升级护栏**：对宿主源样式表 `gradient-shadow-text.css` 逐 token 对账——复合简写名单对齐（宿主增删档即红）、字号段与字族段逐字一致（字重/行高不比对，那是本包要改的两段）。宿主升级改了字号表达式而本包 `client/theme/structure.ts` 未同步时，这条测试会红，提示同步重写表。宿主样式表定位：`DSH_FONT_SHEET` 环境变量优先；缺省探测本机 DSH 源码仓的固定路径（探测串写在 spec 文件内）；找不到时测试直接失败并在错误信息里给出设置指引，不静默跳过——在他机上跑 `check-all` 或单测前，先把 `DSH_FONT_SHEET` 指向本机 DSH 源码仓里的 `gradient-shadow-text.css`。

## 真实宿主验收

真实 DSH 验收使用 [.agents/skills/verify-taiji-yang](.agents/skills/verify-taiji-yang/SKILL.md) 与 `scripts/verify/run.mjs`：连接显式测试 URL，或在隔离 DSH_HOME 自启实例。覆盖品牌、会话头、主题、项目列表和卸载回落；证据包含 `verdict.json`、`summary.jsonl`、截图与控制台。该入口不读取用户浏览器 profile，不修改用户真实 DSH profile，不发送模型请求。

brand/projects/lifecycle 三场景的回归命题是「新插件（opendesign-design-mode）安装进同一 profile 后，preset 注册与 UI 注入不干扰 shell 包」——只在两包共存 profile 上可证明。runner 自启形态只装本仓 shell 包，单装态结果不能登记为共存回归通过。共存前提的手工准备：对同一隔离 profile 先后执行 `dsh plugin --profile web add <本仓根>`（shell）与 `dsh plugin --profile web add packages/opendesign-design-mode`（两包共存），再以 `--dsh-home <该目录>`（lifecycle 须自启形态）或 `--url <实例认证 URL>`（brand/projects）跑 runner；该串接已由 web 版 e2e 场景 S8 自动化（`packages/opendesign-design-mode/tests/e2e/web.spec.mjs`）。

## License

Private
