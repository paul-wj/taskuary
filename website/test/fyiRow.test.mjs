// An fyi says its thing ONCE, and its two doors are named for what they do.
//
// The card drew the item's title and then its gist under it. Mail has a subject and a body, so two
// lines earn their place - but an assistant's idea has no subject: the funnel files the same
// sentence as title and as gist, so the card printed it twice, truncated at two different points,
// beside two buttons reading "Read" and "Dig in" (the owner, 2026-09-14: "Read/Dig in mean the same
// thing and are hard to read? they eyes don't focus on one thing").
import test from "node:test";
import assert from "node:assert/strict";
import { gistFor, norm } from "../src/fyiRow.js";


// The title is a shorter prefix of the same summary.
const IDEA = {
  key: "msg:7001", who: "Assistant",
  title: "Both vendor contacts are out of office and asked us to resend the report",
  preview: "Both vendor contacts are out of office and asked us to resend the report when they return.",
};

test("a gist that only restates the line above it is not shown", () => {
  assert.equal(gistFor(IDEA), "");
});

test("a real second fact still gets its line", () => {
  const mail = { title: "PTO True up", preview: "Can you send me the PTO file for the 8/31 payroll?" };
  assert.equal(gistFor(mail), "Can you send me the PTO file for the 8/31 payroll?");
  // summary wins over preview when the server wrote one
  assert.equal(gistFor({ title: "PTO True up", summary: "She needs the 8/31 file.", preview: "Hi, ..." }),
    "She needs the 8/31 file.");
});

test("it compares the words, not the whitespace or the case", () => {
  assert.equal(gistFor({ title: "Both   vendor contacts ARE OUT", preview: "both vendor contacts are out today" }), "");
  assert.equal(norm("  A   b \n c "), "a b c");
  assert.equal(gistFor({ title: "", preview: "anything" }), "anything");
  assert.equal(gistFor({ title: "x", preview: "" }), "");
  assert.equal(gistFor(null), "");
});

