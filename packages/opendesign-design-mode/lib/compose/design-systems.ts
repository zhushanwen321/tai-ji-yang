/**
 * 设计系统清单段生成（manifest 感知形态，D3；权威依据 = 任务书 U2 职责 3）。
 *
 * V1 的设计系统清单只列目录名（task-routing 段内 `- <name>` 行）；本模块升级为
 * 「目录名（name, category）+ 在场深层文件指路」——manifest.json 的 name/category 是
 * 按 brief 选型的关键信息（如 E-Commerce & Retail），深层文件（USAGE.md / components.html /
 * tailwind-v4.css）按包在场列出指路（D3 采用形态）。
 *
 * 降级口径（与 U1 探测层同源，本层只消费）：
 *   - 目录缺失 / 零条目 → 显式空清单指引（AX5：不发明品牌）；
 *   - 解析异常条目（manifest 非法 JSON / 缺 name / 缺 category）→ 仅目录名 + unparsed
 *     标注（消费方不对其出 name/品类与深层指路）；
 *   - 无 manifest.json 的目录（_schema 元目录）不进 catalog（D3：清单段分母 = 品牌包数），
 *     本层无需再过滤。
 *
 * DESIGN.md / tokens.css 读取指引维持 V1 现状（D3：指路维持，不注入摘要）。
 * 自产措辞（AX3 不约束自产文本），段文本为独立注入段（bundle.ts 编排第四段）。
 */
import type { DesignSystemCatalog, DesignSystemEntry } from '../locate/asset-catalog.js'

/** 段标题（V1 task-routing 段内同名节迁移升级，测试锚与用户可读导航不变）。 */
const SECTION_TITLE = '### Design systems installed on this machine'

/** 深层文件指路的实名与顺序（探测键 → 文件名；D3 三文件，真机 airbnb 形态三全在场）。 */
const DEEP_FILE_LABELS: Array<{ key: 'usage' | 'components' | 'tailwind'; label: string }> = [
  { key: 'usage', label: 'USAGE.md' },
  { key: 'components', label: 'components.html' },
  { key: 'tailwind', label: 'tailwind-v4.css' },
]

/** 一个设计系统包的清单行（D3：目录名 — name (category) — 在场深层文件指路）。 */
function designSystemLine(entry: DesignSystemEntry): string {
  if (entry.degraded) {
    // 解析异常降级条目：仅目录名——匹配线索与消费入口都只剩目录名本身。
    return `- ${entry.dirName} (unparsed — match by directory name and read the package directory directly)`
  }
  let line = `- ${entry.dirName} — ${entry.name} (${entry.category})`
  const deepFiles = DEEP_FILE_LABELS.filter(({ key }) => entry.deepFiles[key]).map(({ label }) => label)
  if (deepFiles.length > 0) line += ` — also read: ${deepFiles.join(', ')}`
  return line
}

/**
 * 设计系统清单段（manifest 感知形态）。
 *
 * @param catalog design-systems/ 摘要（U1 buildDesignSystemCatalog 产物）。
 * @returns 清单段文本（自产内容；不含 OD 资产原文，不含宿主特征串）。
 */
export function renderDesignSystemsSegment(catalog: DesignSystemCatalog): string {
  const lines: string[] = [SECTION_TITLE, '']
  if (!catalog.present || catalog.entries.length === 0) {
    lines.push(
      'No design-system directories were found in this installation. If the user',
      'names a brand or design system, say none is installed locally instead of',
      'inventing one.',
    )
    return lines.join('\n')
  }
  lines.push(
    `Manifest-aware listing of the design-system packages installed on this`,
    `machine — root: \`${catalog.root}\`. The leading directory name of each`,
    'line is the package directory under this root; the manifest name and',
    'category follow. "also read" names the deeper reference files present in',
    'that package.',
    '',
    ...catalog.entries.map(designSystemLine),
    '',
    'When the user names a brand, match it against this list (brand name or',
    'category), then read `<design-systems-root>/<dirName>/DESIGN.md`,',
    '`tokens.css`, and sibling files directly with your file tools.',
  )
  return lines.join('\n')
}
