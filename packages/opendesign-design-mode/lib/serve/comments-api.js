import { realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { deliverComment } from "../comments/feedback.js";
import {
  COMMENTS_API_ACTION_PATHS,
  COMMENTS_API_BASE_PATH,
  isCommentAnchor
} from "../comments/contract.js";
import {
  appendCommentReply,
  CommentStoreCorruptError,
  CommentStoreLockError,
  CommentStoreValidationError,
  CommentThreadNotFoundError,
  createCommentThread,
  findCommentThread,
  readCommentsFile,
  resolveCommentThread,
  retryCommentDelivery,
  validateCommentText
} from "../comments/store.js";
import { CommentTransitionError } from "../comments/thread.js";
import { resolveSessionCwdById } from "./session-cwd.js";
class CommentsHttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
  name = "CommentsHttpError";
}
function toErrorResponse(error) {
  if (error instanceof CommentsHttpError) {
    return jsonResponse(error.status, { code: error.code, message: error.message });
  }
  if (error instanceof CommentStoreValidationError) {
    return jsonResponse(400, { code: "invalid-payload", message: error.message });
  }
  if (error instanceof CommentThreadNotFoundError) {
    return jsonResponse(404, { code: "thread-not-found", message: error.message });
  }
  if (error instanceof CommentTransitionError) {
    return jsonResponse(409, { code: "invalid-transition", message: error.message });
  }
  if (error instanceof CommentStoreCorruptError) {
    return jsonResponse(500, { code: "comments-corrupt", message: error.message });
  }
  if (error instanceof CommentStoreLockError) {
    return jsonResponse(503, { code: "comments-lock-timeout", message: error.message });
  }
  return jsonResponse(500, {
    code: "comments-internal",
    message: error instanceof Error ? error.message : String(error)
  });
}
function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
async function parseJsonBody(request) {
  let parsed;
  try {
    parsed = await request.json();
  } catch {
    throw new CommentsHttpError(400, "bad-request", "请求体不是合法 JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new CommentsHttpError(400, "invalid-payload", "载荷顶层必须是 JSON 对象");
  }
  return parsed;
}
function requireStringField(body, field) {
  const value = body[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new CommentsHttpError(400, "invalid-payload", `载荷字段 ${field} 必须是非空字符串`);
  }
  return value;
}
function requireTextField(body) {
  const value = body.text;
  if (typeof value !== "string") {
    throw new CommentsHttpError(400, "invalid-payload", "载荷字段 text 必须是字符串");
  }
  return value;
}
function optionalAnchorField(body) {
  const value = body.anchor;
  if (value === void 0) return void 0;
  if (!isCommentAnchor(value)) {
    throw new CommentsHttpError(
      400,
      "invalid-payload",
      "载荷字段 anchor 形态非法（须为对象且 level ∈ id|data|path、sel 非空且 ≤ 500 字符）；不需要锚点时省略该字段重发"
    );
  }
  return value;
}
function requireSessionCwd(ctx, sessionId) {
  const cwd = resolveSessionCwdById(ctx, sessionId);
  if (cwd === null) {
    throw new CommentsHttpError(404, "session-unknown", `sessionId 指向的会话不存在或缺工作目录：${sessionId}`);
  }
  return cwd;
}
async function requireSessionRoot(cwd) {
  const rootReal = await realpath(cwd).catch(() => void 0);
  if (rootReal === void 0) {
    throw new CommentsHttpError(404, "root-missing", `会话工作目录不存在：${cwd}`);
  }
  return rootReal;
}
async function isInsideSessionRoot(rootReal, artifactPath) {
  if (artifactPath.includes("\0") || isAbsolute(artifactPath)) return false;
  if (artifactPath.split("/").includes("..")) return false;
  const lexical = resolve(join(rootReal, artifactPath));
  if (lexical !== rootReal && !lexical.startsWith(rootReal + sep)) return false;
  let probe = lexical;
  for (; ; ) {
    try {
      const real = await realpath(probe);
      return real === rootReal || real.startsWith(rootReal + sep);
    } catch {
      const parent = dirname(probe);
      if (parent === probe) return true;
      probe = parent;
    }
  }
}
async function requireArtifactPathInside(rootReal, artifactPath) {
  if (await isInsideSessionRoot(rootReal, artifactPath)) return;
  throw new CommentsHttpError(
    403,
    "forbidden",
    `artifactPath 越界：必须是不含 .. 段的会话内相对路径且落点不出会话工作目录（收到 ${artifactPath}）`
  );
}
async function handleList(ctx, url) {
  const sessionId = url.searchParams.get("sessionId");
  if (sessionId === null || sessionId === "") {
    throw new CommentsHttpError(400, "invalid-payload", "GET 基路径需要 query 参数 sessionId");
  }
  const cwd = requireSessionCwd(ctx, sessionId);
  const file = await readCommentsFile(cwd);
  return jsonResponse(200, { version: file.version, threads: file.threads });
}
async function handleCreate(ctx, body) {
  const sessionId = requireStringField(body, "sessionId");
  const artifactPath = requireStringField(body, "artifactPath");
  const text = requireTextField(body);
  const anchor = optionalAnchorField(body);
  const cwd = requireSessionCwd(ctx, sessionId);
  const rootReal = await requireSessionRoot(cwd);
  await requireArtifactPathInside(rootReal, artifactPath);
  validateCommentText(text);
  const thread = await createCommentThread(cwd, { artifactPath, text, anchor });
  return await deliverAndRespond(ctx, sessionId, cwd, thread);
}
async function handleReply(ctx, body) {
  const sessionId = requireStringField(body, "sessionId");
  const threadId = requireStringField(body, "threadId");
  const text = requireTextField(body);
  const cwd = requireSessionCwd(ctx, sessionId);
  validateCommentText(text);
  const thread = await appendCommentReply(cwd, threadId, text);
  return await deliverAndRespond(ctx, sessionId, cwd, thread);
}
async function handleRetry(ctx, body) {
  const sessionId = requireStringField(body, "sessionId");
  const threadId = requireStringField(body, "threadId");
  const cwd = requireSessionCwd(ctx, sessionId);
  const thread = await retryCommentDelivery(cwd, threadId);
  return await deliverAndRespond(ctx, sessionId, cwd, thread);
}
async function handleResolve(ctx, body) {
  const sessionId = requireStringField(body, "sessionId");
  const threadId = requireStringField(body, "threadId");
  if (body.resolved !== true) {
    throw new CommentsHttpError(400, "invalid-payload", "载荷字段 resolved 必须为 true；重开已解决线程走 .reply 追加（D5 转移④）");
  }
  const cwd = requireSessionCwd(ctx, sessionId);
  return jsonResponse(200, await resolveCommentThread(cwd, threadId));
}
async function deliverAndRespond(ctx, sessionId, cwd, thread) {
  await deliverComment({ ctx, sessionId, cwd, thread });
  const file = await readCommentsFile(cwd);
  return jsonResponse(200, findCommentThread(file.threads, thread.id));
}
async function handleCommentsRequest(ctx, action, request) {
  try {
    if (action === "list") return await handleList(ctx, new URL(request.url));
    const body = await parseJsonBody(request);
    if (action === "create") return await handleCreate(ctx, body);
    if (action === "reply") return await handleReply(ctx, body);
    if (action === "retry") return await handleRetry(ctx, body);
    return await handleResolve(ctx, body);
  } catch (error) {
    return toErrorResponse(error);
  }
}
function createCommentsApiRoutes(ctx) {
  const actionOf = (actionPath) => actionPath.slice(1);
  return [
    {
      path: COMMENTS_API_BASE_PATH,
      methods: ["GET"],
      requestBody: "buffered",
      fetch: (request) => handleCommentsRequest(ctx, "list", request)
    },
    ...COMMENTS_API_ACTION_PATHS.map((actionPath) => ({
      path: COMMENTS_API_BASE_PATH + actionPath,
      methods: ["POST"],
      requestBody: "buffered",
      fetch: (request) => handleCommentsRequest(ctx, actionOf(actionPath), request)
    }))
  ];
}
function registerCommentsApiRoutes(scope, ctx) {
  for (const route of createCommentsApiRoutes(ctx)) {
    scope.effect(() => scope.connection.fetch.register(route), `od-serve: ${route.methods.join("|")} ${route.path}`);
  }
}
export {
  createCommentsApiRoutes,
  registerCommentsApiRoutes
};
