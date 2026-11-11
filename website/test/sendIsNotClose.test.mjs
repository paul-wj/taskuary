// SENDING AND CLOSING ARE TWO STEPS (the owner, 2026-10-18): the button under a draft is Send and it only sends; Approve runs only the
// agent's act; Mark done is the one close. A send leaves the item on the table, its card badged Send - Mark done and Next on the row by the prompt.
// ...save Close out's own Send and close (the owner, 2026-11-03), the one send that closes - pinned in sendAndClose.test.mjs; Send itself never does.
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

test("the canvas keeps a sent item on the table: the card folds wearing its button, Mark done and Next on the row, nothing settles", () => {
  const cards = read("assistantCards.jsx"), view = read("AssistantView.jsx");
  // the press is the button's own label - a send and what is not a send alike - never a sentence (the owner, 2026-10-22)
  assert.match(cards, /if \(ran && onSent\) onSent\(pressed, card\.tid, card\.ref\);\n\s+else onDone\?\.\(pressed\);/);
  assert.doesNotMatch(cards, /and closes the task/);
  const sent = view.slice(view.indexOf("const sent = (pressed"), view.indexOf("\n  };", view.indexOf("const sent = (pressed")));
  assert.match(sent, /done: true, sent: true, \.\.\.\(pressed \? \{ pressed \} : \{\}\), \.\.\.sentChips\(tid, ref\)/);
  assert.doesNotMatch(sent, /role: "receipt"/, "no line under the card");
  assert.doesNotMatch(sent, /funnel\/settle|advance\(/, "a send neither settles the item nor walks on");
  assert.match(view, /reply: <ReplyCard card=\{c\} onDone=\{actions\.done\} onSent=\{actions\.sent\}/);
  // the folded card keeps a send's two words on the row; any other folded card keeps only Next
  assert.match(view, /const moved = !!m\.card && \(!live \|\| foldedNow\) && !m\.sent;/);
  // Mark done from the row closes the task it names: on the table, the walk's one close (railwalk.leave); off it, alone
  assert.match(view, /if \(c\.verb === "close" && c\.tid\) \{[\s\S]{0,200}await leave\(on, "done"\)[\s\S]{0,300}runOperation\(api, "task\.complete", c\.tid\)/);
  // ...and an Approve run from a proposal takes the server's own chips for its receipt (concierge.sent_chips)
  assert.match(view, /\(out\.status !== "done" \|\| p\.kind === "review\.approve"\) && res\?\.chips\?\.length/);
});

test("no 'Sent to <who>.' line on the desk: a send is said by its badge alone, and a refused one still says why", () => {
  const cards = read("assistantCards.jsx");
  for (const gone of ["`Sent to ${who}.`", "The reply went to", "Done — the action ran.", "Done — ${co.then}", "Done — ${co.alt.then}"])
    assert.ok(!cards.includes(gone), `still says: ${gone}`);
  assert.match(cards, /sure\(o, "sent"\);/);          // the one press throws the server's reason to the card's reader (press.js)
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

