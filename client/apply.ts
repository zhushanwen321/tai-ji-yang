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
 *   · 本文件 = 装配序、ctx 面的组合、以及「持久值 → 换层」「点选 → 换层 + 写 Config」两段接线。
 */
import { installBrandMarkSlots, type BrandSlotHost } from './brand/mark'
import { installBrandNameSlot } from './brand/name'
import { installLocale, type LocaleInstallHost } from './locale'
import { AppearancePersistence, PLUGIN_ENTRY_ID, type ConfigFormsHost } from './persist'
import {
  installAppearanceRow,
  type AppearanceRowHost,
  type ThemeSelectionController,
} from './settings/appearance-row'
import { applyStructureLayer, applyThemeLayer, type ThemeTokenService } from './theme/apply'
import { STRUCTURE_TOKENS } from './theme/structure'

/** 宿主 theme 服务面：覆盖层（U2 的 `overrideTokens`）+ 偏好读写（外观行模式按钮）。 */
export interface ClientThemeService extends ThemeTokenService {
  getTheme(): { preference: 'light' | 'dark' | 'system'; active: { colorScheme: 'light' | 'dark' } }
  setTheme(id: 'light' | 'dark' | 'system'): void
}

/**
 * 宿主 slots 面：品牌槽（mark/name）与外观行（list 槽）两个 register 签名取交集。
 *
 * 用类型交集而非接口继承：两个 `register` 的选项形状不同（品牌槽 `{name, priority?, locale?}`，
 * 外观行 `{name, id, order, priority, locale, inject?}`），交集让同一个 `slots` 对象对两种调用
 * 形态都成立（宿主真实的 register 是泛型的，两侧都是它的子集）。
 */
export type ClientSlots = BrandSlotHost['slots'] & AppearanceRowHost['slots']

/** 本包浏览器半场用到的宿主 context 面（最小结构类型；不 import 任何 dsh-client 包，D3）。 */
export interface ClientApplyContext {
  /** 登记启动副作用并拿到 fiber 生命周期托管（卸载时反序执行 disposer）。 */
  effect(callback: () => (() => void) | void, label?: string): void
  /** 订阅宿主事件（外观行只用 `theme/change`）。 */
  on(event: string, listener: () => void): () => void
  locale: LocaleInstallHost['locale']
  slots: ClientSlots
  theme: ClientThemeService
  configForms: ConfigFormsHost['configForms']
  logger?: { warn(message: string): void; error(message: string): void }
}

/** effect 标签（宿主诊断树按标签展示，卸载排查时能认出是哪一段）。 */
const PERSIST_SUBSCRIBE_LABEL = 'taiji: 持久配色 → 主题层换层（插件 Config 镜像订阅）'
const PERSIST_DISPOSE_LABEL = 'taiji: 插件 Config 镜像订阅反注册'

/**
 * 装配入口。
 *
 * 每一步的失败形态（都不抛、不静默）：
 *   · 持久命名空间未被服务 → 快照 `unavailable`，写入两次均被拒后由 persist 显式上报，会话内
 *     配色照常生效（D2）；
 *   · 品牌槽优先级区间被占满 → 对应槽不注册并 `logger.warn`，回落宿主原生 occupant（U7）；
 *   · 主题层换层 = 同 source 整层替换，无撤销重建、无闪烁（U2）。
 *
 * @param ctx - 宿主 context（Cordis context 的超集；只用到上表声明的最小面）。
 */
export function apply(ctx: ClientApplyContext): void {
  // ① 内联双语字典：必须先于任何槽位的首次渲染（合成 t 座位）
  installLocale(ctx)

  // ② 持久通道：只读初值、不写（首次写入只发生在用户主动点选时，D2「默认值」）
  const persistence = new AppearancePersistence(ctx, {
    // 日志前缀取 PLUGIN_ENTRY_ID：它与 package.json 的 name、cordis.patch.yml 的行 id、
    // factory 壳的 id 是同一个字面值（u-foundation 裁决 2；两侧不得 import——浏览器半场
    // import Node 半场会把 schemastery 拖进 bundle）。同一性由 uninstall 测试对拍看守。
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

  // ⑥ 反注册持久通道的镜像订阅。form 本体归 ConfigForms 服务所有（跨插件共享），
  //    本包只撤自己的监听，不 dispose 它。
  ctx.effect(() => () => { persistence.dispose() }, PERSIST_DISPOSE_LABEL)
}
