/**
 * client/apply.ts —— 浏览器半场装配入口（设计 §3.3.2 / D2 + §3.3.3 / D3 + §5 U3）。
 *
 * 这是宿主 factory 壳物化时的唯一入口（`window.__ModuleLoader__.load({ id, factory })` 的
 * `module.exports.apply`）。职责 = **把全部贡献点装上去，且每一处都经 `ctx.effect` 托管**：
 * 覆盖层 disposer 是普通闭包、无 fiber 绑定（AS10），不挂 effect 就不会随插件卸载执行；
 * 槽位 register 自身把 disposer 挂进调用者 fiber 的 effect（宿主契约），locale 字典的 disposer
 * 与持久通道的镜像订阅则由本文件显式托管。AX3 的三处痕迹因此全部随 fiber 卸载消失。
 *
 * 装配序（locale.ts 头部约定的硬约束）：
 *   **locale → 主题层 → 品牌槽 → 外观行**。
 *   locale 字典必须先于品牌槽与外观行的**渲染**注册——槽位声明 `locale:` 时渲染机制要按
 *   (命名空间, revision) 合成 `t` 标准座位，缺字典会 fail-loud。持久通道的创建不注册任何
 *   贡献（只读一次镜像），故夹在 locale 与主题层之间：主题层的首装表要取它读到的持久值。
 *
 * 与各贡献点的分工（单文件内不出现第二处装配路径）：
 *   · locale.ts / brand/*.tsx / settings/appearance-row.tsx = 贡献本体（U7）；
 *   · theme/apply.ts = 覆盖层装配与换层（U2）；
 *   · theme/structure.ts = 结构值表（U6）；
 *   · persist.ts = 插件 Config 持久通道（本单元）；
 *   · 本文件 = 装配序、ctx 各项的组合、以及「持久值 → 换层」「点选 → 换层 + 写 Config」两段接线。
 */
import { installBrandMarkSlots, type BrandSlotHost } from './brand/mark'
import { installBrandNameSlot } from './brand/name'
import { installSessionStatusIcon } from './head/session-header'
import { installAppearanceChip } from './input/appearance-chip'
import { installLocale, type LocaleInstallHost } from './locale'
import { AppearancePersistence, PLUGIN_ENTRY_ID, type ConfigFormsHost } from './persist'
import {
  installProjectsBrowser,
  type ProjectsBrowserHost,
} from './projects/browser'
import { ProjectStore } from './projects/store'
import {
  installAppearanceRow,
  type AppearanceRowHost,
  type ThemeSelectionController,
} from './settings/appearance-row'
import { installTaijiSection } from './settings/taiji-section'
import { applyStructureLayer, applyThemeLayer, type ThemeTokenService } from './theme/apply'
import { STRUCTURE_TOKENS } from './theme/structure'

/** 宿主 theme 服务：覆盖层（U2 的 `overrideTokens`）+ 偏好读写（外观行模式按钮）。 */
export interface ClientThemeService extends ThemeTokenService {
  getTheme(): { preference: 'light' | 'dark' | 'system'; active: { colorScheme: 'light' | 'dark' } }
  setTheme(id: 'light' | 'dark' | 'system'): void
}

/**
 * 宿主 slots：品牌槽（mark/name）与外观行（list 槽）两个 register 签名取交集。
 *
 * 用类型交集而非接口继承：两个 `register` 的选项形状不同（品牌槽 `{name, priority?, locale?}`，
 * 外观行 `{name, id, order, priority, locale, inject?}`），交集让同一个 `slots` 对象对两种调用
 * 形态都成立（宿主真实的 register 是泛型的，两侧都是它的子集）。
 */
export type ClientSlots = BrandSlotHost['slots'] & AppearanceRowHost['slots']

