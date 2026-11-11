import test from "node:test";
import assert from "node:assert/strict";
import { getLocale, setLocale } from "../src/i18n.js";

test("the triage reason is kept and whitespace normalized", async () => {
  const { triageSays } = await import("../src/taskSources.js");
  const facts = { triaged: true, pills: [{ key: "intent", value: "reply" }, { key: "priority", value: "normal" }] };
  const previous = getLocale();
  setLocale("en");
  try {
    assert.ok(triageSays(facts, "reply", "  she asks for half an hour\n on a named day ").endsWith("she asks for half an hour on a named day"));
    assert.ok(!triageSays(facts, "reply", "").endsWith(" · "));
  } finally { setLocale(previous); }
});


// NOTHING DARKENS ITSELF: a running agent's Stop and save did (the owner, 2026-10-20), the one exception the dead-end walk excused - it is
// gone (the owner, 2026-11-10: "no need for stop and save button"), and so is the exception
test("no verb on the row darkens itself; only the Advisor's pick is dark", async () => {
  const { rowOf } = await import("../src/actionRow.js");
  const v = (id, group, extra = {}) => ({ id, group, label: id, tone: "s", promote: true, ...extra });
  const list = [v("continue", "agent", { lead: true, fill: true }), v("diff", "agent"), v("done", "more"), v("next", "next")];
  const dark = (r) => [...r.decide, ...r.agent, ...r.more].filter((x) => x.tone === "p");
  assert.deepEqual(dark(rowOf({ ref: "", list })), [], "nothing said: nothing dark");
  assert.deepEqual(dark(rowOf({ ref: "", list }, { verb: "review_changes", label: "diff" })).map((x) => x.id), ["diff"], "the Advisor's pick");
});

test("the row puts a leading agent verb first and Mark done beside it (actionRow.rowOf)", async () => {
  const { rowOf, clustersOf } = await import("../src/actionRow.js");
  const v = (id, group, extra = {}) => ({ id, group, label: id, tone: "s", promote: true, ...extra });
  // nothing waiting on approval: the agent's lead (Continue) leads, Mark done does not take the lead from it
  const live = rowOf({ ref: "", list: [v("continue", "agent", { lead: true }), v("diff", "agent"), v("done", "more"), v("next", "next")] });
  assert.deepEqual(live.agent.map((x) => x.id), ["continue", "diff", "done"]);
  assert.equal(live.decide.length, 0);
  assert.deepEqual(clustersOf(live).find((c) => c.type === "move").shown.map((x) => x.id), ["done", "continue", "diff"], "Mark done, then the agent's lead");
  // ...a reply waiting: its Send leads (a decision), and the agent's moves wait after it
  const waiting = rowOf({ ref: "", list: [v("r1:approve", "decide", { tone: "p" }), v("diff", "agent"), v("run-another", "agent"), v("done", "more", { promote: false }), v("next", "next")] });
  assert.equal(waiting.decide[0].id, "r1:approve");
  assert.deepEqual(waiting.agent.slice(0, 2).map((x) => x.id), ["diff", "run-another"]);
});
