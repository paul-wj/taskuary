import test from "node:test";
import assert from "node:assert/strict";
import { usedBy } from "../src/connectorUses.js";

// #238: what leans on a connection is said on its card beside Remove, before the press - not in a dialog after it
test("one of a kind is named, several are counted, in the server's order", () => {
  const line = usedBy([{ kind: "workflow", names: ["Month close", "Invoice run"] }, { kind: "report", names: ["Morning"] }]);
  assert.ok(line.includes("2") && line.includes("Morning"));
  assert.ok(!line.includes("Month close") && !line.includes("Invoice run"));
  const names = usedBy([{ kind: "brain", names: ["Triage brain"] }, { kind: "card", names: ["Teams"] }]);
  assert.ok(names.indexOf("Triage brain") >= 0 && names.indexOf("Teams") > names.indexOf("Triage brain"));
  assert.ok(usedBy([{ kind: "brain", names: ["Triage brain", "report judge"] }]).includes("2"));
  const title = "Daily sales report";
  assert.equal(usedBy([{ kind: "report", names: [title] }]).split(title).length, 2);
});

test("drafts and sources are counted, never named", () => {
  const line = usedBy([{ kind: "draft", names: ["", ""] }, { kind: "source", names: ["alex@northwind.example"] }]);
  assert.ok(line.includes("2") && line.includes("1"));
  assert.ok(!line.includes("alex@northwind.example"));
  assert.ok(usedBy([{ kind: "report", names: [""] }]).includes("1"));
});

test("nothing leaning says nothing", () => {
  for (const x of [[], null, undefined, [{ kind: "report", names: [] }]]) assert.equal(usedBy(x), "");
});



