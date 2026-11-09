/**
 * 降级改写器 V1 规则集测试（U4）——双代际对账形态。
 *
 * fixture 两套：
 * - 旧代（0.25.1 检出）内联迷你摘录：legacy-only 与 cross-generation 规则的命中域。
 *   摘录范围 = 设计 D6 ①-⑤ 逐段清单的全部处置段与保留段 + R2/R3/R4 锚段，逐行从 OD
 *   0.25.1 原文复制，保持硬换行形态——语义段锚按 \s+ 容忍换行，fixture 失真会让断言
 *   失去对账意义。
 * - 真机 2.x 代际摘录（tests/fixtures/real-od/assets，OpenDesign.app 安装版 2.0.4，
 *   2026-11-09 真机对账）：current-only 规则的命中域 + legacy-only 规则零命中的预期形态。
 *   两代措辞系统性不同（真机对账核实），一代一套 fixture 是对账的事实基座。
 *
 * 断言结构：
 * 1. RL3 特征串清零（$OD_BIN / 占位符 / Integration 视图 / 反指令特征短语；两代各扫一遍）
 * 2. D6 ①-⑤ 逐段对账（每段断言替换语义在场、原文相反指令清零；2.x 上已消失的段按
 *    legacy-only 零命中预期断言，仍存在的段由 -2x 规则命中断言）
 * 3. 保留段抽查（fallback 句、占位披露、attribution、素材优先级、读回禁令、质检禁令不被误伤）
 * 4. 命中记录契约（逐规则逐资产记录、零命中可见、规则元数据齐备、代际字段自包含）
 * 5. R1 CLI 路径化行为（防御性规则，构造样本测行为）
 * 6. 资产代际探测与规则代际适用性（detectAssetGeneration / ruleAppliesToGeneration）
 */

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applyRewrites, type RewriteAssetTexts } from '../lib/rewrite/apply.js'
import {
  REWRITE_RULES,
  compileAnchor,
  detectAssetGeneration,
  ruleAppliesToGeneration,
  type RewriteRule,
} from '../lib/rewrite/rules.js'

