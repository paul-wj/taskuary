// Button and Advisor mappings preserve the action attached to a row across renamed verbs.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ALL_LABELS, REMOVED, VERBS, hint, label, labelOfRow, liveVerb, rowsOf, verbOfRow } from "../src/buttons.js";
import { advisedAny, advisedIn, rowOf } from "../src/actionRow.js";
const SRC = path.join(process.cwd(), "src");
const files = fs.readdirSync(SRC).filter((f) => /\.(jsx?|mjs)$/.test(f) && f !== "buttons.js");
const strip = (s) => s.replace(/(^[ \t]*|\{)\/\*[\s\S]*?\*\/(?=\})?/gm, "").replace(/(^|\s)\/\/[^\n]*/g, "$1");
const said = (code) => [...code.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`|>\s*([^<>{}\n]+?)\s*</g)]
  .map((m) => m[1] ?? m[2] ?? (m[3]?.includes("${") ? "" : m[3]) ?? m[4]);
import { t } from "../src/i18n.js";

const json = JSON.parse(fs.readFileSync(path.join(process.cwd(), "..", "taskuary", "buttons.json"), "utf8"));
const v = (id, group, extra = {}) => ({ id, group, tone: "s", label: labelOfRow(id) || id, title: "", disabled: false, why: "", promote: true, lead: false, ...extra });

test("buttons.js reads buttons.json: one label, its state words, its hint, the row ids", () => {
  assert.equal(label("close"), t(json.verbs.close.label));
  assert.equal(label("approve", "action"), t(json.verbs.approve.states.action));
  assert.equal(label("redraft", "none"), t(json.verbs.redraft.states.none));
  assert.equal(label("redraft", "nope"), t(json.verbs.redraft.label), "an unknown state is the label");
  assert.equal(hint("defer"), t(json.verbs.defer.hint));
  assert.equal(hint("approve", "action"), t(json.verbs.approve.state_hints.action));
  for (const [verb, b] of Object.entries(json.verbs)) for (const r of b.row) { assert.equal(verbOfRow(r), verb); assert.equal(labelOfRow(r), t(b.label)); }
  assert.equal(verbOfRow("12:approve"), "approve", "a draft's own `<rid>:verb` id");
  assert.equal(verbOfRow("kind"), "change_kind", "the task page's pickers are on the list too (the dead-end walk's NAMES, 2026-10-18)");
  assert.equal(verbOfRow("no-such-row"), null);
  assert.deepEqual(rowsOf("regular_agent"), ["start-agent", "send-general"]);
  for (const b of Object.values(json.verbs)) { assert.ok(ALL_LABELS.includes(b.label)); for (const s of Object.values(b.states || {})) assert.ok(ALL_LABELS.includes(s)); }
  assert.equal(ALL_LABELS.length, new Set(ALL_LABELS).size);
});

test("a removed verb is never drawn: an old word lands on the verb it became, Prep me on nothing", () => {
  assert.deepEqual(REMOVED, { prep: null, later: "defer", skip: "defer", archive: "not_ours", done: "close", ask_sender: "reply", assign: "regular_agent" });
  assert.equal(liveVerb("assign"), "regular_agent", "Assign it is gone (the owner, 2026-11-01): who works a task is the Agent section's Send to agent");
  assert.equal(liveVerb("ask_sender"), "reply", "Ask sender is gone (the owner, 2026-10-27): a question for the sender is a Reply");
  assert.equal(liveVerb("later"), "defer"); assert.equal(liveVerb("done"), "close"); assert.equal(liveVerb("prep"), null);
  assert.equal(label("skip"), label("defer")); assert.equal(label("prep"), "");
  for (const r of Object.keys(REMOVED)) assert.ok(!(r in VERBS), r);
});

// THE ADVISOR FILLS THE REAL BUTTON: its verb (advisor.py) is not the task page's id - close/done, defer/remind -
// and matching only ids drew a second button beside the real one. buttons.json's `row` lists are the map.
test("the Advisor's verb finds the task page's own button for the same act, by buttons.json's row ids", () => {
  const list = [v("reply", "decide", { tone: "p" }), v("redraft", "decide"), v("continue", "agent"), v("start-agent", "agent"),
    v("done", "more"), v("remind", "more"), v("close-note", "more"), v("nat", "more"), v("hand", "more"), v("reshape", "more"), v("next", "next")];
  for (const [verb, id] of [["close", "done"], ["defer", "remind"], ["regular_agent", "start-agent"], ["redraft", "redraft"],
    ["reply", "reply"], ["continue", "continue"], ["close_note", "close-note"], ["remove", "nat"], ["forward", "hand"], ["split", "reshape"]]) {
    const pick = { verb, label: label(verb) };
    assert.equal(advisedIn(list, pick)?.id, id, `${verb} -> ${id}`);
    assert.equal(advisedAny(list, pick)?.id, id, `${verb}: found, so the Advisor adds no button of its own`);
    const r = rowOf({ ref: "", list }, pick), all = [...r.decide, ...r.agent, ...r.more];   // filled where it stands, More included
    assert.equal(all.filter((x) => x.tone === "p").map((x) => x.id).join(), id, `${verb}: the real button is the filled one`);
    assert.ok(!all.some((x) => String(x.id).startsWith("advice:")));
  }
  assert.equal(advisedIn([v("send-general", "agent")], { verb: "regular_agent" })?.id, "send-general");
  // an old saved pick of a removed verb still lands on the live button; Prep me on none
  assert.equal(advisedIn(list, { verb: "done" })?.id, "done");
  assert.equal(advisedIn(list, { verb: "later" })?.id, "remind");
  assert.equal(advisedIn(list, { verb: "prep", label: "Prep me" }), null);
  // a draft's own `<rid>:` buttons: Mark done is the advisor's close, and an advised Send is never a Redraft that keeps the approve id
  const draft = [v("12:approve", "decide", { label: label("redraft"), card: true }), v("12:done", "decide", { closes: true })];
  assert.equal(advisedIn(draft, { verb: "close", label: label("close") })?.id, "12:done");
  assert.equal(advisedIn(draft, { verb: "approve", label: label("approve") }), null, "Redraft is not Send");
  assert.equal(advisedIn([v("12:approve", "decide", { label: label("approve", "action") })], { verb: "approve" })?.id, "12:approve", "Approve sends a proposal");
});


test("no removed or second name for a button is left where a person can read it", () => {
  const gone = ["Prep me", "Snooze", "Make a task", "Make task", "Take it myself", "Redraft it", "Run it", "Merge & close", "Continue session", "Close out",
    "Archive it", "Handled", "Draft a follow-up", "Hand to agent", "Hand to coding agent", "Regular agent", "A non-coding agent", "Silence this sender",
    "Block them in Settings", "Send back to the agent", "Continue the agent", "Refresh the draft", "Refresh draft", "Mark it handled", "Test the connection",
    "Run the report again", "Send the answer to the agent", "Write reply", "Start an agent", "Start another agent", "Send to non-coding agent",
    "Use non-coding agent", "Start coding session", "Approve & send", "Run action", "Save playbook", "Draft a reply", "Check again"];
  const hits = [], heading = { "TaskPage.jsx": ["Close out"], "taskLayout.js": ["Close out"] };   // the task page's third section is named Close out - a heading, no button
  for (const f of files) for (const s of said(strip(fs.readFileSync(path.join(SRC, f), "utf8"))))
    if (gone.includes(s.trim()) && !(heading[f] || []).includes(s.trim())) hits.push(`${f}: "${s.trim()}"`);
  assert.deepEqual(hits, []);
  const code = files.map((f) => strip(fs.readFileSync(path.join(SRC, f), "utf8"))).join("\n");
  assert.doesNotMatch(code, /verb === "prep"|\/api\/calendar\/prep/, "Prep me is gone, its road too");
  assert.doesNotMatch(code, /\bshortLabel\b/, "no second, shorter name for the bar");
});

// NOT FOR ME ASKS HOW FAR ON THE DESK TOO (the owner, 2026-11-10: "yes on 1"): the phone's answers (buttons.json `choices`) in a small menu
// under the pressed button, one press to pick; the answer runs once as its own verb and nothing is carried onto the next item
test("Not for me asks how far from its own choices, under the button pressed", async () => {
  const { howFar, CHOICES } = await import("../src/buttons.js");
  assert.deepEqual(howFar({ kind: "idea", idea: 4 }).map(([v]) => v), ["not_ours", "not_ours_kind"]);
  assert.deepEqual(howFar({ kind: "fyi", mid: 9 }).map(([v]) => v), CHOICES.not_ours.map(([v]) => v));
  assert.deepEqual(howFar({ kind: "todo", tid: 3 }), [], "a task has no sender to ask about: it runs as pressed");
  const view = (await import("node:fs")).readFileSync(new URL("../src/AssistantView.jsx", import.meta.url), "utf8");
  assert.match(view, /run: \(e, a\) => onChip\(c, undefined, a \|\| e\?\.currentTarget\)/);
  assert.match(view, /if \(liveVerb\(c\.verb\) === "not_ours" && !c\.how && at && howFar\(item\)\.length > 1\) \{ setHowOn\(\{ at, c, how: howFar\(item\) \}\); return; \}/);
  assert.match(view, /<Menu open anchorEl=\{howOn\.at\}/);
  assert.match(view, /onClick=\{\(\) => \{ const h = howOn; setHowOn\(null\); runChip\(\{ \.\.\.h\.c, verb, how: true \}\); \}\}/);
});
