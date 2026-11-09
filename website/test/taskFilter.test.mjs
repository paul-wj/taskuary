import test from "node:test";
import assert from "node:assert/strict";
import {
  completionTransition,
  cutAway,
  filterForSelectedState,
  localStamp,
  nextTaskId,
  remindDay,
  remindWaiting,
} from "../src/taskFilter.js";

// in progress / upcoming / done - one pill per task, no "all" (the owner, 2026-09-25)
test("a selected task that finishes moves the rail from in progress to done", () => {
  assert.equal(filterForSelectedState("live", "done"), "done");
});

test("a task put away with Remind me follows into upcoming, and back when it returns", () => {
  assert.equal(filterForSelectedState("live", "upcoming"), "upcoming");
  assert.equal(filterForSelectedState("upcoming", "working"), "live");
  assert.equal(filterForSelectedState("upcoming", "done"), "done");
});

test("a task reopened under done goes back to in progress; dropped has no pill and moves nothing", () => {
  assert.equal(filterForSelectedState("done", "working"), "live");
  assert.equal(filterForSelectedState("done", "upcoming"), "upcoming");
  assert.equal(filterForSelectedState("live", "dropped"), "live");
});

test("matching buckets are left alone", () => {
  assert.equal(filterForSelectedState("done", "done"), "done");
  assert.equal(filterForSelectedState("live", "working"), "live");
  assert.equal(filterForSelectedState("upcoming", "upcoming"), "upcoming");
});

test("mark done advances to the next in-progress task and never back to the closed task", () => {
  assert.equal(nextTaskId([358, 356, 367], 358), 356);
  assert.equal(nextTaskId([358, 356, 367], 356), 367);
  assert.equal(nextTaskId([358, 356, 367], 367), 356);
  assert.equal(nextTaskId([358], 358), null);
  assert.equal(nextTaskId([356, 367], 358), 356);
  assert.deepEqual(completionTransition([358, 356, 367], 358), {
    next: 356,
    filter: "live",
    seen: { id: 358, key: "done" },
  });
});





// THE CUT BELONGS TO THE ROW. Applying it per pill gave `in progress` a wider window than `all`
// (live work of any age vs today only), so "all 5" sat over "in progress 4 · done 2" and the
// arithmetic could not close (the owner, 2026-09-22: "that doesn't add up?").
test("live work shows at any age; finished work stops at today", () => {
  assert.equal(cutAway("needs_you", false, false), false);   // live, last touched yesterday - still live
  assert.equal(cutAway("working", false, false), false);
  assert.equal(cutAway("queued", false, false), false);
  assert.equal(cutAway("done", false, false), true);         // finished and not today - behind "show older"
  assert.equal(cutAway("dropped", false, false), true);
  assert.equal(cutAway("done", true, false), false);         // finished today - shown
});

test("show older lifts the cut off everything", () => {
  assert.equal(cutAway("done", false, true), false);
  assert.equal(cutAway("dropped", false, true), false);
});

// the rows that prompted it: TQ-0667 and TQ-0664, both `waiting` and both last touched 2026-09-21,
// counted for the in-progress pill and not for all.
test("all is a superset of its own buckets", () => {
  const rows = [{ key: "needs_you", today: false }, { key: "needs_you", today: false },
    { key: "needs_you", today: true }, { key: "done", today: true }, { key: "done", today: false }];
  const shown = (pred) => rows.filter((r) => !cutAway(r.key, r.today, false)).filter(pred).length;
  const all = shown(() => true), done = shown((r) => r.key === "done");
  const live = shown((r) => !["done", "dropped"].includes(r.key));
  assert.equal(live, 3);
  assert.equal(done, 1);
  assert.equal(all, live + done);
});

// Remind me compares local 'YYYY-MM-DD HH:MM:SS' strings, the shape the server writes RemindAt in.
test("localStamp writes local time in the server's RemindAt shape, zero-padded", () => {
  assert.equal(localStamp(new Date(2026, 0, 2, 3, 4, 5)), "2026-01-02 03:04:05");
  assert.equal(localStamp(new Date(2026, 11, 31, 23, 59, 59)), "2026-12-31 23:59:59");
});

test("remindWaiting is true only for an open task whose RemindAt is still ahead", () => {
  const now = "2026-09-28 12:00:00";
  const at = "2026-09-29 07:00:00";
  assert.equal(remindWaiting({ Status: "open", RemindAt: at }, now), true);
  assert.equal(remindWaiting({ Status: "working", RemindAt: at }, now), true);
  assert.equal(remindWaiting({ Status: "done", RemindAt: at }, now), false);
  assert.equal(remindWaiting({ Status: "dropped", RemindAt: at }, now), false);
  assert.equal(remindWaiting({ Status: "open" }, now), false);
  assert.equal(remindWaiting({ Status: "open", RemindAt: "" }, now), false);
  assert.equal(remindWaiting({ Status: "open", RemindAt: now }, now), false);
  assert.equal(remindWaiting({ Status: "open", RemindAt: "2026-09-28 07:00:00" }, now), false);
  assert.equal(remindWaiting(null, now), false);
});

test("remindDay is empty without a day and names the day it has", () => {
  assert.equal(remindDay(""), "");
  assert.equal(remindDay(null), "");
  // a fixed date that is never today: "2026-10-09" was, on 2026-10-09, and read "today at 7:00"
  const expected = new Date(2020, 0, 15).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  assert.equal(remindDay("2020-01-15 07:00:00"), expected);
  assert.ok(remindDay(`${localStamp().slice(0, 10)} 19:05:00`).includes("7:05"));
});
