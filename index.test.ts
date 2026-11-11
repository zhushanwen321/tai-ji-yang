import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildShellInfo,
  cliRuntimeVersion,
  desktopRuntimeVersion,
  SHELL_INFO_GLOBAL,
  SHELL_INFO_ROW_FACTORY,
} from './index.js'
import packageJson from './package.json' with { type: 'json' }
import {
  evaluateConditionAt,
  evaluateRouteAt,
  isSlotCoveredAt,
  sanitizeRoutes,
  sanitizeWhitelist,
  slotIndexOf,
  type RouteEntry,
  type RouteWindowMask,
} from './client/model-service/route-evaluate'
import {
  ROUTE_PROVIDER_PREFIX,
  createRouteAdapter,
  ensureRouteRegistration,
  isRouteProviderIdShape,
  routeIdFromProvider,
  routeProviderId,
  sanitizeRoutes as nodeSanitizeRoutes,
  sanitizeWhitelist as nodeSanitizeWhitelist,
  slotIndexOf as nodeSlotIndexOf,
  isSlotCoveredAt as nodeIsSlotCoveredAt,
  evaluateConditionAt as nodeEvaluateConditionAt,
  evaluateRouteAt as nodeEvaluateRouteAt,
} from './index.js'
import { deriveRouteId } from './client/model-service/route-store'
import {
  isRouteErrorCode,
  memberAvailabilityLocaleKeys,
  memberUnavailableLocaleKey,
  noActiveMemberLocaleKey,
  parseMemberUnavailableMessage,
} from './client/model-service/route-errors'

/**
 * 壳信息（版本行）解析单测：Node 半场 index.js 的版本解析三支（own / desktop / cli）与
 * global 注入行的形状。desktop 支用临时目录造 asar 形态的 fixture；cli 支只断言「不抛、
 * 类型正确」——它的取值取决于安装形态（本仓 peer 不落 node_modules，开发环境多半 undefined），
 * 断言具体值会随环境漂移。
 */

const tempDirs: string[] = []
afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true })
})

/** 造一个桌面形态 fixture：`<root>/app.asar/dsh/node_modules/@deepseek-ai/dsh-app-boot/package.json`。 */
function makeDesktopFixture(version: string): string {
  const root = mkdtempSync(join(tmpdir(), 'taiji-shell-info-'))
  tempDirs.push(root)
  const dir = join(root, 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-app-boot')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-app-boot', version }))
  return join(root, 'app.asar', 'dsh')
}

describe('desktopRuntimeVersion', () => {
  it('argv 命中 asar dsh 根时读其 app-boot 版本（与宿主 getDshRuntimeVersion 同源）', () => {
    const asarDsh = makeDesktopFixture('9.9.9-fixture')
    expect(desktopRuntimeVersion(['node', '/some/entry.js', asarDsh, '/profile'])).toBe('9.9.9-fixture')
  })

  it('argv 无 asar dsh 根（CLI 形态）→ undefined；根存在但 app-boot 缺 version 也 → undefined', () => {
    expect(desktopRuntimeVersion(['node', '/entry.js'])).toBeUndefined()
    const root = mkdtempSync(join(tmpdir(), 'taiji-shell-info-'))
    tempDirs.push(root)
    const dir = join(root, 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-app-boot')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x' }))
    expect(desktopRuntimeVersion(['node', join(root, 'app.asar', 'dsh')])).toBeUndefined()
  })
})

describe('cliRuntimeVersion', () => {
  it('不抛且给 string | undefined（取值随安装形态，不断言具体值）', () => {
    const value = cliRuntimeVersion()
    expect(value === undefined || typeof value === 'string').toBe(true)
  })
})

describe('buildShellInfo / SHELL_INFO_ROW_FACTORY', () => {
  it('own 版本恒可读 = package.json version；desktop fixture 命中时附带 dshVersion', () => {
    const asarDsh = makeDesktopFixture('9.9.9-fixture')
    expect(buildShellInfo(['node', asarDsh])).toEqual({ version: packageJson.version, dshVersion: '9.9.9-fixture' })
  })

  it('global 注入行形状：kind/name/value，name 与 client 侧读取的属性名一致', () => {
    const row = SHELL_INFO_ROW_FACTORY(['node'])
    expect(row).toMatchObject({ kind: 'global', name: SHELL_INFO_GLOBAL })
    expect((row as { value: unknown }).value).toEqual(buildShellInfo(['node']))
  })
})

// ── 模型路由适配器（dsh-model-service D4/D5/G13/RL5/RL9，M2）──────────────────────────
// 宿主 dsh-llm 契约的最小同构假件：registerAdapter 的校验语义（DUPLICATE_ADAPTER 整批拒绝
// / replace 原子交换 / providerInfo 校验）与 stream 的调用形态（按 options.provider 查表）
// 按宿主 lib/index.js 实读复刻，错误分类断言依赖它。适配器不 import @deepseek-ai/dsh-llm
// （动态解析 + 兼容构造回落，见 index.js），单测环境下错误对象以 own property code +
// failure 与宿主 LlmError 同形。

