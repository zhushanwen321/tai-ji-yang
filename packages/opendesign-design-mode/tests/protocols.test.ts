/**
 * 协议层测试（U3a）：派生文本 fixture 对账 + 版本锚字段与骨架 sha256 断言 + 渲染
 * 参数化与占位槽语义 + deck 三段组文结构 + 参数校验 error envelope。
 *
 * fixture 来源（tests/fixtures/protocols/，OD 源码仓正源 commit 20c49e75 提取时点
 * 快照，由提取脚本交叉验证后落盘——非本仓实现的复制品）：
 *   - panel-skeleton.txt：正源 renderPanelPrompt 渲染模板逐字 + 插值点 {{token}} 化
 *     （参数化处 = 标记处，验收条款①「参数化处除外」的承载形态）；
 *   - panel-render-default.txt：正源 renderPanelPrompt(缺省 cfg, 样本 brand/skill)
 *     评估值（提取脚本内评估上游模块取得，与 token 化骨架 + 样本替换逐字节相等——
 *     该等价本身在提取时已验证，本文件再独立断言一次防 fixture 与骨架脱钩）；
 *   - deck-framework-file.txt：daemon device-frames.ts L121-126 组文结构同构的
 *     deck-framework.md 全文（评估值）。
 *
 * 语义权威：opendesign-assets-quality 设计 §3.3 D7/D8/D9 + §5.1 U3 验收条款①②③；AX3 版本锚对账义务。
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  PANEL_PROTOCOL_DEFAULTS,
  PANEL_PROTOCOL_SKELETON,
  PANEL_SLOT_GUIDANCE,
  renderPanelProtocolSection,
  type PanelProtocolParams,
} from '../lib/protocols/panel.js'
import {
  DECK_FRAMEWORK_DIRECTIVE,
  renderDeckFrameworkDirective,
  renderDeckFrameworkFile,
  renderLegacyDeckCompatibilityDirective,
} from '../lib/protocols/deck.js'
import {
  PROTOCOL_VERSION_ANCHORS,
  compareSkeletonAnchor,
  computeSkeletonSha256,
} from '../lib/protocols/anchors.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES = path.join(HERE, 'fixtures/protocols')
const readFixture = (name: string) => readFileSync(path.join(FIXTURES, name), 'utf8')

/** 样本槽值（与 fixture 生成时所用样本一致——提取脚本同一组值）。 */
const SAMPLE_SLOTS = {
  skillId: 'sample-skill',
  brandName: 'Sample Brand Co.',
  brandBody: '# Sample Brand\n\nUse charcoal and amber tones.',
}

/** 缺省参数（PANEL_PROTOCOL_DEFAULTS 同值显式写出，断言不依赖实现内聚合顺序）。 */
const DEFAULTS: PanelProtocolParams = {
  maxRounds: 3,
  scoreThreshold: 8.0,
  scoreScale: 10,
  weights: { designer: 0, critic: 0.4, brand: 0.2, a11y: 0.2, copy: 0.2 },
  protocolVersion: 1,
}

/** 把骨架的 {{token}} 按给定值全部代入（测试侧独立实现，不经 renderPanelProtocolSection）。 */
function substituteSkeleton(params: PanelProtocolParams, slots: typeof SAMPLE_SLOTS): string {
  const weightsLine = Object.entries(params.weights)
    .map(([role, w]) => `${role}=${w}`)
    .join(', ')
  const values: Record<string, string> = {
    scoreScale: String(params.scoreScale),
    maxRounds: String(params.maxRounds),
    scoreThreshold: String(params.scoreThreshold),
    protocolVersion: String(params.protocolVersion),
    weights: weightsLine,
    skillId: slots.skillId,
    brandName: slots.brandName,
    brandBody: slots.brandBody,
  }
  let text = PANEL_PROTOCOL_SKELETON
  for (const [token, value] of Object.entries(values)) {
    text = text.split(`{{${token}}}`).join(value)
  }
  return text
}

