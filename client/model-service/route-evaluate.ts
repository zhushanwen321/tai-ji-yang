/**
 * client/model-service/route-evaluate.ts —— 成员级时间窗求值的纯函数（dsh-model-service D5）。
 *
 * 同源性纪律（D5 采用段「求值纯函数与 Node 半场同源——禁双实现漂移」）：本文件是**权威源**。
 * Node 半场（index.js）受 copy-entry 单文件构建约束（构建脚本对源 index.js 逐字拷贝、不打包
 * import 树），无法 import 本 TS 文件——Node 侧在 index.js 内自带一份同型实现，两实现的
 * 一致性由 index.test.ts 的固定用例集**对拍**（differential testing）断言机器化：同一批
 * （时间点 × 掩码 × 条件）输入在两侧求值，逐用例相等。漂移即红灯。
 *
 * 纯函数纪律：只依赖语言内建，不 import 任何宿主通道（provider-key.ts 同款）——Node 半场
 * 与浏览器半场都能执行；不读时钟（时间一律由 `at: Date` 入参给出）、不取随机、不写全局。
 *
 * 时间语义（D5 采用段逐条）：
 *   · 宿主本地时区——`Date` 的本地分量方法（getDay/getHours/getMinutes）即本地时区语义；
 *   · 周一为周首日——`getDay()` 周日=0，换算 day = (getDay() + 6) % 7（周一=0 … 周日=6）；
 *   · 格边界 [start, end) 半小时——一天 48 格，格 n = [n*30min, (n+1)*30min)，边界上
 *     整点/半点时刻属于**开始于该时刻**的格（左闭右开）；
 *   · 特殊日期优先于周表——当日命中任一 specialDate 时用其掩码（include）或剔除语义
 *     （exclude）覆盖周表当日掩码。
 */

/** 一天的格数（半小时粒度）。 */
export const SLOTS_PER_DAY = 48
/** 一周的日数（周一为首日）。 */
export const DAYS_PER_WEEK = 7

/**
 * 插件注册的虚拟 provider id 前缀（AX5 硬约束；D4）。Node 半场（index.js）自持同值常量
 * （copy-entry 约束下不能互相 import），一致性由 index.test.ts 断言两侧同值。
 */
export const ROUTE_PROVIDER_PREFIX = 'taiji-route-'

/** 特殊日期条目（D5：date 为 MM-DD 或 YYYY-MM-DD；mode include|exclude；mask 可选 48 格）。 */
export interface RouteSpecialDate {
  date: string
  name: string
  mode: 'include' | 'exclude'
  /** 48 格当日掩码；缺席时 include = 全天命中、exclude = 全天剔除。 */
  mask?: boolean[]
}

/** 一条 window 掩码（D5：7 个长度 48 的布尔数组 + 特殊日期清单）。 */
export interface RouteWindowMask {
  /** days[day][slot]，day 0 = 周一；行缺席或长度不齐由 sanitize 归一（缺失 = 全不覆盖）。 */
  days: boolean[][]
  specialDates: RouteSpecialDate[]
}

/** 成员级条件（D5：一期求值 none/window；quota/combo 词表保留、一期不参与求值——
 * 成员保留在路由里并按「额度条件（本版本不可用）」标注，求值 fail-closed 永不命中）。 */
export interface RouteCondition {
  type: 'none' | 'window' | 'quota' | 'combo'
  window?: RouteWindowMask
}

/** 路由成员（D5 字段模型：成员顺序即优先级，order 升序）。 */
export interface RouteMember {
  provider: string
  model: string
  order: number
  condition: RouteCondition
}

/** 一条路由（D5 字段模型：id 创建后固定，白名单与悬挂条目靠它保持身份）。 */
export interface RouteEntry {
  id: string
  name: string
  members: RouteMember[]
}

/** Config 快照的读取形态（route-store 与 Node 半场共用；字段名 = index.js Config 声明）。 */
export interface RouteConfigSnapshot {
  routes: RouteEntry[]
  whitelist: string[]
}

/**
 * 宽松值 → 规范路由数组（脏数据容忍：宿主快照经 RPC 往返，形态异常的条目丢弃而不是抛错
 * ——一条脏路由不该让整个路由面不可用，与 credentials-client.sanitizePending 同纪律）。
 */
