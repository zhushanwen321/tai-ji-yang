import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 项目 reviewer 与 pr-cr-fix 入口的静态契约测试（本批新增资产的接口护栏）。
 *
 * 看守的契约（机器可判部分，语义问题由四份 reviewer 定义自身承载）：
 *  1. 四份 reviewer 文件存在且文件名 `review-<维度>.md` 是接口——循环按文件名去掉
 *     `review-` 前缀与 `.md` 后缀派生维度名，文件改名即断维。
 *  2. 每份 reviewer 声明必读项目文档（AGENTS.md / docs/ARCHITECTURE.md /
 *     docs/DSH-PLUGIN-RULES.md）——审查判据来自仓内规范，不内嵌副本。
 *  3. 无上游 taiji 工作流设施硬编码：constraints 清单、固定约束编号、dev-merge /
 *     pr-pre-merge 等脚本名不得出现在任何文件——本项目的审查面与门禁设施和上游不同。
 *  4. 双平台返回协议齐全：zcode saved review-fix-loop 的 camelCase 键集
 *     {reportFile, mustFix, suggestion, reconciliation} 与 pi 内置版的 snake_case 键集
 *     （report_file / must_fix / prev_id）+ 对账四态 + 「口径以派发 prompt 为准」。
 *  5. pr-cr-fix/SKILL.md：流程五步齐且有序、push 须当场授权且不建 PR、
 *     仓库与 remote 标识正确、默认 base=main、后续 pr-lifecycle 产物只作占位登记
 *     （不出现其可执行文件路径，不声称已存在）。
 *  6. 通用写盘纪律：全部文件无本机绝对路径（/Users/、/home/）、无 emoji、
 *     frontmatter 不写 model 字段（派发模型继承主 agent）。
 */

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const REVIEWER_DIR = join(root, '.agents', 'reviewers')
const SKILL_PATH = join(root, '.agents', 'skills', 'pr-cr-fix', 'SKILL.md')

/** 四份 reviewer：文件名即维度接口（循环侧按文件名派生维度）。 */
const REVIEWER_FILES = [
  'review-business-logic.md',
  'review-dsh-contract.md',
  'review-dsh-lifecycle.md',
  'review-dsh-ui.md',
]

/** 每份 reviewer 必读的仓内规范文档（审查判据来源，相对仓库根）。 */
const REQUIRED_PROJECT_DOCS = ['AGENTS.md', 'docs/ARCHITECTURE.md', 'docs/DSH-PLUGIN-RULES.md']

/**
 * 上游 taiji 工作流设施与固定约束编号的黑名单：本项目不引用 constraints 清单机制、
 * 不复用上游脚本名、不出现其约束编号体系（C-<域>-<数字>）、不引用其文档路径。
 */
const TAIJI_HARDCODE_BLACKLIST = [
  'constraints.json',
  'select-constraints',
  'FEATURE-PRIORITIES',
  'STANDARDS.md',
  'C-comm-',
  'C-state-',
  'C-data-',
  'C-proc-',
  'dev-merge',
  'pr-pre-merge',
  'pr-submit',
  'coverage-gate',
  'metrics-gate',
  'quality-gates',
  'tai-ji-workspace',
  'Electron',
  'apps/electron',
  'packages/renderer',
  'packages/runtime',
]

/** 本机绝对路径的磁盘事实特征（规则：仓内文件不写本机路径）。 */
const LOCAL_ABS_PATH_PATTERNS = [/\/Users\//, /\/home\//]

/** emoji 覆盖区（不含排版箭头等常规符号）。 */
const EMOJI_PATTERN = /[\u{1F000}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|\u{FE0F}/u

/** 提取文件头部 YAML frontmatter 文本；无 frontmatter 返回 null。 */
function frontmatterOf(content: string): string | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)
  return match ? match[1] : null
}

function readRepoFile(relPath: string): string {
  return readFileSync(join(root, relPath), 'utf8')
}

