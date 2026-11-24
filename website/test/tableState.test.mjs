// ONE RECORD OF WHAT IS ON THE TABLE (general fix 4, 2026-10-18): folded or under a page, the item keeps its key and the Advisor
// keeps quiet; "Thinking..." only while a judgement is in flight; a Board-opened task hears its Advisor line.
import test from "node:test";
import assert from "node:assert/strict";
import { adviceRead, overChat, tableOf, tableWords } from "../src/tableState.js";


test("folded by its X or under a page, the item stays on the table and the Advisor keeps quiet", () => {
  assert.deepEqual(tableOf({ current: "task:7" }), { key: "task:7", folded: false, place: false, speaks: true });
  assert.deepEqual(tableOf({ current: "task:7", foldedKey: "task:7" }), { key: "task:7", folded: true, place: false, speaks: false });
  assert.equal(tableOf({ cardKey: "task:9", browsing: "b123" }).speaks, false, "a page opened over it: no strip, no button acting on it");
  assert.equal(tableOf({ current: "task:7", setup: true }).speaks, false);
  // ...but a task opened over setup is in view, and its Advisor speaks (2026-10-26); folded or under a page it still keeps quiet
  assert.equal(tableOf({ cardKey: "task:7", setup: true, over: true }).speaks, true);
  assert.equal(tableOf({ cardKey: "task:7", setup: true, over: true, browsing: "b1" }).speaks, false);
  assert.equal(tableOf({ cardKey: "task:7", foldedKey: "task:7", setup: true, over: true }).speaks, false);
  assert.equal(tableOf({}).key, null);
});
// G5 (2026-10-19 UI walk): Connections opened over TQ-0003 and the rail still said "on the table", the box "Ask about this one"
test("a page over the item: the box says it is under the page, not in view", () => {
  const under = tableWords(tableOf({ current: "task:3", browsing: "b1" }), "TQ-0003");
  assert.equal(under.box, "Ask about this page…", "the ask is about the page alone, never the task under it (2026-11-05)");
  assert.equal(under.phone, "Ask about this page…");
  const shown = tableWords(tableOf({ current: "task:3" }), "TQ-0003");
  assert.match(shown.box, /^Ask about this one/);
  // ...the open box over a task, and a phone's: "Talk to Taskuary…" (the owner, 2026-10-28), the resting pill still "Ask…"
  assert.equal(shown.phone, "Ask Taskuary…", "the pill is the Assistant (the owner, 2026-11-06) - by its name, Taskuary (2026-11-15)");
  assert.equal(shown.name, "Tell Taskuary what to do with TQ-0003", "the pill names the task its words do not");
  assert.equal(under.name, "Ask Taskuary about this page");
  assert.match(tableWords(tableOf({ cardKey: "task:9" })).box, /^Ask about this one/, "a task opened by name is on the table too");
  assert.match(tableWords(tableOf({ browsing: "b1" })).box, /^Ask Taskuary/, "a page with nothing under it");
});

// NO "THINKING..." (the owner, 2026-10-23): the server answers at once with the Advisor's one decision - a lit verb, silent or with its
// fact - and the page keeps every answer it reads for the key it asked about
test("the Advisor's decision is read whole, silent or not, and nothing is ever a spinner", () => {
  assert.deepEqual(adviceRead({ pending: true }, "task:7"), { advice: null }, "an old server's pending is no spinner");
  assert.equal(adviceRead({ verb: "reply", line: "" }, "task:7").advice.verb, "reply", "an obvious move: lit, said by nothing");
  assert.equal(adviceRead({ verb: "chase", line: "Ray Colton: 4 days, no answer." }, "task:7").advice.for, "task:7");
  assert.equal(adviceRead({ verb: null, state: "agent_asking", line: "" }, "task:7").advice.state, "agent_asking", "nothing lit is an answer too");
  for (const why of ["no_ai", "off", "nothing"]) assert.equal(adviceRead({ none: why }, "task:7").advice.none, why, why);
  assert.deepEqual(adviceRead({}, "task:7"), { advice: null });
});


// the owner, 2026-11-06: "there used to be button to clear the chat??" - on the home screen the icons left the head for the pill
test("the Assistant's own icons: in the head on the home screen, in the pill only while a task or page is open over the chat", () => {
  assert.equal(overChat(tableOf({})), false, "home: nothing on the table");
  assert.equal(overChat(tableOf({ current: "task:7", foldedKey: "task:7" })), false, "a task folded by its X: the chat is back");
  assert.equal(overChat(tableOf({ current: "task:7" })), true, "a task open");
  assert.equal(overChat(tableOf({ browsing: "b1" })), true, "a page (Settings) open");
  assert.equal(overChat(tableOf({ cardKey: "task:9", foldedKey: "task:9", browsing: "b1" })), true, "a page over a folded task");
});

// The configured assistant name is the one used by chat prompts.
test("the chat prompt uses Taskuary's configured name", async () => {
  const fs = await import("node:fs");
  const kinds = JSON.parse(fs.readFileSync(new URL("../../taskuary/kinds.json", import.meta.url), "utf8"));
  const { ASSISTANT_NAME, ASK_ASSISTANT } = await import("../src/kinds.js");
  assert.equal(kinds.assistant, "Taskuary");
  assert.equal(ASSISTANT_NAME, "Taskuary");
  assert.equal(ASK_ASSISTANT, "Ask Taskuary…");
  const none = tableWords(tableOf({}));
  assert.equal(none.box, "Ask Taskuary — a name or a subject pulls it in…");
  assert.equal(none.phone, "Ask Taskuary…");
  assert.equal(none.name, "Ask Taskuary");
});