/** 错误对象的最小读取面（兼容构造与真 LlmError 同形：own property code / failure）。 */
interface RouteLikeError {
  code?: string
  message?: string
  failure?: { message?: string; code?: string }
}

/** 本地时间分量构造（与 route-evaluate.test.ts 同款：任意进程时区下等价）。 */
function at(year: number, month: number, day: number, hour: number, minute: number): Date {
  return new Date(year, month - 1, day, hour, minute)
}

/** 固定求值时刻：2026-01-05（本地周一）09:30 → day 0 / slot 19。 */
const FIXED_NOW = () => at(2026, 1, 5, 9, 30)

/** 成员级 window 掩码（只命中 (day, slot) 一格）。 */
function maskAt(day: number, slot: number): RouteWindowMask {
  return {
    days: Array.from({ length: 7 }, (_, d) => Array.from({ length: 48 }, (_, s) => d === day && s === slot)),
    specialDates: [],
  }
}

/** Config 快照 holder（测试内可变）。 */
function snapshotHolder(routes: RouteEntry[], whitelist: string[]) {
  const state = { routes, whitelist }
  return {
    state,
    readSnapshot: () => ({ routes: state.routes, whitelist: state.whitelist }),
  }
}

/** 宿主物理拓扑假件：成员 provider/model 可用性与 resolveModelInfo 元数据。 */
interface FakeMemberConfig {
  models?: string[]
  contextWindow?: number
  reasoningEfforts?: string[]
  /** provider 从注册表缺席（供应商已删）。 */
  unregistered?: boolean
}

/** 假 llm 服务：注册表 + listModels + resolveModelInfo + 可编程 stream。 */
function fakeLlm(members: Record<string, FakeMemberConfig>, upstream?: (options: { provider: string; model: string }) => AsyncGenerator<Record<string, unknown>>) {
  const forwarded: { provider: string; model: string }[] = []
  const llm = {
    listProviders: async () =>
      Object.entries(members)
        .filter(([, config]) => config.unregistered !== true)
        .map(([id]) => ({ id, name: id })),
    listModels: async (provider: string) =>
      (members[provider]?.models ?? []).map((id) => ({ provider, id, name: id })),
    resolveModelInfo: async (provider: string, model: string) => {
      const config = members[provider]
      if (config === undefined || config.models === undefined || !config.models.includes(model)) {
        const error = new Error(`no adapter registered for provider "${provider}"`) as RouteLikeError & Error
        error.code = 'NO_ADAPTER'
        throw error
      }
      const info: Record<string, unknown> = { provider, id: model, name: model }
      if (config.contextWindow !== undefined) info.context = { contextWindow: config.contextWindow }
      if (config.reasoningEfforts !== undefined) {
        info.reasoning = { efforts: config.reasoningEfforts.map((id) => ({ id, name: id })) }
      }
      return info
    },
    stream: (options: { provider: string; model: string }) => {
      const generator = (upstream ?? defaultUpstream)(options)
      // 包装一层记录转发的成员（假上游 seam）。
      const wrapped = async function* (): AsyncGenerator<Record<string, unknown>> {
        forwarded.push({ provider: options.provider, model: options.model })
        yield* generator
      }
      return wrapped()
    },
  }
  return { llm, forwarded }
}

/** 默认假上游：chunk 协议不变量的正向样本（usage 先于 finish、finish 后无 chunk）。 */
async function* defaultUpstream(): AsyncGenerator<Record<string, unknown>> {
  yield { type: 'text-delta', index: 0, text: 'hello' }
  yield { type: 'usage', usage: { outputTokens: 1 } }
  yield { type: 'finish', reason: { kind: 'stop' } }
}

/** 假凭据服务（describe 全 configured 或指定 ref 缺失）。 */
function fakeCredentials(missingRefs: string[] = []) {
  return {
    describe: async (ref: string) => ({ configured: !missingRefs.includes(ref), source: 'file', writable: true }),
  }
}

/** 假 llm-pi-ai providers 段读取（成员 apiKeyEnv 契约）。 */
function fakeProfiles(refs: Record<string, string>) {
  return () => Object.fromEntries(Object.entries(refs).map(([key, ref]) => [key, { apiKeyEnv: ref }]))
}

/** 构造两成员路由（provider-a / provider-b）。 */
function twoMemberRoute(aCondition: { type: 'none' } | { type: 'window'; window: RouteWindowMask }, bCondition: { type: 'none' } | { type: 'window'; window: RouteWindowMask }): RouteEntry {
  return {
    id: 'demo',
    name: '演示路由',
    members: [
      { provider: 'provider-a', model: 'model-a', order: 1, condition: aCondition },
      { provider: 'provider-b', model: 'model-b', order: 2, condition: bCondition },
    ],
  }
}

