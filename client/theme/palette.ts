/**
 * client/theme/palette.ts —— 静态调色板重定义（外观深化层 1）。
 *
 * 背景（真机像素采样的根因）：P1 只覆盖了 15 个 alias 主档，而宿主的交互色走另一条链——
 * `--dsw-static-deepseek-*`（品牌蓝 10 档，真机图标蓝 #7babff = deepseek-400 的
 * rgb(122,170,255)）与 `--dsw-static-neutral-bluish-*`（带蓝偏的中性 22 档）被约 100 个
 * P1 未覆盖的 alias 经 var() 引用（link / button-info / state-business / bubble /
 * deep-diving / sidebar-nav-accent / markdown-code-block / tooltip / toast …）。宿主
 * `overrideTokens` 不校验 token 名（AS1），static 层可以整层重定义：**改调色板一次，
 * 全部下游 alias 自动跟随**，无需逐个枚举（长期方案：宿主每次新增 alias 都自动吃到）。
 *
 * 两张表的构造规则（诚实口径：除锚定档外为构造值，非逐字抄录）：
 *   · neutral-bluish 22 档 → 同明度去蓝。暗列对齐太极玄族 zinc 曲线（#18181b 系），
 *     亮列对齐皓族纸白曲线（#f7f6f3 系）——对应 taiji「neutral 谱系纯中性六档，决策 2
 *     去蓝偏」的裁决。关键档直接锚定 taiji 精确值：850 暗 = bubble 源 → #323236
 *     （--bg-elevated）、900 暗 = code-block 源 → #1d1d20（--bg-input）、950 暗 → #18181b
 *     （--surface）、1000 亮 = label-primary 源 → #2b2a28（皓正文墨色）。
 *     亮列 950 比 1000 深属刻意（1000 只作文字色不作背景，档位顺序仅对背景阶梯有意义）。
 *   · deepseek 10 档 → 灰绿单色相阶梯。强调档（400/450/500）随配色 accent 派生；底色档
 *     （50-200/600-900）为跨配色统一的绿灰（各 preset 选中态底在 taiji 侧带本色相，但差异
 *     低于肉眼可辨阈值，不为它们建 6 套表——取舍登记：色卡切换时浅底绿灰不变）。
 *   · 强调档的 fill/hover 语义对位（taiji 暗族 hover 提亮 / 亮族压暗 × 宿主 dark 模式
 *     hover=500、light 模式 hover=400）正好互补：dark 列 400=accent、500=hover 提亮档；
 *     light 列 500=accent、400=hover 压暗档。450 与 fill 同值（宿主把它用作文件图标等
 *     静态强调）。
 *
 * 不动 `--dsw-static-blue-*`（11 档）：ui-primitives/src/ansi.ts 用 blue-400/500/600 做终端
 * ANSI 功能性色板，染色会破坏终端输出语义；taiji 自身链接保持正蓝，蓝在其体系内合法。
 * 同理不动 green/red/amber/violet（diff 与状态语义色，taiji 侧由 state-* alias 已对齐）。
 *
 * preset 的强调档取值与 tokens.ts 的跨族回落语义完全同构（resolveTaijiTheme：preset 只在
 * 所属族内生效）：暗族三色的亮列 = 皓的值，亮族三色的暗列 = 玄的值。
 */
import type { ThemeId, TokenModes, TokenTable } from './tokens'

/** taiji 六色的名义 accent 与 hover 档（双模），逐字抄自 taiji style.css 六个主题块。 */
const ACCENT_BY_THEME: Record<ThemeId, { accent: TokenModes; hover: TokenModes }> = {
  // 玄（暗 · 默认）：--accent #7fb89c / --accent-hover #92c7ae（提亮）
  xuan: { accent: { light: '#43765d', dark: '#7fb89c' }, hover: { light: '#386650', dark: '#92c7ae' } },
  // 黛蓝（暗）：dark 支本色 / light 支回落皓
  dailan: { accent: { light: '#43765d', dark: '#8b9cc8' }, hover: { light: '#386650', dark: '#9dafdc' } },
  // 暖墨（暗）：dark 支本色 / light 支回落皓
  nuanmo: { accent: { light: '#43765d', dark: '#cbbc93' }, hover: { light: '#386650', dark: '#dfcfa6' } },
  // 皓（亮 · 默认）：light 支本色 / dark 支回落玄
  hao: { accent: { light: '#43765d', dark: '#7fb89c' }, hover: { light: '#386650', dark: '#92c7ae' } },
  // 青墨（亮）：light 支本色 / dark 支回落玄
  qingmo: { accent: { light: '#356b7a', dark: '#7fb89c' }, hover: { light: '#265d6b', dark: '#92c7ae' } },
  // 朱印（亮）：light 支本色 / dark 支回落玄
  zhuyin: { accent: { light: '#9c4335', dark: '#7fb89c' }, hover: { light: '#8b3427', dark: '#92c7ae' } },
}

