/**
 * client/settings/model-service/routes-view.tsx —— 路由卡工作台（路由交互定稿：
 * 「清单即操作台，创建即配置，配置即反馈」；M2 V5/V6/V7 的界面承载）。
 *
 * 结构（每路由一张卡，替代旧「顶部新建表单 + 路由行清单 + 展开编辑体」三段式）：
 *   · 卡头：路由名（点击就地改名，失焦/回车保存——经 renameRoute 重派生 id 并迁移白名单）、
 *     派生 id 徽标、注册状态徽章（已注册 = 绿 / 注册失败 = 红）、「对话流可见」开关（白名单
 *     checkbox 的语义化，Config 落盘仍是 whitelist 字段）、命中预览（打开视图时求值一次的
 *     时间窗感知命中，store 打开视图时算一次）；
 *   · 卡体（选中卡 = 展开态）：注册失败修复条（失败原因 + 就地改名 → renameRoute 以新 id
 *     替换旧路由并触发注册自动重试）+ 成员管线（拖拽把手 + 序号 + 供应商下拉 + 模型控件 +
 *     条件切换 + 可用性徽章 + 移除）。条件选「时间窗」即行下内联三层时间窗；格点点击走
 *     内存草案（节流），条件切回「无条件」（收起时间窗）或切换选中卡（卡体卸载）时一次性
 *     落盘——其余成员操作仍即时保存；
 *   · 卡脚（收起态）：编辑成员 / 删除路由（两段确认）。
 *
 * 「+ 新建路由」直接追加一张展开态的新卡（默认名「新路由 N」、id 派生、成员空），就地填名、
 * 添加成员（旧顶部独立新建表单已删）。
 *
 * 即时保存语义：成员增删 / 排序 / 供应商模型切换 / 条件切换 / 可见开关 / 改名 = 即时经
 * saveRoute / toggleWhitelist / renameRoute 整体替换通道落盘，成功给 toast 反馈（store 的
 * notice/error 通道承载失败上报）；仅时间窗格点按上述节流。
 *
 * 成员供应商下拉口径（route-store selectableProviders）：宿主设置文档 providers 快照中
 * 已存在的条目（含自定义 route；displayName 目录名回落）——未接入的目录 route 不可选；
 * 无已接入供应商时「添加成员」禁用并给行内接入指引。
 *
 * 拖拽排序：HTML5 原生 DnD——行首把手 draggable，悬停目标行描边提示落点，松手 move 语义
 * （把成员移到目标位、其余顺移，moveMember 数据交换）并即时保存；键盘可达回退 = 把手聚焦
 * 后 ArrowUp/ArrowDown 移动一位（同一 moveMember）。
 *
 * 交互状态纪律（section.tsx 同款）：真相放 useRef + 重渲染扳机——测试夹具的 useState 桩
 * 不触发重渲染，真相在 ref 才能被同一渲染树上的后续交互读到。
 *
 * 成员可用性标注（G18，配置时行内常显）：供应商已删 / 模型不在清单 / 凭据缺失（route-store
 * 探测派生）。「当前命中」预览 = route-evaluate.evaluateRoutesAt（与 Node 半场求值同源）。
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { moveMember, RoutesListModel, type RoutesSnapshot } from '../../model-service/route-store'
import { memberAvailabilityLocaleKeys } from '../../model-service/route-errors'
import { type RouteEntry, type RouteMember, type RouteWindowMask } from '../../model-service/route-evaluate'
import type { Translate } from './route-time-grid'
import { emptyRouteWindowMask, RouteTimeGrid } from './route-time-grid'

/** 路由视图 props。 */
export interface RoutesViewProps {
  t: Translate
  model: RoutesListModel
}

