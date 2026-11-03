import test from "node:test";
import assert from "node:assert/strict";
import { cliCardOf } from "../src/cliCard.js";

test("the CLI agents card is on only when a CLI is connected; installed alone is off and says so", () => {
  const clis = [{ name: "claude", label: "Claude Code", installed: true, configured: false }, { name: "codex", label: "OpenAI Codex CLI", installed: true, configured: false },
    { name: "qwen", label: "Qwen Code", installed: false, configured: false }];
  const off = cliCardOf(clis);
  assert.equal(off.state, "off");
  assert.ok(off.desc.includes("2"));
  clis[0].configured = true;
  const on = cliCardOf(clis);
  assert.equal(on.state, "on");
  assert.ok(on.desc.includes("Claude Code"));
  // a saved connection to a CLI that is not on this machine is not "Connected" (a fresh install, 2026-10-20)
  assert.equal(cliCardOf([{ name: "claude", label: "Claude Code", installed: false, configured: true }]).state, "off");
  assert.equal(cliCardOf([]).state, "off");
  assert.deepEqual(cliCardOf(null), {});
});

