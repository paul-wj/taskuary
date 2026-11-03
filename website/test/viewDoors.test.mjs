import assert from "node:assert/strict";
import test from "node:test";
import { readView } from "../src/pageView.js";

test("the assistant's page view excludes marked controls", (t) => {
  const previous = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({ visibility: "visible" });
  t.after(() => { globalThis.getComputedStyle = previous; });

  const control = (label, skipped = false) => ({
    textContent: label,
    closest: (selector) => skipped && selector.includes("[data-tq-view-skip]") ? {} : null,
    getClientRects: () => [1],
    getAttribute: () => null,
    hasAttribute: () => false,
    matches: () => false,
  });
  const field = (label, skipped = false) => ({
    ...control(label, skipped), value: "kept",
    getAttribute: (name) => name === "aria-label" ? label : null,
  });
  const root = {
    getAttribute: (name) => name === "data-tq-view" ? "settings" : null,
    hasAttribute: () => false,
    querySelector: () => null,
    querySelectorAll: (selector) => selector.startsWith("input")
      ? [field("Visible field"), field("Skipped field", true)]
      : [control("Save"), control("Assistant door", true)],
  };

  const view = readView(root);
  assert.deepEqual(view.fields.map(({ label, value }) => ({ label, value })), [{ label: "Visible field", value: "kept" }]);
  assert.deepEqual(view.buttons.map(({ label }) => label), ["Save"]);
});