describe('reviewer 文件与接口命名', () => {
  it('四份 reviewer 文件都存在且非空', () => {
    for (const file of REVIEWER_FILES) {
      const path = join(REVIEWER_DIR, file)
      expect(existsSync(path), `缺失 reviewer 文件: ${file}`).toBe(true)
      expect(readFileSync(path, 'utf8').length, `${file} 为空文件`).toBeGreaterThan(0)
    }
  })

  it('reviewers 目录里的文件名都符合 review-<维度>.md 接口形态', () => {
    const names = readdirSync(REVIEWER_DIR).filter((name) => name.endsWith('.md'))
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) {
      expect(name, `文件名不符合 review-<维度>.md 接口: ${name}`).toMatch(/^review-[a-z][a-z-]*\.md$/)
    }
  })

  it('frontmatter：name 与文件名派生的维度一致、description 非空、不写 model 字段', () => {
    for (const file of REVIEWER_FILES) {
      const front = frontmatterOf(readFileSync(join(REVIEWER_DIR, file), 'utf8'))
      expect(front, `${file} 缺 frontmatter`).not.toBeNull()
      const dimension = basename(file).replace(/^review-/, '').replace(/\.md$/, '')
      expect(front).toMatch(new RegExp(`^name:\\s*review-${dimension}\\s*$`, 'm'))
      expect(front).toMatch(/^description:\s*"?[^\s]/m)
      expect(front, `${file} frontmatter 不得写 model 字段（派发模型继承主 agent）`).not.toMatch(/^model\s*:/m)
    }
  })

  it('每份 reviewer 声明必读项目文档（AGENTS / ARCHITECTURE / DSH-PLUGIN-RULES）', () => {
    for (const file of REVIEWER_FILES) {
      const content = readFileSync(join(REVIEWER_DIR, file), 'utf8')
      for (const doc of REQUIRED_PROJECT_DOCS) {
        expect(content.includes(doc), `${file} 未引用必读项目文档: ${doc}`).toBe(true)
      }
    }
  })

  it('每份 reviewer 声明机器检查分工（不重复机检条目）与报告定位标记格式', () => {
    for (const file of REVIEWER_FILES) {
      const content = readFileSync(join(REVIEWER_DIR, file), 'utf8')
      expect(content.includes('机器已看守'), `${file} 未声明机器检查分工`).toBe(true)
      expect(content.includes('review-<维度>#<序>'), `${file} 未声明报告定位标记格式`).toBe(true)
      expect(content.includes('Read 失败时立即停止审查并报错'), `${file} 缺判据文件缺失时的停止条款`).toBe(true)
    }
  })
})

describe('双平台返回协议（zcode camelCase 与 pi snake_case）', () => {
  it('每份 reviewer 声明 zcode saved review-fix-loop 键集 {reportFile, mustFix, suggestion, reconciliation}', () => {
    for (const file of REVIEWER_FILES) {
      const content = readFileSync(join(REVIEWER_DIR, file), 'utf8')
      for (const key of ['reportFile', 'mustFix', 'suggestion', 'reconciliation', 'prevId']) {
        expect(content.includes(key), `${file} 缺 zcode 结构化键: ${key}`).toBe(true)
      }
    }
  })

  it('每份 reviewer 声明 pi snake_case 键集与对账四态、派发 prompt 口径条款', () => {
    for (const file of REVIEWER_FILES) {
      const content = readFileSync(join(REVIEWER_DIR, file), 'utf8')
      for (const key of ['report_file', 'must_fix', 'prev_id']) {
        expect(content.includes(key), `${file} 缺 pi snake_case 键: ${key}`).toBe(true)
      }
      for (const status of ['not-fixed', 'regressed', 'escalate']) {
        expect(content.includes(status), `${file} 缺对账状态: ${status}`).toBe(true)
      }
      expect(content.includes('口径以派发 prompt 为准'), `${file} 缺派发 prompt 口径条款`).toBe(true)
    }
  })
})

