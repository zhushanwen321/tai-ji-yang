const name = "od-doctor";
const inject = ["commands"];
function apply(ctx) {
  ctx.logger.debug("od-doctor 骨架已装配；命令注册由 U2b 接线");
}
export {
  apply,
  inject,
  name
};
