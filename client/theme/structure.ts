/**
 * client/theme/structure.ts —— 结构值：圆角四档 + 字重/行高（设计 §3.3.7 / D7，G8）。
 *
 * 边界（D7 红线，RL9）：**只覆盖独立子 token**——字重只碰 `*-font-weight`、行高只碰
 * `*-line-height`；绝不覆盖 `--dsw-font-*` 复合简写（内含字号与字族，整段覆盖会把用户的
 * ⌘+/⌘- 字号选择与字族选择一起替换成固定值），绝不覆盖 `*-font-size` / `*-font-family`
 * 子 token。宿主现状是复合简写被 `font: var(--dsw-font-*)` 消费、独立子 token 消费点为
 * 0——因此本包的字重/行高覆盖当前不产生视觉效果，属 D7 明示接受的可接受降级（不破坏，
 * 仅不生效）；宿主若改用子 token 消费，本包覆盖自动生效。
 *
 * 取值来源（逐条抄录，不臆造）：
 *   · 圆角 —— 太极侧 `packages/renderer/src/style.css` `:root` 圆角四档
 *     （xs 4 / sm 6 / 8 / 12；该文件头自称令牌值唯一权威）。注：设计 D7 正文写的
 *     「3 / 8 / 12 / 16px」与现行 style.css（4 / 6 / 8 / 12）不一致——style.css 是令牌
 *     权威源且 D7 同段把圆角称作「走 alias 与自定义变量」的既有 token，故取现行四档；
 *     此偏离已记入 dev-flow runlog（U2）。
 *   · 字重 —— style.css `:root` 字重三档 `--fw-text` 500 / `--fw-mid` 600 / `--fw-bold` 700
 *     （2026-10-06 对话流视觉裁决「整体上移一档」；登记表 docs/DESIGN.md §4 同值）。
 *   · 行高 —— docs/DESIGN.md §4 行高三档 `--m-leading-tight` 1.32 / `-body` 1.62 /
 *     `-ui` 1.4（标题 / 正文 / 控件）。
 *
 * 宿主对照（deepseek-harness `packages/client/ui-theme/src/styles/`）：
 *   · 圆角 token = base.css 的 `--dsw-radius-xs/sm/md/lg/xl/panel`（4/8/12/16/20/28px），
 *     经 var(--dsw-radius-*) 在全树消费；本包覆盖前四档，xl/panel 太极无对应档不覆盖。
 *   · 字体两层 = gradient-shadow-text.css：复合简写 `--dsw-font-<名>` 与同名独立子 token
 *     `--dsw-font-<名>-font-weight` / `-line-height` / `-font-size` / `-font-family` /
 *     `-font-style`；本包只写前两类子 token。
 */
import type { TokenModes, TokenTable } from './tokens'

/**
 * 结构值不随明暗变化（圆角 / 字重 / 行高都是 scheme-invariant），但宿主
 * `validateOverrides` 强制每值都是 `{ light, dark }` 双字符串（AS11）——同值重复两遍。
 */
const both = (value: string): TokenModes => ({ light: value, dark: value })

/**
 * 圆角四档（太极 4 / 6 / 8 / 12 → 宿主 --dsw-radius-xs/sm/md/lg）。
 * xs 与宿主默认同值（4px）仍声明：四档是一句完整声明，宿主改档时本包仍持太极值。
 */
export const RADIUS_TOKENS: TokenTable = {
  '--dsw-radius-xs': both('4px'),
  '--dsw-radius-sm': both('6px'),
  '--dsw-radius-md': both('8px'),
  '--dsw-radius-lg': both('12px'),
  // --dsw-radius-xl（20px）/ --dsw-radius-panel（28px）：太极无对应档，不覆盖
}

/** 字重三档 → 宿主独立子 token（括号内为宿主默认值，只列实际改动的档）。 */
const WEIGHT_TEXT = '500' // --fw-text 日常文字
const WEIGHT_MID = '600' // --fw-mid 中档：行容器 / 组头

/** 行高三档 → 宿主独立子 token（unitless 倍率，随字号设置自然缩放，不碰字号轴）。 */
const LEADING_TIGHT = '1.32' // --m-leading-tight 标题
const LEADING_BODY = '1.62' // --m-leading-body 正文
const LEADING_UI = '1.4' // --m-leading-ui 控件

/**
 * 字重与行高的独立子 token 覆盖。
 *
 * 映射规则（按角色归档，任一可一行核对）：
 *   · 字重 —— 正文/表格/代码/UI 阶梯的常规档 → 500（宿主 400）；各 strong 档与表头
 *     （组头）→ 600（宿主 500）。宿主 h1/h2/h3 已是 700、h4 与 base-strong 已是 600、
 *     l-20/m-18 常规档已是 500、xl-24 已是 600——与太极三档相同，不重复声明。
 *   · 行高 —— 标题 h1-h4 → 1.32；markdown 正文族（base/small/table/code 全部变体）
 *     → 1.62；UI 尺寸阶梯（base-16 … xxxs-11 全部变体 + xl-24/m-18）→ 1.4。
 *     l-20 宿主 28px/20px = 1.4 与目标同值，不重复声明。
 */
