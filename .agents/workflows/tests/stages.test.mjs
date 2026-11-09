// stages.test.mjs — 双平台产物结构与语义对账：观测调用点 / agent 名 / phase 名 /
// 结构化 schema 键 / 可执行命令集合。产物由单源生成，这里守的是“改源忘构建”与“平台改写漂移”。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const WF = join(dirname(fileURLToPath(import.meta.url)), "..");
const ZCODE = join(WF, "pr-lifecycle.dwf.ts");
const PI = join(WF, "pr-lifecycle.js");
const SHARED = join(WF, "src", "pr-lifecycle.shared.ts");

const read = (path) => readFileSync(path, "utf8");
const obsCalls = (source) =>
  [...source.matchAll(/\b(?:obsBegin|withStage)\("([A-Za-z0-9-]+)"/g)].map((m) => m[1]).sort();
const phaseNames = (source) =>
  [...source.matchAll(/\bphase\("([^"]+)"/g)].map((m) => m[1]).sort();
const schemaKeys = (source) => {
  const block = source.match(/const SCHEMA_BY_KEY = \{([\s\S]*?)\n\};/);
  assert.ok(block, "pi 产物应含 SCHEMA_BY_KEY");
  return [...block[1].matchAll(/^  ([A-Za-z][A-Za-z0-9]*): \{/gm)].map((m) => m[1]).sort();
};
const interfaceNames = (source) =>
  [...source.matchAll(/^interface ([A-Za-z][A-Za-z0-9]*) \{/gm)].map((m) => m[1]).sort();

test("两平台观测步骤调用点与 shared 一致", () => {
  const expected = obsCalls(read(SHARED));
  assert.ok(expected.includes("execution") === false, "execution 用 obsEmit，不占 obsBegin 步骤枚举");
  for (const path of [ZCODE, PI]) {
    assert.deepEqual(obsCalls(read(path)), expected, path);
  }
});

test("两平台 phase 名与 shared 一致且无空名", () => {
  const expected = phaseNames(read(SHARED));
  assert.ok(expected.length >= 5, `shared 应覆盖全部主阶段（实际 ${expected.length}）`);
  for (const path of [ZCODE, PI]) {
    assert.deepEqual(phaseNames(read(path)), expected, path);
  }
});

test("ask<T> 接口名与 pi schema 键一一对账", () => {
  // ReconciliationEntry 是 ReviewerVerdict 的嵌套项；AcceptanceResult/LifecycleResult 等
  // 是 workflow 终态类型，不经 agent.ask 返回，因此不进 pi schema。
  const expected = ["Aggregation", "FixerOutcome", "PrMeta", "ReviewerVerdict"].sort();
  assert.deepEqual(schemaKeys(read(PI)), expected);
  const askTypes = [...read(SHARED).matchAll(/\.ask<([A-Za-z][A-Za-z0-9]*)>\(/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(askTypes)].sort(), expected);
});

test("agent 名静态前缀互不相同（GUI 泳道可区分）", () => {
  const source = read(SHARED);
  const names = [...source.matchAll(/agent\((["'`])([^"'`]+)\1/g)].map((m) => m[2]);
  assert.ok(names.length >= 5, `应发现全部固定角色（实际 ${names.length}）`);
  const prefixes = names.map((name) => name.split("${")[0]);
  assert.deepEqual(new Set(prefixes).size, prefixes.length, `agent 名前缀重复：${prefixes.join(", ")}`);
});

test("安全边界：产物与源不得包含 push / GitHub PR 创建命令调用", () => {
  for (const path of [SHARED, ZCODE, PI]) {
    const source = read(path);
    assert.doesNotMatch(source, /runSh\("git",\s*\[[^\]]*"push"/, path);
    assert.doesNotMatch(source, /world\.run\("git",\s*\[[^\]]*"push"/, path);
    assert.doesNotMatch(source, /runSh\("gh"/, path);
    assert.doesNotMatch(source, /world\.run\("gh"/, path);
  }
});
