import assert from "node:assert/strict";
import test from "node:test";
import { startHarness } from "./harness.mjs";

// A Data Center author has no Cloud accountType; pre-merge messages have no author metadata at all.
// Neither may silently become trusted, but a refused start must offer the owner's way forward in the chat.
test("a refused Jira agent start exposes trust in the chat, including pre-merge messages", { timeout: 240000 }, async (t) => {
  const h = await startHarness();
  t.after(() => h.close());
  const call = async (path, body) => {
    const r = await fetch(`${h.fixtureApi}${path}`, { method: body ? "POST" : "GET",
      headers: { "X-Taskuary-Token": h.token, "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
    assert.equal(r.ok, true, `${path}: ${r.status}`);
    return r.json();
  };
  for (const [language, legacy] of [["en", false], ["zh-CN", true]]) {
    const { taskId } = await call("/api/fixture/task/jira-untrusted", { legacy });
    assert.equal((await call(`/api/tasks/${taskId}`)).origin.origin, "stranger");
    const page = await h.newPage();
    const errors = [], starts = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/(dispatch|assistant\/stream|continue-work)$/.test(new URL(r.url()).pathname)) starts.push(r.url());
    });
    await page.evaluateOnNewDocument((lang) => localStorage.setItem("taskuary.language", lang), language);
    await page.goto(`${h.ui}/#task=${taskId}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector("[data-tq-agent-room] .tq-aui-input", { visible: true, timeout: 30000 });
    // The failed start opens on Agent, with Came from folded: the recovery must not hide in that other pane.
    const trust = await page.waitForSelector("[data-tq-agent-section] [data-tq-trust]", { visible: true, timeout: 10000 });
    if (legacy) {
      assert.equal(await trust.evaluate((b) => b.textContent.trim()), "信任来自 jira.northwind.example 的所有人");
      assert.equal(await page.$("[data-tq-agent-section] [data-tq-trust-org]"), null);
    } else {
      assert.equal(await trust.evaluate((b) => b.textContent.trim()), "Trust Erin");
      assert.ok(await page.$("[data-tq-agent-section] [data-tq-trust-org]"));
    }
    const input = await page.$("[data-tq-agent-room] .tq-aui-input");
    await input.type("Keep these instructions for the next start");
    await trust.click();
    await page.waitForFunction(async (id) => {
      const r = await fetch(`/api/tasks/${id}`, { headers: { "X-Taskuary-Token": localStorage.getItem("taskuary_token") } });
      return (await r.json()).origin.origin === "trusted";
    }, { timeout: 20000 }, taskId);
    await page.waitForFunction(() => !document.querySelector("[data-tq-agent-section] [data-tq-trust]"), { timeout: 20000 });
    assert.equal(await page.$eval("[data-tq-agent-room] .tq-aui-input", (el) => el.value), "Keep these instructions for the next start");
    assert.deepEqual(starts, [], "trusting never starts an agent without another owner send");
    assert.deepEqual(errors, []);
    assert.deepEqual(page.fixtureEscapes, []);
    await page.close();
  }
});
