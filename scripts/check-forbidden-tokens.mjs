#!/usr/bin/env node
/**
 * p1-shell-identity 红灯 RL1 / RL2 / RL3 / RL9 静态自检：本包的源码不得触碰的五类宿主领地。
 *
 * 五类禁止（p1-shell-identity 设计 §4.2 断言红灯表 + §3.3 决策 D2/D7）：
 *   ① 宿主字族 / 字号轴：`--font-*` 槽位、`--dsw-font-family*`，以及 `textFontFamily` /
 *      `codeFontFamily` / `terminalFontFamily` 三个配置字段的写入 → 用户选的字体与 ⌘+/⌘- 字号
 *      会被本包吃掉（p1-shell-identity RL2）。
 *   ② `--dsw-font-*` 复合简写覆盖：**只放行安全重写形态**——size/family 段保留宿主 var()
 *      引用、行高 unitless、weight 三位数字（外观深化层 3 的契约，宿主源逐段一致由
 *      client/theme/host-font-sheet.spec.ts 对账看守）；整串写死（字面 family / 缺行高分隔）
 *      仍越界（p1-shell-identity RL9）。
 *   ③ 以 `-font-size` / `-font-family` 结尾的子 token 覆盖：同上。只允许 `*-font-weight` /
 *      `*-line-height` 两类独立子 token（p1-shell-identity RL9 / D7——D7 明示放行且仅放行这两类）。
 *   ④ 宿主私有几何变量 `--dsh-frame-top-clearance` / `--dsh-windows-titlebar-height`：写它们等于
 *      改写窗口顶条几何，而布局几何归宿主（p1-shell-identity RL3）。
 *   ⑤ `theme.register(` 调用：注册第三方主题 id 会让宿主把 `html[data-ds-theme-source]` 固定成该 id
 *      的 scheme 并镜像到系统 `nativeTheme.themeSource`，「跟随系统」永久失效（p1-shell-identity RL1）。
 *
 * 判定口径 = **写入形态**，不是「字面出现」。token 只有以声明形态出现才算写入：
 *   · 作为键（`"--font-x":` / `--font-x:`，对象字面量或 CSS 文本都走这一条）
 *   · 作为 token 表的数组元素（`['--font-x', '#fff']`，本仓 `index.js` 的双模表即此形态）
 *   · 作为成员赋值左值（`tokens["--font-x"] = …`）
 *   · 作为 `style.setProperty("--font-x", …)` 的首参
 * 反过来，注释、文档性提及、错误文案里出现 token 名**不算**违规——它们不写入任何 DOM。
 * 加这条口径的理由：本仓源码必然要在注释里说明「不写 `--font-*` 槽位」，把「字面出现」当违规
 * 会让正确代码恒红，检查随之被关掉，那才是真正的失效。
 *
 * 扫描范围（**扫真实会被装载的源码**，不是猜测）：`index.js`（Node 半场的 CSS 同样落进页面）与
 * `client/**`（浏览器半场）。`client/` 由 U2/U3/U6/U7 落盘后自动进入范围，无需改本脚本。也可在
 * 命令行追加路径（`node scripts/check-forbidden-tokens.mjs <path…>`）供人工核对。
 *
 * 目标缺失分支（设计缺口补丁，见 ledger D1 第二轮裁决 7）：一个可扫文件都没有时**拒绝通过**
 * （exit 1）而不是恒绿放行——「没有源码」不等于「源码干净」。
 *
 * 负样本自证（每次运行都跑）：内存里合成五类违规样本 + 一份合规样本 + 两处「提及不该误报」的
 * 样本，断言违规被拒、合规与提及都不误报，证明规则真的会红且不会假红。
 *
 * `--strict`（或 `CHECK_STRICT=1`）下「覆盖缺口」也算失败；默认模式下缺口会被显式播报但不改变
 * 退出码，供上游源码尚未落盘的时段（U1）跑自检，正向覆盖由后续节点的同类检查补齐。
 *
 * 只依赖 node 内置模块。退出码 0 = 通过（默认模式下可能含已播报的覆盖缺口），1 = 至少一项失败。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { workspacePackages, WORKSPACE_ROOT } from './workspace-packages.mjs'

const ROOT = WORKSPACE_ROOT
const SELF = fileURLToPath(import.meta.url)

/**
 * 默认扫描根（相对仓库根），按包枚举（设计 D10）：每包扫「真实会被装载的源码」——
 * 根包的 Node 半场入口与浏览器半场目录；子包为 lib/（host 半源码与产物同批入库，内容
 * 等价）与 client/（浏览器半场源）。包清单来自 scripts/workspace-packages.mjs，新包落盘
 * 后自动进入扫描范围，无需改本脚本。也可在命令行追加路径供人工核对。
 */
