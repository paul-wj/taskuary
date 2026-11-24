import test from "node:test";
import assert from "node:assert/strict";
import { dueWord, levelOf, rowMeta } from "../src/funnelPile.js";

// a goal's date, short - said in its words as "due Dec 1"; its gutter is its age like every row's (the owner, 2026-10-28)
test("a goal's due date reads short", () => {
  assert.equal(dueWord("2026-12-01"), "Dec 1");
  assert.equal(dueWord("2026-12-01 08:00:00"), "Dec 1");
  assert.equal(dueWord(""), "");
  assert.equal(dueWord(null), "");
});

// GOALS STAY IN TASKS (the owner, 2026-10-22): walked past or quiet, a goal is not moved - only Remind me puts it For later
test("a goal stays under Tasks when Next walks past it, and goes For later only by Remind me", () => {
  assert.equal(levelOf({ kind: "goal_slipped", order_band: 2, news: true, surfaced: false }), "task");
  assert.equal(levelOf({ kind: "goal", order_band: 2, news: true, surfaced: true }), "task", "walked past: still in Tasks");
  assert.equal(levelOf({ kind: "goal_fresh", order_band: 2 }), "task", "quiet: still in Tasks");
  assert.equal(levelOf({ kind: "goal", order_band: 2, deferred: true }), "later", "Remind me");
  assert.equal(rowMeta({ kind: "goal_slipped", lane: "yours" }).role, "bad", "slipped wears the bad ink - red");
  assert.equal(rowMeta({ kind: "goal_slipped", lane: "yours" }).word, "slipped");
});

