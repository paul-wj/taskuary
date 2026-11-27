import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { movesOf, put, rowNow } from "../src/actionRow.js";
import { setLocale, t } from "../src/i18n.js";
import { run } from "../src/pageView.js";

test("an outward action keeps its canonical identity and cannot be pressed by the page reader in either language", async (test) => {
  let pressed = 0;
  const action = () => React.createElement("button", { "data-tq-verb": "approve", onClick: () => { pressed++; } }, t("Send"));
  test.after(() => { put("localized-action-proof", null); setLocale("en"); });
  setLocale("en");
  const english = movesOf(action(), "decide", "review:7")[0];
  setLocale("zh-CN");
  const chinese = movesOf(action(), "decide", "review:7")[0];
  assert.equal(english.id, "review:7:approve");
  assert.equal(chinese.id, english.id);
  put("localized-action-proof", [chinese]);
  const offered = rowNow().list.find((item) => item.id === chinese.id);
  assert.notEqual(offered.label, english.label);
  assert.deepEqual(await run([{ op: "press", button: `row:${offered.id}` }]), { steps: [] });
  assert.equal(pressed, 0);
});
