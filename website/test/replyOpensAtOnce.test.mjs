// REPLY OPENS AT ONCE (the owner, 2026-10-01: "Reply opens at once with "Drafting…" and the draft fills in - never waits on
// the AI"). Every Reply press asked the server to write the draft before it answered, so the card came up only when the model
// was done - a blank wait of however long the model took. The box opens now (`later`), and the draft is asked for behind it.
import test from "node:test";
import assert from "node:assert/strict";
import { draftJob, openReply, subscribeDrafts } from "../src/replyDraft.js";

const fakeApi = (draft) => {
  const calls = [];
  let release;
  const held = new Promise((r) => { release = r; });
  return { calls, release, post: async (url, body) => {
    calls.push([url, body]);
    if (url.includes("/messages/")) return { data: { reviewId: 41, taskId: 7, draft: "", drafting: true } };
    await held;
    if (draft instanceof Error) throw Object.assign(draft, { response: { data: { detail: draft.message } } });
    return { data: { ok: true, draft } };
  } };
};

test("the box opens before the model answers, says Drafting, and fills in when it does", async () => {
  const api = fakeApi("Yes, Tuesday works.");
  let woke = 0; const off = subscribeDrafts(() => { woke += 1; });
  const opened = await openReply(api, 9, "say yes");
  assert.equal(opened.reviewId, 41, "the card can be drawn now");
  assert.deepEqual(api.calls[0], ["/api/messages/9/reply", { draft: true, later: true, instruction: "say yes" }]);
  // ...and the people to loop in ride along only when there are some (the reply's CC, 2026-10-13)
  await openReply(api, 9, "ask her", ["Gail"]);
  assert.deepEqual(api.calls.at(-1), ["/api/messages/9/reply", { draft: true, later: true, instruction: "ask her", cc: ["Gail"] }]);
  assert.deepEqual(api.calls[1], ["/api/reviews/41/draft", { instruction: "say yes" }], "the draft is asked for behind it, with the owner's words");
  assert.equal(draftJob(41).state, "drafting");
  api.release(); await draftJob(41).promise;
  assert.deepEqual([draftJob(41).state, draftJob(41).draft], ["done", "Yes, Tuesday works."]);
  assert.ok(woke >= 2, "the card hears both");
  off();
});

test("a draft that fails says why in the card", async () => {
  const api = fakeApi(new Error("no AI connector is set up to write replies"));
  await openReply(api, 10);
  api.release(); await draftJob(41).promise;
  assert.equal(draftJob(41).state, "failed");
  assert.match(draftJob(41).error, /no AI connector/);
});

