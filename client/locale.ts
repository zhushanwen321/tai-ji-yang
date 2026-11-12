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
  /** 指引行：明暗模式在通用设置的外观行（与宿主 nav 标签「通用设置」「外观」同字面）；配色可就地展开色板（D9 第三入口）。 */
  'section.guide': '明暗模式在 通用设置 → 外观 行切换；点当前配色行尾的箭头可就地展开六色色板',

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
  'section.guide': 'Switch light/dark mode in General → Appearance; expand the palette next to the current palette row to switch palettes in place.',

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

/**
 * 模型服务分区的私有命名空间（dsh-model-service 设计包，u-foundation 骨架）。
 *
 * 与 `taiji.shell` 分开的原因：宿主按（命名空间, revision）合成 `t` 座位——分区内的
 * 全部组件共用同一个 `t` 即可取到本分区全部文案，不与壳字典互相牵动 key 域。注册与
 * 撤除同样走 `ctx.effect`（AX8 全托管），形态裁决与 `taiji.shell` 一致（内联字典，
 * 不建 locale/*.json）。
 */
export const TAIJI_MODEL_SERVICE_LOCALE_NS = 'taiji.model-service'

/**
 * 模型服务分区简体中文字典（u-foundation 骨架 30 键 + M1 填充 + M2 增键，当前 192 键）。
 *
 * 键集分段（与下方注释分段一致）：分区与三视图 / 供应商表单字段 / 凭据徽章 / 模型区
 * 来源态 / 空态文案 / 路由视图与三层时间窗 / 通用动作 / 供应商视图 / 展开体表单与发现 /
 * 保存与删除结果文案。措辞来源：空态文案与来源态抄设计包空态矩阵与 D11 的界面语义原文；
 * 字段名对齐宿主 provider schema 字段语义；思考档位/添加流程/窄表单词条对齐供应商接入
 * 交互重设计。骨架键值不被后续填充改动，由 locale.test.ts 的骨架用例断言看守；骨架期
 * 占位词条与被替换语义的旧词条（D6 三档策略按钮）已清理移除（沿革 git 可追溯）。
 */
