import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { PICK_SCRIPT_SOURCE } from "../comments/pick-script.js";
import { OD_FRAMES_DIR } from "../materialize/copy.js";
import { registerCommentsApiRoutes } from "./comments-api.js";
import { resolveSessionCwdById } from "./session-cwd.js";
const name = "od-serve";
const inject = ["webServer", "connection", "sessions"];
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
const PICK_SCRIPT_TAG_OPEN = '<script data-od-pick="1">';
function shouldInjectPickScript(method, contentType, relativePath) {
  if (method !== "GET") return false;
  if (!contentType.startsWith("text/html")) return false;
  const firstSegment = relativePath.split(sep)[0] ?? "";
  return firstSegment !== OD_FRAMES_DIR;
}
function injectPickScript(html) {
  const tag = `${PICK_SCRIPT_TAG_OPEN}${PICK_SCRIPT_SOURCE}<\/script>`;
  const at = html.toLowerCase().lastIndexOf("</body>");
  if (at <= -1) return `${html}${tag}`;
  return `${html.slice(0, at)}${tag}${html.slice(at)}`;
}
function etagFor(mtimeMs, size) {
  return `W/"${mtimeMs.toString(16)}-${size.toString(16)}"`;
}
function parseArtifactRoute(pathname) {
  const stripped = pathname.slice(OPENDESIGN_ARTIFACTS_PREFIX_PATH.length).replace(/^\/+/, "");
  if (stripped === "") return { status: "empty" };
  const slash = stripped.indexOf("/");
  if (slash <= -1) return { status: "empty" };
  let sessionId;
  try {
    sessionId = decodeURIComponent(stripped.slice(0, slash));
  } catch {
    return { status: "malformed" };
  }
  if (sessionId === "") return { status: "empty" };
  return { status: "route", sessionId, artifactRoute: stripped.slice(slash + 1) };
}
async function resolveArtifactPath(rootReal, artifactRoute) {
  if (artifactRoute === "") return { status: "missing" };
  let relative2;
  try {
    relative2 = decodeURIComponent(artifactRoute);
  } catch {
    return { status: "malformed" };
  }
  if (relative2.includes("\0") || isAbsolute(relative2)) return { status: "forbidden" };
  const candidate = join(rootReal, relative2);
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
  const parsed = parseArtifactRoute(pathname);
  if (parsed.status === "empty") {
    sendJson(res, 404, { code: "not-found", message: "artifact route requires a session segment" });
    return;
  }
  if (parsed.status === "malformed") {
    sendJson(res, 400, { code: "bad-request", message: "session segment contains a malformed percent-escape" });
    return;
  }
  const sessionCwd = resolveSessionCwdById(ctx, parsed.sessionId);
  if (sessionCwd === null) {
    sendJson(res, 404, { code: "session-unknown", message: "artifact route session has no working directory" });
    return;
  }
  const rootReal = await realpath(sessionCwd).catch(() => void 0);
  if (rootReal === void 0) {
    sendJson(res, 404, { code: "root-missing", message: "session working directory does not exist" });
    return;
  }
  const resolution = await resolveArtifactPath(rootReal, parsed.artifactRoute);
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
  const fileStat = await stat(resolution.path).catch(() => void 0);
  res.statusCode = 200;
  const contentType = contentTypeFor(resolution.path);
  res.setHeader("content-type", contentType);
  res.setHeader("cache-control", "no-store");
  if (contentType.startsWith("text/html") && fileStat !== void 0) {
    res.setHeader("etag", etagFor(fileStat.mtimeMs, fileStat.size));
  }
  if (shouldInjectPickScript(req.method, contentType, relative(rootReal, resolution.path))) {
    const html = body.toString("utf8");
    if (Buffer.byteLength(html, "utf8") === body.length) {
      res.end(Buffer.from(injectPickScript(html), "utf8"));
      return;
    }
  }
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
  host.inject?.(["connection"], (scope) => registerCommentsApiRoutes(scope, ctx));
}
export {
  OPENDESIGN_ARTIFACTS_PREFIX_PATH,
  OPENDESIGN_ARTIFACTS_PREFIX_ROUTE,
  apply,
  contentTypeFor,
  etagFor,
  inject,
  injectPickScript,
  name,
  parseArtifactRoute,
  resolveArtifactPath,
  shouldInjectPickScript
};
