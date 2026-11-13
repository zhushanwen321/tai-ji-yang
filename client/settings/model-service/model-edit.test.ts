import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { collectElements, createTsxLoader, textOf, type FakeElement } from '../../testing/load-tsx'
import { modelServiceZh } from '../../locale'
import { levelsToEfforts, THINKING_LEVELS, type ModelDraft } from '../../model-service/settings-client'
import type { ModelEditProps } from './model-edit'

/**
 * 单条模型编辑行单测（供应商接入交互重设计）：锁死 ModelEdit 纯渲染行的交互语义
 * （快照状态流经 onChange 上抛，本文件手动调用元素 props 的处理器）：
 *   · nameEdited 保护：未置位时 id 编辑联动显示名（prettifyId 生成）；置位后 id 编辑不改名；
 *     显示名编辑即置位；
 *   · 输入模态 chip 多选点选（最后一项不可取消）；
 *   · 思考档位 badge 组：pill 加入（preserve 解除）/ badge × 移除 / 自定义档输入的行内校验；
 *   · 上下文窗口档位 select 与自定义回落（非档位数字无损）。
 */

const EDIT_PATH = fileURLToPath(new URL('./model-edit.tsx', import.meta.url))

interface EditModule {
  ModelEdit: (props: ModelEditProps) => unknown
}

const loader = createTsxLoader()
const editModule = loader.load(EDIT_PATH) as unknown as EditModule

const t = (key: keyof typeof modelServiceZh) => modelServiceZh[key]

/** 基础草案（新增条目的产品默认形态：1M / 双模态 / 支持思考 + 全档位）。 */
function baseDraft(overrides: Partial<ModelDraft> = {}): ModelDraft {
  return {
    id: '',
    name: '',
    contextWindow: 1048576,
    maxTokens: undefined,
    input: ['text', 'image'],
    thinkingEnabled: true,
    levels: [...THINKING_LEVELS],
    preserve: false,
    ...overrides,
  }
}

/** 渲染一次并返回（元素树, 元素清单, onChange 载荷收集器）。 */
function render(draft: ModelDraft) {
  const changes: ModelDraft[] = []
  const tree = editModule.ModelEdit({ t, draft, onChange: (next) => { changes.push(next) } }) as FakeElement
  return { tree, elements: collectElements(tree), changes }
}

/** 按 aria-label 找输入元素。 */
function byLabel(elements: FakeElement[], label: string): FakeElement {
  const found = elements.find((element) => element.props['aria-label'] === label)
  if (found === undefined) throw new Error(`aria-label「${label}」的元素不存在`)
  return found
}

/** className 含某类（收集判定用）。 */
function hasClass(element: FakeElement, className: string): boolean {
  const value = element.props.className
  return typeof value === 'string' && value.split(/\s+/).includes(className)
}

/**
 * 交互驱动器：onChange 后以新草案重渲染（真实 React 的更新循环；夹具的处理器按渲染时
 * 草案闭包取值，驱动器保证每次交互都拿到最新处理器）。
 */
function driver(initial: ModelDraft) {
  let current = initial
  let elements: FakeElement[] = []
  const rerender = () => {
    const tree = editModule.ModelEdit({ t, draft: current, onChange: (next) => { current = next } }) as FakeElement
    elements = collectElements(tree)
  }
  rerender()
  return {
    get elements() { return elements },
    get current() { return current },
    rerender,
  }
}

describe('nameEdited 保护（显示名按 id 自动生成）', () => {
  it('nameEdited 未置位：id 编辑联动显示名（prettifyId），onChange 载荷携带生成的显示名', () => {
    const { elements, changes } = render(baseDraft())
    const idInput = byLabel(elements, t('model.id'))
    ;(idInput.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'my-model-v1' } })
    expect(changes).toHaveLength(1)
    expect(changes[0].id).toBe('my-model-v1')
    expect(changes[0].name).toBe('My Model V1')
    expect(changes[0].nameEdited).toBeUndefined()
  })

  it('id 联动的显示名经受控 value 回流（MF-1-6：nameRef 直改 DOM 的补丁已删除，重渲染后 name 输入显示新名）', () => {
    const session = driver(baseDraft())
    const idInput = byLabel(session.elements, t('model.id'))
    ;(idInput.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'my-model-v1' } })
    session.rerender()
    const nameInput = byLabel(session.elements, t('model.displayName'))
    expect(nameInput.props.value).toBe('My Model V1')
    // 两个文本输入均为受控 value=（无 defaultValue 残留）。
    expect(idInput.props.defaultValue).toBeUndefined()
    expect(nameInput.props.defaultValue).toBeUndefined()
  })

  it('nameEdited 置位后：id 编辑不再改显示名（用户命名优先）', () => {
    const { elements, changes } = render(baseDraft({ id: 'old', name: 'Custom Name', nameEdited: true }))
    const idInput = byLabel(elements, t('model.id'))
    ;(idInput.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'new-id' } })
    expect(changes[0].id).toBe('new-id')
    expect(changes[0].name).toBe('Custom Name')
  })

  it('显示名编辑即置位 nameEdited；含大写的 id 生成保持原大小写（GLM-5.3 → GLM 5.3）', () => {
    const { elements, changes } = render(baseDraft())
    const nameInput = byLabel(elements, t('model.displayName'))
    ;(nameInput.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'My Name' } })
    expect(changes[0].nameEdited).toBe(true)

    const again = render(baseDraft())
    const idInput = byLabel(again.elements, t('model.id'))
    ;(idInput.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'GLM-5.3' } })
    expect(again.changes[0].name).toBe('GLM 5.3')
  })
})

