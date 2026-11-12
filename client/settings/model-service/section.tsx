/**
 * client/settings/model-service/section.tsx —— 设置页的「模型服务」独立分区（dsh-model-service
 * §3.3 D2/D8，M1）。
 *
 * 分区定位（D2）：以**唯一 id 追加**注册进宿主 `settings.section`，与宿主「模型」分区并存、
 * 各自渲染（宿主导航由槽位条目全量映射生成、无同 id 去重——遮蔽形态不可达，AS9 已核实）；
 * 不遮蔽、不替换，注册与撤除两动作（register 自挂 ctx.effect，卸载即撤除）。
 *
 * 结构：三个平级视图——供应商（接入与凭据）/ 模型清单（跨供应商汇总）/ 模型路由（M2
 * 已挂真实 RoutesView）。视图切换与跳转态（模型清单 → 供应商展开体定位）由本组件的状态
 * 承载（设计 U1：跳转态 = 目标 provider/model + 返回路径，分区组件内状态承载）。打开分区
 * 时做一次待清理凭据重试（D7/AX9「下次启动或打开分区时重试」取后者：重试在打开分区时
 * 执行，插件装载（启动）路径的重试未实现——取舍登记见设计包 D7 采用段）。
 *
 * 交互状态纪律（与 taiji-section.tsx 同款）：真相放 useRef + 重渲染扳机（useState 只当
 * 扳机）——本包测试夹具的 useState 桩不触发重渲染，真相在 ref 才能被同一渲染树上的后续
 * 交互读到；真实 React 下扳机保证视觉跟随。
 *
 * 样式：本分区消费 client/settings/model-service.css（构建脚本目录扫描自动并入产物），
 * 全部颜色走 u-foundation 交付的 --taiji-* 子 token（D10；禁内联色值）。
 */
import { useEffect, useRef, useState } from 'react'
import { retryPendingUnsets, type PluginConfigFormLike } from '../../model-service/credentials-client'
import { RoutesListModel } from '../../model-service/route-store'
import type { ModelServiceHost, RemoteResult } from '../../model-service/settings-client'
import { TAIJI_MODEL_SERVICE_LOCALE_NS, type ModelServiceLocaleKey } from '../../locale'
import { ModelsView, ModelsListModel } from './models-view'
import { ProvidersView, ProvidersListModel } from './providers-view'
import { RoutesView } from './routes-view'

/** 本分区在 `settings.section` 里的 id（D2：唯一 id；不与宿主内置或太极分区相撞）。 */
export const MODEL_SERVICES_SECTION_ID = 'model-services'

/** 本分区的导航排序位（D8）：11，紧邻宿主「模型」（10）之后、太极（12）之前。 */
export const MODEL_SERVICES_SECTION_ORDER = 11

/** 宿主 session remote 的最小同构（模型清单视图的第一层读取源；返回 typert 网关 Result 包装）。 */
export interface SessionRemoteLike {
  modelCatalog(): Promise<RemoteResult<ModelCatalogLike>>
}

/** session.modelCatalog 的返回形状最小同构（generated client 实读核对：groups 为空清单丢弃后的分组）。 */
export interface ModelCatalogLike {
  groups: {
    id: string
    name: string
    models: {
      id: string
      name: string
      reasoning?: { efforts: { id: string; name: string }[] } | undefined
    }[]
  }[]
}

/** 注入面：宿主通道集合 + 插件 Config 表单（待清理清单的读写）。 */
export interface ModelServiceSectionInjected {
  /** settings / llm / credentials（可带 session）remote 的最小同构集合。 */
  remote: ModelServiceHost & { session?: SessionRemoteLike }
  /** 插件自身 Config 表单（pendingCredentialUnsets 通道，credentials-client 消费）。 */
  configForm: PluginConfigFormLike
}

/** 分区组件 props：t 座位 + owner 份额（close）+ 注入面。 */
export type ModelServiceSectionProps = {
  t: (key: ModelServiceLocaleKey, params?: Record<string, unknown>) => string
  close: () => void
} & ModelServiceSectionInjected

/** 本分区用到的宿主接口（与 taiji-section 的 TaijiSectionHost 同形：slots + locale.bind）。 */
export interface ModelServiceSectionHost {
  slots: {
    inject(key: string, callback: () => (() => void) | void): () => void
    register(
      options: {
        name: string
        id: string
        order: number
        label: () => string
        locale: string
        inject?: () => ModelServiceSectionInjected
      },
      component: unknown,
    ): () => void
  }
  locale: {
    bind(ns: string): (key: string) => string
  }
}

/** 三视图的 id（视图切换按钮的 key 与 aria 语义共用）。 */
type ViewId = 'providers' | 'models' | 'routes'

/** 跳转态（模型清单 → 供应商展开体定位）：目标 provider/model，消费后由 ProvidersView 清回。 */
export interface JumpTarget {
  provider: string
  model?: string
}

/**
 * 渲染「模型服务」分区：视图切换条 + 当前视图内容。
 *
 * 视图模型在挂载时构造（ProvidersListModel / ModelsListModel：目录与快照的异步首读由模型
 * 自己启动，就绪后经订阅通知驱动重渲染；真实 React 下 effect 后置执行 + rerender 扳机，
 * 测试夹具下 effect 同步执行、首棵树即含模型（loading 态））。挂载同时做一次待清理凭据
 * 重试（D7/AX9「下次启动或打开分区时重试」的打开分区路径；unset 失败后不再打开分区的
 * 用户其孤儿 ref 不重试，取舍登记见设计包 D7 采用段）：成功清理数 > 0 时给一条提示；
 * Config 未被服务（skipped）静默跳过——清单通道缺失不是本分区的事，不制造噪音。
 */
