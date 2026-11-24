import test from "node:test";
import assert from "node:assert/strict";


// The canvas sidebar keeps Skills alongside its other destinations.
test("the sidebar's buttons are New, Reports, Connections, Hub, Skills, Settings, in that order", async () => {
  const { SIDE_NAV } = await import("../src/sideNav.js");
  assert.deepEqual(SIDE_NAV.map((n) => n.key), ["new", "reports", "connections", "hub", "skills", "settings"]);
  assert.ok(!SIDE_NAV.some((n) => n.key === "about"), "About you is the avatar in the top bar's corner (2026-11-06)");
  for (const n of SIDE_NAV) assert.ok(n.label && n.hint, n.key);
});


// Sync status has no useful face while just starting; after a check, it shows the completed time.
test("the sync face omits a just-started status and shows the latest check time", async () => {
  const { syncFace } = await import("../src/syncTiming.js");
  const at = new Date(2026, 8, 29, 22, 26);
  assert.equal(syncFace({ checked: true, started: true, lastAt: at, terse: true }), "");   // "started 10:26 PM" said nothing (audit 2026-11-05)
  assert.equal(syncFace({ checked: true, lastAt: at, terse: true }), "checked 10:26 PM");
});
