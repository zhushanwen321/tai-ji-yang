import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createTsxLoader, type FakeElement } from '../testing/load-tsx'

/**
 * taiji 会话头单测（client/head/session-header.tsx——actions 槽状态图标 + 四态派生）。
 * 锁死四件事的可机器化部分：
 *   · 注册契约：注入槽名 conversation.session.header.actions（list 槽）、priority -1 排在
 *     默认 0 的 AgentPresetLabel 之前、disposer 透传；
 *   · 纯函数：statusIconOf 四态映射、deriveHeaderStatus 判据序（待交互 > 运行 > 完成未读
 *     > idle）；
 *   · 渲染：状态图标三态（svg + data-status + 色档类 + run 态旋转类）、idle / 无会话 /
 *     钩子缺席 → null（不渲染）；
 *   · CSS 重塑（session-header.css 对宿主 DOM 的 40px 单行化）归真渲染场景，本层不测。
 *
 * 夹具边界（load-tsx 单次渲染语义）：TaijiSessionStatusIcon 单函数组件，直接调用断言。
 */

const HEADER_PATH = fileURLToPath(new URL('./session-header.tsx', import.meta.url))

/** 模块出口面（loader 装载后按此消费；类型断言收敛在各 helper 内）。 */
interface HeadModule {
  TaijiSessionStatusIcon: (props: Record<string, unknown>) => FakeElement | null
  installSessionStatusIcon: (host: unknown) => void
  deriveHeaderStatus: (summary: unknown, status: unknown) => string
  statusIconOf: (status: unknown) => { icon: string; tone: string } | null
  SESSION_STATUS_ICON_SLOT: string
  SESSION_STATUS_ICON_PRIORITY: number
}

const head = createTsxLoader().load(HEADER_PATH) as unknown as HeadModule
const { SESSION_STATUS_ICON_SLOT, SESSION_STATUS_ICON_PRIORITY } = head

// ── 测试替身 ─────────────────────────────────────────────────────────────────────

/** 假宿主 slots（与 name.test.ts 同构：inject 等 declare 才跑）。 */
function fakeSlotsHost() {
  const registrations: { key: string; options: { name: string; priority?: number }; component: unknown }[] = []
  const pending = new Map<string, (() => (() => void) | void)[]>()
  let disposerSeq = 0
  const disposers: string[] = []
  const host = {
    slots: {
      inject(key: string, callback: () => (() => void) | void) {
        const list = pending.get(key) ?? []
        list.push(callback)
        pending.set(key, list)
        return () => {}
      },
      register(options: { name: string; priority?: number }, component: unknown) {
        registrations.push({ key: options.name, options, component })
        const token = `dispose:${++disposerSeq}`
        disposers.push(token)
        return () => { disposers.splice(disposers.indexOf(token), 1) }
      },
    },
  }
  return {
    host,
    registrations,
    disposers,
    declare(key: string): ((() => void) | void)[] {
      const callbacks = pending.get(key) ?? []
      pending.delete(key)
      return callbacks.map((callback) => callback())
    },
  }
}

/** 会话摘要夹具（SessionSummaryLike 的消费子集；字段可逐项覆盖）。 */
function fakeSummary(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 's1', title: '', displayTitle: '', blank: false, running: false, ...extra }
}

/** 状态表条目夹具（SessionStatusLike 的消费子集）。 */
function fakeStatus(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { running: false, ...extra }
}

/** 数据钩子替身：返回固定快照（useSessions(s => s) 形态）。 */
const hooksOf = (list?: Record<string, unknown>, statuses?: Map<string, Record<string, unknown>>) => ({
  useSessions: () => list,
  useSessionStatus: () => statuses,
})

/** 渲染组件本体并返回结果元素（null 时返回 null）。 */
function renderIcon(props: Record<string, unknown> = {}): FakeElement | null {
  return head.TaijiSessionStatusIcon(props)
}

// ── 注册契约 ─────────────────────────────────────────────────────────────────────

describe('installSessionStatusIcon 注册契约', () => {
  it('注入 actions 槽，list 条目带 id、priority -1（排在默认 0 的 AgentPresetLabel 之前）', () => {
    const fake = fakeSlotsHost()
    head.installSessionStatusIcon(fake.host)
    expect(fake.registrations).toHaveLength(0)
    fake.declare(SESSION_STATUS_ICON_SLOT)
    expect(fake.registrations).toHaveLength(1)
    expect(fake.registrations[0].key).toBe('conversation.session.header.actions')
    expect(fake.registrations[0].options.id).toBe('taiji-status-icon')
    expect(fake.registrations[0].options.priority).toBe(-1)
    expect(fake.registrations[0].component).toBe(head.TaijiSessionStatusIcon)
    expect(SESSION_STATUS_ICON_PRIORITY).toBe(-1)
  })

  it('注册 disposer 透传：宿主 register 的 disposer 即 inject 回调的返回值', () => {
    const fake = fakeSlotsHost()
    head.installSessionStatusIcon(fake.host)
    const [disposer] = fake.declare(SESSION_STATUS_ICON_SLOT)
    expect(fake.disposers).toHaveLength(1)
    ;(disposer as () => void)()
    expect(fake.disposers).toHaveLength(0)
  })
})

