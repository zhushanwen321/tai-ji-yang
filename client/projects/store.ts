/**
 * client/projects/store.ts —— ProjectStore：项目分组（Project）数据的会话内权威 + 插件 Config
 * 持久通道（设计 §1 概念模型 / §2.1 数据与持久层）。
 *
 * Project 是纯插件侧的逻辑分组实体，与 DSH 工作区正交；数据存本插件 Config 的两个 volatile
 * 字段（`projects` / `assignments`，Host 半场 index.js 声明），跨重启跨设备持久，卸载随 profile
 * 行一并消失。通道与 client/persist.ts（配色）完全同构：读 = `form.getSnapshot()`（镜像视图），
 * 写 = `form.set(field, value)`（整字段写，经 `ctx.remote.settings.mutate` 带 revision 栅栏）。
 * 本文件逐条复刻 persist.ts 的既有模式（快照三态、写入重试一次、失败四段式上报、
 * subscribe/dispose 生命周期），不另起炉灶。
 *
 * 两个与配色域不同的取舍（理由逐条登记）：
 *   · **外部快照始终采纳覆盖内存值**（persist.ts 是「用户点过就不再采纳」）：配色是单值、
 *     单会话内基本只有本窗口在写；项目列表与归属映射是多字段、可能被另一窗口编辑的数据，
 *     把外部事实收编进来才是正确收敛方向。唯一例外 = 本会话有未完成的写入在途（inFlight
 *     序号 > 0）：在途期间到达的镜像通知既可能是被拒后重读出的「写前旧值」（采纳 = 回滚，
 *     违反下条），也可能是自己写入的回声（采纳无害但多余），一律跳过；恰好在途到达的
 *     外部变更由下一次镜像通知补采纳——用通知驱动的最终一致，不引入 revision 对账。
 *   · **乐观更新不回滚**：每个变更动作 = 本地立即应用 + notify 订阅者 + 持久化。持久化失败
 *     不回滚内存值（与 persist.ts「会话内意图优先」同一哲学：会话内权威是内存 state，
 *     重载页面后才回到上次成功保存的数据），失败经 report 通道显式上报。
 *
 * 整写整读纪律（设计 §2.1）：数组 / dict 字段不做深层路径写，任何变更 = 内存改完整数组或
 * 完整映射 → `form.set(field, next)` 整字段写回。
 *
 * 悬空映射（assignments 指向已删项目）**不做清理**：派生层把它视为未映射（会话落默认项目，
 * 设计 §3），无危害；只在 deleteProject 时剔除指向该项目的映射，历史残留（外部手改 / 删项目
 * 半程失败）惰性容忍。
 */
import { PLUGIN_ENTRY_ID, type AppearanceSection, type ConfigFormLike, type ConfigFormsHost } from '../persist'

/** 默认项目 id：固定空串（taiji 同款 nameless 判据——空 id = 未归类兜底聚合，不可重命名不可删除）。 */
export const DEFAULT_PROJECT_ID = ''

/** 项目实体：id 在本包 Config 内唯一；name 为用户可见名（非空）。 */
export interface TaijiProject {
  id: string
  name: string
}

/** 会话内权威状态：projects 数组序即自定义序；assignments = SessionId → projectId（缺键 = 未映射）。 */
export interface ProjectsState {
  projects: TaijiProject[]
  assignments: Record<string, string>
}

/**
 * 对外契约（M2 浏览器组件按此消费）。`getState` 返回内部 state 的同一引用（变更时整体替换），
 * 调用方不得改写——`useSyncExternalStore` 依赖「值不变则引用不变」。
 */
