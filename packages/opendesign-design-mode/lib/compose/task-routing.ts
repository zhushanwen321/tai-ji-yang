/**
 * 路由指令段生成（设计 §3.1 会话组装层 / D6；权威依据 = 任务书 U3 职责 4）。
 *
 * 任务档不经系统提示词拼接（persona section 静态注册无中途更新通道，且 DSH 会话的任务
 * 首轮问答后才选定、可会话内切换）——路由指令段代替 OD daemon 的 run 前任务选定：
 * 列出八类可交付任务与各自任务档文件绝对路径，指令模型首轮向用户编号问答选择（兼承
 * discovery 档「未定形态请求先选择交付物」职责），选定后用文件工具自读该档全文并遵循。
 *
 * 白名单纪律（D6）：八类 = 13 档全集中路由产物为 HTML 且无 daemon 依赖的全部；媒体三档
 * （image/video/audio）与 discovery、live-artifact 五档不进清单——占位符渲染（placeholders.ts）
 * 与本段共用 {@link routedProfileEntries} 同一过滤，两处不可能漂移（RL3 断言对象）。
 *
 * motion-design 条目附成片报缺指令（D6）：该档由模型自读原文进入上下文，档内 media-video
 * 路由要求（MP4 必交付 + od CLI 媒体命令）的压制载体只能是本段条目级指令——改写器只作用
 * 于注入文本，机制上触达不到自读文件。报缺措辞不含 $OD_BIN 特征串（与 RL3 断言兼容）。
 *
 * 排除五档为何不在段内出现路径：照列会把媒体档路径引入提示词，绕过 D6 的媒体排除。
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROUTED_TASK_PROFILES } from '../types.js'

/** 任务档目录在场景包内的相对位置（OD 组装契约的 taskProfileRoot 锚，strategy-package.ts 同构）。 */
export const TASK_PROFILE_DIR = 'assets/task-profiles'

/** 八类任务的模型可读名（本段自产指令文本，非 OD 资产内容——AX3 不约束自产路由措辞）。 */
const ROUTED_PROFILE_LABELS: Record<(typeof ROUTED_TASK_PROFILES)[number], string> = {
  prototype: 'Prototype (site / app / interaction flow)',
  ppt: 'Presentation (HTML slides / deck)',
  document: 'Document (formatted HTML document)',
  marketing: 'Marketing page (single-file HTML source)',
  'motion-design': 'Motion design (editable HTML source)',
  hyperframes: 'HyperFrames (timeline motion HTML source)',
  'web-clone': 'Web clone (recreate a reference page)',
  webgl: 'WebGL / interactive 3D (real-time HTML)',
}

/** 一个路由档的清单条目：id、任务档文件绝对路径、文件是否在当前安装中在场。 */
export interface RoutedProfileEntry {
  id: (typeof ROUTED_TASK_PROFILES)[number]
  path: string
  exists: boolean
}

/**
 * 八类路由档的清单条目（渲染白名单与占位符渲染共用的同一过滤——唯一入口）。
 *
 * 存在性在组装时探测（existsSync）：V1 基线资产（0.25.1 生成代）八档文件齐备；更老生成代
 * 的安装（如 0.24.x 只铺 4 个任务档）缺档条目按 AX5 显式降级——条目仍列出（类型认知不丢），
 * 但标注当前不可用，指令模型如实报缺，而不是指向一个读不到的死路径。
 */
export function routedProfileEntries(scenarioRoot: string): RoutedProfileEntry[] {
  return ROUTED_TASK_PROFILES.map((id) => {
    const path = taskProfilePath(scenarioRoot, id)
    return { id, path, exists: existsSync(path) }
  })
}

/** 任务档文件绝对路径（场景包目录 + 固定相对位置 + `<id>.md`）。 */
export function taskProfilePath(scenarioRoot: string, id: string): string {
  return join(scenarioRoot, TASK_PROFILE_DIR, `${id}.md`)
}

