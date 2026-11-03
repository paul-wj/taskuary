import assert from "node:assert/strict";
import test from "node:test";
import { pastedImageFiles, pastedImagePrompt } from "../src/terminalInput.js";

test("terminal paste intercepts image files and leaves ordinary clipboard data alone", () => {
  const png = { name: "screen.png", type: "image/png" };
  const text = { name: "notes.txt", type: "text/plain" };
  const items = [
    { kind: "string", type: "text/plain", getAsFile: () => null },
    { kind: "file", type: "text/plain", getAsFile: () => text },
    { kind: "file", type: "image/png", getAsFile: () => png },
  ];
  assert.deepEqual(pastedImageFiles({ items }), [png]);
  assert.deepEqual(pastedImageFiles(null), []);
});

test("pasted image paths become a prompt the coding CLI can open", () => {
  assert.equal(pastedImagePrompt([]), "");
  const one = pastedImagePrompt(["C:\\shots\\one.png"]);
  const many = pastedImagePrompt(["a.png", "b.jpg"]);
  assert.ok(one.includes('"C:\\shots\\one.png"'));
  assert.ok(many.includes('"a.png"'));
  assert.ok(many.includes('"b.jpg"'));
});
