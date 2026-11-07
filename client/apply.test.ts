import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createTsxLoader, type FakeElement } from './testing/load-tsx'
import { resolveThemeTokens } from './theme/resolve'
import { STRUCTURE_LAYER_SOURCE, THEME_LAYER_SOURCE } from './theme/apply'
import { STRUCTURE_TOKENS } from './theme/structure'
import { APPEARANCE_FIELD, PLUGIN_ENTRY_ID } from './persist'
import type { ThemeId } from './theme/tokens'

/**
 * 装配入口单测（设计 §5 U3；验收 V4 的机器可判部分 + V5 的装配侧部分）。
 *
 * 为什么经测试夹具装载而不是直接 import：`client/apply.ts` 传递依赖 `client/brand/*.tsx` 与
 * `client/settings/appearance-row.tsx`，那两个文件从**宿主模块表** require `react` /
 * `react/jsx-runtime`（D3 零 npm 依赖），本仓 devDependencies 里没有 react，直接 import 会挂在
 * 模块解析上。夹具用 esbuild 把 .ts/.tsx 转 CJS 并供给假 react/jsx-runtime，于是可以**行为级**
 * 断言装配结果（调用序、层内容、写入序列、卸载后果），而不是正则扫源码。夹具边界见
 * `client/testing/load-tsx.ts` 头部：不做真实 DOM 与 React 协调，真渲染归 V1/V12 的 L3/L4 场景。
 *
 * 覆盖的机器可判面：
 *   · 装配序（locale 必须先于任何槽位与覆盖层）；
 *   · 持久命名空间 = 本包 profile 行 id；
 *   · 首装表 = 持久值（镜像未答时是包默认色玄）+ 结构层独立 source；
 *   · 持久值首达 → 换层（且只换一次）；
 *   · 用户点选 → 换层 + 写 Config（经外观行注入范围，端到端）；
 *   · 写入失败（拒绝 / 传输异常 / 命名空间未被服务）→ 显式上报、会话内不回退；
 *   · 全部贡献经 ctx.effect 托管，卸载后层、字典、槽位与订阅都不残留。
 */

const APPLY_PATH = fileURLToPath(new URL('./apply.ts', import.meta.url))

/** 假宿主记录的每一次调用（按发生序）。 */
interface HostLog {
  order: string[]
  localeRegistrations: { ns: string; languages: string[] }[]
  slotInjects: string[]
  slotRegistrations: { key: string; options: Record<string, unknown>; component: FakeElement['type'] }[]
  layers: { source: string; tokens: Record<string, unknown>; removed: boolean }[]
  setCalls: { field: string; value: unknown }[]
  errors: string[]
  warnings: string[]
  entryIds: string[]
  preferenceWrites: string[]
}

/** 假 ConfigForm：可控的写入结果队列与镜像到达时机。 */
interface FakeForm {
  status: 'loading' | 'ready' | 'unavailable'
  value: Record<string, unknown> | undefined
  revision: number
  writable: boolean
  listeners: Set<() => void>
}

