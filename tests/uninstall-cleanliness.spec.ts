import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createTsxLoader } from '../client/testing/load-tsx'
import { PLUGIN_ENTRY_ID } from '../client/persist'
import { THEME_LAYER_SOURCE, STRUCTURE_LAYER_SOURCE } from '../client/theme/apply'
import { deleteProvider, type SettingsOp } from '../client/model-service/settings-client'
import type { PendingUnsetRegistration } from '../client/model-service/credentials-client'

/**
 * 卸载清洁度单测（设计 RL4/RL6 的机器化通道 + 验收 V5（p1 设计包卸载场景编号，非本包
 * V5 路由求值场景）的可机器判部分）。
 *
 * 该 V5 要求三处痕迹在卸载后全部消失，且「不依赖页面重载以外的用户操作」：
 *   ① 覆盖层撤除 —— `theme.overrideTokens` 返回的 disposer 是普通闭包、无 fiber 绑定（AS10），
 *      只有经 `ctx.effect` 托管才会随插件卸载执行；不托管就永久留在宿主的 token 层里。
 *   ② 槽位贡献撤销 —— 品牌三槽与外观行的 register disposer 同样只在 effect 托管下撤销。
 *   ③ 持久记录清除 —— 本包的持久状态在**插件 Config** 里，Config 落在 profile patch 的本包行上，
 *      `dsh plugin remove` 移除该行即带走配置，**不需要本包代码参与**（这正是 D2 放弃
 *      localStorage 的理由：那时卸载后没有任何执行者能删键）。本条因此不断言「有清理代码」，
 *      而断言「持久状态的位置确实是那一行」+「没有第二条持久通道」。
 *
 * RL6（模型服务卸载清洁度，M3 扩展）：
 *   ④ 插件自有贡献撤除 —— Node 半场的 llm 适配器注册与 credentials 调用点随 fiber 卸载撤销：
 *      adapter 注册经 `ctx.inject(['llm'])` → `child.effect(ensureRouteRegistration)` 托管，
 *      credentials 预检（describe）只活在 adapter 闭包内——注册撤销即调用点不可达，卸载后
 *      volatile 重算订阅也撤销（不复活注册）。
 *   ⑤ 无孤儿 ref —— 构造场景（模拟设置文档 + 凭据文件态 + 插件 Config）的前置 =
 *      pendingCredentialUnsets 为空（清洁环境）；在该前置下，删除供应商（真实链路
 *      deleteProvider）后凭据文件态的 TAIJI_* ref 全部被宿主设置文档 providers.apiKeyEnv
 *      引用。唯一例外 = 卸载前已登记且未重试成功的 ref（unset 失败登记进待清理清单，
 *      V3 已知代价句覆盖、不判失败）；失败路径残留不进本 spec 的判定。
 *
 * 真实宿主行为（截图对比 / 变量值对比 / `html` 残留检查）归该卸载验收场景（V5）的 L3 场景；本层只锁机器可判部分。
 */

const APPLY_PATH = fileURLToPath(new URL('../client/apply.ts', import.meta.url))
const INDEX_PATH = fileURLToPath(new URL('../index.js', import.meta.url))
const PATCH_PATH = fileURLToPath(new URL('../cordis.patch.yml', import.meta.url))
const CLIENT_DIR = fileURLToPath(new URL('../client', import.meta.url))

/** 递归收集目录下的源码文件（按相对路径排序，保证输出稳定可复算）。 */
function collectSources(dirAbs: string): string[] {
  const files: string[] = []
  const walk = (abs: string) => {
    for (const name of readdirSync(abs).sort()) {
      if (name === 'node_modules' || name.startsWith('.')) continue
      const child = `${abs}/${name}`
      if (statSync(child).isDirectory()) walk(child)
      else if (/\.(?:ts|tsx|js|mjs|css)$/.test(name)) files.push(child)
    }
  }
  walk(dirAbs)
  return files
}

/**
 * Web Storage 的**使用**形态（不是提及形态）。
 *
 * 为什么不直接禁 `localStorage` 字样：`client/persist.ts` 的注释整段解释「为什么不用
 * localStorage」，那是被否决方案的登记，禁字样会把文档也判成违规。真正的红线是**调用**——
 * 一旦有任何一处调用，卸载后就没人删它（AX3 第三处痕迹永远不可达）。
 */