/** 渲染路由卡工作台（空态矩阵 + 新建入口 + 路由卡列表 + 悬挂条目区 + 上报面）。 */
export function RoutesView({ t, model }: RoutesViewProps) {
  const state = useSyncExternalStore(
    (listener) => model.subscribe(listener),
    () => model.getSnapshot(),
    () => model.getSnapshot(),
  )
  const selectedId = useRef<string | undefined>(undefined)
  const toast = useRef<string | undefined>(undefined)
  const [, rerender] = useState(0)

  useEffect(() => {
    model.setTranslate(t)
  }, [])

  /** 即时保存成功的轻反馈（自动消退；失败上报走 store 的 notice/error，不经 toast）。 */
  const showToast = (message: string): void => {
    toast.current = message
    rerender((count) => count + 1)
    setTimeout(() => {
      if (toast.current === message) {
        toast.current = undefined
        rerender((count) => count + 1)
      }
    }, 2500)
  }

  /** 新建即配置（A3）：直接追加一张展开态新卡（默认名避重取序），选中它就地填名。 */
  const createRoute = async (): Promise<void> => {
    let n = state.routes.length + 1
    while (state.routes.some((route) => route.name === t('route.newCardName', { n }))) n += 1
    const route = await model.createRoute(t('route.newCardName', { n }))
    selectedId.current = route.id
    showToast(t('save.saved'))
  }

  /** 选中 = 切换（再点「编辑成员」收起当选卡——收起态卡脚才有删除路由入口，当选卡必须可收起）。 */
  const select = (id: string): void => {
    selectedId.current = selectedId.current === id ? undefined : id
    rerender((count) => count + 1)
  }

  /** 改名（就地改名 / 注册修复共用）后新 id 接管选中态——卡按 id 为 key，随之重挂新卡。 */
  const followRename = (newId: string): void => {
    selectedId.current = newId
    rerender((count) => count + 1)
  }

  /** 删除当选卡后选中态回退到剩余第一张（deleteRoute 的乐观更新先于 commit，回调时快照已
   * 不含被删 id）：selectedId 悬挂指向已删 id 时没有任何卡处于展开态，配置流（成员管线）断档。 */
  const handleCardDeleted = (deletedId: string): void => {
    if (selectedId.current !== deletedId) return
    selectedId.current = model.getSnapshot().routes.find((route) => route.id !== deletedId)?.id
    rerender((count) => count + 1)
  }

  return (
    <div className="ms-routes">
      {state.status === 'unavailable' && <div className="ms-note ms-note-warn">{t('routes.snapshotUnavailable')}</div>}
      {state.status === 'loading' && <div className="ms-note">{t('providers.loading')}</div>}
      {state.status === 'ready' && (
        <>
          <EmptyMatrix t={t} state={state} />
          <div className="ms-routes-actions">
            <button type="button" className="ms-button ms-button-primary" onClick={() => { void createRoute() }}>
              {t('route.create')}
            </button>
          </div>
          <div className="ms-route-cards">
            {state.routes.map((route) => (
              <RouteCard
                key={route.id}
                t={t}
                route={route}
                state={state}
                model={model}
                selected={selectedId.current === route.id}
                onSelect={() => { select(route.id) }}
                onToast={showToast}
                onRenamed={followRename}
                onDeleted={handleCardDeleted}
              />
            ))}
          </div>

          <HangingWhitelist t={t} state={state} model={model} />
        </>
      )}
      {toast.current !== undefined && <div className="ms-note ms-note-ok" role="status">{toast.current}</div>}
      {state.notice !== undefined && <div className="ms-note ms-note-warn" role="status">{state.notice}</div>}
      {state.error !== undefined && <div className="ms-error" role="alert">{state.error}</div>}
    </div>
  )
}

/** 空态矩阵（G18 三态，引导语义随卡片工作台保留）：无路由 / 有路由但无一对话流可见 / 可见路由成员全不可用。 */
function EmptyMatrix({ t, state }: { t: Translate; state: RoutesSnapshot }) {
  if (state.routes.length === 0) {
    return (
      <div className="ms-empty">
        <div className="ms-empty-title">{t('routes.emptyNoRoutes')}</div>
        <div className="ms-empty-next">{t('routes.emptyNoRoutesNext')}</div>
      </div>
    )
  }
  const visible = state.routes.filter((route) => state.whitelist.includes(route.id))
  if (visible.length === 0) {
    return (
      <div className="ms-empty">
        <div className="ms-empty-title">{t('routes.emptyNotWhitelisted')}</div>
        <div className="ms-empty-next">{t('routes.emptyNotWhitelistedNext')}</div>
      </div>
    )
  }
  const visibleWithMember = visible.filter((route) =>
    route.members.some((member) => {
      const availability = state.memberAvailability.get(`${member.provider}/${member.model}`)
      return availability === undefined || !(availability.providerMissing || (availability.modelMissing && hasConcreteModels(state, member.provider)) || availability.credentialMissing)
    }),
  )
  if (visibleWithMember.length === 0) {
    return (
      <div className="ms-empty">
        <div className="ms-empty-title">{t('routes.emptyMembersUnavailable')}</div>
        <div className="ms-empty-next">{t('routes.emptyMembersUnavailableNext')}</div>
      </div>
    )
  }
  return null
}

