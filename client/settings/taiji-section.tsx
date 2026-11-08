/**
 * client/settings/taiji-section.tsx —— 设置页的「太极」独立分区。
 *
 * 分区定位：配色状态的**自述页** + 项目分组的**管理页**。
 *   · 配色半边是自述：本插件是什么 + 当前配色状态 + 指向外观点位，不是操作页——配色与
 *     明暗模式的实际切换都发生在通用设置的外观行（appearance-row.tsx 遮蔽内置行后
 *     「外观」恰好一条，操作入口唯一），本页只呈现状态与指路。因此注入回调只取 controller
 *     的两个只读方法（getThemeId / subscribeThemeId），不透传 selectThemeId：状态页不该
 *     出现第二个换色写入口，否则「换色的唯一入口是外观行」这一分工会被自己打破。
 *   · 项目半边是管理（M1 数据通道）：装配方传入 ProjectStore 时渲染项目管理块（列表
 *     CRUD + 上移/下移排序，全部动作经 store、UI 不自持数据副本）；store 缺席时整块
 *     不渲染（M1 主线未接线的现状形态）。项目数据的唯一写通道 = store → 插件 Config，
 *     本文件不出现第二条持久路径。
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
 * agent-presets 20，本分区取 25（末位）——插件分区不插进宿主内置分区的队列中间，
 * 用户的心智模型里「官方分区在前、扩展分区在后」。
 *
 * 项目管理块**全内联**在 TaijiSection 里（与 appearance-row 同款单组件写法，不拆子组件）：
 * 本包单测夹具（client/testing/load-tsx.ts）的假 jsx-runtime 只记录元素、不递归求值内层
 * 函数组件——拆出的 ProjectManagerBlock 在夹具里只剩一个组件型元素，管理块的注册契约
 * 与交互行为都断了测试路径。内联让组件树整体可断言；真实 React 下无任何行为差异。
 */
import { useRef, useState, useSyncExternalStore } from 'react'
import { TAIJI_LOCALE_NS, type LocaleKey } from '../locale'
import { type ProjectStoreLike, type ProjectStoreStatus, type ProjectsState } from '../projects/store'
import { resolveTheme } from '../theme/resolve'
// 类型-only 引入（esbuild 整体擦除，不把外观行模块拖进装载链）：controller 契约由
// appearance-row.tsx 声明为公共出口，本文件只消费类型不消费实现。
import type { ThemeSelectionController } from './appearance-row'

/** 本分区在 `settings.section` 里的 id（导航键；不与宿主内置 id——general/account/models/plugins/agent-presets——相撞）。 */
export const TAIJI_SECTION_ID = 'taiji'

/** 本分区的导航排序位：末位（25），理由见文件头。 */
export const TAIJI_SECTION_ORDER = 25

