// The status poll backs off once the server's poll is long overdue (perf report 2.8, 2026-10-19): the demo never polls, a
// sleeping laptop or a stopped scheduler neither, and 2 Hz for ever was ~120 requests an idle minute - each one a full re-render
// of the rail on a large home. What the owner does still reaches the screen at once: every write asks for the status again.
import test from "node:test";
import assert from "node:assert/strict";
import { syncStatusDelay } from "../src/syncTiming.js";
import { observeSync } from "../src/syncObserver.js";


test("a poll that never comes stops being watched twice a second", () => {
  assert.equal(syncStatusDelay({ nextAt: 1, now: 30_000 }), 500);          // just due: the scheduler wakes every 30 s
  assert.equal(syncStatusDelay({ nextAt: 1, now: 60_000 }), 500);          // still inside the minute the scheduler may take
  assert.equal(syncStatusDelay({ nextAt: 1, now: 61_000 }), 30_000);       // a minute late: sync off, asleep or stuck
  assert.equal(syncStatusDelay({ nextAt: 1, now: 40 * 60_000 }), 30_000);  // the demo: never polls at all
  assert.equal(syncStatusDelay({ running: true, nextAt: 1, now: 40 * 60_000 }), 2000);   // a running sync is still followed
});

test("an idle page whose poll is 40 minutes overdue reads status at most 3 times a minute", async () => {
  let clock = 0, reads = 0; const timers = [];
  const o = observeSync({ read: async () => (reads++, { status: { state: "idle" }, now: clock / 1000, nextPollAt: -2400 }),
    changed() {}, failed() {}, subscribe: () => () => {}, now: () => clock,
    schedule: (fn, ms) => (timers.push({ fn, at: clock + ms }), timers.length), cancel() {} });
  await new Promise(setImmediate);
  while (timers.length) { const t = timers.shift(); if (t.at > 60_000) break; clock = t.at; await t.fn(); }
  o.stop();
  assert.ok(reads <= 3, `${reads} status reads in one idle minute`);
});


test("a write is heard once per listener and a listener that left hears nothing", async () => {
  const seen = []; globalThis.window ??= new EventTarget();
  const { noteWrite, onWrote } = await import("../src/wrote.js");
  const off = onWrote(() => seen.push(1));
  noteWrite(); off(); noteWrite();
  assert.equal(seen.length, 1);
});