export interface ProjectStoreLike {
  /** 当前会话内权威状态（引用稳定：未变更时多次调用返回同一对象）。 */
  getState(): ProjectsState
  /** 订阅状态变化（本地变更、外部采纳、错误出现/清除都经这一条通道通知）。 */
  subscribe(listener: () => void): () => void
  /** 新建项目（追加到数组尾）。空名返回 null 且不产生任何写；持久化失败仍返回已建项目（乐观语义）。 */
  createProject(name: string): Promise<TaijiProject | null>
  /** 重命名。默认项目（id=''）/ 未知 id / 空名返回 false；同名幂等返回 true 且不写。 */
  renameProject(id: string, name: string): Promise<boolean>
  /** 删除项目并剔除指向它的全部映射（会话归回默认项目 = 删映射键）。两字段顺序两次写。 */
  deleteProject(id: string): Promise<boolean>
  /** 把 draggedId 移到 targetId 之前；targetId='' 移到末尾（默认项目恒在末位）。无位移时不写。 */
  reorderProjects(draggedId: string, targetId: string): Promise<boolean>
  /** 会话归属：projectId='' 归回默认项目（删映射键）；值未变时幂等不写。未知项目 id 拒绝。 */
  assignSession(sessionId: string, projectId: string): Promise<boolean>
  /** 反注册镜像订阅与全部监听（幂等；form 本体归 ConfigForms 服务所有，不 dispose 它）。 */
  dispose(): void
}

/**
 * 插件 Config 里本包那一段的**项目域宽形态**（在本文件声明，不改 persist.ts 的窄视图）：
 * AppearanceSection 只声明了配色半边，宿主真身的 section 是整段（含 projects/assignments）。
 * 两字段按 unknown 读入、经 sanitize 收敛——防手改 patch YAML 绕过 schema 校验炸装载。
 */
interface ProjectsSection extends AppearanceSection {
  projects?: unknown
  assignments?: unknown
}

/** 镜像就绪度（ProjectStoreLike 契约之外的加法成员：设置页「读取中」微文案与 M2 加载态的数据源）。 */
export type ProjectStoreStatus = 'loading' | 'ready' | 'unavailable'

/** 单次写入的结果三态（与 persist.ts 同款：把「拒绝」与「传输失败」分开，失败文案才能指对修复动作）。 */
type WriteOutcome = 'accepted' | 'refused' | 'failed'

/** 本 store 持久化的两个字段名（Config 声明见 index.js）。 */
type ProjectsField = 'projects' | 'assignments'

/** sanitize：过滤非对象条目、无 id / 无 name / 空 id（'' 是默认项目保留字）/ 重复 id 的条目。 */
function sanitizeProjects(raw: unknown): TaijiProject[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: TaijiProject[] = []
  for (const item of raw) {
    if (item === null || typeof item !== 'object') continue
    const { id, name } = item as Record<string, unknown>
    if (typeof id !== 'string' || id === '' || typeof name !== 'string' || name.trim() === '') continue
    if (seen.has(id)) continue
    seen.add(id)
    out.push({ id, name })
  }
  return out
}

/** sanitize：只保留 string → string 的映射项（悬空值不清理——派生层视为未映射，见文件头）。 */
function sanitizeAssignments(raw: unknown): Record<string, string> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, string> = {}
  for (const [sessionId, projectId] of Object.entries(raw)) {
    if (typeof projectId !== 'string') continue
    out[sessionId] = projectId
  }
  return out
}

/** 逐项对比（序敏感）：外部快照与内存值是否已经一致，一致则不覆盖不通知。 */
function sameProjects(left: readonly TaijiProject[], right: readonly TaijiProject[]): boolean {
  return left.length === right.length
    && left.every((project, index) => project.id === right[index]?.id && project.name === right[index]?.name)
}

/** 逐键对比值：assignments 的等值判定（键集相同且每键值相同）。 */
function sameAssignments(left: Record<string, string>, right: Record<string, string>): boolean {
  const leftKeys = Object.keys(left)
  if (leftKeys.length !== Object.keys(right).length) return false
  return leftKeys.every((key) => left[key] === right[key])
}