/** 当前时刻命中的 window 条件（周一 slot 19；配合 FIXED_NOW）。 */
const hitNow: { type: 'window'; window: RouteWindowMask } = { type: 'window', window: maskAt(0, 19) }
/** 当前时刻不命中的 window 条件。 */
const missNow: { type: 'window'; window: RouteWindowMask } = { type: 'window', window: maskAt(2, 40) }

describe('G13：注册 provider id 前缀断言与宿主 route 集合无交集', () => {
  it('routeProviderId / routeIdFromProvider 往返一致，形态满足 taiji-route-<kebab>', () => {
    expect(ROUTE_PROVIDER_PREFIX).toBe('taiji-route-')
    const id = routeProviderId('demo-route')
    expect(id).toBe('taiji-route-demo-route')
    expect(isRouteProviderIdShape(id)).toBe(true)
    expect(routeIdFromProvider(id)).toBe('demo-route')
    expect(routeIdFromProvider('deepseek-official')).toBeUndefined()
    expect(isRouteProviderIdShape('taiji-route-')).toBe(false) // 空段式拒绝
    expect(isRouteProviderIdShape('taiji-route-Demo')).toBe(false) // 大写拒绝
  })

  it('ensureRouteRegistration 注册的 id 全部满足前缀正则，且与宿主已注册 route 无交集', async () => {
    const host = createFakeHostRegistry(['deepseek-official', 'deepseek-account', 'my-provider'])
    const holder = snapshotHolder([{ id: 'demo', name: 'D', members: [] }], ['demo'])
    const adapter = createRouteAdapter({
      readSnapshot: holder.readSnapshot,
      llm: host.llm,
      credentials: fakeCredentials(),
      readProviderProfiles: fakeProfiles({}),
      now: FIXED_NOW,
    })
    const dispose = ensureRouteRegistration(host.ctx, holder.readSnapshot, adapter)
    const initial = ['deepseek-official', 'deepseek-account', 'my-provider']
    const registered = host.registeredIds()
    expect(registered).toContain('taiji-route-demo')
    // G13 断言本体：插件条目满足前缀形态，宿主既有 route 集合原样保留（无交集 = 双方并存）。
    expect(registered.filter((provider) => provider.startsWith(ROUTE_PROVIDER_PREFIX))).toEqual(['taiji-route-demo'])
    expect(isRouteProviderIdShape('taiji-route-demo')).toBe(true)
    for (const provider of initial) {
      expect(isRouteProviderIdShape(provider)).toBe(false) // 既有宿主 route 不满足插件前缀 = 无交集
      expect(registered).toContain(provider)
    }
    dispose()
    expect(host.registeredIds()).toEqual(initial)
  })
})

