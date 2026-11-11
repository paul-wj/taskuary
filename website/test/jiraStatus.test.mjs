// The Jira status badge says what Jira says, in Jira's words: a custom workflow's "Open" and
// "In Progress" must read differently on the rail and on an FYI's line, raw and untranslated in
// both locales, and a row or message with no snapshot must render nothing - never a made-up state.
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { setLocale } from "../src/i18n.js";
import { jiraStatusOf, jiraStatusText, jiraStatusTip, jiraStatusTone, jiraStatusSub, jiraCategoryLabel } from "../src/jiraStatus.js";

afterEach(() => setLocale("en"));

const JIRA = {
  jira: { status: "In Progress", category: "indeterminate", resolution: null, changed_at: "2026-11-09T14:32:00" },
};
const OPENED = { jira: { status: "Open", category: "new", resolution: null, changed_at: "2026-11-08T09:00:00" } };
const DONE = { jira: { status: "Closed", category: "done", resolution: "Done", changed_at: "2026-11-01T08:00:00" } };

for (const locale of ["en", "zh-CN"]) {
  test(`the status word is the provider's raw text in ${locale} (Open and In Progress differ)`, () => {
    setLocale(locale);
    assert.equal(jiraStatusText(OPENED), "Open");
    assert.equal(jiraStatusText(JIRA), "In Progress");
    assert.notEqual(jiraStatusText(OPENED), jiraStatusText(JIRA));
    assert.equal(jiraStatusText(DONE), "Closed");
    assert.equal(jiraStatusTone(OPENED), "new");
    assert.equal(jiraStatusTone(JIRA), "indeterminate");
    assert.equal(jiraStatusTone(DONE), "done");
    // the category says itself in the hover, in the app's own words: Jira's API key, localised
    assert.equal(jiraCategoryLabel({}), "");
  });

  test(`the badge's hover and card line carry category details, raw words unchanged (${locale})`, () => {
    setLocale(locale);
    const tip = jiraStatusTip(JIRA);
    assert.ok(tip.includes("In Progress"), `tip keeps the raw status: ${tip}`);
    assert.ok(jiraStatusTip(DONE).includes("Done"), "a resolved one says its resolution");
    const sub = jiraStatusSub(DONE);
    assert.ok(sub.includes("Closed"), `line keeps the raw status: ${sub}`);
  });
}

test("missing metadata renders nothing - no badge, no tone, no line", () => {
  setLocale("en");
  assert.equal(jiraStatusOf({}), null);
  assert.equal(jiraStatusOf({ jira: null }), null);
  assert.equal(jiraStatusOf({ jira: {} }), null);
  assert.equal(jiraStatusOf({ jira: { status: "", category: "new" } }), null);
  assert.equal(jiraStatusText({}), null);
  assert.equal(jiraStatusTone({}), "");
  assert.equal(jiraStatusTip({}), "");
  assert.equal(jiraStatusSub({}), "");
});

test("an unknown category stays unknown - it is never inferred from the status name", () => {
  setLocale("en");
  const item = { jira: { status: "Backlog", category: "weird", resolution: null, changed_at: "" } };
  assert.equal(jiraStatusText(item), "Backlog");
  assert.equal(jiraStatusTone(item), "");
  assert.ok(jiraStatusTip(item).includes("Backlog"));
});