/**
 * 项目域的持久通道与会话内权威。
 *
 * 生命周期由装配方（apply.ts / M2 接线）持有：构造时读一次镜像初值并订阅镜像变化，
 * dispose 反注册（幂等）。
 */
export class ProjectStore implements ProjectStoreLike {
  private readonly form: ConfigFormLike
  private readonly report: (message: string) => void
  private readonly listeners = new Set<() => void>()
  private unsubscribe: (() => void) | undefined
  private state: ProjectsState = { projects: [], assignments: {} }
  private status: ProjectStoreStatus = 'loading'
  /** 在途写入计数（序号防护）：> 0 时镜像通知不采纳外部值，防写前旧值覆盖 / 回声抖动。 */
  private inFlight = 0
  /** 最近一次持久化失败的上报文案（undefined = 无未消错误）；成功写入时清除并通知。 */
  private lastError: string | undefined
  /** 最近一次传输异常的消息（失败文案里带上，区分「被拒」与「链路断」）。 */
  private transportError: string | undefined
  private disposed = false

  constructor(host: ConfigFormsHost, options: { report?: (message: string) => void } = {}) {
    this.form = host.configForms.get(PLUGIN_ENTRY_ID)
    this.report = options.report ?? ((message) => { host.logger?.error(message) })
    this.applySnapshot()
    this.unsubscribe = this.form.subscribe(() => { this.onSnapshot() })
  }

  /** @see {@link ProjectStoreLike.getState} */
  getState(): ProjectsState {
    return this.state
  }

  /** 镜像就绪度（ProjectStoreLike 之外的加法成员）：「读取中」微文案的数据源。 */
  getStatus(): ProjectStoreStatus {
    return this.status
  }

  /** 最近一次持久化失败的上报文案（加法成员）：设置页错误行的数据源，随 subscribe 通知刷新。 */
  getLastError(): string | undefined {
    return this.lastError
  }

  /** @see {@link ProjectStoreLike.subscribe} */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** @see {@link ProjectStoreLike.createProject} */
  async createProject(name: string): Promise<TaijiProject | null> {
    if (this.disposed) return null
    const trimmed = name.trim()
    if (trimmed === '') return null
    const project: TaijiProject = { id: this.freshId(), name: trimmed }
    const projects = [...this.state.projects, project]
    this.setState({ projects, assignments: this.state.assignments })
    await this.persist('projects', projects)
    return project
  }

  /** @see {@link ProjectStoreLike.renameProject} */
  async renameProject(id: string, name: string): Promise<boolean> {
    if (this.disposed) return false
    if (id === DEFAULT_PROJECT_ID) return false
    const trimmed = name.trim()
    if (trimmed === '') return false
    const current = this.state.projects.find((project) => project.id === id)
    if (current === undefined) return false
    if (current.name === trimmed) return true
    const projects = this.state.projects.map((project) => (project.id === id ? { ...project, name: trimmed } : project))
    this.setState({ projects, assignments: this.state.assignments })
    return this.persist('projects', projects)
  }

  /** @see {@link ProjectStoreLike.deleteProject} */
  async deleteProject(id: string): Promise<boolean> {
    if (this.disposed) return false
    if (id === DEFAULT_PROJECT_ID) return false
    if (!this.state.projects.some((project) => project.id === id)) return false
    const projects = this.state.projects.filter((project) => project.id !== id)
    // 剔除指向该项目的全部映射：删键 = 归回默认项目（'' 即「未映射」，不写占位值）。
    const assignments: Record<string, string> = {}
    for (const [sessionId, projectId] of Object.entries(this.state.assignments)) {
      if (projectId !== id) assignments[sessionId] = projectId
    }
    this.setState({ projects, assignments })
    // 两字段顺序两次写（整写整读纪律下无跨字段事务）：projects 先删、assignments 后清。
    // 任一半程失败的残留形态都无害——assignments 残留悬空映射时派生层视为未映射（设计 §3）。
    const projectsOk = await this.persist('projects', projects)
    const assignmentsOk = await this.persist('assignments', assignments)
    return projectsOk && assignmentsOk
  }

