/**
 * projects 场景：项目分组侧栏基本态（sidebar.workspaces 整槽替换 + 派生层的真实验收）。
 *
 * 断言范围（选择器依据 client/projects/browser.tsx）：
 *  - 替换占位生效：.taiji-pb-list 在场（整槽替换渲染的滚动容器；回落宿主官方列表时缺席）
 *  - 数据就绪：.taiji-pb-unavailable（数据服务未就绪占位）不在场
 *  - 基本态结构：默认项目组头在场（空 profile 即有——默认项目是兜底聚合，不可删）
 *  - 当前会话标记：当前选中会话行带 .taiji-pb-row-current（前置 = 已有会话；缺前置
 *    显式 degrade + 恢复动作，不假 pass）
 *
 * 只读场景：不建项目、不建会话、不发送任何输入。项目建删与归组交互属后续场景扩展
 * （见 COVERAGE.md 的未覆盖登记），本场景只锁「装上即替换 + 基本渲染」。
 */
import { collectProjects } from '../lib/browser.mjs'

export const meta = {
  id: 'projects',
  title: '项目分组侧栏基本态',
  description: '整槽替换占位 / 数据就绪 / 默认项目组头 / 当前会话行标记',
}

export async function run(ctx) {
  const { page, recorder, ev, log } = ctx

  // 数据钩子有短暂 pending 骨架期：短轮询等就绪，超时后再按当前状态判定。
  let state = await collectProjects(page)
  for (let attempt = 0; attempt < 12 && state.unavailablePresent; attempt += 1) {
    await page.waitForTimeout(250)
    state = await collectProjects(page)
  }
  ev.step({ step: 'projects.collect', stats: { list: state.listPresent, groups: state.groupLabels, rows: state.rowCount } })

  // ① 替换占位生效；折叠轨是宿主合法形态，走降级而不是失败断言。
  if (!state.listPresent) {
    ev.degrade('项目分组浏览器缺席：页面可能处于宿主折叠轨（该轨不渲染项目列表），或槽回落了宿主占用者',
      '先加宽窗口 / 展开侧栏后用同一 URL 重跑；仍缺席时查浏览器控制台与宿主日志的槽注册告警')
    ev.attach('console.txt', recorder.text())
    return
  }
  ev.assert('项目分组浏览器在场（整槽替换渲染）', state.listPresent, {
    expected: '.taiji-pb-list 渲染（替换宿主官方工作区列表）',
    actual: '在场',
  })

  // ② 数据就绪
  ev.assert('数据服务就绪（无未就绪占位）', !state.unavailablePresent, {
    expected: '.taiji-pb-unavailable 不在场',
    actual: state.unavailablePresent ? '占位在场（三路数据钩子至少一路缺席）' : '已就绪',
  })

  // ③ 默认项目组头（兜底聚合，空 profile 即有）
  ev.assert('默认项目组头在场', state.defaultHeadPresent, {
    expected: '.taiji-pb-ghead-default 渲染',
    actual: state.defaultHeadPresent ? '在场' : '缺席（派生层 groups 为空？）',
  })
  ev.assert('至少一个分组渲染（默认项目兜底）', state.groupCount >= 1, {
    expected: '≥1',
    actual: `${state.groupCount}（${state.groupLabels.join(', ')}）`,
  })

  // ④ 当前会话行标记（前置：已有会话）
  if (state.rowCount === 0) {
    ev.degrade('当前会话标记前置缺失：测试 profile 无任何会话行',
      '在该测试 profile 预置会话后重跑；或接受基本态（①②③）作为空 profile 的完整验收范围')
  } else {
    ev.assert('当前选中会话行带 current 标记', state.currentRowPresent, {
      expected: '.taiji-pb-row-current 在场（当前组 accent 细线 + 行高亮）',
      actual: state.currentRowPresent ? `在场（session=${state.currentRowSessionId}）` : `${state.rowCount} 行无一标记当前`,
    })
    ev.assert('「当前」chip 文字水平与垂直居中', state.currentChipPresent && state.chipCenterDelta !== null && state.chipCenterDelta.x <= 1 && state.chipCenterDelta.y <= 1, {
      expected: 'chip 在场，文字与 chip 中心偏差 x/y 均 ≤1px',
      actual: state.chipCenterDelta === null ? 'chip 或文字矩形缺席' : `x=${state.chipCenterDelta.x.toFixed(2)}px y=${state.chipCenterDelta.y.toFixed(2)}px`,
    })
  }

  await ev.shot(page, 'projects', { clip: { x: 0, y: 0, width: 300, height: 700 } })
  ev.attach('console.txt', recorder.text())
  log('projects 场景完成')
}
