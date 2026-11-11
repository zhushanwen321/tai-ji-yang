/**
 * client/model-service/route-store.ts —— 路由表与白名单的会话内权威（dsh-model-service
 * SC8/SC9，M2）。
 *
 * 数据流（SC9）：真相 = 插件 Config 的 volatile 字段 `routes` / `whitelist`（index.js 声明，
 * AX3 唯一权威）；本 store 是浏览器半场的派生视图——读 Config 快照（ConfigFormLike 三态）
 * + 订阅刷新，写 = 乐观更新（内存先改 + notify）→ form.set 整字段写回 → 失败重读（宿主
 * 拒绝或传输失败时以 Config 真值为准，UI 回落并显式上报）。
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
 * 路由 id 派生（AX11/D5/V5 步骤 2）：deriveRouteId 与当前 routes 及白名单现有条目（含悬挂）
 * 查重，冲突加序号（-2、-3…）——同名路由二次创建不被拒，派生 id 区分；悬挂条目靠 id 保持
 * 身份，拒绝改名会破坏悬挂态不复活的机制，所以这里是加序号而不是拒绝。
 */
import { deriveProviderKey } from './provider-key'
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

/** 路由 Config 字段名（index.js Config 声明）。 */
export const ROUTES_FIELD = 'routes'
/** 白名单 Config 字段名（index.js Config 声明）。 */
export const WHITELIST_FIELD = 'whitelist'

/** 成员可用性标注（G18 三型；providerMissing = 供应商已删）。 */
export interface MemberAvailability {
  providerMissing: boolean
  modelMissing: boolean
  credentialMissing: boolean
  /** 成员凭据 ref（credentialMissing 的文案参数）。 */
  ref: string | undefined
}

/** 可选成员的 provider 行（成员选择器数据；排除插件自身前缀与托管 provider）。 */
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
  /** 「当前命中」预览（routeId → 命中成员 | undefined；打开视图时算一次）。 */
  hits: Map<string, RouteMember | undefined>
  /** 成员可用性标注（键 = `${provider}/${model}`；G18）。 */
  memberAvailability: Map<string, MemberAvailability>
  /** 成员选择器的 provider 行（排除 taiji-route-* 与托管行）。 */
  selectableProviders: SelectableProvider[]
  notice: string | undefined
  error: string | undefined
}

/** store 构造依赖。 */
export interface RoutesListModelDeps {
  remote: ModelServiceHost
  configForm: PluginConfigFormLike
}

/**
 * 路由视图模型（纯 TS 可独立单测；ProvidersListModel 同款 subscribe/getSnapshot/notify）。
 */
export class RoutesListModel {
  private readonly deps: RoutesListModelDeps
  private readonly listeners = new Set<() => void>()
  private state: RoutesSnapshot
  /**
   * 已采纳快照的 revision（倒退栅栏，AF-1-1）：commit 成功后的重读走镜像视图，镜像快照
   * 滞后于 set 落盘时（persist.ts 镜像/mutate 两路径），旧快照整段重建会把乐观写弹回
   * （白名单 toggle 静默丢失）。非 ready 态重置——命名空间重开时宿主 revision 可重排，
   * 栅栏不得跨服务期生效。
   */
  private appliedRevision: number | undefined
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

