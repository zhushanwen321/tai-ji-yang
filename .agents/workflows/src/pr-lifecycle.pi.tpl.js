/* @pi-meta
name: pr-lifecycle
description: >-
  tai-ji-yang PR 全生命周期单 workflow：preflight → pnpm check → 四维项目 reviewer
  审查/聚合/分组修复循环 → final pnpm check → 真实 DSH 宿主验收 → PR 标题与描述起草 →
  停在 awaiting-push。不自动 push、不创建 PR。单源构建产物，勿手工维护。
when: pi 主 agent 执行 tai-ji-yang pr-cr-fix skill 的完整 PR 生命周期
notFor: 只跑 review+fix 循环不进门禁的场景（用内置 review-fix-loop）与非 tai-ji-yang 仓库
phases: ['发起前检查', '静态与全量项目门禁', '四维审查与修复循环', '终局项目门禁', '真实 DSH 宿主验收', '起草 PR 标题与描述', '停在推送授权前']
parameters:
  type: object
  properties:
    base:
      type: string
      description: 审查与 PR 基线 ref 名（git diff base...HEAD），默认 main
    maxRounds:
      type: integer
      description: 审查→聚合→修复→复审循环轮次上限（1-20），默认 5
    worktree:
      type: string
      description: 目标 git worktree 绝对路径；宿主 cwd 不是该 worktree 时必传
    verifyUrl:
      type: string
      description: 真实 DSH 验收 URL；与 verifyEvidenceDir 二选一，都不传则验收 skipped
    verifyEvidenceDir:
      type: string
      description: 已生成的验收证据目录（根含 verdict.json）；与 verifyUrl 二选一
    taskId:
      type: string
      description: 阶段观测任务 id（与 executionId 同时给出才启用）
    executionId:
      type: string
      description: 阶段观测执行 id（与 taskId 同时给出才启用）
    sampleType:
      type: string
      enum: [production, selftest]
      description: 观测事件采样标记（默认 production；自动化验证用 selftest）
usage: |
  ## 使用说明
  - 目标目录必须是 tai-ji-yang 多包仓库的 git worktree，且工作区全提交、.agents/reviewers/ 四份定义在盘。
  - 发起：workflow 工具 action=run + name=<本脚本绝对路径>（取 <available_workflows> 清单的 location）。
  - args 示例：base=main maxRounds=5 worktree=<绝对路径> verifyUrl=<测试URL> taskId=... executionId=...
  - 终态 return：status=awaiting-push 或 failed；push 与 PR 创建需用户授权后由主 agent/skill 执行。
*/

// ══ pi 壳（平台适配层）══
// 公共体（pr-lifecycle.shared.ts）以 zcode 原生形态书写：字面 agent( 调用 + ask<T> 泛型
// + world.run + files.read + report + artifact。构建管线（scripts/build-workflows.mjs）
// 对公共体做词法安全改写（agent( → wfAgent(、.ask<T>( → .ask("T", ）并剥离 TS 后在
// @@STITCH@@ 处拼入本壳；本段提供全部宿主注入物。生成物勿手工维护。

