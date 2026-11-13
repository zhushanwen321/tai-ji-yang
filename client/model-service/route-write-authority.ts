/**
 * client/model-service/route-write-authority.ts —— 路由写入权威的显式状态机（MF-1-3）。
 *
 * 原先散在 RoutesListModel 上的七个守卫修饰字段（appliedRevision 栅栏、lastWritten 的
 * writtenAt / routesWrittenAt 双时间锚、preImages 覆写前值集合、reconciledFor 收敛防抖、
 * reconcileLoopGuard 递归防护、graceRecheckTimer 宽限补探定时器）与四处手写重置的全部
 * 语义内聚到本值对象；RoutesListModel 收缩为 IO 编排（RPC / notify / 定时器接线），不再
 * 持有守卫字段。
 *
 * 状态（生命周期三态）：
 *   · idle          本会话无写入权威（构造起 / 命名空间关闭后）；
 *   · authoritative 本会话持有写入权威（lastWritten + preImages 在场——乐观写已登记）；
 *   · ceded         权威已交还（双败或外部变更后）——镜像内容无条件采纳。
 *
 * 事件与转移表（表外转移 fail-fast 抛错）：
 *
 *   事件                   idle             authoritative      ceded
 *   beginWrite             → authoritative  → authoritative    → authoritative
 *   writeAccepted          栅栏前移         栅栏前移           栅栏前移
 *   writeRefusedTwice      → ceded          → ceded            → ceded（幂等）
 *   externalChangeDetected ✗                → ceded            ✗
 *   namespaceClosed        → idle（全重置）  → idle（全重置）   → idle（全重置）
 *   namespaceReopening     仅清栅栏         仅清栅栏           仅清栅栏
 *   staleReplayDetected    无动作           无动作             无动作
 *   snapshotAdopted        栅栏 := revision 栅栏 := revision   栅栏 := revision
 *   reconcileSettled       成功置收敛防抖   成功置收敛防抖     成功置收敛防抖
 *
 * 状态敏感事件唯一：externalChangeDetected 只在持有写入权威时有意义——screenReadySnapshot 只
 * 在 lastWritten 在场（authoritative）时分派它，且判定到分派之间无 await（状态不可能中途
 * 变化），ceded / idle 态再让位是逻辑错误。其余事件全态合法（单点定义于 COMMON_EVENT_HANDLERS）：
 * set 在途时并发的镜像投递可能已让权威让位甚至全重置，落账照常，不让 IO 并发竞态变成抛错。
 *
 * snapshotAdopted / reconcileSettled 是 IO 侧落账事件（快照采纳后的栅栏对齐、收敛写结果的
 * 防抖置位）；其余事件对应领域转移。收敛重写的递归防护（reconcileLoopGuard）是链内瞬态，
 * 由 settleReconcile 的回调域承载，不进状态枚举。
 */
import type { RouteEntry } from './route-evaluate'

/**
 * 注册探测的近期写入宽限窗（毫秒）：本会话写入 routes 后，探测 RPC 可能先于 Node 半场
 * ensureRouteRegistration 的注册执行返回（无先后保证），窗口内差集不标注册失败；volatile
 * 更新链路的注册重试由宿主事件驱动，亚秒级完成，5 秒窗覆盖注册执行 + 一次事件传播的余量。
 */
const REGISTRATION_PROBE_GRACE_MS = 5000

/** 覆写前值集合容量：覆盖镜像滞后窗口内的少数几个世代，越界按外部变更采纳。 */
const PRE_IMAGES_CAPACITY = 3

/** 写入权威状态（生命周期三态）。 */
export type WriteAuthorityState = 'idle' | 'authoritative' | 'ceded'

/** 本会话最近一次写入的登记（镜像回显对账基准；宽限锚 routesWrittenAt 仅 routes 写入刷新——whitelist 写入不影响注册集合，不得重置宽限，MF-2-2）。 */
export interface LastWrittenRecord {
  routes: RouteEntry[]
  whitelist: string[]
  writtenAt: number
  routesWrittenAt: number | undefined
}

/** 状态机事件（transition 唯一入口的词表）。 */
export type WriteAuthorityEvent =
  /**
   * 乐观写开始：登记覆写前值（容量 3 FIFO）+ 会话写入值。touchesRoutes = 本次写是否含
   * routes 段（true 刷新宽限锚；false 沿用前锚——whitelist-only 写入不重置宽限）。
   */
  | { type: 'beginWrite'; routes: RouteEntry[]; whitelist: string[]; overwrites: { routes: RouteEntry[]; whitelist: string[] }[]; touchesRoutes: boolean }
  | { type: 'writeAccepted' }
  | { type: 'writeRefusedTwice' }
  | { type: 'externalChangeDetected' }
  | { type: 'namespaceClosed' }
  | { type: 'namespaceReopening' }
  | { type: 'staleReplayDetected' }
  | { type: 'snapshotAdopted'; revision: number | undefined }
  | { type: 'reconcileSettled'; content: string; succeeded: boolean }

