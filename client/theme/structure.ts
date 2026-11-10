/**
 * client/theme/structure.ts —— 结构值：圆角四档 + 字重/行高复合简写重写（外观深化层 3）。
 *
 * 字重的载体修正（层 3 对 p1-shell-identity P1/D7 的修正）：P1 覆盖了 48 个 `*-font-weight` / `*-line-height`
 * 独立子 token，但宿主组件只消费复合简写（`font: var(--dsw-font-markdown-base)`），独立子
 * token 消费点为 0——字重覆盖从未产生视觉效果。p1-shell-identity P1 的 D7 论证「覆盖复合简写会连带冻结用户
 * 字号与字族」只在整串写死的前提下成立：实测宿主复合简写本身就是 var() 组装的
 * （`var(--dsh-content-font-size, 14px) / calc(24px + var(--dsh-content-font-delta))
 * var(--dsw-font-family)`），**重写时逐字保留 size 与 family 的 var() 表达式、只替换
 * weight 数值与行高**，用户的 ⌘+/⌘- 字号与字族选择完好（RL9 的红线本意正是保住这两轴）。
 *
 * 由此本文件的三条硬约束：
 *   ① size 表达式与 family 表达式必须与宿主 gradient-shadow-text.css 当前字面**逐段一致**
 *      （宿主改 size 计算式时本表必须同步——由 `client/theme/host-font-sheet.spec.ts` 对账
 *      看守，宿主源在位时逐 token 比对，不一致即红）；
 *   ② family 段只允许 `var(--dsw-font-family)` / `var(--ds-font-family-code)` 两种宿主引用
 *      （check-forbidden-tokens 的 RL9:font-shorthand 规则按此放行，其余形态仍拦）；
 *   ③ weight / 行高只写 taiji 三档（--fw-text 500 / --fw-mid 600 / --fw-bold 700 与行高
 *      1.32 标题 / 1.62 正文 / 1.4 控件，2026-10-06 对话流视觉裁决）。
 *
 * 取值来源（与 P1 的映射裁决一致，只是载体从子 token 换成复合简写）：
 *   · weight：宿主 400 常规档 → 500；宿主 500/600 的 strong 档与表头 → 600；h1-h3 保持 700；
 *     l-20/m-18/xl-24 宿主已是 500/500/600，重写串里直接写 taiji 终值（单一载体不存在「同值省略」
 *     的考虑——本表是整串重写，不存在部分声明）。
 *   · 行高：标题 h1-h4 → 1.32；markdown 正文族（含表格/代码）→ 1.62；UI 阶梯 → 1.4。
 *     行高用 unitless 倍率（taiji 语义：随字号轴自然缩放）；code-block-small 宿主的更紧
 *     档（16px 行高）在 taiji 无对应双档，统一 1.62。
 *
 * 圆角四档不变（宿主经 `var(--dsw-radius-*)` 消费，P1 已验证生效）：太极 4/6/8/12 →
 * 宿主 xs/sm/md/lg；xl（20px）/panel（28px）太极无对应档不覆盖。
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
}

/** taiji 字重三档与行高三档（唯一取值来源，重写表按角色引用）。 */
const WEIGHT_TEXT = '500' // --fw-text 日常文字
const WEIGHT_MID = '600' // --fw-mid 中档：行容器 / 组头 / strong
const WEIGHT_BOLD = '700' // --fw-bold 标题
const LEADING_TIGHT = '1.32' // --m-leading-tight 标题
const LEADING_BODY = '1.62' // --m-leading-body 正文
const LEADING_UI = '1.4' // --m-leading-ui 控件

/** 宿主字体 var 引用的逐字形态（重写值必须原样引用；对账脚本按同一字面比对）。 */
const FAMILY_UI = 'var(--dsw-font-family)'
const FAMILY_CODE = 'var(--ds-font-family-code)'
const SIZE_CONTENT = 'var(--dsh-content-font-size, 14px)'
const SIZE_CONTENT_SECONDARY = 'var(--dsh-content-font-size-secondary, 13px)'

/**
 * 字体复合简写重写表（30 个主体：17 markdown + 13 UI 阶梯）。
 *
 * 每条值 = `[italic] <weight> <宿主 size 表达式逐字>/<taiji 行高> <宿主 family 引用逐字>`。
 * size 表达式逐字抄自宿主 gradient-shadow-text.css（含 calc/delta 形态与 14px 缺省值）；
 * family 引用只允许上面两个常量。任何改动宿主侧表达式的「顺手简化」都会冻结对应轴。
 */
