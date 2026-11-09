---
name: pr-cr-fix
description: >-
  PR 审查修复与交付前流程：默认由仓内 pr-lifecycle workflow 编排（检查、四维审查修复、
  真机验收、PR 元信息），停在 awaiting-push；push 必须用户当场授权，不自动 push。
  触发词："pr-cr-fix"、"review 完开 PR"、"审查并修复"、"push 前检查"。
---

# PR 审查修复 Skill（tai-ji-yang 多包 workspace）

本 skill 是 PR 审查修复的项目唯一入口。默认路径两条段：

1. **pr-lifecycle workflow**：编排 preflight、`pnpm check`、四维审查修复循环、final `pnpm check`、真实 DSH 验收和 PR title/body 起草。
2. **awaiting-push**：向用户披露终态并当场请求 push 授权。

手工兜底路径（workflow 不可用时）按本文第 1-5 节顺序执行。

## 前置条件

- 当前 git worktree 中分支相对 main 有 commits（`git log main..HEAD` 非空）；无 commits 时无审查对象，直接告知用户。
- 工作区全提交；workflow preflight 会对脏工作区 fail-fast。
- `pnpm install` 已执行（报 vitest 入口缺失时先装依赖）。
- 审查基线默认 `base=main`。
- `node .agents/workflows/scripts/build-workflows.mjs --check` 通过（产物与单源一致）。

## 1. pr-lifecycle workflow（默认编排）

在 worktree 根发起；两平台产物同源：

- **zcode**：`CreateWorkflow`，`path` = `<worktree>/.agents/workflows/pr-lifecycle.dwf.ts`
- **pi**：workflow 工具 `action: "run"`，`name` = `<worktree>/.agents/workflows/pr-lifecycle.js`

常用 args：

- `base`：默认 `main`。
- `worktree`：目标 git worktree 绝对路径；会话 cwd 不是该 worktree 时必传。
- `maxRounds`：审查修复循环上限，默认 5。
- `verifyUrl` / `verifyEvidenceDir`：真实 DSH 验收二选一。`verifyUrl` 让 workflow 现跑 brand/head/theme/projects 四场景（根包 tai-ji-yang-shell 场景）；`verifyEvidenceDir` 指向已生成的验收证据根（内含 `verdict.json`）。都不传时 workflow 终态显式标 acceptance skipped，不得对外声称已真机验收。
- `taskId` / `executionId` / `sampleType`：阶段观测可选参数。

workflow 行为：preflight（要求工作区全提交）→ `pnpm check` → 四份固定项目 reviewer 审查/聚合/分组修复循环 → final `pnpm check` → acceptance → PR title/body 起草 → `awaiting-push`。它不执行 `git push`，不创建 PR。`failed` 终态按 `error/recovery` 处置；`awaiting-push` 时向用户披露 review、acceptance、prMeta、residualFiles 和 skipped。

只跑审查修复循环、不进门禁不开 PR 时，用全局 saved `review-fix-loop`；`reviewers` 传四份定义的绝对路径数组（见第 3 节）。

## 2. check-all 与真机验收（手工兜底的前置）

workflow 不可用时先在 worktree 根执行：

```bash
pnpm check
```

失败按输出逐项修复后重跑；`client/theme/host-font-sheet.spec.ts` 需要 `DSH_FONT_SHEET` 指向宿主源样式表，缺失时按错误信息设置，不绕过。CI 环境（`CI=true`）没有宿主源码仓，该 spec 显式跳过并播报说明——这条字体复合简写护栏由本地承担。

再按 `.agents/skills/verify-taiji-yang/SKILL.md` 执行真实 DSH 验收（brand/head/theme/projects；卸载用隔离自启模式）。该入口只验根包 tai-ji-yang-shell；diff 涉及子包 `packages/opendesign-design-mode` 时，真实宿主验收另走 `pnpm test:e2e:design-mode`（node 直跑，需本机 DSH 环境与构建产物）——跑不了的场合显式登记 skipped，不冒充通过。无法执行真机验收时显式披露原因，停回用户裁决是否继续，不静默跳过。

