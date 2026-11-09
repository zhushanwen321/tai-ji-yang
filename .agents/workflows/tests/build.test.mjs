// build.test.mjs — 双平台构建管线测试：确定性 / --check 拦产物篡改 / 缺观测层 fail-fast /
// frontmatter YAML 安全 / pi 改写完整性 / 两平台语法 / 本机路径零字面 / 观测层单一来源。
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { installObsScripts } from "./helpers/obs-home.mjs";

const WF = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(WF, "scripts", "build-workflows.mjs");
const PRODUCTS = {
  "pr-lifecycle": {
    zcode: join(WF, "pr-lifecycle.dwf.ts"),
    pi: join(WF, "pr-lifecycle.js"),
  },
};

// 构建期 typescript 入口：本仓 devDependencies 的解析结果（不依赖仓外 fallback）。
const localTsPath = createRequire(import.meta.url).resolve("typescript");

function makeTestHome() {
  const home = mkdtempSync(join(tmpdir(), "taiji-yang-wf-home-"));
  installObsScripts(home);
  return { home, env: { ...process.env, HOME: home, WORKFLOW_BUILD_TYPESCRIPT: localTsPath } };
}

function runBuild(args, env) {
  return execFileSync(process.execPath, [BUILD, ...args], { encoding: "utf8", cwd: WF, env });
}

test("构建幂等：临时 HOME（含观测层副本）下连续生成稳定，--check 全绿", () => {
  const { env } = makeTestHome();
  try {
    const out1 = runBuild([], env);
    assert.match(out1, /已生成|（一致）/);
    assert.match(out1, /观测契约：pr-lifecycle/);
    runBuild([], env);
    const check = runBuild(["--check"], env);
    assert.match(check, /（一致）/);
    assert.doesNotMatch(check, /过期|不一致/);
  } finally {
    // 恢复真实 HOME 视角的产物；构建内容与 HOME 无关（观测层来源内容一致）。
    runBuild([], process.env);
  }
});

test("公共观测层缺失：构建 fail-fast 并给恢复动作（不允许静默退回无观测产物）", () => {
  const home = mkdtempSync(join(tmpdir(), "taiji-yang-wf-nolayer-"));
  const env = { ...process.env, HOME: home, WORKFLOW_BUILD_TYPESCRIPT: localTsPath };
  try {
    const result = spawnSync(process.execPath, [BUILD], { encoding: "utf8", cwd: WF, env });
    assert.notEqual(result.status, 0, "公共层缺失时构建必须失败");
    const output = `${result.stderr}${result.stdout}`;
    assert.match(output, /公共观测层缺失/);
    assert.match(output, /恢复动作/);
    assert.match(output, /workflow-observability\.shared\.ts/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("两份产物存在且为完整产物", () => {
  for (const name of Object.keys(PRODUCTS)) {
    for (const path of Object.values(PRODUCTS[name])) {
      const content = readFileSync(path, "utf8");
      assert.ok(content.length > 10_000, `${path} 应为完整产物（实际 ${content.length} 字节）`);
    }
  }
});

test("frontmatter description 无流式映射形态（发起时 YAML 可解析）", () => {
  const blocks = (source) => {
    const output = [];
    const pattern = /\/\* (?:zcode-workflow|@pi-meta)\n([\s\S]*?)\*\//g;
    for (const match of source.matchAll(pattern)) output.push(match[1]);
    return output;
  };
  for (const name of Object.keys(PRODUCTS)) {
    for (const path of Object.values(PRODUCTS[name])) {
      const source = readFileSync(path, "utf8");
      for (const block of blocks(source)) {
        for (const line of block.split("\n")) {
          const match = /^(\s*(?:description|summary)\s*:\s*)(.*)$/.exec(line);
          if (!match) continue;
          const value = match[2];
          assert.ok(!value.startsWith("{"), `${path} description 以 { 开头（YAML 流式映射）：${line.trim().slice(0, 80)}`);
          assert.ok(!/:\s*\{"/.test(value), `${path} description 含紧凑映射嵌套（invalid_yaml）：${line.trim().slice(0, 80)}`);
        }
      }
    }
  }
});

test("--check 拦截产物篡改：改产物后 --check 失败，重建后恢复", () => {
  const { env } = makeTestHome();
  const target = PRODUCTS["pr-lifecycle"].pi;
  const original = readFileSync(target, "utf8");
  try {
    writeFileSync(target, `${original}\n// selftest tamper\n`);
    let failed = false;
    try {
      runBuild(["--check"], env);
    } catch {
      failed = true;
    }
    assert.equal(failed, true, "--check 应对产物篡改报非零");
  } finally {
    writeFileSync(target, original);
  }
  runBuild(["--check"], env);
});

test("pi 产物改写完整性：shared 调用点全部改写为 wfAgent(，壳内平台原生调用恰一处", () => {
  const pi = readFileSync(PRODUCTS["pr-lifecycle"].pi, "utf8");
  const rewritten = (pi.match(/(?<![\w.$])wfAgent\(/g) ?? []).length;
  assert.ok(rewritten >= 3, `pi 产物 wfAgent( 应来自 shared 改写（实际 ${rewritten}）`);
  assert.equal((pi.match(/(?<![\w.$])agent\(\{/g) ?? []).length, 0, "pi 产物不得残留 shared 形态裸 agent(");
  assert.equal((pi.match(/await agent\(callSpec\)/g) ?? []).length, 1, "壳内平台原生 agent 调用应恰一处");
});

test("两平台产物语法有效（按真实执行形态 = async 函数体包装后解析）", () => {
  const ts = createRequire(import.meta.url)("typescript");
  const dir = mkdtempSync(join(tmpdir(), "taiji-yang-wf-syntax-"));
  try {
    for (const name of Object.keys(PRODUCTS)) {
      for (const [platform, path] of Object.entries(PRODUCTS[name])) {
        let code = readFileSync(path, "utf8");
        if (platform === "zcode") {
          code = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
        }
        const wrapped = `async function __wrap__() {\n${code}\n}`;
        const file = join(dir, `${name}-${platform}.mjs`);
        writeFileSync(file, wrapped);
        execFileSync(process.execPath, ["--check", file]);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("产物不含本机绝对路径字面（workspace 约定）", () => {
  const home = process.env.HOME ?? "";
  for (const name of Object.keys(PRODUCTS)) {
    for (const path of Object.values(PRODUCTS[name])) {
      const content = readFileSync(path, "utf8");
      assert.ok(!content.includes(`${home}/`), `${path} 不得含本机绝对路径字面`);
    }
  }
});

test("公共观测层以单一来源拼入两侧产物（观测层先于业务赋值；壳不含副本）", () => {
  for (const name of Object.keys(PRODUCTS)) {
    for (const path of Object.values(PRODUCTS[name])) {
      const content = readFileSync(path, "utf8");
      const initPosition = content.indexOf("function initObservation");
      const ctxPosition = content.indexOf("let obsCtx");
      const businessPosition = content.indexOf('obsCtx = initObservation("');
      assert.ok(initPosition > 0 && ctxPosition >= 0, `${path} 应含拼入的公共观测层`);
      assert.ok(businessPosition > ctxPosition, `${path} 业务正文应在观测层之后（obsCtx let 声明先于赋值）`);
    }
  }
});
