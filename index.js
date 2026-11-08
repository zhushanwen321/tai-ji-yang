/**
 * tai-ji-yang-shell —— Node 半场的唯一入口（设计 §3.3.6 / D6 + §3.3.2 / D2 的持久通道宿主侧）。 *
 * 职责一：订阅宿主 `webserver/index-inject`，每次 emit 向注入表 push **一行**
 * `{ kind: 'style', text }`。宿主把它渲染进 `head`（Web 载体写进 HTML 文本、Desktop 载体经
 * boot IPC 注入表 + `applyIndexInjections`），两条通路都在解析期/首绘前生效，先于应用 mount
 * （AS4）。不 push `script` / `html` / `script-src`：Desktop 侧「应用可能已 mount」的顾虑被
 * boot 门控源码证伪（注入先于 `gate.resolve()`，mount 在 gate 之后），多一条脚本行只会带来
 * 「同一配色两处取值」的同步风险（D6 的 AG-7 收敛）。
 *
 * 职责二（U3 接线所必需）：导出本包的插件 `Config`——浏览器半场的持久通道
 * （`client/persist.ts` 经 `ctx.configForms.get(<profile 行 id>)` 读写 `appearance` 字段）
 * 只在 Host 侧声明了 Config 时才存在。命名空间 = 本包 profile 行的 id，见 {@link Config}。
 *
 * 取值口径（D6 收敛纪律）：
 *   - **不建六色副本**：六色双模表的唯一权威是浏览器半场（`client/theme/tokens.ts`，U2）。
 *     本文件只承载默认配色（玄）这一套，且只承载「宿主默认 palette 之上的最小差异」——
 *     宿主 palette 是蓝灰底 + 墨黑品牌色，太极的青玉品牌色与中性灰阶梯必须在 boot 区间就就位，
 *     否则首屏会先闪一帧宿主配色（V1 第 ④ 步）。选了非默认配色的老用户，首帧先呈现玄、随即被
 *     浏览器半场覆盖层换成所选配色（偏差只在 boot 区间）；把六种配色都搬进 Node 侧等于重建 D6
 *     明确删掉的「两处取值一致性维护」，不做。
 *   - **取值来源**：太极侧 `packages/renderer/src/style.css` 的 `:root`（玄 · 暗）与
 *     `[data-theme="light"]`（皓 · 亮）逐 token 对齐；暗支取玄（纯中性灰 + 青玉 accent），
 *     亮支取皓。token 集合 = 设计 §3.3.2 的 13 个白名单 alias + `--dsw-specific-sidebar-fill`
 *     + 名单外语义色（state-done 等），逐条来源见 {@link FIRST_FRAME_TOKENS} 上方注释。
 *   - **哪一支生效由 CSS 按页面实际的 color-scheme 选**：每个 token 只写一个值表达式
 *     `light-dark(亮, 暗)`。`color-scheme` 由宿主自己的 boot 注入给出——`ui-theme/src/boot-theme.ts`
 *     以 `prepend` 排在注入表最前，其 head 行在解析期就写下 `:root{color-scheme:light|dark}`
 *     （`system` 偏好写成 light + `@media(prefers-color-scheme:dark)` 覆盖），所以固定偏好与
 *     跟随系统四种组合在首帧起即正确，用户切偏好时本包不需要任何监听（V11）。
 *     Node 半场读不到页面偏好（偏好属宿主 settings 域，非本包所有）：若用
 *     `@media (prefers-color-scheme: dark)` 自己判断，「偏好=暗 + 系统=亮」会整段给错亮支；
 *     若用宿主 body 脚本写下的 `data-ds-dark-theme` 作判据，该属性到 body 起始处才写入，属首绘
 *     之后的事实，同样留出「首帧闪亮支」的窗口。`light-dark()` 以解析期已存在的 `color-scheme`
 *     为准，构造性排除这两种偏差。不支持该函数的引擎会让声明整体失效（逐 token 退回宿主
 *     palette），失败形态是「不生效」而非「错配」。
 *
 * 选择器特异性（必须保持）：宿主把 alias 声明在 `body`（(0,0,1)）与
 * `body[data-ds-dark-theme]`（(0,1,1)）两处；本行的 `html body`（(0,0,2)）压过后者的默认 palette，
 * 但**压不过** `body[data-ds-dark-theme]`（(0,1,1) > (0,0,2)），所以暗支必须另用
 * `html body[data-ds-dark-theme]`（(0,1,2)）。两个选择器写在同一条规则里、共用同一组取值
 * （值本身是 `light-dark()`，由 `color-scheme` 选支），因此属性挂上前后都不会跳支。
 *
 * 画布底色单独一条规则、且排除 macOS 桌面（`html:not([data-platform='darwin']) body`）：
 *   - 不覆盖的话宿主 boot 注入写死的 `body{background-color:#fff/#151517}`（(0,0,1)）会留下宿主色，
 *     暗色偏好下首帧画布是宿主灰黑而不是太极 #18181b（V1 第 ④ 步）。
 *   - 排除 darwin 属防御性排除：宿主在 darwin 有 `html[data-platform='darwin'] body`
 *     {background:transparent}(0,1,2)（web/src/base.css:35-40），本行即便不写 `:not()` 也赢不过
 *     它——`html body` 是 (0,0,2)，且 `html:not([data-platform='darwin']) body` 与该透明规则
 *     两个选择器互斥、永不同时命中同一元素，两载体的文档序差异不可能翻转结论。显式 `:not()`
 *     只是让两载体结论一致、意图直白（darwin 的 canvas 由 `.frame` / center 列自己画的
 *     `--dsw-alias-bg-base` 承担，已经吃到本行覆盖的太极值）。
 *
 * 结束标签约束（AS5 / V10）：`style` 行的 text 不得含 style / script 元素的结束标签，否则页面
 * 会在该处提前把这个元素封住。本文件内不存在这两个字面量，运行期由
 * `scripts/check-injection-escape.mjs` 对注入行逐行断言。
 *
 * 装载期诊断（§3.3.9 / D9 / V8）：本包只对 web 类型的 profile 有意义，而宿主对
 * `dsh.client.platform !== 'web'` 的包在 client modules 扫描时静默返回 null（AS6），装错
 * profile 的用户只能看到「界面毫无变化」。Node 半场因此在装配期探 `ctx.get('webServer')`
 * （web 承载层 `@deepseek-ai/dsh-host-webserver` 提供的唯一服务名），缺失时记一条指向本包、
 * 带改装路径的错误日志。判定时机不能是 `apply` 的同步快照：宿主按 `EntryGroup.update` 并发
 * 装配各行（`Promise.all` 一起起 import），且 webserver 行自身 `inject: [webStartup]`——本行
 * （无 inject）的 `apply` 完全可能早于它构造出服务，同步判定会在**正常的 web profile** 上误报。
 * 故判定锚定确定性事实而非时间窗（ADR-0122）：`loader.await()` 结算 = 装配期任务全部落地，
 * 此时仍缺失才是真的没有 web 承载；无 Loader 的手工装配树本身就是完整树，该分支同步判定。
 * 详见 {@link diagnoseWebCarrier}。
 *
 * 零 `dsh-client-*` import、零随包 `dependencies`：Node 半场只用到 Cordis 注入的 `ctx`
 * 与一个 schema 库（`@deepseek-ai/schemastery`，仅用于 {@link Config} 的声明），不 import
 * 任何 `@deepseek-ai/dsh-client-*` 包（D3 禁的正是那一类——它们由宿主模块表供给、不由插件
 * 安装），也可离线自检（`scripts/check-profile-probe.mjs` 不连网、不起宿主）。
 *
 * 为什么 schemastery 走 `peerDependencies` 而不是 `dependencies`：
 *   - 宿主的 `dsh-settings` 包对它就用 peerDependencies（DSH 体系惯例：由顶层安装保证唯一
 *     版本，不由下层包各自锁）。
 *   - `dsh plugin add` 的安装锚点是 **dsh 自己的 package.json**（`profile-boot` 的
 *     `INSTALL_ANCHOR`），插件因此落在 dsh 的 `node_modules` 树下，其 import 向上解析即命中
 *     宿主那一份——单一副本，不存在「两份副本 Symbol 与单例槽不共享」的跨实例读写。
 *   - 若放 `dependencies`，pnpm 会按本包声明的范围另装一份；宿主实装是 3.18.4，范围
 *     `~3.18.4` 虽兼容，但宿主一旦升级 schemastery 就分裂成两份。
 *
 * 它不进浏览器 bundle（`client/` 零 import），因此 `scripts/check-require-baseline.mjs`
 * 审计的宿主模块基线不受影响。
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'

/**
 * 默认配色（玄）的双模取值表：token 名 → (亮支, 暗支)。
 *
 * 逐条来源（太极侧 `packages/renderer/src/style.css`）：
 *   bg-base ← `--surface`（内容层：#f7f6f3 / #18181b）
 *   bg-layer-1 ← `--bg-input`（代码块与文件 chip 底：#efedea / #1d1d20）
 *   bg-layer-2 ← `--bg-card`（设置分组卡：#fcfbf9 / #2d2d30）
 *   bg-overlay ← `--bg-elevated`（浮层：#ffffff / #323236）
 *   specific-sidebar-fill ← `--bg`（框架层 / 侧栏：#eef1ea / #242428）
 *   label-primary ← `--neutral-fg`；label-secondary ← `--neutral-mid`
 *   border-l1 ← `--border`；border-l2 ← `--border-strong`
 *   brand-primary ← `--accent`（青玉）；state-error/success/warn/idle ← danger/success/warn/neutral-dim
 *   state-done ← `--reasoning`（思考块紫，名单外语义色）
 */
