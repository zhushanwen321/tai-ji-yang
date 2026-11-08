/**
 * 产物伺服路由单测（U6，RL2 的单测层）。
 *
 * 双打形态：内存 webServer 双打——apply() 走真实注册路径（capture register 的 route），
 * handler 以最小 req/res 桩直驱后断言响应。不引宿主运行时（本仓测试零宿主依赖纪律，
 * DSH 仓 webserver.spec.ts 的「真实 composition + Loader」形态在本仓无依赖基础，故取
 * 任务书允许的最小 handler 桩形态）。
 *
 * 断言结构（RL2）：
 * 1. 围栏先行：connection.requestRejection 的 401/403 透传为空体响应；围栏拒绝对穿越
 *    路径同样生效（鉴权在解析之前）；围栏服务缺席 fail-closed（503 全拒）；
 * 2. 合法产物 200：fixture 产物 + .od-frames/ 相对资源可达 + cwd 内非产物文件可读
 *    （D7 已接受暴露面——cwd 内可读是设计裁决，断言锁语义防止将来收窄成白名单时无感知）；
 * 3. 穿越拒绝 403：编码 ..（%2e%2e）、绝对路径（%2f）、NUL 字节、符号链接逃逸——
 *    全部经「realpath 规范化后必须落在 cwd 内」这一条裁决拦下；
 * 4. 规范化语义边界：cwd 内的 .. 归一化（sub/../index.html）放行——判定是 realpath
 *    包含关系，不是段级黑名单；
 * 5. 注册形态：kind prefix + 前缀路径常量（U7 消费同一前缀）+ effect disposer 在册。
 */

import { copyFile, mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  apply,
  contentTypeFor,
  OPENDESIGN_ARTIFACTS_PREFIX_PATH,
  resolveArtifactPath,
  resolveServeRoot,
} from '../lib/serve/artifacts-route.js'

// ── 内存 webServer 双打 ──────────────────────────────────────────────────────

/** 最小响应桩：statusCode + 头表 + end 记录（足够断言本路由的全部输出）。 */
class StubResponse {
  statusCode = 200
  readonly headers = new Map<string, string>()
  body: Buffer | undefined
  ended = false

  setHeader(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), value)
  }

  end(body?: Buffer | string): void {
    this.ended = true
    if (body !== undefined) this.body = Buffer.isBuffer(body) ? body : Buffer.from(body)
  }

  header(name: string): string | undefined {
    return this.headers.get(name.toLowerCase())
  }
}

interface MountOptions {
  /** 围栏裁决（undefined = 放行；401/403 = 拒绝）。 */
  rejection?: 401 | 403
  /** 是否提供 connection 服务（false 模拟围栏缺席）。 */
  withConnection?: boolean
  /** 伺服根（注入 workingDirectory.defaultDirectory）。 */
  root: string
}

interface Mounted {
  route: {
    kind: 'prefix' | 'exact'
    path: string
    handler: (req: unknown, res: StubResponse) => Promise<void>
  }
  effectLabels: string[]
}

/** 经 apply() 的真实注册路径把路由挂进内存双打（effect 立即执行，disposer 在册）。 */
function mount(options: MountOptions): Mounted {
  const registered: Mounted['route'][] = []
  const effectLabels: string[] = []
  const ctx = {
    webServer: {
      register(route: Mounted['route']): () => void {
        registered.push(route)
        return () => undefined
      },
    },
    ...(options.withConnection === false
      ? {}
      : {
          connection: {
            requestRejection: () => options.rejection,
          },
        }),
    workingDirectory: { defaultDirectory: options.root },
    logger: { debug: () => undefined, warn: () => undefined },
    effect(factory: () => unknown, label?: string): unknown {
      effectLabels.push(String(label))
      return factory()
    },
  }
  apply(ctx)
  expect(registered).toHaveLength(1)
  return { route: registered[0], effectLabels }
}

/** 直驱 handler 到响应结束。 */
async function request(route: Mounted['route'], url: string, method = 'GET'): Promise<StubResponse> {
  const res = new StubResponse()
  await route.handler({ url, method, headers: {} }, res)
  expect(res.ended, 'handler 必须完整结束响应（半结束态 = 实现缺陷）').toBe(true)
  return res
}

