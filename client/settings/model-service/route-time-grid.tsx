/**
 * client/settings/model-service/route-time-grid.tsx —— 三层时间窗组件（dsh-model-service
 * D5/G5，M2）。
 *
 * 三层（D5 采用段）：命名窗口 × 7 天矩阵（掩码摘要视图）/ 按天 48 格精细时段（直接编辑）/
 * 特殊日期（include|exclude + 当日掩码）。三层共享同一份 7×48 掩码——组件是**受控**的：
 * 掩码（value）由持有方（路由编辑器）保存，三层都只是它的投影与编辑器，编辑即 onChange
 * 产出新掩码（零同步路径：没有第二份数据，三层间不存在「同步」动作）。
 *
 * 命名窗口 = 一天内固定时段段的预设名（清晨/上午/下午/晚间/深夜），矩阵是掩码的摘要视图：
 * 每格三态（窗口内格全命中 = 整段覆盖 / 部分命中 = 部分覆盖 / 零命中 = 未覆盖），点击 =
 * 该天该段整段开关（部分态点成整段）。窗口是纯投影常量，不进 Config。
 *
 * 时间语义（与 route-evaluate.ts 一致）：宿主本地时区、周一为首日（矩阵首列 = 周一）、
 * 格边界 [start, end) 半小时（48 格 = 00:00 起每 30 分钟一格）。
 */
import { useRef, useState } from 'react'
import {
  DAYS_PER_WEEK,
  SLOTS_PER_DAY,
  isValidSpecialDateShape,
  type RouteSpecialDate,
  type RouteWindowMask,
} from '../../model-service/route-evaluate'
import type { ModelServiceLocaleKey } from '../../locale'

/** 翻译函数形态（各视图共用）。 */
export type Translate = (key: ModelServiceLocaleKey, params?: Record<string, unknown>) => string

/** 命名窗口预设（纯投影常量，不进 Config）：一天内连续的格段。 */
interface NamedWindow {
  /** locale 键尾段（route.window.<id>）。 */
  id: string
  /** 起始格（含）。 */
  start: number
  /** 结束格（不含）。 */
  end: number
}

/** 命名窗口预设清单（按一天时序排列；格子区间互斥且全覆盖 48 格）。 */
const NAMED_WINDOWS: NamedWindow[] = [
  { id: 'night', start: 0, end: 12 }, // 00:00–06:00
  { id: 'dawn', start: 12, end: 18 }, // 06:00–09:00
  { id: 'morning', start: 18, end: 24 }, // 09:00–12:00
  { id: 'afternoon', start: 24, end: 36 }, // 12:00–18:00
  { id: 'evening', start: 36, end: 48 }, // 18:00–24:00
]

/** 周首日序的日名 locale 键尾段（route.day.0 = 周一 … route.day.6 = 周日）。 */
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

/** 空掩码（全不覆盖 + 无特殊日期）。 */
export function emptyRouteWindowMask(): RouteWindowMask {
  return {
    days: Array.from({ length: DAYS_PER_WEEK }, () => Array.from({ length: SLOTS_PER_DAY }, () => false)),
    specialDates: [],
  }
}

/** 掩码深拷贝（编辑器产出新对象——受控组件纪律：不改入参）。 */
function cloneMask(mask: RouteWindowMask): RouteWindowMask {
  return {
    days: mask.days.map((row) => [...row]),
    specialDates: mask.specialDates.map((special) => ({
      ...special,
      ...(special.mask !== undefined ? { mask: [...special.mask] } : {}),
    })),
  }
}

/** 格 → 展示时刻（"HH:MM"；格 n = [n*30min, (n+1)*30min)）。 */
function slotLabel(slot: number): string {
  const hour = Math.floor(slot / 2)
  const minute = slot % 2 === 0 ? '00' : '30'
  return `${`${hour}`.padStart(2, '0')}:${minute}`
}

