// "IS IT WORKING?" (the owner, 2026-10-22): the server's counts drawn as a table - numbers, and nothing said about them.
import test from "node:test";
import assert from "node:assert/strict";
import { workingCell, workingTable } from "../src/workingNumbers.js";

const w = (days, d, t, a) => ({ days, drafts: d, triage: t, agents: a });
const WINS = [w(7, { sent: 12, unedited: 8, edited: 3, redrafted: 1 }, { verdicts: 40, overturned: 2 }, { results: 0, accepted: 0, continued: 0, waiting: 0 }),
  w(30, { sent: 30, unedited: 30, edited: 0, redrafted: 0 }, { verdicts: 90, overturned: 0 }, { results: 5, accepted: 3, continued: 1, waiting: 1 })];

test("a cell is the count and its non-zero parts", () => {
  assert.deepEqual(workingCell(12, [[8, "as drafted"], [3, "edited"], [1, "redrafted"]]).match(/\d+/g), ["12", "8", "3", "1"]);
  assert.deepEqual(workingCell(30, [[30, "as drafted"], [0, "edited"]]).match(/\d+/g), ["30", "30"]);
  assert.equal(workingCell(0, [[0, "x"]]).match(/\d+/g), null);
});

test("three rows - drafts, triage, agent results - one cell per window", () => {
  const t = workingTable(WINS);
  assert.equal(t.length, 3);
  assert.deepEqual(t[1].cells.map((cell) => cell.match(/\d+/g)), [["40", "38", "2"], ["90", "90"]]);
  assert.deepEqual(t[2].cells.map((cell) => cell.match(/\d+/g)), [null, ["5", "3", "1", "1"]]);
  assert.deepEqual(workingTable(null), t.map((r) => ({ label: r.label, cells: [] })));
});

