// SENDING AND CLOSING ARE TWO STEPS (the owner, 2026-10-18): the button under a draft is Send and it only sends; Approve runs only the
// agent's act; Mark done is the one close. A send leaves the item on the table, its card badged Send - Mark done and Next on the row by the prompt.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sentChips } from "../src/funnelPile.js";

const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
// capabilities.js imports the page's api client; its pure rules are lifted from the source and run here
const caps = (() => {
  const c = read("capabilities.js"), grab = (n) => c.slice(c.indexOf(`export const ${n} =`), c.indexOf("\n};", c.indexOf(`export const ${n} =`)) + 3);
  const one = (n) => c.split("\n").find((l) => l.startsWith(`export const ${n} =`));
  const src = [one("canSend"), one("channelCanSend"), grab("draftCanSend")].join("\n").replace(/export const /g, "const ");
  return new Function(`${src}\nreturn { canSend, channelCanSend, draftCanSend };`)();
})();


test("a send offers Mark done only where there is a task, and Next always", () => {
  assert.deepEqual(sentChips(12, "TQ-12").chips.map((c) => [c.verb, c.tid ?? null]), [["close", 12], ["next", null]]);
  assert.deepEqual(sentChips(null).chips.map((c) => c.verb), ["next"], "no task, no Mark done");
});


test("whether a draft can leave is asked of capabilities.js, with the row's own CanSend kept for what it knows more", () => {
  const live = { known: true, send: { teams: false, email: true } };
  assert.equal(caps.draftCanSend(live, { Channel: "email", CanSend: true }), true);
  assert.equal(caps.draftCanSend(live, { Channel: "teams", CanSend: true }), false, "the channel's live answer");
  assert.equal(caps.draftCanSend(live, { Channel: "email", CanSend: false }), false, "the row knows the draft has nobody to go to");
  assert.equal(caps.draftCanSend(live, { Channel: "teams", Deliver: JSON.stringify({ kind: "zoho_invoice" }) }), true, "an invoice asks no channel");
  assert.equal(caps.draftCanSend(live, null), false);
  assert.equal(caps.channelCanSend({ known: false, send: {} }, "teams", false), false, "the row's word until the answer is in");
  assert.equal(caps.channelCanSend(live, "teams", true), false, "the live answer once it is");
  assert.equal(caps.channelCanSend(live, "email", false), true);
});