/**
 * 特殊日期格点切换 + 冗余掩码归一（导出供单测锁定归一语义；受控纪律：不改入参，返回新条目）。
 *
 * 归一只发生在「mask 与无 mask 语义等价」时（isSlotCoveredAt 的特殊日期分支）：全 48 格
 * true 对两种 mode 都等价无 mask——include 全命中 = 全天、exclude 全剔除 = 全天剔除。
 * exclude 的 mask 全 **false**（无剔除格 = 该日按周表）与无 mask（全天剔除）语义相反，
 * 必须保留 mask，不可归一。
 */
export function toggleSpecialMaskSlot(special: RouteSpecialDate, slot: number): RouteSpecialDate {
  const source = [...(special.mask ?? Array.from({ length: SLOTS_PER_DAY }, () => special.mode === 'include'))]
  source[slot] = !source[slot]
  if (source.every((value) => value === true)) return { date: special.date, name: special.name, mode: special.mode }
  return { ...special, mask: [...source] }
}

/** 三层视图 id。 */
type GridLayer = 'matrix' | 'slots' | 'special'

/** 组件 props（受控：value/onChange + 翻译座位）。 */
export interface RouteTimeGridProps {
  t: Translate
  value: RouteWindowMask
  onChange: (mask: RouteWindowMask) => void
}

/**
 * 三层时间窗：层切换条 + 当前层内容。三层共用 value 这一份掩码（零同步路径）。
 */
export function RouteTimeGrid({ t, value, onChange }: RouteTimeGridProps) {
  const layer = useRef<GridLayer>('matrix')
  const focusDay = useRef<number>(0)
  const [, rerender] = useState(0)
  const rerenderNow = () => rerender((count) => count + 1)

  const switchLayer = (candidate: GridLayer): void => {
    layer.current = candidate
    rerenderNow()
  }

  const updateMask = (mutate: (draft: RouteWindowMask) => void): void => {
    const draft = cloneMask(value)
    mutate(draft)
    onChange(draft)
  }

  const current = layer.current
  return (
    <div className="ms-timegrid">
      <div className="ms-timegrid-layers" role="tablist">
        {(['matrix', 'slots', 'special'] as const).map((candidate) => (
          <button
            key={candidate}
            type="button"
            role="tab"
            aria-selected={current === candidate}
            className={`ms-timegrid-layer-button${current === candidate ? ' ms-timegrid-layer-button-active' : ''}`}
            onClick={() => { switchLayer(candidate) }}
          >
            {t(`route.grid.${candidate}` as ModelServiceLocaleKey)}
          </button>
        ))}
      </div>
      {current === 'matrix' && (
        <WeekMatrix t={t} mask={value} onToggleWindow={(day, window) => {
          updateMask((draft) => {
            const target = draft.days[day][window.start]
            for (let slot = window.start; slot < window.end; slot += 1) draft.days[day][slot] = !target
          })
        }} />
      )}
      {current === 'slots' && (
        <DaySlots
          t={t}
          mask={value}
          day={focusDay.current}
          onSelectDay={(day) => { focusDay.current = day; rerenderNow() }}
          onToggleSlot={(day, slot) => {
            updateMask((draft) => {
              draft.days[day][slot] = !draft.days[day][slot]
            })
          }}
        />
      )}
      {current === 'special' && (
        <SpecialDatesLayer t={t} mask={value} onChange={onChange} />
      )}
    </div>
  )
}