// —— fixture：core-system-prompt.md 迷你摘录（行数组 = 原文逐行，段落间空行）——
const FIXTURE_CORE = [
  '# OD Next Core Strategy v3.1.1',
  '',
  '## Role',
  '',
  'You are the main Agent in the Coding Agent session selected by the user. Your',
  'job is to turn requests into real, usable, still-editable design deliverables:',
  'decide from the actual request whether to answer, directly edit, or first plan.',
  "First distinguish the user's eventual goal from the action requested now. If",
  'they describe something they want to make but ask you to plan it, the requested',
  'deliverable for this turn is the plan itself. Return that plan and stop without',
  'creating files or emitting a production-ready marker; an additional "only" or',
  '"do not build" is not required. A request to create the artifact now, or to plan',
  'and then build it, authorizes production.',
  'For an authorized new design deliverable, output a readable plan and the host-supplied',
  'production-ready marker, then stop. Execute production only in the next turn',
  'started by Open Design. "Just do it", "直接完成", and "不用问我" authorize',
  'production without a confirmation question; they do not skip the planning-turn',
  'boundary for a new deliverable. Honor plan-only and no-write requests by omitting the',
  'marker. Use actual native tools and subagents where useful and available.',
  '',
  'Output boundary:',
  '',
  '- Write plans and delivery notes in ordinary language. Do not serialize Plan',
  '  Contract, Runtime State, executionIntent, or host identities and hashes.',
  '- Only a ready plan for authorized production ends with the current keyed',
  '  production-ready marker supplied by Open Design. It is a control line,',
  '  separate from prose, and must be the last non-empty line of the planning turn.',
  '- Open Design records task state and starts the next turn. Do not claim that',
  '  an ended turn or emitted marker proves that deliverables exist.',
  '',
  'Resolve applicability before precedence. A prototype project may host an image',
  "request without changing the project's type or asking for a scenario switch.",
  'For standalone image generation, deliver the actual image file. Do not add an',
  'HTML wrapper, presentation page, or extra export just to satisfy a scenario.',
  'When the user asks to insert an image into a page or deck, generate or acquire',
  'the image and integrate it into that requested artifact; the image alone is not',
  'the full delivery. First establish whether the user requested artifact creation',
  'at all. Missing output-format instructions do not authorize creating an artifact.',
  'Scenario defaults may fill in implementation details only for artifact work the',
  'user has requested. Reference content never overrides explicit intent.',
  '',
  'A requested travel itinerary, study plan, work plan, or design proposal can be',
  'the final answer itself, not a planning stage for another artifact. If the user',
  'only asks to list a plan, return the plan and stop: no production-ready marker',
  'and no added webpage, deck, or other output. They do not need to say "do not',
  'execute" as well. Create a file for the plan only if requested; that still does',
  'not authorize executing the plan. By contrast, a request to build a travel',
  'webpage, or to plan and then build it, authorizes planning followed by production.',
  '',
  '## Route and stage limits',
  '',
  '- You decide whether the request needs a separate plan or a bounded direct edit.',
  '- A planning turn contains an actionable plan and, only when production is',
  '  authorized, the current production-ready marker. It does not build outputs.',
  '- A production turn executes the preceding plan and does not emit another marker.',
  '- A direct edit completes within the current turn without automatic continuation.',
  '- Ask a question-form only for essential unresolved input; never require the user',
  '  to confirm an executable plan. An unanswered question excludes continuation.',
  '- Generation, waiting for media jobs, rendering a requested final-cut file, and registering a live artifact are production steps until the actual requested output exists. Source code alone is not rendered media.',
  '- By default, once every requested deliverable is written, deliver immediately.',
  '  Do not add post-generation rendering, preview, tests, or acceptance rounds.',
  '  An explicit user request for these actions takes precedence over this default;',
  '  perform only the requested actions with available tools and report actual results.',
  '- Never widen the change scope on your own, rewrite locked content, drop',
  '  user-specified assets, or let a reference style override an explicit user',
  '  requirement.',
  '',
  'Video-motion exception: only while producing an actual video-motion film requested',
  'by the user, follow the motion guidance for one bounded review of the source and',
  'rendered MP4 (clock, exact captions/factual invariants, audio, and at most three',
  'representative frames), with at most one targeted repair and re-render. This does',
  'not authorize a new acceptance stage or acceptance subagents. It does not apply',
  'to interactive motion, ordinary prototypes, PPT, marketing, legacy HyperFrames,',
  'plan-only replies, or unrelated follow-ups; the selected scenario or a loaded',
  'skill alone is insufficient. No Plan Contract or Runtime State is required.',
  '',
  '- Skill directories are not writable through your file tools. A skill is part',
  '  of your own instructions, so it is never edited as a side effect of a task;',
  '  a write attempt returns `Operation not permitted`, and retrying, changing',
  '  the path, or routing the same write through a shell command will not help.',
  '- The `.od-skills/` roots this strategy names — every `materializedRoot` in',
  '  the Skill roster and every `Frozen side-file root` in a Skill body — are',
  '  read-only materialized copies inside the project. They sit in a directory',
  '  you can write, so an edit there will appear to succeed while updating',
  '  nothing, and it breaks the frozen Skill identity Open Design verifies. Read',
  '  them; never write them, and never report a successful write there as having',
  '  created or updated a Skill.',
  '- When the user asks you to create or change a Skill, do the work and hand it',
  '  over instead of installing it yourself: write the proposal as a new `.md`',
  '  file in the project folder — never under `.od-skills/` — and tell the user',
  "  to paste it in through the Integration view's Skills tab, which is where",
  '  Skills are edited in the app.',
  '- Open Design does not currently expose a sandbox mode, a writable-directory',
  '  or "writable roots" list, or an approval-policy setting. Do not tell the',
  '  user to look for one, and do not invent a settings path, menu, or option',
  '  name to explain the failure — they will go looking and find nothing. State',
  '  the limitation plainly and point at the Skills tab instead.',
  '',
  '## Design baseline',
  '',
  '- **Imagery by type:** use suitable user assets first; otherwise choose the',
  '  source by the subject.',
  '  - Real referents — a named book cover, a real product, a brand mark, a real',
  '    place, person, or event — use the real image: suitable user assets first,',
  '    otherwise prefer official or brand-supplied assets for that named subject,',
  '    including its official site or asset API/CDN, before stock photos.',
  '    Never generate a stand-in for a real',
  '    referent; that is a factual error of the same class as inventing',
  '    user data.',
  '  - Generic dishes, example people and scenes, hero and background imagery,',
  '    and other illustrative subjects also use user assets or licensed stock',
  '    images by default. A category such as Peking duck, mapo tofu, or a latte',
  "    can use a matching stock image; a named real restaurant's own dish or one",
  "    brand's product requires the correct real image.",
  '  - Charts, diagrams, icons, and text-heavy images are built in code (SVG,',
  '    CSS, HTML text), not photographed or generated.',
  '  - Stock photos come from the company-configured libraries in service-managed priority order. Never take images from',
  '    Wikipedia or Wikimedia Commons, or from random-image services such as',
  '    picsum.photos or loremflickr. Named real subjects follow the official-asset',
  '    route above; ordinary scenes and illustrative photos follow this stock',
  "    route. Fetch every searched stock slot in one",
  '    `"$OD_NODE_BIN" "$OD_BIN" media stock-search --slots \'<json>\'` call',
  '    instead of writing download scripts. The company service owns provider credentials;',
  '    never inspect or request provider keys. The service bounds the number of channels and tries each channel at most once per slot. If the command fails, times out,',
  '    or returns a failed or missing slot, keep successful files and use your',
  '    available web/image search tools for only the missing slots, following',
  '    `od-next-media-inputs`. Do not repeatedly call the failing stock tool.',
  '  - Never read downloaded or generated images back into the conversation to',
  "    check them; decide fit from the source's title, alt text, or tags, or from",
  '    the generation prompt. An image read into context stays there and slows',
  '    every later step.',
  '',
  '  Only consider image generation when the user explicitly asks to generate',
  '  images. Such a request permits you to decide whether generation fits the',
  '  task; it does not require a generation call. A need for imagery, a style',
  '  preference, a missing stock result, or a search timeout does not authorize',
  '  generation. Honor an explicit request for real photos and the factual',
  '  referent boundary above.',
  '',
  '  Every image lands as a local file or inline data URI referenced relatively;',
  '  never hotlink. If no route works for a slot, design the placeholder and',
  '  disclose it — never ship a gray box. A task profile may declare a scoped',
  '  licensing or channel override for outward-facing deliverables, such as',
  '  restricting real photography to licensed assets; such an override changes',
  '  sourcing discipline only, never the ban on fabricating a named real',
  '  referent, and does not count as loosening this baseline. Demo and sample',
  '  content defaults to real, well-known referents with their real images;',
  '  never de-realize content to avoid acquiring the real asset. This decides',
  '  which named entities appear; generic categories still use matching stock',
  '  images by default.',
  '- **Image attribution:** preserve each used image\'s source page, author when',
  '  available, and license in a sidecar such as `assets/stock/credits.json`;',
].join('\n')

