/**
 * 会话工作目录（cwd）的唯一解析通道（U6 检查点的代码落点）。
 *
 * 设计裁决（V1 设计包 D7 / §5 U6）：伺服根定死 = 会话 cwd，且「伺服根与材质化目标统一 = 会话 cwd」
 * ——统一由结构承载：材质化（lib/index.js 的落点）与产物伺服路由（lib/serve/
 * artifacts-route.ts 的伺服根）都消费本函数，不存在两边各自解析的第二个通道。
 *
 * 解析回退链（doctor 的 resolveSessionCwd 同族语义，U8 双版本实测定案）：
 *   1. sessions 服务（@deepseek-ai/dsh-session，两目标版本都有）按 id 取会话对象；
 *   2. workingDirectory 服务（0.2.x 引入，0.1.7 base bundle 无此行）在 → get(session)
 *      的返回值是权威会话工作目录；服务缺席或探测失败（会话未就绪等）→ 回退；
 *   3. session header 的 cwd 字段（两版本 header 均带）；不可得 → null（调用方各自
 *      按语义处置：材质化跳过 + warn，伺服路由 404 fail-closed——绝不回退部署级目录，
 *      那会把「伺服根 = 会话 cwd」的裁决变成「伺服根 = 部署默认目录」的旧差距复辟）。
 *
 * 服务存在性探测必须 try/catch 包裹属性读取（0.1.7 实测，doctor 同款注释）：cordis ctx
 * 读未在本行 inject 声明的服务属性即抛，可选链 `?.` 拦不住 proxy getter 的抛错。
 * workingDirectory 因此不作 inject 依赖（0.1.7 上会让消费行永久 pending）；sessions 是
 * 两版本都有的基础服务，消费行（本包主行与 od-serve 行）正常 inject 声明。
 * 编号口径：本文件编号默认属 V1 设计包（opendesign-design-mode impl-plan）；其他设计包域编号带包名前缀（opendesign-assets-quality / p1-shell-identity）。
 */

/** 伺服路由 / 材质化消费的宿主 ctx 面（最小结构类型；完整服务见各 dsh 包）。 */
interface SessionCwdContext {
  readonly sessions?: { readonly get?: (id: string) => unknown } | undefined
  readonly workingDirectory?: { readonly get?: (session: unknown) => unknown } | undefined
}

/** 本通道消费的会话对象面（header.cwd 字段；两目标版本一致）。 */
interface SessionLike {
  readonly header?: { readonly cwd?: unknown } | undefined
}

/**
 * 按会话 id 解析会话工作目录（伺服根与材质化落点的唯一共享通道）。
 *
 * @param ctx - Cordis 插件上下文（消费行 scope；sessions 经 inject 声明，workingDirectory
 *   运行时可选探测）。
 * @param sessionId - 会话 id。
 * @returns 会话 cwd；会话不可得 / cwd 不可得时 null（不回退部署级目录，见文件头）。
 */
export function resolveSessionCwdById(ctx: unknown, sessionId: string): string | null {
  const sessions = (ctx as SessionCwdContext | null)?.sessions
  const session = typeof sessions?.get === 'function' ? sessions.get(sessionId) as SessionLike | undefined : undefined
  if (session === undefined || session === null) return null
  let workingDirectory: SessionCwdContext['workingDirectory'] | undefined
  try {
    workingDirectory = (ctx as SessionCwdContext | null)?.workingDirectory
  } catch {
    // 0.1.7：服务行不在 → 回退 header.cwd
  }
  if (workingDirectory && typeof workingDirectory.get === 'function') {
    try {
      const cwd = workingDirectory.get(session)
      if (typeof cwd === 'string' && cwd.length > 0) return cwd
    } catch {
      // 服务探测失败（会话未就绪等）→ 回退 header.cwd
    }
  }
  const headerCwd = session.header?.cwd
  return typeof headerCwd === 'string' && headerCwd.length > 0 ? headerCwd : null
}