describe('注册生命周期（RL9：空路由不注册 / 首路由注册 / 全删注销 / 冲突降级）', () => {
  it('空路由集启动不注册（AS16，无 INVALID_ADAPTER）', () => {
    const host = createFakeHostRegistry(['deepseek-official'])
    const holder = snapshotHolder([], [])
    const adapter = createRouteAdapter({ readSnapshot: holder.readSnapshot, llm: host.llm, credentials: fakeCredentials(), readProviderProfiles: fakeProfiles({}), now: FIXED_NOW })
    const dispose = ensureRouteRegistration(host.ctx, holder.readSnapshot, adapter)
    expect(host.registeredIds().filter((provider) => provider.startsWith(ROUTE_PROVIDER_PREFIX))).toEqual([])
    expect(host.errors).toEqual([])
    dispose()
  })

  it('首个路由创建（volatile-update）触发首次注册；路由全删触发 dispose 注销', () => {
    const host = createFakeHostRegistry([])
    const holder = snapshotHolder([], [])
    const adapter = createRouteAdapter({ readSnapshot: holder.readSnapshot, llm: host.llm, credentials: fakeCredentials(), readProviderProfiles: fakeProfiles({}), now: FIXED_NOW })
    const dispose = ensureRouteRegistration(host.ctx, holder.readSnapshot, adapter)
    expect(host.registeredIds()).toEqual([])
    holder.state.routes = [{ id: 'r1', name: 'R1', members: [] }]
    holder.state.whitelist = ['r1']
    host.fireVolatile()
    expect(host.registeredIds()).toEqual(['taiji-route-r1'])
    holder.state.routes = []
    holder.state.whitelist = []
    host.fireVolatile()
    expect(host.registeredIds()).toEqual([]) // 全删注销：宿主注册表不再持有 taiji-route-*
    dispose()
  })

  it('集合不变时跳过 replace（facts 缓存）；集合变化走 replace 原子交换', () => {
    const host = createFakeHostRegistry([])
    const holder = snapshotHolder([{ id: 'r1', name: 'R1', members: [] }], ['r1'])
    const adapter = createRouteAdapter({ readSnapshot: holder.readSnapshot, llm: host.llm, credentials: fakeCredentials(), readProviderProfiles: fakeProfiles({}), now: FIXED_NOW })
    const dispose = ensureRouteRegistration(host.ctx, holder.readSnapshot, adapter)
    expect(host.commitCount).toBe(1)
    host.fireVolatile() // 集合未变：无注册动作
    expect(host.commitCount).toBe(1)
    holder.state.routes = [
      { id: 'r1', name: 'R1', members: [] },
      { id: 'r2', name: 'R2', members: [] },
    ]
    host.fireVolatile()
    expect(host.commitCount).toBe(2)
    expect(host.registeredIds()).toEqual(['taiji-route-r1', 'taiji-route-r2'])
    dispose()
  })

  it('注册冲突（宿主已注册同名 provider）降级：日志记 ROUTE_REGISTRATION_FAILED，宿主注册表不受影响', () => {
    const host = createFakeHostRegistry(['taiji-route-conflict'])
    const holder = snapshotHolder([{ id: 'conflict', name: 'C', members: [] }], ['conflict'])
    const adapter = createRouteAdapter({ readSnapshot: holder.readSnapshot, llm: host.llm, credentials: fakeCredentials(), readProviderProfiles: fakeProfiles({}), now: FIXED_NOW })
    const dispose = ensureRouteRegistration(host.ctx, holder.readSnapshot, adapter)
    expect(host.registeredIds()).toEqual(['taiji-route-conflict']) // 宿主原有注册原样
    expect(host.errors.join('\n')).toContain('ROUTE_REGISTRATION_FAILED')
    expect(host.errors.join('\n')).toContain('already registered') // 原始错误入日志
    // 解决冲突后（宿主条目消失）再触发 volatile-update：幂等重试成功。
    host.releaseRoute('taiji-route-conflict')
    holder.state.routes = []
    host.fireVolatile()
    expect(host.errors.filter((message) => message.includes('ROUTE_REGISTRATION_FAILED'))).toHaveLength(1)
    dispose()
  })
})

