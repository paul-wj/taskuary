// PREPARE ON A MEETING (the owner, 2026-10-25: "add prepare that creates agent to research about person and topic through your mails"):
// the row's button beside Next, named by buttons.json, grouped with the agent's verbs - so on a narrow row it folds behind the ▾ and
// Next never does. Its press is the ordinary proposal road (runChip -> proposeDirect, concierge.AUTO), never a road of its own.
import test from "node:test";
import assert from "node:assert/strict";
import { liveVerb } from "../src/buttons.js";
import { typeOf, phoneRow } from "../src/actionRow.js";

test("the old Prep me verb stays gone", () => {
  assert.equal(liveVerb("prep"), null);
});

test("on the row it is an agent's verb, and a phone row keeps Next apart from it", () => {
  assert.equal(typeOf({ id: "w:prepare" }), "agent");
  const prep = { id: "w:prepare", group: "decide", tone: "s", label: "Prepare" };
  const ph = phoneRow({ decide: [prep], agent: [], more: [] });
  assert.deepEqual(ph.shown, [prep]);
});

