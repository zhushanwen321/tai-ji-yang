const name = "od-serve";
const inject = ["webServer"];
function apply(ctx) {
  ctx.logger.debug("od-serve 骨架已装配；产物伺服路由由 U6 接线");
}
export {
  apply,
  inject,
  name
};
