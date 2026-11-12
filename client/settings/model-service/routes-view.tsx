/**
 * client/settings/model-service/routes-view.tsx —— 路由视图（dsh-model-service D1/D4/D5/G18，
 * M2：V5/V6/V7 的界面承载）。
 *
 * 结构：
 *   · 注册冲突状态条（V7 步骤 6 / ROUTE_REGISTRATION_FAILED）：registrationFailed 非空时
 *     顶部呈现「路由功能不可用：provider id 与宿主冲突」+ 恢复指引（探测判定见 route-store
 *     ——路由已配置但宿主注册表无对应 taiji-route-<id> 条目）；
 *   · 空态矩阵（M2 期三态，G18）：无路由 → 新建引导；有路由但白名单无有效勾选 → 指向
 *     白名单；白名单有有效勾选但勾选路由的成员全部不可用 → 指向成员检查；
 *   · 路由列表（成员顺序与成员级条件 + 当前命中预览）+ 白名单勾选 + 悬挂条目标注（「路由
 *     已删除」）+ 单条移除与批量清理（只移除悬挂条目）；
 *   · 展开体路由编辑器（RouteEditorBody）：名称（改名不改 id——D5 id 创建后固定）+ 成员
 *     列表（provider/model 选择、条件 none|window、order 上下移）+ 三层时间窗
 *     （route-time-grid）。
 *
 * 交互状态纪律（section.tsx 同款）：真相放 useRef + 重渲染扳机——测试夹具的 useState 桩
 * 不触发重渲染，真相在 ref 才能被同一渲染树上的后续交互读到。
 *
 * 成员可用性标注（G18）：供应商已删 / 模型不在清单 / 凭据缺失（route-store 探测派生）。
 * 「当前命中」预览 = route-evaluate.evaluateRoutesAt（与 Node 半场求值同源——同一纯函数，
 * store 打开视图时算一次）。
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { RoutesListModel, deriveRouteId, type MemberAvailability, type RoutesSnapshot } from '../../model-service/route-store'
import { memberAvailabilityLocaleKeys } from '../../model-service/route-errors'
import { type RouteCondition, type RouteEntry, type RouteMember, type RouteWindowMask } from '../../model-service/route-evaluate'
import type { Translate } from './route-time-grid'
import { emptyRouteWindowMask, RouteTimeGrid } from './route-time-grid'

/** 路由视图 props。 */
export interface RoutesViewProps {
  t: Translate
  model: RoutesListModel
}

/** 渲染路由视图（状态条 + 空态矩阵 + 路由列表 + 白名单区）。 */
export function RoutesView({ t, model }: RoutesViewProps) {
  const state = useSyncExternalStore(
    (listener) => model.subscribe(listener),
    () => model.getSnapshot(),
    () => model.getSnapshot(),
  )
  const newDraftName = useRef('')
  const [, rerender] = useState(0)

  useEffect(() => {
    model.setTranslate(t)
  }, [])

  const createRoute = async (): Promise<void> => {
    const name = newDraftName.current
    if (name.trim() === '') return
    await model.createRoute(name)
    newDraftName.current = ''
    rerender((count) => count + 1)
  }

  return (
    <div className="ms-routes">
      <RegistrationFailureBanner t={t} state={state} />
      <NewRouteForm
        t={t}
        draftName={newDraftName.current}
        routes={state.routes}
        whitelist={state.whitelist}
        onNameInput={(value) => { newDraftName.current = value; rerender((count) => count + 1) }}
        onCreate={() => { void createRoute() }}
      />
      <RouteList t={t} state={state} model={model} />
      <HangingWhitelist t={t} state={state} model={model} />
      {state.notice !== undefined && <div className="ms-note ms-note-warn" role="status">{state.notice}</div>}
      {state.error !== undefined && <div className="ms-error" role="alert">{state.error}</div>}
    </div>
  )
}

/** 注册冲突状态条（ROUTE_REGISTRATION_FAILED + 恢复指引；V7 步骤 6）。 */
function RegistrationFailureBanner({ t, state }: { t: Translate; state: RoutesSnapshot }) {
  if (state.registrationFailed.length === 0) return null
  const names = state.routes
    .filter((route) => state.registrationFailed.includes(route.id))
    .map((route) => route.name)
  return (
    <div className="ms-note ms-note-warn" role="alert">
      {t('route.registrationFailed', { routes: names.join('、') })}
      <div className="ms-row-note">{t('route.registrationFailedNext')}</div>
    </div>
  )
}

