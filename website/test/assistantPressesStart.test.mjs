// THE ASSISTANT MAY START AN AGENT (the owner, 2026-11-02: "why can't assistant start an agent. i'm okay with that. it itself should not be
// the agent"): an agent's job it writes into New carries `start` (concierge._new), and the card presses its own Send to agent once it can go.
// Its page acts likewise may press Send to agent / Send to coding agent - only an outward send stays the owner's.
import assert from "node:assert/strict";
import test from "node:test";


test("the Assistant's press is made once per line, however often its card is drawn again", async () => {
  // a card drawn again pressed Send to agent again on a job already started (2026-11-02)
  const { firstPressOf } = await import("../src/newTask.js");
  assert.equal(firstPressOf(4711), true);
  assert.equal(firstPressOf(4711), false);
  assert.equal(firstPressOf("4711"), false);                  // the same line, however the id arrives
  assert.equal(firstPressOf(4712), true);                     // another line is another press
  assert.equal(firstPressOf(null), true); assert.equal(firstPressOf(null), true);   // no line: the card's own once is all there is
});

