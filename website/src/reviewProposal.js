import { label } from "./buttons.js";
import { t } from "./i18n.js";

export const proposalFrom = (review) => {
  if (review?.Kind !== "action") return null;
  try {
    const proposal = JSON.parse(review.DraftText || "");
    return proposal?.action ? proposal : null;
  } catch {
    return null;
  }
};

// THE CLOSE-OUT (the owner, 2026-09-27): what finishes a task where it lives - merge the PR the agent opened, close
// the issue it came from. Its text is the summary a merge is squashed with, or the comment the issue closes with.
// ONE SET OF WORDS FOR EVERY SYSTEM (the owner, 2026-09-27: "if we have button to close out per system it will be
// endless"): Approve / Decline / Remind me (the task's own - 2026-10-02: "not yet is really remind me later"). Only `then` - what it does THERE - differs; a new connector adds a line.
// ...and Approve is the one word for every proposal (buttons.json: approve's `action` state) - "Merge & close", "Run action" and
// "Save playbook" were three more names for the same press
const approve = () => t(label("approve", "action"));
export const CLOSEOUT = {
  merge_pr: { get label() { return approve(); }, busy: "merging…", then: "merges the pull request on GitHub", reject: null,
    // the other answer, where the system has one: the work is not wanted - the PR closes unmerged
    alt: { verb: "close_pr", label: "Decline", busy: "declining…", then: "closes the pull request without merging it" } },
  close_issue: { get label() { return approve(); }, busy: "closing…", then: "closes the issue on GitHub", reject: null },
  // a Jira, Monday or Linear item (trackers.py, 2026-10-25): the comment, then the move to the tracker's own done state
  close_item: { get label() { return approve(); }, busy: "closing…", then: "posts the comment and moves the item to done", reject: null },
};
const TRACKER = { jira: "Jira", monday: "Monday", linear: "Linear" };
export const closeoutOf = (review) => {
  const co = CLOSEOUT[proposalFrom(review)?.action];
  return co ? { ...co, label: approve(), busy: t(co.busy), then: t(co.then),
    alt: co.alt ? { ...co.alt, label: t(co.alt.label), busy: t(co.alt.busy), then: t(co.alt.then) } : co.alt } : null;
};

// a playbook's file name from its title - playbooks.slugify's rule: lower case, every other run of characters one "-", cut, trimmed
const slugify = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60).replace(/^-+|-+$/g, "");

// a proposal whose words ARE a playbook page: a new one (the agent's on-close draft) or the ledger's block on one (build step 5)
export const PAGES = new Set(["write_playbook", "amend_playbook"]);

// a tool run's place (proposals.WHERE_KEYS, the same order) and what it carries: the text it writes, the query or script it runs,
// else its other settings one per line - the plumbing (the action, the run it belongs to, the connection id) left out
const WHERE_KEYS = ["path", "to", "folder", "table", "url", "bucket", "key", "container", "blob", "channel", "list", "database", "item"];
const PLUMBING = new Set(["action", "type", "flow_run", "connector_id", "why", ...WHERE_KEYS]);
export const toolWhere = (p) => {
  const k = WHERE_KEYS.find((x) => p?.[x]);
  const sys = String(p?.type || "").replace(/_/g, " ");
  return k ? `${String(p[k])} · ${sys}` : sys || t("a connected system");
};
export const toolBody = (p) => {
  const body = p?.text ?? p?.body ?? p?.message ?? p?.query ?? p?.script;
  if (body != null && body !== "") return String(body);
  return Object.entries(p || {}).filter(([k, v]) => !PLUMBING.has(k) && v !== "" && v != null)
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join("\n");
};

export const reviewText = (review) => {
  const proposal = proposalFrom(review);
  if (CLOSEOUT[proposal?.action]) return proposal.text || "";      // never the JSON envelope: an empty box sends nothing extra
  // a workflow repair reads as what was wrong and what changes, never the step list's JSON (flow.repair)
  if (proposal?.action === "repair_workflow") return [proposal.why, proposal.changes].filter(Boolean).join("\n\n");
  if (proposal?.action === "run_tool") return toolBody(proposal);
  // the WHAT is the context line already (proposals.queue's Reason); the box is the exact command Approve runs, once - with no AI the card
  // said "agent-browser click @e12" three times over (2026-10-25)
  if (["browser_act", "shell_act", "desktop_act"].includes(proposal?.action)) return proposal.command ? `Approve runs: ${proposal.command}` : proposal.what || "";
  return PAGES.has(proposal?.action) && proposal.text ? proposal.text : review?.DraftText || "";
};

