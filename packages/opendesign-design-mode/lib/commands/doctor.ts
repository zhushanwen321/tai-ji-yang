/**
 * /opendesign:doctor —— 设计模式诊断命令（U2b 填实；本单元为最小可加载骨架）。
 *
 * 终态职责（设计 D9，八项全暴露）：安装形态与资源根（多候选与选中依据）、清单路径与
 * 三层版本、roster 完整性、改写规则命中清单（lib/rewrite/apply.ts 的记录）、材质化状态
 * （含写入落点清单）、资产代际提示（resume 旧会话）、逐项恢复动作。命令经
 * `ctx.commands.register({ ... })` 注册（inject: ['commands']，先例 @deepseek-ai/dsh-command-goal）。
 *
 * 本单元（U1）只立插件行骨架：不注册命令（无贡献点即无 disposer 义务），装入即无装配
 * 错误；命令名与输出契约由 U2b 落盘并补单测（tests/doctor.test.ts）。
 */

/** Cordis 插件名（preset plugins 行的行内标识）。 */
export const name = 'od-doctor'

/** 本行消费的宿主服务：命令注册面（U2b 落盘 register 调用时生效）。 */
export const inject = ['commands']

/**
 * 命令行装配入口（U2b 填实：ctx.commands.register 注册 /opendesign:doctor）。
 *
 * @param ctx - Cordis 插件上下文（preset 组合 scope）。
 */
export function apply(ctx) {
  ctx.logger.debug('od-doctor 骨架已装配；命令注册由 U2b 接线')
}
