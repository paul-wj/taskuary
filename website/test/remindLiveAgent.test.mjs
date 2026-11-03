// REMIND ME WITH AN AGENT STILL OPEN (press audit, 2026-10-01): it put the task away anyway, and the row sat on under
// "agent waiting on you". The owner: warn that the agent is open and has to be saved and ended first - do not defer.
import test from "node:test";
import assert from "node:assert/strict";
import { agentOpen } from "../src/taskFilter.js";

test("agentOpen is a live session on the walk's card - not a saved, stopped or paused one", () => {
  assert.equal(agentOpen({ kind: "agent", lane: "working", sid: "s1" }), true);
  assert.equal(agentOpen({ kind: "agent", lane: "blocked", sid: "s1", asking: true }), true);
  assert.equal(agentOpen({ kind: "agent", lane: "blocked", paused: true, sid: "s1" }), false);
  assert.equal(agentOpen({ kind: "agent", lane: "saved", sid: "s1" }), false);
  assert.equal(agentOpen({ kind: "agent", lane: "stopped", sid: "s1" }), false);
  assert.equal(agentOpen({ kind: "agent", lane: "working" }), false, "a headless run has no session to save and end");
  assert.equal(agentOpen({ kind: "task", lane: "yours" }), false);
  assert.equal(agentOpen(null), false);
});

