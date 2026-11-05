import assert from "node:assert/strict";
import test from "node:test";
import { startHarness } from "./harness.mjs";

/* A START HELD FOR A REPOSITORY CARRIES ITS PICK ON THE LINE THAT SAYS SO (the owner, 2026-10-30): "Repository: none - not started"
   named the problem and offered nothing to press. The line has Choose where the code is, and it opens the task's own repository picker. */

test("a coding task held for a repository has Choose where the code is on its line, and it opens the picker", { timeout: 240000 }, async (t) => {
  const harness = await startHarness({ fresh: true });
  t.after(() => harness.close());
  const H = { "X-Taskuary-Token": harness.token, "Content-Type": "application/json" };
  const made = await (await fetch(`${harness.fixtureApi}/api/tasks`, { method: "POST", headers: H,
    body: JSON.stringify({ Title: "Fix the nightly export", Summary: "The export drops its last row", Kind: "coding", Tags: "held:repo" }) })).json();
  assert.ok(made.taskId, "a task to open");
  assert.equal((await fetch(`${harness.fixtureApi}/api/setup/dismiss`, { method: "POST", headers: H, body: JSON.stringify({ dismissed: true }) })).status, 200);

  const page = await harness.newPage(), errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(harness.ui, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.evaluate((tid) => { window.location.hash = `task=${tid}`; }, made.taskId);
  await page.waitForSelector("[data-tq-fact-alert='repo'] [data-tq-fact-pick='repo']", { timeout: 30000 })
    .catch(async (e) => { throw new Error(`${e.message}\n${(await page.evaluate(() => document.body.innerText)).slice(-1500)}`); });
  const line = await page.$eval("[data-tq-fact-alert='repo']", (el) => el.innerText);
  assert.match(line, /Repository: none - not started/);
  assert.match(line, /Choose where the code is/);
  assert.equal(await page.$("[data-tq-repo-picker]"), null, "the picker is closed until pressed");

  await page.click("[data-tq-fact-alert='repo'] [data-tq-fact-pick='repo']");
  await page.waitForSelector("[data-tq-repo-picker]", { visible: true, timeout: 10000 });
  assert.match(await page.$eval("[data-tq-repo-picker]", (el) => el.innerText), /Which code is this about\?/);
  assert.deepEqual(errors, []);
});

test("local code can be bound without GitHub, rejecting missing paths without changing the task or starting a session", { timeout: 240000 }, async (t) => {
  const h = await startHarness({ fresh: true });
  t.after(() => h.close());
  const { mkdir } = await import("node:fs/promises");
  const folder = `${h.home}/local code`;
  await mkdir(folder);
  const H = { "X-Taskuary-Token": h.token, "Content-Type": "application/json" };
  const call = async (path, method = "GET", body) => {
    const r = await fetch(`${h.fixtureApi}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
    assert.ok(r.ok, `${method} ${path}: ${await r.clone().text()}`);
    return r.json();
  };
  await call("/api/agents/coding", "PUT", { cmd: "omp", kind: "coding", triage_enabled: false });
  const made = await call("/api/tasks", "POST", { Title: "Repair local export", Kind: "coding", Tags: "held:repo" });
  await call("/api/setup/dismiss", "POST", { dismissed: true });
  const page = await h.newPage(), errors = [], starts = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => { if (r.method() === "POST" && /dispatch|continue|sessions/.test(new URL(r.url()).pathname)) starts.push(r.url()); });
  await page.goto(`${h.ui}/#task=${made.taskId}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-tq-fact-pick='repo']", { timeout: 30000 });
  await page.click("[data-tq-fact-pick='repo']");
  await page.waitForSelector("[data-tq-local-code] button", { visible: true });
  await page.click("[data-tq-local-code] button");
  const fill = async (text) => { await page.$eval("[data-tq-local-code-path]", (i) => { i.focus(); i.select(); }); await page.keyboard.type(text); };
  await fill(`${folder}/missing`);
  const rejected = page.waitForResponse((r) => r.url().endsWith(`/api/tasks/${made.taskId}/repo`) && r.request().method() === "PUT");
  await page.click("[data-tq-local-code-save]");
  assert.equal((await rejected).status(), 422);
  const rejectedTags = (await call(`/api/tasks/${made.taskId}`)).task.Tags;
  assert.ok(rejectedTags.includes("held:repo"));
  assert.ok(!rejectedTags.includes("repo:local:"));
  await fill(folder);
  const saved = page.waitForResponse((r) => r.url().endsWith(`/api/tasks/${made.taskId}/repo`) && r.request().method() === "PUT");
  await page.click("[data-tq-local-code-save]");
  assert.equal((await saved).status(), 200);
  const task = await call(`/api/tasks/${made.taskId}`);
  assert.ok(task.task.Tags.includes("repo:local:"));
  assert.ok(!task.task.Tags.includes("held:repo"));
  const repos = await call(`/api/tasks/${made.taskId}/repos?agent=coding`);
  assert.equal(repos.data.find((r) => r.tagged).path, folder);
  await page.waitForFunction((path) => document.querySelector("[data-tq-repo-picker]")?.innerText.includes(path), {}, folder);
  assert.ok(!(await page.$eval("body", (b) => b.innerText)).includes("repo:local:"));
  assert.ok(!(await page.$eval("body", (b) => b.innerText)).includes("local:"), "classification and pickers show the directory, not its internal identifier");
  assert.deepEqual(starts, []);
  assert.deepEqual(errors, []);
  assert.deepEqual(page.fixtureEscapes, []);
});
