/**
 * client/persist.ts —— 本包持久状态（配色 id）的唯一通道：**插件 Config**（设计 §3.3.2 / D2，AS22）。
 *
 * 为什么不是 localStorage（D2 本轮裁决，AG-4 方案 b）：卸载时没有执行删除者——`dsh plugin
 * remove` 只移除 profile 里的 bundle 行，本包的 client.js 不再物化，本包代码没有任何机会清理
 * 自己写下的键，宿主也不代清插件私有键（`grep -rn 'removeItem' packages/client/` 的命中全在测试
 * 与插件自身状态代码里）。AX3 的「持久记录清除」在 localStorage 方案下**永远不可达**，是终态
 * 不变量与实现手段的直接矛盾。改用插件 Config 后「卸载即清除」由宿主既有机制保证：Config 存在
 * profile patch 的该 bundle 行上，行被移除则配置随行消失，无需本包代码参与。
 *
 * 通道形态（宿主 0.1.7 实装逐行核对，非设计臆断）：
 *   · 命名空间 = **本包 profile 行的 id**（`cordis.patch.yml` 里 `- id: tai-ji-yang-shell`）。
 *     实证链：`ConfigForms.get(entryId)` 的入参就是 entry id；其上游 `SettingsForms.describe()`
 *     的 `ns: entry.options.id`（profile entry id），`SettingsDescriptor` 文档原话
 *     "Forms keyed by unique profile entry ids"。先例同构：`dsh-client-locale` 的命名空间
 *     `locale` = web-app patch 里的行 id（不是包名 `@deepseek-ai/dsh-client-locale`）；
 *     `dsh-web-search-deepseek` 的 `WEB_SEARCH_DEEPSEEK_SETTINGS_NAMESPACE` 同样是行 id。
 *   · 字段 = `appearance`（Host 半场 `Config` 里 `.volatile()` 的那一个；`volatileForm` 只投影
 *     volatile 字段，非 volatile 字段整个命名空间都不会出现在 describe 里）。
 *   · 读 = `form.getSnapshot()`（镜像视图，`status: loading → ready | unavailable`）；
 *     写 = `form.set(field, value)`（`ctx.remote.settings.mutate`，带 revision 栅栏）。
 *
 * 本文件只经 `ctx.configForms` 这一条面读写，**不出现 localStorage / sessionStorage / IndexedDB
 * 字样**（tests/uninstall-cleanliness.spec.ts 对 client/ 全量源码做静态扫描断言这一点）。
 */
import { coerceThemeId, type ThemeId } from './theme/resolve'

/**
 * 本包 profile 行 id = 设置命名空间。
 *
 * 与 `package.json` 的 `name`、`cordis.patch.yml` 的行 id、factory 壳的 `id` 同一字面值
 * （u-foundation 裁决 2）。这里显式声明而不从别处 import：浏览器半场不 import Node 半场模块，
 * 两侧各持同一字面值，一致性由测试对拍 `cordis.patch.yml` 与 `package.json` 看守。
 */
export const PLUGIN_ENTRY_ID = 'tai-ji-yang-shell'

/** 持久字段名（Host 半场 `Config` 的 `appearance` 字段，volatile）。 */
export const APPEARANCE_FIELD = 'appearance'

/** 插件 Config 里本包那一段的解码形态（`SettingsDescriptor.value` 投影后的 section）。 */
export interface AppearanceSection {
  /** 上次用户点选的配色 id；缺省 = 从未点选过（回落包默认色玄）。 */
  appearance?: string
}

/** 宿主 `ConfigFormSnapshot` 的同构最小面（只取本包用到的四个字段）。 */
export interface ConfigFormSnapshotLike {
  /** `loading` = 镜像未答；`ready` = 命名空间已被服务且段已解码；`unavailable` = 未被服务。 */
  status: 'loading' | 'ready' | 'unavailable'
  /** 已解码的 section；首答之前是 undefined。 */
  value: AppearanceSection | undefined
  /** 下一次写入的 revision 栅栏；首答之前是 undefined。 */
  revision: number | undefined
  /** 宿主文档是否接受写入（memory 模式恒 false）。 */
  writable: boolean
}