// ── 测试 cwd（fixture 产物 + 相对资源 + 穿越靶标，beforeAll 一次构建）───────

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const PROTOTYPE_ASSETS = join(
  FIXTURE_DIR,
  'mini-od/plugins/_official/scenarios/od-next-strategy/assets/task-profiles/prototype',
)

let root: string
let outside: string
let mounted: Mounted

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'od-serve-cwd-'))
  outside = await mkdtemp(join(tmpdir(), 'od-serve-outside-'))
  // cwd 内：产物 + 材质化设备壳（相对引用目标）+ 非产物文件（D7 已接受暴露面）。
  await mkdir(join(root, '.od-frames'), { recursive: true })
  await mkdir(join(root, 'sub'), { recursive: true })
  await copyFile(join(FIXTURE_DIR, 'artifacts/index.html'), join(root, 'index.html'))
  await copyFile(join(PROTOTYPE_ASSETS, 'layout.css'), join(root, '.od-frames/layout.css'))
  await copyFile(join(PROTOTYPE_ASSETS, 'device-frames/neutral.html'), join(root, '.od-frames/neutral.html'))
  await writeFile(join(root, 'secret-note.txt'), 'cwd 内非产物文件（已接受暴露面）\n')
  await writeFile(join(root, 'sub', 'placeholder.txt'), 'nested\n')
  // cwd 外：穿越/符号链接的靶标文件。
  await writeFile(join(outside, 'outside-secret.txt'), 'cwd 外\n')
  await symlink(join(outside, 'outside-secret.txt'), join(root, 'escape-link.txt'))
  // 完整性哨兵：靶标确实在 root 外（断言穿越用例不是自证）。
  expect(join(outside, 'outside-secret.txt').startsWith(root + sep)).toBe(false)
  mounted = mount({ root })
})

afterAll(async () => {
  await Promise.all([
    rm(root, { recursive: true, force: true }),
    rm(outside, { recursive: true, force: true }),
  ])
})

/** 穿越用例 URL（运行时取形：cwd 外兄弟目录经编码 .. 寻址——beforeAll 先于用例执行）。 */
function escapeUrl(): string {
  return `${OPENDESIGN_ARTIFACTS_PREFIX_PATH}/%2e%2e%2f${basenameOf(outside)}%2foutside-secret.txt`
}

function basenameOf(path: string): string {
  const at = path.lastIndexOf('/')
  return at === -1 ? path : path.slice(at + 1)
}

// ── 围栏（RL2：未认证 401/403）──────────────────────────────────────────────

describe('鉴权围栏（每请求第一步，open-in-app 模式）', () => {
  it('未认证 401：空体透传（无 content-type，围栏响应语义归属 connection）', async () => {
    const fenceMounted = mount({ root, rejection: 401 })
    const res = await request(fenceMounted.route, `${OPENDESIGN_ARTIFACTS_PREFIX_PATH}/index.html`)
    expect(res.statusCode).toBe(401)
    expect(res.body).toBeUndefined()
    expect(res.header('content-type')).toBeUndefined()
  })

  it('不可信 Origin 403 透传', async () => {
    const fenceMounted = mount({ root, rejection: 403 })
    const res = await request(fenceMounted.route, `${OPENDESIGN_ARTIFACTS_PREFIX_PATH}/index.html`)
    expect(res.statusCode).toBe(403)
    expect(res.body).toBeUndefined()
  })

  it('围栏先行于路径解析：穿越路径上围栏拒绝优先（401 而非路径侧 403）', async () => {
    const fenceMounted = mount({ root, rejection: 401 })
    const res = await request(fenceMounted.route, escapeUrl())
    expect(res.statusCode).toBe(401)
  })

  it('围栏服务缺席 fail-closed：503 全拒（围栏是唯一门槛，缺席不得放行）', async () => {
    const bare = mount({ root, withConnection: false })
    const res = await request(bare.route, `${OPENDESIGN_ARTIFACTS_PREFIX_PATH}/index.html`)
    expect(res.statusCode).toBe(503)
    const traversal = await request(bare.route, escapeUrl())
    expect(traversal.statusCode).toBe(503)
  })
})

// ── 合法产物（RL2：产物 200 + 相对资源可达 + D7 已接受暴露面）────────────────

