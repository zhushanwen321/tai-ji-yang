/**
 * client/locale.ts —— 本包的内联双语字典（设计 §3.3.8 / D8，U7）。
 *
 * 形态裁决（设计原文）：「`{zh, en}` 内联字典，经 `ctx.locale.register(ns, ...)` 注册
 * （**不建 locale/*.json**）」。理由：本包的文案只有品牌名与外观行几枚 key，拆成
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
 * 装配是最小结构类型（不 import 任何 dsh-client 包，D3）：本文件只用到宿主的
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
  /** 产品名（sidebar.brand.name 槽 + hero 品牌区标题，两处同文）。 */
  'brand.name': '太极',
  /** hero 品牌区欢迎语（抄录太极侧 Landing 问候语的后半句 greetingPrompt，逐字不臆造）。 */
  'hero.greeting': '有什么想让我帮忙的吗',
  /** 外观行标题（与宿主内置行同文，遮蔽后无感知差异）。 */
  'appearance.title': '外观',
  /** 三段模式按钮（D8：同屏呈现，消解「点了异族色为何没变亮」的困惑）。 */
  'appearance.mode.light': '浅色',
  'appearance.mode.dark': '深色',
  'appearance.mode.system': '跟随系统',
  /** 「太极」设置分区的一句说明：本插件是什么（六套配色 / 圆角与字重 / 双鱼标三项识别度承担者）。 */
  'section.desc': '本插件把 DSH 界面染成太极工作台：六套配色、圆角与字重、双鱼标。',
  /** 当前配色行的行名（值 = 色点 + 当前色中文名，由组件侧拼装）。 */
  'section.current': '当前配色',
  /** 指引行：配色与明暗模式的切换入口在通用设置的外观行（与宿主 nav 标签「通用设置」「外观」同字面）。 */
  'section.guide': '配色与明暗模式在 通用设置 → 外观 行切换',

  /* ── 项目分组侧栏（M2，client/projects/browser.tsx 消费；插值 {n}/{date} 与宿主 t 同格式）── */

  /** 侧栏区头标题。 */
  'projects.title': '项目',
  'projects.close': '关闭',
  'projects.moveUp': '上移',
  'projects.moveDown': '下移',
  /** 默认项目（未映射会话的兜底聚合）的显示名——demo 同字面「未分组」。 */
  'projects.default': '未分组',
  /** 新建项目草稿输入行的占位与可访问名。 */
  'projects.newProject': '新建项目',
  /** 组头「当前」chip（当前选中会话所在组）。 */
  'projects.currentChip': '当前',
  /** 组头 / 默认头「+」的可访问名（在此项目下新建会话）。 */
  'projects.newSessionIn': '在此项目新建会话',
  /** 组头重命名钮的可访问名。 */
  'projects.renameProject': '重命名项目',
  /** 组头删除钮的可访问名（两段确认的第一击）。 */
  'projects.deleteProject': '删除项目',
  /** 删除两段确认的武装态文案（N 从 store 的 assignments 数出；zh 措辞与设置页 deleteConfirmText 同字面）。 */
  'projects.deleteConfirm': '再点确认删除，{n} 个会话将归回未归类',
  /** blank 会话行的标题（刚创建、还没有首条消息）。 */
  'projects.rowNewSession': '新会话',
  /** 折叠轨态「新建会话」入口钮的可访问名（动词条——轨态无项目上下文，与组头「+」的 newSessionIn 区分）。 */
  'projects.railNewSession': '新建会话',
  /** 会话行重命名钮的可访问名。 */
  'projects.renameSession': '重命名会话',
  /** 会话行「移动到项目」钮的可访问名（弹层列出全部项目）。 */
  'projects.moveToProject': '移动到项目',
  /** 移动弹层的区块标题。 */
  'projects.moveToProjectTitle': '移动到项目',
  /** 会话行归档钮的可访问名。 */
  'projects.archiveSession': '归档会话',
  /** 置顶图钉（已置顶会话行）的可访问名。 */
  'projects.unpinSession': '取消置顶',
  /** 未置顶会话行的置顶动作（图钉点按，M2 可选入口）。 */
  'projects.pinSession': '置顶',
  /** 空态：全部组里没有一个可见会话。 */
  'projects.empty': '暂无会话',
  /** 加载态：会话列表快照未答（phase pending）。 */
  'projects.loading': '读取中',
  /** 数据服务缺席占位（useSessions 等钩子座位未被宿主注入）。 */
  'projects.dataUnavailable': '数据服务未就绪',
  /** 待交互行替换时间的紧凑文案（三 kind 白名单命中时）。 */
  'projects.waiting': '等待确认',
  /** 子会话计数 chip 的悬停提示（N = 运行中的直接子会话数）。 */
  'projects.subagents': '{n} 个子会话',

  /* ── 悬停详情卡（M3：行 hover 右弹 232px 卡）── */

  /** 父会话行：父会话在当前列表里找得到（title = 父标题）。 */
  'projects.parentSession': '父会话「{title}」',
  /** 父会话行回退：父会话不在列表里（id = 父 id 前 8 位）。 */
  'projects.parentMissing': '父会话 {id}',

  /* ── 归档子视图（M3：区头归档入口切入，与主列表互斥）── */

  /** 区头归档入口钮的可访问名（N = 归档会话数；计数角标另渲染）。 */
  'projects.archiveEntry': '已归档 {n} 个会话',
  /** 归档子视图返回行的标题（N = 归档会话数）。 */
  'projects.archivedCount': '已归档 ({n})',
  /** 归档子视图返回钮的可访问名。 */
  'projects.backToSessions': '返回会话列表',
  /** 时间筛选 chip：全部。 */
  'projects.archiveFilter.all': '全部',
  /** 时间筛选 chip：1 天内（距今 < 1 天）。 */
  'projects.archiveFilter.d1': '1天内',
  /** 时间筛选 chip：2-3 天（距今 1-3 天）。 */
  'projects.archiveFilter.d3': '2-3天',
  /** 时间筛选 chip：4-7 天（距今 3-7 天）。 */
  'projects.archiveFilter.d7': '4-7天',
  /** 时间筛选 chip：7 天以上（距今 ≥ 7 天）。 */
  'projects.archiveFilter.older': '7天+',
  /** 归档行 hover 恢复钮（调 uiWorkspace.unarchiveSession）。 */
  'projects.unarchiveSession': '恢复',
  /** 归档子视图空态：当前筛选档无归档行（含归档总数为 0）。 */
  'projects.archiveEmpty': '暂无归档会话',

  /* ── 右键菜单（M3：行 contextmenu 自绘菜单）── */

  /** 菜单项「重命名」（比 hover 钮的「重命名会话」短一字，菜单排版贴 demo）。 */
  'projects.renameShort': '重命名',
  /** 菜单项「归档」（同上，短形态）。 */
  'projects.archiveShort': '归档',
  /** 菜单项「复制会话 ID」（navigator.clipboard）。 */
  'projects.copySessionId': '复制会话 ID',

  /** 相对时间：刚刚（<1 分钟，含未来时间戳兜底）。 */
  'projects.time.justNow': '刚刚',
  /** 相对时间：N 分钟前。 */
  'projects.time.minutesAgo': '{n} 分钟前',
  /** 相对时间：N 小时前（同一天内）。 */
  'projects.time.hoursAgo': '{n} 小时前',
  /** 相对时间：昨天（本地日历日差 = 1）。 */
  'projects.time.yesterday': '昨天',
  /** 相对时间：N 天前（日差 2-6）。 */
  'projects.time.daysAgo': '{n} 天前',
  /** 相对时间：更早（YYYY-MM-DD 日期档，date 为本地时区日期串）。 */
  'projects.time.older': '{date}',
} satisfies LocaleDict

