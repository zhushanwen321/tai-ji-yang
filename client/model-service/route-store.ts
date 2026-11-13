/**
 * client/model-service/route-store.ts —— 路由表与白名单的会话内权威（dsh-model-service
 * SC8/SC9，M2）。
 *
 * 数据流（SC9）：真相 = 插件 Config 的 volatile 字段 `routes` / `whitelist`（index.js 声明，
 * AX3 唯一权威）；本 store 是浏览器半场的派生视图——读 Config 快照（ConfigFormLike 三态）
 * + 订阅刷新，写 = 乐观更新（内存先改 + notify）→ form.set 整字段写回 → 失败重读（宿主
 * 拒绝或传输失败时以 Config 真值为准，UI 回落并显式上报）。
 *
 * 回放守卫族（revision 倒退栅栏 / 内容级回放守卫 / 收敛防抖 / 递归防护 / 宽限锚与补探）
 * 内聚在 RouteWriteAuthority（route-write-authority.ts，显式状态机，MF-1-3）；本类只做
 * IO 编排——RPC 读写、notify、定时器接线与守卫裁决结果的消费。
 *
 * 派生面（打开分区时可观察）：
 *   · 悬挂白名单条目（D1：whitelist id 在 routes 不存在 →「路由已删除」标注 + 单条移除与
 *     批量清理动作，清理只移除悬挂条目）；
 *   · 注册未生效探测（V7 步骤 6 / ROUTE_REGISTRATION_FAILED 状态条）：路由存在但宿主注册
 *     表（llm.listProviders）无对应 taiji-route-<id> 条目——无论失败原因是注册冲突还是
 *     replace 被拒，列表探测对「路由已配置但虚拟模型未生效」统一呈现降级状态与恢复指引
 *     （Node 半场的原始错误在宿主日志，D4 降级语义）；
 *   · 成员可用性标注（G18）：供应商已删 / 模型不在清单 / 凭据缺失（读 llm-pi-ai 快照 +
 *     credentials.describe；目录默认态 models[] 空时模型清单不可本地判定，不标注模型缺失）；
 *   · 「当前命中」预览（D5/G18：route-evaluate 纯函数，打开视图时算一次——与 Node 半场
 *     求值同源，同一纯函数复用）。
 *
 * 成员供应商下拉的口径（路由交互定稿 A4）：宿主设置文档 providers 快照中**已存在**的条目
 * （含自定义 route；displayName 目录名回落）——未接入的目录 route 不可选（与供应商视图的
 * 清单口径反转同源：路由成员只能引用已接入的供应商）。
 *
 * 路由 id 派生（AX11/D5/V5 步骤 2）：deriveRouteId 与当前 routes 及白名单现有条目（含悬挂）
 * 查重，冲突加序号（-2、-3…）——同名路由二次创建不被拒，派生 id 区分；悬挂条目靠 id 保持
 * 身份，拒绝改名会破坏悬挂态不复活的机制，所以这里是加序号而不是拒绝。
 */
import { deriveProviderKey } from './provider-key'
import { REGISTRATION_ERROR_FIELD, ROUTES_FIELD, WHITELIST_FIELD } from './config-fields'
import {
  ROUTE_PROVIDER_PREFIX,
  evaluateRoutesAt,
  sanitizeRoutes,
  sanitizeWhitelist,
  type RouteEntry,
  type RouteMember,
} from './route-evaluate'
import { readLlmPiAi, unwrapRemote, type ModelServiceHost } from './settings-client'
import type { PluginConfigFormLike } from './credentials-client'
import { RouteWriteAuthority } from './route-write-authority'
import type { ModelServiceLocaleKey } from '../locale'

/** 成员可用性标注（G18 三型；providerMissing = 供应商已删）。 */
export interface MemberAvailability {
  providerMissing: boolean
  modelMissing: boolean
  credentialMissing: boolean
  /** 成员凭据 ref（credentialMissing 的文案参数）。 */
  ref: string | undefined
}

/** 可选成员的 provider 行（成员选择器数据；providers 快照已接入条目，排除插件自身前缀）。 */
export interface SelectableProvider {
  key: string
  name: string
  /** models[] 清单（目录默认态为空数组——模型 id 无法本地枚举，选择器允许手输）。 */
  models: { id: string; name: string }[]
}

