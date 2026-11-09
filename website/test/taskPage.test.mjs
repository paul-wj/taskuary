import test from "node:test";
import assert from "node:assert/strict";

test("the triage reason is kept and whitespace normalized", async () => {
  const { triageSays } = await import("../src/taskSources.js");
  const facts = { triaged: true, pills: [{ key: "intent", value: "reply" }, { key: "priority", value: "normal" }] };
  assert.ok(triageSays(facts, "reply", "  she asks for half an hour\n on a named day ").endsWith("she asks for half an hour on a named day"));
  assert.ok(!triageSays(facts, "reply", "").endsWith(" · "));
});


test("a running agent's Stop and save is dark on its own; the Advisor's pick outranks it, and nothing else darkens itself", async () => {
  const { rowOf } = await import("../src/actionRow.js");
  const v = (id, group, extra = {}) => ({ id, group, label: id, tone: "s", promote: true, ...extra });
  const list = [v("save-end", "agent", { lead: true, fill: true }), v("diff", "agent"), v("done", "more"), v("next", "next")];
  const dark = (r) => [...r.decide, ...r.agent, ...r.more].filter((x) => x.tone === "p");
  assert.deepEqual(dark(rowOf({ ref: "", list })).map((x) => [x.id, !!x.own]), [["save-end", true]], "running: Stop and save, marked the row's own");
  const advised = rowOf({ ref: "", list }, { verb: "review_changes", label: "diff" });
  assert.ok(!dark(advised).some((x) => x.own), "the Advisor spoke: its pick is the one dark button");
  assert.deepEqual(dark(rowOf({ ref: "", list: list.map((x) => ({ ...x, fill: false })) })), [], "a finished turn or a question: nothing dark");
});

test("the row puts a leading agent verb first and Mark done beside it (actionRow.rowOf)", async () => {
  const { rowOf, clustersOf } = await import("../src/actionRow.js");
  const v = (id, group, extra = {}) => ({ id, group, label: id, tone: "s", promote: true, ...extra });
  // a live session, nothing waiting on approval: Stop and save leads, Mark done does not take the lead from it
  const live = rowOf({ ref: "", list: [v("save-end", "agent", { lead: true }), v("diff", "agent"), v("done", "more"), v("next", "next")] });
  assert.deepEqual(live.agent.map((x) => x.id), ["save-end", "diff", "done"]);
  assert.equal(live.decide.length, 0);
  assert.deepEqual(clustersOf(live).find((c) => c.type === "move").shown.map((x) => x.id), ["done", "save-end", "diff"], "Mark done, then the agent's lead");
  // ...a reply waiting: its Send leads (a decision), and Stop and save waits after Review changes
  const waiting = rowOf({ ref: "", list: [v("r1:approve", "decide", { tone: "p" }), v("diff", "agent"), v("save-end", "agent"), v("done", "more", { promote: false }), v("next", "next")] });
  assert.equal(waiting.decide[0].id, "r1:approve");
  assert.deepEqual(waiting.agent.slice(0, 2).map((x) => x.id), ["diff", "save-end"]);
});