const STORAGE_USAGE_RE =
  /(?:localStorage|sessionStorage)\s*\.\s*(?:getItem|setItem|removeItem|clear)\s*\(|(?:window|globalThis)\s*\.\s*(?:localStorage|sessionStorage)|\bindexedDB\s*\.\s*open\s*\(/

/** 在一段源码里找 Web Storage 使用点；返回命中行（1-based）。 */
function findStorageUsages(source: string): string[] {
  return source
    .split('\n')
    .map((line, index) => ({ line: index + 1, text: line }))
    .filter(({ text }) => STORAGE_USAGE_RE.test(text))
    .map(({ line, text }) => `第 ${line} 行: ${text.trim()}`)
}

describe('卸载清洁度（V5 = p1 设计包卸载验收场景）', () => {
  it('① 覆盖层撤除：主题层与结构层的 disposer 都经 ctx.effect 托管，卸载即执行', () => {
    const removed: string[] = []
    const effects: (() => void)[] = []
    const formListeners = new Set<() => void>()
    const ctx = {
      effect(callback: () => (() => void) | void) {
        const result = callback()
        if (typeof result === 'function') effects.push(result)
      },
      on() { return () => {} },
      locale: { register: () => () => {}, bind: (ns: string) => (key: string) => key },
      slots: {
        inject(_key: string, callback: () => (() => void) | void) {
          // 宿主语义（ui-renderer/src/client/registry.ts 的 inject）：callback 的返回值
          // （register 的 disposer）被包进调用者 fiber 的嵌套 effect，fiber 卸载即撤除注册
          const result = callback()
          const dispose = typeof result === 'function' ? result : () => {}
          ctx.effect(() => dispose)
          return dispose
        },
        // register 只返回 disposer，不自己挂 effect（挂载由 inject 的嵌套 effect 完成）
        register() { return () => {} },
        entries() { return [] },
      },
      theme: {
        overrideTokens(source: string) {
          return () => { removed.push(source) }
        },
        getTheme() { return { preference: 'system' as const, active: { colorScheme: 'dark' as const } } },
        setTheme() {},
      },
      configForms: {
        get() {
          return {
            getSnapshot: () => ({ status: 'loading' as const, value: undefined, revision: undefined, writable: false }),
            subscribe(listener: () => void) {
              formListeners.add(listener)
              return () => { formListeners.delete(listener) }
            },
            set: async () => true,
          }
        },
      },
      // 模型服务分区的装配面（apply.ts ⑦′ 读 ctx.remote 三通道透传进分区 deps；本用例
      // 不渲染分区组件，最小可读面即可——装配期不调方法）
      remote: { settings: {}, llm: {}, credentials: {} },
      logger: { error() {}, warn() {} },
    }

    const loader = createTsxLoader()
    const module = loader.load(APPLY_PATH) as unknown as { apply: (ctx: unknown) => void }
    module.apply(ctx)

    // 托管是必要条件：没有 effect 就没有卸载时的撤除（AS10 反证）
    expect(effects.length).toBeGreaterThanOrEqual(3)
    expect(removed).toEqual([])
    // 反序执行 = cordis fiber 卸载语义
    for (const dispose of [...effects].reverse()) dispose()
    expect(removed).toEqual([STRUCTURE_LAYER_SOURCE, THEME_LAYER_SOURCE])
    expect(formListeners.size).toBe(0)
  })

  it('② 槽位贡献撤销：品牌三槽与外观行的 disposer 都在卸载时执行', () => {
    const unregistered: string[] = []
    const effects: (() => void)[] = []
    const ctx = {
      effect(callback: () => (() => void) | void) {
        const result = callback()
        if (typeof result === 'function') effects.push(result)
      },
      on() { return () => {} },
      locale: { register: () => () => {}, bind: (ns: string) => (key: string) => key },
      slots: {
        inject(_key: string, callback: () => (() => void) | void) {
          // 宿主语义（ui-renderer/src/client/registry.ts 的 inject）：callback 的返回值
          // （register 的 disposer）被包进调用者 fiber 的嵌套 effect，fiber 卸载即撤除注册
          const result = callback()
          const dispose = typeof result === 'function' ? result : () => {}
          ctx.effect(() => dispose)
          return dispose
        },
        register(options: { name: string }) {
          return () => { unregistered.push(options.name) }
        },
        entries() { return [] },
      },
      theme: {
        overrideTokens() { return () => {} },
        getTheme() { return { preference: 'system' as const, active: { colorScheme: 'dark' as const } } },
        setTheme() {},
      },
      configForms: {
        get() {
          return {
            getSnapshot: () => ({ status: 'loading' as const, value: undefined, revision: undefined, writable: false }),
            subscribe: () => () => {},
            set: async () => true,
          }
        },
      },
      // 模型服务分区的装配面（同 ①：装配期透传，不调方法）
      remote: { settings: {}, llm: {}, credentials: {} },
      logger: { error() {}, warn() {} },
    }

    const loader = createTsxLoader()
    const module = loader.load(APPLY_PATH) as unknown as { apply: (ctx: unknown) => void }
    module.apply(ctx)
    expect(unregistered).toEqual([])
    for (const dispose of [...effects].reverse()) dispose()
    // 九个槽位贡献（品牌三槽 + 外观行 + composer 配色 chip + 设置分区×2（太极分区与模型
    // 服务分区各注册一条 settings.section，id 不同）+ 项目分组浏览器 + 会话头状态图标）
    // 的 disposer 都要随 fiber 卸载执行——新槽位接入装配时必须同步扩这里的期望（卸载
    // 清洁度不豁免新贡献）
    expect(unregistered.sort()).toEqual([
      'conversation.hero.brand.mark',
      'conversation.input.left',
      'conversation.session.header.actions',
      'settings.general.item',
      'settings.section',
      'settings.section',
      'sidebar.brand.mark',
      'sidebar.brand.name',
      'sidebar.workspaces',
    ])
  })

  it('③ 持久记录随 bundle 行消失：命名空间 = profile 行 id，Config 落在同一行上', async () => {
    // 行 id 与浏览器半场使用的命名空间必须是同一个字面值——「配置随行消失」靠的就是这个同一性
    const patch = readFileSync(PATCH_PATH, 'utf8')
    const patchLines = patch.split('\n').map((line) => line.trim())
    expect(patchLines).toContain(`- id: ${PLUGIN_ENTRY_ID}`)
    expect(patchLines).toContain(`name: ${PLUGIN_ENTRY_ID}`)

    // Host 侧必须真的声明了 Config，且 appearance 是 volatile 字段——否则命名空间根本不会
    // 被 settings.describe 服务（客户端快照恒 unavailable），「配置行」无从存在
    const index = await import(pathToFileURL(INDEX_PATH).href)
    const Config = (index as { Config?: unknown }).Config as {
      [key: symbol]: unknown
      type: string
      dict: Record<string, { meta: { volatile?: boolean }; type: string }>
    }
    expect(Config).toBeDefined()
    expect(Reflect.get(Config, Symbol.for('schemastery'))).toBe(true)
    expect(Config.type).toBe('object')
    expect(Object.keys(Config.dict)).toEqual([
      'appearance', 'projects', 'assignments', 'expanded',
      'pendingCredentialUnsets', 'routes', 'whitelist',
    ])
    expect(Config.dict.appearance.meta.volatile).toBe(true)
    // 其余六个字段同为 volatile（持久但免重挂载——设置表单通道只收 volatile 字段）；
    // pendingCredentialUnsets/routes/whitelist 是模型服务字段（dsh-model-service M1/M2）
    expect(Config.dict.projects.meta.volatile).toBe(true)
    expect(Config.dict.assignments.meta.volatile).toBe(true)
    expect(Config.dict.expanded.meta.volatile).toBe(true)
    expect(Config.dict.pendingCredentialUnsets.meta.volatile).toBe(true)
    expect(Config.dict.routes.meta.volatile).toBe(true)
    expect(Config.dict.whitelist.meta.volatile).toBe(true)

    // 行在、用户没点选过 → 段里没有 appearance（默认色是包内默认，不写持久键）。
    // 这里的派生视图复刻宿主 describe 的两步：plainConfig 拆 volatile 包装 + projectForm 丢 undefined 键。
    const validate = (Config as unknown as { '~standard': { validate: (input: unknown) => { value: Record<string, unknown> } } })['~standard'].validate
    const WRITE = Symbol.for('cosmokit.volatile.write')
    const unwrap = (value: unknown): unknown => {
      if (value !== null && typeof value === 'object' && WRITE in (value as object)) {
        return unwrap((value as { get: () => unknown }).get())
      }
      if (Array.isArray(value)) return value.map(unwrap)
      if (value !== null && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, unwrap(child)]))
      }
      return value
    }
    const section = (input: unknown): Record<string, unknown> => {
      const resolved = validate(input).value as Record<string, unknown>
      const out: Record<string, unknown> = {}
      for (const [key, raw] of Object.entries(resolved)) {
        const value = unwrap(raw)
        if (value !== undefined) out[key] = value
      }
      return out
    }
    // schemastery 对 array/dict 字段的 undefined 输入回填空集合默认值（用户没建过项目 =
    // 空集合，不是缺席；模型服务三字段同理）；appearance 仍是缺省不落键
    expect(section({})).toEqual({ projects: [], assignments: {}, expanded: [], pendingCredentialUnsets: [], routes: [], whitelist: [] })
    expect(section({ appearance: 'hao' })).toEqual({ appearance: 'hao', projects: [], assignments: {}, expanded: [], pendingCredentialUnsets: [], routes: [], whitelist: [] })
  })

  it('③ 持久状态没有第二条通道：浏览器半场零 Web Storage 调用', () => {
    const files = [...collectSources(CLIENT_DIR), INDEX_PATH]
    expect(files.length).toBeGreaterThan(0)
    const usages = files.flatMap((file) => {
      const found = findStorageUsages(readFileSync(file, 'utf8'))
      return found.map((line) => `${file.replace(`${CLIENT_DIR}/../`, '')}: ${line}`)
    })
    expect(usages).toEqual([])

    // 负对照：扫描器必须能拒绝「真的用了 Web Storage」的源码——否则上面的空结果可能只是恒绿
    expect(findStorageUsages("const id = localStorage.getItem('taiji-theme')")).toHaveLength(1)
    expect(findStorageUsages('window.sessionStorage.setItem(id, value)')).toHaveLength(1)
    // 而注释里提及被否决的方案不算使用（persist.ts 整段在解释为什么不用它）
    expect(findStorageUsages(' * 为什么不是 localStorage（D2 本轮裁决）')).toEqual([])
  })

  it('③ 卸载后重新装载读不到旧配色（配置随行走了，不是留在某处）', () => {
    // 第一次装载：持久值 hao 被接进来
    const first = createUninstallHarness({ persisted: { appearance: 'hao' } }).mount()
    expect(first.themeId()).toBe('hao')

    // `dsh plugin remove`：本包行（连同其 Config）从 profile patch 消失 → 命名空间不再被服务
    first.unload()
    first.removeRow()

    // 重新装载（等价于装回来但配置已随行消失）：回落包默认色玄
    const second = createUninstallHarness({ initialStatus: 'unavailable' }).mount()
    expect(second.themeId()).toBe('xuan')
  })

  it('④ 插件自有贡献撤除（RL6）：llm 适配器注册与 credentials 调用点随 fiber 卸载撤销', async () => {
    const index = await import(pathToFileURL(INDEX_PATH).href) as {
      apply: (ctx: unknown, config: unknown) => void
    }

    // 一条路由 + 白名单勾选（让 ensureRouteRegistration 有注册对象；condition none = 恒命中）
    const routeEntry = {
      id: 'r1',
      name: 'R1',
      members: [{ provider: 'p1', model: 'm1', order: 0, condition: { type: 'none' } }],
    }
    const config = {
      routes: { get: () => [routeEntry] },
      whitelist: { get: () => ['r1'] },
    }

    const credentialCalls: string[] = []
    const registeredProviderIds: string[][] = []
    const adapterDisposals: string[][] = []
    let adapter: { stream: (options: { provider: string; model: string }) => AsyncGenerator<unknown> } | undefined
    let volatileUnsubscribed = false
    const volatileListeners: (() => void)[] = []
    const injectCalls: { names: string[]; callback: (child: unknown) => void }[] = []
    const childEffects: (() => void)[] = []

    // 宿主 services 的最小假件：credentials 预检（describe）记录调用，llm 供注册与转发。
    // describe 双形态出处不同：单 ref 形态出自 dsh-credentials-local 进程内凭据服务
    // （child.get('credentials') 的真身，Node 半场 assertMemberAvailable 直接读
    // status.configured）；数组形态出自 dsh-api-settings-controller 的
    // CredentialsController.describe 网关（{refs} 批量，浏览器半场 credentials-client
    // 经 remote 通道的读法，返回按 ref 键控的视图表）
    const fakeCredentials = {
      describe: async (refs: string | string[]) => {
        const list = typeof refs === 'string' ? [refs] : refs
        credentialCalls.push(...list)
        const view = { configured: true, writable: true }
        return typeof refs === 'string' ? view : Object.fromEntries(list.map((ref) => [ref, view]))
      },
      set: async () => {},
      unset: async () => {},
    }
    const fakeLlm = {
      listProviders: async () => [{ id: 'p1', name: 'P1' }],
      listModels: async () => [{ id: 'm1', name: 'M1' }],
      resolveModelInfo: async () => undefined,
      stream: async function * (): AsyncGenerator<unknown> {},
    }
    // 宿主 settings 视图（apply 内 readProviderProfiles 的数据源：成员 apiKeyEnv 来源）
    const childSettings = {
      describe: () => [{ ns: 'llm-pi-ai', value: { providers: { p1: { apiKeyEnv: 'TAIJI_P1_KEY' } } } }],
    }
    const child = {
      effect(callback: () => (() => void) | void) {
        const result = callback()
        if (typeof result === 'function') childEffects.push(result)
      },
      on(_event: string, listener: () => void) {
        volatileListeners.push(listener)
        return () => { volatileUnsubscribed = true }
      },
      get(name: string) {
        if (name === 'settings') return childSettings
        if (name === 'credentials') return fakeCredentials
        return undefined
      },
      llm: {
        // 宿主语义（dsh-llm registerAdapter）：返回的 handle 本身是可调用的反注册函数
        //（调用 = 撤销注册），带 .replace(ids) 方法供热重算换注册集合
        registerAdapter(providers: string[], registered: NonNullable<typeof adapter>) {
          registeredProviderIds.push(providers)
          adapter = registered
          const handle = (() => { adapterDisposals.push(providers) }) as (() => void) & { replace: (ids: string[]) => void }
          handle.replace = () => {}
          return handle
        },
        ...fakeLlm,
      },
    }
    const ctx = {
      effect(callback: () => (() => void) | void) {
        callback()
      },
      on() { return () => {} },
      get() { return undefined },
      logger: { error() {}, warn() {} },
      // 宿主语义：inject 回调在该服务于本树就位时执行；测试显式驱动（llm 在场形态）
      inject(names: string[], callback: (child: unknown) => void) {
        injectCalls.push({ names, callback })
      },
    }

    index.apply(ctx, config)
    expect(injectCalls.map((call) => call.names)).toContainEqual(['llm'])
    for (const call of injectCalls) call.callback(child)

    // 注册发生：provider id 满足 AX5 前缀硬约束
    expect(registeredProviderIds).toEqual([['taiji-route-r1']])

    // credentials 调用点活在注册体内的 adapter 上：成员预检（describe）只在 stream 转发时触达
    const chunks: unknown[] = []
    for await (const chunk of adapter!.stream({ provider: 'taiji-route-r1', model: 'r1' })) chunks.push(chunk)
    expect(chunks).toEqual([])
    expect(credentialCalls).toEqual(['TAIJI_P1_KEY'])

    // 卸载（反序 = cordis fiber 语义）：adapter 反注册 + volatile 重算订阅撤销
    for (const dispose of [...childEffects].reverse()) dispose()
    expect(adapterDisposals).toEqual([['taiji-route-r1']])
    expect(volatileUnsubscribed).toBe(true)

    // 调用链死亡：Config 热重算事件再触发也不复活注册（订阅已撤）
    for (const listener of volatileListeners) listener()
    expect(registeredProviderIds).toEqual([['taiji-route-r1']])
  })

  it('⑤ 无孤儿 ref（RL6）：清洁前置下删除供应商后凭据文件 TAIJI_* ref 全部被 providers.apiKeyEnv 引用', async () => {
    // 孤儿判定（RL6 无孤儿命题）：凭据文件态中的 TAIJI_* ref 减去宿主设置文档
    // providers.apiKeyEnv 引用的集合，再减去待清理清单登记的例外（卸载前已登记且未重试
    // 成功的 ref——V3 已知代价句覆盖，不判失败），剩余即孤儿。
    const orphanRefs = (credentialRefs: string[], apiKeyEnvs: string[], pendingUnsets: string[]): string[] => {
      const referenced = new Set(apiKeyEnvs)
      const excepted = new Set(pendingUnsets)
      return credentialRefs.filter((ref) => ref.startsWith('TAIJI_') && !referenced.has(ref) && !excepted.has(ref))
    }

    // 构造场景（清洁环境）：宿主设置文档 providers 段 + 凭据文件态 + 插件 Config 待清理清单
    let providers: Record<string, { apiKeyEnv?: string }> = { foo: { apiKeyEnv: 'TAIJI_FOO_KEY' } }
    let credentialRefs = ['TAIJI_FOO_KEY', 'HOST_REF'] // HOST_REF = 宿主自有 ref（不在判定范围）
    const pendingUnsets: string[] = []

    // 前置断言：构造场景的 pendingCredentialUnsets 为空（清洁环境）
    expect(pendingUnsets).toEqual([])

    const host = {
      settings: {
        describe: async () => ({
          ok: true,
          value: {
            writable: true,
            namespaces: [{ ns: 'llm-pi-ai', value: { providers, revision: 3 } }],
          },
        }),
        mutate: async (_ns: string, ops: SettingsOp[]) => {
          for (const op of ops) {
            if (op.op === 'unset' && op.path[0] === 'providers') delete providers[op.path[1] as string]
          }
          // mutate 回执 = 命名空间视图（SettingsNamespaceViewLike），非 describe 的文档形状。
          return {
            ok: true,
            value: { ns: 'llm-pi-ai', value: { providers, revision: 4 } },
          }
        },
      },
      llm: {
        listProviders: async () => ({ ok: true, value: [] }),
        listConfigurableProviders: async () => ({ ok: true, value: [] }),
        discoverModels: async () => ({ ok: true, value: [] }),
      },
      credentials: {
        describe: async () => ({ ok: true, value: {} }),
        set: async () => ({ ok: true, value: undefined }),
        unset: async (ref: string) => {
          credentialRefs = credentialRefs.filter((entry) => entry !== ref)
          return { ok: true, value: undefined }
        },
      },
      logger: { error() {}, warn() {} },
    }
    type DeleteHost = Parameters<typeof deleteProvider>[0]
    type DeleteParams = Parameters<typeof deleteProvider>[1]

    // 删除供应商（真实链路 deleteProvider）：unset providers.foo + credentials.unset(TAIJI_FOO_KEY)
    const result = await deleteProvider(host as DeleteHost, {
      key: 'foo',
      existing: providers.foo,
      crossProfileConfirmed: false,
      registerPendingUnset: async (ref): Promise<PendingUnsetRegistration> => { pendingUnsets.push(ref); return { ok: true } },
    } as DeleteParams)
    expect(result.kind).toBe('deleted')
    expect(providers.foo).toBeUndefined()
    expect(credentialRefs).toEqual(['HOST_REF'])

    // 无孤儿：凭据文件态中 TAIJI_* ref 全部被 providers.apiKeyEnv 引用（前置为空清单时）
    const apiKeyEnvs = Object.values(providers).map((profile) => profile.apiKeyEnv).filter((ref): ref is string => typeof ref === 'string')
    expect(orphanRefs(credentialRefs, apiKeyEnvs, pendingUnsets)).toEqual([])

    // 例外形态（unset 失败）：ref 留在凭据文件 + deleteProvider 登记待清理清单 → 判定仍无孤儿
    providers = { bar: { apiKeyEnv: 'TAIJI_BAR_KEY' } }
    credentialRefs = ['TAIJI_BAR_KEY']
    const failingUnsets: string[] = []
    const failedResult = await deleteProvider({
      ...host,
      credentials: {
        ...host.credentials,
        // unset 失败按宿主网关真实形态 resolve {ok:false}（业务失败不 reject）。
        unset: async () => ({ ok: false, error: { code: 'credential/rejected', message: 'credentials service unavailable', details: {} } }),
      },
    } as DeleteHost, {
      key: 'bar',
      existing: { apiKeyEnv: 'TAIJI_BAR_KEY' },
      crossProfileConfirmed: false,
      registerPendingUnset: async (ref): Promise<PendingUnsetRegistration> => { failingUnsets.push(ref); return { ok: true } },
    } as DeleteParams)
    expect(failedResult.kind).toBe('deleted')
    expect(failingUnsets).toEqual(['TAIJI_BAR_KEY'])
    expect(orphanRefs(credentialRefs, [], failingUnsets)).toEqual([])

    // 负对照（登记通道缺失）：失败且未登记 → 判定出孤儿——「唯一例外 = 已登记」的判据
    // 必须配合登记路径成立，判定函数不是恒绿
    expect(orphanRefs(credentialRefs, [], [])).toEqual(['TAIJI_BAR_KEY'])
  })
})

