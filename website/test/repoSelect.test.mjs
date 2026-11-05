import test from "node:test";
import assert from "node:assert/strict";

import { namedRepo } from "../src/repoNames.js";
const rows = [{ repo: "northwind/ledger" }, { repo: "northwind/portal" }, { repo: "org/app" }];

test("the Start panel's repository follows the one the instruction names, as a whole word", () => {
  assert.equal(namedRepo(rows, "can you check this in ledger if this is happening?"), "northwind/ledger");
  assert.equal(namedRepo(rows, "look at northwind/portal."), "northwind/portal");
  assert.equal(namedRepo(rows, "the ledgers are off"), "");                  // not the word
  assert.equal(namedRepo(rows, "compare ledger with portal"), "");           // two named: the owner picks
  assert.equal(namedRepo(rows, "fix the app"), "");                          // too short a name to trust
});

test("local repository labels show the directory without altering remote names or percent literals", async () => {
  const { repoLabel } = await import("../src/repoNames.js");
  assert.equal(repoLabel("local:C%3A%2Fwork%2FProject%20One"), "C:/work/Project One");
  assert.equal(repoLabel("local:%2Fwork%2F%E4%BB%A3%E7%A0%81%25"), "/work/代码%");
  assert.equal(repoLabel("northwind/portal"), "northwind/portal");
  assert.equal(repoLabel("local:invalid%"), "local:invalid%");
});

test("classification shows a readable local directory while the task binding stays encoded", async () => {
  const { headerFacts, sortedLine } = await import("../src/taskSources.js");
  const task = { Kind: "coding", Tags: "repo:local:C%3A%2Fwork%2FProject%20One" };
  const facts = headerFacts({ task });
  assert.equal(facts.pills.find((p) => p.key === "repo").value, "C:/work/Project One");
  assert.ok(sortedLine(facts, "coding").includes("C:/work/Project One"));
  assert.equal(task.Tags, "repo:local:C%3A%2Fwork%2FProject%20One");
});