  /** @see {@link ProjectStoreLike.reorderProjects} */
  async reorderProjects(draggedId: string, targetId: string): Promise<boolean> {
    if (this.disposed) return false
    const { projects } = this.state
    const from = projects.findIndex((project) => project.id === draggedId)
    if (from < 0) return false
    // target '' = 移到末尾：默认项目恒在派生层末位，「移到默认项目之前」= 追加到数组尾。
    const target = targetId === DEFAULT_PROJECT_ID
      ? projects.length
      : projects.findIndex((project) => project.id === targetId)
    if (target < 0) return false
    // 原位（from===target）与前一位（from===target-1）都无位移：幂等返回，不产生写。
    if (from === target || from === target - 1) return true
    const moved = projects[from]
    if (moved === undefined) return false
    const next = projects.filter((_, index) => index !== from)
    // target 在 dragged 之后时，移除 dragged 会使 target 前移一位，插入点随之减一。
    next.splice(target > from ? target - 1 : target, 0, moved)
    this.setState({ projects: next, assignments: this.state.assignments })
    return this.persist('projects', next)
  }

  /** @see {@link ProjectStoreLike.assignSession} */
  async assignSession(sessionId: string, projectId: string): Promise<boolean> {
    if (this.disposed) return false
    if (sessionId === '') return false
    // 只接受已存在的目标项目：经 API 写悬空映射没有意义（派生层会当未映射）；'' 是唯一例外
    //（归回默认项目 = 删映射键）。悬空映射只能来自外部手改或 deleteProject 半程失败，惰性容忍。
    if (projectId !== DEFAULT_PROJECT_ID && !this.state.projects.some((project) => project.id === projectId)) {
      return false
    }
    const current = this.state.assignments[sessionId]
    // 幂等：值未变（含「本就未映射又归默认」）不产生写。
    if (current === projectId || (projectId === DEFAULT_PROJECT_ID && current === undefined)) return true
    const assignments = { ...this.state.assignments }
    if (projectId === DEFAULT_PROJECT_ID) delete assignments[sessionId]
    else assignments[sessionId] = projectId
    this.setState({ projects: this.state.projects, assignments })
    return this.persist('assignments', assignments)
  }