const FIRST_FRAME_TOKENS = [
  ['--dsw-alias-bg-base', '#f7f6f3', '#18181b'],
  ['--dsw-alias-bg-layer-1', '#efedea', '#1d1d20'],
  ['--dsw-alias-bg-layer-2', '#fcfbf9', '#2d2d30'],
  ['--dsw-alias-bg-overlay', '#ffffff', '#323236'],
  ['--dsw-specific-sidebar-fill', '#eef1ea', '#242428'],
  ['--dsw-alias-label-primary', '#2b2a28', '#e6e6e6'],
  ['--dsw-alias-label-secondary', '#706e6a', '#949494'],
  ['--dsw-alias-border-l1', 'rgba(0, 0, 0, 0.07)', 'rgba(255, 255, 255, 0.07)'],
  ['--dsw-alias-border-l2', 'rgba(0, 0, 0, 0.14)', 'rgba(255, 255, 255, 0.13)'],
  ['--dsw-alias-brand-primary', '#43765d', '#7fb89c'],
  ['--dsw-alias-state-error-primary', '#b24c4a', '#bf6b6b'],
  ['--dsw-alias-state-success-primary', '#368047', '#78a87e'],
  ['--dsw-alias-state-warn-primary', '#977629', '#b79c54'],
  ['--dsw-alias-state-idle-primary', '#9d9b96', '#6e6e6e'],
  ['--dsw-alias-state-done-primary', '#71659c', '#8e85ab'],
]

