import assert from "node:assert/strict";
import test from "node:test";
import { isWorkflowConfig } from "../src/sourceShape.js";


test("read versus write decides the shelf, not whether an agent runs it", () => {
  assert.equal(isWorkflowConfig({ type: "agent", prompt: "Fetch GitHub Trending" }), false);
  assert.equal(isWorkflowConfig({ type: "agent", access: "read", prompt: "Summarize it" }), false);
  assert.equal(isWorkflowConfig({ type: "agent", access: "write", prompt: "Update the records" }), true);
  assert.equal(isWorkflowConfig({ type: "zoho_monthly_invoices" }), true);
});

