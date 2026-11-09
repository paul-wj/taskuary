// Button and Advisor mappings preserve the action attached to a row across renamed verbs.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ALL_LABELS, REMOVED, VERBS, hint, label, labelOfRow, liveVerb, rowsOf, verbOfRow } from "../src/buttons.js";
import { advisedAny, advisedIn, rowOf } from "../src/actionRow.js";
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

// THE ADVISOR FILLS THE REAL BUTTON: its verb (advisor.py) is not the task page's id - close/done, defer/remind, stop_agent/save-end -
// and matching only ids drew a second button beside the real one. buttons.json's `row` lists are the map.
test("the Advisor's verb finds the task page's own button for the same act, by buttons.json's row ids", () => {
  const list = [v("reply", "decide", { tone: "p" }), v("redraft", "decide"), v("continue", "agent"), v("save-end", "agent"), v("start-agent", "agent"),
    v("done", "more"), v("remind", "more"), v("close-note", "more"), v("nat", "more"), v("hand", "more"), v("reshape", "more"), v("next", "next")];
  for (const [verb, id] of [["close", "done"], ["defer", "remind"], ["stop_agent", "save-end"], ["regular_agent", "start-agent"], ["redraft", "redraft"],
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


