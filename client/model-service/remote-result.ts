/**
 * client/model-service/remote-result.ts —— 宿主 typert 网关的 remote RPC 统一返回包装。
 *
 * 宿主网关协议层对全部 remote RPC 统一包装（dsh-api-gateway/lib/index.js 实读）：
 * encodeRpcResult 成功 resolve {ok:true,value}；rpcFailure 失败 resolve
 * {ok:false,error:{code,message,details}}——业务错误不 reject，消费方按 ok 分支判定，
 * throw/catch 判失败对 resolve 型失败永不命中。
 *
 * 独立成文件的原因：settings-client 已引用 credentials-client（isSelfManagedRef），本类型若
 * 也放 settings-client，credentials-client 反向引用即成模块值循环；此处中立，两侧都只单向
 * 引用本文件。settings-client re-export 两者，消费方从 settings-client 导入亦可。
 */

/** remote RPC 的统一返回包装（成功 {ok:true,value} / 失败 {ok:false,error:{code,message,details}}）。 */
export type RemoteResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string; details: unknown } }

/**
 * Result 解包（读路径统一入口）：ok 取 value；失败把宿主消息抛成 rejection——既有的
 * `.catch(() => []) / .catch(() => undefined)` 读降级分支原样接管（空数据降级语义不变），
 * Result 形状不再流进 for...of / .map / Object.entries 消费点。
 */
export function unwrapRemote<T>(result: RemoteResult<T>): T {
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}
