import assert from "node:assert/strict";
import test from "node:test";

import { agentAsks, alreadyAnswered, answeredLine, askWhere, autoPair, draftKey, isAgentDraft, noticeLine } from "../src/agentDraftAsk.js";

// THE AGENT'S DRAFT IS SAID WHERE THE AGENT IS AND SENT FROM CLOSE OUT (the owner, 2026-11-02: "in agent we should just say 'agent drafted a
// message' and take you to the Close out screen"), and a draft the owner already answered says so. Invented people only.
const mine = { ReviewId: 7, Kind: "draft_reply", Status: "pending", DraftText: "Hi Erin - which week should the report cover?", DraftBy: "agent:Claude Code",
  MessageId: 40, FromName: "Erin Blake", FromEmail: "erin@northwind.example" };

test("only a pending draft the agent wrote is said in the agent's pane", () => {
  assert.equal(isAgentDraft(mine), true);
  assert.equal(isAgentDraft({ ...mine, Kind: "clarification", DraftBy: "" }), true, "the agent's question to the sender");
  assert.equal(isAgentDraft({ ...mine, DraftBy: "responder" }), false, "Taskuary's own draft is Close out's alone");
  assert.equal(isAgentDraft({ ...mine, Status: "approved" }), false, "sent: the notice goes");
  assert.equal(isAgentDraft({ ...mine, Status: "no_reply" }), false, "dropped: the notice goes");
  assert.equal(isAgentDraft({ ...mine, DraftText: "  " }), false);
  assert.equal(isAgentDraft({ ...mine, Kind: "slot" }), false, "an email the task owes is Close out's");
  const two = { ...mine, ReviewId: 8 };
  assert.deepEqual(agentAsks([{ ReviewId: 6, Kind: "draft", Status: "pending", DraftText: "Thanks" }, mine, two]).map((r) => r.ReviewId), [7, 8], "one notice per draft");
  assert.deepEqual(agentAsks(undefined), []);
});

test("the notice names the agent and the person, never the address", () => {
  const notice = noticeLine(mine, "Taskuary");
  assert.ok(notice.includes("Claude Code") && notice.includes("Erin Blake"));
  assert.ok(!notice.includes("erin@northwind.example"));
  const question = noticeLine({ ...mine, Kind: "clarification", DraftBy: "" }, "Taskuary");
  assert.ok(question.includes("Taskuary") && question.includes("Erin Blake"));
  assert.notEqual(question, notice);
  assert.equal(askWhere("live"), "popup");
  assert.equal(askWhere("general"), "chat");
  for (const m of ["wrapping", "", null, undefined]) assert.equal(askWhere(m), null);
});

test("already answered: a reply to that person newer than the message the draft answers - outside Taskuary or from here", () => {
  const against = { MessageId: 40, FromEmail: "erin@northwind.example", SentAt: "2026-11-02 09:00:00" };
  const outside = { at: "2026-11-02 09:30:00", text: "Hi Erin, the report covers the week of the 26th - all of it, night shift too.",
    msg: { RecipientsJson: JSON.stringify({ to: ["erin@northwind.example"] }) } };
  const a = alreadyAnswered({ draft: mine, sent: [outside], against });
  assert.equal(a.who, "Erin Blake");
  assert.equal(a.at, "2026-11-02 09:30:00");
  assert.ok(a.words.startsWith("Hi Erin, the report covers") && a.words.endsWith("...") && a.words.length < 70, a.words);
  const line = answeredLine(a, () => "9:30 AM");
  assert.ok(line.includes("Erin Blake") && line.includes("9:30 AM") && line.includes(a.words));
  const fromHere = { at: "2026-11-02 10:00:00", text: "Sent from Taskuary", review: { ReviewId: 3, FromEmail: "erin@northwind.example" } };
  assert.equal(alreadyAnswered({ draft: mine, sent: [outside, fromHere], against }).words, "Sent from Taskuary", "the newest one");
  // ...not: one older than the message the draft answers, one to someone else, the draft itself, or nothing at all
  assert.equal(alreadyAnswered({ draft: mine, sent: [{ ...outside, at: "2026-11-02 08:00:00" }], against }), null);
  assert.equal(alreadyAnswered({ draft: mine, sent: [{ ...outside, msg: { RecipientsJson: '["gail@northwind.example"]' } }], against }), null);
  assert.equal(alreadyAnswered({ draft: mine, sent: [{ ...fromHere, review: mine }], against }), null);
  assert.equal(alreadyAnswered({ draft: null, sent: [outside], against }), null);
  assert.equal(answeredLine(null), "");
});


test("the reply opens beside an agent that is not working, once per draft and view, never again once the owner closed it", () => {
  const at = { draft: mine, canPair: true, view: "7|true" };
  assert.equal(autoPair(at), true, "waiting, stopped or finished: Agent | Close out");
  assert.equal(autoPair({ ...at, working: true }), false, "a working terminal is never squeezed - its notice's press pairs them");
  assert.equal(autoPair({ ...at, canPair: false }), false, "a work area too narrow for two halves: Close out on its own, as today");
  assert.equal(autoPair({ ...at, paired: true }), false);
  assert.equal(autoPair({ ...at, draft: null }), false);
  assert.equal(autoPair({ ...at, shut: new Set([draftKey(mine)]) }), false, "closed for this draft stays closed");
  assert.equal(autoPair({ ...at, shut: new Set([draftKey({ ...mine, DraftText: "older words" })]) }), true, "a new letter from the agent is a new draft");
  assert.equal(autoPair({ ...at, done: new Set([`${draftKey(mine)}|7|true`]) }), false, "once in this view");
  assert.equal(autoPair({ ...at, view: "7|false", done: new Set([`${draftKey(mine)}|7|true`]) }), true, "the agent stopped: a new view, paired again");
});
