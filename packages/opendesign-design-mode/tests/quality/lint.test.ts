/**
 * 反 AI 味检查器单测（U4，RL4 的单测层）。
 *
 * 断言结构：
 * 1. 检查项清单 fixture 对账（RL4）：16 项注册表逐项「命中 fixture 含期望 id+severity、
 *    反例 fixture 零发现」；注册表 id 清单 = 正源当前 commit 的全量清单（新增检查必须
 *    显式登记用例才能通过——独立可增结构的对账护栏）；
 * 2. 契约与边界：非字符串/空输入空清单、finding 形状（severity 词表/id/message/fix/
 *    snippet 可选）、snippet 200 字截断、注释剥离前置、纯函数确定性；
 * 3. 正源用例移植：上游 lint-artifact.test.ts（nexu-io/open-design@20c49e75，Apache-2.0）
 *    对 ai-default-indigo / all-caps-no-tracking / trust-gradient 三项的深覆盖用例逐一
 *    复断言（HTML 样本逐字保留，it 名译中文）——RL4「上游命中样例逐一复断言」的本体；
 * 4. 其余 13 项语义锁定：上游无测试的检查项按实现语义派生正反用例（阈值边界、作用域
 *    门、单信号 break 语义）；
 * 5. 出处锚：LINT_SOURCE_ANCHOR 字段与 runlog 登记的正源 commit 锚一致（AX3 对账通道）。
 * 编号口径：本文件裸编号（U/D/AX/AS/SC/RL/UD/SI/GPK 等）默认属 opendesign-assets-quality 设计包（本轮）；V1 设计包域编号带「V1 设计包 / V1·」前缀。
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LINT_SOURCE_ANCHOR, lintArtifact, type LintFinding, type LintSeverity } from '../../lib/quality/lint.js'

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'lint-cases')

/** 上游 requiredFinding 同款：取指定 id 的发现，缺失即抛（断言意图显式化）。 */
function requiredFinding(findings: LintFinding[], id: string): LintFinding {
  const hit = findings.find((f) => f.id === id)
  if (!hit) throw new Error(`expected lint finding ${id}`)
  return hit
}

/** 无发现断言（附上下文定位）。 */
function expectNoFinding(findings: LintFinding[], id: string): void {
  expect(findings.find((f) => f.id === id), `expected NO lint finding ${id}`).toBeUndefined()
}

function readFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf8')
}

// ── 检查项清单注册表（16 项 = 正源 lintArtifact 当前 commit 全量核对口径）──────
// 顺序 = 正源检查顺序；severity = 正源各 out.push 的字面值。正源清单核对登记见
// opendesign-assets-quality.runlog/U4.md（逐项对照 lint-artifact.ts@20c49e75）。

type CheckCase = { id: string; severity: LintSeverity; hitFile: string; cleanFile: string }

const CHECK_CASES: CheckCase[] = [
  { id: 'purple-gradient', severity: 'P0', hitFile: 'purple-gradient.hit.html', cleanFile: 'purple-gradient.clean.html' },
  { id: 'trust-gradient', severity: 'P0', hitFile: 'trust-gradient.hit.html', cleanFile: 'trust-gradient.clean.html' },
  { id: 'ai-default-indigo', severity: 'P0', hitFile: 'ai-default-indigo.hit.html', cleanFile: 'ai-default-indigo.clean.html' },
  { id: 'emoji-icon', severity: 'P0', hitFile: 'emoji-icon.hit.html', cleanFile: 'emoji-icon.clean.html' },
  { id: 'left-accent-card', severity: 'P0', hitFile: 'left-accent-card.hit.html', cleanFile: 'left-accent-card.clean.html' },
  { id: 'sans-display', severity: 'P0', hitFile: 'sans-display.hit.html', cleanFile: 'sans-display.clean.html' },
  { id: 'invented-metric', severity: 'P0', hitFile: 'invented-metric.hit.html', cleanFile: 'invented-metric.clean.html' },
  { id: 'filler-copy', severity: 'P0', hitFile: 'filler-copy.hit.html', cleanFile: 'filler-copy.clean.html' },
  { id: 'scroll-into-view', severity: 'P0', hitFile: 'scroll-into-view.hit.html', cleanFile: 'scroll-into-view.clean.html' },
  { id: 'all-caps-no-tracking', severity: 'P1', hitFile: 'all-caps-no-tracking.hit.html', cleanFile: 'all-caps-no-tracking.clean.html' },
  { id: 'external-image', severity: 'P1', hitFile: 'external-image.hit.html', cleanFile: 'external-image.clean.html' },
  { id: 'raw-hex', severity: 'P1', hitFile: 'raw-hex.hit.html', cleanFile: 'raw-hex.clean.html' },
  { id: 'accent-overuse', severity: 'P1', hitFile: 'accent-overuse.hit.html', cleanFile: 'accent-overuse.clean.html' },
  { id: 'missing-section-anchor', severity: 'P2', hitFile: 'missing-section-anchor.hit.html', cleanFile: 'missing-section-anchor.clean.html' },
  { id: 'slide-theme-missing', severity: 'P0', hitFile: 'slide-theme-missing.hit.html', cleanFile: 'slide-theme-missing.clean.html' },
  { id: 'slide-rhythm', severity: 'P1', hitFile: 'slide-rhythm.hit.html', cleanFile: 'slide-rhythm.clean.html' },
]

/** 正源检查顺序的权威 id 清单（注册表必须与其逐位一致）。 */
const CANONICAL_CHECK_IDS = [
  'purple-gradient',
  'trust-gradient',
  'ai-default-indigo',
  'emoji-icon',
  'left-accent-card',
  'sans-display',
  'invented-metric',
  'filler-copy',
  'scroll-into-view',
  'all-caps-no-tracking',
  'external-image',
  'raw-hex',
  'accent-overuse',
  'missing-section-anchor',
  'slide-theme-missing',
  'slide-rhythm',
]

// ── 1. 检查项清单 fixture 对账（RL4）────────────────────────────────────────

describe('检查项清单 fixture 对账（16 项，RL4）', () => {
  it('注册表 = 正源 16 项全量清单，顺序与 id 逐位一致（新增检查须显式登记）', () => {
    expect(CHECK_CASES.map((c) => c.id)).toEqual(CANONICAL_CHECK_IDS)
  })

  for (const c of CHECK_CASES) {
    it(`[${c.severity}] ${c.id}：命中 fixture 命中期望 id+severity，反例 fixture 零发现`, () => {
      const hitFindings = lintArtifact(readFixture(c.hitFile))
      const hit = requiredFinding(hitFindings, c.id)
      expect(hit.severity).toBe(c.severity)
      const cleanFindings = lintArtifact(readFixture(c.cleanFile))
      expect(cleanFindings, `${c.id} 反例应零发现，实际: ${JSON.stringify(cleanFindings)}`).toEqual([])
    })
  }
})

// ── 2. 契约与边界（error envelope 与边界用例）────────────────────────────────

