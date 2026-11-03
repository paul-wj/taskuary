import test from "node:test";
import assert from "node:assert/strict";
import { mergeDurableTurns, oneCopy, placeLine } from "../src/assistantTurns.js";
import { runOperation } from "../src/taskOps.js";

test("a task operation proposes its parameters and executes the returned version", async () => {
  const calls = [];
  const api = { post: async (url, body) => {
    calls.push({ url, body });
    return url === "/api/operations"
      ? { data: { id: "op-7", version: 3 } }
      : { data: { status: "ok", outcome: { taskId: 10, done: true } } };
  } };
  const result = await runOperation(api, "task.check", 10, { id: "item-2", done: true });
  assert.deepEqual(calls, [
    { url: "/api/operations", body: { kind: "task.check", target: 10, params: { id: "item-2", done: true } } },
    { url: "/api/operations/op-7/execute", body: { version: 3 } },
  ]);
  assert.deepEqual(result, { taskId: 10, done: true });
});

test("a failed task operation exposes the handler's outcome", async () => {
  const api = { post: async (url) => url === "/api/operations"
    ? { data: { id: "op-8", version: 1 } }
    : { data: { status: "error", error: "Choose a repository", outcome: { held: "repo" } } } };
  await assert.rejects(runOperation(api, "dispatch.prepare", 10), (error) => {
    assert.equal(error.message, "Choose a repository");
    assert.deepEqual(error.outcome, { held: "repo" });
    return true;
  });
});


// G3 of the 2026-10-19 UI walk: TQ-0010 stood five times in the chat, once per search, Board or rail pick
test("an item opened again is one line in the chat, at the end - and the server's copies of it stay folded in", () => {
  const item = (id, extra = {}) => ({ id, role: "assistant", text: "Erin Blake wants the May numbers", card: { kind: "task", key: "task:10" }, ...extra });
  const said = { id: "u1", role: "user", text: "what else?" };
  const once = placeLine([item("a1", { commentId: 7 }), said], item("a2"));
  assert.deepEqual(once.map((m) => m.id), ["u1", "a2"]);
  assert.deepEqual(once[1].alias, ["a1", 7]);
  // ...the history read back carries the old copy (7) and the new one (8): neither draws a second line
  const back = mergeDurableTurns(once, [item(7), item(8)]).messages;
  assert.equal(back.filter((m) => m.card?.key === "task:10").length, 1);
  // ...a first load of a history with the item three times draws it once, where it last stood
  const hist = oneCopy([item(1), said, item(2), item(3)]);
  assert.deepEqual(hist.map((m) => m.id), ["u1", 3]);
  // ...and a proposal is never an item copy
  const prop = { id: "p", role: "assistant", text: "Not ours?", proposal: { id: "x" }, card: { kind: "proposal", key: "task:10" } };
  assert.equal(placeLine([prop], item("a3")).length, 2);
});

