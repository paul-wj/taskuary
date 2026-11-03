import test from "node:test";
import assert from "node:assert/strict";
import { actions, fixLine, progress, railShort, stateWord } from "../src/batchItems.js";

// A batch (batch.py): one repository's ranked arrivals as one task, worked top-down by a read-only agent.
const PR = "https://github.com/northwind/portal/pull/";
const items = [
  { Place: 1, State: "ended", EndedWhy: "You merged it on GitHub.", Link: PR + "1" },
  { Place: 2, State: "done", Link: PR + "2" },
  { Place: 3, State: "needs_you", Result: "Duplicate of 1.", Link: PR + "3", reviewed: true },
  { Place: 4, State: "waiting", Link: PR + "4" },
];

test("the progress line counts settled lines and names the ones waiting on you", () => {
  assert.match(progress(items), /2.*4/);
  assert.ok(progress(items).includes("③"));
  assert.ok(!progress(items.filter((i) => i.State !== "needs_you")).includes("③"));
  assert.equal(progress([]), "");
});

test("the filled button is what the agent proposed; a duplicate it says to close never wears a filled Merge", () => {
  const filled = (i) => actions(i).filter((a) => a.primary).map((a) => a.action);
  assert.deepEqual(filled({ ...items[2], Propose: "close" }), ["close"]);
  assert.deepEqual(actions({ ...items[2], Propose: "close" }).map((a) => a.action), ["close", "merge", "settle"]);
  assert.deepEqual(filled({ ...items[2], Propose: "merge" }), ["merge"]);
  assert.deepEqual(filled({ ...items[2], Propose: "changes" }), ["fix"], "changes asked: Fix it, with Ask for changes beside it");
  assert.deepEqual(filled(items[2]), [], "no proposal, nothing filled");
});

test("merge is offered only on a reviewed pull request; a settled line can only be opened again", () => {
  assert.deepEqual(actions(items[2]).map((a) => a.action), ["merge", "close", "settle"]);
  assert.deepEqual(actions({ ...items[2], reviewed: false }).map((a) => a.action), ["close", "settle"]);
  assert.deepEqual(actions({ ...items[2], Link: "https://jira.example/browse/X-1" }).map((a) => a.action), ["settle"]);
  assert.deepEqual(actions(items[0]).map((a) => a.action), ["reopen"]);
  assert.deepEqual(actions(items[3]).map((a) => a.action), ["settle"]);
});

test("an ended item says how it ended", () => {
  assert.notEqual(stateWord(items[0]), stateWord({ State: "ended", EndedWhy: "You closed it on GitHub without merging." }));
  assert.notEqual(stateWord(items[0]), stateWord(items[2]));
  assert.equal(stateWord({ State: "custom server state" }), "custom server state");
});

test("the rail row counts settled items of all", () => {
  assert.equal(railShort(["done", "waiting", "needs_you", "ended"]), "2/4");
});

test("Fix it where the review asked for changes; while it runs nothing else; when done Merge merges the fix", () => {
  // the owner, 2026-10-12: an outside pull request is fixed in GitHub's cloud (cloudfix.py)
  const asked = { ...items[2], Propose: "changes" };
  assert.deepEqual(actions(asked).map((a) => a.action), ["fix", "open", "merge", "close", "settle"]);
  assert.deepEqual(actions({ ...asked, Fix: "running", State: "working" }), [], "no second press while it runs");
  assert.ok(fixLine({ Fix: "running" }));
  assert.notEqual(fixLine({ Fix: "running" }), fixLine({ Fix: "failed" }));
  assert.equal(fixLine({}), "");
  const done = { ...items[2], Propose: "merge", Fix: "done", FixLink: PR + "9" };
  assert.deepEqual(actions(done).filter((a) => a.primary).map((a) => a.action), ["merge"]);
  assert.ok(actions(done).some((a) => a.action === "open-fix" && a.href === PR + "9"));
  assert.equal(actions({ ...asked, Fix: "failed" })[0].action, "fix");
  // an outsider's, with cloud fixes off: no button that can only refuse - Ask for changes is the move
  const off = actions({ ...asked, canFix: false });
  assert.ok(!off.some((a) => a.action === "fix"));
  assert.deepEqual(off.filter((a) => a.primary).map((a) => a.action), ["open"]);
});
