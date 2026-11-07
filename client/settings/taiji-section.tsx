/**
 * client/settings/taiji-section.tsx —— 设置页的「太极」独立分区。
 *
 * 分区定位：一个**自述页**（本插件是什么 + 当前配色状态 + 指向外观点位），不是操作页——
 * 配色与明暗模式的实际切换都发生在通用设置的外观行（appearance-row.tsx 遮蔽内置行后
 * 「外观」恰好一条，操作入口唯一），本页只呈现状态与指路。因此注入回调只取 controller 的
 * 两个只读方法（getThemeId / subscribeThemeId），不透传 selectThemeId：状态页不该出现
 * 第二个写入口，否则「换色的唯一入口是外观行」这一分工会被自己打破。
 *
 * 宿主槽契约（已对照宿主源码核实）：
 *   · 槽 = `settings.section`（list / root，每项一页）；声明见宿主
 *     packages/client/ui-settings/src/client/contract/slots.ts（`SettingsSectionOwnerProps`）。
 *   · 注册形态照抄先例包（ui-settings-plugins / ui-settings-account 的 client/index.ts）：
 *     `slots.inject('settings.section', () => slots.register({ name, id, order, label, locale,
 *     inject }, Component))`；`label` 收 thunk（宿主每次读取时求值，跟随激活语言），
 *     `locale` 声明把渲染机合成的 `t` 座位放上组件 props。
 *   · 组件 props = owner 份额 `{ close }`（宿主 shell 渲染
 *     `renderSlot('settings.section', { close: onClose }, { only: active })`，SettingsRoot.tsx）
 *     + `t` 座位 + 注入回调。本页没有「离开设置面板」的流程，close 收下不使用。
 *
 * 分区排序：宿主内置分区的 order 为 account -10 / general 0 / models 10 / plugins 15 /
 * agent-presets 20，本分区取 25（末位）——插件自述页不插进宿主内置分区的队列中间，
 * 用户的心智模型里「官方分区在前、扩展分区在后」。
 */
import { useSyncExternalStore } from 'react'
import { TAIJI_LOCALE_NS, type LocaleKey } from '../locale'
import { resolveTheme } from '../theme/resolve'
// 类型-only 引入（esbuild 整体擦除，不把外观行模块拖进装载链）：controller 契约由
// appearance-row.tsx 声明为公共出口，本文件只消费类型不消费实现。
import type { ThemeSelectionController } from './appearance-row'

/** 本分区在 `settings.section` 里的 id（导航键；不与宿主内置 id——general/account/models/plugins/agent-presets——相撞）。 */
export const TAIJI_SECTION_ID = 'taiji'

/** 本分区的导航排序位：末位（25），理由见文件头。 */
export const TAIJI_SECTION_ORDER = 25

/** 本分区组件经注册 `inject` 收到的业务面：controller 的只读分享（写入口刻意不给，见文件头）。 */
export interface TaijiSectionInjected {
  /** 读当前生效的配色 id（U3 controller 透传）。 */
  getThemeId: ThemeSelectionController['getThemeId']
  /** 订阅配色变化（换色后色名即时跟随；controller 透传）。 */
  subscribeThemeId: ThemeSelectionController['subscribeThemeId']
}

/**
 * 本页用到的宿主接口（最小结构类型；不 import 任何 dsh-client 包，D3）。
 *
 * `slots` 由 `@deepseek-ai/dsh-client-ui-slots` 经模块表供给（与外观行同一面）；
 * `locale.bind` 由 `@deepseek-ai/dsh-client-locale` 提供——nav label 的 thunk 靠它
 * 在每次读取时拿当前语言的译文（宿主 shell 在语言切换后重读 thunk，无需重新注册）。
 */
export interface TaijiSectionHost {
  slots: {
    /** 等 `settings.section` 声明出现后执行 callback（声明已存在则同步执行）。 */
    inject(key: string, callback: () => (() => void) | void): () => void
    /** 注册一个 list occupant（id 即导航键，唯一 id 无同格竞争，无需 priority）；register 自挂 effect。 */
    register(
      options: {
        name: string
        id: string
        order: number
        /** 导航标签：thunk 形态，宿主每次读取时求值（跟随激活语言）。 */
        label: () => string
        locale: string
        inject?: () => TaijiSectionInjected
      },
      component: unknown,
    ): () => void
  }
  locale: {
    /** 把命名空间绑成翻译函数（每次调用读当前激活语言；返回函数身份按命名空间稳定）。 */
    bind(ns: string): (key: string) => string
  }
}

