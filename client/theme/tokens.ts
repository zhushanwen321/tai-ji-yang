/**
 * client/theme/tokens.ts —— 六色 × 每 token 的 { light, dark } 双模表（设计 §3.3.2 / D2）。
 *
 * 定位：本文件是六色取值的**唯一权威**（Node 半场 index.js 只承载默认色玄的首帧最小集，
 * 不建六色副本——D6 收敛纪律）。全部取值逐条抄自太极侧
 * `packages/renderer/src/style.css`（该文件头自称「令牌值唯一权威 = 本文件 :root」）：
 *
 *   · 玄（暗 · 默认）   = `:root` 块（暗族基值）
 *   · 黛蓝（暗）        = `:root[data-theme-preset="dailan"]`
 *   · 暖墨（暗）        = `:root[data-theme-preset="nuanmo"]`
 *   · 皓（亮 · 默认）   = `[data-theme="light"]` 块（亮族基值）
 *   · 青墨（亮）        = `[data-theme="light"][data-theme-preset="qingmo"]`
 *   · 朱印（亮）        = `[data-theme="light"][data-theme-preset="zhuyin"]`
 *
 * 名称与族归属的另一来源 = `packages/renderer/src/composables/useTaijiThemes.ts`
 * （TAIJI_THEMES：玄/黛蓝/暖墨 属暗、皓/青墨/朱印 属亮；玄/皓 的 preset 为 ''）。
 *
 * token 集合 = 设计 §3.3.2 的 13 个白名单 alias + `--dsw-specific-sidebar-fill`（第 14 个
 * inspect token）+ 名单外语义色 `--dsw-alias-state-done-primary`，共 15 个；外观深化层 2
 * 增职能分色 5 个（link / bubble / bubble-highlight / label-deep-diving×2，见下），共 20 个；
 * 模型服务分区（dsh-model-service 设计包）再增状态色派生档与亮族压暗档 12 个
 * `--taiji-*` 子 token（soft/ring 8 + ink 4，见下方 THEME_TOKEN_NAMES 尾段）。
 * 与 index.js 的 `FIRST_FRAME_TOKENS` 的关系：首帧表只承载原 15 个核心 token（层 2 与
 * 派生档的消费点都在 mount 后的组件里，boot 区间没有渲染内容，不进首帧），由
 * `tokens.spec.ts` 的漂移断言看守（对首帧子集逐 token 同源同值）。第三类「不覆盖且不跟随」的硬编码字面色板
 * （shiki / json-tree / file-type 的 *色板字面值*）见设计 §2；注意层 1（palette.ts）重定义
 * static 调色板后，file-type 经 `--dsw-static-deepseek-*` 引用的默认色会自动跟随灰绿——
 * 该登记从「不覆盖」升级为「经 static 层跟随」。
 *
 * 每个 alias 在太极侧的对应令牌（抄录映射，非臆造）：
 *   bg-base          ← `--surface`（内容层：对话流/抽屉阅读区）
 *   bg-layer-1       ← `--bg-input`（代码块与文件 chip 底）
 *   bg-layer-2       ← `--bg-card`（设置分组卡等操作域浮起容器）
 *   bg-overlay       ← `--bg-elevated`（hover 详情卡/popover）
 *   specific-sidebar-fill ← `--bg`（框架层：侧栏/composer/settings 同层同色）
 *   label-primary    ← `--neutral-fg`；label-secondary ← `--neutral-mid`
 *   border-l1        ← `--border`；border-l2 ← `--border-strong`
 *   brand-primary    ← `--accent`（六色各自的名义色相）
 *   state-error      ← `--danger`；state-success ← `--success`；state-warn ← `--warn`
 *   state-idle       ← `--neutral-dim`（低显著度元信息档，宿主 idle 语义最近邻）
 *   state-done       ← `--reasoning`（思考块紫；宿主 done 默认 violet-600 同色相族）
 */

/** 双模值：宿主 `validateOverrides` 强制两字段都是字符串（AS11，裸字符串抛教学错误）。 */
export interface TokenModes {
  /** 宿主 colorScheme = 'light' 时生效的值。 */
  light: string
  /** 宿主 colorScheme = 'dark' 时生效的值。 */
  dark: string
}

/** 覆盖层 token 表：token 名 → 双模值（与宿主 `ThemeTokenOverrides` 同构）。 */
export type TokenTable = Record<string, TokenModes>

