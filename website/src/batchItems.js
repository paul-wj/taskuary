// A batch's items (batch.py): the ranked arrivals of one repository, let in as one task and worked top-down by one agent
// (read-only only where the triage judged an item dangerous). One shape for the task page and the rail: what each item's state is called, what the owner may press on it, and
// the one line that says how far the batch got.
import { label } from "./buttons.js";
import { t } from "./i18n.js";

export const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
export const circled = (n) => CIRCLED[n - 1] || String(n);
const OPEN = ["waiting", "working", "needs_you"];
export const isOpen = (i) => OPEN.includes(i?.State);

// the state, in words - "needs you" is the only one that shouts
export const stateWord = (i) => {
  const word = { waiting: "not yet read", working: "reading", needs_you: "needs you", done: "done",
    ended: (i?.EndedWhy || "").toLowerCase().includes("merged") ? "merged" : "closed" }[i?.State];
  return word ? t(word) : i?.State || "";
};

const isPull = (i) => /github\.com\/[^/]+\/[^/]+\/pull\/\d+/.test(i?.Link || "");

// what the owner can press on one line. Merge only on a pull request the agent has reviewed: the merge is pinned to the head
// it read (batch.act), so with nothing reviewed there is nothing to pin it to. The filled one is what the agent PROPOSED
// (--propose): a duplicate it says to close must not wear a filled Merge. Asking for changes is said on GitHub, so it opens it.
// FIX IT (batch.fix): where the review asked for changes, the changes made - by the batch's agent for our own people, in GitHub's
// cloud for an outsider (cloudfix.py). A fix that is done has its own pull request, and Merge merges that one.
export const fixing = (i) => i?.Fix === "running";
export function fixLine(i) {
  if (fixing(i)) return t("Being fixed in GitHub's cloud…");
  if (i?.Fix === "done") return t("Fixed in GitHub's cloud - its pull request is ready to merge.");
  if (i?.Fix === "failed") return t("The cloud fix did not work.");
  return "";
}
export function actions(i) {
  if (!i) return [];
  if (fixing(i)) return [];
  if (!isOpen(i)) return [{ action: "reopen", label: t("Open again") }];
  if (i.State !== "needs_you") return [{ action: "settle", label: t("Nothing to do") }];
  const p = i.Propose, fixed = i.Fix === "done";
  const canFix = isPull(i) && p === "changes" && i.canFix !== false;
  const all = [...(canFix ? [{ action: "fix", label: i.Fix === "failed" ? t("{action} again", { action: label("fix") }) : label("fix"), primary: true }] : []),
    ...(i.Link && p === "changes" ? [{ action: "open", label: t("Ask for changes"), href: i.Link, primary: !canFix }] : []),
    ...(fixed && i.FixLink ? [{ action: "open-fix", label: t("See the fix"), href: i.FixLink }] : []),
    ...(isPull(i) && i.reviewed ? [{ action: "merge", label: fixed ? t("Merge the fix") : t("Merge"), primary: p === "merge" }] : []),
    ...(isPull(i) ? [{ action: "close", label: t("Close it"), primary: p === "close" }] : []), { action: "settle", label: t("Nothing to do") }];
  return [...all.filter((a) => a.primary), ...all.filter((a) => !a.primary)];
}

// "2 of 4 done · ③ needs you" - the rail's second line and the block's heading
export function progress(items) {
  const its = items || [];
  if (!its.length) return "";
  const settled = its.filter((i) => !isOpen(i)).length;
  const you = its.filter((i) => i.State === "needs_you").map((i) => circled(i.Place));
  return [t("{settled} of {total} done", { settled, total: its.length }), you.length ? t(you.length === 1 ? "{items} needs you" : "{items} need you", { items: you.join("") }) : ""].filter(Boolean).join(" · ");
}

// the rail row's own height has room for a count, not a sentence: "1/4" (settled of all)
export const railShort = (states) => `${(states || []).filter((st) => !OPEN.includes(st)).length}/${(states || []).length}`;