describe('契约与边界', () => {
  it('非字符串输入（null/undefined/数字/对象/数组）→ 空清单，不抛错', () => {
    const probe = (v: unknown): LintFinding[] => lintArtifact(v)
    expect(probe(null)).toEqual([])
    expect(probe(undefined)).toEqual([])
    expect(probe(42)).toEqual([])
    expect(probe({ html: '<div style="background: linear-gradient(90deg, #a855f7, pink)">' })).toEqual([])
    expect(probe(['<div>#6366f1</div>'])).toEqual([])
  })

  it('空文本与纯空白文本 → 空清单', () => {
    expect(lintArtifact('')).toEqual([])
    expect(lintArtifact('   \n\t  ')).toEqual([])
  })

  it('finding 形状：severity ∈ 词表、id/message/fix 非空、snippet 为字符串或缺席', () => {
    const findings = lintArtifact(
      '<div style="background: linear-gradient(90deg, #a855f7, pink)"></div>'
        + '<button>🚀 Go</button>'
        + '<span style="text-transform: uppercase">NEW</span>'
        + '<section class="plain">x</section>',
    )
    expect(findings.length).toBeGreaterThan(0)
    for (const f of findings) {
      expect(['P0', 'P1', 'P2']).toContain(f.severity)
      expect(f.id.length).toBeGreaterThan(0)
      expect(f.message.length).toBeGreaterThan(0)
      expect(f.fix.length).toBeGreaterThan(0)
      if (f.snippet !== undefined) expect(typeof f.snippet).toBe('string')
    }
  })

  it('无 snippet 的检查项（scroll-into-view / missing-section-anchor / accent-overuse）snippet 缺席', () => {
    expect(requiredFinding(lintArtifact('<script>el.scrollIntoView({behavior:"smooth"})</script>'), 'scroll-into-view').snippet).toBeUndefined()
    expect(requiredFinding(lintArtifact('<section class="a"><p>x</p></section>'), 'missing-section-anchor').snippet).toBeUndefined()
    const seven = Array.from({ length: 7 }, () => '<i style="color: var(--accent)"></i>').join('')
    expect(requiredFinding(lintArtifact(`<style>:root{--accent:#2f6feb}</style>${seven}`), 'accent-overuse').snippet).toBeUndefined()
  })

  it('snippet 超 200 字符截断为 197 + 省略号（正源 clip 语义）', () => {
    const stops = Array.from({ length: 24 }, (_, i) => `#a855f7 ${(i * 4).toString()}%`).join(', ')
    const html = `<div style="background: linear-gradient(90deg, ${stops})">Hero</div>`
    const hit = requiredFinding(lintArtifact(html), 'purple-gradient')
    expect(hit.snippet).toBeDefined()
    expect(hit.snippet!.length).toBeLessThanOrEqual(200)
    expect(hit.snippet!.endsWith('…')).toBe(true)
  })

  it('HTML 注释剥离前置：注释内的紫渐变与 slide 形状零命中（正源剥离设计动机）', () => {
    const html = `
      <!-- docs: paste a <section class="slide"> here -->
      <!-- style like background: linear-gradient(90deg, #a855f7, #ec4899) -->
      <p>Body text only.</p>
    `
    expect(lintArtifact(html)).toEqual([])
  })

  it('纯函数确定性：同输入两次调用结果深相等且数组实例互不共享', () => {
    const html = '<h2>🚀 Fast</h2><span style="text-transform: uppercase">NEW</span>'
    const a = lintArtifact(html)
    const snapshot = JSON.parse(JSON.stringify(a)) as LintFinding[]
    const b = lintArtifact(html)
    expect(b).toEqual(a)
    expect(b).not.toBe(a)
    // 第一次结果不被第二次调用改写（无共享可变状态）。
    expect(a).toEqual(snapshot)
  })

  it('severity 词表封闭：全部命中 fixture 的发现严重级 ⊆ {P0,P1,P2} 且三级齐备', () => {
    const severities = new Set<string>()
    for (const c of CHECK_CASES) {
      for (const f of lintArtifact(readFixture(c.hitFile))) severities.add(f.severity)
    }
    expect([...severities].every((s) => ['P0', 'P1', 'P2'].includes(s))).toBe(true)
    expect(severities.size).toBe(3)
  })
})

// ── 3. 正源用例移植：ai-default-indigo（上游 lint-artifact.test.ts 全量复断言）──

