import { test } from "node:test";
import assert from "node:assert";
import { digestLabel } from "../src/digestLabel.js";
import { setLocale } from "../src/i18n.js";

test("the digest is named by when it was written", () => {
  for (const locale of ["en", "zh-CN"]) {
    setLocale(locale);
    const morning = digestLabel("2026-11-02 09:00:00");
    const afternoon = digestLabel("2026-11-02 14:30:00");
    const evening = digestLabel("2026-11-02 22:12:00");
    assert.notEqual(morning, afternoon);
    assert.notEqual(afternoon, evening);
    assert.notEqual(morning, evening);
    assert.equal(digestLabel(null, new Date(2026, 10, 2, 22, 12)), evening);
  }
});

