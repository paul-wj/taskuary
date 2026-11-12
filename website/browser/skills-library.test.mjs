import test from 'node:test';
import assert from 'node:assert/strict';
import { startHarness } from './harness.mjs';

for (const locale of ['en', 'zh-CN']) test(`Skills: AI suggestions and complete reviewed package publication (${locale})`, { timeout: 120000 }, async (t) => {
  const h = await startHarness({ fresh: true }); t.after(() => h.close());
  const seeded = await fetch(`${h.fixtureApi}/api/fixture/skill-library`, { headers: { 'X-Taskuary-Token': h.token } });
  assert.equal(seeded.status, 200);
  const fixture = await seeded.json();
  const page = await h.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.evaluateOnNewDocument(value => localStorage.setItem('taskuary.language', value), locale);
  await page.goto(`${h.ui}#skills=suggestions`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-tq-skill-suggestion]');
  assert.equal(await page.$$eval('[data-tq-browse="skills"] input[type=checkbox]', nodes => nodes.length), 0);
  await page.click('[data-tq-skill-evidence] summary');
  assert.match(await page.$eval('[data-tq-skill-evidence]', e => e.innerText), /Verified comparison method/);
  await page.goto(`${h.ui}#skills=generations&open=generation:${fixture.generation_id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-tq-skill-file="assets/template.bin"]');
  await page.click('[data-tq-skill-file="scripts/check.py"]');
  await page.waitForFunction(() => document.querySelector('[data-tq-skill-file-preview]')?.innerText.includes('synthetic fixture only'));
  await page.click('[data-tq-skill-file="assets/template.bin"]');
  assert.equal(await page.$$eval('[data-tq-skill-file-preview] iframe,[data-tq-skill-file-preview] img', nodes => nodes.length), 0);
  await page.$eval('[data-tq-skill-approve]', button => button.scrollIntoView({ block: 'center' }));
  await page.evaluate(async () => {
    const view = await import('/src/pageView.js');
    const label = document.querySelector('[data-tq-skill-approve]').textContent.trim();
    const approve = view.readView().buttons.find(button => button.label === label);
    if (!approve) throw new Error('the publication decision is not visible to the page guard');
    await view.run([{ op: 'press', button: approve.id }]);
  });
  const guarded = await fetch(`${h.fixtureApi}/api/skill-library/generations/${fixture.generation_id}`, { headers: { 'X-Taskuary-Token': h.token } });
  assert.equal((await guarded.json()).state, 'needs_review', 'the Assistant may point at publication, never approve it');
  await page.click('[data-tq-skill-approve]');
  await page.waitForSelector('[data-tq-skill-published]');
  const published = await fetch(`${h.fixtureApi}/api/skill-library/skills/taskuary-review-example`, { headers: { 'X-Taskuary-Token': h.token } });
  assert.equal(published.status, 200);
  assert.equal((await published.json()).digest, fixture.draft_digest);
  assert.deepEqual(errors, []);
  assert.deepEqual(page.fixtureEscapes, []);
});

for (const locale of ['en', 'zh-CN']) test(`Skills: empty analysis states and evidence count (${locale})`, { timeout: 120000 }, async (t) => {
  const h = await startHarness({ fresh: true }); t.after(() => h.close());
  const page = await h.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.evaluateOnNewDocument(value => localStorage.setItem('taskuary.language', value), locale);
  const states = locale === 'zh-CN'
    ? { no_evidence: '暂无包含已保存执行结果的已完成工作可供分析', empty: '暂未发现值得提炼的通用方法', running: 'AI 正在分析已完成工作', failed: '失败' }
    : { no_evidence: 'No completed work with saved results to analyze', empty: 'No reusable method suggested yet', running: 'AI is analyzing completed work', failed: 'Failed' };
  for (const [status, message] of Object.entries(states)) {
    const response = await fetch(`${h.fixtureApi}/api/fixture/skill-analysis/${status}`, { method: 'POST', headers: { 'X-Taskuary-Token': h.token } });
    assert.equal(response.status, 200);
    await page.goto(`${h.ui}#skills=suggestions`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(text => document.querySelector('[data-tq-browse="skills"]')?.innerText.includes(text), {}, message);
    const count = status === 'no_evidence' ? 0 : 3;
    assert.match(await page.$eval('[data-tq-skill-analysis-count]', e => e.innerText), new RegExp(`: ${count}$|：${count}$`));
    if (status !== 'empty') assert.ok(!(await page.$eval('[data-tq-browse="skills"]', e => e.innerText)).includes(states.empty));
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(page.fixtureEscapes, []);
});