describe('移植·ai-default-indigo（上游用例逐一复断言）', () => {
  it('命中：solid #6366f1 当强调色（P0）', () => {
    const html = `
      <style>
        .cta { background: #6366f1; color: white; }
      </style>
      <button class="cta">Get started</button>
    `
    expect(requiredFinding(lintArtifact(html), 'ai-default-indigo').severity).toBe('P0')
  })

  it('命中：solid #4f46e5（indigo-600）', () => {
    const html = `<div style="background: #4f46e5">Hi</div>`
    expect(lintArtifact(html).find((f) => f.id === 'ai-default-indigo')).toBeDefined()
  })

  it.each([
    ['#3730a3', 'tailwind indigo-800'],
    ['#a855f7', 'tailwind purple-500'],
    ['#7c3aed', 'tailwind violet-600'],
  ])('命中：solid %s（%s）为登记在案的默认强调色（上游回归锚）', (hex) => {
    const html = `<div style="background: ${hex}">Hi</div>`
    expect(requiredFinding(lintArtifact(html), 'ai-default-indigo').severity).toBe('P0')
  })

  it('purple-gradient 已命中同一颜色时不双报（单信号语义）', () => {
    const html = `<div style="background: linear-gradient(90deg, #6366f1, #ec4899)">Hi</div>`
    const findings = lintArtifact(html)
    expect(findings.find((f) => f.id === 'purple-gradient')).toBeDefined()
    expectNoFinding(findings, 'ai-default-indigo')
  })

  it('只消费 var(--accent)（非 indigo 值）不命中', () => {
    const html = `
      <style>
        :root { --accent: #2f6feb; }
        .cta { background: var(--accent); color: white; }
      </style>
      <button class="cta">Get started</button>
    `
    expectNoFinding(lintArtifact(html), 'ai-default-indigo')
  })

  it(':root 令牌声明 indigo + var(--accent) 下游消费（设计系统有意用色）不命中', () => {
    const html = `
      <style>
        :root { --accent: #6366f1; --bg: #ffffff; }
        .cta { background: var(--accent); color: white; }
      </style>
      <button class="cta">Get started</button>
    `
    expectNoFinding(lintArtifact(html), 'ai-default-indigo')
  })

  it('令牌声明之外仍硬编码同一 hex（组件规则裸写）则命中', () => {
    const html = `
      <style>
        :root { --accent: #6366f1; }
        .cta { background: #6366f1; color: white; }
      </style>
    `
    expect(lintArtifact(html).find((f) => f.id === 'ai-default-indigo')).toBeDefined()
  })

  it(':root[data-theme="dark"] 主题变体令牌不命中', () => {
    const html = `
      <style>
        :root[data-theme="dark"] { --accent: #6366f1; }
        .cta { background: var(--accent); color: white; }
      </style>
    `
    expectNoFinding(lintArtifact(html), 'ai-default-indigo')
  })

  it('选择器列表含 :root（:root 在前）的令牌块不命中', () => {
    const html = `
      <style>
        :root, [data-theme="light"] { --accent: #6366f1; --bg: #ffffff; }
        .cta { background: var(--accent); color: white; }
      </style>
    `
    expectNoFinding(lintArtifact(html), 'ai-default-indigo')
  })

  it('选择器列表含 :root（:root 在后）的令牌块不命中', () => {
    const html = `
      <style>
        [data-theme="light"], :root { --accent: #6366f1; }
        .cta { background: var(--accent); color: white; }
      </style>
    `
    expectNoFinding(lintArtifact(html), 'ai-default-indigo')
  })

  it('无 :root 的纯自定义属性主题块（[data-theme="dark"]）不命中', () => {
    const html = `
      <style>
        [data-theme="dark"] { --accent: #6366f1; --bg: #0b0b10; }
        .cta { background: var(--accent); color: white; }
      </style>
    `
    expectNoFinding(lintArtifact(html), 'ai-default-indigo')
  })

  it(':root 令牌块混声明 color-scheme（正源回归：首选择器捕获含 <style> 前缀的修复锚）不命中', () => {
    const html = `<style>:root { color-scheme: light; --accent: #6366f1; }</style>
      <button class="cta" style="background: var(--accent)">Get started</button>`
    expectNoFinding(lintArtifact(html), 'ai-default-indigo')
  })

  it('组件局部自定义属性洗白（.cta { --cta-bg: #6366f1 }）仍命中', () => {
    const html = `
      <style>
        .cta { --cta-bg: #6366f1; }
        .cta { background: var(--cta-bg); color: white; }
      </style>
      <button class="cta">Get started</button>
    `
    expect(lintArtifact(html).find((f) => f.id === 'ai-default-indigo')).toBeDefined()
  })

  it(':root 非令牌声明（background: #6366f1）保持在场仍命中', () => {
    const html = `
      <style>
        :root { background: #6366f1; }
      </style>
    `
    expect(lintArtifact(html).find((f) => f.id === 'ai-default-indigo')).toBeDefined()
  })

  it(':root 与组件选择器混列表（:root, .cta { --cta-bg: #6366f1 }）仍命中', () => {
    const html = `
      <style>
        :root, .cta { --cta-bg: #6366f1; }
      </style>
    `
    expect(lintArtifact(html).find((f) => f.id === 'ai-default-indigo')).toBeDefined()
  })

  it('裸组件状态属性选择器（[data-variant="primary"]）仍命中', () => {
    const html = `
      <style>
        [data-variant="primary"] { --button-bg: #6366f1; }
      </style>
    `
    expect(lintArtifact(html).find((f) => f.id === 'ai-default-indigo')).toBeDefined()
  })

  it('裸 aria 状态属性选择器（[aria-current="page"]）仍命中', () => {
    const html = `
      <style>
        [aria-current="page"] { --nav-accent: #6366f1; }
      </style>
    `
    expect(lintArtifact(html).find((f) => f.id === 'ai-default-indigo')).toBeDefined()
  })

  it(':root 前缀组件属性（:root[data-variant="primary"]）仍命中', () => {
    const html = `
      <style>
        :root[data-variant="primary"] { --button-bg: #6366f1; }
      </style>
    `
    expect(lintArtifact(html).find((f) => f.id === 'ai-default-indigo')).toBeDefined()
  })

  it('html 前缀 aria 状态属性（html[aria-current="page"]）仍命中', () => {
    const html = `
      <style>
        html[aria-current="page"] { --nav-accent: #6366f1; }
      </style>
    `
    expect(lintArtifact(html).find((f) => f.id === 'ai-default-indigo')).toBeDefined()
  })

  it('body 前缀组件属性（body[data-variant="primary"]）仍命中', () => {
    const html = `
      <style>
        body[data-variant="primary"] { --button-bg: #6366f1; }
      </style>
    `
    expect(lintArtifact(html).find((f) => f.id === 'ai-default-indigo')).toBeDefined()
  })

  it(':root 前缀规范主题开关（:root[data-theme="dark"]）豁免不命中', () => {
    const html = `
      <style>
        :root[data-theme="dark"] { --accent: #6366f1; --bg: #0b0b10; }
        .cta { background: var(--accent); color: white; }
      </style>
    `
    expectNoFinding(lintArtifact(html), 'ai-default-indigo')
  })

  it('html/body 前缀主题开关（data-theme / data-mode）豁免不命中', () => {
    const html = `
      <style>
        html[data-theme="dark"] { --accent: #6366f1; }
        body[data-mode="compact"] { --bg: #0b0b10; }
      </style>
    `
    expectNoFinding(lintArtifact(html), 'ai-default-indigo')
  })

  it('裸 data-color-scheme 主题块豁免不命中', () => {
    const html = `
      <style>
        [data-color-scheme="dark"] { --accent: #6366f1; --bg: #0b0b10; }
        .cta { background: var(--accent); color: white; }
      </style>
    `
    expectNoFinding(lintArtifact(html), 'ai-default-indigo')
  })

  it(':root 令牌块体内含 CSS 注释（前导）不命中', () => {
    const html = `
      <style>
        :root { /* brand accent */ --accent: #6366f1; --bg: #ffffff; }
        .cta { background: var(--accent); color: white; }
      </style>
    `
    expectNoFinding(lintArtifact(html), 'ai-default-indigo')
  })

  it(':root 令牌块尾随 CSS 注释不命中', () => {
    const html = `
      <style>
        :root { --accent: #6366f1; /* brand accent */ }
      </style>
      <button style="background: var(--accent)">Get started</button>
    `
    expectNoFinding(lintArtifact(html), 'ai-default-indigo')
  })

  it(':root 令牌块声明间注释不命中', () => {
    const html = `
      <style>
        :root {
          --bg: #ffffff;
          /* brand accent — keep in sync with DESIGN.md */
          --accent: #6366f1;
        }
      </style>
    `
    expectNoFinding(lintArtifact(html), 'ai-default-indigo')
  })

  it('@media 包裹的 :root 令牌块（正源回归：内层规则直接匹配）不命中', () => {
    const html = `
      <style>
        @media (prefers-color-scheme: dark) {
          :root { --accent: #6366f1; --bg: #0b0b10; }
        }
        .cta { background: var(--accent); color: white; }
      </style>
    `
    expectNoFinding(lintArtifact(html), 'ai-default-indigo')
  })

  it('@supports 包裹的 :root 令牌块不命中', () => {
    const html = `
      <style>
        @supports (color: oklch(0 0 0)) {
          :root { --accent: #6366f1; }
        }
      </style>
    `
    expectNoFinding(lintArtifact(html), 'ai-default-indigo')
  })

  it('非 --accent 全局令牌洗白（--primary: #6366f1）仍命中', () => {
    const html = `
      <style>
        :root { --primary: #6366f1; }
        .cta { background: var(--primary); color: white; }
      </style>
      <button class="cta">Get started</button>
    `
    expect(lintArtifact(html).find((f) => f.id === 'ai-default-indigo')).toBeDefined()
  })

  it('--button-bg 全局令牌与其它令牌混声明仍命中', () => {
    const html = `
      <style>
        :root { --bg: #ffffff; --button-bg: #4f46e5; }
        .cta { background: var(--button-bg); color: white; }
      </style>
    `
    expect(lintArtifact(html).find((f) => f.id === 'ai-default-indigo')).toBeDefined()
  })

  it('@media 包裹 :root 的非 accent 令牌洗白仍命中', () => {
    const html = `
      <style>
        @media (prefers-color-scheme: dark) {
          :root { --primary: #6366f1; --bg: #0b0b10; }
        }
      </style>
    `
    expect(lintArtifact(html).find((f) => f.id === 'ai-default-indigo')).toBeDefined()
  })

  it('主题属性选择器上的非 accent 令牌洗白仍命中', () => {
    const html = `
      <style>
        [data-theme="dark"] { --primary: #6366f1; }
      </style>
    `
    expect(lintArtifact(html).find((f) => f.id === 'ai-default-indigo')).toBeDefined()
  })

  it(':root 混声明 --accent indigo 与无关令牌（--primary: #ff7700）豁免不命中', () => {
    const html = `
      <style>
        :root { --accent: #6366f1; --primary: #ff7700; --bg: #ffffff; }
        .cta { background: var(--accent); color: white; }
      </style>
    `
    expectNoFinding(lintArtifact(html), 'ai-default-indigo')
  })

  it('@media 内组件规则硬编码 indigo 仍命中', () => {
    const html = `
      <style>
        @media (prefers-color-scheme: dark) {
          .cta { background: #6366f1; }
        }
      </style>
    `
    expect(lintArtifact(html).find((f) => f.id === 'ai-default-indigo')).toBeDefined()
  })
})