export const FONT_TOKENS: TokenTable = {
  // ── 字重：日常文字 500（--fw-text）──────────────────────────
  '--dsw-font-markdown-base-font-weight': both(WEIGHT_TEXT),
  '--dsw-font-markdown-base-italic-font-weight': both(WEIGHT_TEXT),
  '--dsw-font-markdown-table-font-weight': both(WEIGHT_TEXT),
  '--dsw-font-markdown-small-font-weight': both(WEIGHT_TEXT),
  '--dsw-font-markdown-small-italic-font-weight': both(WEIGHT_TEXT),
  '--dsw-font-markdown-code-font-weight': both(WEIGHT_TEXT),
  '--dsw-font-markdown-code-block-font-weight': both(WEIGHT_TEXT),
  '--dsw-font-markdown-code-block-small-font-weight': both(WEIGHT_TEXT),
  '--dsw-font-base-16-font-weight': both(WEIGHT_TEXT),
  '--dsw-font-s-14-font-weight': both(WEIGHT_TEXT),
  '--dsw-font-xs-13-font-weight': both(WEIGHT_TEXT),
  '--dsw-font-xxs-12-font-weight': both(WEIGHT_TEXT),
  '--dsw-font-xxxs-11-font-weight': both(WEIGHT_TEXT),

  // ── 字重：中档 600（--fw-mid；宿主 strong 档与表头为 500）──────
  '--dsw-font-markdown-table-head-font-weight': both(WEIGHT_MID),
  '--dsw-font-base-strong-16-font-weight': both(WEIGHT_MID),
  '--dsw-font-s-strong-14-font-weight': both(WEIGHT_MID),
  '--dsw-font-xs-strong-13-font-weight': both(WEIGHT_MID),
  '--dsw-font-xxs-strong-12-font-weight': both(WEIGHT_MID),
  '--dsw-font-xxxs-strong-11-font-weight': both(WEIGHT_MID),

  // ── 行高：标题 1.32（--m-leading-tight）─────────────────────
  '--dsw-font-markdown-h1-line-height': both(LEADING_TIGHT),
  '--dsw-font-markdown-h2-line-height': both(LEADING_TIGHT),
  '--dsw-font-markdown-h3-line-height': both(LEADING_TIGHT),
  '--dsw-font-markdown-h4-line-height': both(LEADING_TIGHT),

  // ── 行高：正文 1.62（--m-leading-body）──────────────────────
  '--dsw-font-markdown-base-line-height': both(LEADING_BODY),
  '--dsw-font-markdown-base-strong-line-height': both(LEADING_BODY),
  '--dsw-font-markdown-base-italic-line-height': both(LEADING_BODY),
  '--dsw-font-markdown-base-strong-italic-line-height': both(LEADING_BODY),
  '--dsw-font-markdown-table-line-height': both(LEADING_BODY),
  '--dsw-font-markdown-table-head-line-height': both(LEADING_BODY),
  '--dsw-font-markdown-small-line-height': both(LEADING_BODY),
  '--dsw-font-markdown-small-strong-line-height': both(LEADING_BODY),
  '--dsw-font-markdown-small-italic-line-height': both(LEADING_BODY),
  '--dsw-font-markdown-small-strong-italic-line-height': both(LEADING_BODY),
  '--dsw-font-markdown-code-line-height': both(LEADING_BODY),
  '--dsw-font-markdown-code-block-line-height': both(LEADING_BODY),
  '--dsw-font-markdown-code-block-small-line-height': both(LEADING_BODY),

  // ── 行高：控件 1.4（--m-leading-ui）────────────────────────
  '--dsw-font-base-16-line-height': both(LEADING_UI),
  '--dsw-font-base-strong-16-line-height': both(LEADING_UI),
  '--dsw-font-s-14-line-height': both(LEADING_UI),
  '--dsw-font-s-strong-14-line-height': both(LEADING_UI),
  '--dsw-font-xs-13-line-height': both(LEADING_UI),
  '--dsw-font-xs-strong-13-line-height': both(LEADING_UI),
  '--dsw-font-xxs-12-line-height': both(LEADING_UI),
  '--dsw-font-xxs-strong-12-line-height': both(LEADING_UI),
  '--dsw-font-xxxs-11-line-height': both(LEADING_UI),
  '--dsw-font-xxxs-strong-11-line-height': both(LEADING_UI),
  '--dsw-font-xl-24-line-height': both(LEADING_UI),
  '--dsw-font-m-18-line-height': both(LEADING_UI),
}

/** 结构层全表：圆角 + 字重/行高（applyStructureLayer 一把装配）。 */
export const STRUCTURE_TOKENS: TokenTable = { ...RADIUS_TOKENS, ...FONT_TOKENS }
