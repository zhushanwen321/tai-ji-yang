#!/usr/bin/env node
/**
 * dsh-model-service RL7 静态自检：插件产物零密钥材料。
 *
 * 扫描对象（设计 §4.2 RL7：插件产物 = lib/ 构建产物、客户端打包产物、Config schema、
 * 日志调用点——后两者是源码文本，与产物同扫）：根包 Node 半场（index.js 及其 lib/ 产物）、
 * 浏览器半场（client/ 及 lib/client.js 打包产物）、子包各半场。包清单来自
 * scripts/workspace-packages.mjs，新包落盘后自动进入扫描范围。也可在命令行追加路径
 * 供人工核对（如 node scripts/check-credentials-hygiene.mjs scripts/verify）。
 *
 * 四条规则（密钥形态应为空；命中 = 有密钥材料进插件产物）：
 *   ① RL7:sk-prefix —— `sk-` 前缀长串字面（OpenAI 风格密钥形态）。
 *   ② RL7:bearer-literal —— `Bearer <长字面串>`（硬编码 bearer 凭据；`Bearer ${var}`
 *      模板串是协议头构造、值在凭据通道，不算）。
 *   ③ RL7:secret-literal —— 密钥类字段的字面串赋值（apiKey / apiKeyValue / secret /
 *      password / bearerToken / accessToken / privateKey : = '长字面'）。变量赋值与
 *      空串草稿不算——密钥的合法来路是宿主凭据通道，源码里只应有通道调用。
 *   ④ RL7:apikeyenv-shape —— 设置文档只允许出现 ref 名：apiKeyEnv 的**字面**赋值必须
 *      是大写标识符（ref 名形态）；动态赋值（deriveCredentialRef 调用 / 变量透传）不判。
 *
 * 判定口径 = 字面材料，不是「字面出现」：注释与文案里讨论密钥形态（如本文件头部、
 * credentials-client.ts 的红线注释）不算违规——把注释当违规会让正确代码恒红，检查随之
 * 被关掉。测试与 spec 文件排除（其中的假密钥样本是断言材料，不进构建产物，与
 * check-forbidden-tokens 的「真实会被装载的源码」口径一致）。
 *
 * 负样本自证（每次运行都跑）：合成四类违规样本断言被拦、合规与注释提及样本不误报、
 * 「无源码可扫」判为拒绝通过——证明规则真的会红且不会假红。
 *
 * 设置文档的运行时形态（隔离 DSH_HOME 的 cordis.patch.yml 与 .credentials.yaml 的实际
 * 内容）由 verify-taiji-yang 的 model-service 场景断言（V1/V4）；本脚本是静态侧的第一道
 * 门禁（check-all --static 即跑）。只依赖 node 内置模块。退出码 0 = 通过，1 = 失败。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { workspacePackages, WORKSPACE_ROOT } from './workspace-packages.mjs'

const ROOT = WORKSPACE_ROOT
const SELF = fileURLToPath(import.meta.url)

/**
 * 默认扫描根（相对仓库根）：根包含 lib/（RL7 明确要求扫构建产物与客户端打包产物，
 * lib/client.js 即打包终态）；子包为 lib/（host 半产物随源同批入库）与 client/。
 */
function defaultTargets() {
  const targets = []
  for (const pkg of workspacePackages()) {
    if (pkg.dir === '.') targets.push('index.js', 'client', 'lib')
    else targets.push(join(pkg.dir, 'lib'), join(pkg.dir, 'client'))
  }
  return targets
}
const SCANNED_EXTENSIONS = ['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.tsx', '.jsx', '.css', '.yml', '.yaml', '.json']

/** ref 名形态（宿主凭据 ref 正则的大写标识符收紧形态：TAIJI_<KEY>_KEY 派生即此形态）。 */
const REF_NAME_RE = /^[A-Z][A-Z0-9_]*$/