/** ready 快照的守卫裁决（screenReadySnapshot 的产物；store 据此编排 IO）。 */
export type ReadyVerdict =
  /** revision 倒退的滞后回放：拒收其 Config 派生面重建（探测面照跑）。 */
  | { kind: 'staleReplay' }
  /** 内容 == 本会话写入值：自己写入的回显，采纳。 */
  | { kind: 'echo' }
  /** 内容落在覆写前值集合内：滞后回放，不采纳；shouldReconcile = 单发收敛重写可发起。 */
  | { kind: 'staleContent'; content: string; shouldReconcile: boolean }
  /** 真外部变更：权威让位（已转移为 ceded），照常采纳。 */
  | { kind: 'externalChange' }
  /** 无写入权威（idle/ceded）：镜像内容无条件采纳。 */
  | { kind: 'adopt' }

/** (routes, whitelist) 的内容键（回放守卫与覆写前值集合的相等判定；JSON 序列化足够——两侧都是 sanitize/乐观更新产出的同构形态，键序稳定）。 */
function contentKey(routes: RouteEntry[], whitelist: string[]): string {
  return JSON.stringify([routes, whitelist])
}

/** 状态机的可变内核（转移表的操作对象；只经转移表触达，不外露）。 */
interface AuthorityCore {
  state: WriteAuthorityState
  appliedRevision: number | undefined
  lastWritten: LastWrittenRecord | undefined
  preImages: Set<string>
  reconciledFor: string | undefined
}

type BeginWriteEvent = Extract<WriteAuthorityEvent, { type: 'beginWrite' }>

/** beginWrite 落账（三态同款；宽限锚按 touchesRoutes 刷新或沿用前锚）。 */
function applyBeginWrite(core: AuthorityCore, event: BeginWriteEvent): void {
  for (const overwrite of event.overwrites) {
    core.preImages.add(contentKey(overwrite.routes, overwrite.whitelist))
  }
  while (core.preImages.size > PRE_IMAGES_CAPACITY) {
    const oldest = core.preImages.values().next().value
    if (oldest === undefined) break
    core.preImages.delete(oldest)
  }
  const now = Date.now()
  core.lastWritten = {
    routes: event.routes,
    whitelist: event.whitelist,
    writtenAt: now,
    routesWrittenAt: event.touchesRoutes ? now : core.lastWritten?.routesWrittenAt,
  }
  core.state = 'authoritative'
}

/** 权威让位（双败 / 真外部变更）：清写入登记、前值集合与收敛防抖；栅栏保留。 */
function applyCede(core: AuthorityCore): void {
  core.lastWritten = undefined
  core.preImages.clear()
  core.reconciledFor = undefined
  core.state = 'ceded'
}

/** 命名空间关闭的全重置（含栅栏——重开后宿主 revision 可重排，栅栏不得跨服务期生效）。 */
function applyResetAll(core: AuthorityCore): void {
  core.appliedRevision = undefined
  applyCede(core)
  core.state = 'idle'
}

type EventHandler = (core: AuthorityCore, event: WriteAuthorityEvent) => void

/**
 * 全态事件 handler 的单点定义（八事件各一份）。externalChangeDetected 不在此：它是唯一
 * 状态敏感事件，只在 authoritative 的差异格有 handler——idle / ceded 缺格即表外转移抛错。
 * 加事件或调全态格只改这里，三列自动一致；漏一个事件在类型层即报缺键。
 */
const COMMON_EVENT_HANDLERS: Record<Exclude<WriteAuthorityEvent['type'], 'externalChangeDetected'>, EventHandler> = {
  beginWrite: (core, event) => applyBeginWrite(core, event as BeginWriteEvent),
  writeAccepted: (core) => { core.appliedRevision = (core.appliedRevision ?? 0) + 1 },
  writeRefusedTwice: (core) => applyCede(core),
  namespaceClosed: (core) => applyResetAll(core),
  namespaceReopening: (core) => { core.appliedRevision = undefined },
  staleReplayDetected: () => {},
  snapshotAdopted: (core, event) => { core.appliedRevision = event.revision },
  reconcileSettled: (core, event) => {
    if (event.succeeded) core.reconciledFor = event.content
  },
}

/** 合法转移表（state × event → 动作；缺格 = 表外转移，transition 抛错）。全态事件单点共用，authoritative 仅覆盖 externalChangeDetected 差异格。 */
const TRANSITIONS: Record<WriteAuthorityState, Partial<Record<WriteAuthorityEvent['type'], EventHandler>>> = {
  idle: COMMON_EVENT_HANDLERS,
  authoritative: {
    ...COMMON_EVENT_HANDLERS,
    externalChangeDetected: (core) => applyCede(core),
  },
  ceded: COMMON_EVENT_HANDLERS,
}

/**
 * 路由写入权威状态机（RoutesListModel 的守卫值对象；纯状态与定时器接线，不发 RPC）。
 * 对外协议 = 查询（getter / screenReadySnapshot / graceProtectedRouteIds）+ transition(event)
 * 唯一写入入口；表外转移 fail-fast 抛错。
 */
