/**
 * client/settings/model-service/model-edit.tsx —— 单条模型的编辑行（dsh-model-service D11/D6）。
 *
 * 字段集对齐宿主 models[] schema（modelProfile：id / name / contextWindow / maxTokens /
 * input / reasoningEfforts）：模型 id、显示名、上下文窗口（档位 select + 自定义回落）、
 * 最大输出、输入模态 chip（文本/图像多选）、思考档位（支持思考 checkbox + 档位 badge 自由
 * 组合 + 自定义档输入；preserve 态原样保留——写读映射本体在 settings-client 的
 * modelFromDraft / modelToDraft）。
 *
 * 本组件是纯渲染行：状态由 ProviderEditModel 持有（编辑动作经 onChange 回调上抛），本文件
 * 不持状态副本、不直接触通道。例外是两处输入焦点保真：显示名跟随 id 的同步与自定义档
 * 受控输入——前者经 ref 直接改 DOM 值（uncontrolled 输入的重渲染不回写 DOM 值，不同步会
 * 显示旧名），后者走受控值（draft.levelInput）驱动校验提示。
 */
import { useRef } from 'react'
import type { ModelServiceLocaleKey } from '../../locale'
import { prettifyId, THINKING_LEVELS, type ModelDraft } from '../../model-service/settings-client'

/** 分区翻译函数座位（宿主 locale 渲染机合成的 t）。 */
export type Translate = (key: ModelServiceLocaleKey, params?: Record<string, unknown>) => string

/** 本行用到的输入事件最小面（测试夹具与真实 React 合成事件的同构子集）。 */
export interface InputEventLike {
  target: { value: string }
}

/** MODALITIES 词表 = 宿主 schema 的 input 字段值域（仅 text/image，音频不被宿主接受）。 */
const MODALITIES: { value: 'text' | 'image'; key: ModelServiceLocaleKey }[] = [
  { value: 'text', key: 'input.text' },
  { value: 'image', key: 'input.image' },
]

/**
 * 上下文窗口档位（32K-2M；1M = 1048576 为新增条目的默认档）。档位外的既有数字（如宿主
 * 侧写过的 1000000）走「自定义…」回落数字输入，无损显示与写回。
 */
const CONTEXT_TIERS: readonly number[] = [32768, 65536, 131072, 204800, 262144, 524288, 1048576, 2097152]

/** 新增条目的默认上下文窗口（1M；发现通道不返回该字段时同用此默认，产品默认可改）。 */
export const DEFAULT_CONTEXT_WINDOW = 1048576

/** 档位数值 → 界面缩写（1M / 512K；档位集都是 1024 的整倍数，除法无损）。 */
function contextTierLabel(value: number): string {
  return value % 1048576 === 0 ? `${value / 1048576}M` : `${value / 1024}K`
}

/** THINKING_LEVELS 档名 → 界面文案 key（7 档词表全覆盖）。 */
function thinkingLevelKey(level: string): ModelServiceLocaleKey {
  return `thinking.level.${level}` as ModelServiceLocaleKey
}

/** 模型编辑行的 props：草案 + 变更回调（ProviderEditModel 持状态）。 */
export interface ModelEditProps {
  t: Translate
  draft: ModelDraft
  onChange: (next: ModelDraft) => void
}

/**
 * 渲染一条模型编辑行（布局见 model-service.css）。
 *
 * 数值字段留空 = 不写该字段（宿主按 defaultContextWindow / defaultMaxTokens 或目录值解析）；
 * 非法数字输入忽略（保持原值），不写入草稿。
 */