// ── $ARGS（平铺字符串）→ args 对象（zcode 形态）──
// 本层只做承载形态转换（字符串 → 对象/数字/数组）；白名单校验与类型 fail-fast 全部由
// 公共体参数段接管（单一权威，两平台同一套报错）。_runId 是 pi 引擎注入的内部字段，
// 不属于业务参数，不进 args。未知键同理交给公共体白名单报错。
const fs = require("fs");
const { spawn } = require("child_process");
const strArg = (v) => (typeof v === "string" ? v.trim() : "");
// pi worker 预注入 const args，不能重新声明；原地清空后写入归一化业务参数。
for (const key of Object.keys(args)) delete args[key];
{
  const rawValue = $ARGS;
  const raw = typeof rawValue === "string" && rawValue.trim() !== ""
    ? JSON.parse(rawValue)
    : (rawValue || {});
  if (raw.base !== undefined) args.base = strArg(raw.base);
  if (raw.maxRounds !== undefined) {
    const n = typeof raw.maxRounds === "number" ? raw.maxRounds : /^\d+(\.\d+)?$/.test(strArg(raw.maxRounds)) ? Number(strArg(raw.maxRounds)) : raw.maxRounds;
    args.maxRounds = n;
  }
  if (raw.worktree !== undefined) args.worktree = strArg(raw.worktree);
  if (raw.verifyUrl !== undefined) args.verifyUrl = strArg(raw.verifyUrl);
  if (raw.verifyEvidenceDir !== undefined) args.verifyEvidenceDir = strArg(raw.verifyEvidenceDir);
  if (raw.taskId !== undefined) args.taskId = strArg(raw.taskId);
  if (raw.executionId !== undefined) args.executionId = strArg(raw.executionId);
  if (raw.sampleType !== undefined) args.sampleType = strArg(raw.sampleType);
}

// ── 结构化返回 schema（公共体 ask<T> 的 T → 手写 JSON Schema；引擎 ajv 校验）──
const SCHEMA_BY_KEY = {
  ReviewerVerdict: {
    type: "object",
    required: ["reportFile", "mustFix", "suggestion", "reconciliation"],
    properties: {
      reportFile: { type: "string", description: "报告绝对路径，必须等于派发 output" },
      mustFix: { type: "number", description: "critical+major 计数" },
      suggestion: { type: "number", description: "minor 计数" },
      reconciliation: {
        type: "array",
        description: "R1 恒为 []；R2+ 对注入清单逐条申报",
        items: {
          type: "object",
          required: ["prevId", "status", "evidence"],
          properties: {
            prevId: { type: "string" },
            status: { type: "string", enum: ["fixed", "not-fixed", "regressed", "escalate"] },
            evidence: { type: "string", description: "亲自核实的 file:line 事实" },
          },
        },
      },
    },
  },
  Aggregation: {
    type: "object",
    required: ["reportFile", "issues", "groups"],
    properties: {
      reportFile: { type: "string", description: "聚合报告绝对路径" },
      issues: {
        type: "array",
        description: "去重后的活跃问题；clean 时空数组",
        items: {
          type: "object",
          required: ["id", "title", "severity", "files", "evidence", "guidance", "reviewer"],
          properties: {
            id: { type: "string", description: "延续上轮复用原 id；新问题留空由 workflow 分配" },
            title: { type: "string" },
            severity: { type: "string", enum: ["critical", "major", "minor"] },
            files: { type: "array", items: { type: "string" } },
            evidence: { type: "string" },
            guidance: { type: "string" },
            reviewer: { type: "string" },
          },
        },
      },
      groups: {
        type: "array",
        description: "修复分组；组间文件不相交",
        items: {
          type: "object",
          required: ["id", "issueIds", "files", "note"],
          properties: {
            id: { type: "string" },
            issueIds: { type: "array", items: { type: "string" } },
            files: { type: "array", items: { type: "string" } },
            note: { type: "string" },
          },
        },
      },
    },
  },
  FixerOutcome: {
    type: "object",
    required: ["fixed", "changedFiles", "commitMessage", "notes"],
    properties: {
      fixed: { type: "boolean" },
      changedFiles: { type: "array", items: { type: "string" } },
      commitMessage: { type: "string", description: "一行英文 conventional subject；commit 由 workflow 执行" },
      notes: { type: "string" },
    },
  },
  PrMeta: {
    type: "object",
    required: ["titleFile", "bodyFile", "title"],
    properties: {
      titleFile: { type: "string" },
      bodyFile: { type: "string" },
      title: { type: "string", description: "conventional commit 风格英文标题" },
    },
  },
};

