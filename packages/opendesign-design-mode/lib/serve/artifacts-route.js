import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, resolve, sep } from "node:path";
const name = "od-serve";
const inject = ["webServer", "connection"];
const OPENDESIGN_ARTIFACTS_PREFIX_PATH = "/opendesign/artifacts";
const OPENDESIGN_ARTIFACTS_PREFIX_ROUTE = OPENDESIGN_ARTIFACTS_PREFIX_PATH.slice(1);
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".pdf": "application/pdf",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};
function contentTypeFor(fileName) {
  const dot = fileName.lastIndexOf(".");
  if (dot <= -1) return "application/octet-stream";
  return CONTENT_TYPES[fileName.slice(dot).toLowerCase()] ?? "application/octet-stream";
}
function resolveServeRoot(ctx) {
  const workingDirectory = ctx?.workingDirectory;
  const directory = workingDirectory?.defaultDirectory;
  return typeof directory === "string" && directory.length > 0 ? directory : process.cwd();
}
async function resolveArtifactPath(rootReal, pathname) {
  const stripped = pathname.slice(OPENDESIGN_ARTIFACTS_PREFIX_PATH.length).replace(/^\/+/, "");
  if (stripped === "") return { status: "missing" };
  let relative;
  try {
    relative = decodeURIComponent(stripped);
  } catch {
    return { status: "malformed" };
  }
  if (relative.includes("\0") || isAbsolute(relative)) return { status: "forbidden" };
  const candidate = join(rootReal, relative);
  const lexical = resolve(candidate);
  if (lexical !== rootReal && !lexical.startsWith(rootReal + sep)) return { status: "forbidden" };
  let real;
  try {
    real = await realpath(lexical);
  } catch {
    return { status: "missing" };
  }
  const inside = real === rootReal || real.startsWith(rootReal + sep);
  if (!inside) return { status: "forbidden" };
  const info = await stat(real).catch(() => void 0);
  return info?.isFile() === true ? { status: "file", path: real } : { status: "missing" };
}
function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
}
function sendMethodNotAllowed(res) {
  res.statusCode = 405;
  res.setHeader("allow", "GET");
  res.end();
}
function fenceRejected(req, res, connection) {
  const rejection = connection.requestRejection(req);
  if (rejection === void 0) return false;
  res.statusCode = rejection;
  res.end();
  return true;
}
async function serveArtifactRequest(ctx, req, res) {
  const connection = ctx?.connection;
  if (connection === void 0) {
    sendJson(res, 503, { code: "fence-unavailable", message: "connection fence service is unavailable" });
    return;
  }
  if (fenceRejected(req, res, connection)) return;
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendMethodNotAllowed(res);
    return;
  }
  let pathname;
  try {
    pathname = new URL(String(req.url), "http://localhost").pathname;
  } catch {
    sendJson(res, 400, { code: "bad-request", message: "request URL is not parseable" });
    return;
  }
  if (pathname !== OPENDESIGN_ARTIFACTS_PREFIX_PATH && !pathname.startsWith(`${OPENDESIGN_ARTIFACTS_PREFIX_PATH}/`)) {
    sendJson(res, 404, { code: "not-found", message: `no artifact route for ${pathname}` });
    return;
  }
  const rootReal = await realpath(resolveServeRoot(ctx)).catch(() => void 0);
  if (rootReal === void 0) {
    sendJson(res, 404, { code: "root-missing", message: "session working directory does not exist" });
    return;
  }
  const resolution = await resolveArtifactPath(rootReal, pathname);
  if (resolution.status === "forbidden") {
    sendJson(res, 403, { code: "forbidden", message: "path escapes the session working directory" });
    return;
  }
  if (resolution.status === "malformed") {
    sendJson(res, 400, { code: "bad-request", message: "path contains a malformed percent-escape" });
    return;
  }
  if (resolution.status === "missing") {
    sendJson(res, 404, { code: "not-found", message: "no artifact file at this path" });
    return;
  }
  let body;
  try {
    body = await readFile(resolution.path);
  } catch {
    sendJson(res, 404, { code: "not-found", message: "artifact disappeared between resolution and read" });
    return;
  }
  res.statusCode = 200;
  res.setHeader("content-type", contentTypeFor(resolution.path));
  res.setHeader("cache-control", "no-store");
  if (req.method === "GET") res.end(body);
  else res.end();
}
function apply(ctx) {
  const host = ctx;
  host.effect(() => host.webServer.register({
    kind: "prefix",
    path: OPENDESIGN_ARTIFACTS_PREFIX_PATH,
    // promise 返还调用方：webServer 的 handle() 对 handler 结果 await 并兜底（400），
    // 单测双打同样以 await 驱动到响应结束，避免半结束态断言。
    handler: (req, res) => serveArtifactRequest(ctx, req, res)
  }), `od-serve: GET ${OPENDESIGN_ARTIFACTS_PREFIX_PATH}/<path>`);
}
export {
  OPENDESIGN_ARTIFACTS_PREFIX_PATH,
  OPENDESIGN_ARTIFACTS_PREFIX_ROUTE,
  apply,
  contentTypeFor,
  inject,
  name,
  resolveArtifactPath,
  resolveServeRoot
};
