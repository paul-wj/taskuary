// CLOSE OUT HAS TWO SENDS (the owner, 2026-11-03: "when you send message through close out we need button send and close and send without
// closing so task stays open on send"): Send and close sends and then closes - the primary, and still kept open while an agent works - and
// Send sends with the task left open, as Send does everywhere else. On a tight line Send folds into a ▾, never Send and close.
import test from "node:test";
import assert from "node:assert/strict";
import { label, verbOfRow } from "../src/buttons.js";
import { advisedIn, typeOf } from "../src/actionRow.js";


test("the closing send is classified as a reply move", () => {
  assert.equal(verbOfRow("41:send_close"), "send_close");
  assert.equal(typeOf({ id: "41:send_close" }), "reply", "it sits with the reply's moves");
});

test("the Advisor's or the Assistant's pick lights its own send - one send never lights the other", () => {
  const list = [{ id: "41:send_close", label: label("send_close"), group: "decide", tone: "p", card: true },
    { id: "41:approve", label: label("approve"), group: "decide", tone: "s", card: true }, { id: "done", label: "Mark done", group: "more" }];
  assert.equal(advisedIn(list, { verb: "send_close", label: label("send_close") })?.id, "41:send_close");
  assert.equal(advisedIn(list, { verb: "approve", label: label("approve") })?.id, "41:approve");
  // ...and where the draft stands without the send that closes (outside Close out, a send frozen on Check delivery) its plain send is the same yes
  const one = [{ id: "41:approve", label: label("approve"), group: "decide", tone: "p", card: true }, { id: "done", label: "Mark done", group: "more" }];
  assert.equal(advisedIn(one, { verb: "send_close", label: label("send_close") })?.id, "41:approve");
  assert.equal(advisedIn([{ id: "done", label: "Mark done", group: "more" }], { verb: "send_close", label: label("send_close") }), null);
});

test("a close-out approval lights its closing send without changing a draft's plain send", () => {
  const list = [{ id: "41:send_close", label: label("send_close", "closeout"), group: "decide", tone: "p", card: true },
    { id: "41:approve", label: label("approve"), group: "decide", tone: "s", card: true }, { id: "41:alt", label: "Decline", group: "decide", tone: "s", card: true }];
  assert.equal(advisedIn(list, { verb: "approve", label: label("approve") })?.id, "41:send_close");
  // ...a draft's plain send stays the plain send: its yes never lights the close-out's send
  const sends = [{ id: "41:send_close", label: label("send_close"), group: "decide", tone: "p", card: true }, { id: "41:approve", label: label("approve"), group: "decide", tone: "s", card: true }];
  assert.equal(advisedIn(sends, { verb: "approve", label: label("approve") })?.id, "41:approve");
});
