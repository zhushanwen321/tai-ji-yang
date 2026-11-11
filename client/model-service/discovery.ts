/**
 * client/model-service/discovery.ts —— 模型发现通道（dsh-model-service §3.3 D3/G16，AS7）。
 *
 * 通道：ctx.remote.llm.discoverModels(settingsNs, request)——宿主 dsh-llm 的统一探测入口：
 *   · request = {provider?, baseURL?, api?, apiKey?}（dsh-llm wire 契约，generated client 实读）；
 *   · provider 命中 pi-ai 安装目录时宿主**短路返回目录模型**（零网络，dsh-llm-pi-ai
 *     /lib/index.js:2282-2295）——界面注明「目录自有模型」；
 *   · 无 baseURL / 协议不可列表 → 宿主抛 LlmError（DISCOVERY_FAILED / DISCOVERY_UNSUPPORTED），
 *     本模块转成可行动分类（AS7「失败分类可行动性」检查点）。
 *
 * 探测请求不带 provider 之外的存储态：展开体的「测试连接」用**草稿值**（端点/协议/密钥草稿）
 * 探测，密钥只在用户输入后随请求过线、不落任何插件产物（AX1）。
 *
 * 失败分类按宿主错误消息文本判定（LlmError 经 remote 网关后分类码不保证保留，消息原文
 * 保留是唯一稳定面）：401/403 → 密钥问题；「no model listing」→ 协议不可列表；其余 →
 * 端点/网络。每支文案都带恢复动作（「失败文案含可行动恢复动作」，任务书职责 2）。
 */
import { LLM_PI_AI_NS, unwrapRemote, type RemoteResult } from './settings-client'

/** discoverModels 的请求形状（宿主 LlmModelDiscoveryRequest 的最小同构）。 */
export interface DiscoveryRequest {
  provider?: string
  baseURL?: string
  api?: string
  apiKey?: string
}

/** 发现结果条目（宿主返回形状；目录分支全字段齐备，端点分支可能缺）。 */
export interface DiscoveredModel {
  id: string
  name?: string
  contextWindow?: number
  maxTokens?: number
  inputModalities?: ('text' | 'image')[]
}

/** 宿主 llm remote 的发现消费面（返回 typert 网关的 Result 包装，失败 resolve 不 reject）。 */
export interface DiscoveryRemoteLike {
  discoverModels(settingsNs: string, request: DiscoveryRequest): Promise<RemoteResult<DiscoveredModel[]>>
}

/** 发现结果三态：目录短路（零网络）/ 端点探测成功 / 失败（含可行动分类）。 */
export type DiscoveryOutcome =
  | { kind: 'catalog'; models: DiscoveredModel[] }
  | { kind: 'endpoint'; models: DiscoveredModel[] }
  | { kind: 'failed'; reason: 'key' | 'protocol' | 'endpoint'; message: string; recovery: string }

/**
 * 探测一个供应商的可用模型。
 *
 * @param llm - 宿主 llm remote。
 * @param input - 探测输入：草稿端点/协议/密钥 + 目录短路的 provider key（既有目录型
 *   provider 省略 baseURL 探测目录清单时传 key）。
 */
export async function discoverProviderModels(llm: DiscoveryRemoteLike, input: DiscoveryRequest): Promise<DiscoveryOutcome> {
  let models: DiscoveredModel[]
  try {
    // Result 解包后失败转 rejection，由下方 catch 接管失败分类（宿主 LlmError 的 message
    // 原文经 unwrapRemote 保留，401/403 与「no model listing」文本判据照常工作）。
    models = unwrapRemote(await llm.discoverModels(LLM_PI_AI_NS, { ...input }))
  } catch (error) {
    return failureOf(error)
  }
  // 目录短路判定（AS7）：带 provider 探测且请求未提供 baseURL 时，宿主只可能走目录分支——
  // 端点探测必须带 baseURL（无 baseURL 的 provider 探测宿主直接抛错），见 failureOf 的
  // protocol 分支来源。
  if (input.provider !== undefined && (input.baseURL === undefined || input.baseURL.length === 0)) {
    return { kind: 'catalog', models }
  }
  return { kind: 'endpoint', models }
}

/** 宿主 LlmError → 可行动失败分类（401/403 → 密钥；不可列表 → 协议；其余 → 端点）。 */
function failureOf(error: unknown): DiscoveryOutcome {
  const message = error instanceof Error ? error.message : String(error)
  if (/(^|\W)(401|403)(\W|$)/.test(message) || /check the api key/i.test(message)) {
    return {
      kind: 'failed',
      reason: 'key',
      message,
      recovery: '请检查 API 密钥是否正确（401/403 未授权）后重试。',
    }
  }
  if (/no model listing/i.test(message) || /DISCOVERY_UNSUPPORTED/i.test(message)) {
    return {
      kind: 'failed',
      reason: 'protocol',
      message,
      recovery: '该协议没有可读取的模型列表，请手动添加模型。',
    }
  }
  return {
    kind: 'failed',
    reason: 'endpoint',
    message,
    recovery: '无法到达端点或响应不是模型列表；请检查 API 端点地址与网络后重试。',
  }
}