export function ModelServiceSection({ t, close, remote, configForm }: ModelServiceSectionProps) {
  const activeView = useRef<ViewId>('providers')
  const jump = useRef<JumpTarget | undefined>(undefined)
  const retryNotice = useRef<string | undefined>(undefined)
  const providersModel = useRef<ProvidersListModel | undefined>(undefined)
  const modelsModel = useRef<ModelsListModel | undefined>(undefined)
  const routesModel = useRef<RoutesListModel | undefined>(undefined)
  const [, rerender] = useState(0)

  useEffect(() => {
    const providers = new ProvidersListModel({ remote, t, configForm })
    const models = new ModelsListModel({ remote, t })
    // 路由视图模型（M2）：Config 快照 + 注册探测 + 成员可用性；翻译座位由 RoutesView 挂载时注入。
    const routes = new RoutesListModel({ remote, configForm })
    const unsubscribeProviders = providers.subscribe(() => rerender((count) => count + 1))
    const unsubscribeModels = models.subscribe(() => rerender((count) => count + 1))
    const unsubscribeRoutes = routes.subscribe(() => rerender((count) => count + 1))
    providersModel.current = providers
    modelsModel.current = models
    routesModel.current = routes
    let disposed = false
    void retryPendingUnsets(configForm, remote.credentials).then((result) => {
      if (disposed || result.removed.length === 0) return
      retryNotice.current = t('credential.pendingRetry', { n: result.removed.length })
      rerender((count) => count + 1)
    })
    rerender((count) => count + 1)
    return () => {
      disposed = true
      unsubscribeProviders()
      unsubscribeModels()
      unsubscribeRoutes()
      routes.dispose()
    }
  }, [])

  /** 模型清单 → 供应商展开体的跳转：切视图 + 携带定位目标。 */
  const jumpToProvider = (provider: string, model?: string): void => {
    jump.current = { provider, ...(model !== undefined ? { model } : {}) }
    activeView.current = 'providers'
    rerender((count) => count + 1)
  }

  /** 供应商视图消费掉跳转态（展开完成后回调清空）。 */
  const clearJump = (): void => {
    jump.current = undefined
    rerender((count) => count + 1)
  }

  const switchView = (view: ViewId): void => {
    activeView.current = view
    rerender((count) => count + 1)
  }

  const view = activeView.current
  return (
    <section className="ms-section" aria-label={t('section.label')}>
      <div className="ms-section-head">
        <div className="ms-section-title">{t('section.label')}</div>
        <div className="ms-viewbar" role="tablist">
          {(['providers', 'models', 'routes'] as const).map((candidate) => (
            <button
              key={candidate}
              type="button"
              role="tab"
              aria-selected={view === candidate}
              className={`ms-viewbar-button${view === candidate ? ' ms-viewbar-button-active' : ''}`}
              onClick={() => { switchView(candidate) }}
            >
              {t(viewTabKey(candidate))}
            </button>
          ))}
        </div>
      </div>
      {retryNotice.current !== undefined && (
        <div className="ms-note ms-note-ok">{retryNotice.current}</div>
      )}
      {view === 'providers' && (
        providersModel.current !== undefined && (
          <ProvidersView
            t={t}
            model={providersModel.current}
            jumpTarget={jump.current}
            onJumpConsumed={clearJump}
          />
        )
      )}
      {view === 'models' && (
        modelsModel.current !== undefined && (
          <ModelsView
            t={t}
            model={modelsModel.current}
            onJump={jumpToProvider}
            onGoToProviders={() => { switchView('providers') }}
          />
        )
      )}
      {view === 'routes' && (
        routesModel.current !== undefined && (
          <RoutesView t={t} model={routesModel.current} />
        )
      )}
    </section>
  )
}

/** 视图 id → locale key（切换条按钮文案）。 */
function viewTabKey(view: ViewId): ModelServiceLocaleKey {
  if (view === 'providers') return 'view.providers'
  if (view === 'models') return 'view.models'
  return 'view.routes'
}

/**
 * 装配「模型服务」分区：注册进宿主 `settings.section`（D2 追加形态）。
 *
 * 注册即撤除（AX7/AX8）：register 返回的 disposer 由宿主自挂 ctx.effect，插件禁用/卸载时
 * 条目随之撤除，宿主「模型」分区不受影响。locale 字典必须先于本分区首次渲染注册
 * （installModelServiceLocale 在 apply.ts 的装配序里先行）。
 *
 * @param host - 宿主侧（slots / locale.bind）。
 * @param deps - 注入面（remote 集合 + 插件 Config 表单），经闭包捕获进 inject。
 */
export function installModelServiceSection(host: ModelServiceSectionHost, deps: ModelServiceSectionInjected): void {
  host.slots.inject('settings.section', () => {
    const bound = host.locale.bind(TAIJI_MODEL_SERVICE_LOCALE_NS)
    return host.slots.register({
      name: 'settings.section',
      id: MODEL_SERVICES_SECTION_ID,
      order: MODEL_SERVICES_SECTION_ORDER,
      label: () => bound('section.label'),
      locale: TAIJI_MODEL_SERVICE_LOCALE_NS,
      inject: () => deps,
    }, ModelServiceSection)
  })
}
