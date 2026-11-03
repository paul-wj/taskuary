// A REMOVE ACTS AT ONCE, AND UNDO TAKES IT BACK (the owner, 2026-10-21: no "are you sure"). Remove, Sign out, Disconnect and Not ours
// each asked first; now each runs on the press and leaves "Removed <it> - Undo" in place, and Recently deleted keeps a report, a
// workflow, a rule and a profile for 30 days (recentlydeleted.py).
import test from "node:test";
import assert from "node:assert/strict";
import { announceRemoved, clearRemoved, fromAnswer, lastRemoved, onRemoved, removedLine, showsRemoved, UNDO_MS } from "../src/removed.js";
import { keepDraft, keptDraft } from "../src/connectorDraft.js";
import { followUps } from "../src/proposalCard.js";
import { getLocale, setLocale } from "../src/i18n.js";


test("the Undo line: announced by the press, drawn by the list that holds its kind, and only while it is fresh", () => {
  const seen = [];
  const off = onRemoved((r) => seen.push(r));
  const r = announceRemoved({ did: 7, title: "Outlook mail", kind: "connection" });
  assert.ok(removedLine(r.title, r.verb).includes(r.title));
  assert.ok(removedLine("ChatGPT", "Signed out of").includes("ChatGPT"));
  assert.equal(lastRemoved().did, 7);
  assert.equal(showsRemoved(r, ["connection"]), true);
  assert.equal(showsRemoved(r, ["report"]), false);
  assert.equal(showsRemoved(r, ["connection"], r.at + UNDO_MS + 1), false);
  clearRemoved(7);
  assert.equal(lastRemoved(), null);
  off();
  assert.equal(seen.length, 2);
  // the server's answer names the kind it filed it under: a report and a workflow are told apart there
  assert.deepEqual(fromAnswer({ deleted: 3, title: "AP ageing", kind: "workflow" }, "report"), { did: 3, title: "AP ageing", kind: "workflow" });
});
test("the undo line translates interface descriptors without translating saved titles", () => {
  const previous = getLocale();
  try {
    setLocale("en");
    const descriptor = { source: "Report", values: {} };
    const english = removedLine(descriptor);
    setLocale("zh-CN");
    assert.notEqual(removedLine(descriptor), english);
    assert.ok(removedLine("Report").includes("Report"), "a saved title stays data");
    assert.ok(removedLine("Erin Blake").includes("Erin Blake"));
  } finally {
    setLocale(previous);
  }
});


test("leaving a card with unsaved changes keeps them in its draft - nothing asks, nothing is saved behind the owner's back", () => {
  assert.deepEqual(keptDraft(5), { want: null, wantSrc: {} });
  keepDraft(5, { Active: false }, {});
  assert.deepEqual(keptDraft(5).want, { Active: false });
  keepDraft(5, null, {});                                  // saved or discarded: gone
  assert.deepEqual(keptDraft(5), { want: null, wantSrc: {} });
});

test("Not ours runs as just this once, and offers From now on after it - never before", () => {
  const p = { verb: "not_ours", kind: "message.file", target: 12, params: { learn: false }, alts: [{ verb: "not_ours", label: "Just this once", current: true },
    { verb: "not_ours_sender", label: "From now on - their mail is filed for you" }, { verb: "block_sender", label: "A rule in Settings" }] };
  // its own operation on the same message: filed, the item is off the pile and cannot be looked up there again
  assert.deepEqual(followUps(p, { status: "done" }), [{ verb: "not_ours_sender", label: "From now on - their mail is filed for you",
    follow: { kind: "preference.exclude_sender", target: 12, params: { scope: "sender" } } }]);
  assert.deepEqual(followUps(p, { status: "error" }), []);
  assert.deepEqual(followUps({ ...p, verb: "close" }, { status: "done" }), []);
});
