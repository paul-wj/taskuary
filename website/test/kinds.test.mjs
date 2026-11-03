// Kinds determine which tasks can be created by hand and which agents can work them.
import test from "node:test";
import assert from "node:assert/strict";
import { AGENT_KINDS, KIND_OPTIONS, KINDS, kindLabel } from "../src/kinds.js";

test("task kinds and agent kinds retain their roles", () => {
  assert.deepEqual(KINDS, ["task", "general", "coding", "reply"]);
  assert.deepEqual(AGENT_KINDS, ["general", "coding"]);
  assert.equal(kindLabel("unknown-kind"), "unknown-kind");
  assert.deepEqual(KIND_OPTIONS.filter((o) => o.made === false).map((o) => o.key), ["reply"], "a reply is never made by hand");
});

