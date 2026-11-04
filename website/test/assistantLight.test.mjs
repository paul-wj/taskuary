// The Assistant is a router (the owner, 2026-10-19: "it should just surface the correct button"): a typed act comes back as the row's
// own button, lit - never a card to confirm, never a button of its own, and nothing runs until the owner presses it.
import test from "node:test";
import assert from "node:assert/strict";
import { lightOf, litAfter, litOn, litPick, litPull } from "../src/assistantLight.js";
import { rowOf } from "../src/actionRow.js";
import { label } from "../src/buttons.js";


test("\"mark this done\" fills the row's own Mark done and adds no button", () => {
  const lit = lightOf({ verb: "close", label: label("close"), key: "msg:4", tid: 7 });
  const v = (id, l, extra = {}) => ({ id, label: l, group: "decide", tone: "s", ...extra });
  const list = [v("reply", label("reply")), v("done", label("close"), { group: "more" }), v("remind", label("defer"), { group: "more" }), v("next", label("next"), { group: "next" })];
  const row = rowOf({ list, ref: "TQ-0007" }, litPick(lit, { key: "msg:4", tid: 7 }));
  const all = [...row.decide, ...row.agent, ...row.more];
  assert.deepEqual(all.filter((x) => x.tone === "p").map((x) => x.id), ["done"]);
  assert.equal(all.length, list.length - 1, "the same buttons - Next aside - and not one more");
});

test("the light lands on its item - by key, or by its task - and goes out when the table moves on", () => {
  const lit = lightOf({ verb: "defer", label: label("defer"), key: "task:12", tid: 12 });
  assert.equal(litPull(lit, { key: "msg:3", tid: 3 }), "task:12", "not on the table: brought up the rail's road");
  assert.equal(litPick(lit, { key: "msg:3", tid: 3 }), null);
  const up = { key: "msg:40", tid: 12 };                    // the task came up as its mail's row
  assert.ok(litOn(lit, up)); assert.equal(litPull(lit, up), null);
  const landed = litAfter(lit, up);
  assert.equal(landed.landed, true);
  assert.deepEqual(litPick(landed, up), { verb: "defer", label: label("defer"), line: "" });
  assert.equal(litAfter(landed, { key: "msg:41", tid: 13 }), null, "another item puts it out");
  assert.equal(litAfter(lit, { key: "msg:41", tid: 13 }), lit, "...but not before it has landed");
  assert.equal(lightOf(null), null);
  assert.equal(litPick(lightOf({ verb: "", key: "task:12", tid: 12 }), up), null, "brought up with nothing to light");
});


// THE LIT BUTTON IS THE WHOLE ANSWER (the owner, 2026-10-23: "what the heck is Lit"): no "Lit Mark done on TQ-0026." line in the chat and
// no "Press Mark done when you're sure." over the row - the filled button says it. A strip line is drawn only when a light carries one
test("a lit button says no line, in the chat or over the row", () => {
  const lit = lightOf({ verb: "close", label: label("close"), key: "msg:4", tid: 7 });
  assert.equal(lit.line, ""); assert.equal(litPick(lit, { key: "msg:4", tid: 7 }).line, "");
});


test("the setting the Assistant names opens with its knob outlined", async () => {
  const { canvasRequestFromHash } = await import("../src/canvasLinks.js");
  assert.deepEqual(canvasRequestFromHash("#settings=config&group=Sync%20%26%20startup&key=poll_minutes").state,
    { section: "config", open: "Sync & startup", knob: "poll_minutes" });
});

// REMIND ME'S SAID DAY (the owner, 2026-10-27): "remind me Monday" lit Remind me and its picker had no Monday, while the phone kept it.
// The day rides the light to the row's pick, the task view keeps it at the press, and the picker leads with it.
test("the day typed with Remind me rides the light into the picker as its first button", () => {
  const day = { until: "2026-11-02 07:00", day: "Mon 2 Nov" };
  const l = lightOf({ verb: "defer", label: "Remind me", key: "task:4", tid: 4, day });
  assert.deepEqual(l.day, day);
  assert.deepEqual(litPick(l, { key: "task:4", tid: 4 }).day, day, "the row's pick carries it");
  assert.equal(lightOf({ verb: "close", key: "task:4", tid: 4, day }).day, undefined, "only Remind me carries a day");
  assert.equal(lightOf({ verb: "defer", key: "task:4", tid: 4 }).day, undefined, "no day said, none carried");
  assert.equal(litPick(lightOf({ verb: "defer", key: "task:4", tid: 4 }), { key: "task:4" }).day, undefined);
});

// HAND IT TO A PERSON, ASKED FOR IN WORDS (the owner, 2026-11-03: "This should be sent to <an address>" did nothing): the light carries who
// and a note, the task view opens the form with them in it, and the form drafts the forward at once - Send is still the owner's press.
test("the person and note typed with Hand it to a person ride the light into its form", () => {
  const hand = { to: "gail@vendor.example", note: "Yours from here." };
  const l = lightOf({ verb: "forward", label: "Hand it to a person", key: "msg:5", tid: 31, hand });
  assert.deepEqual(l.hand, hand);
  assert.deepEqual(litPick(l, { key: "msg:5", tid: 31 }).hand, hand, "the row's pick carries it");
  assert.equal(lightOf({ verb: "close", key: "msg:5", tid: 31, hand }).hand, undefined, "only Hand it to a person carries one");
  assert.equal(lightOf({ verb: "forward", key: "msg:5", tid: 31, hand: { note: "x" } }).hand, undefined, "no person, nothing to fill");
});