  /** 撤订阅（分区卸载时调用；Config 订阅不撤会在卸载后空转重读）。 */
  dispose(): void {
    this.unsubscribe?.()
    this.unsubscribe = undefined
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
      this.appliedRevision = undefined
      this.state = { ...emptySnapshot(), status: 'unavailable' }
      this.notify()
      return
    }
    if (snapshot.status !== 'ready') {
      this.appliedRevision = undefined
      this.state = { ...emptySnapshot(), status: 'loading' }
      this.notify()
      return
    }
    // 倒退栅栏（AF-1-1）：revision 与 value 在同一快照对象（ConfigFormSnapshotLike），滞后
    // 回放的旧快照 revision 必然更小——拒收其 Config 派生面重建（routes/whitelist/hanging
    // 整段重建正是弹回机制本体），subscribe 事件最终会带新 revision 快照完成对账；栅栏只
    // 挡倒退不挡前进。探测面不拒收（probeDerived 照跑）：探测读宿主 remote，不依赖这份滞后
    // 快照，而 load 是探测面唯一刷新入口——宿主实测镜像滞后可达数秒（直至下一次写入才有
    // describe 触发），整段 return 会把成员可用性/注册探测冻结整个窗口（G18「供应商已删」
    // 标注缺席）。
    const staleReplay =
      this.appliedRevision !== undefined &&
      snapshot.revision !== undefined &&
      snapshot.revision < this.appliedRevision
    if (staleReplay) {
      await this.probeDerived(this.state.routes)
      return
    }
    this.appliedRevision = snapshot.revision
    const section = typeof snapshot.value === 'object' && snapshot.value !== null
      ? snapshot.value as Record<string, unknown>
      : {}
    const routes = sanitizeRoutes(section[ROUTES_FIELD])
    const whitelist = sanitizeWhitelist(section[WHITELIST_FIELD])
    const routeIds = new Set(routes.map((route) => route.id))
    this.state = {
      ...emptySnapshot(),
      status: 'ready',
      routes,
      whitelist,
      // 悬挂白名单条目（D1：id 在 routes 不存在——「路由已删除」标注 + 清理动作的判定源）。
      hanging: whitelist.filter((id) => !routeIds.has(id)),
    }
    this.notify()
    await this.probeDerived(routes)
  }

  /** 探测面（异步；失败降级为「不标注」，不阻塞路由配置面——AX6 辅助功能接入点降级）。 */
  private async probeDerived(routes: RouteEntry[]): Promise<void> {
    // remote 方法返回 typert Result 包装，unwrapRemote 解包后失败转 rejection，由 .catch 降级。
    const [directory, llmPiAi, registeredProviders, credentials] = await Promise.all([
      this.deps.remote.llm.listConfigurableProviders().then(unwrapRemote).catch(() => []),
      readLlmPiAi(this.deps.remote.settings).catch(() => undefined),
      this.deps.remote.llm.listProviders().then(unwrapRemote).catch(() => []),
      this.describeCredentials(routes).catch(() => new Map<string, { configured: boolean }>()), 
    ])
    const registeredRouteProviders = new Set(
      registeredProviders
        .map((provider) => provider.id)
        .filter((id) => id.startsWith(ROUTE_PROVIDER_PREFIX)),
    )
    const registrationFailed = routes
      .map((route) => route.id)
      .filter((id) => !registeredRouteProviders.has(`${ROUTE_PROVIDER_PREFIX}${id}`))
    const selectableProviders = directory
      .filter((row) => row.settingsNs === 'llm-pi-ai' && !row.provider.startsWith(ROUTE_PROVIDER_PREFIX))
      .map((row) => {
        const profile = llmPiAi !== undefined && llmPiAi.available ? llmPiAi.providers[row.provider] : undefined
        const models = Array.isArray(profile?.models) ? profile.models : []
        return {
          key: row.provider,
          name: typeof profile?.displayName === 'string' && profile.displayName !== '' ? profile.displayName : row.displayName,
          models: models
            .filter((model): model is Record<string, unknown> => typeof model === 'object' && model !== null)
            .map((model) => ({
              id: typeof model.id === 'string' ? model.id : '',
              name: typeof model.name === 'string' && model.name !== '' ? model.name : typeof model.id === 'string' ? model.id : '',
            }))
            .filter((model) => model.id !== ''),
        }
      })
    const availability = this.buildMemberAvailability(routes, llmPiAi, credentials)
    this.state = {
      ...this.state,
      registrationFailed,
      selectableProviders,
      memberAvailability: availability,
      hits: evaluateRoutesAt(routes, new Date()),
    }
    this.notify()
  }

  /** 批量读成员凭据状态（refs 来自成员 provider 的 apiKeyEnv）。 */
  private async describeCredentials(routes: RouteEntry[]): Promise<Map<string, { configured: boolean }>> {
    const llmPiAi = await readLlmPiAi(this.deps.remote.settings).catch(() => undefined)
    const refs = new Set<string>()
    for (const route of routes) {
      for (const member of route.members) {
        const profile = llmPiAi !== undefined && llmPiAi.available ? llmPiAi.providers[member.provider] : undefined
        const ref = typeof profile?.apiKeyEnv === 'string' && profile.apiKeyEnv.length > 0 ? profile.apiKeyEnv : undefined
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
        const ref = typeof profile?.apiKeyEnv === 'string' && profile.apiKeyEnv.length > 0 ? profile.apiKeyEnv : undefined
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

  /** 保存路由编辑（整体替换该条；id 创建后固定，改名只动 name——D5）。 */
  async saveRoute(updated: RouteEntry): Promise<void> {
    const routes = this.state.routes.map((route) => (route.id === updated.id ? updated : route))
    await this.writeRoutes(routes)
  }

  /** 删除路由（白名单条目转悬挂保留——D1 不自动清理，界面给标注与清理动作）。 */
  async deleteRoute(id: string): Promise<void> {
    await this.writeRoutes(this.state.routes.filter((route) => route.id !== id))
  }

  /** 白名单勾选/取消（D1：勾选即暴露、取消即从选择器消失）。 */
  async toggleWhitelist(id: string): Promise<void> {
    const next = this.state.whitelist.includes(id)
      ? this.state.whitelist.filter((entry) => entry !== id)
      : [...this.state.whitelist, id]
    await this.writeWhitelist(next)
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

  /** routes 整字段写回（乐观更新已由调用方先行；拒绝/失败 → 重读回落并显式上报）。 */
  private async writeRoutes(routes: RouteEntry[]): Promise<void> {
    this.state = { ...this.state, routes }
    this.notify()
    await this.commit(ROUTES_FIELD, routes)
  }

  /** whitelist 整字段写回（同上）。 */
  private async writeWhitelist(whitelist: string[]): Promise<void> {
    this.state = { ...this.state, whitelist }
    this.notify()
    await this.commit(WHITELIST_FIELD, whitelist)
  }

  /** 整字段提交（ConfigFormLike.set；失败重读 = 以 Config 真值为准 + notice/error 上报）。 */
  private async commit(field: string, value: unknown): Promise<void> {
    try {
      const accepted = await this.deps.configForm.set(field, value)
      if (accepted) {
        // set 被接受即宿主侧 revision 已前移（写入带 revision 栅栏，无冲突才接受），而镜像
        // 快照更新滞后于 set 落盘（persist.ts 镜像/mutate 两路径）——本 store 的状态此刻至少
        // 在 appliedRevision+1，前移栅栏把 commit 后重读里的滞后回放（revision ≤ 写前值）
        // 挡掉；不前移则滞后镜像 revision 与已采纳值相等，倒退恰好漏过（AF-1-1 弹回主径）。
        this.appliedRevision = (this.appliedRevision ?? 0) + 1
      } else {
        this.state = { ...this.state, notice: this.t('route.writeRefused') }
        this.notify()
        await this.load()
        return
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      this.state = { ...this.state, error: this.t('route.writeFailed', { detail }) }
      this.notify()
      await this.load()
      return
    }
    await this.load()
  }

  /** locale 座位（store 文案：写入失败上报等；由视图传入——ProvidersListModel 的 t 同款）。 */
  private t: (key: string, params?: Record<string, unknown>) => string = (key, params) => fallbackCopy(key, params)

  /** 注入翻译函数（RoutesView 挂载时传入；单测可注入桩）。 */
  setTranslate(t: (key: string, params?: Record<string, unknown>) => string): void {
    this.t = t
  }
}

/** store 未注入翻译时的兜底文案（与 locale 字典键同字面；zh 单语，兜底场景只在测试）。 */
function fallbackCopy(key: string, params?: Record<string, unknown>): string {
  if (key === 'route.writeRefused') return '写入被宿主拒绝，已恢复为当前保存值'
  if (key === 'route.writeFailed') return `写入失败（${params?.detail ?? ''}），已恢复为当前保存值`
  return key
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

/** 空快照（loading/unavailable 态共用）。 */
function emptySnapshot(): RoutesSnapshot {
  return {
    status: 'loading',
    routes: [],
    whitelist: [],
    hanging: [],
    registrationFailed: [],
    hits: new Map(),
    memberAvailability: new Map(),
    selectableProviders: [],
    notice: undefined,
    error: undefined,
  }
}