// ── agent 适配（wfAgent：zcode 链式形态 → pi callSpec 单发形态）──
// persona 参数拼进 prompt 头部（pi 引擎无独立 persona 槽；与既有 pi 版 prompt 首段
// persona 文本形态一致）。ask 判别：第一参数命中 SCHEMA_BY_KEY = typeKey 形态（带
// schema 结构化返回）；否则整串是 prompt（无 schema 散文返回——gate 修复 agent /
// 环境恢复 agent 的 ask<string> 与无泛型 ask 都落在此路）。
function parseResult(value) {
  if (value && typeof value === "object") return value;
  if (typeof value === "string" && value.trim() !== "") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function wfAgent(name, persona) {
  return {
    ask: async (typeKeyOrPrompt, maybePrompt) => {
      const hasSchema = typeof typeKeyOrPrompt === "string" && Object.prototype.hasOwnProperty.call(SCHEMA_BY_KEY, typeKeyOrPrompt);
      const prompt = hasSchema ? maybePrompt : typeKeyOrPrompt;
      const callSpec = { prompt: persona + "\n\n" + prompt, description: name, model: $MODEL, returnMeta: true };
      if (hasSchema) callSpec.schema = SCHEMA_BY_KEY[typeKeyOrPrompt];
      const raw = await agent(callSpec);
      if (raw && typeof raw === "object" && raw.error) {
        throw new Error(name + " 调用失败： " + raw.error);
      }
      const parsed = parseResult(raw && typeof raw === "object" && "value" in raw ? raw.value : raw);
      if (!parsed) {
        throw new Error(name + " 返回无效（无法解析为结构化对象）： " +
          String(typeof raw === "object" ? JSON.stringify(raw.value ?? raw) : raw).slice(0, 200));
      }
      return parsed;
    },
  };
}

// ── 子进程包装（zcode world.run 同构返回）。async spawn + POSIX 进程组（detached）：
// gate 脚本会派生 pnpm/vitest 子树，spawnSync 超时只杀直接子进程会留孤儿继续写
// .review/ 并与下一轮 gate 并发争资源——超时必须整组 kill；async 化同时让 worker
// 事件循环在长 gate 期间可处理 abort 消息。ENOENT（命令不在 PATH）归一为既有
// 「exit 2 工具错误」约定 + [cmd-missing] stderr 标记：gate 循环按 exit 2 不派
// 修复 agent 空烧，调用方按标记给安装指引。
// abort 边界（引擎能力缺口，脚本侧无法回收）：abort/terminate 只杀 worker 线程，
// 不通知本脚本——detached gate 子树会继续跑完（写 .review/）；重新发起前人工核对
// 是否还有相关子进程残留，避免旧进程写同一 run 目录。
const CMD_MISSING = "[cmd-missing]";
function killGroup(child, sig) {
  try {
    if (process.platform !== "win32" && child.pid) process.kill(-child.pid, sig);
    else child.kill(sig);
  } catch {
    // 进程/组已退出
  }
}
// 子进程缺省墙钟 2h（>1h）——git commit（pre-commit 全套钩子分钟级）等重子进程不再
// 无界挂死，也防未来新增调用点漏传超时吃到隐性无界
const DEFAULT_RUN_TIMEOUT_MS = 7_200_000;
function runCmd(cmd, argsArr, timeoutMs = DEFAULT_RUN_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const child = spawn(cmd, argsArr, {
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32", // POSIX：子进程任组长，超时可整组 kill
    });
    // 64MB 上限（对齐原 spawnSync maxBuffer）：滚动保留**末段**——诊断消费方全部
    // 用 tailLines 取尾，截断保头会让错误摘要点位失效
    const cap = 64 * 1024 * 1024;
    const collect = (chunksRef) => {
      const chunks = chunksRef.chunks;
      return (d) => {
        chunks.push(d);
        chunksRef.len += d.length;
        while (chunksRef.len > cap) {
          chunksRef.len -= chunks[0].length;
          chunks.shift();
          chunksRef.truncated = true;
        }
      };
    };
    const outRef = { chunks: [], len: 0, truncated: false };
    const errRef = { chunks: [], len: 0, truncated: false };
    child.stdout.on("data", collect(outRef));
    child.stderr.on("data", collect(errRef));
    let timedOut = false;
    const timeoutNote = (t) => t
      ? "\n[timeout] 子进程超时被终止（整进程组：" + cmd + " " + argsArr.join(" ") + "）"
      : "";
    const truncateNote = (ref, label) => (ref.truncated ? "\n[truncated] " + label + " 超 64MB，仅保留末段" : "");
    let timer = null;
    let killer = null;
    let forceSettle = null;
    const settle = (exitCode, extraStderr) => {
      if (timer) clearTimeout(timer);
      if (killer) clearTimeout(killer);
      if (forceSettle) clearTimeout(forceSettle);
      resolve({
        exitCode,
        stdout: Buffer.concat(outRef.chunks).toString("utf-8"),
        stderr: Buffer.concat(errRef.chunks).toString("utf-8") +
          truncateNote(outRef, "stdout") + truncateNote(errRef, "stderr") + (extraStderr || ""),
      });
    };
    if (typeof timeoutMs === "number") {
      timer = setTimeout(() => {
        timedOut = true;
        killGroup(child, "SIGTERM");
        killer = setTimeout(() => killGroup(child, "SIGKILL"), 10_000); // 顽固子树宽限后强杀
        // 兜底回收：孙进程若 setsid 脱离进程组且继承 stdout 写端，close 事件永不触发
        // （父进程持有读端）——SIGKILL 宽限后再等 5s 强制 settle，杜绝 gate 无限挂起
        forceSettle = setTimeout(() => {
          killGroup(child, "SIGKILL");
          settle(124, timeoutNote(true) + "\n[force-settle] 进程组回收超时强制返回（孙进程可能脱离进程组存活，人工核查残留进程）");
        }, timeoutMs + 15_000);
      }, timeoutMs);
    }
    child.on("error", (err) => {
      if (err && err.code === "ENOENT") {
        settle(2, CMD_MISSING + " 命令不存在: " + cmd + "（不在 PATH）——安装该命令后重新发起\n");
      } else {
        settle(1, "[spawn-error] " + String(err && err.message ? err.message : err) + "\n");
      }
    });
    child.on("close", (code) => {
      // timedOut 强制 124：子树捕获 SIGTERM 后以 exit 0 退出的形态不得记 PASS
      settle(timedOut ? 124 : (code === null ? 1 : code), timeoutNote(timedOut));
    });
  });
}

