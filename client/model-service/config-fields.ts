/**
 * client/model-service/config-fields.ts —— 插件 Config 字段名的浏览器半场单点（MF-1-7）。
 *
 * 权威声明在 Node 半场（index.js 的 Config z.object）；本文件集中浏览器半场的读写字段名
 * 常量，两侧对齐由 index.test.ts 互锁断言看守：字段名 ∈ index.js Config 声明键集、注册
 * 诊断串构造（index.js ensureRouteRegistration）→ 解析（route-store.parseRegistrationError）
 * 闭环。
 */

/** 路由表字段名（index.js Config 声明）。 */
export const ROUTES_FIELD = 'routes'
/** 白名单字段名（index.js Config 声明）。 */
export const WHITELIST_FIELD = 'whitelist'
/** 注册失败诊断字段名（index.js Config 声明的 volatile 字段；值形态「origin scope: detail」）。 */
export const REGISTRATION_ERROR_FIELD = 'routeRegistrationError'
/** 待清理清单字段名（index.js Config 声明的 volatile 字段）。 */
export const PENDING_UNSETS_FIELD = 'pendingCredentialUnsets'