describe('成员级求值转发（V5：命中 / 回退 / 不命中跳过 vs 不可用终结）', () => {
  function setup(route: RouteEntry, options: { missingRefs?: string[]; members?: Record<string, FakeMemberConfig>; upstream?: (options: { provider: string; model: string }) => AsyncGenerator<Record<string, unknown>> } = {}) {
    const members = options.members ?? {
      'provider-a': { models: ['model-a'], contextWindow: 8000, reasoningEfforts: ['off', 'high'] },
      'provider-b': { models: ['model-b'], contextWindow: 16000, reasoningEfforts: ['off', 'high', 'max'] },
    }
    const { llm, forwarded } = fakeLlm(members, options.upstream)
    const holder = snapshotHolder([route], [route.id])
    const adapter = createRouteAdapter({
      readSnapshot: holder.readSnapshot,
      llm,
      credentials: fakeCredentials(options.missingRefs ?? []),
      readProviderProfiles: fakeProfiles({ 'provider-a': 'TAIJI_A_KEY', 'provider-b': 'TAIJI_B_KEY' }),
      now: FIXED_NOW,
    })
    return { adapter, forwarded, holder, llm }
  }

  it('首个条件命中成员即候选：chunk 原样透传且转发目标 = 物理成员（V5 步骤 5）', async () => {
    const route = twoMemberRoute(hitNow, { type: 'none' })
    const { adapter, forwarded } = setup(route)
    const chunks: Record<string, unknown>[] = []
    for await (const chunk of adapter.stream({ provider: 'taiji-route-demo', model: 'demo', messages: [] })) {
      chunks.push(chunk)
    }
    // 协议不变量（RL5）：usage 先于 finish、finish 后无 chunk、序列完整透传。
    expect(chunks.map((chunk) => chunk.type)).toEqual(['text-delta', 'usage', 'finish'])
    const finish = chunks[2] as { reason: { kind: string } }
    expect(finish.reason.kind).toBe('stop')
    expect(forwarded).toEqual([{ provider: 'provider-a', model: 'model-a' }])
  })

  it('A 条件不命中 → 跳过转发 B（V5 步骤 6 回退）', async () => {
    const route = twoMemberRoute(missNow, { type: 'none' })
    const { adapter, forwarded } = setup(route)
    for await (const chunk of adapter.stream({ provider: 'taiji-route-demo', model: 'demo', messages: [] })) {
      void chunk
    }
    expect(forwarded).toEqual([{ provider: 'provider-b', model: 'model-b' }])
  })

  it('成员不可用终结不静默换下一个：provider 缺席（V5 步骤 9/10 + 步骤 8 不静默切换）', async () => {
    const route = twoMemberRoute(hitNow, { type: 'none' })
    const { adapter, forwarded } = setup(route, { members: { 'provider-b': { models: ['model-b'] }, 'provider-a': { models: ['model-a'], unregistered: true } } })
    const error = await captureRejection(adapter.stream({ provider: 'taiji-route-demo', model: 'demo', messages: [] }))
    expect(error?.code).toBe('ROUTE_MEMBER_UNAVAILABLE')
    expect(error?.message).toContain('provider-a')
    expect(forwarded).toEqual([]) // 未静默换 B
  })

  it('成员不可用终结：凭据缺失（V7 步骤 1-3，附成员与 ref）', async () => {
    const route = twoMemberRoute(hitNow, { type: 'none' })
    const { adapter, forwarded } = setup(route, { missingRefs: ['TAIJI_A_KEY'] })
    const error = await captureRejection(adapter.stream({ provider: 'taiji-route-demo', model: 'demo', messages: [] }))
    expect(error?.code).toBe('ROUTE_MEMBER_UNAVAILABLE')
    expect(error?.message).toContain('TAIJI_A_KEY')
    expect(error?.message).toContain('provider-a/model-a')
    expect(forwarded).toEqual([])
  })

  it('成员不可用终结：模型不在清单', async () => {
    const route = twoMemberRoute(hitNow, { type: 'none' })
    const { adapter, forwarded } = setup(route, { members: { 'provider-b': { models: ['model-b'] }, 'provider-a': { models: ['other-model'] } } })
    const error = await captureRejection(adapter.stream({ provider: 'taiji-route-demo', model: 'demo', messages: [] }))
    expect(error?.code).toBe('ROUTE_MEMBER_UNAVAILABLE')
    expect(error?.message).toContain('model-a')
    expect(forwarded).toEqual([])
  })

  it('无成员命中 → ROUTE_NO_ACTIVE_MEMBER（hitless，V5 步骤 7）', async () => {
    const route = twoMemberRoute(missNow, missNow)
    const { adapter } = setup(route)
    const error = await captureRejection(adapter.stream({ provider: 'taiji-route-demo', model: 'demo', messages: [] }))
    expect(error?.code).toBe('ROUTE_NO_ACTIVE_MEMBER')
    expect(error?.message).toContain('no member condition matches')
  })

  it('白名单未勾选 / 悬挂条目 → ROUTE_NO_ACTIVE_MEMBER（not-exposed，V6 步骤 6 语义）', async () => {
    const route = twoMemberRoute(hitNow, { type: 'none' })
    const { llm } = fakeLlm({ 'provider-a': { models: ['model-a'] }, 'provider-b': { models: ['model-b'] } })
    const holder = snapshotHolder([route], []) // 空白名单 = 全不暴露
    const adapter = createRouteAdapter({ readSnapshot: holder.readSnapshot, llm, credentials: fakeCredentials(), readProviderProfiles: fakeProfiles({}), now: FIXED_NOW })
    const error = await captureRejection(adapter.stream({ provider: 'taiji-route-demo', model: 'demo', messages: [] }))
    expect(error?.code).toBe('ROUTE_NO_ACTIVE_MEMBER')
    expect(error?.message).toContain('not whitelisted')
  })

  it('内层失败终结包装为 ROUTE_MEMBER_UNAVAILABLE：保留原始码（message）与 cause', async () => {
    const failing = async function* (): AsyncGenerator<Record<string, unknown>> {
      yield { type: 'text-delta', index: 0, text: 'par' }
      yield { type: 'finish', reason: { kind: 'error', failure: { message: 'upstream 500', code: 'PROVIDER_ERROR' } } }
    }
    const route = twoMemberRoute(hitNow, { type: 'none' })
    const { adapter, forwarded } = setup(route, { upstream: failing })
    const error = await captureRejection(adapter.stream({ provider: 'taiji-route-demo', model: 'demo', messages: [] }))
    expect(error?.code).toBe('ROUTE_MEMBER_UNAVAILABLE')
    expect(error?.message).toContain('PROVIDER_ERROR') // 原始码保留在 message
    expect(error?.message).toContain('provider-a/model-a')
    expect((error?.cause as Error | undefined)?.message).toContain('PROVIDER_ERROR') // cause 保留
    expect(forwarded).toEqual([{ provider: 'provider-a', model: 'model-a' }])
  })

  it('内层 throw（中间件形态）同样包装 ROUTE_MEMBER_UNAVAILABLE，且不吞路由自身错误码', async () => {
    const throwing = async function* (): AsyncGenerator<Record<string, unknown>> {
      throw new Error('waterfall middleware exploded')
    }
    const route = twoMemberRoute(hitNow, { type: 'none' })
    const { adapter } = setup(route, { upstream: throwing })
    const error = await captureRejection(adapter.stream({ provider: 'taiji-route-demo', model: 'demo', messages: [] }))
    expect(error?.code).toBe('ROUTE_MEMBER_UNAVAILABLE')
    expect(error?.message).toContain('UNKNOWN: waterfall middleware exploded')
  })
})