describe('合法产物伺服（伺服根 = cwd）', () => {
  it('产物 200：content-type text/html，正文为 fixture 产物原文（不消毒直接返回）', async () => {
    const res = await request(mounted.route, `${OPENDESIGN_ARTIFACTS_PREFIX_PATH}/index.html`)
    expect(res.statusCode).toBe(200)
    expect(res.header('content-type')).toBe('text/html; charset=utf-8')
    expect(res.header('cache-control')).toBe('no-store')
    expect(res.body?.toString('utf8')).toContain('fixture artifact')
    expect(res.body?.toString('utf8')).toContain('./.od-frames/layout.css')
  })

  it('相对资源可达：.od-frames/ 设备壳经路由 200（原型相对引用不因伺服断裂）', async () => {
    const css = await request(mounted.route, `${OPENDESIGN_ARTIFACTS_PREFIX_PATH}/.od-frames/layout.css`)
    expect(css.statusCode).toBe(200)
    expect(css.header('content-type')).toBe('text/css; charset=utf-8')
    const frame = await request(mounted.route, `${OPENDESIGN_ARTIFACTS_PREFIX_PATH}/.od-frames/neutral.html`)
    expect(frame.statusCode).toBe(200)
    expect(frame.header('content-type')).toBe('text/html; charset=utf-8')
  })

  it('cwd 内非产物文件可读（D7 已接受暴露面：cookie 持有者 = 用户本人）', async () => {
    const res = await request(mounted.route, `${OPENDESIGN_ARTIFACTS_PREFIX_PATH}/secret-note.txt`)
    expect(res.statusCode).toBe(200)
    expect(res.header('content-type')).toBe('text/plain; charset=utf-8')
    expect(res.body?.toString('utf8')).toContain('已接受暴露面')
  })

  it('HEAD：与 GET 同头无体', async () => {
    const res = await request(mounted.route, `${OPENDESIGN_ARTIFACTS_PREFIX_PATH}/index.html`, 'HEAD')
    expect(res.statusCode).toBe(200)
    expect(res.header('content-type')).toBe('text/html; charset=utf-8')
    expect(res.body).toBeUndefined()
  })

  it('非 GET/HEAD 方法 405 且 Allow: GET', async () => {
    const res = await request(mounted.route, `${OPENDESIGN_ARTIFACTS_PREFIX_PATH}/index.html`, 'POST')
    expect(res.statusCode).toBe(405)
    expect(res.header('allow')).toBe('GET')
  })
})

// ── 穿越拒绝（RL2：cwd 外一律拒，编码形态不可绕过）──────────────────────────

describe('路径穿越拒绝（realpath 包含裁决）', () => {
  it('编码 ..（%2e%2e）逃逸到 cwd 外兄弟目录 → 403', async () => {
    const res = await request(mounted.route, escapeUrl())
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body?.toString('utf8') ?? '{}').code).toBe('forbidden')
  })

  it('绝对路径寻址（%2f 开头解码为绝对形态）→ 403', async () => {
    const res = await request(mounted.route, `${OPENDESIGN_ARTIFACTS_PREFIX_PATH}/%2fetc%2fpasswd`)
    expect(res.statusCode).toBe(403)
  })

  it('编码深层 ..（../../etc/passwd 形态）→ 403', async () => {
    const res = await request(mounted.route, `${OPENDESIGN_ARTIFACTS_PREFIX_PATH}/%2e%2e%2f%2e%2e%2fetc%2fpasswd`)
    expect(res.statusCode).toBe(403)
  })

  it('NUL 字节（%00）→ 403', async () => {
    const res = await request(mounted.route, `${OPENDESIGN_ARTIFACTS_PREFIX_PATH}/index.html%00.png`)
    expect(res.statusCode).toBe(403)
  })

  it('符号链接逃逸：cwd 内链接指向 cwd 外文件 → 403', async () => {
    const res = await request(mounted.route, `${OPENDESIGN_ARTIFACTS_PREFIX_PATH}/escape-link.txt`)
    expect(res.statusCode).toBe(403)
  })

  it('cwd 内 .. 归一化（sub/../index.html）放行——判定是 realpath 包含而非段级黑名单', async () => {
    const res = await request(mounted.route, `${OPENDESIGN_ARTIFACTS_PREFIX_PATH}/sub%2f..%2findex.html`)
    expect(res.statusCode).toBe(200)
    expect(res.body?.toString('utf8')).toContain('fixture artifact')
  })
})

