// CLOSE OUT'S "TO" IS THE EMAIL'S OWN (the owner, 2026-11-02): a chat asked the owner to email somebody, the task owed that email, and
// Close out drew "To <the chat's sender> in <the group>" under the owed address - the sender read as the To of the email. The owed email's
// To is its own address, drafted or not; a reply back to the sender keeps its own line, said as the reply's ("Reply to ...").
import test from "node:test";
import assert from "node:assert/strict";
import { owedEmails } from "../src/taskLifecycle.js";
import { closeStatus } from "../src/taskLayout.js";
import { getLocale, setLocale } from "../src/i18n.js";

const owed = { id: "s1", text: "Email Paula Vance - the 2:30 meeting", out: { kind: "email", to: "paula@vendor.example", name: "Paula Vance" }, done: false };

test("the emails a task owes, each with its own address and where it stands", () => {
  assert.deepEqual(owedEmails([owed, { id: "c", text: "a plain to-do" }], []), [{ id: "s1", to: "paula@vendor.example", name: "Paula Vance", state: "to draft" }]);
  const rv = { ReviewId: 9, Kind: "slot", Status: "pending" };
  assert.equal(owedEmails([{ ...owed, rid: 9 }], [rv])[0].state, "waits for your yes");
  assert.deepEqual(owedEmails([{ ...owed, done: true }], []), [], "a sent or dropped one is owed no more");
});

test("Close out keeps the owed address and the reply recipient separate in both locales", () => {
  const previous = getLocale();
  try {
    for (const locale of ["en", "zh-CN"]) {
      setLocale(locale);
      const owes = owedEmails([owed], []);
      const lines = closeStatus({ to: "Gail Moreno", where: "WhatsApp", owed: true, owes }).lines;
      assert.equal(lines.length, 3);
      assert.ok(lines[0].includes("paula@vendor.example"));
      assert.ok(!lines[0].includes("Gail Moreno"));
      assert.ok(lines[1].includes("Gail Moreno"));
      assert.ok(lines[1].includes("WhatsApp"));
      assert.ok(!lines[1].includes("paula@vendor.example"));
      const waiting = closeStatus({ emails: 1, owes: owedEmails([{ ...owed, rid: 9 }], [{ ReviewId: 9, Kind: "slot", Status: "pending" }]) }).lines;
      assert.equal(waiting.length, 1, "the drafted email is not repeated as a count");
      assert.ok(waiting[0].includes("paula@vendor.example"));
      assert.notEqual(waiting[0], lines[0], "drafted and undrafted email states differ");
      const closed = closeStatus({ closed: true, owes }).lines;
      assert.ok(closed.every((line) => !line.includes("paula@vendor.example")));
    }
  } finally {
    setLocale(previous);
  }
});
