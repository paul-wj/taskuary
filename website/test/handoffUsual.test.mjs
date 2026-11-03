// THE USUAL RECIPIENT, CHOSEN NOT SENT (the owner, 2026-10-25: "Hand it to a person" pre-fills the usual recipient): the drawer opens
// with the person this sender's asks were handed to before, says whose usual it is, never writes over a name already typed, and sends
// nothing until Send it is pressed. Nobody learned - or the ask failing - leaves the form as it was.
import test from "node:test";
import assert from "node:assert/strict";
import { usualHandWhy, usualLine } from "../src/taskFilter.js";
import { setLocale } from "../src/i18n.js";


test("the usual recipient says whose usual it is, and nothing at all when there is none", () => {
  for (const locale of ["en", "zh-CN"]) {
    setLocale(locale);
    assert.ok(usualHandWhy({ to: "ray@northwind.example", from: "east.manager@northwind.example", n: 2, of: 2 }).includes("east.manager@northwind.example"));
  }
  for (const none of [{}, null, undefined, { to: "ray@northwind.example" }]) assert.equal(usualHandWhy(none), "");
});


test("Remind me's day is read from a How you work line, said on hover", () => {
  const line = "You put mail from renewals@payworth.example off to Friday";
  for (const locale of ["en", "zh-CN"]) {
    setLocale(locale);
    assert.ok(usualLine({ line }).includes(line), "the learned text is not translated");
  }
  assert.equal(usualLine({}), "");
});