describe('listModels / resolveModel（暴露面与元数据规则）', () => {
  function setup(holder: { routes: RouteEntry[]; whitelist: string[] }, members: Record<string, FakeMemberConfig>) {
    const { llm } = fakeLlm(members)
    const adapter = createRouteAdapter({
      readSnapshot: () => ({ routes: holder.routes, whitelist: holder.whitelist }),
      llm,
      credentials: fakeCredentials(),
      readProviderProfiles: fakeProfiles({}),
      now: FIXED_NOW,
    })
    return adapter
  }

  it('白名单勾选才暴露；悬挂条目静默跳过（V6 步骤 2 / D1）', async () => {
    const holder = {
      routes: [{ id: 'r1', name: 'R1', members: [] }] as RouteEntry[],
      whitelist: ['r1', 'ghost'], // ghost = 悬挂
    }
    const adapter = setup(holder, {})
    expect(await adapter.listModels('taiji-route-r1')).toEqual([{ provider: 'taiji-route-r1', id: 'r1', name: 'R1' }])
    expect(await adapter.listModels('taiji-route-ghost')).toEqual([]) // 悬挂跳过
    holder.whitelist = []
    expect(await adapter.listModels('taiji-route-r1')).toEqual([]) // 取消勾选即不暴露
  })

  it('providerInfo 显示名 = 路由名（对话流分组标题）；resolveModel 与 listModels 同源', async () => {
    const holder = { routes: [{ id: 'r1', name: '旗舰路由', members: [] }] as RouteEntry[], whitelist: ['r1'] }
    const adapter = setup(holder, {})
    expect(adapter.providerInfo('taiji-route-r1')).toEqual({ id: 'taiji-route-r1', name: '旗舰路由' })
    expect(adapter.providerInfo('taiji-route-missing')).toEqual({ id: 'taiji-route-missing', name: 'taiji-route-missing' })
    const resolved = await adapter.resolveModel('taiji-route-r1', 'r1', undefined)
    expect(resolved).toMatchObject({ provider: 'taiji-route-r1', id: 'r1', name: '旗舰路由' })
  })

  it('元数据规则（D4）：reasoning efforts 取成员交集；contextWindow 取最小值；解析不到不声明', async () => {
    const holder = {
      routes: [{
        id: 'r1',
        name: 'R1',
        members: [
          { provider: 'p1', model: 'm', order: 1, condition: { type: 'none' } },
          { provider: 'p2', model: 'm', order: 2, condition: { type: 'none' } },
        ],
      }] as RouteEntry[],
      whitelist: ['r1'],
    }
    const adapter = setup(holder, {
      p1: { models: ['m'], contextWindow: 8000, reasoningEfforts: ['off', 'high'] },
      p2: { models: ['m'], contextWindow: 16000, reasoningEfforts: ['off', 'high', 'max'] },
    })
    const resolved = await adapter.resolveModel('taiji-route-r1', 'r1', undefined)
    expect(resolved.context?.contextWindow).toBe(8000) // 最小值
    expect(resolved.reasoning?.efforts.map((effort: { id: string }) => effort.id)).toEqual(['off', 'high']) // 交集
    // 成员无思考能力（reasoning 缺席）→ 不声明 reasoning。
    const holderNoReasoning = {
      routes: [{ id: 'r2', name: 'R2', members: [{ provider: 'p3', model: 'm', order: 1, condition: { type: 'none' } }] }] as RouteEntry[],
      whitelist: ['r2'],
    }
    const adapterNoReasoning = setup(holderNoReasoning, { p3: { models: ['m'], contextWindow: 4000 } })
    const resolvedNoReasoning = await adapterNoReasoning.resolveModel('taiji-route-r2', 'r2', undefined)
    expect(resolvedNoReasoning.reasoning).toBeUndefined()
    expect(resolvedNoReasoning.context?.contextWindow).toBe(4000)
  })
})