/** 新建路由表单（名称 + 派生 id 预览——AX11 显示名与标识解耦的可见化；预览与保存侧同款
 * 查重输入（routes + 白名单含悬挂），同名时预览即加序号后的落盘 id——终态同步 F1-27）。 */
function NewRouteForm({ t, draftName, routes, whitelist, onNameInput, onCreate }: {
  t: Translate
  draftName: string
  routes: RouteEntry[]
  whitelist: string[]
  onNameInput: (value: string) => void
  onCreate: () => void
}) {
  const preview = draftName.trim() === '' ? undefined : deriveRouteId(draftName, routes, whitelist)
  return (
    <div className="ms-routes-add">
      <input
        type="text"
        className="ms-input ms-routes-name"
        aria-label={t('route.nameField')}
        placeholder={t('route.namePlaceholder')}
        value={draftName}
        onChange={(event) => { onNameInput(event.target.value) }}
      />
      {preview !== undefined && <span className="ms-row-note">{t('route.idPreview', { id: preview })}</span>}
      <button type="button" className="ms-button ms-button-primary" disabled={draftName.trim() === ''} onClick={onCreate}>
        {t('route.create')}
      </button>
    </div>
  )
}

/** 路由列表（含空态矩阵；每行 = 勾选 + 名称/id + 命中预览 + 动作）。 */
function RouteList({ t, state, model }: { t: Translate; state: RoutesSnapshot; model: RoutesListModel }) {
  const [editing, setEditing] = useState<RouteEntry | undefined>(undefined)
  if (state.status === 'unavailable') {
    return <div className="ms-note ms-note-warn">{t('routes.snapshotUnavailable')}</div>
  }
  if (state.status === 'loading') {
    return <div className="ms-note">{t('providers.loading')}</div>
  }
  const whitelistedAlive = state.routes.filter((route) => state.whitelist.includes(route.id))
  const whitelistedAliveWithMember = whitelistedAlive.filter((route) =>
    route.members.some((member) => {
      const availability = state.memberAvailability.get(`${member.provider}/${member.model}`)
      return availability === undefined || !(availability.providerMissing || (availability.modelMissing && hasConcreteModels(state, member.provider)) || availability.credentialMissing)
    }),
  )
  return (
    <div className="ms-rows ms-routes-list">
      {state.routes.length === 0 && (
        <div className="ms-empty">
          <div className="ms-empty-title">{t('routes.emptyNoRoutes')}</div>
          <div className="ms-empty-next">{t('routes.emptyNoRoutesNext')}</div>
        </div>
      )}
      {state.routes.length > 0 && whitelistedAlive.length === 0 && (
        <div className="ms-empty">
          <div className="ms-empty-title">{t('routes.emptyNotWhitelisted')}</div>
          <div className="ms-empty-next">{t('routes.emptyNotWhitelistedNext')}</div>
        </div>
      )}
      {whitelistedAlive.length > 0 && whitelistedAliveWithMember.length === 0 && (
        <div className="ms-empty">
          <div className="ms-empty-title">{t('routes.emptyMembersUnavailable')}</div>
          <div className="ms-empty-next">{t('routes.emptyMembersUnavailableNext')}</div>
        </div>
      )}
      {state.routes.map((route) => (
        <RouteRow
          key={route.id}
          t={t}
          route={route}
          state={state}
          model={model}
          editing={editing !== undefined && editing.id === route.id ? editing : undefined}
          onStartEdit={() => { setEditing(route) }}
          onCloseEdit={() => { setEditing(undefined) }}
        />
      ))}
    </div>
  )
}

/** 该 provider 是否有本地可判定的模型清单（自定义清单态——models[] 非空）。 */
function hasConcreteModels(state: RoutesSnapshot, provider: string): boolean {
  const row = state.selectableProviders.find((candidate) => candidate.key === provider)
  return row !== undefined && row.models.length > 0
}

