/**
 * 占位符替换（OD 组装契约的占位符段；权威依据 = 设计 D4/D6 + 任务书 U3 职责 2）。
 *
 * OD 组装方对注入文本做 {{SKILL_CATALOG}}/{{SKILL_ROOT}} 替换（strategy-package.ts 的
 * taskSkill 解码段）。V1 注入范围（core/orchestration）经资产原文 grep 核实不含这两个占位符
 * （占位符在 13 个任务档中仅出现于 discovery.md，而 discovery 档 V1 不注入）——本模块是
 * OD 升级防御：OD 升级后若把占位符带进注入范围，替换照常发生且渲染源经过与路由指令段
 * 共用的白名单过滤（{@link routedProfileEntries}），媒体档路径不可能经占位符渗入提示词
 * （RL3 断言覆盖）。
 *
 * 渲染形态对齐 OD 的 renderDeliverableSkillCatalog：每档一行 `- <id>: Read <绝对路径>`。
 * OD 目录行还带 title/version/description/routes 元数据（daemon 侧 contracts 提供）；
 * V1 不把这四样元数据写死进插件仓（AX3：流程内容不写死），只保留可从路径推导的读取指针。
 */
import { join } from 'node:path'
import { TASK_PROFILE_DIR, routedProfileEntries } from './task-routing.js'

/** OD 组装契约的全量目录占位符（discovery 档原文实名）。 */
export const SKILL_CATALOG_PLACEHOLDER = '{{SKILL_CATALOG}}'

/** OD 组装契约的任务档根占位符（discovery 档原文实名）。 */
export const SKILL_ROOT_PLACEHOLDER = '{{SKILL_ROOT}}'

/** 任务档目录绝对路径（{{SKILL_ROOT}} 的替换体；OD 组装契约的 taskProfileRoot 同锚）。 */
export function taskProfilesRoot(scenarioRoot: string): string {
  return join(scenarioRoot, TASK_PROFILE_DIR)
}

/**
 * 渲染任务档目录清单（占位符替换体）。
 *
 * 与路由指令段共用 {@link routedProfileEntries}：只列八类白名单档、只列在场的文件——
 * 媒体三档与 discovery/live-artifact 两档不可能出现在渲染产物里。
 */
export function renderTaskProfileCatalog(scenarioRoot: string): string {
  return routedProfileEntries(scenarioRoot)
    .map((entry) => `- ${entry.id}: Read ${entry.path}`)
    .join('\n')
}

/**
 * 对一段注入文本做占位符替换（OD 升级防御；V1 基线文本无占位符时是 no-op）。
 *
 * @param text 改写后的注入文本（core + orchestration 拼接体）。
 * @param scenarioRoot 场景包目录（{{SKILL_ROOT}} 替换体 = 任务档目录绝对路径）。
 */
export function replaceInjectionPlaceholders(text: string, scenarioRoot: string): string {
  // 前置快路径：不含 "{{" 的文本（V1 基线常态）直接返回，替换逻辑只在防御形态下运转。
  if (!text.includes('{{')) return text
  return text
    .replaceAll(SKILL_CATALOG_PLACEHOLDER, renderTaskProfileCatalog(scenarioRoot))
    .replaceAll(SKILL_ROOT_PLACEHOLDER, taskProfilesRoot(scenarioRoot))
}
