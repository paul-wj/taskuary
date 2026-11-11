// SHOW THE WORK AS IT HAPPENS (the owner, 2026-11-05: "it has to show what it's working on a little more than this like pulling from url's
// etc.. look how other chat libraries show intermediately the tool calls etc.") and THE TURN'S CLOCK ("it should show right when it starts the
// counter on top, then it stops when response is generated")
import assert from "node:assert/strict";
import test from "node:test";
import { describeCall, pageOf, stepLabel, stepsOf } from "../src/agentSteps.js";
import { clockText, turnBegan, turnFrom, turnStamp } from "../src/agentWork.js";
import { setLocale } from "../src/i18n.js";

// The step's words read English (describeCall's labels): the locale is pinned, never the host's.
setLocale("en");

const doing = (name, args) => stepLabel({ ...describeCall(name, args), status: "running" });

test("an address is shown as host and path - never its query string, a sign-in, or a key in its path", () => {
  assert.equal(pageOf("https://user:pw@www.docs.northwind.example/budget/review?token=abc123&x=1#top"), "docs.northwind.example/budget/review");
  assert.equal(pageOf("https://api.vendor.example/v1/files/ab12cd34ef56gh78ij90kl12mn34/raw"), "api.vendor.example/v1/files/…/raw");
  for (const s of [doing("WebFetch", { url: "https://vendor.example/a?key=SECRET" }), doing("Bash", { command: "curl -s 'https://vendor.example/a?key=SECRET'" })])
    assert.ok(!/SECRET|key=|pw@/.test(s), s);
});

test("a run of calls still under way says its newest one", () => {
  const call = (id, file_path) => ({ type: "tool_call", name: "Read", detail: { tool_call_id: id, args: { file_path } } });
  const [s] = stepsOf([call("a", "/n/Budget/StatusBoard.js"), { type: "tool_result", name: "a", detail: { result: "ok" } }, call("b", "/n/Budget/BudgetTable.js")], { keepStart: false });
  assert.equal(s.status, "running");
  assert.equal(stepLabel(s), "Reading BudgetTable.js");
  assert.equal(s.summary, "Read 2 files in Budget/");
});

test("the turn's stamp: working m:ss while it runs, ran once it answered, nothing it cannot know", () => {
  const t0 = Date.parse("2026-11-05T15:00:00");
  assert.equal(turnStamp({ running: true, start: t0, now: t0 + 42_000 }), "working 0:42");
  assert.equal(turnStamp({ running: true, start: t0, now: t0 + 72_400 }), "working 1:12");
  assert.equal(turnStamp({ running: false, start: t0, end: t0 + 72_000 }), "ran 1m 12s");
  assert.equal(turnStamp({ running: true, start: null, now: t0 }), "", "no start, no counter");
  assert.equal(turnStamp({ running: false, start: t0, end: t0 + 7 * 3600_000 }), "", "a chat come back to hours later is no turn's run");
  assert.equal(clockText(3_725_000), "1:02:05");
});

// A BURST (the owner, 2026-11-05): a mail read in while turn 1 ran is drawn after it, stamped when it came in - the re-think under it began when
// turn 1 answered, the newest of everything above it, never at that mail's earlier stamp
test("a turn's run is counted from the newest thing above it, not the row just above", () => {
  const t = (hm) => new Date(`2026-11-05T17:${hm}`);
  assert.equal(+turnBegan([t("19:55"), t("21:10"), t("20:40")]), +t("21:10"));
  assert.equal(turnStamp({ start: turnBegan([t("19:55"), t("21:10"), t("20:40")]), end: t("21:50") }), "ran 40s");
  assert.equal(turnBegan([null, undefined]), null);
});

// THE CLOCK COUNTS FROM THE PRESS AND NEVER RESTARTS (the owner, 2026-11-10; the recorded coding walk: "ran 9s" under his line while the adapter
// started, then "ran 2s" once the turn's own row came - its clock from the turn's first step): a running turn counts from the earlier of its own
// start and the line it answers - a mail that joined mid-turn is newer than the turn and never sets it back
test("a running turn's clock is the earlier of its start and the line it answers", () => {
  assert.equal(turnFrom(9000, 1000), 1000, "the adapter took 8 s: still from the press");
  assert.equal(turnFrom(1000, 5000), 1000, "a mail joined at 5 s: still from the turn's start");
  assert.equal(turnFrom(null, 1000), 1000); assert.equal(turnFrom("2026-11-10T10:00:00Z", null), Date.parse("2026-11-10T10:00:00Z"));
  assert.equal(turnFrom(null, null), null);
});
