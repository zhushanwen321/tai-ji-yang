---
name: pr-cr-fix
description: >-
  PR 审查修复流程：pnpm check → verify-taiji-yang 真机验收 → review-fix-loop 多维审查修复循环
  （四份项目 reviewer）→ 终局 pnpm check → 待推送终态披露。push 必须用户当场授权，
  不自动 push、不建 PR。触发词："pr-cr-fix"、"review 完开 PR"、"审查并修复"、"push 前检查"。
---

# PR 审查修复 Skill（tai-ji-yang-shell）

本 skill 是 PR 审查修复的项目唯一入口。流程一条链，按序执行：

1. **check-all（初跑）**
2. **verify-taiji-yang（真机验收）**
3. **review-fix-loop（多维审查修复循环）**
4. **final check-all（终局复跑）**
5. **awaiting-push（终态披露 + push 当场授权）**

## 前置条件

- 当前 git worktree 中分支相对 main 有 commits（`git log main..HEAD` 非空）；无 commits 时无审查对象，直接告知用户。
- `pnpm install` 已执行（报 vitest 入口缺失时先装依赖）。
- 审查基线固定 `base=main`。

## 1. check-all（初跑）

在 worktree 根执行：

```bash
pnpm check
```

（静态断言六项 → 构建 → 全仓单测，固定顺序。）exit 0 才继续；失败按输出逐项修复（静态断言失败改对应源并同步维护断言脚本、构建失败看 build 输出、单测失败按失败用例修），修完重跑本步。全仓单测中的 `client/theme/host-font-sheet.spec.ts` 需要 `DSH_FONT_SHEET` 环境变量指向宿主源样式表，缺失时该测试显式失败并给出设置指引——按指引设置后重跑，不绕过。

## 2. verify-taiji-yang（真机验收）

按项目入口 verify-taiji-yang（`.agents/skills/verify-taiji-yang/`）执行真实 DSH 宿主验收（装载、明暗、槽位可见性、禁用/卸载回落）。验收不通过时修复后从第 1 步重跑（代码已改动，读数过期）。当前环境无法执行真机验收时，显式披露该步被跳过及原因，停回用户裁决是否继续——不静默跳过。

## 3. review-fix-loop（多维审查修复循环）

循环本体用现成 workflow，按宿主路由二选一（循环语义以 workflow 定义为准，本节只写发起参数）。四份项目 reviewer 是固定清单（路径相对仓库根，发起时解析为绝对路径传入）：

- `.agents/reviewers/review-business-logic.md`
- `.agents/reviewers/review-dsh-contract.md`
- `.agents/reviewers/review-dsh-lifecycle.md`
- `.agents/reviewers/review-dsh-ui.md`

**zcode 主 agent**：全局 saved workflow `review-fix-loop`，经 CreateWorkflow `saved` 发起：

```
CreateWorkflow:
  saved: { name: "review-fix-loop" }
  args:
    base: "main"
    reviewers: [<上列四份 .md 的绝对路径数组>]
```

`reviewers` 必须是 .md 绝对路径数组，禁止相对路径或裸文件名。

**pi 主 agent**：内置 `review-fix-loop`（subagent-workflow extension 的 workflow 工具，`action: "run"`），参数：`targetType: "git-diff"`、`target: "main"`、`batch1` = 上列四份 .md 绝对路径（逗号分隔，禁止相对路径/裸名）、`autoCommit: true`（修复后由循环统一 commit，与 saved 版缺省对齐）。

**循环语义要点**（两宿主同源，细节以 workflow 定义为准）：clean 判定 = mustFix 与 suggestion 同为 0；第 2 轮起逐条对账（fixed 须附亲自核实的证据；escalate 仅用于延迟条目的上下文复活）；连续 stuck、needs-redesign、max-rounds 熔断——熔断终态停回用户裁决，不自行放行。报告产物落在循环缺省目录（`~/.agents/skill-data/review-fix-loop/<project-slug>/`），无需传入。

## 4. final check-all（终局复跑）

循环产生了修复 commit 或工作区改动后，重跑 `pnpm check`——第 1 步的读数已过期。循环外的手工修复须显式路径 commit（message 用英文）后再复跑。不通过则修复后重跑本步；循环与 check 交替直至全绿。

## 5. awaiting-push（终态披露 + push 当场授权）

全绿后流程进入 awaiting-push 终态，向用户逐项披露：

- 各 reviewer 维度结论（mustFix / suggestion 计数、熔断状态）
- 修复 commit 清单
- final check-all 结果
- 被跳过的步骤（如真机验收不可执行）及原因

**push 必须当场请求用户明确授权 [MANDATORY]**：授权后执行 `git push github HEAD:<branch>`（remote 名 = `github`，指向 `zhushanwen321/tai-ji-yang`），push 后核对远端 ref（`git rev-parse HEAD github/<branch>` 一致）。未获授权不得 push。**本流程不创建 PR**（不调用 GitHub CLI 的 PR 创建命令）；是否开 PR 由用户另行决定。

## 熔断与失败处置

| 终态 | 处置 |
|------|------|
| stuck（must-fix 连续不降） | 读当轮报告逐条裁决：误报则列明反证（file:line + 逻辑）停回用户；真问题则修复 commit 后重跑循环 |
| needs-redesign（修复两次复发） | 停回用户裁决方案，不自行改设计 |
| max-rounds | 汇总残留问题清单停回用户 |
| reviewer 调用失败 | 按失败原因修复环境后重跑循环 |
| check-all / 真机验收失败 | 按输出修复后从对应步骤重跑 |

## 后续产物接入点（占位登记）

后续批次计划把本流程的全链编排承载迁入仓内 pr-lifecycle workflow 产物（单源构建体系，源在 `.agents/workflows/`）。该产物当前不存在：第 3 步在其可用前按本文件现有流程执行；产物落地时在本节替换为具体发起参数，并把编排职责移交 workflow。本节只是接入点登记，不指向任何现有文件。

## 约束

- 审查基线默认 `base=main`；不设 dev 队列、变更集（changeset）与覆盖率/度量门禁——本包零 npm 运行时依赖、单包交付，无对应设施。
- push 与建 PR 都不在自动动作集内：push 须当场授权，PR 创建不在本流程。
- 四份 reviewer 定义（`.agents/reviewers/review-*.md`，文件名 `review-<维度>.md` 是循环的维度接口）是循环的审查判据来源；调整审查维度时同步维护定义文件与本节的固定清单。