// ── 其余宿主注入物（zcode 通道 → pi 等价物）──
const world = {
  run: (cmd, argsArr, opts) =>
    runCmd(cmd, argsArr, opts && Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : undefined),
};
const files = {
  read: async (p) => fs.readFileSync(p, "utf-8"),
};
const report = (obj) => log("[report] " + JSON.stringify(obj));
const artifact = {
  // pi 无终态摘要卡片通道：return 值经 notifyDone 直达主 agent，摘要走 log
  markdown: async (_name, content) => { log(content); },
};

// ── 阶段观测平台钩子（O 区；公共观测层 observability.shared.ts 经构建器拼入本产物，
// 业务正文只声明阶段边界）──
// 事件契约与落盘路径由公共层单一承载；本壳只提供两个平台钩子：obsNow（pi worker 内直取，
// 无 journal 重放语义——每次 run 实写）与 obsAppend（fs 直写）。观测为辅助通道：写失败
// 由公共层统一告警（同文件一次）不改业务终态（与 zcode 壳同契约）。
async function obsNow() {
  return new Date().toISOString();
}
async function obsAppend(filePath, line) {
  try {
    fs.mkdirSync(require("path").dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, line + "\n");
    return null;
  } catch (e) {
    return e && e.message ? e.message : String(e);
  }
}

@@STITCH@@
