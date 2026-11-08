import { existsSync } from "node:fs";
import { join } from "node:path";
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
  });
  lines.push(
    "",
    "### Design systems installed on this machine",
    ""
  );
  if (input.designSystemNames.length === 0) {
    lines.push(
      "No design-system directories were found in this installation. If the user",
      "names a brand or design system, say none is installed locally instead of",
      "inventing one."
    );
  } else {
    lines.push(
      "Directory names under the design-systems root (each name is a brand",
      "identifier):",
      "",
      ...input.designSystemNames.map((name) => `- ${name}`),
      "",
      "When the user names a brand, match it against this list, then read",
      "`<design-systems-root>/<name>/DESIGN.md`, `tokens.css`, and sibling files",
      "directly with your file tools."
    );
  }
  return lines.join("\n");
}
export {
  TASK_PROFILE_DIR,
  renderRoutingSegment,
  routedProfileEntries,
  taskProfilePath
};
