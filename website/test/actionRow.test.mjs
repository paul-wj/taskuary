// THE ACTION ROW (layout B): what it draws is decided by rowOf from the verbs the item on the table registered. These pin the
// promises the owner asked for (2026-09-30, 2026-10-17): one filled button at most and only the Advisor's pick, a greyed decision
// says why, Mark done leads when nothing else waits, and a press calls the card's LATEST handler.
import test from "node:test";
import assert from "node:assert/strict";
import { leaveRow, press, put, rowNow, rowOf, rowTable } from "../src/actionRow.js";
import { getLocale, setLocale } from "../src/i18n.js";

const v = (id, group, extra = {}) => ({ id, group, tone: "s", label: id, title: "", disabled: false, why: "", promote: true, lead: false, ...extra });
const filled = (r) => [...r.decide, ...r.agent, r.next].filter((x) => x && x.tone === "p").map((x) => x.id);

// NOTHING DARK UNTIL THE ADVISOR ANSWERS (the owner, 2026-10-17: "nothing dark until advisor ... keep it ai"): the row's own
// fallbacks - a card's filled tone, Mark done when nothing waits, the way back into a session, Next - are all outlined
test("no advice: a decision waiting is outlined, Next is outlined beside it - nothing on the row is dark", () => {
  const r = rowOf({ ref: "TQ-1", list: [v("approve", "decide", { tone: "p", label: "Close out" }), v("alt", "decide"), v("done", "more"), v("next", "next")] });
  assert.deepEqual(filled(r), []); assert.equal(r.primary, null);
  assert.equal(r.next.tone, "s");
  // Mark done stays on the bar, outlined, beside the decision (the owner, 2026-10-06: "next to next on every single task")
  assert.deepEqual(r.agent.map((x) => [x.id, x.tone]), [["done", "s"]]); assert.deepEqual(r.more, []);
  // ...and advised, the decision is the one dark button
  assert.deepEqual(filled(rowOf({ ref: "TQ-1", list: [v("approve", "decide", { tone: "p", label: "Send" }), v("done", "more"), v("next", "next")] },
    { verb: "approve", label: "Send" })), ["approve"]);
});

test("nothing to decide: Mark done leads the bar, outlined until the Advisor picks it", () => {
  const list = [v("done", "more"), v("nat", "more"), v("next", "next")];
  const r = rowOf({ ref: "", list });
  assert.deepEqual(filled(r), []);
  assert.deepEqual(r.decide.map((x) => x.id), ["done"]);
  assert.deepEqual(r.more.map((x) => x.id), ["nat"]);
  assert.deepEqual(filled(rowOf({ ref: "", list }, { verb: "close", label: "Mark done" })), ["done"]);
});

test("the way back into an agent's session leads, outlined, and Mark done stands outlined beside it - not behind More", () => {
  const r = rowOf({ ref: "", list: [v("continue", "agent", { lead: true }), v("done", "more"), v("next", "next")] });
  assert.deepEqual(filled(r), []);
  assert.deepEqual(r.agent.map((x) => [x.id, x.tone]), [["continue", "s"], ["done", "s"]]);
  assert.ok(!r.more.some((x) => x.id === "done"));
});

test("a live session: Mark done is not promoted, and Next is outlined too", () => {
  const r = rowOf({ ref: "", list: [v("diff", "agent"), v("done", "more", { promote: false }), v("next", "next")] });
  assert.deepEqual(filled(r), []);
  assert.ok(r.agent.some((x) => x.id === "done" && x.tone === "s") && !r.more.some((x) => x.id === "done"));
});

test("a greyed decision says WHY, in the row, and nothing fills in its place", () => {
  const r = rowOf({ ref: "TQ-1", list: [v("approve", "decide", { tone: "p", label: "Close out", disabled: true, why: "write the reply first" }), v("next", "next")] });
  assert.ok(r.why.includes("Close out") && r.why.includes("write the reply first"));
  assert.deepEqual(filled(r), []);
  assert.equal(rowOf({ ref: "", list: [v("approve", "decide", { tone: "p", label: "Close out" }), v("next", "next")] }).why, "");
});