function createHarness(options: { persisted?: Record<string, unknown>; writeResults?: boolean[]; rejectWith?: Error } = {}) {
  const log: HostLog = {
    order: [],
    localeRegistrations: [],
    slotInjects: [],
    slotRegistrations: [],
    layers: [],
    setCalls: [],
    errors: [],
    warnings: [],
    entryIds: [],
    preferenceWrites: [],
  }
  const effects: { label: string | undefined; dispose: (() => void) | undefined }[] = []
  const form: FakeForm = {
    status: options.persisted === undefined ? 'loading' : 'ready',
    value: options.persisted,
    revision: 7,
    writable: true,
    listeners: new Set(),
  }
  const writeResults = [...(options.writeResults ?? [true])]
  const themeListeners = new Set<() => void>()
  let preference: 'light' | 'dark' | 'system' = 'system'
  let scheme: 'light' | 'dark' = 'dark'

  const notifyForm = () => {
    for (const listener of [...form.listeners]) listener()
  }

  const ctx = {
    effect(callback: () => (() => void) | void, label?: string) {
      const result = callback()
      effects.push({ label, dispose: typeof result === 'function' ? result : undefined })
    },
    on(event: string, listener: () => void) {
      log.order.push(`on:${event}`)
      themeListeners.add(listener)
      return () => { themeListeners.delete(listener) }
    },
    locale: {
      register(ns: string, dictionaries: Record<string, unknown>) {
        log.order.push('locale.register')
        log.localeRegistrations.push({ ns, languages: Object.keys(dictionaries) })
        return () => { log.order.push('locale.unregister') }
      },
    },
    slots: {
      inject(key: string, callback: () => (() => void) | void) {
        log.order.push(`slots.inject:${key}`)
        log.slotInjects.push(key)
        // 宿主语义（ui-renderer/src/client/registry.ts 的 inject）：等槽位声明出现后执行
        // callback，并把callback 的返回值（register 的 disposer）包进**调用者 fiber 的嵌套
        // effect**——「The controller belongs to the caller's fiber, so plugin unload cancels a
        // pending wait and removes any active contribution」。本测试里四个目标槽的声明都在位，
        // 故同步执行。
        const result = callback()
        const dispose = typeof result === 'function' ? result : () => {}
        ctx.effect(() => dispose, `slots.inject(${JSON.stringify(key)})`)
        return dispose
      },
      register(options: Record<string, unknown>, component: unknown) {
        log.order.push(`slots.register:${String(options.name)}`)
        log.slotRegistrations.push({
          key: String(options.name),
          options,
          component: component as FakeElement['type'],
        })
        return () => { log.order.push(`slots.unregister:${String(options.name)}`) }
      },
      entries() {
        return []
      },
    },
    theme: {
      overrideTokens(source: string, tokens: Record<string, unknown>) {
        log.order.push(`overrideTokens:${source}`)
        const layer = { source, tokens, removed: false }
        log.layers.push(layer)
        return () => { layer.removed = true }
      },
      getTheme() {
        return { preference, active: { colorScheme: scheme } }
      },
      setTheme(id: 'light' | 'dark' | 'system') {
        log.preferenceWrites.push(id)
        preference = id
        scheme = id === 'light' ? 'light' : id === 'dark' ? 'dark' : scheme
      },
    },
    configForms: {
      get(entryId: string) {
        log.order.push('configForms.get')
        log.entryIds.push(entryId)
        return {
          getSnapshot: () => ({
            status: form.status,
            value: form.value,
            revision: form.revision,
            writable: form.writable,
          }),
          subscribe(listener: () => void) {
            form.listeners.add(listener)
            return () => { form.listeners.delete(listener) }
          },
          async set(field: string, value: unknown) {
            log.setCalls.push({ field, value })
            if (options.rejectWith !== undefined) throw options.rejectWith
            const accepted = writeResults.length > 0 ? writeResults.shift() as boolean : true
            // 宿主语义：接受则把写入折回镜像（ConfigFormController.mutate → acceptView）；
            // 拒绝则先重读一次镜像再返回 false（recover → mirror.load）
            if (accepted) {
              form.value = { ...(form.value ?? {}), [field]: value }
            }
            // 宿主语义：拒绝时先重读一次镜像再返回 false（recover → mirror.load）。重读不会
            // 把「未被服务」洗成 ready——命名空间不在 describe 里时派生状态仍是 unavailable。
            if (form.status !== 'unavailable') form.status = 'ready'
            form.revision += 1
            notifyForm()
            return accepted
          },
        }
      },
    },
    logger: {
      error(message: string) { log.errors.push(message) },
      warn(message: string) { log.warnings.push(message) },
    },
  }

  return {
    ctx,
    log,
    form,
    effects,
    /** 让镜像答到达（宿主 settings.describe 的答案折叠进共享镜像）。 */
    answerMirror(section: Record<string, unknown>) {
      form.status = 'ready'
      form.value = section
      form.revision += 1
      notifyForm()
    },
    /** 让命名空间变成「未被服务」（Host 未导出 Config / 行未激活）。 */
    makeUnavailable() {
      form.status = 'unavailable'
      form.value = undefined
      notifyForm()
    },
    /** 宿主主题变化事件（外观行的模式按钮选中态走它）。 */
    emitThemeChange() {
      for (const listener of [...themeListeners]) listener()
    },
    /**
     * 等点选触发的写持久链跑完。
     *
     * 外观行的 `selectThemeId` 契约是 `=> void`（持久写入不得阻塞 UI、不得把失败抛给渲染），
     * 因此测试侧只能等它自发完成——一个宏任务拍点足以排空这条纯微任务链
     * （select → save → attempt ×2 → report）。
     */
    flushWrites() {
      return new Promise((resolve) => { setTimeout(resolve, 0) })
    },
    /** 反序执行全部 effect disposer（cordis fiber 卸载语义）。 */
    unload() {
      for (const effect of [...effects].reverse()) effect.dispose?.()
    },
    /** 外观行注册时经 `inject` 面拿到的注入范围（点选/模式按钮的真实去向）。 */
    appearanceRowInjected() {
      const row = log.slotRegistrations.find((entry) => entry.key === 'settings.general.item')
      const inject = row?.options.inject as (() => Record<string, unknown>) | undefined
      if (inject === undefined) throw new Error('外观行未注册，或注册选项里没有 inject 面')
      return inject() as {
        selectThemeId: (id: ThemeId) => void
        getThemeId: () => ThemeId
        setPreference: (preference: 'light' | 'dark' | 'system') => void
        getScheme: () => 'light' | 'dark'
      }
    },
  }
}

