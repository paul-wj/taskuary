import assert from "node:assert/strict";
import test from "node:test";
import { startHarness } from "./harness.mjs";

const setDeveloperMode = async (h, on) => {
  const response = await fetch(`${h.fixtureApi}/api/settings`, {
    method: "PATCH", headers: { "X-Taskuary-Token": h.token, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "developer_mode", value: on ? "1" : "0" }),
  });
  assert.equal(response.status, 200);
};

/* OWNER-COMPLETED AGENT WORK STAYS ON THE BOARD (the i18n sweep, 2026-11-06): a finished agent task lands in the last
   column ("stopped and saved") and survives a reload, in every locale the interface can wear - a completed personal
   to-do is never agent work, so it stays out of the Board. */
test("owner-completed agent work stays on the Board after refresh in both locales", { timeout: 240000 }, async (t) => {
  const h = await startHarness();
  t.after(() => h.close());
  await setDeveloperMode(h, true);
  const post = async (path, body) => {
    const response = await fetch(`${h.fixtureApi}${path}`, {
      method: "POST", headers: { "X-Taskuary-Token": h.token, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  const { taskId } = await post("/api/fixture/task/matrix", { state: "stopped" });
  const { taskId: todoId } = await post("/api/fixture/task/matrix", { state: "todo" });
  await post("/api/fixture/task/closed-elsewhere", { task_id: todoId });
  const page = await h.newPage(); const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${h.ui}/#board`, { waitUntil: "domcontentloaded" });
  const card = `[data-tq-board-task="${taskId}"]`;
  await page.waitForSelector(card, { visible: true, timeout: 30000 });
  await post("/api/fixture/task/closed-elsewhere", { task_id: taskId });
  for (const locale of ["en", "zh-CN"]) {
    await page.evaluate((locale) => localStorage.setItem("taskuary.language", locale), locale);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(card, { visible: true, timeout: 30000 });
    assert.ok(await page.$eval(card, (el) => el.parentElement === el.parentElement.parentElement.lastElementChild), "finished work belongs in the last column");
    assert.equal(await page.$(`[data-tq-board-task="${todoId}"]`), null, "a completed personal to-do is not agent work");
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(page.fixtureEscapes, []);
});

test("Board navigation does not wait for agent model discovery in either locale", { timeout: 240000 }, async (t) => {
  const h = await startHarness();
  t.after(() => h.close());
  for (const locale of ["en", "zh-CN"]) {
    await setDeveloperMode(h, true);
    const page = await h.newPage();
    const errors = [], held = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.evaluateOnNewDocument((locale) => localStorage.setItem("taskuary.language", locale), locale);
    page.off("request", page.fixtureRequestGuard);
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/agents") held.push(request);
      else page.fixtureRequestGuard(request);
    });
    await page.goto(`${h.ui}/`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-tq-view="board"]', { visible: true, timeout: 5000 });
    await page.click('[data-tq-view="board"]');
    await page.waitForSelector('[data-tq-browse="board"]', { visible: true, timeout: 5000 });
    assert.ok(held.length > 0, "agent discovery is still pending while the Board is usable");
    assert.equal(new URL(page.url()).hash, "#board");
    await setDeveloperMode(h, false);
    await page.evaluate(() => window.dispatchEvent(new Event("tq-setup-changed")));
    await page.waitForFunction(() => !document.querySelector('[data-tq-view="board"]') && !window.location.hash, { timeout: 5000 });
    assert.deepEqual(errors, []);
    assert.deepEqual(page.fixtureEscapes, []);
    await page.close();
  }
});
