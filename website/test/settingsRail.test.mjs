import test from "node:test";
import assert from "node:assert/strict";
import schema from "../../taskuary/settings_schema.json" with { type: "json" };
import { sectionOffset, scrollToSection } from "../src/settingsMap.js";

test("section scrolling accounts for the sticky bar and ignores missing headings", () => {
  const oldDocument = globalThis.document, oldWindow = globalThis.window;
  const calls = [];
  globalThis.document = { getElementById: (id) => id === "target"
    ? { getBoundingClientRect: () => ({ top: 200 }) } : null };
  globalThis.window = { scrollY: 300, scrollTo: (where) => calls.push(where) };
  try {
    assert.equal(scrollToSection("missing"), false);
    assert.deepEqual(calls, []);
    assert.equal(scrollToSection("target"), true);
    assert.deepEqual(calls, [{ top: 426, behavior: "smooth" }]);
  } finally {
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
  }
});

test("a section at the bottom is considered landed even when it cannot reach the bar", () => {
  const oldDocument = globalThis.document, oldWindow = globalThis.window;
  let top = 174;
  globalThis.document = { getElementById: (id) => id === "target"
    ? { getBoundingClientRect: () => ({ top }) } : null, documentElement: { scrollHeight: 1000 } };
  globalThis.window = { innerHeight: 400, scrollY: 300 };
  try {
    assert.equal(sectionOffset("missing"), null);
    assert.deepEqual(sectionOffset("target"), { off: 100, landed: false });
    top = 76;
    assert.deepEqual(sectionOffset("target"), { off: 2, landed: true });
    top = 174;
    globalThis.window.scrollY = 600;
    assert.deepEqual(sectionOffset("target"), { off: 100, landed: true });
    top = 20;
    assert.deepEqual(sectionOffset("target"), { off: -54, landed: false });
  } finally {
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
  }
});

// "Other" is a group with no knobs of its own: it catches a stray key, and on an install with
// no stray key Configuration does not draw it. A rail entry for it would scroll nowhere.
test("the rail offers only the sections the page will actually draw", () => {
  assert.equal(Object.values(schema.knobs).filter((k) => k.group === "Other").length, 0,
    "Other is empty in the schema by design - it is a catch-all, not a page");
});

// The pill strip ran off the edge (the redesign, owner-approved 2026-10-21): Configuration is one long
// stack of sections in the schema's order, not a strip of tabs
test("Configuration is one page, not a strip of tabs", () => {
  assert.ok(schema.groups.length > 8, "the point of the change: there are a lot of them, and more coming");
});
