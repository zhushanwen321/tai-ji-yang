/**
 * 产物伺服路由单测（U6，RL2 的单测层）。
 *
 * 双打形态：内存 webServer 双打——apply() 走真实注册路径（capture register 的 route），
 * handler 以最小 req/res 桩直驱后断言响应。不引宿主运行时（本仓测试零宿主依赖纪律，
 * DSH 仓 webserver.spec.ts 的「真实 composition + Loader」形态在本仓无依赖基础，故取
 * 任务书允许的最小 handler 桩形态）。
 *
 * 断言结构（RL2 + U6 检查点「伺服根与材质化目标统一 = 会话 cwd」）：
 * 1. 围栏先行：connection.requestRejection 的 401/403 透传为空体响应；围栏拒绝对穿越
 *    路径同样生效（鉴权在解析之前）；围栏服务缺席 fail-closed（503 全拒）；
 * 2. 会话维度伺服根（V1 设计包 D7）：路由地址 = <前缀>/<sessionId>/<产物相对路径>，伺服根按
 *    session 段经 resolveSessionCwdById 解析（与材质化同一通道）；会话不可得 / cwd
 *    不可得 → 404 fail-closed，不回退部署级目录；workingDirectory.get 优先于
 *    header.cwd（通道优先级），服务缺席回退 header.cwd（0.1.7 形态）；
 * 3. 合法产物 200：fixture 产物 + .od-frames/ 相对资源可达 + cwd 内非产物文件可读
 *    （V1 设计包 D7 已接受暴露面——cwd 内可读是设计裁决，断言锁语义防止将来收窄成白名单时无感知）；
 * 4. 穿越拒绝 403：编码 ..（%2e%2e）、绝对路径（%2f）、NUL 字节、符号链接逃逸——
 *    全部经「realpath 规范化后必须落在 cwd 内」这一条裁决拦下；
 * 5. 规范化语义边界：cwd 内的 .. 归一化（sub/../index.html）放行——判定是 realpath
 *    包含关系，不是段级黑名单；
 * 6. 注册形态：kind prefix + 前缀路径常量（U7 消费同一前缀）+ effect disposer 在册。
 * 编号口径：本文件编号默认属 V1 设计包（opendesign-design-mode impl-plan）；其他设计包域编号带包名前缀（opendesign-assets-quality / p1-shell-identity）。
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
  parseArtifactRoute,
  resolveArtifactPath,
} from '../lib/serve/artifacts-route.js'
import { resolveSessionCwdById } from '../lib/serve/session-cwd.js'

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
  /** 会话 cwd（sessions 注册表中该会话 header.cwd；即材质化落点通道的值）。 */
  root: string
  /** 0.2.x workingDirectory.get(session) 的返回值（缺省 = 服务缺席，0.1.7 形态）。 */
  workingDirectoryCwd?: string
  /** 注册表中的会话 id（缺省 SESSION_ID）。 */
  sessionId?: string
  /** sessions 服务整体缺席（双打防御：伺服行 inject 已声明 sessions，正常组合不缺席）。 */
  withSessions?: boolean
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
  const sessionId = options.sessionId ?? SESSION_ID
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
    ...(options.withSessions === false
      ? {}
      : {
          sessions: {
            get: (id: string): unknown => (id === sessionId ? { header: { cwd: options.root } } : undefined),
          },
        }),
    ...(options.workingDirectoryCwd !== undefined
      ? { workingDirectory: { get: () => options.workingDirectoryCwd } }
      : {}),
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

/** 注册表中的会话 id（URL session 段与会话 cwd 的对账锚点）。 */
const SESSION_ID = 'session-cwd'

/** 产物请求 URL（session 段 + 编码形态的产物余段；与 client 构造形态逐段对齐）。 */
function artifactUrl(encodedRemainder: string, sessionId: string = SESSION_ID): string {
  return `${OPENDESIGN_ARTIFACTS_PREFIX_PATH}/${sessionId}${encodedRemainder === '' ? '' : `/${encodedRemainder}`}`
}

let root: string
let outside: string
let mounted: Mounted

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'od-serve-cwd-'))
  outside = await mkdtemp(join(tmpdir(), 'od-serve-outside-'))
  // cwd 内：产物 + 材质化设备壳（相对引用目标）+ 非产物文件（V1 设计包 D7 已接受暴露面）。
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
  return artifactUrl(`%2e%2e%2f${basenameOf(outside)}%2foutside-secret.txt`)
}

function basenameOf(path: string): string {
  const at = path.lastIndexOf('/')
  return at === -1 ? path : path.slice(at + 1)
}

