// JIRA DATA CENTER, FROM ITS CARD (2026-11-04, the approved read-only API-token mode). The Jira card's Credentials step gains a
// deployment selector (Cloud / Data Center). Data Center authenticates with the account username and an API token as the Basic
// password and reads Jira REST v2; it is read-only - no upstream write or close-out is offered.
//
// The tests drive the ACTUAL card: open it (the app's own #connector=jira deep link, a fresh page per locale so no unsaved draft is
// retained), select Data Center, type the fictional credentials, and press the REAL buttons - Test (the unsaved values on screen),
// Save & continue, and Sync now - observing the recorded wire and the REAL Timeline rows the poll produces. The fictional DC Jira
// upstream lives in the fixture (fixture_changes.py): the demo's network guard fails every outbound socket, so the fixture intercepts
// Jira's HTTP at the `requests` boundary and answers ONLY the invented site (the real backend functions run for real against it).
// What the tests verify is the recorded wire - never a real host, never a token value. Invented site, account and issues: reserved
// example domains only.
import assert from "node:assert/strict";
import test from "node:test";
import { startHarness } from "./harness.mjs";

const SITE = "https://jira.northwind.example";
const USER = "alex@northwind.example";
const TOKEN = "fixture-dc-token-not-real";

// fixture calls go to the isolated backend (not the UI origin), with the owner token, as the other browser tests do
const call = async (harness, path, body) => {
  const r = await fetch(`${harness.fixtureApi}${path}`, {
    method: body == null ? "GET" : "POST",
    headers: { "X-Taskuary-Token": harness.token, ...(body != null ? { "Content-Type": "application/json" } : {}) },
    body: body == null ? undefined : JSON.stringify(body),
  });
  return r.json();
};
const seed = (harness, mode, cfg) => call(harness, "/api/fixture/jira/dc/seed", { mode, config: cfg });
const wire = (harness) => call(harness, "/api/fixture/jira/dc/wire");

// type into the card's credential input by its stable field-key hook (locale-independent: the labels translate, the id does not)
// the MUI TextField carries data-tq-conn-field on its FORM-CONTROL div, so the stable hook selects the INPUT inside it
const typeField = (page, key, v) => page.evaluate(([key, v]) => {
  const i = document.querySelector(`[data-tq-conn-field="${key}"] input`);
  if (!i) return false;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, v);
  i.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}, [key, v]);
const fieldValue = (page, key) => page.evaluate((key) => {
  const i = document.querySelector(`[data-tq-conn-field="${key}"] input`);
  return i ? i.value : null;
}, key);
const tokenValue = (page) => page.evaluate(() => {
  const i = document.querySelector('[data-tq-secret="secret"] input') || document.querySelector('input[type="password"]');
  return i ? i.value : null;
});
const typeToken = (page, v) => page.evaluate((v) => {
  const i = document.querySelector('[data-tq-secret="secret"] input') || document.querySelector('input[type="password"]');
  if (!i) return false;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, v);
  i.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}, v);