/** 单条路由行（白名单勾选 + 悬挂标注 + 命中预览 + 成员可用性 + 编辑/删除）。 */
function RouteRow({ t, route, state, model, editing, onStartEdit, onCloseEdit }: {
  t: Translate
  route: RouteEntry
  state: RoutesSnapshot
  model: RoutesListModel
  editing: RouteEntry | undefined
  onStartEdit: () => void
  onCloseEdit: () => void
}) {
  const deleteArmed = useRef(false)
  const [, rerender] = useState(0)
  const whitelisted = state.whitelist.includes(route.id)
  const hit = state.hits.get(route.id)
  return (
    <div className="ms-route-item">
      <div className="ms-row">
        <label className="ms-check">
          <input
            type="checkbox"
            checked={whitelisted}
            aria-label={t('route.whitelistToggle', { name: route.name })}
            onChange={() => { void model.toggleWhitelist(route.id) }}
          />
          {t('route.whitelistedBadge')}
        </label>
        <span className="ms-row-name">{route.name}</span>
        <span className="ms-badge ms-badge-catalog">{route.id}</span>
        {hit !== undefined ? (
          <span className="ms-row-note">{t('route.hitNow', { provider: hit.provider, model: hit.model })}</span>
        ) : (
          <span className="ms-row-note">{t('route.noHitNow')}</span>
        )}
        <span className="ms-row-actions">
          <button type="button" className="ms-button" onClick={() => { editing !== undefined ? onCloseEdit() : onStartEdit() }}>
            {t(editing !== undefined ? 'action.cancel' : 'route.edit')}
          </button>
          <button
            type="button"
            className={`ms-button ${deleteArmed.current ? 'ms-button-danger' : ''}`}
            onClick={() => {
              if (deleteArmed.current) {
                deleteArmed.current = false
                void model.deleteRoute(route.id)
              } else {
                deleteArmed.current = true
              }
              rerender((count) => count + 1)
            }}
          >
            {t(deleteArmed.current ? 'route.confirmDelete' : 'route.delete')}
          </button>
        </span>
      </div>
      <RouteMembersInline t={t} route={route} state={state} />
      {editing !== undefined && (
        <RouteEditorBody t={t} route={editing} model={model} selectableProviders={state.selectableProviders} onCancel={onCloseEdit} />
      )}
    </div>
  )
}

/** 路由成员行内摘要（成员顺序 + 条件摘要 + 成员可用性标注——G18）。 */
function RouteMembersInline({ t, route, state }: { t: Translate; route: RouteEntry; state: RoutesSnapshot }) {
  if (route.members.length === 0) {
    return <div className="ms-row-note">{t('route.noMembers')}</div>
  }
  const sorted = [...route.members].sort((left, right) => left.order - right.order)
  return (
    <div className="ms-route-members">
      {sorted.map((member, index) => {
        const availability = state.memberAvailability.get(`${member.provider}/${member.model}`)
        const conditionLabel = member.condition.type === 'none'
          ? t('route.conditionNone')
          : member.condition.type === 'window' ? t('route.conditionWindow') : t('route.conditionUnavailable')
        return (
          <div key={`${member.provider}/${member.model}/${index}`} className="ms-row ms-route-member">
            <span className="ms-badge">{index + 1}</span>
            <span className="ms-row-name">{member.provider} / {member.model}</span>
            <span className="ms-badge">{conditionLabel}</span>
            {availability !== undefined && <MemberAvailabilityBadges t={t} availability={availability} />}
          </div>
        )
      })}
    </div>
  )
}

/** 成员可用性标注三型（G18：供应商已删 / 模型不在清单 / 凭据缺失；键映射归 route-errors）。 */
function MemberAvailabilityBadges({ t, availability }: { t: Translate; availability: MemberAvailability }) {
  const keys = memberAvailabilityLocaleKeys(availability)
  if (keys.length === 0) return null
  return (
    <span className="ms-row-actions">
      {keys.map((key) => (
        <span key={key} className="ms-badge ms-badge-missing">
          {t(key, key === 'route.memberCredentialMissing' ? { ref: availability.ref ?? '' } : undefined)}
        </span>
      ))}
    </span>
  )
}

