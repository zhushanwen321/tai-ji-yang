import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { collectElements, createTsxLoader, elementsWithClass, textOf, type FakeElement } from '../../testing/load-tsx'
import { modelServiceZh } from '../../locale'
import type { ModelListRow, ModelsListModel, ModelsListSnapshot } from './models-view'

/**
 * ModelsView 渲染面单测（dsh-model-service F2-1，R2——F1-29 空态接入引导的接线断言实物）。
 * 锁死空态矩阵两个非筛选空态分支（V9 步骤 1「清单空态给接入引导」）的回归保护面：
 *   · 引导按钮在场且文案取自双语词条 models.emptyGoProviders（词条 key 改名即红灯）；
 *   · 按钮 onClick 与 props.onGoToProviders 引用一致（转发接线：按钮删改、回调断开即红灯；
 *     section.tsx:202 传入的 () => switchView('providers') 切回行为属分区状态机，测试夹具
 *     是单次渲染语义（load-tsx 边界：不做 React 协调），状态机不可观测——由引用一致断言
 *     + 闭包直读承证）。
 * ModelsListModel 四层拼装的单测仍未建（verify 场景真实宿主 L3 承载，口径见 section.test.ts 头注释）。
 */

const VIEW_PATH = fileURLToPath(new URL('./models-view.tsx', import.meta.url))

interface ViewModule {
  ModelsView: (props: Record<string, unknown>) => FakeElement
}

const loader = createTsxLoader()
const viewModule = loader.load(VIEW_PATH) as unknown as ViewModule

const t = (key: keyof typeof modelServiceZh) => modelServiceZh[key]

/** 快照构造：ready 态基座 + 覆盖（空态矩阵的分流只看 rows / filter / providersExist 三元）。 */
function readySnapshot(overrides: Partial<ModelsListSnapshot> = {}): ModelsListSnapshot {
  return { status: 'ready', rows: [], providersExist: false, filter: '', ...overrides }
}

/** 假视图模型：ModelsView 只经 useSyncExternalStore 取快照（夹具桩直取当前快照），
 * 鸭子类型即可驱动渲染；ModelsListModel 的拼装行为不在本文件断言面。 */
function fakeModel(snapshot: ModelsListSnapshot): ModelsListModel {
  return { getSnapshot: () => snapshot, subscribe: () => () => {} } as unknown as ModelsListModel
}

/** 渲染并返回元素树（onGoToProviders 用手写 spy 计数，不经 vi 假设）。 */
function renderView(snapshot: ModelsListSnapshot, onGoToProviders: () => void): FakeElement[] {
  const root = viewModule.ModelsView({
    t,
    model: fakeModel(snapshot),
    onJump: () => {},
    onGoToProviders,
  })
  return collectElements(root)
}

describe('ModelsView 空态接入引导接线（F2-1：F1-29 修复的回归保护）', () => {
  it('目录无 provider 空态：「尚未接入供应商」+ 引导按钮（文案 = models.emptyGoProviders 词条，onClick 引用一致转发）', () => {
    let goCalls = 0
    const onGoToProviders = () => { goCalls += 1 }
    const elements = renderView(readySnapshot(), onGoToProviders)
    expect(elementsWithClass(elements, 'ms-empty')).toHaveLength(1)
    const titles = elementsWithClass(elements, 'ms-empty-title')
    expect(titles).toHaveLength(1)
    expect(textOf(titles[0])).toBe(modelServiceZh['models.emptyNoProviders'])
    // 引导按钮以 primary 类定位（筛选空态的清除按钮是 ms-button 无 primary；行内定位按钮
    // 在空清单下不渲染）。
    const buttons = elementsWithClass(elements, 'ms-button-primary')
    expect(buttons).toHaveLength(1)
    expect(textOf(buttons[0])).toBe(modelServiceZh['models.emptyGoProviders'])
    // 引用一致 = 转发接线：按钮 onClick 就是传入的回调本身。
    expect(buttons[0].props.onClick).toBe(onGoToProviders)
    const click = buttons[0].props.onClick as () => void
    click()
    expect(goCalls).toBe(1)
  })

  it('有 provider 无模型空态：「供应商已接入，但还没有模型」+ 同款引导按钮接线', () => {
    let goCalls = 0
    const onGoToProviders = () => { goCalls += 1 }
    const elements = renderView(readySnapshot({ providersExist: true }), onGoToProviders)
    expect(elementsWithClass(elements, 'ms-empty')).toHaveLength(1)
    const titles = elementsWithClass(elements, 'ms-empty-title')
    expect(titles).toHaveLength(1)
    expect(textOf(titles[0])).toBe(modelServiceZh['models.emptyNoModelsButProviders'])
    const buttons = elementsWithClass(elements, 'ms-button-primary')
    expect(buttons).toHaveLength(1)
    expect(textOf(buttons[0])).toBe(modelServiceZh['models.emptyGoProviders'])
    expect(buttons[0].props.onClick).toBe(onGoToProviders)
    const click = buttons[0].props.onClick as () => void
    click()
    expect(goCalls).toBe(1)
  })

  it('清单非空时两个引导空态均不渲染（空态只在空清单出现，列表在场）', () => {
    const row: ModelListRow = {
      providerKey: 'yanshi',
      providerName: 'Yanshi',
      modelId: 'yanshi-mini',
      modelName: 'Yanshi Mini',
      source: 'custom',
      jumpable: true,
      contextWindow: '128000',
      maxTokens: '8192',
      inputModalities: 'text',
      reasoning: '',
    }
    const elements = renderView(readySnapshot({ rows: [row], providersExist: true }), () => {})
    expect(elementsWithClass(elements, 'ms-empty')).toHaveLength(0)
    expect(elementsWithClass(elements, 'ms-model-list')).toHaveLength(1)
    expect(elementsWithClass(elements, 'ms-button-primary')).toHaveLength(0)
  })
})