// THE LINE OVER A HELD STEP'S CARD IN THE CHAT, said for what was held: a held delete read "The agent's browser waits for your yes" (2026-11-03)
export const heldActsLine = (reviews = []) => {
  const kinds = new Set(reviews.map((r) => proposalFrom(r)?.action));
  const only = (k) => kinds.size === 1 && kinds.has(k);
  if (only("browser_act")) return "The agent's browser waits for your yes. Approve runs exactly this in its browser; Dismiss tells the agent it was not done.";
  if (only("desktop_act")) return "An app on your desktop waits for your yes. Approve runs exactly this; Dismiss tells the agent it was not done.";
  return `${reviews.length > 1 ? "These steps wait" : "This step waits"} for your yes. Approve runs exactly what is shown; Dismiss tells the agent it was not done.`;
};

export const proposalPresentation = (review) => {
  if (review?.Kind !== "action") return null;
  const proposal = proposalFrom(review);
  const co = closeoutOf(review);
  // A TRACKER ITEM'S CLOSE-OUT (2026-10-25): where it goes, and the done state the tracker itself names - or, where it names none or its
  // workflow has no move there, that it is the comment alone, said before the press
  if (co && proposal.action === "close_item") {
    const sys = TRACKER[proposal.tracker] || t("the tracker"), item = proposal.item || t("the item");
    const at = t("{item} in {system}", { item: proposal.item || "", system: sys });
    return {
      kind: "closeout",
      title: review.Title || review.Subject || t("Close {item} in {system}", { item, system: sys }),
      context: proposal.no_done ? t("The agent finished · {reason}, so {action} posts the comment alone", { reason: proposal.no_done, action: approve() })
        : t("The agent finished · {action} comments on {item} and moves it to {status}", { action: approve(), item, status: proposal.status || t("done") }),
      destinationLabel: t("Close"),
      destination: proposal.no_done ? t("{destination} · comment only", { destination: at }) : t("{destination} → {status}", { destination: at, status: proposal.status || t("its done state") }),
      approveLabel: co.label,
      then: proposal.no_done ? t("posts the comment on {destination}", { destination: at }) : t("posts the comment on {destination} and moves it to {status}", { destination: at, status: proposal.status || t("done") }),
      busyLabel: co.busy,
      rejectLabel: co.reject,
      alt: null,
      placeholder: proposal.no_done ? t("Write the comment to post") : t("No comment - only the move to done"),
    };
  }
  if (proposal?.action === "publish_skill") return {
    kind: "skill", title: t("Review complete Skill package"), context: t("Only the reviewed package revision will be published."),
    destinationLabel: t("Publish to"), destination: t("Taskuary Skills and compatible local Agents"),
    approveLabel: t("Approve and publish"), busyLabel: t("Publishing…"), rejectLabel: t("Discard draft"), readOnly: true,
  };
  if (co) {
    const pr = proposal.action === "merge_pr";
    return {
      kind: "closeout",
      title: review.Title || review.Subject || (pr ? t("Merge the pull request") : t("Close the issue")),
      context: pr ? t("The agent finished · the task closes when pull request #{number} merges, or you close it", { number: proposal.number || "" })
        : t("The agent finished · the task closes with the issue"),
      destinationLabel: pr ? t("Merge") : t("Close"),
      destination: pr ? `${proposal.repo || ""}#${proposal.number || ""}` : t("the GitHub issue this task came from"),
      approveLabel: co.label,
      then: co.then,
      busyLabel: co.busy,
      rejectLabel: co.reject,
      alt: co.alt || null,
      placeholder: pr ? t("No summary - GitHub writes the merge message") : t("No comment - the reply carries it"),
    };
  }
  if (PAGES.has(proposal?.action)) {
    const title = String(proposal.text || "").match(/^#\s+(.+)$/m)?.[1]?.trim();
    // "new" (or none) is filed under its TITLE (playbooks.write -> slugify), so that is the file it names: the card said new.md
    // over a W-9 playbook the approve then saved as send-our-w-9-to-a-customer-who-asks.md (walk 2026-10-21)
    const given = String(proposal.slug || "").trim();
    const slug = (given && given !== "new" ? given : slugify(title)) || "playbook";
    const amend = proposal.action === "amend_playbook";
    return {
      kind: "playbook",
      title: title ? t("Playbook · {title}", { title }) : t("New playbook"),
      context: amend ? t("What the outcome ledger counted about this kind of work, added to its playbook · nothing is sent")
        : t("Playbook proposal · nothing will be sent to the conversation"),
      destinationLabel: t("Save to"),
      destination: t("Reports → Playbooks → {slug}.md", { slug }),         // where playbooks live (PlaybookShelf.jsx)
      approveLabel: approve(),
      busyLabel: t("saving…"),
      rejectLabel: t("Discard proposal"),
    };
  }
  // A TOOL RUN IN WORDS (the owner, 2026-10-21): what it will write, send or run, and where - never the proposal's JSON. The
  // sentence with the connection's own name is the server's (proposals.tool_words, the review's Reason); this is the place and the
  // content, read-only - an edit to them was never what ran (proposals.execute runs the proposal as queued)
  if (proposal?.action === "run_tool") return {
    kind: "action",
    title: proposal.flow_run ? t("A routine step waits for your yes") : t("Run a step in a connected system"),
    context: review.Reason || t("Proposed action · nothing will be sent to the conversation"),
    destinationLabel: t("Where"),
    destination: toolWhere(proposal),
    approveLabel: approve(),
    busyLabel: t("running…"),
    rejectLabel: t("Dismiss", {}, "task-action"),
    readOnly: true,
  };
  // A HELD BROWSER ACT (browsergate.py, 2026-10-25): what the agent's browser would do and on which page, in words - Approve runs that
  // exact command there, so the words are read-only like a tool run's
  if (proposal?.action === "browser_act") return {
    kind: "action",
    title: t("The agent's browser waits for your yes"),
    context: review.Reason || t("Held before it ran · it can't be undone"),
    destinationLabel: t("On"),
    destination: proposal.url || proposal.site || t("the agent's browser"),
    approveLabel: approve(),
    busyLabel: t("running…"),
    rejectLabel: t("Dismiss", {}, "task-action"),
    readOnly: true,
  };
  // ...AND A HELD SHELL STEP (shellgate.py, the owner 2026-10-28): a push, a merge, a public post, a publish or a mail the agent tried to
  // run - Approve runs that exact command in the folder it was held in
  if (proposal?.action === "shell_act") return {
    kind: "action",
    title: t("The agent's step waits for your yes"),
    context: review.Reason || t("Held before it ran · {why}", { why: proposal.why || t("it leaves this computer") }),
    destinationLabel: t("In"),
    // a delete names the folder it aims at (shellgate.deletes): a general agent's own scratch folder told the owner nothing (2026-11-03)
    destination: proposal.where || proposal.cwd || t("the agent's folder"),
    approveLabel: approve(),
    busyLabel: t("running…"),
    rejectLabel: t("Dismiss", {}, "task-action"),
    readOnly: true,
  };
  // ...AND A HELD DESKTOP ACT (agentdesktop.py, 2026-10-31): what an app on the owner's desktop would do - Approve runs that exact command
  if (proposal?.action === "desktop_act") return {
    kind: "action",
    title: t("The agent's desktop step waits for your yes"),
    context: review.Reason || t("Held before it ran · it can't be undone"),
    destinationLabel: t("On"),
    destination: t("an app on your desktop"),
    approveLabel: approve(),
    busyLabel: t("running…"),
    rejectLabel: t("Dismiss", {}, "task-action"),
    readOnly: true,
  };
  if (proposal?.action === "repair_workflow") return {
    kind: "action",
    title: t("Repair this routine's steps"),
    context: t("A step failed · the AI wrote a fix · the steps change only if you approve"),
    destinationLabel: t("Changes"),
    destination: t("the routine's saved steps"),
    approveLabel: approve(),
    busyLabel: t("saving…"),
    rejectLabel: t("Dismiss", {}, "task-action"),
  };
  return {
    kind: "action",
    title: review.Subject || review.Title || t("Proposed action"),
    context: t("Proposed action · nothing will be sent to the conversation"),
    destinationLabel: t("Action"),
    destination: proposal?.action ? String(proposal.action).replaceAll("_", " ") : t("proposed action"),
    approveLabel: approve(),
    busyLabel: t("running…"),
    rejectLabel: t("Dismiss", {}, "task-action"),
  };
};

// The DB's own word for a verdict is not a sentence in English: the queue's chip printed
// "closed_unsent" and "no_reply" straight out of the row (2026-09-10 audit). An unknown status still
// shows rather than disappearing - a blank chip would hide a state nobody has named yet.
export const REVIEW_STATUS = {
  pending: "waiting on you", held: "on hold", approved: "sent", edited: "edited & sent",
  rejected: "rejected", no_reply: "no reply needed", closed_unsent: "closed without sending",
  superseded: "overtaken",
};
export const reviewStatusLabel = (status) => REVIEW_STATUS[status] ? t(REVIEW_STATUS[status]) : String(status || "").replace(/_/g, " ");
