import { describe, expect, it } from 'vitest'
import { FIRST_FRAME_ROW, FIRST_FRAME_STYLE, SHELL_INFO_GLOBAL, apply, buildShellInfo } from '../index.js'

/**
 * RL8 的机器化通道（设计 §4.2 断言-红灯映射表 RL8 行 + §5.2 文件改动地图 +
 * impl-plan testPlan.incremental「注入行先于 mount」）：注入行先于 `gate.resolve()` /
 * 应用 mount 进入 document——mock 载体下按事件顺序断言。
 *
 * 为什么值得一条单测：RL8 的行为级出口只有 V1 第 ④ 步的录屏逐帧核对（L3，需真实 GUI，
 * 不可重复执行）；本条把同一不变量的**可重复机器出口**补上。宿主两种载体的 boot 序列
 * （AS4，已核实）共享同一形状：
 *   ① collect：宿主每次渲染 index 都 emit `webserver/index-inject`（AS5 的「收集注入表」
 *      语义），订阅方把结构化行 push 进表；
 *   ② apply：Web 载体由 `renderIndex` 把行渲染进 HTML 文本（解析期即生效）；Desktop 载体在
 *      `desktop.ready()` 返回后由 `applyIndexInjections` 逐行 append 进 head；
 *   ③ gate：`__DSH_BOOT_READY__` 的 `gate.resolve()`；
 *   ④ mount：`AppWebEntry.run()` 在 await 门控之后才 mount（boot.ts:59）。
 * 不变量 = ② 早于 ③、③ 早于 ④，且 ③ 的时刻 document 里已有 ① 收集到的样式行。
 *
 * 断言对象的两半：
 *   · **顺序谓词**：载体序列由 mock 复刻（负样本证明谓词会红，不是恒绿空检查）；
 *   · **本包贡献形状**：订阅了 `webserver/index-inject`、推的是 kind=style 的非空行、
 *     行文本就是导出的首帧 CSS，且行来自真实 `apply` 的推入（不是手写替身行）。
 * 任一半退化（不订阅 / 推空行 / 推错 kind / 迟到推送），「gate 时 document 无样式行」
 * 或顺序断言即红。
 *
 * 归属边界：mock 载体编码的是设计期已核实的宿主契约（AS4），不是本包代码；真载体上的
 * 首帧证据（录屏第 1 帧即目标配色）归 V1 第 ④ 步的 L3 场景，单测层不越界。行文本的
 * 内容口径（15 条 token 声明、与双模表逐 token 同值）由 client/theme/tokens.spec.ts 锁定，
 * 本文件只断言「那一行确实在门控前进了 document」。
 */

/** mock 载体记录的一次 boot 事件（按发生序；名字对齐宿主词汇）。 */
type BootEvent = 'collect-injections' | 'apply-injections' | 'resolve-gate' | 'mount-app'

/** 注入表行的最小形状（宿主 `IndexInjection` 的 style 与 global 两个分支）。 */
type InjectionRow = { kind: 'style'; text: string } | { kind: 'global'; name: string; value: unknown }

/** 假 document：只记 head 里进了哪些样式文本（解析期生效 = 进了 head 即在文档里；
 * global 行在宿主侧渲染成 script 赋值而非样式，不计入样式文本）。 */
function createDocument() {
  const styles: string[] = []
  return {
    head: {
      append(row: InjectionRow) {
        if (row.kind === 'style') styles.push(row.text)
      },
    },
    /** 进入过 document 的样式文本（按进入序）。 */
    styles: () => [...styles],
  }
}

/** boot 序列的两种跑法：correct = 两载体真实序列；gateFirst = 负样本（门控先于注入生效）。 */
type BootSequence = 'correct' | 'gateFirst'

interface BootResult {
  events: BootEvent[]
  /** `gate.resolve()` 那一刻 document 里已有的样式文本（RL8 不变量的直接度量）。 */
  stylesAtGate: string[]
  /** collect 阶段被测插件推入注入表的行（真实推入，非替身）。 */
  rows: InjectionRow[]
}

/**
 * 跑一遍 mock 载体的 boot 序列：装配插件 → collect → apply → gate → mount。
 *
 * 假 ctx 只提供被测装配入口用到的面（与 tests/uninstall-cleanliness.spec.ts、
 * scripts/check-injection-escape.mjs 同款替身手法）：`on` 收订阅；`get` 让 webServer 在位
 * （U8 的装载期探针同步返回、不产生诊断日志，不改变本文件的断言范围）；`effect` 执行并回传
 * disposer；`logger` 静音。
 */