export function sanitizeRoutes(value: unknown): RouteEntry[] {
  if (!Array.isArray(value)) return []
  const routes: RouteEntry[] = []
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue
    const record = raw as Record<string, unknown>
    const id = typeof record.id === 'string' && record.id.length > 0 ? record.id : undefined
    const name = typeof record.name === 'string' && record.name.length > 0 ? record.name : undefined
    if (id === undefined || name === undefined) continue
    if (!Array.isArray(record.members)) continue
    const members: RouteMember[] = []
    for (const rawMember of record.members) {
      const member = sanitizeMember(rawMember)
      if (member !== undefined) members.push(member)
    }
    routes.push({ id, name, members })
  }
  return routes
}

/** 宽松值 → 规范白名单（string 去重保序；脏条目丢弃）。 */
export function sanitizeWhitelist(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const entries: string[] = []
  for (const item of value) {
    if (typeof item !== 'string' || item.length === 0 || seen.has(item)) continue
    seen.add(item)
    entries.push(item)
  }
  return entries
}

/** 宽松值 → 规范成员（provider/model 非空 string + condition 形态合法；否则丢弃）。 */
function sanitizeMember(raw: unknown): RouteMember | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const record = raw as Record<string, unknown>
  const provider = typeof record.provider === 'string' && record.provider.length > 0 ? record.provider : undefined
  const model = typeof record.model === 'string' && record.model.length > 0 ? record.model : undefined
  if (provider === undefined || model === undefined) return undefined
  const order = typeof record.order === 'number' && Number.isFinite(record.order) ? record.order : 0
  const condition = sanitizeCondition(record.condition)
  if (condition === undefined) return undefined
  return { provider, model, order, condition }
}

/** 宽松值 → 规范条件（type ∈ {none, window, quota, combo}；window 型须带形态合法的掩码，
 * 否则按 none 容忍）。 */
function sanitizeCondition(raw: unknown): RouteCondition | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const record = raw as Record<string, unknown>
  if (record.type === 'none') return { type: 'none' }
  if (record.type === 'window') {
    const window = sanitizeWindow(record.window)
    return window !== undefined ? { type: 'window', window } : { type: 'none' }
  }
  // quota / combo：词表保留（D5 采用段「额度类条件一期只做不可用标注」），成员不丢弃——
  // 丢弃会让手工配置的成员读回即消失、下次保存被永久清除；保留后求值走 evaluateConditionAt
  // 的 fail-closed 出口（永不命中），UI 行内按 conditionUnavailable 标注。
  if (record.type === 'quota') return { type: 'quota' }
  if (record.type === 'combo') return { type: 'combo' }
  return undefined
}

/** 宽松值 → 规范掩码（7×48 归一：短行补 false、长行截断；specialDates 逐条 sanitize）。 */
function sanitizeWindow(raw: unknown): RouteWindowMask | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const record = raw as Record<string, unknown>
  const days: boolean[][] = []
  const rows = Array.isArray(record.days) ? record.days : []
  for (let day = 0; day < DAYS_PER_WEEK; day += 1) {
    const row = rows[day]
    const slots: boolean[] = []
    const source = Array.isArray(row) ? row : []
    for (let slot = 0; slot < SLOTS_PER_DAY; slot += 1) slots.push(source[slot] === true)
    days.push(slots)
  }
  const specialDates: RouteSpecialDate[] = []
  const rawSpecials = Array.isArray(record.specialDates) ? record.specialDates : []
  for (const rawSpecial of rawSpecials) {
    const special = sanitizeSpecialDate(rawSpecial)
    if (special !== undefined) specialDates.push(special)
  }
  return { days, specialDates }
}

/** 宽松值 → 规范特殊日期（date 形态合法 + mode ∈ {include, exclude}；mask 归一到 48 格）。 */
function sanitizeSpecialDate(raw: unknown): RouteSpecialDate | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const record = raw as Record<string, unknown>
  const date = typeof record.date === 'string' ? record.date : ''
  const mode = record.mode === 'include' || record.mode === 'exclude' ? record.mode : undefined
  if (!isValidSpecialDateShape(date) || mode === undefined) return undefined
  const name = typeof record.name === 'string' && record.name.length > 0 ? record.name : date
  if (!Array.isArray(record.mask)) return { date, name, mode }
  const source = record.mask
  const mask: boolean[] = []
  for (let slot = 0; slot < SLOTS_PER_DAY; slot += 1) mask.push(source[slot] === true)
  return { date, name, mode, mask }
}

/** 特殊日期形态判定：MM-DD（01-01 … 12-31）或 YYYY-MM-DD（年份四位数字）。导出供 UI 侧
 * 添加入口复用（route-time-grid 的 addSpecial）——UI 校验与 sanitize 同一判定，避免
 * 「界面放过、读回丢弃」的静默消失（终态同步 F1-28）。 */
