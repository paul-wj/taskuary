// Consistent worker startup across the surfaces that start one (PW-209..214).
//
// The All-detail row hid Send to agent for fyi/reply rows that chat cards happily dispatch; the
// timeline's SendToAgent read a needs_repo decision as a live start; the task page's "Use
// non-coding agent" only re-labelled the task's kind and left a workspace mount to start work.
// Every surface now reads one dispatch outcome and shows what actually happened.
import test from "node:test";
import assert from "node:assert/strict";
import { outcomeOf } from "../src/dispatchOutcome.js";


test("a dispatch answer is read as started, existing, needs_repo or assistant - never a decision as a start", () => {
  assert.equal(outcomeOf({ dispatch: "needs_repo", taskId: 3, agent: "coding" }).state, "needs_repo");
  assert.equal(outcomeOf({ dispatch: "session", started: true, accepted: true, agent: "coding", ref: "TQ-0003" }).state, "started");
  const accepted = outcomeOf({ dispatch: "session", started: true, accepted: true, agent: "coding", ref: "TQ-0003" });
  const pending = outcomeOf({ dispatch: "session", started: true, accepted: false, agent: "coding", ref: "TQ-0003" });
  assert.equal(accepted.accepted, true);
  assert.equal(pending.accepted, false);
  assert.ok(accepted.text.includes("TQ-0003"));
  assert.ok(pending.text.includes("TQ-0003"));
  assert.equal(outcomeOf({ dispatch: "session", started: false, existing: true, agent: "coding", ref: "TQ-0003" }).state, "existing");
  assert.equal(outcomeOf({ dispatch: "assistant", started: true, agent: "cli:claude", ref: "TQ-0004" }).state, "started");
  // an older server without the flags: a session payload is a start, a needs_repo is not
  assert.equal(outcomeOf({ dispatch: "session", session: { sid: "s" } }).state, "started");
  assert.equal(outcomeOf({ dispatch: "needs_repo" }).state, "needs_repo");
});