export function ModelEdit({ t, draft, onChange }: ModelEditProps) {
  /** 显示名输入框引用：id 输入联动时直接同步 DOM 值（uncontrolled 输入重渲染不回写 DOM）。 */
  const nameRef = useRef<HTMLInputElement | null>(null)
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
  // 上下文窗口的 select 档位判定：档位集内的数字显示对应档，其余（含未填写）走自定义回落。
  const contextTier = CONTEXT_TIERS.some((tier) => tier === draft.contextWindow)
    ? String(draft.contextWindow)
    : 'custom'
  // 自定义档输入的行内校验：空值不提示；非 7 档词表内的名字给非法提示（宿主 reasoningEfforts
  // 的值必须 ∈ THINKING_LEVELS，自由键名会写出非法 wire 值）。
  const levelInputRaw = draft.levelInput?.trim() ?? ''
  const levelInputInvalid = levelInputRaw !== '' && !THINKING_LEVELS.includes(levelInputRaw)
  return (
    <div className="ms-model-edit">
      <input
        className="ms-input ms-model-edit-id"
        defaultValue={draft.id}
        aria-label={t('model.id')}
        onChange={(event: InputEventLike) => {
          const id = event.target.value
          const next: ModelDraft = { ...draft, id }
          if (!draft.nameEdited) {
            next.name = prettifyId(id)
            // 同步显示名输入框的 DOM 值：不依赖全量重渲染保输入焦点（uncontrolled 输入的
            // defaultValue 只在挂载生效，不同步则显示名停留在旧值）。
            if (nameRef.current !== null) nameRef.current.value = next.name
          }
          onChange(next)
        }}
      />
      <input
        ref={nameRef}
        className="ms-input ms-model-edit-name"
        defaultValue={draft.name}
        aria-label={t('model.displayName')}
        title={t('model.nameAutoHint')}
        onChange={(event: InputEventLike) => { onChange({ ...draft, name: event.target.value, nameEdited: true }) }}
      />
      <select
        className="ms-select ms-model-edit-context"
        value={contextTier}
        aria-label={t('model.contextWindow')}
        onChange={(event: InputEventLike) => {
          if (event.target.value === 'custom') {
            // 切到自定义回落：草稿值不动（保留档位数字，输入框就地显示），仅驱动重渲染揭示输入框。
            onChange({ ...draft })
            return
          }
          onChange({ ...draft, contextWindow: Number(event.target.value) })
        }}
      >
        {CONTEXT_TIERS.map((tier) => (
          <option key={tier} value={String(tier)}>{contextTierLabel(tier)}</option>
        ))}
        <option value="custom">{t('model.contextCustom')}</option>
      </select>
      {contextTier === 'custom' && (
        <input
          className="ms-input ms-model-edit-context-custom"
          defaultValue={draft.contextWindow === undefined ? '' : String(draft.contextWindow)}
          aria-label={t('model.contextWindow')}
          onChange={numberInput('contextWindow')}
        />
      )}
      <input
        className="ms-input ms-model-edit-max"
        defaultValue={draft.maxTokens === undefined ? '' : String(draft.maxTokens)}
        aria-label={t('model.maxTokens')}
        onChange={numberInput('maxTokens')}
      />
      <span className="ms-model-edit-modalities" role="group" aria-label={t('model.inputModalities')}>
        {MODALITIES.map((modality) => {
          const active = draft.input.includes(modality.value)
          return (
            <button
              key={modality.value}
              type="button"
              className={`ms-chip${active ? ' ms-chip-active' : ''}`}
              aria-pressed={active}
              onClick={() => {
                // 多选点选；至少保留一个模态（最后一项不可取消——宿主 input 空数组无意义）。
                if (active && draft.input.length <= 1) return
                const next = active
                  ? draft.input.filter((item) => item !== modality.value)
                  : [...new Set([...draft.input, modality.value])]
                onChange({ ...draft, input: next })
              }}
            >
              {t(modality.key)}
            </button>
          )
        })}
      </span>
      <span className="ms-model-edit-thinking-wrap">
        <label className="ms-check">
          <input
            type="checkbox"
            checked={draft.thinkingEnabled}
            onChange={(event: { target: { checked: boolean } }) => {
              // preserve 态勾选即转自由选集（缺省给全集——空档位集写盘 { } 不满足宿主校验）。
              const levels = event.target.checked && draft.levels.length === 0 ? [...THINKING_LEVELS] : draft.levels
              onChange({ ...draft, thinkingEnabled: event.target.checked, preserve: false, levels })
            }}
          />
          {t('model.thinkingEnabled')}
        </label>
        {draft.preserve && <span className="ms-model-preserved">{t('model.thinkingPreserved')}</span>}
        {(draft.thinkingEnabled || draft.preserve) && (
          <span className="ms-model-levels" role="group" aria-label={t('model.thinkingLevels')}>
            {draft.levels.map((level) => (
              <span key={level} className="ms-level-badge">
                {t(thinkingLevelKey(level))}
                <button
                  type="button"
                  className="ms-level-remove"
                  aria-label={`${t('model.levelRemove')} ${t(thinkingLevelKey(level))}`}
                  onClick={() => { onChange({ ...draft, levels: draft.levels.filter((item) => item !== level) }) }}
                >
                  ×
                </button>
              </span>
            ))}
            {THINKING_LEVELS.filter((level) => !draft.levels.includes(level)).map((level) => (
              <button
                key={level}
                type="button"
                className="ms-level-pill"
                onClick={() => {
                  // preserve 态点任一档位即转自由选集（以点选档为种子），preserve 语义解除。
                  onChange({ ...draft, thinkingEnabled: true, preserve: false, levels: [...draft.levels, level] })
                }}
              >
                + {t(thinkingLevelKey(level))}
              </button>
            ))}
            <input
              className="ms-input ms-level-input"
              value={draft.levelInput ?? ''}
              placeholder={t('model.levelCustomPlaceholder')}
              aria-label={t('model.levelCustom')}
              onChange={(event: InputEventLike) => { onChange({ ...draft, levelInput: event.target.value }) }}
              onKeyDown={(event: { key: string }) => {
                if (event.key !== 'Enter') return
                if (levelInputInvalid) return
                if (draft.levels.includes(levelInputRaw)) return
                onChange({ ...draft, levels: [...draft.levels, levelInputRaw], levelInput: '' })
              }}
            />
            {levelInputInvalid && <span className="ms-level-error">{t('model.levelInvalid')}</span>}
          </span>
        )}
      </span>
    </div>
  )
}