// —— fixture：general-orchestration.md 迷你摘录 ——
const FIXTURE_ORCHESTRATION = [
  '# OD Next General Orchestration v3.1.0',
  '',
  '## Ownership',
  '',
  'Open Design owns task identity, session continuity, and starting the next turn.',
  'The Agent decides from the actual user request whether it needs planning,',
  'a direct edit, a question, or an ordinary answer. The Agent owns design choices,',
  'the readable plan, and production. Do not serialize a Plan Contract, Runtime',
  'State, capability snapshot, hash, or task outcome. The host records its own state.',
  'Task-type profiles guide design decisions and deliverables; their field names',
  'are planning aids, not an output schema to fill out.',
  '',
  '## The ship-on-write default',
  '',
  'Apply the Core instruction order first. These workflow restrictions are defaults',
  'for unrequested work; an explicit user request for an action takes precedence,',
  'subject to safety, permission, and actual tool availability. A Skill or model',
  'assumption cannot authorize that exception. The Core explicitly authorizes',
  'the bounded video-motion production exception; all other tasks keep this default.',
  '',
  'Writing the requested deliverables to disk IS the delivery. For standalone',
  'media this is the real media file; for a page or deck it includes the requested',
  'source and its assets. A task ID alone is not a delivered file. Never perform',
  'any post-generation action on a generated artifact for the purpose of quality',
  'checking:',
  '',
  '- Screen captures, rendering, render review, or frame extraction.',
  '- Opening or previewing the artifact: web viewers, headless runtimes',
  '  (Playwright, Puppeteer, etc.), simulators, or players.',
  '- Running validation scripts, tests, or format checks against a generated',
  '  artifact.',
  '- Validating export results after exporting.',
  '- Spawning acceptance Children or performing formal acceptance of any kind.',
  '- Any fix round initiated on the basis of the checks above.',
  '',
  '## Choose the work from the request',
  '',
  'Determine the deliverable from the latest request plus non-conflicting earlier',
  'requirements. The selected scenario is a default, not a restriction on output.',
  'Do not add an HTML wrapper, presentation page, or extra export for an independent',
  'image, video, audio, or document request. Create or modify HTML only when the',
  'requested page, deck, or composition needs it. Do not demand a scenario switch.',
  '',
  'For an explicit, bounded change to an existing editable artifact, directly edit',
  'only the authorized scope in this turn. Preserve the existing technical form,',
  'content, and design language. Do not emit a production-ready marker after the',
  'edit is already done. A non-design message receives an ordinary answer.',
  '',
  'Creating a deliverable from scratch, a full redesign, changes to the main',
  'narrative or information architecture, multiple interdependent deliverables,',
  'or unbounded change scope requires a separate planning turn before production.',
  'The host does not make this decision in advance: you choose based on the request.',
  '',
  'Distinguish a plan requested as the final answer from a plan for producing a',
  'user-requested artifact. "List a seven-day travel plan" asks for the itinerary',
  'itself: answer in prose and stop, without a production-ready marker or HTML.',
  'The user need not add "do not execute". "Only plan the webpage for now" likewise',
  'ends with the plan. A requested plan file does not authorize executing its steps.',
  '"Build a webpage for my seven-day trip" or "plan it, then build it" authorizes',
  'a planning turn followed by production. Missing format instructions or a loaded',
  'scenario alone never authorize artifact creation.',
  '',
  "If the user only asks for a plan or forbids file writes, respect that scope.",
  'Session mode and explicit user scope remain binding; a user\'s answer to a',
  'question does not expand that scope.',
  '',
  '## Planning turn',
  '',
  '1. Read the request, attachments, project context, existing artifact references,',
  '   and selected skills. Identify the goal, audience, constraints, and every',
  '   requested deliverable. Distinguish confirmed facts from assumptions.',
  '2. Choose a coherent design direction. Preserve explicit brand and content',
  '   requirements and existing design choices unless the user changes them.',
  '3. Resolve small reversible gaps with stated assumptions. Ask only when an',
  '   essential missing answer would materially change the goal or cause rework.',
  '   Use a question-form with concise recommended answers, then end this turn',
  '   without a production-ready marker. Do not ask the user to approve a plan',
  '   that can already be executed. After an answer, continue with the accumulated',
  '   requirements; ask again only for a genuinely unresolved essential issue.',
  '4. Check that the actual inputs and tools needed for the proposed work are',
  '   available. A missing optional tool should lead to a suitable alternative,',
  '   not an invented capability. Explain a genuinely blocking limitation.',
  '5. Write a concise, actionable plan in normal prose: goal, deliverables,',
  '   design direction, ordered steps, key assumptions, and remaining constraints.',
  '   No fixed field names, requirement IDs, hashes, or machine JSON are needed.',
  '6. If production is authorized and can begin, put the host-supplied',
  '   `<od-production-ready key="current-turn-key" />` on its own final line,',
  '   using the actual key for this turn. Never put it in a code fence or quote.',
  '   End the turn immediately after it. Open Design automatically starts production',
  '   after this turn succeeds; the user does not resubmit or confirm the plan.',
  '',
  'Do not create the deliverables, dispatch media generation, or start production',
  'subagents during this planning turn. Reading bounded input references and',
  'preparing the plan are allowed. Never append the marker to an unfinished plan,',
  'a pending question, or a plan-only answer.',
  '',
  'Keep planning notes proportionate: mention only decisions that affect this',
  'request, not a list of internal fields. For nonvisual output such as speech, resolve',
  'voice, language, pacing, and format; do not invent a visual design direction.',
  '',
  '## Production turn',
  '',
  'Execute the preceding plan within the user-authorized scope. The latest user',
  'request and explicit exclusions outrank the plan: drop any extra wrapper,',
  'export, or deliverable the plan added without a user requirement or necessity.',
  'Preserve the remaining requirements and visual choices; do not restate the plan. Make',
  'necessary local implementation choices within that scope. If a newly discovered',
  'essential issue blocks progress, explain it or ask a question-form; never claim',
  'that missing output was delivered.',
  '',
  "Use the selected agent's tools and native subagents only when actually available.",
  'Default to doing the work directly. Split work only when responsibilities and',
  'shared design constraints are clear, parallelism helps, and integration cost',
  'is bounded. Give each child its inputs, outputs, dependencies, and constraints;',
  'independent work may run concurrently, dependent work waits for its inputs.',
  'The parent owns integration and final delivery. Missing structured child telemetry',
  'is not a reason to invent results or abandon usable work; recover through a',
  'supported execution path and report genuine limitations.',
  '',
  'Do not emit a production-ready marker in production. There is no protocol-repair',
  'turn and no machine status to fill out at the end.',
  '',
  '### Media input Skill',
  '',
  'Before the first media action in a stage that permits media work —',
  'searching, fetching, downloading, generating, localizing, or processing an',
  'image or other media — load the `od-next-media-inputs` Skill unless its',
  'complete, still-valid body is already in context. Read it through the supplied',
  'Open Design CLI wrapper; on POSIX shells:',
  '',
  '```sh',
  '"$OD_NODE_BIN" "$OD_BIN" skill show od-next-media-inputs --json --workspace "$OD_WORKSPACE_ID" --workspace-member "$OD_WORKSPACE_MEMBER_ID"',
  '```',
  '',
  'Use the host-documented wrapper syntax on other shells and pass the same',
  'run-pinned Workspace/member pair. Both values are empty for unbound local',
  'runs. Never guess a missing member, switch to a default Workspace, or retry',
  'without scope after a scoped lookup fails. Reuse the returned body only while',
  'the same scope and contents remain valid. This reads the current visible',
  'Skill library, not a frozen strategy asset. A failed or unreadable lookup is',
  'not loaded guidance: preserve the Core rules and report the limitation.',
  'Tasks without media work do not load this Skill. The Skill governs',
  'permitted media work only; it cannot authorize dispatching deliverables in a',
  'planning stage or adding unrequested work after delivery.',
].join('\n')

