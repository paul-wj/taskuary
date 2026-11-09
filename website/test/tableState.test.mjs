// ONE RECORD OF WHAT IS ON THE TABLE (general fix 4, 2026-10-18): folded or under a page, the item keeps its key and the Advisor
// keeps quiet; "Thinking..." only while a judgement is in flight; a Board-opened task hears its Advisor line.
import test from "node:test";
import assert from "node:assert/strict";
import { adviceRead, sameTarget, tableOf } from "../src/tableState.js";
import { adviceKeyFor } from "../src/advice.js";

test("folded by its X or under a page, the item stays on the table and the Advisor keeps quiet", () => {
  assert.deepEqual(tableOf({ current: "task:7" }), { key: "task:7", folded: false, place: false, speaks: true });
  assert.deepEqual(tableOf({ current: "task:7", foldedKey: "task:7" }), { key: "task:7", folded: true, place: false, speaks: false });
  assert.equal(tableOf({ cardKey: "task:9", browsing: "b123" }).speaks, false, "a page opened over it: no strip, no button acting on it");
  assert.equal(tableOf({ current: "task:7", setup: true }).speaks, false);
  // ...but a task opened over setup is in view, and its Advisor speaks (2026-10-26); folded or under a page it still keeps quiet
  assert.equal(tableOf({ cardKey: "task:7", setup: true, over: true }).speaks, true);
  assert.equal(tableOf({ cardKey: "task:7", setup: true, over: true, browsing: "b1" }).speaks, false);
  assert.equal(tableOf({ cardKey: "task:7", foldedKey: "task:7", setup: true, over: true }).speaks, false);
  assert.equal(tableOf({}).key, null);
});



// NO "THINKING..." (the owner, 2026-10-23): the server answers at once with the Advisor's one decision - a lit verb, silent or with its
// fact - and the page keeps every answer it reads for the key it asked about
test("the Advisor's decision is read whole, silent or not, and nothing is ever a spinner", () => {
  assert.deepEqual(adviceRead({ pending: true }, "task:7"), { advice: null }, "an old server's pending is no spinner");
  assert.equal(adviceRead({ verb: "reply", line: "" }, "task:7").advice.verb, "reply", "an obvious move: lit, said by nothing");
  assert.equal(adviceRead({ verb: "chase", line: "Ray Colton: 4 days, no answer." }, "task:7").advice.for, "task:7");
  assert.equal(adviceRead({ verb: null, state: "agent_asking", line: "" }, "task:7").advice.state, "agent_asking", "nothing lit is an answer too");
  for (const why of ["no_ai", "off", "nothing"]) assert.equal(adviceRead({ none: why }, "task:7").advice.none, why, why);
  assert.deepEqual(adviceRead({}, "task:7"), { advice: null });
});

test("a task opened by name hears the Advisor's event, which names it by the rail's key", () => {
  const ev = { key: "processing:abc", target_kind: "task", target_id: 12 };
  assert.ok(sameTarget(ev, { key: "task:12" }));
  assert.equal(adviceKeyFor(ev, { key: "task:12" }), "task:12");
  assert.equal(adviceKeyFor(ev, { key: "task:13" }), null);
  assert.equal(adviceKeyFor({ key: "msg:4", target_kind: "message", target_id: 4 }, { key: "task:4" }), null, "a message is not task 4");
  assert.equal(adviceKeyFor(ev, { key: "review:3", tid: 12 }), "review:3", "the walk's item knows its task too");
});


