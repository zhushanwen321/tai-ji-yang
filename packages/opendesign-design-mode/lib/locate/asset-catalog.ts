/**
 * 资产目录摘要扫描（设计 §3.1 资产层扩展；impl-plan U1）。
 *
 * 三目录各自扫描为摘要清单，是 compose 清单段与 doctor 资产丰富度节的唯一数据源：
 *   - craft/：规则书文件清点（册数口径 = 排除 README.md 与 FUTURE_SECTIONS.md 两个元文件，D10⑨）；
 *   - design-templates/：逐包读 SKILL.md 的 frontmatter 摘要（name / description 首句 /
 *     od.mode / triggers 中文项摘录 / od.craft.requires）；
 *   - design-systems/：逐包读 manifest.json 的 name/category + 在场深层文件探测
 *     （USAGE.md / components.html / tailwind-v4.css）。
 *
 * 降级口径（AX5 / AS9 / D3，三态）：
 *   1. 目录缺失 → 该目录整体降级为空清单（present=false，零条目零异常），会话不破坏；
 *   2. 字段缺席 → 合法条目按字段空值降级，不计解析异常（形状包侧：triggers/od 块/
 *      od.mode/description 缺席是 taste 变体包等的合法形态，真机实测 109/114 持 triggers）；
 *   3. 解析异常 → 条目降级为仅目录名（degraded=true）并计入 parseErrorCount：
 *      形状包侧 = SKILL.md 缺失 / frontmatter 块损坏 / name 缺席（name 是条目的路由核心，
 *      缺它无法形成有效条目）；设计系统侧 = manifest.json 非法 JSON 或 name/category
 *      任一缺席（D3：合法 JSON 缺键与非法 JSON 同口径计解析异常）。
 *      无 manifest.json 的目录（_schema 元目录）整个不进清单、不计异常——清单段分母 =
 *      品牌包数（D3 口径）。
 *
 * frontmatter 解析是最小解析器（非通用 YAML）：只认 name / description / triggers /
 * od.mode / od.craft.requires 五个目标键，支持块标量（`|`）、block 列表（`- x`）与
 * 单行 flow 序列（`[a, b]`）三种实测形态；多行 flow、tab 缩进不在边界内（真机 114 包
 * 全量为空格缩进 + 上述三形态）。OD 升级引入新形态时的暴露口径分两类：块级损坏
 * （读失败 / 无 frontmatter 块）与 name 缺席由解析异常计数暴露；键值形态变化
 * （如 triggers flow 化——assignScalar 无 triggers 分支，值被忽略）按字段缺席
 * 静默降级为空数组，不经异常计数（设计口径：字段缺席不计解析异常，U1 检查点）。
 * 全部只读直读（AX2），零 npm 依赖（node:fs / node:path）。
 * 编号口径：本文件裸编号（U/D/AX/AS/SC/RL/UD/SI/GPK 等）默认属 opendesign-assets-quality 设计包（本轮）；V1 设计包域编号带「V1 设计包 / V1·」前缀。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { AssetCatalogDirs } from './version-profile.js'

/** craft/ 目录的两个元文件（册数口径排除，D10⑨；真机 craft/ 实测仅此两个非规则书 md）。 */
const CRAFT_META_FILES: ReadonlySet<string> = new Set(['README.md', 'FUTURE_SECTIONS.md'])

/** craft 摘要：目录在场性 + 规则书文件名列表（排序保证输出确定）。 */
export interface CraftCatalog {
  /** craft/ 目录绝对路径。 */
  craftRoot: string
  /** 目录是否在场（缺失 = 整体降级空清单，AX5）。 */
  present: boolean
  /** 规则书文件名（.md、排除两个元文件；不含路径——根路径即 craftRoot）。 */
  manualFiles: string[]
}

/** 形状包摘要条目（一行一包清单段的数据单元，D2）。 */
export interface ShapeTemplateEntry {
  /** 包目录名（清单段行首标识，与根路径拼接即包目录）。 */
  dirName: string
  /** 解析异常降级条目（SKILL.md 缺失 / frontmatter 损坏 / name 缺席）——仅目录名可用。 */
  degraded: boolean
  /** frontmatter name（降级条目为 null）。 */
  name: string | null
  /** od.mode（字段缺席 → null，不计解析异常）。 */
  mode: string | null
  /** description 首句（缺席 → null）。 */
  descriptionFirstSentence: string | null
  /** triggers 字段中含中文的项（中文 brief 的路由依据，D2；缺席 → 空数组）。 */
  triggerKeywordsZh: string[]
  /** od.craft.requires slug 列表（缺席 → 空数组）。 */
  craftRequires: string[]
}

