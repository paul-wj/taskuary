// UNSUBSCRIBE ON AN FYI (the owner, 2026-10-22): offered only where the list named its own way off, pressed by the owner, and the
// press is a badge - on the single FYI's folded card, on the handful's line.
import test from "node:test";
import assert from "node:assert/strict";
import { canUnsubscribe, unsubscribeFrom } from "../src/unsubscribe.js";

const fakeApi = (data) => { const calls = []; return { calls, post: async (path, body) => { calls.push([path, body]); return { data }; } }; };

test("offered only on a message whose list named a way off", () => {
  assert.equal(canUnsubscribe({ mid: 4, unsub: "post" }), true);
  assert.equal(canUnsubscribe({ mid: 4 }), false);
  assert.equal(canUnsubscribe({ unsub: "url" }), false);
});

test("one-click is the server's: nothing opens", async () => {
  const api = fakeApi({ via: "post" }), opened = [];
  await unsubscribeFrom(api, 9, { open: (...a) => opened.push(a) });
  assert.deepEqual(api.calls, [["/api/messages/9/unsubscribe", { open: false }]]);
  assert.deepEqual(opened, []);
});

test("a page or a mail to finish on opens in a tab, and the desktop app has the server open it", async () => {
  const opened = [];
  await unsubscribeFrom(fakeApi({ via: "mailto", link: "mailto:leave@vendor.example" }), 9, { open: (...a) => opened.push(a) });
  assert.deepEqual(opened, [["mailto:leave@vendor.example", "_blank", "noopener"]]);
  const app = fakeApi({ via: "url", link: "https://lists.vendor.example/u", opened: true }), none = [];
  await unsubscribeFrom(app, 9, { pywebview: {}, open: (...a) => none.push(a) });
  assert.deepEqual(app.calls[0][1], { open: true });
  assert.deepEqual(none, []);
});

