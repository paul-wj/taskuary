import test from "node:test";
import assert from "node:assert/strict";
import { startHarness } from "./harness.mjs";

test("workflow schedules preserve supported shapes and remove conflicting modes", { timeout: 300000 }, async (t) => {
  const harness = await startHarness();
  t.after(() => harness.close());
  const page = await harness.newPage();
  await page.goto(harness.ui, { waitUntil: "domcontentloaded" });
  const result = await page.evaluate(async () => {
    const { scheduleOf, withSchedule } = await import("/src/WorkflowEditor.jsx");
    const weekly = withSchedule({ title: "Example workflow", daily_at: "08:00" }, { mode: "weekly", at: "08:00", days: [1] });
    return {
      weekly, roundTrip: scheduleOf(weekly),
      daily: withSchedule({ cron: "0 8 * * 1" }, { mode: "daily", at: "07:30" }),
      monthly: withSchedule({ daily_at: "07:30" }, { mode: "monthly", at: "09:00", day: 1 }),
      every: withSchedule({ daily_at: "07:30" }, { mode: "every", minutes: "45" }),
      manual: withSchedule({ daily_at: "07:30", every_minutes: 5 }, { mode: "manual" }),
      weekdays: scheduleOf({ cron: "0 7 * * 1-5" }),
      arbitraryCron: scheduleOf({ cron: "*/5 * * * *" }),
      sortedDays: withSchedule({}, { mode: "weekly", at: "08:00", days: [3, 1] }),
    };
  });
  assert.deepEqual(result.weekly, { title: "Example workflow", cron: "0 8 * * 1" });
  assert.deepEqual(result.roundTrip, { mode: "weekly", at: "08:00", days: [1] });
  assert.deepEqual(result.daily, { daily_at: "07:30" });
  assert.deepEqual(result.monthly, { cron: "0 9 1 * *" });
  assert.deepEqual(result.every, { every_minutes: 45 });
  assert.deepEqual(result.manual, {});
  assert.deepEqual(result.weekdays, { mode: "weekly", at: "07:00", days: [1, 2, 3, 4, 5] });
  assert.deepEqual(result.arbitraryCron, { mode: "cron", cron: "*/5 * * * *" });
  assert.deepEqual(result.sortedDays, { cron: "0 8 * * 1,3" });
  assert.deepEqual(page.fixtureEscapes, []);
});
