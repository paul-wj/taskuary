import test from "node:test";
import assert from "node:assert/strict";
import { canvasRequestFromHash } from "../src/canvasLinks.js";
import { place } from "../src/words.js";

test("the voice connection link lands in the voice section", () => {
  const r = canvasRequestFromHash(place("voice").href);
  assert.deepEqual([r.area, r.state], ["connections", { section: "AI — voice", open: null }]);
});

