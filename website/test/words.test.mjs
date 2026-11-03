// THE PLACES A SENTENCE SENDS THE OWNER, AND THE WORDS THEY NEVER SEE (taskuary/words.json, read by words.js here and words.py on the
// server): a sentence names a place through place(id), never a typed "Settings → ..." string, and the walk's WORDS rule reads the
// same jargon list the server's sentences are held to.
import test from "node:test";
import assert from "node:assert/strict";
import { JARGON, jargonIn, place, placeName } from "../src/words.js";
import { canvasRequestFromHash } from "../src/canvasLinks.js";

test("every place has a name, and every link it gives opens on the canvas", () => {
  for (const id of ["ai", "mail", "sorting", "ai_defaults", "later", "voice", "rules", "docs"]) assert.ok(placeName(id), id);
  for (const id of ["ai", "mail", "sorting", "ai_defaults", "voice", "rules", "docs", "ai_apps"])
    assert.ok(canvasRequestFromHash(place(id).href), `${id}: ${place(id).href} is a link the canvas knows`);
  assert.equal(place("nowhere").href, "", "an unknown place is named as asked, with no link - never undefined");
});

test("jargon is matched as a word: 'repo' is caught, 'approve' is not 'PR', 'session' in any case", () => {
  assert.ok(JARGON.length > 5);
  assert.equal(jargonIn("pick a repo")?.[0], "repo");
  assert.equal(jargonIn("approve it and Proceed"), null);
  assert.ok(jargonIn("the Session ended"));
  assert.equal(jargonIn("sorted 1m ago"), null);
});

test("the removed surface is recognized without matching an ordinary timeline", () => {
  assert.ok(jargonIn("it lands on the Timeline"), "a gone surface is flagged with the jargon");
  assert.equal(jargonIn("the project timeline slipped"), null, "...matched as written, so the word itself is not");
});

