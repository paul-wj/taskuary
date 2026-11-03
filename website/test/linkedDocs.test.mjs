import assert from "node:assert/strict";
import test from "node:test";
import { filesLine } from "../src/timeWords.js";
import { getLocale, setLocale } from "../src/i18n.js";

test("the task's counter counts linked documents beside its files in either locale", () => {
  const previous = getLocale();
  try {
    for (const locale of ["en", "zh-CN"]) {
      setLocale(locale);
      const both = filesLine(6, 2);
      assert.match(both, /\b6\b/);
      assert.match(both, /\b2\b/);
      assert.match(filesLine(1, 0), /\b1\b/);
      assert.match(filesLine(0, 1), /\b1\b/);
      assert.notEqual(filesLine(1, 0), filesLine(0, 1));
      assert.equal(filesLine(0, 0), "");
    }
  } finally { setLocale(previous); }
});