  /** @see {@link ProjectStoreLike.dispose} */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.listeners.clear()
    this.unsubscribe?.()
    this.unsubscribe = undefined
  }

  /** 生成 8 字符随机 id；与现有 id 撞车则重摇（判重只是几次比较，确定性优于概率祈祷）。 */
  private freshId(): string {
    let id = crypto.randomUUID().slice(0, 8)
    while (this.state.projects.some((project) => project.id === id)) {
      id = crypto.randomUUID().slice(0, 8)
    }
    return id
  }

  /** 整体替换会话内权威并通知（notify 前先替换，订阅者回调里读到的即是新值）。 */
  private setState(next: ProjectsState): void {
    this.state = next
    this.notify()
  }

  /** 镜像换快照：无在途写入时采纳外部事实（见文件头「外部快照始终采纳」取舍）。 */
  private onSnapshot(): void {
    if (this.disposed || this.inFlight > 0) return
    this.applySnapshot()
  }

  /**
   * 把当前镜像快照收敛进内存：status 跟随快照；ready 时 sanitize 后采纳为内存 state（与内存
   * 值一致则不动引用不通知）。loading 不动（镜像未答）；unavailable 只更新 status，不动
   * state——命名空间未被服务（行未激活 / Host 未导出 Config）时会话内数据保持权威，写入走
   * 两段重试后显式上报（与 persist.ts「会话内意图优先」同哲学）。
   */
  private applySnapshot(): void {
    const snapshot = this.form.getSnapshot()
    if (snapshot.status === 'loading') return
    const statusChanged = this.status !== snapshot.status
    this.status = snapshot.status
    if (snapshot.status !== 'ready') {
      if (statusChanged) this.notify()
      return
    }
    const section = snapshot.value as ProjectsSection | undefined
    const next: ProjectsState = {
      projects: sanitizeProjects(section?.projects),
      assignments: sanitizeAssignments(section?.assignments),
    }
    const stateChanged = !sameProjects(next.projects, this.state.projects)
      || !sameAssignments(next.assignments, this.state.assignments)
    this.state = next
    if (statusChanged || stateChanged) this.notify()
  }

  /**
   * 整字段写：一次失败按 persist.ts 同款「重读一次再试」，连续失败显式上报。
   *
   * 第二次 attempt 不是盲重试：宿主在拒绝时已自做一次重读（`ConfigFormController.recover`
   * → `mirror.load()`），第二次取的是重读后的最新 revision——revision 冲突的语义是「你读的
   * 那个栅栏过期了」，必须有人用新栅栏再发一次，本层就是那个人。
   */
  private async persist(field: ProjectsField, value: TaijiProject[] | Record<string, string>): Promise<boolean> {
    this.inFlight += 1
    try {
      const first = await this.attempt(field, value)
      if (first === 'accepted') {
        this.clearError()
        return true
      }
      const second = await this.attempt(field, value)
      if (second === 'accepted') {
        this.clearError()
        return true
      }
      this.lastError = this.failureMessage(field, second)
      this.report(this.lastError)
      this.notify()
      return false
    } finally {
      this.inFlight -= 1
    }
  }

  /** 单次写入；传输异常收敛成 `failed`（不外抛——UI 不因存储故障中断，失败经上报通道）。 */
  private async attempt(field: ProjectsField, value: TaijiProject[] | Record<string, string>): Promise<WriteOutcome> {
    try {
      const accepted = await this.form.set(field, value)
      return accepted ? 'accepted' : 'refused'
    } catch (error) {
      this.transportError = error instanceof Error ? error.message : String(error)
      return 'failed'
    }
  }

  /** 成功写入清除未消错误（错误行随订阅通道消失）；清除本身也通知。 */
  private clearError(): void {
    if (this.lastError === undefined) return
    this.lastError = undefined
    this.notify()
  }

  /**
   * 失败文案：四段式（本包 + 命名空间与字段 + 事实 + 出路），与 persist.ts 同构。
   *
   * `unavailable` 单独一条措辞：那意味着命名空间根本没被服务——Host 半场没有导出带 volatile
   * 字段的 `Config`，或该 profile 行没激活。这是本包装载/声明问题，不是写入冲突，指错修复
   * 动作会让人去查 revision。
   */
  private failureMessage(field: ProjectsField, outcome: WriteOutcome): string {
    const snapshot = this.form.getSnapshot()
    const where = `插件 Config（命名空间 ${PLUGIN_ENTRY_ID}，字段 ${field}）`
    const facts = `快照 status=${snapshot.status} writable=${String(snapshot.writable)}`
      + ` revision=${String(snapshot.revision)}`
      + (outcome === 'failed' && this.transportError !== undefined ? ` 传输错误=${this.transportError}` : '')
    if (snapshot.status === 'unavailable') {
      return `项目变更未能写入${where}：该命名空间当前未被宿主服务（${facts}）。`
        + '请确认本包 profile 行已激活，且 Node 半场导出的 Config 含 volatile 的 projects/assignments 字段；'
        + '本次会话内变更仍然生效，重载页面后回到上次成功保存的数据。'
    }
    return `项目变更未能写入${where}（重读一次后重试仍被拒绝，${facts}）。`
      + '本次会话内变更仍然生效；重载页面后会回到上次成功保存的数据。'
  }

  /** 通知全部订阅者（拷贝快照后遍历：回调内退订不影响本轮通知）。 */
  private notify(): void {
    for (const listener of [...this.listeners]) listener()
  }
}