// ── 4. 正源用例移植：all-caps-no-tracking ───────────────────────────────────

describe('移植·all-caps-no-tracking（上游用例逐一复断言）', () => {
  it('命中：uppercase 完全无 letter-spacing（P1）', () => {
    const html = `
      <style>
        .eyebrow { text-transform: uppercase; font-size: 12px; }
      </style>
      <span class="eyebrow">New</span>
    `
    expect(requiredFinding(lintArtifact(html), 'all-caps-no-tracking').severity).toBe('P1')
  })

  it('命中：letter-spacing 过小（0.02em）', () => {
    const html = `
      <style>
        .eyebrow { text-transform: uppercase; letter-spacing: 0.02em; }
      </style>
    `
    expect(lintArtifact(html).find((f) => f.id === 'all-caps-no-tracking')).toBeDefined()
  })

  it('合规：letter-spacing 0.08em（em 路径）', () => {
    const html = `
      <style>
        .eyebrow { text-transform: uppercase; letter-spacing: 0.08em; }
      </style>
    `
    expectNoFinding(lintArtifact(html), 'all-caps-no-tracking')
  })

  it('合规：letter-spacing 2px（px 路径，无 font-size → 1px 保守地板）', () => {
    const html = `
      <style>
        .eyebrow { text-transform: uppercase; letter-spacing: 2px; }
      </style>
    `
    expectNoFinding(lintArtifact(html), 'all-caps-no-tracking')
  })

  it('无 uppercase 规则的 style 块零发现', () => {
    const html = `<style>.x { color: red; }</style>`
    expectNoFinding(lintArtifact(html), 'all-caps-no-tracking')
  })

  it('命中：违规规则在第二个 <style> 块（上游回归：逐块扫描锚）', () => {
    const html = `
      <style>.reset { box-sizing: border-box; }</style>
      <style>.eyebrow { text-transform: uppercase; font-size: 12px; }</style>
      <span class="eyebrow">New</span>
    `
    expect(requiredFinding(lintArtifact(html), 'all-caps-no-tracking').severity).toBe('P1')
  })

  it('整条规则在 CSS 注释内不命中（上游回归：结构匹配前剥离注释）', () => {
    const html = `
      <style>
        /* .eyebrow { text-transform: uppercase; } */
        .eyebrow { font-size: 12px; }
      </style>
      <span class="eyebrow">New</span>
    `
    expectNoFinding(lintArtifact(html), 'all-caps-no-tracking')
  })

  it('注释环绕时存活规则仍命中', () => {
    const html = `
      <style>
        /* historical: removed in 2024 */
        .eyebrow { text-transform: uppercase; font-size: 12px; }
        /* trailing note */
      </style>
      <span class="eyebrow">New</span>
    `
    expect(lintArtifact(html).find((f) => f.id === 'all-caps-no-tracking')).toBeDefined()
  })

  it('命中：内联 style uppercase 无 letter-spacing（上游回归：内联分支）', () => {
    const html = `<span style="text-transform: uppercase">NEW</span>`
    expect(requiredFinding(lintArtifact(html), 'all-caps-no-tracking').severity).toBe('P1')
  })

  it('命中：内联 letter-spacing 过小（0.02em）', () => {
    const html = `<span style="text-transform: uppercase; letter-spacing: 0.02em">NEW</span>`
    expect(lintArtifact(html).find((f) => f.id === 'all-caps-no-tracking')).toBeDefined()
  })

  it('合规：内联 letter-spacing 0.08em', () => {
    const html = `<span style="text-transform: uppercase; letter-spacing: 0.08em">NEW</span>`
    expectNoFinding(lintArtifact(html), 'all-caps-no-tracking')
  })

  it('合规：内联 letter-spacing 2px', () => {
    const html = `<span style="text-transform: uppercase; letter-spacing: 2px">NEW</span>`
    expectNoFinding(lintArtifact(html), 'all-caps-no-tracking')
  })

  it('命中：style 非首属性的标签（前导边界锚不吃死在串首）', () => {
    const html = `<span class="x" style="text-transform: uppercase">NEW</span>`
    expect(lintArtifact(html).find((f) => f.id === 'all-caps-no-tracking')).toBeDefined()
  })

  it('style 块与内联同时违规不双报（恰好 1 条）', () => {
    const html = `
      <style>.eyebrow { text-transform: uppercase; font-size: 12px; }</style>
      <span style="text-transform: uppercase">NEW</span>
    `
    expect(lintArtifact(html).filter((f) => f.id === 'all-caps-no-tracking')).toHaveLength(1)
  })

  it('合规：12px 标签配 1px（同规则 font-size 解析 1/12 ≈ 0.083em ≥ 0.06em）', () => {
    const html = `
      <style>
        .eyebrow { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
      </style>
    `
    expectNoFinding(lintArtifact(html), 'all-caps-no-tracking')
  })

  it('合规：14px 标签配 1px（地板 0.84px）', () => {
    const html = `
      <style>
        .badge { font-size: 14px; text-transform: uppercase; letter-spacing: 1px; }
      </style>
    `
    expectNoFinding(lintArtifact(html), 'all-caps-no-tracking')
  })

  it('命中：14px 标签配 0.5px（低于同规则地板）', () => {
    const html = `
      <style>
        .badge { font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; }
      </style>
    `
    expect(lintArtifact(html).find((f) => f.id === 'all-caps-no-tracking')).toBeDefined()
  })

  it('合规：内联 12px 配 1px', () => {
    const html = `<span style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px">NEW</span>`
    expectNoFinding(lintArtifact(html), 'all-caps-no-tracking')
  })

  it('合规：内联 14px 配 1px', () => {
    const html = `<span style="font-size: 14px; text-transform: uppercase; letter-spacing: 1px">NEW</span>`
    expectNoFinding(lintArtifact(html), 'all-caps-no-tracking')
  })

  it('命中：内联 14px 配 0.5px', () => {
    const html = `<span style="font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px">NEW</span>`
    expect(lintArtifact(html).find((f) => f.id === 'all-caps-no-tracking')).toBeDefined()
  })

  it('合规：无 font-size 的内联 1px（16px 缺省回退 1/16 ≈ 0.0625em）', () => {
    const html = `<span style="text-transform: uppercase; letter-spacing: 1px">NEW</span>`
    expectNoFinding(lintArtifact(html), 'all-caps-no-tracking')
  })

  it('命中：48px 标题配 0.06rem（rem 按根字号折算 0.96px < 2.88px 地板）', () => {
    const html = `
      <style>
        .display { font-size: 48px; text-transform: uppercase; letter-spacing: 0.06rem; }
      </style>
      <h1 class="display">Headline</h1>
    `
    expect(lintArtifact(html).find((f) => f.id === 'all-caps-no-tracking')).toBeDefined()
  })

  it('合规：16px 标签配 0.06rem（折算 0.96px ≈ 0.06em 恰达地板）', () => {
    const html = `
      <style>
        .eyebrow { font-size: 16px; text-transform: uppercase; letter-spacing: 0.06rem; }
      </style>
    `
    expectNoFinding(lintArtifact(html), 'all-caps-no-tracking')
  })

  it('合规：48px 标题配 0.18rem（折算 2.88px = 地板）', () => {
    const html = `
      <style>
        .display { font-size: 48px; text-transform: uppercase; letter-spacing: 0.18rem; }
      </style>
    `
    expectNoFinding(lintArtifact(html), 'all-caps-no-tracking')
  })

  it('命中：内联 48px 标题配 0.06rem', () => {
    const html = `<h1 style="font-size: 48px; text-transform: uppercase; letter-spacing: 0.06rem">Headline</h1>`
    expect(lintArtifact(html).find((f) => f.id === 'all-caps-no-tracking')).toBeDefined()
  })

  it('合规：内联 16px 标签配 0.06rem', () => {
    const html = `<span style="font-size: 16px; text-transform: uppercase; letter-spacing: 0.06rem">NEW</span>`
    expectNoFinding(lintArtifact(html), 'all-caps-no-tracking')
  })

  it('合规：letter-spacing 解引用合规 :root 令牌（var() 解析路径）', () => {
    const html = `
      <style>
        :root { --caps-tracking: 0.08em; }
        .eyebrow { text-transform: uppercase; letter-spacing: var(--caps-tracking); }
      </style>
      <span class="eyebrow">New</span>
    `
    expectNoFinding(lintArtifact(html), 'all-caps-no-tracking')
  })

  it('命中：letter-spacing 解引用不合规 :root 令牌（0.02em）', () => {
    const html = `
      <style>
        :root { --caps-tracking: 0.02em; }
        .eyebrow { text-transform: uppercase; letter-spacing: var(--caps-tracking); }
      </style>
      <span class="eyebrow">New</span>
    `
    expect(lintArtifact(html).find((f) => f.id === 'all-caps-no-tracking')).toBeDefined()
  })

  it('命中：letter-spacing var() 无匹配令牌定义（按缺失处理）', () => {
    const html = `
      <style>
        .eyebrow { text-transform: uppercase; letter-spacing: var(--caps-tracking); }
      </style>
      <span class="eyebrow">New</span>
    `
    expect(lintArtifact(html).find((f) => f.id === 'all-caps-no-tracking')).toBeDefined()
  })

  it('合规：var() 带合规回退值（var(--caps-tracking, 0.08em)）', () => {
    const html = `
      <style>
        .eyebrow { text-transform: uppercase; letter-spacing: var(--caps-tracking, 0.08em); }
      </style>
      <span class="eyebrow">New</span>
    `
    expectNoFinding(lintArtifact(html), 'all-caps-no-tracking')
  })

  it('合规：内联解引用合规 :root 令牌', () => {
    const html = `
      <style>:root { --caps-tracking: 0.08em; }</style>
      <span style="text-transform: uppercase; letter-spacing: var(--caps-tracking)">NEW</span>
    `
    expectNoFinding(lintArtifact(html), 'all-caps-no-tracking')
  })

  it('命中：3rem 标题配 1px（rem 字号折算 48px，地板 2.88px）', () => {
    const html = `
      <style>
        .display { font-size: 3rem; text-transform: uppercase; letter-spacing: 1px; }
      </style>
      <h1 class="display">Headline</h1>
    `
    expect(lintArtifact(html).find((f) => f.id === 'all-caps-no-tracking')).toBeDefined()
  })

  it('合规：3rem 标题配 0.06em（em 路径与字号单位无关）', () => {
    const html = `
      <style>
        .display { font-size: 3rem; text-transform: uppercase; letter-spacing: 0.06em; }
      </style>
    `
    expectNoFinding(lintArtifact(html), 'all-caps-no-tracking')
  })

  it('合规：3rem 标题配 3px（3 ≥ 48 × 0.06 = 2.88）', () => {
    const html = `
      <style>
        .display { font-size: 3rem; text-transform: uppercase; letter-spacing: 3px; }
      </style>
    `
    expectNoFinding(lintArtifact(html), 'all-caps-no-tracking')
  })

  it('命中：令牌化字号（--display-size: 3rem）配 1px（var() 两级解析）', () => {
    const html = `
      <style>
        :root { --display-size: 3rem; }
        .display { font-size: var(--display-size); text-transform: uppercase; letter-spacing: 1px; }
      </style>
      <h1 class="display">Headline</h1>
    `
    expect(lintArtifact(html).find((f) => f.id === 'all-caps-no-tracking')).toBeDefined()
  })

  it('命中：令牌化 px 字号（--display-size: 48px）配 1px', () => {
    const html = `
      <style>
        :root { --display-size: 48px; }
        .display { font-size: var(--display-size); text-transform: uppercase; letter-spacing: 1px; }
      </style>
    `
    expect(lintArtifact(html).find((f) => f.id === 'all-caps-no-tracking')).toBeDefined()
  })

  it('命中：1em 字号（不可解析单位）配 1px——拒绝宽松回退', () => {
    const html = `
      <style>
        .display { font-size: 2em; text-transform: uppercase; letter-spacing: 1px; }
      </style>
    `
    expect(lintArtifact(html).find((f) => f.id === 'all-caps-no-tracking')).toBeDefined()
  })

  it('合规：1em 字号配 0.08em（em letter-spacing 可验证路径）', () => {
    const html = `
      <style>
        .display { font-size: 2em; text-transform: uppercase; letter-spacing: 0.08em; }
      </style>
    `
    expectNoFinding(lintArtifact(html), 'all-caps-no-tracking')
  })

  it('命中：内联 3rem 标题配 1px', () => {
    const html = `<h1 style="font-size: 3rem; text-transform: uppercase; letter-spacing: 1px">Headline</h1>`
    expect(lintArtifact(html).find((f) => f.id === 'all-caps-no-tracking')).toBeDefined()
  })

  it('命中：letter-spacing 只有自定义属性声明（--letter-spacing: 0.08em 不算数）', () => {
    const html = `
      <style>
        .eyebrow { text-transform: uppercase; --letter-spacing: 0.08em; }
      </style>
      <span class="eyebrow">New</span>
    `
    expect(lintArtifact(html).find((f) => f.id === 'all-caps-no-tracking')).toBeDefined()
  })

  it('命中：font-size 只有自定义属性声明 + 0.5px tracking（保守地板判定）', () => {
    const html = `
      <style>
        .display { text-transform: uppercase; --display-font-size: 48px; letter-spacing: 0.5px; }
      </style>
      <h1 class="display">Headline</h1>
    `
    expect(lintArtifact(html).find((f) => f.id === 'all-caps-no-tracking')).toBeDefined()
  })

  it('命中：内联 letter-spacing 只有自定义属性声明', () => {
    const html = `<span style="text-transform: uppercase; --letter-spacing: 0.08em">NEW</span>`
    expect(lintArtifact(html).find((f) => f.id === 'all-caps-no-tracking')).toBeDefined()
  })

  it('命中：合规 letter-spacing 被后声明覆盖为不合规（级联取最后）', () => {
    const html = `
      <style>
        .eyebrow { text-transform: uppercase; letter-spacing: 0.08em; letter-spacing: 0.02em; }
      </style>
      <span class="eyebrow">New</span>
    `
    expect(lintArtifact(html).find((f) => f.id === 'all-caps-no-tracking')).toBeDefined()
  })

  it('命中：内联同款覆盖形态', () => {
    const html = `<span style="text-transform: uppercase; letter-spacing: 0.08em; letter-spacing: 0.02em">NEW</span>`
    expect(lintArtifact(html).find((f) => f.id === 'all-caps-no-tracking')).toBeDefined()
  })

  it('命中：14px→100px 字号后声明抬高地板（1px < 100×0.06 = 6px）', () => {
    const html = `
      <style>
        .badge { font-size: 14px; font-size: 100px; text-transform: uppercase; letter-spacing: 1px; }
      </style>
    `
    expect(lintArtifact(html).find((f) => f.id === 'all-caps-no-tracking')).toBeDefined()
  })

  it('合规：合规 letter-spacing 是最后声明（覆盖先前不合规值）', () => {
    const html = `
      <style>
        .eyebrow { text-transform: uppercase; letter-spacing: 0.02em; letter-spacing: 0.08em; }
      </style>
    `
    expectNoFinding(lintArtifact(html), 'all-caps-no-tracking')
  })

  it('命中：:root 与 [data-theme] 令牌分歧（默认主题 0.02em 不得被暗色覆盖拯救）', () => {
    const html = `
      <style>
        :root { --caps-tracking: 0.02em; }
        [data-theme="dark"] { --caps-tracking: 0.08em; }
        .eyebrow { text-transform: uppercase; letter-spacing: var(--caps-tracking); }
      </style>
      <span class="eyebrow">New</span>
    `
    expect(lintArtifact(html).find((f) => f.id === 'all-caps-no-tracking')).toBeDefined()
  })

  it('命中：分歧令牌声明顺序对调仍命中（任一主题低于地板即命中）', () => {
    const html = `
      <style>
        [data-theme="dark"] { --caps-tracking: 0.08em; }
        :root { --caps-tracking: 0.02em; }
        .eyebrow { text-transform: uppercase; letter-spacing: var(--caps-tracking); }
      </style>
      <span class="eyebrow">New</span>
    `
    expect(lintArtifact(html).find((f) => f.id === 'all-caps-no-tracking')).toBeDefined()
  })

  it('合规：全部主题作用域令牌都达地板', () => {
    const html = `
      <style>
        :root { --caps-tracking: 0.08em; }
        [data-theme="dark"] { --caps-tracking: 0.10em; }
        .eyebrow { text-transform: uppercase; letter-spacing: var(--caps-tracking); }
      </style>
      <span class="eyebrow">New</span>
    `
    expectNoFinding(lintArtifact(html), 'all-caps-no-tracking')
  })

  it('合规：同一 :root 块重声明令牌取最后值（块内级联收敛，正源回归锚）', () => {
    const html = `
      <style>
        :root { --caps-tracking: 0.02em; --caps-tracking: 0.08em; }
        .eyebrow { text-transform: uppercase; letter-spacing: var(--caps-tracking); }
      </style>
      <span class="eyebrow">New</span>
    `
    expectNoFinding(lintArtifact(html), 'all-caps-no-tracking')
  })

  it('命中：48px 标题配 1px 嵌套在 @media（最内层规则扫描锚）', () => {
    const html = `
      <style>
        @media (min-width: 768px) {
          .display { font-size: 48px; text-transform: uppercase; letter-spacing: 1px; }
        }
      </style>
      <h1 class="display">Headline</h1>
    `
    expect(lintArtifact(html).find((f) => f.id === 'all-caps-no-tracking')).toBeDefined()
  })

  it('命中：48px 标题配 1px 嵌套在 @supports', () => {
    const html = `
      <style>
        @supports (color: oklch(0 0 0)) {
          .display { font-size: 48px; text-transform: uppercase; letter-spacing: 1px; }
        }
      </style>
      <h1 class="display">Headline</h1>
    `
    expect(lintArtifact(html).find((f) => f.id === 'all-caps-no-tracking')).toBeDefined()
  })

  it('合规：配对明暗令牌各自合规（16px+1px / 48px+3px，禁止跨主题笛卡尔误报）', () => {
    const html = `
      <style>
        :root { --caps-tracking: 1px; --display-size: 16px; }
        [data-theme="dark"] { --caps-tracking: 3px; --display-size: 48px; }
        .display {
          font-size: var(--display-size);
          text-transform: uppercase;
          letter-spacing: var(--caps-tracking);
        }
      </style>
      <h1 class="display">Headline</h1>
    `
    expectNoFinding(lintArtifact(html), 'all-caps-no-tracking')
  })

  it('命中：配对主题令牌其一作用域内部不合规（默认 48px+1px）', () => {
    const html = `
      <style>
        :root { --caps-tracking: 1px; --display-size: 48px; }
        [data-theme="dark"] { --caps-tracking: 3px; --display-size: 48px; }
        .display {
          font-size: var(--display-size);
          text-transform: uppercase;
          letter-spacing: var(--caps-tracking);
        }
      </style>
    `
    expect(lintArtifact(html).find((f) => f.id === 'all-caps-no-tracking')).toBeDefined()
  })
})