/**
 * 32 个受覆盖 token 的规范名（顺序即本表声明序，测试按它对账）。
 *
 * 前 15 个 = P1 核心表（背景/文字/边框/状态色主档）；中间 5 个 = 外观深化层 2 职能分色——
 * 它们默认引用 `--dsw-static-deepseek-*`（层 1 染色后自动变绿），但 taiji 的职能分色裁决
 * （style.css「主行动 = 青玉 A9；链接正蓝见 --link-c；accent 不再兼职链接」）要求：
 *   · link 保持正蓝（taiji --link-c 六色各有值，非品牌色）；
 *   · bubble 是中性 elevated 色不是 accent 色（taiji --bubble-bg：暗族 = bg-elevated 派生、
 *     亮族独立档 #fefefe）；
 *   · label-deep-diving（宿主深度思考标签）对齐 taiji --reasoning 思考紫。
 *
 * 末尾 12 个 = 模型服务分区（dsh-model-service D10）的状态色派生档与亮族压暗档：
 *   · soft/ring 8 个：四族状态色（brand/err/warn/ok）各两档——soft 是低透明度同色相底
 *     （badge/chip 底），ring 是中透明度描边（焦点圈/警示边）。taiji 侧无对应档（PR5：
 *     全仓无 -soft/-ring 先例），值为构造值，rgba 透明度形态使底色自动跟随消费点背景。
 *   · ink 4 个：亮族 on-soft 文字压暗档（先例 = link 亮支 #2e6ae0「亮族压暗档」）。
 *     亮列 = 主档亮值压暗到 on-soft 对比度 ≥ 4.5:1（对比度由 tokens.spec.ts 机器验算）；
 *     暗列 = 主档暗值（暗族主档本就为暗底调亮，直接可读）——err 例外提亮为 #d49191，
 *     因 err 主档暗值 #bf6b6b 亮度是四族中最低（L≈0.23），on err-soft 只有 3.7:1 不达标。
 *
 * 全部 12 个不进 index.js 的 `FIRST_FRAME_TOKENS`（消费点都在 mount 后的分区组件里）。
 */
export const THEME_TOKEN_NAMES = [
  '--dsw-alias-bg-base',
  '--dsw-alias-bg-layer-1',
  '--dsw-alias-bg-layer-2',
  '--dsw-alias-bg-overlay',
  '--dsw-specific-sidebar-fill',
  '--dsw-alias-label-primary',
  '--dsw-alias-label-secondary',
  '--dsw-alias-border-l1',
  '--dsw-alias-border-l2',
  '--dsw-alias-brand-primary',
  '--dsw-alias-state-error-primary',
  '--dsw-alias-state-success-primary',
  '--dsw-alias-state-warn-primary',
  '--dsw-alias-state-idle-primary',
  '--dsw-alias-state-done-primary',
  // ── 层 2 职能分色 ───────────────────────────────────────────
  '--dsw-alias-link',
  '--dsw-specific-bubble',
  '--dsw-specific-bubble-highlight',
  '--dsw-alias-label-deep-diving',
  '--dsw-alias-label-deep-diving-shimmer',
  // ── 模型服务分区：状态色派生档 soft/ring（构造值，推导规则见 BASE_TOKENS 各条）──
  '--taiji-brand-soft',
  '--taiji-brand-ring',
  '--taiji-err-soft',
  '--taiji-err-ring',
  '--taiji-warn-soft',
  '--taiji-warn-ring',
  '--taiji-ok-soft',
  '--taiji-ok-ring',
  // ── 模型服务分区：亮族 on-soft 文字压暗档 ──────────────────
  '--taiji-ink',
  '--taiji-ink-err',
  '--taiji-ink-warn',
  '--taiji-ink-ok',
] as const

export type ThemeTokenName = (typeof THEME_TOKEN_NAMES)[number]

/** 六色 id（taiji preset 命名；玄/皓 的 preset 为 ''，用 xuan/hao 作稳定 id）。 */
export const THEME_IDS = ['xuan', 'dailan', 'nuanmo', 'hao', 'qingmo', 'zhuyin'] as const

export type ThemeId = (typeof THEME_IDS)[number]

/** 配色族。明暗模式归宿主持有；族只决定双模表取哪一列的值。 */
export type ThemeFamily = 'light' | 'dark'

