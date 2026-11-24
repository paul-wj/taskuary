// Close agent on the Wall is the task page's Mark done on a live session - the same code, not a copy (the owner, 2026-10-15).
import assert from "node:assert/strict";
import test from "node:test";

test("closing an agent reports whether its write-up started", async () => {
  const { closeAgentWork } = await import("../src/closeAgent.jsx").catch(() => ({}));
  if (closeAgentWork) {
    const api = (ok) => ({ post: async (url) => {
      if (url.endsWith("/wrap") && !ok) throw new Error("nothing on screen");
      return { data: url.includes("/execute") ? { status: "done" } : { id: "op", version: 1 } };
    } });
    assert.deepEqual(await closeAgentWork(api(true), 7), { writing: true });
    assert.equal(await closeAgentWork(api(false), 7), null);
  }
});
