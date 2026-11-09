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

// ============================================================================
// observability.shared.ts — workflow 阶段事件观测层（单一构建输入）
// 已接入观测的 workflow（正文含 initObservation 调用点）由 scripts/build-workflows.mjs
// 把本文件全文拼进其两侧产物（先于业务正文——obsCtx 为 let，业务顶层赋值依赖声明在前）；
// 未接入的 workflow 不拼。本文件与业务 shared 一起过词法改写与 TS 剥离管线，无 import。
//
// 事件契约（改字段须同步 scripts/build-workflows.mjs 的 OBS_EVENT_FIELDS 与
// scripts/workflow-observe.mjs）：
//   {execution_id, task_id, skill, stage, step, round, attempt, event, timestamp,
//    sample_type[, skill_version][, outcome]}
// skill_version（增量可选字段，D6）：恒取构建器注入的 SKILL_VERSION 常量——事件回答
// 「谁在执行」，执行存量产物（产物无版本字段）时也记引擎当前版本，不记 unknown
//（unknown 仅用于 stats 的 estimated 口径归因桶）；本层只经构建器拼接消费，单独执行
// 时无该常量属拼接契约破坏（失败出声，不做静默兜底）。
// 落点 ~/.agents/skill-data/workflow-observability/<task-id>/<execution-id>.jsonl——
// 每次执行独立文件，并发执行互不干扰。
// 启用条件 = args.taskId 与 args.executionId 同时提供；都不传 = 观测关闭（可选兼容，
// 业务照常）；只传其一 / ID 含路径不安全字符 / sampleType 非法 → 告警并关闭（错误可
// 操作，不静默吞）；写失败 → 告警（同文件只告警一次）不改业务终态——观测是辅助功能，
// 故障不拖垮主流程。观测只记归属与边界，不采集 token。
// IO 通道经壳的 obsNow/obsAppend 平台钩子（zcode = world.run journal 语义，resume 重放
// 回放首次记录值；pi = world.run，其 shim 内为 spawnSync，无 journal 重放语义，每次
// run 实写）。
// attempt 字段语义 = 事件发生时点的重发起序号：启动早期（自动检测未完成）为 null，
// 检测确定后由调用方回填 obsCtx.attempt，其后的事件带值。
// ============================================================================
let obsCtx = null;
/** ID 路径安全窄化：task-id 是观测根下的目录名、execution-id 是文件名主干——仅放行
 *  字母数字开头、只含字母/数字/点/连字符/下划线、≤128 字符、无连续点与结尾点的值，
 *  路径穿越形态（..、分隔符、空白、引号）一律拒绝 */
function obsSafeId(v) {
    if (typeof v !== "string")
        return null;
    const s = v.trim();
    return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(s) && !s.includes("..") && !s.endsWith(".") ? s : null;
}
/** 观测启用（形态层，纯同步，不依赖 home）：参数形态校验 + 上下文组装。先于业务参数
 *  窄化调用，保证已传合法观测 ID 的执行（含后续参数校验失败早退）都有 execution 边界。
 *  返回 null = 本次关闭（合法关闭不告警，告警关闭经 log 输出恢复动作——关闭本身不静默）。
 *  attempt 未知时传 null，检测确定后回填 obsCtx.attempt */
function initObservation(skill, stage, attempt) {
    const hasTask = typeof args.taskId === "string" && args.taskId.trim() !== "";
    const hasExec = typeof args.executionId === "string" && args.executionId.trim() !== "";
    if (!hasTask && !hasExec)
        return null;
    if (hasTask !== hasExec) {
        log(`WARN: 观测参数不完整（taskId=${hasTask ? "已传" : "缺"}、executionId=${hasExec ? "已传" : "缺"}）——两参须同时提供才记录观测，本次不写观测事件。恢复动作：同时传 taskId 与 executionId，或都不传`);
        return null;
    }
    const taskId = obsSafeId(args.taskId);
    const executionId = obsSafeId(args.executionId);
    if (taskId === null || executionId === null) {
        log(`WARN: 观测参数含路径不安全字符（taskId=${JSON.stringify(args.taskId)}、executionId=${JSON.stringify(args.executionId)}——合法形态：字母/数字开头，只含字母、数字、点、连字符、下划线，≤128 字符，禁「..」与结尾点）——本次不写观测事件。恢复动作：改用安全 ID 后重新发起`);
        return null;
    }
    const rawSampleType = typeof args.sampleType === "string" ? args.sampleType.trim() : "";
    if (rawSampleType !== "" && rawSampleType !== "production" && rawSampleType !== "selftest") {
        log(`WARN: 观测参数 sampleType=${JSON.stringify(args.sampleType)} 非法（合法值：production / selftest）——本次不写观测事件。恢复动作：修正 sampleType 后重新发起`);
        return null;
    }
    const sampleType = rawSampleType === "selftest" ? "selftest" : "production";
    return {
        executionId,
        taskId,
        skill,
        stage,
        attempt,
        sampleType,
        filePath: "",
        openStep: null,
        warnedWrite: false,
    };
}
/** 观测落盘路径装配（home 探针成功后调用一次）；obsCtx 关闭时无操作 */
function obsAttachHome(home) {
    const c = obsCtx;
    if (c === null)
        return;
    c.filePath = `${home}/.agents/skill-data/workflow-observability/${c.taskId}/${c.executionId}.jsonl`;
}
/** 写一条观测事件。时间戳经壳钩子取（zcode journal 语义下跨 resume 确定性回放）；
 *  时间戳探针失败、落盘路径未装配（home 未就绪）或写入失败只告警（写失败同文件一次），
 *  不改变业务终态 */
