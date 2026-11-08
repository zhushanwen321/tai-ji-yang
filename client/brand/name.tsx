/**
 * client/brand/name.tsx —— 产品名字标（设计 §3.3.8 / D8，U7）。
 *
 * 职责：品牌栈（产品名 + 版本行）注册进 `sidebar.brand.name`（single/root；owner props
 * 为空——宿主 SidebarRoot 传 `{}`，回落是「Local Build + 版本号」文案）。版本行读 Node
 * 半场注入的壳信息 global（readShellInfo），对齐 taiji Brand.vue 的「产品名下方 mono 小字
 * 版本行」；信息缺席时整行不渲染（降级形态 = 只显产品名）。hero 首屏的产品名不走本槽——
 * 由 hero 品牌区组件 TaijiHeroArea（hero-area.tsx）在 hero 槽内自渲染（同一枚 `brand.name`
 * 字典 key，两处同文）；本槽只拥有侧栏品牌行的名字位。
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

/** 壳信息在 `globalThis` 上的属性名（与 Node 半场 index.js 的 SHELL_INFO_GLOBAL 同字面值）。 */
const SHELL_INFO_GLOBAL = '__TAIJI_SHELL_INFO__'

/**
 * 壳信息（Node 半场经 `global` 注入行挂上 `globalThis`，见 index.js 的 SHELL_INFO_GLOBAL）：
 * `dshVersion` 只在解析到运行中的 DSH 版本时携带。
 */
export interface ShellInfo {
  version: string
  dshVersion?: string
}

/**
 * 读页面上的壳信息；缺席返回 null（版本行降级消失，产品名不受影响）。宿主把 `global` 行
 * 渲染在先于一切脚本的 head 里，本 bundle 执行时必然已就位；重读不缓存——注入值随
 * index 渲染刷新，渲染期取值即最新。
 */
export function readShellInfo(globalScope: typeof globalThis = globalThis): ShellInfo | null {
  const info = (globalScope as { [SHELL_INFO_GLOBAL]?: unknown })[SHELL_INFO_GLOBAL]
  if (info === null || typeof info !== 'object') return null
  const { version, dshVersion } = info as Record<string, unknown>
  if (typeof version !== 'string' || version === '') return null
  return dshVersion === undefined ? { version } : { version, dshVersion: String(dshVersion) }
}

/**
 * 版本行文案（taiji 同构：`v0.8.40 · pi v0.82.1` 的降级形态 = 只显 `v{app}`）。
 *
 * @param info - 壳信息；null 时本函数返回 null（版本行不渲染）。
 * @returns 如 `v0.1.0 · dsh v0.2.2-rc.1`；只有壳版本时 `v0.1.0`。
 */
export function formatVersionLine(info: ShellInfo | null): string | null {
  if (info === null) return null
  return info.dshVersion === undefined ? `v${info.version}` : `v${info.version} · dsh v${info.dshVersion}`
}

/** 名字标组件的 props：宿主 locale 合成的 `t` 座位（owner props 为空，无其它面）。 */
export interface BrandNameProps {
  /** 本包命名空间的翻译函数（注册声明 `locale:` 后由宿主渲染机注入）。 */
  t: (key: LocaleKey, params?: Record<string, unknown>) => string
}

/**
 * 渲染产品名字标（品牌栈：产品名 + 版本行）。
 *
 * taiji 的品牌区（Brand.vue）在产品名下方带一行小字版本（mono、暗色、truncate）；本组件
 * 同构——版本行来自壳信息 global，缺席时整行不渲染。宿主 `.brandName` 容器给产品名提供
 * 18px/600 排版与 24px 定高行盒，本栈纵向溢出约 3px 由品牌行的富余高度吸收（见 name.css）。
 *
 * @param props - `t` 座位。
 * @returns 品牌栈 span（产品名 + 可选版本行）。
 */
export function TaijiBrandName({ t }: BrandNameProps) {
  const version = formatVersionLine(readShellInfo())
  return (
    <span className="taiji-brand-stack">
      <span className="taiji-brand-name">{t('brand.name')}</span>
      {version !== null && <span className="taiji-brand-version" title={version}>{version}</span>}
    </span>
  )
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