describe('无上游 taiji 设施硬编码与本机路径', () => {
  const allFiles = [...REVIEWER_FILES.map((f) => join('.agents', 'reviewers', f)), join('.agents', 'skills', 'pr-cr-fix', 'SKILL.md')]

  it('五个文件都不含上游 taiji 工作流设施与固定约束编号', () => {
    for (const relPath of allFiles) {
      const content = readRepoFile(relPath)
      for (const token of TAIJI_HARDCODE_BLACKLIST) {
        expect(content.includes(token), `${relPath} 出现上游设施/约束编号: ${token}`).toBe(false)
      }
    }
  })

  it('五个文件都不含本机绝对路径与 emoji', () => {
    for (const relPath of allFiles) {
      const content = readRepoFile(relPath)
      for (const pattern of LOCAL_ABS_PATH_PATTERNS) {
        expect(content.match(pattern), `${relPath} 含本机绝对路径: ${String(content.match(pattern))}`).toBeNull()
      }
      expect(content.match(EMOJI_PATTERN), `${relPath} 含 emoji`).toBeNull()
    }
  })
})

describe('pr-cr-fix/SKILL.md 流程契约', () => {
  const content = () => readFileSync(SKILL_PATH, 'utf8')

  it('frontmatter name 与 skill 目录名一致', () => {
    const front = frontmatterOf(content())
    expect(front).not.toBeNull()
    expect(front).toMatch(/^name:\s*pr-cr-fix\s*$/m)
  })

  it('引用全部四份 reviewer 文件名', () => {
    const body = content()
    for (const file of REVIEWER_FILES) {
      expect(body.includes(file), `SKILL.md 未引用 reviewer: ${file}`).toBe(true)
    }
  })

  it('流程：默认 pr-lifecycle 编排在前，手工兜底与 awaiting-push 在后', () => {
    const body = content()
    const markers = [
      'pr-lifecycle workflow（默认编排）',
      'check-all 与真机验收（手工兜底的前置）',
      'review-fix-loop（手工兜底的审查循环）',
      'final check-all（手工兜底）',
      'awaiting-push（终态披露',
    ]
    let cursor = -1
    for (const marker of markers) {
      const at = body.indexOf(marker)
      expect(at, `SKILL.md 缺流程步骤标记: ${marker}`).toBeGreaterThan(-1)
      expect(at, `SKILL.md 流程步骤顺序错误: ${marker}`).toBeGreaterThan(cursor)
      cursor = at
    }
  })

  it('push 约束：须当场授权、remote github、仓库标识正确；workflow 本体不建 PR', () => {
    const body = content()
    expect(body.includes('git push github HEAD'), '缺 push 命令形态').toBe(true)
    expect(body.includes('当场请求用户明确授权'), '缺 push 当场授权条款').toBe(true)
    expect(body.match(/remote 名 = `github`/), '缺 remote github 声明').not.toBeNull()
    expect(body.includes('zhushanwen321/tai-ji-yang'), '缺仓库标识').toBe(true)
    expect(body.includes('不自动 push'), '缺不自动 push 声明').toBe(true)
    expect(body.includes('不执行 `git push`，不创建 PR'), '缺 workflow 不建 PR 声明').toBe(true)
    // PR 创建只允许出现在“用户另行决定/授权后”的 skill 指引，不得写成流程自动步骤。
    expect(body.includes('gh pr create/edit --repo zhushanwen321/tai-ji-yang'), '缺用户授权后的 PR 创建指引').toBe(true)
  })

  it('默认 base=main；引用真实双平台产物与单源维护入口', () => {
    const body = content()
    expect(body.includes('base=main'), '缺默认基线声明').toBe(true)
    expect(body.includes('pr-lifecycle.dwf.ts'), '缺 zcode 产物路径').toBe(true)
    expect(body.includes('pr-lifecycle.js'), '缺 pi 产物路径').toBe(true)
    expect(body.includes('build-workflows.mjs'), '缺单源构建入口').toBe(true)
    expect(body.includes('verifyUrl'), '缺真实验收参数').toBe(true)
    expect(body.includes('verifyEvidenceDir'), '缺证据复用参数').toBe(true)
  })
})