// ── 纯函数 ───────────────────────────────────────────────────────────────────────

describe('statusIconOf 四态映射', () => {
  it('run → refresh/accent；wait → wrench/warn；done → check/accent', () => {
    expect(head.statusIconOf('run')).toEqual({ icon: 'refresh', tone: 'accent' })
    expect(head.statusIconOf('wait')).toEqual({ icon: 'wrench', tone: 'warn' })
    expect(head.statusIconOf('done')).toEqual({ icon: 'check', tone: 'accent' })
  })

  it('idle 与 undefined → null（不渲染图标，taiji 卡头无 idle 占位）', () => {
    expect(head.statusIconOf('idle')).toBeNull()
    expect(head.statusIconOf(undefined)).toBeNull()
  })
})

describe('deriveHeaderStatus 判据序（待交互 > 运行 > 完成未读 > idle）', () => {
  it('白名单 kind 命中 → wait；白名单外 kind 不算待交互', () => {
    expect(head.deriveHeaderStatus(undefined, fakeStatus({ pendingInteraction: { kind: 'approval' } }))).toBe('wait')
    expect(head.deriveHeaderStatus(undefined, fakeStatus({ pendingInteraction: { kind: 'unknown-kind' } }))).toBe('idle')
  })

  it('running：状态表优先、回落 summary', () => {
    expect(head.deriveHeaderStatus(fakeSummary({ running: true }), undefined)).toBe('run')
    expect(head.deriveHeaderStatus(fakeSummary({ running: true }), fakeStatus({ running: false }))).toBe('idle')
    expect(head.deriveHeaderStatus(fakeSummary({ running: false }), fakeStatus({ running: true }))).toBe('run')
  })

  it('完成未读 → done；两路事实全空 → idle', () => {
    expect(head.deriveHeaderStatus(undefined, fakeStatus({ completionUnread: true }))).toBe('done')
    expect(head.deriveHeaderStatus(undefined, undefined)).toBe('idle')
    expect(head.deriveHeaderStatus(fakeSummary(), fakeStatus())).toBe('idle')
  })
})

// ── 组件渲染 ─────────────────────────────────────────────────────────────────────

describe('TaijiSessionStatusIcon 渲染', () => {
  it('run：svg 带 data-status=run、accent 色档类与旋转类', () => {
    const icon = renderIcon({ sessionId: 's1', ...hooksOf({ byId: { s1: fakeSummary({ running: true }) } }, new Map()) })
    expect(icon).not.toBeNull()
    expect(icon!.type).toBe('svg')
    expect(icon!.props['data-status']).toBe('run')
    const className = icon!.props['className'] as string
    expect(className.split(/\s+/)).toContain('taiji-sh-status-accent')
    expect(className.split(/\s+/)).toContain('taiji-sh-status-spin')
    // 13px 语素（taiji size-[13px]）：宽高属性钉在 svg 上
    expect(icon!.props['width']).toBe(13)
    expect(icon!.props['height']).toBe(13)
  })

  it('wait / done：对应色档类；均不旋转', () => {
    const wait = renderIcon({
      sessionId: 's1',
      ...hooksOf({ byId: { s1: fakeSummary() } }, new Map([['s1', fakeStatus({ pendingInteraction: { kind: 'question' } })]])),
    })
    expect((wait!.props['className'] as string).split(/\s+/)).toContain('taiji-sh-status-warn')
    expect((wait!.props['className'] as string).split(/\s+/)).not.toContain('taiji-sh-status-spin')

    const done = renderIcon({
      sessionId: 's1',
      ...hooksOf({ byId: { s1: fakeSummary() } }, new Map([['s1', fakeStatus({ completionUnread: true })]])),
    })
    expect((done!.props['className'] as string).split(/\s+/)).toContain('taiji-sh-status-accent')
    expect((done!.props['className'] as string).split(/\s+/)).not.toContain('taiji-sh-status-spin')
  })

  it('idle → null（查得到会话但无状态事实）', () => {
    expect(renderIcon({ sessionId: 's1', ...hooksOf({ byId: { s1: fakeSummary() } }, new Map()) })).toBeNull()
  })

  it('数据钩子缺席 / sessionId 缺席或列表查不到 → null（降级不渲染，不 throw）', () => {
    expect(renderIcon({})).toBeNull()
    expect(renderIcon({ sessionId: 's1' })).toBeNull()
    expect(renderIcon({ sessionId: 's1', ...hooksOf({ byId: {} }, new Map()) })).toBeNull()
    expect(renderIcon({ sessionId: '', ...hooksOf({ byId: { s1: fakeSummary({ running: true }) } }, new Map()) })).toBeNull()
  })
})
