<!--
  fixture 摘录：OD 仓 plugins/_official/scenarios/od-next-strategy/assets/general-orchestration.md
  （0.25.1 检出原文，摘录于 2026-11-09）。只收录降级改写器（U4）断言所需关键段，非完整资产副本。
  摘录语义依据：设计渲染视图 D6 ③④⑤ 与两轮协议/question-form 折叠规则（D2）。
  注释纪律同 core-system-prompt.md：注释只写行号与处置域，不复制改写特征串本身。
-->
# OD Next General Orchestration（fixture 摘录）

## Delivery default

（原文 L18-22：交付默认段——⑤ 处置对象为段内「独立媒体交付即真实媒体文件」分句）

for unrequested work; an explicit user request for an action takes precedence,
subject to safety, permission, and actual tool availability. A Skill or model
assumption cannot authorize that exception. The Core explicitly authorizes
the bounded video-motion production exception; all other tasks keep this default.

Writing the requested deliverables to disk IS the delivery. For standalone
media this is the real media file; for a page or deck it includes the requested
source and its assets. A task ID alone is not a delivered file. Never perform
any post-generation action on a generated artifact for the purpose of quality
control unless the user explicitly asks for it.

## Choose the work

（原文 L52-54：D6 ③ 处置段——独立媒体反包装句，与 core 交付段同性质、不含命令特征串，
 RL3 抓不住，由 U4 反指令特征短语断言兜底）

Determine the deliverable from the latest request plus non-conflicting earlier
requirements. The selected scenario is a default, not a restriction on output.
Do not add an HTML wrapper, presentation page, or extra export for an independent
image, video, audio, or document request. Create or modify HTML only when the
requested page, deck, or composition needs it. Do not demand a scenario switch.

## Planning turn protocol

（原文 L88-99 与 L104：两轮协议段——「两轮协议单轮化」与「question-form 文本化」两条规则
 的处置对象；续轮标记与表单标记的宿主执行者在 DSH 侧不存在，见设计 PR5）

5. Summarize the plan in one readable block: the selected deliverable, design
   direction, ordered steps, key assumptions, and remaining constraints.
   No fixed field names, requirement IDs, hashes, or machine JSON are needed.
6. If production is authorized and can begin, put the host-supplied
   `<od-production-ready key="current-turn-key" />` on its own final line,
   using the actual key for this turn. Never put it in a code fence or quote.
   End the turn immediately after it. Open Design automatically starts production
   after this turn succeeds; the user does not resubmit or confirm the plan.

Do not create the deliverables, dispatch media generation, or start production
subagents during this planning turn. Reading bounded input references and
preparing the plan are allowed.

（原文 L88-89：表单协议用法句——question-form 文本化规则处置对象）

   Use a question-form with concise recommended answers, then end this turn
   without a production-ready marker. Do not ask the user to approve a plan.

## Media input Skill

（原文 L215-236：D6 ④ 处置段整段——Skill 加载指令段，段内命令走命令特征串，
 无本地路径等价物，整段报缺化）

### Media input Skill

Before the first media action in a stage that permits media work —
searching, fetching, downloading, generating, localizing, or processing an
image or other media — load the `od-next-media-inputs` Skill unless its
complete, still-valid body is already in context. Read it through the supplied
Open Design CLI wrapper; on POSIX shells:

```sh
"$OD_NODE_BIN" "$OD_BIN" skill show od-next-media-inputs --json --workspace "$OD_WORKSPACE_ID" --workspace-member "$OD_WORKSPACE_MEMBER_ID"
```

Use the host-documented wrapper syntax on other shells and pass the same
run-pinned Workspace/member pair. Both values are empty for unbound local
runs. Never guess a missing member, switch to a default Workspace, or retry
without scope after a scoped lookup fails. Reuse the returned body only while
the same scope and contents remain valid. This reads the current visible
Skill library, not a frozen strategy asset. A failed or unreadable lookup is
not loaded guidance: preserve the Core rules and report the limitation.
Tasks without media work do not load this Skill. The Skill governs
permitted media work only; it cannot authorize dispatching deliverables in a
planning stage or adding unrequested work after delivery.