/** 配色元数据（外观行 / 诊断文案 / 持久值界定的数据源）。 */
export interface ThemeMeta {
  id: ThemeId
  /** 中文名（单字主题名）。 */
  name: string
  family: ThemeFamily
  /** taiji 侧 data-theme-preset 值（玄/皓 = ''，即族默认）。 */
  preset: string
  /** 是否族默认色（跨族回落的目标，见 buildTable 注释）。 */
  familyDefault: boolean
}

/**
 * 双模基值：暗列 = 玄（taiji `:root`），亮列 = 皓（taiji `[data-theme="light"]`）。
 *
 * 与 index.js `FIRST_FRAME_TOKENS` 逐条同源同值——首帧样式（Node 半场推的 style 行）与
 * 覆盖层（本表经 overrideTokens 叠的层）必须给出同一组取值，否则默认色用户在 mount
 * 瞬间会看到一次跳色（V1 第 ④ 步判据）。tokens.spec.ts 对 index.js 的
 * `FIRST_FRAME_STYLE` 做逐 token 漂移断言。
 */
const BASE_TOKENS: Record<ThemeTokenName, TokenModes> = {
  '--dsw-alias-bg-base': { light: '#f7f6f3', dark: '#18181b' },
  '--dsw-alias-bg-layer-1': { light: '#efedea', dark: '#1d1d20' },
  '--dsw-alias-bg-layer-2': { light: '#fcfbf9', dark: '#2d2d30' },
  '--dsw-alias-bg-overlay': { light: '#ffffff', dark: '#323236' },
  '--dsw-specific-sidebar-fill': { light: '#eef1ea', dark: '#242428' },
  '--dsw-alias-label-primary': { light: '#2b2a28', dark: '#e6e6e6' },
  '--dsw-alias-label-secondary': { light: '#706e6a', dark: '#949494' },
  '--dsw-alias-border-l1': { light: 'rgba(0, 0, 0, 0.07)', dark: 'rgba(255, 255, 255, 0.07)' },
  '--dsw-alias-border-l2': { light: 'rgba(0, 0, 0, 0.14)', dark: 'rgba(255, 255, 255, 0.13)' },
  '--dsw-alias-brand-primary': { light: '#43765d', dark: '#7fb89c' },
  '--dsw-alias-state-error-primary': { light: '#b24c4a', dark: '#bf6b6b' },
  '--dsw-alias-state-success-primary': { light: '#368047', dark: '#78a87e' },
  '--dsw-alias-state-warn-primary': { light: '#977629', dark: '#b79c54' },
  '--dsw-alias-state-idle-primary': { light: '#9d9b96', dark: '#6e6e6e' },
  '--dsw-alias-state-done-primary': { light: '#71659c', dark: '#8e85ab' },
  // ── 层 2 职能分色（基值 = 玄的暗支 / 皓的亮支；preset 差异见 PRESET_OVERRIDES）──
  // link ← taiji --link-c：玄 #4d8dff（:root L75）/ 皓 #2e6ae0（亮族压暗档，L307）
  '--dsw-alias-link': { light: '#2e6ae0', dark: '#4d8dff' },
  // bubble ← taiji --bubble-bg：暗族 = bg-elevated 派生（玄 #323236）/ 亮族独立档 #fefefe（L285）
  '--dsw-specific-bubble': { light: '#fefefe', dark: '#323236' },
  // bubble-highlight：taiji 无独立档，构造值 = bubble 邻近档（暗族取 --surface-hover #2d2d31 邻域、
  // 亮族纸白压一档；黛蓝/暖墨的 preset 差异逐色给值）
  '--dsw-specific-bubble-highlight': { light: '#f0efec', dark: '#2d2d31' },
  // label-deep-diving ← taiji --reasoning 思考紫（与 state-done 同源值：暗 #8e85ab / 亮 #71659c）
  '--dsw-alias-label-deep-diving': { light: '#71659c', dark: '#8e85ab' },
  // shimmer 动画端点色：主色提亮一档（构造值）
  '--dsw-alias-label-deep-diving-shimmer': { light: '#8a80b3', dark: '#a39bbd' },

  // ── 模型服务分区：状态色派生档（dsh-model-service D10；基值 = 玄暗列 / 皓亮列）──
  // 派生规则（构造值，taiji 侧无对应档）：rgba(R,G,B,α) 的 RGB 三元组 = 对应主档 token
  // 的同模值（soft/ring 的色相永远跟随 brand/err/warn/ok 主档，六色 preset 差异经
  // PRESET_OVERRIDES 只列主档变了的色）。α 档位：soft 亮 0.12 / 暗 0.18——亮族 0.12
  // 落在 border-l1(0.07) 与 border-l2(0.14) 之间的「薄洗」域，暗族抬到 0.18 因暗底上
  // 低透明色可见性衰减；ring 亮 0.35 / 暗 0.45——描边须比底实一档才成形。
  // brand ← --dsw-alias-brand-primary（皓 #43765d / 玄 #7fb89c）
  '--taiji-brand-soft': { light: 'rgba(67, 118, 93, 0.12)', dark: 'rgba(127, 184, 156, 0.18)' },
  '--taiji-brand-ring': { light: 'rgba(67, 118, 93, 0.35)', dark: 'rgba(127, 184, 156, 0.45)' },
  // err ← --dsw-alias-state-error-primary（皓 #b24c4a / 玄 #bf6b6b）
  '--taiji-err-soft': { light: 'rgba(178, 76, 74, 0.12)', dark: 'rgba(191, 107, 107, 0.18)' },
  '--taiji-err-ring': { light: 'rgba(178, 76, 74, 0.35)', dark: 'rgba(191, 107, 107, 0.45)' },
  // warn ← --dsw-alias-state-warn-primary（皓 #977629 / 玄 #b79c54）
  '--taiji-warn-soft': { light: 'rgba(151, 118, 41, 0.12)', dark: 'rgba(183, 156, 84, 0.18)' },
  '--taiji-warn-ring': { light: 'rgba(151, 118, 41, 0.35)', dark: 'rgba(183, 156, 84, 0.45)' },
  // ok ← --dsw-alias-state-success-primary（皓 #368047 / 玄 #78a87e）
  '--taiji-ok-soft': { light: 'rgba(54, 128, 71, 0.12)', dark: 'rgba(120, 168, 126, 0.18)' },
  '--taiji-ok-ring': { light: 'rgba(54, 128, 71, 0.35)', dark: 'rgba(120, 168, 126, 0.45)' },
  // ink 亮列 = 主档亮值压暗到 on-soft ≥ 4.5:1（WCAG 4.5:1，tokens.spec.ts 逐六色验算）；
  // 暗列 = 主档暗值（err 例外：主档暗值 on err-soft 仅 3.7:1，提亮到 #d49191 达 5.6:1）
  '--taiji-ink': { light: '#2f5a46', dark: '#7fb89c' },
  '--taiji-ink-err': { light: '#9a3836', dark: '#d49191' },
  '--taiji-ink-warn': { light: '#7a5d1f', dark: '#b79c54' },
  '--taiji-ink-ok': { light: '#296339', dark: '#78a87e' },
}