/** 卸载场景用的最小宿主（只覆盖本文件断言需要的面）。 */
function createUninstallHarness(options: { persisted?: Record<string, unknown>; initialStatus?: 'loading' | 'unavailable' } = {}) {
  let status: 'loading' | 'ready' | 'unavailable' = options.initialStatus ?? (options.persisted === undefined ? 'loading' : 'ready')
  let value = options.persisted
  const listeners = new Set<() => void>()
  const layers: string[] = []
  const effects: (() => void)[] = []
  const registrations: { key: string; options: Record<string, unknown> }[] = []
  let selected = ''

  const ctx = {
    effect(callback: () => (() => void) | void) {
      const result = callback()
      if (typeof result === 'function') effects.push(result)
    },
    on() { return () => {} },
    locale: { register: () => () => {}, bind: (ns: string) => (key: string) => key },
    slots: {
      inject(_key: string, callback: () => (() => void) | void) {
        const result = callback()
        const dispose = typeof result === 'function' ? result : () => {}
        ctx.effect(() => dispose)
        return dispose
      },
      register(options: Record<string, unknown>) {
        registrations.push({ key: String(options.name), options })
        return () => {}
      },
      entries() { return [] },
    },
    theme: {
      overrideTokens(source: string) {
        layers.push(source)
        return () => {
          const index = layers.indexOf(source)
          if (index >= 0) layers.splice(index, 1)
        }
      },
      getTheme() { return { preference: 'system' as const, active: { colorScheme: 'dark' as const } } },
      setTheme() {},
    },
    configForms: {
      get() {
        return {
          getSnapshot: () => ({ status, value, revision: 1, writable: status === 'ready' }),
          subscribe(listener: () => void) {
            listeners.add(listener)
            return () => { listeners.delete(listener) }
          },
          async set(_field: string, next: unknown) {
            selected = String(next)
            return true
          },
        }
      },
    },
    // 模型服务分区的装配面（同 ①：装配期透传，本 harness 只驱动配色行，不调方法）
    remote: { settings: {}, llm: {}, credentials: {} },
    logger: { error() {}, warn() {} },
  }

  const loader = createTsxLoader()
  const module = loader.load(APPLY_PATH) as unknown as { apply: (ctx: unknown) => void }
  /** 外观行注册时经 `inject` 回调拿到的注入对象（与 UI 同一入口）。 */
  const appearanceInjected = () => {
    const row = registrations.find((entry) => entry.key === 'settings.general.item')
    const inject = row?.options.inject as (() => {
      getThemeId: () => string
      selectThemeId: (id: string) => void
    }) | undefined
    if (inject === undefined) throw new Error('外观行未注册')
    return inject()
  }

  return {
    mount() {
      module.apply(ctx)
      return this
    },
    /** 当前生效配色（经外观行注入对象读，与 UI 同源）。 */
    themeId(): string {
      return appearanceInjected().getThemeId()
    },
    selectThemeId(id: string) {
      appearanceInjected().selectThemeId(id)
      return this
    },
    unload() {
      for (const dispose of [...effects].reverse()) dispose()
      return this
    },
    /** 模拟 `dsh plugin remove`：行消失 → 命名空间不再被 describe 服务。 */
    removeRow() {
      status = 'unavailable'
      value = undefined
      for (const listener of [...listeners]) listener()
      return this
    },
    lastSelected: () => selected,
    layers: () => [...layers],
    listenerCount: () => listeners.size,
  }
}
