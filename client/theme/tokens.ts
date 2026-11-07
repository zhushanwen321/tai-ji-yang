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
 * inspect token）+ 名单外语义色 `--dsw-alias-state-done-primary`，共 15 个。与 index.js 的
 * `FIRST_FRAME_TOKENS` 逐条同源同值（首帧样式与覆盖层不允许有差异，V1 第 ④ 步），由
 * `tokens.spec.ts` 的漂移断言看守。第三类「不覆盖且不跟随」的硬编码字面色板（shiki /
 * json-tree / file-type）见设计 §2，本包不碰。
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

/** 15 个受覆盖 token 的规范名（顺序即本表声明序，测试按它对账）。 */
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
}

/**
 * 预设色对基值的覆盖：只列 taiji preset 块里**实际改了什么**，逐条对照 style.css。
 *
 * 覆盖面与 taiji 侧一致——暗族预设（黛蓝/暖墨）改背景阶梯、文字档与 accent，不改边框与
 * 状态色（其 preset 块未重声明，继承 `:root` 暗值）；亮族预设（青墨/朱印）只改 accent
 * 三件套里的 brand-primary（link-c/code-c 不在本包 15 token 集合内），朱印另改 danger
 * （taiji 朱印块唯一独立状态色，玫红防撞色）。
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
      '--dsw-alias-brand-primary': '#8b9cc8',
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
      '--dsw-alias-brand-primary': '#cbbc93',
    },
  },
  // 皓 = 亮族默认，两列皆基值
  hao: {},
  // 青墨（亮 · 宣纸花青）：style.css [data-theme="light"][data-theme-preset="qingmo"]
  qingmo: {
    light: {
      '--dsw-alias-brand-primary': '#356b7a',
    },
  },
  // 朱印（亮 · 宣纸朱砂）：style.css [data-theme="light"][data-theme-preset="zhuyin"]
  zhuyin: {
    light: {
      '--dsw-alias-brand-primary': '#9c4335',
      '--dsw-alias-state-error-primary': '#b23855',
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