/**
 * 预设色对基值的覆盖：只列 taiji preset 块里**实际改了什么**，逐条对照 style.css。
 *
 * 覆盖范围与 taiji 侧一致——暗族预设（黛蓝/暖墨）改背景阶梯、文字档、state-idle 与 accent，
 * 不改边框与 danger/success/warn（其 preset 块只重声明 --neutral-dim 一个状态色，其余
 * 状态色未重声明，继承 `:root` 暗值）；亮族预设（青墨/朱印）只改 accent
 * 三件套里的 brand-primary（link-c/code-c 不在本包 15 token 集合内），朱印另改 danger
 * （taiji 朱印块唯一独立状态色，玫红防撞色）。
 *
 * 派生档（--taiji-* 12 个）只随主档差异传导：soft/ring 的色相 = 主档色相（α 固定），
 * ink 亮列 = 主档亮值压暗、暗列 = 主档暗值（err 恒玄暗列——preset 对 err 的改动只在
 * 亮族朱印块）。因此 preset 差异项 = 派生规则在「该 preset 改了哪个主档」上的机械展开：
 * 黛蓝/暖墨只改 brand 族三件（soft/ring/ink 的暗列），青墨只改 brand 族三件（亮列），
 * 朱印改 brand 与 err 两族各三件（亮列）；warn/ok 六色无 preset 改动、零差异项。
 */