// the deployment selector: pick the option whose STABLE id is `value` (cloud | data_center) - not a translated label
const setDeployment = (page, value) => page.evaluate((value) => {
  const opt = document.querySelector(`[data-tq-jira-deployment] [data-tq-jira-deploy="${value}"]`);
  if (!opt) return false;
  (opt.querySelector("input") || opt).click();
  return true;
}, value);
const deploymentValue = (page) => page.evaluate(() => {
  const on = document.querySelector('[data-tq-jira-deployment] [data-tq-jira-deploy] input:checked');
  return on ? on.closest("[data-tq-jira-deploy]")?.dataset.tqJiraDeploy : null;
});
// open a step by its stable key (the card is a vertical stepper; a step that is not open is collapsed)
const openStep = (page, key) => page.evaluate((key) => {
  const b = document.querySelector(`[data-tq-step-btn="${key}"]`);
  if (!b) return false;
  b.click();
  return true;
}, key);
const pressButton = (page, sel) => page.evaluate((sel) => {
  const b = document.querySelector(sel);
  if (!b || b.disabled) return false;
  b.click();
  return true;
}, sel);
const bodyHas = (page, text) => page.evaluate((t) => document.body.innerText.includes(t), text);
// open the Jira card through the app's own deep link (no guessed browse-card keys), on a FRESH page so no unsaved draft is retained.
// The card opens on the Credentials step, so the site field is the stable "it is open" signal; the deployment selector
// (data-tq-jira-deployment) is what this feature adds and is legitimately absent before it is built (the red case).
async function openJiraCard(harness, page, language = "en") {
  await page.evaluateOnNewDocument((lang) => { try { localStorage.setItem("taskuary.language", lang); } catch {} }, language);
  await page.goto(`${harness.ui}/#connector=jira`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector('[data-tq-conn-field="base_url"] input', { timeout: 120000 });
}
// type the fictional DC credentials on the open card (stable hooks, so this holds in either language)
async function typeDcCredentials(page) {
  await page.waitForSelector("[data-tq-jira-deployment]", { timeout: 20000 });
  assert.ok(await setDeployment(page, "data_center"), "the Data Center option is offered");
  assert.equal(await deploymentValue(page), "data_center", "the selection is the stable id, not a label");
  assert.ok(await typeField(page, "base_url", SITE), "the site field is reachable");
  assert.ok(await typeField(page, "email", USER), "the account-username field is reachable");
  assert.ok(await typeToken(page, TOKEN), "the token box is under Credentials");
}

test("Jira Data Center renders the read-only selector in both locales and keeps the draft", { timeout: 600000 }, async (t) => {
  const harness = await startHarness();
  t.after(() => harness.close());
  // arm the world (and leave the card on, so the card's own Sync now box is drawn): the surface test needs no wire, only the card
  const seeded = await seed(harness, "success", { base_url: SITE, email: USER, deployment: "data_center" });
  assert.ok(seeded.ok, `seed: ${JSON.stringify(seeded)}`);

  for (const language of ["en", "zh-CN"]) {
    const page = await harness.newPage();
    t.after(() => page.close().catch(() => {}));
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await openJiraCard(harness, page, language);
    await page.waitForSelector("[data-tq-jira-deployment]", { timeout: 20000 });
    assert.equal(await deploymentValue(page), "cloud", "an unsaved card is Cloud by default");

    assert.ok(await setDeployment(page, "data_center"));
    assert.equal(await deploymentValue(page), "data_center");
    assert.ok(await typeField(page, "base_url", SITE));
    assert.ok(await typeField(page, "email", USER));
    assert.ok(await typeToken(page, TOKEN));

    // mode-specific help: Data Center points at the on-site API-token plugin (a relative path), not the Cloud id.atlassian.com road
    assert.ok(await bodyHas(page, "/plugins/servlet"), "Data Center help points at the on-site API-token plugin");
    assert.ok(await page.evaluate(() => !!document.querySelector("[data-tq-jira-dc-readonly]")), "the read-only ceiling is said on the card");

    // a deployment switch must NOT wipe the typed site / username / token
    assert.ok(await setDeployment(page, "cloud"));
    assert.ok(await setDeployment(page, "data_center"));
    assert.equal(await fieldValue(page, "base_url"), SITE, "the site survives a deployment switch");
    assert.equal(await fieldValue(page, "email"), USER, "the username survives a deployment switch");
    assert.equal(await tokenValue(page), TOKEN, "the typed token survives a deployment switch");

    // an unsaved deployment change: the Sync now button (in the Enable step - the stepper collapses a step that is not open,
    // so open it first) is present AND disabled, saying why (Sync reads what is saved)
    assert.ok(await openStep(page, "enable"), "the Enable step can be opened");
    await page.waitForSelector("[data-tq-sync-why]", { timeout: 20000 });
    const blocked = await page.evaluate(() => {
      const box = document.querySelector("[data-tq-sync-why]");
      const btn = box?.querySelector("button");
      return { present: !!btn, disabled: btn ? btn.disabled : null, why: box?.getAttribute("data-tq-sync-why") || "" };
    });
    assert.equal(blocked.present, true, "Sync now is drawn");
    assert.equal(blocked.disabled, true, "Sync now is disabled while the deployment is unsaved");

    // a LIVE locale flip (the app's own setLocale, same realm) preserves the unsaved draft and redraws the card in the other language
    await page.evaluate(async () => { const m = await import("/src/i18n.js"); m.setLocale(m.getLocale() === "en" ? "zh-CN" : "en"); });
    await page.waitForFunction(() => document.querySelector('[data-tq-conn-field="base_url"] input') !== null, { timeout: 15000, polling: 200 });
    assert.equal(await fieldValue(page, "base_url"), SITE, "a locale flip keeps the site");
    assert.equal(await fieldValue(page, "email"), USER, "a locale flip keeps the username");
    assert.equal(await tokenValue(page), TOKEN, "a locale flip keeps the token");
    assert.equal(await deploymentValue(page), "data_center", "a locale flip keeps the deployment");
    // and the card is actually redrawn in the other language: the Credentials step label is its translated word, not the other
    const flipped = await page.evaluate(() => document.body.innerText);
    if (flipped.includes("凭据")) assert.ok(flipped.includes("Jira 部署"), "the DC selector is drawn in Chinese");
    else assert.ok(flipped.includes("Jira deployment"), "the DC selector is drawn in English");

    assert.deepEqual(errors, [], "no page errors in this locale");
    assert.deepEqual(page.fixtureEscapes, [], "nothing reached outside the fixture");
  }
});

test("Jira Data Center connects read-only through the real card: Test, Save, Sync, real Timeline rows", { timeout: 600000 }, async (t) => {
  const harness = await startHarness();
  t.after(() => harness.close());
  const page = await harness.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  const cfg = { base_url: SITE, email: USER, deployment: "data_center" };
  const seeded = await seed(harness, "success", cfg);
  assert.ok(seeded.ok, `seed: ${JSON.stringify(seeded)}`);
  await openJiraCard(harness, page, "en");
  await typeDcCredentials(page);

  // the REAL Test button (the Test step is collapsed until opened) - it tries the unsaved values on screen through the real /test route
  assert.ok(await openStep(page, "test"), "the Test step can be opened");
  await page.waitForSelector('[data-tq-test-btn]', { timeout: 20000 });
  assert.ok(await pressButton(page, '[data-tq-test-btn]'), "the Test button is pressable");
  await page.waitForFunction(() => {
    const st = document.querySelector("[data-tq-test-state]")?.getAttribute("data-tq-test-state");
    return st === "ok" || st === "error";
  }, { timeout: 30000, polling: 200 });
  assert.equal(await page.evaluate(() => document.querySelector("[data-tq-test-state]")?.getAttribute("data-tq-test-state")), "ok", "the on-screen Test passed");
  let w = await wire(harness);
  assert.ok(w.reads.some((r) => /\/myself$/.test(r.path) && r.api_version === 2), "Test did a v2 /myself read");
  assert.ok(w.reads.some((r) => r.path.includes("/search") && r.api_version === 2), "Test did a v2 /search read");
  assert.ok(w.reads.every((r) => r.auth === "basic"), "every Jira read used Basic auth");
  assert.ok(w.reads.every((r) => r.api_version === 2), "Data Center never issued a v3 read");
  assert.deepEqual(w.writes, [], "Test wrote nothing upstream");
  assert.ok(w.auth.token_present, "the Basic password carried a token");
  assert.ok(!JSON.stringify(w).includes(TOKEN), "the recorded wire never carries the token value");

  // the REAL Save & continue button - persists the Data Center deployment and the token. Opening Test folded the Credentials step,
  // so it (and its Save button) must be opened again before the press
  assert.ok(await openStep(page, "credentials"), "the Credentials step can be opened again");
  await page.waitForSelector('[data-tq-save-conn]', { timeout: 20000 });
  const savedResponse = page.waitForResponse((r) => r.url().endsWith("/api/connectors") && r.request().method() === "POST");
  assert.ok(await pressButton(page, '[data-tq-save-conn]'), "the Save button is pressable");
  assert.ok((await savedResponse).ok(), "the actual Save request succeeded");
  const saved = await call(harness, "/api/connectors");
  const jiraRow = saved.data.find((c) => c.Type === "jira");
  const savedCfg = JSON.parse(jiraRow.ConfigJson || "{}");
  assert.equal(savedCfg.deployment, "data_center", "the saved card carries the Data Center deployment");
  assert.equal(savedCfg.base_url, SITE);
  assert.equal(savedCfg.email, USER);
  assert.ok(jiraRow.HasSecret, "the token is stored write-only");
  assert.ok(!JSON.stringify(saved).includes(TOKEN), "the saved token is not returned by the connector list");

  // the REAL Sync now button (the Enable step) - the real poll pages across the whole assigned set and writes nothing
  assert.ok(await openStep(page, "enable"), "the Enable step can be opened");
  await page.waitForSelector('[data-tq-sync-now]', { timeout: 20000 });
  assert.ok(await pressButton(page, '[data-tq-sync-now]'), "Sync now is pressable once the card is saved");
  // Setup hides the rail. Return to Timeline and expand FYI; the demo deliberately files unfamiliar issues.
  await page.goto(harness.ui, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(async () => {
    const r = await fetch("/api/feed", { headers: { "X-Taskuary-Token": "phase0-browser-owner-token" } });
    const data = await r.json();
    return data.data.some((x) => x.Subject === "NW-27 Synthetic Jira update 27");
  }, { timeout: 90000, polling: 500 });
  await page.waitForFunction(() => [...document.querySelectorAll("button.tq-pile-more")].some((b) => /fyi/i.test(b.innerText)), { timeout: 30000 });
  await page.$$eval("button.tq-pile-more", (bs) => bs.find((b) => /fyi/i.test(b.innerText)).click());
  await page.waitForFunction(() => document.body.innerText.includes("NW-27 Synthetic Jira update 27") && document.body.innerText.includes("NW-01 Synthetic Jira update 01"), { timeout: 30000 });
  const visible = await page.evaluate(() => document.body.innerText);
  for (let n = 1; n <= 27; n++) assert.ok(visible.includes(`NW-${String(n).padStart(2, "0")} Synthetic Jira update ${String(n).padStart(2, "0")}`), `issue ${n} reached the rendered Timeline`);

  w = await wire(harness);
  const searches = w.reads.filter((r) => r.path.includes("/search"));
  assert.ok(searches.length >= 2, `the poll paged across at least two search pages (saw ${searches.length})`);
  assert.ok(searches.every((r) => r.api_version === 2), "every search page was v2");
  assert.deepEqual(w.writes, [], "the poll wrote nothing upstream");

  assert.deepEqual(errors, [], "no page errors");
  assert.deepEqual(page.fixtureEscapes, [], "nothing reached outside the fixture");
});

test("Jira Data Center: a denied search is a failure, not an empty success", { timeout: 300000 }, async (t) => {
  const harness = await startHarness();
  t.after(() => harness.close());
  const page = await harness.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  const cfg = { base_url: SITE, email: USER, deployment: "data_center" };
  const seeded = await seed(harness, "search-denied", cfg);
  assert.ok(seeded.ok, `seed: ${JSON.stringify(seeded)}`);
  await openJiraCard(harness, page, "en");
  await typeDcCredentials(page);

  // the real Test: identity answers but the search is a 403, so the test reports a denial, never "connected with zero issues"
  assert.ok(await openStep(page, "test"), "the Test step can be opened");
  await page.waitForSelector('[data-tq-test-btn]', { timeout: 20000 });
  assert.ok(await pressButton(page, '[data-tq-test-btn]'), "the Test button is pressable");
  await page.waitForFunction(() => {
    const st = document.querySelector("[data-tq-test-state]")?.getAttribute("data-tq-test-state");
    return st === "ok" || st === "error";
  }, { timeout: 30000, polling: 200 });
  assert.equal(await page.evaluate(() => document.querySelector("[data-tq-test-state]")?.getAttribute("data-tq-test-state")), "error",
    "a denied search fails the Test, it does not read as an empty success");
  const w = await wire(harness);
  assert.ok(w.denied.some((d) => d.path.includes("/search") && d.status === 403), "the denied /search is recorded as a 403");
  assert.ok(w.reads.some((r) => /\/myself$/.test(r.path)), "identity still answered: a permission refusal, not an auth failure");
  assert.deepEqual(errors, []);
  assert.deepEqual(page.fixtureEscapes, []);
});
