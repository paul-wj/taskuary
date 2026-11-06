import test from "node:test";
import assert from "node:assert/strict";
import { oneOf } from "../src/connectorCatalog.js";


// the owner, 2026-10-20: Add another says WHAT it adds - read off the catalogue in one place (connectorCatalog.oneOf), not per card
test("Add another names what one card is, and a card that is one by nature has none", () => {
  for (const t of ["outlook", "gmail", "imap", "teams", "slack", "github", "database", "postgresql", "sharepoint", "teller",
    "simplefin", "anthropic", "jira"]) assert.ok(oneOf(t), t);
  for (const t of ["whatsapp", "imessage", "knowledge", "handbook", "local_whisper", "fred", "frankfurter"]) assert.equal(oneOf(t), null, t);
});
