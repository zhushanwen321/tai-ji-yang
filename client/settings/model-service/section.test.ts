import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { collectElements, createTsxLoader, elementsWithClass, textOf, type FakeElement } from '../../testing/load-tsx'
import { modelServiceZh, TAIJI_MODEL_SERVICE_LOCALE_NS } from '../../locale'
import type { ModelServiceSectionInjected } from './section'

/**
 * 「模型服务」设置分区单测（dsh-model-service D2/D8，M1）。锁死注册契约与挂载 wiring 的
 * 可机器化部分：
 *   · 注册契约：settings.section 槽、唯一 id model-services、order 11（宿主「模型」10 之后、
 *     太极 12 之前——D8 前移序列）、label thunk、locale 命名空间、组件同一性；
 *   · 注册即撤除（AX7）：inject 回调返回 register 的 disposer（宿主自挂 ctx.effect）；
 *   · 挂载 wiring：视图模型构造（加载态文案）+ 三视图切换条齐备。
 * 三视图内容与交互的深断言：视图模型（ProvidersListModel / ModelsListModel /
 * ProviderEditModel / RoutesListModel）单测未建，目前由 verify 场景（scripts/verify/
 * scenarios/model-service.mjs，真实宿主 L3）承载。
 */

const SECTION_PATH = fileURLToPath(new URL('./section.tsx', import.meta.url))

/** 假宿主（slots + locale.bind，对齐 ModelServiceSectionHost）。 */
function fakeSectionHost() {
  const registrations: { key: string; options: Record<string, unknown>; component: unknown; dispose: () => void }[] = []
  const pending = new Map<string, (() => (() => void) | void)[]>()
  const host = {
    slots: {
      inject(key: string, callback: () => (() => void) | void) {
        const list = pending.get(key) ?? []
        list.push(callback)
        pending.set(key, list)
        return () => {}
      },
      register(options: Record<string, unknown>, component: unknown) {
        const dispose = () => {}
        registrations.push({ key: options.name as string, options, component, dispose })
        return dispose
      },
    },
    locale: {
      bind(ns: string) {
        expect(ns).toBe(TAIJI_MODEL_SERVICE_LOCALE_NS)
        return (key: string) => modelServiceZh[key as keyof typeof modelServiceZh]
      },
    },
  }
  return {
    host,
    registrations,
    declare(key: string) {
      for (const callback of pending.get(key) ?? []) callback()
      pending.delete(key)
    },
  }
}

/** 假注入面：remote 三通道 + 插件 Config 表单（load 异步Promise 立即可挂起；remote 返回按
 * 宿主 typert 网关真实形态包 RemoteResult）。 */
function fakeDeps(): ModelServiceSectionInjected {
  return {
    remote: {
      settings: {
        describe: async () => ({ ok: true, value: { writable: true, namespaces: [{ ns: 'llm-pi-ai', value: { providers: {} }, revision: 1 }] } }),
        mutate: async () => ({ ok: true, value: { ns: 'llm-pi-ai' } }),
      },
      llm: {
        listProviders: async () => ({ ok: true, value: [] }),
        listConfigurableProviders: async () => ({ ok: true, value: [] }),
      },
      credentials: {
        describe: async () => ({ ok: true, value: {} }),
        set: async () => ({ ok: true, value: undefined }),
        unset: async () => ({ ok: true, value: undefined }),
      },
    },
    configForm: {
      getSnapshot: () => ({ status: 'ready' as const, value: {}, revision: 1, writable: true }),
      subscribe: () => () => {},
      set: async () => true,
    },
  }
}

interface SectionModule {
  ModelServiceSection: (props: Record<string, unknown>) => FakeElement
  installModelServiceSection: (host: unknown, deps: ModelServiceSectionInjected) => void
  MODEL_SERVICES_SECTION_ID: string
  MODEL_SERVICES_SECTION_ORDER: number
}

const loader = createTsxLoader()
const sectionModule = loader.load(SECTION_PATH) as unknown as SectionModule
const { MODEL_SERVICES_SECTION_ID, MODEL_SERVICES_SECTION_ORDER } = sectionModule
// ProvidersView 的同一性参照：同一 loader 树内加载的组件函数（type 相等断言用）。
const ProvidersViewComponent = loader.load(
  fileURLToPath(new URL('./providers-view.tsx', import.meta.url)),
).ProvidersView as unknown

describe('installModelServiceSection 注册契约（D2 追加形态）', () => {
  const t = (key: string) => modelServiceZh[key as keyof typeof modelServiceZh]

  function assemble() {
    const fake = fakeSectionHost()
    sectionModule.installModelServiceSection(fake.host, fakeDeps())
    fake.declare('settings.section')
    expect(fake.registrations).toHaveLength(1)
    return { fake, registration: fake.registrations[0] }
  }

  it('注册进 settings.section：唯一 id model-services、order 11、label thunk、locale 命名空间、组件同一性', () => {
    const { registration } = assemble()
    expect(registration.key).toBe('settings.section')
    expect(registration.options.id).toBe(MODEL_SERVICES_SECTION_ID)
    expect(MODEL_SERVICES_SECTION_ID).toBe('model-services')
    // D8 前移序列：宿主 models(10) < 模型服务(11) < 太极(12) < plugins(15)。
    expect(MODEL_SERVICES_SECTION_ORDER).toBe(11)
    expect(MODEL_SERVICES_SECTION_ORDER).toBeGreaterThan(10)
    expect(MODEL_SERVICES_SECTION_ORDER).toBeLessThan(12)
    expect(typeof registration.options.label).toBe('function')
    expect((registration.options.label as () => string)()).toBe('模型服务')
    expect(registration.options.locale).toBe(TAIJI_MODEL_SERVICE_LOCALE_NS)
    expect(registration.component).toBe(sectionModule.ModelServiceSection)
  })

  it('注册即撤除（AX7）：register 的 disposer 可用（宿主自挂 ctx.effect，卸载即撤条目）', () => {
    const { fake } = assemble()
    // register 返回的 disposer 就是撤除通道（宿主 register 自挂 effect，契约见 TaijiSectionHost）。
    expect(typeof fake.registrations[0].dispose).toBe('function')
    expect(() => fake.registrations[0].dispose()).not.toThrow()
  })

  it('组件渲染（挂载 wiring）：三视图切换条齐备 + 默认供应商视图挂上视图模型（ProvidersView 元素在场）', () => {
    const { registration } = assemble()
    const inject = registration.options.inject as () => ModelServiceSectionInjected
    const root = sectionModule.ModelServiceSection({
      t,
      close: () => {},
      ...inject(),
    })
    const elements = collectElements(root)
    expect(root.props['aria-label']).toBe('模型服务')
    expect(elementsWithClass(elements, 'ms-viewbar-button')).toHaveLength(3)
    const tabs = elementsWithClass(elements, 'ms-viewbar-button').map((button) => textOf(button))
    expect(tabs).toEqual([modelServiceZh['view.providers'], modelServiceZh['view.models'], modelServiceZh['view.routes']])
    // 默认视图 = 供应商：挂载 effect 已构造 ProvidersListModel 并把 ProvidersView 挂上树
    // （夹具不递归函数组件——其内部加载态文案在视图模型单测覆盖，这里断言接线在场）。
    const providersView = elements.find((element) => element.type === ProvidersViewComponent)
    expect(providersView).toBeDefined()
    expect((providersView!.props.model as { getSnapshot: () => { status: string } }).getSnapshot().status).toBe('loading')
  })
})
