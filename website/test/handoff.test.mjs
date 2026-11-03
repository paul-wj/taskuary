// A confirmed hand-off (PW-135/136): when the worker starts, the walk moves on once and nothing is settled -
// the delegated task stays in Unread as Working; a repository still to choose is asked on the card and the
// same confirmation runs again; a failed start or a cancel keeps the item where it is.
import test from "node:test";
import assert from "node:assert/strict";
import { afterConfirm, afterExecute, isHandoff } from "../src/proposalCard.js";
import { setLocale, translateDescriptor } from "../src/i18n.js";

const coding = { id: "ab12", kind: "task.create_from_message", target: 7, version: 1, params: { kind: "coding" }, label: "Send to the coding agent", settles: true, key: "msg:7", ref: "TQ-0007" };

test("a started hand-off advances; one that needs a repository asks and keeps the item", () => {
  assert.equal(isHandoff(coding), true);
  assert.equal(isHandoff({ ...coding, params: { kind: "task" } }), false);
  const started = afterExecute(coding, { status: "done", outcome: { dispatch: "session", started: true, agent: "coding" } });
  assert.deepEqual([started.settle, started.handoff, started.status], [true, true, "done"]);
  const chat = afterExecute({ ...coding, params: { kind: "general" } }, { status: "done", outcome: { taskId: 7, chat: true } });
  assert.equal(chat.handoff, true);
  const existing = afterExecute(coding, { status: "done", outcome: { dispatch: "session", started: false, existing: true } });
  assert.equal(existing.handoff, false);
  const repo = afterExecute(coding, { status: "error", error: "TQ-0007 needs a repository first - pick one", outcome: { dispatch: "needs_repo", taskId: 7, agent: "coding" } });
  assert.deepEqual([repo.settle, repo.status, repo.repo], [false, "error", { taskId: 7, agent: "coding" }]);
  assert.equal(repo.receipt_i18n.values.reason, "TQ-0007 needs a repository first - pick one");
  for (const locale of ["en", "zh-CN"]) {
    setLocale(locale);
    assert.ok(translateDescriptor(repo.receipt_i18n).includes(repo.receipt_i18n.values.reason));
  }
  const failed = afterExecute(coding, { status: "error", error: "agent did not start" });
  assert.deepEqual([failed.settle, failed.repo], [false, undefined]);
});

test("a server receipt is retained as data while generated failures carry descriptors", () => {
  const receipt = "Task TQ-0007 started by Erin.";
  const out = afterExecute(coding, { status: "done", receipt, outcome: { started: true } });
  assert.equal(out.receipt, receipt);
  assert.equal(out.receipt_i18n, undefined);
  const failed = afterExecute(coding, { status: "error", error: "Repository access denied" });
  for (const locale of ["en", "zh-CN"]) {
    setLocale(locale);
    assert.ok(translateDescriptor(failed.receipt_i18n).includes("Repository access denied"));
  }
});

test("a started hand-off advances without settling the item", () => {
  assert.equal(afterConfirm(coding, { settle: true, handoff: true, status: "done" }, coding.key), "advance");
});

test("a started hand-off with its task OPENS that task on the table, and the walk waits (2026-10-01: \"why did it just close it?\")", () => {
  const out = afterExecute({ ...coding, params: { kind: "general" } }, { status: "done", outcome: { taskId: 9, chat: true } });
  assert.deepEqual([out.handoff, out.tid], [true, 9]);
  assert.equal(afterConfirm(coding, out, coding.key), "watch");
});


test("an agent started from the owner's own words opens its new task too (2026-10-01)", () => {
  const fromWords = { ...coding, kind: "task.create_from_text", params: { kind: "coding", text: "stop the mails" }, key: null, tid: null, ref: null, settles: false };
  assert.equal(isHandoff(fromWords), true);
  const out = afterExecute(fromWords, { status: "done", outcome: { taskId: 930, ref: "TQ-0930", kind: "coding" } });
  assert.deepEqual([out.handoff, out.tid], [true, 930]);
  assert.equal(afterConfirm(fromWords, out, "task:912"), "watch");
  assert.equal(isHandoff({ ...fromWords, params: { kind: "task" } }), false, "a plain to-do is not a hand-off");
});

// PUT IT ON MY LIST ON AN ADVISOR IDEA keeps the new task at the idea's place, as on a report (the button stress, 2026-11-02)
test("an idea's Put it on my list keeps the task it made on the table; its Not ours settles", () => {
  const idea = { kind: "idea.act", key: "idea:7", params: { verb: "task" } };
  assert.equal(afterConfirm(idea, { status: "done", settle: true, tid: 41 }, "idea:7"), "keep");
  assert.equal(afterConfirm({ ...idea, params: { verb: "dismiss" } }, { status: "done", settle: true }, "idea:7"), "settle");
  assert.equal(afterConfirm(idea, { status: "done", settle: true, tid: 41 }, "task:3"), "reload", "off the table it is not kept there");
});
