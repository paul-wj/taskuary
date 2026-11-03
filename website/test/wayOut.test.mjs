import test from "node:test";
import assert from "node:assert/strict";
import { describe } from "../src/proposalCard.js";

test("a card confirms with the act's supplied name", () => {
  assert.equal(describe({ kind: "task.defer", label: "Remind me", params: { until: "2026-10-20" } }).confirm, "Remind me");
});

