import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// The helpers live in JSX, which the Node test runner cannot import directly.
const source = readFileSync(new URL("../src/ChatThread.jsx", import.meta.url), "utf8");
const pure = source.slice(source.indexOf("export const CHAT_CHANNELS"), source.indexOf("const dayOf"));
const { CHAT_CHANNELS, isChatTask, mine, splitBody } = new Function("cleanText",
  `${pure.replace(/export /g, "")}; return { CHAT_CHANNELS, isChatTask, mine, splitBody };`)((s) => String(s || "").trim());

test("WhatsApp and Teams tasks are chats; an email task is not", () => {
  assert.ok(CHAT_CHANNELS.has("whatsapp") && CHAT_CHANNELS.has("teams"));
  assert.ok(isChatTask([{ Channel: "whatsapp" }, { Channel: "whatsapp", Status: "context" }]));
  assert.ok(isChatTask([{ Channel: "teams" }]));
  assert.ok(!isChatTask([{ Channel: "email" }]));
  assert.ok(!isChatTask([{ Channel: "whatsapp", Status: "context" }]));
});

test("yours are your platform lines and what Taskuary sent for you", () => {
  assert.ok(mine({ Status: "context" }) && mine({ Direction: "out" }) && mine({ ReviewSent: true }));
  assert.ok(!mine({ Status: "routed", FromName: "Erin" }));
});

test("a voice note says so once, and an attachment-only message has no words", () => {
  assert.deepEqual(splitBody("Sounds good.\n\n(🎤 voice note (17s) from WhatsApp, transcribed by Groq (Whisper))"), { words: "Sounds good.", voice: true });
  assert.deepEqual(splitBody("(no text - see the attachment)"), { words: "", voice: false });
});