describe('输入模态 chip（多选点选）', () => {
  it('点未选模态加入；点已选模态移除；最后一项不可取消（onChange 不触发）', () => {
    const draft = baseDraft({ input: ['text'] })
    const { elements, changes } = render(draft)
    const group = elements.find((element) => element.props.role === 'group' && element.props['aria-label'] === t('model.inputModalities'))
    expect(group).toBeDefined()
    const chips = collectElements(group!).filter((element) => {
      const className = element.props.className
      return typeof className === 'string' && className.split(/\s+/).includes('ms-chip')
    })
    expect(chips.map(textOf)).toEqual([t('input.text'), t('input.image')])
    // 未选的 image chip：点选加入
    ;(chips[1].props.onClick as () => void)()
    expect(changes[0].input).toEqual(['text', 'image'])
    // 已选且是唯一项的 text chip：点选被拦（保持至少一个模态）
    const only = render(baseDraft({ input: ['image'] }))
    const onlyGroup = only.elements.find((element) => element.props['aria-label'] === t('model.inputModalities'))
    const onlyChips = collectElements(onlyGroup!).filter((element) => {
      const className = element.props.className
      return typeof className === 'string' && className.split(/\s+/).includes('ms-chip')
    })
    ;(onlyChips[1].props.onClick as () => void)()
    expect(only.changes).toHaveLength(0)
  })
})

