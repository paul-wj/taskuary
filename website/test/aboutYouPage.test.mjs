// ONE PAGE ABOUT THE OWNER (the owner, 2026-11-06: "general things you care about, how you do your job, personality, goals"): About you,
// opened from the avatar in the top bar's corner - You, Docs and Memory - with Memory as plain sentences over LEARNED.md, never its tags.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { sentence } from "../src/memorySentences.js";

test("a line's sentence carries no tag, stamp or markdown, and ends like a sentence", () => {
  assert.equal(sentence("prefers short replies"), "Prefers short replies.");
  assert.equal(sentence("- 2026-10-03: answers **Erin** first [s:4 | ev: rv12 | seen: 2026-10-05 | k: ab12]"), "Answers Erin first.");
  assert.equal(sentence("closes the books on the 5th [memory:k9]"), "Closes the books on the 5th.");
  assert.equal(sentence("Wants `weekly` numbers?"), "Wants weekly numbers?");
  assert.equal(sentence("  "), "");
});


test("every old address of Docs and Memory still lands - and the Assistant's page map names the page, Playbooks on Reports", async () => {
  const words = JSON.parse(fs.readFileSync(new URL("../../taskuary/words.json", import.meta.url), "utf8")).places;
  for (const k of ["about", "docs", "memory"]) assert.match(words[k].name, /^About you → /, k);
  assert.equal(words.memory.href, "#about=memory");
  assert.equal(words.playbooks.name, "Reports → Playbooks");
  const { canvasRequestFromHash } = await import("../src/canvasLinks.js");
  for (const k of ["about", "docs", "memory"]) assert.equal(canvasRequestFromHash(words[k].href).area, "about", k);
  assert.equal(canvasRequestFromHash(words.playbooks.href).area, "reports");
});
