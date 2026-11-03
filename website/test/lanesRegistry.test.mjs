// ONE LANES REGISTRY: every count, section and kind word the page says is built from taskuary/lanes.json - the server builds the
// same tables from the same file (tests/test_lanes_registry.py), so a rule changed there changes on both sides at once.
import test from "node:test";
import assert from "node:assert/strict";
import vocab from "../../taskuary/lanes.json" with { type: "json" };
import { KIND, attentionBand, isAgentKind, isMail, levelOf, onYou, toRead, waitsOnYou } from "../src/lanes.js";
import { getLocale, setLocale } from "../src/i18n.js";
import { statusLine, waitedText } from "../src/funnelPile.js";
import { needsYou, zoneOf } from "../src/assistantGame.js";
import { summarize } from "../src/walkSummary.js";


test("a row with no band lands where its lane's entry says, every lane", () => {
  for (const l of vocab.lanes) {
    assert.ok(vocab.sections.some((s) => s.key === l.section), `${l.key} names no section`);
    assert.equal(typeof l.on_you, "boolean", `${l.key} does not say whether it is on you`);
    assert.equal(levelOf({ lane: l.key }), l.section, l.key);
  }
  // settled: an unjudged row is FYI while the retry may still judge it (the server's rule), the owner's once it gave up
  assert.equal(levelOf({ lane: "unjudged" }), "fyi");
  assert.equal(levelOf({ lane: "unjudged", held: true }), "task");
  // ...and an ask triage called urgent is Urgent here as on the server
  assert.equal(attentionBand({ lane: "asked", urgent_request: true }), 1);
  assert.equal(attentionBand({ lane: "report", urgent_request: true }), 3);
});

test("on you is one answer: the header, the opener's sections, the game's red count", () => {
  const pile = [
    { key: "a", lane: "asked", order_band: 2 }, { key: "y", lane: "yours", order_band: 2 }, { key: "b", lane: "blocked", order_band: 2 },
    { key: "t", lane: "theirs", order_band: 2 }, { key: "l", lane: "yours", order_band: 2, deferred: true },
    { key: "f", lane: "fyi", order_band: 4 }, { key: "r", lane: "report", order_band: 3 }, { key: "w", lane: "working", order_band: 2 },
    { key: "m", lane: "time", order_band: 1 }, { key: "s", lane: "asked", order_band: 2, settling: true },
  ];
  const you = pile.filter((i) => onYou(i)).map((i) => i.key);
  // an agent at work and waiting on them are under Tasks but not on you (2026-10-21); For later, reading and a settling row neither
  assert.deepEqual(you, ["a", "y", "b", "m"], "waiting on them, For later, reading, an agent at work and a settling row are not on you");
  assert.equal(levelOf(pile[7]), "task", "an agent at work is under Tasks");
  const previous = getLocale();
  try {
    for (const locale of ["en", "zh-CN"]) {
      setLocale(locale);
      const line = statusLine(pile);
      assert.match(line, /\b10\b/);
      assert.match(line, /\b4\b/, "the header counts only rows on you");
    }
  } finally { setLocale(previous); }
  assert.deepEqual(pile.filter(needsYou).map((i) => i.key), you);
  const groups = summarize(pile).groups;
  assert.equal(groups.reduce((n, g) => n + g.you, 0), 4, "the opener's headline counts a different set");
  assert.deepEqual(pile.filter((i) => toRead(i)).map((i) => i.key), ["f", "r"]);
  assert.ok(waitsOnYou({ lane: "blocked" }) && waitsOnYou({ lane: "approve" }) && !waitsOnYou({ lane: "yours" }));
  assert.equal(waitedText({ lane: "theirs", order_band: 2, since: "2020-01-01 00:00:00" }), "");
  assert.ok(waitedText({ lane: "stopped", order_band: 2, since: "2020-01-01 00:00:00" }));
});

test("every kind is classified as mail or agent news and placed in its game zone", () => {
  for (const [k, v] of Object.entries(KIND)) {
    assert.equal(isMail({ kind: k }), !!v.mail); assert.equal(isAgentKind(k), !!v.agent);
  }
  // the game: an agent's own news at its desk, a finished task in the gym, mail an agent drafted at the meeting table
  assert.equal(zoneOf({ kind: "wrapup", lane: "report" }), "floor");
  assert.equal(zoneOf({ kind: "agentdone", lane: "yours" }), "gym");
  assert.equal(zoneOf({ kind: "action", lane: "approve" }), "meeting");
});

