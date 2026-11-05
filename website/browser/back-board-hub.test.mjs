import assert from "node:assert/strict";
import test from "node:test";
import { boot, clickText, sleep } from "./walkdriver.mjs";

/* GOING BACK RESTORES WHERE YOU WERE (the 2026-10-25 navigation sweep; the 2026-10-26 sweep found two places it did not): the Board wrote
   no address, so Back from a task opened on it left the task drawn on the chat and the Board gone; and an opened Hub post wrote none
   either, so Back from it left the Hub altogether. */
const onBoard = (page) => page.evaluate(() => [...document.querySelectorAll("[data-tq-board-task]")].some((e) => e.getBoundingClientRect().height > 0));

test("Back from a task opened on the Board brings the Board back", { timeout: 180000 }, async (t) => {
  const { page, errors } = await boot(t, { width: 1440, height: 1000 });
  assert.ok(await clickText(page, /^Board$/)); await sleep(2500);
  assert.ok(await onBoard(page), "the Board did not open");
  assert.equal(await page.evaluate(() => location.hash), "#board");
  await page.evaluate(() => document.querySelector("[data-tq-board-task]").click()); await sleep(3000);
  assert.ok(!(await onBoard(page)), "the task did not open over the Board");
  await page.goBack(); await sleep(2500);
  assert.ok(await onBoard(page), `Back from the task did not bring the Board back: ${await page.evaluate(() => location.hash)}`);
  // ...and Back again leaves the Board for where the owner was before it - the chat
  await page.goBack(); await sleep(2500);
  assert.ok(!(await onBoard(page)), "Back from the Board stayed on the Board");
  assert.deepEqual(errors, []);
});

test("Back from an opened Hub post returns to the Hub's list", { timeout: 180000 }, async (t) => {
  const { page, errors } = await boot(t, { width: 1440, height: 1000 });
  const B = '[data-tq-browse="hub"]';
  await page.evaluate(() => { location.hash = "#hub"; });
  await page.waitForSelector(`${B} [data-tq-post-open]`, { timeout: 30000 }); await sleep(1500);
  await page.evaluate((B) => document.querySelectorAll(`${B} [data-tq-post-open]`)[0].click(), B); await sleep(1500);
  assert.ok(await page.$(`${B} [data-tq-browse-one]`), "the post did not open");
  await page.goBack(); await sleep(2000);
  assert.ok(await page.$(B), `Back from the post left the Hub: ${await page.evaluate(() => location.hash)}`);
  assert.equal(await page.$(`${B} [data-tq-browse-one]`), null, "Back did not close the post");
  assert.deepEqual(errors, []);
});

test("owner-completed agent work stays on the Board after refresh in both locales", { timeout: 180000 }, async (t) => {
  const { h, page, errors } = await boot(t, { width: 1440, height: 1000 });
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
  await page.goto(`${h.ui}#board`, { waitUntil: "domcontentloaded" });
  const card = `[data-tq-board-task="${taskId}"]`;
  await page.waitForSelector(card, { visible: true, timeout: 15000 });
  await post("/api/fixture/task/closed-elsewhere", { task_id: taskId });
  for (const locale of ["en", "zh-CN"]) {
    await page.evaluate((locale) => localStorage.setItem("taskuary.language", locale), locale);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(card, { visible: true, timeout: 15000 });
    assert.ok(await page.$eval(card, (el) => el.parentElement === el.parentElement.parentElement.lastElementChild), "finished work belongs in the last column");
    assert.equal(await page.$(`[data-tq-board-task="${todoId}"]`), null, "a completed personal to-do is not agent work");
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(page.fixtureEscapes, []);
});
