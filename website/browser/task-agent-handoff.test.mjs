import assert from "node:assert/strict";
import test from "node:test";
import { startHarness } from "./harness.mjs";

// External agent actions must land in master's existing composer, not the removed start form.
test("an external agent handoff focuses the same chat and preserves the owner's unsent work", { timeout: 240000 }, async (t) => {
  const h = await startHarness();
  t.after(() => h.close());
  for (const language of ["en", "zh-CN"]) {
    const page = await h.newPage();
    const errors = [], starts = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/(dispatch|assistant\/stream|continue-work)$/.test(new URL(r.url()).pathname)) starts.push(r.url());
    });
    await page.evaluateOnNewDocument((lang) => localStorage.setItem("taskuary.language", lang), language);
    await page.goto(h.ui, { waitUntil: "domcontentloaded", timeout: 90000 });
    const { taskId } = await page.evaluate(async () => (await fetch("/api/fixture/task/matrix", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Taskuary-Token": localStorage.getItem("taskuary_token") },
      body: JSON.stringify({ state: "deferred" }),
    })).json());
    await page.evaluate((id) => { location.hash = `task=${id}`; }, taskId);
    await page.waitForFunction((id) => document.querySelector("[data-tq-task-head]")?.innerText.includes(`TQ-${String(id).padStart(4, "0")}`), { timeout: 30000 }, taskId);
    const selector = "[data-tq-task-page] [data-tq-agent-room] .tq-aui-input";
    await page.waitForSelector(selector, { visible: true, timeout: 30000 });
    await page.type(selector, "Analyse the export without changing it");
    assert.equal(await page.$eval(selector, (el) => el.value), "Analyse the export without changing it", `${language}: draft before handoff`);
    await page.evaluate((id) => {
      document.activeElement?.blur();
      window.dispatchEvent(new CustomEvent("tq-agent-ask", { detail: { tid: id, coding: false } }));
    }, taskId);
    await page.waitForFunction((sel) => document.activeElement === document.querySelector(sel), { timeout: 10000 }, selector);
    assert.equal(await page.$eval(selector, (el) => el.value), "Analyse the export without changing it", `${language}: draft after handoff`);
    assert.equal(await page.$("[data-tq-run-form]"), null, "handoff never restores a second start form");
    assert.equal(await page.$$eval("[data-tq-task-page] [data-tq-one-box]", (els) => els.filter((el) => el.getBoundingClientRect().width > 0).length), 1);
    assert.ok(await page.$('[data-tq-agent-handoff="general"]'));
    await page.evaluate((id) => {
      window.dispatchEvent(new CustomEvent("tq-agent-ask", { detail: { tid: id, coding: false } }));
      window.dispatchEvent(new CustomEvent("tq-agent-ask", { detail: { tid: id + 1000, coding: true } }));
    }, taskId);
    assert.equal(await page.$eval(selector, (el) => el.value), "Analyse the export without changing it");
    assert.deepEqual(starts, [], "an action selects the next start; only the owner's Send may dispatch");
    await page.click('[data-tq-agent-handoff="general"] button');
    await page.waitForFunction(() => !document.querySelector("[data-tq-agent-handoff]"));
    assert.equal(await page.$eval(selector, (el) => el.value), "Analyse the export without changing it");
    // The regular agent keeps master's stream road; demo answers locally without launching a real agent.
    await page.evaluate((id) => window.dispatchEvent(new CustomEvent("tq-agent-ask", { detail: { tid: id, coding: false } })), taskId);
    await page.waitForSelector('[data-tq-agent-handoff="general"]');
    const sent = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname.endsWith("/assistant/stream"));
    await page.focus(selector); await page.keyboard.press("Enter");
    assert.equal((await sent).status(), 200);
    await page.waitForFunction((sel) => !document.querySelector("[data-tq-agent-handoff]") && document.querySelector(sel)?.value === "", { timeout: 15000 }, selector);
    assert.equal(starts.length, 1, "only the explicit Send starts the stream");
    const saved = await page.evaluate(async (id) => (await (await fetch(`/api/tasks/${id}/assistant`, {
      headers: { "X-Taskuary-Token": localStorage.getItem("taskuary_token") },
    })).json()).messages, taskId);
    assert.ok(saved.some((m) => m.role === "user" && m.content.some((p) => p.text === "Analyse the export without changing it")), "the owner's instructions are durable");
    const coding = await page.evaluate(async () => (await fetch("/api/fixture/task/coding-saved", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Taskuary-Token": localStorage.getItem("taskuary_token") },
      body: JSON.stringify({ mine: true }),
    })).json());
    await page.evaluate((id) => { location.hash = `task=${id}`; }, coding.taskId);
    await page.waitForFunction((id) => document.querySelector("[data-tq-task-head]")?.innerText.includes(`TQ-${String(id).padStart(4, "0")}`), {}, coding.taskId);
    await page.waitForSelector(selector, { visible: true, timeout: 30000 });
    await page.type(selector, "Explain the saved coding result");
    await page.evaluate((id) => window.dispatchEvent(new CustomEvent("tq-agent-ask", { detail: { tid: id, coding: false } })), coding.taskId);
    await page.waitForSelector('[data-tq-agent-handoff="general"]');
    let release, heldRequest;
    const held = new Promise((resolve) => { release = resolve; });
    page.off("request", page.fixtureRequestGuard);
    page.on("request", (request) => {
      if (request.method() === "POST" && new URL(request.url()).pathname === `/api/tasks/${coding.taskId}/dispatch`) {
        heldRequest = request; release();
      } else page.fixtureRequestGuard(request);
    });
    await page.focus(selector); await page.keyboard.press("Enter"); await held;
    await page.type(selector, "Keep this additional note");
    const refused = page.waitForResponse((r) => r.request() === heldRequest);
    await heldRequest.continue(); assert.equal((await refused).status(), 403);
    await page.waitForSelector("[data-tq-task-page] [role=alert]", { visible: true, timeout: 15000 });
    assert.equal(await page.$eval(selector, (el) => el.value), "Explain the saved coding result\nKeep this additional note");
    assert.ok(await page.$('[data-tq-agent-handoff="general"]'), "a failed handoff keeps the selected target for retry");
    assert.deepEqual(errors, []);
    assert.deepEqual(page.fixtureEscapes, []);
    await page.close();
  }
});