/** 本包浏览器半场用到的宿主 context（最小结构类型；不 import 任何 dsh-client 包，D3）。 */
export interface ClientApplyContext {
  /** 登记启动副作用并拿到 fiber 生命周期托管（卸载时反序执行 disposer）。 */
  effect(callback: () => (() => void) | void, label?: string): void
  /** 订阅宿主事件（外观行只用 `theme/change`）。 */
  on(event: string, listener: () => void): () => void
  /** locale 服务：installLocale 用 register；设置分区用 bind 把命名空间绑成翻译函数。 */
  locale: LocaleInstallHost['locale'] & {
    bind(ns: string): (key: string) => string
  }
  slots: ClientSlots
  theme: ClientThemeService
  configForms: ConfigFormsHost['configForms']
  /** 宿主动作服务（打开/新建/归档/置顶）——项目分组浏览器经闭包捕获（fiber inject 声明保证在场）。 */
  uiWorkspace: ProjectsBrowserHost['uiWorkspace']
  /** 宿主会话服务（重命名公开合同）——同上经闭包捕获。 */
  sessions: ProjectsBrowserHost['sessions']
  logger?: { warn(message: string): void; error(message: string): void }
}

/** effect 标签（宿主诊断树按标签展示，卸载排查时能认出是哪一段）。 */
const PERSIST_SUBSCRIBE_LABEL = 'taiji: 持久配色 → 主题层换层（插件 Config 镜像订阅）'
const PERSIST_DISPOSE_LABEL = 'taiji: 插件 Config 镜像订阅反注册'
const PROJECT_STORE_DISPOSE_LABEL = 'taiji: ProjectStore（projects/assignments 持久通道）反注册'

/**
 * 本包消费的宿主服务名（浏览器半场的 `inject` 声明）。
 *
 * **为什么必须有这个导出**（2026-11-07 真机验收发现，D2 设计缺口）：宿主的 fiber context 是
 * 一个带拦截器的 Proxy——`ctx.<service>` 只有在「该 service 已在某层 fiber 的 store 里被
 * provide」或「本 fiber 的 inject 表里声明了它」时才可读，否则**直接抛**
 * `cannot get property "<name>" without inject`。本包不声明 inject 时，浏览器半场一进
 * `apply` 就在第一行 `installLocale(ctx)` 抛错，fiber 状态转 failed，宿主 boot 报
 * `web boot: 1 entry did not activate`——页面整体白屏。
 *
 * **与 package.json 的 `dsh.client.inject` 是两个同名不同义的机制，不可互相替代**：
 *   · `dsh.client.inject`（manifest）= **包名**，只决定这些包的脚本先于本包抵达
 *     （`client-modules` 的 `arriveDependency` 消费），属加载排序；
 *   · 本导出 = **服务名**，决定本 fiber 能否读 `ctx.<name>`，属依赖声明。
 *     宿主自己的先例：`dsh-client-ui-layout` 导出 `["slots","theme","locale","shortcuts"]`，
 *     `dsh-client-ui-theme` 导出 `["slots","locale","remote","configForms"]`。
 *
 * 取值 = 本文件实际读到的 ctx 面（见 {@link ClientApplyContext}），不多写：
 *   · `slots` —— 品牌三槽与外观行的 register；
 *   · `locale` —— 内联双语字典（`installLocale` 是 apply 的第一步，最先读它）；
 *   · `theme` —— 覆盖层与外观行的模式按钮；
 *   · `configForms` + `remote` —— 持久通道；`remote` 不可省，宿主 ui-theme 的注释明言
 *     「`remote` carries the forwarded settings invalidation that
 *     `ctx.configForms.get(entryId)` subscribes to on this context」。
 */
export const inject = ['slots', 'locale', 'theme', 'configForms', 'remote', 'sessions', 'uiWorkspace'] as const

/**
 * 装配入口。
 *
 * 每一步的失败形态（都不抛、不静默）：
 *   · 持久命名空间未被服务 → 快照 `unavailable`，写入两次均被拒后由 persist 显式上报，会话内
 *     配色照常生效（D2）；
 *   · 品牌槽优先级区间被占满 → 对应槽不注册并 `logger.warn`，回落宿主原生 occupant（U7）；
 *   · 主题层换层 = 同 source 整层替换，无撤销重建、无闪烁（U2）。
 *
 * @param ctx - 宿主 context（Cordis context 的超集；只用到上表声明的那几项）。
 */
