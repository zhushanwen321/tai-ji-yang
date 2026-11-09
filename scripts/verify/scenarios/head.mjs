/**
 * head 场景：会话头 taiji 化（CSS 重塑 + actions 槽追加，本仓 P-1 决策的真实验收）。
 *
 * 两段：
 *  - 空态段（总能跑）：header 单行（min-height 40px 级）、无横向溢出、右侧栏开关贴最右
 *  - 会话态段（前置 = 测试 profile 已有会话）：按钮序（x 单调 + 目标子序）、两两无重叠、
 *    打开方式在场、More actions 隐藏、分段控件样式（高 30 / 底色 = bg-layer-1 /
 *    激活 600 / ::after 隐藏）、header 高 41±2
 *
 * 前置缺失（无任何会话）= 显式 degrade + 恢复动作，不假 pass。会话态驱动只点击侧栏已有
 * 会话行（openSession），绝不向 composer 输入或发送消息（不发模型请求）。
 *
 * 期望值依据 client/head/session-header.css 当前源码；对照色经页面内解析探针取
 * --dsw-alias-bg-layer-1 的解析值（明暗两族都成立，不硬编码 rgb）。
 */
import { collectHead } from '../lib/browser.mjs'

export const meta = {
  id: 'head',
  title: '会话头重塑',
  description: '按钮序 / 无重叠 / 打开方式 / corner 贴边 / 分段控件样式（空态 + 会话态）',
}

/** 会话态目标按钮子序（aria-label 匹配；对话→轨迹→[More views]→打开方式→chevron→右侧栏）。 */
const TARGET_ORDER = [
  ['对话', /对话|Chat/i],
  ['轨迹', /轨迹|Trajectory/i],
  ['打开方式', /Open in|打开方式|Finder/i],
  ['chevron', /More ways/i],
  ['右侧栏', /Open right sidebar|右侧/i],
]