export const modelServiceZh = {
  /* ── 分区与三视图 ── */
  /** 导航条目与分区头标题（D2：唯一 id model-services、label「模型服务」）。 */
  'section.label': '模型服务',
  'view.providers': '供应商',
  'view.models': '模型清单',
  'view.routes': '模型路由',

  /* ── 供应商表单字段（展开体；模型条目字段对齐宿主 models[] schema）── */
  'provider.displayName': '显示名称',
  'provider.baseURL': 'API 端点',
  'provider.api': '协议',
  'provider.apiKey': 'API 密钥',
  /** 窄表单说明条（内置目录型：端点/协议由目录解析，表单只填密钥）。 */
  'provider.narrowNote': 'API 端点与协议由内置目录解析，无需填写',
  /** 模型区标题（供应商展开体内按两来源态呈现的区块）。 */
  'provider.modelsSection': '模型',
  /** 协议兼容分组标题（D6：essential 常显 + advanced 折叠）。 */
  'provider.compat': '协议兼容',
  'model.id': '模型 ID',
  'model.displayName': '显示名称',
  /** 显示名自动生成说明（nameEdited 未置位时显示名跟随模型 ID 生成/联动）。 */
  'model.nameAutoHint': '未手动修改时，显示名跟随模型 ID 自动生成',
  'model.contextWindow': '上下文窗口',
  /** 上下文窗口档位 select 的自定义回落项与提示（档位外的数字走数字输入，无损写回）。 */
  'model.contextCustom': '自定义…',
  'model.maxTokens': '最大输出',
  'model.inputModalities': '输入类型',
  /** 思考档位组（「支持思考」checkbox + 档位 badge 自由组合；宿主 reasoningEfforts 的 7 档词表）。 */
  'model.thinkingLevels': '思考档位',
  'model.thinkingEnabled': '支持思考',
  /** preserve 态标注（既有 reasoningEfforts 非同名映射形态：原样保留、写回逐字透传）。 */
  'model.thinkingPreserved': '既有值原样保留',
  /** 自定义档输入（仅接受宿主 THINKING_LEVELS 词表内的档名；自由键名会写出非法 wire 值）。 */
  'model.levelCustom': '自定义档位',
  'model.levelCustomPlaceholder': '档位名',
  'model.levelInvalid': '仅支持 off / minimal / low / medium / high / xhigh / max',
  'model.levelRemove': '移除档位',
  /** 宿主 THINKING_LEVELS 七档的界面文案（badge/pill 标签；自定义档校验提示另见 model.levelInvalid）。 */
  'thinking.level.off': '关闭',
  'thinking.level.minimal': '极简',
  'thinking.level.low': '低',
  'thinking.level.medium': '中',
  'thinking.level.high': '高',
  'thinking.level.xhigh': '超高',
  'thinking.level.max': '最高',

  /* ── 凭据徽章（credentials describe 两态）── */
  'credential.configured': '已配置',
  'credential.missing': '未配置',

  /* ── 模型区两来源态（D11：目录默认态与自定义清单态互斥）── */
  /** 目录默认态的状态说明（models[] 空，目录模型只读）。 */
  'models.directoryMode': '保持目录默认',
  /** 自定义清单态的明示警示（写入 models[] 后目录默认整组被替换）。 */
  'models.directoryReplaced': '目录默认已被替换',
  /** 恢复目录默认动作（清空 models[]）。 */
  'models.restoreDirectory': '恢复目录默认',

  /* ── 空态文案（空态矩阵：说明为什么空 + 下一步动作）── */
  /** 供应商视图空态：无任何 provider。 */
  'providers.empty': '尚未接入任何供应商',
  /** 供应商视图空态：托管 provider 只读行存在但无可编辑 provider。 */
  'providers.emptyManagedOnly': '暂无可编辑供应商（现有供应商由宿主管理）',
  /** 添加引导卡的动作文案。 */
  'providers.emptyAddGuide': '添加供应商',
  /** 模型清单空态：无模型。 */
  'models.emptyNoModels': '没有已接入的模型',
  /** 模型清单空态：供应商已接入但未写模型。 */
  'models.emptyNoModelsButProviders': '供应商已接入，但还没有模型',
  /** 模型清单空态：尚未接入供应商。 */
  'models.emptyNoProviders': '尚未接入供应商',
  /** 模型清单筛选空态（{q} = 筛选词，与宿主 t 插值同格式）。 */
  'models.emptyNoMatch': '没有匹配「{q}」的模型',
  /** 筛选空态的清除动作。 */
  'models.clearFilter': '清除筛选',
  /** 清单空态的下一步动作（V9 步骤 1：两个非筛选空态都给接入引导——跳供应商视图）。 */
  'models.emptyGoProviders': '前往供应商视图接入',
  /** 清单视图的筛选输入占位/可访问名（G16）。 */
  'models.viewFilter': '筛选模型',
  /** 四层数据源中拿不到的字段标注（G16：上下文/输入类型/最大输出缺失）。 */
  'models.fieldMissing': '未提供',

  /* ── 路由视图（M2：路由列表 / 白名单 / 悬挂 / 注册降级 / 空态矩阵）── */
  'routes.snapshotUnavailable': '插件配置未被服务（Config 命名空间不可用）；重新打开本分区或检查插件装载状态。',
  'routes.emptyNoRoutes': '还没有路由',
  'routes.emptyNoRoutesNext': '创建一条路由，把多个供应商的模型按时段编排起来；创建后在白名单勾选即可在对话流使用。',
  'routes.emptyNotWhitelisted': '已配置路由，但白名单还没有勾选',
  'routes.emptyNotWhitelistedNext': '在路由行勾选「白名单」后，路由虚拟模型才会出现在对话流选择器。',
  'routes.emptyMembersUnavailable': '白名单已勾选，但成员模型当前不可用',
  'routes.emptyMembersUnavailableNext': '检查路由成员：供应商是否已删、模型是否在清单、凭据是否已配置。',
  'route.create': '新建路由',
  'route.nameField': '路由名称',
  'route.namePlaceholder': '例：工作日旗舰模型',
  'route.idPreview': '保存标识：{id}',
  'route.nameHint': '路由标识 {id} 创建后固定；改名不影响白名单与对话流。',
  'route.edit': '编辑路由',
  'route.delete': '删除路由',
  'route.confirmDelete': '再点确认删除',
  'route.whitelistedBadge': '白名单',
  'route.whitelistToggle': '白名单勾选：{name}',
  'route.hitNow': '当前命中：{provider} / {model}',
  'route.noHitNow': '当前时段无命中成员',
  'route.noMembers': '还没有成员：编辑路由并添加至少一个供应商模型。',
  'route.conditionNone': '无条件',
  'route.conditionWindow': '时间窗',
  'route.conditionUnavailable': '额度条件（本版本不可用）',
  'route.memberProviderMissing': '供应商已删',
  'route.memberModelMissing': '模型不在清单',
  'route.memberCredentialMissing': '凭据缺失（{ref}）',
  'route.memberUnavailable': '成员不可用',
  'route.noActiveMember': '当前时段没有命中的成员，请调整时间窗或成员顺序',
  'route.notExposed': '该路由未在白名单勾选（或已被删除），对话流不可见',
  'route.registrationFailed': '路由功能不可用：provider id 与宿主冲突（{routes}）',
  'route.registrationFailedNext': '恢复指引：更换路由名称（重新派生标识）或检查宿主适配器；物理模型不受影响，详情见宿主日志。',
  'route.writeRefused': '写入被宿主拒绝，已恢复为当前保存值',
  'route.writeFailed': '写入失败（{detail}），已恢复为当前保存值',
  'route.hangingTitle': '失效白名单条目（{n}）',
  'route.hangingBadge': '路由已删除',
  'route.removeHanging': '移除',
  'route.cleanupHanging': '清理失效条目',
  'route.membersTitle': '成员（顺序即优先级）',
  'route.addMember': '添加成员',
  'route.moveUp': '上移',
  'route.moveDown': '下移',
  'route.removeMember': '移除成员',
  'route.memberProvider': '成员供应商',
  'route.memberModel': '成员模型',
  'route.memberModelInput': '输入模型 ID',
  'route.memberCondition': '成员条件',
  'route.editWindow': '编辑时间窗',
  'route.editWindowNeedsWindow': '先把条件切换为「时间窗」再编辑窗口。',
  'route.noSelectableProviders': '（暂无可编辑供应商）',

  /* ── 三层时间窗（M2：命名窗口矩阵 / 48 格精细 / 特殊日期）── */
  'route.grid.matrix': '命名窗口',
  'route.grid.slots': '按天时段',
  'route.grid.special': '特殊日期',
  'route.grid.matrixHead': '时段 \\ 日期',
  'route.grid.cellAria': '{day} {window}：点击整段开关',
  'route.window.night': '深夜 00-06',
  'route.window.dawn': '清晨 06-09',
  'route.window.morning': '上午 09-12',
  'route.window.afternoon': '下午 12-18',
  'route.window.evening': '晚间 18-24',
  'route.day.mon': '周一',
  'route.day.tue': '周二',
  'route.day.wed': '周三',
  'route.day.thu': '周四',
  'route.day.fri': '周五',
  'route.day.sat': '周六',
  'route.day.sun': '周日',
  'route.special.dateField': '特殊日期',
  'route.special.nameField': '日期名称',
  'route.special.namePlaceholder': '例：春节假期',
  'route.special.modeField': '生效方式',
  'route.special.include': '启用（覆盖当日）',
  'route.special.exclude': '停用（剔除当日）',
  'route.special.add': '添加特殊日期',
  'route.special.empty': '还没有特殊日期：周末时间窗之外的特殊安排在这里按日期生效。',
  'route.special.editMask': '编辑当日时段',
  'route.special.remove': '删除日期',
  'route.special.maskHint': '点击格子调整当日生效时段（不设置 = 全天生效/剔除）。',

  /* ── 添加流程（选接入方式两卡 / 内置目录候选列表）── */
  'addflow.builtinTitle': '接入内置供应商',
  'addflow.builtinNote': '从内置目录选择条目，只需填写 API 密钥',
  'addflow.customTitle': '接入自定义供应商',
  'addflow.customNote': '自行填写 API 端点与协议，手动维护模型清单',
  'addflow.pickTitle': '选择内置供应商',
  'addflow.pickNote': '以下为内置目录中尚未接入的条目',
  'addflow.pickEmpty': '内置目录条目均已接入',
  'addflow.back': '返回',
  'addflow.connect': '接入',

  /* ── 动作（M1 填充：展开体 / 列表 / 清单的通用动作）── */
  'action.save': '保存并接入',
  'action.cancel': '取消',
  'action.deleteProvider': '删除供应商',
  'action.testConnection': '测试连接',
  'action.discover': '发现模型',
  'action.addModel': '手动添加模型',
  'action.addProvider': '添加供应商',
  'action.edit': '编辑',
  'action.locate': '在供应商中查看',
  'action.backToModels': '返回模型清单',
  'action.confirmDelete': '再点确认删除',
  /** 恢复目录默认的两段确认第二击（警示文案 models.restoreDirectoryWarning 随第一击展示）。 */
  'action.confirmRestore': '再点确认恢复',

  /* ── 供应商视图（列表行与标识预览）── */
  'providers.loading': '读取供应商目录…',
  'providers.snapshotUnavailable': '宿主模型层未就绪（llm-pi-ai 命名空间未被服务）；确认宿主已装模型适配器后重新打开本分区。',
  'providers.managedNote': '由宿主管理；请在宿主「模型」分区编辑与配置凭据',
  'providers.managedBadge': '宿主托管',
  'providers.catalogBadge': '目录型',
  'providers.customBadge': '自定义',
  'provider.keyPreview': '保存标识：{key}',
  'provider.refPreview': '凭据引用：{ref}',
  'provider.modelCount': '{n} 个模型',

  /* ── 展开体表单（协议选项 / compat / 模型区来源态 / 发现 / 保存）── */
  'provider.protocol.openai-completions': 'OpenAI 兼容（chat/completions）',
  'provider.protocol.openai-responses': 'OpenAI Responses',
  'provider.protocol.anthropic-messages': 'Anthropic Messages',
  'compat.groupEssential': '基础兼容',
  'compat.groupAdvanced': '高级兼容',
  'compat.unavailable': '一期不开放',
  'compat.field.thinkingFormat': '思考格式',
  'compat.field.supportsDeveloperRole': '支持 developer 角色',
  'compat.field.supportsReasoningEffort': '支持 reasoning effort',
  'compat.field.supportsStore': '支持 store 参数',
  'compat.field.supportsUsageInStreaming': '流式返回 usage',
  'compat.field.supportsFinishReason': '流式 finish reason',
  'compat.hostDoesNotConsume': '宿主不消费（写入了宿主 schema 未声明的字段）：{fields}',
  'models.catalogNote': '以下为目录自有模型（只读；保存空模型清单即保持目录默认）',
  'models.overrideNote': '该供应商以模型覆盖（modelOverrides）微调目录默认；本版本只读展示。',
  'models.restoreDirectoryWarning': '恢复目录默认将移除全部 {n} 个自定义条目，目录模型重新生效。确认后执行。',
  'models.saveBlockedEmpty': '至少添加一个模型，或先执行「发现模型」',
  'models.sourceDirectory': '目录默认',
  'models.sourceCustom': '自定义清单',
  'models.sourceOverride': '目录默认 + 覆盖',
  'input.text': '文本',
  'input.image': '图像',
  'discovery.running': '正在探测端点…',
  'discovery.catalog': '目录自有模型：{n} 个（零网络读取）',
  /** 目录型供应商的测试连接说明（AS7：宿主短路不看端点，端点连通性未被验证的替代指引）。 */
  'discovery.catalogNoEndpointTest': '目录型供应商由安装目录解析：本动作读取目录模型，不验证端点连通性；端点连通性请在宿主「模型」分区验证。',
  'discovery.endpointOk': '端点可达，发现 {n} 个模型',
  'discovery.failed': '探测失败',
  /** 端点缺失时的探测失败后半句（终态同步修复：原硬编码文案入双语字典）。 */
  'discovery.requireEndpoint': '请先填写 API 端点。',
  'discovery.none': '端点可达，但没有返回模型',

  /* ── 保存与删除的结果文案 ── */
  'save.saved': '已保存',
  'save.refTakenA': '该 ref 已被占用（本 profile 内供应商或宿主分区供应商的派生 ref），请更换显示名',
  'save.refTakenB': '该 ref 已被占用（可能来自其他 profile 的同名供应商），请更换显示名',
  'save.refTakenRoute': '该名称与已注册的模型路由同名，请更换显示名',
  'delete.confirmDraft': '再点确认删除「{name}」（含其模型清单）',
  'delete.crossProfileConfirm': '该供应商的凭据引用 {ref} 由宿主派生，可能被其他 profile 的同名供应商共用；删除将一并清除该凭据。',
  /** 路由成员引用警告（D3 删除流程：列出受影响路由，用户确认后继续删除）。 */
  'delete.routeReferences': '该供应商被路由引用（{routes}）；删除后对应成员将不可用（路由视图成员行标注「供应商已删」）。确认后继续删除。',
  'credential.pendingRetry': '已自动重试清理 {n} 个待清理凭据引用',
} satisfies LocaleDict