/** 拼出 token 声明串：每 token 一个 `light-dark(亮, 暗)` 值表达式（选支交给 CSS）。 */
function rule(tokens) {
  return tokens.map(([token, light, dark]) => `${token}: light-dark(${light}, ${dark});`).join(' ')
}

/**
 * 首帧样式的 CSS 文本（`style` 行的 text）。
 *
 * 第一条规则给 token（两个选择器共用同一组取值，属性挂上前后都不会跳支）；第二条给画布底色
 * （排除 darwin，理由见文件头的「画布底色单独一条规则」段）。
 */
export const FIRST_FRAME_STYLE = [
  `html body, html body[data-ds-dark-theme] { ${rule(FIRST_FRAME_TOKENS)} }`,
  `html:not([data-platform='darwin']) body { background-color: var(--dsw-alias-bg-base); }`,
].join(' ')

/** 注入行的结构（宿主 `IndexInjection` 的 style 分支：只有 `kind` 与 `text`）。 */
export const FIRST_FRAME_ROW = Object.freeze({ kind: 'style', text: FIRST_FRAME_STYLE })

// ── 壳信息（版本行）：Node 半场解析、`global` 注入行递给浏览器半场 ───────────────────

/**
 * 注入到页面 `globalThis` 的壳信息属性名。宿主把 `global` 行渲染成 head 里先于一切脚本的
 * `globalThis["…"] = <json>` 赋值（`webserver/injections.ts` 的 renderRow，`<` 已转义），
 * 浏览器半场 `client/brand/name.tsx` 读取它渲染品牌区版本行。幂等重读：读不到 = 版本行降级
 * 只显本包版本（taiji 的 versionLabel 同款降级：piVersion 没到就只显 `v{app}`）。
 */