/**
 * 路由指令段（注入文本的第三段，设计 §3.1 组装顺序 core→orchestration→事实块→路由段）。
 *
 * @param input.scenarioRoot 场景包目录（任务档绝对路径的锚，VersionProfile.scenarioRoot）。
 * @param input.designSystemNames 组装期从资产根 design-systems/ 扫出的目录名清单（bundle.ts 扫描）。
 * @returns 路由指令段文本（自产内容；不含 OD 资产原文，不含宿主特征串）。
 */
export function renderRoutingSegment(input: {
  scenarioRoot: string
  designSystemNames: readonly string[]
}): string {
  const entries = routedProfileEntries(input.scenarioRoot)
  const lines: string[] = [
    '## Task routing (design mode)',
    '',
    'This session runs the design strategy outside the Open Design host, so no',
    'task profile is pre-selected and none is pre-loaded into this prompt. Route',
    'yourself as follows.',
    '',
    '### First turn: settle the deliverable kind',
    '',
    '- If the request already names a concrete deliverable kind (for example',
    '  "landing page", "slide deck", "clone this page"), treat that kind as',
    '  selected and skip the question.',
    '- Otherwise, before planning, show the eight task kinds below as one plain',
    '  numbered text question and ask the user to choose by number or name.',
    '  Recommend the obvious choice when the request makes one likely. This',
    '  first-turn question takes over the selection duty of the discovery',
    '  profile, which is not part of this mode; never look for a discovery',
    '  profile file.',
    '- For a standalone image, video, or audio generation request, do not route',
    '  it to a task profile: state that media rendering is not available in this',
    '  environment and offer an HTML-source deliverable instead.',
    '',
    '### After a task kind is chosen',
    '',
    '- Read the chosen task profile file in full with your file tools before',
    '  planning, and follow it as the authority for that deliverable. The profile',
    '  file is the wording that ships with the installed OpenDesign assets; this',
    '  section only routes you to it.',
    '- To switch task kinds within this session, read the other profile the same',
    '  way before switching the work.',
    '',
    '### Task profiles (absolute paths on this machine)',
    '',
  ]
  entries.forEach((entry, index) => {
    const label = ROUTED_PROFILE_LABELS[entry.id]
    if (!entry.exists) {
      lines.push(
        `${index + 1}. ${label} — ${entry.path}`,
        '   This profile file is missing from the current OpenDesign installation.',
        '   If this kind is requested, tell the user it is currently unavailable',
        '   instead of reading a nonexistent file.',
      )
      return
    }
    lines.push(`${index + 1}. ${label} — ${entry.path}`)
    if (entry.id === 'motion-design') {
      // D6 条目级报缺指令：压制自读档内的 MP4 必交付要求与媒体命令（措辞不含特征串）。
      lines.push(
        '   Motion design note: final-cut MP4 rendering and every media CLI command',
        '   mentioned in that profile are unavailable in this environment. Deliver',
        '   the editable HTML/CSS/JS source; when the profile demands a rendered',
        '   MP4 on top of the source, state the limitation truthfully and deliver',
        '   the source alone.',
      )
    }
  })
  lines.push(
    '',
    '### Design systems installed on this machine',
    '',
  )
  if (input.designSystemNames.length === 0) {
    lines.push(
      'No design-system directories were found in this installation. If the user',
      'names a brand or design system, say none is installed locally instead of',
      'inventing one.',
    )
  } else {
    lines.push(
      'Directory names under the design-systems root (each name is a brand',
      'identifier):',
      '',
      ...input.designSystemNames.map((name) => `- ${name}`),
      '',
      'When the user names a brand, match it against this list, then read',
      '`<design-systems-root>/<name>/DESIGN.md`, `tokens.css`, and sibling files',
      'directly with your file tools.',
    )
  }
  return lines.join('\n')
}
