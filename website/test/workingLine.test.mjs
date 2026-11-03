// A REAL ANSWER COUNTS ITS SECONDS (the owner, 2026-10-20: "working... Ns"): a CLI brain took 4-51 s behind three silent dots,
// which read as hung. The count joins the dots on a typed ask's real answer - never the demo's script, never Next or the phone -
// and lives in its own component, so the chat around it does not redraw every second.
import test from "node:test";
import assert from "node:assert/strict";
import { workingLine } from "../src/agentWork.js";
import { setLocale } from "../src/i18n.js";

setLocale("en");

test("nothing in the first second, then whole seconds that never run ahead", () => {
  assert.equal(workingLine(0), "");
  assert.equal(workingLine(999), "");
  assert.equal(workingLine(1000), "Working… 1s");
  assert.equal(workingLine(6999), "Working… 6s");
  assert.equal(workingLine(65400), "Working… 1m 05s");
});

