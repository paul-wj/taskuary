// Browser actions are described from the agent's command, without losing the values it supplied.
import test from "node:test";
import assert from "node:assert/strict";
import { browserStep, describeCall } from "../src/agentSteps.js";
import { viewportFor } from "../src/browserSplit.js";


test("a Codex or Gemini browser step reads as what it did, not 'Ran agent-browser click'", () => {
  const say = (command) => describeCall("shell", { command }).summary;
  assert.ok(say("agent-browser open https://billing.vendor.example/invoices").includes("billing.vendor.example"));
  const snapshot = say("agent-browser snapshot -i -c");
  const click = say("agent-browser click '@e2'");
  const back = say("agent-browser --session tq-1 back");
  assert.equal(new Set([snapshot, click, back]).size, 3);
  assert.ok(say('agent-browser find role button "Pay now" click').includes("Pay now"));
  assert.ok(say('agent-browser find label "Email" fill "alex@northwind.example"').includes("Email"));
  assert.ok(say('agent-browser fill @e1 "Northwind"'));
  assert.ok(browserStep(["frobnicate"]).summary.includes("frobnicate"));
});

test("Claude's own description of a browser step still wins over the verb", () => {
  const s = describeCall("Bash", { command: "agent-browser click '@e12'", description: "Press the pay button for invoice INV-1001" });
  assert.equal(s.summary, "Press the pay button for invoice INV-1001");
  assert.equal(s.kind, "page");
});

test("a laptop's pane draws the page at a readable scale", () => {
  assert.equal(viewportFor(538, 347).w, 980);       // 1366x768: was 1200, the page at ~45%
  assert.equal(viewportFor(900, 600).w, 1200);      // a desktop pane keeps the desktop width
});