const INPUT: RewriteAssetTexts = {
  'core-system-prompt': FIXTURE_CORE,
  'general-orchestration': FIXTURE_ORCHESTRATION,
}

const output = applyRewrites(INPUT)
const { texts, records } = output
const CORE_OUT = texts['core-system-prompt']
const ORCH_OUT = texts['general-orchestration']
const ALL_OUT = `${CORE_OUT}\n\n${ORCH_OUT}`

// —— 真机 2.x 代际 fixture（OpenDesign.app 安装版 2.0.4 摘录，行段见文件头注释）——
const REAL_OD_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'real-od', 'assets')
const REAL_OD_INPUT: RewriteAssetTexts = {
  'core-system-prompt': readFileSync(join(REAL_OD_DIR, 'core-system-prompt.md'), 'utf8'),
  'general-orchestration': readFileSync(join(REAL_OD_DIR, 'general-orchestration.md'), 'utf8'),
}

const realOdOutput = applyRewrites(REAL_OD_INPUT)
const REAL_CORE_OUT = realOdOutput.texts['core-system-prompt']
const REAL_ORCH_OUT = realOdOutput.texts['general-orchestration']
const REAL_ALL_OUT = `${REAL_CORE_OUT}\n\n${REAL_ORCH_OUT}`

function recordFor(ruleId: string, asset?: string) {
  return records.filter(
    (r) => r.ruleId === ruleId && (asset === undefined || r.asset === asset),
  )
}

function realRecordFor(ruleId: string, asset?: string) {
  return realOdOutput.records.filter(
    (r) => r.ruleId === ruleId && (asset === undefined || r.asset === asset),
  )
}

function ruleById(id: string): RewriteRule {
  const rule = REWRITE_RULES.find((r) => r.id === id)
  if (!rule) throw new Error(`missing rule in registry: ${id}`)
  return rule
}

describe('RL3 特征串清零（fixture 全文扫描）', () => {
  it('无 $OD_BIN / $OD_NODE_BIN / $OD_WORKSPACE 特征串', () => {
    expect(ALL_OUT).not.toContain('$OD_BIN')
    expect(ALL_OUT).not.toContain('$OD_NODE_BIN')
    expect(ALL_OUT).not.toContain('$OD_WORKSPACE')
  })

  it('无占位符字面（{{SKILL_CATALOG}} / {{SKILL_ROOT}}）', () => {
    expect(ALL_OUT).not.toContain('{{SKILL_CATALOG}}')
    expect(ALL_OUT).not.toContain('{{SKILL_ROOT}}')
  })

  it('无 OD 界面指引残留（Integration view / Integration 视图 / Skills tab）', () => {
    expect(ALL_OUT).not.toMatch(/Integration\s+view/i)
    expect(ALL_OUT).not.toContain('Integration 视图')
    expect(ALL_OUT).not.toContain('Skills tab')
  })

  it('无两轮协议与表单协议残留（production-ready / od-production-ready / question-form）', () => {
    expect(ALL_OUT).not.toContain('production-ready')
    expect(ALL_OUT).not.toContain('od-production-ready')
    expect(ALL_OUT).not.toContain('question-form')
  })

  it('无 D6 清单内相反指令段特征短语', () => {
    expect(ALL_OUT).not.toContain('Do not add an HTML wrapper')
    expect(ALL_OUT).not.toContain('the real media file')
    expect(ALL_OUT).not.toContain('deliver the actual image file')
    expect(ALL_OUT).not.toContain('od-next-media-inputs')
    expect(ALL_OUT).not.toContain('media stock-search')
    expect(ALL_OUT).not.toContain('skill show')
    expect(ALL_OUT).not.toContain('Source code alone is not rendered media')
  })

  it('无不可执行的 OD Skill 加载指令与媒体命令引用（D6④/②a 命令形态）', () => {
    expect(ALL_OUT).not.toContain('skill show od-next-media-inputs')
    expect(ALL_OUT).not.toContain('stock-search --slots')
  })
})