describe('思考档位 badge 组（自由组合）', () => {
  it('已选档位渲染为 badge（含 × 移除钮），未选档位渲染为 + pill；点 × 移除', () => {
    const { elements, changes } = render(baseDraft({ levels: ['off', 'high'] }))
    const group = elements.find((element) => element.props['aria-label'] === t('model.thinkingLevels'))
    expect(group).toBeDefined()
    const groupTree = collectElements(group!)
    const badges = groupTree.filter((element) => {
      const className = element.props.className
      return typeof className === 'string' && className.split(/\s+/).includes('ms-level-badge')
    })
    expect(badges).toHaveLength(2)
    const removeButton = collectElements(badges[0]).find((element) => {
      const className = element.props.className
      return typeof className === 'string' && className.split(/\s+/).includes('ms-level-remove')
    })
    ;(removeButton!.props.onClick as () => void)()
    expect(changes[0].levels).toEqual(['high'])
    // 未选档位 pill 共 5 枚（7 档 − 2 已选），点选加入
    const pills = groupTree.filter((element) => {
      const className = element.props.className
      return typeof className === 'string' && className.split(/\s+/).includes('ms-level-pill')
    })
    expect(pills).toHaveLength(5)
    ;(pills[0].props.onClick as () => void)()
    expect(changes[1].levels).toEqual(['off', 'high', 'minimal'])
    expect(changes[1].preserve).toBe(false)
  })

  it('preserve 态：标注在场、badge 组可见但无已选 badge；点非 off pill 即转自由选集（preserve 解除，种子 = 点选档）', () => {
    const draft = baseDraft({ thinkingEnabled: false, levels: [], preserve: true, preserveRaw: { custom: 'low' } })
    const { elements, changes } = render(draft)
    const texts = elements.map(textOf).join('\n')
    expect(texts).toContain(t('model.thinkingPreserved'))
    const group = elements.find((element) => element.props['aria-label'] === t('model.thinkingLevels'))
    const groupTree = collectElements(group!)
    const badges = groupTree.filter((element) => {
      const className = element.props.className
      return typeof className === 'string' && className.split(/\s+/).includes('ms-level-badge')
    })
    expect(badges).toHaveLength(0)
    const pills = groupTree.filter((element) => {
      const className = element.props.className
      return typeof className === 'string' && className.split(/\s+/).includes('ms-level-pill')
    })
    expect(pills).toHaveLength(THINKING_LEVELS.length)
    // pills[0] = off（空集点 off 的全集种子规则由 MF-1-9 用例锁定）；此处点非 off 档
    // （minimal）验证「种子 = 点选档」的既有语义。
    ;(pills[1].props.onClick as () => void)()
    expect(changes[0].preserve).toBe(false)
    expect(changes[0].thinkingEnabled).toBe(true)
    expect(changes[0].levels).toEqual(['minimal'])
  })

  it('勾选「支持思考」从 preserve 转自由选集并给全集档位（空档位集不满足宿主校验）', () => {
    const session = driver(baseDraft({ thinkingEnabled: false, levels: [], preserve: true }))
    const input = session.elements.find((element) => element.props.type === 'checkbox')
    expect(input).toBeDefined() // 「支持思考」是行内唯一的 checkbox
    ;(input!.props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: true } })
    expect(session.current.thinkingEnabled).toBe(true)
    expect(session.current.preserve).toBe(false)
    expect(session.current.levels).toEqual([...THINKING_LEVELS])
  })

  it('自定义档输入：合法档名 Enter 加入 levels；非法名字给行内提示（不进 levels）', () => {
    const session = driver(baseDraft({ levels: [] }))
    const findInput = () => session.elements.find((element) => hasClass(element, 'ms-level-input'))!
    expect(findInput()).toBeDefined()
    const type = (value: string) => {
      ;(findInput().props.onChange as (event: { target: { value: string } }) => void)({ target: { value } })
      session.rerender()
    }
    const pressEnter = () => {
      ;(findInput().props.onKeyDown as (event: { key: string }) => void)({ key: 'Enter' })
      session.rerender()
    }
    // 非法输入：行内提示在场，Enter 不加入。
    type('turbo')
    expect(session.current.levelInput).toBe('turbo')
    expect(session.elements.map(textOf).join('\n')).toContain(t('model.levelInvalid'))
    pressEnter()
    expect(session.current.levels).toEqual([])
    // 合法输入：提示消失，Enter 加入 levels 并清空输入。
    type('xhigh')
    expect(session.elements.map(textOf).join('\n')).not.toContain(t('model.levelInvalid'))
    pressEnter()
    expect(session.current.levels).toEqual(['xhigh'])
    expect(session.current.levelInput).toBe('')
  })

  it('写读往返对齐：badge 组草案经 levelsToEfforts 写盘 = 同名映射字典（模型卡交互与宿主词表一致）', () => {
    const draft = baseDraft({ levels: ['off', 'low', 'max'] })
    expect(levelsToEfforts(draft.levels)).toEqual({ off: 'off', low: 'low', max: 'max' })
  })

  // ── 评审修复 r1（G2 组：MF-1-9 档位下限防护——不再写出宿主必拒的 reasoningEfforts 形态）──

  it('× 移除最后一档（删空）→ 翻非思考：thinkingEnabled=false + levels 清空（写 reasoningEfforts:false 合法形态）', () => {
    const { elements, changes } = render(baseDraft({ levels: ['high'] }))
    const group = elements.find((element) => element.props['aria-label'] === t('model.thinkingLevels'))!
    const removeButton = collectElements(group).find((element) => {
      const className = element.props.className
      return typeof className === 'string' && className.split(/\s+/).includes('ms-level-remove')
    })
    ;(removeButton!.props.onClick as () => void)()
    expect(changes[0].thinkingEnabled).toBe(false)
    expect(changes[0].preserve).toBe(false)
    expect(changes[0].levels).toEqual([])
  })

  it('× 移除后仅剩 off（{off:"off"} 宿主必拒形态）→ 同样翻非思考，不产出 off-only 选集', () => {
    const session = driver(baseDraft({ levels: ['off', 'high'] }))
    const group = session.elements.find((element) => element.props['aria-label'] === t('model.thinkingLevels'))!
    const badges = collectElements(group).filter((element) => {
      const className = element.props.className
      return typeof className === 'string' && className.split(/\s+/).includes('ms-level-badge')
    })
    // 移除 high（剩 off）→ 翻非思考；再勾选「支持思考」→ 空集给全集（既有规则），可正常重启。
    const highBadge = badges.find((badge) => textOf(badge).includes(t('thinking.level.high')))!
    ;(collectElements(highBadge).find((element) => {
      const className = element.props.className
      return typeof className === 'string' && className.split(/\s+/).includes('ms-level-remove')
    })!.props.onClick as () => void)()
    expect(session.current.thinkingEnabled).toBe(false)
    expect(session.current.levels).toEqual([])
    session.rerender() // 驱动器时序：交互后重渲染，取新草案闭包的 checkbox
    const checkbox = session.elements.find((element) => element.props.type === 'checkbox')!
    ;(checkbox.props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: true } })
    expect(session.current.levels).toEqual([...THINKING_LEVELS])
  })

  it('移除 off 本身（其余档保留）正常进行：levels 只去 off，不触发翻非思考', () => {
    const { elements, changes } = render(baseDraft({ levels: ['off', 'high'] }))
    const group = elements.find((element) => element.props['aria-label'] === t('model.thinkingLevels'))!
    const badges = collectElements(group).filter((element) => {
      const className = element.props.className
      return typeof className === 'string' && className.split(/\s+/).includes('ms-level-badge')
    })
    const offBadge = badges.find((badge) => textOf(badge).includes(t('thinking.level.off')))!
    ;(collectElements(offBadge).find((element) => {
      const className = element.props.className
      return typeof className === 'string' && className.split(/\s+/).includes('ms-level-remove')
    })!.props.onClick as () => void)()
    expect(changes[0].thinkingEnabled).toBe(true)
    expect(changes[0].levels).toEqual(['high'])
  })

  it('preserve 空集起点点 off pill / Enter off → 给全集种子（不产出 {off:"off"}）', () => {
    const seed = baseDraft({ thinkingEnabled: false, levels: [], preserve: true, preserveRaw: { custom: 'low' } })
    // pill 路径：preserve 空集点「+ 关闭」
    const pillSession = driver(seed)
    const pillGroup = pillSession.elements.find((element) => element.props['aria-label'] === t('model.thinkingLevels'))!
    const offPill = collectElements(pillGroup).filter((element) => {
      const className = element.props.className
      return typeof className === 'string' && className.split(/\s+/).includes('ms-level-pill')
    }).find((pill) => textOf(pill).includes(t('thinking.level.off')))!
    ;(offPill.props.onClick as () => void)()
    expect(pillSession.current.preserve).toBe(false)
    expect(pillSession.current.levels).toEqual([...THINKING_LEVELS])

    // Enter 路径：空集输入 off 回车
    const enterSession = driver(baseDraft({ thinkingEnabled: true, levels: [] }))
    const levelInput = enterSession.elements.find((element) => {
      const className = element.props.className
      return typeof className === 'string' && className.split(/\s+/).includes('ms-level-input')
    })!
    ;(levelInput.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'off' } })
    enterSession.rerender()
    const enterInput = enterSession.elements.find((element) => {
      const className = element.props.className
      return typeof className === 'string' && className.split(/\s+/).includes('ms-level-input')
    })!
    ;(enterInput.props.onKeyDown as (event: { key: string }) => void)({ key: 'Enter' })
    expect(enterSession.current.levels).toEqual([...THINKING_LEVELS])
  })
})

