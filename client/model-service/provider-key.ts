/**
 * client/model-service/provider-key.ts —— 标识派生层（dsh-model-service AX11 + D3 预检句）。
 *
 * 定位：provider key、路由 id、凭据 ref 由同一标识层生成——用户可见的显示名与机器标识
 * 解耦（AX11）：显示名随便起（含任意 Unicode），标识一律 ASCII kebab-case；非 ASCII
 * 显示名回落稳定序号形态。标识一旦保存即被宿主引用（llm-pi-ai 的 providers.<route> 键、
 * 凭据文件的 ref 名），改名 = 拓扑漂移，所以派生必须是**纯函数**：同一输入恒同一输出，
 * 不读时钟、不取随机、不依赖调用次序（不随时间漂移）。
 *
 * 查重与冲突处置的分工（AX11 逐标识规定，本模块只提供判定、不做决策）：
 *   · provider key 与宿主已注册 route 集合查重——冲突**拒绝保存**并提示改名（D3 预检句：
 *     在 settings.mutate 之前拦截，否则宿主 prepareRoutes 会以 DUPLICATE_ADAPTER 整批拒绝），
 *     决策在调用方（u-m1 settings-client）；
 *   · 路由 id 与 routes + 白名单（含悬挂条目）查重——冲突**加序号**（D5：悬挂条目靠 id
 *     保持身份，拒绝改名会破坏悬挂态不复活），同样决策在调用方（u-m2）；
 *   · 凭据 ref 查重——冲突拒绝（D7：防覆盖宿主密钥），判定输入还需凭据文件存在性，
 *     归 credentials-client（u-m1），本模块只保证派生出的 ref 满足宿主 ref 正则
 *     ^[A-Za-z_][A-Za-z0-9_]*$（dsh-api-settings-controller CredentialsController schema）。
 *
 * Node 半场（u-m2 求值）与浏览器半场共用本模块，因此只依赖语言内建、不 import 任何
 * 宿主通道。
 */

/**
 * 派生结果的规范形态（kebab-case 段式）：一段或多段 [a-z0-9]+ 以单个连字符相连——
 * 段式天然排除连续连字符与首尾连字符；段允许数字开头（「3D Viewer」→ `3d-viewer`
 * 是合法归一结果，只剔「不含任何字母」的退化段）。
 *
 * 派生输出只有两种：ASCII 归一成功（含字母的归一串）或 `p-<数字>` 序号回落——两者
 * 都匹配本正则，调用方可用它做保存前自检。
 */
const PROVIDER_KEY_SHAPE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** 宿主凭据 ref 的合法形态（AS4/D7 依据：dsh-api-settings-controller CredentialsController
 * schema 正则，逐字同源；AX4 是适配器暴露白名单不变量，与 ref 形态无关）。 */
const HOST_REF_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

/** 归一失败时的序号回落前缀（p = provider；序号来自显示名自带的数字段，缺省 1）。 */
const FALLBACK_PREFIX = 'p'

/**
 * 显示名 → ASCII kebab-case key（纯函数，同输入恒同输出）。
 *
 * 归一规则（逐条顺序即实现顺序）：
 *   1. 小写化（ASCII 大写转小写；非 ASCII 字符不受影响，随后被剔除）；
 *   2. 空白 / 下划线 / 点等常见分隔符归一为连字符——词边界信息只在这三处常见形态里，
 *      其余标点直接剔除；
 *   3. 剔除 [a-z0-9-] 之外的字符（中文、全角、emoji 等——标识字符集只留 [a-z0-9-]）；
 *   4. 合并连续连字符、去掉首尾连字符（kebab 规范形态）。
 *
 * 回落规则（AX11「非 ASCII 显示名回落稳定序号」）：归一结果不含任何小写字母时（纯
 * 中文名被剔空，或只剩数字段如「供应商-2」的 `-2`），派生 `p-<序号>`——序号取显示名
 * 尾部的数字段（「供应商-2」→ p-2，用户自带的序号即「稳定序号」；输入里没有数字段
 * 时缺省 1）。撞名不由本函数处置：查重命中走调用方的拒绝/加序号流程（AX11 分工）。
 *
 * @param displayName - 用户可见显示名（任意 Unicode）
 * @returns kebab-case key（匹配 PROVIDER_KEY_SHAPE_RE 的段式形态）
 */
export function deriveProviderKey(displayName: string): string {
  const normalized = displayName
    .toLowerCase()
    .replace(/[\s_.]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')

  if (/[a-z]/.test(normalized)) return normalized

  // 回落：序号取显示名尾部的数字段（如「供应商-2」的 2），无数字段缺省 1
  const trailingNumber = /(\d+)\s*$/.exec(displayName)?.[1] ?? '1'
  return `${FALLBACK_PREFIX}-${trailingNumber}`
}

/**
 * key 与既有 route 集合查重（D3 预检句的判定原语）。
 *
 * 只做集合判定，不做决策：true = 冲突（调用方拒绝保存并提示改名）；false = 可保存。
 * existingRoutes 的来源 = 宿主 listProviders 的已注册 route 集合（预检在写入前执行，
 * 拦住宿主 prepareRoutes 的 DUPLICATE_ADAPTER 整批拒绝）。
 */
export function checkRouteConflict(key: string, existingRoutes: readonly string[]): boolean {
  return existingRoutes.includes(key)
}

/**
 * provider key → 宿主凭据 ref 名（D7 派生规则）。
 *
 * `TAIJI_<KEY 大写、连字符转下划线>_KEY`：kebab key 的字符集（[a-z0-9-]）经大写化与
 * 连字符转下划线后落在 [A-Z0-9_]，再拼上 TAIJI_ 前缀与 _KEY 后缀，形态必然满足宿主
 * ref 正则 ^[A-Za-z_][A-Za-z0-9_]*$（前置 T 是字母）——变换的合法性由 key 的字符集
 * 保证，无需二次清洗。ref 撞名的查重与拒绝在 credentials-client（D7），本函数不管。
 */
export function deriveCredentialRef(key: string): string {
  return `TAIJI_${key.replace(/-/g, '_').toUpperCase()}_KEY`
}

/** 供单测与调用方自检的形态断言（不导出正则字面，只导出判定函数）。 */
export function isValidProviderKeyShape(key: string): boolean {
  return PROVIDER_KEY_SHAPE_RE.test(key)
}

/** 供单测与调用方自检的宿主 ref 形态断言（正则字面与宿主 schema 同源）。 */
export function satisfiesHostRefShape(ref: string): boolean {
  return HOST_REF_RE.test(ref)
}
