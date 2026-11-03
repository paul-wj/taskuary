// Setup's "What AI do you have?" kept its own copy of the Connections AI shelf, and Google Vertex AI and Meta landed on the shelf only
// (the owner, 2026-10-15: "google vertex ai does not show up like in the connection tab why are some missing?"). One list now.
import test from "node:test";
import assert from "node:assert/strict";
import { AI_SHELF, SETUP_AI } from "../src/aiShelf.js";

test("setup offers every AI on the Connections shelf that can sort mail", () => {
  assert.ok(SETUP_AI.includes("vertex_ai") && SETUP_AI.includes("meta"));
  assert.deepEqual(AI_SHELF.filter((t) => !SETUP_AI.includes(t)), ["chatgpt", "typesafe"]);
});