export async function run(ctx) {
  const { page, recorder, ev, log } = ctx

  // ── 空态段 ──────────────────────────────────────────────────────────────
  const blank = await collectHead(page)
  if (blank === null) {
    ev.assert('空态 header 在场', false, { expected: 'header 元素渲染', actual: '缺席（宿主应用未挂载？）' })
    ev.attach('console.txt', recorder.text())
    return
  }
  ev.step({ step: 'head.collect.blank', stats: { headerH: blank.headerH, visible: blank.visible.map((b) => b.label) } })

  ev.assert('空态 header 单行（≤45px；css min-height 40px）', blank.headerH <= 45, {
    expected: '≤45px',
    actual: `${blank.headerH}px`,
  })
  ev.assert('空态无横向溢出', blank.scrollW <= blank.innerW + 1, {
    expected: 'scrollWidth ≤ innerWidth',
    actual: `${blank.scrollW} / ${blank.innerW}`,
  })
  {
    const byX = [...blank.visible].sort((a, b) => a.x - b.x)
    const rightmost = byX[byX.length - 1]
    const isSidebar = rightmost !== undefined && /Open right sidebar|右侧/i.test(rightmost.label)
    const hug = blank.cornerRight !== null && Math.abs(blank.headerRight - 14 - blank.cornerRight) <= 2
    ev.assert('空态右侧栏开关 x 最大且右缘贴 header 右缘', isSidebar && hug, {
      expected: '最右按钮 = 右侧栏开关，右缘 ≈ header 右缘 - 14px padding',
      actual: `最右=${rightmost?.label ?? '无'} 右缘=${blank.cornerRight === null ? 'null' : Math.round(blank.cornerRight)}`,
    })
  }
  await ev.shot(page, 'head-blank', { clip: { x: 260, y: 0, width: 1180, height: 120 } })

  // ── 会话态段（前置：已有会话）──────────────────────────────────────────
  const rowCount = await page.locator('.taiji-pb-row').count()
  if (rowCount === 0) {
    ev.degrade('会话态前置缺失：测试 profile 无任何会话行（head 只点击已有会话，不代发消息）',
      '在该测试 profile 预置会话（手工创建一次即可），或改用已有会话的实例 URL 重跑 head 场景')
    ev.attach('console.txt', recorder.text())
    return
  }

  // 逐行找到确实有对话/轨迹视图的会话：首行可能是尚未发送消息的 New session，
  // 它只有空态 corner，不能拿来断言会话态控件。所有候选都空时降级，不把空态当失败。
  let enteredSession = false
  const rows = page.locator('.taiji-pb-row')
  for (let index = 0; index < rowCount; index += 1) {
    const row = rows.nth(index)
    const sessionId = await row.getAttribute('data-session-id')
    await row.click()
    await page.waitForTimeout(700)
    if (await page.locator('header [role="tablist"]').count() > 0) {
      enteredSession = true
      ev.step({ step: 'head.open.session', stats: { sessionId } })
      break
    }
  }
  if (!enteredSession) {
    ev.degrade('会话态前置缺失：已有会话行均未呈现对话/轨迹视图（可能全是空白 New session）',
      '在测试 profile 预置一条有实际对话的会话，或换一个候选会话后重跑 head 场景')
    ev.attach('console.txt', recorder.text())
    return
  }
  const state = await collectHead(page)
  if (state === null) {
    ev.assert('会话态 header 在场', false, { expected: 'header 渲染', actual: '点击会话行后 header 缺失' })
    ev.attach('console.txt', recorder.text())
    return
  }
  ev.step({ step: 'head.collect.session', stats: { headerH: state.headerH, seq: state.visible.map((b) => b.label).join(' | ') } })

  // a1 视觉序（x 排）单调递增无并列（order 重排后 DOM 序 ≠ 视觉序是机制本身，不作断言）
  {
    const byX = [...state.visible].sort((a, b) => a.x - b.x)
    let mono = true
    for (let i = 1; i < byX.length; i += 1) {
      if (byX[i].x <= byX[i - 1].x) mono = false
    }
    ev.assert('可见按钮视觉序（x 排）单调递增无并列', mono, {
      expected: 'x 严格递增',
      actual: byX.map((b) => b.label).join(' | '),
    })

    // a2 目标子序
    let cursor = 0
    let okSeq = true
    let missing = ''
    for (const [name, re] of TARGET_ORDER) {
      const hit = byX.slice(cursor).findIndex((b) => re.test(b.label))
      if (hit < 0) {
        okSeq = false
        missing = name
        break
      }
      cursor += hit + 1
    }
    ev.assert(`目标按钮子序（${TARGET_ORDER.map((p) => p[0]).join('→')}）`, okSeq, {
      expected: TARGET_ORDER.map((p) => p[0]).join('→'),
      actual: okSeq ? '命中' : `缺/错位于「${missing}」`,
    })
  }

  // a3 More actions 不可见（宿主会话 More ⋯ 被 CSS 隐藏，入口移到侧栏行与 utilities）
  {
    const more = state.all.filter((b) => /More actions/i.test(b.label))
    ev.assert('More actions（⋯）不可见', more.every((b) => b.off), {
      expected: 'display none 或 DOM 缺席',
      actual: more.length === 0 ? 'DOM 缺席' : more.map((b) => `display=${b.display} off=${b.off}`).join(','),
    })
  }

  // b 两两无重叠
  {
    const v = state.visible
    const overlaps = []
    for (let i = 0; i < v.length; i += 1) {
      for (let j = i + 1; j < v.length; j += 1) {
        const a = v[i]
        const b = v[j]
        if (a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1) {
          overlaps.push(`${a.label}↔${b.label}`)
        }
      }
    }
    ev.assert('可见按钮两两无重叠', overlaps.length === 0, {
      expected: '无重叠',
      actual: overlaps.length === 0 ? '无重叠' : overlaps.join('、'),
    })
  }

  // c 打开方式拆分钮可见
  ev.assert('打开方式拆分钮可见', state.visible.some((b) => /Open in|打开方式|Finder/i.test(b.label)), {
    expected: 'utilities 子槽的打开方式按钮渲染（P-1 整槽替换会丢它，故宿主 DOM 保留）',
    actual: state.visible.filter((b) => /Open in|打开方式|Finder/i.test(b.label)).map((b) => b.label).join(',') || '缺席',
  })

  // d 右侧栏开关贴最右
  {
    const byX = [...state.visible].sort((a, b) => a.x - b.x)
    const rightmost = byX[byX.length - 1]
    const isSidebar = rightmost !== undefined && /Open right sidebar|右侧/i.test(rightmost.label)
    const hug = state.cornerRight !== null && Math.abs(state.headerRight - 14 - state.cornerRight) <= 2
    ev.assert('右侧栏开关 x 最大且右缘贴 header 右缘', isSidebar && hug, {
      expected: '最右按钮 = 右侧栏开关（corner 子槽），右缘 ≈ header 右缘 - 14px',
      actual: `最右=${rightmost?.label ?? '无'} 右缘=${state.cornerRight === null ? 'null' : Math.round(state.cornerRight)}/${Math.round(state.headerRight - 14)}`,
    })
  }

  // e 分段控件样式（期望值 = session-header.css 当前源码）
  ev.assert('header 单行高（41±2px）', Math.abs(state.headerH - 41) <= 2, {
    expected: '39..43px',
    actual: `${state.headerH}px`,
  })
  ev.assert('tablist 高 30px', state.segH === '30px', {
    expected: '30px',
    actual: String(state.segH),
  })
  ev.assert('tablist 底色 = bg-layer-1 alias 解析值（明暗两族同判）', state.segBg === state.bgLayer1Resolved, {
    expected: state.bgLayer1Resolved,
    actual: String(state.segBg),
  })
  ev.assert('激活 tab 字重 600', state.activeWeight === '600', {
    expected: '600',
    actual: String(state.activeWeight),
  })
  ev.assert('tab ::after 全为 none（宿主下划线已隐藏）', state.tabAfter.length > 0 && state.tabAfter.every((c) => c === 'none'), {
    expected: '全部 none',
    actual: JSON.stringify(state.tabAfter),
  })

  await ev.shot(page, 'head-session', { clip: { x: 260, y: 0, width: 1180, height: 120 } })
  ev.attach('console.txt', recorder.text())
  log('head 场景完成')
}
