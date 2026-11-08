/**
 * client/brand/hero-area.tsx —— 空会话 hero 首屏品牌区（双鱼标放大版 + 产品名 + 欢迎语）。
 *
 * 注册进 `conversation.hero.brand.mark`（single/root；宿主 owner props = `{ size, className? }`，
 * 见 mark.tsx 的 `installBrandMarkSlots`）。目标是 taiji 工作台首屏观感：竖排居中
 * 「双鱼标 → 太极 → 欢迎语」。
 *
 * 宿主容器约束（侦查结论，证据 = deepseek-harness packages/client/ui-conversation）：
 *   · 槽内容渲染在 HeroShell.tsx 的 `.fishHitbox` span 内——`display: inline-flex; flex: none`，
 *     **无固定宽高、无 overflow hidden**（HeroShell.module.css `.fishHitbox`），尺寸超出不被裁剪；
 *   · 外层 `.headline` 是 `flex-wrap: wrap` + 居中（HeroShell.module.css `.headline`）：本品牌区
 *     是一个换行单元，放不下时与宿主标题组各自成行，容器裁不掉；
 *   · `size` 在宿主槽契约里是「请求的方形边长」（slots.ts `HeroBrandMarkOwnerProps.size` 注释
 *     "Requested square edge"）——请求值，宿主无机制强制，品牌区按首屏展示需要自定边长；
 *   · `className` 是宿主几何类（hero 槽传 css.fish：display block / overflow visible /
 *     transform-origin / hover 游动动画目标 `.fishHitbox:hover .fish`）——透传给内部 mark svg，
 *     保留宿主几何与「hover 品牌位时 mark 游动」的交互语义。
 *
 * 宿主标题组的隐藏（双欢迎语修复）：hero 行里宿主自己的标题组（`t('hero.headline')`
 * 「探索未至之境」+ 预览版徽标，HeroShell.tsx 的 titleGroup）**不受本槽控制**，与本品牌区
 * 同屏 = 两条欢迎语并排（wrap 布局下宽窗同行、窄窗上下两行）。用户裁决去掉宿主那条：本
 * 模块在组件挂载时向 document.head 注入一条作用域 CSS，仅当品牌区实际在场（:has 锚到
 * 根类 taiji-hero-area）时隐藏 titleGroup——不删宿主 DOM、可逆、卸载即回滚；选择器依据
 * 与生命周期挂载见 {@link installHeroHostTitleStyle} 的注释。
 *
 * 循环 import 说明：本文件 import mark.tsx（TaijiBrandMark），mark.tsx 的
 * `installBrandMarkSlots` 反向引用本文件的 TaijiHeroArea（apply.ts 装配入口不能动，hero 槽
 * 注册必须留在 mark.tsx 的装配函数里）。esbuild bundle 模式按拓扑内联消解循环；逐文件转译
 * （测试夹具）下 esbuild 产物以惰性属性访问回源（`__export` getter + 函数体内取值），顶层
 * 互不取值即安全——已用最小实验核实两条路径（bundle 产物执行正常 / transformSync 转换形态惰性）。
 */
import { useEffect } from 'react'
import { type LocaleKey } from '../locale'
import { TaijiBrandMark } from './mark'

/**
 * hero 品牌区的 mark 展示边长（px）。宿主请求值 34 是「回落鱼标」的格子尺寸；品牌区把
 * mark 当首屏视觉主体放大一档取 56（taiji 侧无 hero mark 先例——Landing 首屏无 mark，
 * Brand.vue 侧栏 mark 是 28，都不适用首屏品牌主体场景，故为自定展示值）。
 */
const HERO_MARK_SIZE = 56

/** 注入 head 的 style 元素标记属性值（`data-taiji-hero="<本值>"`）：卸载清理与测试定位用。 */
export const HERO_HOST_TITLE_STYLE_MARK = 'hide-host-greeting'

/**
 * 隐藏宿主 hero 标题组的作用域样式（由 {@link installHeroHostTitleStyle} 注入，不走
 * hero-area.css——静态样式表随构建注入、无法随组件卸载移除，宿主欢迎语的隐藏必须可逆）。
 *
 * 选择器的两级结构锚（真机隔离环境探针 + 宿主源码双重核实，EmptyHero.tsx 132-158 行）：
 *   · hero 行 `.headline` 下第一个 span（fishHitbox）内是槽容器
 *     `[data-slot='conversation.hero.brand.mark']`，宿主标题组是它的**紧邻兄弟** span
 *     （titleGroup）——`span:has(> …) + span` 恰好只命中后者；
 *   · `:has()` 参数还要求后代 `.taiji-hero-area`（本组件根类）**实际在场**：品牌区未被
 *     渲染（宿主回落自己的鱼标）时选择器不命中，宿主欢迎语照常显示——隐藏条件由 DOM
 *     结构自证，不依赖 style 元素的进出时序。
 *
 * `display: none` 带 `!important`：宿主 `.titleGroup` 是 CSS Modules 类选择器（特异度
 * 0,1,0，声明 `display: flex`——HeroShell.module.css），本选择器只有类型选择器（:has
 * 参数不计特异度，0,0,2）——不加会被宿主压过而静默失效。:has 由 Chromium 105+ 支持，
 * 宿主 0.2.x 内核满足。
 */