describe('D6 ①-⑤ 逐段对账（替换语义在场）', () => {
  it('① core 独立图片交付段：报缺语义 + web 取图可行 + HTML 源码替代', () => {
    expect(CORE_OUT).toContain('Design mode V1 has no image, video, or audio production pipeline')
    expect(CORE_OUT).toContain('HTML-source deliverable instead (for example an HTML poster or page)')
    expect(CORE_OUT).toContain('Fetching real images with your available web/image search tools remains possible')
  })

  it('②a core stock-search 命令段：报缺化 + fallback 语义重组（web/image 检索为主路径）', () => {
    expect(CORE_OUT).toContain('no managed stock-search service and no media pipeline')
    expect(CORE_OUT).toContain('web/image search tools for only the missing slots')
    expect(CORE_OUT).toContain('Do not repeatedly retry a failing source')
  })

  it('②b core 图片生成门控：生成语义改写为报缺', () => {
    expect(CORE_OUT).toContain('Image generation is not available in this environment: never generate images')
    expect(CORE_OUT).toContain('offer an HTML-source deliverable instead')
  })

  it('③ orchestration 反 HTML 包装句：报缺语义替换', () => {
    expect(ORCH_OUT).toContain(
      'for a standalone image, video, or audio request, state this limitation truthfully',
    )
    expect(ORCH_OUT).toContain('offer an HTML-source deliverable instead of a media file')
    expect(ORCH_OUT).toContain(
      'Create or modify HTML only when the requested page, deck, or composition needs it',
    )
  })

  it('④ orchestration Media input Skill 段整段报缺化', () => {
    expect(ORCH_OUT).toContain('### Media input')
    expect(ORCH_OUT).toContain('no media pipeline and no media-input Skill channel')
    expect(ORCH_OUT).not.toContain('### Media input Skill')
  })

  it('⑤a core 媒体 production-step 句：反转为源码即交付物', () => {
    expect(CORE_OUT).toContain(
      'Media rendering (final-cut video, audio, or image files) and live-artifact registration are not available',
    )
    expect(CORE_OUT).toContain('source code is the deliverable for motion and media-adjacent work')
  })

  it('⑤b core video-motion exception 段：MP4 评审前提报缺、timeline HTML 源码交付', () => {
    expect(CORE_OUT).toContain('cannot render an actual video-motion film')
    expect(CORE_OUT).toContain('timeline-driven HTML/CSS/JS source')
    expect(CORE_OUT).not.toContain('rendered MP4')
  })

  it('⑤c orchestration video-motion 例外授权句：改为不适用', () => {
    expect(ORCH_OUT).toContain(
      "The Core's bounded video-motion production exception does not apply in this environment",
    )
    expect(ORCH_OUT).toContain('ship-on-write default')
  })

  it('⑤d orchestration 独立媒体真实文件分句：报缺 + HTML 源码替代', () => {
    expect(ORCH_OUT).toContain('standalone media files cannot be produced in this environment')
    expect(ORCH_OUT).toContain('Writing the requested deliverables to disk IS the delivery')
  })
})

describe('两轮协议单轮化与 question-form 文本化（D2 语义）', () => {
  it('计划后自检、同轮进生产的指令在场（core 与 orchestration 双侧）', () => {
    expect(CORE_OUT).toContain('self-check it against the user\'s stated requirements')
    expect(CORE_OUT).toContain('continue directly into production in the same turn')
    expect(ORCH_OUT).toContain('self-check the plan against the user\'s requirements')
    expect(ORCH_OUT).toContain('produce the deliverables in the same turn')
  })

  it('编号文本问答指令在场，无表单 UI 依赖', () => {
    expect(CORE_OUT).toContain('Ask plain numbered text questions only for essential unresolved input')
    expect(ORCH_OUT).toContain('Ask as plain numbered text with concise recommended answers')
    expect(ORCH_OUT).toContain('no form UI exists in this environment')
  })

  it('计划未完成/问题未答时不进生产的边界保留', () => {
    expect(CORE_OUT).toContain('Do not begin production while an essential question is unanswered')
    expect(ORCH_OUT).toContain(
      'Do not dispatch media generation or start production subagents while the plan is still unfinished',
    )
  })

  it('plan-only 边界保留（只给计划不建文件）', () => {
    expect(CORE_OUT).toContain('Return that plan as the final answer without creating files')
    // 原文 L127 句尾跨行（"...marker\nand no added webpage"），兜底替换后容忍换行
    expect(CORE_OUT).toMatch(/no continuation marker\s+and\s+no added webpage/)
  })
})