// ── 鉴权围栏（RL2：未认证 401/403）──────────────────────────────────────────

describe('鉴权围栏（每请求第一步，open-in-app 模式）', () => {
  it('未认证 401：空体透传（无 content-type，围栏响应语义归属 connection）', async () => {
    const fenceMounted = mount({ root, rejection: 401 })
    const res = await request(fenceMounted.route, artifactUrl('index.html'))
    expect(res.statusCode).toBe(401)
    expect(res.body).toBeUndefined()
    expect(res.header('content-type')).toBeUndefined()
  })

  it('不可信 Origin 403 透传', async () => {
    const fenceMounted = mount({ root, rejection: 403 })
    const res = await request(fenceMounted.route, artifactUrl('index.html'))
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
    const res = await request(bare.route, artifactUrl('index.html'))
    expect(res.statusCode).toBe(503)
    const traversal = await request(bare.route, escapeUrl())
    expect(traversal.statusCode).toBe(503)
  })
})

// ── 会话维度伺服根（V1 设计包 D7 + U6 检查点：伺服根与材质化目标统一 = 会话 cwd）────────

describe('会话维度伺服根（URL session 段 → 会话 cwd，与材质化同一通道）', () => {
  it('伺服根 = 会话 cwd：session 段寻址的产物按会话工作目录伺服（非部署级目录）', async () => {
    // 会话 cwd（header.cwd）= fixture 根；ctx 无任何部署级目录可回退——产物 200 即证明
    // 伺服根来自会话通道而非别的目录。
    const res = await request(mounted.route, artifactUrl('index.html'))
    expect(res.statusCode).toBe(200)
    expect(res.body?.toString('utf8')).toContain('fixture artifact')
  })

  it('通道优先级：workingDirectory.get 优先于 header.cwd（两通道并存时取权威值）', async () => {
    // 0.2.x 形态：workingDirectory.get(session) 是权威会话工作目录，header.cwd 是创建时
    // 快照——伺服根必须取 workingDirectory 值（与 doctor 的 resolveSessionCwd 同优先级）。
    const wdRoot = await mkdtemp(join(tmpdir(), 'od-serve-wd-'))
    try {
      await writeFile(join(wdRoot, 'wd-file.txt'), 'workingDirectory 权威目录\n', 'utf8')
      const dual = mount({ root, workingDirectoryCwd: wdRoot })
      const fromWd = await request(dual.route, artifactUrl('wd-file.txt'))
      expect(fromWd.statusCode).toBe(200)
      expect(fromWd.body?.toString('utf8')).toContain('workingDirectory 权威目录')
      // header.cwd 里的同名位置不再可达（伺服根已经不在 fixture 根上）。
      const notFromHeader = await request(dual.route, artifactUrl('index.html'))
      expect(notFromHeader.statusCode).toBe(404)
    } finally {
      await rm(wdRoot, { recursive: true, force: true })
    }
  })

  it('0.1.7 形态：workingDirectory 服务缺席，回退 header.cwd（材质化同通道）', () => {
    // mounted 的双打即缺省形态（mount 不注入 workingDirectory）——通道函数按同一
    // sessions 面直驱对账，回退值必须 = header.cwd（与会话维度伺服根用例的 200 互证）。
    const sessions = { get: (id: string): unknown => (id === SESSION_ID ? { header: { cwd: root } } : undefined) }
    expect(resolveSessionCwdById({ sessions }, SESSION_ID)).toBe(root)
  })

  it('未知会话 404 fail-closed（code session-unknown），不回退任何部署级目录', async () => {
    const res = await request(mounted.route, artifactUrl('index.html', 'no-such-session'))
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body?.toString('utf8') ?? '{}').code).toBe('session-unknown')
  })

  it('cwd 不可得的会话（header.cwd 空）404 fail-closed', async () => {
    const empty = mount({ root: '', sessionId: 'session-empty-cwd' })
    const res = await request(empty.route, artifactUrl('index.html', 'session-empty-cwd'))
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body?.toString('utf8') ?? '{}').code).toBe('session-unknown')
  })

  it('无 session 段的路由形态 404（前缀根与裸 session 段都无从寻址）', async () => {
    for (const url of [OPENDESIGN_ARTIFACTS_PREFIX_PATH, `${OPENDESIGN_ARTIFACTS_PREFIX_PATH}/`, artifactUrl('')]) {
      const res = await request(mounted.route, url)
      expect(res.statusCode).toBe(404)
    }
  })

  it('session 段畸形百分号转义 400', async () => {
    const res = await request(mounted.route, `${OPENDESIGN_ARTIFACTS_PREFIX_PATH}/%zz/index.html`)
    expect(res.statusCode).toBe(400)
  })
})

