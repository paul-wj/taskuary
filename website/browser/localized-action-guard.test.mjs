import test from "node:test";
import assert from "node:assert/strict";
import { startHarness } from "./harness.mjs";

test("localized outward actions stay owner-only and secrets never enter page operations", { timeout: 300000 }, async (t) => {
  const harness = await startHarness();
  t.after(() => harness.close());
  const page = await harness.newPage();
  await page.goto(harness.ui, { waitUntil: "domcontentloaded" });
  for (const language of ["en", "zh-CN"]) {
    const proof = await page.evaluate(async (language) => {
      const view = await import("/src/pageView.js");
      const locale = await import("/src/i18n.js");
      locale.setLocale(language);
      const modal = document.createElement("div");
      modal.className = "MuiModal-root";
      modal.innerHTML = '<section data-tq-view="guard-proof" style="position:fixed;inset:0;padding:40px;z-index:99999"><button data-tq-view-btn="send-handoff" data-tq-send></button><button data-tq-view-btn="local-action">Local action</button><input data-tq-field="secret-proof" aria-label="Secret" data-tq-secret value="private-example"></section>';
      document.body.append(modal);
      const [send, local] = modal.querySelectorAll("button");
      send.textContent = locale.t("Send");
      let sends = 0, locals = 0;
      send.onclick = () => { sends += 1; };
      local.onclick = () => { locals += 1; };
      const snapshot = view.context(modal.firstElementChild);
      await view.run([{ op: "press", button: "send-handoff" }, { op: "press", button: "local-action" }, { op: "set", field: "secret-proof", value: "changed" }]);
      const result = { sends, locals, secretUnchanged: modal.querySelector("input").value === "private-example", secretLeaked: JSON.stringify(snapshot).includes("private-example"), lit: send.hasAttribute("data-tq-setup-lit") };
      modal.remove();
      return result;
    }, language);
    assert.deepEqual(proof, { sends: 0, locals: 1, secretUnchanged: true, secretLeaked: false, lit: true });
  }
  assert.deepEqual(page.fixtureEscapes, []);
});
