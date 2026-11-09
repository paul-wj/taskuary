import test from "node:test";
import assert from "node:assert/strict";
import { cliCardOf, connectionPayload } from "../src/cliCard.js";

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
test("editing a connection can clear its model flag without replacing hidden model settings", () => {
  const body = connectionPayload({ cmd: " omp ", args: "-p\n\n--mode\njson", resumeArgs: "--resume",
    timeout: "120", modelArg: "" });
  assert.deepEqual(body, { cmd: "omp", args: ["-p", "--mode", "json"], resume_args: ["--resume"], timeout: 120, model_arg: "" });
  assert.equal("model" in body, false);
  assert.equal("acp" in body, false);
});