/** 命名窗口 × 7 天矩阵（摘要三态；点击 = 该天该段整段开关）。 */
function WeekMatrix({ t, mask, onToggleWindow }: {
  t: Translate
  mask: RouteWindowMask
  onToggleWindow: (day: number, window: NamedWindow) => void
}) {
  const cellState = (day: number, window: NamedWindow): 'full' | 'partial' | 'none' => {
    let covered = 0
    const total = window.end - window.start
    for (let slot = window.start; slot < window.end; slot += 1) {
      if (mask.days[day]?.[slot] === true) covered += 1
    }
    if (covered === 0) return 'none'
    return covered === total ? 'full' : 'partial'
  }
  return (
    <div className="ms-weekmatrix" role="grid" aria-label={t('route.grid.matrix')}>
      <div className="ms-weekmatrix-row ms-weekmatrix-head">
        <span className="ms-weekmatrix-corner">{t('route.grid.matrixHead')}</span>
        {NAMED_WINDOWS.map((window) => (
          <span key={window.id} className="ms-weekmatrix-colhead">{t(`route.window.${window.id}` as ModelServiceLocaleKey)}</span>
        ))}
      </div>
      {Array.from({ length: DAYS_PER_WEEK }, (_, day) => (
        <div key={day} className="ms-weekmatrix-row">
          <span className="ms-weekmatrix-daylabel">{t(`route.day.${DAY_KEYS[day]}` as ModelServiceLocaleKey)}</span>
          {NAMED_WINDOWS.map((window) => {
            const state = cellState(day, window)
            return (
              <button
                key={window.id}
                type="button"
                className={`ms-weekmatrix-cell ms-weekmatrix-${state}`}
                aria-label={t('route.grid.cellAria', { day: t(`route.day.${DAY_KEYS[day]}` as ModelServiceLocaleKey), window: t(`route.window.${window.id}` as ModelServiceLocaleKey) })}
                onClick={() => { onToggleWindow(day, window) }}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}

/** 按天 48 格精细时段（直接编辑；选天 + 该天 48 格条）。 */
function DaySlots({ t, mask, day, onSelectDay, onToggleSlot }: {
  t: Translate
  mask: RouteWindowMask
  day: number
  onSelectDay: (day: number) => void
  onToggleSlot: (day: number, slot: number) => void
}) {
  const row = mask.days[day] ?? []
  return (
    <div className="ms-dayslots">
      <div className="ms-dayslots-days" role="tablist">
        {Array.from({ length: DAYS_PER_WEEK }, (_, candidate) => (
          <button
            key={candidate}
            type="button"
            role="tab"
            aria-selected={candidate === day}
            className={`ms-dayslot-day-button${candidate === day ? ' ms-dayslot-day-button-active' : ''}`}
            onClick={() => { onSelectDay(candidate) }}
          >
            {t(`route.day.${DAY_KEYS[candidate]}` as ModelServiceLocaleKey)}
          </button>
        ))}
      </div>
      <div className="ms-dayslots-bar" role="grid" aria-label={t('route.grid.slots')}>
        {Array.from({ length: SLOTS_PER_DAY }, (_, slot) => (
          <button
            key={slot}
            type="button"
            title={`${slotLabel(slot)}–${slotLabel(slot + 1)}`}
            aria-label={`${slotLabel(slot)}–${slotLabel(slot + 1)}`}
            className={`ms-dayslot-cell${row[slot] === true ? ' ms-dayslot-on' : ''}${slot % 6 === 0 ? ' ms-dayslot-hour' : ''}`}
            onClick={() => { onToggleSlot(day, slot) }}
          />
        ))}
      </div>
      <div className="ms-dayslots-scale">
        {[0, 6, 12, 18, 24, 30, 36, 42].map((slot) => (
          <span key={slot} className="ms-dayslots-tick">{slotLabel(slot)}</span>
        ))}
      </div>
    </div>
  )
}

/** 特殊日期层：清单 + 添加（include|exclude + 当日掩码 48 格编辑）。 */
function SpecialDatesLayer({ t, mask, onChange }: {
  t: Translate
  mask: RouteWindowMask
  onChange: (mask: RouteWindowMask) => void
}) {
  const draftDate = useRef('01-01')
  const draftName = useRef('')
  const draftMode = useRef<'include' | 'exclude'>('include')
  const expandedIndex = useRef<number | undefined>(undefined)
  const [, rerender] = useState(0)
  const rerenderNow = () => rerender((count) => count + 1)

  const mutateSpecials = (mutate: (specials: RouteSpecialDate[]) => void): void => {
    const next = cloneMask(mask)
    mutate(next.specialDates)
    onChange(next)
  }

  const addSpecial = (): void => {
    const date = draftDate.current
    // 与 sanitize 侧同一判定（route-evaluate.isValidSpecialDateShape）：越界日期（如 13-45）
    // 不再「添加成功、下次读回被丢弃」——添加入口直接拒绝（终态同步 F1-28）。
    if (!isValidSpecialDateShape(date)) return
    mutateSpecials((specials) => {
      specials.push({
        date,
        name: draftName.current.trim() !== '' ? draftName.current.trim() : date,
        mode: draftMode.current,
      })
    })
    rerenderNow()
  }

  return (
    <div className="ms-specials">
      <div className="ms-specials-add">
        <input
          type="text"
          className="ms-input ms-specials-date"
          aria-label={t('route.special.dateField')}
          placeholder="MM-DD / YYYY-MM-DD"
          value={draftDate.current}
          onChange={(event) => { draftDate.current = event.target.value }}
        />
        <input
          type="text"
          className="ms-input ms-specials-name"
          aria-label={t('route.special.nameField')}
          placeholder={t('route.special.namePlaceholder')}
          value={draftName.current}
          onChange={(event) => { draftName.current = event.target.value }}
        />
        <select
          className="ms-select ms-specials-mode"
          aria-label={t('route.special.modeField')}
          value={draftMode.current}
          onChange={(event) => { draftMode.current = event.target.value === 'exclude' ? 'exclude' : 'include' }}
        >
          <option value="include">{t('route.special.include')}</option>
          <option value="exclude">{t('route.special.exclude')}</option>
        </select>
        <button type="button" className="ms-button" onClick={addSpecial}>{t('route.special.add')}</button>
      </div>
      {mask.specialDates.length === 0 && (
        <div className="ms-row-note">{t('route.special.empty')}</div>
      )}
      {mask.specialDates.map((special, index) => {
        const expanded = expandedIndex.current === index
        return (
          <div key={`${special.date}-${index}`} className="ms-specials-item">
            <div className="ms-row">
              <span className="ms-row-name">{special.name}</span>
              <span className="ms-badge ms-badge-catalog">{special.date}</span>
              <span className={`ms-badge ${special.mode === 'include' ? 'ms-badge-ok' : 'ms-badge-missing'}`}>
                {t(special.mode === 'include' ? 'route.special.include' : 'route.special.exclude')}
              </span>
              <span className="ms-row-actions">
                <button
                  type="button"
                  className="ms-button"
                  onClick={() => { expandedIndex.current = expanded ? undefined : index; rerenderNow() }}
                >
                  {t(expanded ? 'action.cancel' : 'route.special.editMask')}
                </button>
                <button
                  type="button"
                  className="ms-button ms-button-danger"
                  onClick={() => { mutateSpecials((specials) => { specials.splice(index, 1) }); expandedIndex.current = undefined }}
                >
                  {t('route.special.remove')}
                </button>
              </span>
            </div>
            {expanded && (
              <div className="ms-specials-mask">
                <div className="ms-field-hint">{t('route.special.maskHint')}</div>
                <div className="ms-dayslots-bar">
                  {Array.from({ length: SLOTS_PER_DAY }, (_, slot) => {
                    const on = special.mask !== undefined ? special.mask[slot] === true : true
                    return (
                      <button
                        key={slot}
                        type="button"
                        title={`${slotLabel(slot)}–${slotLabel(slot + 1)}`}
                        className={`ms-dayslot-cell${on ? ' ms-dayslot-on' : ''}${slot % 6 === 0 ? ' ms-dayslot-hour' : ''}`}
                        onClick={() => {
                          mutateSpecials((specials) => {
                            specials[index] = toggleSpecialMaskSlot(specials[index], slot)
                          })
                        }}
                      />
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