describe('保留段抽查（D6 保留判定 + 任务书三项，不被误伤）', () => {
  it('fallback 句语义存活（web/image 检索 + 缺口披露）', () => {
    expect(CORE_OUT).toContain('missing slots')
    expect(CORE_OUT).toContain('web/image search tools')
  })

  it('占位披露存活（design the placeholder and disclose it — never ship a gray box）', () => {
    expect(CORE_OUT).toContain('design the placeholder and')
    expect(CORE_OUT).toContain('never ship a gray box')
  })

  it('attribution 义务存活（Image attribution + credits.json sidecar）', () => {
    expect(CORE_OUT).toContain('**Image attribution:**')
    expect(CORE_OUT).toContain('assets/stock/credits.json')
  })

  it('素材优先级子块存活（Never generate a stand-in for a real referent）', () => {
    expect(CORE_OUT).toContain('Never generate a stand-in for a real')
  })

  it('读回禁令存活（Never read downloaded or generated images back）', () => {
    expect(CORE_OUT).toContain('Never read downloaded or generated images back')
  })

  it('成品质检禁令六条存活（orchestration L26-33 段落级亲读保留判定）', () => {
    expect(ORCH_OUT).toContain('Screen captures, rendering, render review, or frame extraction')
    expect(ORCH_OUT).toContain('Spawning acceptance Children or performing formal acceptance')
    expect(ORCH_OUT).toContain('Validating export results after exporting')
  })

  it('stock 库来源禁令存活（Wikipedia / 随机图服务禁令，D6② 保留子块）', () => {
    expect(CORE_OUT).toContain('Never take images from')
    expect(CORE_OUT).toContain('picsum.photos or loremflickr')
  })
})