// ── 5. 正源用例移植：trust-gradient ─────────────────────────────────────────

describe('移植·trust-gradient（上游用例逐一复断言）', () => {
  it('命中：blue→cyan hex 停靠（P0）', () => {
    const html = `<div style="background: linear-gradient(90deg, #3b82f6, #06b6d4)">Hi</div>`
    expect(requiredFinding(lintArtifact(html), 'trust-gradient').severity).toBe('P0')
  })

  it('命中：blue→cyan 关键字停靠', () => {
    const html = `<div style="background: linear-gradient(90deg, blue, cyan)">Hi</div>`
    expect(requiredFinding(lintArtifact(html), 'trust-gradient').severity).toBe('P0')
  })

  it('命中：sky→cyan（sky 与 blue 同族色带）', () => {
    const html = `<div style="background: linear-gradient(135deg, #0ea5e9, #22d3ee)">Hi</div>`
    expect(lintArtifact(html).find((f) => f.id === 'trust-gradient')).toBeDefined()
  })

  it('purple-gradient 已命中（紫→cyan 混合停靠）时不双报', () => {
    const html = `<div style="background: linear-gradient(90deg, #6366f1, #06b6d4)">Hi</div>`
    const findings = lintArtifact(html)
    expect(findings.find((f) => f.id === 'purple-gradient')).toBeDefined()
    expectNoFinding(findings, 'trust-gradient')
  })

  it('blue-only 渐变（无 cyan 停靠）不命中', () => {
    const html = `<div style="background: linear-gradient(90deg, #3b82f6, #1e40af)">Hi</div>`
    expectNoFinding(lintArtifact(html), 'trust-gradient')
  })

  it('cyan-only 渐变不命中', () => {
    const html = `<div style="background: linear-gradient(90deg, #06b6d4, #0891b2)">Hi</div>`
    expectNoFinding(lintArtifact(html), 'trust-gradient')
  })

  it('命中：<style> 块内声明的 blue→cyan 渐变', () => {
    const html = `
      <style>
        .hero { background: linear-gradient(90deg, #3b82f6, #06b6d4); }
      </style>
      <div class="hero">Welcome</div>
    `
    expect(lintArtifact(html).find((f) => f.id === 'trust-gradient')).toBeDefined()
  })
})

