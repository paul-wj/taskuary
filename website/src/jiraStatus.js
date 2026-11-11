// A JIRA ISSUE SAYS WHERE IT STANDS IN ITS OWN WORKFLOW.
//
// The server keeps Jira's live snapshot beside the item (item.jira: status, category, resolution -
// the RAW provider words, never translated here). The rail row
// and an FYI's line wear a compact badge of it - "Open" beside a subject, never a made-up state:
// what Jira says is said in Jira's words, and a row with no snapshot reads exactly as it did
// before. category is Jira's API statusCategory.key (new / indeterminate / done); an unknown one
// stays unknown - its badge is drawn without a colour, never guessed from the status name.
// The local task and the agent's own states live in their own lanes and are never mixed in here.
import { t } from "./i18n.js";

// the snapshot beside the item, or nothing - missing metadata reads as "no Jira state to say"
export const jiraStatusOf = (item) => {
  const j = item?.jira;
  if (!j || typeof j !== "object") return null;
  if (typeof j.status !== "string" || !j.status.trim()) return null;
  return j;
};

// what the badge says: the provider's own status word - "Open" stays "Open" in every locale. No
// resolution is drawn on the badge itself; its words are the badge's hover (jiraStatusTip)
export const jiraStatusText = (item) => jiraStatusOf(item)?.status || null;

// the badge's tone, for the rail's one quiet colour: Jira's category in the app's own roles -
// new work the task band's sage, in flight the brand's slate, done a filed oat. Unknown and empty
// say nothing: the badge stays uncoloured, never a hue invented for the guess
export const JIRA_TONE = { new: "new", indeterminate: "indeterminate", done: "done" };
export const jiraStatusTone = (item) => {
  const j = jiraStatusOf(item);
  return j && Object.hasOwn(JIRA_TONE, j.category) ? j.category : "";
};

// the category in the hover, as Jira's own API names it (statusCategory.key) - an author label the
// UI translates, unlike the status and resolution which stay the provider's raw words. An unknown
// key is never guessed: nothing is said
const CATEGORY_WORD = { new: "To do", indeterminate: "In progress", done: "Done" };
export const jiraCategoryLabel = (item) => {
  const j = jiraStatusOf(item);
  const word = j && Object.hasOwn(CATEGORY_WORD, j.category) && CATEGORY_WORD[j.category];
  return word ? t(word) : "";
};

// The badge's hover keeps provider status and resolution separate from the translated category.
export const jiraStatusTip = (item) => {
  const j = jiraStatusOf(item);
  if (!j) return "";
  const parts = [t("Jira status: {status}", { status: j.status })];
  const category = jiraCategoryLabel(item);
  if (category) parts.push(category);
  if (j.resolution) parts.push(t("Resolution: {resolution}", { resolution: j.resolution }));
  return parts.join(" · ");
};

// The opened card identifies this as Jira's status, not the local task or agent state.
export const jiraStatusSub = (item) => {
  const j = jiraStatusOf(item);
  if (!j) return "";
  return t("Jira status: {status}", { status: j.status });
};
