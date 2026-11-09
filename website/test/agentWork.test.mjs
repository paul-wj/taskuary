import test from "node:test";
import assert from "node:assert/strict";
import { shownAgent, instructionsHint } from "../src/kinds.js";
import { agentName, workOf, doingNow, trailText, turnStart, elapsedText, sourceOf, saidFromTail, saidOf } from "../src/agentWork.js";

const read = (name) => readFileSync(fileURLToPath(new URL(`../src/${name}`, import.meta.url)), "utf8");

test("the agent doing the work is Agent - never the app, a tool, a profile or a demo name (the owner, 2026-11-08)", () => {
  for (const t of [{ Kind: "research" }, { Kind: "coding" }, { Kind: "general", Assignee: "agent:researcher" }, { Assignee: "owner" }, {}, null])
    assert.equal(agentName(t), "Agent");
  for (const run of [{ mode: "terminal", cli: "claude" }, { mode: "chat", cli: "taskuary", agent: "researcher" }, { mode: "terminal", cli: "demo" }, null])
    assert.equal(shownAgent(run), "Agent");
  // ...and the profile is said only where a look for it finds it
  assert.ok(instructionsHint("researcher").includes("researcher"));
  assert.equal(instructionsHint(""), "");
});

test("a call with no result yet is what the agent is doing right now", () => {
  const trace = [
    { type: "start" },
    { type: "tool_call", name: "WebSearch", detail: { tool_call_id: "a", args: { query: "vendor pricing" } } },
    { type: "tool_result", name: "WebSearch", detail: { tool_call_id: "a", result: "…" } },
    { type: "tool_call", name: "WebFetch", detail: { tool_call_id: "b", args: { url: "https://www.vendor.example/blog/x" } } },
    { type: "tool_result", name: "WebFetch", detail: { tool_call_id: "b", result: "…" } },
    { type: "tool_call", name: "WebFetch", detail: { tool_call_id: "c", args: { url: "https://northwind.example/blog/y" } } },
  ];
  const work = workOf(trace);
  assert.equal(work.steps.length, 3);
  assert.equal(work.running.length, 1);
  assert.equal(work.running[0].tool, "WebFetch");
  assert.equal(work.searches.length, 1);
  assert.equal(work.reads.length, 1);
  // what it HAS: the sources it finished reading, named, while it is still working
  assert.deepEqual(work.sources, ["vendor.example"]);
  assert.ok(doingNow(work).includes("northwind.example"));
  assert.equal((trailText(work).match(/1/g) || []).length, 2);
});

test("between two calls it says the last thing it did, not nothing", () => {
  const work = workOf([
    { type: "tool_call", name: "WebSearch", detail: { tool_call_id: "a", args: { query: "who pays" } } },
    { type: "tool_result", name: "WebSearch", detail: { tool_call_id: "a", result: "…" } },
  ]);
  assert.equal(work.running.length, 0);
  assert.ok(doingNow(work).includes("who pays"));
});

test("an empty trace claims no work", () => {
  const work = workOf([]);
  assert.deepEqual(work.steps, []);
  assert.equal(doingNow(work), "");
  assert.equal(trailText(work), "");
  assert.deepEqual(work.sources, []);
  assert.deepEqual(workOf(undefined).steps, []);
});

test("a failed call is finished, and is not counted as a source it has", () => {
  const work = workOf([
    { type: "tool_call", name: "WebFetch", detail: { tool_call_id: "a", args: { url: "https://vendor.example" } } },
    { type: "tool_result", name: "WebFetch", detail: { tool_call_id: "a", result: "403", is_error: true } },
  ]);
  assert.equal(work.running.length, 0);
  assert.equal(work.done[0].error, true);
});

test("the clock is the turn's, not the session's", () => {
  const messages = [
    { role: "user", createdAt: "2026-09-08 09:00:00" },
    { role: "assistant", createdAt: "2026-09-08 09:00:30" },
    { role: "user", createdAt: "2026-09-08 13:36:20" },
  ];
  assert.equal(turnStart(messages), new Date("2026-09-08T13:36:20").getTime());
  assert.equal(turnStart([]), null);
  assert.equal(turnStart([{ role: "assistant", createdAt: "nonsense" }]), null);
  assert.match(elapsedText(15_000), /15/);
  assert.match(elapsedText(124_000), /2.*04/);
  assert.match(elapsedText(0), /0/);
});

test("a conversation's last turn is read out of its pseudo-terminal, without the prompts", () => {
  assert.equal(saidFromTail([
    "you> Before you go further: ask me the ONE question you most need answered.",
    "assistant> Do you have any direct material from Northwind I can analyze?",
    "you>",
  ]), "Do you have any direct material from Northwind I can analyze?");
  assert.equal(saidFromTail(["assistant> I can draft the nomination response, but I need the name."]),
    "I can draft the nomination response, but I need the name.");
  assert.equal(saidFromTail(["you>"]), "");
  assert.equal(saidFromTail([]), "");
  assert.equal(saidFromTail(undefined), "");
});

test("only a real http target names a source", () => {
  assert.equal(sourceOf("https://www.vendor.example/blog/x"), "vendor.example");
  assert.equal(sourceOf("C:/repo/notes.md"), "");
  assert.equal(sourceOf(""), "");
});



test("a chat card shows its turn's answer from the start, never the sign-off its tail ends on (email walk 2026-10-29)", () => {
  const run = { said: "Hi Paula,\n\nThe announcement reads well.\n\nBest,\nAlex", tail: ["Best,", "Alex"] };
  assert.equal(saidOf(run), "Hi Paula, The announcement reads well. Best, Alex");
  assert.equal(saidOf({ tail: ["assistant> Looking at the thread"] }), "Looking at the thread");
});