/** design-templates/ 摘要。 */
export interface ShapeTemplateCatalog {
  /** design-templates/ 目录绝对路径。 */
  root: string
  /** 目录是否在场（缺失 = 整体降级空清单，AX5）。 */
  present: boolean
  /** 逐包摘要（按目录名字典序；解析异常条目降级为仅目录名）。 */
  entries: ShapeTemplateEntry[]
  /** 解析异常条目数（doctor 资产丰富度节的异常包计数）。 */
  parseErrorCount: number
}

/** 设计系统深层文件在场标记（三文件按包可选，真机 airbnb 形态三全在场）。 */
export interface DesignSystemDeepFiles {
  usage: boolean
  components: boolean
  tailwind: boolean
}

/** 设计系统包摘要条目（manifest 感知清单段的数据单元，D3）。 */
export interface DesignSystemEntry {
  /** 包目录名。 */
  dirName: string
  /** 解析异常降级条目（manifest 非法 JSON / 缺 name / 缺 category）——仅目录名可用。 */
  degraded: boolean
  /** manifest name（降级条目为 null）。 */
  name: string | null
  /** manifest category（降级条目为 null）。 */
  category: string | null
  /** 在场深层文件（降级条目恒全 false——「降级仅目录名」，消费方不对其出深层指路）。 */
  deepFiles: DesignSystemDeepFiles
}

/** design-systems/ 摘要。 */
export interface DesignSystemCatalog {
  /** design-systems/ 目录绝对路径。 */
  root: string
  /** 目录是否在场（缺失 = 整体降级空清单，AX5）。 */
  present: boolean
  /** 逐包摘要（按目录名字典序；仅含持 manifest.json 的品牌包，_schema 等元目录被排除）。 */
  entries: DesignSystemEntry[]
  /** 解析异常条目数（doctor 资产丰富度节的异常包计数）。 */
  parseErrorCount: number
}

/** 三目录聚合摘要（doctor 资产丰富度节与 compose 四段的源数据）。 */
export interface AssetCatalog {
  craft: CraftCatalog
  shapeTemplates: ShapeTemplateCatalog
  designSystems: DesignSystemCatalog
}

/** craft/ 扫描：规则书清点。目录缺失 → present=false 空清单（AX5）。 */
export function buildCraftCatalog(craftRoot: string): CraftCatalog {
  if (!statIsDirectory(craftRoot)) {
    return { craftRoot, present: false, manualFiles: [] }
  }
  const manualFiles = readdirSync(craftRoot)
    .filter((name) => name.endsWith('.md') && !CRAFT_META_FILES.has(name))
    .sort()
  return { craftRoot, present: true, manualFiles }
}

/** design-templates/ 扫描：逐包 SKILL.md frontmatter 摘要。 */
export function buildShapeTemplateCatalog(shapeTemplatesRoot: string): ShapeTemplateCatalog {
  if (!statIsDirectory(shapeTemplatesRoot)) {
    return { root: shapeTemplatesRoot, present: false, entries: [], parseErrorCount: 0 }
  }
  const entries: ShapeTemplateEntry[] = []
  let parseErrorCount = 0
  for (const dirName of listSubDirectories(shapeTemplatesRoot)) {
    // 元文件（AGENTS.md 等）在 listSubDirectories 已被排除；此处每包只关心 SKILL.md。
    const skillPath = join(shapeTemplatesRoot, dirName, 'SKILL.md')
    const frontmatter = readSkillFrontmatter(skillPath)
    if (frontmatter === null || frontmatter.name === null) {
      // 解析异常：SKILL.md 缺失 / frontmatter 块损坏 / name 缺席 → 降级仅目录名并计数。
      entries.push({
        dirName,
        degraded: true,
        name: null,
        mode: null,
        descriptionFirstSentence: null,
        triggerKeywordsZh: [],
        craftRequires: [],
      })
      parseErrorCount += 1
      continue
    }
    entries.push({
      dirName,
      degraded: false,
      name: frontmatter.name,
      mode: frontmatter.odMode,
      descriptionFirstSentence:
        frontmatter.description === null ? null : firstSentence(frontmatter.description),
      triggerKeywordsZh: frontmatter.triggers.filter(containsCjk),
      craftRequires: frontmatter.craftRequires,
    })
  }
  return { root: shapeTemplatesRoot, present: true, entries, parseErrorCount }
}