// ── 解析与响应边界（404/400 形态 + 解析核心直驱对账）────────────────────────

describe('响应边界与解析核心', () => {
  it('前缀根本身 404（目录无列举语义）', async () => {
    for (const url of [OPENDESIGN_ARTIFACTS_PREFIX_PATH, `${OPENDESIGN_ARTIFACTS_PREFIX_PATH}/`]) {
      const res = await request(mounted.route, url)
      expect(res.statusCode).toBe(404)
    }
  })

  it('cwd 内不存在的产物路径 404（区别于越权 403）', async () => {
    const res = await request(mounted.route, `${OPENDESIGN_ARTIFACTS_PREFIX_PATH}/no-such-artifact.html`)
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body?.toString('utf8') ?? '{}').code).toBe('not-found')
  })

  it('畸形百分号转义 400', async () => {
    const res = await request(mounted.route, `${OPENDESIGN_ARTIFACTS_PREFIX_PATH}/index%zz.html`)
    expect(res.statusCode).toBe(400)
  })

  it('前缀外 pathname 防御性 404（直驱形态下不依赖 webServer 前缀匹配）', async () => {
    const res = await request(mounted.route, '/other/path.html')
    expect(res.statusCode).toBe(404)
  })

  it('resolveArtifactPath 直驱对账：file/missing/forbidden 三态与前缀余段语义一致', async () => {
    // 契约：rootReal 形参是 realpath 规范化后的伺服根（macOS tmpdir 自身是符号链接
    // 路径，raw 形态会使包含判定失配——handler 侧正是先 realpath 再调用）。
    const rootReal = await realpath(root)
    const file = await resolveArtifactPath(rootReal, `${OPENDESIGN_ARTIFACTS_PREFIX_PATH}/index.html`)
    expect(file.status).toBe('file')
    if (file.status === 'file') expect(file.path).toBe(join(rootReal, 'index.html'))
    const missing = await resolveArtifactPath(rootReal, `${OPENDESIGN_ARTIFACTS_PREFIX_PATH}/absent.html`)
    expect(missing.status).toBe('missing')
    const empty = await resolveArtifactPath(rootReal, OPENDESIGN_ARTIFACTS_PREFIX_PATH)
    expect(empty.status).toBe('missing')
    const emptySlash = await resolveArtifactPath(rootReal, `${OPENDESIGN_ARTIFACTS_PREFIX_PATH}/`)
    expect(emptySlash.status).toBe('missing')
    const escape = await resolveArtifactPath(rootReal, `${OPENDESIGN_ARTIFACTS_PREFIX_PATH}/%2e%2e%2fx`)
    expect(escape.status).toBe('forbidden')
    const absolute = await resolveArtifactPath(rootReal, `${OPENDESIGN_ARTIFACTS_PREFIX_PATH}/%2fetc%2fpasswd`)
    expect(absolute.status).toBe('forbidden')
  })

  it('contentTypeFor：扩展名映射 + 未知/无扩展名回退 octet-stream', () => {
    expect(contentTypeFor('a.html')).toBe('text/html; charset=utf-8')
    expect(contentTypeFor('B.PNG')).toBe('image/png')
    expect(contentTypeFor('bundle.mjs')).toBe('text/javascript; charset=utf-8')
    expect(contentTypeFor('weird.xyz')).toBe('application/octet-stream')
    expect(contentTypeFor('noext')).toBe('application/octet-stream')
  })

  it('resolveServeRoot：workingDirectory.defaultDirectory 优先，缺席回退 process.cwd()', () => {
    expect(resolveServeRoot({ workingDirectory: { defaultDirectory: root } })).toBe(root)
    expect(resolveServeRoot({})).toBe(process.cwd())
  })
})

// ── 注册形态（U7 消费同一前缀的契约锚点）────────────────────────────────────

describe('注册形态', () => {
  it('kind prefix + 前缀路径常量 + effect disposer 在册', () => {
    expect(mounted.route.kind).toBe('prefix')
    expect(mounted.route.path).toBe('/opendesign/artifacts')
    expect(mounted.route.path).toBe(OPENDESIGN_ARTIFACTS_PREFIX_PATH)
    expect(mounted.effectLabels).toHaveLength(1)
    expect(mounted.effectLabels[0]).toContain(OPENDESIGN_ARTIFACTS_PREFIX_PATH)
  })
})
