/**
 * tai-ji-yang-shell —— Node 半场的唯一入口（设计 §3.3.6 / D6）。
 *
 * 职责：订阅宿主 `webserver/index-inject`，每次 emit 向注入表 push **一行**
 * `{ kind: 'style', text }`。宿主把它渲染进 `head`（Web 载体写进 HTML 文本、Desktop 载体经
 * boot IPC 注入表 + `applyIndexInjections`），两条通路都在解析期/首绘前生效，先于应用 mount
 * （AS4）。不 push `script` / `html` / `script-src`：Desktop 侧「应用可能已 mount」的顾虑被
 * boot 门控源码证伪（注入先于 `gate.resolve()`，mount 在 gate 之后），多一条脚本行只会带来
 * 「同一配色两处取值」的同步风险（D6 的 AG-7 收敛）。
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
 *   - 必须排除 darwin：桌面载体把注入行 append 到 head 末尾（`applyIndexInjections`
 *     的 `document.head.append`），而 Web 载体把它渲染在样式表 link 之前——同特异性时
 *     **两载体的文档序不同**。darwin 的透明规则 `html[data-platform='darwin'] body` 与
 *     本行的 `html:not([data-platform='darwin']) body` 都是 (0,1,2)：Web 侧应用样式表在后、
 *     透明胜出；Desktop 侧本行在后、会反过来压掉透明而破坏 vibrancy。排除 darwin 后两载体的
 *     结论一致（darwin 的 canvas 由 `.frame` / center 列自己画的 `--dsw-alias-bg-base` 承担，
 *     已经吃到本行覆盖的太极值）。
 *
 * 结束标签约束（AS5 / V10）：`style` 行的 text 不得含 style / script 元素的结束标签，否则页面
 * 会在该处提前闭合该元素。本文件内不存在这两个字面量，运行期由
 * `scripts/check-injection-escape.mjs` 对注入行逐行断言。
 *
 * 零 import、零依赖：Node 半场只用到 Cordis 注入的 `ctx`，不 require 任何宿主包，因此不引入
 * 随包安装的运行时依赖（D3），也可离线自检。
 */

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

/** Cordis 插件显示名（与 `package.json` 的 name、`cordis.patch.yml` 的行 id 同一字面值）。 */
export const name = 'tai-ji-yang-shell'

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
  })
}
