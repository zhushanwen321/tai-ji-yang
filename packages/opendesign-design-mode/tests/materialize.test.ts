/**
 * 材质化器一致性测试（U5 基线 + U3a 扩展：D9 第 5 文件 deck-framework.md；
 * 语义权威 = 设计 D8/D9，验收 = impl-plan A3「材质化 5 文件写清单断言」的单测层）。
 *
 * 断言（任务书）：
 *   1. 首铺齐全 —— 空目录首铺后 .od-frames/ 恰为写清单 5 文件（4 个 manifest 复制件 +
 *      deck-framework.md 派生登记件），MaterializeManifest 契约完整；
 *   2. 逐字节一致 —— manifest 复制件与源 fixture 对应文件逐字节相等；deck-framework.md
 *      内容 === lib/protocols/deck.ts 派生登记文本（D9 三段结构全文）；
 *   3. 源变更后新内容 —— 源资产变更（模拟 OD 升级）后下次重铺拿到新内容（RL4）；
 *   4. 幂等不堆积 —— 重复重铺文件集不变、无清单外文件；既有非管理名文件不被清理
 *      （D8 无删除通道的镜像语义），落点旧镜像被源覆盖（D8 ④ 无条件覆盖语义）。
 *
 * fixture 消费纪律：tests/fixtures/mini-od 共享树只读；「源变更」断言不触碰共享树
 * （改共享 fixture 会污染 fixtures.test.ts 与并行消费方断言），在 tmpdir 深拷贝源上模拟——
 * 语义等价：材质化器对源的唯一假设是「清单 + 资源在盘可读」，与具体目录无关。
 */

import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  DECK_FRAMEWORK_FILE_NAME,
  MATERIALIZED_WRITE_LIST,
  OD_FRAMES_DIR,
  materializeAssets,
  MaterializeSourceError,
} from '../lib/materialize/copy.js'
import { renderDeckFrameworkFile } from '../lib/protocols/deck.js'
import type { MaterializeManifest } from '../lib/types.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_PLUGIN_DIR = path.join(
  HERE,
  'fixtures/mini-od/plugins/_official/scenarios/od-next-strategy',
)
const FIXTURE_MANIFEST = path.join(FIXTURE_PLUGIN_DIR, 'open-design.json')

/** 管理名 → 源 fixture 相对路径（prototype 档 resources 实名，layout.css 在 prototype/ 下）。 */
const SOURCE_REL: Record<string, string> = {
  'android.html': 'assets/task-profiles/prototype/device-frames/android.html',
  'iphone.html': 'assets/task-profiles/prototype/device-frames/iphone.html',
  'neutral.html': 'assets/task-profiles/prototype/device-frames/neutral.html',
  'layout.css': 'assets/task-profiles/prototype/layout.css',
}

let workspace: string

beforeEach(() => {
  workspace = mkdtempSync(path.join(os.tmpdir(), 'opendesign-u5-'))
})

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true })
})

describe('断言 1：首铺齐全（空目录首铺 + manifest 契约）', () => {
  it('空 cwd 首铺后 .od-frames/ 恰为写清单 5 文件', async () => {
    const cwd = path.join(workspace, 'project')
    mkdirSync(cwd, { recursive: true })

    const result = await materializeAssets({ manifestPath: FIXTURE_MANIFEST, cwd })

    expect(readdirSync(path.join(cwd, OD_FRAMES_DIR)).sort()).toEqual(
      [...MATERIALIZED_WRITE_LIST].sort(),
    )
    expect(result.targetRoot).toBe(path.join(cwd, OD_FRAMES_DIR))
  })

  it('MaterializeManifest 契约完整：5 项、name 集合、bytes > 0；复制件 sourcePath 为源绝对路径、deck 派生件 sourcePath 缺省', async () => {
    const cwd = path.join(workspace, 'project')
    const result: MaterializeManifest = await materializeAssets({
      manifestPath: FIXTURE_MANIFEST,
      cwd,
    })

    expect(result.files).toHaveLength(MATERIALIZED_WRITE_LIST.length)
    expect(result.files.map((f) => f.name).sort()).toEqual([...MATERIALIZED_WRITE_LIST].sort())
    for (const file of result.files) {
      expect(file.bytes).toBeGreaterThan(0)
    }
    // manifest 复制件：sourcePath 指向源资产绝对路径。
    for (const [name, rel] of Object.entries(SOURCE_REL)) {
      const file = result.files.find((f) => f.name === name)
      expect(file, name).toBeDefined()
      expect(file!.sourcePath, name).toBeDefined()
      expect(path.isAbsolute(file!.sourcePath!), name).toBe(true)
      expect(file!.sourcePath, name).toBe(path.resolve(FIXTURE_PLUGIN_DIR, rel))
    }
    // deck 派生登记件：无源资产路径（D9 内容生成自 lib/protocols/deck.ts）。
    const deck = result.files.find((f) => f.name === DECK_FRAMEWORK_FILE_NAME)
    expect(deck).toBeDefined()
    expect(deck!.sourcePath).toBeUndefined()
  })
})

