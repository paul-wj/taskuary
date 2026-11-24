// A document a message LINKS to (linkdocs.py) is drawn beside its files: its kind, its name, and a chip that opens it where it
// lives - never through our attachment door, which would hang the owner's token off a third party's address.
import assert from "node:assert/strict";
import { attachmentLink, attachmentTitle } from "../src/attachmentView.js";
import test from "node:test";

const ownUrl = (a, download) => `${a.url}?download=${download}&token=synthetic`;
const never = () => { throw new Error("an external link must not use the attachment token"); };

test("a linked document opens at its own address without a token or referrer", () => {
  assert.deepEqual(attachmentLink({ link: true, external_url: "https://docs.example/sheet", url: "/api/x" }, "https://mail.example/m", never),
    { href: "https://docs.example/sheet", rel: "noopener noreferrer" });
  assert.deepEqual(attachmentLink({ url: "/api/attachments/4" }, "https://mail.example/m", ownUrl),
    { href: "/api/attachments/4?download=true&token=synthetic", rel: "noopener" });
});

// TQ-1197: a file kept without its bytes (a cloud link Outlook attaches, one over the size limit) was a greyed chip that did nothing
test("a file kept without its bytes opens the original message, and says why when there is none", () => {
  const original = "https://mail.example/m", file = { name: "Cash.xlsx", size: 900 };
  assert.deepEqual(attachmentLink(file, original, never), { href: original, rel: "noopener noreferrer" });
  assert.equal(attachmentLink(file, undefined, never).href, undefined);
  assert.match(attachmentTitle(file, original), /no copy came with the mail.*opens in the original message/);
  assert.match(attachmentTitle({ size: 20 * 1024 * 1024 }), /over 12\.0 MB, so not saved here.*from the mail in your mailbox/);
});


test("the task's counter counts linked documents beside its files", async () => {
  const { filesLine } = await import("../src/timeWords.js");
  assert.equal(filesLine(6, 2), "6 attachments · 2 links");
  assert.equal(filesLine(1, 0), "1 attachment");
  assert.equal(filesLine(0, 1), "1 link");
  assert.equal(filesLine(0, 0), "");
});