async function obsEmit(step, round, event, outcome) {
    const c = obsCtx;
    if (c === null)
        return;
    if (c.filePath === "") {
        log("WARN: 观测落盘路径未装配（home 探针未完成或失败）——本条观测事件未记录，业务不受影响。恢复动作：确认 node 可执行后重跑");
        return;
    }
    const timestamp = await obsNow();
    if (timestamp === null) {
        log("WARN: 观测时间戳探针失败（node 子进程无输出）——本条观测事件未记录，业务不受影响。恢复动作：确认 node 可执行后重跑");
        return;
    }
    const rec = {
        execution_id: c.executionId,
        task_id: c.taskId,
        skill: c.skill,
        stage: c.stage,
        step,
        round,
        attempt: c.attempt,
        event,
        timestamp,
        sample_type: c.sampleType,
        skill_version: SKILL_VERSION,
    };
    if (outcome !== null)
        rec.outcome = outcome;
    const err = await obsAppend(c.filePath, JSON.stringify(rec));
    if (err !== null && !c.warnedWrite) {
        c.warnedWrite = true;
        log(`WARN: 观测事件写入失败（${c.filePath}）：${err}——同类失败不再重复告警，业务不受影响。恢复动作：确认该路径父目录可写（或换 executionId）后重跑`);
    }
}
/** 阶段边界：串行阶段开始记 start（同一时刻至多一个打开 step）。上一阶段尚未结束即
 *  开新阶段 = 观测序列异常：显式告警并给前一阶段补记 end（outcome=abandoned），不静默
 *  覆盖——业务流程不受影响，事件序列仍完整可对账 */
async function obsBegin(step, round) {
    const c = obsCtx;
    if (c === null)
        return;
    if (c.openStep !== null) {
        const prev = c.openStep;
        c.openStep = null;
        log(`WARN: 观测阶段重叠：step「${prev.step}」尚未结束即开始「${step}」——已给前一阶段补记 end（outcome=abandoned），业务不受影响。恢复动作：检查前一阶段的 obsEnd 配对（提前离开的路径是否漏补记）`);
        await obsEmit(prev.step, prev.round, "end", "abandoned");
    }
    c.openStep = { step, round };
    await obsEmit(step, round, "start", null);
}
/** 阶段边界：自然完成记 end（无 outcome——outcome 只出现在终态统一补记或异常补记的
 *  end 上，值 = 本次执行的 terminated 词或 abandoned/script-error）。
 *  配对检查：step/round 与打开阶段不符，或当前无打开阶段时——显式告警（可操作恢复
 *  动作）；无打开阶段不写任何事件（无 start 不伪造 end），阶段错位给实际打开阶段补
 *  abandoned end（收到的错名 end 不落盘）。业务流程不受影响 */
async function obsEnd(step, round) {
    const c = obsCtx;
    if (c === null)
        return;
    if (c.openStep === null) {
        log(`WARN: 观测配对异常：收到 step「${step}」（round=${round}）的 obsEnd，但当前无打开中的阶段——未写 end 事件（无 start 不伪造 end），业务不受影响。恢复动作：检查该 step 的 obsBegin/obsEnd 配对（是否重复调用或 start 路径提前离开）`);
        return;
    }
    if (c.openStep.step !== step || c.openStep.round !== round) {
        const open = c.openStep;
        c.openStep = null;
        log(`WARN: 观测配对异常：收到 step「${step}」（round=${round}）的 obsEnd，但当前打开的是「${open.step}」（round=${open.round}）——已给实际打开阶段补记 end（outcome=abandoned），收到的 end 未写（无对应 start 不伪造），业务不受影响。恢复动作：检查两处调用的 step/round 实参是否写反或错位`);
        await obsEmit(open.step, open.round, "end", "abandoned");
        return;
    }
    c.openStep = null;
    await obsEmit(step, round, "end", null);
}
/** withStage：串行阶段包装器（obsBegin → fn → obsEnd）。fn 内经收尾出口提前离开时
 *  openStep 已被 obsCloseExecution 清空（end 已由终态统一补记），finally 不重复补
 *  end；fn 抛异常且 step 仍打开 = 脚本级中断，finally 补 end（outcome=script-error） */