describe('验收①：panel 派生文本 fixture 对账（与正源骨架逐字比对，参数化处除外）', () => {
  it('PANEL_PROTOCOL_SKELETON 与正源提取 fixture 逐字一致（插值点 = {{token}} 标记处）', () => {
    expect(PANEL_PROTOCOL_SKELETON).toBe(readFixture('panel-skeleton.txt'))
  })

  it('缺省参数 + 样本槽代入 === 正源 renderPanelPrompt 评估值 fixture（独立替换实现）', () => {
    expect(substituteSkeleton(DEFAULTS, SAMPLE_SLOTS)).toBe(readFixture('panel-render-default.txt'))
  })

  it('骨架无残留上游插值表达式（token 化完备）', () => {
    expect(PANEL_PROTOCOL_SKELETON).not.toContain('${')
  })

  it('正源静态要素在骨架内逐字在场（五面板角色 / 线协议标记 / 收敛规则 / DOs-DON\'Ts）', () => {
    for (const marker of [
      '# Critique Theater (active skill: {{skillId}})',
      '## Panelist role definitions',
      '- **DESIGNER**:',
      '- **CRITIC**:',
      '- **BRAND**:',
      '- **A11Y**:',
      '- **COPY**:',
      '<CRITIQUE_RUN version="{{protocolVersion}}" maxRounds="{{maxRounds}}" threshold="{{scoreThreshold}}" scale="{{scoreScale}}">',
      '<ROUND_END n="1" composite="N" must_fix="K" decision="continue|ship">',
      '## Convergence rule',
      'Close a round with decision="ship" when BOTH conditions hold:',
      "DON'T emit prose outside tags.",
    ]) {
      expect(PANEL_PROTOCOL_SKELETON).toContain(marker)
    }
  })
})

describe('验收①：deck 派生文本 fixture 对账（三段组文全文逐字）', () => {
  it('renderDeckFrameworkFile() 与 daemon 组文结构评估值 fixture 逐字一致', () => {
    expect(renderDeckFrameworkFile()).toBe(readFixture('deck-framework-file.txt'))
  })

  it('三段结构齐备：适用限定句 + Existing deck 兼容段 + New deck 规范段', () => {
    const text = renderDeckFrameworkFile()
    // 标题 + 适用限定句（daemon device-frames.ts L122-123 逐字）。
    expect(text.startsWith('# HTML deck host protocol\n\nApply only to PPT outputs.')).toBe(true)
    expect(text).toContain('Do not create a deck solely because this file exists.')
    // 兼容段与规范段的段标题与正文头。
    expect(text).toContain('## Existing deck or selected template\n\n# Slide deck — selected or existing scaffold compatibility')
    expect(text).toContain('## New deck only\n\n# Slide deck — fixed framework (this is non-negotiable for deck mode)')
    // 兼容段语义句（保留既有脚手架、不替换为正典骨架）。
    expect(text).toContain("Do not replace the selected/existing scaffold with Open Design's canonical skeleton.")
    // 规范段末尾 = filesystem handoff（两段各一份）。
    expect(text.split('## Final handoff — filesystem').length - 1).toBe(2)
    // 骨架 HTML 的协议标记在场。
    expect(text).toContain('data-od-deck-protocol="1"')
  })
})

describe('deck 渲染参数 = filesystem / text_artifact 枚举（UD6 口径）', () => {
  it('DECK_FRAMEWORK_DIRECTIVE === renderDeckFrameworkDirective("filesystem")', () => {
    expect(DECK_FRAMEWORK_DIRECTIVE).toBe(renderDeckFrameworkDirective('filesystem'))
  })

  it('双 profile 仅 handoff 段不同：filesystem 与 text_artifact 各自携带对应 handoff', () => {
    const fsDirective = renderDeckFrameworkDirective('filesystem')
    const taDirective = renderDeckFrameworkDirective('text_artifact')
    expect(fsDirective).toContain('## Final handoff — filesystem')
    expect(fsDirective.endsWith('the saved project file is the canonical deliverable.')).toBe(true)
    expect(taDirective).toContain('## Final handoff — text artifact')
    expect(taDirective.endsWith('the artifact block itself is the canonical deliverable.')).toBe(true)
    expect(fsDirective).not.toContain('## Final handoff — text artifact')
    expect(taDirective).not.toContain('## Final handoff — filesystem')
    // 去掉 handoff 段后正文一致（参数化只作用于 handoff 段；段以 '\n\n' 连接）。
    const fsBody = fsDirective.slice(0, fsDirective.indexOf('\n\n## Final handoff — filesystem'))
    const taBody = taDirective.slice(0, taDirective.indexOf('\n\n## Final handoff — text artifact'))
    expect(fsBody).toBe(taBody)
  })

  it('legacy 兼容段渲染同样接受双 profile', () => {
    const legacyFs = renderLegacyDeckCompatibilityDirective('filesystem')
    const legacyTa = renderLegacyDeckCompatibilityDirective('text_artifact')
    expect(legacyFs).toContain('## Final handoff — filesystem')
    expect(legacyTa).toContain('## Final handoff — text artifact')
    expect(legacyTa).not.toContain('## Final handoff — filesystem')
    expect(legacyFs.startsWith('# Slide deck — selected or existing scaffold compatibility')).toBe(true)
  })
})

