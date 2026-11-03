// A BUTTON THAT CANNOT WORK IS GREYED, ITS REASON IN THE HOVER (the owner, 2026-10-22): with no AI connected Send to agent, Try
// again, Run another agent, Re-plan and a step's Send to agent were all pressable, each only to fail; and a goal came pre-set to
// Plan it, which nothing could plan. One check, capabilities.cannotStart, for both roads - coding keeps R3's own words.
import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// Only the network client is replaced; the capability rules are the production module's.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "./api" && context.parentURL === new URL("../src/capabilities.js", import.meta.url).href)
      return { url: "data:text/javascript,export default {}", shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { cannotStart, NO_AI_WHY, NO_CODING_TOOL } = await import("../src/capabilities.js");
hooks.deregister();

test("cannotStart: no AI greys the general road; no coding tool greys only coding; an unread list greys nothing", () => {
  assert.equal(cannotStart({ ai: false }), NO_AI_WHY);
  assert.equal(cannotStart({ ai: false }, { coding: true, read: true, codingReady: true }), "", "a coding agent runs its own tool, no AI needed");
  assert.equal(cannotStart({ ai: false }, { coding: true, read: true, codingReady: false }), NO_CODING_TOOL);
  assert.equal(cannotStart({ ai: true }, { read: true, brains: [] }), NO_AI_WHY, "general_brains read and empty is no AI");
  assert.equal(cannotStart({ ai: true }, { read: false, brains: [] }), "", "not read yet is not a no");
  assert.equal(cannotStart({ ai: true }, { read: true, brains: [{ pick: "cli:codex" }] }), "");
  assert.equal(cannotStart({ ai: true }, { coding: true, read: true, codingReady: false }), NO_CODING_TOOL);
  assert.equal(cannotStart({ ai: true }, { coding: true, read: true, brains: [], codingReady: true }), "", "coding asks its tool, not general_brains");
});

