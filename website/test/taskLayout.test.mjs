// THE TASK PAGE'S LAYOUT (the redesign, owner-approved 2026-10-21): From | Work, and the work alone - full width - while an agent works
import test from "node:test";
import assert from "node:assert/strict";
import { SECTIONS, advisorAt, chatHome, homeSection, liveTerminal, taskSections, cameFrom, agentStatus, agentWord, answeredOutside, outsideLine, reportLine, closeStatus, closeOut, fromStatus, TAB_MOST, focusOf, fromLine, holderName, layoutOf, mainOf, nextInDrawer, sameWords, sectionHere, waitingOn, workPane } from "../src/taskLayout.js";

test("two columns at rest, the whole width while an agent works - coding or general, working or waiting on you", () => {
  assert.equal(layoutOf({ sessionView: false }), "columns");
  assert.equal(layoutOf({ sessionView: true }), "full");
});

// THE WHOLE WIDTH IS A LIVE SESSION'S ALONE (the owner, 2026-10-25, reversing the 2026-10-22 fold for the states with no agent live): a
// finished, failed or closed agent is back in two columns - its Result the white focus on the right, Close out under it on the shade
test("the layout: two columns whenever no agent is live - a Result and a failure too; the whole width only while working or waiting", () => {
  const cases = [
    ["no agent at all", {}, "columns"],
    ["never started (handed or queued, nothing run)", { sessionView: false }, "columns"],
    ["working or waiting on you", { sessionView: true }, "full"],
    ["finished, stopped or saved with its Result", { result: true }, "columns"],
    ["failed, with its reason and Try again", { failed: true }, "columns"],
  ];
  for (const [what, page, want] of cases) assert.equal(layoutOf(page), want, what);
  // the focus: the Result (or the failed run) once an agent acted, the reply where that is the move; none while live
  assert.equal(focusOf({ result: true, pane: "reply" }), "agent");
  assert.equal(focusOf({ failed: true }), "agent");
  // ...but a draft or emails waiting for Send are the next move: Close out is white, the Result shaded above it (2026-10-27), and the stage is
  // close_out - the work view, so the main view does not change
  assert.equal(focusOf({ result: true, pane: "reply", owed: true }), "reply");
  assert.equal(focusOf({ result: true, pane: "agent", owed: true }), "reply");
  assert.equal(focusOf({ failed: true, owed: true }), "reply");
  assert.equal(focusOf({ live: true, owed: true }), null);
  assert.equal(focusOf({ waiting: true, owed: true }), "none");
  assert.equal(mainOf({ focus: focusOf({ result: true, owed: true }), drafted: true }), "work");
  assert.equal(focusOf({ pane: "reply" }), "reply");
  assert.equal(focusOf({ live: true, result: true }), null);
  // ...and the owner's answers (2026-10-25): a to-do or a goal whitens its own list, else the block with the ask's source - never
  // Send to agent; a task waiting on a person whitens nothing
  assert.equal(focusOf({ pane: "agent", list: true }), "list");
  assert.equal(focusOf({ pane: "agent" }), "source");
  assert.equal(focusOf({ pane: "", waiting: true }), "none");

});


// ONE MAIN VIEW (the owner, 2026-10-26): where the task is up to is the page, the other half its drawer; a phone keeps its stacked page
test("the main view follows where the task is up to: the work with Came from on the left, or the task with the work on the right", () => {
  assert.equal(mainOf({ sessionView: true }), "work", "a live agent");
  assert.equal(mainOf({ focus: "agent" }), "work", "its Result or its failure");
  assert.equal(mainOf({ focus: "reply", drafted: true }), "work", "Close out with a draft");
  // ...nothing drafted yet: the task is the page and the right tab is lit (the owner, 2026-10-26: "highlight the side bar")
  assert.equal(mainOf({ focus: "reply" }), "task", "a reply nothing has drafted");
  assert.equal(nextInDrawer({ main: "task", focus: "reply" }), true);
  assert.equal(nextInDrawer({ main: "task", focus: "source" }), true, "an ask nothing has worked: the agent is next");
  assert.equal(nextInDrawer({ main: "task", focus: "list" }), false, "a to-do's list is itself the move");
  assert.equal(nextInDrawer({ main: "work", focus: "agent" }), false, "Came from is context, never lit");
  // ...and ONLY the task's own next move lights it (the owner, 2026-10-26: "advisor should not light drawer for no reason"): the page's
  // focus, never a word of the Advisor's - the lit tab reads main and focus, and focus is read off the task alone
  assert.equal(nextInDrawer({ main: "task", focus: "list", advice: { verb: "reply" } }), false, "advice lights no tab");

  assert.equal(mainOf({ focus: "list" }), "task", "a to-do or a goal's steps");
  assert.equal(mainOf({ focus: "source" }), "task", "an ask nothing has worked yet");
  assert.equal(mainOf({ focus: "none" }), "task", "a wait on a person");
  assert.equal(mainOf({ focus: "agent", stacked: true }), null, "a phone's stacked page");
  assert.equal(mainOf({ sessionView: true, stacked: true }), "work", "a live agent on a phone too");
});