## 3. review-fix-loop（手工兜底的审查循环）

四份项目 reviewer 是固定清单（路径相对仓库根，发起时解析为绝对路径传入）：

- `.agents/reviewers/review-business-logic.md`
- `.agents/reviewers/review-dsh-contract.md`
- `.agents/reviewers/review-dsh-lifecycle.md`
- `.agents/reviewers/review-dsh-ui.md`

四份定义含子包判据（opendesign-design-mode）：各定义的必读判据（AGENTS.md「领域边界」「产物与依赖纪律」等节）对仓内每个包生效，子包改动按同一判据审查。

zcode 用全局 saved `review-fix-loop`：

```text
CreateWorkflow:
  saved: { name: "review-fix-loop" }
  args:
    base: "main"
    reviewers: [<上列四份 .md 的绝对路径数组>]
```

pi 用内置 `review-fix-loop`：`targetType=git-diff`、`target=main`、`batch1=<四份 .md 绝对路径，逗号分隔>`、`autoCommit=true`。循环 clean 判定、R2 对账和熔断语义以 workflow 定义为准；熔断终态停回用户。

## 4. final check-all（手工兜底）

审查循环产生修复 commit 或工作区改动后，重跑 `pnpm check`；不通过则修复后重跑，循环与 check 交替直至全绿。

## 5. awaiting-push（终态披露 + push 当场授权）

workflow 返回 `awaiting-push` 后向用户逐项披露：

- review 结论（rounds / terminated / mustFix / suggestion / reportDir）
- final gate 结果
- acceptance 结果与证据目录；skipped 时明确说明未真机验收
- PR title/body 文件与 residualFiles

**push 必须当场请求用户明确授权 [MANDATORY]**：授权后执行 `git push github HEAD:<branch>`（remote 名 = `github`，指向 `zhushanwen321/tai-ji-yang`），push 后核对远端 ref（`git rev-parse HEAD github/<branch>` 一致）。未获授权不得 push。是否创建 PR 由用户另行决定；创建时使用 `gh pr create/edit --repo zhushanwen321/tai-ji-yang`。

## 熔断与失败处置

| 终态 | 处置 |
|------|------|
| stuck（must-fix 连续不降） | 读当轮报告逐条裁决：误报则列明反证（file:line + 逻辑）停回用户；真问题则修复 commit 后重跑循环 |
| needs-redesign（修复两次复发） | 停回用户裁决方案，不自行改设计 |
| max-rounds | 汇总残留问题清单停回用户 |
| reviewer 调用失败 | 按失败原因修复环境后重跑循环 |
| check-all / 真机验收失败 | 按输出修复后从对应步骤重跑 |

## 产物维护

pr-lifecycle 产物由单源构建：

```bash
node .agents/workflows/scripts/build-workflows.mjs
node .agents/workflows/scripts/build-workflows.mjs --check
node --test .agents/workflows/tests/*.test.mjs
```

改行为只改 `.agents/workflows/src/pr-lifecycle.shared.ts` 与两个平台壳，再重建；产物禁止手改。pre-commit 会在 workflow 文件 staged 时自动跑 `--check` 与 workflow 测试。

## 约束

- 审查基线默认 `base=main`；不设 dev 队列与覆盖率/度量门禁。本仓是 pnpm 多包 workspace（根包 tai-ji-yang-shell + 子包 `packages/opendesign-design-mode`），每包零 npm 运行时依赖；发布走 changesets + GitHub Actions（见 AGENTS.md「发布」节），PR 流程不含发布与变更集步骤。
- push 与建 PR 都不在自动动作集内：push 须当场授权，PR 创建不在本流程。
- 四份 reviewer 定义（`.agents/reviewers/review-*.md`，文件名 `review-<维度>.md` 是循环的维度接口）是循环的审查判据来源；调整审查维度时同步维护定义文件与本节的固定清单。
