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
 * 宿主并存的边界事实：hero 行里宿主自己的标题组（`t('hero.headline')`「探索未至之境」+
 * 预览版徽标，HeroShell.tsx 的 titleGroup）**不受本槽控制**，与本品牌区同屏（wrap 布局下
 * 宽窗同行并排、窄窗上下两行）。本槽只拥有 fishHitbox 那个格子，移除宿主标题超出槽契约。
 *
 * 循环 import 说明：本文件 import mark.tsx（TaijiBrandMark），mark.tsx 的
 * `installBrandMarkSlots` 反向引用本文件的 TaijiHeroArea（apply.ts 装配入口不能动，hero 槽
 * 注册必须留在 mark.tsx 的装配函数里）。esbuild bundle 模式按拓扑内联消解循环；逐文件转译
 * （测试夹具）下 esbuild 产物以惰性属性访问回源（`__export` getter + 函数体内取值），顶层
 * 互不取值即安全——已用最小实验核实两条路径（bundle 产物执行正常 / transformSync 转换形态惰性）。
 */
import { type LocaleKey } from '../locale'
import { TaijiBrandMark } from './mark'

/**
 * hero 品牌区的 mark 展示边长（px）。宿主请求值 34 是「回落鱼标」的格子尺寸；品牌区把
 * mark 当首屏视觉主体放大一档取 56（taiji 侧无 hero mark 先例——Landing 首屏无 mark，
 * Brand.vue 侧栏 mark 是 28，都不适用首屏品牌主体场景，故为自定展示值）。
 */
const HERO_MARK_SIZE = 56

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