async function withStage(step, round, fn) {
    await obsBegin(step, round);
    let didThrow = false;
    try {
        return await fn();
    }
    catch (e) {
        didThrow = true;
        throw e;
    }
    finally {
        const c = obsCtx;
        if (c !== null && c.openStep !== null && c.openStep.step === step) {
            c.openStep = null;
            await obsEmit(step, round, "end", didThrow ? "script-error" : null);
        }
    }
}
/** 终态统一补记：给打开中的 step 补记 end（带 outcome=本次执行终态）+ 写 execution
 *  end。由终态统一出口调用（各 workflow 的 finish / 收尾段 / 启动期失败离开点） */
async function obsCloseExecution(outcome) {
    const c = obsCtx;
    if (c === null)
        return;
    const open = c.openStep;
    c.openStep = null;
    if (open !== null)
        await obsEmit(open.step, open.round, "end", outcome);
    await obsEmit("execution", null, "end", outcome);
}
const OBS_LAYER_SHA256 = "176ef8dfb549fe0d7e783035a9ede755e1d95b973914324958b6d13935244ee3"; // 构建注入：公共观测层安装位源（~/.agents/scripts/workflow-observability.shared.ts）内容 sha256，setup 首步现算比对
const SKILL_VERSION = "pr-lifecycle-60f57d73"; // 构建注入：观测层 skill_version 溯源常量（taiji 无 frontmatter 版本源，取 shared 源 hash 前 8 位）
// pr-lifecycle — tai-ji-yang PR 全生命周期单源公共体（唯一业务源）
// 本文件不直接发起。zcode 与 pi 产物由 .agents/workflows/scripts/build-workflows.mjs
// 从本文件 + 两个平台壳生成；产物禁止手工维护。
//
// 首版阶段：preflight → static-gate → cr-fix（审查→聚合→分组修复→复审）→
// final-gates → acceptance → pr-meta → awaiting-push。
// 本 workflow 不执行 git push，不调用 GitHub CLI 创建/修改 PR；用户授权后的 push 与
// PR 创建由 .agents/skills/pr-cr-fix/SKILL.md 承接。接受承接审查判据 =
// <worktree>/.agents/reviewers/review-*.md 四份项目 reviewer。
//
// 平台差异（agent 调用、world.run、args 承载形态、schema 声明）全部由壳适配；本文件
// 保持 zcode 原生形态（字面 agent( 调用点 + ask<T> 泛型）。失败一律 return failed，
// 不 throw——errored run 不可续跑且丢失结构化失败信息。
// ── 显式 worktree 根（zcode 会话目录常是 bare workspace 根，必须能显式指定）──
let wt = "";
const shellQuote = (p) => `'${p.replaceAll("'", "'\\''")}'`;
// 恒经 world.run("bash", ...) 字面量命令（编译期字面量约束）；业务参数走位置参数。
const runSh = (cmd, a = [], opts) => {
    const bashArgs = ["-c", wt === "" ? `exec "$@"` : `cd ${shellQuote(wt)} && exec "$@"`, "bash", cmd, ...a];
    return opts === undefined
        ? world.run("bash", bashArgs)
        : world.run("bash", bashArgs, opts);
};
// 观测层源 hash 探针：构建期把安装位观测层拼进产物，运行时现算比对，防源更新后带旧层跑。
const NODE_OBS_HASH = "const fs=require('fs'),c=require('crypto'),p=require('path');" +
    "const f=p.join(require('os').homedir(),'.agents','scripts','workflow-observability.shared.ts');" +
    "try{process.stdout.write(c.createHash('sha256').update(fs.readFileSync(f)).digest('hex'))}" +
    "catch{process.stdout.write('missing')}";
