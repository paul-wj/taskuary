import test from "node:test";
import assert from "node:assert/strict";
import { forgetTasks, heldSteps, heldTask, keepTask, prefetchTask } from "../src/taskDetail.js";

const fake = (calls) => ({ get: async (url) => { calls.push(url); const id = Number(url.split("/")[3]);
  return url.endsWith("/steps") ? { data: { steps: [{ id: 1, text: "Book the room" }] } } : { data: { task: { TaskId: id, DoneWhen: id === 9 ? "booked" : "" } } }; } });

// SWAP, NEVER CLEAR (G8): the view on the table draws its task on the first frame when the read was asked for ahead of it
test("a task read ahead is held for its view, once per task, and a goal brings its steps", async () => {
  forgetTasks();
  const calls = [], api = fake(calls);
  assert.equal(heldTask(4), null);
  await prefetchTask(api, 4); await prefetchTask(api, 4); await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(calls.filter((u) => u === "/api/tasks/4"), ["/api/tasks/4"], "one read per task while it is fresh");
  assert.ok(calls.includes("/api/terminals"), "the sessions come with it");
  // ...and never its waiting room: the view no longer draws it, and its own 3 s poll read it in series behind every task read (2026-10-26)
  assert.ok(!calls.some((u) => u.endsWith("/waitroom")), "no waiting room read for a view that draws none");
  assert.equal(heldTask(4).task.TaskId, 4);
  await prefetchTask(api, 9); await new Promise((r) => setTimeout(r, 0));
  assert.equal(heldSteps(9)[0].text, "Book the room");
  keepTask(9, { task: { TaskId: 9, DoneWhen: "booked", Title: "newer" } });
  assert.equal(heldTask(9).task.Title, "newer");
  assert.ok(heldSteps(9), "a view's own read keeps the goal's steps");
  keepTask(9, { task: { TaskId: 8 } });                    // another task's answer is never held under this one
  assert.equal(heldTask(9).task.Title, "newer");
  forgetTasks();
  assert.equal(heldTask(4), null);
});

test("a failed read ahead holds nothing, so the view reads it itself", async () => {
  forgetTasks();
  await prefetchTask({ get: async () => { throw new Error("down"); } }, 5);
  assert.equal(heldTask(5), null);
});


test("a task's session is held with it: unknown until read, null for a task no agent holds", async () => {
  const { heldTerm, keepTerms } = await import("../src/taskDetail.js");
  forgetTasks();
  assert.equal(heldTerm(3), undefined, "not read yet - the view looks for itself");
  keepTerms([{ taskId: 3, sid: "s1", alive: false }, { taskId: 3, sid: "s2", alive: true }]);
  assert.equal(heldTerm(3).sid, "s2", "the live one first, as findTerm picks");
  assert.equal(heldTerm(7), null);
  forgetTasks(7);
  assert.equal(heldTerm(3).sid, "s2", "another task's write leaves this one's session as it was");
  assert.equal(heldTerm(7), undefined, "...and its own is unknown again");
  forgetTasks();
  assert.equal(heldTerm(3), undefined, "a write that names no task lets the whole list go");
});


// WHICH READ IS NEWER (the owner, 2026-10-23: "this shows agent working but it's not working"): the rail was built under the server's lock
// for minutes, and its "agent working" stood over a task whose own read said the agent had finished - a task read asked after the rail's
// is the newer word on that task, for its rail row and its header pill alike
test("a task read speaks over the rail only when it was asked after the rail's, and the rail draws again when one says something new", async () => {
  const { notePile, noteRead, pageRead, watchReads } = await import("../src/taskDetail.js");
  forgetTasks();
  const seen = [], stop = watchReads((tid) => seen.push(tid));
  notePile(1000);
  noteRead(7, { task: { TaskId: 7 }, state: "approve", session: null }, 900);
  assert.equal(pageRead(7), null, "a read asked before the rail's is older than it");
  noteRead(7, { task: { TaskId: 7 }, state: "approve", session: { alive: false } }, 1100);
  assert.deepEqual(pageRead(7), { at: 1100, state: "approve", live: false, rec: null });
  noteRead(7, { task: { TaskId: 7 }, state: "working", session: { alive: true } }, 1050);
  assert.equal(pageRead(7).state, "approve", "a read asked earlier never overwrites a later one, whenever it lands");
  noteRead(7, { task: { TaskId: 8 } }, 1200);
  assert.equal(pageRead(7).at, 1100, "another task's answer is never kept under this one");
  notePile(1300);
  assert.equal(pageRead(7), null, "a newer rail stands again");
  keepTask(7, { task: { TaskId: 7 }, state: "agentdone" }, undefined, 1400);
  assert.equal(pageRead(7).state, "agentdone", "the page's own read is kept with the moment it was asked");
  assert.deepEqual(seen, [7, 7], "a read that says the same thing again draws nothing");
  stop(); forgetTasks();
  assert.equal(pageRead(7), null);
});

