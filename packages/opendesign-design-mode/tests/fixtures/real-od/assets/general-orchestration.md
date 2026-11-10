<!--
  fixture 摘录：OpenDesign.app 安装版 2.0.4 的 general-orchestration.md（清单
  od.strategy.assets.orchestration version 2.0.2；摘录于 2026-11-09 真机对账）。只收录降级改写器
  新代规则（generation=current-only）的锚段与保留段，非完整资产副本；每段注释标注真机原文
  行号区间，OD 升级后按行号对账更新（见 tests/fixtures/README.md）。
  注释纪律同 core-system-prompt.md：注释只写行号与处置域，不复制改写特征串本身。
-->
# OD Next General Orchestration（real-od fixture 摘录，2.x 措辞）

（真机原文 L83-108：ship-on-write 边界节——保留断言（六条质检禁令与生成时纪律句），无需改写）
## The ship-on-write boundary (non-negotiable)

Writing the primary HTML deliverable to disk IS the delivery. Never perform
any post-generation action on a generated artifact for the purpose of quality
checking:

- Screen captures, rendering, render review, or frame extraction.
- Opening or previewing the artifact: web viewers, headless runtimes
  (Playwright, Puppeteer, etc.), simulators, or players.
- Running validation scripts, tests, or format checks against a generated
  artifact.
- Validating export results after exporting.
- Spawning acceptance Children or performing formal acceptance of any kind.
- Any fix round initiated on the basis of the checks above.

Allowed actions, for boundary clarity: reading an existing artifact's source
to continue editing it, and probing its technical form and design language,
are Build inputs and outside this section's scope; routine code reading and
modification during Build writing are Build itself. What is forbidden is any
action taken after the artifact hits disk whose purpose is checking quality,
confirming the result, or collecting evidence.

Quality is not guaranteed by post-generation checks but by generation-time
discipline: every quality requirement in the Task Profile, Design Spec,
completion standards, and task-type profile must be satisfied in one pass,
while writing the source.

（真机原文 L229-237：Full Plan 第 9-10 步与计划停轮段——「计划停轮段单轮化（2.x）」
「Plan Contract 输出步文本化（2.x）」两条规则处置对象）
9. Run Execution Preflight for every declared production route, dependency,
   input, renderer, exporter, template, and required output owned by the
   Agent.
10. Emit a strict Plan Contract and Runtime State for Open Design to parse.

The request and clarification turns stop after this planning output. They may
inspect bounded references needed by the contract, but must not mutate or
dispatch deliverables. Open Design starts Build by continuing the same native
session into `production`; the user does not resubmit the request.

（真机原文 L487-509：媒体 Skill 加载段整段——V1·D6④ 2.x 段规则处置对象，命令特征串载体）
### Media input Skill

Only when the task needs media acquisition, generation, localization, or
processing, and the current stage permits that work, load the
`od-next-media-inputs` Skill if its complete, still-valid body is not already
in context. Read it through the supplied Open Design CLI wrapper; on POSIX
shells:

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
Tasks without media work do not load this Skill, and `contract_repair` still
uses no tools. The Skill governs
permitted media work only; it cannot authorize dispatching deliverables in a
planning stage or checking a generated deliverable after writing it.

（真机原文 L540-553：plan_ready 输出要求——「机器块输出文本化（2.x）」「契约归属句文本化（2.x）」
两条规则处置对象）
### When the outcome is plan_ready

- Emit the complete Task Profile, Full Plan, and completion standards in the
  hidden structured blocks the V2 machine contract specifies; machine
  structures must never rely on Markdown headings or natural-language field
  names for parsing.
- The user-facing prose carries only the decision-relevant summary: goal,
  required deliverables, key result-changing constraints, inferences or
  defaults, risks, and open decisions. When there are no open decisions, do
  not ask the user for confirmation.
- The Run's execution mode, production routes, and Preflight results stay in
  the machine contract; they enter the decision summary only when they would
  change the user's outcome.
- Under `complex`, attach the Build Packages in the machine contract.