function defaultTargets() {
  const targets = []
  for (const pkg of workspacePackages()) {
    if (pkg.dir === '.') targets.push('index.js', 'client')
    else targets.push(join(pkg.dir, 'lib'), join(pkg.dir, 'client'))
  }
  return targets
}
const SCANNED_EXTENSIONS = ['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.tsx', '.jsx', '.css']

/** 五类禁止：token 命名规则（按声明形态取到的 token 名再分类）。 */
// 顺序即优先级：更具体的规则在前。`--dsw-font-base-16-font-family` 同时命中「复合简写」与
// 「字族子 token」，取更具体的后者（报错指向的修复动作因此更准确：去掉这个子 token 覆盖）。
const TOKEN_RULES = [
  {
    id: 'RL2:font-family-slot',
    describe: '写宿主字族槽位（--font-*）会吃掉用户的字体选择',
    test: (token) => token.startsWith('--font-'),
  },
  {
    id: 'RL9:font-size-or-family-subtoken',
    describe: '覆盖 *-font-size / *-font-family 子 token 会废掉宿主字号轴（只允许 *-font-weight / *-line-height）',
    test: (token) => /-(?:font-size|font-family)$/.test(token),
  },
  {
    id: 'RL9:font-shorthand',
    describe:
      '覆盖 --dsw-font-* 复合简写必须保留宿主 size/family 的 var() 引用（安全重写形态：weight 三位数字 + size 段任意 + /unitless 行高 + family 只能 var(--dsw-font-family) 或 var(--ds-font-family-code)）；整串写死仍越界——那会冻结字号与字族轴',
    // 命中本规则（token 名是复合简写主体）后由 safeShorthandOnLine 做值形态校验：安全形态
    // 放行（层 3 的重写载体），其余（字面 family、缺行高分隔、非数字 weight、未知插值）拦。
    // 以 `-font-weight` / `-line-height` 结尾的独立子 token 不进本规则（p1-shell-identity D7 放行的两类）。
    test: (token) =>
      token.startsWith('--dsw-font-') &&
      !/-(?:font-weight|line-height)$/.test(token),
  },
  {
    id: 'RL3:host-geometry-var',
    describe: '写宿主私有几何变量等于改写窗口布局',
    test: (token) => token === '--dsh-frame-top-clearance' || token === '--dsh-windows-titlebar-height',
  },
]

/** 全部规则 id（负样本自证消息里用于表达覆盖度）。 */
const RULE_IDS = [
  ...TOKEN_RULES.map((rule) => rule.id),
  'RL2:font-family-field',
  'RL1:theme-register',
]

const FONT_FAMILY_FIELD_RULE = {
  id: 'RL2:font-family-field',
  describe: '写 textFontFamily / codeFontFamily / terminalFontFamily 等同改写宿主字族配置',
}

const THEME_REGISTER_RULE = {
  id: 'RL1:theme-register',
  describe: '注册第三方主题 id 会让「跟随系统」永久失效',
}