/** design-systems/ 扫描：逐包 manifest.json 摘要 + 在场深层文件探测。 */
export function buildDesignSystemCatalog(designSystemsRoot: string): DesignSystemCatalog {
  if (!statIsDirectory(designSystemsRoot)) {
    return { root: designSystemsRoot, present: false, entries: [], parseErrorCount: 0 }
  }
  const entries: DesignSystemEntry[] = []
  let parseErrorCount = 0
  for (const dirName of listSubDirectories(designSystemsRoot)) {
    const manifestPath = join(designSystemsRoot, dirName, 'manifest.json')
    if (!existsSync(manifestPath)) {
      // 无 manifest 的目录（_schema 元目录等）不进清单、不计解析异常（D3：清单段分母 = 品牌包数）。
      continue
    }
    const summary = readManifestSummary(manifestPath)
    if (summary === null) {
      // 解析异常（非法 JSON / 缺 name / 缺 category，D3 同口径）→ 降级仅目录名并计数。
      entries.push({
        dirName,
        degraded: true,
        name: null,
        category: null,
        deepFiles: { usage: false, components: false, tailwind: false },
      })
      parseErrorCount += 1
      continue
    }
    const pkgDir = join(designSystemsRoot, dirName)
    entries.push({
      dirName,
      degraded: false,
      name: summary.name,
      category: summary.category,
      deepFiles: {
        usage: existsSync(join(pkgDir, 'USAGE.md')),
        components: existsSync(join(pkgDir, 'components.html')),
        tailwind: existsSync(join(pkgDir, 'tailwind-v4.css')),
      },
    })
  }
  return { root: designSystemsRoot, present: true, entries, parseErrorCount }
}

/** 三目录聚合扫描（消费方传 deriveCatalogDirs 的产物即可）。 */
export function buildAssetCatalog(dirs: AssetCatalogDirs): AssetCatalog {
  return {
    craft: buildCraftCatalog(dirs.craftRoot),
    shapeTemplates: buildShapeTemplateCatalog(dirs.shapeTemplatesRoot),
    designSystems: buildDesignSystemCatalog(dirs.designSystemsRoot),
  }
}

// ── frontmatter 最小解析器（形状包 SKILL.md 专用，非通用 YAML）──────────────────

/** SKILL.md frontmatter 摘要（五目标键；字段缺席为 null/空数组，不计异常）。 */
interface SkillFrontmatter {
  name: string | null
  description: string | null
  triggers: string[]
  odMode: string | null
  craftRequires: string[]
}

/**
 * 读并解析 SKILL.md frontmatter。文件缺失 / 读失败 / 无 `---` 界定的 frontmatter 块
 * → null（上层计解析异常）。name 缺席时返回的摘要 name 为 null，同样由上层计异常。
 */
function readSkillFrontmatter(skillPath: string): SkillFrontmatter | null {
  let text: string
  try {
    text = readFileSync(skillPath, 'utf8')
  } catch {
    return null
  }
  return parseSkillFrontmatter(text)
}

/**
 * frontmatter 块解析：逐行扫描，用「键栈」按相对缩进追踪嵌套路径（YAML 语义缩进任意，
 * 不假设固定两格），五目标键按完整路径精确提取——`od.design_system.mode` 之类的
 * 同名异位键不会被误读为 `od.mode`。
 */
export function parseSkillFrontmatter(text: string): SkillFrontmatter | null {
  const lines = text.split('\n')
  if (lines[0]?.trim() !== '---') return null
  let end = -1
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i]?.trim() === '---') { end = i; break }
  }
  if (end === -1) return null
  const fmLines = lines.slice(1, end)

  const summary: SkillFrontmatter = {
    name: null,
    description: null,
    triggers: [],
    odMode: null,
    craftRequires: [],
  }
  // 键栈存「键段名」而非累积路径——累积路径在每层拼接时会出现 od.od.craft.requires
  // 式重复叠段；完整路径按需由段名 join 而来。
  const stack: Array<{ indent: number; segment: string }> = []
  // 块标量（`description: |`）收集态：块内行（更深缩进）攒进 parts，缩进落出或行尽时落值。
  let blockScalar: { path: string; indent: number; parts: string[] } | null = null

  for (const line of fmLines) {
    if (line.trim() === '') continue
    const indent = leadingSpaces(line)
    if (blockScalar !== null) {
      if (indent > blockScalar.indent) {
        blockScalar.parts.push(line.trim())
        continue
      }
      finishBlockScalar(summary, blockScalar)
      blockScalar = null
    }
    const keyMatch = line.match(/^( *)[A-Za-z0-9_.-]+:(.*)$/)
    if (keyMatch !== null) {
      const keyIndent = keyMatch[1].length
      const colon = line.indexOf(':')
      const key = line.slice(keyIndent, colon)
      const rest = line.slice(colon + 1).trim()
      while (stack.length > 0 && stack[stack.length - 1].indent >= keyIndent) stack.pop()
      const path = [...stack.map((item) => item.segment), key].join('.')
      stack.push({ indent: keyIndent, segment: key })
      if (rest === '|' || rest === '>' || rest === '|-' || rest === '>-') {
        blockScalar = { path, indent: keyIndent, parts: [] }
      } else if (rest !== '') {
        assignScalar(summary, path, rest)
      }
      // rest === ''：空值键——若是列表键，后续 `- x` 行经列表项分支归属栈顶路径。
      continue
    }
    const listMatch = line.match(/^ *-(.*)$/)
    if (listMatch !== null) {
      if (stack.length === 0) continue
      const currentPath = stack.map((item) => item.segment).join('.')
      assignListItem(summary, currentPath, listMatch[1].trim())
    }
  }
  if (blockScalar !== null) finishBlockScalar(summary, blockScalar)
  return summary
}

