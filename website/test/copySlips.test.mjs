import test from "node:test";
import assert from "node:assert/strict";
test("an ask already contained in the message body is recognized", async () => {
  const { askInBody } = await import("../src/taskLayout.js");
  const body = "Welcome to the demo. Northwind, its people and their mail are invented, and nothing you press here reaches anyone.";
  assert.equal(askInBody(body, `${body}\n\nAlex`), true); assert.equal(askInBody("Book the room", body), false);
});
