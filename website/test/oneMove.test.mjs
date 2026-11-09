import test from "node:test";
import assert from "node:assert/strict";

// ONE MOVE AT A TIME (the owner, 2026-11-03): Next and Back grey from a press until its answer lands - ten fast clicks are one move, never a
// queue of held presses. The press still draws what the walk already knows at once (walk.below, walk.above); a rail row clicked over a move
// is drawn at once from its own row, and the move's answer never takes the table back from it.
import { mergeDurableTurns } from "../src/assistantTurns.js";

test("a chat read never merges lines over a move: the table stays where it was drawn", () => {
  const was = [{ id: "a1", role: "assistant", text: "Up next.", card: { key: "task:1" } }];
  const { messages } = mergeDurableTurns(was, [{ id: 7, role: "assistant", text: "Up next.", card: { key: "task:1", pressed: "Next" } },
    { id: 8, role: "assistant", text: "Then this.", card: { key: "task:2" } }], { append: false });
  assert.deepEqual(messages.map((m) => m.id), ["a1"], "no line pushed under the table over a move");
});