/** 四条规则：逐行在「去掉注释后的文本」上匹配。 */
const RULES = [
  {
    id: 'RL7:sk-prefix',
    describe: 'sk- 前缀长串字面（OpenAI 风格密钥）进了插件产物——密钥材料只经宿主凭据通道（AX1）',
    test: (line) => /sk-[A-Za-z0-9_-]{16,}/.exec(line),
  },
  {
    id: 'RL7:bearer-literal',
    describe: '硬编码 Bearer 长串（模板串 `Bearer ${var}` 是协议头构造，不算）',
    test: (line) => /Bearer\s+[A-Za-z0-9._-]{20,}/.exec(line),
  },
  {
    id: 'RL7:secret-literal',
    describe: '密钥类字段的字面串赋值——密钥的合法来路是宿主凭据通道调用，不是源码字面',
    test: (line) => /\b(?:apiKey|apiKeyValue|api_key|secret|password|bearerToken|accessToken|privateKey)\b\s*[:=]\s*['"][^'"]{8,}['"]/.exec(line),
  },
  {
    id: 'RL7:apikeyenv-shape',
    describe: 'apiKeyEnv 字面赋值必须是大写标识符（ref 名）——设置文档只允许出现 ref 名，不允许密钥材料',
    test: (line) => {
      const match = /apiKeyEnv\s*[:=]\s*['"]([^'"]+)['"]/.exec(line)
      return match !== null && !REF_NAME_RE.test(match[1]) ? match : null
    },
  },
]

/** 去掉块注释与整行行注释，保留代码与行号（注释里讨论密钥形态不算违规）。 */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
}

/** 扫描一段文本，返回违规清单（含行号与命中片段，便于逐条定位）。 */
export function auditSource(text, label = '<memory>') {
  const violations = []
  const code = stripComments(text)
  code.split(/\r?\n/).forEach((rawLine, index) => {
    if (rawLine.trimStart().startsWith('//')) return
    for (const rule of RULES) {
      const hit = rule.test(rawLine)
      if (hit !== null && hit !== undefined) {
        violations.push({ label, line: index + 1, hit: hit[0].trim(), rule })
      }
    }
  })
  return violations
}

/** 负样本：每条规则一个坏样本；expectRule = 必须命中的规则 id。 */
const NEGATIVE_SAMPLES = [
  { id: 'sk- 前缀长串', text: "const upstream = 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789'", ruleId: 'RL7:sk-prefix' },
  { id: 'Bearer 硬编码长串', text: "const headers = { Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' }", ruleId: 'RL7:bearer-literal' },
  { id: 'apiKey 字面赋值', text: "const options = { apiKey: 'hard-coded-secret-value' }", ruleId: 'RL7:secret-literal' },
  { id: 'password 字面赋值', text: "const auth = { password: 'p4ssw0rd-material' }", ruleId: 'RL7:secret-literal' },
  { id: 'apiKeyEnv 非大写标识符字面', text: "const profile = { apiKeyEnv: 'sk-wrote-plaintext-here' }", ruleId: 'RL7:apikeyenv-shape' },
]

/** 正样本：合法形态，必须零命中。 */
const POSITIVE_SAMPLE = [
  "const profile = { apiKeyEnv: deriveCredentialRef(key) } // 动态派生：ref 名来自标识派生层",
  "const refProfile = { apiKeyEnv: 'TAIJI_MY_PROVIDER_KEY' } // ref 名字面（大写标识符）",
  "const headers = { Authorization: `Bearer ${apiKey}` } // 模板串：值在凭据通道，不落字面",
  "const draft = { apiKeyValue: '' } // 空串草稿 = 本次不写密钥",
  "credentials.set(ref, value) // 密钥唯一合法来路：宿主凭据通道（AX1）",
].join('\n')

/** 提及样本：注释与文案里讨论密钥形态，属正确代码，必须零命中。 */
const MENTION_SAMPLE = [
  ' * 密钥红线（AX1）：插件任何产物只出现 ref 名（apiKeyEnv），永不出现密钥明文。',
  ' * RL7 扫描密钥形态：sk- 前缀长串、Bearer 长串、apiKey 直接赋值——扫描范围见脚本头部。',
  '// apiKeyEnv 缺席的成员跳过凭据检查',
].join('\n')