/** 模型服务分区英文词典（与 modelServiceZh 同 key 集，相等性由 locale.test.ts 对账）。 */
export const modelServiceEn = {
  'section.label': 'Model Services',
  'view.providers': 'Providers',
  'view.models': 'Models',
  'view.routes': 'Routes',

  'provider.displayName': 'Display name',
  'provider.baseURL': 'API endpoint',
  'provider.api': 'Protocol',
  'provider.apiKey': 'API key',
  'provider.narrowNote': 'API endpoint and protocol are resolved from the built-in catalog; nothing to fill in',
  'provider.modelsSection': 'Models',
  'provider.compat': 'Protocol compatibility',
  'model.id': 'Model ID',
  'model.displayName': 'Display name',
  'model.nameAutoHint': 'Until edited manually, the display name follows the model ID',
  'model.contextWindow': 'Context window',
  'model.contextCustom': 'Custom…',
  'model.maxTokens': 'Max output',
  'model.inputModalities': 'Input types',
  'model.thinkingLevels': 'Thinking levels',
  'model.thinkingEnabled': 'Supports thinking',
  'model.thinkingPreserved': 'Existing value kept as is',
  'model.levelCustom': 'Custom level',
  'model.levelCustomPlaceholder': 'Level name',
  'model.levelInvalid': 'Only off / minimal / low / medium / high / xhigh / max are supported',
  'model.levelRemove': 'Remove level',
  'thinking.level.off': 'Off',
  'thinking.level.minimal': 'Minimal',
  'thinking.level.low': 'Low',
  'thinking.level.medium': 'Medium',
  'thinking.level.high': 'High',
  'thinking.level.xhigh': 'Ultra high',
  'thinking.level.max': 'Max',

  'credential.configured': 'Configured',
  'credential.missing': 'Not configured',

  'models.directoryMode': 'Keeping directory defaults',
  'models.directoryReplaced': 'Directory defaults have been replaced',
  'models.restoreDirectory': 'Restore directory defaults',

  'providers.empty': 'No providers yet',
  'providers.emptyManagedOnly': 'No editable providers (existing ones are host-managed)',
  'providers.emptyAddGuide': 'Add provider',
  'models.emptyNoModels': 'No connected models',
  'models.emptyNoModelsButProviders': 'Providers are connected, but no models yet',
  'models.emptyNoProviders': 'No providers connected yet',
  'models.emptyNoMatch': 'No models matching "{q}"',
  'models.clearFilter': 'Clear filter',
  'models.emptyGoProviders': 'Go to Providers',
  'models.viewFilter': 'Filter models',
  'models.fieldMissing': 'Not provided',

  /* ── Routes view (M2: list / whitelist / hanging / registration degraded / empty matrix) ── */
  'routes.snapshotUnavailable': 'Plugin config is not being served (namespace unavailable); reopen this section or check the plugin state.',
  'routes.emptyNoRoutes': 'No routes yet',
  'routes.emptyNoRoutesNext': 'Create a route to orchestrate models from several providers by time window; tick it in the whitelist to use it in conversations.',
  'routes.emptyNotWhitelisted': 'Routes exist, but the whitelist has no ticked entry',
  'routes.emptyNotWhitelistedNext': 'Tick "whitelist" on a route row to make its virtual model appear in the chat selector.',
  'routes.emptyMembersUnavailable': 'Whitelist is ticked, but member models are currently unavailable',
  'routes.emptyMembersUnavailableNext': 'Check route members: provider deleted, model missing from the list, or credential not configured.',
  'route.create': 'New route',
  'route.nameField': 'Route name',
  'route.namePlaceholder': 'e.g. Weekday flagship',
  'route.idPreview': 'Saved id: {id}',
  'route.nameHint': 'Route id {id} is fixed once created; renaming keeps whitelist and conversations intact.',
  'route.edit': 'Edit route',
  'route.delete': 'Delete route',
  'route.confirmDelete': 'Click again to confirm',
  'route.whitelistedBadge': 'Whitelist',
  'route.whitelistToggle': 'Whitelist toggle: {name}',
  'route.hitNow': 'Hit now: {provider} / {model}',
  'route.noHitNow': 'No member matches the current time',
  'route.noMembers': 'No members yet: edit the route and add at least one provider model.',
  'route.conditionNone': 'Always',
  'route.conditionWindow': 'Time window',
  'route.conditionUnavailable': 'Quota condition (unavailable in this version)',
  'route.memberProviderMissing': 'Provider deleted',
  'route.memberModelMissing': 'Model not in list',
  'route.memberCredentialMissing': 'Credential missing ({ref})',
  'route.memberUnavailable': 'Member unavailable',
  'route.noActiveMember': 'No member matches the current time; adjust the window or member order',
  'route.notExposed': 'This route is not whitelisted (or was deleted) and is hidden from conversations',
  'route.registrationFailed': 'Routing unavailable: provider id conflicts with the host ({routes})',
  'route.registrationFailedNext': 'To recover: rename the route (re-derive its id) or check host adapters; physical models are unaffected, see host logs for details.',
  'route.writeRefused': 'Write was refused by the host; restored to the saved value',
  'route.writeFailed': 'Write failed ({detail}); restored to the saved value',
  'route.hangingTitle': 'Stale whitelist entries ({n})',
  'route.hangingBadge': 'Route deleted',
  'route.removeHanging': 'Remove',
  'route.cleanupHanging': 'Clean stale entries',
  'route.membersTitle': 'Members (order = priority)',
  'route.addMember': 'Add member',
  'route.moveUp': 'Move up',
  'route.moveDown': 'Move down',
  'route.removeMember': 'Remove member',
  'route.memberProvider': 'Member provider',
  'route.memberModel': 'Member model',
  'route.memberModelInput': 'Type a model id',
  'route.memberCondition': 'Member condition',
  'route.editWindow': 'Edit window',
  'route.editWindowNeedsWindow': 'Switch the condition to "Time window" first to edit the grid.',
  'route.noSelectableProviders': '(no editable providers)',

  /* ── Time window grid (M2: named-window matrix / 48 slots / special dates) ── */
  'route.grid.matrix': 'Named windows',
  'route.grid.slots': 'By-day slots',
  'route.grid.special': 'Special dates',
  'route.grid.matrixHead': 'Window \\ Day',
  'route.grid.cellAria': '{day} {window}: click to toggle the whole span',
  'route.window.night': 'Night 00-06',
  'route.window.dawn': 'Dawn 06-09',
  'route.window.morning': 'Morning 09-12',
  'route.window.afternoon': 'Afternoon 12-18',
  'route.window.evening': 'Evening 18-24',
  'route.day.mon': 'Mon',
  'route.day.tue': 'Tue',
  'route.day.wed': 'Wed',
  'route.day.thu': 'Thu',
  'route.day.fri': 'Fri',
  'route.day.sat': 'Sat',
  'route.day.sun': 'Sun',
  'route.special.dateField': 'Special date',
  'route.special.nameField': 'Date name',
  'route.special.namePlaceholder': 'e.g. Holiday',
  'route.special.modeField': 'Mode',
  'route.special.include': 'Include (override the day)',
  'route.special.exclude': 'Exclude (drop the day)',
  'route.special.add': 'Add special date',
  'route.special.empty': 'No special dates yet: one-off arrangements beyond the weekly grid take effect here by date.',
  'route.special.editMask': 'Edit day slots',
  'route.special.remove': 'Delete date',
  'route.special.maskHint': 'Click cells to adjust the active slots for that day (unset = whole day include/exclude).',

  /* ── Add flow (choose cards / built-in catalog candidates) ── */
  'addflow.builtinTitle': 'Connect a built-in provider',
  'addflow.builtinNote': 'Pick an entry from the built-in catalog; only the API key is needed',
  'addflow.customTitle': 'Connect a custom provider',
  'addflow.customNote': 'Fill in the API endpoint and protocol yourself; maintain the model list manually',
  'addflow.pickTitle': 'Choose a built-in provider',
  'addflow.pickNote': 'Built-in catalog entries that are not connected yet',
  'addflow.pickEmpty': 'All built-in catalog entries are connected',
  'addflow.back': 'Back',
  'addflow.connect': 'Connect',

  'action.save': 'Save & connect',
  'action.cancel': 'Cancel',
  'action.deleteProvider': 'Delete provider',
  'action.testConnection': 'Test connection',
  'action.discover': 'Discover models',
  'action.addModel': 'Add model manually',
  'action.addProvider': 'Add provider',
  'action.edit': 'Edit',
  'action.locate': 'Show in provider',
  'action.backToModels': 'Back to model list',
  'action.confirmDelete': 'Click again to confirm',
  'action.confirmRestore': 'Click again to restore',

  'providers.loading': 'Loading provider directory…',
  'providers.snapshotUnavailable': 'The host model layer is not ready (llm-pi-ai namespace is unserved); reopen this section once the host ships a model adapter.',
  'providers.managedNote': 'Host-managed; edit it and its credentials in the host Models section',
  'providers.managedBadge': 'Host-managed',
  'providers.catalogBadge': 'Catalog',
  'providers.customBadge': 'Custom',
  'provider.keyPreview': 'Saved key: {key}',
  'provider.refPreview': 'Credential ref: {ref}',
  'provider.modelCount': '{n} models',

  'provider.protocol.openai-completions': 'OpenAI-compatible (chat/completions)',
  'provider.protocol.openai-responses': 'OpenAI Responses',
  'provider.protocol.anthropic-messages': 'Anthropic Messages',
  'compat.groupEssential': 'Essential compatibility',
  'compat.groupAdvanced': 'Advanced compatibility',
  'compat.unavailable': 'Not available in this version',
  'compat.field.thinkingFormat': 'Thinking format',
  'compat.field.supportsDeveloperRole': 'Developer role support',
  'compat.field.supportsReasoningEffort': 'Reasoning effort support',
  'compat.field.supportsStore': 'Store parameter support',
  'compat.field.supportsUsageInStreaming': 'Usage in streaming',
  'compat.field.supportsFinishReason': 'Streaming finish reason',
  'compat.hostDoesNotConsume': 'Not consumed by the host (fields absent from its schema): {fields}',
  'models.catalogNote': 'Directory-owned models below (read-only; keeping an empty model list keeps directory defaults)',
  'models.overrideNote': 'This provider tunes directory defaults via modelOverrides; shown read-only in this version.',
  'models.restoreDirectoryWarning': 'Restoring directory defaults removes all {n} custom entries and re-enables catalog models. Confirm to proceed.',
  'models.saveBlockedEmpty': 'Add at least one model, or run model discovery first',
  'models.sourceDirectory': 'Directory defaults',
  'models.sourceCustom': 'Custom list',
  'models.sourceOverride': 'Directory defaults + overrides',
  'input.text': 'Text',
  'input.image': 'Image',
  'discovery.running': 'Probing endpoint…',
  'discovery.catalog': 'Catalog-owned models: {n} (read without network)',
  'discovery.catalogNoEndpointTest': 'Catalog providers resolve from the install directory: this reads catalog models and does not verify the endpoint; verify endpoint reachability in the host Models section.',
  'discovery.endpointOk': 'Endpoint reachable, {n} models found',
  'discovery.failed': 'Discovery failed',
  'discovery.requireEndpoint': 'Fill in the API endpoint first.',
  'discovery.none': 'Endpoint reachable, but no models returned',

  'save.saved': 'Saved',
  'save.refTakenA': 'This ref is already taken (derived by a provider in this profile or the host Models section); choose another display name',
  'save.refTakenB': 'This ref is already taken (likely by a same-named provider in another profile); choose another display name',
  'save.refTakenRoute': 'This name collides with a registered model route; choose another display name',
  'delete.confirmDraft': 'Click again to delete "{name}" (including its model list)',
  'delete.crossProfileConfirm': 'The credential ref {ref} of this provider is host-derived and may be shared by same-named providers in other profiles; deleting also clears that credential.',
  'delete.routeReferences': 'This provider is referenced by route(s) ({routes}); after deletion the affected members become unavailable (marked "provider deleted" in the routes view). Confirm to proceed.',
  'credential.pendingRetry': 'Retried clearing {n} pending credential refs',
} satisfies LocaleDict

/** 模型服务分区文案 key 域（分区组件侧 `t` 的参数类型）。 */
export type ModelServiceLocaleKey = keyof typeof modelServiceZh

/** 模型服务分区两种语言字典的并表（register 的入参形态）。 */
export const MODEL_SERVICE_LOCALE_DICTS: Record<string, LocaleDict> = {
  zh: modelServiceZh,
  en: modelServiceEn,
}

/**
 * 注册模型服务分区的内联双语字典（经 ctx.effect 托管，卸载即撤除）。
 *
 * 装配序约束与 installLocale 相同：必须先于分区槽位的首次渲染（分区声明
 * `locale: TAIJI_MODEL_SERVICE_LOCALE_NS` 时，宿主要从已安装的字典合成 `t` 座位）。
 */
export function installModelServiceLocale(host: LocaleInstallHost): void {
  host.effect(
    () => host.locale.register(TAIJI_MODEL_SERVICE_LOCALE_NS, MODEL_SERVICE_LOCALE_DICTS),
    'taiji: 模型服务分区双语字典（zh/en）',
  )
}
