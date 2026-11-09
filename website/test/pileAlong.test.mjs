// The rail rides along with the answer (design B, 2026-09-17): a turn's `done` and a settle's reply
// carry the pile as the server left it after their writes, and the page HOLDS it - captures Next from
// it under the scope it will press with - instead of fetching the same rows again. A press of Next was
// two of those reloads at 1.5-2 s each: the visible gap between the old rows vanishing and the next
// four appearing.
import test from "node:test";
import assert from "node:assert/strict";
import { coveredByReload, heldSince } from "../src/funnelPile.js";


test("a held rail dates from when the server began reading it, never later than now", () => {
  const now = 1_000_000;
  assert.equal(heldSince({ generated_at: 999_000 }, now), 999_000, "the server's clock, when it is behind ours");
  assert.equal(heldSince({ generated_at: 1_000_500 }, now), now, "a clock ahead of ours must not cover a write the read did not see");
  assert.equal(heldSince({}, now), now);
  assert.equal(heldSince({ generated_at: "not a time" }, now), now);
  assert.equal(heldSince(null, now), now);
  // ...and that is the mark the live handler compares against: the turn's own writes (events before the
  // read) are covered; a write after the read began is not
  assert.equal(coveredByReload({ lastAt: 998_000 }, heldSince({ generated_at: 999_000 }, now)), true);
  assert.equal(coveredByReload({ lastAt: 999_500 }, heldSince({ generated_at: 999_000 }, now)), false);
});


