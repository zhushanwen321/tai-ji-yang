import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { applyRewrites } from "../rewrite/apply.js";
import { listDeclaredRosterPaths } from "../locate/manifest-discovery.js";
import { locateOdAssets, readRosterAsset } from "../locate/version-profile.js";
import { MATERIALIZED_FILE_NAMES, OD_FRAMES_DIR } from "../materialize/copy.js";
const name = "od-doctor";
const inject = ["commands"];
const DOCTOR_COMMAND_NAME = "opendesign-doctor";
const DOCTOR_DEFINITION_ID = "opendesign-design-mode/commands/doctor";
const DOCTOR_REPORT_TITLE = "OpenDesign 设计模式诊断报告";
const DOCTOR_SECTIONS = {
  install: "安装形态与资源根",
  manifest: "清单路径与三层版本",
  roster: "roster 完整性核验",
  rewrite: "改写规则命中清单",
  materialize: "材质化状态",
  generation: "资产代际提示",
  recovery: "异常与恢复动作",
  stopLoss: "止损位状态"
};
function doctorSectionLine(index, title) {
  return `【${index}/8】${title}`;
}
const DOCTOR_RECOVERY_ACTIONS = {
  reinstallOd: "恢复动作：重装 OpenDesign，然后重启 DSH。",
  upgradePlugin: "恢复动作：升级本插件到适配当前 OpenDesign 资产的版本（改写规则随插件版本更新），然后重启 DSH。",
  restartDsh: "恢复动作：重启 DSH（材质化在新会话创建时无条件全量重铺；.od-frames/ 目录可安全删除后重建）。"
};
function evaluateStopLoss(records, readerUnavailable) {
  const misfires = records.filter((record) => record.locator === "semantic-anchor" && record.hitCount === 0);
  const criterion1Triggered = misfires.length >= 3;
  return {
    criterion1Triggered,
    misfires,
    criterion2Triggered: readerUnavailable,
    criterion3Triggered: false,
    triggered: criterion1Triggered || readerUnavailable
  };
}
function rewriteRecordLine(record) {
  const marker = record.hitCount > 0 ? "[✓]" : record.locator === "semantic-anchor" ? "[✗ 失配]" : "[—]";
  const fragility = `脆弱度 ${record.fragility}`;
  return `- ${marker} ${record.ruleName}（${record.ruleId}）→ ${record.asset} → ${record.summary}（${fragility}）`;
}
function readManifest(profile) {
  try {
    return JSON.parse(readFileSync(profile.manifestPath, "utf8"));
  } catch {
    return null;
  }
}
function renderRosterSection(profile, issues) {
  const manifest = readManifest(profile);
  if (manifest === null) {
    const message = `清单文件无法读取或解析（${profile.manifestPath}）。${DOCTOR_RECOVERY_ACTIONS.reinstallOd}`;
    issues.push({ section: DOCTOR_SECTIONS.roster, message });
    return [`- ✗ ${message}`];
  }
  const declared = listDeclaredRosterPaths(manifest);
  const lines = [`- 声明文件共 ${declared.length} 项：`];
  const missing = [];
  for (const relative of declared) {
    const absolute = join(profile.scenarioRoot, relative.replace(/^\.\//, ""));
    let exists = false;
    try {
      exists = statSync(absolute).isFile();
    } catch {
      exists = false;
    }
    if (exists) {
      lines.push(`  - ✓ ${relative}`);
    } else {
      missing.push(relative);
      lines.push(`  - ✗ ${relative}（缺失）`);
    }
  }
  if (missing.length > 0) {
    const message = `roster 核验失败：${missing.length} 个声明文件缺失（${missing.join("、")}）。${DOCTOR_RECOVERY_ACTIONS.reinstallOd}`;
    issues.push({ section: DOCTOR_SECTIONS.roster, message });
    lines.push(`- ✗ ${message}`);
  } else {
    lines.push("- 结论：全部声明文件在场。");
  }
  return lines;
}
function renderMaterializeSection(sessionCwd, issues) {
  if (sessionCwd === null) {
    return ["- 会话工作目录未知，无法报告材质化状态（不影响本报告其余各项）。"];
  }
  const targetRoot = join(sessionCwd, OD_FRAMES_DIR);
  const lines = [
    `- 会话工作目录：${sessionCwd}`,
    `- 写入落点（D8 约定子目录）：${targetRoot}`
  ];
  if (!existsSync(targetRoot)) {
    lines.push("- 状态：尚未预铺（落点目录不存在；材质化在会话创建时无条件全量重铺，新会话首轮前执行本命令即此形态）。");
    return lines;
  }
  const present = [];
  const missingNames = [];
  for (const fileName of MATERIALIZED_FILE_NAMES) {
    const absolute = join(targetRoot, fileName);
    let bytes = 0;
    let exists = false;
    try {
      bytes = statSync(absolute).size;
      exists = true;
    } catch {
      exists = false;
    }
    if (exists) {
      present.push(`  - ✓ ${fileName}（${bytes} 字节）`);
    } else {
      missingNames.push(fileName);
    }
  }
  lines.push(...present);
  if (missingNames.length === MATERIALIZED_FILE_NAMES.length) {
    const message = `材质化异常：落点目录存在但 ${MATERIALIZED_FILE_NAMES.length} 个管理名全部缺失（预铺后为空即异常）。${DOCTOR_RECOVERY_ACTIONS.restartDsh}`;
    issues.push({ section: DOCTOR_SECTIONS.materialize, message });
    lines.push(`- ✗ ${message}`);
  } else if (missingNames.length > 0) {
    const message = `材质化异常：${missingNames.length} 个管理名缺失（${missingNames.join("、")}；D8 为无条件全量重铺，四文件应齐备）。${DOCTOR_RECOVERY_ACTIONS.restartDsh}`;
    issues.push({ section: DOCTOR_SECTIONS.materialize, message });
    lines.push(`- ✗ ${message}`);
  } else {
    lines.push(`- 结论：${MATERIALIZED_FILE_NAMES.length} 个管理名全部在场（写入落点清单如上）。`);
  }
  return lines;
}
function renderRewriteSection(profile, issues) {
  const designSystemsRoot = join(profile.resourceRoot, "design-systems");
  let records;
  try {
    const manifest = readManifest(profile);
    const corePath = manifest?.od?.strategy?.assets?.core?.path;
    const orchestrationPath = manifest?.od?.strategy?.assets?.orchestration?.path;
    if (typeof corePath !== "string" || typeof orchestrationPath !== "string") {
      throw new Error(`清单缺少 core / orchestration 资产声明（${profile.manifestPath}）`);
    }
    records = applyRewrites({
      "core-system-prompt": readRosterAsset(profile, corePath),
      "general-orchestration": readRosterAsset(profile, orchestrationPath)
    }, { designSystemsRoot }).records;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const message = `默认读取器无法产出可注入文本（${reason}）。${DOCTOR_RECOVERY_ACTIONS.upgradePlugin}`;
    issues.push({ section: DOCTOR_SECTIONS.rewrite, message });
    return {
      lines: [`- ✗ ${message}`, "- 改写命中清单不可产出（判据②命中：默认读取器不可用）。"],
      records: [],
      readerUnavailable: true
    };
  }
  const hit = records.filter((record) => record.hitCount > 0).length;
  const lines = [
    `- 规则应用记录共 ${records.length} 条（命中 ${hit} 条 / 零命中 ${records.length - hit} 条；零命中含防御性规则基线形态与残余兜底未触发形态，见逐条标记）：`,
    ...records.map(rewriteRecordLine)
  ];
  const residualHits = records.filter((record) => record.ruleId.endsWith("residual") && record.hitCount > 0);
  if (residualHits.length > 0) {
    lines.push(
      `- ⚠ 残余兜底规则命中 ${residualHits.length} 条（${residualHits.map((record) => record.ruleId).join("、")}）——特征串残余说明上游段锚漂移，见失配标记。`
    );
  }
  return { lines, records, readerUnavailable: false };
}
function renderStopLossSection(evaluation) {
  const lines = [
    `- 判据① 核心段改写规则失配 ≥3 条：${evaluation.criterion1Triggered ? `触发（${evaluation.misfires.length} 条失配）` : `未触发（${evaluation.misfires.length} 条失配）`}`,
    ...evaluation.misfires.map((record) => `  - ✗ ${record.ruleName}（${record.ruleId}，${record.asset}，脆弱度 ${record.fragility}）：锚未命中`),
    `- 判据② 默认读取器无法产出可注入文本：${evaluation.criterion2Triggered ? "触发" : "未触发"}`,
    "- 判据③ 连续两个 OD 版本升级均需重写全部规则：不在单次诊断可观测范围（需跨升级历史记录；升级后若连续两版均见判据①触发，即按本判据处置）。"
  ];
  if (evaluation.triggered) {
    lines.push("- ⚠ 建议方案级重审：止损位判据已触发（V2 真桥接提前或改写策略重构）。");
  } else {
    lines.push("- 结论：可观测判据均未触发。");
  }
  return lines;
}
function buildDoctorReport(input) {
  const issues = [];
  const sections = [];
  const installLines = [];
  if (input.profileResult.status === "found") {
    const profile2 = input.profileResult.profile;
    installLines.push(
      `- 资源根：${profile2.resourceRoot}`,
      `- 选中依据：${profile2.selectedBy}`,
      `- 全部候选（${profile2.candidates.length}）：`,
      ...profile2.candidates.map(
        (candidate) => `  - ${candidate.resourceRoot}（渠道 ${candidate.channel}）${candidate.resourceRoot === profile2.resourceRoot ? " ← 已选中" : ""}`
      )
    );
  } else if (input.profileResult.status === "missing") {
    const message = "未检测到 OpenDesign 安装（零候选）。恢复动作：安装 OpenDesign（/Applications/Open Design.app），然后重启 DSH。";
    issues.push({ section: DOCTOR_SECTIONS.install, message });
    installLines.push(`- ✗ ${message}`);
  } else {
    const message = `OpenDesign 资产探测失败：${input.profileResult.reason} ${DOCTOR_RECOVERY_ACTIONS.reinstallOd}`;
    issues.push({ section: DOCTOR_SECTIONS.install, message });
    installLines.push(`- ✗ ${message}`);
  }
  sections.push(renderSection(1, DOCTOR_SECTIONS.install, installLines));
  const profile = input.profileResult.status === "found" ? input.profileResult.profile : null;
  const manifestLines = [];
  if (profile === null) {
    manifestLines.push("- 资产未定位，无清单可报告（见第①节）。");
  } else {
    const verifiedLine = profile.verified ? "（已核实）" : `（未核实——超出本插件已核实集合；${DOCTOR_RECOVERY_ACTIONS.upgradePlugin}）`;
    manifestLines.push(
      `- 清单路径：${profile.manifestPath}`,
      `- manifest 版本：${profile.versions.manifestVersion ?? "（未声明）"}`,
      `- specVersion：${profile.versions.specVersion ?? "（未声明）"}${verifiedLine}`,
      `- 资产版本（core.version）：${profile.versions.assetVersion ?? "（未声明）"}`
    );
  }
  sections.push(renderSection(2, DOCTOR_SECTIONS.manifest, manifestLines));
  const rosterLines = profile === null ? ["- 资产未定位，无法核验（见第①节）。"] : renderRosterSection(profile, issues);
  sections.push(renderSection(3, DOCTOR_SECTIONS.roster, rosterLines));
  let records = [];
  let readerUnavailable = false;
  let rewriteLines;
  if (profile === null) {
    rewriteLines = ["- 资产未定位，改写命中清单不可产出（见第①节）。"];
  } else {
    const rendered = renderRewriteSection(profile, issues);
    records = rendered.records;
    readerUnavailable = rendered.readerUnavailable;
    rewriteLines = rendered.lines;
  }
  sections.push(renderSection(4, DOCTOR_SECTIONS.rewrite, rewriteLines));
  sections.push(renderSection(5, DOCTOR_SECTIONS.materialize, renderMaterializeSection(input.sessionCwd, issues)));
  const generationLines = [];
  if (profile !== null) {
    generationLines.push(
      `- 当前资产版本：core v${profile.versions.assetVersion ?? "未知"}（清单 specVersion ${profile.versions.specVersion ?? "未知"}）`
    );
  }
  generationLines.push(
    "- 提示：若本会话是 resume 的旧会话，历史轮次的系统提示词由旧代资产组装，与上列当前资产版本可能不同代；新轮次以当前资产重新组装为准（SC4 代际边界）。"
  );
  sections.push(renderSection(6, DOCTOR_SECTIONS.generation, generationLines));
  const recoveryLines = issues.length === 0 ? ["- 未发现异常。"] : issues.map((issue, index) => `- ${index + 1}. 【${issue.section}】${issue.message}`);
  sections.push(renderSection(7, DOCTOR_SECTIONS.recovery, recoveryLines));
  const evaluation = evaluateStopLoss(records, readerUnavailable);
  sections.push(renderSection(8, DOCTOR_SECTIONS.stopLoss, renderStopLossSection(evaluation)));
  return [
    DOCTOR_REPORT_TITLE,
    `（生成时间：${(/* @__PURE__ */ new Date()).toISOString()}；求助时请附本报告全文）`,
    "",
    ...sections.join("\n\n").split("\n"),
    ""
  ].join("\n");
}
function renderSection(index, title, lines) {
  return [doctorSectionLine(index, title), ...lines].join("\n");
}
function resolveSessionCwd(hostCtx, agent) {
  const session = agent?.session;
  const workingDirectory = hostCtx?.workingDirectory;
  if (workingDirectory && typeof workingDirectory.get === "function" && session !== void 0) {
    try {
      const cwd = workingDirectory.get(session);
      if (typeof cwd === "string" && cwd.length > 0) return cwd;
    } catch {
    }
  }
  const headerCwd = session?.header?.cwd;
  return typeof headerCwd === "string" && headerCwd.length > 0 ? headerCwd : null;
}
function apply(ctx) {
  ctx.commands.register({
    definitionId: DOCTOR_DEFINITION_ID,
    name: DOCTOR_COMMAND_NAME,
    description: "诊断 OpenDesign 设计模式：资产定位、清单版本、roster 完整性、改写命中、材质化与止损位状态",
    handler: (invocation) => {
      const text = buildDoctorReport({
        profileResult: locateOdAssets(),
        sessionCwd: resolveSessionCwd(ctx, invocation?.agent)
      });
      return { kind: "success", text };
    }
  });
}
export {
  DOCTOR_COMMAND_NAME,
  DOCTOR_DEFINITION_ID,
  DOCTOR_RECOVERY_ACTIONS,
  DOCTOR_REPORT_TITLE,
  DOCTOR_SECTIONS,
  apply,
  buildDoctorReport,
  doctorSectionLine,
  evaluateStopLoss,
  inject,
  name,
  resolveSessionCwd,
  rewriteRecordLine
};
