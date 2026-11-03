import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { movesOf, put, rowNow } from "../src/actionRow.js";
import { isSend } from "../src/pageView.js";
import { setLocale, t } from "../src/i18n.js";

test("an outward card action keeps its canonical identity and protection when its label changes language", () => {
  const action = () => React.createElement("button", { "data-tq-verb": "approve", "data-tq-send": true, onClick() {} }, t("Send"));
  setLocale("en");
  const english = movesOf(action(), "decide", "review:7")[0];
  setLocale("zh-CN");
  const chinese = movesOf(action(), "decide", "review:7")[0];
  assert.equal(english.id, "review:7:approve");
  assert.equal(chinese.id, english.id);
  put("localized-action-proof", [chinese]);
  const offered = rowNow().list.find((item) => item.id === chinese.id);
  assert.equal(isSend(offered), true);
  put("localized-action-proof", null);
  setLocale("en");
});
