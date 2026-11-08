import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildShellInfo,
  cliRuntimeVersion,
  desktopRuntimeVersion,
  SHELL_INFO_GLOBAL,
  SHELL_INFO_ROW_FACTORY,
} from './index.js'
import packageJson from './package.json' with { type: 'json' }

/**
 * 壳信息（版本行）解析单测：Node 半场 index.js 的版本解析三支（own / desktop / cli）与
 * global 注入行的形状。desktop 支用临时目录造 asar 形态的 fixture；cli 支只断言「不抛、
 * 类型正确」——它的取值取决于安装形态（本仓 peer 不落 node_modules，开发环境多半 undefined），
 * 断言具体值会随环境漂移。
 */

const tempDirs: string[] = []
afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true })
})

/** 造一个桌面形态 fixture：`<root>/app.asar/dsh/node_modules/@deepseek-ai/dsh-app-boot/package.json`。 */
function makeDesktopFixture(version: string): string {
  const root = mkdtempSync(join(tmpdir(), 'taiji-shell-info-'))
  tempDirs.push(root)
  const dir = join(root, 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-app-boot')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-app-boot', version }))
  return join(root, 'app.asar', 'dsh')
}

describe('desktopRuntimeVersion', () => {
  it('argv 命中 asar dsh 根时读其 app-boot 版本（与宿主 getDshRuntimeVersion 同源）', () => {
    const asarDsh = makeDesktopFixture('9.9.9-fixture')
    expect(desktopRuntimeVersion(['node', '/some/entry.js', asarDsh, '/profile'])).toBe('9.9.9-fixture')
  })

  it('argv 无 asar dsh 根（CLI 形态）→ undefined；根存在但 app-boot 缺 version 也 → undefined', () => {
    expect(desktopRuntimeVersion(['node', '/entry.js'])).toBeUndefined()
    const root = mkdtempSync(join(tmpdir(), 'taiji-shell-info-'))
    tempDirs.push(root)
    const dir = join(root, 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-app-boot')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x' }))
    expect(desktopRuntimeVersion(['node', join(root, 'app.asar', 'dsh')])).toBeUndefined()
  })
})

describe('cliRuntimeVersion', () => {
  it('不抛且给 string | undefined（取值随安装形态，不断言具体值）', () => {
    const value = cliRuntimeVersion()
    expect(value === undefined || typeof value === 'string').toBe(true)
  })
})

describe('buildShellInfo / SHELL_INFO_ROW_FACTORY', () => {
  it('own 版本恒可读 = package.json version；desktop fixture 命中时附带 dshVersion', () => {
    const asarDsh = makeDesktopFixture('9.9.9-fixture')
    expect(buildShellInfo(['node', asarDsh])).toEqual({ version: packageJson.version, dshVersion: '9.9.9-fixture' })
  })

  it('global 注入行形状：kind/name/value，name 与 client 侧读取的属性名一致', () => {
    const row = SHELL_INFO_ROW_FACTORY(['node'])
    expect(row).toMatchObject({ kind: 'global', name: SHELL_INFO_GLOBAL })
    expect((row as { value: unknown }).value).toEqual(buildShellInfo(['node']))
  })
})