interface PresetOverrides {
  /** 只改自己族那一列；另一列保持族基值（回落规则见 buildTable）。 */
  dark?: Partial<Record<ThemeTokenName, string>>
  light?: Partial<Record<ThemeTokenName, string>>
}

const PRESET_OVERRIDES: Record<ThemeId, PresetOverrides> = {
  // 玄 = 暗族默认，两列皆基值
  xuan: {},
  // 黛蓝（暗 · 依稀蓝相）：style.css :root[data-theme-preset="dailan"]
  dailan: {
    dark: {
      '--dsw-alias-bg-base': '#16171e',
      '--dsw-alias-bg-layer-1': '#1b1c24',
      '--dsw-alias-bg-layer-2': '#2e2f3a',
      '--dsw-alias-bg-overlay': '#31333e',
      '--dsw-specific-sidebar-fill': '#262836',
      '--dsw-alias-label-primary': '#e9eaef',
      '--dsw-alias-label-secondary': '#8f909b',
      '--dsw-alias-state-idle-primary': '#6d6e79',
      '--dsw-alias-brand-primary': '#8b9cc8',
      // 层 2 preset 差异：link L387 / bubble（demo 注释：黛蓝 --elevated #31333e 同值）
      '--dsw-alias-link': '#6196f0',
      '--dsw-specific-bubble': '#31333e',
      '--dsw-specific-bubble-highlight': '#2c2f3b',
      // 派生档随 brand 主档（#8b9cc8）传导：soft/ring 同 α 换色相；ink 暗列 = 主档值
      '--taiji-brand-soft': 'rgba(139, 156, 200, 0.18)',
      '--taiji-brand-ring': 'rgba(139, 156, 200, 0.45)',
      '--taiji-ink': '#8b9cc8',
    },
  },
  // 暖墨（暗 · 宣纸暖相）：style.css :root[data-theme-preset="nuanmo"]
  nuanmo: {
    dark: {
      '--dsw-alias-bg-base': '#171614',
      '--dsw-alias-bg-layer-1': '#1c1917',
      '--dsw-alias-bg-layer-2': '#302d28',
      '--dsw-alias-bg-overlay': '#35322c',
      '--dsw-specific-sidebar-fill': '#272421',
      '--dsw-alias-label-primary': '#e9e7e2',
      '--dsw-alias-label-secondary': '#97928a',
      '--dsw-alias-state-idle-primary': '#716c64',
      '--dsw-alias-brand-primary': '#cbbc93',
      // 层 2 preset 差异：link L434 / bubble（demo 注释：暖墨 --elevated #35322c 同值）
      '--dsw-alias-link': '#5b8fdd',
      '--dsw-specific-bubble': '#35322c',
      '--dsw-specific-bubble-highlight': '#302d28',
      // 派生档随 brand 主档（#cbbc93）传导：soft/ring 同 α 换色相；ink 暗列 = 主档值
      '--taiji-brand-soft': 'rgba(203, 188, 147, 0.18)',
      '--taiji-brand-ring': 'rgba(203, 188, 147, 0.45)',
      '--taiji-ink': '#cbbc93',
    },
  },
  // 皓 = 亮族默认，两列皆基值
  hao: {},
  // 青墨（亮 · 宣纸花青）：style.css [data-theme="light"][data-theme-preset="qingmo"]
  qingmo: {
    light: {
      '--dsw-alias-brand-primary': '#356b7a',
      // 层 2 preset 差异：link L463（亮族 preset 的链接压深档）
      '--dsw-alias-link': '#2d6cd4',
      // 派生档随 brand 主档（#356b7a）传导：soft/ring 同 α 换色相；ink 亮列 = 主档压暗
      '--taiji-brand-soft': 'rgba(53, 107, 122, 0.12)',
      '--taiji-brand-ring': 'rgba(53, 107, 122, 0.35)',
      '--taiji-ink': '#28535f',
    },
  },
  // 朱印（亮 · 宣纸朱砂）：style.css [data-theme="light"][data-theme-preset="zhuyin"]
  zhuyin: {
    light: {
      '--dsw-alias-brand-primary': '#9c4335',
      '--dsw-alias-state-error-primary': '#b23855',
      // 层 2 preset 差异：link L495
      '--dsw-alias-link': '#3163c8',
      // 派生档随 brand 与 err 两族主档传导（朱印是唯一改状态色主档的亮族 preset）
      '--taiji-brand-soft': 'rgba(156, 67, 53, 0.12)',
      '--taiji-brand-ring': 'rgba(156, 67, 53, 0.35)',
      '--taiji-ink': '#7d3629',
      '--taiji-err-soft': 'rgba(178, 56, 85, 0.12)',
      '--taiji-err-ring': 'rgba(178, 56, 85, 0.35)',
      '--taiji-ink-err': '#8f2a43',
    },
  },
}

