import assert from "node:assert/strict";
import test from "node:test";
import { startHarness } from "./harness.mjs";

test("an installed task-only CLI is visible in first run and opens connections without selecting a sorting brain", { timeout: 240000 }, async (t) => {
  const h = await startHarness({ fresh: true });
  t.after(() => h.close());
  const page = await h.newPage();
  const errors = [], sortingPicks = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.off("request", page.fixtureRequestGuard);
  page.on("request", async (request) => {
    const url = new URL(request.url());
    if (url.origin === h.ui && url.pathname === "/api/setup/first-run" && request.method() === "GET") {
      const response = await fetch(h.fixtureApi + url.pathname, { headers: { "X-Taskuary-Token": h.token } });
      const state = await response.json();
      state.task_clis = [{ name: "omp", title: "Oh My Pi", installed: true, connected: true }];
      return request.respond({ status: response.status, contentType: "application/json", body: JSON.stringify(state) });
    }
    if (url.pathname === "/api/setup/first-run/cli" && request.method() === "POST") sortingPicks.push(request.postData());
    return page.fixtureRequestGuard(request);
  });
  await page.goto(h.ui, { waitUntil: "domcontentloaded" });
  const card = '[data-tq-firstrun="ai"] [data-tq-card="cli-omp"]';
  await page.waitForSelector(card, { visible: true, timeout: 45000 });
  assert.equal(await page.$eval(card, (el) => !!el.getAttribute("data-tq-setup-lit")), false,
    "a task-only CLI must not be recommended as the sorting AI");
  await page.click(card);
  await page.waitForSelector('[data-connection="omp"]', { visible: true, timeout: 30000 });
  assert.deepEqual(sortingPicks, [], "opening task-tool settings must not choose a sorting brain");
  const actual = await (await fetch(h.fixtureApi + "/api/setup/first-run", {
    headers: { "X-Taskuary-Token": h.token },
  })).json();
  assert.equal(actual.brain.ready, false);
  assert.equal(actual.step, "ai");
  assert.deepEqual(errors, []);
  assert.deepEqual(page.fixtureEscapes, []);
});

test("first run renders CLI check progress and retry guidance in both interface languages", { timeout: 240000 }, async (t) => {
  const h = await startHarness({ fresh: true });
  t.after(() => h.close());
  for (const [locale, name, title, checking, retry] of [
    ["en", "claude", "Claude Code", "Checking that Claude Code works", "Pick it again to retry."],
    ["zh-CN", "codex", "Codex", "正在检查 Codex 是否可用", "请再次选择以重试。"],
  ]) {
    const page = await h.newPage();
    await page.evaluateOnNewDocument((language) => {
      if (window === window.top) localStorage.setItem("taskuary.language", language);
    }, locale);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.off("request", page.fixtureRequestGuard);
    page.on("request", async (request) => {
      const url = new URL(request.url());
      if (url.origin === h.ui && url.pathname === "/api/setup/first-run" && request.method() === "GET") {
        const response = await fetch(h.fixtureApi + url.pathname, { headers: { "X-Taskuary-Token": h.token } });
        const state = await response.json();
        state.ais = [{ name, title, installed: true, sub: "Already on this computer" }];
        return request.respond({ status: response.status, contentType: "application/json", body: JSON.stringify(state) });
      }
      if (url.origin === h.ui && url.pathname === "/api/setup/first-run/ai" && request.method() === "POST") return;
      return page.fixtureRequestGuard(request);
    });
    await page.goto(h.ui, { waitUntil: "domcontentloaded" });
    const card = `[data-tq-firstrun="ai"] [data-tq-card="cli-${name}"]`;
    const scope = '[data-tq-firstrun="ai"] [data-tq-setup-scope]';
    await page.waitForSelector(card, { visible: true });
    const pending = page.waitForRequest((request) => request.url() === `${h.ui}/api/setup/first-run/ai` && request.method() === "POST");
    await page.click(card);
    const [check] = await Promise.all([pending,
      page.waitForFunction((selector, text) => document.querySelector(selector)?.innerText.includes(text), {}, scope, checking),
    ]);
    await check.respond({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Test CLI unavailable" }) });
    await page.waitForFunction((text) => document.querySelector("[data-tq-setup-line]")?.innerText.includes(text), {}, `Test CLI unavailable. ${retry}`);
    await page.waitForSelector(card, { visible: true });
    assert.deepEqual(errors, []);
    assert.deepEqual(page.fixtureEscapes, []);
    await page.close();
  }
});
