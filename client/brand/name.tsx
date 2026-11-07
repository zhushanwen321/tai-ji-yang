/**
 * client/brand/name.tsx —— 产品名字标（设计 §3.3.8 / D8，U7）。
 *
 * 职责：产品名注册进 `sidebar.brand.name`（single/root；owner props 为空——
 * 宿主 SidebarRoot 传 `{}`，回落是「Local Build + 版本号」文案）。**hero 槽没有名字位**
 * （其 owner props 只有 size/className，属纯图形槽），所以产品名只能走这里——这是设计的
 * 既定事实（U7 checkpoint 第 3 条：需确认「hero 同屏产品名」可放弃，结论是可放弃，
 * V1 判据措辞已按「产品名在侧栏 brand.name」表述）。
 *
 * 文案走宿主 locale 的 `t` 标准座位（注册时声明 `locale: TAIJI_LOCALE_NS`），中英文分别
 * 取「太极」/「TaiJi」——取值抄录太极侧 `i18n/locales/{zh-CN,en-US}/app.ts` 的 `title`。
 * 字标形态 = 纯文字 span（不做 SVG 艺术字）：taiji 侧 Brand.vue 的产品名同样是文字
 * （`t('app.title')`），宿主该槽的回退 occupant 也是文字 span；宿主 `.brandName` 容器已提供
 * 18px/600 的排版，本组件不重复声明样式。
 *
 * 优先级避让与 mark.tsx 完全同构（官方标 0 / viewer -10 / 本包 -5，见 mark.tsx 头部注释）：
 * 官方构建里 OfficialBrandName 占着这个槽（priority 0），装了太极壳就应由「太极」二字
 * 接管；分享页 viewer 场景让位。避让逻辑复用 mark.tsx 的 `resolveBrandPriority`（同一段
 * 规则不写两遍）。
 */
import { TAIJI_LOCALE_NS, type LocaleKey } from '../locale'
import { resolveBrandPriority, type BrandSlotHost } from './mark'

/** 名字标组件的 props：宿主 locale 合成的 `t` 座位（owner props 为空，无其它面）。 */
export interface BrandNameProps {
  /** 本包命名空间的翻译函数（注册声明 `locale:` 后由宿主渲染机注入）。 */
  t: (key: LocaleKey, params?: Record<string, unknown>) => string
}

/**
 * 渲染产品名字标。
 *
 * @param props - `t` 座位。
 * @returns 文字 span（内容 = 当前语言的产品名）。
 */
export function TaijiBrandName({ t }: BrandNameProps) {
  return <span>{t('brand.name')}</span>
}

/**
 * 装配产品名：注册进 `sidebar.brand.name`（带优先级避让，规则见 mark.tsx）。
 *
 * U3 的 `client/apply.ts` 在装配期调用本函数。locale 字典（locale.ts 的 installLocale）
 * 必须先于本槽位的首次渲染注册——渲染机制要按 (命名空间, revision) 合成 `t` 座位，
 * 缺字典会 fail-loud，故 U3 装配序为「locale → 主题层 → 品牌槽 → 外观行」。
 *
 * @param host - 宿主 slots 面。
 */
export function installBrandNameSlot(host: BrandSlotHost): void {
  host.slots.inject('sidebar.brand.name', () => {
    const priority = resolveBrandPriority(host.slots.entries('sidebar.brand.name'))
    if (priority === undefined) {
      host.logger?.warn(
        '品牌槽 sidebar.brand.name 的 (-10, 0) 优先级区间已被占满，'
        + '本包产品名本次不注册（回落宿主原生 occupant）',
      )
      // no-op disposer：宿主 inject 契约的 effect 形态是 disposer 或 disposer 可迭代
      return () => {}
    }
    return host.slots.register({ name: 'sidebar.brand.name', priority, locale: TAIJI_LOCALE_NS }, TaijiBrandName)
  })
}