/** 该 provider 是否有本地可判定的模型清单（自定义清单态——models[] 非空）。 */
function hasConcreteModels(state: RoutesSnapshot, provider: string): boolean {
  const row = state.selectableProviders.find((candidate) => candidate.key === provider)
  return row !== undefined && row.models.length > 0
}

/** 路由卡 props（导出面 = RoutesView 生产消费 + 单测直挂；卡头/卡脚接线断言入口）。 */
export interface RouteCardProps {
  t: Translate
  route: RouteEntry
  state: RoutesSnapshot
  model: RoutesListModel
  selected: boolean
  onSelect: () => void
  onToast: (message: string) => void
  /** 改名成功后以新 id 接管选中态（RoutesView 持选中真相）。 */
  onRenamed: (newId: string) => void
  /** 删除完成后回调（两段确认第二击落地后；RoutesView 据此做选中态回退）。 */
  onDeleted: (id: string) => void
}

/** 路由卡（卡头 + 展开卡体 / 收起卡脚）。 */
export function RouteCard({ t, route, state, model, selected, onSelect, onToast, onRenamed, onDeleted }: RouteCardProps) {
  const deleteArmed = useRef(false)
  const [, rerender] = useState(0)
  const registrationFailed = state.registrationFailed.includes(route.id)
  const hit = state.hits.get(route.id)
  return (
    <div className={`ms-route-card${selected ? ' ms-route-card-selected' : ''}`}>
      <div className="ms-route-card-head">
        <RouteNameEditor t={t} route={route} model={model} onRenamed={onRenamed} />
        <span className="ms-badge ms-badge-catalog">{route.id}</span>
        {registrationFailed
          ? <span className="ms-badge ms-badge-missing">{t('route.registrationFailedBadge')}</span>
          : <span className="ms-badge ms-badge-ok">{t('route.registeredBadge')}</span>}
        <label className="ms-check">
          <input
            type="checkbox"
            role="switch"
            checked={state.whitelist.includes(route.id)}
            aria-label={t('route.visibleToggle', { name: route.name })}
            onChange={() => { void model.toggleWhitelist(route.id).then((accepted) => { if (accepted) onToast(t('save.saved')) }) }}
          />
          {t('route.visibleLabel')}
        </label>
        {hit !== undefined
          ? <span className="ms-row-note">{t('route.hitNow', { provider: hit.provider, model: hit.model })}</span>
          : <span className="ms-row-note">{t('route.noHitNow')}</span>}
        {selected && (
          <button type="button" className="ms-button ms-button-sm" onClick={onSelect}>
            {t('route.collapseMembers')}
          </button>
        )}
      </div>
      {selected && (
        <RouteCardBody t={t} route={route} state={state} model={model} onToast={onToast} onRenamed={onRenamed} />
      )}
      {!selected && (
        <div className="ms-route-card-foot">
          <button type="button" className="ms-button" onClick={onSelect}>{t('route.editMembers')}</button>
          <button
            type="button"
            className={`ms-button ${deleteArmed.current ? 'ms-button-danger' : ''}`}
            onClick={() => {
              if (deleteArmed.current) {
                deleteArmed.current = false
                void model.deleteRoute(route.id).then(() => { onDeleted(route.id) })
              } else {
                deleteArmed.current = true
              }
              rerender((count) => count + 1)
            }}
          >
            {t(deleteArmed.current ? 'route.confirmDelete' : 'route.delete')}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * 卡头路由名（点击就地改名；失焦/回车保存，Esc 取消——renameRoute 重派生 id 并迁移白名单）。
 * 导出面 = RouteCard 生产消费 + 单测组件同一性断言。
 */
export function RouteNameEditor({ t, route, model, onRenamed }: {
  t: Translate
  route: RouteEntry
  model: RoutesListModel
  onRenamed: (newId: string) => void
}) {
  const editing = useRef(false)
  const draftRef = useRef(route.name)
  const [, rerender] = useState(0)
  const rerenderNow = () => rerender((count) => count + 1)

  const closeEditor = (): void => {
    editing.current = false
    draftRef.current = route.name
    rerenderNow()
  }

  const commitRename = async (): Promise<void> => {
    const name = draftRef.current.trim()
    if (name === '' || name === route.name) {
      closeEditor()
      return
    }
    const updated = await model.renameRoute(route.id, name)
    if (updated !== undefined) onRenamed(updated.id)
    else closeEditor()
  }

  if (!editing.current) {
    return (
      <button
        type="button"
        className="ms-route-name"
        title={t('route.renameHint')}
        aria-label={t('route.nameField')}
        onClick={() => { draftRef.current = route.name; editing.current = true; rerenderNow() }}
      >
        {route.name}
      </button>
    )
  }
  return (
    <input
      type="text"
      className="ms-input ms-route-name-input"
      value={draftRef.current}
      aria-label={t('route.nameField')}
      autoFocus
      onChange={(event) => { draftRef.current = event.target.value; rerenderNow() }}
      onBlur={() => { void commitRename() }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') void commitRename()
        if (event.key === 'Escape') closeEditor()
      }}
    />
  )
}

/** 卡体 props（导出供单测直挂展开态；生产消费点 = RouteCard）。 */
export interface RouteCardBodyProps {
  t: Translate
  route: RouteEntry
  state: RoutesSnapshot
  model: RoutesListModel
  onToast: (message: string) => void
  onRenamed: (newId: string) => void
}

/**
 * 卡体（选中态）：注册失败修复条 + 成员管线。成员草案在 ref（挂载时从快照克隆）；
 * 成员级操作即时 saveRoute（序列化草案 = 未落盘的时间窗格点一并落盘），时间窗格点只改
 * 草案并标脏，收起（条件切回无条件——切换本身即时保存）或卸载（切换选中卡）时按脏标记
 * 一次性补盘。
 */
export function RouteCardBody({ t, route, state, model, onToast, onRenamed }: RouteCardBodyProps) {
  const membersRef = useRef<RouteMember[]>(route.members.map((member) => ({ ...member, condition: { ...member.condition } })))
  const dragFrom = useRef<number | undefined>(undefined)
  const dragOver = useRef<number | undefined>(undefined)
  const windowDirty = useRef(false)
  const fixNameRef = useRef(route.name)
  const [, rerender] = useState(0)
  const rerenderNow = () => rerender((count) => count + 1)

  const registrationFailed = state.registrationFailed.includes(route.id)
  const selectable = state.selectableProviders

  const save = async (): Promise<boolean> => {
    windowDirty.current = false
    return await model.saveRoute({ id: route.id, name: route.name, members: membersRef.current })
  }

  // 切换选中卡（卡体卸载）时一次性落盘未保存的时间窗草案（节流的补盘出口）。
  useEffect(() => () => {
    if (!windowDirty.current) return
    void model.saveRoute({ id: route.id, name: route.name, members: membersRef.current })
  }, [])

  const updateMember = (index: number, next: RouteMember): void => {
    membersRef.current = membersRef.current.map((member, at) => (at === index ? next : member))
    rerenderNow()
  }

  /** 成员级操作（增删 / 排序 / 选择切换 / 条件切换）：更新草案后即时落盘。 */
  const updateAndSave = (index: number, next: RouteMember): void => {
    updateMember(index, next)
    void save().then((ok) => { if (ok) onToast(t('save.saved')) })
  }

  const addMember = (): void => {
    const first = selectable[0]
    if (first === undefined) return
    // 追加（updateMember 的 map 形态无法扩容空清单），即时保存。
    membersRef.current = [...membersRef.current, {
      provider: first.key,
      model: first.models[0]?.id ?? '',
      order: membersRef.current.length + 1,
      condition: { type: 'none' },
    }]
    rerenderNow()
    void save().then((ok) => { if (ok) onToast(t('save.saved')) })
  }

  const removeMember = (index: number): void => {
    const next = membersRef.current
      .filter((_, at) => at !== index)
      .map((member, at) => ({ ...member, order: at + 1 }))
    membersRef.current = next
    rerenderNow()
    void save().then((ok) => { if (ok) onToast(t('save.saved')) })
  }

  /** 拖拽落点 / 把手方向键共用的排序出口（moveMember 数据交换 + 即时保存）。 */
  const applyMove = (from: number, to: number): void => {
    const next = moveMember(membersRef.current, from, to)
    if (next === membersRef.current) return
    membersRef.current = next
    rerenderNow()
    void save().then((ok) => { if (ok) onToast(t('save.saved')) })
  }

  /** 时间窗格点（节流）：只改草案标脏，不逐格 mutate Config。 */
  const updateWindowDraft = (index: number, member: RouteMember, window: RouteWindowMask): void => {
    updateMember(index, { ...member, condition: { type: 'window', window } })
    windowDirty.current = true
  }

  /** 注册失败的就地改名修复（A7）：新名重派生 id → 替换旧路由 → 注册自动重试。 */
  const applyFixRename = async (): Promise<void> => {
    const name = fixNameRef.current.trim()
    if (name === '' || name === route.name) return
    const updated = await model.renameRoute(route.id, name)
    if (updated !== undefined) onRenamed(updated.id)
  }

  const members = membersRef.current
  return (
    <div className="ms-route-card-body">
      {registrationFailed && (
        <div className="ms-route-fix" role="alert">
          <div className="ms-note ms-note-warn">{t('route.registrationFailed', { routes: route.name })}</div>
          {state.registrationError?.routeIds.includes(route.id) && (
            <div className="ms-row-note">
              {t('route.registrationErrorDetail')}: {state.registrationError.origin} / {state.registrationError.detail}
            </div>
          )}
          <div className="ms-row-note">{t('route.registrationFailedNext')}</div>
          <div className="ms-route-fix-actions">
            <input
              type="text"
              className="ms-input"
              value={fixNameRef.current}
              aria-label={t('route.nameField')}
              onChange={(event) => { fixNameRef.current = event.target.value; rerenderNow() }}
            />
            <button type="button" className="ms-button" onClick={() => { void applyFixRename() }}>
              {t('route.fixRenameApply')}
            </button>
          </div>
        </div>
      )}
      <div className="ms-route-pipeline-title">{t('route.membersTitle')}</div>
      <div className="ms-route-pipeline">
        {members.map((member, index) => {
          const providerRow = selectable.find((row) => row.key === member.provider)
          const availability = state.memberAvailability.get(`${member.provider}/${member.model}`)
          const isDropTarget = dragOver.current === index && dragFrom.current !== undefined && dragFrom.current !== index
          return (
            <div
              key={`${member.provider}/${member.model}/${index}`}
              className={`ms-route-member-row${isDropTarget ? ' ms-drop-target' : ''}`}
              onDragOver={(event) => {
                event.preventDefault()
                if (dragOver.current !== index) {
                  dragOver.current = index
                  rerenderNow()
                }
              }}
              onDrop={(event) => {
                event.preventDefault()
                const from = dragFrom.current
                dragFrom.current = undefined
                dragOver.current = undefined
                if (from !== undefined) applyMove(from, index)
                else rerenderNow()
              }}
              onDragEnd={() => { dragFrom.current = undefined; dragOver.current = undefined; rerenderNow() }}
            >
              <button
                type="button"
                className="ms-drag-handle"
                draggable={true}
                aria-label={t('route.dragHandle')}
                onDragStart={(event) => {
                  dragFrom.current = index
                  const transfer = event.dataTransfer
                  if (transfer !== undefined) {
                    transfer.setData('text/plain', String(index))
                    transfer.effectAllowed = 'move'
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    applyMove(index, index - 1)
                  }
                  if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    applyMove(index, index + 1)
                  }
                }}
              />
              <span className="ms-badge">{index + 1}</span>
              <select
                className="ms-select"
                aria-label={t('route.memberProvider')}
                value={member.provider}
                onChange={(event) => {
                  const nextProvider = event.target.value
                  const nextRow = selectable.find((row) => row.key === nextProvider)
                  updateAndSave(index, { ...member, provider: nextProvider, model: nextRow?.models[0]?.id ?? '' })
                }}
              >
                {selectable.length === 0 && <option value="">{t('route.noSelectableProviders')}</option>}
                {selectable.map((row) => (
                  <option key={row.key} value={row.key}>{row.name}</option>
                ))}
              </select>
              {providerRow !== undefined && providerRow.models.length > 0 ? (
                <select
                  className="ms-select"
                  aria-label={t('route.memberModel')}
                  value={member.model}
                  onChange={(event) => { updateAndSave(index, { ...member, model: event.target.value }) }}
                >
                  {providerRow.models.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>{candidate.name !== '' ? candidate.name : candidate.id}</option>
                  ))}
                </select>
              ) : (
                // 目录默认态（models[] 空 / 无自定义清单）：模型 id 无法本地枚举，回落自由输入
                //（现有语义）；可用性徽章不虚构（buildMemberAvailability 判定保持）。
                <input
                  type="text"
                  className="ms-input"
                  aria-label={t('route.memberModel')}
                  placeholder={t('route.memberModelInput')}
                  value={member.model}
                  onChange={(event) => { updateAndSave(index, { ...member, model: event.target.value }) }}
                />
              )}
              <select
                className="ms-select"
                aria-label={t('route.memberCondition')}
                value={member.condition.type === 'window' ? 'window' : member.condition.type === 'none' ? 'none' : 'unavailable'}
                onChange={(event) => {
                  const value = event.target.value
                  if (value === 'none') updateAndSave(index, { ...member, condition: { type: 'none' } })
                  else if (value === 'window') {
                    // 空掩码必须走 emptyRouteWindowMask（7×48 归一）：内联 days:[] 会让时间窗格子
                    // 的 draft.days[day] 索引到 undefined 抛 TypeError（终态同步 F1-9，D5 编辑面）。
                    updateAndSave(index, { ...member, condition: { type: 'window', window: member.condition.window ?? emptyRouteWindowMask() } })
                  }
                }}
              >
                <option value="none">{t('route.conditionNone')}</option>
                <option value="window">{t('route.conditionWindow')}</option>
                <option value="unavailable" disabled>{t('route.conditionUnavailable')}</option>
              </select>
              {/* 可用性标注三型（G18）内联渲染（无状态，键映射归 route-errors；夹具单棵树可断言）。 */}
              {availability !== undefined && memberAvailabilityLocaleKeys(availability).map((key) => (
                <span key={key} className="ms-badge ms-badge-missing">
                  {t(key, key === 'route.memberCredentialMissing' ? { ref: availability.ref ?? '' } : undefined)}
                </span>
              ))}
              <button
                type="button"
                className="ms-button ms-button-danger"
                aria-label={t('route.removeMember')}
                onClick={() => { removeMember(index) }}
              >
                {t('route.removeMember')}
              </button>
              {member.condition.type === 'window' && member.condition.window !== undefined && (
                <div className="ms-route-member-window">
                  <RouteTimeGrid
                    t={t}
                    value={member.condition.window}
                    onChange={(mask) => { updateWindowDraft(index, member, mask) }}
                  />
                </div>
              )}
            </div>
          )
        })}
        {members.length === 0 && <div className="ms-row-note">{t('route.noMembers')}</div>}
      </div>
      <div className="ms-route-pipeline-foot">
        <button type="button" className="ms-button" disabled={selectable.length === 0} onClick={addMember}>
          {t('route.addMember')}
        </button>
        {selectable.length === 0 && <span className="ms-row-note">{t('route.noProvidersHint')}</span>}
      </div>
    </div>
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