// ── 6. 其余 13 项语义锁定（上游无测试，按正源实现语义派生正反用例）────────────

describe('语义锁定·purple-gradient', () => {
  it('命中：purple 关键字形态渐变；trust-gradient 与 ai-default-indigo 因单信号卫门不双报', () => {
    const html = `<div style="background: linear-gradient(90deg, purple, #ffffff)">Hi</div>`
    const findings = lintArtifact(html)
    expect(requiredFinding(findings, 'purple-gradient').message).toContain('purple')
    expectNoFinding(findings, 'trust-gradient')
    expectNoFinding(findings, 'ai-default-indigo')
  })

  it('非渐变的 solid 紫底不命中 purple-gradient（紫渐变专项；solid 归 ai-default-indigo）', () => {
    const html = `<div style="background: #8b5cf6">Hi</div>`
    const findings = lintArtifact(html)
    expectNoFinding(findings, 'purple-gradient')
    expect(findings.find((f) => f.id === 'ai-default-indigo')).toBeDefined()
  })

  it('渐变上下文外的 violet 关键词（color: violet）不命中', () => {
    const html = `<p style="color: violet">violet prose</p>`
    expectNoFinding(lintArtifact(html), 'purple-gradient')
  })
})

describe('语义锁定·emoji-icon', () => {
  it('命中：button 与 icon 类 span 结构位', () => {
    expect(lintArtifact('<button>🎯 Go</button>').find((f) => f.id === 'emoji-icon')).toBeDefined()
    expect(lintArtifact('<span class="icon">⚡</span>').find((f) => f.id === 'emoji-icon')).toBeDefined()
  })

  it('非结构上下文（div/正文散文）不命中', () => {
    expect(lintArtifact('<div>⚡ plain</div>').find((f) => f.id === 'emoji-icon')).toBeUndefined()
    expect(lintArtifact('<p>清单里出现 🎯 与 🚀 字样。</p>').find((f) => f.id === 'emoji-icon')).toBeUndefined()
  })

  it('单信号 break：多个结构位 emoji 只报第一条', () => {
    const html = '<h2>🚀 Fast</h2><button>🎯 Go</button>'
    expect(lintArtifact(html).filter((f) => f.id === 'emoji-icon')).toHaveLength(1)
  })
})

