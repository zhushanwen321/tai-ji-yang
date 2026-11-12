import { createHash } from "node:crypto";
const OD_ANCHOR_ATTR = "data-od-id";
const OD_SECTION_ID_PREFIX = "od-sec-";
const FINGERPRINT_WINDOW = 256;
const FINGERPRINT_HASH_CHARS = 8;
const SECTION_TAG_RE = /<section\b[^>]*>/gi;
const COMMENT_RE = /<!--[\s\S]*?-->/g;
const TAGGED_RE = new RegExp(`${OD_ANCHOR_ATTR}\\s*=|data-screen-label\\s*=`);
const EXISTING_ID_RE = new RegExp(
  `\\b${OD_ANCHOR_ATTR}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\\u0060]+))`,
  "gi"
);
function backfillAnchors(buffer) {
  const html = buffer.toString("utf8");
  if (Buffer.byteLength(html, "utf8") !== buffer.length) {
    return { buffer, inserted: [], skipped: 0, gaveUp: "utf8" };
  }
  SECTION_TAG_RE.lastIndex = 0;
  COMMENT_RE.lastIndex = 0;
  EXISTING_ID_RE.lastIndex = 0;
  const commentSpans = collectCommentSpans(html);
  const usedIds = collectExistingAnchorIds(html);
  const insertions = [];
  let skipped = 0;
  for (let m = SECTION_TAG_RE.exec(html); m !== null; m = SECTION_TAG_RE.exec(html)) {
    const tagStart = m.index;
    if (commentSpans.some((span) => tagStart >= span.start && tagStart < span.end)) {
      skipped += 1;
      continue;
    }
    const tagEnd = findTagEnd(html, tagStart);
    if (tagEnd === void 0) {
      skipped += 1;
      continue;
    }
    if (TAGGED_RE.test(html.slice(tagStart, tagEnd + 1))) {
      skipped += 1;
      continue;
    }
    const fingerprint = html.slice(tagEnd + 1, tagEnd + 1 + FINGERPRINT_WINDOW).trim();
    const base = OD_SECTION_ID_PREFIX + sha256Hex(fingerprint).slice(0, FINGERPRINT_HASH_CHARS);
    const id = uniqueId(base, usedIds);
    usedIds.add(id);
    insertions.push({ pos: tagEnd, text: ` ${OD_ANCHOR_ATTR}="${id}"`, id });
  }
  if (insertions.length === 0) {
    return { buffer, inserted: [], skipped };
  }
  const parts = [];
  let cursor = 0;
  for (const ins of insertions) {
    parts.push(html.slice(cursor, ins.pos), ins.text);
    cursor = ins.pos;
  }
  parts.push(html.slice(cursor));
  return {
    buffer: Buffer.from(parts.join(""), "utf8"),
    inserted: insertions.map((ins) => ({ id: ins.id })),
    skipped
  };
}
function collectCommentSpans(html) {
  const spans = [];
  for (let m = COMMENT_RE.exec(html); m !== null; m = COMMENT_RE.exec(html)) {
    spans.push({ start: m.index, end: m.index + m[0].length });
  }
  return spans;
}
function collectExistingAnchorIds(html) {
  const ids = /* @__PURE__ */ new Set();
  for (let m = EXISTING_ID_RE.exec(html); m !== null; m = EXISTING_ID_RE.exec(html)) {
    const value = m[1] ?? m[2] ?? m[3];
    if (value !== void 0) ids.add(value);
  }
  return ids;
}
function findTagEnd(html, tagStart) {
  let quote = null;
  for (let i = tagStart; i < html.length; i += 1) {
    const ch = html[i];
    if (quote !== null) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ">") return i;
  }
  return void 0;
}
function sha256Hex(input) {
  return createHash("sha256").update(input, "utf8").digest("hex");
}
function uniqueId(base, used) {
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}
export {
  FINGERPRINT_HASH_CHARS,
  FINGERPRINT_WINDOW,
  OD_ANCHOR_ATTR,
  OD_SECTION_ID_PREFIX,
  backfillAnchors
};
