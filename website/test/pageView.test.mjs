// THE ASSISTANT ACTS ON THE PAGE AS THE OWNER WOULD - EXCEPT A SEND, AND NEVER A SECRET (the owner, 2026-10-30). The page's half of the two
// lines the server draws again (taskuary/pageview.py): which button sends something out, and which box holds a secret.
import assert from "node:assert/strict";
import test from "node:test";
import { context, currentRoot, isSecret, isSend } from "../src/pageView.js";


test("an outward send is known by its verb or its words, and nothing else is one", () => {
  for (const b of [{ id: "row:approve", label: "Approve" }, { id: "x", label: "Send" }, { id: "x", label: "Send test message" }, { id: "x", label: "Anything", send: true },
    { id: "row:accept_invite", label: "Accept" }, { id: "x", label: "Reply all" }]) assert.equal(isSend(b), true, JSON.stringify(b));
  for (const b of [{ id: "test", label: "Test" }, { id: "row:done", label: "Mark done" }, { id: "save", label: "Save" }, { id: "sync", label: "Sync" },
    { id: "row:remind", label: "Remind me" }, { id: "row:redraft", label: "Redraft" }]) assert.equal(isSend(b), false, JSON.stringify(b));
});

test("a secret is known by its key or the words on its box", () => {
  for (const [k, l] of [["Secret", ""], ["client_secret", "Client secret"], ["x", "bot token (xoxb-…)"], ["api_key", ""], ["pw", "Password"]]) assert.equal(isSecret(k, l), true, k);
  for (const [k, l] of [["poll_seconds", "Check every (seconds)"], ["title", "Title"], ["region", "Region"]]) assert.equal(isSecret(k, l), false, k);
});

test("what leaves the page is the view without its elements, and a secret as its state only", () => {
  const field = (name, value, password = false) => ({
    value, tagName: "INPUT", disabled: false,
    getClientRects: () => [1], closest: () => null,
    getAttribute: (key) => key === "name" ? name : null,
    hasAttribute: () => false,
    matches: (selector) => selector === "input[type=password]" && password,
  });
  const secret = field("password", "private-value", true), title = field("title", "Public title");
  const root = {
    getAttribute: (key) => key === "data-tq-view" ? "settings" : null,
    hasAttribute: () => false,
    querySelector: () => null,
    querySelectorAll: (selector) => selector.startsWith("input,") ? [secret, title] : [],
  };
  const previous = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({ visibility: "visible" });
  try {
    const view = context(root);
    assert.equal(view.fields[0].secret, true);
    assert.equal(view.fields[0].state, "typed");
    assert.ok(!JSON.stringify(view).includes("private-value"));
    assert.equal(view.fields[1].value, "Public title");
    assert.ok(!Object.hasOwn(view.fields[0], "el"));
  } finally { globalThis.getComputedStyle = previous; }
});


// A DIALOG OVER THE PAGE IS THE PAGE (the owner, 2026-11-02): Search everything, the Hub's Write one and the bell's list sit in a portal
// over a wider page - the widest root in sight was "the page", so the Assistant read the Hub beneath while the owner looked at the dialog
test("a dialog open over the page is the view, the one opened last on top; with none, the root most in sight", () => {
  const el = (name, size, modal = false) => ({ name, parentElement: { closest: () => null }, getClientRects: () => [1],
    closest: (sel) => (modal && sel === ".MuiModal-root" ? {} : null), getBoundingClientRect: () => ({ top: 0, left: 0, bottom: size, right: size }) });
  const was = { document: globalThis.document, window: globalThis.window, getComputedStyle: globalThis.getComputedStyle };
  let roots = [];
  Object.assign(globalThis, { document: { querySelectorAll: () => roots }, window: { innerHeight: 1000, innerWidth: 1000 },
    getComputedStyle: () => ({ visibility: "visible" }) });
  try {
    const hub = el("hub", 900), write = el("hub_write", 400, true), search = el("search", 500, true);
    roots = [hub]; assert.equal(currentRoot().name, "hub");
    roots = [hub, write]; assert.equal(currentRoot().name, "hub_write", "the smaller dialog wins over the wider page beneath");
    roots = [hub, write, search]; assert.equal(currentRoot().name, "search", "the dialog opened last is on top");
  } finally { Object.assign(globalThis, was); }
});

