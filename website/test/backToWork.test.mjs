import { test } from "node:test";
import assert from "node:assert/strict";
import { backToWork, overChat, tableOf, workWords, workedOn } from "../src/tableState.js";

const item = { key: "task:12", tid: 12, ref: "TQ-0012", title: "Renew the vendor.example contract before the quarter ends" };

// the owner, 2026-11-09: "there should always be a button on top corner when you are in settings or reports to go back to the main task
// you were working on, or clear it with the pencil for new chat?"
// ...and 2026-11-09 again: "any task you are on then switch to settings is [the] task" - a link, the Board or an answer's Open as much as the walk
test("the task in view is the one being worked on, however it was opened", () => {
  const onIt = tableOf({ current: "task:12" });
  assert.deepEqual(workedOn(onIt, item), { key: "task:12", tid: 12, ref: "TQ-0012", title: item.title });
  assert.equal(workedOn.length, 2);                                                          // no by-name exclusion to pass
  assert.equal(workedOn(tableOf({ current: "task:12", browsing: "b1" }), item), null);       // a page over it
  assert.equal(workedOn(tableOf({ current: "task:12", foldedKey: "task:12" }), item), null); // put away by its X
  assert.equal(workedOn(tableOf({ current: "fyi:3" }), { key: "fyi:3" }), null);             // an FYI is no task
});

test("a browse page over a remembered task shows Back + the pencil; the task itself shows the pencil only", () => {
  const w = workedOn(tableOf({ current: "task:12" }), item);
  const settings = tableOf({ current: "task:12", browsing: "settings" });
  assert.equal(backToWork(settings, w, 12), true);                                    // Settings over the task
  assert.equal(backToWork(tableOf({ browsing: "reports" }), w, 0), true);             // Reports with nothing on the table
  assert.equal(backToWork(tableOf({ current: "task:40" }), w, 40), true);             // another task in front
  assert.equal(backToWork(tableOf({ current: "task:12" }), w, 12), false);            // on the task: no Back
  assert.equal(backToWork(tableOf({ browsing: "settings" }), null, 0), false);        // nothing worked on yet
  assert.equal(overChat(settings), true);                                             // ...where the pencil goes to the head
  assert.equal(workWords(w), "Back to TQ-0012 Renew the vendor.example co…");
  assert.equal(workWords({ ref: "TQ-0007", title: "" }), "Back to TQ-0007");
});