/**
 * 由基值 + 预设覆盖合成一个配色的双模表。
 *
 * 两支各自独立解析（D2「两支独立解析」）：宿主 `composeActive` 按当前 colorScheme 取
 * `modes[colorScheme]`（AS2），本包不需要知道当前是亮是暗——宿主自己选。
 *
 * **跨族支的取值规则 = taiji 自身的解析语义**（useTaijiThemes.ts `resolveTaijiTheme`：
 * preset 只在所属族内生效，跨族回落到该族默认）。因此：
 *   · 暗族三色（玄/黛蓝/暖墨）的亮列 = 皓的亮值（亮族默认）；
 *   · 亮族三色（皓/青墨/朱印）的暗列 = 玄的暗值（暗族默认）。
 *
 * 效果即 V2 第 ④ 步的判据：宿主偏好为 dark 时点选亮族「皓」，界面呈现「皓的暗支取值」
 * ——暗族默认那套——而不是切到亮模式；宿主偏好值全程不被本包改写（跨族选色不改写宿主
 * 偏好，resolve.ts 是一等约束）。
 *
 * 为什么不用「对族阶梯 + 本色 accent」的替代取值：那样默认色（玄）的亮列会与 index.js
 * 首帧样式差一个 brand-primary 取值（#7fb89c ≠ 首帧的 #43765d），默认色用户每次 mount
 * 都会跳一次色，直接违反 V1 第 ④ 步；且该替代值在太极侧无来源（亮族预设从不借用暗族
 * accent），属臆造。taiji 回落语义零臆造且首帧自洽。
 */
function buildTable(id: ThemeId): TokenTable {
  const overrides = PRESET_OVERRIDES[id]
  const table: TokenTable = {}
  for (const name of THEME_TOKEN_NAMES) {
    const base = BASE_TOKENS[name]
    table[name] = Object.freeze({
      light: overrides.light?.[name] ?? base.light,
      dark: overrides.dark?.[name] ?? base.dark,
    })
  }
  return Object.freeze(table)
}

/** 六色元数据（顺序 = 外观行平铺序：暗族三色在前，与 taiji 设置区配色行权威序一致）。 */
export const THEMES: Readonly<Record<ThemeId, ThemeMeta>> = Object.freeze({
  xuan: { id: 'xuan', name: '玄', family: 'dark', preset: '', familyDefault: true },
  dailan: { id: 'dailan', name: '黛蓝', family: 'dark', preset: 'dailan', familyDefault: false },
  nuanmo: { id: 'nuanmo', name: '暖墨', family: 'dark', preset: 'nuanmo', familyDefault: false },
  hao: { id: 'hao', name: '皓', family: 'light', preset: '', familyDefault: true },
  qingmo: { id: 'qingmo', name: '青墨', family: 'light', preset: 'qingmo', familyDefault: false },
  zhuyin: { id: 'zhuyin', name: '朱印', family: 'light', preset: 'zhuyin', familyDefault: false },
})

/**
 * 六色双模表（模块装载时一次合成，只读）。
 *
 * 宿主 `overrideTokens` 每次调用都会把表拷进自己的校验对象（`validateOverrides` 逐项新建
 * `{ light, dark }`），因此共发表不会被宿主或调用方改坏；这里仍逐项 freeze，让「本包自己
 * 误改」在开发期就炸而不是静默污染下一层。
 */
export const THEME_TOKEN_TABLES: Readonly<Record<ThemeId, TokenTable>> = Object.freeze(
  Object.fromEntries(THEME_IDS.map((id) => [id, buildTable(id)])) as Record<ThemeId, TokenTable>,
)

/**
 * 包默认色 = 玄（D2「默认值」：GL1 要求装好打开就认出是太极，默认必须注册覆盖层；
 * 取暗族首色。首启不写宿主偏好——若宿主是 system 且系统为亮，呈现玄的亮支取值）。
 */
export const DEFAULT_THEME_ID: ThemeId = 'xuan'
