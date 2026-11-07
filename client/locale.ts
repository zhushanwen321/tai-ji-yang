/**
 * client/locale.ts —— 本包的内联双语字典（设计 §3.3.8 / D8，U7）。
 *
 * 形态裁决（设计原文）：「`{zh, en}` 内联字典，经 `ctx.locale.register(ns, ...)` 注册
 * （**不建 locale/*.json**）」。理由：本包的文案面只有品牌名与外观行几枚 key，拆成
 * 8 语言 JSON 文件族（宿主内置包的形态）是为零收益的目录开销；内联字典随 bundle 一起
 * 打包，注册与撤除都走宿主 locale 服务的既有机制。
 *
 * 命名空间 = `taiji.shell`：宿主既有命名空间（`common` / `settings` / `settings.theme` /
 * `conversation` / `model` …）之外的私有名，不与任何宿主包撞 key。品牌槽与外观行的
 * 注册都声明 `locale: TAIJI_LOCALE_NS`，宿主渲染机理由（命名空间, revision）合成 `t`
 * 标准座位——**字典必须先于这些槽位的首次渲染注册**，故 U3 的装配序必须是
 * 「locale → 主题层 → 品牌槽 → 外观行」（locale 不依赖任何其它贡献，放最前）。
 *
 * 卸载语义（AX3 / V5）：register 返回的 disposer 经 `ctx.effect` 托管，fiber 卸载
 * （profile 行移除 / disable / HMR 重载）时字典随之撤除——本包的槽位贡献撤销与字典
 * 撤销同生命周期，不留残留。
 *
 * 装配面是最小结构类型（不 import 任何 dsh-client 包，D3）：本文件只用到宿主的
 * `effect` 与 `locale.register` 两个方法。
 */

/** 本包私有命名空间（品牌名与外观行文案的归属）。 */
export const TAIJI_LOCALE_NS = 'taiji.shell'

/** 字典值形态（宿主 `LocaleDict` 的同构声明：扁平 key → 模板串）。 */
export type LocaleDict = Record<string, string>

/**
 * 简体中文字典（key 集权威源；en 按同一 key 集对齐，相等性由 locale.test.ts 断言）。
 *
 * 取值来源（逐条抄录，不臆造）：
 *   · 产品名 —— 太极侧 `packages/renderer/src/i18n/locales/zh-CN/app.ts` 的 `title`；
 *   · 外观行标题与三段模式 —— 太极侧 `packages/ui/src/locale/zh-CN/settings.ts` 的
 *     `settings.system.appearance`（外观）/ `themeLight`（浅色）/ `themeDark`（深色）/
 *     `themeSystem`（跟随系统）。宿主内置外观行的同 key 文案（settings.theme 命名空间）
 *     同为「外观 / 浅色 / 深色 / 跟随系统」，遮蔽后用户看到的标题一字不差（V12 ②）。
 */
export const zh = {
  /** 产品名（sidebar.brand.name 槽；hero 槽只渲染 mark，无名字位）。 */
  'brand.name': '太极',
  /** 外观行标题（与宿主内置行同文，遮蔽后无感知差异）。 */
  'appearance.title': '外观',
  /** 三段模式按钮（D8：同屏呈现，消解「点了异族色为何没变亮」的困惑）。 */
  'appearance.mode.light': '浅色',
  'appearance.mode.dark': '深色',
  'appearance.mode.system': '跟随系统',
} satisfies LocaleDict

/**
 * 英文词典（与 zh 同 key 集）。
 *
 * 产品名抄录太极侧 `i18n/locales/en-US/app.ts` 的 `title`（TaiJi，大小写按对岸原样）；
 * 外观行文案抄录 `packages/ui/src/locale/en-US/settings.ts`（Appearance / Light /
 * Dark / Follow system）。
 */
export const en = {
  'brand.name': 'TaiJi',
  'appearance.title': 'Appearance',
  'appearance.mode.light': 'Light',
  'appearance.mode.dark': 'Dark',
  'appearance.mode.system': 'Follow system',
} satisfies LocaleDict

/** 本包文案 key 域（组件侧 `t` 的参数类型；zh/en 必须同时覆盖）。 */
export type LocaleKey = keyof typeof zh

/** 两种语言字典的并表（register 的入参形态）。 */
export const LOCALE_DICTS: Record<string, LocaleDict> = { zh, en }

/** 本包用到的宿主 locale 面（最小结构类型；真实 ctx 是 Cordis context 的超集）。 */
export interface LocaleInstallHost {
  /**
   * 登记启动副作用并拿到 fiber 生命周期托管：回调立即执行，其返回值在 fiber 卸载时反序执行。
   */
  effect(callback: () => (() => void) | void, label?: string): void
  /** 宿主 locale 服务（dsh.client.inject 的 `@deepseek-ai/dsh-client-locale` 提供）。 */
  locale: {
    /**
     * 注册一个命名空间的一种或多种语言字典。
     * @returns 移除本次注册的全部字典的 disposer（幂等）。
     */
    register(ns: string, dictionaries: Record<string, LocaleDict>): () => void
  }
}

/**
 * 注册本包的内联双语字典（经 ctx.effect 托管，卸载即撤除）。
 *
 * U3 装配序约束：必须先于品牌槽与外观行的**渲染**调用（槽位声明 `locale:` 时，渲染
 * 机制要从已安装的 locale 面合成 `t` 座位，缺字典会 fail-loud）。本函数同步完成注册，
 * 与其它 install* 同处一个 apply 内即满足。
 */
export function installLocale(host: LocaleInstallHost): void {
  host.effect(() => host.locale.register(TAIJI_LOCALE_NS, LOCALE_DICTS), 'taiji: 内联双语字典（zh/en）')
}