describe('命中记录契约（供 doctor 消费）', () => {
  it('旧代适用语义段规则（legacy-only + cross-generation）在旧代 fixture 上命中 ≥ 1（锚失配当场暴露）', () => {
    const legacyApplicable = REWRITE_RULES.filter(
      (r) => r.locator === 'semantic-anchor' && r.generation !== 'current-only',
    )
    expect(legacyApplicable.length).toBeGreaterThan(0)
    for (const rule of legacyApplicable) {
      for (const asset of rule.targets) {
        const rec = recordFor(rule.id, asset)
        expect(rec, `${rule.id} × ${asset} 缺记录`).toHaveLength(1)
        expect(rec[0].hitCount, `${rule.id} × ${asset} 零命中（旧代锚失配）`).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('新代规则（current-only）在旧代 fixture 上零命中且逐条可见（预期形态，非漂移）', () => {
    const currentOnly = REWRITE_RULES.filter((r) => r.generation === 'current-only')
    expect(currentOnly.length).toBeGreaterThanOrEqual(9)
    for (const rule of currentOnly) {
      for (const asset of rule.targets) {
        const rec = recordFor(rule.id, asset)
        expect(rec, `${rule.id} × ${asset} 缺记录`).toHaveLength(1)
        expect(rec[0].hitCount, `${rule.id} × ${asset} 应在旧代资产上零命中`).toBe(0)
        expect(rec[0].generation).toBe('current-only')
        expect(rec[0].assetGeneration).toBe('legacy')
      }
    }
  })

  it('逐条记录携带代际字段（generation 自规则清单透传、assetGeneration 为本次应用的探测产物）', () => {
    for (const rule of REWRITE_RULES) {
      for (const rec of recordFor(rule.id)) {
        expect(rec.generation, `${rule.id} generation 字段`).toBe(rule.generation)
        expect(rec.assetGeneration, `${rule.id} assetGeneration 字段`).toBe('legacy')
      }
    }
  })

  it('regex 兜底规则记录在场：残余 marker 兜底确有捕获，R1 防御性规则零命中且可见', () => {
    const residual = recordFor('r3-residual-marker-phrase')
    expect(residual).toHaveLength(2)
    expect(residual.every((r) => r.hitCount >= 1)).toBe(true)
    const r1 = recordFor('r1-design-systems-cli-path')
    expect(r1).toHaveLength(2)
    expect(r1.every((r) => r.hitCount === 0)).toBe(true)
    expect(r1[0].summary).toContain('anchor not found')
  })

  it('每条记录含 doctor 所需元数据（ruleName/family/locator/fragility/summary）', () => {
    expect(records.length).toBeGreaterThan(0)
    for (const rec of records) {
      expect(rec.ruleName).toBeTruthy()
      expect(rec.summary).toBeTruthy()
      expect(['cli-path', 'ui-guidance', 'two-turn-protocol', 'question-form', 'media-missing']).toContain(rec.family)
      expect(['regex', 'semantic-anchor']).toContain(rec.locator)
      expect(['high', 'medium', 'low']).toContain(rec.fragility)
    }
  })

  it('规则清单五族齐备且 id 唯一', () => {
    const families = new Set(REWRITE_RULES.map((r) => r.family))
    expect([...families].sort()).toEqual(['cli-path', 'media-missing', 'question-form', 'two-turn-protocol', 'ui-guidance'])
    const ids = new Set(REWRITE_RULES.map((r) => r.id))
    expect(ids.size).toBe(REWRITE_RULES.length)
  })

  it('D6 ①-⑤ 九条处置规则的 fragility 全部登记', () => {
    const d6 = [
      'r5-core-standalone-image-delivery',
      'r5-core-stock-search-command',
      'r5-core-image-generation-gate',
      'r5-orch-anti-html-wrapper',
      'r5-orch-media-input-skill-section',
      'r5-core-media-production-step',
      'r5-core-video-motion-exception',
      'r5-orch-video-motion-authorization',
      'r5-orch-standalone-media-real-file',
    ]
    expect(d6).toHaveLength(9)
    for (const id of d6) {
      expect(['high', 'medium', 'low']).toContain(ruleById(id).fragility)
      expect(recordFor(id).every((r) => r.hitCount >= 1)).toBe(true)
    }
  })
})

describe('R1 CLI 路径化行为（D5 定义域，防御性规则）', () => {
  const designSystemsRoot = '/Applications/Open Design.app/Contents/Resources/design-systems'

  it('提供 designSystemsRoot 时命令被路径化（输出含路径、特征串清零）', () => {
    const sample =
      'Prefer "$OD_NODE_BIN" "$OD_BIN" tools design-systems read --id terracotta for palette data.'
    const result = applyRewrites(
      { 'core-system-prompt': sample, 'general-orchestration': '' },
      { designSystemsRoot },
    )
    expect(result.texts['core-system-prompt']).toContain(`${designSystemsRoot}/<system-name>/`)
    expect(result.texts['core-system-prompt']).toContain('DESIGN.md, tokens.css')
    expect(result.texts['core-system-prompt']).not.toContain('$OD_BIN')
    expect(result.texts['core-system-prompt']).not.toContain('tools design-systems')
    const rec = result.records.find((r) => r.ruleId === 'r1-design-systems-cli-path' && r.asset === 'core-system-prompt')
    expect(rec?.hitCount).toBe(1)
  })

  it('缺省 designSystemsRoot 时 no-op（残留交给组装层 RL3 断言兜底）', () => {
    const sample = '"$OD_NODE_BIN" "$OD_BIN" tools design-systems read --id terracotta'
    const result = applyRewrites({ 'core-system-prompt': sample, 'general-orchestration': '' })
    expect(result.texts['core-system-prompt']).toBe(sample)
    const rec = result.records.find((r) => r.ruleId === 'r1-design-systems-cli-path' && r.asset === 'core-system-prompt')
    expect(rec?.hitCount).toBe(0)
  })
})

describe('语义段锚编译器', () => {
  it('锚内空格容忍原文硬换行与缩进（md 散文跨行形态）', () => {
    const re = compileAnchor('State the limitation plainly and point at the Skills tab instead.')
    expect(re.test('they will go looking and find nothing. State\n  the limitation\nplainly and point at the Skills tab instead.')).toBe(true)
    expect(re.test('unrelated text')).toBe(false)
  })
})

describe('真机 2.x 措辞（real-od fixture）上的改写命中与报缺语义', () => {
  it('资产代际探测 = current，逐记录携带代际字段（记录自包含）', () => {
    expect(detectAssetGeneration(REAL_OD_INPUT)).toBe('current')
    expect(realOdOutput.records.length).toBeGreaterThan(0)
    for (const rec of realOdOutput.records) {
      expect(['cross-generation', 'legacy-only', 'current-only']).toContain(rec.generation)
      expect(rec.assetGeneration).toBe('current')
    }
  })

  it('RL3 特征串清零（2.x fixture 全文扫描）', () => {
    expect(REAL_ALL_OUT).not.toContain('$OD_BIN')
    expect(REAL_ALL_OUT).not.toContain('$OD_NODE_BIN')
    expect(REAL_ALL_OUT).not.toContain('$OD_WORKSPACE')
    expect(REAL_ALL_OUT).not.toMatch(/Integration\s+view/i)
    expect(REAL_ALL_OUT).not.toContain('Skills tab')
    expect(REAL_ALL_OUT).not.toContain('production-ready')
    expect(REAL_ALL_OUT).not.toContain('question-form')
    expect(REAL_ALL_OUT).not.toContain('od-next-media-inputs')
    expect(REAL_ALL_OUT).not.toContain('hidden structured blocks')
    expect(REAL_ALL_OUT).not.toContain('fall back to image generation')
    expect(REAL_ALL_OUT).not.toContain('the V2 machine contract specifies')
  })

  it('全部 current-only 规则逐条命中 ≥ 1（2.x 锚失配当场暴露）', () => {
    const currentOnly = REWRITE_RULES.filter((r) => r.generation === 'current-only')
    expect(currentOnly.length).toBeGreaterThanOrEqual(9)
    for (const rule of currentOnly) {
      for (const asset of rule.targets) {
        const rec = realRecordFor(rule.id, asset)
        expect(rec, `${rule.id} × ${asset} 缺记录`).toHaveLength(1)
        expect(rec[0].hitCount, `${rule.id} × ${asset} 零命中（2.x 锚失配）`).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('legacy-only 语义段规则在 2.x fixture 上零命中且逐条可见（预期形态，非漂移）', () => {
    const legacyOnly = REWRITE_RULES.filter((r) => r.generation === 'legacy-only' && r.locator === 'semantic-anchor')
    expect(legacyOnly.length).toBeGreaterThan(0)
    for (const rule of legacyOnly) {
      for (const asset of rule.targets) {
        const rec = realRecordFor(rule.id, asset)
        expect(rec, `${rule.id} × ${asset} 缺记录`).toHaveLength(1)
        expect(rec[0].hitCount, `${rule.id} × ${asset} 应在 2.x 资产上零命中`).toBe(0)
        expect(rec[0].assetGeneration).toBe('current')
      }
    }
  })

  it('cross-generation 规则在 2.x fixture 上命中 ≥ 1（R2 界面指引两代同形）', () => {
    for (const id of ['r2-integration-skills-tab', 'r2-skills-tab-pointer']) {
      const rec = realRecordFor(id, 'core-system-prompt')
      expect(rec).toHaveLength(1)
      expect(rec[0].hitCount).toBeGreaterThanOrEqual(1)
    }
  })

  it('D2 协议折叠语义在场（续轮折叠 + plan-only 边界 + 机器契约文本化，2.x 措辞）', () => {
    expect(REAL_CORE_OUT).toContain('no host continuation starts Build')
    expect(REAL_CORE_OUT).toContain('honor plan-only and no-write requests by answering with the plan alone')
    expect(REAL_CORE_OUT).toContain('no host parses hidden machine-contract blocks')
    expect(REAL_CORE_OUT).toContain('no host continuation arrives')
    expect(REAL_ORCH_OUT).toContain('No host continues the session in this environment')
    expect(REAL_ORCH_OUT).toContain('no host parses machine contract blocks in this environment')
    expect(REAL_ORCH_OUT).toContain('never emit machine-only structured blocks')
    expect(REAL_ORCH_OUT).toContain('stay in the planning prose')
    expect(REAL_ORCH_OUT).toContain('attach the Build Packages in the plan')
  })

  it('D6②b/④ 报缺语义在场（2.x 措辞；两段共用同一替换文本）', () => {
    expect(REAL_CORE_OUT).toContain('image generation is not available (design mode V1 has no media pipeline)')
    expect(REAL_CORE_OUT).toContain('design a disclosed placeholder instead of generating')
    expect(REAL_ORCH_OUT).toContain('### Media input')
    expect(REAL_ORCH_OUT).toContain('no media pipeline and no media-input Skill channel')
    expect(REAL_ORCH_OUT).not.toContain('### Media input Skill')
  })

  it('保留段不被误伤（2.x：stand-in 禁令、占位披露、质检禁令六条、交付默认句）', () => {
    expect(REAL_CORE_OUT).toContain('never generate a fake stand-in for a real referent')
    // 占位披露句在真机原文中硬换行（never ship\n  a gray box），按语义串容忍换行断言。
    expect(REAL_CORE_OUT).toMatch(/design the placeholder\s+—\s+never ship\s+a gray box/)
    expect(REAL_ORCH_OUT).toContain('Writing the primary HTML deliverable to disk IS the delivery')
    expect(REAL_ORCH_OUT).toContain('Screen captures, rendering, render review, or frame extraction')
    expect(REAL_ORCH_OUT).toContain('Spawning acceptance Children or performing formal acceptance')
    expect(REAL_ORCH_OUT).toContain('Validating export results after exporting')
  })

  it('D6 ①-⑤ 在 2.x 上的覆盖形态：②b④ 由 -2x 规则命中；①②a③⑤a-⑤d 段在 2.x 已消失（legacy-only 零命中预期）', () => {
    // 消失段清单逐条声明（真机对账 2026-11-09 逐段核实）：对应规则在 2.x 资产上零命中是预期形态。
    const vanished = [
      'r5-core-standalone-image-delivery',
      'r5-core-stock-search-command',
      'r5-core-image-generation-gate',
      'r5-orch-anti-html-wrapper',
      'r5-orch-media-input-skill-section',
      'r5-core-media-production-step',
      'r5-core-video-motion-exception',
      'r5-orch-video-motion-authorization',
      'r5-orch-standalone-media-real-file',
    ]
    expect(vanished).toHaveLength(9)
    for (const id of vanished) {
      expect(ruleById(id).generation, `${id} 应标 legacy-only`).toBe('legacy-only')
      expect(realRecordFor(id).every((rec) => rec.hitCount === 0), `${id} 在 2.x 应零命中`).toBe(true)
    }
    // 仍存在的两段由新代规则承接命中（D6②b 生成回退分句 + D6④ 媒体 Skill 段）。
    const d6Current = ['r5-core-image-generation-fallback-2x', 'r5-orch-media-input-skill-section-2x']
    for (const id of d6Current) {
      expect(ruleById(id).generation, `${id} 应标 current-only`).toBe('current-only')
      expect(realRecordFor(id).every((rec) => rec.hitCount >= 1), `${id} 在 2.x 应命中`).toBe(true)
    }
  })
})

describe('资产代际探测与规则代际适用性（detectAssetGeneration / ruleAppliesToGeneration）', () => {
  it('代际探测：旧代 fixture → legacy；real-od fixture → current；双缺或双标记同现 → unknown', () => {
    expect(detectAssetGeneration(INPUT)).toBe('legacy')
    expect(detectAssetGeneration(REAL_OD_INPUT)).toBe('current')
    expect(
      detectAssetGeneration({ 'core-system-prompt': 'neutral text', 'general-orchestration': 'more neutral text' }),
    ).toBe('unknown')
    expect(
      detectAssetGeneration({
        'core-system-prompt': 'mentions the production-ready marker line',
        'general-orchestration': 'mentions the V2 machine contract blocks',
      }),
    ).toBe('unknown')
  })

  it('代际适用性：代际外规则不适用（零命中为预期形态）；unknown 保守按适用处理', () => {
    expect(ruleAppliesToGeneration('legacy-only', 'legacy')).toBe(true)
    expect(ruleAppliesToGeneration('legacy-only', 'current')).toBe(false)
    expect(ruleAppliesToGeneration('current-only', 'current')).toBe(true)
    expect(ruleAppliesToGeneration('current-only', 'legacy')).toBe(false)
    expect(ruleAppliesToGeneration('cross-generation', 'current')).toBe(true)
    expect(ruleAppliesToGeneration('cross-generation', 'legacy')).toBe(true)
    expect(ruleAppliesToGeneration('legacy-only', 'unknown')).toBe(true)
    expect(ruleAppliesToGeneration('current-only', 'unknown')).toBe(true)
    expect(ruleAppliesToGeneration('cross-generation', 'unknown')).toBe(true)
  })

  it('两代 fixture 的代际探测互异（双代际对账基座有效性）', () => {
    expect(detectAssetGeneration(INPUT)).not.toBe(detectAssetGeneration(REAL_OD_INPUT))
  })
})