export const SHELL_INFO_GLOBAL = '__TAIJI_SHELL_INFO__'

/**
 * 读一份 package.json 的 version 字段。
 *
 * @param {string} file - 绝对路径（桌面形态下可能是 asar 内路径——Electron 的 fs 补丁按字符串
 *   路径拦截，readFileSync 直读即透进 asar）。
 * @returns {string | undefined} version；任何读失败都归 undefined（降级，不抛）。
 */
function readJsonVersion(file) {
  try {
    const version = JSON.parse(readFileSync(file, 'utf8')).version
    return typeof version === 'string' && version !== '' ? version : undefined
  } catch {
    return undefined
  }
}

/**
 * 桌面宿主形态下解析运行中的 DSH 版本。
 *
 * 桌面进程的 argv 直接点名 asar 里的 DSH 运行时根（实测：`DeepSeek Harness --expose-internals
 * …/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/index.js …/app.asar/dsh
 * <profile> …`）。这是唯一可靠来源——桌面 profile 用 `link:` 直链本仓库，插件位置的向上
 * 模块解析命中不了 asar 里的宿主副本。版本读 app-boot 包（宿主自己的 getDshRuntimeVersion
 * 同源：DSH 运行时版本 = app-boot 的 package.json version）。
 *
 * @param {readonly string[]} argv - 进程参数（注入参数仅为可测性，缺省用真实 process.argv）。
 * @returns {string | undefined} 命中 asar dsh 根且其 app-boot 可读时给版本，否则 undefined。
 */
export function desktopRuntimeVersion(argv = process.argv) {
  const root = argv.find((arg) => arg.includes('app.asar') && /[\\/]dsh$/.test(arg))
  if (root === undefined) return undefined
  return readJsonVersion(join(root, 'node_modules', '@deepseek-ai', 'dsh-app-boot', 'package.json'))
}

/**
 * CLI 宿主形态（`dsh web`）下解析运行中的 DSH 版本。
 *
 * `dsh plugin add` 的安装锚点是 dsh 自己的 package.json（profile-boot 的 INSTALL_ANCHOR），
 * 插件落在 dsh 的 node_modules 树下，从插件位置向上解析 `@deepseek-ai/dsh` 即命中**正在
 * 运行的**那一份。桌面形态这条路会解析到机器上另一份 dsh 安装（版本错报），所以它只在
 * 桌面形态未命中时作为第二优先级。
 *
 * @returns {string | undefined} 解析命中且可读时给版本，否则 undefined。
 */
export function cliRuntimeVersion() {
  try {
    // createRequire 而非 import.meta.resolve：后者在部分运行时（Electron 内置 Node）仍带实验旗。
    // resolve 返回的是路径字符串（不是 URL），直接读。
    const manifest = createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json')
    return readJsonVersion(manifest)
  } catch {
    return undefined
  }
}