/** 悬挂白名单条目区（「路由已删除」标注 + 单条移除 + 批量清理——D1/V6）。 */
function HangingWhitelist({ t, state, model }: { t: Translate; state: RoutesSnapshot; model: RoutesListModel }) {
  if (state.hanging.length === 0) return null
  return (
    <div className="ms-hanging">
      <div className="ms-row">
        <span className="ms-row-name">{t('route.hangingTitle', { n: state.hanging.length })}</span>
        <span className="ms-row-actions">
          <button type="button" className="ms-button" onClick={() => { void model.cleanupHanging() }}>
            {t('route.cleanupHanging')}
          </button>
        </span>
      </div>
      {state.hanging.map((id) => (
        <div key={id} className="ms-row ms-row-managed">
          <span className="ms-row-name">{id}</span>
          <span className="ms-badge ms-badge-missing">{t('route.hangingBadge')}</span>
          <span className="ms-row-actions">
            <button type="button" className="ms-button" onClick={() => { void model.removeWhitelistEntry(id) }}>
              {t('route.removeHanging')}
            </button>
          </span>
        </div>
      ))}
    </div>
  )
}

// ── 路由编辑器（展开体）───────────────────────────────────────────────────────────────

/** 可选 provider 行（route-store 派生的窄形态；编辑器消费）。 */
interface EditorSelectableProvider {
  key: string
  name: string
  models: { id: string; name: string }[]
}

/** 编辑器 props。 */
export interface RouteEditorBodyProps {
  t: Translate
  /** 编辑中的路由草案（store 快照里的该条路由；保存时整体替换）。 */
  route: RouteEntry
  model: RoutesListModel
  selectableProviders: EditorSelectableProvider[]
  onCancel: () => void
}

/**
 * 路由编辑器：名称（改名不改 id——D5）+ 成员列表（provider/model、条件、order 上下移）+
 * window 条件的三层时间窗。真相在 ref（夹具纪律）；保存 = store.saveRoute 整体替换。
 */
