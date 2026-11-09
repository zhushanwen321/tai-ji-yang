/**
 * 降级改写器 V1 规则集（五族）。
 *
 * 输入 = OD 资产原文（core-system-prompt / general-orchestration 注入文本），输出 = 改写后文本
 * 与逐条命中记录。规则族与逐段处置清单来自设计决策 D2/D5/D6（权威依据见设计文档 §3.3）：
 *
 * - R1 cli-path：od CLI 设计系统读取命令 → 本地绝对路径直读指引（D5 定义域，仅此族有本地等价物）。
 *   注入文本（core/orchestration）V1 基线零命中（已对 OD 0.25.1 原文 grep 核实），为防御性规则。
 * - R2 ui-guidance：OD 界面指引（Integration view Skills tab 等）→ DSH 等价说法。
 * - R3 two-turn-protocol：两轮协议（production-ready marker + 宿主续轮停轮）→ 计划后自检、
 *   同轮直接进生产（D2 协议折叠）。
 * - R4 question-form：OD 表单标记协议 → 文本编号问答指令。
 * - R5 media-missing：与 V1「无图片/视频/音频成片能力」相反的段落逐段报缺化（D6 ①-⑤）。
 *
 * 每条规则声明定位方式（regex / semantic-anchor）与脆弱度（OD 升级后失配容错度，供 doctor 报告；
 * 失配 ≠ 静默：apply 对每条规则产出零命中记录，doctor 据此暴露漂移）。
 *
 * 语义段锚编译约定：锚文本一律按原文摘录后压成单空格书写（OD 资产是硬换行散文，句子跨行），
 * compileAnchor 把锚内空格编译为 \s+，容忍换行与缩进差异。
 */

export type RewriteAssetId = 'core-system-prompt' | 'general-orchestration'

export type RewriteRuleFamily =
  | 'cli-path'
  | 'ui-guidance'
  | 'two-turn-protocol'
  | 'question-form'
  | 'media-missing'

export type RewriteLocatorKind = 'regex' | 'semantic-anchor'

/** 脆弱度：OD 升级后锚失配的容错度（high = 最可能失配），doctor 按此排序报告 */
export type RewriteFragility = 'high' | 'medium' | 'low'

export interface RewriteContext {
  /** 资产根下 design-systems/ 的绝对路径（R1 路径化目标；缺省时 R1 no-op，残留由组装层 RL3 断言兜底） */
  designSystemsRoot?: string
}

export interface RewriteRule {
  id: string
  name: string
  family: RewriteRuleFamily
  locator: RewriteLocatorKind
  fragility: RewriteFragility
  description: string
  targets: readonly RewriteAssetId[]
  /** regex 规则 = 正则源码；semantic-anchor 规则 = 原文锚片段（单空格书写） */
  anchor: string
  replacement: string | ((match: string, context: RewriteContext) => string)
}

const REGEX_META = /[.*+?^${}()|[\]\\]/g

/** 语义段锚 → 全局正则：转义元字符后把空格编译为 \s+（容忍 md 硬换行与缩进） */
export function compileAnchor(anchor: string, flags = 'g'): RegExp {
  const escaped = anchor.replace(REGEX_META, '\\$&')
  return new RegExp(escaped.replace(/ /g, '\\s+'), flags)
}

const DESIGN_SYSTEMS_CLI_REGEX_SOURCE =
  '(?:["\']?\\$OD_NODE_BIN["\']?\\s+)?(?:["\']?\\$OD_BIN["\']?\\s+)?tools\\s+design-systems\\b[^\\n`]*'

/**
 * 规则清单。数组序 = 应用序：全部语义段规则（按族 R1→R5）在前，残余特征串 regex 兜底
 * 收尾在最后——兜底若先于语义段规则跑，会把后续段锚锚域内的特征串改写掉、使段锚失配
 * （顺序即契约，勿调）。段落锚失配（OD 升级改写措辞）时兜底规则仍抓走特征串，残余语义
 * 由 doctor 的零命中记录暴露。
 */