/**
 * 本包自己的版本。入口在源码（`index.js`）与产物（`lib/index.js`）两个位置装载，manifest
 * 分别在同目录与上一层——按 manifest 名匹配向上找（最多四层），两种位置都命中；找不到给
 * '0.0.0'（版本行降级显示，不抛）。
 *
 * 惰性求值 + 记忆化：模块装载期 `name` 导出尚在 TDZ，首次调用（buildShellInfo）时模块已
 * 完整求值。
 */
let ownVersionMemo
function ownVersion() {
  if (ownVersionMemo !== undefined) return ownVersionMemo
  let dir = fileURLToPath(new URL('.', import.meta.url))
  for (let depth = 0; depth < 4; depth += 1) {
    try {
      const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
      if (manifest.name === 'tai-ji-yang-shell') {
        ownVersionMemo = typeof manifest.version === 'string' && manifest.version !== '' ? manifest.version : '0.0.0'
        return ownVersionMemo
      }
    } catch { /* 逐层试，读不到就继续向上 */ }
    const parent = join(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  ownVersionMemo = '0.0.0'
  return ownVersionMemo
}

/** 壳信息的形状：`dshVersion` 只在解析到时携带（缺席即降级）。 */
export function buildShellInfo(argv = process.argv) {
  const dshVersion = desktopRuntimeVersion(argv) ?? cliRuntimeVersion()
  return { version: ownVersion(), ...(dshVersion === undefined ? {} : { dshVersion }) }
}

/** 壳信息 `global` 注入行（宿主 IndexInjection 的 global 分支：kind/name/value）。 */
export const SHELL_INFO_ROW_FACTORY = (argv = process.argv) =>
  Object.freeze({ kind: 'global', name: SHELL_INFO_GLOBAL, value: buildShellInfo(argv) })

/**
 * 本包的插件 Config：持久状态的宿主侧声明（设计 §3.3.2 / D2「存宿主管辖的通道」）。
 *
 * 为什么它在 Node 半场而不在 package.json：宿主的设置命名空间来自 **Loader 行的
 * `entry.fiber.runtime.Config`**（`dsh-settings/src/index.ts` 的 `schema(entry)` 读的就是它），
 * 而 `runtime.Config` 只从插件模块的导出取（`cordis` 的 `plugin()` 里 `Config: plugin.Config`）。
 * package.json 没有任何 Config 声明通道——设计文件地图把这条写成 package.json 是笔误，实测
 * （本机 dsh 0.1.7-rc.2 + 源码 HEAD 0.2.2-rc.1 双向核对）确认唯一落点是这里。
 *
 * 命名空间 = 本包 profile 行的 id（`cordis.patch.yml` 的 `- id: tai-ji-yang-shell`）：
 * `SettingsForms.describe()` 产出 `ns: entry.options.id`，`ConfigForms.get(entryId)` 的入参
 * 就是它。宿主自己的先例同构——`dsh-mcp-manager` README 原话 "Settings uses the owning entry
 * id as its namespace"；`dsh-client-locale` 的 `locale`、`dsh-web-search-deepseek` 的
 * `web-search-deepseek` 都是行 id 而不是包名。
 *
 * `volatile()` 不可省：`volatileForm(schema)` 只保留 volatile 字段，一个 volatile 字段都没有的
 * Config 整个命名空间都不会出现在 describe 里（客户端快照恒 `unavailable`、写入恒被拒）。
 * 不设 default：默认色（玄）是**包内默认**而不是持久值，用户没点选过时这一字段应当缺席
 * （D2「默认值……且它不写持久键，首次写入只发生在用户主动点选时」）。
 *
 * 卸载即清除由此成立：Config 存在 profile patch 的本包行上，`dsh plugin remove` 移除该行 →
 * 配置随行消失，无需本包代码参与清理（AX3 / V5 第三处痕迹）。
 */
export const Config = z.object({
  /** 上次用户点选的配色 id（六色之一）；缺席 = 从未点选，回落包默认色玄。 */
  appearance: z.string().volatile(),
  /**
   * 项目分组表（Project 概念，插件侧逻辑分组实体，与 DSH 工作区正交）：数组序即自定义序。
   * volatile 的理由与 appearance 同理——值**持久**（写进 profile patch YAML，跨重启跨设备
   * 保留），但更新不触发插件重挂载：改一个项目名不该让整个浏览器半场重装配。
   * 整写整读纪律：数组不做深层路径写（宿主 `isVolatilePath` 沿 dict 下钻，数组索引不是
   * dict 键），任何变更 = 全量读 → 内存改 → 整字段写回（浏览器半场 client/projects/store.ts）。
   * 不设 default：空数组是「从未建过项目」的缺席态，装载期由 store 侧 sanitize 兜底脏数据。
   */
  projects: z.array(z.object({ id: z.string(), name: z.string() })).volatile(),
  /**
   * 会话归属映射：SessionId → projectId。默认项目 id 固定为空串 ''（taiji 同款 nameless
   * 判据——空 id 是「未归类兜底聚合」的标志，不可重命名、不可删除）：未映射的会话与映射到
   * 空串的会话都落入默认项目，故「归回默认项目」= 删除映射键，不写 '' 占位。
   * 悬空映射（指向已删项目的条目）无危害：派生层视为未映射，惰性清理。volatile 与
   * 整写整读纪律同 projects。
   */
  assignments: z.dict(z.string()).volatile(),
  /**
   * 侧栏项目分组的展开态：展开中的项目 id 列表（成员 '' = 默认项目展开）。默认项目 id 固定
   * 空串（见 assignments 注释的 nameless 判据），本字段直接存项目 id 本身、不为默认项目设
   * 哨兵串——判据：哨兵方案要在浏览器半场维护「写入翻译 / 读取反译」两条转换规则，还引入
   * 「哨兵与真实 id 撞车」的防御问题；而 '' 成员在 z.array(z.string()) 下完全合法，store 侧
   * sanitize（只留 string、去重）无需为它特判，注释写明语义即可读。悬空 id（指向已删项目的
   * 成员）无危害：消费侧把它视为未展开（与 assignments 的悬空映射同一惰性容忍纪律）。
   * volatile 与整写整读纪律同 projects：展开态**持久**但改它不该触发重挂载，任何变更 = 全量
   * 读 → 内存改 → 整字段写回。不设 default：与 projects 同理，缺省由 schemastery 回填空数组
   * （从未展开过任何组 = 空列表，不是缺席）。
   */
  expanded: z.array(z.string()).volatile(),
})

/** Cordis 插件显示名（与 `package.json` 的 name、`cordis.patch.yml` 的行 id 同一字面值）；
 * 同时是诊断日志的归属名——宿主日志按 fiber 的 runtime name 打前缀，装错 profile 时用户看到的是
 * `tai-ji-yang-shell: <诊断>`，能直接认出是哪一层在报。 */
export const name = 'tai-ji-yang-shell'

/**
 * 装错 profile 时的诊断文案（V8 判据按这段文本比对，可行动指引不可省）。
 *
 * 措辞刻意落在「本包 + 当前 profile + 后果 + 出路」四段上：宿主的静默跳过只表现为「界面没变化」，
 * 用户需要这条日志自己完成归因（AS6）。
 */
export const NO_WEB_CARRIER_MESSAGE = `本包（${name}）只支持 web 类型的 profile，当前 profile 没有 web 承载，`
  + '浏览器半场不会被装载；请改装到 web profile（例：dsh plugin --profile web add <本包绝对路径>）。'

/** 诊断的第二句：把「web profile 但 webserver 行自身装载失败」这条同样可达的分支点出来。 */
export const NO_WEB_CARRIER_HINT = '若本机确实是 web 类型的 profile，请查同一次启动日志里 webserver '
  + '行的装载错误——该行没起来时本包同样读不到 web 承载。'

/**
 * 装载期探针：判定当前 profile 是否具备 web 承载，缺失时报告一条可行动错误（D9 / V8）。
 *
 * 判定顺序（每条都是确定性事实，不含任何时间窗）：
 *   1. `ctx.get('webServer')` 已在位 → web 承载确定存在，无需等待装配结算，直接返回；
 *   2. 无 `loader`（或它不是 Loader：没有 `await`）→ 手工装配树自身即完整树，同步判定；
 *   3. 其余 → 等 `loader.await()` 结算（装配期 import 与 fiber 装载任务全部落地）后判定。
 *
 * 探针**不阻塞** `apply`：若在 `apply` 里 await 装载结算，本 fiber 的加载任务本身就在
 * `loader.getTasks()` 的等待集里，会自锁。因此以独立的微任务链推进，并用本 context 的
 * effect 登记反注册器——profile 行移除 / disable / HMR 重载之后不再补报（卸载后不留噪音日志）。
 *
 * 「不注册任何会失败的槽位贡献」（D9）：本包 Node 半场的贡献只有一条 `webserver/index-inject`
 * 订阅，缺 web 承载时该事件永不 emit，监听是惰性的（不产生错误、不占槽位）；装配层因此不按
 * 探针结果分叉——订阅必须同步登记，否则 Desktop 载体在 ready 时已用 `collectIndexInjections`
 * 收过注入表，事后登记会漏掉首帧行。
 *
 * @param ctx - Cordis 插件上下文（`apply` 收到的同一个；只用到 `get` / `logger`）。
 * @returns 反注册器：登记进 `ctx.effect`，随 fiber 卸载撤销待决的判定。
 */
function diagnoseWebCarrier(ctx) {
  let unloaded = false

  const report = () => {
    if (unloaded) return
    // 结算后再读一次：装配期短暂缺席（sibling 行尚未构造出服务）不算缺 web 承载。
    if (ctx.get('webServer') !== undefined) return
    ctx.logger.error(NO_WEB_CARRIER_MESSAGE + NO_WEB_CARRIER_HINT)
  }

  if (ctx.get('webServer') !== undefined) {
    return () => { unloaded = true }
  }

  const loader = ctx.get('loader')
  if (loader === undefined || typeof loader.await !== 'function') {
    report()
    return () => { unloaded = true }
  }

  // 先让出当前微任务：`apply` 返回前本 fiber 仍处 LOADING，此刻取的等待集里含自己的加载任务。
  Promise.resolve().then(() => loader.await()).then(report, (error) => {
    if (unloaded) return
    const reason = error instanceof Error ? error.message : String(error)
    ctx.logger.error(`profile 能力探针无法等待 Loader 结算，web 承载判定失败：${reason}`)
  })

  return () => { unloaded = true }
}

/**
 * Node 半场装配入口。
 *
 * @param ctx - Cordis 插件上下文。`ctx.on` 返回的 disposer 自动登记在当前 fiber 上，插件卸载
 *   （profile 行移除 / disable）时监听随之撤销——首帧注入不留残留。
 */
export function apply(ctx) {
  ctx.on('webserver/index-inject', (table) => {
    // 事件语义是「收集当前注入表」（每次 index 渲染都 emit），故每次 emit 都推当前行。
    table.push({ kind: 'style', text: FIRST_FRAME_STYLE })
    // 壳信息 global 行：宿主渲染成 head 里先于一切脚本的 globalThis 赋值（版本解析见上节）。
    table.push({ kind: 'global', name: SHELL_INFO_GLOBAL, value: buildShellInfo() })
  })
  // 装载期诊断（§3.3.9 / V8）：与上面的订阅完全独立——判定缺 web 承载也不改装配，
  // 反注册器随本 fiber 卸载撤销待决判定。
  ctx.effect(() => diagnoseWebCarrier(ctx), 'profile 能力探针')
}