test("a press calls the card's LATEST handler, not the one it registered first", () => {
  const calls = [];
  put("t", [{ ...v("x", "more"), run: () => calls.push("old") }]);
  put("t", [{ ...v("x", "more"), run: () => calls.push("new") }]);
  press("x");
  put("t", null);
  assert.deepEqual(calls, ["new"]);
  press("x");
  assert.deepEqual(calls, ["new"], "a verb whose card has gone does nothing");
});

// ONE AT A TIME (the overnight walk, 2026-10-27): a double-click on Accept drafted the calendar's answer twice
test("a verb still answering is not run again for the same card, and runs again once it has answered", async () => {
  let n = 0, done;
  put("cal", [{ ...v("accept_invite", "decide"), run: () => { n++; return new Promise((r) => { done = r; }); } }]);
  press("accept_invite"); press("accept_invite");
  assert.equal(n, 1, "the second click of a double-click ran it again");
  done(); await new Promise((r) => setTimeout(r, 0));
  press("accept_invite");
  assert.equal(n, 2, "answered: the next press is a press");
  // ...a verb that answers at once (it opens a menu, a note) is never held
  let m = 0;
  put("cal", [{ ...v("close_note", "decide"), run: () => { m++; } }]);
  press("close_note"); press("close_note");
  assert.equal(m, 2);
  // ...and Next keeps the walk's own rules
  let x = 0;
  put("cal", [{ ...v("next", "next"), run: () => { x++; return new Promise(() => {}); } }]);
  press("next"); press("next");
  assert.equal(x, 2);
  put("cal", null);
});

// A TRIPLE CLICK IS ONE PRESS (the button stress, 2026-11-02): Should be a task answered inside the triple-click, and its third click proposed
// the task again. A hand's clicks of one verb of one card within the repeat window are that press; Next keeps its own rules
test("a hand's second and third click of a verb that answered already run nothing, and a press after the window runs", async () => {
  let n = 0, x = 0;
  const click = { type: "click", isTrusted: true };
  put("fyi", [{ ...v("w:mine", "decide"), run: async () => { n++; } }, { ...v("next", "next"), run: () => { x++; } }]);
  press("w:mine", click); await new Promise((r) => setTimeout(r, 0));
  press("w:mine", click); press("w:mine", click);
  assert.equal(n, 1, "the triple-click ran it again");
  press("next", click); press("next", click);
  assert.equal(x, 2, "Next is the walk's: two presses, two moves");
  await new Promise((r) => setTimeout(r, 500));
  press("w:mine", click);
  assert.equal(n, 2, "a press after the window is a press");
  await new Promise((r) => setTimeout(r, 0));
  press("w:mine", { type: "click", isTrusted: false });
  assert.equal(n, 3, "the page's own click() is a press each time");
  put("fyi", null);
});

