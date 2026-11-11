import test from "node:test";
import assert from "node:assert/strict";
import { backChoices, broughtLine, syncFace, syncLine, syncStatusDelay } from "../src/syncTiming.js";
import { getLocale, setLocale } from "../src/i18n.js";

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

test("a first sync says how far back it goes and what it brings in, then what it brought (the owner, 2026-11-10)", () => {
  const previous = getLocale();
  try {
    setLocale("en");
    const run = { busy: true, phase: "fetching", what: "syncing · reading outlook" };
    assert.equal(syncLine({ ...run, back: 72 }), "going back 3 days…");                                     // starting
    assert.equal(syncLine({ ...run, back: 72, landed: 37 }), "going back 3 days · bringing in 37…");       // N so far
    assert.equal(syncLine({ ...run, phase: "triaging", what: "syncing · processing messages · 4 left", back: 72, landed: 212 }),
      "brought in 212 · processing messages · 4 left");                                                     // judging what came
    assert.equal(syncLine({ brought: { n: 212, hours: 72 } }), "brought in 212 from the last 3 days");     // done, for a moment
    assert.equal(syncLine({ brought: { n: 5, hours: 24 } }), "brought in 5 from the last day");
  } finally { setLocale(previous); }
});

test("an ordinary sync says a count only when it has one, and nothing of its own otherwise", () => {
  const run = { busy: true, phase: "fetching", what: "syncing · reading outlook" };
  assert.equal(syncLine(run), "");                                       // the clock's own words stand
  assert.equal(syncLine({ ...run, landed: 3 }), "bringing in 3…");
  assert.equal(syncLine({ ...run, phase: "checking", what: "syncing" }), "");
  assert.equal(syncLine({ brought: { n: 3, hours: 0 } }), "brought in 3");
  assert.equal(syncLine({}), "");
  assert.equal(broughtLine(0, 0), "");
});

test("a custom first-sync window remains selectable among supported durations", () => {
  const previous = getLocale();
  try {
    setLocale("en");
    assert.deepEqual(backChoices(5).map(([d]) => d), [1, 3, 5, 7, 14, 30], "a catch-up window of its own is offered as it is");
  } finally { setLocale(previous); }
});
