// EVERY DASHBOARD IS CONFIGURABLE (the owner, 2026-10-24: "it should be configurable, with a new tab in Reports named Dashboards with
// sources layout like reports"): its sources are a report's source cards, its components are cards beside them, and the built-in
// Taskuary at a glance is an ordinary row, opened and edited in the same editor as any other. The conversions are in setup.js.
import test from "node:test";
import assert from "node:assert/strict";
import { OWN_KEYS, runCfg, freshKey, orphans, sigOf, whereOf, whereText, windowOf, withField, withKind, withWindow } from "../src/dashboard/setup.js";


test("a where is typed the way it reads, and only whole pairs are kept", () => {
  assert.deepEqual(whereOf("state=open, kind = reply"), { state: "open", kind: "reply" });
  assert.equal(whereOf("state="), undefined);
  assert.equal(whereOf(""), undefined);
  assert.equal(whereText({ state: "open", kind: "reply" }), "state=open, kind=reply");
  assert.deepEqual(whereOf(whereText({ status: "open" })), { status: "open" });
});

test("a component's own window: the page's range, a fixed window, or what is true now", () => {
  const c = { kind: "progress", target: 15 };
  assert.equal(windowOf(c), "");
  assert.deepEqual(withWindow(c, "7"), { ...c, range: 7 });
  assert.deepEqual(withWindow(c, "now"), { ...c, range: false });
  assert.equal(windowOf({ range: false }), "now");
  assert.deepEqual(withWindow({ ...c, range: 7 }, ""), c, "the page's range is no key at all");
});

test("a field set to nothing is a key gone; a changed preset keeps what every kind reads", () => {
  assert.deepEqual(withField({ kind: "bar", x: "kind", limit: 8 }, "limit", ""), { kind: "bar", x: "kind" });
  assert.deepEqual(withField({ kind: "table" }, "columns", []), { kind: "table" });
  const bar = { kind: "bar", title: "Open work", source: "tasks", x: "kind", where: { state: "open" }, range: false, agg: "count", limit: 6 };
  assert.deepEqual(withKind(bar, "stat"), { kind: "stat", title: "Open work", source: "tasks", where: { state: "open" }, range: false, agg: "count" });
  assert.deepEqual(withKind(bar, "list"), { kind: "list", title: "Open work", source: "tasks", where: { state: "open" }, range: false });
});

test("a new source gets a key no other wears; a component reading a gone source is said before Save", () => {
  assert.equal(freshKey([{ key: "mail" }, { key: "s3" }]), "s4");
  assert.equal(freshKey([{ key: "s2" }, { key: "s3" }]), "s4");
  const spec = { sources: [{ key: "mail" }], components: [{ title: "In", source: "mail" }, { title: "Gone", source: "tasks" }] };
  assert.deepEqual(orphans(spec).map((c) => c.title), ["Gone"]);
  assert.notEqual(sigOf(spec), sigOf({ ...spec, sources: [{ key: "mail", days: 30 }] }));
  assert.equal(sigOf(spec), sigOf({ ...spec, components: [] }), "a component edit is not a source edit: the same rows redraw");
});

test("an S3 source on a dashboard keeps its path as object_key: its card's field and its Test hand the executor its key", () => {
  const s = { key: "s1", label: "Exports", type: "s3_object", bucket: "northwind-exports", object_key: "reports/latest.jsonl", date: "day" };
  assert.deepEqual(runCfg(s), { label: "Exports", type: "s3_object", bucket: "northwind-exports", key: "reports/latest.jsonl", date: "day" });
  assert.equal(runCfg({ key: "reports/old.jsonl", type: "s3_object", bucket: "b" }).key, "reports/old.jsonl", "a path an older save kept in key");
  assert.equal(runCfg({ key: "listing", type: "s3_object", bucket: "b", prefix: "reports/" }).key, undefined, "a listing reads no object");
  assert.deepEqual(runCfg({ key: "tasks", type: "taskuary_data", dataset: "tasks" }), { type: "taskuary_data", dataset: "tasks" });
  assert.deepEqual(OWN_KEYS, { s3_object: { key: "object_key" } }, "dashboards.OWN_KEYS says the same");
});