/** 路由视图快照（引用稳定；status 语义 = ConfigFormLike 三态映射）。 */
export interface RoutesSnapshot {
  status: 'loading' | 'ready' | 'unavailable'
  routes: RouteEntry[]
  whitelist: string[]
  /** 悬挂白名单条目（whitelist 中不在 routes 的 id，D1）。 */
  hanging: string[]
  /** 注册未生效的路由 id（期望 taiji-route-<id> 不在宿主注册表——V7 状态条）。 */
  registrationFailed: string[]
  /** 注册失败诊断（Node 半场 ensureRouteRegistration 透传的原始拒绝原因；undefined = 无失败或旧 profile 无此字段）。 */
  registrationError: { routeIds: string[]; origin: string; detail: string } | undefined
  /** 「当前命中」预览（routeId → 命中成员 | undefined；打开视图时算一次）。 */
  hits: Map<string, RouteMember | undefined>
  /** 成员可用性标注（键 = `${provider}/${model}`；G18）。 */
  memberAvailability: Map<string, MemberAvailability>
  /**
   * 每路由可用成员数（MF-1-14 下沉的派生谓词：成员的 availability 缺席或三布尔全 false
   * 计可用；空态矩阵「可见路由成员全不可用」的判定源，与徽章判定同源——目录默认态
   * models[] 空不标模型缺失，即计可用）。
   */
  usableMembers: Map<string, number>
  /** 成员选择器的 provider 行（排除 taiji-route-* 与托管行）。 */
  selectableProviders: SelectableProvider[]
  notice: string | undefined
  error: string | undefined
}

/** store 构造依赖。 */
export interface RoutesListModelDeps {
  remote: ModelServiceHost
  configForm: PluginConfigFormLike
  /** 翻译座位（构造器注入，ProvidersListModel 同款先例，MF-1-13）：commit 双败的 notice/error 上报文案。 */
  t: (key: ModelServiceLocaleKey, params?: Record<string, unknown>) => string
}

/**
 * 路由视图模型（纯 TS 可独立单测；ProvidersListModel 同款 subscribe/getSnapshot/notify）。
 */
export class RoutesListModel {
  private readonly deps: RoutesListModelDeps
  private readonly listeners = new Set<() => void>()
  private state: RoutesSnapshot
  /** 回放守卫族状态机（revision 栅栏 / 写入权威 / 收敛防抖 / 宽限锚与补探定时器）。 */
  private readonly authority = new RouteWriteAuthority()
  /** 构造时启动的首读（测试 await model.pending 等待就绪）。 */
  readonly pending: Promise<void>
  private unsubscribe: (() => void) | undefined

  constructor(deps: RoutesListModelDeps) {
    this.deps = deps
    this.state = emptySnapshot()
    this.pending = this.load()
    this.unsubscribe = deps.configForm.subscribe(() => {
      void this.load()
    })
  }

  /** 撤订阅与守卫定时器（分区卸载时调用；Config 订阅不撤会在卸载后空转重读）。 */
  dispose(): void {
    this.unsubscribe?.()
    this.unsubscribe = undefined
    this.authority.dispose()
  }

