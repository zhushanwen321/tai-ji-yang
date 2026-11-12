#!/usr/bin/env node
/**
 * lib 产物新鲜度检查（提交侧防线；判定与 doctor lib-fresh 同源）。
 *
 * 背景（FF16 / seq36 第 2 轮修复登记）：round-4 修复轮改了 client/ 源码没有执行 pnpm
 * build，漏 build 的 commit 要到真机验收才红——doctor 的 lib-fresh 门禁前移（93406fe）
 * 是验收侧缓解，本脚本挂 pre-commit 做提交侧拦截：lib/index.js 与 index.js 内容漂移、
 * 或 client/ 源文件晚于 lib/client.js（mtime 初筛）即拒绝提交。
 * 判定权威 = scripts/verify/lib/freshness.mjs 的 checkLibFresh（单一来源，此处只做调用
 * 与退出码，不复制判定逻辑）。
 *
 * 用法：node scripts/check-lib-fresh.mjs（退出码 0 = 新鲜；1 = 落后，先 pnpm build 再提交）
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkLibFresh } from './verify/lib/freshness.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fresh = checkLibFresh(root)
for (const check of fresh.checks) console.error(`lib-fresh: ${check.name} — ${check.detail}`)
if (!fresh.ok) {
  console.error(fresh.hint)
  process.exit(1)
}