/** 分区组件的完整 props：`t` 座位 + owner 份额（close）+ 注入回调。 */
export type TaijiSectionComponentProps = {
  /** 本包命名空间的翻译函数（注册声明 `locale:` 后由宿主渲染机注入）。 */
  t: (key: LocaleKey, params?: Record<string, unknown>) => string
  /** 宿主 shell 始终传入的关闭面板回调；本页无离开设置的流程，收下不使用。 */
  close: () => void
} & TaijiSectionInjected

/**
 * 渲染「太极」分区：标题 + 一句说明 + 当前配色行 + 指引行。
 *
 * 色点的取色 = `var(--dsw-alias-brand-primary)`（**活的 CSS 变量**，不是 resolveThemeTokens
 * 的静态取值）：U2 的覆盖层换层后 `:root` 上该变量已是当前配色在当前明暗下的实际生效值，
 * 色点呈现的就是「界面此刻真实使用的强调色」。走静态表则还需要知道当前明暗（宿主 theme
 * 服务）才能选 light/dark 列——本页刻意不接任何宿主服务（任务边界），活变量让 CSS 亲自
 * 回答取色问题，React 状态只负责色名。
 *
 * @param props - `t` 座位 + 注入回调（close 由宿主传入，本页不使用）。
 * @returns 分区元素树（自带行 chrome 与分隔线，样式见同目录 taiji-section.css）。
 */
export function TaijiSection({ t, getThemeId, subscribeThemeId }: TaijiSectionComponentProps) {
  const themeId = useSyncExternalStore(subscribeThemeId, getThemeId, getThemeId)

  return (
    <section className="taiji-section" aria-label={t('brand.name')}>
      <div className="taiji-section-intro">
        {/* 分区标题与导航标签同字面（都是产品名），复用 brand.name 词条——产品名只有一个源。 */}
        <div className="taiji-section-title">{t('brand.name')}</div>
        <p className="taiji-section-desc">{t('section.desc')}</p>
      </div>
      <div className="taiji-section-row">
        <span className="taiji-section-row-label">{t('section.current')}</span>
        <span className="taiji-section-current">
          <span className="taiji-section-dot" aria-hidden="true" style={{ background: 'var(--dsw-alias-brand-primary)' }} />
          <span className="taiji-section-current-name">{resolveTheme(themeId).name}</span>
        </span>
      </div>
      <div className="taiji-section-row">
        <span className="taiji-section-guide">{t('section.guide')}</span>
      </div>
    </section>
  )
}

/**
 * 装配「太极」分区：注册进宿主 `settings.section`。
 *
 * U3 的 `client/apply.ts` 在装配期调用本函数（与外观行同装配序约束：locale 字典必须先于
 * 本分区首次渲染注册——本包所有槽位贡献共用这一前提）。注册声明 `locale:` 后渲染机
 * 从已安装字典合成 `t` 座位，缺字典会 fail-loud（宿主渲染机契约）。
 *
 * @param host - 宿主侧（slots / locale.bind）。
 * @param controller - 配色选择控制器（U3 提供；本页只取读方法）。
 */
export function installTaijiSection(host: TaijiSectionHost, controller: ThemeSelectionController): void {
  host.slots.inject('settings.section', () => {
    // nav label 的 thunk 经 locale.bind 拿当前语言的「太极」——语言切换后宿主重读 thunk
    // 即得新译文，无需撤除重注册（宿主 SlotLabel 契约：thunk 每次读取时求值）。
    const bound = host.locale.bind(TAIJI_LOCALE_NS)
    return host.slots.register({
      name: 'settings.section',
      id: TAIJI_SECTION_ID,
      order: TAIJI_SECTION_ORDER,
      label: () => bound('brand.name'),
      locale: TAIJI_LOCALE_NS,
      inject: (): TaijiSectionInjected => ({
        getThemeId: controller.getThemeId,
        subscribeThemeId: controller.subscribeThemeId,
      }),
    }, TaijiSection)
  })
}