test("the row in three: the moves that finish or advance it in one pill, the task's shape in Change, the filled one always in view", async () => {
  const { clustersOf, typeOf } = await import("../src/actionRow.js");
  const row = rowOf({ ref: "", list: [v("reply", "decide", { tone: "p", label: "Write reply" }), v("email", "agent", { label: "Send out results" }),
    v("hand", "more", { label: "Hand it to a person" }), v("continue", "agent", { label: "Continue" }), v("run-another", "agent"),
    v("done", "more"), v("close-note", "more"), v("remind", "more"), v("nat", "more"), v("next", "next")] });
  const g = Object.fromEntries(clustersOf(row).map((c) => [c.type, c]));
  assert.deepEqual(clustersOf(row).map((c) => c.type), ["move", "change"]);
  // ...Mark done, the agent's move, the reply's - then the rest of their families, in that order
  assert.deepEqual(g.move.shown.map((x) => x.id), ["done", "continue", "reply", "email", "hand", "run-another", "close-note"]);
  assert.deepEqual(g.change.shown.map((x) => x.id), ["remind", "nat"], "Remind me first");
  // the Advisor's pick behind the arrow comes into view, filled
  const picked = clustersOf(rowOf({ ref: "", list: [v("continue", "agent", { label: "Continue" }), v("diff", "agent"), v("run-another", "more", { label: "Run another agent" })] },
    { verb: "run_another", label: "Run another agent" }));
  assert.equal(typeOf({ id: "run-another" }), "agent");
  assert.ok(picked[0].shown.some((x) => x.id === "run-another" && x.tone === "p"));
  assert.equal(typeOf({ id: "123:approve" }), "reply");                 // a draft's own verbs, by the act
  assert.equal(typeOf({ id: "w:Make a task" }), "act");                  // a card's own words lead, unlabelled
});

test("a card's own <Button> is read into a row verb: its label, handler, disabled flag and ONE filled tone", async () => {
  const { default: React } = await import("react");
  const { movesOf } = await import("../src/actionRow.js");
  const calls = [];
  const h = React.createElement;
  const node = h(React.Fragment, null,
    h("div", { "data-tq-verb": "open-settings", variant: "contained", onClick: () => calls.push("a"), title: "does a" }, "Open ", "Settings"),
    h("div", { "data-tq-verb": "second", variant: "contained", disabled: true, onClick: () => calls.push("b") }, "Second"),
    h("div", { "data-tq-verb": "join", variant: "outlined", href: "https://example.test/join" }, "Join"),
    h("div", { "data-tq-verb": "no-handler", variant: "outlined" }, "No handler"));
  const v = movesOf(node);
  assert.deepEqual(v.map((x) => [x.label, x.tone, x.disabled]), [["Open Settings", "p", false], ["Second", "s", true], ["Join", "s", false]]);
  v[0].run({}); v[1].run({});
  assert.deepEqual(calls, ["a", "b"], "the card's own handler runs; nothing is re-implemented");
});


// TWO WAYS TO CLOSE, ONE PLACE (the owner, 2026-10-05: "why is close with note not inside the more.. menu but mark done is in the
// menu?"): Close with a note is Mark done with words, so it stands right after Mark done wherever Mark done stands.
test("close with a note stands beside Mark done on the bar when a decision is waiting", () => {
  const r = rowOf({ ref: "TQ-1", list: [v("reply", "decide", { tone: "p" }), v("done", "more"), v("close-note", "more"), v("nat", "more"), v("next", "next")] });
  assert.deepEqual(r.decide.map((x) => x.id), ["reply"]);
  assert.deepEqual(r.agent.map((x) => x.id), ["done", "close-note"]); assert.deepEqual(r.more.map((x) => x.id), ["nat"]);
});

test("...beside it as the move when nothing else waits, outlined", () => {
  const r = rowOf({ ref: "", list: [v("close-note", "more"), v("done", "more"), v("nat", "more"), v("next", "next")] });
  assert.deepEqual(r.decide.map((x) => [x.id, x.tone]), [["done", "s"], ["close-note", "s"]]);
  assert.deepEqual(r.more.map((x) => x.id), ["nat"]);
});

test("...and beside it next to the way back into a session", () => {
  const r = rowOf({ ref: "", list: [v("continue", "agent", { lead: true }), v("done", "more"), v("close-note", "more"), v("next", "next")] });
  assert.deepEqual(r.agent.map((x) => x.id), ["continue", "done", "close-note"]);
  assert.ok(!r.more.some((x) => x.id === "close-note"));
});