describe('panel 渲染：参数化与占位槽（opendesign-assets-quality D8）', () => {
  it('缺省参数代入产物：CRITIQUE_RUN 标记、收敛规则、权重行取缺省值', () => {
    const section = renderPanelProtocolSection()
    expect(section).toContain('<CRITIQUE_RUN version="1" maxRounds="3" threshold="8" scale="10">')
    expect(section).toContain('1. composite >= 8 (on a 0-10 scale)')
    expect(section).toContain('weights: designer=0, critic=0.4, brand=0.2, a11y=0.2, copy=0.2')
    expect(section).toContain('... repeat ROUND blocks up to maxRounds=3 ...')
    expect(section).toContain('After 3 rounds the orchestrator applies the fallback policy.')
  })

  it('自定义参数代入产物（阈值/轮数/刻度全走 params，无内联字面量）', () => {
    const section = renderPanelProtocolSection({
      maxRounds: 5,
      scoreThreshold: 9.5,
      scoreScale: 20,
      weights: { designer: 0, critic: 0.5, brand: 0.2, a11y: 0.2, copy: 0.1 },
      protocolVersion: 2,
    })
    expect(section).toContain('<CRITIQUE_RUN version="2" maxRounds="5" threshold="9.5" scale="20">')
    expect(section).toContain('1. composite >= 9.5 (on a 0-20 scale)')
    expect(section).toContain('weights: designer=0, critic=0.5, brand=0.2, a11y=0.2, copy=0.1')
    expect(section).not.toContain('maxRounds="3"')
  })

  it('生产形态（无 slots）：brand/skill 槽保留 [[token]] 槽位标记（宿主插值安全形态），cfg 标记全部代入且 {{ 全清零', () => {
    const section = renderPanelProtocolSection()
    expect(section).toContain('[[skillId]]')
    expect(section).toContain('[[brandName]]')
    expect(section).toContain('[[brandBody]]')
    expect(section).not.toContain('{{scoreScale}}')
    expect(section).not.toContain('{{maxRounds}}')
    expect(section).not.toContain('{{weights}}')
    expect(section).not.toContain('{{scoreThreshold}}')
    expect(section).not.toContain('{{protocolVersion}}')
    expect(section).not.toContain('{{')
  })

  it('段构成 = 指引块 + 空行 + 代入骨架；slots 齐供时产物与正源渲染同构', () => {
    const withSlots = renderPanelProtocolSection(undefined, SAMPLE_SLOTS)
    const substituted = substituteSkeleton(DEFAULTS, SAMPLE_SLOTS)
    expect(withSlots).toBe(`${PANEL_SLOT_GUIDANCE}\n\n${substituted}`)
    // slots 代入值进产物（对账通道语义）。
    expect(withSlots).toContain('(active skill: sample-skill)')
    expect(withSlots).toContain('<BRAND_SOURCE name="Sample Brand Co.">')
  })

  it('指引块随段注入：两个占位槽的填写指引与 ship-on-write 一致性说明在场', () => {
    const section = renderPanelProtocolSection()
    expect(section.startsWith(PANEL_SLOT_GUIDANCE)).toBe(true)
    expect(PANEL_SLOT_GUIDANCE).toContain('design-template directory name')
    expect(PANEL_SLOT_GUIDANCE).toContain('verbatim')
    expect(PANEL_SLOT_GUIDANCE).toContain('No brand source selected for this run.')
    expect(PANEL_SLOT_GUIDANCE).toContain('Consistency note')
    expect(PANEL_SLOT_GUIDANCE).toContain('ship-on-write')
  })
})

describe('panel 参数校验 error envelope（正源渲染器同款 RangeError 语义）', () => {
  const cases: Array<{ field: keyof PanelProtocolParams; params: Partial<PanelProtocolParams>; expected: string }> = [
    { field: 'maxRounds', params: { maxRounds: 0 }, expected: 'maxRounds must be >= 1, got 0' },
    { field: 'scoreThreshold', params: { scoreThreshold: -1 }, expected: 'scoreThreshold must be >= 0, got -1' },
    { field: 'scoreScale', params: { scoreScale: 0 }, expected: 'scoreScale must be >= 1, got 0' },
    { field: 'protocolVersion', params: { protocolVersion: 0 }, expected: 'protocolVersion must be >= 1, got 0' },
  ]
  for (const { field, params, expected } of cases) {
    it(`${field} 越界抛 RangeError 且 message 指名字段与实际值`, () => {
      expect(() => renderPanelProtocolSection(params)).toThrow(RangeError)
      expect(() => renderPanelProtocolSection(params)).toThrow(expected)
    })
  }
  it('合法边界不抛错（maxRounds=1 / scoreThreshold=0 / scoreScale=1 / protocolVersion=1）', () => {
    expect(() =>
      renderPanelProtocolSection({ maxRounds: 1, scoreThreshold: 0, scoreScale: 1, protocolVersion: 1 }),
    ).not.toThrow()
  })
})