describe('语义锁定·left-accent-card', () => {
  it('命中：border-radius 9px + 彩色左边框', () => {
    const html = '<style>.card { border-left: 3px solid #0f766e; border-radius: 9px; }</style>'
    expect(lintArtifact(html).find((f) => f.id === 'left-accent-card')).toBeDefined()
  })

  it('radius 0px 不命中（命中形状要求 radius ≥1）', () => {
    const html = '<style>.card { border-left: 3px solid #0f766e; border-radius: 0px; }</style>'
    expectNoFinding(lintArtifact(html), 'left-accent-card')
  })

  it('无左边框的圆角卡不命中', () => {
    const html = '<style>.card { border: 1px solid var(--border); border-radius: 8px; }</style>'
    expectNoFinding(lintArtifact(html), 'left-accent-card')
  })
})

describe('语义锁定·sans-display', () => {
  it('命中：h2 配 Arial 与 .h-hero 配 system-ui（类分支）', () => {
    const html = '<style>h2 { font-family: Arial; }</style><h2>T</h2>'
    expect(lintArtifact(html).find((f) => f.id === 'sans-display')).toBeDefined()
    const hero = '<style>.h-hero { font-family: system-ui; }</style>'
    expect(lintArtifact(hero).find((f) => f.id === 'sans-display')).toBeDefined()
  })

  it('非标题选择器（p）配 Inter 不命中；var(--font-display) 合规不命中', () => {
    const p = '<style>p { font-family: Inter; }</style>'
    expectNoFinding(lintArtifact(p), 'sans-display')
    const ok = '<style>h3 { font-family: var(--font-display); }</style>'
    expectNoFinding(lintArtifact(ok), 'sans-display')
  })
})