export function apply(ctx: ClientApplyContext): void {
  // ① 内联双语字典：必须先于任何槽位的首次渲染（合成 t 座位）
  installLocale(ctx)

  // ② 持久通道：只读初值、不写（首次写入只发生在用户主动点选时，D2「默认值」）
  const persistence = new AppearancePersistence(ctx, {
    // 日志前缀取 PLUGIN_ENTRY_ID：它与 package.json 的 name、cordis.patch.yml 的行 id、
    // factory 壳的 id 是同一个字面值（u-foundation 裁决 2；两侧不得 import——浏览器半场
    // import Node 半场会把 schemastery 拖进 bundle）。同一性的看守范围如实说：uninstall 测试
    // 只对拍 cordis.patch.yml 的行 id ↔ PLUGIN_ENTRY_ID（tests/uninstall-cleanliness.spec.ts
    // 的 ③ 用例）；package.json name ↔ factory 壳 id ↔ PLUGIN_ENTRY_ID 三条链接当前无断言看守
    // （factory id 由构建脚本的 PKG_NAME 字面量钉住，package.json name 只与 index.js 的 name 对拍）。
    report: (message) => { ctx.logger?.error(`${PLUGIN_ENTRY_ID}: ${message}`) },
  })

  // ③ 主题覆盖层（首装即注册：新装用户打开就必须看到太极默认色玄，不等第一次点选）
  //    + 结构覆盖层（圆角 / 字重 / 行高；不随配色变，无需选择器）
  const selectTheme = applyThemeLayer(ctx, persistence.getThemeId())
  applyStructureLayer(ctx, STRUCTURE_TOKENS)

  // 持久值首次到达（镜像答）→ 换层。订阅经 ctx.effect 托管，fiber 卸载即撤销，
  // 不会出现「卸载后仍有监听在换层」的残留（AX3）。
  ctx.effect(
    () => persistence.subscribe(() => { selectTheme(persistence.getThemeId()) }),
    PERSIST_SUBSCRIBE_LABEL,
  )

  // ③′ 项目分组的数据通道（projects/assignments 两个 volatile 字段的整写整读 + 镜像
  //    订阅）：设置页项目管理与侧栏项目分组浏览器共用同一实例，写入即互见。
  const projectStore = new ProjectStore(ctx, {
    report: (message) => { ctx.logger?.error(`${PLUGIN_ENTRY_ID}: ${message}`) },
  })
  ctx.effect(() => () => { projectStore.dispose() }, PROJECT_STORE_DISPOSE_LABEL)

  // ④ 品牌三槽：hero.brand.mark + sidebar.brand.mark + sidebar.brand.name
  installBrandMarkSlots(ctx)
  installBrandNameSlot(ctx)

  // ⑤ 外观行：遮蔽内置外观行（同 id 负 priority），行内经 controller 转回本文件的接线
  const controller: ThemeSelectionController = {
    getThemeId: () => persistence.getThemeId(),
    // 写入失败不影响当前会话（persist 内部显式上报），故不 await、不把失败抛给 UI
    selectThemeId: (id) => { void persistence.select(id) },
    subscribeThemeId: (listener) => persistence.subscribe(listener),
  }
  installAppearanceRow(ctx, controller)

  // ⑥ composer 工具行的快速配色 chip（conversation.input.left，list 槽追加非遮蔽）：
  //    与外观行共用同一 controller 实例——两处入口指向同一持久通道与换层，无双写。
  installAppearanceChip(ctx, controller)

  // ⑦ 设置页「太极」分区（settings.section，list 槽追加）：只读状态页（不设第二换色
  //    写入口），换色仍在通用设置的外观行与 composer chip。
  installTaijiSection(ctx, controller, projectStore)

  // ⑧ 侧栏会话区的项目分组浏览器（sidebar.workspaces 整槽替换）：taiji 式「项目」分组
  //    列表——项目是本包逻辑分组实体，与宿主工作区/目录无关。会话行行首不放品牌图标
  //    （用户裁决：状态点之外留空）。
  installProjectsBrowser(ctx, { store: projectStore })

  // ⑧′ 会话头 taiji 化（client/head/）：actions 槽增补 13px 状态图标（list 追加，不遮蔽）；
  //    40px 单行容器与「对话|Trace」分段控件的视觉重塑由 head 的全局 CSS 承担（宿主 DOM
  //    保留——整槽替换会孤儿化 utilities 里的「打开方式」按钮，见 head/session-header.tsx
  //    头注释的架构裁决）。
  installSessionStatusIcon(ctx)

  // ⑨ 反注册持久通道的镜像订阅。form 本体归 ConfigForms 服务所有（跨插件共享），
  //    本包只撤自己的监听，不 dispose 它。
  ctx.effect(() => () => { persistence.dispose() }, PERSIST_DISPOSE_LABEL)
}