type Harness = ReturnType<typeof createHarness>

/** 装载 apply.ts 并装配一次。 */
function mountApply(harness: Harness) {
  const loader = createTsxLoader()
  const module = loader.load(APPLY_PATH) as unknown as { apply: (ctx: unknown) => void }
  module.apply(harness.ctx)
  return module
}

describe('client/apply 装配入口', () => {
  it('装配序：locale 字典先于任何槽位注册与覆盖层（合成 t 座位的前提）', () => {
    const harness = createHarness()
    mountApply(harness)
    const firstSlot = harness.log.order.findIndex((entry) => entry.startsWith('slots.inject'))
    const firstLayer = harness.log.order.findIndex((entry) => entry.startsWith('overrideTokens'))
    const localeIndex = harness.log.order.indexOf('locale.register')
    expect(localeIndex).toBeGreaterThanOrEqual(0)
    expect(localeIndex).toBeLessThan(firstSlot)
    expect(localeIndex).toBeLessThan(firstLayer)
    expect(harness.log.localeRegistrations).toEqual([{ ns: 'taiji.shell', languages: ['zh', 'en'] }])
  })

  it('持久命名空间 = 本包 profile 行 id（AS22：Config 随 bundle 行落盘）', () => {
    const harness = createHarness()
    mountApply(harness)
    expect(harness.log.entryIds).toEqual([PLUGIN_ENTRY_ID])
    expect(PLUGIN_ENTRY_ID).toBe('tai-ji-yang-shell')
  })

  it('首装即注册两层覆盖：主题层取持久值（镜像未答 = 包默认色玄），结构层独立 source', () => {
    const harness = createHarness()
    mountApply(harness)
    expect(harness.log.layers.map((layer) => layer.source)).toEqual([THEME_LAYER_SOURCE, STRUCTURE_LAYER_SOURCE])
    expect(harness.log.layers[0].tokens).toEqual(resolveThemeTokens('xuan'))
    expect(harness.log.layers[1].tokens).toEqual(STRUCTURE_TOKENS)
  })

  it('镜像答出持久配色 → 主题层首装即该色（老用户不闪默认色那一帧的客户端侧）', () => {
    const harness = createHarness({ persisted: { appearance: 'qingmo' } })
    mountApply(harness)
    expect(harness.log.layers).toHaveLength(2)
    expect(harness.log.layers[0].tokens).toEqual(resolveThemeTokens('qingmo'))
  })

  it('镜像晚到（loading → ready）也换层，且不会重复换', () => {
    const harness = createHarness()
    mountApply(harness)
    expect(harness.log.layers).toHaveLength(2)
    harness.answerMirror({ appearance: 'zhuyin' })
    expect(harness.log.layers).toHaveLength(3)
    expect(harness.log.layers[2].tokens).toEqual(resolveThemeTokens('zhuyin'))
    // 同一快照再次通知不产生新层（同引用空操作）
    harness.answerMirror({ appearance: 'zhuyin' })
    expect(harness.log.layers).toHaveLength(3)
  })

  it('用户点选（经外观行注入范围）→ 换层 + 写插件 Config 的 appearance 字段', async () => {
    const harness = createHarness()
    mountApply(harness)
    const injected = harness.appearanceRowInjected()
    injected.selectThemeId('nuanmo')
    expect(harness.log.layers.at(-1)?.tokens).toEqual(resolveThemeTokens('nuanmo'))
    await harness.flushWrites()
    expect(harness.log.setCalls).toEqual([{ field: APPEARANCE_FIELD, value: 'nuanmo' }])
    expect(injected.getThemeId()).toBe('nuanmo')
  })

  it('写入被拒（重读一次后重试仍拒）→ 显式上报一条 error，且会话内不回退所选色', async () => {
    const harness = createHarness({ writeResults: [false, false] })
    mountApply(harness)
    const injected = harness.appearanceRowInjected()
    injected.selectThemeId('dailan')
    await harness.flushWrites()
    // 两次 attempt（第一次 + 重读后重试），都记在案
    expect(harness.log.setCalls).toHaveLength(2)
    expect(harness.log.errors).toHaveLength(1)
    const message = harness.log.errors[0]
    expect(message).toContain(PLUGIN_ENTRY_ID)
    expect(message).toContain(APPEARANCE_FIELD)
    expect(message).toContain('dailan')
    // 会话内照常生效：层已换成用户选的那个色，没有回退
    expect(harness.log.layers.at(-1)?.tokens).toEqual(resolveThemeTokens('dailan'))
    expect(injected.getThemeId()).toBe('dailan')
  })

  it('命名空间未被服务时文案指名 Config 声明（指对修复动作，不让人去查 revision）', async () => {
    const harness = createHarness({ writeResults: [false, false] })
    mountApply(harness)
    harness.makeUnavailable()
    const injected = harness.appearanceRowInjected()
    injected.selectThemeId('hao')
    await harness.flushWrites()
    expect(harness.log.errors).toHaveLength(1)
    expect(harness.log.errors[0]).toContain('未被宿主服务')
    expect(harness.log.errors[0]).toContain('volatile')
  })

  it('传输异常不外抛：点选仍然换层，错误经上报通道显式记录', async () => {
    const harness = createHarness({ rejectWith: new Error('connection lost') })
    mountApply(harness)
    const injected = harness.appearanceRowInjected()
    expect(() => { injected.selectThemeId('qingmo') }).not.toThrow()
    await harness.flushWrites()
    expect(harness.log.layers.at(-1)?.tokens).toEqual(resolveThemeTokens('qingmo'))
    expect(harness.log.errors).toHaveLength(1)
    expect(harness.log.errors[0]).toContain('connection lost')
  })

  it('用户已点选后镜像才答：不用旧持久值覆盖会话内的选择', () => {
    const harness = createHarness()
    mountApply(harness)
    const injected = harness.appearanceRowInjected()
    injected.selectThemeId('hao')
    const layersBefore = harness.log.layers.length
    harness.answerMirror({ appearance: 'xuan' })
    expect(harness.log.layers).toHaveLength(layersBefore)
    expect(injected.getThemeId()).toBe('hao')
  })

  it('外观行遮蔽内置行（同 id / 负 priority / order < 10），模式按钮写宿主偏好', () => {
    const harness = createHarness()
    mountApply(harness)
    const row = harness.log.slotRegistrations.find((entry) => entry.key === 'settings.general.item')
    expect(row?.options).toMatchObject({ id: 'appearance', priority: -5, order: 5, locale: 'taiji.shell' })
    const injected = harness.appearanceRowInjected()
    injected.setPreference('light')
    expect(harness.log.preferenceWrites).toEqual(['light'])
    // 选色路径一次都不写宿主偏好（D2 方案 A：跨族不改写宿主偏好）
    injected.selectThemeId('zhuyin')
    expect(harness.log.preferenceWrites).toEqual(['light'])
  })

  it('品牌三槽 + 外观行都注册，且每个贡献都经 ctx.effect 托管（九处 disposer）', () => {
    const harness = createHarness()
    mountApply(harness)
    expect(harness.log.slotInjects).toEqual([
      'conversation.hero.brand.mark',
      'sidebar.brand.mark',
      'sidebar.brand.name',
      'settings.general.item',
    ])
    expect(harness.log.slotRegistrations).toHaveLength(4)
    // locale 字典 1 + 主题层 1 + 结构层 1 + 持久订阅 1 + 四个槽位 inject 各把注册包成嵌套 effect 1
    // + 持久反注册 1
    expect(harness.effects).toHaveLength(9)
    expect(harness.effects.every((effect) => typeof effect.dispose === 'function')).toBe(true)
    expect(harness.effects.map((effect) => effect.label)).toEqual([
      'taiji: 内联双语字典（zh/en）',
      'taiji: 主题 token 覆盖层（overrideTokens disposer 经 ctx.effect 托管）',
      'taiji: 结构 token 覆盖层（overrideTokens disposer 经 ctx.effect 托管）',
      'taiji: 持久配色 → 主题层换层（插件 Config 镜像订阅）',
      'slots.inject("conversation.hero.brand.mark")',
      'slots.inject("sidebar.brand.mark")',
      'slots.inject("sidebar.brand.name")',
      'slots.inject("settings.general.item")',
      'taiji: 插件 Config 镜像订阅反注册',
    ])
  })

  it('卸载后覆盖层、字典、四个槽位与持久订阅都不残留（AX3：fiber 卸载即撤销）', () => {
    const harness = createHarness({ persisted: { appearance: 'nuanmo' } })
    mountApply(harness)
    expect(harness.form.listeners.size).toBe(1)
    harness.unload()
    expect(harness.log.layers.map((layer) => layer.removed)).toEqual([true, true])
    expect(harness.form.listeners.size).toBe(0)
    expect(harness.log.order).toContain('locale.unregister')
    for (const key of ['conversation.hero.brand.mark', 'sidebar.brand.mark', 'sidebar.brand.name', 'settings.general.item']) {
      expect(harness.log.order).toContain(`slots.unregister:${key}`)
    }
  })

  it('卸载后镜像再来通知不再换层（反注册先生效）', () => {
    const harness = createHarness()
    mountApply(harness)
    harness.unload()
    const layersAfterUnload = harness.log.layers.length
    harness.answerMirror({ appearance: 'hao' })
    expect(harness.log.layers).toHaveLength(layersAfterUnload)
  })
})
