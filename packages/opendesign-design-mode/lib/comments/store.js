import { randomBytes, randomUUID } from "node:crypto";
import { closeSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  COMMENT_DELIVERY_STATES,
  COMMENT_TEXT_MAX_LENGTH,
  COMMENT_THREAD_ID_PREFIX,
  COMMENT_THREAD_STATUSES,
  COMMENTS_DIR_NAME,
  COMMENTS_FILE_NAME,
  COMMENTS_FILE_VERSION,
  isCommentAnchor
} from "./contract.js";
import { applyThreadTransition, createInitialThreadFields } from "./thread.js";
const COMMENTS_LOCK_NAME = "comments.json.lock";
const COMMENT_LOCK_STALE_MS = 5e3;
const COMMENT_LOCK_WAIT_MS = 2e3;
const COMMENT_LOCK_POLL_MS = 25;
function commentsFilePath(cwd) {
  return path.join(cwd, COMMENTS_DIR_NAME, COMMENTS_FILE_NAME);
}
function commentsLockPath(cwd) {
  return path.join(cwd, COMMENTS_DIR_NAME, COMMENTS_LOCK_NAME);
}
class CommentStoreCorruptError extends Error {
  name = "CommentStoreCorruptError";
  constructor(detail) {
    super(
      `评论数据文件损坏（读侧报错不自动重建 / 写侧拒写，D1）：${detail}；恢复动作：手工修复 ${COMMENTS_FILE_NAME} 或整文件删除重建（插件不自动重建，doctor 第⑫节同源呈现）`
    );
  }
}
class CommentStoreLockError extends Error {
  name = "CommentStoreLockError";
  constructor(detail) {
    super(`评论数据文件写锁获取失败：${detail}；恢复动作：稍后重试，若持续失败检查残留 lock 文件`);
  }
}
class CommentThreadNotFoundError extends Error {
  name = "CommentThreadNotFoundError";
  constructor(threadId) {
    super(`评论线程不存在：${threadId}；恢复动作：经 GET 基路径拉取线程列表核对 id`);
  }
}
class CommentStoreValidationError extends Error {
  name = "CommentStoreValidationError";
  constructor(detail) {
    super(`评论载荷校验拒绝：${detail}`);
  }
}
function emptyCommentsFile() {
  return { version: COMMENTS_FILE_VERSION, threads: [] };
}
function isCommentThreadLike(value) {
  if (typeof value !== "object" || value === null) return false;
  const t = value;
  if (typeof t.id !== "string" || t.id.length === 0) return false;
  if (typeof t.artifactPath !== "string" || t.artifactPath.length === 0) return false;
  if (typeof t.text !== "string") return false;
  if (!Array.isArray(t.replies)) return false;
  for (const reply of t.replies) {
    if (typeof reply !== "object" || reply === null) return false;
    const r = reply;
    if (typeof r.text !== "string" || typeof r.at !== "string") return false;
  }
  if (typeof t.status !== "string" || !COMMENT_THREAD_STATUSES.includes(t.status)) return false;
  if (typeof t.delivery !== "string" || !COMMENT_DELIVERY_STATES.includes(t.delivery)) return false;
  if (typeof t.createdAt !== "string" || t.createdAt.length === 0) return false;
  if (typeof t.updatedAt !== "string" || t.updatedAt.length === 0) return false;
  if (t.deliveredAt !== void 0 && (typeof t.deliveredAt !== "string" || t.deliveredAt.length === 0)) return false;
  return true;
}
function parseCommentsFileText(raw, source) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new CommentStoreCorruptError(`${source} JSON.parse 失败：${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new CommentStoreCorruptError(`${source} 顶层非对象`);
  }
  const obj = parsed;
  if (obj.version !== COMMENTS_FILE_VERSION) {
    throw new CommentStoreCorruptError(`${source} version=${String(obj.version)} 非 ${COMMENTS_FILE_VERSION}（形态不兼容）`);
  }
  if (!Array.isArray(obj.threads)) {
    throw new CommentStoreCorruptError(`${source} threads 非数组`);
  }
  for (const thread of obj.threads) {
    if (!isCommentThreadLike(thread)) {
      throw new CommentStoreCorruptError(`${source} threads 含结构不符的线程条目（字段缺失或词表外取值）`);
    }
  }
  return { version: COMMENTS_FILE_VERSION, threads: obj.threads };
}
function isFsCode(error, code) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
async function readCommentsFile(cwd) {
  let raw;
  try {
    raw = await readFile(commentsFilePath(cwd), "utf8");
  } catch (error) {
    if (isFsCode(error, "ENOENT")) return emptyCommentsFile();
    throw error;
  }
  return parseCommentsFileText(raw, commentsFilePath(cwd));
}
const transactionQueues = /* @__PURE__ */ new Map();
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
function tryAcquireLockSync(lockFile) {
  let fd;
  try {
    fd = openSync(lockFile, "wx");
  } catch (error) {
    if (isFsCode(error, "EEXIST")) return false;
    throw error;
  }
  try {
    writeFileSync(fd, JSON.stringify({ pid: process.pid, at: (/* @__PURE__ */ new Date()).toISOString() }), "utf8");
  } finally {
    closeSync(fd);
  }
  return true;
}
async function acquireLock(lockFile) {
  const deadline = Date.now() + COMMENT_LOCK_WAIT_MS;
  for (; ; ) {
    if (tryAcquireLockSync(lockFile)) return;
    let stale = false;
    try {
      stale = Date.now() - statSync(lockFile).mtimeMs > COMMENT_LOCK_STALE_MS;
    } catch {
      continue;
    }
    if (stale) {
      try {
        unlinkSync(lockFile);
      } catch {
        continue;
      }
      continue;
    }
    if (Date.now() >= deadline) {
      throw new CommentStoreLockError(`lock 被占且未陈旧（等待 ${COMMENT_LOCK_WAIT_MS}ms 超时）：${lockFile}`);
    }
    await sleep(COMMENT_LOCK_POLL_MS);
  }
}
function releaseLockSync(lockFile) {
  try {
    unlinkSync(lockFile);
  } catch {
  }
}
async function withCommentsTransaction(cwd, transform) {
  const file = commentsFilePath(cwd);
  const lockFile = commentsLockPath(cwd);
  const queueKey = path.resolve(cwd);
  const previous = transactionQueues.get(queueKey) ?? Promise.resolve();
  const job = previous.then(async () => {
    await mkdir(path.dirname(file), { recursive: true });
    await acquireLock(lockFile);
    try {
      let current;
      try {
        current = parseCommentsFileText(readFileSync(file, "utf8"), file);
      } catch (error) {
        if (isFsCode(error, "ENOENT")) {
          current = emptyCommentsFile();
        } else {
          throw error;
        }
      }
      const { threads, selected } = transform(current.threads);
      const tmpFile = `${file}.tmp-${randomBytes(6).toString("hex")}`;
      try {
        writeFileSync(tmpFile, `${JSON.stringify({ version: COMMENTS_FILE_VERSION, threads })}
`, "utf8");
        renameSync(tmpFile, file);
      } catch (writeError) {
        try {
          unlinkSync(tmpFile);
        } catch {
        }
        throw writeError;
      }
      return selected;
    } finally {
      releaseLockSync(lockFile);
    }
  });
  transactionQueues.set(queueKey, job.catch(() => void 0));
  return job;
}
function validateCommentText(text) {
  if (text.length === 0) {
    throw new CommentStoreValidationError("text 为空（非空且 ≤ 10000 字符）");
  }
  if (text.length > COMMENT_TEXT_MAX_LENGTH) {
    throw new CommentStoreValidationError(`text 超限：${text.length} > ${COMMENT_TEXT_MAX_LENGTH} 字符`);
  }
}
function findCommentThread(threads, threadId) {
  const found = threads.find((thread) => thread.id === threadId);
  if (found === void 0) {
    throw new CommentThreadNotFoundError(threadId);
  }
  return found;
}
async function createCommentThread(cwd, input, at) {
  validateCommentText(input.text);
  if (input.artifactPath.length === 0) {
    throw new CommentStoreValidationError("artifactPath 为空");
  }
  if (input.anchor !== void 0 && !isCommentAnchor(input.anchor)) {
    throw new CommentStoreValidationError(
      "anchor 形态非法（须为对象且 level ∈ id|data|path、sel 非空且 ≤ 500 字符）"
    );
  }
  const moment = at ?? (/* @__PURE__ */ new Date()).toISOString();
  const thread = {
    id: `${COMMENT_THREAD_ID_PREFIX}${randomUUID()}`,
    artifactPath: input.artifactPath,
    text: input.text,
    ...input.anchor === void 0 ? {} : { anchor: input.anchor },
    replies: [],
    ...createInitialThreadFields(moment)
  };
  return withCommentsTransaction(cwd, (threads) => ({ threads: [...threads, thread], selected: thread }));
}
async function appendCommentReply(cwd, threadId, text, at) {
  validateCommentText(text);
  const moment = at ?? (/* @__PURE__ */ new Date()).toISOString();
  return withCommentsTransaction(cwd, (threads) => {
    const current = findCommentThread(threads, threadId);
    const transitioned = applyThreadTransition(current, "append-reply", { at: moment });
    const appended = { ...transitioned, replies: [...transitioned.replies, { text, at: moment }] };
    return { threads: threads.map((thread) => thread.id === threadId ? appended : thread), selected: appended };
  });
}
async function resolveCommentThread(cwd, threadId, at) {
  const moment = at ?? (/* @__PURE__ */ new Date()).toISOString();
  return withCommentsTransaction(cwd, (threads) => {
    const current = findCommentThread(threads, threadId);
    const resolved = applyThreadTransition(current, "resolve", { at: moment });
    return { threads: threads.map((thread) => thread.id === threadId ? resolved : thread), selected: resolved };
  });
}
async function setCommentDelivery(cwd, threadId, outcome, at) {
  const moment = at ?? (/* @__PURE__ */ new Date()).toISOString();
  return withCommentsTransaction(cwd, (threads) => {
    const current = findCommentThread(threads, threadId);
    const updated = applyThreadTransition(current, "deliver", { deliverOutcome: outcome, at: moment });
    return { threads: threads.map((thread) => thread.id === threadId ? updated : thread), selected: updated };
  });
}
async function retryCommentDelivery(cwd, threadId, at) {
  const moment = at ?? (/* @__PURE__ */ new Date()).toISOString();
  return withCommentsTransaction(cwd, (threads) => {
    const current = findCommentThread(threads, threadId);
    const retried = applyThreadTransition(current, "retry", { at: moment });
    return { threads: threads.map((thread) => thread.id === threadId ? retried : thread), selected: retried };
  });
}
export {
  COMMENTS_LOCK_NAME,
  COMMENT_LOCK_POLL_MS,
  COMMENT_LOCK_STALE_MS,
  COMMENT_LOCK_WAIT_MS,
  CommentStoreCorruptError,
  CommentStoreLockError,
  CommentStoreValidationError,
  CommentThreadNotFoundError,
  appendCommentReply,
  commentsFilePath,
  commentsLockPath,
  createCommentThread,
  findCommentThread,
  parseCommentsFileText,
  readCommentsFile,
  resolveCommentThread,
  retryCommentDelivery,
  setCommentDelivery,
  validateCommentText
};