export const FONT_SHORTHAND_TOKENS: TokenTable = {
  // ── markdown 标题（weight 700/600 · 行高 1.32）────────────────
  '--dsw-font-markdown-h1': both(`${WEIGHT_BOLD} calc(21px + var(--dsh-content-font-delta))/${LEADING_TIGHT} ${FAMILY_UI}`),
  '--dsw-font-markdown-h2': both(`${WEIGHT_BOLD} calc(19px + var(--dsh-content-font-delta))/${LEADING_TIGHT} ${FAMILY_UI}`),
  '--dsw-font-markdown-h3': both(`${WEIGHT_BOLD} calc(18px + var(--dsh-content-font-delta))/${LEADING_TIGHT} ${FAMILY_UI}`),
  '--dsw-font-markdown-h4': both(`${WEIGHT_MID} ${SIZE_CONTENT}/${LEADING_TIGHT} ${FAMILY_UI}`),

  // ── markdown 正文族（weight 500/600 · 行高 1.62）──────────────
  '--dsw-font-markdown-base': both(`${WEIGHT_TEXT} ${SIZE_CONTENT}/${LEADING_BODY} ${FAMILY_UI}`),
  '--dsw-font-markdown-base-strong': both(`${WEIGHT_MID} ${SIZE_CONTENT}/${LEADING_BODY} ${FAMILY_UI}`),
  '--dsw-font-markdown-base-italic': both(`italic ${WEIGHT_TEXT} ${SIZE_CONTENT}/${LEADING_BODY} ${FAMILY_UI}`),
  '--dsw-font-markdown-base-strong-italic': both(`italic ${WEIGHT_MID} ${SIZE_CONTENT}/${LEADING_BODY} ${FAMILY_UI}`),
  '--dsw-font-markdown-table': both(`${WEIGHT_TEXT} ${SIZE_CONTENT_SECONDARY}/${LEADING_BODY} ${FAMILY_UI}`),
  '--dsw-font-markdown-table-head': both(`${WEIGHT_MID} ${SIZE_CONTENT_SECONDARY}/${LEADING_BODY} ${FAMILY_UI}`),
  '--dsw-font-markdown-small': both(`${WEIGHT_TEXT} 12px/${LEADING_BODY} ${FAMILY_UI}`),
  '--dsw-font-markdown-small-strong': both(`${WEIGHT_MID} 12px/${LEADING_BODY} ${FAMILY_UI}`),
  '--dsw-font-markdown-small-italic': both(`italic ${WEIGHT_TEXT} 12px/${LEADING_BODY} ${FAMILY_UI}`),
  '--dsw-font-markdown-small-strong-italic': both(`italic ${WEIGHT_MID} 12px/${LEADING_BODY} ${FAMILY_UI}`),

  // ── markdown 代码族（weight 500 · 行高 1.62 · code 字族轴）────
  '--dsw-font-markdown-code': both(`${WEIGHT_TEXT} calc(12px + var(--dsh-code-font-delta))/${LEADING_BODY} ${FAMILY_CODE}`),
  '--dsw-font-markdown-code-block': both(`${WEIGHT_TEXT} var(--dsh-code-font-size, 11px)/${LEADING_BODY} ${FAMILY_CODE}`),
  '--dsw-font-markdown-code-block-small': both(`${WEIGHT_TEXT} var(--dsh-code-font-size, 11px)/${LEADING_BODY} ${FAMILY_CODE}`),

  // ── UI 阶梯（weight 500/600 · 行高 1.4；size 逐字保留宿主字面，含 m-18 的 16px）──
  '--dsw-font-xl-24': both(`${WEIGHT_MID} 24px/${LEADING_UI} ${FAMILY_UI}`),
  '--dsw-font-l-20': both(`${WEIGHT_TEXT} 20px/${LEADING_UI} ${FAMILY_UI}`),
  '--dsw-font-m-18': both(`${WEIGHT_TEXT} 16px/${LEADING_UI} ${FAMILY_UI}`),
  '--dsw-font-base-16': both(`${WEIGHT_TEXT} 16px/${LEADING_UI} ${FAMILY_UI}`),
  '--dsw-font-base-strong-16': both(`${WEIGHT_MID} 16px/${LEADING_UI} ${FAMILY_UI}`),
  '--dsw-font-s-14': both(`${WEIGHT_TEXT} 14px/${LEADING_UI} ${FAMILY_UI}`),
  '--dsw-font-s-strong-14': both(`${WEIGHT_MID} 14px/${LEADING_UI} ${FAMILY_UI}`),
  '--dsw-font-xs-13': both(`${WEIGHT_TEXT} 13px/${LEADING_UI} ${FAMILY_UI}`),
  '--dsw-font-xs-strong-13': both(`${WEIGHT_MID} 13px/${LEADING_UI} ${FAMILY_UI}`),
  '--dsw-font-xxs-12': both(`${WEIGHT_TEXT} 12px/${LEADING_UI} ${FAMILY_UI}`),
  '--dsw-font-xxs-strong-12': both(`${WEIGHT_MID} 12px/${LEADING_UI} ${FAMILY_UI}`),
  '--dsw-font-xxxs-11': both(`${WEIGHT_TEXT} 11px/${LEADING_UI} ${FAMILY_UI}`),
  '--dsw-font-xxxs-strong-11': both(`${WEIGHT_MID} 11px/${LEADING_UI} ${FAMILY_UI}`),
}

/** 结构层全表：圆角 + 字体复合简写（applyStructureLayer 一把装配）。 */
export const STRUCTURE_TOKENS: TokenTable = { ...RADIUS_TOKENS, ...FONT_SHORTHAND_TOKENS }
