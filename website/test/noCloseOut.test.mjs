// NO CLOSE OUT ANYWHERE (the owner, 2026-11-06: "why does this task still have close out? i thought we removed this from everywhere? ... there
// should no longer be close out code anywhere"). Every task is Came from and its one chat; the draft's Send, the emails owed, the landing,
// the hand-off and the close are cards in the chat. The words the server, the phone and the Assistant read (words.json, buttons.json,
// stages.json) say the chat too.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url)), pkg = path.join(here, "..", "..", "taskuary");
// ...a word with a space or a hyphen is shown; an identifier or an API path (closeoutOf, /closeout - the GitHub finish) is wiring
const CLOSE_OUT = /\bclose[ -]out\b/i;

test("the words the server, the phone and the Assistant read say the chat, never Close out", () => {
  for (const f of ["words.json", "buttons.json", "stages.json"]) {
    const j = JSON.parse(fs.readFileSync(path.join(pkg, f), "utf8"));
    const said = JSON.stringify(j, (k, v) => (k === "_" ? undefined : v));    // ...its own history notes ("_") aside
    assert.doesNotMatch(said, CLOSE_OUT, f);
  }
});
