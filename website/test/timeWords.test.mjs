// Boundary cases for relative time, duration and count formatting.
import test from "node:test";
import assert from "node:assert/strict";
import { age, ago, agoMins, band, bandUntil, dur, durSince, minsSince, plural, span } from "../src/timeWords.js";
import { t } from "../src/i18n.js";

const now = new Date("2026-10-18T09:00:00").getTime();
const at = (m) => new Date(now - m * 60000).toISOString();

test("ago: just now inside a minute either way, behind in whole units, ahead reads forward", () => {
  assert.equal(ago(at(0), now), t("just now"));
  assert.equal(ago(at(0.4), now), t("just now"));
  assert.equal(ago(at(1), now), t("{time} ago", { time: t("{count}m", { count: 1 }) }));
  assert.equal(ago(at(59), now), t("{time} ago", { time: t("{count}m", { count: 59 }) }));
  assert.equal(ago(at(60), now), t("{time} ago", { time: t("{count}h", { count: 1 }) }));
  assert.equal(ago(at(150), now), t("{time} ago", { time: t("{count}h", { count: 2 }) }));
  assert.equal(ago(at(1439), now), t("{time} ago", { time: t("{count}h", { count: 23 }) }));
  assert.equal(ago(at(1440), now), t("{time} ago", { time: t("{count}d", { count: 1 }) }));
  assert.equal(ago(at(47 * 60), now), t("{time} ago", { time: t("{count}d", { count: 1 }) }));
  assert.equal(ago(at(-5), now), t("in {time}", { time: t("{count}m", { count: 5 }) }));
  assert.equal(ago(at(-3 * 1440), now), t("in {time}", { time: t("{count}d", { count: 3 }) }));
  for (const x of [null, undefined, "", "not a date"]) assert.equal(ago(x, now), "");
  assert.equal(ago(new Date(now - 300000), now), ago(at(5), now), "a Date in, as ui.asUtc hands one over");
  assert.equal(agoMins(0.2), t("just now"));
  assert.equal(minsSince("2026-10-18 08:00:00", now), 60, "a server stamp with a space is local time");
});

test("age is the bare distance, band the rail's gutter, bandUntil For later's countdown", () => {
  assert.deepEqual([age(at(0.4), now), age(at(40), now), age(at(240), now), age(at(-12), now), age("", now)],
    [t("now"), t("{count}m", { count: 40 }), t("{count}h", { count: 4 }), t("in {time}", { time: t("{count}m", { count: 12 }) }), ""]);
  assert.deepEqual([band(at(10), now), band(at(45), now), band(at(185), now), band(at(-5), now)],
    [t("< 30m"), t("< 1h"), t("{count}h", { count: 3 }), t("in {time}", { time: t("{count}m", { count: 5 }) })]);
  assert.deepEqual([bandUntil(at(-10), now), bandUntil(at(-45), now), bandUntil(at(-185), now), bandUntil(at(5), now)],
    [t("in 30m"), t("in 1h"), t("in {time}", { time: t("{count}h", { count: 3 }) }), ""]);
});

test("dur says how long something has run; span and plural say a count", () => {
  assert.deepEqual([dur(0), dur(89), dur(90), dur(5399), dur(5400), dur(null)],
    [t("{count}s", { count: 0 }), t("{count}s", { count: 89 }), t("{count}m", { count: 2 }), t("{count}m", { count: 90 }), t("{count}h", { count: "1.5" }), ""]);
  assert.equal(durSince(at(-1), now), dur(0), "a start a clock wrote ahead has run for nothing yet");
  assert.deepEqual([span(5), span(180), span(2 * 1440), span(2 * 1440, true), span(1, true)],
    [t("{count}m", { count: 5 }), t("{count}h", { count: 3 }), t("{count}d", { count: 2 }), `2 ${t("days")}`, `1 ${t("minute")}`]);
  assert.deepEqual([plural(1, "task"), plural(0, "task"), plural(3, "reply", "replies")], [`1 ${t("task")}`, `0 ${t("tasks")}`, `3 ${t("replies")}`]);
});