// 三种声明形态。逐个在「去掉注释后的行」上匹配。
const DECL_KEY_RE = /(--[A-Za-z0-9][A-Za-z0-9_-]*)\s*['"]?\s*:/g
const ARRAY_PAIR_RE = /\[\s*['"](--[A-Za-z0-9][A-Za-z0-9_-]*)['"]\s*,/g
const MEMBER_SET_RE = /\[\s*['"](--[A-Za-z0-9][A-Za-z0-9_-]*)['"]\s*\]\s*[=+\-*/|&]?=/g
const SET_PROPERTY_RE = /setProperty\s*\(\s*['"](--[A-Za-z0-9][A-Za-z0-9_-]*)['"]/g
const FONT_FAMILY_FIELD_RE = /\b(?:text|code|terminal)FontFamily\b\s*['"]?\s*(?:[:=])/g
const THEME_REGISTER_RE = /\btheme\s*\.\s*register\s*\(/g

/** 去掉块注释与整行行注释，保留代码与行号（注释里提到 token 不算写入）。 */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
}

function classifyToken(token) {
  return TOKEN_RULES.find((rule) => rule.test(token)) ?? null
}

/**
 * 安全重写形态的值校验（RL9:font-shorthand 的放行通道）。
 *
 * structure.ts 的重写值是模板串插值形态（`both(\`${WEIGHT_TEXT} ${SIZE_CONTENT}/${LEADING_BODY} ${FAMILY_UI}\`)`），
 * 静态扫描无法求值——用本包仅有的常量插值替换表近似求值；**未知插值（不在表内）一律不放行**
 * （保守：宁可误拦也不放过写死形态）。纯字面安全形态同样放行。
 */
const SHORTHAND_TEMPLATE_SUBSTS = {
  '${WEIGHT_TEXT}': '500',
  '${WEIGHT_MID}': '600',
  '${WEIGHT_BOLD}': '700',
  '${LEADING_TIGHT}': '1.32',
  '${LEADING_BODY}': '1.62',
  '${LEADING_UI}': '1.4',
  '${FAMILY_UI}': 'var(--dsw-font-family)',
  '${FAMILY_CODE}': 'var(--ds-font-family-code)',
  '${SIZE_CONTENT}': 'var(--dsh-content-font-size, 14px)',
  '${SIZE_CONTENT_SECONDARY}': 'var(--dsh-content-font-size-secondary, 13px)',
}

/** 安全重写形态：`[italic ]<weight> <size 任意含 var 引用>/<unitless 行高> <family var 引用>`。 */
const SAFE_SHORTHAND_VALUE_RE =
  /^(?:italic )?\d{3} .+\/[\d.]+ var\((?:--dsw-font-family|--ds-font-family-code)\)$/

/** 判定某行对某复合简写的写入是否安全重写形态（提取不到值时按违规处理——宁可误拦）。 */
function safeShorthandOnLine(line, token) {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const decl = line.match(new RegExp(`${escaped}\\s*['\"]?\\s*:\\s*(.+)$`))
  if (!decl) return false
  let value = decl[1].trim()
  // 按包装类型剥壳，两条路径互斥：对象值取 light 支字符串后不再剥（其结尾 `var(…)` 的
  // `)` 会被包装剥尾正则误剥）；both(…) 包装则剥 both( 头与 ) 尾后再剥引号。
  const objMatch = value.match(/^\{\s*light:\s*['"`]([^'"`]+)['"`]/)
  if (objMatch) {
    value = objMatch[1]
  } else {
    value = value
      .replace(/^both\(/, '')
      .replace(/\)\s*\}*\s*[,;]?\s*$/, '')
      .replace(/^['"`]/, '')
      .replace(/['"`]\s*\}*\s*[,;]?\s*$/, '')
  }
  for (const [placeholder, literal] of Object.entries(SHORTHAND_TEMPLATE_SUBSTS)) {
    value = value.split(placeholder).join(literal)
  }
  value = value.replace(/\s*\/\s*/, '/').replace(/\s+/g, ' ').trim()
  return SAFE_SHORTHAND_VALUE_RE.test(value)
}

/** 扫描一段文本，返回违规清单（含行号与命中规则，便于逐条定位）。 */
export function auditSource(text, label = '<memory>') {
  const violations = []
  const code = stripComments(text)
  code.split(/\r?\n/).forEach((rawLine, index) => {
    if (rawLine.trimStart().startsWith('//')) return
    const line = index + 1
    const tokenHits = new Map()
    for (const re of [DECL_KEY_RE, ARRAY_PAIR_RE, MEMBER_SET_RE, SET_PROPERTY_RE]) {
      for (const match of rawLine.matchAll(re)) tokenHits.set(match[1], match[0].trim())
    }
    for (const [token, hit] of tokenHits) {
      const rule = classifyToken(token)
      if (!rule) continue
      // RL9:font-shorthand 的放行通道：安全重写形态（size/family 保留宿主 var() 引用）不算越界
      if (rule.id === 'RL9:font-shorthand' && safeShorthandOnLine(rawLine, token)) continue
      violations.push({ label, line, hit, rule })
    }
    for (const match of rawLine.matchAll(FONT_FAMILY_FIELD_RE)) {
      violations.push({ label, line, hit: match[0].trim(), rule: FONT_FAMILY_FIELD_RULE })
    }
    THEME_REGISTER_RE.lastIndex = 0
    if (THEME_REGISTER_RE.test(rawLine)) {
      violations.push({ label, line, hit: 'theme.register(', rule: THEME_REGISTER_RULE })
    }
    THEME_REGISTER_RE.lastIndex = 0
  })
  return violations
}

/** 负样本：每条规则一个坏样本；expectRule = 必须命中的规则 id。 */
const NEGATIVE_SAMPLES = [
  {
    id: 'RL2 字族槽位（对象键）',
    text: 'const overrides = { "--font-brand": "X" }',
    ruleId: 'RL2:font-family-slot',
  },
  {
    id: 'RL2 字族槽位（CSS 文本）',
    text: 'const css = "html body { --font-code: X; }"',
    ruleId: 'RL2:font-family-slot',
  },
  {
    id: 'RL2 字族槽位（setProperty）',
    text: 'root.style.setProperty("--font-brand", "X")',
    ruleId: 'RL2:font-family-slot',
  },
  {
    id: 'RL2 字族配置字段',
    text: 'const patch = { textFontFamily: "X" }',
    ruleId: 'RL2:font-family-field',
  },
  {
    id: 'RL9 复合简写（token 表数组元素）',
    text: "const tokens = [['--dsw-font-heading', '600 14px/1.4 X', '600 14px/1.4 X']]",
    ruleId: 'RL9:font-shorthand',
  },
  {
    id: 'RL9 复合简写（family 写死，其余形态正确——证明值校验真的在看值）',
    text: 'const overrides = { "--dsw-font-base-16": { light: "500 16px/1.4 Arial, sans-serif", dark: "500 16px/1.4 Arial, sans-serif" } }',
    ruleId: 'RL9:font-shorthand',
  },
  {
    id: 'RL9 字号子 token（对象键）',
    text: 'tokens["--dsw-alias-label-font-size"] = { light: "13px", dark: "13px" }',
    ruleId: 'RL9:font-size-or-family-subtoken',
  },
  {
    id: 'RL9 字族子 token（对象键）',
    text: 'const table = { "--dsw-font-base-16-font-family": { light: "X", dark: "X" } }',
    ruleId: 'RL9:font-size-or-family-subtoken',
  },
  {
    id: 'RL3 宿主几何变量',
    text: 'root.style.setProperty("--dsh-frame-top-clearance", "0px")',
    ruleId: 'RL3:host-geometry-var',
  },
  {
    id: 'RL1 theme.register',
    text: 'ctx.theme.register("taiji-xuan", { scheme: "dark" })',
    ruleId: 'RL1:theme-register',
  },
]

/** 正样本：只写白名单 alias、独立子 token 与**安全重写形态**的复合简写，必须零命中。 */
const POSITIVE_SAMPLE = [
  'const overrides = {',
  '  "--dsw-alias-bg-base": { light: "#f7f6f3", dark: "#18181b" },',
  '  "--dsw-alias-radius-md": { light: "6px", dark: "6px" },',
  '  "--dsw-alias-label-primary-font-weight": { light: "500", dark: "500" },',
  '  "--dsw-alias-body-line-height": { light: "1.6", dark: "1.6" },',
  // 宿主真实子 token 名（--dsw-font- 命名空间下）：证明 RL9:font-shorthand 的排除项真的放行
  // p1-shell-identity D7 允许的 *-font-weight / *-line-height 覆盖，而不是只对合成名有效。
  '  "--dsw-font-markdown-base-font-weight": { light: "500", dark: "500" },',
  '  "--dsw-font-markdown-h1-line-height": { light: "1.32", dark: "1.32" },',
  // 安全重写形态的复合简写（层 3 载体）：family 是宿主 var() 引用、行高 unitless、weight
  // 三位数字——纯字面形态与 structure.ts 的模板串插值形态都必须放行。
  '  "--dsw-font-markdown-base": { light: "500 var(--dsh-content-font-size, 14px)/1.62 var(--dsw-font-family)", dark: "500 var(--dsh-content-font-size, 14px)/1.62 var(--dsw-font-family)" },',
  '}',
  "const structure = { '--dsw-font-s-14': both(`${WEIGHT_TEXT} 14px/${LEADING_UI} ${FAMILY_UI}`) }",
  'ctx.theme.overrideTokens("tai-ji-yang-shell", overrides)',
].join('\n')

/** 提及样本：注释与错误文案里出现被禁 token 名，属正确代码，必须零命中。 */
const MENTION_SAMPLE = [
  '// 不写 --font-code 槽位，也不覆盖 --dsw-font-base-16 复合简写（RL2 / RL9）',
  '/* 宿主私有几何：--dsh-frame-top-clearance 不归本包 */',
  'throw new Error("本包不改写 textFontFamily 与 --dsw-font-* 复合简写")',
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
    failures.push(`注释/文案中的 token 提及被误报: ${mention.map((v) => `${v.hit} → ${v.rule.id}`).join(' / ')}`)
  }

  const noSourceFiles = collectFiles(['__definitely-no-such-dir__'])
  if (!rejectsForNoSource(noSourceFiles)) {
    failures.push('「无源码可扫」没有被判为拒绝通过——那会让本检查在上游源码缺失时恒绿')
  }
  return failures
}

/** 递归收集扫描范围内的文件（跳过本脚本自身，避免自我污染）。 */
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
    // 测试与 spec 不进构建产物（build-client 只装配 client/apply.ts 的运行时图），
    // 其中的期望集对象键长得像写入形态但不是——扫描口径是「真实会被装载的源码」。
    if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(absPath)) return
    const ext = absPath.slice(absPath.lastIndexOf('.'))
    if (!SCANNED_EXTENSIONS.includes(ext)) return
    files.push(absPath)
  }
  for (const target of targets) walk(resolve(ROOT, target))
  return files
}

/** 「无源码可扫」的判定：一个可扫文件都没有 = 拒绝通过（恒绿放行才是真缺陷）。 */
function rejectsForNoSource(files) {
  return files.length === 0
}

/** 严格模式：目标/覆盖缺口即失败。默认放行并显式播报缺口，供上游未落盘的时段跑自检。 */
function isStrict() {
  return process.argv.includes('--strict') || process.env.CHECK_STRICT === '1'
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
    console.error('✘ 负样本自证失败（禁用 token 规则本身不可信）:')
    for (const failure of failures) console.error(`  - ${failure}`)
    process.exitCode = 1
    return
  }
  console.log(
    `✔ 负样本自证：${NEGATIVE_SAMPLES.length} 个违规样本（覆盖 ${RULE_IDS.length} 条规则）均被拦下；合规样本与注释提及不误报；「无源码可扫」判为拒绝通过`,
  )

  const files = collectFiles(targets)
  if (rejectsForNoSource(files)) {
    console.error('✘ 无源码可扫：扫描范围内没有任何可被检查的源码文件')
    console.error(`  扫描根: ${targets.map(displayPath).join(', ')}`)
    console.error('  这不是通过——「没有源码」不等于「源码干净」。补齐源码（或显式指定路径）后重跑。')
    process.exitCode = 1
    return
  }

  const violations = []
  for (const file of files) violations.push(...auditSource(readFileSync(file, 'utf8'), displayPath(file)))

  if (violations.length > 0) {
    console.error(`✘ 检出 ${violations.length} 处越界写入（扫描 ${files.length} 个文件）:`)
    for (const violation of violations) {
      console.error(`  - ${violation.label}:${violation.line} 「${violation.hit}」— ${violation.rule.id}：${violation.rule.describe}`)
    }
    process.exitCode = 1
    return
  }

  console.log(
    `✔ 五类禁止均未出现（扫描 ${files.length} 个文件: ${files.map(displayPath).join(', ')}）`,
  )

  // 浏览器半场源码（client/）随各单元落盘；某包 client/ 缺失时该包只覆盖了 host 半源码。
  // 这里按包显式播报覆盖缺口，不用「通过」冒充覆盖完整；需要强制完整覆盖时用 --strict。
  const missingClientPackages = workspacePackages().filter((pkg) => !existsSync(join(ROOT, pkg.dir, 'client')))
  if (missingClientPackages.length > 0) {
    const message = [
      `⚠ 覆盖不完整（本次不构成全部通过）: 以下包的 client/ 尚未落盘，本次只检查了它们的 host 半源码: ${missingClientPackages.map((pkg) => pkg.dir).join(', ')}`,
      '   浏览器半场源码落盘后本脚本自动纳入扫描，无需改动',
      '   负样本自证已通过（六条规则本身可信），但这些包的浏览器半场源码从未被扫过——不要把这一行读成「全部通过」',
      '   强制要求完整覆盖（覆盖缺口即失败，退出码 1）: node scripts/check-forbidden-tokens.mjs --strict',
    ].join('\n')
    if (isStrict()) {
      console.error(message)
      process.exitCode = 1
      return
    }
    console.warn(message)
  }
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) main()