  getSnapshot(): RoutesSnapshot {
    return this.state
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** 重读 Config + 宿主探测面（llm-pi-ai 快照 / 注册表 / 凭据徽章），派生全量快照。 */
  async load(): Promise<void> {
    const snapshot = this.deps.configForm.getSnapshot()
    if (snapshot.status === 'unavailable') {
      this.authority.transition({ type: 'namespaceClosed' })
      this.state = { ...emptySnapshot(), status: 'unavailable' }
      this.notify()
      return
    }
    if (snapshot.status !== 'ready') {
      // loading 是镜像的瞬时态（命名空间重开走 unavailable → ready）——只清 revision
      // 栅栏（原语义），会话写入权威保留：重开后的 ready 快照若与本会话写入一致照常采纳。
      this.authority.transition({ type: 'namespaceReopening' })
      this.state = { ...emptySnapshot(), status: 'loading' }
      this.notify()
      return
    }
    // 倒退栅栏 + 内容级回放守卫（AF-1-1 及其补强层）整体裁决进状态机：revision 栅栏挡
    // 「revision 倒退」的滞后快照；插件 Config 与 llm-pi-ai 等命名空间共享宿主设置文档的
    // revision 计数，其他命名空间的写入会把计数推进到 ≥ 栅栏，让一份**内容滞后**的镜像
    // 快照蒙混过栅栏——内容级守卫按「会话写入回显 / 覆写前值（滞后回放）/ 外部变更」三态
    // 分流（实测形态：路由改名落盘后被滞后镜像回写成旧值、删路由后被复活）。探测面不
    // 拒收（probeDerived 照跑）：探测读宿主 remote，不依赖这份滞后快照，而 load 是探测面
    // 唯一刷新入口——整段 return 会把成员可用性/注册探测冻结整个镜像滞后窗口。
    const section = typeof snapshot.value === 'object' && snapshot.value !== null
      ? snapshot.value as Record<string, unknown>
      : {}
    const routes = sanitizeRoutes(section[ROUTES_FIELD])
    const whitelist = sanitizeWhitelist(section[WHITELIST_FIELD])
    const verdict = this.authority.screenReadySnapshot({ revision: snapshot.revision, routes, whitelist })
    if (verdict.kind === 'staleReplay') {
      await this.probeDerived(this.state.routes)
      return
    }
    if (verdict.kind === 'staleContent') {
      await this.probeDerived(this.state.routes)
      // 收敛重写走裸 set（不经 attemptCommit 的栅栏计数）：同值重写宿主是否前移 revision
      // 未知，不计数避免栅栏虚高；set 被拒不抛异常（返回 false）、传输异常由调用方 catch
      // ——两种失败都不置位收敛防抖，被拒后的下一次镜像投递能再次尝试收敛（原实现先置位：
      // 被拒后同内容投递跳过收敛，Config 停留旧值、UI 与持久值分歧持续到下次操作）。
      if (verdict.shouldReconcile) {
        const written = this.authority.lastWritten
        if (written !== undefined) {
          let reconciled = true
          try {
            const routesWritten = await this.deps.configForm.set(ROUTES_FIELD, written.routes)
            const whitelistWritten = await this.deps.configForm.set(WHITELIST_FIELD, written.whitelist)
            reconciled = routesWritten && whitelistWritten
          } catch {
            reconciled = false
          }
          await this.authority.settleReconcile(verdict.content, reconciled, () => this.load())
        }
      }
      return
    }
    // echo（自己写入的回显）/ externalChange（权威让位后照常采纳）/ adopt（无权威无条件
    // 采纳）三态都重建 Config 派生面；探测面（availability 空 → 全员按可用计）与视图旧行为
    // 一致——探测未返回前不因标注缺席误判「成员全不可用」。
    const routeIds = new Set(routes.map((route) => route.id))
    this.state = {
      ...emptySnapshot(),
      status: 'ready',
      routes,
      whitelist,
      // 悬挂白名单条目（D1：id 在 routes 不存在——「路由已删除」标注 + 清理动作的判定源）。
      hanging: whitelist.filter((id) => !routeIds.has(id)),
      usableMembers: countUsableMembers(routes, new Map()),
    }
    this.notify()
    await this.probeDerived(routes)
  }

  /** 探测面（异步；失败降级为「不标注」，不阻塞路由配置面——AX6 辅助功能接入点降级）。 */
  private async probeDerived(routes: RouteEntry[]): Promise<void> {
    // remote 方法返回 typert Result 包装，unwrapRemote 解包后失败转 rejection，由 .catch 降级。
    // listProviders 读取失败降级为 undefined（探测不可用）而不是空集——差集判定按空集算会把
    // 全部路由误标注册失败红徽（与 memberAvailability 的「快照不可用时无法判定，不标注」
    // 同口径，两条探测通道降级一致）。llm-pi-ai 快照单读共享（MF-1-10）：探测与凭据标注
    // 消费同一份世代，providers 增删瞬窗内可用性判定与凭据标注不再跨世代。
    const llmPiAiPromise = readLlmPiAi(this.deps.remote.settings).catch(() => undefined)
    const [directory, llmPiAi, registeredProviders, credentials] = await Promise.all([
      this.deps.remote.llm.listConfigurableProviders().then(unwrapRemote).catch(() => []),
      llmPiAiPromise,
      this.deps.remote.llm.listProviders().then(unwrapRemote).catch(() => undefined),
      llmPiAiPromise.then((snapshot) => this.describeCredentials(routes, snapshot))
        .catch(() => new Map<string, { configured: boolean }>()),
    ])
    const registeredRouteProviders = registeredProviders === undefined ? undefined : new Set(
      registeredProviders
        .map((provider) => provider.id)
        .filter((id) => id.startsWith(ROUTE_PROVIDER_PREFIX)),
    )
    // id 占用识别（V7 可构造形态的探测修正）：物理 provider 的 key 可以是 `taiji-route-<id>`
    // 形态（用户自定义 provider key 不拦），此时宿主注册表同样含该 id，但它是物理适配器——
    // 路由适配器注册必然被 DUPLICATE_ADAPTER 拒。这类 id 从「已注册」判定里剔除（判定依据 =
    // llm-pi-ai 快照 providers 段有同名条目；路由适配器不在设置文档里）。反方向（路由先占 id、
    // 后建同名 provider）已被保存预检拦截（checkRouteConflict 拒绝），不会出现双占。
    const squattedIds = new Set(
      llmPiAi !== undefined && llmPiAi.available
        ? Object.keys(llmPiAi.providers).filter((key) => key.startsWith(ROUTE_PROVIDER_PREFIX))
        : [],
    )

    // 注册诊断从 Config 快照现取（probeDerived 不持有 load 的快照引用；getSnapshot 为同步零成本读）。
    // 提前到差集判定之前：诊断是宽限例外的判定源（见下）。
    const formSnapshot = this.deps.configForm.getSnapshot()
    const rawRegistrationError = formSnapshot.status === 'ready' && typeof formSnapshot.value === 'object' && formSnapshot.value !== null
      ? (formSnapshot.value as Record<string, unknown>)[REGISTRATION_ERROR_FIELD]
      : undefined
    const registrationError = parseRegistrationError(rawRegistrationError)

    // 注册失败差集判定：探测不可用（读取失败）不标注；近期写入宽限锚定 routesWrittenAt
    //（仅 routes 写入刷新，MF-2-2，见状态机）——whitelist 写入不重置宽限：白名单不影响
    // 注册集合，注册状态未变的路由不得因无关写入的宽限窗而红徽消失。宽限例外（MF-3-1）：
    // 注册失败诊断在场且涵盖该路由 = Node 半场注册已执行且失败（index.js
    // ensureRouteRegistration 仅在实际失败时写诊断，无暂态误报）——这不是「探测 RPC 先于
    // 注册执行」的暂态差集，宽限不得吞掉确定性失败信号；诊断随事件到达即旁路宽限、红徽
    // 即时呈现（注册失败链亚秒级全部落在宽限窗内，无此例外则窗过期后无事件再触发探测）。
    const recentWriteGrace = this.authority.graceProtectedRouteIds(Date.now())
    // 宽限吞掉的候选失败（差集判定本会标失败、因宽限跳过且诊断例外未命中）：真实宿主
    // 诊断通道（volatile 字段经 settings.mutate）不落盘不可见，注册失败链全部落在宽限
    // 窗内且窗过期后无事件再触发探测——被吞的候选失败必须由定时器补探（状态机的
    // scheduleGraceRecheck），否则红徽永不出现（真机验收 V7 回归）。
    let graceSwallowedFailures = 0
    const registrationFailed = registeredRouteProviders === undefined
      ? []
      : routes
        .map((route) => route.id)
        .filter((id) => {
          const expected = `${ROUTE_PROVIDER_PREFIX}${id}`
          const wouldFail = squattedIds.has(expected) || !registeredRouteProviders.has(expected)
          if (recentWriteGrace?.has(id) && !registrationError?.routeIds.includes(id)) {
            if (wouldFail) graceSwallowedFailures += 1
            return false
          }
          return wouldFail
        })
    if (graceSwallowedFailures > 0) {
      this.authority.scheduleGraceRecheck(() => {
        void this.probeDerived(this.state.routes).catch(() => {})
      })
    }
    // 成员供应商下拉口径（路由交互定稿 A4）：providers 快照里已存在的条目（含自定义 route；
    // 未接入的目录 route 不直出）。displayName 目录名回落（快照条目未写 displayName 时）。
    const selectableProviders =
      llmPiAi !== undefined && llmPiAi.available
        ? Object.entries(llmPiAi.providers)
            .filter(([key]) => !key.startsWith(ROUTE_PROVIDER_PREFIX))
            .map(([key, profile]) => {
              const models = Array.isArray(profile?.models) ? profile.models : []
              const directoryRow = directory.find((row) => row.provider === key)
              return {
                key,
                name: typeof profile?.displayName === 'string' && profile.displayName !== '' ? profile.displayName : directoryRow?.displayName ?? key,
                models: models
                  .filter((model): model is Record<string, unknown> => typeof model === 'object' && model !== null)
                  .map((model) => ({
                    id: typeof model.id === 'string' ? model.id : '',
                    name: typeof model.name === 'string' && model.name !== '' ? model.name : typeof model.id === 'string' ? model.id : '',
                  }))
                  .filter((model) => model.id !== ''),
              }
            })
        : []
    const availability = this.buildMemberAvailability(routes, llmPiAi, credentials)
    this.state = {
      ...this.state,
      registrationFailed,
      registrationError,
      selectableProviders,
      memberAvailability: availability,
      usableMembers: countUsableMembers(routes, availability),
      hits: evaluateRoutesAt(routes, new Date()),
    }
    this.notify()
  }

  /** 批量读成员凭据状态（refs 来自成员 provider 的 apiKeyEnv；llmPiAi 由探测周期透传——
   * 同一探测周期 settings.describe 恰一次，快照单源，MF-1-10）。 */
  private async describeCredentials(
    routes: RouteEntry[],
    llmPiAi: Awaited<ReturnType<typeof readLlmPiAi>> | undefined,
  ): Promise<Map<string, { configured: boolean }>> {
    const refs = new Set<string>()
    for (const route of routes) {
      for (const member of route.members) {
        const ref = memberCredentialRef(llmPiAi, member.provider)
        if (ref !== undefined) refs.add(ref)
      }
    }
    if (refs.size === 0) return new Map()
    const described = await this.deps.remote.credentials.describe([...refs]).then(unwrapRemote)
    const map = new Map<string, { configured: boolean }>()
    for (const [ref, info] of Object.entries(described)) map.set(ref, { configured: info?.configured === true })
    return map
  }

  /** G18 成员可用性标注（供应商已删 / 模型不在清单 / 凭据缺失）。 */
  private buildMemberAvailability(
    routes: RouteEntry[],
    llmPiAi: Awaited<ReturnType<typeof readLlmPiAi>> | undefined,
    credentials: Map<string, { configured: boolean }>,
  ): Map<string, MemberAvailability> {
    const availability = new Map<string, MemberAvailability>()
    const lookup = (provider: string): Record<string, unknown> | undefined => {
      if (llmPiAi === undefined || !llmPiAi.available) return undefined
      const profile = llmPiAi.providers[provider]
      return typeof profile === 'object' && profile !== null ? profile as Record<string, unknown> : undefined
    }
    for (const route of routes) {
      for (const member of route.members) {
        const key = `${member.provider}/${member.model}`
        if (availability.has(key)) continue
        const profile = lookup(member.provider)
        const models = Array.isArray(profile?.models) ? profile.models : []
        const ref = memberCredentialRef(llmPiAi, member.provider)
        const credentialMissing = ref !== undefined && credentials.get(ref)?.configured === false
        availability.set(key, {
          // providers 段缺席 = 供应商已删（快照不可用时无法判定，不标注——探测面降级）。
          providerMissing: llmPiAi !== undefined && llmPiAi.available && profile === undefined,
          // 模型缺失只在自定义清单态可本地判定（models[] 非空且不含该 id）。
          modelMissing: models.length > 0 && !models.some((model) => typeof model === 'object' && model !== null && (model as Record<string, unknown>).id === member.model),
          credentialMissing,
          ref: credentialMissing ? ref : undefined,
        })
      }
    }
    return availability
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener()
  }

  // ── 写动作（乐观更新 + 整字段写回 + 失败重读）─────────────────────────────────────

  /** 新建路由（V5 步骤 2：同名二次创建不被拒——派生 id 查重加序号区分）。 */
  async createRoute(name: string): Promise<RouteEntry> {
    const { routes, whitelist } = this.state
    const id = deriveRouteId(name, routes, whitelist)
    const route: RouteEntry = { id, name: name.trim() !== '' ? name.trim() : id, members: [] }
    await this.writeRoutes([...routes, route])
    return route
  }

  /** 保存路由编辑（整体替换该条；返回是否被宿主接受——调用方给 toast/错误反馈）。
   * 改名走 renameRoute（重派生 id），本通道只动成员与既有 id 下的字段。 */
  async saveRoute(updated: RouteEntry): Promise<boolean> {
    const routes = this.state.routes.map((route) => (route.id === updated.id ? updated : route))
    return await this.writeRoutes(routes)
  }

  /**
   * 改名并重派生 id（路由卡就地改名与注册失败「改名修复」共用通道）：新名 → 新 id
   * （deriveRouteId 查重——其余路由 id 与白名单现存条目（含悬挂）参与占位，旧路由自身与
   * 旧 id 的白名单条目不占位，它们将被替换/迁移）→ routes 段原位替换 + 白名单同步迁移
   * （旧 id → 新 id）→ 两次整字段提交。注册自动重试：routes volatile-update 链路（index.js
   * ensureRouteRegistration）按新 id 集合重新注册，旧 id 的虚拟模型随集合更新停用。
   * 返回更新后的路由（新 id 供视图保持选中）；写入被拒/失败返回 undefined（state 已回落重读）。
   */
  async renameRoute(oldId: string, newName: string): Promise<RouteEntry | undefined> {
    const route = this.state.routes.find((candidate) => candidate.id === oldId)
    if (route === undefined) return undefined
    const name = newName.trim()
    if (name === '') return undefined
    const others = this.state.routes.filter((candidate) => candidate.id !== oldId)
    const whitelistWithoutOld = this.state.whitelist.filter((entry) => entry !== oldId)
    const id = deriveRouteId(name, others, whitelistWithoutOld)
    const updated: RouteEntry = { id, name, members: route.members }
    const routes = this.state.routes.map((candidate) => (candidate.id === oldId ? updated : candidate))
    const whitelist = this.state.whitelist.map((entry) => (entry === oldId ? id : entry))
    // 双字段走 writeRoutesAndWhitelist 原子提交通道（登记齐全：改名前内容与两笔之间的
    // 中间态「routes 旧 + whitelist 新」都登记覆写前值，会话写入值登记终态）——滞后镜像
    // 投递改名前或中间内容均命中回放守卫，改名不被静默回滚。此前裸 commit 绕过登记：
    // 共享 revision 计数被其他命名空间推进时，滞后镜像的改名前内容被当外部变更采纳，
    // route id 弹回旧值；分两笔独立 writeWhitelist/writeRoutes 则暴露中间态（第一笔以旧
    // routes 计算 hanging，新 id 闪现「路由已删除」标注，MF-2-3）。
    // 提交次序先 whitelist 迁移后 routes 替换：两笔独立整字段写无跨字段事务，失败落在第二
    // 笔 routes 侧时旧路由完整在场、白名单多出的新 id 只表现为悬挂条目（用户改名重试即可
    // 收敛）；反向次序的失败落在 whitelist 侧——路由已按新 id 注册、白名单持旧 id，虚拟
    // 模型从对话流消失需手工重勾。
    return await this.writeRoutesAndWhitelist(routes, whitelist) ? updated : undefined
  }

  /**
   * 成员拖拽/键盘排序的数据交换由模块级纯函数 moveMember 承担（见文件尾）；视图把落点/
   * 方向键换算成 (from, to) 后调它，再经 saveRoute 整体落盘。
   */

  /** 删除路由（白名单条目转悬挂保留——D1 不自动清理，界面给标注与清理动作）。 */
  async deleteRoute(id: string): Promise<void> {
    await this.writeRoutes(this.state.routes.filter((route) => route.id !== id))
  }

  /** 白名单勾选/取消（D1：勾选即暴露、取消即从选择器消失）。返回是否被宿主接受。 */
  async toggleWhitelist(id: string): Promise<boolean> {
    const next = this.state.whitelist.includes(id)
      ? this.state.whitelist.filter((entry) => entry !== id)
      : [...this.state.whitelist, id]
    return await this.writeWhitelist(next)
  }

  /** 单条移除悬挂条目（只动悬挂条目；有效条目不触碰——V6 步骤 5）。 */
  async removeWhitelistEntry(id: string): Promise<void> {
    if (this.state.routes.some((route) => route.id === id)) return // 非悬挂条目不移动作
    await this.writeWhitelist(this.state.whitelist.filter((entry) => entry !== id))
  }

  /** 批量清理失效条目（V6 步骤 5：只移除悬挂条目）。 */
  async cleanupHanging(): Promise<void> {
    const alive = new Set(this.state.routes.map((route) => route.id))
    await this.writeWhitelist(this.state.whitelist.filter((entry) => alive.has(entry)))
  }

  /** routes 整字段写回：状态机登记覆写前值 + 会话写入值（宽限锚刷新）+ 乐观更新（悬挂与
   * 可用成员计数即时重算——删路由后 hanging 无需等镜像回读即可渲染，V6 步骤 4 的可观察事实）。 */
  private async writeRoutes(routes: RouteEntry[]): Promise<boolean> {
    this.authority.transition({
      type: 'beginWrite',
      routes,
      whitelist: this.state.whitelist,
      overwrites: [{ routes: this.state.routes, whitelist: this.state.whitelist }],
      touchesRoutes: true,
    })
    this.state = {
      ...this.state,
      routes,
      hanging: computeHanging(routes, this.state.whitelist),
      usableMembers: countUsableMembers(routes, this.state.memberAvailability),
    }
    this.notify()
    return await this.commit(ROUTES_FIELD, routes)
  }

  /** whitelist 整字段写回（同 writeRoutes；touchesRoutes=false——whitelist 写入不属于
   * 注册宽限的锚定事件，宽限锚沿用前值，MF-2-2 见状态机）。 */
  private async writeWhitelist(whitelist: string[]): Promise<boolean> {
    this.authority.transition({
      type: 'beginWrite',
      routes: this.state.routes,
      whitelist,
      overwrites: [{ routes: this.state.routes, whitelist: this.state.whitelist }],
      touchesRoutes: false,
    })
    this.state = { ...this.state, whitelist, hanging: computeHanging(this.state.routes, whitelist) }
    this.notify()
    return await this.commit(WHITELIST_FIELD, whitelist)
  }

  /**
   * routes + whitelist 双字段原子乐观提交（renameRoute 专用，MF-2-3）：一次登记 + 一次
   * 终态 notify + 两笔整字段 commit（次序先 whitelist 迁移后 routes 替换，失败语义与
   * renameRoute 注释一致）。终态一次 notify 消除两笔之间的中间态可见性：分两笔各自
   * 乐观更新时，第一笔以旧 routes 计算 hanging 会让新 id 闪现「路由已删除」标注（真实
   * 宿主两笔 IPC 往返几十至几百毫秒，React 订阅照常渲染中间态）。两笔各自的覆写前值
   * （改名前内容、第一笔落盘后的「routes 旧 + whitelist 新」中间态）都进 preImages——
   * 滞后镜像投递两者均命中回放守卫（与两笔独立提交通道的登记契约一致）。
   */
  private async writeRoutesAndWhitelist(routes: RouteEntry[], whitelist: string[]): Promise<boolean> {
    this.authority.transition({
      type: 'beginWrite',
      routes,
      whitelist,
      overwrites: [
        { routes: this.state.routes, whitelist: this.state.whitelist },
        { routes: this.state.routes, whitelist },
      ],
      touchesRoutes: true,
    })
    this.state = {
      ...this.state,
      routes,
      whitelist,
      hanging: computeHanging(routes, whitelist),
      usableMembers: countUsableMembers(routes, this.state.memberAvailability),
    }
    this.notify()
    const whitelistAccepted = await this.commit(WHITELIST_FIELD, whitelist)
    if (!whitelistAccepted) return false
    return await this.commit(ROUTES_FIELD, routes)
  }

  /** 单次写尝试（persist.ts attempt 同构）：accepted = 宿主接受；refused = revision 栅栏拒绝；
   * failed = 传输异常（detail 为错误消息）。accepted 时前移栅栏（原 commit 内注释语义不变：
   * 栅栏挡掉 commit 后重读里的滞后回放，AF-1-1 弹回主径）。 */
  private async attemptCommit(field: string, value: unknown): Promise<{ kind: 'accepted' } | { kind: 'refused' } | { kind: 'failed'; detail: string }> {
    try {
      const accepted = await this.deps.configForm.set(field, value)
      if (accepted) {
        this.authority.transition({ type: 'writeAccepted' })
        return { kind: 'accepted' }
      }
      return { kind: 'refused' }
    } catch (error) {
      return { kind: 'failed', detail: error instanceof Error ? error.message : String(error) }
    }
  }

  /**
   * 整字段提交（ConfigFormLike.set；失败重读 = 以 Config 真值为准 + notice/error 上报）。
   * 返回是否被宿主接受（路由卡即时保存的 toast 分支依据）。
   *
   * 一次失败按设计「重读一次再试」（persist.ts save 同款）：写插件 Config 走宿主 settings
   * mutate 带 revision 栅栏，宿主拒绝冲突时已自做一次镜像重读（ConfigFormController.recover），
   * 但被拒写入**不重放**——路由卡的即时保存节奏（成员增删 200ms 级连发）必然产生携带过期
   * 栅栏的 set，首次被拒后必须有人拿重读出的新栅栏把同值重发一次，否则成员增量静默丢失
   *（verify V5 实测：第二个成员的 add 被拒、patch 只有第一个成员）。第二次 attempt 取的是
   * 重读后的最新栅栏，非盲重试；连续失败才回落 Config 真值并显式上报。
   *
   * 上报在重读完成**之后**置位：load() 以 emptySnapshot 展开重建 state，先置后读会把
   * notice/error 在同一同步续体内吞掉（两次 notify 之间无渲染落点，SC9 显式上报不可见）。
   */
  private async commit(field: string, value: unknown): Promise<boolean> {
    const first = await this.attemptCommit(field, value)
    const outcome = first.kind === 'accepted' ? first : await this.attemptCommit(field, value)
    if (outcome.kind === 'accepted') {
      await this.load()
      return true
    }
    // 双败：会话写入权威失效（writeRefusedTwice 让位），镜像内容重新无条件采纳——load
    // 照常回落 Config 真值（原 AF-1-1 语义）。
    this.authority.transition({ type: 'writeRefusedTwice' })
    await this.load()
    if (outcome.kind === 'refused') {
      this.state = { ...this.state, notice: this.deps.t('route.writeRefused') }
    } else {
      this.state = { ...this.state, error: this.deps.t('route.writeFailed', { detail: outcome.detail }) }
    }
    this.notify()
    return false
  }
}

/**
 * 路由 id 派生与查重（AX11/D5/V5 步骤 2）：显示名 → ASCII kebab（deriveProviderKey 复用），
 * 与当前 routes 及白名单现有条目（**含悬挂**——悬挂条目靠 id 保持身份）查重，冲突加序号
 * `-2`、`-3`…；序号形态保持 kebab 段式（`name-2` 是合法段式）。
 */
export function deriveRouteId(displayName: string, routes: RouteEntry[], whitelist: string[]): string {
  const taken = new Set<string>([...routes.map((route) => route.id), ...whitelist])
  const base = deriveProviderKey(displayName)
  if (!taken.has(base)) return base
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`
    if (!taken.has(candidate)) return candidate
  }
}

/**
 * 成员拖拽/键盘排序的数据交换（把 from 位成员移到 to 位，其余顺移；move 语义——成员顺序
 * 即优先级，拖到目标位是插入而不是与目标对换）。纯函数返回新数组（原数组不动）；越界或
 * 原位返回原数组引用（调用方以引用同异判无操作）。视图拖拽落点与把手方向键回退共用同一次
 * 数据交换，重排后 order = 数组序（1 起）。
 */
export function moveMember(members: RouteMember[], from: number, to: number): RouteMember[] {
  if (from === to || from < 0 || to < 0 || from >= members.length || to >= members.length) return members
  const next = [...members]
  const moved = next.splice(from, 1)[0]
  next.splice(to, 0, moved)
  return next.map((member, index) => ({ ...member, order: index + 1 }))
}

/** 空快照（loading/unavailable 态共用）。 */
function emptySnapshot(): RoutesSnapshot {
  return {
    status: 'loading',
    routes: [],
    whitelist: [],
    hanging: [],
    registrationFailed: [],
    registrationError: undefined,
    hits: new Map(),
    memberAvailability: new Map(),
    usableMembers: new Map(),
    selectableProviders: [],
    notice: undefined,
    error: undefined,
  }
}

/** 成员 provider 的凭据 ref（apiKeyEnv 非空 string 才作 ref；快照缺席/不可用/条目非对象
 * → undefined——describeCredentials 与 buildMemberAvailability 共用的单点提取，MF-1-10）。 */
function memberCredentialRef(
  llmPiAi: Awaited<ReturnType<typeof readLlmPiAi>> | undefined,
  provider: string,
): string | undefined {
  if (llmPiAi === undefined || !llmPiAi.available) return undefined
  const profile = llmPiAi.providers[provider]
  if (typeof profile !== 'object' || profile === null) return undefined
  return typeof profile.apiKeyEnv === 'string' && profile.apiKeyEnv.length > 0 ? profile.apiKeyEnv : undefined
}

/** 每路由可用成员计数（MF-1-14 派生谓词单点：availability 缺席（探测未返回/降级/新成员）
 * 或三布尔全 false 计可用；与成员行徽章判定同源——buildMemberAvailability 的现行口径）。 */
function countUsableMembers(routes: RouteEntry[], availability: Map<string, MemberAvailability>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const route of routes) {
    let usable = 0
    for (const member of route.members) {
      const marker = availability.get(`${member.provider}/${member.model}`)
      if (marker === undefined || (!marker.providerMissing && !marker.modelMissing && !marker.credentialMissing)) usable += 1
    }
    counts.set(route.id, usable)
  }
  return counts
}

/** 悬挂条目（D1：whitelist 中不在 routes 的 id）。 */
function computeHanging(routes: RouteEntry[], whitelist: string[]): string[] {
  const routeIds = new Set(routes.map((route) => route.id))
  return whitelist.filter((id) => !routeIds.has(id))
}


/** 注册失败诊断解析（Node 半场写入形态「origin scope: detail」；形态不符时原文进 detail）。 */
export function parseRegistrationError(
  raw: unknown,
): { routeIds: string[]; origin: string; detail: string } | undefined {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined
  const match = raw.match(/^(\S+) (\S+): ([\s\S]*)$/)
  if (match === null) return { routeIds: [], origin: '', detail: raw }
  const routeIds = match[2]
  .split(',')
  .map((piece) => piece.replace(new RegExp(`^${ROUTE_PROVIDER_PREFIX}`), ''))
  .filter((id) => id !== '')
  return { routeIds, origin: match[1], detail: match[3] }
}