describe('上下文窗口档位 select 与自定义回落', () => {
  it('档位数字 → 对应档显示；切档写入档位数值（1M = 1048576）', () => {
    const { elements, changes } = render(baseDraft({ contextWindow: 1048576 }))
    const select = byLabel(elements, t('model.contextWindow'))
    expect(select.props.value).toBe('1048576')
    ;(select.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: '131072' } })
    expect(changes[0].contextWindow).toBe(131072)
  })

  it('非档位数字（宿主侧既有 1000000）→ 自定义回落 + 数字输入无损显示与写回', () => {
    const { elements, changes } = render(baseDraft({ contextWindow: 1000000 }))
    const select = byLabel(elements, t('model.contextWindow'))
    expect(select.props.value).toBe('custom')
    // 自定义回落输入框在场并显示原值（受控 value=，MF-1-6）；编辑无损写回。
    const custom = elements.find((element) => {
      const className = element.props.className
      return typeof className === 'string' && className.split(/\s+/).includes('ms-model-edit-context-custom')
    })
    expect(custom).toBeDefined()
    expect(custom!.props.value).toBe('1000000')
    ;(custom!.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: '1234567' } })
    expect(changes[0].contextWindow).toBe(1234567)
  })

  it('选「自定义…」不改动草稿值（档位数字保留，仅揭示输入框）', () => {
    const { elements, changes } = render(baseDraft({ contextWindow: 1048576 }))
    const select = byLabel(elements, t('model.contextWindow'))
    ;(select.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'custom' } })
    expect(changes).toHaveLength(1)
    expect(changes[0].contextWindow).toBe(1048576)
  })

  it('未填写（undefined）→ 自定义回落 + 空输入框（留空 = 不写该字段，宿主按目录默认解析）', () => {
    const { elements, changes } = render(baseDraft({ contextWindow: undefined }))
    const select = byLabel(elements, t('model.contextWindow'))
    expect(select.props.value).toBe('custom')
    const custom = elements.find((element) => {
      const className = element.props.className
      return typeof className === 'string' && className.split(/\s+/).includes('ms-model-edit-context-custom')
    })
    expect(custom!.props.value).toBe('')
    ;(custom!.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: '' } })
    expect(changes[0].contextWindow).toBeUndefined()
  })
})