export function RouteEditorBody({ t, route, model, selectableProviders, onCancel }: RouteEditorBodyProps) {
  const nameRef = useRef(route.name)
  const membersRef = useRef<RouteMember[]>(route.members.map((member) => ({ ...member, condition: { ...member.condition } })))
  const expandedMember = useRef<number>(undefined)
  const [, rerender] = useState(0)
  const rerenderNow = () => rerender((count) => count + 1)

  const draft = (): RouteEntry => ({
    id: route.id,
    name: nameRef.current.trim() !== '' ? nameRef.current.trim() : route.id,
    members: membersRef.current,
  })

  const mutateMembers = (mutate: (members: RouteMember[]) => void): void => {
    mutate(membersRef.current)
    rerenderNow()
  }

  const addMember = (): void => {
    mutateMembers((members) => {
      members.push({
        provider: selectableProviders[0]?.key ?? '',
        model: selectableProviders[0]?.models[0]?.id ?? '',
        order: members.length + 1,
        condition: { type: 'none' },
      })
      expandedMember.current = members.length - 1
    })
  }

  const save = (): void => {
    void model.saveRoute(draft()).then(onCancel)
  }

  const expanded = expandedMember.current
  return (
    <div className="ms-edit-body ms-route-editor">
      <div className="ms-field">
        <label className="ms-field-label" htmlFor={`route-name-${route.id}`}>{t('route.nameField')}</label>
        <input
          id={`route-name-${route.id}`}
          type="text"
          className="ms-input"
          value={nameRef.current}
          onChange={(event) => { nameRef.current = event.target.value; rerenderNow() }}
        />
        <div className="ms-field-hint">{t('route.nameHint', { id: route.id })}</div>
      </div>
      <div className="ms-models-block">
        <div className="ms-models-head">
          <span>{t('route.membersTitle')}</span>
          <button type="button" className="ms-button" onClick={addMember}>{t('route.addMember')}</button>
        </div>
        {membersRef.current.map((member, index) => {
          const memberExpanded = expanded === index
          return (
            <div key={index} className="ms-model-row">
              <span className="ms-badge">{index + 1}</span>
              <MemberEditor
                t={t}
                member={member}
                selectableProviders={selectableProviders}
                expanded={memberExpanded}
                onToggleExpand={() => { expandedMember.current = memberExpanded ? undefined : index; rerenderNow() }}
                onChange={(next) => { mutateMembers((members) => { members[index] = next }) }}
              />
              <span className="ms-row-actions">
                <button
                  type="button"
                  className="ms-button"
                  disabled={index === 0}
                  aria-label={t('route.moveUp')}
                  onClick={() => { mutateMembers((members) => { swapMember(members, index, index - 1) }) }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="ms-button"
                  disabled={index === membersRef.current.length - 1}
                  aria-label={t('route.moveDown')}
                  onClick={() => { mutateMembers((members) => { swapMember(members, index, index + 1) }) }}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="ms-button ms-button-danger"
                  aria-label={t('route.removeMember')}
                  onClick={() => { mutateMembers((members) => { members.splice(index, 1) }) }}
                >
                  {t('route.removeMember')}
                </button>
              </span>
            </div>
          )
        })}
        {membersRef.current.length === 0 && <div className="ms-row-note">{t('route.noMembers')}</div>}
      </div>
      <div className="ms-edit-actions">
        <button type="button" className="ms-button ms-button-primary" onClick={save}>{t('action.save')}</button>
        <button type="button" className="ms-button" onClick={onCancel}>{t('action.cancel')}</button>
      </div>
    </div>
  )
}

/** 相邻成员交换（order 重排：数组序即 order 序）。 */
function swapMember(members: RouteMember[], a: number, b: number): void {
  if (a < 0 || b < 0 || a >= members.length || b >= members.length) return
  const tmp = members[a]
  members[a] = members[b]
  members[b] = tmp
  members.forEach((member, index) => { member.order = index + 1 })
}

/** 单个成员的编辑行（provider/model 选择 + 条件；展开体 = window 时的时间窗）。 */
function MemberEditor({ t, member, selectableProviders, expanded, onToggleExpand, onChange }: {
  t: Translate
  member: RouteMember
  selectableProviders: EditorSelectableProvider[]
  expanded: boolean
  onToggleExpand: () => void
  onChange: (member: RouteMember) => void
}) {
  const providerRow = selectableProviders.find((row) => row.key === member.provider)
  const setCondition = (condition: RouteCondition): void => {
    onChange({ ...member, condition })
  }
  const setWindow = (window: RouteWindowMask): void => {
    setCondition({ type: 'window', window })
  }
  return (
    <span className="ms-route-member-edit">
      <select
        className="ms-select"
        aria-label={t('route.memberProvider')}
        value={member.provider}
        onChange={(event) => {
          const nextProvider = event.target.value
          const nextRow = selectableProviders.find((row) => row.key === nextProvider)
          onChange({ ...member, provider: nextProvider, model: nextRow?.models[0]?.id ?? '' })
        }}
      >
        {selectableProviders.length === 0 && <option value="">{t('route.noSelectableProviders')}</option>}
        {selectableProviders.map((row) => (
          <option key={row.key} value={row.key}>{row.name}</option>
        ))}
      </select>
      {providerRow !== undefined && providerRow.models.length > 0 ? (
        <select
          className="ms-select"
          aria-label={t('route.memberModel')}
          value={member.model}
          onChange={(event) => { onChange({ ...member, model: event.target.value }) }}
        >
          {providerRow.models.map((model) => (
            <option key={model.id} value={model.id}>{model.name !== '' ? model.name : model.id}</option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          className="ms-input"
          aria-label={t('route.memberModel')}
          placeholder={t('route.memberModelInput')}
          value={member.model}
          onChange={(event) => { onChange({ ...member, model: event.target.value }) }}
        />
      )}
      <select
        className="ms-select"
        aria-label={t('route.memberCondition')}
        value={member.condition.type === 'window' ? 'window' : member.condition.type === 'none' ? 'none' : 'unavailable'}
        onChange={(event) => {
          const value = event.target.value
          if (value === 'none') setCondition({ type: 'none' })
          else if (value === 'window') {
            // 空掩码必须走 emptyRouteWindowMask（7×48 归一）：内联 days:[] 会让时间窗格子
            // 的 draft.days[day] 索引到 undefined 抛 TypeError（终态同步 F1-9，D5 编辑面）。
            setCondition({ type: 'window', window: member.condition.window ?? emptyRouteWindowMask() })
          }
        }}
      >
        <option value="none">{t('route.conditionNone')}</option>
        <option value="window">{t('route.conditionWindow')}</option>
        <option value="unavailable" disabled>{t('route.conditionUnavailable')}</option>
      </select>
      <button type="button" className="ms-button" onClick={onToggleExpand}>
        {t(expanded ? 'action.cancel' : 'route.editWindow')}
      </button>
      {expanded && member.condition.type === 'window' && member.condition.window !== undefined && (
        <RouteTimeGrid t={t} value={member.condition.window} onChange={setWindow} />
      )}
      {expanded && member.condition.type !== 'window' && (
        <div className="ms-field-hint">{t('route.editWindowNeedsWindow')}</div>
      )}
    </span>
  )
}

