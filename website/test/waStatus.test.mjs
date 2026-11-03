// THE WHATSAPP CARD TELLS THE TRUTH (2026-10-23): it said "On — polling on schedule and via Sync now." from its switch while the
// bridge turned chats away, never heard a 1:1 by LID and failed its contact sync every ten minutes. The words are the server's
// (messengers.wa_status_line - tests/test_messengers.py); this pins what the card draws for each state, and where.
import test from "node:test";
import assert from "node:assert/strict";
import { waLine } from "../src/waStatus.js";


test("connected: the server's short words, and the turned-away count apart from them so it can be a link", () => {
  const st = { connected: true, bridge: true, parts: ["Connected", "2 chats", "last message 40 min ago"], turned_away: 12, fix: "" };
  const line = waLine(st);
  assert.deepEqual(line.parts.slice(1), ["2 chats", "last message 40 min ago"]);
  assert.equal(line.away, 12);
  assert.equal(line.fix, "");
  assert.equal(waLine({ ...st, turned_away: 0 }).away, 0);
});

test("not connected says so and offers Restart bridge; logged out offers Pair again; a failing contact sync offers Pair again", () => {
  assert.equal(waLine({ connected: false, bridge: false, node: true, manager: { phase: "idle" } }).fix, "restart");
  const disconnected = waLine({ connected: false, bridge: true, parts: ["Not connected"], fix: "restart", turned_away: 4 });
  assert.equal(disconnected.away, 0, "nothing is turned away by a bridge that is not connected");
  assert.equal(disconnected.fix, "restart");
  assert.deepEqual(waLine({ connected: false, bridge: true, logged_out: true, parts: ["Logged out"], fix: "pair" }).fix, "pair");
  assert.equal(waLine({ connected: true, bridge: true, parts: ["Connected", "contact names not syncing"], fix: "pair" }).fix, "pair");
});

test("no button while the bridge is still starting or Node is missing - the pairing box says what to do there", () => {
  assert.equal(waLine({ bridge: false, node: true, manager: { phase: "starting" } }).fix, "");
  assert.equal(waLine({ bridge: false, node: false }).fix, "");
  assert.equal(waLine(null), null);
  assert.equal(waLine({ unreachable: true }), null);
});

test("an older connected bridge without the new fields still has a status and no recovery action", () => {
  const line = waLine({ connected: true, bridge: true });
  assert.equal(line.parts.length, 1);
  assert.ok(line.parts[0]);
  assert.equal(line.away, 0);
  assert.equal(line.fix, "");
});

