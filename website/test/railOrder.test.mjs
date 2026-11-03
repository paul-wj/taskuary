import test from "node:test";
import assert from "node:assert/strict";
import { ageHover, arrivedAt, bandsOf, inOrder, isUrgent, latestLine, nextMarkerKey } from "../src/funnelPile.js";
import { summarize } from "../src/walkSummary.js";

// THE RAIL IS ONE FIXED ORDER (the owner, 2026-10-22: "set by time, oldest to newest and then never move ... on the table should
// never move them"): a row is placed by when it ARRIVED, and the row on the table is drawn in that place, never lifted to the top.
const at = (h) => new Date(Date.now() - h * 3600e3).toISOString().slice(0, 19).replace("T", " ");
const task = (key, h, extra = {}) => ({ key, kind: "todo", lane: "yours", order_band: 2, tid: Number(key.slice(5)), arrived_at: at(h), ...extra });

test("a task pulled onto the table from outside the pile is drawn in its place, not on top", () => {
  const rows = [task("task:1", 19), task("task:2", 17), task("task:3", 11)];
  const pulled = task("task:9", 12);
  assert.deepEqual(inOrder(rows, [pulled]).map((r) => r.key), ["task:1", "task:2", "task:9", "task:3"]);
  assert.deepEqual(inOrder(rows, [task("task:8", 1)]).map((r) => r.key), ["task:1", "task:2", "task:3", "task:8"]);
  const report = { key: "report:5", kind: "report", lane: "report", order_band: 3, arrived_at: at(2) };
  const drawn = bandsOf(inOrder(rows, [report]));
  assert.deepEqual(drawn.map((b) => b.level), ["task", "reports"]);
});

test("the gutter's age is the arrival the rows are ordered by, not the newest activity", () => {
  // the owner's screenshot: 19h, 17h, 11h, <30m and then 1h - the working task's age was its agent's start
  const working = task("task:4", 26, { lane: "working", since: at(1), when: at(0.2) });
  assert.equal(arrivedAt(working), working.arrived_at);
  assert.equal(arrivedAt({ since: "a", when: "b" }), "a");
});


// REPORTS GO OLDEST FIRST LIKE EVERY OTHER SECTION (the owner, 2026-10-22: "reports should go oldest first like everything else"), and
// there is NO URGENT SECTION (2026-10-22: "remove the urgent section and just add quiet shading around it"): an urgent row sits in
// Tasks at its arrival place, shaded.
const report = (key, h) => ({ key, kind: "report", lane: "report", order_band: 3, arrived_at: at(h) });

test("a report from outside the pile takes its oldest-first place among the reports", () => {
  const rows = [report("report:1", 9), report("report:2", 3)];
  assert.deepEqual(inOrder(rows, [report("report:3", 5)]).map((r) => r.key), ["report:1", "report:3", "report:2"]);
  assert.deepEqual(inOrder(rows, [report("report:4", 1)]).map((r) => r.key), ["report:1", "report:2", "report:4"]);
});

test("an urgent task sits in Tasks at its arrival place, and no Urgent band is drawn", () => {
  const rows = [task("task:1", 19), task("task:2", 11, { lane: "time", order_band: 1 }), task("task:3", 2)];
  const bands = bandsOf(rows);
  assert.deepEqual(bands.map((b) => b.level), ["task"]);
  assert.deepEqual(bands[0].items.map((r) => r.key), ["task:1", "task:2", "task:3"]);
  assert.deepEqual(rows.map((r) => isUrgent(r)), [false, true, false]);
  // the marker for Next is the server's word (railwalk.peek's `below`), never the page's guess - an urgent row is walked in its place
  assert.equal(nextMarkerKey({ walk: { below: "task:2" } }), "task:2");
  assert.equal(nextMarkerKey({ walk: { below: "fyis:msg:1,msg:2" } }), "msg:1");
  assert.equal(nextMarkerKey(null), null, "no walk read yet: no marker");
});

test("the walk summary counts urgent tasks without moving them to another group", () => {
  const sum = summarize([task("task:1", 19), task("task:2", 11, { lane: "time", order_band: 1 }), report("report:1", 3)]);
  assert.deepEqual(sum.groups.map((g) => [g.key, g.n, g.urgent]), [["task", 2, 1], ["reports", 1, 0]]);
});

// A REPLY IS NEVER A MOVE (the owner, 2026-10-23): the row keeps its ARRIVAL age, the age's hover says both clocks, and the line under
// the title is the newest message - with no "+N" beside the age (2026-10-26: "if it's in the task it's fine no?")
const local = (h) => { const d = new Date(Date.now() - h * 3600e3); return new Date(d - d.getTimezoneOffset() * 60e3).toISOString().slice(0, 19).replace("T", " "); };

test("a row with replies since it was opened keeps its arrival age", () => {
  const row = task("task:4", 26, { new_n: 3, last_at: local(2) });
  assert.equal(arrivedAt(row), row.arrived_at, "a reply changed the age");
});

test("the age's hover says when it arrived and when its last message came", () => {
  const row = { key: "task:4", arrived_at: local(26), last_at: local(2) };
  const both = ageHover(row);
  const arrival = ageHover({ ...row, last_at: undefined });
  assert.ok(arrival);
  assert.ok(both.startsWith(arrival));
  assert.equal(both.split(" · ").length, 2);
  assert.equal(arrival.split(" · ").length, 1);
});

test("the line under the title is the newest message", () => {
  assert.equal(latestLine({ latest: { who: "Erin Blake", text: "Signed copy attached." } }), "Erin Blake: Signed copy attached.");
  assert.equal(latestLine({}), "");
});