/** 宿主 `ConfigForm` 的同构最小面（只取本包用到的三个方法）。 */
export interface ConfigFormLike {
  getSnapshot(): ConfigFormSnapshotLike
  subscribe(listener: () => void): () => void
  /** 队列化一次字段写；返回宿主是否接受（拒绝时宿主已自做一次重读）。传输失败会 reject。 */
  set(field: string, value: unknown): Promise<boolean>
}

/** 宿主 `ConfigForms` 服务面的同构最小声明。 */
export interface ConfigFormsLike {
  get(entryId: string): ConfigFormLike
}

/** 本包用到的宿主 context 面（最小结构类型；不 import 任何 dsh-client 包，D3）。 */
export interface ConfigFormsHost {
  configForms: ConfigFormsLike
  logger?: { error(message: string): void; warn(message: string): void }
}

/** 单次写入的结果三态（把「拒绝」与「传输失败」分开，失败文案才能指对修复动作）。 */
type WriteOutcome = 'accepted' | 'refused' | 'failed'

/** 构造参数。 */
export interface AppearancePersistenceOptions {
  /** 显式上报通道（不静默吞）。缺省走 `host.logger.error`。 */
  report?: (message: string) => void
}

/**
 * 配色 id 的持久通道。
 *
 * 会话内权威 = `current`（**不是**持久值）：用户点选后立即生效，写入失败也不回退当前会话的
 * 呈现（D2「持久写入失败的处理」：当前会话内配色照常生效，同时显式记录一条错误；重载页面后
 * 回到持久值或默认色）。初值 = 构造时镜像里读到的持久值；镜像尚未答（`loading`）时是包默认色
 * 玄——首帧由 Node 半场注入的样式已经是玄，二者一致，不会跳色（V1 第 ④ 步）。
 *
 * 镜像答到达时的采纳规则（`adoptedPersisted`）：只在**用户还没有在本会话做过任何选择**时把
 * 持久值接进来。用户点过之后镜像才答（或另一窗口改了持久值），不得用旧持久值覆盖用户刚选的
 * 色——会话内意图优先于存储层事实，这是「界面不会因为存储问题而不变」的同一原则。
 */
export class AppearancePersistence {
  private readonly form: ConfigFormLike
  private readonly report: (message: string) => void
  private readonly listeners = new Set<() => void>()
  private unsubscribe: (() => void) | undefined
  private current: ThemeId
  /** 是否已把「会话内的最终取值」定下来（持久值首达被采纳，或用户已点选）。 */
  private adoptedPersisted = false
  /** 最近一次传输异常的消息（失败文案里带上，便于区分「被拒」与「链路断」）。 */
  private transportError: string | undefined
  private disposed = false

  constructor(host: ConfigFormsHost, options: AppearancePersistenceOptions = {}) {
    this.form = host.configForms.get(PLUGIN_ENTRY_ID)
    this.report = options.report ?? ((message) => { host.logger?.error(message) })
    this.current = this.readPersisted()
    // 镜像每次换快照都过一遍采纳判定；订阅的反注册器由 dispose 收尾（form 本体归
    // ConfigForms 服务所有——它是跨插件共享的，本包不 dispose 它）。
    this.unsubscribe = this.form.subscribe(() => { this.onSnapshot() })
  }

  /** 当前生效的配色 id（会话内权威）。 */
  getThemeId(): ThemeId {
    return this.current
  }

  /** 订阅配色变化（外观行 swatch 选中态 + apply.ts 的换层都走这一条通道）。 */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * 用户点选配色：先换会话内取值（UI 立即跟随），再写插件 Config。
   *
   * 写入失败不回退当前会话、也不向上抛（外观行的 `selectThemeId` 契约是 `=> void`）——
   * 失败经 {@link report} 显式上报，重载后回到持久值或默认色（D2）。
   *
   * @returns 宿主是否接受了这次持久写入（false = 已显式上报）。
   */
  async select(id: ThemeId): Promise<boolean> {
    if (this.disposed) return false
    this.adoptedPersisted = true
    if (id !== this.current) {
      this.current = id
      this.notify()
    }
    return this.save(id)
  }

