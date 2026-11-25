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
    assert.equal(await page.$eval(card, (el) => el.closest('[data-tq-board-column]').dataset.tqBoardColumn), "agentdone", "finished work belongs in the last column");
    assert.equal(await page.$(`[data-tq-board-task="${todoId}"]`), null, "a completed personal to-do is not agent work");
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(page.fixtureEscapes, []);
});

test("a completed task publishes verified Hub knowledge without scanning history", { timeout: 120000 }, async (t) => {
  const h = await startHarness();
  t.after(() => h.close());
  const request = async (path, body) => {
    const r = await fetch(`${h.fixtureApi}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "X-Taskuary-Token": h.token, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.ok(r.ok, `${path}: ${r.status}`);
    return r.json();
  };
  const fixture = "/api/fixture/hub/completion";
  const { taskId, oldTaskId } = await request(fixture, {});
  const page = await h.newPage(), errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const url = `${h.ui}/#task=${taskId}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const task = `[data-tq-task-page="${taskId}"]`;
  await page.waitForSelector(`${task} [data-tq-task-head]`, { visible: true });
  await request("/api/fixture/task/closed-elsewhere", { task_id: taskId });
  const pending = `${task} [data-tq-hub-learning="pending"]`;
  await page.waitForSelector(pending, { visible: true });
  assert.equal((await request(`/api/tasks/${taskId}`)).task.Status, "done", "model delay does not delay completion");
  assert.equal((await request(`/api/tasks/${oldTaskId}`)).hubLearning, null, "historical tasks never enter the queue");
  await request(fixture, { release: true });
  const published = `${task} [data-tq-hub-learning="published"]`;
  await page.waitForSelector(`${published} a`, { visible: true });
  const { entries: [entry] } = (await request(`/api/tasks/${taskId}`)).hubLearning;
  assert.equal(await page.$eval(`${published} a`, (a) => a.textContent), `#${entry}`);
  const post = await request(`/api/hub/${entry}`);
  assert.equal(post.TaskId, taskId);
  assert.equal(post.Title, "Export validation reads the first row before the header");
  await page.evaluate(() => localStorage.setItem("taskuary.language", "zh-CN"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(published, { visible: true });
  assert.match(await page.$eval(published, (line) => line.textContent), /已收录到知识中心/);
  await page.click(`${published} a`);
  await page.waitForFunction((id) => location.hash.includes(`post=${id}`), {}, entry);
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

test("Board finished-work filter reveals history without hiding live or approval work in both locales", { timeout: 180000 }, async (t) => {
  const h = await startHarness(); t.after(() => h.close());
  await setDeveloperMode(h, true);
  const now = new Date(), today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} 12:00:00`;
  const task = (id, fields) => ({ TaskId: id, ref: `TQ-${id}`, Title: `Fictional board task ${id}`, Kind: "coding", Status: "done", State: "closed", HadAgent: true, CreatedAt: "2020-01-01 12:00:00", UpdatedAt: "2020-01-02 12:00:00", ClosedAt: "2020-01-02 12:00:00", ...fields });
  const rows = [task(901), task(902, { ClosedAt: today }), task(903, { Status: "open", State: "working", ClosedAt: null }),
    task(904, { Status: "open", State: "approve", ClosedAt: null }), task(905, { OnWorkToday: true }),
    task(906, { Kind: "task", HadAgent: false }), task(907, { Status: "dropped" })];
  for (const locale of ["en", "zh-CN"]) {
    const page = await h.newPage(), errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.evaluateOnNewDocument(value => localStorage.setItem("taskuary.language", value), locale);
    page.off("request", page.fixtureRequestGuard);
    page.on("request", request => {
      const url = new URL(request.url());
      if (url.pathname === "/api/tasks" && request.method() === "GET") return request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ data: url.searchParams.get("active") === "1" ? rows.filter(r => r.TaskId !== 901) : rows }) });
      page.fixtureRequestGuard(request);
    });
    await page.goto(`${h.ui}/#board`, { waitUntil: "domcontentloaded" });
    const filter = '[data-tq-board-history] [role=combobox]';
    await page.waitForSelector(filter, { visible: true, timeout: 5000 });
    assert.equal(await page.$eval(filter, el => el.textContent.trim()), locale === "en" ? "Today" : "今天");
    const check = async (history) => {
      await page.waitForFunction((history) => !!document.querySelector('[data-tq-board-task="901"]') === history, {}, history);
      for (const id of [902, 903, 904, 905]) assert.ok(await page.$(`[data-tq-board-task="${id}"]`), `task ${id} stays visible`);
      for (const id of [906, 907]) assert.equal(await page.$(`[data-tq-board-task="${id}"]`), null, `task ${id} stays outside the agent board`);
    };
    await page.waitForSelector('[data-tq-board-task="902"]'); await check(false);
    for (const value of ["all", "today", "all"]) {
      await page.click(filter);
      await page.waitForSelector(`[role=option][data-value="${value}"]`, { visible: true });
      await page.click(`[role=option][data-value="${value}"]`);
      await page.waitForSelector('[role=listbox]', { hidden: true });
      await check(value === "all");
    }
    assert.deepEqual(errors, []); assert.deepEqual(page.fixtureEscapes, []);
    await page.close();
  }
});

test("Board columns scroll independently on desktop and flow naturally on mobile", { timeout: 180000 }, async (t) => {
  const h = await startHarness(); t.after(() => h.close());
  await setDeveloperMode(h, true);
  const page = await h.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  const rows = ["working", "closed"].flatMap((state, lane) => Array.from({ length: 35 }, (_, i) => ({
    TaskId: 2000 + lane * 100 + i, ref: `TQ-${2000 + lane * 100 + i}`, Title: `Fictional ${state} task ${i} with enough detail to wrap`,
    Kind: "coding", Status: state === "closed" ? "done" : "in_progress", State: state, HadAgent: true, OnWorkToday: true,
    CreatedAt: "2020-01-01 12:00:00", UpdatedAt: "2020-01-02 12:00:00",
  })));
  page.off("request", page.fixtureRequestGuard);
  page.on("request", request => {
    if (new URL(request.url()).pathname === "/api/tasks" && request.method() === "GET") return request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ data: rows }) });
    page.fixtureRequestGuard(request);
  });
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${h.ui}/#board`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-tq-board-task="2034"]');
  const desktop = async () => {
    const sizes = await page.evaluate(() => {
      const card = document.querySelector('[data-tq-board-task="2000"]'), column = card.parentElement;
      return { overflow: getComputedStyle(column).overflowY, height: column.clientHeight, content: column.scrollHeight,
        pageHeight: document.scrollingElement.scrollHeight, viewport: innerHeight, width: document.scrollingElement.scrollWidth, viewportWidth: innerWidth };
    });
    assert.equal(sizes.overflow, "auto", "cards scroll within their own column body");
    assert.ok(sizes.content > sizes.height + 100, "long columns overflow inside their bounded body");
    assert.ok(sizes.pageHeight <= sizes.viewport + 1, "long columns never lengthen the page");
    assert.ok(sizes.width <= sizes.viewportWidth + 1, "columns fit the viewport width");
    const head = await page.$eval('[data-tq-board-task="2000"]', el => el.parentElement.previousElementSibling.getBoundingClientRect().top);
    const box = await page.$eval('[data-tq-board-task="2000"]', el => { const r = el.parentElement.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.mouse.move(box.x, box.y); await page.mouse.wheel({ deltaY: 400 });
    await page.waitForFunction(() => document.querySelector('[data-tq-board-task="2000"]').parentElement.scrollTop > 0);
    assert.equal(await page.$eval('[data-tq-board-task="2100"]', el => el.parentElement.scrollTop), 0, "scrolling one lane leaves another alone");
    assert.equal(await page.evaluate(() => scrollY), 0, "the page does not scroll with the cards");
    assert.equal(await page.$eval('[data-tq-board-task="2000"]', el => el.parentElement.previousElementSibling.getBoundingClientRect().top), head, "the lane header stays fixed");
    await page.$eval('[data-tq-board-task="2034"]', el => { el.parentElement.scrollTop = el.parentElement.scrollHeight; });
    assert.ok(await page.$eval('[data-tq-board-task="2034"]', el => { const a = el.getBoundingClientRect(), b = el.parentElement.getBoundingClientRect(); return a.top >= b.top && a.bottom <= b.bottom; }), "last task stays reachable");
    await page.$eval('[data-tq-board-task="2000"]', el => { el.parentElement.scrollTop = 0; });
  };
  await desktop();
  await page.setViewport({ width: 1000, height: 600 });
  await desktop();
  await page.setViewport({ width: 390, height: 844 });
  assert.equal(await page.$eval('[data-tq-board-task="2000"]', el => getComputedStyle(el.parentElement).overflowY), "visible");
  assert.ok(await page.evaluate(() => document.scrollingElement.scrollHeight > innerHeight), "stacked mobile columns use page scrolling");
  await page.$eval('[data-tq-board-task="2134"]', el => el.scrollIntoView({ block: "center" }));
  assert.ok(await page.$eval('[data-tq-board-task="2134"]', el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), "last mobile task is reachable");
  assert.deepEqual(errors, []); assert.deepEqual(page.fixtureEscapes, []);
});
