import test from "node:test";
import assert from "node:assert/strict";
import { aloneAs, arrange, asks, filters, marks, meta, nothingYet, personHits, terms, kindOf, nothingMatches, totalOf } from "../src/searchHits.js";

const hits = [
  { type: "email", id: "msg:1", title: "Your certificate expires" },
  { type: "task", id: "task:7", title: "Renew the certificate" },
  { type: "pr", id: "msg:2", title: "#12 fix the build" },
  { type: "source", id: "src:email:alex@northwind.example", title: "alex@northwind.example" },
  { type: "email", id: "msg:3", title: "Fw: Your certificate expires" },
];

test("hits are grouped by kind, tasks first, the server's order kept inside a group", () => {
  const { groups, flat } = arrange(hits);
  assert.deepEqual(groups.map((g) => g.group), ["Tasks", "Email", "Code", "Sources"]);
  assert.deepEqual(flat.map((h) => h.id), ["task:7", "msg:1", "msg:3", "msg:2", "src:email:alex@northwind.example"]);
});

test("a filter narrows to one kind, and the strip counts only kinds that have something", () => {
  assert.deepEqual(arrange(hits, "Email").flat.map((h) => h.id), ["msg:1", "msg:3"]);
  assert.deepEqual(filters(hits).map((f) => [f.label, f.n]), [["All", 5], ["Tasks", 1], ["Email", 2], ["Pull requests", 1], ["Sources", 1]]);
});

test("a match is marked from the start of a word, as the index matched it", () => {
  const w = terms("cert exp");
  assert.deepEqual(marks("Your certificate expires; concert", w).filter((p) => p.hit).map((p) => p.t), ["cert", "exp"]);
  assert.deepEqual(marks("nothing here", w), [{ t: "nothing here", hit: false }]);
});

test("a kind the page does not know still gets a pill", () => {
  assert.equal(kindOf({ type: "whatever" }).label, "Item");
});

// the 2026-10-19 UI walk (G9): the footer said "15 of 15" over a list cut at eight tasks
test("the count is the server's whole count, past the cap, and '+' where the mail index stopped counting", () => {
  const res = { q: "certificate", hits, totals: { task: 23, email: 2, pr: 1, source: 1 }, capped: false };
  assert.deepEqual(totalOf(res), { n: 27, more: false });
  assert.deepEqual(totalOf(res, "Tasks"), { n: 23, more: false });
  assert.deepEqual(filters(hits, res).map((f) => [f.label, f.n]), [["All", "27"], ["Tasks", "23"], ["Email", "2"], ["Pull requests", "1"], ["Sources", "1"]]);
  assert.deepEqual(totalOf({ ...res, capped: true }, "Email"), { n: 2, more: true });
  assert.deepEqual(totalOf({ ...res, capped: true }, "Tasks"), { n: 23, more: false });       // the task count is exact
  assert.deepEqual(totalOf({ q: "x", hits }), { n: 5, more: false });                          // an older server: what came back
});

test("a status is asked for by name, and is no word to mark", () => {
  assert.deepEqual(terms("invoice status:open"), ["invoice"]);
  assert.ok(asks("status:done")); assert.ok(!asks("status:")); assert.ok(!asks(" a "));
});

test("no-result messages preserve the query and search scope", () => {
  assert.ok(nothingMatches(" zzq ").includes("zzq"));
  const scoped = nothingMatches("zzq", "Settings");
  assert.ok(scoped.includes("zzq"));
  assert.ok(scoped.includes("Settings"));
});

test("settings and connections are kinds of their own", () => {
  assert.deepEqual(arrange([{ type: "setting", id: "set:a" }, { type: "connector", id: "con:gmail" }]).groups.map((g) => g.group), ["Connections", "Settings"]);
});



// PEOPLE IN THE ONE BOX (the owner, 2026-10-28): the directory the To and Cc pickers search answers here too, under People, an address once
test("the directory's people are a group of their own, after Tasks, each address once", () => {
  const ps = personHits([{ to: "gmoreno@northwind.example", name: "Gail Moreno", company: "Northwind" }, { to: "GMoreno@northwind.example", name: "Gail" },
    { to: "lortiz@dynamo.example", name: "", org: "Dynamo Freight" }, { name: "no address" }]);
  assert.deepEqual(ps.map((h) => [h.title, h.to, h.company]), [["Gail Moreno", "gmoreno@northwind.example", "Northwind"], ["lortiz@dynamo.example", "lortiz@dynamo.example", "Dynamo Freight"]]);
  assert.deepEqual(arrange([{ type: "email", id: "m1" }, ...ps, { type: "task", id: "t1" }]).groups.map((g) => g.group), ["Tasks", "People", "Email"]);
  assert.deepEqual(meta(ps[1]), ["lortiz@dynamo.example", "Dynamo Freight"]);
  assert.equal(kindOf(ps[0]).label, "Person");
});

test("a person opened with nothing on record is said to have nothing yet - never a list of only them to press again", () => {
  const lena = { type: "person", id: "person:lortiz@dynamo.example", title: "Lena Ortiz", to: "lortiz@dynamo.example" };
  assert.equal(aloneAs({ q: "lortiz@dynamo.example", hits: [lena] }), "Lena Ortiz");
  assert.ok(nothingYet("Lena Ortiz").includes("Lena Ortiz"));
  // anything else on the address, the list speaks for itself; a name typed (no address yet) is the people list, not a person opened
  assert.equal(aloneAs({ q: "lortiz@dynamo.example", hits: [lena, { type: "email", id: "msg:9", title: "Freight quote" }] }), "");
  assert.equal(aloneAs({ q: "lena", hits: [lena] }), "");
  assert.equal(aloneAs({ q: "lortiz@dynamo.example", hits: [] }), "");
});
