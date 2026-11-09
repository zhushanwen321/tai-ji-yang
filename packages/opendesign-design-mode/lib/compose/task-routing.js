import { existsSync } from "node:fs";
import { join } from "node:path";
import { OD_FRAMES_DIR } from "../materialize/copy.js";
import { ROUTED_TASK_PROFILES } from "../types.js";
const TASK_PROFILE_DIR = "assets/task-profiles";
const ROUTED_PROFILE_LABELS = {
  prototype: "Prototype (site / app / interaction flow)",
  ppt: "Presentation (HTML slides / deck)",
  document: "Document (formatted HTML document)",
  marketing: "Marketing page (single-file HTML source)",
  "motion-design": "Motion design (editable HTML source)",
  hyperframes: "HyperFrames (timeline motion HTML source)",
  "web-clone": "Web clone (recreate a reference page)",
  webgl: "WebGL / interactive 3D (real-time HTML)"
};
function routedProfileEntries(scenarioRoot) {
  return ROUTED_TASK_PROFILES.map((id) => {
    const path = taskProfilePath(scenarioRoot, id);
    return { id, path, exists: existsSync(path) };
  });
}
function taskProfilePath(scenarioRoot, id) {
  return join(scenarioRoot, TASK_PROFILE_DIR, `${id}.md`);
}
const DECK_PROTOCOL_FILE = `${OD_FRAMES_DIR}/deck-framework.md`;
function shapeTemplateLine(entry) {
  if (entry.degraded) {
    return `- ${entry.dirName} (unparsed — match by directory name only)`;
  }
  let line = `- ${entry.dirName}`;
  if (entry.mode !== null) line += ` (mode: ${entry.mode})`;
  if (entry.descriptionFirstSentence !== null) line += ` — ${entry.descriptionFirstSentence}`;
  if (entry.triggerKeywordsZh.length > 0) line += ` — zh: ${entry.triggerKeywordsZh.join(", ")}`;
  return line;
}
function renderShapeTemplatesSection(catalog) {
  const lines = [
    "### Shape templates (design-templates)",
    ""
  ];
  if (!catalog.present || catalog.entries.length === 0) {
    lines.push(
      "No shape-template packages were found in this installation. If the user",
      "describes a specific screen or component shape, say no shape library is",
      "installed locally instead of inventing one."
    );
    return lines;
  }
  lines.push(
    `Shape-template packages installed on this machine — root: \`${catalog.root}\`.`,
    "The leading directory name of each line is the package directory under",
    "this root. Each line lists the frontmatter mode, the first sentence of",
    "the description, and the Chinese trigger words (zh:) when present.",
    "",
    ...catalog.entries.map(shapeTemplateLine),
    "",
    "Match the brief against the English description and the Chinese trigger",
    "words. When a package matches, read its SKILL.md in full with your file",
    "tools, and read `example.html` in the same directory when present",
    "(templates without an example page skip it)."
  );
  return lines;
}
function renderRoutingSegment(input) {
  const entries = routedProfileEntries(input.scenarioRoot);
  const lines = [
    "## Task routing (design mode)",
    "",
    "This session runs the design strategy outside the Open Design host, so no",
    "task profile is pre-selected and none is pre-loaded into this prompt. Route",
    "yourself as follows.",
    "",
    "### First turn: settle the deliverable kind",
    "",
    "- If the request already names a concrete deliverable kind (for example",
    '  "landing page", "slide deck", "clone this page"), treat that kind as',
    "  selected and skip the question.",
    "- Otherwise, before planning, show the eight task kinds below as one plain",
    "  numbered text question and ask the user to choose by number or name.",
    "  Recommend the obvious choice when the request makes one likely. This",
    "  first-turn question takes over the selection duty of the discovery",
    "  profile, which is not part of this mode; never look for a discovery",
    "  profile file.",
    "- For a standalone image, video, or audio generation request, do not route",
    "  it to a task profile: state that media rendering is not available in this",
    "  environment and offer an HTML-source deliverable instead.",
    "",
    "### After a task kind is chosen",
    "",
    "- Read the chosen task profile file in full with your file tools before",
    "  planning, and follow it as the authority for that deliverable. The profile",
    "  file is the wording that ships with the installed OpenDesign assets; this",
    "  section only routes you to it.",
    "- To switch task kinds within this session, read the other profile the same",
    "  way before switching the work.",
    "",
    "### Task profiles (absolute paths on this machine)",
    ""
  ];
  entries.forEach((entry, index) => {
    const label = ROUTED_PROFILE_LABELS[entry.id];
    if (!entry.exists) {
      lines.push(
        `${index + 1}. ${label} — ${entry.path}`,
        "   This profile file is missing from the current OpenDesign installation.",
        "   If this kind is requested, tell the user it is currently unavailable",
        "   instead of reading a nonexistent file."
      );
      return;
    }
    lines.push(`${index + 1}. ${label} — ${entry.path}`);
    if (entry.id === "motion-design") {
      lines.push(
        "   Motion design note: final-cut MP4 rendering and every media CLI command",
        "   mentioned in that profile are unavailable in this environment. Deliver",
        "   the editable HTML/CSS/JS source; when the profile demands a rendered",
        "   MP4 on top of the source, state the limitation truthfully and deliver",
        "   the source alone."
      );
    }
    if (entry.id === "ppt") {
      lines.push(
        `   Deck protocol note: presentation deliverables follow the deck protocol`,
        `   file staged at \`${DECK_PROTOCOL_FILE}\` in this session directory. Read`,
        "   it with your file tools before producing slide or deck HTML."
      );
    }
  });
  lines.push("");
  lines.push(...renderShapeTemplatesSection(input.shapeTemplates));
  return lines.join("\n");
}
export {
  TASK_PROFILE_DIR,
  renderRoutingSegment,
  routedProfileEntries,
  taskProfilePath
};
