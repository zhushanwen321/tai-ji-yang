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
 *
 * 形状包清单段（opendesign-assets-quality U2，D2）：任务档清单之后追加 design-templates
 * 逐包清单——一行一包（目录名 + od.mode + description 首句 + triggers 中文触发词摘录），
 * 段首声明 design-templates 根绝对路径与「行首目录名即包目录名」的映射。中文项摘录是
 * 清单的路由价值所在：本机资产实测 description 纯英文、中文触发词只在 triggers 字段，
 * 不摘录则中文 brief 无法匹配（D2 不采用项）。选定后模型按根路径自读该包 SKILL.md 全文
 * 与 example.html（无示例页的形状跳过）——与任务档自读同构。字段缺席（od.mode/triggers）
 * 按字段省略渲染、不计异常（U1 降级口径）；解析异常条目仅目录名 + unparsed 标注；
 * 目录缺失整体降级为空清单指引（AX5）。
 *
 * ppt 条目 deck 协议指针（D9）：演示稿产物遵循 `.od-frames/deck-framework.md` 协议文件
 * （上游约定名，OD 任务档 ppt.md:216 fallback 实名；文件由材质化器铺进会话目录，指针 +
 * 自读省提示词——layout.css 同款先例）。
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { OD_FRAMES_DIR } from '../materialize/copy.js'
import type { ShapeTemplateCatalog, ShapeTemplateEntry } from '../locate/asset-catalog.js'
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

/** ppt 条目的 deck 协议文件指针（D9；文件名 = 上游约定 .od-frames/deck-framework.md）。 */
const DECK_PROTOCOL_FILE = `${OD_FRAMES_DIR}/deck-framework.md`

/** 一个形状包的清单行（D2：目录名 + od.mode + description 首句 + 中文触发词摘录）。 */
function shapeTemplateLine(entry: ShapeTemplateEntry): string {
  if (entry.degraded) {
    // 解析异常降级条目（U1 口径）：仅目录名可用——路由线索只剩目录名本身。
    return `- ${entry.dirName} (unparsed — match by directory name only)`
  }
  let line = `- ${entry.dirName}`
  if (entry.mode !== null) line += ` (mode: ${entry.mode})`
  if (entry.descriptionFirstSentence !== null) line += ` — ${entry.descriptionFirstSentence}`
  if (entry.triggerKeywordsZh.length > 0) line += ` — zh: ${entry.triggerKeywordsZh.join(', ')}`
  return line
}

/**
 * 形状包清单节（D2：一行一包 + 段首根路径声明 + 目录名映射 + 自读指引）。
 * present=false 或零条目 → 显式空清单指引（AX5：不发明不存在的形状库）。
 */
function renderShapeTemplatesSection(catalog: ShapeTemplateCatalog): string[] {
  const lines = [
    '### Shape templates (design-templates)',
    '',
  ]
  if (!catalog.present || catalog.entries.length === 0) {
    lines.push(
      'No shape-template packages were found in this installation. If the user',
      'describes a specific screen or component shape, say no shape library is',
      'installed locally instead of inventing one.',
    )
    return lines
  }
  lines.push(
    `Shape-template packages installed on this machine — root: \`${catalog.root}\`.`,
    'The leading directory name of each line is the package directory under',
    'this root. Each line lists the frontmatter mode, the first sentence of',
    'the description, and the Chinese trigger words (zh:) when present.',
    '',
    ...catalog.entries.map(shapeTemplateLine),
    '',
    'Match the brief against the English description and the Chinese trigger',
    'words. When a package matches, read its SKILL.md in full with your file',
    'tools, and read `example.html` in the same directory when present',
    '(templates without an example page skip it).',
  )
  return lines
}

/**
 * 路由指令段（注入文本的第三段，设计 §3.1 组装顺序 core→orchestration→事实块→路由段→
 * 设计系统清单段）。
 *
 * @param input.scenarioRoot 场景包目录（任务档绝对路径的锚，VersionProfile.scenarioRoot）。
 * @param input.shapeTemplates design-templates/ 摘要（U1 buildShapeTemplateCatalog 产物）。
 * @returns 路由指令段文本（自产内容；不含 OD 资产原文，不含宿主特征串）。
 */
export function renderRoutingSegment(input: {
  scenarioRoot: string
  shapeTemplates: ShapeTemplateCatalog
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
    if (entry.id === 'ppt') {
      // D9 条目级协议指针：deck 协议文件由材质化器铺进会话目录，指针 + 自读（省提示词）。
      lines.push(
        `   Deck protocol note: presentation deliverables follow the deck protocol`,
        `   file staged at \`${DECK_PROTOCOL_FILE}\` in this session directory. Read`,
        '   it with your file tools before producing slide or deck HTML.',
      )
    }
  })
  lines.push('')
  lines.push(...renderShapeTemplatesSection(input.shapeTemplates))
  return lines.join('\n')
}
