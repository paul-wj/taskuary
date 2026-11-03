import test from "node:test";
import assert from "node:assert/strict";
import { canvasRequestFromHash } from "../src/canvasLinks.js";

test("message and task references open the corresponding canvas item", () => {
  assert.deepEqual(canvasRequestFromHash("#msg=12"), { kind: "msg", mid: 12, n: 0 });
  assert.deepEqual(canvasRequestFromHash("#task=7"), { kind: "task", tid: 7, n: 0 });
});