/**
 * 中性调色板：22 档 neutral-bluish → taiji 双族纯灰阶（不随配色变）。
 *
 * 档位顺序按宿主明度曲线（00 白 → 1000 近黑）；值 = 同明度去蓝（构造规则见文件头）。
 */
export const NEUTRAL_PALETTE_TOKENS: TokenTable = {
  '--dsw-static-neutral-bluish-00': { light: '#ffffff', dark: '#ffffff' },
  '--dsw-static-neutral-bluish-50': { light: '#faf9f7', dark: '#fafafa' },
  '--dsw-static-neutral-bluish-55': { light: '#f7f6f3', dark: '#f4f4f5' },
  '--dsw-static-neutral-bluish-60': { light: '#f7f6f3', dark: '#f4f4f5' },
  '--dsw-static-neutral-bluish-75': { light: '#f1f0ec', dark: '#ececee' },
  '--dsw-static-neutral-bluish-90': { light: '#efedea', dark: '#e4e4e7' },
  '--dsw-static-neutral-bluish-100': { light: '#ecebe7', dark: '#e0e0e3' },
  '--dsw-static-neutral-bluish-150': { light: '#e5e3de', dark: '#d4d4d8' },
  '--dsw-static-neutral-bluish-200': { light: '#d6d4cf', dark: '#c8c8cd' },
  '--dsw-static-neutral-bluish-300': { light: '#b8b6b1', dark: '#a1a1aa' },
  '--dsw-static-neutral-bluish-310': { light: '#a8a6a1', dark: '#9a9aa3' },
  '--dsw-static-neutral-bluish-400': { light: '#8f8d88', dark: '#8b8b93' },
  '--dsw-static-neutral-bluish-500': { light: '#7a7873', dark: '#71717a' },
  '--dsw-static-neutral-bluish-600': { light: '#6b6964', dark: '#64646c' },
  '--dsw-static-neutral-bluish-700': { light: '#55534e', dark: '#55555c' },
  '--dsw-static-neutral-bluish-750': { light: '#44423e', dark: '#48484f' },
  '--dsw-static-neutral-bluish-800': { light: '#383633', dark: '#3f3f46' },
  // 850 暗列锚定 taiji --bg-elevated（bubble 的暗底源）
  '--dsw-static-neutral-bluish-850': { light: '#302e2b', dark: '#323236' },
  '--dsw-static-neutral-bluish-875': { light: '#2c2a27', dark: '#28282c' },
  // 900 暗列锚定 taiji --bg-input（markdown-code-block 的暗底源）
  '--dsw-static-neutral-bluish-900': { light: '#292725', dark: '#1d1d20' },
  // 950 暗列锚定 taiji --surface
  '--dsw-static-neutral-bluish-950': { light: '#232120', dark: '#18181b' },
  // 1000 亮列锚定 taiji 皓正文墨色（label-primary 亮支源）
  '--dsw-static-neutral-bluish-1000': { light: '#2b2a28', dark: '#101012' },
}

/** deepseek 底色档（跨配色统一的绿灰；强调档 400/450/500 见 accentPaletteTokens）。 */
const DEEPSEEK_BASE_TOKENS: TokenTable = {
  '--dsw-static-deepseek-50': { light: '#f0f4f1', dark: '#1f2a25' },
  '--dsw-static-deepseek-100': { light: '#e2ebe5', dark: '#24332c' },
  '--dsw-static-deepseek-200': { light: '#d3e0d7', dark: '#2b3d34' },
  '--dsw-static-deepseek-600': { light: '#9db8aa', dark: '#40584b' },
  '--dsw-static-deepseek-700-delete': { light: '#b5c9be', dark: '#35493e' },
  '--dsw-static-deepseek-800': { light: '#e5ebe7', dark: '#223129' },
  '--dsw-static-deepseek-900': { light: '#cfdcd5', dark: '#1a251f' },
}

/**
 * 指定配色的静态调色板（中性 22 档 + deepseek 10 档，其中强调档按该色 accent 派生）。
 *
 * 与 tokens.ts 的六色表在同一主题层一次叠入（apply 侧不单独分层）：换色 = 整层替换，
 * 强调档随之换到新色的 accent——deepseek 调色板与 alias 表永远同色相，不存在
 * 「alias 绿了、static 还是蓝」的中间态。
 */
export function paletteTokensFor(id: ThemeId): TokenTable {
  const { accent, hover } = ACCENT_BY_THEME[id]
  const emphasis: TokenTable = {
    // dark：400=accent / 500=hover 提亮；light：500=accent / 400=hover 压暗（文件头对位论证）
    '--dsw-static-deepseek-400': { light: hover.light, dark: accent.dark },
    '--dsw-static-deepseek-450': { light: accent.light, dark: accent.dark },
    '--dsw-static-deepseek-500': { light: accent.light, dark: hover.dark },
  }
  return { ...NEUTRAL_PALETTE_TOKENS, ...DEEPSEEK_BASE_TOKENS, ...emphasis }
}
