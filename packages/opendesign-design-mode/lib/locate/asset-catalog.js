import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
const CRAFT_META_FILES = /* @__PURE__ */ new Set(["README.md", "FUTURE_SECTIONS.md"]);
function buildCraftCatalog(craftRoot) {
  if (!statIsDirectory(craftRoot)) {
    return { craftRoot, present: false, manualFiles: [] };
  }
  const manualFiles = readdirSync(craftRoot).filter((name) => name.endsWith(".md") && !CRAFT_META_FILES.has(name)).sort();
  return { craftRoot, present: true, manualFiles };
}
function buildShapeTemplateCatalog(shapeTemplatesRoot) {
  if (!statIsDirectory(shapeTemplatesRoot)) {
    return { root: shapeTemplatesRoot, present: false, entries: [], parseErrorCount: 0 };
  }
  const entries = [];
  let parseErrorCount = 0;
  for (const dirName of listSubDirectories(shapeTemplatesRoot)) {
    const skillPath = join(shapeTemplatesRoot, dirName, "SKILL.md");
    const frontmatter = readSkillFrontmatter(skillPath);
    if (frontmatter === null || frontmatter.name === null) {
      entries.push({
        dirName,
        degraded: true,
        name: null,
        mode: null,
        descriptionFirstSentence: null,
        triggerKeywordsZh: [],
        craftRequires: []
      });
      parseErrorCount += 1;
      continue;
    }
    entries.push({
      dirName,
      degraded: false,
      name: frontmatter.name,
      mode: frontmatter.odMode,
      descriptionFirstSentence: frontmatter.description === null ? null : firstSentence(frontmatter.description),
      triggerKeywordsZh: frontmatter.triggers.filter(containsCjk),
      craftRequires: frontmatter.craftRequires
    });
  }
  return { root: shapeTemplatesRoot, present: true, entries, parseErrorCount };
}
function buildDesignSystemCatalog(designSystemsRoot) {
  if (!statIsDirectory(designSystemsRoot)) {
    return { root: designSystemsRoot, present: false, entries: [], parseErrorCount: 0 };
  }
  const entries = [];
  let parseErrorCount = 0;
  for (const dirName of listSubDirectories(designSystemsRoot)) {
    const manifestPath = join(designSystemsRoot, dirName, "manifest.json");
    if (!existsSync(manifestPath)) {
      continue;
    }
    const summary = readManifestSummary(manifestPath);
    if (summary === null) {
      entries.push({
        dirName,
        degraded: true,
        name: null,
        category: null,
        deepFiles: { usage: false, components: false, tailwind: false }
      });
      parseErrorCount += 1;
      continue;
    }
    const pkgDir = join(designSystemsRoot, dirName);
    entries.push({
      dirName,
      degraded: false,
      name: summary.name,
      category: summary.category,
      deepFiles: {
        usage: existsSync(join(pkgDir, "USAGE.md")),
        components: existsSync(join(pkgDir, "components.html")),
        tailwind: existsSync(join(pkgDir, "tailwind-v4.css"))
      }
    });
  }
  return { root: designSystemsRoot, present: true, entries, parseErrorCount };
}
function buildAssetCatalog(dirs) {
  return {
    craft: buildCraftCatalog(dirs.craftRoot),
    shapeTemplates: buildShapeTemplateCatalog(dirs.shapeTemplatesRoot),
    designSystems: buildDesignSystemCatalog(dirs.designSystemsRoot)
  };
}
function readSkillFrontmatter(skillPath) {
  let text;
  try {
    text = readFileSync(skillPath, "utf8");
  } catch {
    return null;
  }
  return parseSkillFrontmatter(text);
}
function parseSkillFrontmatter(text) {
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") return null;
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i]?.trim() === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) return null;
  const fmLines = lines.slice(1, end);
  const summary = {
    name: null,
    description: null,
    triggers: [],
    odMode: null,
    craftRequires: []
  };
  const stack = [];
  let blockScalar = null;
  for (const line of fmLines) {
    if (line.trim() === "") continue;
    const indent = leadingSpaces(line);
    if (blockScalar !== null) {
      if (indent > blockScalar.indent) {
        blockScalar.parts.push(line.trim());
        continue;
      }
      finishBlockScalar(summary, blockScalar);
      blockScalar = null;
    }
    const keyMatch = line.match(/^( *)[A-Za-z0-9_.-]+:(.*)$/);
    if (keyMatch !== null) {
      const keyIndent = keyMatch[1].length;
      const colon = line.indexOf(":");
      const key = line.slice(keyIndent, colon);
      const rest = line.slice(colon + 1).trim();
      while (stack.length > 0 && stack[stack.length - 1].indent >= keyIndent) stack.pop();
      const path = [...stack.map((item) => item.segment), key].join(".");
      stack.push({ indent: keyIndent, segment: key });
      if (rest === "|" || rest === ">" || rest === "|-" || rest === ">-") {
        blockScalar = { path, indent: keyIndent, parts: [] };
      } else if (rest !== "") {
        assignScalar(summary, path, rest);
      }
      continue;
    }
    const listMatch = line.match(/^ *-(.*)$/);
    if (listMatch !== null) {
      if (stack.length === 0) continue;
      const currentPath = stack.map((item) => item.segment).join(".");
      assignListItem(summary, currentPath, listMatch[1].trim());
    }
  }
  if (blockScalar !== null) finishBlockScalar(summary, blockScalar);
  return summary;
}
function assignScalar(summary, path, raw) {
  const value = stripQuotes(raw);
  if (path === "name") summary.name = value;
  else if (path === "description") summary.description = value;
  else if (path === "od.mode") summary.odMode = value;
  else if (path === "od.craft.requires") summary.craftRequires = parseFlowList(raw);
}
function assignListItem(summary, path, raw) {
  const value = stripQuotes(raw);
  if (path === "triggers") summary.triggers.push(value);
  else if (path === "od.craft.requires") summary.craftRequires.push(value);
}
function finishBlockScalar(summary, block) {
  if (block.path === "description") summary.description = block.parts.join("\n");
}
function parseFlowList(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed.slice(1, -1).split(",").map((item) => stripQuotes(item)).filter((item) => item !== "");
  }
  const value = stripQuotes(trimmed);
  return value === "" ? [] : [value];
}
function stripQuotes(value) {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && (trimmed.startsWith('"') && trimmed.endsWith('"') || trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
function readManifestSummary(manifestPath) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object") return null;
  const record = parsed;
  const name = record["name"];
  const category = record["category"];
  if (typeof name !== "string" || name === "" || typeof category !== "string" || category === "") {
    return null;
  }
  return { name, category };
}
function statIsDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
function listSubDirectories(root) {
  return readdirSync(root, { withFileTypes: true }).filter((item) => item.isDirectory()).map((item) => item.name).sort();
}
function leadingSpaces(line) {
  const match = line.match(/^ */);
  return match === null ? 0 : match[0].length;
}
function containsCjk(value) {
  return /[\u3400-\u4dbf\u4e00-\u9fff]/.test(value);
}
function firstSentence(description) {
  const collapsed = description.replace(/\s+/g, " ").trim();
  const idx = collapsed.indexOf(". ");
  if (idx === -1) return collapsed;
  return collapsed.slice(0, idx + 1);
}
export {
  buildAssetCatalog,
  buildCraftCatalog,
  buildDesignSystemCatalog,
  buildShapeTemplateCatalog,
  firstSentence,
  parseSkillFrontmatter
};