describe('断言 2：重铺后与源逐字节一致（共享 fixture 只读消费）', () => {
  it('manifest 复制件字节与源 fixture 对应文件完全一致', async () => {
    const cwd = path.join(workspace, 'project')
    await materializeAssets({ manifestPath: FIXTURE_MANIFEST, cwd })

    for (const [name, rel] of Object.entries(SOURCE_REL)) {
      const source = readFileSync(path.join(FIXTURE_PLUGIN_DIR, rel))
      const staged = readFileSync(path.join(workspace, 'project', OD_FRAMES_DIR, name))
      expect(staged.equals(source), `${name} 与源逐字节不一致`).toBe(true)
    }
  })

  it('deck-framework.md 内容 === 协议派生登记文本（D9 三段结构全文；验收 A3 写清单断言）', async () => {
    const cwd = path.join(workspace, 'project')
    await materializeAssets({ manifestPath: FIXTURE_MANIFEST, cwd })

    const staged = readFileSync(path.join(cwd, OD_FRAMES_DIR, DECK_FRAMEWORK_FILE_NAME), 'utf8')
    expect(staged).toBe(renderDeckFrameworkFile())
    // 三段结构头在场（适用限定句 + 兼容段 + 规范段）。
    expect(staged.startsWith('# HTML deck host protocol')).toBe(true)
    expect(staged).toContain('## Existing deck or selected template')
    expect(staged).toContain('## New deck only')
  })
})

describe('断言 3：模拟源变更后下次重铺拿到新内容（RL4：OD 升级 → 副本跟随）', () => {
  it('tmp 源拷贝上改 layout.css 后重铺，落点为新内容且旧内容清零', async () => {
    // 深拷贝源资产到 tmp（共享 fixture 只读纪律，见文件头）
    const srcDir = path.join(workspace, 'od-src')
    cpSync(FIXTURE_PLUGIN_DIR, srcDir, { recursive: true })
    const srcManifest = path.join(srcDir, 'open-design.json')
    const cwd = path.join(workspace, 'project')

    const first = await materializeAssets({ manifestPath: srcManifest, cwd })
    const layoutRel = SOURCE_REL['layout.css']
    const oldBytes = readFileSync(path.join(srcDir, layoutRel))

    // 模拟 OD 升级：源资产内容变更
    const upgraded = '@layer od-layout { /* upgraded v2 primitives */ }\n'
    writeFileSync(path.join(srcDir, layoutRel), upgraded, 'utf8')

    const second = await materializeAssets({ manifestPath: srcManifest, cwd })

    const staged = readFileSync(path.join(cwd, OD_FRAMES_DIR, 'layout.css'), 'utf8')
    expect(staged).toBe(upgraded)
    expect(staged).not.toBe(oldBytes.toString('utf8'))
    // 重铺清单恒 5 文件（4 复制件 + deck 派生件，D9 写清单口径）
    expect(second.files).toHaveLength(MATERIALIZED_WRITE_LIST.length)
    expect(first.files).toHaveLength(MATERIALIZED_WRITE_LIST.length)
  })
})