describe('panel 缺省参数 = OD defaultCritiqueConfig 数值（patch config「缺省 8.0/3 兜底」同值）', () => {
  it('PANEL_PROTOCOL_DEFAULTS：阈值 8.0 / 轮数 3 / 刻度 10 / 协议版本 1 / 权重五键', () => {
    expect(PANEL_PROTOCOL_DEFAULTS.scoreThreshold).toBe(8.0)
    expect(PANEL_PROTOCOL_DEFAULTS.maxRounds).toBe(3)
    expect(PANEL_PROTOCOL_DEFAULTS.scoreScale).toBe(10)
    expect(PANEL_PROTOCOL_DEFAULTS.protocolVersion).toBe(1)
    expect(PANEL_PROTOCOL_DEFAULTS.weights).toEqual({ designer: 0, critic: 0.4, brand: 0.2, a11y: 0.2, copy: 0.2 })
  })
})

describe('验收②：版本锚字段与骨架 sha256 断言（AX3 对账义务）', () => {
  it('两协议各有一条登记，锚四要素字段齐备且形态合法', () => {
    expect(PROTOCOL_VERSION_ANCHORS.map((anchor) => anchor.protocol).sort()).toEqual(['deck', 'panel'])
    for (const anchor of PROTOCOL_VERSION_ANCHORS) {
      expect(anchor.sourceRepoUrl).toMatch(/^https:\/\//)
      expect(anchor.commit).toMatch(/^[0-9a-f]{40}$/)
      expect(anchor.extractedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(anchor.skeletonSha256).toMatch(/^[0-9a-f]{64}$/)
      expect(anchor.skeletonBasis.length).toBeGreaterThan(0)
    }
  })

  it('登记 sha256 === 本仓骨架实算哈希（骨架被编辑而锚未重登记即红灯）', () => {
    for (const anchor of PROTOCOL_VERSION_ANCHORS) {
      expect(computeSkeletonSha256(anchor.skeleton())).toBe(anchor.skeletonSha256)
    }
  })

  it('登记骨架与派生文本常量同源（panel 骨架 / deck 铺盘全文）', () => {
    const panelAnchor = PROTOCOL_VERSION_ANCHORS.find((anchor) => anchor.protocol === 'panel')
    const deckAnchor = PROTOCOL_VERSION_ANCHORS.find((anchor) => anchor.protocol === 'deck')
    expect(panelAnchor?.skeleton()).toBe(PANEL_PROTOCOL_SKELETON)
    expect(deckAnchor?.skeleton()).toBe(renderDeckFrameworkFile())
  })

  it('compareSkeletonAnchor：一致 → ok；漂移 → drift 且双方哈希可辨', () => {
    const anchor = PROTOCOL_VERSION_ANCHORS[0]
    expect(compareSkeletonAnchor(anchor.protocol, anchor.skeleton())).toEqual({
      status: 'ok',
      expectedSha256: anchor.skeletonSha256,
      actualSha256: anchor.skeletonSha256,
    })
    const drifted = compareSkeletonAnchor(anchor.protocol, `${anchor.skeleton()}\n<!-- drift -->`)
    expect(drifted.status).toBe('drift')
    expect(drifted.expectedSha256).toBe(anchor.skeletonSha256)
    expect(drifted.actualSha256).not.toBe(anchor.skeletonSha256)
  })

  it('两协议互不串哈希（deck 骨架对 panel 锚必 drift）', () => {
    const deck = PROTOCOL_VERSION_ANCHORS.find((anchor) => anchor.protocol === 'deck')
    const panel = PROTOCOL_VERSION_ANCHORS.find((anchor) => anchor.protocol === 'panel')
    expect(compareSkeletonAnchor('panel', deck!.skeleton()).status).toBe('drift')
    expect(panel).toBeDefined()
  })

  it('未登记协议 fail-fast 抛错', () => {
    expect(() => compareSkeletonAnchor('unknown' as never, '')).toThrow(/未登记的协议/)
  })

  it('computeSkeletonSha256 已知向量（空串 sha256 独立核验）', () => {
    expect(computeSkeletonSha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })
})