export const REWRITE_RULES: readonly RewriteRule[] = [
  // —— R1：CLI 引用路径化（D5 定义域 = 设计系统读取命令）——
  {
    id: 'r1-design-systems-cli-path',
    name: '设计系统读取命令路径化',
    family: 'cli-path',
    locator: 'regex',
    fragility: 'medium',
    description:
      'od CLI 设计系统读取命令替换为 design-systems/ 目录绝对路径直读指引（D5 定义域；'
      + '注入文本 V1 基线零命中——防御性规则，OD 升级后 core/orchestration 出现该命令形态时生效）',
    targets: ['core-system-prompt', 'general-orchestration'],
    anchor: DESIGN_SYSTEMS_CLI_REGEX_SOURCE,
    replacement: (match, context) => {
      if (!context.designSystemsRoot) return match
      return (
        'Read the design system files directly with your file tools under '
        + `${context.designSystemsRoot}/<system-name>/ (DESIGN.md, tokens.css, and sibling `
        + 'files) instead of running any CLI command.'
      )
    },
  },

  // —— R2：OD 界面指引替换 ——
  {
    id: 'r2-integration-skills-tab',
    name: 'Integration view Skills tab 指引替换',
    family: 'ui-guidance',
    locator: 'semantic-anchor',
    fragility: 'medium',
    description: '「粘贴进 Integration 视图 Skills 标签」改为 DSH 等价说法（本环境无 OD 应用界面，skill 提案按普通项目文件交给用户）',
    targets: ['core-system-prompt'],
    anchor:
      "tell the user to paste it in through the Integration view's Skills tab, "
      + 'which is where Skills are edited in the app.',
    replacement:
      'tell the user to import the skill file into their own session setup by hand '
      + '(this environment has no Open Design app surface for editing skills; treat skill '
      + 'files as ordinary project files the user manages)',
  },
  {
    id: 'r2-skills-tab-pointer',
    name: 'Skills tab 指向句替换',
    family: 'ui-guidance',
    locator: 'semantic-anchor',
    fragility: 'medium',
    description: '「把限制指向 Skills 标签」改为普通项目文件说法（同上，DSH 等价指引）',
    targets: ['core-system-prompt'],
    anchor: 'State the limitation plainly and point at the Skills tab instead.',
    replacement:
      'State the limitation plainly and offer to write the needed configuration as an '
      + 'ordinary project file instead.',
  },

  // —— R3：两轮协议单轮化（D2 协议折叠：计划后自检、同轮进生产）——
  {
    id: 'r3-core-plan-then-stop',
    name: 'core 计划轮停轮段单轮化',
    family: 'two-turn-protocol',
    locator: 'semantic-anchor',
    fragility: 'high',
    description: '「输出 marker 后停轮、等 OD 开启下一轮」改为「计划后自检、同轮直接进生产」（R3 协议段，OD 升级最可能重写）',
    targets: ['core-system-prompt'],
    anchor:
      'For an authorized new design deliverable, output a readable plan and the host-supplied '
      + 'production-ready marker, then stop. Execute production only in the next turn '
      + 'started by Open Design. "Just do it", "直接完成", and "不用问我" authorize '
      + 'production without a confirmation question; they do not skip the planning-turn '
      + 'boundary for a new deliverable. Honor plan-only and no-write requests by omitting the '
      + 'marker. Use actual native tools and subagents where useful and available.',
    replacement:
      'For an authorized new design deliverable, output a readable plan, self-check it '
      + "against the user's stated requirements (deliverables, constraints, assumptions), "
      + 'then continue directly into production in the same turn. No host continuation '
      + 'marker exists in this environment; never wait for or emit one. "Just do it", '
      + '"直接完成", and "不用问我" authorize production without a confirmation question. '
      + 'Honor plan-only and no-write requests by answering with the plan alone. Use actual '
      + 'native tools and subagents where useful and available.',
  },
  {
    id: 'r3-core-plan-only-answer',
    name: 'core 计划即答案句单轮化',
    family: 'two-turn-protocol',
    locator: 'semantic-anchor',
    fragility: 'high',
    description: 'plan-only 句去除 marker 语义，保留「只给计划不建文件」边界',
    targets: ['core-system-prompt'],
    anchor:
      'Return that plan and stop without creating files or emitting a production-ready '
      + 'marker; an additional "only" or "do not build" is not required.',
    replacement:
      'Return that plan as the final answer without creating files; an additional "only" '
      + 'or "do not build" is not required.',
  },
  {
    id: 'r3-core-output-boundary-marker',
    name: 'core Output boundary marker 条目单轮化',
    family: 'two-turn-protocol',
    locator: 'semantic-anchor',
    fragility: 'high',
    description: '「marker 是计划轮末控制行、OD 记录状态并开启下一轮」改为「本环境无 marker，自检后同轮进生产」，保留不虚称交付语义',
    targets: ['core-system-prompt'],
    anchor:
      'Only a ready plan for authorized production ends with the current keyed '
      + 'production-ready marker supplied by Open Design. It is a control line, '
      + 'separate from prose, and must be the last non-empty line of the planning turn. '
      + '- Open Design records task state and starts the next turn. Do not claim that '
      + 'an ended turn or emitted marker proves that deliverables exist.',
    replacement:
      'There is no keyed continuation marker in this environment: after an authorized '
      + 'plan, self-check it and continue into production in the same turn. Never '
      + 'fabricate, quote, or wait for a continuation marker. Do not claim that a plan '
      + 'or a self-check proves that deliverables exist.',
  },
  {
    id: 'r3-core-route-stage-limits',
    name: 'core 计划/生产轮界定单轮化',
    family: 'two-turn-protocol',
    locator: 'semantic-anchor',
    fragility: 'high',
    description: 'planning turn / production turn 轮次界定改为同轮先后段语义',
    targets: ['core-system-prompt'],
    anchor:
      '- You decide whether the request needs a separate plan or a bounded direct edit. '
      + '- A planning turn contains an actionable plan and, only when production is '
      + 'authorized, the current production-ready marker. It does not build outputs. '
      + '- A production turn executes the preceding plan and does not emit another marker. '
      + '- A direct edit completes within the current turn without automatic continuation.',
    replacement:
      '- You decide whether the request needs a planning section or a bounded direct edit. '
      + '- The planning section contains an actionable plan and, when production is '
      + "authorized, a self-check against the user's requirements; after it, production "
      + 'follows in the same turn without a break. '
      + '- Production executes the plan written above it. '
      + '- A direct edit completes within the current turn.',
  },
  {
    id: 'r3-orch-step6-marker',
    name: 'orchestration 计划第 6 步 marker 输出段单轮化',
    family: 'two-turn-protocol',
    locator: 'semantic-anchor',
    fragility: 'high',
    description: '「第 6 步输出 <od-production-ready> 行并立即结束轮次」改为「不等宿主信号、自检后同轮进生产」',
    targets: ['general-orchestration'],
    anchor:
      '6. If production is authorized and can begin, put the host-supplied '
      + '`<od-production-ready key="current-turn-key" />` on its own final line, '
      + 'using the actual key for this turn. Never put it in a code fence or quote. '
      + 'End the turn immediately after it. Open Design automatically starts production '
      + 'after this turn succeeds; the user does not resubmit or confirm the plan.',
    replacement:
      "6. If production is authorized and can begin, do not wait for any host signal: "
      + "self-check the plan against the user's requirements, then continue directly "
      + 'into production in the same turn. No continuation marker exists in this '
      + 'environment; never emit or wait for one.',
  },
  {
    id: 'r3-orch-planning-turn-bars',
    name: 'orchestration 计划轮禁产段单轮化',
    family: 'two-turn-protocol',
    locator: 'semantic-anchor',
    fragility: 'high',
    description: '计划轮禁建交付物/禁追加 marker 改为「计划过自检后同轮产出」；保留「计划未完或问题未答时不派发媒体生成/子代理」限制（媒体禁令与报缺同向，设计保留判定）',
    targets: ['general-orchestration'],
    anchor:
      'Do not create the deliverables, dispatch media generation, or start production '
      + 'subagents during this planning turn. Reading bounded input references and '
      + 'preparing the plan are allowed. Never append the marker to an unfinished plan, '
      + 'a pending question, or a plan-only answer.',
    replacement:
      'Do not dispatch media generation or start production subagents while the plan is '
      + 'still unfinished or a pending question is unanswered; reading bounded input '
      + 'references and preparing the plan are allowed. Once the plan passes the '
      + 'self-check, produce the deliverables in the same turn.',
  },
  {
    id: 'r3-orch-no-marker-after-edit',
    name: 'orchestration 直改后 marker 禁令单轮化',
    family: 'two-turn-protocol',
    locator: 'semantic-anchor',
    fragility: 'high',
    description: '「直改完成后再输出 marker」禁令改为「本环境无 marker」陈述',
    targets: ['general-orchestration'],
    anchor:
      'Do not emit a production-ready marker after the edit is already done. '
      + 'A non-design message receives an ordinary answer.',
    replacement:
      'The edit itself is the delivery in this environment; do not add any continuation '
      + 'marker (none exists here). A non-design message receives an ordinary answer.',
  },
  {
    id: 'r3-orch-no-marker-in-production',
    name: 'orchestration 生产轮 marker 禁令单轮化',
    family: 'two-turn-protocol',
    locator: 'semantic-anchor',
    fragility: 'high',
    description: '「生产轮禁 marker、无协议修复轮」改为「本环境无 marker/协议修复轮/机器状态块」陈述',
    targets: ['general-orchestration'],
    anchor:
      'Do not emit a production-ready marker in production. There is no protocol-repair '
      + 'turn and no machine status to fill out at the end.',
    replacement:
      'There is no continuation marker, protocol-repair turn, or machine status in this '
      + 'environment; the delivery statement at the end is ordinary prose.',
  },
  // —— R4：question-form 文本化 ——
  {
    id: 'r4-core-question-form-bullet',
    name: 'core question-form 条目文本化',
    family: 'question-form',
    locator: 'semantic-anchor',
    fragility: 'medium',
    description: '表单标记协议改为纯文本编号问答；「未答问题排除续轮」改为「未答不进生产」',
    targets: ['core-system-prompt'],
    anchor:
      'Ask a question-form only for essential unresolved input; never require the user '
      + 'to confirm an executable plan. An unanswered question excludes continuation.',
    replacement:
      'Ask plain numbered text questions only for essential unresolved input; never '
      + 'require the user to confirm an executable plan. Do not begin production while '
      + 'an essential question is unanswered.',
  },
  {
    id: 'r4-orch-question-form-step3',
    name: 'orchestration 计划第 3 步 question-form 文本化',
    family: 'question-form',
    locator: 'semantic-anchor',
    fragility: 'medium',
    description: '「用 question-form 给推荐答案并结束本轮」改为「纯文本编号问答、用户在对话中回复」（同句 marker 提及一并消除）',
    targets: ['general-orchestration'],
    anchor:
      'Use a question-form with concise recommended answers, then end this turn '
      + 'without a production-ready marker.',
    replacement:
      'Ask as plain numbered text with concise recommended answers (no form UI exists '
      + 'in this environment); the user replies in the conversation.',
  },
  {
    id: 'r4-orch-question-form-production',
    name: 'orchestration 生产轮 question-form 文本化',
    family: 'question-form',
    locator: 'semantic-anchor',
    fragility: 'medium',
    description: '生产轮阻塞时「question-form 提问」改为「文本编号提问」',
    targets: ['general-orchestration'],
    anchor:
      'If a newly discovered essential issue blocks progress, explain it or ask a '
      + 'question-form; never claim that missing output was delivered.',
    replacement:
      'If a newly discovered essential issue blocks progress, explain it or ask plain '
      + 'numbered text questions; never claim that missing output was delivered.',
  },
  // —— R5：媒体段报缺化（D6 ①-⑤ 逐段清单）——
  {
    id: 'r5-core-standalone-image-delivery',
    name: 'core 独立图片交付段报缺化',
    family: 'media-missing',
    locator: 'semantic-anchor',
    fragility: 'medium',
    description: 'D6①：「独立图片请求交付真实图片文件、禁止 HTML 包装」改为 V1 报缺语义（生成不可用、web/image 检索取图仍可行、HTML 源码替代交付）',
    targets: ['core-system-prompt'],
    anchor:
      'Resolve applicability before precedence. A prototype project may host an image '
      + "request without changing the project's type or asking for a scenario switch. "
      + 'For standalone image generation, deliver the actual image file. Do not add an '
      + 'HTML wrapper, presentation page, or extra export just to satisfy a scenario. '
      + 'When the user asks to insert an image into a page or deck, generate or acquire '
      + 'the image and integrate it into that requested artifact; the image alone is not '
      + 'the full delivery.',
    replacement:
      'Resolve applicability before precedence. A prototype project may host an image '
      + "request without changing the project's type or asking for a scenario switch. "
      + 'Design mode V1 has no image, video, or audio production pipeline: for a '
      + 'standalone image-generation request, state this limitation truthfully and offer '
      + 'an HTML-source deliverable instead (for example an HTML poster or page). '
      + 'Fetching real images with your available web/image search tools remains '
      + 'possible. When the user asks to insert an image into a page or deck, fetch it '
      + 'with those tools and integrate it into the requested artifact; if no fetch '
      + 'route works, use a disclosed placeholder.',
  },
  {
    id: 'r5-core-stock-search-command',
    name: 'core stock-search 命令段报缺化',
    family: 'media-missing',
    locator: 'semantic-anchor',
    fragility: 'low',
    description: 'D6②a：「media stock-search 命令取图（含 $OD_BIN）」改为 web/image 检索工具取图 + 缺口披露；fallback 与「不反复重试」语义保留（D6② 保留子项随段重组，od-next-media-inputs 引用随 D6④ 移除）',
    targets: ['core-system-prompt'],
    anchor:
      'Fetch every searched stock slot in one `"$OD_NODE_BIN" "$OD_BIN" media '
      + "stock-search --slots '<json>'` call instead of writing download scripts. "
      + 'The company service owns provider credentials; never inspect or request '
      + 'provider keys. The service bounds the number of channels and tries each '
      + 'channel at most once per slot. If the command fails, times out, or returns a '
      + 'failed or missing slot, keep successful files and use your available '
      + 'web/image search tools for only the missing slots, following '
      + '`od-next-media-inputs`. Do not repeatedly call the failing stock tool.',
    replacement:
      'Fetch the images yourself with your available web/image search tools instead of '
      + 'writing download scripts; design mode V1 has no managed stock-search service '
      + 'and no media pipeline. Never inspect or request provider keys. If a search '
      + 'route fails, times out, or returns nothing usable for a slot, keep the '
      + 'successful files and search again with your available web/image search tools '
      + 'for only the missing slots, and disclose what is still missing. Do not '
      + 'repeatedly retry a failing source.',
  },
  {
    id: 'r5-core-image-generation-gate',
    name: 'core 图片生成门控报缺化',
    family: 'media-missing',
    locator: 'semantic-anchor',
    fragility: 'medium',
    description: 'D6②b：「仅在用户明确要求时考虑图片生成」生成语义改为 V1 报缺语义（不生成、如实报缺、HTML 源码替代；web 检索取真图路径保留）',
    targets: ['core-system-prompt'],
    anchor:
      'Only consider image generation when the user explicitly asks to generate '
      + 'images. Such a request permits you to decide whether generation fits the '
      + 'task; it does not require a generation call. A need for imagery, a style '
      + 'preference, a missing stock result, or a search timeout does not authorize '
      + 'generation. Honor an explicit request for real photos and the factual '
      + 'referent boundary above.',
    replacement:
      'Image generation is not available in this environment: never generate images, '
      + 'and for an explicit image-generation request state this limitation truthfully '
      + 'and offer an HTML-source deliverable instead. A need for imagery, a style '
      + 'preference, a missing stock result, or a search timeout does not change this. '
      + 'Honor an explicit request for real photos by fetching real images with your '
      + 'available web/image search tools, and keep the factual referent boundary above.',
  },
  {
    id: 'r5-orch-anti-html-wrapper',
    name: 'orchestration 反 HTML 包装句报缺化',
    family: 'media-missing',
    locator: 'semantic-anchor',
    fragility: 'medium',
    description: 'D6③：「独立媒体请求禁止 HTML 包装」改为 V1 报缺语义（无媒体管线、如实报缺、HTML 源码替代交付）',
    targets: ['general-orchestration'],
    anchor:
      'Do not add an HTML wrapper, presentation page, or extra export for an independent '
      + 'image, video, audio, or document request. Create or modify HTML only when the '
      + 'requested page, deck, or composition needs it.',
    replacement:
      'Design mode V1 has no image, video, or audio production pipeline: for a '
      + 'standalone image, video, or audio request, state this limitation truthfully '
      + 'and offer an HTML-source deliverable instead of a media file. Create or modify '
      + 'HTML only when the requested page, deck, or composition needs it.',
  },
  {
    id: 'r5-orch-media-input-skill-section',
    name: 'orchestration Media input Skill 段整段报缺化',
    family: 'media-missing',
    locator: 'semantic-anchor',
    fragility: 'medium',
    description: 'D6④：整段报缺化（skill show od-next-media-inputs 命令含 $OD_BIN + Skill 加载通道 V1 不存在）；web/image 取图与 attribution 义务保留',
    targets: ['general-orchestration'],
    anchor:
      '### Media input Skill '
      + 'Before the first media action in a stage that permits media work — '
      + 'searching, fetching, downloading, generating, localizing, or processing an '
      + 'image or other media — load the `od-next-media-inputs` Skill unless its '
      + 'complete, still-valid body is already in context. Read it through the supplied '
      + 'Open Design CLI wrapper; on POSIX shells: '
      + '```sh '
      + '"$OD_NODE_BIN" "$OD_BIN" skill show od-next-media-inputs --json --workspace '
      + '"$OD_WORKSPACE_ID" --workspace-member "$OD_WORKSPACE_MEMBER_ID" '
      + '``` '
      + 'Use the host-documented wrapper syntax on other shells and pass the same '
      + 'run-pinned Workspace/member pair. Both values are empty for unbound local '
      + 'runs. Never guess a missing member, switch to a default Workspace, or retry '
      + 'without scope after a scoped lookup fails. Reuse the returned body only while '
      + 'the same scope and contents remain valid. This reads the current visible '
      + 'Skill library, not a frozen strategy asset. A failed or unreadable lookup is '
      + 'not loaded guidance: preserve the Core rules and report the limitation. '
      + 'Tasks without media work do not load this Skill. The Skill governs '
      + 'permitted media work only; it cannot authorize dispatching deliverables in a '
      + 'planning stage or adding unrequested work after delivery.',
    replacement:
      '### Media input '
      + '\n\n'
      + 'Design mode V1 has no media pipeline and no media-input Skill channel: '
      + 'generating, rendering, or processing image, video, or audio files through OD '
      + 'tooling is not available. For media requests, state the limitation truthfully '
      + 'and offer an HTML-source deliverable instead. Fetching real images with your '
      + 'available web/image search tools remains allowed; keep attribution records '
      + 'for images you fetch.',
  },
  {
    id: 'r5-core-media-production-step',
    name: 'core 媒体 production-step 句报缺化',
    family: 'media-missing',
    locator: 'semantic-anchor',
    fragility: 'medium',
    description: 'D6⑤a：「Source code alone is not rendered media」与 motion-design V1 交付 HTML 源码相反，反转为「源码即交付物」',
    targets: ['core-system-prompt'],
    anchor:
      '- Generation, waiting for media jobs, rendering a requested final-cut file, and '
      + 'registering a live artifact are production steps until the actual requested '
      + 'output exists. Source code alone is not rendered media.',
    replacement:
      '- Media rendering (final-cut video, audio, or image files) and live-artifact '
      + 'registration are not available in this environment: deliver the HTML-source '
      + 'form and state the limitation. In design mode V1, source code is the '
      + 'deliverable for motion and media-adjacent work.',
  },
  {
    id: 'r5-core-video-motion-exception',
    name: 'core video-motion exception 段报缺化',
    family: 'media-missing',
    locator: 'semantic-anchor',
    fragility: 'medium',
    description: 'D6⑤b：「video-motion 成片的一次性 MP4 评审例外」前提（rendered MP4）在 V1 成片报缺下不成立，改为 timeline HTML/CSS/JS 源码交付',
    targets: ['core-system-prompt'],
    anchor:
      'Video-motion exception: only while producing an actual video-motion film requested '
      + 'by the user, follow the motion guidance for one bounded review of the source and '
      + 'rendered MP4 (clock, exact captions/factual invariants, audio, and at most three '
      + 'representative frames), with at most one targeted repair and re-render. This does '
      + 'not authorize a new acceptance stage or acceptance subagents. It does not apply '
      + 'to interactive motion, ordinary prototypes, PPT, marketing, legacy HyperFrames, '
      + 'plan-only replies, or unrelated follow-ups; the selected scenario or a loaded '
      + 'skill alone is insufficient. No Plan Contract or Runtime State is required.',
    replacement:
      'Video-motion exception: design mode V1 cannot render an actual video-motion film '
      + '(no media pipeline), so no rendered-MP4 review applies — deliver the motion '
      + 'design as timeline-driven HTML/CSS/JS source and state the limitation. The '
      + 'generation-time quality discipline still governs the source you write.',
  },
  {
    id: 'r5-orch-video-motion-authorization',
    name: 'orchestration video-motion 例外授权句报缺化',
    family: 'media-missing',
    locator: 'semantic-anchor',
    fragility: 'medium',
    description: 'D6⑤c：「core 显式授权 video-motion 生产例外」改为「该例外在本环境不适用」',
    targets: ['general-orchestration'],
    anchor:
      'The Core explicitly authorizes '
      + 'the bounded video-motion production exception; all other tasks keep this default.',
    replacement:
      "The Core's bounded video-motion production exception does not apply in this "
      + 'environment (no media pipeline); all tasks keep the ship-on-write default '
      + 'with HTML-source deliverables.',
  },
  {
    id: 'r5-orch-standalone-media-real-file',
    name: 'orchestration 独立媒体真实文件分句报缺化',
    family: 'media-missing',
    locator: 'semantic-anchor',
    fragility: 'medium',
    description: 'D6⑤d：「独立媒体交付真实媒体文件」改为「独立媒体成片不可产，报缺并建议 HTML 源码替代」',
    targets: ['general-orchestration'],
    anchor:
      'Writing the requested deliverables to disk IS the delivery. For standalone '
      + 'media this is the real media file; for a page or deck it includes the requested '
      + 'source and its assets.',
    replacement:
      'Writing the requested deliverables to disk IS the delivery. For a page or deck '
      + 'this includes the requested source and its assets; standalone media files '
      + 'cannot be produced in this environment — state the limitation and offer an '
      + 'HTML-source deliverable instead.',
  },

  // —— 残余特征串兜底（必须收尾：语义段规则全部跑完后才兜底，防止兜底改写污染后续段锚的锚域）——
  {
    id: 'r3-residual-marker-phrase',
    name: 'production-ready 字样残余兜底',
    family: 'two-turn-protocol',
    locator: 'regex',
    fragility: 'low',
    description: '残余「production-ready marker」字样兜底替换为「continuation marker」（段落锚失配时的特征串兜底；命中说明上游段锚漂移，doctor 据此暴露）',
    targets: ['core-system-prompt', 'general-orchestration'],
    anchor: 'production-ready marker',
    replacement: 'continuation marker',
  },
  {
    id: 'r4-residual-question-form-term',
    name: 'question-form 术语残余兜底',
    family: 'question-form',
    locator: 'regex',
    fragility: 'low',
    description: '残余「question-form」术语兜底替换为「numbered text question」（特征串兜底；命中说明上游段锚漂移）',
    targets: ['core-system-prompt', 'general-orchestration'],
    anchor: 'question-form',
    replacement: 'numbered text question',
  },
]

export const REWRITE_ASSET_IDS: readonly RewriteAssetId[] = ['core-system-prompt', 'general-orchestration']
