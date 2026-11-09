const REGEX_META = /[.*+?^${}()|[\]\\]/g;
function compileAnchor(anchor, flags = "g") {
  const escaped = anchor.replace(REGEX_META, "\\$&");
  return new RegExp(escaped.replace(/ /g, "\\s+"), flags);
}
const CURRENT_GENERATION_MARKER = "V2 machine contract";
const LEGACY_GENERATION_MARKER = "production-ready marker";
function detectAssetGeneration(texts) {
  const combined = texts["core-system-prompt"] + "\n" + texts["general-orchestration"];
  const hasCurrent = combined.includes(CURRENT_GENERATION_MARKER);
  const hasLegacy = combined.includes(LEGACY_GENERATION_MARKER);
  if (hasCurrent === hasLegacy) return "unknown";
  return hasCurrent ? "current" : "legacy";
}
function ruleAppliesToGeneration(ruleGeneration, assetGeneration) {
  if (assetGeneration === "unknown") return true;
  if (ruleGeneration === "cross-generation") return true;
  return assetGeneration === "current" ? ruleGeneration === "current-only" : ruleGeneration === "legacy-only";
}
const DESIGN_SYSTEMS_CLI_REGEX_SOURCE = `(?:["']?\\$OD_NODE_BIN["']?\\s+)?(?:["']?\\$OD_BIN["']?\\s+)?tools\\s+design-systems\\b[^\\n\`]*`;
const MEDIA_INPUT_MISSING_REPLACEMENT = "### Media input \n\nDesign mode V1 has no media pipeline and no media-input Skill channel: generating, rendering, or processing image, video, or audio files through OD tooling is not available. For media requests, state the limitation truthfully and offer an HTML-source deliverable instead. Fetching real images with your available web/image search tools remains allowed; keep attribution records for images you fetch.";
const REWRITE_RULES = [
  // —— R1：CLI 引用路径化（D5 定义域 = 设计系统读取命令）——
  {
    id: "r1-design-systems-cli-path",
    name: "设计系统读取命令路径化",
    family: "cli-path",
    locator: "regex",
    fragility: "medium",
    generation: "cross-generation",
    description: "od CLI 设计系统读取命令替换为 design-systems/ 目录绝对路径直读指引（D5 定义域；注入文本两代基线零命中——防御性规则，任一代资产出现该命令形态时生效）",
    targets: ["core-system-prompt", "general-orchestration"],
    anchor: DESIGN_SYSTEMS_CLI_REGEX_SOURCE,
    replacement: (match, context) => {
      if (!context.designSystemsRoot) return match;
      return `Read the design system files directly with your file tools under ${context.designSystemsRoot}/<system-name>/ (DESIGN.md, tokens.css, and sibling files) instead of running any CLI command.`;
    }
  },
  // —— R2：OD 界面指引替换（锚在两代资产中逐字同形，cross-generation）——
  {
    id: "r2-integration-skills-tab",
    name: "Integration view Skills tab 指引替换",
    family: "ui-guidance",
    locator: "semantic-anchor",
    fragility: "medium",
    generation: "cross-generation",
    description: "「粘贴进 Integration 视图 Skills 标签」改为 DSH 等价说法（本环境无 OD 应用界面，skill 提案按普通项目文件交给用户）",
    targets: ["core-system-prompt"],
    anchor: "tell the user to paste it in through the Integration view's Skills tab, which is where Skills are edited in the app.",
    replacement: "tell the user to import the skill file into their own session setup by hand (this environment has no Open Design app surface for editing skills; treat skill files as ordinary project files the user manages)"
  },
  {
    id: "r2-skills-tab-pointer",
    name: "Skills tab 指向句替换",
    family: "ui-guidance",
    locator: "semantic-anchor",
    fragility: "medium",
    generation: "cross-generation",
    description: "「把限制指向 Skills 标签」改为普通项目文件说法（同上，DSH 等价指引）",
    targets: ["core-system-prompt"],
    anchor: "State the limitation plainly and point at the Skills tab instead.",
    replacement: "State the limitation plainly and offer to write the needed configuration as an ordinary project file instead."
  },
  // —— R3：两轮协议单轮化（D2 协议折叠：计划后自检、同轮进生产）——
  // 旧代（0.25.x）：production-ready marker + planning/production turn 措辞。
  {
    id: "r3-core-plan-then-stop",
    name: "core 计划轮停轮段单轮化",
    family: "two-turn-protocol",
    locator: "semantic-anchor",
    fragility: "high",
    generation: "legacy-only",
    description: "仅旧代生效（真机 2.0.4 资产已整段删除该措辞，2026-11-09 真机对账核实；2.x 上零命中是预期形态，语义由 r3-core-planning-continuation-2x / r3-core-production-continuation-2x 承接）。「输出 marker 后停轮、等 OD 开启下一轮」改为「计划后自检、同轮直接进生产」（R3 协议段，OD 升级最可能重写）",
    targets: ["core-system-prompt"],
    anchor: 'For an authorized new design deliverable, output a readable plan and the host-supplied production-ready marker, then stop. Execute production only in the next turn started by Open Design. "Just do it", "直接完成", and "不用问我" authorize production without a confirmation question; they do not skip the planning-turn boundary for a new deliverable. Honor plan-only and no-write requests by omitting the marker. Use actual native tools and subagents where useful and available.',
    replacement: `For an authorized new design deliverable, output a readable plan, self-check it against the user's stated requirements (deliverables, constraints, assumptions), then continue directly into production in the same turn. No host continuation marker exists in this environment; never wait for or emit one. "Just do it", "直接完成", and "不用问我" authorize production without a confirmation question. Honor plan-only and no-write requests by answering with the plan alone. Use actual native tools and subagents where useful and available.`
  },
  {
    id: "r3-core-plan-only-answer",
    name: "core 计划即答案句单轮化",
    family: "two-turn-protocol",
    locator: "semantic-anchor",
    fragility: "high",
    generation: "legacy-only",
    description: "仅旧代生效（真机 2.0.4 资产已删除 plan-only 用户请求边界句，2026-11-09 真机对账核实；该语义由 r3-core-planning-continuation-2x 的替换文本承接）。plan-only 句去除 marker 语义，保留「只给计划不建文件」边界",
    targets: ["core-system-prompt"],
    anchor: 'Return that plan and stop without creating files or emitting a production-ready marker; an additional "only" or "do not build" is not required.',
    replacement: 'Return that plan as the final answer without creating files; an additional "only" or "do not build" is not required.'
  },
  {
    id: "r3-core-output-boundary-marker",
    name: "core Output boundary marker 条目单轮化",
    family: "two-turn-protocol",
    locator: "semantic-anchor",
    fragility: "high",
    generation: "legacy-only",
    description: "仅旧代生效（真机 2.0.4 资产无 marker 控制行段，2026-11-09 真机对账核实；机器契约输出段语义由 r3-core-machine-contract-2x 承接，「不虚称交付」语义在 2.x 原文中已自足、无需改写）。「marker 是计划轮末控制行、OD 记录状态并开启下一轮」改为「本环境无 marker，自检后同轮进生产」，保留不虚称交付语义",
    targets: ["core-system-prompt"],
    anchor: "Only a ready plan for authorized production ends with the current keyed production-ready marker supplied by Open Design. It is a control line, separate from prose, and must be the last non-empty line of the planning turn. - Open Design records task state and starts the next turn. Do not claim that an ended turn or emitted marker proves that deliverables exist.",
    replacement: "There is no keyed continuation marker in this environment: after an authorized plan, self-check it and continue into production in the same turn. Never fabricate, quote, or wait for a continuation marker. Do not claim that a plan or a self-check proves that deliverables exist."
  },
  {
    id: "r3-core-route-stage-limits",
    name: "core 计划/生产轮界定单轮化",
    family: "two-turn-protocol",
    locator: "semantic-anchor",
    fragility: "high",
    generation: "legacy-only",
    description: "仅旧代生效（真机 2.0.4 资产改用 request/clarification/contract_repair/production 阶段词表，2026-11-09 真机对账核实；续轮语义由 r3-core 两条 -2x 规则承接）。planning turn / production turn 轮次界定改为同轮先后段语义",
    targets: ["core-system-prompt"],
    anchor: "- You decide whether the request needs a separate plan or a bounded direct edit. - A planning turn contains an actionable plan and, only when production is authorized, the current production-ready marker. It does not build outputs. - A production turn executes the preceding plan and does not emit another marker. - A direct edit completes within the current turn without automatic continuation.",
    replacement: "- You decide whether the request needs a planning section or a bounded direct edit. - The planning section contains an actionable plan and, when production is authorized, a self-check against the user's requirements; after it, production follows in the same turn without a break. - Production executes the plan written above it. - A direct edit completes within the current turn."
  },
  // 新代（真机 2.0.4）：request/clarification/production 阶段词表 + 隐藏机器契约块。
  {
    id: "r3-core-planning-continuation-2x",
    name: "core 计划阶段续轮句单轮化（2.x）",
    family: "two-turn-protocol",
    locator: "semantic-anchor",
    fragility: "high",
    generation: "current-only",
    description: "仅新代生效（真机 2.0.4 资产新增段，2026-11-09 真机对账核实）。「Build starts only in the production continuation」改为「本环境无宿主续轮，计划过自检后同轮进生产；plan-only/no-write 请求只交计划」（D2 协议折叠在 2.x 阶段词表上的落点）",
    targets: ["core-system-prompt"],
    anchor: "Full Plan request and clarification are planning-only. They may read bounded inputs, but they do not create, edit, render, or dispatch deliverables; Build starts only in the production continuation.",
    replacement: "Full Plan request and clarification are planning-only. They may read bounded inputs, but they do not create, edit, render, or dispatch deliverables; in this environment no host continuation starts Build — after the plan passes the self-check, continue into production in the same conversation unless the user asked for a plan only (honor plan-only and no-write requests by answering with the plan alone)."
  },
  {
    id: "r3-core-production-continuation-2x",
    name: "core 生产阶段续轮句单轮化（2.x）",
    family: "two-turn-protocol",
    locator: "semantic-anchor",
    fragility: "high",
    generation: "current-only",
    description: "仅新代生效（真机 2.0.4 资产新增段，2026-11-09 真机对账核实）。「等 production continuation 到达再执行冻结计划」改为「本环境无续轮到达，自检后同轮执行」",
    targets: ["core-system-prompt"],
    anchor: "Production reuses the frozen plan and existing native session. It does not select a new route, create a new plan, or ask another question; after the production continuation arrives, execute exactly what was frozen.",
    replacement: "Production reuses the frozen plan. It does not select a new route, create a new plan, or ask another question; in this environment no host continuation arrives — once the plan passes the self-check, execute exactly what was frozen in the same conversation."
  },
  {
    id: "r3-core-machine-contract-2x",
    name: "core 隐藏机器契约块指令文本化（2.x）",
    family: "two-turn-protocol",
    locator: "semantic-anchor",
    fragility: "high",
    generation: "current-only",
    description: "仅新代生效（真机 2.0.4 资产新增段，2026-11-09 真机对账核实）。「把 Plan Contract/Runtime State 写进 V2 机器契约隐藏结构块」改为「本环境无宿主解析器，计划一律普通散文输出、禁发机器专属结构块」（旧代资产反向写有「Do not serialize」，故旧代无此规则）",
    targets: ["core-system-prompt"],
    anchor: "The Plan Contract and Runtime State (including the resolved Task Profile, the Full Plan, and the completion standards) are machine structures. Write them into the hidden structured blocks the V2 machine contract specifies; do not expand them in user-facing prose.",
    replacement: "In this environment no host parses hidden machine-contract blocks: never emit Plan Contract, Runtime State, or other machine-only structures. Write the planning output as ordinary user-facing prose."
  },
  {
    id: "r3-orch-step6-marker",
    name: "orchestration 计划第 6 步 marker 输出段单轮化",
    family: "two-turn-protocol",
    locator: "semantic-anchor",
    fragility: "high",
    generation: "legacy-only",
    description: "仅旧代生效（真机 2.0.4 资产无 marker 措辞，计划停轮段由 r3-orch-plan-stop-continuation-2x 承接、契约输出段由 r3-orch-plan-contract-emission-2x 承接，2026-11-09 真机对账核实；2.x 上零命中是预期形态）。「第 6 步输出 <od-production-ready> 行并立即结束轮次」改为「不等宿主信号、自检后同轮进生产」",
    targets: ["general-orchestration"],
    anchor: '6. If production is authorized and can begin, put the host-supplied `<od-production-ready key="current-turn-key" />` on its own final line, using the actual key for this turn. Never put it in a code fence or quote. End the turn immediately after it. Open Design automatically starts production after this turn succeeds; the user does not resubmit or confirm the plan.',
    replacement: "6. If production is authorized and can begin, do not wait for any host signal: self-check the plan against the user's requirements, then continue directly into production in the same turn. No continuation marker exists in this environment; never emit or wait for one."
  },
  {
    id: "r3-orch-planning-turn-bars",
    name: "orchestration 计划轮禁产段单轮化",
    family: "two-turn-protocol",
    locator: "semantic-anchor",
    fragility: "high",
    generation: "legacy-only",
    description: "仅旧代生效（真机 2.0.4 资产的对应禁令已改写为 planning-only 措辞，由 r3-orch-plan-stop-continuation-2x 承接，2026-11-09 真机对账核实；2.x 上零命中是预期形态）。计划轮禁建交付物/禁追加 marker 改为「计划过自检后同轮产出」；保留「计划未完或问题未答时不派发媒体生成/子代理」限制（媒体禁令与报缺同向，设计保留判定）",
    targets: ["general-orchestration"],
    anchor: "Do not create the deliverables, dispatch media generation, or start production subagents during this planning turn. Reading bounded input references and preparing the plan are allowed. Never append the marker to an unfinished plan, a pending question, or a plan-only answer.",
    replacement: "Do not dispatch media generation or start production subagents while the plan is still unfinished or a pending question is unanswered; reading bounded input references and preparing the plan are allowed. Once the plan passes the self-check, produce the deliverables in the same turn."
  },
  {
    id: "r3-orch-no-marker-after-edit",
    name: "orchestration 直改后 marker 禁令单轮化",
    family: "two-turn-protocol",
    locator: "semantic-anchor",
    fragility: "high",
    generation: "legacy-only",
    description: "仅旧代生效（真机 2.0.4 资产直改段已无 marker 措辞，「写入即交付」语义自足，2026-11-09 真机对账核实；2.x 上零命中是预期形态）。「直改完成后再输出 marker」禁令改为「本环境无 marker」陈述",
    targets: ["general-orchestration"],
    anchor: "Do not emit a production-ready marker after the edit is already done. A non-design message receives an ordinary answer.",
    replacement: "The edit itself is the delivery in this environment; do not add any continuation marker (none exists here). A non-design message receives an ordinary answer."
  },
  {
    id: "r3-orch-no-marker-in-production",
    name: "orchestration 生产轮 marker 禁令单轮化",
    family: "two-turn-protocol",
    locator: "semantic-anchor",
    fragility: "high",
    generation: "legacy-only",
    description: "仅旧代生效（真机 2.0.4 资产无 marker/机器状态收尾措辞；contract_repair 阶段描述自带宿主触发条件、在 DSH 不可达且无害，保留不改，2026-11-09 真机对账核实；2.x 上零命中是预期形态）。「生产轮禁 marker、无协议修复轮」改为「本环境无 marker/协议修复轮/机器状态块」陈述",
    targets: ["general-orchestration"],
    anchor: "Do not emit a production-ready marker in production. There is no protocol-repair turn and no machine status to fill out at the end.",
    replacement: "There is no continuation marker, protocol-repair turn, or machine status in this environment; the delivery statement at the end is ordinary prose."
  },
  {
    id: "r3-orch-plan-stop-continuation-2x",
    name: "orchestration 计划停轮段单轮化（2.x）",
    family: "two-turn-protocol",
    locator: "semantic-anchor",
    fragility: "high",
    generation: "current-only",
    description: "仅新代生效（真机 2.0.4 资产新增段，2026-11-09 真机对账核实）。「计划输出后停轮、OD 续同一原生会话进 production」改为「本环境无宿主续轮，自检后同轮进 production；plan-only/no-write 请求只交计划」（旧代 r3-orch-step6-marker 的 2.x 语义承接）",
    targets: ["general-orchestration"],
    anchor: "The request and clarification turns stop after this planning output. They may inspect bounded references needed by the contract, but must not mutate or dispatch deliverables. Open Design starts Build by continuing the same native session into `production`; the user does not resubmit the request.",
    replacement: "The request and clarification turns are planning-only: they may inspect bounded references needed by the contract, but must not mutate or dispatch deliverables. No host continues the session in this environment — after the planning output passes the self-check, continue into `production` in the same conversation; the user does not resubmit the request. Honor plan-only and no-write requests by answering with the plan alone."
  },
  {
    id: "r3-orch-plan-contract-emission-2x",
    name: "orchestration Plan Contract 输出步文本化（2.x）",
    family: "two-turn-protocol",
    locator: "semantic-anchor",
    fragility: "high",
    generation: "current-only",
    description: "仅新代生效（真机 2.0.4 资产新增段，2026-11-09 真机对账核实）。「输出严格 Plan Contract/Runtime State 供 Open Design 解析」改为「普通散文输出计划，禁发机器契约结构」（本环境无解析器，机器块无处落地）",
    targets: ["general-orchestration"],
    anchor: "Emit a strict Plan Contract and Runtime State for Open Design to parse.",
    replacement: "Write the planning output as ordinary readable prose; no host parses machine contract blocks in this environment, so never emit Plan Contract or Runtime State structures."
  },
  {
    id: "r3-orch-plan-ready-machine-blocks-2x",
    name: "orchestration plan_ready 机器块输出文本化（2.x）",
    family: "two-turn-protocol",
    locator: "semantic-anchor",
    fragility: "high",
    generation: "current-only",
    description: "仅新代生效（真机 2.0.4 资产新增段，2026-11-09 真机对账核实）。plan_ready 输出要求「完整 Task Profile/Full Plan/完成标准写进隐藏结构块」改为「普通用户面向散文输出」",
    targets: ["general-orchestration"],
    anchor: "Emit the complete Task Profile, Full Plan, and completion standards in the hidden structured blocks the V2 machine contract specifies; machine structures must never rely on Markdown headings or natural-language field names for parsing.",
    replacement: "Write the complete Task Profile, Full Plan, and completion standards as ordinary user-facing prose; no host parses hidden machine-contract blocks in this environment, so never emit machine-only structured blocks."
  },
  {
    id: "r3-orch-plan-ready-summary-scope-2x",
    name: "orchestration plan_ready 契约归属句文本化（2.x）",
    family: "two-turn-protocol",
    locator: "semantic-anchor",
    fragility: "high",
    generation: "current-only",
    description: "仅新代生效（真机 2.0.4 资产新增段，2026-11-09 真机对账核实）。「执行模式/生产路线/Preflight 结果留在机器契约」改为「留在计划散文」，防与上一条的散文输出指令自相矛盾",
    targets: ["general-orchestration"],
    anchor: "The Run's execution mode, production routes, and Preflight results stay in the machine contract; they enter the decision summary only when they would change the user's outcome. - Under `complex`, attach the Build Packages in the machine contract.",
    replacement: "The Run's execution mode, production routes, and Preflight results stay in the planning prose; they enter the decision summary only when they would change the user's outcome. Under `complex`, attach the Build Packages in the plan."
  },
  // —— R4：question-form 文本化（仅旧代存在；2.x 已改为纯文本问句，无需改写）——
  {
    id: "r4-core-question-form-bullet",
    name: "core question-form 条目文本化",
    family: "question-form",
    locator: "semantic-anchor",
    fragility: "high",
    generation: "legacy-only",
    description: "仅旧代生效（表单协议在真机 2.0.4 资产中已整体移除、问句已是纯文本 + 推荐答案形态，2026-11-09 真机对账核实「question-form」零命中；2.x 上零命中是预期形态）。表单标记协议改为纯文本编号问答；「未答问题排除续轮」改为「未答不进生产」",
    targets: ["core-system-prompt"],
    anchor: "Ask a question-form only for essential unresolved input; never require the user to confirm an executable plan. An unanswered question excludes continuation.",
    replacement: "Ask plain numbered text questions only for essential unresolved input; never require the user to confirm an executable plan. Do not begin production while an essential question is unanswered."
  },
  {
    id: "r4-orch-question-form-step3",
    name: "orchestration 计划第 3 步 question-form 文本化",
    family: "question-form",
    locator: "semantic-anchor",
    fragility: "high",
    generation: "legacy-only",
    description: "仅旧代生效（真机 2.0.4 资产的澄清轮已改为 one to three questions with recommended defaults 纯文本形态，2026-11-09 真机对账核实；2.x 上零命中是预期形态）。「用 question-form 给推荐答案并结束本轮」改为「纯文本编号问答、用户在对话中回复」（同句 marker 提及一并消除）",
    targets: ["general-orchestration"],
    anchor: "Use a question-form with concise recommended answers, then end this turn without a production-ready marker.",
    replacement: "Ask as plain numbered text with concise recommended answers (no form UI exists in this environment); the user replies in the conversation."
  },
  {
    id: "r4-orch-question-form-production",
    name: "orchestration 生产轮 question-form 文本化",
    family: "question-form",
    locator: "semantic-anchor",
    fragility: "high",
    generation: "legacy-only",
    description: "仅旧代生效（真机 2.0.4 资产无该句，阻塞如实上报语义已由 blocked 结局词表自足，2026-11-09 真机对账核实；2.x 上零命中是预期形态）。生产轮阻塞时「question-form 提问」改为「文本编号提问」",
    targets: ["general-orchestration"],
    anchor: "If a newly discovered essential issue blocks progress, explain it or ask a question-form; never claim that missing output was delivered.",
    replacement: "If a newly discovered essential issue blocks progress, explain it or ask plain numbered text questions; never claim that missing output was delivered."
  },
  // —— R5：媒体段报缺化（D6 ①-⑤ 逐段清单；2.x 已删除大部分相反指令段，仅两段需新代规则）——
  {
    id: "r5-core-standalone-image-delivery",
    name: "core 独立图片交付段报缺化",
    family: "media-missing",
    locator: "semantic-anchor",
    fragility: "high",
    generation: "legacy-only",
    description: "仅旧代生效（真机 2.0.4 资产已删除独立图片交付/反 HTML 包装段，2026-11-09 真机对账核实；独立媒体请求报缺由组装层路由段自产指令承担，2.x 上零命中是预期形态）。D6①：「独立图片请求交付真实图片文件、禁止 HTML 包装」改为 V1 报缺语义（生成不可用、web/image 检索取图仍可行、HTML 源码替代交付）",
    targets: ["core-system-prompt"],
    anchor: "Resolve applicability before precedence. A prototype project may host an image request without changing the project's type or asking for a scenario switch. For standalone image generation, deliver the actual image file. Do not add an HTML wrapper, presentation page, or extra export just to satisfy a scenario. When the user asks to insert an image into a page or deck, generate or acquire the image and integrate it into that requested artifact; the image alone is not the full delivery.",
    replacement: "Resolve applicability before precedence. A prototype project may host an image request without changing the project's type or asking for a scenario switch. Design mode V1 has no image, video, or audio production pipeline: for a standalone image-generation request, state this limitation truthfully and offer an HTML-source deliverable instead (for example an HTML poster or page). Fetching real images with your available web/image search tools remains possible. When the user asks to insert an image into a page or deck, fetch it with those tools and integrate it into the requested artifact; if no fetch route works, use a disclosed placeholder."
  },
  {
    id: "r5-core-stock-search-command",
    name: "core stock-search 命令段报缺化",
    family: "media-missing",
    locator: "semantic-anchor",
    fragility: "high",
    generation: "legacy-only",
    description: "仅旧代生效（真机 2.0.4 资产已删除 stock-search 命令与公司取图服务段，取图已改为模型自带 web/image 检索——与 V1 报缺语义同向，无需改写，2026-11-09 真机对账核实；2.x 上零命中是预期形态）。D6②a：「media stock-search 命令取图（含 $OD_BIN）」改为 web/image 检索工具取图 + 缺口披露；fallback 与「不反复重试」语义保留（D6② 保留子项随段重组，od-next-media-inputs 引用随 D6④ 移除）",
    targets: ["core-system-prompt"],
    anchor: 'Fetch every searched stock slot in one `"$OD_NODE_BIN" "$OD_BIN" media stock-search --slots \'<json>\'` call instead of writing download scripts. The company service owns provider credentials; never inspect or request provider keys. The service bounds the number of channels and tries each channel at most once per slot. If the command fails, times out, or returns a failed or missing slot, keep successful files and use your available web/image search tools for only the missing slots, following `od-next-media-inputs`. Do not repeatedly call the failing stock tool.',
    replacement: "Fetch the images yourself with your available web/image search tools instead of writing download scripts; design mode V1 has no managed stock-search service and no media pipeline. Never inspect or request provider keys. If a search route fails, times out, or returns nothing usable for a slot, keep the successful files and search again with your available web/image search tools for only the missing slots, and disclose what is still missing. Do not repeatedly retry a failing source."
  },
  {
    id: "r5-core-image-generation-gate",
    name: "core 图片生成门控报缺化",
    family: "media-missing",
    locator: "semantic-anchor",
    fragility: "high",
    generation: "legacy-only",
    description: "仅旧代生效（真机 2.0.4 资产已删除显式生成门控段，生成语义改由 real-first 段的 generation fallback 分句承载，由 r5-core-image-generation-fallback-2x 承接，2026-11-09 真机对账核实；2.x 上零命中是预期形态）。D6②b：「仅在用户明确要求时考虑图片生成」生成语义改为 V1 报缺语义（不生成、如实报缺、HTML 源码替代；web 检索取真图路径保留）",
    targets: ["core-system-prompt"],
    anchor: "Only consider image generation when the user explicitly asks to generate images. Such a request permits you to decide whether generation fits the task; it does not require a generation call. A need for imagery, a style preference, a missing stock result, or a search timeout does not authorize generation. Honor an explicit request for real photos and the factual referent boundary above.",
    replacement: "Image generation is not available in this environment: never generate images, and for an explicit image-generation request state this limitation truthfully and offer an HTML-source deliverable instead. A need for imagery, a style preference, a missing stock result, or a search timeout does not change this. Honor an explicit request for real photos by fetching real images with your available web/image search tools, and keep the factual referent boundary above."
  },
  {
    id: "r5-core-image-generation-fallback-2x",
    name: "core real-first 生成回退分句报缺化（2.x）",
    family: "media-missing",
    locator: "semantic-anchor",
    fragility: "high",
    generation: "current-only",
    description: "仅新代生效（真机 2.0.4 资产新增段，2026-11-09 真机对账核实）。D6②b 的 2.x 语义承接：「无合适素材可取时回退图片生成」改为「本环境不可生成，如实报缺并用已披露占位」（保留 real-first 优先检索取真图与占位披露语义）",
    targets: ["core-system-prompt"],
    anchor: "For illustrative or fictional subjects prefer fetched real photography; fall back to image generation only when no suitable asset can be acquired — generation is slow, so spend it on the few surfaces that change the result.",
    replacement: "For illustrative or fictional subjects prefer fetched real photography; in this environment image generation is not available (design mode V1 has no media pipeline) — when no suitable asset can be acquired, say so truthfully and design a disclosed placeholder instead of generating."
  },
  {
    id: "r5-orch-anti-html-wrapper",
    name: "orchestration 反 HTML 包装句报缺化",
    family: "media-missing",
    locator: "semantic-anchor",
    fragility: "high",
    generation: "legacy-only",
    description: "仅旧代生效（真机 2.0.4 资产已删除反 HTML 包装句，交付语义改为「primary HTML deliverable 写盘即交付」——与 V1 同向，2026-11-09 真机对账核实；2.x 上零命中是预期形态）。D6③：「独立媒体请求禁止 HTML 包装」改为 V1 报缺语义（无媒体管线、如实报缺、HTML 源码替代交付）",
    targets: ["general-orchestration"],
    anchor: "Do not add an HTML wrapper, presentation page, or extra export for an independent image, video, audio, or document request. Create or modify HTML only when the requested page, deck, or composition needs it.",
    replacement: "Design mode V1 has no image, video, or audio production pipeline: for a standalone image, video, or audio request, state this limitation truthfully and offer an HTML-source deliverable instead of a media file. Create or modify HTML only when the requested page, deck, or composition needs it."
  },
  {
    id: "r5-orch-media-input-skill-section",
    name: "orchestration Media input Skill 段整段报缺化",
    family: "media-missing",
    locator: "semantic-anchor",
    fragility: "high",
    generation: "legacy-only",
    description: "仅旧代生效（同段在真机 2.0.4 资产中措辞系统性改写——加载时机从 unless 形态改 if 形态、段落首尾句重写，2.x 段由 r5-orch-media-input-skill-section-2x 承接，2026-11-09 真机对账核实；2.x 上零命中是预期形态）。D6④：整段报缺化（skill show od-next-media-inputs 命令含 $OD_BIN + Skill 加载通道 V1 不存在）；web/image 取图与 attribution 义务保留",
    targets: ["general-orchestration"],
    anchor: '### Media input Skill Before the first media action in a stage that permits media work — searching, fetching, downloading, generating, localizing, or processing an image or other media — load the `od-next-media-inputs` Skill unless its complete, still-valid body is already in context. Read it through the supplied Open Design CLI wrapper; on POSIX shells: ```sh "$OD_NODE_BIN" "$OD_BIN" skill show od-next-media-inputs --json --workspace "$OD_WORKSPACE_ID" --workspace-member "$OD_WORKSPACE_MEMBER_ID" ``` Use the host-documented wrapper syntax on other shells and pass the same run-pinned Workspace/member pair. Both values are empty for unbound local runs. Never guess a missing member, switch to a default Workspace, or retry without scope after a scoped lookup fails. Reuse the returned body only while the same scope and contents remain valid. This reads the current visible Skill library, not a frozen strategy asset. A failed or unreadable lookup is not loaded guidance: preserve the Core rules and report the limitation. Tasks without media work do not load this Skill. The Skill governs permitted media work only; it cannot authorize dispatching deliverables in a planning stage or adding unrequested work after delivery.',
    replacement: MEDIA_INPUT_MISSING_REPLACEMENT
  },
  {
    id: "r5-orch-media-input-skill-section-2x",
    name: "orchestration Media input Skill 段整段报缺化（2.x）",
    family: "media-missing",
    locator: "semantic-anchor",
    fragility: "high",
    generation: "current-only",
    description: "仅新代生效（真机安装 2.0.4 资产的 D6④ 段措辞，2026-11-09 真机对账核实——加载时机句为 if its complete, still-valid body is not already in context 形态、旧代为 unless 形态）。D6④ 的 2.x 语义承接：整段报缺化（skill show 命令含 $OD_BIN + Skill 加载通道 V1 不存在）；与旧代规则共用同一替换文本",
    targets: ["general-orchestration"],
    anchor: '### Media input Skill Only when the task needs media acquisition, generation, localization, or processing, and the current stage permits that work, load the `od-next-media-inputs` Skill if its complete, still-valid body is not already in context. Read it through the supplied Open Design CLI wrapper; on POSIX shells: ```sh "$OD_NODE_BIN" "$OD_BIN" skill show od-next-media-inputs --json --workspace "$OD_WORKSPACE_ID" --workspace-member "$OD_WORKSPACE_MEMBER_ID" ``` Use the host-documented wrapper syntax on other shells and pass the same run-pinned Workspace/member pair. Both values are empty for unbound local runs. Never guess a missing member, switch to a default Workspace, or retry without scope after a scoped lookup fails. Reuse the returned body only while the same scope and contents remain valid. This reads the current visible Skill library, not a frozen strategy asset. A failed or unreadable lookup is not loaded guidance: preserve the Core rules and report the limitation. Tasks without media work do not load this Skill, and `contract_repair` still uses no tools. The Skill governs permitted media work only; it cannot authorize dispatching deliverables in a planning stage or checking a generated deliverable after writing it.',
    replacement: MEDIA_INPUT_MISSING_REPLACEMENT
  },
  {
    id: "r5-core-media-production-step",
    name: "core 媒体 production-step 句报缺化",
    family: "media-missing",
    locator: "semantic-anchor",
    fragility: "high",
    generation: "legacy-only",
    description: "仅旧代生效（真机 2.0.4 资产已删除媒体 production-step 句，交付语义改为「primary HTML deliverable 实际生成即交付」——与 V1 同向，2026-11-09 真机对账核实；2.x 上零命中是预期形态）。D6⑤a：「Source code alone is not rendered media」与 motion-design V1 交付 HTML 源码相反，反转为「源码即交付物」",
    targets: ["core-system-prompt"],
    anchor: "- Generation, waiting for media jobs, rendering a requested final-cut file, and registering a live artifact are production steps until the actual requested output exists. Source code alone is not rendered media.",
    replacement: "- Media rendering (final-cut video, audio, or image files) and live-artifact registration are not available in this environment: deliver the HTML-source form and state the limitation. In design mode V1, source code is the deliverable for motion and media-adjacent work."
  },
  {
    id: "r5-core-video-motion-exception",
    name: "core video-motion exception 段报缺化",
    family: "media-missing",
    locator: "semantic-anchor",
    fragility: "high",
    generation: "legacy-only",
    description: "仅旧代生效（真机 2.0.4 资产已删除 video-motion 例外段，2026-11-09 真机对账核实；2.x 上零命中是预期形态）。D6⑤b：「video-motion 成片的一次性 MP4 评审例外」前提（rendered MP4）在 V1 成片报缺下不成立，改为 timeline HTML/CSS/JS 源码交付",
    targets: ["core-system-prompt"],
    anchor: "Video-motion exception: only while producing an actual video-motion film requested by the user, follow the motion guidance for one bounded review of the source and rendered MP4 (clock, exact captions/factual invariants, audio, and at most three representative frames), with at most one targeted repair and re-render. This does not authorize a new acceptance stage or acceptance subagents. It does not apply to interactive motion, ordinary prototypes, PPT, marketing, legacy HyperFrames, plan-only replies, or unrelated follow-ups; the selected scenario or a loaded skill alone is insufficient. No Plan Contract or Runtime State is required.",
    replacement: "Video-motion exception: design mode V1 cannot render an actual video-motion film (no media pipeline), so no rendered-MP4 review applies — deliver the motion design as timeline-driven HTML/CSS/JS source and state the limitation. The generation-time quality discipline still governs the source you write."
  },
  {
    id: "r5-orch-video-motion-authorization",
    name: "orchestration video-motion 例外授权句报缺化",
    family: "media-missing",
    locator: "semantic-anchor",
    fragility: "high",
    generation: "legacy-only",
    description: "仅旧代生效（真机 2.0.4 资产已删除该授权句，2026-11-09 真机对账核实；2.x 上零命中是预期形态）。D6⑤c：「core 显式授权 video-motion 生产例外」改为「该例外在本环境不适用」",
    targets: ["general-orchestration"],
    anchor: "The Core explicitly authorizes the bounded video-motion production exception; all other tasks keep this default.",
    replacement: "The Core's bounded video-motion production exception does not apply in this environment (no media pipeline); all tasks keep the ship-on-write default with HTML-source deliverables."
  },
  {
    id: "r5-orch-standalone-media-real-file",
    name: "orchestration 独立媒体真实文件分句报缺化",
    family: "media-missing",
    locator: "semantic-anchor",
    fragility: "high",
    generation: "legacy-only",
    description: "仅旧代生效（真机 2.0.4 资产改为 Writing the primary HTML deliverable to disk IS the delivery——「独立媒体交付真实媒体文件」分句已删除且新语义与 V1 同向，2026-11-09 真机对账核实；2.x 上零命中是预期形态）。D6⑤d：「独立媒体交付真实媒体文件」改为「独立媒体成片不可产，报缺并建议 HTML 源码替代」",
    targets: ["general-orchestration"],
    anchor: "Writing the requested deliverables to disk IS the delivery. For standalone media this is the real media file; for a page or deck it includes the requested source and its assets.",
    replacement: "Writing the requested deliverables to disk IS the delivery. For a page or deck this includes the requested source and its assets; standalone media files cannot be produced in this environment — state the limitation and offer an HTML-source deliverable instead."
  },
  // —— 残余特征串兜底（必须收尾：语义段规则全部跑完后才兜底，防止兜底改写污染后续段锚的锚域）——
  {
    id: "r3-residual-marker-phrase",
    name: "production-ready 字样残余兜底",
    family: "two-turn-protocol",
    locator: "regex",
    fragility: "medium",
    generation: "legacy-only",
    description: "仅旧代生效（特征串仅存在于 0.25.x 资产；真机 2.0.4 资产零命中，2026-11-09 真机对账核实）。残余「production-ready marker」字样兜底替换为「continuation marker」（段落锚失配时的特征串兜底；命中说明上游段锚漂移，doctor 据此暴露）",
    targets: ["core-system-prompt", "general-orchestration"],
    anchor: "production-ready marker",
    replacement: "continuation marker"
  },
  {
    id: "r4-residual-question-form-term",
    name: "question-form 术语残余兜底",
    family: "question-form",
    locator: "regex",
    fragility: "medium",
    generation: "legacy-only",
    description: "仅旧代生效（特征串仅存在于 0.25.x 资产；真机 2.0.4 资产零命中，2026-11-09 真机对账核实）。残余「question-form」术语兜底替换为「numbered text question」（特征串兜底；命中说明上游段锚漂移）",
    targets: ["core-system-prompt", "general-orchestration"],
    anchor: "question-form",
    replacement: "numbered text question"
  }
];
const REWRITE_ASSET_IDS = ["core-system-prompt", "general-orchestration"];
export {
  REWRITE_ASSET_IDS,
  REWRITE_RULES,
  compileAnchor,
  detectAssetGeneration,
  ruleAppliesToGeneration
};