describe('断言 4：重复重铺幂等不堆积、不产生清单外文件（V11 单测层）', () => {
  it('同一 cwd 重铺 3 次：文件集恒为写清单 5 文件、无清单外文件、内容稳定一致', async () => {
    const cwd = path.join(workspace, 'project')
    let deckContentFirst = ''
    for (let round = 0; round < 3; round += 1) {
      await materializeAssets({ manifestPath: FIXTURE_MANIFEST, cwd })
      const deckText = readFileSync(path.join(cwd, OD_FRAMES_DIR, DECK_FRAMEWORK_FILE_NAME), 'utf8')
      if (round === 0) deckContentFirst = deckText
      expect(deckText).toBe(deckContentFirst)
    }

    const stagedDir = path.join(cwd, OD_FRAMES_DIR)
    expect(readdirSync(stagedDir).sort()).toEqual([...MATERIALIZED_WRITE_LIST].sort())
    for (const [name, rel] of Object.entries(SOURCE_REL)) {
      expect(readFileSync(path.join(stagedDir, name)).equals(readFileSync(path.join(FIXTURE_PLUGIN_DIR, rel)))).toBe(true)
    }
    expect(readFileSync(path.join(stagedDir, DECK_FRAMEWORK_FILE_NAME), 'utf8')).toBe(renderDeckFrameworkFile())
  })

  it('既有非管理名文件不被清理（D8：无插件侧删除通道），落点旧镜像被源覆盖（D8 ④ 无条件覆盖）', async () => {
    const cwd = path.join(workspace, 'project')
    const stagedDir = path.join(cwd, OD_FRAMES_DIR)
    await materializeAssets({ manifestPath: FIXTURE_MANIFEST, cwd })

    // 用户/旧版本留在落点的两类既有内容（含对管理写清单名 deck-framework.md 的手写占用——
    // 同样被无条件覆盖，D8 ④）
    writeFileSync(path.join(stagedDir, 'user-note.txt'), 'user owns this', 'utf8')
    writeFileSync(path.join(stagedDir, 'iphone.html'), 'stale previous-generation shell', 'utf8')
    writeFileSync(path.join(stagedDir, DECK_FRAMEWORK_FILE_NAME), 'stale previous-generation deck protocol', 'utf8')

    await materializeAssets({ manifestPath: FIXTURE_MANIFEST, cwd })

    expect(readFileSync(path.join(stagedDir, 'user-note.txt'), 'utf8')).toBe('user owns this')
    const sourceIphone = readFileSync(path.join(FIXTURE_PLUGIN_DIR, SOURCE_REL['iphone.html']))
    expect(readFileSync(path.join(stagedDir, 'iphone.html')).equals(sourceIphone)).toBe(true)
    expect(readFileSync(path.join(stagedDir, DECK_FRAMEWORK_FILE_NAME), 'utf8')).toBe(renderDeckFrameworkFile())
    // 清单外文件不产生：除写清单 + 用户自有文件外无其他写入
    expect(readdirSync(stagedDir).sort()).toEqual([...MATERIALIZED_WRITE_LIST, 'user-note.txt'].sort())
  })
})

describe('源完整性 fail-fast（AX5 显式降级语义的支撑行为）', () => {
  it('源清单缺失：抛 MaterializeSourceError，message 含恢复动作', async () => {
    const missing = path.join(workspace, 'no-such-open-design.json')
    const error = await materializeAssets({ manifestPath: missing, cwd: workspace }).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(MaterializeSourceError)
    expect((error as Error).message).toContain('/opendesign-doctor')
    expect((error as Error).message).toContain(missing)
  })

  it('清单声明的源资源文件缺失：抛错不静默跳过（SI2：清单在 ≠ 资产完整）', async () => {
    const srcDir = path.join(workspace, 'od-src-broken')
    cpSync(FIXTURE_PLUGIN_DIR, srcDir, { recursive: true })
    rmSync(path.join(srcDir, SOURCE_REL['neutral.html']))

    const error = await materializeAssets({ manifestPath: path.join(srcDir, 'open-design.json'), cwd: workspace }).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(MaterializeSourceError)
    expect((error as Error).message).toContain('neutral.html')
    expect((error as Error).message).toContain('/opendesign-doctor')
  })

  it('非管理名资源（任务档 md）不落盘：过滤语义与 OD daemon 同款', async () => {
    const cwd = path.join(workspace, 'project')
    const result = await materializeAssets({ manifestPath: FIXTURE_MANIFEST, cwd })
    const staged = readdirSync(path.join(cwd, OD_FRAMES_DIR))
    // fixture 清单 discovery.resources 另声明 prototype.md / ppt.md（非管理名）——不出现于落点
    expect(staged).not.toContain('prototype.md')
    expect(staged).not.toContain('ppt.md')
    expect(result.files.every((f) => MATERIALIZED_WRITE_LIST.includes(f.name))).toBe(true)
  })
})
