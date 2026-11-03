import test from "node:test";
import assert from "node:assert/strict";

let serial = 0;
async function load({ stored = null, language = "en-US", denied = false } = {}) {
  const values = new Map(stored === null ? [] : [["taskuary.language", stored]]);
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { language } });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem(key) { if (denied) throw new Error("denied"); return values.get(key) ?? null; },
    setItem(key, value) { if (denied) throw new Error("denied"); values.set(key, value); },
  } });
  const locale = await import(`../src/i18n.js?case=${serial++}`);
  return { ...locale, values };
}

test("explicit preference takes precedence over browser language", async () => {
  assert.equal((await load({ stored: "en", language: "zh-TW" })).getLocale(), "en");
  assert.equal((await load({ stored: "zh-CN", language: "en-US" })).getLocale(), "zh-CN");
});

test("browser Chinese variants select Simplified Chinese and other languages select English", async () => {
  assert.equal((await load({ language: "zh-TW" })).getLocale(), "zh-CN");
  assert.equal((await load({ language: "fr-FR" })).getLocale(), "en");
});

test("invalid preferences and selections fall back to English", async () => {
  const locale = await load({ stored: "invalid", language: "zh-CN" });
  assert.equal(locale.getLocale(), "en");
  locale.setLocale("invalid");
  assert.equal(locale.getLocale(), "en");
});

test("storage denial does not prevent detection or switching", async () => {
  const locale = await load({ denied: true, language: "zh-HK" });
  assert.equal(locale.getLocale(), "zh-CN");
  locale.setLocale("en");
  assert.equal(locale.getLocale(), "en");
});

test("a denied storage getter still permits browser detection and switching", async () => {
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { language: "zh-TW" } });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("denied"); } });
  const locale = await import(`../src/i18n.js?case=${serial++}`);
  assert.equal(locale.getLocale(), "zh-CN");
  locale.setLocale("en");
  assert.equal(locale.getLocale(), "en");
});

test("subscribers see changes, can unsubscribe, and preference is stored", async () => {
  const locale = await load();
  const seen = [];
  const unsubscribe = locale.subscribeLocale(() => seen.push(locale.getLocale()));
  locale.setLocale("zh-CN");
  assert.deepEqual(seen, ["zh-CN"]);
  assert.equal(locale.values.get("taskuary.language"), "zh-CN");
  unsubscribe();
  locale.setLocale("en");
  assert.deepEqual(seen, ["zh-CN"]);
});

test("translation interpolates without interpreting or translating inserted values", async () => {
  const locale = await load({ stored: "zh-CN" });
  assert.equal(locale.t("{tool} (on this computer)", { tool: "{other} Settings" }), "{other} Settings（在此电脑上）");
  assert.equal(locale.t("Unknown {name}", { name: "{other}" }), "Unknown {other}");
  locale.setLocale("en");
  assert.equal(locale.t("{tool} (on this computer)", { tool: "codex" }), "codex (on this computer)");
});
test("OMP connection guidance switches languages without changing its safety limits", async () => {
  const locale = await load({ stored: "zh-CN" });
  const guidance = "Use /login to connect a provider and /model to choose it. Task execution only; triage, reports and stranger-origin work are not supported.";
  assert.equal(locale.t(guidance), "使用 /login 连接提供商，并使用 /model 选择模型。仅用于执行任务；不支持分流、报告或来自陌生人的工作。");
  locale.setLocale("en");
  assert.equal(locale.t(guidance), guidance);
});


test("nested presentation descriptors translate without changing raw data", async () => {
  const locale = await load({ stored: "zh-CN" });
  const raw = "{tool} Settings";
  assert.equal(locale.translateDescriptor({ source: "Failed: {why}", values: {
    why: { source: "{tool} (on this computer)", values: { tool: raw } },
  } }), "失败：{tool} Settings（在此电脑上）");
  assert.equal(locale.translateDescriptor(raw), raw);
});

test("date and relative-time labels switch language without changing machine day keys", async () => {
  const { setLocale } = await import("../src/i18n.js");
  const { dayLabel, fmtDay, localDay } = await import("../src/dates.js");
  const { agoMins, span } = await import("../src/timeWords.js");
  const stamp = "2026-01-02T12:00:00";
  const now = new Date(2026, 0, 2, 12);
  setLocale("en");
  const key = localDay(stamp);
  assert.equal(dayLabel(stamp, now), "Today");
  assert.equal(agoMins(5), "5m ago");
  assert.equal(dayLabel("2026-01-01T12:00:00", new Date(2026, 0, 3, 12)), "Thu, Jan 1");
  setLocale("zh-CN");
  assert.equal(dayLabel(stamp, now), "今天");
  assert.equal(agoMins(5), "5分钟前");
  assert.equal(span(120, true), "2 小时");
  assert.equal(span(1440, true), "1 天");
  assert.equal(fmtDay(stamp), "1月2日");
  assert.equal(localDay(stamp), key);
  setLocale("en");
});

test("localized button text still resolves to canonical action identifiers", async () => {
  const { setLocale } = await import("../src/i18n.js");
  const { label } = await import("../src/buttons.js");
  const { verbOfLabel } = await import("../src/pressLog.js");
  setLocale("zh-CN");
  assert.equal(verbOfLabel(label("close")), "close");
  assert.equal(verbOfLabel(label("approve", "action")), "approve");
  setLocale("en");
  assert.equal(verbOfLabel("Mark done"), "close");
});

test("back navigation and restored state use their own meanings without changing English", async () => {
  const locale = await load({ stored: "zh-CN" });
  assert.equal(locale.t("Back"), "返回");
  assert.equal(locale.t("Back", {}, "restoration"), "已恢复");
  assert.equal(locale.t("Read"), "已读");
  assert.equal(locale.t("Read", {}, "permission"), "读取");
  assert.equal(locale.t("Back", {}, "unknown"), "返回");
  locale.setLocale("en");
  assert.equal(locale.t("Back", {}, "restoration"), "Back");
});
