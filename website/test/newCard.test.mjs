import test from "node:test";
import assert from "node:assert/strict";
import { OTHER, chosenRepo } from "../src/newRepo.js";
import { planTask } from "../src/newTask.js";

const rows = [{ repo: "northwind/ledger", has_path: true }, { repo: "northwind/portal", has_path: false }, { repo: "org/app", has_path: true }];

test("auto follows the repository the words name, and leaves the guess to the server when they name none", () => {
  assert.deepEqual(chosenRepo({ rows, said: "check this in ledger" }), { repo: "northwind/ledger", path: null, named: true, needsPath: false });
  assert.equal(chosenRepo({ rows, said: "why is the export slow" }).repo, null);            // server guesses, as it always did
  assert.equal(chosenRepo({ rows, said: "compare ledger with portal" }).repo, null);       // two named: not clear, not guessed here
});

test("a pick beats the words, and a repository with no folder asks for one before the session can open", () => {
  const c = chosenRepo({ rows, pick: "northwind/portal", said: "fix ledger" });
  assert.equal(c.repo, "northwind/portal");
  assert.equal(c.needsPath, true);
  assert.equal(chosenRepo({ rows, pick: "northwind/portal", path: " C:/work/portal " }).path, "C:/work/portal");
  assert.equal(chosenRepo({ rows, pick: "northwind/ledger", path: "ignored" }).path, null);   // it has one already
  // named with no folder: the folder typed rides along
  assert.equal(chosenRepo({ rows, said: "the portal is down", path: "C:/work/portal" }).path, "C:/work/portal");
});

test("another repository is a name and a folder, both needed", () => {
  assert.deepEqual(chosenRepo({ rows, pick: OTHER, name: " acme/tool ", path: "D:/tool" }), { repo: "acme/tool", path: "D:/tool", named: false, needsPath: false });
  assert.equal(chosenRepo({ rows, pick: OTHER, name: "acme/tool" }).needsPath, true);
  assert.equal(chosenRepo({ rows, pick: OTHER }).repo, null);
});

test("the chosen repository becomes the new task's repo tag, and a chat has none", () => {
  assert.match(planTask("northwind/ledger", "terminal", false, true).tags, /repo:northwind\/ledger/);
  assert.equal(planTask(null, "terminal", false, true).tags, "stay:open");                 // auto, nothing named: no tag
  assert.equal(planTask(null, "terminal", false, true).kind, "coding");
});

