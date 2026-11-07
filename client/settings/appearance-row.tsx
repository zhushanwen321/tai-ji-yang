/**
 * client/settings/appearance-row.tsx —— 外观行（设计 §3.3.8 / D8，U7）。
 *
 * 机制（D8 原文）：外观行走宿主 `settings.general.item`（list 槽），**id 与内置外观行相同
 * （`appearance`）、priority 取负值、order 小于内置行的 10**。槽规则 = 同 id 同格按 priority
 * 升序、数值最小者渲染——本行以负优先级**遮蔽**内置行（V12 ②：标题为「外观」的行恰好一条），
 * 而不是另起一行（那会出现两行「外观」，语义重复）。遮蔽失败（宿主改内置行 id）的形态是
 * 「出现两行外观」——可见、可诊断，不静默错乱（D8 判据）。
 *
 * 行内**同屏**呈现两组控件（V12 ② 的两项特征）：
 *   · 三段模式按钮（浅色 / 深色 / 跟随系统）——写宿主偏好（`theme.setTheme`，宿主唯一的
 *     偏好写入口）。存在的理由（D2 代价的消解手段）：跨族选色不改写宿主偏好，用户在暗偏好下
 *     点选亮族「皓」界面不会变亮，此时用户看得见当前模式仍是「暗」，想切亮就按「浅色」；
 *   · 六色平铺（玄/黛蓝/暖墨/皓/青墨/朱印）——写本包配色选择（经 controller 转交 U3 的
 *     主题层换层 + 插件 Config 持久，本文件不碰持久通道）。
 *
 * swatch 取色 = **当前解析族的那一支**（`resolveThemeTokens(id)[token][scheme]`，U2 的族解析
 * 结果 + 宿主 `active.colorScheme`）：色块呈现的就是用户点了之后界面将呈现的值。跨族色在
 * 当前模式下回落族默认（taiji `resolveTaijiTheme` 语义），因此暗模式下三个亮族色的色块与
 * 玄相同——这是事实的诚实呈现（点了确实就是这样），配名字标签可区分；比「色块显示本色、
 * 点了却不变」的误导形态好。
 *
 * 宿主交互全部经服务，无第三方主题注册（RL1：不调 `theme.register`，不注册第三方主题
 * id——否则 `html[data-ds-theme-source]` 被固定，跟随系统永久失效）。
 */
import { useSyncExternalStore } from 'react'
import { TAIJI_LOCALE_NS, type LocaleKey } from '../locale'
// THEME_IDS 住在 tokens.ts（六色 id 的权威）；resolve.ts 只再导出求值函数族
import { resolveTheme, resolveThemeTokens, type ThemeId } from '../theme/resolve'
import { THEME_IDS } from '../theme/tokens'

/** 宿主主题偏好三值域（宿主 `ThemePreference` 的同构声明；不 import 宿主类型，D3）。 */
export type ThemePreference = 'light' | 'dark' | 'system'

/** 本行在 `settings.general.item` 里的 id（与内置行同字面，遮蔽的锚点）。 */
export const APPEARANCE_ROW_ID = 'appearance'

/**
 * 行的排序位：小于内置行的 10（任务书约束）。取 5：内置行被遮蔽后，本行落在语言行（0）与
 * 字号行（11）之间——即内置外观行原来的相邻位置，行序不错乱（V12 ③）。
 */
export const APPEARANCE_ROW_ORDER = 5

/**
 * 行的遮蔽优先级：负值即压过内置行（内置未显式设 priority，槽规则取 0）。取 -5：与品牌槽
 * 的目标优先级同值，同口径（品牌槽的 -5 另有 -10/0 的上下界约束，见 mark.tsx；本行只有
 * 「压过 0」一个方向的要求，且内置行的 id+priority 是宿主已核实事实——AS14）。
 */
export const APPEARANCE_ROW_PRIORITY = -5

/**
 * swatch 四色点的 token 序列 = 太极侧主题预览的权威序 [accent, 文字, 表面, 底]
 * （`useTaijiThemes.ts` 的 `swatch: [accent, neutral-fg, surface, bg]`，逐条同源）。
 */
export const SWATCH_TOKENS = [
  '--dsw-alias-brand-primary',
  '--dsw-alias-label-primary',
  '--dsw-alias-bg-base',
  '--dsw-specific-sidebar-fill',
] as const