// ── 合法产物（RL2：产物 200 + 相对资源可达 + V1 设计包 D7 已接受暴露面）────────────────

describe('合法产物伺服（伺服根 = cwd）', () => {
  it('产物 200：content-type text/html，正文为 fixture 产物原文（不消毒直接返回）', async () => {
    const res = await request(mounted.route, artifactUrl('index.html'))
    expect(res.statusCode).toBe(200)
    expect(res.header('content-type')).toBe('text/html; charset=utf-8')
    expect(res.header('cache-control')).toBe('no-store')
    expect(res.body?.toString('utf8')).toContain('fixture artifact')
    expect(res.body?.toString('utf8')).toContain('./.od-frames/layout.css')
  })

  it('相对资源可达：.od-frames/ 设备壳经路由 200（原型相对引用不因伺服断裂）', async () => {
    const css = await request(mounted.route, artifactUrl('.od-frames/layout.css'))
    expect(css.statusCode).toBe(200)
    expect(css.header('content-type')).toBe('text/css; charset=utf-8')
    const frame = await request(mounted.route, artifactUrl('.od-frames/neutral.html'))
    expect(frame.statusCode).toBe(200)
    expect(frame.header('content-type')).toBe('text/html; charset=utf-8')
  })

  it('cwd 内非产物文件可读（V1 设计包 D7 已接受暴露面：cookie 持有者 = 用户本人）', async () => {
    const res = await request(mounted.route, artifactUrl('secret-note.txt'))
    expect(res.statusCode).toBe(200)
    expect(res.header('content-type')).toBe('text/plain; charset=utf-8')
    expect(res.body?.toString('utf8')).toContain('已接受暴露面')
  })

  it('HEAD：与 GET 同头无体', async () => {
    const res = await request(mounted.route, artifactUrl('index.html'), 'HEAD')
    expect(res.statusCode).toBe(200)
    expect(res.header('content-type')).toBe('text/html; charset=utf-8')
    expect(res.body).toBeUndefined()
  })

  it('非 GET/HEAD 方法 405 且 Allow: GET', async () => {
    const res = await request(mounted.route, artifactUrl('index.html'), 'POST')
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
    const res = await request(mounted.route, artifactUrl('%2fetc%2fpasswd'))
    expect(res.statusCode).toBe(403)
  })

  it('编码深层 ..（../../etc/passwd 形态）→ 403', async () => {
    const res = await request(mounted.route, artifactUrl('%2e%2e%2f%2e%2e%2fetc%2fpasswd'))
    expect(res.statusCode).toBe(403)
  })

  it('NUL 字节（%00）→ 403', async () => {
    const res = await request(mounted.route, artifactUrl('index.html%00.png'))
    expect(res.statusCode).toBe(403)
  })

  it('符号链接逃逸：cwd 内链接指向 cwd 外文件 → 403', async () => {
    const res = await request(mounted.route, artifactUrl('escape-link.txt'))
    expect(res.statusCode).toBe(403)
  })

  it('cwd 内 .. 归一化（sub/../index.html）放行——判定是 realpath 包含而非段级黑名单', async () => {
    const res = await request(mounted.route, artifactUrl('sub%2f..%2findex.html'))
    expect(res.statusCode).toBe(200)
    expect(res.body?.toString('utf8')).toContain('fixture artifact')
  })
})

// ── 解析与响应边界（404/400 形态 + 解析核心直驱对账）────────────────────────

