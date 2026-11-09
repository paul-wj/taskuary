// New has a Report tab and a Workflow tab (the owner, 2026-10-15: "we need 2, one for reports and one for workflows"):
// describe it, Build it, and the draft opens on Reports filled in - the same box Reports has, no second form.
import assert from "node:assert/strict";
import test from "node:test";
import { canvasRequestFromHash } from "../src/canvasLinks.js";
import { DRAFT_HASH, handDraft, onDraftHanded, takeDraft } from "../src/draftHandoff.js";


test("each draft opens on its own shelf, on the canvas too", () => {
  assert.deepEqual(canvasRequestFromHash(`#${DRAFT_HASH.workflow}`).state, { section: "workflows", open: "draft" });
  assert.deepEqual(canvasRequestFromHash(`#${DRAFT_HASH.report}`).state, { section: "reports", open: "draft" });
});

test("a draft waits for Reports, and an open Reports hears it at once - taken once", () => {
  handDraft("workflow", { title: "x" }, { explain: "y" });
  assert.deepEqual(takeDraft(), { kind: "workflow", config: { title: "x" }, meta: { explain: "y" } });
  assert.equal(takeDraft(), null);
  let heard = 0; const off = onDraftHanded(() => { heard += 1; });
  handDraft("report", {}, {}); off(); handDraft("report", {}, {});
  assert.equal(heard, 1);
  takeDraft();
});


