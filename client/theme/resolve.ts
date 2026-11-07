/**
 * client/theme/resolve.ts —— 配色 id → 双模取值映射（设计 §3.3.2 / D2）。
 *
 * **纯求值模块**：不接收 ctx、不碰 DOM、不调宿主任何写入口。这是本设计的核心决策
 * （D2 本轮裁决，方案 A）的一等约束——**跨族选色不改写宿主偏好**：用户点选一个与当前
 * 解析族不同的配色时，只把覆盖层的双模表整层换成新配色的一套；明暗模式与「是否跟随
 * 系统」始终由宿主偏好（light/dark/system 三值域）决定，本包一次都不写它。
 *
 * 为什么不改写的理由（设计原文）：把「选配色」与「改明暗模式」解耦，两个意图各自独立
 * 表达；宿主偏好是 profile 级持久，一次跨族点选就静默把用户从「跟随系统」永久切到固定
 * 值且不可回滚，属越权。代价（点了异族色界面不变亮）由外观行同屏呈现三段模式按钮消解。
 *
 * 本文件因此不存在 setTheme 调用、不存在 theme.register 调用（RL1：注册第三方主题 id
 * 会摧毁跟随系统），也不存在任何环境读取——resolve.spec.ts 对去掉注释后的源码做静态
 * 断言，并对函数签名元数做断言（不收 ctx）。
 */
import {
  DEFAULT_THEME_ID,
  THEMES,
  THEME_IDS,
  THEME_TOKEN_TABLES,
  type ThemeId,
  type ThemeMeta,
  type TokenTable,
} from './tokens'

/** 判定任意值（典型来源 = 插件 Config 的 appearance 字段）是否是合法配色 id。 */
export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value)
}

/**
 * 持久值 → 合法配色 id：缺失 / 类型不符 / 已注销的 id 一律回落包默认色（玄）。
 *
 * 回落而非抛错：持久通道的读取方（U3 的 persist）可能拿到宿主 revision 冲突前的旧值或
 * 手工编辑过的值，外观数据不值当让装配失败；D2 对持久写入失败的处理同样是「当前会话
 * 照常生效 + 显式记录」，与此同基调。
 */
export function coerceThemeId(value: unknown): ThemeId {
  return isThemeId(value) ? value : DEFAULT_THEME_ID
}

/** 配色元数据（族归属 / 中文名 / preset），外观行与诊断文案的数据源。 */
export function resolveTheme(id: ThemeId): ThemeMeta {
  return THEMES[id]
}

/**
 * 配色 id → 双模取值表（只读，调用方不得改；宿主每次调用会自拷贝）。
 *
 * 纯函数：同一 id 永远返回同一引用，不读任何环境状态——当前是亮是暗由宿主按 colorScheme
 * 自己选（AS2），resolve 不需要也不知道。跨族支的回落规则见 tokens.ts buildTable 注释
 * （taiji resolveTaijiTheme 语义：preset 只在所属族内生效）。
 *
 * @param id - 合法配色 id（持久值先过 coerceThemeId）
 */
export function resolveThemeTokens(id: ThemeId): TokenTable {
  return THEME_TOKEN_TABLES[id]
}