describe('响应边界与解析核心', () => {
  it('cwd 内不存在的产物路径 404（区别于越权 403）', async () => {
    const res = await request(mounted.route, artifactUrl('no-such-artifact.html'))
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body?.toString('utf8') ?? '{}').code).toBe('not-found')
  })

  it('产物段畸形百分号转义 400', async () => {
    const res = await request(mounted.route, artifactUrl('index%zz.html'))
    expect(res.statusCode).toBe(400)
  })

  it('前缀外 pathname 防御性 404（直驱形态下不依赖 webServer 前缀匹配）', async () => {
    const res = await request(mounted.route, '/other/path.html')
    expect(res.statusCode).toBe(404)
  })

  it('parseArtifactRoute 直驱：session 段 + 产物余段的形态解析', async () => {
    const parsed = parseArtifactRoute(`${OPENDESIGN_ARTIFACTS_PREFIX_PATH}/my-session/index.html`)
    expect(parsed).toEqual({ status: 'route', sessionId: 'my-session', artifactRoute: 'index.html' })
    // session 段的编码在解码前切分：%2f 不会把段切碎。
    const encoded = parseArtifactRoute(`${OPENDESIGN_ARTIFACTS_PREFIX_PATH}/a%2fb/index.html`)
    expect(encoded).toEqual({ status: 'route', sessionId: 'a/b', artifactRoute: 'index.html' })
    // 无 session 段 / 空 session 段 / 畸形转义。
    expect(parseArtifactRoute(OPENDESIGN_ARTIFACTS_PREFIX_PATH).status).toBe('empty')
    expect(parseArtifactRoute(`${OPENDESIGN_ARTIFACTS_PREFIX_PATH}/`).status).toBe('empty')
    expect(parseArtifactRoute(`${OPENDESIGN_ARTIFACTS_PREFIX_PATH}/only-session`).status).toBe('empty')
    expect(parseArtifactRoute(`${OPENDESIGN_ARTIFACTS_PREFIX_PATH}//index.html`).status).toBe('empty')
    expect(parseArtifactRoute(`${OPENDESIGN_ARTIFACTS_PREFIX_PATH}/%zz/index.html`).status).toBe('malformed')
  })

  it('resolveArtifactPath 直驱对账：file/missing/forbidden 三态与产物余段语义一致', async () => {
    // 契约：rootReal 形参是 realpath 规范化后的伺服根（macOS tmpdir 自身是符号链接
    // 路径，raw 形态会使包含判定失配——handler 侧正是先 realpath 再调用）；
    // artifactRoute 形参是 parseArtifactRoute 剥掉前缀与 session 段后的未解码余段。
    const rootReal = await realpath(root)
    const file = await resolveArtifactPath(rootReal, 'index.html')
    expect(file.status).toBe('file')
    if (file.status === 'file') expect(file.path).toBe(join(rootReal, 'index.html'))
    const missing = await resolveArtifactPath(rootReal, 'absent.html')
    expect(missing.status).toBe('missing')
    const empty = await resolveArtifactPath(rootReal, '')
    expect(empty.status).toBe('missing')
    const escape = await resolveArtifactPath(rootReal, '%2e%2e%2fx')
    expect(escape.status).toBe('forbidden')
    const absolute = await resolveArtifactPath(rootReal, '%2fetc%2fpasswd')
    expect(absolute.status).toBe('forbidden')
    const malformed = await resolveArtifactPath(rootReal, 'index%zz.html')
    expect(malformed.status).toBe('malformed')
  })

  it('contentTypeFor：扩展名映射 + 未知/无扩展名回退 octet-stream', () => {
    expect(contentTypeFor('a.html')).toBe('text/html; charset=utf-8')
    expect(contentTypeFor('B.PNG')).toBe('image/png')
    expect(contentTypeFor('bundle.mjs')).toBe('text/javascript; charset=utf-8')
    expect(contentTypeFor('weird.xyz')).toBe('application/octet-stream')
    expect(contentTypeFor('noext')).toBe('application/octet-stream')
  })

  it('resolveSessionCwdById 直驱：通道优先级与 fail-closed 词表', () => {
    const session = { header: { cwd: root } }
    const wd = { get: () => '/wd-authoritative' }
    // workingDirectory.get 优先（0.2.x 权威值）。
    expect(resolveSessionCwdById({ sessions: { get: () => session }, workingDirectory: wd }, SESSION_ID)).toBe('/wd-authoritative')
    // 服务缺席（0.1.7）→ header.cwd。
    expect(resolveSessionCwdById({ sessions: { get: () => session } }, SESSION_ID)).toBe(root)
    // get 抛错（会话未就绪）→ header.cwd；get 返回空串 → 回退 header.cwd。
    expect(resolveSessionCwdById({ sessions: { get: () => session }, workingDirectory: { get: () => { throw new Error('not ready') } } }, SESSION_ID)).toBe(root)
    expect(resolveSessionCwdById({ sessions: { get: () => session }, workingDirectory: { get: () => '' } }, SESSION_ID)).toBe(root)
    // 会话不存在 / cwd 不可得 → null（调用方 fail-closed，无部署级回退）。
    expect(resolveSessionCwdById({ sessions: { get: () => undefined } }, SESSION_ID)).toBeNull()
    expect(resolveSessionCwdById({ sessions: { get: () => ({ header: { cwd: '' } }) } }, SESSION_ID)).toBeNull()
    expect(resolveSessionCwdById({}, SESSION_ID)).toBeNull()
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
