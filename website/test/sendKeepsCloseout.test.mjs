import test from "node:test";
import assert from "node:assert/strict";
import { stageOf, mainView, sectionOf } from "../src/stages.js";

// SEND KEEPS CLOSE OUT ON THE PAGE (the owner, 2026-10-27: "I hit send on close out and ... it reopened the task page"). On a real mailbox
// the sent copy comes back marked as Taskuary's own (ReviewSent), so sentElsewhere drops it; with the draft gone nothing was Close out's,
// the stage read "a reply owed, nothing written" and its main view is the task.

test("a reply sent from here is Close out's: the stage stays drafted and Close out stays the page", () => {
  const drafted = stageOf({ focus: "reply", drafted: true }), owed = stageOf({ focus: "reply", drafted: false });
  assert.equal(mainView({ stage: drafted }), "work", "with the sent reply counted, Close out is the page");
  assert.notEqual(mainView({ stage: owed }), "work", "...which is what the page flipped to without it");
  // ...and in the three sections a drafted or sent reply is Close out's; one owed with nothing written opens on Came from (2026-10-28)
  assert.equal(sectionOf(drafted), "close");
  assert.equal(sectionOf(owed), "from");
});