/** 标量赋值：只认五目标键的完整路径（同名异位键不误收）。 */
function assignScalar(summary: SkillFrontmatter, path: string, raw: string): void {
  const value = stripQuotes(raw)
  if (path === 'name') summary.name = value
  else if (path === 'description') summary.description = value
  else if (path === 'od.mode') summary.odMode = value
  else if (path === 'od.craft.requires') summary.craftRequires = parseFlowList(raw)
}

/** block 列表项归属：triggers 与 od.craft.requires 的 `- x` 形态（真机 triggers 实测形态）。 */
function assignListItem(summary: SkillFrontmatter, path: string, raw: string): void {
  const value = stripQuotes(raw)
  if (path === 'triggers') summary.triggers.push(value)
  else if (path === 'od.craft.requires') summary.craftRequires.push(value)
}

/** 块标量落值（仅 description 是目标键；行间以 \n 保留，首句切分时再折叠空白）。 */
function finishBlockScalar(summary: SkillFrontmatter, block: { path: string; parts: string[] }): void {
  if (block.path === 'description') summary.description = block.parts.join('\n')
}

/** 单行 flow 序列 `[a, b]` 或裸标量（od.craft.requires 真机为单行 flow，dashboard 实读）。 */
function parseFlowList(raw: string): string[] {
  const trimmed = raw.trim()
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed
      .slice(1, -1)
      .split(',')
      .map((item) => stripQuotes(item))
      .filter((item) => item !== '')
  }
  const value = stripQuotes(trimmed)
  return value === '' ? [] : [value]
}

/** 去成对引号（`"后台"` → `后台`；真机 triggers 项实测带双引号）。 */
function stripQuotes(value: string): string {
  const trimmed = value.trim()
  if (
    trimmed.length >= 2
    && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

// ── manifest.json 摘要（设计系统侧）────────────────────────────────────────────

interface ManifestSummary {
  name: string
  category: string
}

/**
 * 读并解析 manifest.json 的 name/category。任一键缺席或非字符串、JSON 非法、读失败
 * → null（D3：合法 JSON 缺键与非法 JSON 同口径计解析异常）。
 */
function readManifestSummary(manifestPath: string): ManifestSummary | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch {
    return null
  }
  if (parsed === null || typeof parsed !== 'object') return null
  const record = parsed as Record<string, unknown>
  const name = record['name']
  const category = record['category']
  if (typeof name !== 'string' || name === '' || typeof category !== 'string' || category === '') {
    return null
  }
  return { name, category }
}

// ── 共享小件 ──────────────────────────────────────────────────────────────────

/** 目录存在且是目录（不存在 / 是文件 → false——design-templates/AGENTS.md 这类文件条目由此排除）。 */
function statIsDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/** 子目录名列表（文件条目排除；排序保证输出确定）。 */
function listSubDirectories(root: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => item.name)
    .sort()
}

/** 行首空格数（tab 缩进不在解析边界内——真机 114 包全为空格缩进）。 */
function leadingSpaces(line: string): number {
  const match = line.match(/^ */)
  return match === null ? 0 : match[0].length
}

/** 含 CJK 表意文字（含扩展 A）判定——triggers 中文项摘录依据（D2：中文 brief 的路由价值）。 */
function containsCjk(value: string): boolean {
  return /[\u3400-\u4dbf\u4e00-\u9fff]/.test(value)
}

/**
 * description 首句：折叠空白后取第一个「句号 + 空白」或以句号结尾的整段。
 * 无句号的 description 返回全文（真机 114 包 description 实测均有句号；上游若出现
 * 无句号长文，清单段体积由 compose 侧消费约束，本层保真不截断）。
 */
export function firstSentence(description: string): string {
  const collapsed = description.replace(/\s+/g, ' ').trim()
  const idx = collapsed.indexOf('. ')
  if (idx === -1) return collapsed
  return collapsed.slice(0, idx + 1)
}
