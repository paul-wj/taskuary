// Outside the demo build demoApi.js is demoOff.js (vite.config.js): every name a module imports from it must exist there,
// answer "not the demo", and the recording must not be reachable from the stand-in.
import test from "node:test";
import assert from "node:assert/strict";
import * as off from "../src/demoOff.js";

test("the stand-in reports that demo mode is off", () => {
  assert.equal(off.DEMO, false);
  assert.equal(off.DEMO_GUIDED, false);
});

