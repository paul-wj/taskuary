import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const cv = readFileSync(new URL("../src/ConnectorsView.jsx", import.meta.url), "utf8");


test("the card says plainly what AADSTS900971 means, wherever it comes back", () => {
  assert.match(cv, /const NO_REPLY = \/AADSTS900971\/;/);
  const msSays = new Function(`const NO_REPLY = /AADSTS900971/; return ${cv.match(/export const msSays = ([\s\S]*?: d;)/)[1].replace(/;$/, "")};`)();
  const said = msSays("invalid_request: AADSTS900971: No reply address provided.");
  assert.match(said, /approval step/); assert.match(said, /your IT admin approves Taskuary once with the link below/);
  assert.equal(msSays("you declined the sign-in"), "you declined the sign-in", "anything else as it was");
  // a sign-in error carrying it draws the link even when the server sent none
  assert.match(cv, /setDetail\(data\.detail \? msSays\(data\.detail\) : message\("the sign-in did not complete"\)\);/);
  assert.match(cv, /if \(data\.admin_consent_url\) setAdminUrl\(data\.admin_consent_url\); else if \(NO_REPLY\.test\(data\.detail \|\| ""\)\) adminLink\(\);/);
});


test("the sign-in buttons wait for the client id alone", () => {
  const src = cv.match(/export const msNeedsApp = (\(conn, cfg\) => [^\n]*);/)[1];
  const needs = new Function(`return ${src}`)();
  assert.equal(needs({ MsApp: "" }, {}), true, "nothing yet: the steps and greyed buttons");
  assert.equal(needs({ MsApp: "" }, { client_id: "1b2c3d4e-0000-0000-0000-00000000000c" }), false, "an Outlook.com app: no tenant needed");
  assert.equal(needs({ MsApp: "" }, { client_id: "  " }), true);
  assert.equal(needs({ MsApp: "outlook" }, {}), false, "a Teams card borrowing the Outlook card's app");
});