/** 三段模式按钮（顺序 = 宿主内置行的浅/深/跟随系统序；文案 key 见 locale.ts）。 */
const MODES: readonly { id: ThemePreference; labelKey: LocaleKey }[] = [
  { id: 'light', labelKey: 'appearance.mode.light' },
  { id: 'dark', labelKey: 'appearance.mode.dark' },
  { id: 'system', labelKey: 'appearance.mode.system' },
]

/** 类名拼接（不引 clsx：宿主基线模块表里没有它，为本行三个类名引一个依赖不值当）。 */
const cx = (...names: (string | false | undefined)[]): string => names.filter(Boolean).join(' ')

/**
 * 宿主注入范围（本包用到的宿主服务，最小结构类型；不 import 任何 dsh-client 包，D3）。
 *
 * `theme` 由 `dsh.client.inject` 的 `@deepseek-ai/dsh-client-ui-theme` 提供（同一注入还
 * 供给 U2 覆盖层用的 `overrideTokens`）；`slots` 由 `@deepseek-ai/dsh-client-ui-slots` 经
 * 模块表供给。
 */
export interface AppearanceRowHost {
  slots: {
    /** 等 `settings.general.item` 声明出现后执行 callback（声明已存在则同步执行）。 */
    inject(key: string, callback: () => (() => void) | void): () => void
    /** 注册一个 list occupant（id 相同即同格，priority 最小者渲染）；register 自挂 effect。 */
    register(
      options: {
        name: string
        id: string
        order: number
        priority: number
        locale: string
        inject?: () => AppearanceRowInjected
      },
      component: unknown,
    ): () => void
  }
  theme: {
    /** 读当前主题快照（preference = 持久偏好，active = 解析后的生效主题）。 */
    getTheme(): { preference: ThemePreference; active: { colorScheme: 'light' | 'dark' } }
    /** 写宿主偏好（宿主唯一的偏好写入口；内置 light/dark/system 三值）。 */
    setTheme(id: ThemePreference): void
  }
  /** 订阅宿主事件（本行只用 `theme/change`：偏好切换 / 覆盖层变化 / 系统明暗翻转都走它）。 */
  on(event: string, listener: () => void): () => void
}

/**
 * 配色选择控制器（**U3 装配层提供**，本文件不实现）：
 *
 * U3 的 `client/apply.ts` 组装「持久值 → coerceThemeId 初值 → applyThemeLayer 换层 →
 * persist 写 Config」全链后，把这三个方法传进 {@link installAppearanceRow}。分工理由：
 * 持久通道（`ctx.configForms`，插件 Config）归 U3（设计 §5 U3 territory：client/persist.ts），
 * 主题层换层归 U2 的 apply.ts；外观行只做呈现与意图转发，不碰任何持久与覆盖层装配——
 * 单文件内不出现第二处装配路径。
 */
export interface ThemeSelectionController {
  /** 当前生效的配色 id（U3 持有；初值来自持久 Config，非法值已回落默认色玄）。 */
  getThemeId: () => ThemeId
  /** 用户点选配色：U3 换主题层 + 写 Config（写入失败时当前会话照常生效并显式记录）。 */
  selectThemeId: (id: ThemeId) => void
  /** 订阅配色变化（点选后 swatch 选中态即时跟随）。 */
  subscribeThemeId: (listener: () => void) => () => void
}

/** 注册时经 `inject` 注入组件的业务能力（宿主渲染机合成进组件 props）。 */
export interface AppearanceRowInjected {
  /** 写宿主偏好（模式按钮专用；本包绝不因选色而调它——跨族不改写宿主偏好，D2 方案 A）。 */
  setPreference: (preference: ThemePreference) => void
  /** 读宿主偏好（选中态跟随持久值，不跟解析值——与宿主内置行同语义）。 */
  getPreference: () => ThemePreference
  /** 读当前解析族的明暗（swatch 取哪一支的依据；system 偏好下随系统翻转）。 */
  getScheme: () => 'light' | 'dark'
  /** 订阅宿主主题变化。 */
  subscribeTheme: (listener: () => void) => () => void
  /** 读当前选中的配色 id（controller 透传）。 */
  getThemeId: () => ThemeId
  /** 点选配色（controller 透传：换层 + 持久）。 */
  selectThemeId: (id: ThemeId) => void
  /** 订阅配色变化（controller 透传）。 */
  subscribeThemeId: (listener: () => void) => () => void
}