export class RouteWriteAuthority {
  private readonly core: AuthorityCore = {
    state: 'idle',
    appliedRevision: undefined,
    lastWritten: undefined,
    preImages: new Set<string>(),
    reconciledFor: undefined,
  }
  private reconcileLoopGuard = false
  private graceRecheckTimer: ReturnType<typeof setTimeout> | undefined

  /** 唯一写入入口：按 (state, event) 查转移表执行；表外组合抛错（fail-fast，不静默吞）。 */
  transition(event: WriteAuthorityEvent): void {
    const handler = TRANSITIONS[this.core.state][event.type]
    if (handler === undefined) {
      throw new Error(`RouteWriteAuthority 非法转移：state=${this.core.state} event=${event.type}`)
    }
    handler(this.core, event)
  }

  get state(): WriteAuthorityState {
    return this.core.state
  }

  /** 已采纳快照的 revision 栅栏（倒退拒收；undefined = 栅栏未立）。 */
  get appliedRevision(): number | undefined {
    return this.core.appliedRevision
  }

  /** 本会话最近一次写入登记（undefined = 无写入权威）。 */
  get lastWritten(): LastWrittenRecord | undefined {
    return this.core.lastWritten
  }

  /** 覆写前值集合（内容键快照，插入序；容量 3 FIFO）。 */
  get preImages(): readonly string[] {
    return [...this.core.preImages]
  }

  /** 已收敛重写的内容键（单发防抖）。 */
  get reconciledFor(): string | undefined {
    return this.core.reconciledFor
  }

  /**
   * ready 快照的守卫裁决：revision 倒退 → staleReplay（栅栏不动）；否则栅栏对齐（snapshotAdopted）
   * 后按内容分类——回显 / 滞后内容（含单发收敛裁决）/ 真外部变更（让位）/ 无权威采纳。
   */
  screenReadySnapshot(input: { revision: number | undefined; routes: RouteEntry[]; whitelist: string[] }): ReadyVerdict {
    if (
      this.core.appliedRevision !== undefined &&
      input.revision !== undefined &&
      input.revision < this.core.appliedRevision
    ) {
      this.transition({ type: 'staleReplayDetected' })
      return { kind: 'staleReplay' }
    }
    this.transition({ type: 'snapshotAdopted', revision: input.revision })
    const written = this.core.lastWritten
    if (written === undefined) return { kind: 'adopt' }
    const content = contentKey(input.routes, input.whitelist)
    if (content === contentKey(written.routes, written.whitelist)) return { kind: 'echo' }
    if (this.core.preImages.has(content)) {
      return {
        kind: 'staleContent',
        content,
        shouldReconcile: this.core.reconciledFor !== content && !this.reconcileLoopGuard,
      }
    }
    this.transition({ type: 'externalChangeDetected' })
    return { kind: 'externalChange' }
  }

  /**
   * 收敛重写落账 + 递归防护域：成功置 reconciledFor（单发防抖——被拒/传输失败不置位，下一次
   * 镜像投递可再次尝试）；递归回调（收敛后的重读链）全程持 loopGuard——同一次链内不再收敛
   * （防 set 持续被拒时收敛-重读无限循环），链结束解除，外部新投递不受限。
   */
  async settleReconcile(content: string, succeeded: boolean, recursion: () => Promise<void>): Promise<void> {
    this.transition({ type: 'reconcileSettled', content, succeeded })
    this.reconcileLoopGuard = true
    try {
      await recursion()
    } finally {
      this.reconcileLoopGuard = false
    }
  }

  /** 注册探测宽限集：宽限锚（routesWrittenAt）在窗内时的路由 id 集；无锚/出窗 → undefined。 */
  graceProtectedRouteIds(now: number): Set<string> | undefined {
    const written = this.core.lastWritten
    if (written === undefined || written.routesWrittenAt === undefined) return undefined
    return now - written.routesWrittenAt <= REGISTRATION_PROBE_GRACE_MS
      ? new Set(written.routes.map((route) => route.id))
      : undefined
  }

  /**
   * 宽限吞掉候选失败后的一次性延时重探定时器：定时点 = 宽限窗结束 + 50ms 余量；已安排则保留
   * 最早触发点；fire 回调（探测是 store 的 IO）由调用方注入。dispose 撤销。
   */
  scheduleGraceRecheck(fire: () => void): void {
    if (this.graceRecheckTimer !== undefined) return
    const anchor = this.core.lastWritten?.routesWrittenAt
    if (anchor === undefined) return
    const delay = Math.max(REGISTRATION_PROBE_GRACE_MS - (Date.now() - anchor), 0) + 50
    this.graceRecheckTimer = setTimeout(() => {
      this.graceRecheckTimer = undefined
      fire()
    }, delay)
  }

  /** 撤销宽限补探定时器（分区卸载时由 store 调用）。 */
  dispose(): void {
    if (this.graceRecheckTimer !== undefined) {
      clearTimeout(this.graceRecheckTimer)
      this.graceRecheckTimer = undefined
    }
  }
}
