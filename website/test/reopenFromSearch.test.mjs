// A CLOSED TASK OPENED FROM SEARCH OPENS REOPENED (the owner, 2026-11-02: "when you open a task in Search it should automatically open
// instead of having to click Reopen task") - and only from Search: the rail, Recently deleted and a link open it closed.
import test from "node:test";
import assert from "node:assert/strict";
import { REOPEN_MARK_MS, markReopen, takeReopen } from "../src/reopenFromSearch.js";

test("a closed task Search hands over is reopened once; an open one, or one nobody marked, is not", () => {
  markReopen(41, "done", 1000);
  assert.equal(takeReopen(41, 1500), true, "Search's closed hit reopens");
  assert.equal(takeReopen(41, 1600), false, "once");
  markReopen(42, "dropped", 1000); assert.equal(takeReopen(42, 1100), true, "removed is closed too");
  markReopen(43, "open", 1000); assert.equal(takeReopen(43, 1100), false, "an open task has nothing to reopen");
  assert.equal(takeReopen(44, 1100), false, "the rail never marks: a closed task from the rail opens closed");
  markReopen(45, "done", 1000); assert.equal(takeReopen(45, 1000 + REOPEN_MARK_MS + 1), false, "a mark the page never took goes stale");
});

