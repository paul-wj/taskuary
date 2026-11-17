import test from "node:test";
import assert from "node:assert/strict";
import { dueWord, levelOf, rowMeta } from "../src/funnelPile.js";
import { setLocale } from "../src/i18n.js";

// a goal's date, short - said in its words as "due Dec 1"; its gutter is its age like every row's (the owner, 2026-10-28)
test("a goal's due date reads short", () => {
  setLocale("en");
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
});

test("a slipped goal is marked as a problem", () => {
  assert.equal(rowMeta({ kind: "goal_slipped", lane: "yours" }).role, "bad");
});

// A GOAL'S TITLE KEEPS ITS ROOM ON THE RAIL (the owner, 2026-11-15): at every desktop width its row read "Migra… · 1 of 5 steps slipped Nov 1" -
// the count and the word whole, the title five letters, the date cut at the card's edge. The title holds its half as every row's does; the
// count and the due date give way first, then the word shortens - "slipped" itself stays
test("a goal's title holds its half of the row; its count, its due date and then its word give way", () => {
  const css = src("assistantView.css");
  assert.match(css, /^\.tq-pile-row \.t b \{ flex: 1 1 auto; min-width: 50%;/m, "every row's title");
  assert.doesNotMatch(css, /b\.goal-t \{ min-width: 20%/, "a goal's is no exception any more");
  assert.match(css, /^\.tq-pile-row \.t b\.goal-t \{ flex-shrink: 3; \}$/m, "it gives up its long tail before the word gives up a letter");
  assert.match(css, /^\.tq-pile-steps, \.tq-pile-due \{ flex: 0 1000 auto; min-width: 0; overflow: hidden; \}$/m, "the count and the date go first");
  assert.match(css, /^\.tq-pile-word\.keep \{ flex: 0 1 auto; min-width: 46px; overflow: hidden; text-overflow: ellipsis; \}$/m, "then the word, down to slipped");
  assert.match(css, /^\.tq-pile-word\.keep \.w \{ display: inline !important; \}$/m, "never down to its mark (2026-10-21)");
});
