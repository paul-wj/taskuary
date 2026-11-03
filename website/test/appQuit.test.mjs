// QUIT AND A WAITING UPDATE (the owner, 2026-10-25): Quit on the browser's top line - not in the desktop window, which has the tray's -
// with no box asking, the hover saying what stops; the page left behind says it has stopped; Update now with work running says what it
// waits for; and the Assistant's Updates link lights the real button.
import test from "node:test";
import assert from "node:assert/strict";
import { inDesktop, quitTitle, stoppedLines, updateWaiting, waitingNote } from "../src/appQuit.js";

test("Quit is for the browser: the desktop window has the tray's", () => {
  assert.equal(inDesktop({ pywebview: {} }), true);
  assert.equal(inDesktop({}), false);
  assert.equal(inDesktop(null), false);
});

test("the hover says what stops with it; the press is the decision", () => {
  const running = "1 running agent";
  assert.notEqual(quitTitle(""), quitTitle(running));
  assert.ok(quitTitle(running).includes(running));
});

test("the page left behind says it has stopped, and what stopped with it", () => {
  const stopped = stoppedLines(["TQ-0012", "TQ-0014"]);
  assert.equal(stopped.length, 2);
  assert.ok(stopped[1].includes("TQ-0012") && stopped[1].includes("TQ-0014"));
  assert.notEqual(stopped[1], stoppedLines([])[1]);
});

test("an update that waits says what for", () => {
  assert.equal(updateWaiting({ waiting: true }), true);
  assert.equal(updateWaiting({ queued: true }), true);
  assert.equal(updateWaiting({ restarting: true }), false);
  assert.ok(waitingNote({ waiting: true, waits: "Update waits for 1 running agent" }).includes("Update waits for 1 running agent"));
  assert.equal(waitingNote({ restarting: true }), "");
});

