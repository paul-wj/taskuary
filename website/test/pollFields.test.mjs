import test from "node:test";
import assert from "node:assert/strict";
import { CHAT_CONNECTORS, CHAT_POLL_SECONDS, isPollField, pollSecondsField } from "../src/pollFields.js";

// PW-003/PW-004: one description of the chat connectors' fast clock, shared by every chat card,
// and it has to say what the server actually does (server._quick_due / quick_forever).

test("every chat connector offers the fast-poll interval, mail does not", () => {
  assert.deepEqual(CHAT_CONNECTORS, ["teams", "slack", "telegram", "whatsapp", "imessage", "discord"]);
  for (const type of CHAT_CONNECTORS) {
    const f = pollSecondsField(type), [, key, placeholder] = f;
    assert.equal(key, "poll_seconds", type);
    assert.ok(isPollField(f), type);
    assert.equal(placeholder, String(CHAT_POLL_SECONDS), `${type} shows the real default`);
  }
  assert.equal(pollSecondsField("outlook"), null);
  assert.equal(pollSecondsField("gmail"), null);
});