// THE ROW INVENTORY (the owner, 2026-10-05): every Mark done has Close with a note beside it, no word stands twice, and a live
// session's Mark done is on the bar when there is room.
test("close with a note follows a draft's own Mark done too", () => {
  const r = rowOf({ ref: "", list: [v("812:approve", "decide", { tone: "p", label: "Close out" }), v("812:redraft", "decide", { label: "Redraft" }),
    v("812:done", "decide", { label: "Mark done", closes: true }), v("done", "more", { label: "Mark done" }), v("close-note", "more", { label: "Close with a note" }),
    v("nat", "more"), v("next", "next")] });
  assert.deepEqual(r.decide.map((x) => x.id), ["812:approve", "812:redraft", "812:done", "close-note"]);
  assert.ok(!r.more.some((x) => x.id === "close-note"));
});

test("no word stands twice: a word on the bar is not repeated, nor behind More", () => {
  const r = rowOf({ ref: "", list: [v("812:approve", "decide", { tone: "p", label: "Close out" }), v("812:remind", "decide", { label: "Remind me" }),
    v("m:Mark done", "decide", { label: "Mark done" }), v("w:close", "decide", { label: "Mark done" }),
    v("remind", "more", { label: "Remind me" }), v("nat", "more", { label: "Not a task" }), v("next", "next")] });
  const labels = [...r.decide, ...r.agent].map((x) => x.label);
  assert.equal(labels.filter((l) => l === "Mark done").length, 1);
  assert.ok(!r.more.some((x) => x.label === "Remind me"), "Remind me is on the bar already");
  assert.deepEqual(r.more.map((x) => x.label), ["Not a task"]);
});

test("a live session's Mark done stands on the bar, outlined, and Next is outlined too - room or not", () => {
  const live = [v("diff", "agent", { label: "Review changes" }),
    v("run-another", "agent", { label: "Run another agent" }), v("done", "more", { label: "Mark done", promote: false, beside: true }), v("next", "next")];
  const r = rowOf({ ref: "", list: live });
  assert.deepEqual(r.agent.map((x) => x.id), ["diff", "run-another", "done"]);
  assert.equal(r.agent.find((x) => x.id === "done").tone, "s");
  assert.equal(r.next.tone, "s");
  const full = rowOf({ ref: "", list: [v("a1", "agent"), v("a2", "agent"), v("a3", "agent"), v("a4", "agent"), ...live.slice(2)] });
  assert.ok(full.agent.some((x) => x.id === "done") && !full.more.some((x) => x.id === "done"), "never behind More (2026-10-06)");
});

test("a draft waiting under the card holds the move: the bar fills nothing - not Start an agent, not Next", () => {
  // the UX review, 2026-10-07: a drafted reply wore a filled Send on the card AND a filled Start an agent on the bar
  const r = rowOf({ ref: "TQ-3", list: [v("start-agent", "agent", { lead: true }), v("done", "more", { promote: false, onCard: true }), v("next", "next")] });
  assert.deepEqual(filled(r), []);
  assert.equal(r.next.tone, "s");
});

test("how long it has waited on you: owed lanes only, from an hour, in the rail's own bands", async () => {
  const { waitedText } = await import("../src/funnelPile.js");
  const previous = getLocale();
  setLocale("en");
  try {
    const now = Date.parse("2026-10-07T12:00:00"), at = (h) => new Date(now - h * 3600e3).toISOString();
    assert.equal(waitedText({ lane: "blocked", since: at(3) }, now), "waiting 3h");
    assert.equal(waitedText({ lane: "approve", when: at(50) }, now), "waiting 2d");
    assert.equal(waitedText({ lane: "approve", when: at(0.2) }, now), "");
    assert.equal(waitedText({ lane: "report", when: at(5) }, now), "");
    assert.equal(waitedText({ lane: "theirs", when: at(5) }, now), "");
  } finally { setLocale(previous); }
});


