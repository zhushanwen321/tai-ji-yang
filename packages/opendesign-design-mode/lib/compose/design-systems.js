const SECTION_TITLE = "### Design systems installed on this machine";
const DEEP_FILE_LABELS = [
  { key: "usage", label: "USAGE.md" },
  { key: "components", label: "components.html" },
  { key: "tailwind", label: "tailwind-v4.css" }
];
function designSystemLine(entry) {
  if (entry.degraded) {
    return `- ${entry.dirName} (unparsed — match by directory name and read the package directory directly)`;
  }
  let line = `- ${entry.dirName} — ${entry.name} (${entry.category})`;
  const deepFiles = DEEP_FILE_LABELS.filter(({ key }) => entry.deepFiles[key]).map(({ label }) => label);
  if (deepFiles.length > 0) line += ` — also read: ${deepFiles.join(", ")}`;
  return line;
}
function renderDesignSystemsSegment(catalog) {
  const lines = [SECTION_TITLE, ""];
  if (!catalog.present || catalog.entries.length === 0) {
    lines.push(
      "No design-system directories were found in this installation. If the user",
      "names a brand or design system, say none is installed locally instead of",
      "inventing one."
    );
    return lines.join("\n");
  }
  lines.push(
    `Manifest-aware listing of the design-system packages installed on this`,
    `machine — root: \`${catalog.root}\`. The leading directory name of each`,
    "line is the package directory under this root; the manifest name and",
    'category follow. "also read" names the deeper reference files present in',
    "that package.",
    "",
    ...catalog.entries.map(designSystemLine),
    "",
    "When the user names a brand, match it against this list (brand name or",
    "category), then read `<design-systems-root>/<dirName>/DESIGN.md`,",
    "`tokens.css`, and sibling files directly with your file tools."
  );
  return lines.join("\n");
}
export {
  renderDesignSystemsSegment
};
