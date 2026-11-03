import test from "node:test";
import assert from "node:assert/strict";
import { syncFace, syncStatusDelay } from "../src/syncTiming.js";

test("sync status checks quietly when the scheduled refresh is far away", () => {
  assert.equal(syncStatusDelay({ nextAt: 600_000, now: 0 }), 30_000);
});

test("sync status watches closely around the scheduled refresh", () => {
  assert.equal(syncStatusDelay({ nextAt: 20_000, now: 0 }), 500);
  assert.equal(syncStatusDelay({ nextAt: 10_000, now: 20_000 }), 500);
});

test("an observed running sync is followed every two seconds", () => {
  assert.equal(syncStatusDelay({ running: true, nextAt: 600_000, now: 0 }), 2000);
});

test("the sync clock reads the same on the Timeline and in the pipe", () => {
  const at = new Date(2026, 8, 3, 10, 42);
  const face = { every: 10, lastAt: at, nextIn: 271 };
  const full = syncFace(face), terse = syncFace({ ...face, terse: true });
  assert.ok(full.includes(terse));
  assert.ok(full.includes("4:31"));
  assert.notEqual(syncFace({ ...face, nextIn: 0 }), full);
});

test("a running sync and a disabled one say so in both faces", () => {
  assert.equal(syncFace({ busy: true, what: "reading Outlook" }), "reading Outlook");
  assert.ok(syncFace({ busy: true, what: "reading Outlook", terse: true }));
  assert.notEqual(syncFace({ every: 0 }), syncFace({ every: 0, terse: true }));
});

test("no poll yet never invents a time", () => {
  assert.ok(syncFace({ every: 10, lastAt: null, nextIn: null }).includes("—"));
});