describe('语义锁定·invented-metric', () => {
  it('命中：99.9% uptime / zero-downtime / 3× more productive', () => {
    for (const phrase of ['99.9% uptime', 'zero-downtime deploy', '3× more productive teams']) {
      const html = `<p>${phrase}</p>`
      expect(lintArtifact(html).find((f) => f.id === 'invented-metric')).toBeDefined()
    }
  })

  it('非命中：3× faster（词表只收 3× more productive/efficient，不收 faster）', () => {
    expect(lintArtifact('<p>3× faster builds</p>').find((f) => f.id === 'invented-metric')).toBeUndefined()
  })

  it('单信号 break：多条指标话术只报第一条', () => {
    const html = '<p>10× faster and 99.9% uptime</p>'
    expect(lintArtifact(html).filter((f) => f.id === 'invented-metric')).toHaveLength(1)
  })
})

describe('语义锁定·filler-copy', () => {
  it('命中：Feature Two / placeholder text / sample content', () => {
    for (const phrase of ['Feature Two', 'placeholder text', 'sample content']) {
      const html = `<p>${phrase}</p>`
      expect(lintArtifact(html).find((f) => f.id === 'filler-copy')).toBeDefined()
    }
  })

  it('单信号 break：lorem ipsum 与 dolor sit amet 同现只报一条', () => {
    const html = '<p>Lorem ipsum dolor sit amet.</p>'
    expect(lintArtifact(html).filter((f) => f.id === 'filler-copy')).toHaveLength(1)
  })
})

describe('语义锁定·raw-hex', () => {
  it('阈值边界：:root 外 12 个裸 hex 不命中，13 个命中', () => {
    const block = (n: number): string =>
      Array.from({ length: n }, (_, i) => `.k${i} { color: #0f172a; }`).join('\n')
    const at12 = `<style>:root { --bg: #ffffff; }\n${block(12)}\n</style>`
    expectNoFinding(lintArtifact(at12), 'raw-hex')
    const at13 = `<style>:root { --bg: #ffffff; }\n${block(13)}\n</style>`
    expect(lintArtifact(at13).find((f) => f.id === 'raw-hex')).toBeDefined()
  })

  it('只清点第一个 <style> 块（正源非全局 exec 语义）：首块干净即不命中', () => {
    const dirty = Array.from({ length: 20 }, (_, i) => `.k${i} { color: #0f172a; }`).join('\n')
    const html = `<style>:root { --bg: #ffffff; }</style><style>\n${dirty}\n</style>`
    expectNoFinding(lintArtifact(html), 'raw-hex')
  })
})

describe('语义锁定·accent-overuse', () => {
  it('阈值边界：style 块外 6 处 var(--accent) 不命中，7 处命中', () => {
    const body = (n: number): string => Array.from({ length: n }, () => '<i style="color: var(--accent)"></i>').join('')
    const at6 = `<style>:root { --accent: #2f6feb; }</style>${body(6)}`
    expectNoFinding(lintArtifact(at6), 'accent-overuse')
    const at7 = `<style>:root { --accent: #2f6feb; }</style>${body(7)}`
    expect(lintArtifact(at7).find((f) => f.id === 'accent-overuse')).toBeDefined()
  })

  it('style 块内的 var(--accent) 不计数（清点对象是块外正文）', () => {
    const refs = Array.from({ length: 10 }, () => 'color: var(--accent);').join(' ')
    const html = `<style>:root { --accent: #2f6feb; } .a { ${refs} }</style><p>Body</p>`
    expectNoFinding(lintArtifact(html), 'accent-overuse')
  })
})

describe('语义锁定·missing-section-anchor', () => {
  it('计数语义：3 个 section 1 个带锚 → message 报「2 of 3」', () => {
    const html = '<section data-od-id="a"><p>1</p></section><section><p>2</p></section><section><p>3</p></section>'
    const hit = requiredFinding(lintArtifact(html), 'missing-section-anchor')
    expect(hit.severity).toBe('P2')
    expect(hit.message).toContain('2 of 3')
  })

  it('data-screen-label 与 data-od-id 都算锚；无 section 零发现', () => {
    expect(lintArtifact('<section data-screen-label="01 Cover"><p>x</p></section>').find((f) => f.id === 'missing-section-anchor')).toBeUndefined()
    expect(lintArtifact('<p>no sections at all</p>').find((f) => f.id === 'missing-section-anchor')).toBeUndefined()
  })
})

describe('语义锁定·slide-theme-missing', () => {
  it('命中门：无 slide 类的 section 不进 deck 检查（slide-theme-missing 与 slide-rhythm 均零发现）', () => {
    const findings = lintArtifact('<section data-od-id="hero"><p>plain</p></section>')
    expectNoFinding(findings, 'slide-theme-missing')
    expectNoFinding(findings, 'slide-rhythm')
  })

  it('CSS 文本里的 .slide 选择器不触发命中门（门锚在 class 属性形态）', () => {
    const findings = lintArtifact('<style>.slide { display: flex; }</style><div data-od-id="x">t</div>')
    expectNoFinding(findings, 'slide-theme-missing')
  })

  it('hero 主题类计入 themed（hero light / hero dark）', () => {
    const html = '<section class="slide hero light" data-screen-label="01"><p>x</p></section>'
    expectNoFinding(lintArtifact(html), 'slide-theme-missing')
  })
})

describe('语义锁定·slide-rhythm', () => {
  it('命中：hero light 三连（HL/HL/HL）', () => {
    const slide = (label: string): string => `<section class="slide hero light" data-screen-label="${label}"><p>x</p></section>`
    const html = slide('01') + slide('02') + slide('03')
    expect(lintArtifact(html).find((f) => f.id === 'slide-rhythm')).toBeDefined()
  })

  it('非命中：L/D 交替与仅两连同主题', () => {
    const s = (theme: string, label: string): string => `<section class="slide ${theme}" data-screen-label="${label}"><p>x</p></section>`
    expectNoFinding(lintArtifact(s('light', '01') + s('dark', '02') + s('light', '03')), 'slide-rhythm')
    expectNoFinding(lintArtifact(s('light', '01') + s('light', '02')), 'slide-rhythm')
  })
})

// ── 7. 出处锚（AX3 对账通道；数值与 runlog 登记逐字一致）────────────────────

describe('出处锚（LINT_SOURCE_ANCHOR）', () => {
  it('正源仓与路径、commit 锚、许可、提取日期与登记值逐字一致', () => {
    expect(LINT_SOURCE_ANCHOR.upstreamUrl).toBe('https://github.com/nexu-io/open-design')
    expect(LINT_SOURCE_ANCHOR.upstreamPath).toBe('apps/daemon/src/lint-artifact.ts')
    expect(LINT_SOURCE_ANCHOR.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(LINT_SOURCE_ANCHOR.commit).toBe('20c49e75c9164bb592cfc299d366884ed79f9914')
    expect(LINT_SOURCE_ANCHOR.license).toBe('Apache-2.0')
    expect(LINT_SOURCE_ANCHOR.extractedAt).toBe('2026-11-10')
  })
})