export const HERO_HOST_TITLE_HIDE_CSS =
  "span:has(> [data-slot='conversation.hero.brand.mark'] .taiji-hero-area) + span { display: none !important }"

/**
 * 样式注入需要的最小元素面（结构类型：真机 HTMLStyleElement 天然满足）。
 *
 * `textContent` 放宽为 `string | null` 以对齐宿主 Element 的属性类型。
 */
export interface HeroStyleElement {
  textContent: string | null
  setAttribute(name: string, value: string): void
}

/**
 * 样式注入需要的最小 document 面（结构类型：真机 `document` 天然满足）。
 *
 * 参数收窄成最小结构而不是 lib.dom 的 Document：测试夹具无真实 DOM（testing/load-tsx.ts
 * 的边界），安装/卸载逻辑要能以最小 stub 驱动断言。
 */
export interface HeroStyleDocument {
  /** 造 style 元素（本模块只以 `'style'` 调它）。 */
  createElement(tagName: 'style'): HeroStyleElement
  /** 样式元素的挂载点（真机 document.head）。 */
  head: {
    appendChild(node: unknown): unknown
    removeChild(node: unknown): unknown
  }
}

/**
 * 把「宿主 hero 标题组隐藏」样式注入 document.head，返回移除它的 disposer。
 *
 * 为什么挂组件生命周期而不是装配期：宿主标题组的隐藏只在品牌区渲染期间有意义——组件
 * 挂载（useEffect）注入、卸载（cleanup）移除，天然配对（含 React 严格模式的重复挂载，
 * head 不积压）。插件卸载时宿主拆掉本组件 → cleanup 执行 → style 离开 head，宿主欢迎语
 * 自动回来，不留全局副作用（V5 卸载清洁度的可逆性约束）。
 *
 * @param doc - 浏览器 document（最小面见 {@link HeroStyleDocument}；测试传 stub）。
 * @returns disposer：从 head 移除该 style 元素。
 */
export function installHeroHostTitleStyle(doc: HeroStyleDocument): () => void {
  const style = doc.createElement('style')
  style.setAttribute('data-taiji-hero', HERO_HOST_TITLE_STYLE_MARK)
  style.textContent = HERO_HOST_TITLE_HIDE_CSS
  doc.head.appendChild(style)
  return () => {
    doc.head.removeChild(style)
  }
}

/** hero 品牌区组件的 props：宿主 owner props + locale 座位（注册声明 `locale:` 后由宿主注入）。 */
export interface HeroAreaProps {
  /**
   * 宿主请求的 mark 边长（hero 槽恒传 34）。品牌区不消费它——见 {@link HERO_MARK_SIZE}：
   * 该值语义是单 mark 格子的请求尺寸，品牌区按首屏展示需要自定边长。保留在接口上是为
   * 对齐宿主 owner props 形状（宿主按槽契约传 `{ size, className }`）。
   */
  size: number
  /** 宿主几何类（css.fish），透传给内部 mark svg。 */
  className?: string | undefined
  /** 本包命名空间的翻译函数（产品名 / 欢迎语文案座位）。 */
  t: (key: LocaleKey, params?: Record<string, unknown>) => string
}

/**
 * 渲染 hero 品牌区：竖排居中 [放大双鱼标] [产品名「太极」] [欢迎语一行]。
 *
 * 排版取值逐条对照 taiji（源文件路径相对太极仓 main）——细则与来源见 hero-area.css
 * 内注释（字号/字重/行高/间距全部落 CSS，组件只管结构）。
 *
 * @param props - 见 {@link HeroAreaProps}。
 * @returns 品牌区元素树（mark 本体 aria-hidden，可访问名字由产品名文本承担）。
 */
export function TaijiHeroArea({ className, t }: HeroAreaProps) {
  // 宿主标题组隐藏样式随本组件挂载/卸载进出 head（真 React 的 effect 生命周期承担；
  // 夹具的 useEffect 桩立即执行并记录 cleanup，测试据 effectCleanups 断言可逆性）
  useEffect(() => installHeroHostTitleStyle(document), [])
  return (
    <div className="taiji-hero-area">
      <TaijiBrandMark size={HERO_MARK_SIZE} className={className} />
      <div className="taiji-hero-area-text">
        <span className="taiji-hero-area-name">{t('brand.name')}</span>
        <span className="taiji-hero-area-greeting">{t('hero.greeting')}</span>
      </div>
    </div>
  )
}