function runBoot(applyPlugin: (ctx: unknown) => void, sequence: BootSequence = 'correct'): BootResult {
  const events: BootEvent[] = []
  const document = createDocument()
  const rows: InjectionRow[] = []
  let injectListener: ((table: InjectionRow[]) => void) | undefined
  let stylesAtGate: string[] = []

  const ctx = {
    on(name: string, listener: (table: InjectionRow[]) => void) {
      if (name === 'webserver/index-inject') injectListener = listener
      return () => { injectListener = undefined }
    },
    get(service: string) {
      return service === 'webServer' ? {} : undefined
    },
    logger: { error() {}, warn() {}, info() {}, debug() {} },
    effect(execute: () => (() => void) | void) {
      const dispose = execute()
      return typeof dispose === 'function' ? dispose : () => {}
    },
  }

  applyPlugin(ctx)

  const collect = () => {
    events.push('collect-injections')
    injectListener?.(rows)
  }
  const applyInjections = () => {
    // applyIndexInjections：逐行执行——进了 document 即解析期生效
    for (const row of rows) document.head.append(row)
    events.push('apply-injections')
  }
  const resolveGate = () => {
    // 事件入列之前快照 document：度量的是「gate 那一刻」的状态，不是事后再看
    stylesAtGate = document.styles()
    events.push('resolve-gate')
  }
  const mount = () => {
    events.push('mount-app')
  }

  if (sequence === 'gateFirst') {
    collect()
    resolveGate()
    applyInjections()
    mount()
  } else {
    collect()
    applyInjections()
    resolveGate()
    mount()
  }

  return { events, stylesAtGate, rows }
}

/** RL8 顺序谓词：返回违规清单（空数组 = 通过）。负样本的存在价值 = 证明它确实会红。 */
function firstFrameViolations(result: BootResult): string[] {
  const violations: string[] = []
  const at = (event: BootEvent): number => result.events.indexOf(event)
  const expected: BootEvent[] = ['collect-injections', 'apply-injections', 'resolve-gate', 'mount-app']
  const missing = expected.filter((event) => at(event) === -1)
  if (missing.length > 0) {
    violations.push(`boot 序列不完整，缺事件：${missing.join(' / ')}`)
    return violations
  }
  if (at('apply-injections') > at('resolve-gate')) {
    violations.push(
      `注入行进入 document（第 ${at('apply-injections')} 步）晚于 gate.resolve()（第 ${at('resolve-gate')} 步）——首帧会闪宿主配色`,
    )
  }
  if (at('resolve-gate') > at('mount-app')) {
    violations.push(
      `gate.resolve()（第 ${at('resolve-gate')} 步）晚于应用 mount（第 ${at('mount-app')} 步）——门控契约被破坏`,
    )
  }
  if (result.stylesAtGate.length === 0) {
    violations.push('gate.resolve() 时刻 document 里没有任何注入样式行——首帧无太极配色')
  }
  return violations
}

describe('RL8 注入先于 mount（mock 载体事件顺序）', () => {
  it('本包推入的 style 行先于 gate.resolve() 进入 document，mount 在门控之后', () => {
    const result = runBoot(apply)
    // 顺序不变量：谓词零违规 + 事件序精确等于两载体共享的 boot 序列
    expect(firstFrameViolations(result)).toEqual([])
    expect(result.events).toEqual(['collect-injections', 'apply-injections', 'resolve-gate', 'mount-app'])
    // 行来自真实 apply：style 行与导出的首帧行同一取值；global 行（壳信息）名与值一致
    expect(result.rows[0]).toEqual(FIRST_FRAME_ROW)
    expect(FIRST_FRAME_ROW.kind).toBe('style')
    expect(result.rows[1]).toMatchObject({ kind: 'global', name: SHELL_INFO_GLOBAL })
    expect((result.rows[1] as { value: unknown }).value).toEqual(buildShellInfo())
    // gate 那一刻 document 里已有的就是那一行（不是空表、不是别的 kind）
    expect(result.stylesAtGate).toEqual([FIRST_FRAME_STYLE])
    // 「生效」的实质：行文本是非空的首帧 token CSS（15 条声明的计数由 tokens.spec.ts 锁）
    expect(FIRST_FRAME_STYLE).toMatch(/--dsw-[a-z0-9-]+: light-dark\(/)
  })

  it('负样本：gate.resolve() 先于注入生效（载体序列倒转）时顺序谓词判红', () => {
    const result = runBoot(apply, 'gateFirst')
    const violations = firstFrameViolations(result)
    expect(violations.length).toBeGreaterThan(0)
    expect(violations.join('\n')).toContain('晚于 gate.resolve()')
    // 谓词红得有依据：倒序下 gate 时刻 document 里确实还没有样式行
    expect(result.stylesAtGate).toEqual([])
  })

  it('负样本：被测插件订阅了事件却不推行（或未订阅）时谓词判红', () => {
    const silentApply = (ctx: unknown) => {
      const host = ctx as { on: (name: string, listener: (table: InjectionRow[]) => void) => () => void }
      host.on('webserver/index-inject', () => {})
    }
    const result = runBoot(silentApply)
    expect(firstFrameViolations(result)).toContain(
      'gate.resolve() 时刻 document 里没有任何注入样式行——首帧无太极配色',
    )
  })
})
