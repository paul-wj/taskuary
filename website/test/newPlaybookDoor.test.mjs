// A PLAYBOOK HAS ITS OWN DOORS (the owner, 2026-10-22: "this is not playbook ui? ... no new playbook ui either??"): New has a Playbook
// tab beside Report and Workflow, Reports has + New playbook beside + New report and + New workflow, and both open the one road to a
// playbook there is - the Playbooks shelf's New playbook dialog (NewPlaybookDialog), with the words New was given.
import assert from "node:assert/strict";
import test from "node:test";
import { canvasRequestFromHash } from "../src/canvasLinks.js";
import { NEW_PB, askPlaybook, takePlaybookAsk } from "../src/playbookOpen.js";


test("New's link lands on the Playbooks shelf with New playbook asked for - each ask numbered, so a second opens it again", () => {
  assert.deepEqual(canvasRequestFromHash("#report=new-playbook", 4).state, { section: "playbooks", open: null, newPb: 5 });
  assert.deepEqual(canvasRequestFromHash("#report=playbooks").state, { section: "playbooks", open: null });
  // ...and About you's link of the few hours it held them (2026-11-06) lands on Reports too
  assert.deepEqual(canvasRequestFromHash(`#about=${NEW_PB}`, 4), { kind: "browse", area: "reports", state: { section: "playbooks", open: null, newPb: 5 }, n: 4 });
});

test("the words wait for the shelf and are taken once; the dialog starts from them only when Set up with AI was pressed on New", () => {
  askPlaybook("when Erin asks for the weekly numbers, gather them for my review", true);
  assert.deepEqual(takePlaybookAsk(), { text: "when Erin asks for the weekly numbers, gather them for my review", start: true });
  assert.equal(takePlaybookAsk(), null);
});