/**
 * 英文词典（与 zh 同 key 集）。
 *
 * 产品名抄录太极侧 `i18n/locales/en-US/app.ts` 的 `title`（TaiJi，大小写按对岸原样）；
 * 欢迎语抄录同文件 `greetingPrompt`（问号原样保留）；外观行文案抄录
 * `packages/ui/src/locale/en-US/settings.ts`（Appearance / Light / Dark / Follow system）。
 */
export const en = {
  'brand.name': 'TaiJi',
  'hero.greeting': 'What can I help you with?',
  'appearance.title': 'Appearance',
  'appearance.mode.light': 'Light',
  'appearance.mode.dark': 'Dark',
  'appearance.mode.system': 'Follow system',
  'section.desc': 'This plugin re-themes the DSH interface as the TaiJi workbench: six palettes, corner radii and font weights, and the twin-fish mark.',
  'section.current': 'Current palette',
  'section.guide': 'Switch palettes and light/dark mode in General → Appearance.',

  /* ── Project-grouped sidebar (M2; params {n}/{date} match the host t format) ──── */

  'projects.title': 'Projects',
  'projects.close': 'Close',
  'projects.moveUp': 'Move up',
  'projects.moveDown': 'Move down',
  'projects.default': 'Ungrouped',
  'projects.newProject': 'New project',
  'projects.currentChip': 'Current',
  'projects.newSessionIn': 'New session in this project',
  'projects.renameProject': 'Rename project',
  'projects.deleteProject': 'Delete project',
  'projects.deleteConfirm': 'Click again to delete — {n} sessions will return to Ungrouped',
  'projects.rowNewSession': 'New session',
  'projects.railNewSession': 'New session',
  'projects.renameSession': 'Rename session',
  'projects.moveToProject': 'Move to project',
  'projects.moveToProjectTitle': 'Move to project',
  'projects.archiveSession': 'Archive session',
  'projects.unpinSession': 'Unpin',
  'projects.pinSession': 'Pin',
  'projects.empty': 'No sessions',
  'projects.loading': 'Loading',
  'projects.dataUnavailable': 'Data services unavailable',
  'projects.waiting': 'Awaiting approval',
  'projects.subagents': '{n} subagents',

  'projects.parentSession': 'Parent session "{title}"',
  'projects.parentMissing': 'Parent {id}',

  'projects.archiveEntry': '{n} archived sessions',
  'projects.archivedCount': 'Archived ({n})',
  'projects.backToSessions': 'Back to sessions',
  'projects.archiveFilter.all': 'All',
  'projects.archiveFilter.d1': '≤1 day',
  'projects.archiveFilter.d3': '2-3 days',
  'projects.archiveFilter.d7': '4-7 days',
  'projects.archiveFilter.older': '7+ days',
  'projects.unarchiveSession': 'Restore',
  'projects.archiveEmpty': 'No archived sessions',

  'projects.renameShort': 'Rename',
  'projects.archiveShort': 'Archive',
  'projects.copySessionId': 'Copy session ID',

  'projects.time.justNow': 'Just now',
  'projects.time.minutesAgo': '{n} min ago',
  'projects.time.hoursAgo': '{n} h ago',
  'projects.time.yesterday': 'Yesterday',
  'projects.time.daysAgo': '{n} d ago',
  'projects.time.older': '{date}',
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