// The draft's own Send lives UNDER THE DRAFT only (the owner, 2026-10-22, reversing the bar's copy of 2026-10-19), and the bar keeps no
// empty slot for it (2026-10-25: "we should not have empty space here"). Advised, it is lit on the card, the bar unchanged.
test("the draft's own Send is never on the bar and leaves no empty slot; advised it is lit on the card, the bar unchanged", async () => {
  const { advisedAny, advisedIn, clustersOf, holdsMove } = await import("../src/actionRow.js");
  const list = [v("12:approve", "decide", { tone: "p", label: "Send", card: true }), v("12:redraft", "decide", { label: "Redraft", card: true }),
    v("remind", "more", { label: "Remind me" }), v("done", "more", { promote: false, onCard: true, label: "Mark done" }), v("next", "next")];
  assert.ok(holdsMove(list));
  assert.equal(advisedAny(list, { verb: "approve", label: "Send" })?.id, "12:approve", "found, so no advice:approve is drawn");
  assert.equal(advisedIn(list, { verb: "approve", label: "Send" })?.id, "12:approve", "the Advisor's line finds the Send under the draft");
  const quiet = rowOf({ ref: "", list });
  assert.deepEqual([...quiet.decide, ...quiet.agent, ...quiet.more].filter((x) => x.card).map((x) => x.id), [], "no card verb on the bar - not Send, not Redraft");
  assert.ok(![...quiet.decide, ...quiet.agent, ...quiet.more].some((x) => x.slot || String(x.id).startsWith("slot:")), "no empty slot on the bar");
  // ...in the reply group, where the Send stood, and never behind ▾
  const reply = clustersOf(quiet).find((g) => g.type === "reply");
  assert.ok(!clustersOf(quiet).some((g) => [...g.shown, ...g.rest].some((x) => x.slot)), reply ? "the reply group holds only real buttons" : "");
  assert.deepEqual(filled(quiet), []);
  const sent = rowOf({ ref: "", list }, { verb: "approve", label: "Send" }), ids = (r) => [...r.decide, ...r.agent, ...r.more].map((x) => x.id);
  assert.deepEqual(filled(sent), []); assert.equal(sent.lit, "12:approve", "lit where it stands, under the draft"); assert.equal(sent.next.tone, "s");
  assert.equal(rowOf({ ref: "", list }, { verb: "redraft", label: "Redraft" }).lit, "12:redraft", "a card verb with no slot is lit on the card");
  assert.deepEqual(ids(sent), ids(quiet), "the bar is the same with and without the advice");
  const later = rowOf({ ref: "", list }, { verb: "defer", label: "Remind me" });
  assert.deepEqual(later.more.filter((x) => x.tone === "p").map((x) => x.id), ["remind"], "an advised Remind me is filled where it stands");
  assert.deepEqual(ids(later), ids(quiet)); assert.equal(later.lit, "");
});


// issue 263 / the UI audit (2026-10-21): two mounted copies of one card registered under one name, cleared each other's verbs on
// every put, re-drew each other forever and React stopped the app (#185). Each copy is now its own owner, and the row shows one
// button per id however many copies carry it.
test("two copies of a card carrying the same verb show one button, and either going leaves the other's", () => {
  const v = (n) => ({ id: "t263:send", label: "Send", group: "decide", run: () => n });
  put("t263-card:r1:", [v(1)]); put("t263-card:r2:", [v(2)]);
  assert.equal(rowNow().list.filter((x) => x.id === "t263:send").length, 1);
  put("t263-card:r2:", null);
  assert.equal(rowNow().list.filter((x) => x.id === "t263:send").length, 1);
  put("t263-card:r1:", null);
  assert.equal(rowNow().list.filter((x) => x.id === "t263:send").length, 0);
});


