// Connection edits carry only changed keys, preserving poller-owned state.
import test from "node:test";
import assert from "node:assert/strict";
import { applied, cfgPatch, changes, patched, prune, saveBody, stage, stageable } from "../src/connectorDraft.js";

const conn = { ConnectorId: 3, Active: 1, Roles: "trigger", Scope: "read", ConfigJson: JSON.stringify({ bulk: "clear", reply_comments: false }) };

test("a control's settings post is held; an action is not", () => {
  assert.equal(stageable({ ConnectorId: 3, ConfigJson: "{}" }, "ConnectorId"), true);
  assert.equal(stageable({ ConnectorId: 3, Active: false, Roles: "feed" }, "ConnectorId"), true);
  assert.equal(stageable({ Type: "github", Name: "x" }, "ConnectorId"), false);          // creating one
  assert.equal(stageable({ Channel: "github", Address: "org/app" }, "SourceId"), false);  // adding a source
});

test("a patch is the keys that changed, and a key gone is null", () => {
  assert.deepEqual(cfgPatch({ a: 1, b: 2, c: 3 }, { a: 1, b: 5 }), { b: 5, c: null });
  assert.deepEqual(patched({ a: 1, c: 3 }, { b: 5, c: null }), { a: 1, b: 5 });
  assert.deepEqual(cfgPatch({ x: [1] }, { x: [1] }), {});
});

test("the draft is what the controls changed, laid over what is saved", () => {
  let want = stage(null, { ConnectorId: 3, ConfigJson: JSON.stringify({ bulk: "rank", reply_comments: false }) }, conn);
  // the next control builds on the draft it was drawn from, so it carries the first change too
  want = stage(want, { ConnectorId: 3, ConfigJson: JSON.stringify({ ...JSON.parse(applied(conn, want).ConfigJson), bulk_head: 6 }) }, conn);
  want = stage(want, { ConnectorId: 3, Roles: "trigger,feed" }, conn);
  assert.deepEqual(want.cfg, { bulk: "rank", bulk_head: 6 }, "only the keys changed, never the whole config");
  const d = applied(conn, want);
  assert.deepEqual(JSON.parse(d.ConfigJson), { bulk: "rank", reply_comments: false, bulk_head: 6 });
  assert.equal(d.Roles, "trigger,feed");
  assert.deepEqual(changes(conn, want).map((c) => `${c.key}:${c.from}->${c.to}`),
    ["Roles:trigger->feed,trigger", "bulk:clear->rank", "bulk_head:undefined->6"]);
});

test("a save posts only what changed: the fields, and the config keys as a patch - so a poller's watermark is never sent back (#242)", () => {
  const polled = { ...conn, ConfigJson: JSON.stringify({ bulk: "clear", reply_comments: false, tg_offset: 41 }) };
  const want = stage(null, { ConnectorId: 3, Scope: "write", ConfigJson: JSON.stringify({ bulk: "rank", reply_comments: false, tg_offset: 41 }) }, polled);
  // ...the poller moves on before the save goes: the patch does not carry its key at all
  const later = { ...polled, ConfigJson: JSON.stringify({ bulk: "clear", reply_comments: false, tg_offset: 57 }) };
  assert.deepEqual(saveBody(later, want, "ConnectorId"), { ConnectorId: 3, Scope: "write", ConfigPatch: { bulk: "rank" } });
});

test("changing a setting back to what is saved leaves nothing to post", () => {
  const want = stage(stage(null, { ConnectorId: 3, Active: false }, conn), { ConnectorId: 3, Active: true }, conn);
  assert.deepEqual(changes(conn, want), []);
  assert.equal(saveBody(conn, want, "ConnectorId"), null);
});

test("what the server now holds drops out of the draft; what it does not stays", () => {
  const want = stage(null, { ConnectorId: 3, Roles: "feed", ConfigJson: JSON.stringify({ bulk: "rank", reply_comments: true }) }, conn);
  const back = { ...conn, Roles: "feed", ConfigJson: JSON.stringify({ bulk: "rank", reply_comments: false }) };
  assert.deepEqual(prune(back, want), { cfg: { reply_comments: true } });
  assert.equal(prune({ ...back, ConfigJson: JSON.stringify({ bulk: "rank", reply_comments: true }) }, want), null);
});

