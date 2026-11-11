import { randomUUID } from "node:crypto";
import { deliverFeedback } from "../quality/feedback.js";
import { COMMENT_SOURCE_KIND } from "./contract.js";
import { setCommentDelivery } from "./store.js";
const COMMENT_SUMMARY_MAX_CHARS = 120;
function commentSummary(text) {
  const firstLine = text.split("\n")[0] ?? "";
  return firstLine.length <= COMMENT_SUMMARY_MAX_CHARS ? firstLine : `${firstLine.slice(0, COMMENT_SUMMARY_MAX_CHARS - 1)}…`;
}
function buildCommentMessage(payload) {
  const fencedJson = JSON.stringify(
    {
      threadId: payload.threadId,
      artifactPath: payload.artifactPath,
      text: payload.text,
      createdAt: payload.createdAt
    },
    null,
    2
  );
  const text = [
    "[opendesign-design-mode 面板评论] 设计面板收到用户对产物的评论，非用户聊天发言",
    "",
    "```json",
    fencedJson,
    "```",
    "",
    "请读该产物源码按评论修改，写盘即完成交付，无需回复本消息"
  ].join("\n");
  return {
    id: randomUUID(),
    role: "user",
    content: [{ type: "text", text }],
    source: {
      kind: COMMENT_SOURCE_KIND,
      form: "notice",
      summary: commentSummary(payload.text),
      artifactPath: payload.artifactPath,
      threadId: payload.threadId
    }
  };
}
async function deliverComment(input) {
  const message = buildCommentMessage(commentMessagePayloadOf(input.thread));
  const delivered = deliverFeedback(input.ctx, input.sessionId, message);
  const outcome = delivered === "steered" || delivered === "followup" ? "delivered" : delivered;
  await setCommentDelivery(input.cwd, input.thread.id, outcome, input.at);
  return outcome;
}
function commentMessagePayloadOf(thread) {
  const latestReply = thread.replies[thread.replies.length - 1];
  return {
    threadId: thread.id,
    artifactPath: thread.artifactPath,
    text: latestReply !== void 0 ? latestReply.text : thread.text,
    createdAt: thread.createdAt
  };
}
export {
  COMMENT_SUMMARY_MAX_CHARS,
  buildCommentMessage,
  deliverComment
};
