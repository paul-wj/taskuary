// MESSAGE THEM (the owner's idea, trust audit F6, 2026-10-28): a People hit in Ctrl K offers the channels New's Send something can reach that
// person on, and the pick opens New's compose already addressed - the same sheet, the same road to a task. Invented Northwind people only.
import test from "node:test";
import assert from "node:assert/strict";
import { channelsFor, messageLink } from "../src/searchHits.js";
import { canvasRequestFromHash } from "../src/canvasLinks.js";

const TARGETS = [{ channel: "email", to: [] }, { channel: "teams", to: [{ to: "19:erin-chat", name: "Erin Blake" }] },
  { channel: "whatsapp", to: [{ to: "15550100@s.whatsapp.net", name: "Ray Colton" }] }];

test("a person's channels are the ones New can send on that know them - email by address, a chat by address or name", () => {
  assert.deepEqual(channelsFor({ to: "erin@northwind.example", title: "Erin Blake" }, TARGETS),
    [{ channel: "email", to: "erin@northwind.example", name: "Erin Blake" }, { channel: "teams", to: "19:erin-chat", name: "Erin Blake" }]);
  assert.deepEqual(channelsFor({ to: "gail@northwind.example", title: "Gail Moreno" }, TARGETS).map((w) => w.channel), ["email"]);
  assert.deepEqual(channelsFor({ to: "gail@northwind.example", title: "Gail Moreno" }, []), [], "nothing connected can send: no way");
});

test("the pick opens New's Send something addressed, through the link New already answers to", () => {
  const link = messageLink({ channel: "email", to: "erin@northwind.example", name: "Erin Blake" });
  assert.deepEqual(canvasRequestFromHash(link, 3), { kind: "new", n: 3, state: { kind: "send", channel: "email", to: "erin@northwind.example", name: "Erin Blake" } });
  assert.deepEqual(canvasRequestFromHash("#new-task", 1), { kind: "new", n: 1 }, "the bare link is as it was");
});