describe('求值纯函数对拍（Node 复刻 ↔ client 权威源，禁双实现漂移）', () => {
  /** 固定用例集：两侧同输入，逐用例相等断言。 */
  const cases = [
    { at: at(2026, 1, 5, 9, 30), day: 0, slot: 19 }, // 周一 09:30
    { at: at(2026, 1, 5, 9, 29), day: 0, slot: 18 }, // 右开边界
    { at: at(2026, 1, 4, 23, 59), day: 6, slot: 47 }, // 周日末格
    { at: at(2026, 1, 10, 0, 0), day: 5, slot: 0 }, // 周六首格
    { at: at(2026, 3, 8, 14, 0), day: 6, slot: 28 }, // 周日午后
  ]

  it('slotIndexOf / isSlotCoveredAt / evaluateConditionAt / evaluateRouteAt 双侧一致', () => {
    const weekly = maskAt(0, 19)
    const special: RouteWindowMask = {
      days: weekly.days,
      specialDates: [{ date: '01-05', name: '日', mode: 'exclude', mask: Array.from({ length: 48 }, (_, s) => s === 19) }],
    }
    const route: RouteEntry = {
      id: 'r',
      name: 'R',
      members: [
        { provider: 'a', model: 'm', order: 1, condition: { type: 'window', window: special } },
        { provider: 'b', model: 'm', order: 2, condition: { type: 'none' } },
      ],
    }
    for (const item of cases) {
      expect(nodeSlotIndexOf(item.at)).toEqual(slotIndexOf(item.at))
      expect(nodeSlotIndexOf(item.at)).toEqual({ day: item.day, slot: item.slot })
      expect(nodeIsSlotCoveredAt(weekly, item.at)).toBe(isSlotCoveredAt(weekly, item.at))
      expect(nodeIsSlotCoveredAt(special, item.at)).toBe(isSlotCoveredAt(special, item.at))
      expect(nodeEvaluateConditionAt({ type: 'window', window: special }, item.at)).toBe(
        evaluateConditionAt({ type: 'window', window: special }, item.at),
      )
      expect(nodeEvaluateRouteAt(route, item.at)?.provider).toBe(evaluateRouteAt(route, item.at)?.provider)
    }
  })

  it('sanitize 双侧一致（脏数据容忍形态一致）', () => {
    const rawRoutes = [
      { id: 'ok', name: 'OK', members: [{ provider: 'p', model: 'm', order: 1, condition: { type: 'window', window: { days: [[true]], specialDates: [{ date: '01-05', name: '日', mode: 'include' }] } } }] },
      { id: '', name: 'bad', members: [] },
      { id: 'no-members', name: 'bad' },
      null,
    ]
    const rawWhitelist = ['a', 'b', 'a', '', 42]
    expect(JSON.stringify(nodeSanitizeRoutes(rawRoutes))).toBe(JSON.stringify(sanitizeRoutes(rawRoutes)))
    expect(nodeSanitizeWhitelist(rawWhitelist)).toEqual(sanitizeWhitelist(rawWhitelist))
  })

  it('ROUTE_PROVIDER_PREFIX 双侧同值', async () => {
    const client = await import('./client/model-service/route-evaluate')
    expect(client.ROUTE_PROVIDER_PREFIX).toBe(ROUTE_PROVIDER_PREFIX)
  })
})

describe('路由 id 派生查重加序号（AX11/D5/V5 步骤 2）', () => {
  it('显示名 → ASCII kebab；撞 routes 与白名单（含悬挂）加序号 -2/-3', () => {
    const routes: RouteEntry[] = [{ id: 'demo', name: '演示', members: [] }]
    expect(deriveRouteId('Demo', routes, [])).toBe('demo-2') // 与 routes 撞 → -2
    expect(deriveRouteId('Ghost', routes, ['ghost', 'demo-2'])).toBe('ghost-2') // 悬挂白名单条目参与查重
    expect(deriveRouteId('Brand New', routes, ['demo', 'demo-2'])).toBe('brand-new')
    expect(deriveRouteId('中文路由', [], [])).toBe('p-1') // 非 ASCII 回落（provider-key 同源）
  })

  it('连续撞名序号递增不重叠', () => {
    const routes: RouteEntry[] = [
      { id: 'demo', name: 'a', members: [] },
      { id: 'demo-2', name: 'b', members: [] },
    ]
    expect(deriveRouteId('demo', routes, [])).toBe('demo-3')
  })
})

