// The card says what is GOING, not just who it is going to.
//
// TQ-0526's draft read "Attached are the PTO accrual files for the 8/31 payroll" and the card showed
// nothing at all, because nothing could be attached - so approving it would have sent the words and
// no files (the owner, 2026-09-14: "otherwise it looks like it sends without attachment").
import test from "node:test";
import assert from "node:assert/strict";
import { filesPromised, sizeText } from "../src/replyFiles.js";
import { replyEnvelope } from "../src/sendState.js";

test("a file is named the way a person would say its size", () => {
  assert.equal(sizeText(900), "900 B");
  assert.equal(sizeText(1740 * 1024), "1.7 MB");
  assert.equal(sizeText(64 * 1024), "64 KB");
  assert.equal(sizeText(undefined), "0 B");
});

test("whether a draft promises a file is its writer's word on the review, never read off the text", () => {
  assert.equal(filesPromised({ FilesPromised: JSON.stringify({ named: ["PTO_Accruals.xlsx"] }) }), true);
  assert.equal(filesPromised({ FilesPromised: JSON.stringify({ named: [] }) }), true, "a file promised, unnamed");
  // the words say "attached" and the writer said no file rides with it: the card believes the writer
  assert.equal(filesPromised({ DraftText: "His logins were attached to an old leftover record.", FilesPromised: null }), false);
  assert.equal(filesPromised({}), false);
  assert.equal(filesPromised(null), false);
  assert.equal(filesPromised({ FilesPromised: "not json" }), false);
});

test("the delivery envelope carries the files up to the card", () => {
  const env = replyEnvelope({ Deliver: JSON.stringify({ kind: "reply", to: ["a@b.test"], cc: [],
    attachments: [{ name: "PTO_Raw.zip", path: "C:/x/PTO_Raw.zip", size: 1740 * 1024 }] }) });
  assert.equal(env.attachments.length, 1);
  assert.equal(env.attachments[0].name, "PTO_Raw.zip");
  // an old envelope, written before any of this existed, still reads
  assert.deepEqual(replyEnvelope({ Deliver: JSON.stringify({ kind: "reply", to: ["a@b.test"] }) }).attachments, []);
  // ...and junk in the list never reaches the render
  assert.deepEqual(replyEnvelope({ Deliver: JSON.stringify({ kind: "reply", attachments: [null, {}, 3] }) }).attachments, []);
});

