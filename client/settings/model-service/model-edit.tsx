/**
 * client/settings/model-service/model-edit.tsx —— 单条模型的编辑行（dsh-model-service D11/D6）。
 *
 * 字段集对齐宿主 models[] schema（modelProfile：id / name / contextWindow / maxTokens /
 * input / reasoningEfforts）：模型 id、显示名、上下文窗口、最大输出、输入类型（text/image
 * 勾选）、思考策略（D6 四档枚举：全部档位 / 开·关 / 高·最高 / 无思考 → reasoningEfforts
 * 字典或 false，映射本体在 settings-client.thinkingEffortsOf）。
 *
 * 本组件是纯渲染行：状态由 ProviderEditModel 持有（编辑动作经 onChange 回调上抛），本文件
 * 不持状态副本、不直接触通道。
 */
import type { ModelServiceLocaleKey } from '../../locale'
import type { ModelDraft } from '../../model-service/settings-client'

/** 分区翻译函数座位（宿主 locale 渲染机合成的 t）。 */
export type Translate = (key: ModelServiceLocaleKey, params?: Record<string, unknown>) => string

/** 本行用到的输入事件最小面（测试夹具与真实 React 合成事件的同构子集）。 */
export interface InputEventLike {
  target: { value: string }
}

/** D6 思考策略枚举的渲染清单（顺序即界面顺序；值与 ModelDraft.thinkingStrategy 同域）。 */
const THINKING_STRATEGIES: { value: ModelDraft['thinkingStrategy']; key: ModelServiceLocaleKey }[] = [
  { value: 'all', key: 'thinking.all' },
  { value: 'on-off', key: 'thinking.on-off' },
  { value: 'high-max', key: 'thinking.high-max' },
  { value: 'none', key: 'thinking.none' },
]

const MODALITIES: { value: 'text' | 'image'; key: ModelServiceLocaleKey }[] = [
  { value: 'text', key: 'input.text' },
  { value: 'image', key: 'input.image' },
]

/** 模型编辑行的 props：草案 + 变更回调（ProviderEditModel 持状态）。 */
export interface ModelEditProps {
  t: Translate
  draft: ModelDraft
  onChange: (next: ModelDraft) => void
}

/**
 * 渲染一条模型编辑行（网格布局，样式见 model-service.css）。
 *
 * 数值字段留空 = 不写该字段（宿主按 defaultContextWindow / defaultMaxTokens 或目录值解析）；
 * 非法数字输入忽略（保持原值），不写入草稿。
 */
export function ModelEdit({ t, draft, onChange }: ModelEditProps) {
  const numberInput = (field: 'contextWindow' | 'maxTokens') => (event: InputEventLike) => {
    const raw = event.target.value.trim()
    if (raw === '') {
      onChange({ ...draft, [field]: undefined })
      return
    }
    const parsed = Number(raw)
    if (!Number.isSafeInteger(parsed) || parsed <= 0) return // 非法输入不进草稿
    onChange({ ...draft, [field]: parsed })
  }
  return (
    <div className="ms-model-edit">
      <input
        className="ms-input ms-model-edit-id"
        defaultValue={draft.id}
        aria-label={t('model.id')}
        onChange={(event: InputEventLike) => { onChange({ ...draft, id: event.target.value }) }}
      />
      <input
        className="ms-input ms-model-edit-name"
        defaultValue={draft.name}
        aria-label={t('model.displayName')}
        onChange={(event: InputEventLike) => { onChange({ ...draft, name: event.target.value }) }}
      />
      <input
        className="ms-input ms-model-edit-context"
        defaultValue={draft.contextWindow === undefined ? '' : String(draft.contextWindow)}
        aria-label={t('model.contextWindow')}
        onChange={numberInput('contextWindow')}
      />
      <input
        className="ms-input ms-model-edit-max"
        defaultValue={draft.maxTokens === undefined ? '' : String(draft.maxTokens)}
        aria-label={t('model.maxTokens')}
        onChange={numberInput('maxTokens')}
      />
      <span className="ms-model-edit-modalities">
        {MODALITIES.map((modality) => (
          <label key={modality.value} className="ms-check">
            <input
              type="checkbox"
              checked={draft.input.includes(modality.value)}
              onChange={(event: { target: { checked: boolean } }) => {
                const next = event.target.checked
                  ? [...new Set([...draft.input, modality.value])]
                  : draft.input.filter((item) => item !== modality.value)
                onChange({ ...draft, input: next })
              }}
            />
            {t(modality.key)}
          </label>
        ))}
      </span>
      <span className="ms-model-edit-thinking" role="group" aria-label={t('model.thinkingStrategy')}>
        {THINKING_STRATEGIES.map((strategy) => (
          <button
            key={strategy.value}
            type="button"
            className={`ms-segment${draft.thinkingStrategy === strategy.value ? ' ms-segment-active' : ''}`}
            onClick={() => { onChange({ ...draft, thinkingStrategy: strategy.value }) }}
          >
            {t(strategy.key)}
          </button>
        ))}
      </span>
    </div>
  )
}
