// "it should be a distinct setup mode vs regular operations mode" (the owner, 2026-10-15): while setting up, the rail is the steps,
// the canvas is setup alone, the chat box and the Advisor line are off, and Finish is the owner's press in the row.
import test from "node:test";
import assert from "node:assert/strict";

// SERVER-SHAPED STATES: which rows are done and open is the server's (firstrun.rail - tests/test_setup_state.py pins it); this file
// tests the page's part - the row on the canvas, Back/Next/Finish, where setup opens
const row = (key, done, open = true) => ({ key, done, open, optional: key === "other", need: `${key} first`, sub: "" });
const rail = (done, open, extra = {}) => ({ rail: ["ai", "mail", "about", "other", "finish"].map((k) => row(k, done.includes(k), open.includes(k))), ...extra });
const AI = rail([], ["ai", "other"], { frontier: "ai" });
const EMAIL = rail(["ai"], ["ai", "mail", "other"], { frontier: "mail" });
const READING = rail(["ai", "mail"], ["ai", "mail", "about", "other"], { frontier: "about" });
const READY = rail(["ai", "mail", "about"], ["ai", "mail", "about", "other", "finish"], { frontier: "other", ready: true });
const FINISHED = rail(["ai", "mail", "about", "finish"], ["ai", "mail", "about", "other", "finish"], { frontier: "other", ready: true, dismissed: true });

test("the steps say what is done and what is next", async () => {
  const { stepsOf } = await import("../src/setupSteps.js");
  const at = (st) => stepsOf(st).find((r) => r.current)?.key;
  assert.equal(at(AI), "ai");
  assert.equal(at(EMAIL), "mail");
  assert.equal(at(READING), "about");
  assert.equal(at(READY), "finish");
  assert.deepEqual(stepsOf({ step: "ai" }), [], "no rail from the server, no rows made up here");
});

test("setup reopens on the first step not done, and on Your AI only when every step is", async () => {
  const { openAt } = await import("../src/setupSteps.js");
  assert.equal(openAt(READING, true), "about");
  assert.equal(openAt(EMAIL, true), "mail");
  assert.equal(openAt(READY, true), "ai");
  assert.equal(openAt(READY, false), "other");
});

// "i went back to change the ai but could not go forward again to my email without clicking the sidebar ... while it's loading the
// email it shows it's up to survey step on left sidebar ... when does it allow you to turn off setup mode? it should be after
// email/ai/survey rest is optional" (the owner, 2026-10-15)
test("the rail marks the step on the canvas, not the first one unfinished", async () => {
  const { stepsOf } = await import("../src/setupSteps.js");
  assert.equal(stepsOf(READING, "mail").find((r) => r.current).key, "mail");
  assert.equal(stepsOf(READING).find((r) => r.current).key, "about");
});

test("Finish is open once AI, email and About your work are done - the rest is optional", async () => {
  const { navMoves } = await import("../src/setupSteps.js");
  assert.equal(navMoves(READY, "other").find((m) => m.id === "finish").disabled, false);
  assert.equal(navMoves(READING, "other").find((m) => m.id === "finish").disabled, true);
});

test("every step has Back and Next; Next waits for the step to be done; the last step is Finish setup alone", async () => {
  const { navMoves, frontierOf, nextOf, prevOf } = await import("../src/setupSteps.js");
  const ids = (st, v, r) => navMoves(st, v, r).map((m) => m.id + (m.disabled ? "-" : ""));
  assert.deepEqual(ids(AI, "ai"), ["next-"]);
  assert.equal(navMoves(AI, "ai")[0].why, "ai first", "Next says what it waits for, in the server's words");
  assert.deepEqual(ids(EMAIL, "ai"), ["next"]);
  assert.deepEqual(ids(EMAIL, "mail"), ["back", "next-"]);
  assert.deepEqual(ids(READING, "mail"), ["back", "next"]);
  assert.deepEqual(ids(READING, "about"), ["back", "next-"]);
  // no Walk me through my tasks in setup: it is the day's move once setup is finished (the owner, 2026-10-15)
  assert.deepEqual(ids(READY, "other"), ["back", "finish"]);
  assert.deepEqual(ids(READING, "other"), ["back", "finish-"]);
  assert.deepEqual(ids(FINISHED, "mail", true), ["back", "next", "finish"]);
  assert.equal(frontierOf(EMAIL), "mail"); assert.equal(frontierOf(READING), "about"); assert.equal(frontierOf(null), "ai");
  assert.equal(nextOf("mail"), "about"); assert.equal(prevOf("about"), "mail"); assert.equal(prevOf("ai"), "ai");
});

// the non-coder audit, 2026-10-17: About your work pressed on the rail from Your AI, then saved, put "Setup complete" over a day with
// no AI and no mail - and "Finish" ticked on a setup put away early
test("a rail row past what is done is disabled until it is reachable", async () => {
  const { stepsOf, reachable } = await import("../src/setupSteps.js");
  const row = (st, k) => stepsOf(st).find((r) => r.key === k);
  // what a waiting row says, and when Finish ticks, are the server's (firstrun.rail); the page disables what is not open
  assert.equal(row(AI, "about").disabled, true); assert.equal(row(AI, "mail").disabled, true);
  assert.equal(row(AI, "other").disabled, false, "the optional ones never wait");
  assert.equal(row(READING, "about").disabled, false);
  assert.equal(reachable(AI, "about"), false); assert.equal(reachable(EMAIL, "mail"), true);
});

// the 2026-10-19 UI walk: Back from More connections opened About your work while the email was not in yet - a locked step the rail
// itself refuses - and the Advisor spoke about answers never given. Back steps over a locked step; every go() lands on an open one.
test("Back never lands on a locked step, and no move does", async () => {
  const { prevOf, landOn } = await import("../src/setupSteps.js");
  assert.equal(prevOf("other", EMAIL), "mail", "About your work waits for the email: Back from More connections is the email");
  assert.equal(prevOf("other", AI), "ai", "...and with no AI, the AI");
  assert.equal(prevOf("other", READING), "about", "an open step is still the step before");
  assert.equal(prevOf("about", EMAIL), "mail");
  assert.equal(landOn(EMAIL, "about"), "mail"); assert.equal(landOn(READING, "about"), "about");
  assert.equal(landOn(AI, "done"), "done", "Setup complete is not a rail step");
  assert.equal(landOn(null, "about"), "about", "before the state is read nothing is refused");
});
