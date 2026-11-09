/* zcode-workflow
description: tai-ji-yang PR 全生命周期单 workflow：preflight → pnpm check → 四维项目
  reviewer 审查/聚合/分组修复循环 → final pnpm check → 真实 DSH 宿主验收 → PR 标题与
  描述起草 → 停在 awaiting-push。不自动 push、不创建 PR；审查判据来自仓内
  .agents/reviewers/review-*.md。单源生成：由 .agents/workflows/src/pr-lifecycle.shared.ts
  + 本壳经 .agents/workflows/scripts/build-workflows.mjs 生成（勿手工维护；pi 版同源 =
  .agents/workflows/pr-lifecycle.js）。
whenToUse: zcode 主 agent 执行 pr-cr-fix skill 的完整 PR 生命周期时发起本 workflow
  （CreateWorkflow path 指向本文件 + args）。只跑 review+fix 循环不进门禁时用全局 saved
  workflow review-fix-loop。
args:
  base:
    type: string
    description: 审查与 PR 基线 ref 名（git diff base...HEAD），默认 main
    default: main
  maxRounds:
    type: number
    description: 审查→聚合→修复→复审循环轮次上限（1-20），默认 5
    default: 5
  worktree:
    type: string
    description: 目标 git worktree 绝对路径。宿主会话目录就是该 worktree 时可省；zcode 会话目录绑 bare workspace 根时必须传
  verifyUrl:
    type: string
    description: 真实 DSH 验收 URL（scripts/verify/run.mjs --url 形态）。与 verifyEvidenceDir 二选一；都不传时验收显式 skipped
  verifyEvidenceDir:
    type: string
    description: 已生成的验收证据目录（其根含 verdict.json 且 verdict 为 pass/degraded）。与 verifyUrl 二选一
  taskId:
    type: string
    description: 阶段观测任务 id（可选；与 executionId 同时给出才启用观测，缺省零行为差异）
  executionId:
    type: string
    description: 阶段观测执行 id（可选；与 taskId 同时给出才启用；事件落 ~/.agents/skill-data/workflow-observability/<task-id>/<execution-id>.jsonl）
  sampleType:
    type: string
    description: 观测事件采样标记（production | selftest，默认 production；自动化验证用 selftest）
*/

// ── 阶段观测平台钩子（公共观测层由构建器拼入产物；本壳只提供平台钩子）──
// zcode world.run 是 journal 重放语义：resume 后时间戳与写入回放首次记录值，JSONL 不重复。
const OBS_APPEND_SCRIPT =
  "require('fs').mkdirSync(require('path').dirname(process.argv[1]),{recursive:true});" +
  "require('fs').appendFileSync(process.argv[1],process.argv[2]+'\n')";
async function obsNow(): Promise<string | null> {
  const r = await world.run("node", ["-e", "process.stdout.write(new Date().toISOString())"]);
  return r.exitCode === 0 && r.stdout.trim() !== "" ? r.stdout.trim() : null;
}
async function obsAppend(filePath: string, line: string): Promise<string | null> {
  const w = await world.run("node", ["-e", OBS_APPEND_SCRIPT, filePath, line]);
  return w.exitCode === 0 ? null : `exit ${w.exitCode}：${tailLines(w.stderr, 2)}`;
}

@@STITCH@@