  /** 反注册镜像订阅（fiber 卸载时由 apply.ts 的 effect 调用；幂等）。 */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.listeners.clear()
    this.unsubscribe?.()
    this.unsubscribe = undefined
  }

  /** 从当前快照读持久值；任何非合法值（含缺省 / 类型不符 / 已注销 id）回落包默认色。 */
  private readPersisted(): ThemeId {
    const snapshot = this.form.getSnapshot()
    if (snapshot.status !== 'ready') return coerceThemeId(undefined)
    return coerceThemeId(snapshot.value?.appearance)
  }

  /** 镜像换快照：首答时把持久值接进来（用户尚未在本会话选过色的前提下）。 */
  private onSnapshot(): void {
    if (this.disposed || this.adoptedPersisted) return
    if (this.form.getSnapshot().status !== 'ready') return
    this.adoptedPersisted = true
    const persisted = this.readPersisted()
    if (persisted === this.current) return
    this.current = persisted
    this.notify()
  }

  /**
   * 写插件 Config：一次失败按设计「重读一次再试」，连续失败显式上报。
   *
   * 为什么还要在本层重试：宿主在拒绝时已自做一次重读（`ConfigFormController.recover` →
   * `mirror.load()`），但那一次重读的产物只进镜像，**不重放这次写入**——revision 冲突的语义是
   * 「你读的那个栅栏过期了」，必须有人用新栅栏再发一次。本层就是那个人：第二次 attempt 取的是
   * 重读后的最新 revision，因此不是盲重试。
   */
  private async save(id: ThemeId): Promise<boolean> {
    const first = await this.attempt(id)
    if (first === 'accepted') return true

    const second = await this.attempt(id)
    if (second === 'accepted') return true

    this.report(this.failureMessage(id, second))
    return false
  }

  /** 单次写入；传输异常收敛成 `failed`（不外抛，UI 不因存储故障中断）。 */
  private async attempt(id: ThemeId): Promise<WriteOutcome> {
    try {
      const accepted = await this.form.set(APPEARANCE_FIELD, id)
      return accepted ? 'accepted' : 'refused'
    } catch (error) {
      this.transportError = error instanceof Error ? error.message : String(error)
      return 'failed'
    }
  }

  /**
   * 失败文案：四段式（本包 + 命名空间与字段 + 事实 + 出路）。
   *
   * `unavailable` 单独一条措辞：那意味着命名空间根本没被服务——Host 半场没有导出带 volatile
   * `appearance` 字段的 `Config`，或该 profile 行没激活。这是本包装载/声明问题，不是写入冲突，
   * 指错修复动作会让人去查 revision。
   */
  private failureMessage(id: ThemeId, outcome: WriteOutcome): string {
    const snapshot = this.form.getSnapshot()
    const where = `插件 Config（命名空间 ${PLUGIN_ENTRY_ID}，字段 ${APPEARANCE_FIELD}，值 ${id}）`
    const facts = `快照 status=${snapshot.status} writable=${String(snapshot.writable)}`
      + ` revision=${String(snapshot.revision)}`
      + (outcome === 'failed' && this.transportError !== undefined ? ` 传输错误=${this.transportError}` : '')
    if (snapshot.status === 'unavailable') {
      return `配色选择未能写入${where}：该命名空间当前未被宿主服务（${facts}）。`
        + '请确认本包 profile 行已激活，且 Node 半场导出的 Config 含 volatile 的 appearance 字段；'
        + '本次会话仍按所选配色呈现，重载页面后回到默认色（玄）。'
    }
    return `配色选择未能写入${where}（重读一次后重试仍被拒绝，${facts}）。`
      + '本次会话仍按所选配色呈现；重载页面后会回到上次成功保存的配色。'
  }

  /** 通知全部订阅者（外观行选中态 + apply.ts 换层）。 */
  private notify(): void {
    for (const listener of [...this.listeners]) listener()
  }
}