/** 本分区组件经注册 `inject` 收到的业务面：controller 的只读分享（写入口刻意不给，见文件头）+ 可选的项目 store。 */
export interface TaijiSectionInjected {
  /** 读当前生效的配色 id（U3 controller 透传）。 */
  getThemeId: ThemeSelectionController['getThemeId']
  /** 订阅配色变化（换色后色名即时跟随；controller 透传）。 */
  subscribeThemeId: ThemeSelectionController['subscribeThemeId']
  /**
   * 项目分组 store（装配方接线时提供；M1 主线未接线时该键缺席 → 不渲染项目管理块）。
   * 全部项目动作与状态读取都经它，本页不持第二条数据副本或持久路径。
   */
  projectStore?: ProjectStoreLike
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

/** 类名拼接（与 appearance-row.tsx 同款：不为几个类名引宿主基线外的依赖）。 */
const cx = (...names: (string | false | undefined)[]): string => names.filter(Boolean).join(' ')

/**
 * store 在 ProjectStoreLike 契约之外的加法能力（ProjectStore 实装提供）：镜像就绪度与最近
 * 一次持久化失败文案。在场则消费、缺席则降级（就绪度按已就绪、错误行不渲染）——宽松读取
 * 缺省降级是本包对宿主面的既有纪律，这里对自己的 store 同样适用。
 */
type ProjectStoreExtras = {
  getStatus?: () => ProjectStoreStatus
  getLastError?: () => string | undefined
}

/** store 缺席时的稳定空状态（hooks 不可条件调用；useSyncExternalStore 要求快照值引用稳定）。 */
const NO_PROJECTS: ProjectsState = { projects: [], assignments: {} }

/** 稳定的空订阅（store 缺席时项目状态面的 subscribe 兜底）。 */
const subscribeNothing = (): (() => void) => () => {}

/** 最小结构的事件面（React 合成事件的同构子集；本页只读 key 与 target.value、调 preventDefault）。 */
interface InputEventLike {
  key: string
  target: { value: string }
  preventDefault(): void
}


/**
 * 渲染「太极」分区：标题 + 一句说明 + 当前配色行 + 指引行 +（store 在场时）项目管理块。
 *
 * 色点的取色 = `var(--dsw-alias-brand-primary)`（**活的 CSS 变量**，不是 resolveThemeTokens
 * 的静态取值）：U2 的覆盖层换层后 `:root` 上该变量已是当前配色在当前明暗下的实际生效值，
 * 色点呈现的就是「界面此刻真实使用的强调色」。走静态表则还需要知道当前明暗（宿主 theme
 * 服务）才能选 light/dark 列——本页刻意不接任何宿主服务（任务边界），活变量让 CSS 亲自
 * 回答取色问题，React 状态只负责色名。
 *
 * 项目管理块的交互状态全部收在 useRef + 重渲染扳机（useState 只当扳机用）而非纯
 * useState：本包测试夹具的 useState 桩不会触发重渲染，装填态的**真相**放 ref 才能被
 * 同一渲染树上的后续交互读到（两段确认的第二击在测试里就发生在同一棵树上）；真实
 * React 下扳机保证视觉跟随。名称与输入框同时挂载、用 hidden 类切换显隐：重命名的
 * 键盘/失焦语义（Enter 提交 / Esc 取消 / 失焦提交）因此始终可测，不依赖「先点开
 * 编辑器」的状态转移。
 *
 * @param props - `t` 座位 + 注入回调（close 由宿主传入，本页不使用）。
 * @returns 分区元素树（自带行 chrome 与分隔线，样式见同目录 taiji-section.css）。
 */
export function TaijiSection({ t, getThemeId, subscribeThemeId, projectStore }: TaijiSectionComponentProps) {
  const themeId = useSyncExternalStore(subscribeThemeId, getThemeId, getThemeId)
  // 项目半边的状态面：store 缺席时挂稳定空态（hooks 不可条件调用；空项目数组让管理块
  // 的渲染分支整体短路，不产生任何 DOM 与交互）。
  const projectsState = useSyncExternalStore(
    (listener) => projectStore?.subscribe(listener) ?? subscribeNothing(),
    () => projectStore?.getState() ?? NO_PROJECTS,
    () => projectStore?.getState() ?? NO_PROJECTS,
  )
  const storeExtras = projectStore as ProjectStoreExtras | undefined
  const projectsStatus = projectStore !== undefined && typeof storeExtras.getStatus === 'function'
    ? storeExtras.getStatus()
    : 'ready'
  const projectsError = projectStore !== undefined && typeof storeExtras.getLastError === 'function'
    ? storeExtras.getLastError()
    : undefined
  // 两段确认的武装目标 / 行内重命名的编辑目标 / 已关闭的错误文案（真相在 ref，理由见上）。
  const armedDeleteId = useRef<string | null>(null)
  const renamingId = useRef<string | null>(null)
  const dismissedError = useRef<string | null>(null)
  // 重渲染扳机（真实 React 用；测试夹具的桩是 noop，行为真相在 ref 里不受影响）。
  const [, rerender] = useState(0)

  /** 两段确认：第一击武装（按钮变红显后果文案），第二击执行；换目标重新武装。 */
  const requestDelete = (id: string): void => {
    if (projectStore === undefined) return
    if (armedDeleteId.current === id) {
      armedDeleteId.current = null
      void projectStore.deleteProject(id)
    } else {
      armedDeleteId.current = id
    }
    rerender((count) => count + 1)
  }

  /** 提交重命名：空名 = 放弃（与新建的空名丢弃同语义）；提交后收起编辑器。 */
  const submitRename = (id: string, value: string, input: InputEventLike['target']): void => {
    const trimmed = value.trim()
    if (projectStore !== undefined && trimmed !== '') void projectStore.renameProject(id, trimmed)
    if (trimmed === '') input.value = '' // 空名丢弃时清掉草稿，避免下次展开残留
    renamingId.current = null
    rerender((count) => count + 1)
  }

  const shownError = projectsError !== undefined && projectsError !== dismissedError.current ? projectsError : undefined

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
      {/* 项目管理块：store 缺席时整块不渲染（未接线 = 保持 M1 前的现状形态）。 */}
      {projectStore !== undefined && (
        <div className="taiji-projects">
          <div className="taiji-projects-head">
            <span className="taiji-projects-head-label">{t('projects.title')}</span>
          </div>
          {shownError !== undefined && (
            <div className="taiji-projects-error" role="alert">
              <span className="taiji-projects-error-text">{shownError}</span>
              <button
                type="button"
                className="taiji-projects-button taiji-projects-error-close"
                onClick={() => {
                  dismissedError.current = shownError
                  rerender((count) => count + 1)
                }}
              >
                {t('projects.close')}
              </button>
            </div>
          )}
          {projectsStatus === 'loading' ? (
            <div className="taiji-projects-loading">{t('projects.loading')}</div>
          ) : (
            <>
              <div className="taiji-projects-list">
                {projectsState.projects.map((project, index) => {
                  const editing = renamingId.current === project.id
                  const armed = armedDeleteId.current === project.id
                  // 会话数从 assignments 数出来（悬空映射对不上任何命名项目，不会计入）。
                  const sessionCount = Object.values(projectsState.assignments).filter((id) => id === project.id).length
                  const last = projectsState.projects.length - 1
                  const moveUp = index > 0
                    ? () => { void projectStore.reorderProjects(project.id, projectsState.projects[index - 1]!.id) }
                    : undefined
                  // 下移一位 = 与紧邻下一位交换（reorder 的方向直觉语义：from < target 落
                  // target 之后，相邻互拖即交换）；已是末位则无位移（禁用）。
                  const moveDown = index < last
                    ? () => { void projectStore.reorderProjects(project.id, projectsState.projects[index + 1]!.id) }
                    : undefined
                  return (
                    <div className="taiji-projects-item" key={project.id}>
                      <span className={cx('taiji-projects-name', editing && 'taiji-projects-hidden')}>{project.name}</span>
                      {/* key 含 name：外部改名后输入框重挂载、草稿回到最新名（不残留旧值）。 */}
                      <input
                        key={`${project.id}:${project.name}`}
                        className={cx('taiji-projects-input taiji-projects-rename', !editing && 'taiji-projects-hidden')}
                        defaultValue={project.name}
                        aria-label={t('projects.renameProject')}
                        onKeyDown={(event: InputEventLike) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            submitRename(project.id, event.target.value, event.target)
                          } else if (event.key === 'Escape') {
                            // 取消：草稿回滚为现名，收起编辑器（不调 store）。
                            event.target.value = project.name
                            renamingId.current = null
                            rerender((count) => count + 1)
                          }
                        }}
                        onBlur={(event: InputEventLike) => { submitRename(project.id, event.target.value, event.target) }}
                      />
                      <span className="taiji-projects-actions">
                        <button type="button" className="taiji-projects-button" disabled={moveUp === undefined} onClick={moveUp}>{t('projects.moveUp')}</button>
                        <button type="button" className="taiji-projects-button" disabled={moveDown === undefined} onClick={moveDown}>{t('projects.moveDown')}</button>
                        <button
                          type="button"
                          className={cx('taiji-projects-button', editing && 'taiji-projects-hidden')}
                          onClick={() => {
                            renamingId.current = project.id
                            rerender((count) => count + 1)
                          }}
                        >
                          {t('projects.renameProject')}
                        </button>
                        <button
                          type="button"
                          className={cx('taiji-projects-button', armed && 'taiji-projects-button-danger')}
                          onClick={() => { requestDelete(project.id) }}
                        >
                          {armed ? t('projects.deleteConfirm', { n: sessionCount }) : t('projects.deleteProject')}
                        </button>
                      </span>
                    </div>
                  )
                })}
              </div>
              <input
                className="taiji-projects-input taiji-projects-create"
                placeholder={t('projects.newProject')}
                aria-label={t('projects.newProject')}
                onKeyDown={(event: InputEventLike) => {
                  if (event.key !== 'Enter') return
                  const value = event.target.value.trim()
                  event.target.value = ''
                  if (value !== '') void projectStore.createProject(value)
                }}
              />
            </>
          )}
        </div>
      )}
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
 * @param projectStore - 项目分组 store（可选；提供时渲染项目管理块，缺席时保持无项目半边的现状）。
 */
export function installTaijiSection(
  host: TaijiSectionHost,
  controller: ThemeSelectionController,
  projectStore?: ProjectStoreLike,
): void {
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
        // store 缺席时键整体缺席（不是值 undefined）：注入面的形状即「有没有项目半边」。
        ...(projectStore !== undefined ? { projectStore } : {}),
      }),
    }, TaijiSection)
  })
}
