import { test } from "node:test";
import assert from "node:assert";
import { says, starting, subState } from "../src/laneSays.js";
import { getLocale, setLocale } from "../src/i18n.js";
import { assistantFocus } from "../src/funnelPile.js";
import { handRaiseWhat } from "../src/handraiseState.js";
import { subline } from "../src/timelineState.js";


test("the request's kind picks the sub-state, the booleans are the fallback", () => {
  assert.equal(subState({ request: { kind: "stalled" }, asking: true }), "stalled");
  assert.equal(subState({ request_kind: "approval_needed" }), "approval");
  assert.equal(subState({ state: "stalled", asking: true }), "stalled");
  assert.equal(subState({ asking: true }), "asking");
  assert.equal(subState({}), "parked");
});

test("the request's words and agent name survive in either locale", () => {
  const previous = getLocale();
  try {
    for (const locale of ["en", "zh-CN"]) {
      setLocale(locale);
      assert.ok(says("stalled", "coding", "rate limit: resets at 3pm").includes("rate limit: resets at 3pm"));
      assert.ok(says("asking", "codex", "Which  branch?").includes("Which branch?"));
      assert.ok(!says("parked", "coding", "the screen said this").includes("the screen said this"));
      assert.ok(starting("Taskuary", "Codex").includes("Taskuary"));
      assert.ok(starting("Taskuary", "Codex").includes("Codex"));
      assert.ok(starting("Taskuary").includes("Taskuary"));
    }
  } finally { setLocale(previous); }
});

test("the walk's lead, the hand-raise and the Timeline read the same sentence", () => {
  const stuck = { kind: "agent", lane: "blocked", agent: "coding", request_kind: "stalled", why: "coding is stuck - rate limit" };
  assert.equal(assistantFocus(stuck).lead, stuck.why);
  assert.equal(handRaiseWhat({ agent: "coding", asking: false, line: "coding is stuck - rate limit" }), "coding is stuck - rate limit");
  assert.match(subline({ TaskId: 4, Working: "coding", AgentWaiting: true, AgentLine: "coding is stuck - rate limit" }), /coding is stuck - rate limit/);
});

