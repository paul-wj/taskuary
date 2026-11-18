import test from "node:test";
import assert from "node:assert/strict";
import { clickNav, startHarness } from "./harness.mjs";

test("settings controls save their individual values and keep bookkeeping out of view", { timeout: 300000 }, async (t) => {
  const harness = await startHarness();
  t.after(() => harness.close());
  const page = await harness.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const rows = [
    { Name: "trust_own_domain", Value: "1", Default: "1" },
    { Name: "trust_sent_history", Value: "0", Default: "1" },
    { Name: "trust_non_email", Value: "1", Default: "1" },
    { Name: "reply_channels", Value: "email,teams", Default: "email,teams" },
    { Name: "triage_ai", Value: "", Default: "" },
    { Name: "assistant_current:42", Value: "private-cursor", Default: "" },
    { Name: "assistant_last_run", Value: "private-bookkeeping", Default: "" },
    { Name: "some_future_flag", Value: "private-migration", Default: "" },
  ].map((row) => ({ Description: "", UpdatedBy: "owner", ...row }));
  const writes = [];
  page.off("request", page.fixtureRequestGuard);
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== harness.ui) return page.fixtureRequestGuard(request);
    let data, status = 200;
    if (url.pathname === "/api/capabilities") data = { coding: true, ai: true, mail: true, send: {} };
    if (url.pathname === "/api/policies") data = { data: [] };
    if (url.pathname === "/api/settings" && request.method() === "GET") data = { data: rows };
    if (url.pathname === "/api/settings" && request.method() === "PATCH") {
      const update = JSON.parse(request.postData());
      writes.push(update);
      const row = rows.find((item) => item.Name === update.name);
      if (row) row.Value = update.value;
      data = { ok: true };
    }
    if (url.pathname === "/api/ai/defaults") {
      status = 503;
      data = { detail: "Synthetic panel failure" };
    }
    if (data) return request.respond({ status, contentType: "application/json", body: JSON.stringify(data) });
    page.fixtureRequestGuard(request);
  });

  await page.goto(harness.ui, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-tq-nav="settings"]', { timeout: 60000 });
  await clickNav(page, "Settings");
  await page.waitForSelector('[data-tq-browse="settings"] [data-tq-browse-chip="config"]');
  await page.$eval('[data-tq-browse="settings"] [data-tq-browse-chip="config"]', (button) => button.click());
  await page.waitForSelector('[data-tq-browse-card="Coding agent"]');
  await page.$eval('[data-tq-browse-card="Coding agent"]', (button) => button.click());
  const trust = '[data-tq-knob="trust_own_domain"]';
  await page.waitForSelector(`${trust} button[aria-pressed]`);
  await page.focus(`${trust} button[aria-pressed="false"]`);
  await page.keyboard.press("Enter");
  await page.waitForFunction((selector) => [...document.querySelectorAll(`${selector} button[aria-pressed]`)]
    .every((button) => button.getAttribute("aria-pressed") === "true"), {}, trust);
  assert.deepEqual(writes.at(-1), { name: "trust_sent_history", value: "1" });
  assert.equal(await page.$$eval('[data-tq-knob="trust_sent_history"], [data-tq-knob="trust_non_email"]', (nodes) => nodes.length), 0);

  await page.$eval("[data-tq-browse-back]", (button) => button.click());
  await page.waitForSelector('[data-tq-browse-card="Replies"]');
  await page.$eval('[data-tq-browse-card="Replies"]', (button) => button.click());
  const email = '[data-tq-knob="reply_channels"] button[aria-pressed]';
  await page.waitForSelector(email);
  const channels = await page.$$eval(email, (buttons) => buttons.map((button) =>
    button.getAttribute("aria-pressed")));
  assert.deepEqual(channels.slice(0, 3), ["true", "true", "false"]);
  await page.focus(email);
  await page.keyboard.press("Space");
  await page.waitForFunction((selector) => document.querySelector(selector)?.getAttribute("aria-pressed") === "false", {}, email);
  assert.deepEqual(writes.at(-1), { name: "reply_channels", value: "teams" });

  await page.$eval("[data-tq-browse-back]", (button) => button.click());
  await page.waitForSelector('[data-tq-browse-card="How mail is sorted"]');
  await page.$eval('[data-tq-browse-card="How mail is sorted"]', (button) => button.click());
  await page.waitForSelector('[data-tq-knob="triage_ai"]');
  await page.waitForFunction(() => document.body.innerText.includes("Synthetic panel failure"));
  assert.equal(await page.$$eval('[data-tq-knob="triage_ai"]', (nodes) => nodes.length), 1,
    "the ordinary control remains available when the defaults panel fails");
  const visible = await page.evaluate(() => document.body.innerText);
  for (const secret of ["private-cursor", "private-bookkeeping", "private-migration"]) {
    assert.ok(!visible.includes(secret));
  }
  await page.$eval("[data-tq-browse-back]", (button) => button.click());
  const search = '[data-tq-browse="settings"] [data-tq-browse-search]';
  await page.waitForSelector(search);
  for (const key of ["assistant_current:42", "assistant_last_run", "some_future_flag"]) {
    await page.$eval(search, (input) => { input.focus(); input.select(); });
    await page.keyboard.type(key);
    await page.waitForSelector('[data-tq-browse="settings"] [data-tq-browse-empty]');
    assert.equal(await page.$$eval('[data-tq-browse="settings"] [data-tq-browse-card]', (cards) => cards.length), 0);
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(page.fixtureEscapes, []);
});

test("the language selector stays readable while switching locale and appearance", { timeout: 300000 }, async (t) => {
  const harness = await startHarness();
  t.after(() => harness.close());
  const page = await harness.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
  await page.goto(`${harness.ui}/#settings=config`, { waitUntil: "domcontentloaded" });
  const selector = "#taskuary-language";
  await page.waitForSelector(selector, { visible: true, timeout: 60000 });
  for (const locale of ["zh-CN", "en"]) {
    await page.select(selector, locale);
    const language = locale === "en" ? "Language" : "语言";
    await page.waitForFunction((label) => document.querySelector("#taskuary-language")?.getAttribute("aria-label") === label, {}, language);
    for (const mode of ["dark", "light"]) {
      const label = locale === "en" ? `Switch to ${mode} theme` : mode === "dark" ? "切换到深色主题" : "切换到浅色主题";
      await page.click(`button[aria-label="${label}"]`);
      await page.waitForFunction((want) => document.documentElement.dataset.theme === want, {}, mode);
      await page.focus(selector);
      const colors = await page.$eval(selector, (select) => {
        const luminance = (color) => {
          const rgb = color.match(/[\d.]+/g).slice(0, 3).map((part) => {
            const value = Number(part) / 255;
            return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
          });
          return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
        };
        const ink = luminance(getComputedStyle(select).color);
        const ground = luminance(getComputedStyle(select.closest(".MuiInputBase-root")).backgroundColor);
        return { contrast: (Math.max(ink, ground) + 0.05) / (Math.min(ink, ground) + 0.05), ground,
          scheme: getComputedStyle(select).colorScheme, focused: document.activeElement === select, value: select.value };
      });
      assert.ok(colors.contrast >= 4.5, `${locale}/${mode}: language text has readable contrast (${colors.contrast})`);
      assert.ok(mode === "dark" ? colors.ground < 0.1 : colors.ground > 0.8, `${locale}/${mode}: the selector follows the surface theme`);
      assert.equal(colors.scheme, mode, "native options inherit the active color scheme");
      assert.equal(colors.focused, true);
      assert.equal(colors.value, locale, "appearance changes retain the selected language");
    }
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(page.fixtureEscapes, []);
});
