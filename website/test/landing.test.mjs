import test from "node:test";
import assert from "node:assert/strict";
import { HOW, landingFiles, landingTurn, landingWords } from "../src/landing.js";
import { setLocale } from "../src/i18n.js";

// The card's words read English (timeWords' plurals): the locale is pinned, never the host's.
setLocale("en");

test("the landing card says the branch's stat and the agent's pick", () => {
  const w = landingWords({ own: true, ahead: 2, changed: 3, plus: 40, minus: 12, proposal: { how: "merge", why: "the base moved" } });
  assert.equal(w.stat, "3 files changed, +40 −12 · 2 commits ahead");
  assert.equal(w.proposal, "The agent proposes Merge commit — the base moved.");
  // ...on the shared base its own commits, never "since the task started" - the branch's whole history (the owner's live coding task, 2026-11-08)
  const shared = landingWords({ own: false, shared: true, base: "master", commits: 2, changed: 1, plus: 1, minus: 0 });
  assert.equal(shared.stat, "1 file changed, +1 −0 · 2 commits of its own");
  assert.match(shared.shared, /^master is shared with other agents and releases - this counts only this task's own commits and edits/);
});

test("the four answers are the server's and discard asks once more before it goes", () => {
  assert.deepEqual(Object.keys(HOW), ["rebase", "merge", "pr", "discard", "push", "deploy"]);
});

test("the card is part of the turn its newest change came in, and moves with the chat", () => {
  const ms = [{ id: "u1", role: "user", createdAt: "2026-11-08 15:55:00" }, { id: "t1", role: "assistant", createdAt: "2026-11-08 15:55:12" },
    { id: "u2", role: "user", createdAt: "2026-11-08 15:56:15" }, { id: "t2", role: "assistant", createdAt: "2026-11-08 15:56:16" },
    { id: "t3", role: "assistant", createdAt: "2026-11-08 16:30:00" }];
  assert.equal(landingTurn(ms, "2026-11-08 16:09:55"), "t2");
  assert.equal(landingTurn(ms, ""), "t3");
  assert.equal(landingTurn(ms.slice(0, 1), "2026-11-08 16:09:55"), null);
});

test("the card's list folds the generated files and says how many more, apart from See the diff", () => {
  const { src, gen } = landingFiles([{ path: "taskuary/landing.py" }, { path: "website/package-lock.json" }, { path: "taskuary/static/assets/index-AbCd1234.js" }]);
  assert.deepEqual(src.map((f) => f.path), ["taskuary/landing.py"]);
  assert.equal(gen.length, 2);
});

// the owner, 2026-11-09 (~20th time): "i thought actions should be cards/buttons??? why is this text??" - an agent's commits straight on
// master, unpushed, under a card with no button; the owner typed "yes"
test("unpushed commits on the shared base are Push and Push & deploy buttons, and a press posts its how to the landing road", () => {
  const s = { own: false, shared: true, base: "master", commits: 1, changed: 5, plus: 116, minus: 9, ask: true,
    push: { tip: "3a1b9a81c0ffee", ahead: 1, to: "master", deploy: "deploy" },
    answers: [{ how: "push", label: "Push" }, { how: "deploy", label: "Push & deploy" }] };
  const w = landingWords(s);
  assert.equal(w.question, "Push 1 commit to origin/master, up to 3a1b9a8, and deploy it to deploy?");
  assert.equal(w.primary, "deploy", "the furthest the work can go, when the agent picked nothing");
  assert.equal(landingWords({ ...s, proposal: { how: "push" } }).primary, "push");
  assert.equal(landingWords({ ...s, push: { ...s.push, deploy: "" }, answers: s.answers.slice(0, 1) }).question, "Push 1 commit to origin/master, up to 3a1b9a8?");
  assert.equal(landingWords({ own: true, ask: true, answers: [] }).question, "How should it land?");
});

// the owner, 2026-11-09: "compact the land" - 26 files listed over Push and Push & deploy; then the card went once pressed
test("the landing card is one title, the files folded, one filled button and the other beside it - and stays pressed once it landed", () => {
  const s = { own: false, shared: true, base: "master", commits: 1, changed: 26, plus: 38, minus: 38, ask: true,
    push: { tip: "3a1b9a81c0ffee", ahead: 1, to: "master", deploy: "deploy" },
    answers: [{ how: "push", label: "Push" }, { how: "deploy", label: "Push & deploy" }] };
  const w = landingWords(s);
  assert.equal(w.title, "Push 1 commit to master and deploy - 26 files");
  assert.deepEqual([w.first, w.second], ["deploy", "push"]);
  const solo = { ...s, push: { ...s.push, deploy: "" }, answers: s.answers.slice(0, 1) };
  assert.equal(landingWords(solo).title, "Push 1 commit to master - 26 files");
  assert.deepEqual([landingWords(solo).first, landingWords(solo).second], ["push", ""]);
  const own = { own: true, branch: "fix-export", base: "master", ahead: 2, commits: 2, changed: 4, ask: true,
    answers: ["rebase", "merge", "pr", "discard"].map((how) => ({ how, label: HOW[how] })) };
  assert.equal(landingWords(own).title, "Land fix-export into master - 2 commits, 4 files");
  assert.deepEqual([landingWords(own).first, landingWords(own).second], ["rebase", "merge"]);
  assert.equal(landingWords({ ...own, proposal: { how: "merge" } }).second, "rebase", "never Discard as the second");
  const done = landingWords({ ...s, ask: false, push: null, answers: [], landed: { how: "deploy", sha: "3a1b9a81c0ffee", deploy: "deploy" } });
  assert.equal(done.done, "✓ Pushed and deployed");
  assert.equal(done.doneLine, "3a1b9a8 · to master and deploy");
});

// NO NOT NOW (the owner, 2026-11-10: "why ddo we need not now card? just hit next and you go to the next task and it stays on the rail"): the
// push card the agent raised is passed like every card once the conversation moves on (proposals.move_on) - greyed, nothing to press
test("the push card has no Not now; a passed one is greyed with no button, the way back said under its title", () => {
  const s = { own: false, shared: true, base: "master", commits: 1, changed: 5, plus: 116, minus: 9, ask: false, passed: true,
    push: { tip: "3a1b9a81c0ffee", ahead: 1, to: "master", deploy: "" }, answers: [] };
  assert.equal(landingWords(s).passed, "Set aside when you moved on - ask the agent to bring it back.");
  assert.equal(landingWords({ ...s, passed: false }).passed, "");
});