test("the work column opens the agent or the reply - and what the task is for where the focus named the task", () => {
  assert.equal(workPane({ stage: "agent" }), "agent");
  assert.equal(workPane({ stage: "reply" }), "reply");
  assert.equal(workPane({ stage: "task", kind: "reply", hasSender: true }), "reply", "a reply to somebody opens the reply");
  assert.equal(workPane({ stage: "task", kind: "task", hasSender: true }), "reply");
  assert.equal(workPane({ stage: "task", kind: "coding", hasSender: true }), "agent", "an agent's task opens its plan and start");
  assert.equal(workPane({ stage: "task", kind: "general", hasSender: false }), "agent");
  assert.equal(workPane({ stage: "task", kind: "task", hasSender: false }), "agent", "nobody to answer: the agent half");
  assert.equal(workPane({ stage: "task", kind: "task", codeRun: true }), "reply", "a run of steps has no agent card");
});

// ...and an agent's Result stays open on a task nobody sent, where Stop and save opened an empty Close out under a Result folded to
// two lines (the owner, 2026-10-22: "since it gets crunched down you can not really see the agent report")
test("Stop and save on a task nobody sent keeps its Result open; a reply, a close or a hand-picked Close out still opens Close out", () => {
  assert.equal(workPane({ stage: "reply", kind: "coding", hasSender: false, result: true }), "agent", "nothing in the reply half: the Result");
  assert.equal(workPane({ stage: "reply", kind: "coding", hasSender: true, result: true }), "reply", "a reply is being drafted there");
  assert.equal(workPane({ stage: "reply", kind: "coding", hasSender: false, result: true, replyHas: true }), "reply", "a close, emails, a failed write-up");
  assert.equal(workPane({ stage: "reply", kind: "coding", hasSender: false, result: true, picked: true }), "reply", "Close out opened by hand");
  assert.equal(workPane({ stage: "reply", kind: "coding", hasSender: false, result: false }), "reply", "no Result: nothing to show instead");
});

test("Close out under a Result on a task nobody sent: no 'Nobody sent this one', no reply pill, the write-up under the Result", () => {
  const pending = { state: "pending", stage: "report" }, failed = { state: "failed", error: "no screen" };
  assert.deepEqual(closeOut({ hasSender: false, result: true, writeup: pending }), { advice: false, chip: false, writeupAt: "result" });
  assert.deepEqual(closeOut({ hasSender: false, result: true }), { advice: false, chip: false, writeupAt: null });
  assert.equal(closeOut({ hasSender: false, result: true, writeup: failed }).writeupAt, "closeout", "a failure keeps its Try again in Close out");
  // ...and a reply being drafted is the same one line in the Agent pane (2026-10-29: two spinners in Close out on one Stop)
  assert.deepEqual(closeOut({ hasSender: true, result: true, writeup: pending }), { advice: true, chip: true, writeupAt: "result" });
  assert.equal(closeOut({ hasSender: true, result: false, writeup: pending }).writeupAt, "result", "no Result yet: still the Agent pane");
  assert.equal(closeOut({ hasSender: true, result: true, writeup: failed }).writeupAt, "closeout");
  // ...and an open task nobody sent, nothing done yet, keeps its advice
  assert.deepEqual(closeOut({ hasSender: false, result: false }), { advice: true, chip: true, writeupAt: null });

});

test("From folds to who and how many", () => {
  assert.ok(fromLine({ sender: { FromName: "Gail Moreno", Channel: "email" }, count: 3 }).includes("Gail Moreno"));
  assert.ok(fromLine({ sender: { FromEmail: "gail@northwind.example" }, count: 1 }).includes("gail@northwind.example"));
  assert.ok(fromLine({ sender: { Channel: "whatsapp" }, count: 8 }).includes("8"));
  assert.ok(fromLine({ workflow: { title: "Nightly check" } }).includes("Nightly check"));
  assert.equal(fromLine({ made: "TQ-0007 · made by you 1h ago" }), "TQ-0007 · made by you 1h ago");
});