const NODE_HOME = "process.stdout.write(require('os').homedir())";
const NODE_ISO_NOW = "process.stdout.write(new Date().toISOString())";
// ── 参数窄化 + 白名单（拼错键静默回落默认值比报错危险，fail-fast）──
obsCtx = initObservation("pr-cr-fix", "pr-lifecycle", null);
{
    const obsHomeRes = await runSh("node", ["-e", NODE_HOME]);
    if (obsHomeRes.exitCode === 0 && obsHomeRes.stdout.trim() !== "")
        obsAttachHome(obsHomeRes.stdout.trim());
}
await obsEmit("execution", null, "start", null);
async function failObs(kind, msg) {
    await obsCloseExecution(kind);
    throw new Error(msg);
}
{
    const probe = await world.run("node", ["-e", NODE_OBS_HASH]);
    const actual = probe.exitCode === 0 ? probe.stdout.trim() : "";
    if (actual === "") {
        await failObs("setup-failure", `观测层源 hash 探针未产出判定（node exit ${probe.exitCode}）——确认宿主 node 可用后重新发起`);
    }
    if (actual === "missing") {
        await failObs("setup-failure", "观测层源文件缺失（安装位 ~/.agents/scripts/workflow-observability.shared.ts）。恢复：重建安装 symlink 后重跑 node .agents/workflows/scripts/build-workflows.mjs");
    }
    if (actual !== OBS_LAYER_SHA256) {
        await failObs("setup-failure", `观测层源已更新而产物未重建（源 ${actual.slice(0, 12)}… ≠ 产物 ${OBS_LAYER_SHA256.slice(0, 12)}…）。恢复：node .agents/workflows/scripts/build-workflows.mjs 后重新发起`);
    }
}
const VALID_ARG_KEYS = new Set(["base", "maxRounds", "worktree", "verifyUrl", "verifyEvidenceDir", "taskId", "executionId", "sampleType"]);
for (const key of Object.keys(args)) {
    if (!VALID_ARG_KEYS.has(key)) {
        await failObs("invalid-args", `未知参数: ${key}（合法参数: ${[...VALID_ARG_KEYS].join("/")}）`);
    }
}
const rawWorktree = typeof args.worktree === "string" ? args.worktree.trim() : "";
if (rawWorktree !== "" && !rawWorktree.startsWith("/")) {
    await failObs("invalid-args", `参数 worktree 非法：${rawWorktree}（应为 worktree 绝对路径；宿主会话目录不是目标 worktree 时必传）`);
}
wt = rawWorktree;
if (rawWorktree !== "") {
    const probeScript = `if [ -d ${shellQuote(rawWorktree)} ]; then echo dir; elif [ -e ${shellQuote(rawWorktree)} ]; then echo file; else echo missing; fi`;
    const probe = await world.run("bash", ["-c", probeScript]);
    const shape = probe.exitCode === 0 ? probe.stdout.trim() : "";
    if (shape !== "dir") {
        await failObs("invalid-args", `worktree 参数不是目录：${rawWorktree}（探测结果 ${shape || "unknown"}）。恢复：核对路径后重新发起`);
    }
}
const baseRaw = typeof args.base === "string" ? args.base.trim() : "";
const base = baseRaw !== "" ? baseRaw : "main";
if (args.maxRounds !== undefined && (typeof args.maxRounds !== "number" || !Number.isFinite(args.maxRounds) || args.maxRounds < 1)) {
    await failObs("invalid-args", `参数 maxRounds 非法：${String(args.maxRounds)}（应为 ≥1 的数字，上界 20 自动截断）`);
}
const maxRounds = typeof args.maxRounds === "number" && args.maxRounds >= 1 ? Math.min(20, Math.floor(args.maxRounds)) : 5;
const verifyUrl = typeof args.verifyUrl === "string" ? args.verifyUrl.trim() : "";
const verifyEvidenceDir = typeof args.verifyEvidenceDir === "string" ? args.verifyEvidenceDir.trim() : "";
if (verifyUrl !== "" && verifyEvidenceDir !== "") {
    await failObs("invalid-args", "verifyUrl 与 verifyEvidenceDir 二选一：前者现跑真实宿主验收，后者消费已生成的验收证据");
}
// ── 结构化执行 helper ──
function tailLines(text, count) {
    return text.split("\n").slice(-count).join("\n");
}
function textOf(result) {
    return `${result.stdout}${result.stderr}`.trim();
}
async function runOrThrow(label, cmd, cmdArgs, opts) {
    const result = await runSh(cmd, cmdArgs, opts);
    if (result.exitCode !== 0) {
        throw new Error(`${label} 失败（exit ${result.exitCode}）：${textOf(result).slice(-2000)}`);
    }
    return result;
}
function porcelainPaths(result) {
    return result.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "")
        .map((line) => (line.startsWith('"') ? line.slice(1, -1) : line))
        .map((line) => (line.includes(" -> ") ? line.split(" -> ")[1] ?? "" : line.slice(3)))
        .filter((p) => p !== "");
}
const REVIEWER_FILES = [
    ".agents/reviewers/review-business-logic.md",
    ".agents/reviewers/review-dsh-contract.md",
    ".agents/reviewers/review-dsh-lifecycle.md",
    ".agents/reviewers/review-dsh-ui.md",
];
const REVIEWER_DIMENSIONS = ["business-logic", "dsh-contract", "dsh-lifecycle", "dsh-ui"];
const runDir = wt === "" ? ".review/pr-lifecycle" : `${wt}/.review/pr-lifecycle`;
const isoNowRes = await runSh("node", ["-e", NODE_ISO_NOW]);
const runId = isoNowRes.exitCode === 0 && isoNowRes.stdout.trim() !== ""
    ? isoNowRes.stdout.trim().replaceAll(":", "-")
    : "run";