describe('错误码词表界面侧映射（route-errors，词表三条）', () => {
  it('词表成员判定与 Node 半场错误码同字面', () => {
    expect(isRouteErrorCode('ROUTE_NO_ACTIVE_MEMBER')).toBe(true)
    expect(isRouteErrorCode('ROUTE_MEMBER_UNAVAILABLE')).toBe(true)
    expect(isRouteErrorCode('ROUTE_REGISTRATION_FAILED')).toBe(true)
    expect(isRouteErrorCode('UNKNOWN')).toBe(false)
  })

  it('消息解析（契约见 route-errors 文件头）：凭据/供应商/模型三型归因与 unknown 兜底', () => {
    expect(parseMemberUnavailableMessage('route "r" member "p/m" is unavailable: credential TAIJI_A_KEY is not configured'))
      .toEqual({ kind: 'credential-missing', provider: 'p', model: 'm', ref: 'TAIJI_A_KEY' })
    expect(parseMemberUnavailableMessage('route "r" member "p/m" is unavailable: provider "p" is no longer registered'))
      .toEqual({ kind: 'provider-missing', provider: 'p', model: 'm' })
    expect(parseMemberUnavailableMessage('route "r" member "p/m" is unavailable: model "m" is not listed by provider "p"'))
      .toEqual({ kind: 'model-missing', provider: 'p', model: 'm' })
    expect(parseMemberUnavailableMessage('route "r" member "p/m" is unavailable: PROVIDER_ERROR: upstream 500'))
      .toEqual({ kind: 'unknown', provider: 'p', model: 'm' })
    expect(parseMemberUnavailableMessage('unrelated')).toBeUndefined()
  })

  it('locale 键映射：G18 三型标注键与无活跃成员两支键', () => {
    expect(memberAvailabilityLocaleKeys({ providerMissing: true, modelMissing: false, credentialMissing: true })).toEqual([
      'route.memberProviderMissing',
      'route.memberCredentialMissing',
    ])
    expect(memberAvailabilityLocaleKeys({ providerMissing: false, modelMissing: false, credentialMissing: false })).toEqual([])
    expect(memberUnavailableLocaleKey({ kind: 'credential-missing', provider: 'p', model: 'm', ref: 'R' }).messageKey).toBe('route.memberCredentialMissing')
    expect(noActiveMemberLocaleKey(true).messageKey).toBe('route.noActiveMember')
    expect(noActiveMemberLocaleKey(false).messageKey).toBe('route.notExposed')
  })
})

// ── 假宿主注册表（registerAdapter 校验语义按宿主 lib/index.js:1833-1901 复刻）──────────

function createFakeHostRegistry(initialRoutes: string[]) {
  const registry = new Set(initialRoutes)
  const errors: string[] = []
  let commitCount = 0
  let volatileHandler: (() => void) | undefined
  let activeRoutes: string[] = []

  const makeLlmError = (code: string, message: string): Error & RouteLikeError => {
    const error = new Error(message) as Error & RouteLikeError
    error.code = code
    error.failure = { message, code }
    return error
  }

  const ctx = {
    llm: {
      registerAdapter: (providers: string[], adapter: { providerInfo: (provider: string) => { id: string; name: string } }) => {
        if (providers.length === 0) throw makeLlmError('INVALID_ADAPTER', 'an adapter must register at least one provider')
        const owned: string[] = []
        for (const provider of providers) {
          if (registry.has(provider)) throw makeLlmError('DUPLICATE_ADAPTER', `an adapter for provider "${provider}" is already registered`)
          const info = adapter.providerInfo(provider)
          if (info.id !== provider || typeof info.name !== 'string' || info.name.length === 0) {
            throw makeLlmError('INVALID_ADAPTER', `adapter metadata for provider "${provider}" must preserve its id`)
          }
          owned.push(provider)
        }
        commitCount += 1
        activeRoutes = [...owned]
        for (const provider of owned) registry.add(provider)
        const handle = (() => {
          for (const provider of activeRoutes) registry.delete(provider)
          activeRoutes = []
        }) as (() => void) & { replace: (next: string[]) => void }
        handle.replace = (next: string[]) => {
          for (const provider of next) {
            if (registry.has(provider) && !activeRoutes.includes(provider)) {
              throw makeLlmError('DUPLICATE_ADAPTER', `an adapter for provider "${provider}" is already registered`)
            }
          }
          for (const provider of activeRoutes) registry.delete(provider)
          activeRoutes = [...next]
          for (const provider of next) registry.add(provider)
          commitCount += 1
        }
        return handle
      },
    },
    logger: {
      error: (message: string) => { errors.push(typeof message === 'string' ? message : String(message)) },
      warn: () => {},
    },
    on: (_event: string, handler: () => void) => {
      volatileHandler = handler
      return () => { volatileHandler = undefined }
    },
  }
  return {
    ctx,
    errors,
    get commitCount() {
      return commitCount
    },
    registeredIds: () => [...registry],
    fireVolatile: () => volatileHandler?.(),
    /** 测试辅助：宿主侧撤掉一个 route（模拟宿主适配器消失，验证插件幂等重试）。 */
    releaseRoute: (provider: string) => { registry.delete(provider) },
  }
}

/** 迭代 adapter.stream 收集第一个抛出的错误（Generator throw 发生在首次 next）。 */
async function captureRejection(stream: AsyncGenerator<Record<string, unknown>>): Promise<(Error & RouteLikeError) | undefined> {
  try {
    for await (const chunk of stream) void chunk
  } catch (error) {
    return error as Error & RouteLikeError
  }
  return undefined
}