// FROM LISTS MANY ITEMS, NEWEST ON TOP: a burst of chat lines, a thread with your replies in it - the latest few, then "Show N older"
test("From reads newest on top, the older ones folded behind Show N older", async () => {
  const { fromExpands, fromRows, groupConversations } = await import("../src/taskSources.js");
  const at = (h, m) => `2026-10-21 ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
  const burst = [["Ray Colton", 7, 58], ["Gail Moreno", 8, 2], ["Ray Colton", 8, 10], ["Gail Moreno", 8, 14], ["Ray Colton", 8, 15], ["Gail Moreno", 8, 21]]
    .map(([who, h, m], i) => ({ MessageId: i + 1, Channel: "whatsapp", SourceName: "Site ops", FromName: who, SentAt: at(h, m), BodyText: `line ${i + 1}` }));
  const [g] = groupConversations(burst);
  const rows = fromRows(g, 3);
  assert.deepEqual(rows.slice(0, 3).map((r) => r.m.MessageId), [6, 5, 4], "the newest three, newest first");
  assert.equal(rows[3].older, 3, "then how many older");
  assert.match(rows[3].names, /Ray Colton/);
  assert.equal(rows.length, 4, "the opening message is not pinned under a gap any more");
  assert.deepEqual(fromRows(g, 3, true).map((r) => r.m.MessageId), [6, 5, 4, 3, 2, 1], "Show older draws every one, still newest first");
  assert.equal(fromRows({ msgs: g.msgs.slice(0, 4) }, 3).length, 4, "one more than it keeps is drawn, never folded to 'Show 1 older'");
  assert.equal(fromExpands([g]), true);
  // an email thread with your reply in it reads in its order, your line among theirs
  const thread = groupConversations([
    { MessageId: 10, Channel: "email", ConversationId: "c1", Subject: "AP cutover", FromName: "Gail Moreno", SentAt: at(9, 12), BodyText: "Can you confirm?" },
    { MessageId: "review:3", Channel: "email", ConversationId: "c1", Subject: "AP cutover", FromName: "You", Direction: "out", Status: "context", SentAt: at(9, 40), BodyText: "Yes, Monday." },
    { MessageId: 11, Channel: "email", ConversationId: "c1", Subject: "RE: AP cutover", FromName: "Gail Moreno", SentAt: at(10, 5), BodyText: "Thanks!" }]);
  assert.equal(thread.length, 1, "one thread");
  assert.deepEqual(fromRows(thread[0]).map((r) => r.m.MessageId), [11, "review:3", 10]);
  assert.equal(fromExpands(thread), false, "three letters: nothing folded");
});

// THE TASK-VIEW CLEANUP (owner-approved 2026-10-25): the ask said once, and a task handed to a person opens on who it waits on
test("the ask is the message's own words only when they are the same words, spacing aside", () => {
  assert.ok(sameWords("Are we still on\nfor Thursday?","Are we still on  for Thursday? "));
  assert.ok(!sameWords("Confirm the Thursday cutover", "Are we still on for Thursday?"));
  assert.ok(!sameWords("", ""), "no ask is not the body");
});

test("a task waiting on a person says who and when it was due", () => {
  const now = new Date(2026, 9, 25, 9, 0);
  const task = { Status: "waiting", Assignee: "person:erin.blake@northwind.example", DueAt: "2026-10-23" };
  assert.equal(holderName("erin.blake@northwind.example"), "Erin Blake");
  const late = waitingOn({ task, now });
  assert.equal(late.name, "Erin Blake");
  assert.ok(late.line.includes("Erin Blake"));
  assert.ok(late.line.includes("2"), "the overdue day count is shown");
  assert.equal(waitingOn({ task, now, messages: [{ FromEmail: "Erin.Blake@northwind.example", FromName: "Erin B." }] }).name, "Erin B.");
  assert.notEqual(waitingOn({ task: { ...task, DueAt: "" }, now }).line, late.line);
  assert.notEqual(waitingOn({ task: { ...task, DueAt: "2026-10-30" }, now }).line, late.line);
  assert.equal(waitingOn({ task: { ...task, Status: "open" }, now }), null, "not waiting");
  assert.equal(waitingOn({ task: { ...task, Assignee: "agent:coding" }, now }), null, "an agent is not a person it waits on");
});

// THE THREE SECTIONS' CLOSED TABS (the owner, 2026-10-27): the flow's order, and a few short lines each - at the top who and what, at the
// foot (a book's spine) the one status line
test("the three sections come in the flow's order, and each closed tab says where it stands", () => {
  assert.deepEqual(SECTIONS.map((s) => s.key), ["from", "agent", "close"]);
  const from = fromStatus({ channel: "WhatsApp", count: 5, sorted: "sorted facts",
    msgs: [{ who: "Erin Blake", words: "So let's\nbuild one." }, { who: "You", words: "A link" }, { who: "Ray Colton", words: "Old" }] });
  assert.ok(from.lines[0].includes("5"));
  assert.deepEqual(from.lines.slice(1), ["Erin Blake: “So let's build one.”", "You: “A link”", "Ray Colton: “Old”"]);
  assert.ok(from.foot.includes("sorted facts"));
  assert.ok(fromStatus({ workflow: { title: "Nightly check" } }).lines[0].includes("Nightly check"));
  // ...and a long chat gives the spine no more lines than it can hold: the newest, the rest never drawn to be measured and hidden (2026-11-01)
  const chat = fromStatus({ channel: "WhatsApp", count: 1500, msgs: Array.from({ length: 1500 }, (_, i) => ({ who: "Gail Moreno", words: `line ${1500 - i}` })) });
  assert.equal(chat.lines.length, 1 + TAB_MOST); assert.equal(chat.lines[1], "Gail Moreno: “line 1500”");
  // ...an email's first line is its sender, never the owner's own mailbox it came into; a chat's is its room (the overnight run, 2026-11-03)
  assert.equal(cameFrom({ Channel: "email", SourceName: "alex@northwind.example", FromName: "Gail Moreno", FromEmail: "gail@northwind.example" }), "Gail Moreno");
  assert.equal(cameFrom({ Channel: "email", SourceName: "alex@northwind.example", FromEmail: "gail@northwind.example" }), "gail@northwind.example");
  assert.equal(cameFrom({ Channel: "whatsapp", SourceName: "Finance team", FromName: "Ray Colton" }), "Finance team");
  assert.equal(agentWord({}), "not started");
  assert.equal(agentWord({ live: true, waiting: true }), "needs you");
  assert.equal(agentWord({ failed: true, result: true }), "failed");
  assert.equal(agentWord({ stopped: true, result: true }), "stopped");
  assert.equal(agentWord({ result: true }), "finished");
  const agent = agentStatus({ profile: "assistant", word: "finished", said: "Wrote a one-page plan.", made: "Plan for a first box", advisor: "Send" });
  assert.ok(agent.lines[0].includes("assistant"));
  assert.equal(agent.lines[1], "Wrote a one-page plan.");
  assert.ok(agent.lines[2].includes("Plan for a first box"));
  assert.ok(agent.foot.includes("Send"));
  assert.equal(agentStatus({}).foot, "");
  const draft = closeStatus({ to: "Erin Blake", where: "WhatsApp", draft: "On it.", waiting: true }).lines;
  assert.ok(draft[0].includes("Erin Blake") && draft[0].includes("WhatsApp"));
  assert.equal(draft[1], "“On it.”");
  assert.notDeepEqual(draft, closeStatus({ to: "Erin Blake", where: "WhatsApp", draft: "On it.", sent: true }).lines);
  assert.ok(closeStatus({ emails: 2 }).lines.some((line) => line.includes("2")));
  assert.ok(closeStatus({ closed: true, note: "paid" }).lines.some((line) => line.includes("paid")));
});

// the state matrix (2026-10-28): the Agent tab read "AGENT REPORT" - the report's marker, not what it said
test("a report's line is its Summary, never its AGENT REPORT marker", () => {
  assert.equal(reportLine("AGENT REPORT\nDetermination: Ray has it.\nActions: Read the sheet.\nSummary: Ray has the code."), "Ray has the code.");
  assert.equal(reportLine("AGENT REPORT\nDetermination: Ray has it."), "Ray has it.");
  assert.equal(reportLine("Looked at the sheet."), "Looked at the sheet.");
  assert.equal(reportLine(""), "");
  // a first line ending on a colon carries the line it opens - never "It says:" and nothing (the email walk, 2026-10-29)
  assert.equal(reportLine("AGENT REPORT\nThe vendor page says:\nRegistration closes Friday."), "The vendor page says: Registration closes Friday.");
  assert.equal(reportLine("Summary: It says:"), "Summary: It says:".replace(/^Summary:\s*/, ""));
});

// ANSWERED OUTSIDE TASKUARY (the owner, 2026-10-29): Erin wrote twice in Teams, the owner answered her there. The Advisor's Mark done names
// Close out as the section its move is in, so the task opens there - with its line there, not under an Agent nobody started
test("the Advisor's pick names the section the task opens on, and its line stands there", () => {
  assert.equal(sectionHere({ stage: "to_reply", advised: "close" }), "close");
  assert.equal(sectionHere({ stage: "to_reply" }), "from", "no section named: the stage's");
  assert.equal(sectionHere({ stage: "agent_working", advised: "close" }), "agent", "a live agent's page is its own");
  assert.equal(sectionHere({ stage: "done", advised: "close" }), "close");
  assert.equal(sectionHere({ stage: "to_reply", advised: "elsewhere" }), "from", "only one of the three sections");
  assert.equal(advisorAt("close"), "close");
  assert.equal(advisorAt(""), "agent");
  assert.ok(closeStatus({ to: "Erin Blake", sent: true, advisor: "Mark done" }).foot.includes("Mark done"));
  assert.equal(agentStatus({ word: "not started" }).foot, "");
});

test("Close out knows the owner answered outside Taskuary, and says so", () => {
  const ins = [1, 2].map((i) => ({ MessageId: i, Direction: "in", Status: "routed", FromName: "Erin Blake", SentAt: `2026-10-29 11:${i}0:00` }));
  const own = { MessageId: 3, Direction: "out", Status: "context", FromName: "You", Channel: "teams", SourceName: "Teams", SentAt: "2026-10-29 12:10:00" };
  assert.equal(answeredOutside({ messages: [...ins, own], outside: [own] }), own);
  assert.equal(answeredOutside({ messages: [...ins, own], outside: [own], pending: true }), null, "a draft waiting is a decision nobody took");
  const again = { ...ins[0], MessageId: 4, SentAt: "2026-10-29 12:30:00" };
  assert.equal(answeredOutside({ messages: [...ins, own, again], outside: [own] }), null, "she wrote again after it");
  const sentHere = { MessageId: "review:9", ReviewSent: true, Direction: "out", SentAt: "2026-10-29 12:20:00" };
  assert.equal(answeredOutside({ messages: [...ins, own, sentHere], outside: [own] }), null, "a reply sent from here since is not outside");
  assert.equal(answeredOutside({ messages: ins, outside: [] }), null);
  const line = outsideLine({ who: "Erin Blake", where: "Teams", when: "at 12:10 PM" });
  for (const w of ["Erin Blake", "Teams", "at 12:10 PM"]) assert.ok(line.includes(w), w);
});

// WHERE THE CHAT IS HOME (phase 4, Task 4.1): a general or reply task shows Came from and the agent, opens on the agent, and Mark done,
// Close with a note, Attach and Share ride the agent's strip; a coding task, a plain task and a live terminal keep their three sections
test("a task whose home is the chat shows Came from and the agent, and opens on the chat", () => {
  assert.equal(chatHome({ kind: "general" }), true);
  assert.equal(chatHome({ kind: "reply" }), true);
  assert.equal(chatHome({ kind: "coding" }), false);
  assert.equal(chatHome({ kind: "task" }), false);
  assert.equal(chatHome({ kind: "general", terminal: true }), false);
  // ...nor a kind not known yet: a coding task never draws two sections before its detail lands
  assert.equal(chatHome({}), false);
  assert.equal(chatHome({ kind: "" }), false);
  // ...and the terminal that keeps three is a coding one: a general agent's own live chat ("assistant" mode) is still home
  assert.equal(liveTerminal({ alive: true, mode: "pty" }), true);
  assert.equal(liveTerminal({ alive: true }), true);
  assert.equal(liveTerminal({ alive: true, mode: "assistant" }), false);
  assert.equal(liveTerminal({ alive: false, mode: "pty" }), false);
  assert.equal(liveTerminal(null), false);
  assert.equal(liveTerminal(undefined), false);
  assert.equal(chatHome({ kind: "general", terminal: liveTerminal({ alive: true, mode: "assistant" }) }), true);
  assert.deepEqual(taskSections(true).map((s) => s.key), ["from", "agent"]);
  assert.equal(taskSections(false), SECTIONS);
  assert.equal(homeSection(true, "close"), "agent");
  assert.equal(homeSection(false, "close"), "close");
});
