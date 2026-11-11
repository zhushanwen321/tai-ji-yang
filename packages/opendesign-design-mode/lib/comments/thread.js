const INITIAL_THREAD_STATE = { status: "open", delivery: "pending" };
const COMMENT_THREAD_TRANSITIONS = [
  // ② deliver：仅 open × pending 出发（pending 是唯一可被投递结果覆盖的状态）
  { from: { status: "open", delivery: "pending" }, event: "deliver", to: { status: "open", delivery: "delivered" } },
  { from: { status: "open", delivery: "pending" }, event: "deliver", to: { status: "open", delivery: "no-agent" } },
  { from: { status: "open", delivery: "pending" }, event: "deliver", to: { status: "open", delivery: "inject-error" } },
  // ③ resolve：仅 open 出发，delivery 原样保留（状态变更不触发投递，D2 .resolve 语义）
  { from: { status: "open", delivery: "pending" }, event: "resolve", to: { status: "resolved", delivery: "pending" } },
  { from: { status: "open", delivery: "delivered" }, event: "resolve", to: { status: "resolved", delivery: "delivered" } },
  { from: { status: "open", delivery: "no-agent" }, event: "resolve", to: { status: "resolved", delivery: "no-agent" } },
  { from: { status: "open", delivery: "inject-error" }, event: "resolve", to: { status: "resolved", delivery: "inject-error" } },
  // ④ append-reply：任意组合态出发 → open × pending（resolved 自动回 open，delivery 重置）
  { from: { status: "open", delivery: "pending" }, event: "append-reply", to: { status: "open", delivery: "pending" } },
  { from: { status: "open", delivery: "delivered" }, event: "append-reply", to: { status: "open", delivery: "pending" } },
  { from: { status: "open", delivery: "no-agent" }, event: "append-reply", to: { status: "open", delivery: "pending" } },
  { from: { status: "open", delivery: "inject-error" }, event: "append-reply", to: { status: "open", delivery: "pending" } },
  { from: { status: "resolved", delivery: "pending" }, event: "append-reply", to: { status: "open", delivery: "pending" } },
  { from: { status: "resolved", delivery: "delivered" }, event: "append-reply", to: { status: "open", delivery: "pending" } },
  { from: { status: "resolved", delivery: "no-agent" }, event: "append-reply", to: { status: "open", delivery: "pending" } },
  { from: { status: "resolved", delivery: "inject-error" }, event: "append-reply", to: { status: "open", delivery: "pending" } },
  // ⑤ retry：仅 open × no-agent / open × inject-error 出发 → open × pending（纯重投）
  { from: { status: "open", delivery: "no-agent" }, event: "retry", to: { status: "open", delivery: "pending" } },
  { from: { status: "open", delivery: "inject-error" }, event: "retry", to: { status: "open", delivery: "pending" } }
];
class CommentTransitionError extends Error {
  name = "CommentTransitionError";
  constructor(detail) {
    super(`评论线程状态机表外转移（D5 ⑥ fail-fast）：${detail}`);
  }
}
function findThreadTransition(from, event, deliverOutcome) {
  for (const rule of COMMENT_THREAD_TRANSITIONS) {
    if (rule.event !== event) continue;
    if (rule.from.status !== from.status || rule.from.delivery !== from.delivery) continue;
    if (event === "deliver") {
      if (rule.to.delivery === deliverOutcome) return rule.to;
      continue;
    }
    return rule.to;
  }
  return null;
}
function isLegalThreadTransition(from, event, deliverOutcome) {
  return findThreadTransition(from, event, deliverOutcome) !== null;
}
function applyThreadTransition(thread, event, options) {
  const from = { status: thread.status, delivery: thread.delivery };
  const to = findThreadTransition(from, event, options?.deliverOutcome);
  if (to === null) {
    const outcomeHint = event === "deliver" ? ` → ${String(options?.deliverOutcome)}` : "";
    throw new CommentTransitionError(
      `当前 ${thread.status} × ${thread.delivery} 不允许事件 ${event}${outcomeHint}；合法转移见 COMMENT_THREAD_TRANSITIONS（D5 ①-⑤）`
    );
  }
  const at = options?.at ?? (/* @__PURE__ */ new Date()).toISOString();
  let deliveredAt;
  if (from.delivery === "delivered") {
    deliveredAt = to.delivery === "delivered" ? thread.deliveredAt : void 0;
  } else if (to.delivery === "delivered") {
    deliveredAt = at;
  } else {
    deliveredAt = thread.deliveredAt;
  }
  const next = { ...thread, status: to.status, delivery: to.delivery, updatedAt: at };
  if (deliveredAt === void 0) {
    delete next.deliveredAt;
  } else {
    next.deliveredAt = deliveredAt;
  }
  return next;
}
function createInitialThreadFields(at) {
  return { status: INITIAL_THREAD_STATE.status, delivery: INITIAL_THREAD_STATE.delivery, createdAt: at, updatedAt: at };
}
export {
  COMMENT_THREAD_TRANSITIONS,
  CommentTransitionError,
  INITIAL_THREAD_STATE,
  applyThreadTransition,
  createInitialThreadFields,
  findThreadTransition,
  isLegalThreadTransition
};