// THE LIT BUTTON FOLLOWS THE LINE (the UI audit's C2, 2026-10-21) - and nothing darkens itself: the one that did, a running agent's Stop
// and save, is gone (the owner, 2026-11-10: "no need for stop and save button"); the x on the running turn stops it
test("no verb on a working agent's row fills itself; a line lights its own move", () => {
  const list = [v("diff", "agent", { fill: true }), v("done", "more", { promote: false }), v("next", "next")];
  assert.deepEqual(filled(rowOf({ ref: "", list })), [], "nothing said: nothing filled");
  assert.deepEqual(filled(rowOf({ ref: "", list }, { verb: "next" })), ["next"], "'it says when it needs you': Next, and only Next");
  assert.deepEqual(filled(rowOf({ ref: "", list }, { verb: "ai" })), [], "'Connect an AI': its own chip is the move, nothing on the row");
});

// SWITCHING TASKS (the owner, 2026-10-26: "fix switching tasks thing of course"): the old task's Send stood on the row under the next task
// until its card's cleanup ran. The row draws a card's verbs only while the table is its item, and none of the item a press is leaving
test("the row draws only the table's own verbs: another item's go the moment the table moves, and a press that fails gives them back", () => {
  const ran = [];
  put("card:a", [{ id: "approve", group: "decide", label: "Send", run: () => ran.push("a") }], "TQ-0001", "task:1");
  put("next:x", [{ id: "next", group: "next", label: "Next", run: () => {} }]);
  const ids = () => rowNow().list.map((x) => x.id);
  rowTable("task:1");
  assert.deepEqual(ids(), ["approve", "next"]);
  assert.equal(rowNow().list[0].at, "task:1", "a button says which item it was drawn for");
  leaveRow("task:1");
  assert.deepEqual(ids(), ["next"], "a press moving on: Next alone, nothing of the item it leaves");
  leaveRow(null);
  assert.deepEqual(ids(), ["approve", "next"], "the press failed: its buttons are back");
  rowTable("task:2");
  assert.deepEqual(ids(), ["next"], "the table moved: the old card, still mounted, draws nothing");
  // ...and the new card's Send, registered before the old one let go of the same id, is the one drawn and the one a press runs
  put("card:b", [{ id: "approve", group: "decide", label: "Send", run: () => ran.push("b") }], "TQ-0002", "task:2");
  put("card:a", [{ id: "approve", group: "decide", label: "Send", run: () => ran.push("a") }], "TQ-0001", "task:1");
  const send = rowNow().list.find((x) => x.id === "approve");
  assert.equal(send.at, "task:2");
  assert.equal(rowNow().ref, "TQ-0002");
  press("approve", null, null, send.of);
  assert.deepEqual(ran, ["b"], "the press acts on the task on the table, never the one put down");
  for (const o of ["card:a", "card:b", "next:x"]) put(o, null);
  rowTable(null);
});

// TWO COPIES OF ONE CARD (the chat-model stress run, 2026-11-05): a draft's card under the turn that drafted it and under the turn after it,
// both mounted for a moment, each re-putting the same verbs on every render. The ids went from one to the other and back at each put, every
// redraw rendered both again, and the task page went down with "Maximum update depth exceeded". The same verbs again change nothing.
test("the same verbs put again by two copies of a card settle: no redraw, the press still reaches the latest handler", () => {
  const hit = [];
  const mk = (who) => [v("approve:7", "decide", { label: "Send", run: () => hit.push(who) }), v("attach", "more")];
  put("copy-a", mk("a1")); put("copy-b", mk("b1"));
  const settled = rowNow();
  for (let i = 2; i < 6; i++) { put("copy-a", mk(`a${i}`)); put("copy-b", mk(`b${i}`)); }
  assert.equal(rowNow(), settled);                                     // nothing new to draw: no redraw, so nothing renders again
  press("approve:7", {}, null, settled.list.find((x) => x.id === "approve:7").of);
  assert.equal(hit.length, 1); assert.match(hit[0], /^[ab]5$/);        // ...and a press runs a handler from the latest render
  put("copy-a", [v("approve:7", "decide", { label: "Sending…", disabled: true })]);
  assert.notEqual(rowNow(), settled);                                  // a change in what the row shows still draws
  put("copy-a", null); put("copy-b", null);
});
