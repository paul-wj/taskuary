// Setting a coding CLI up from inside Taskuary: the button is drawn only where there is a road,
// what opens is the CLI running its own onboarding, and the pane is the session the Board shows.
import test from "node:test";
import assert from "node:assert/strict";
import { canSetup, setupTitle } from "../src/cliSetup.js";


test("the button is drawn only for an installed CLI Taskuary knows how to set up", () => {
  assert.equal(canSetup({ installed: true, setup: "claude" }), true);
  assert.equal(canSetup({ installed: false, setup: "claude" }), false);   // install it first
  assert.equal(canSetup({ installed: true, setup: "" }), false);          // aider: an API key, no walk
  assert.equal(canSetup(null), false);
});

test("the title says what will happen, and names the CLI", () => {
  assert.match(setupTitle({ label: "Claude Code", setup: "claude" }), /Claude Code/);
});

