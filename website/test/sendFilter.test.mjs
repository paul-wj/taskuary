// YOUR OWN TOOLS THAT SEND (the owner, 2026-10-25): Settings > Agent permissions lists, beside the saved sign-ins, every MCP tool agents are
// not handed because it sends - its server, the tool, why, and a Keep switch - with the kept ones folded under it, each one Leave out.
// A tool nobody judged, or a server whose tools could not be read, is left out and says so (fail closed). Invented servers only.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { linesOf } from "../src/sendFilterLines.js";

const src = (f) => fs.readFileSync(path.join(import.meta.dirname, "../src", f), "utf8");

const DATA = {
  claude: [{ server: "mail", error: "", blocked: false, tools: [
      { name: "send_mail", sends: true, why: "it emails people", by: "model", blocked: true, unchecked: false },
      { name: "list_inbox", sends: false, why: "its server marks it read-only", by: "annotation", blocked: false, unchecked: false },
      { name: "save_draft", sends: null, why: "not judged yet", by: "", blocked: true, unchecked: true }] },
    { server: "claude.ai Team Chat", error: "its tools are not listed yet", blocked: true, unchecked: true, by: "", tools: [] }],
  codex: [{ server: "mail", error: "", blocked: false, tools: [
      { name: "send_mail", sends: true, why: "it emails people", by: "model", blocked: true, unchecked: false }] }],
};

test("one line per server and tool, left out or kept; a server Claude and Codex both load is one line naming both", () => {
  const { left, kept } = linesOf(DATA);
  assert.deepEqual(left.map((l) => `${l.server}/${l.tool || "*"}`), ["mail/send_mail", "mail/save_draft", "claude.ai Team Chat/*"]);
  assert.deepEqual(kept.map((l) => l.tool), ["list_inbox"]);
  assert.deepEqual(left[0].clis, ["claude", "codex"]);
  assert.equal(left[1].unchecked, true); assert.equal(left[2].unchecked, true);
  assert.deepEqual(linesOf(null), { left: [], kept: [] });
});

test("Settings > Agent permissions draws the list next to the saved sign-ins", () => {
  assert.match(src("SettingsView.jsx"), /"Agent permissions": <>\{panel\("panel:signins", <SavedSignins \/>\)\}\{panel\("panel:sendfilter", <SendFilter \/>\)\}<\/>/);
  assert.match(src("SettingsView.jsx"), /import SendFilter from "\.\/SendFilter\.jsx";/);
});


