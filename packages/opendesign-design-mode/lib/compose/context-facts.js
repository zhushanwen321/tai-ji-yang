import { OD_FRAMES_DIR, MATERIALIZED_FILE_NAMES } from "../materialize/copy.js";
const SHELL_FILE_NAMES = MATERIALIZED_FILE_NAMES.filter((name) => name !== "layout.css");
function escapeContextBody(body) {
  return body.replace(/<\/od-next-context>/gi, "&lt;/od-next-context>");
}
function renderBlock(block) {
  return [
    `<od-next-context kind="${block.kind}" name="${block.name}">`,
    escapeContextBody(block.body),
    "</od-next-context>"
  ].join("\n");
}
function stableJson(value) {
  const sorted = {};
  for (const key of Object.keys(value).sort()) sorted[key] = value[key];
  return JSON.stringify(sorted);
}
function renderContextFacts(input = {}) {
  const blocks = [
    {
      kind: "fact",
      name: "device-frames",
      body: stableJson({
        note: "All three handset shells are staged in the project directory. Pick the shell by the user brief following the prototype task profile shell table; web, responsive, and desktop targets use no shell.",
        root: OD_FRAMES_DIR,
        shells: SHELL_FILE_NAMES.map((name) => `${OD_FRAMES_DIR}/${name}`)
      })
    },
    {
      kind: "fact",
      name: "layout-primitives",
      body: stableJson({
        note: "Structure-only layout primitives (@layer od-layout) staged beside the shells. Read the file with your file tools and inline it as the first rule set of the document per the prototype task profile.",
        path: `${OD_FRAMES_DIR}/layout.css`
      })
    }
  ];
  if (input.deckFrameworkDirective !== void 0 && input.deckFrameworkDirective.trim() !== "") {
    blocks.push({
      kind: "instruction",
      name: "deck-framework",
      body: "Apply this host protocol only when creating or editing an HTML deck. Its presence does not request a deck or override the user's requested deliverable.\n\n" + input.deckFrameworkDirective
    });
  }
  return blocks.map(renderBlock).join("\n");
}
export {
  renderContextFacts
};