const runAbsDir = wt === "" ? `${runDir}/${runId}` : `${wt}/.review/pr-lifecycle/${runId}`;
function reviewerPersona(dimension) {
    return [
        `你是 tai-ji-yang 多包仓库（根包 tai-ji-yang-shell 与 packages/ 子包）的 ${dimension} 审查员：diff 可能涉及任一包，按 reviewer 定义中对应包的判据审（定义含子包判据节）。`,
        "先完整读取派发 prompt 给出的项目 reviewer 定义，并按它的判据、只报告不改代码的约束、报告格式与结构化返回协议执行。",
        "所有 git/diff 命令都必须先进入派发 prompt 给出的 worktree 目录；不要依赖当前 shell cwd。",
        "若定义或项目规范文件缺失，立即返回说明缺失路径的结论，不要凭记忆空审。",
    ].join("\n");
}
function reviewerPrompt(input) {
    const previous = input.previousIssues.length === 0
        ? "本轮是 R1：reconciliation 返回 []。"
        : [
            `本轮是 R${input.round}（聚焦复审）。上一轮活跃问题清单 JSON：`,
            JSON.stringify(input.previousIssues),
            "对每个 prevId 逐条申报 fixed/not-fixed/regressed/escalate；fixed 必须亲自读代码取证。",
        ].join("\n");
    return [
        `worktree=${wt}`,
        `base=${base}`,
        `先 Read 项目 reviewer 定义：${input.definition}`,
        `审查范围：先在 worktree 执行 git diff ${base}...HEAD；再执行 git status --porcelain 与 git diff 覆盖未提交改动。`,
        "不要修改任何仓库文件；报告写到下面 output 绝对路径（可创建所在目录）。",
        previous,
        `output=${input.output}`,
        "最终按定义返回结构化 JSON；reportFile 必须等于 output。",
    ].join("\n");
}
function aggregatePrompt(input) {
    return [
        `worktree=${wt}`,
        "你是审查聚合裁决员：读取四份 reviewer 报告，按同根因合并、去掉机器检查已覆盖项，只保留有代码证据的活跃问题。",
        "不得凭空造文件名或字段；对报告中的每个关键事实抽查源码；证据不足的条目丢弃并在报告说明。",
        "输出报告到 output 绝对路径；结构化 issues 必须去重、按 severity 排序、files 用仓库相对路径。",
        "groups 按「同文件/同模块/同根因」分组；组间 files 不得相交；issueIds 必须引用本轮 issues 的 id。",
        `上一轮活跃问题 JSON（延续 id）：${JSON.stringify(input.previousIssues)}`,
        `reviewer 报告路径：${input.reports.join(" ; ")}`,
        `output=${input.output}`,
        `本轮 round=${input.round}。`,
    ].join("\n");
}
function fixerPrompt(input) {
    const groupIssues = input.issues.filter((issue) => input.group.issueIds.includes(issue.id));
    return [
        `worktree=${wt}`,
        `你是修复组 ${input.group.id} 的代码修复员（第 ${input.round} 轮）。只修复下列问题，不做无关重构。`,
        "先 Read 项目 AGENTS.md、docs/ARCHITECTURE.md、docs/DSH-PLUGIN-RULES.md；改动必须遵守项目决策与护栏。",
        `分组依据：${input.group.note}`,
        `问题清单 JSON：${JSON.stringify(groupIssues)}`,
        "允许修改仓库文件；禁止 git add/commit/restore/checkout；完成后跑受影响的最小测试（如 pnpm test <path>）。",
        "changedFiles 只列实际改动的仓库相对路径；commitMessage 给一行英文 conventional subject，commit 由 workflow 引擎统一执行。",
    ].join("\n");
}
let branch = "";
let head = "";
let staticGate = "failed";
let finalGate = "skipped";
let reviewTerminated = "max-rounds";
let reviewRounds = 0;
let lastMustFix = 0;
let lastSuggestion = 0;
const acceptance = { status: "skipped", detail: "未执行", artifactsDir: "" };
let prMeta = null;
const residualFiles = [];
const skipped = [];
let failedStep = "";
let failureMessage = "";
let recoveryHint = "";
try {
    // ── preflight ────────────────────────────────────────────────────────────
    await obsBegin("preflight", null);
    phase("发起前检查");
    const gitCheck = await runSh("git", ["rev-parse", "--is-inside-work-tree"]);
    if (gitCheck.exitCode !== 0 || gitCheck.stdout.trim() !== "true") {
        throw new Error(`目标目录不是 git worktree：${wt || "(环境 cwd)"}。恢复：传 worktree=<git worktree 绝对路径>`);
    }
    const baseCheck = await runSh("git", ["rev-parse", "--verify", base]);
    if (baseCheck.exitCode !== 0) {
        throw new Error(`base ref 不存在：${base}。恢复：核对分支名或显式传 base`);
    }
    const branchRes = await runSh("git", ["branch", "--show-current"]);
    branch = branchRes.stdout.trim();
    if (branch === "") {
        throw new Error("当前处于 detached HEAD；PR lifecycle 需要具名分支。恢复：先建立/切换工作分支（须用户授权的分支操作）");
    }
    const headRes = await runSh("git", ["rev-parse", "HEAD"]);
    head = headRes.stdout.trim();
    const commitRange = await runSh("git", ["rev-list", "--count", `${base}..HEAD`]);
    if (commitRange.stdout.trim() === "0") {
        throw new Error(`分支相对 ${base} 没有 commits，没有审查对象。恢复：先完成并提交本分支改动`);
    }
    const statusRes = await runSh("git", ["status", "--porcelain"]);
    if (statusRes.stdout.trim() !== "") {
        throw new Error(`工作区不干净（preflight 要求全提交）：${porcelainPaths(statusRes).join(", ")}. 恢复：先按完成即提交纪律 commit，或先处置无关改动`);
    }
    for (const rel of REVIEWER_FILES) {
        const probe = await runSh("test", ["-f", rel]);
        if (probe.exitCode !== 0) {
            throw new Error(`项目 reviewer 定义缺失：${rel}. 恢复：先提交 .agents/reviewers/ 四份定义`);
        }
    }
    const nodeCheck = await runSh("node", ["--version"]);
    if (nodeCheck.exitCode !== 0)
        throw new Error("node 不可用（preflight）。恢复：确认 PATH 后重跑");
    const pnpmCheck = await runSh("pnpm", ["--version"]);
    if (pnpmCheck.exitCode !== 0)
        throw new Error("pnpm 不可用（preflight）。恢复：安装/启用 pnpm 后重跑");
    await obsEnd("preflight", null);
    // ── static-gate ──────────────────────────────────────────────────────────
    await obsBegin("static-gate", null);
    phase("静态与全量项目门禁");
    const staticCheck = await runSh("pnpm", ["check"], { timeoutMs: 1_800_000 });
    if (staticCheck.exitCode !== 0) {
        throw new Error(`pnpm check 失败（static-gate）：${textOf(staticCheck).slice(-3000)}`);
    }
    staticGate = "pass";
    await obsEnd("static-gate", null);
    // ── cr-fix ───────────────────────────────────────────────────────────────
    phase("四维审查与修复循环");
    const businessReviewer = wfAgent("业务审查员", reviewerPersona("business-logic"));
    const contractReviewer = wfAgent("宿主契约审查员", reviewerPersona("dsh-contract"));
    const lifecycleReviewer = wfAgent("生命周期审查员", reviewerPersona("dsh-lifecycle"));
    const uiReviewer = wfAgent("界面与样式审查员", reviewerPersona("dsh-ui"));
    const aggregator = wfAgent("审查聚合裁决员", "你是对抗式聚合裁决员：只保留有代码证据的真实问题，去重、定级、分组；不造字段，不把机器检查已覆盖项重复上报。");
    let previousIssues = [];
    let minMustFix = Number.POSITIVE_INFINITY;
    let stuckRounds = 0;
    await obsBegin("cr-fix", null);
    for (let round = 1; round <= maxRounds; round += 1) {
        reviewRounds = round;
        await obsBegin("review", round);
        const roundDir = `${runAbsDir}/round-${round}`;
        const reportPaths = REVIEWER_DIMENSIONS.map((dimension, index) => `${roundDir}/review-${dimension}.md`);
        const prompts = REVIEWER_DIMENSIONS.map((dimension, index) => ({
            dimension,
            definition: `${wt}/${REVIEWER_FILES[index]}`,
            output: reportPaths[index],
            round,
            previousIssues,
        }));
        const verdicts = await Promise.all([
            businessReviewer.ask("ReviewerVerdict", reviewerPrompt(prompts[0])),
            contractReviewer.ask("ReviewerVerdict", reviewerPrompt(prompts[1])),
            lifecycleReviewer.ask("ReviewerVerdict", reviewerPrompt(prompts[2])),
            uiReviewer.ask("ReviewerVerdict", reviewerPrompt(prompts[3])),
        ]);
        for (let i = 0; i < verdicts.length; i += 1) {
            const verdict = verdicts[i];
            if (verdict.reportFile !== reportPaths[i]) {
                throw new Error(`reviewer ${REVIEWER_DIMENSIONS[i]} reportFile 与派发 output 不一致：${verdict.reportFile}`);
            }
        }
        lastMustFix = verdicts.reduce((sum, v) => sum + v.mustFix, 0);
        lastSuggestion = verdicts.reduce((sum, v) => sum + v.suggestion, 0);
        const unresolvedReconciliations = verdicts
            .flatMap((v) => v.reconciliation)
            .filter((entry) => entry.status !== "fixed");
        await obsEnd("review", round);
        if (lastMustFix === 0 && lastSuggestion === 0 && unresolvedReconciliations.length === 0) {
            reviewTerminated = "clean";
            break;
        }
        await obsBegin("aggregate", round);
        const aggregateOutput = `${roundDir}/aggregated.md`;
        const aggregation = await aggregator.ask("Aggregation", aggregatePrompt({
            round,
            reports: reportPaths,
            previousIssues,
            output: aggregateOutput,
        }));
        const knownIds = new Set(previousIssues.map((issue) => issue.id));
        const issues = aggregation.issues.map((issue, index) => ({
            ...issue,
            id: issue.id !== "" && knownIds.has(issue.id)
                ? issue.id
                : `MF-r${round}-${index + 1}`,
        }));
        const validIssueIds = new Set(issues.map((issue) => issue.id));
        const groups = aggregation.groups.filter((group) => group.issueIds.every((id) => validIssueIds.has(id)));
        await obsEnd("aggregate", round);
        if (issues.length === 0) {
            // 计数非零但聚合裁决全部证据不足：以下一轮复审为准；连续无活跃问题视为 clean。
            if (round === maxRounds)
                reviewTerminated = "max-rounds";
            previousIssues = [];
            continue;
        }
        await obsBegin("fix", round);
        const executedGroups = [];
        for (let start = 0; start < groups.length; start += 3) {
            const batch = groups.slice(start, start + 3);
            const outcomes = await Promise.all(batch.map((group) => wfAgent(`修复组-${group.id}`, "你是谨慎的代码修复员：只修任务清单内问题；遵守项目规范；不执行任何 git 写操作；不确定时返回 fixed=false 并说明。")
                .ask("FixerOutcome", fixerPrompt({ group, issues, round }))));
            for (let i = 0; i < batch.length; i += 1)
                executedGroups.push({ group: batch[i], outcome: outcomes[i] });
        }
        for (const { group, outcome } of executedGroups) {
            if (outcome === null || !outcome.fixed) {
                log(`修复组 ${group.id} 未完成：${outcome?.notes ?? "fixer 返回缺失"}`);
                continue;
            }
            const changed = outcome.changedFiles.filter((file) => file !== "");
            if (changed.length === 0) {
                log(`修复组 ${group.id} 未申报 changedFiles，改动保留在工作区，下轮审查可见`);
                continue;
            }
            for (const file of changed) {
                const addRes = await runSh("git", ["add", "--", file]);
                if (addRes.exitCode !== 0)
                    throw new Error(`git add 失败：${file}: ${textOf(addRes)}`);
            }
            const commitMessage = outcome.commitMessage.trim() !== ""
                ? outcome.commitMessage.trim().split("\n")[0]
                : `fix: address ${group.id} review findings`;
            const commit = await runSh("git", ["commit", "-m", commitMessage], { timeoutMs: 1_800_000 });
            if (commit.exitCode !== 0) {
                throw new Error(`修复组 ${group.id} commit 被 hook 或 git 拒绝：${textOf(commit).slice(-3000)}`);
            }
            const headAfter = await runSh("git", ["rev-parse", "HEAD"]);
            head = headAfter.stdout.trim();
        }
        await obsEnd("fix", round);
        if (lastMustFix < minMustFix) {
            minMustFix = lastMustFix;
            stuckRounds = 0;
        }
        else {
            stuckRounds += 1;
            if (stuckRounds >= 3) {
                reviewTerminated = "stuck";
                break;
            }
        }
        previousIssues = issues;
        if (round === maxRounds)
            reviewTerminated = "max-rounds";
    }
    await obsEnd("cr-fix", null);
    if (reviewTerminated === "stuck") {
        throw new Error("cr-fix 连续 3 轮 must-fix 未下降，终态 stuck。恢复：读 round-N/aggregated.md 人工裁决后重新发起");
    }
    if (reviewTerminated === "max-rounds") {
        throw new Error(`cr-fix 达到 ${maxRounds} 轮仍未清零。恢复：读 .review/pr-lifecycle/<runId>/round-*/aggregated.md 处置残留后重新发起`);
    }
    // ── final-gates ──────────────────────────────────────────────────────────
    await obsBegin("final-gates", null);
    phase("终局项目门禁");
    const finalCheck = await runSh("pnpm", ["check"], { timeoutMs: 1_800_000 });
    if (finalCheck.exitCode !== 0) {
        throw new Error(`pnpm check 失败（final-gates）：${textOf(finalCheck).slice(-3000)}`);
    }
    finalGate = "pass";
    await obsEnd("final-gates", null);
    // ── acceptance ───────────────────────────────────────────────────────────
    await obsBegin("acceptance", null);
    phase("真实 DSH 宿主验收");
    const acceptanceArtifacts = `${runAbsDir}/verify`;
    if (verifyUrl !== "") {
        const verify = await runSh("node", [
            "scripts/verify/run.mjs",
            "--url", verifyUrl,
            "--scenarios", "brand,head,theme,projects",
            "--artifacts-dir", acceptanceArtifacts,
            "--run-id", `prl-${runId}`,
        ], { timeoutMs: 1_800_000 });
        if (verify.exitCode === 0) {
            acceptance.status = "pass";
            acceptance.detail = "四场景真实宿主验收通过（degraded 允许）";
            acceptance.artifactsDir = acceptanceArtifacts;
        }
        else if (verify.exitCode === 1) {
            acceptance.status = "failed";
            acceptance.detail = `真实宿主验收失败；证据：${acceptanceArtifacts}`;
            acceptance.artifactsDir = acceptanceArtifacts;
            throw new Error(acceptance.detail);
        }
        else {
            throw new Error(`verify runner 参数/环境错误（exit ${verify.exitCode}）：${textOf(verify).slice(-2000)}`);
        }
    }
    else if (verifyEvidenceDir !== "") {
        const verdictPath = `${verifyEvidenceDir}/verdict.json`;
        const verdictRead = await runSh("node", [
            "-e",
            `const fs=require('fs');const p=process.argv[1];const v=JSON.parse(fs.readFileSync(p,'utf8'));if(!['pass','degraded'].includes(v.verdict)){console.error('verdict='+v.verdict);process.exit(1)}console.log(v.verdict)`,
            verdictPath,
        ]);
        acceptance.status = "pass";
        acceptance.detail = `复用已有验收证据：${verdictRead.stdout.trim()}（${verdictPath}）`;
        acceptance.artifactsDir = verifyEvidenceDir;
    }
    else {
        acceptance.status = "skipped";
        acceptance.detail = "未提供 verifyUrl / verifyEvidenceDir；不能声称已做真实宿主验收";
        acceptance.artifactsDir = "";
        skipped.push("acceptance");
    }
    await obsEnd("acceptance", null);
    // ── pr-meta ──────────────────────────────────────────────────────────────
    await obsBegin("pr-meta", null);
    phase("起草 PR 标题与描述");
    const titleFile = `${runAbsDir}/pr-title.txt`;
    const bodyFile = `${runAbsDir}/pr-body.md`;
    const prDrafter = wfAgent("PR 元信息起草员", "你根据分支 commits 写英文 conventional PR title 与 body；不夸大、不编造测试结果；不执行任何 git 写操作。");
    const meta = await prDrafter.ask("PrMeta", [
        `worktree=${wt}`,
        `base=${base}`,
        `读取 git log ${base}..HEAD --format="%s%n%b---" 与 git diff ${base}...HEAD --stat。`,
        "生成 conventional commit 风格英文 title；body 用 Summary / Changes / Test plan 三节英文 markdown。",
        `Test plan 只写本 run 实际完成的事实：static/final pnpm check 通过、review terminated=${reviewTerminated}、acceptance=${acceptance.status}（${acceptance.detail}）。`,
        `把 title 写入 ${titleFile}，body 写入 ${bodyFile}（目录可创建）。`,
        "结构化 title 字段与 titleFile 内容一致。",
    ].join("\n"));
    const titleProbe = await runSh("test", ["-s", titleFile]);
    const bodyProbe = await runSh("test", ["-s", bodyFile]);
    if (titleProbe.exitCode !== 0 || bodyProbe.exitCode !== 0) {
        throw new Error(`PR 元信息文件缺失或为空：${titleFile}, ${bodyFile}`);
    }
    prMeta = { titleFile, bodyFile, title: meta.title };
    await obsEnd("pr-meta", null);
    // ── 残留对账：只记录，不连坐打回 ─────────────────────────────────────────
    const finalStatus = await runSh("git", ["status", "--porcelain"]);
    residualFiles.push(...porcelainPaths(finalStatus));
    await obsCloseExecution("awaiting-push");
    phase("停在推送授权前");
    const result = {
        status: "awaiting-push",
        base,
        worktree: wt === "" ? "(环境 cwd)" : wt,
        branch,
        head,
        staticGate,
        finalGate,
        review: {
            rounds: reviewRounds,
            terminated: reviewTerminated,
            mustFix: lastMustFix,
            suggestion: lastSuggestion,
            reportDir: runAbsDir,
        },
        acceptance,
        prMeta,
        residualFiles,
        skipped,
        nextAction: [
            "向用户展示 PR title/body 与验收结果；取得明确 push 授权后执行 git push github HEAD:<branch>。",
            "本 workflow 不创建 PR；授权后可按 pr-cr-fix 技能执行 push 与 gh pr create/edit --repo zhushanwen321/tai-ji-yang。",
        ].join(" "),
    };
    return result;
}
catch (error) {
    failedStep = "workflow";
    failureMessage = error instanceof Error ? error.message : String(error);
    recoveryHint = "按失败信息修复后重新发起；run 目录保留在各轮审查报告与门禁输出";
    try {
        const status = await runSh("git", ["status", "--porcelain"]);
        residualFiles.push(...porcelainPaths(status));
    }
    catch {
        // 目标甚至不是 git 仓库时，preflight 已给出主因；不再遮蔽第一失败。
    }
    await obsCloseExecution("failed");
    const result = {
        status: "failed",
        base,
        worktree: wt === "" ? "(环境 cwd)" : wt,
        branch,
        head,
        staticGate,
        finalGate,
        review: {
            rounds: reviewRounds,
            terminated: reviewTerminated,
            mustFix: lastMustFix,
            suggestion: lastSuggestion,
            reportDir: runAbsDir,
        },
        acceptance,
        prMeta,
        residualFiles,
        skipped,
        nextAction: "按 error/recovery 处置；不要在失败终态上自动 push",
        failedStep,
        error: failureMessage,
        recovery: recoveryHint,
    };
    return result;
}

