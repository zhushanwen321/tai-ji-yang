import { join } from "node:path";
import { TASK_PROFILE_DIR, routedProfileEntries } from "./task-routing.js";
const SKILL_CATALOG_PLACEHOLDER = "{{SKILL_CATALOG}}";
const SKILL_ROOT_PLACEHOLDER = "{{SKILL_ROOT}}";
function taskProfilesRoot(scenarioRoot) {
  return join(scenarioRoot, TASK_PROFILE_DIR);
}
function renderTaskProfileCatalog(scenarioRoot) {
  return routedProfileEntries(scenarioRoot).map((entry) => `- ${entry.id}: Read ${entry.path}`).join("\n");
}
function replaceInjectionPlaceholders(text, scenarioRoot) {
  if (!text.includes("{{")) return text;
  return text.replaceAll(SKILL_CATALOG_PLACEHOLDER, renderTaskProfileCatalog(scenarioRoot)).replaceAll(SKILL_ROOT_PLACEHOLDER, taskProfilesRoot(scenarioRoot));
}
export {
  SKILL_CATALOG_PLACEHOLDER,
  SKILL_ROOT_PLACEHOLDER,
  renderTaskProfileCatalog,
  replaceInjectionPlaceholders,
  taskProfilesRoot
};