export function isValidSpecialDateShape(date: string): boolean {
  const monthDay = /^(\d{2})-(\d{2})$/.exec(date)
  if (monthDay !== null) {
    const month = Number(monthDay[1])
    const day = Number(monthDay[2])
    return month >= 1 && month <= 12 && day >= 1 && day <= 31
  }
  const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (full !== null) {
    const month = Number(full[2])
    const day = Number(full[3])
    return month >= 1 && month <= 12 && day >= 1 && day <= 31
  }
  return false
}

/** 时刻 → 掩码坐标（宿主本地时区、周一为首日；day ∈ [0,6]，slot ∈ [0,47]）。 */
export function slotIndexOf(at: Date): { day: number; slot: number } {
  const day = (at.getDay() + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK // getDay(): 周日=0 → 周一归 0
  const slot = at.getHours() * 2 + (at.getMinutes() >= 30 ? 1 : 0) // [start, end)：整/半点属开始格
  return { day, slot }
}

/** 时刻的 MM-DD 与 YYYY-MM-DD 形态（本地分量；特殊日期匹配用）。 */
function dateKeyOf(at: Date): { monthDay: string; full: string } {
  const month = `${at.getMonth() + 1}`.padStart(2, '0')
  const day = `${at.getDate()}`.padStart(2, '0')
  return { monthDay: `${month}-${day}`, full: `${at.getFullYear()}-${month}-${day}` }
}

/**
 * 时刻判定（掩码 × 时刻 → 是否覆盖）：本模块对外的掩码判定入口。
 *
 * 特殊日期匹配规则：date 与当日相等（MM-DD 同年年在、YYYY-MM-DD 仅该年）；清单中**第一个**
 * 命中的生效（配置顺序即优先级，多个同时命中不叠加）。
 *   · include：当日掩码 = special.mask ?? 全 48 格命中（缺席 = 全天）；
 *   · exclude：当日掩码 = 周表当日格 && !(special.mask?.[slot] ?? true)——mask 缺席 = 全天
 *     剔除，给出 mask = 只剔除命中格（周表其余格保留）。
 */
export function isSlotCoveredAt(mask: RouteWindowMask, at: Date): boolean {
  const { day, slot } = slotIndexOf(at)
  const special = firstMatchingSpecialDate(mask.specialDates, at)
  if (special !== undefined) {
    if (special.mode === 'include') return special.mask !== undefined ? special.mask[slot] : true
    const weekly = mask.days[day]?.[slot] === true
    return special.mask !== undefined ? weekly && !special.mask[slot] : false
  }
  return mask.days[day]?.[slot] === true
}

/** 清单中第一个日期命中的特殊日期（无命中 → undefined）。 */
export function firstMatchingSpecialDate(specials: RouteSpecialDate[], at: Date): RouteSpecialDate | undefined {
  const { monthDay, full } = dateKeyOf(at)
  for (const special of specials) {
    if (special.date === full || special.date === monthDay) return special
  }
  return undefined
}

/**
 * 成员条件判定（一期求值语义）：none → 恒命中；window → 掩码判定；quota/combo → 永不命中
 * （一期无额度数据源，§1.3 范围外；sanitize 保留该形态成员供 UI 标注「不可用」，求值走
 * 末尾 fail-closed 出口——未知 type 一律永不命中）。
 */
export function evaluateConditionAt(condition: RouteCondition | undefined, at: Date): boolean {
  if (condition === undefined) return false
  if (condition.type === 'none') return true
  if (condition.type === 'window') {
    if (condition.window === undefined) return false
    return isSlotCoveredAt(condition.window, at)
  }
  return false
}

/**
 * 路由求值（D5/V5：按成员顺序逐个判条件，第一个命中的成员即候选；无命中 → undefined）。
 * 成员按 order 升序排序（同 order 保持配置序——stable sort）。
 */
export function evaluateRouteAt(route: RouteEntry, at: Date): RouteMember | undefined {
  const members = [...route.members].sort((left, right) => left.order - right.order)
  for (const member of members) {
    if (evaluateConditionAt(member.condition, at)) return member
  }
  return undefined
}

/**
 * 路由集合求值（路由视图「当前命中」预览的批量入口；返回 routeId → 命中成员 | undefined）。
 */
export function evaluateRoutesAt(routes: RouteEntry[], at: Date): Map<string, RouteMember | undefined> {
  const hits = new Map<string, RouteMember | undefined>()
  for (const route of routes) hits.set(route.id, evaluateRouteAt(route, at))
  return hits
}