/** 行组件的完整 props：locale `t` 座位 + 注入范围（owner props 为空，无其它内容）。 */
export type AppearanceRowComponentProps = {
  /** 本包命名空间的翻译函数（注册声明 `locale:` 后由宿主渲染机注入）。 */
  t: (key: LocaleKey, params?: Record<string, unknown>) => string
} & AppearanceRowInjected

/**
 * 渲染外观行：标题 + 三段模式按钮 + 六色平铺（同屏）。
 *
 * 三个外部状态源各经一个 `useSyncExternalStore` 订阅（宿主主题快照 × 2 读、本包配色 × 1
 * 读）——订阅式读取而非轮询/时间窗：主题变化有 `theme/change` 事件、配色变化有 controller
 * 的订阅通道，都是确定性事实源（ADR-0122 ⑤：状态判定来源严格递减，禁时间推测）。
 *
 * @param props - `t` 座位 + 注入范围。
 * @returns 行元素树（自带 chrome 与分隔线，样式见同目录 appearance-row.css）。
 */
export function AppearanceRow({ t, ...injected }: AppearanceRowComponentProps) {
  const preference = useSyncExternalStore(injected.subscribeTheme, injected.getPreference, injected.getPreference)
  const scheme = useSyncExternalStore(injected.subscribeTheme, injected.getScheme, injected.getScheme)
  const themeId = useSyncExternalStore(injected.subscribeThemeId, injected.getThemeId, injected.getThemeId)

  return (
    <div className="taiji-appearance-row">
      <div className="taiji-appearance-title">{t('appearance.title')}</div>
      <div className="taiji-appearance-controls">
        <div className="taiji-appearance-modes">
          {MODES.map(({ id, labelKey }) => (
            <button
              key={id}
              type="button"
              className={cx('taiji-appearance-mode', preference === id && 'taiji-appearance-mode-active')}
              aria-pressed={preference === id}
              onClick={() => { injected.setPreference(id) }}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
        <div className="taiji-appearance-swatches">
          {THEME_IDS.map((id) => {
            const table = resolveThemeTokens(id)
            const active = themeId === id
            return (
              <button
                key={id}
                type="button"
                className={cx('taiji-appearance-swatch', active && 'taiji-appearance-swatch-active')}
                aria-pressed={active}
                onClick={() => { injected.selectThemeId(id) }}
              >
                <span className="taiji-appearance-swatch-dots" aria-hidden="true">
                  {SWATCH_TOKENS.map((token) => (
                    <span
                      key={token}
                      className="taiji-appearance-swatch-dot"
                      style={{ background: table[token][scheme] }}
                    />
                  ))}
                </span>
                <span className="taiji-appearance-swatch-name">{resolveTheme(id).name}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/**
 * 装配外观行：以负优先级遮蔽内置外观行（D8）。
 *
 * U3 的 `client/apply.ts` 在装配期调用本函数，传入宿主 ctx 与它组装的 controller。locale
 * 字典必须先于本行首次渲染注册（U3 装配序：locale → 主题层 → 品牌槽 → 外观行）。
 *
 * @param host - 宿主侧（slots / theme / on）。
 * @param controller - 配色选择控制器（U3 提供：换层 + 持久 + 初值）。
 */
export function installAppearanceRow(host: AppearanceRowHost, controller: ThemeSelectionController): void {
  host.slots.inject('settings.general.item', () => host.slots.register({
    name: 'settings.general.item',
    id: APPEARANCE_ROW_ID,
    order: APPEARANCE_ROW_ORDER,
    priority: APPEARANCE_ROW_PRIORITY,
    locale: TAIJI_LOCALE_NS,
    inject: (): AppearanceRowInjected => ({
      setPreference: (preference) => { host.theme.setTheme(preference) },
      getPreference: () => host.theme.getTheme().preference,
      getScheme: () => host.theme.getTheme().active.colorScheme,
      subscribeTheme: (listener) => host.on('theme/change', listener),
      getThemeId: controller.getThemeId,
      selectThemeId: controller.selectThemeId,
      subscribeThemeId: controller.subscribeThemeId,
    }),
  }, AppearanceRow))
}
