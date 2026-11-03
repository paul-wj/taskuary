import test from "node:test";
import assert from "node:assert/strict";
import { restorableCurrent } from "../src/funnelPile.js";

test("a historical finished-task card is never restored as current funnel work", () => {
  const live = { key: "msg:1", kind: "message" };
  assert.equal(restorableCurrent([
    { card: live },
    { card: { key: "agent:2", kind: "agentdone" } },
  ]), live);
  assert.equal(restorableCurrent([{ card: { key: "agent:2", kind: "agentdone" } }]), null);
});

test("a set-up's pending questions are a line, not an item on the table", async () => {
  const { restorableCurrent } = await import("../src/funnelPile.js");
  assert.equal(restorableCurrent([{ card: { kind: "setup_questions", questions: ["Which repo?"] } }]), null);
  // ...nor is a line that carries its own words (a failed act's way on, the already-seen opens)
  assert.equal(restorableCurrent([{ card: { kind: "words", chips: [{ verb: "next", label: "Next" }] } }]), null);
});