/** 负样本自证：每条规则都必须真的把对应坏样本拦下；正样本与提及样本必须不误报。 */
function selfTestFailures() {
  const failures = []
  for (const sample of NEGATIVE_SAMPLES) {
    const violations = auditSource(sample.text, `负样本:${sample.id}`)
    if (violations.length === 0) {
      failures.push(`负样本「${sample.id}」未被拒绝，说明规则 ${sample.ruleId} 失效`)
      continue
    }
    if (!violations.some((violation) => violation.rule.id === sample.ruleId)) {
      failures.push(
        `负样本「${sample.id}」命中规则不是预期的 ${sample.ruleId}（实为 ${violations.map((v) => v.rule.id).join(', ')}）`,
      )
    }
  }
  const positive = auditSource(POSITIVE_SAMPLE, '正样本')
  if (positive.length > 0) {
    failures.push(`合规样本被误报: ${positive.map((v) => `${v.hit} → ${v.rule.id}`).join(' / ')}`)
  }
  const mention = auditSource(MENTION_SAMPLE, '提及样本')
  if (mention.length > 0) {
    failures.push(`注释/文案中的密钥形态提及被误报: ${mention.map((v) => `${v.hit} → ${v.rule.id}`).join(' / ')}`)
  }

  const noSourceFiles = collectFiles(['__definitely-no-such-dir__'])
  if (!rejectsForNoSource(noSourceFiles)) {
    failures.push('「无源码可扫」没有被判为拒绝通过——那会让本检查在产物缺失时恒绿')
  }
  return failures
}

/** 递归收集扫描范围内的文件（跳过本脚本自身与测试/spec 文件）。 */
function collectFiles(targets) {
  const files = []
  const walk = (absPath) => {
    if (!existsSync(absPath)) return
    if (resolve(absPath) === resolve(SELF)) return
    const stat = statSync(absPath)
    if (stat.isDirectory()) {
      for (const name of readdirSync(absPath).sort()) {
        if (name === 'node_modules' || name.startsWith('.')) continue
        walk(join(absPath, name))
      }
      return
    }
    if (!stat.isFile()) return
    // 测试与 spec 不进构建产物（其中的假密钥样本是断言材料，不是密钥材料入库）
    if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(absPath)) return
    const ext = absPath.slice(absPath.lastIndexOf('.'))
    if (!SCANNED_EXTENSIONS.includes(ext)) return
    files.push(absPath)
  }
  for (const target of targets) walk(resolve(ROOT, target))
  return files
}

/** 「无产物可扫」的判定：一个可扫文件都没有 = 拒绝通过（恒绿放行才是真缺陷）。 */
function rejectsForNoSource(files) {
  return files.length === 0
}

function displayPath(target) {
  const abs = resolve(ROOT, target)
  const rel = relative(ROOT, abs)
  return rel.startsWith('..') ? abs : rel
}

function main() {
  const extra = process.argv.slice(2).filter((arg) => !arg.startsWith('-'))
  const targets = [...defaultTargets(), ...extra]

  const failures = selfTestFailures()
  if (failures.length > 0) {
    console.error('✘ 负样本自证失败（密钥扫描规则本身不可信）:')
    for (const failure of failures) console.error(`  - ${failure}`)
    process.exitCode = 1
    return
  }
  console.log(
    `✔ 负样本自证：${NEGATIVE_SAMPLES.length} 个违规样本（覆盖 ${RULES.length} 条规则）均被拦下；合规样本与注释提及不误报；「无产物可扫」判为拒绝通过`,
  )

  const files = collectFiles(targets)
  if (rejectsForNoSource(files)) {
    console.error('✘ 无产物可扫：扫描范围内没有任何可被检查的源码/产物文件')
    console.error(`  扫描根: ${targets.map(displayPath).join(', ')}`)
    console.error('  这不是通过——「没有产物」不等于「产物干净」。构建落盘（pnpm build）或显式指定路径后重跑。')
    process.exitCode = 1
    return
  }

  const violations = []
  for (const file of files) violations.push(...auditSource(readFileSync(file, 'utf8'), displayPath(file)))

  if (violations.length > 0) {
    console.error(`✘ 插件产物检出 ${violations.length} 处密钥材料嫌疑（扫描 ${files.length} 个文件）:`)
    for (const violation of violations) {
      console.error(`  - ${violation.label}:${violation.line} 「${violation.hit}」— ${violation.rule.id}：${violation.rule.describe}`)
    }
    console.error('  恢复动作：密钥材料只经宿主凭据通道（ctx.remote.credentials / ctx.credentials）流转；')
    console.error('  源码与产物里只保留 ref 名（apiKeyEnv，大写标识符）。核实行后删除明文或改走凭据通道。')
    process.exitCode = 1
    return
  }

  console.log(`✔ 四类密钥形态均未出现（扫描 ${files.length} 个文件: ${targets.map(displayPath).join(', ')}）`)
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) main()
