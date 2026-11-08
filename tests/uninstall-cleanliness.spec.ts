import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createTsxLoader } from '../client/testing/load-tsx'
import { PLUGIN_ENTRY_ID } from '../client/persist'
import { THEME_LAYER_SOURCE, STRUCTURE_LAYER_SOURCE } from '../client/theme/apply'

/**
 * 卸载清洁度单测（设计 RL4 的机器化通道 + 验收 V5 的可机器判部分）。
 *
 * V5 要求三处痕迹在卸载后全部消失，且「不依赖页面重载以外的用户操作」：
 *   ① 覆盖层撤除 —— `theme.overrideTokens` 返回的 disposer 是普通闭包、无 fiber 绑定（AS10），
 *      只有经 `ctx.effect` 托管才会随插件卸载执行；不托管就永久留在宿主的 token 层里。
 *   ② 槽位贡献撤销 —— 品牌三槽与外观行的 register disposer 同样只在 effect 托管下撤销。
 *   ③ 持久记录清除 —— 本包的持久状态在**插件 Config** 里，Config 落在 profile patch 的本包行上，
 *      `dsh plugin remove` 移除该行即带走配置，**不需要本包代码参与**（这正是 D2 放弃
 *      localStorage 的理由：那时卸载后没有任何执行者能删键）。本条因此不断言「有清理代码」，
 *      而断言「持久状态的位置确实是那一行」+「没有第二条持久通道」。
 *
 * 真实宿主行为（截图对比 / 变量值对比 / `html` 残留检查）归 V5 的 L3 场景；本层只锁机器可判部分。
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

describe('V5 卸载清洁度', () => {
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
      logger: { error() {}, warn() {} },
    }

    const loader = createTsxLoader()
    const module = loader.load(APPLY_PATH) as unknown as { apply: (ctx: unknown) => void }
    module.apply(ctx)
    expect(unregistered).toEqual([])
    for (const dispose of [...effects].reverse()) dispose()
    // 七个槽位贡献（品牌三槽 + 外观行 + composer 配色 chip + 设置分区 + 项目分组浏览器）的 disposer
    // 都要随 fiber 卸载执行——新槽位接入装配时必须同步扩这里的期望（卸载清洁度不豁免新贡献）
    expect(unregistered.sort()).toEqual([
      'conversation.hero.brand.mark',
      'conversation.input.left',
      'settings.general.item',
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
    expect(Object.keys(Config.dict)).toEqual(['appearance', 'projects', 'assignments', 'expanded'])
    expect(Config.dict.appearance.meta.volatile).toBe(true)
    // projects/assignments/expanded 同为 volatile（持久但免重挂载——设置表单通道只收 volatile 字段）
    expect(Config.dict.projects.meta.volatile).toBe(true)
    expect(Config.dict.assignments.meta.volatile).toBe(true)
    expect(Config.dict.expanded.meta.volatile).toBe(true)

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
    // 空集合，不是缺席）；appearance 仍是缺省不落键
    expect(section({})).toEqual({ projects: [], assignments: {}, expanded: [] })
    expect(section({ appearance: 'hao' })).toEqual({ appearance: 'hao', projects: [], assignments: {}, expanded: [] })
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
