// EVERY FILE BELONGS TO ITS MESSAGE (the owner, 2026-10-20): a voice note was drawn loose under the Came from card, outside the
// thread, named by the bridge's hash. Each message's attachments ride under its own row; a voice note is called one.
import assert from "node:assert/strict";
import test from "node:test";
import { filesByMessage, rowText } from "../src/taskSources.js";
import { t } from "../src/i18n.js";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";


test("the detail's attachments are grouped by the message they came in", () => {
  const by = filesByMessage([{ MessageId: 7, Name: "3EB0C431D5E6F7A8.ogg" }, { MessageId: 9, Name: "a.png" }, { MessageId: 7, Name: "b.pdf" }, { Name: "orphan" }]);
  assert.deepEqual([...by.keys()], [7, 9]);
  assert.equal(by.get(7).length, 2);
  assert.equal(filesByMessage(undefined).size, 0);
});

test("a condensed row reads the transcript, says Voice note for a bare one, and never the attachment placeholder", () => {
  const ogg = [{ MessageId: 1, Name: "3EB0C431D5E6F7A8.ogg", ContentType: "audio/ogg" }];
  assert.equal(rowText({ excerpt: "Running late, start without me. (🎤 voice note (9s) from WhatsApp, transcribed by Groq (Whisper))" }, ogg),
    "Running late, start without me.");
  assert.equal(rowText({ excerpt: "(no text - see the attachment)" }, ogg), t("Voice note"));
  assert.equal(rowText({ excerpt: "(no text - see the attachment)" }, [{ Name: "plan.pdf", ContentType: "application/pdf" }]), t("{count} attachment", { count: 1 }));
  assert.equal(rowText({ excerpt: "" }), t("(no text)"));
  assert.equal(rowText({ excerpt: "see the deck", Subject: "Deck" }, []), "see the deck");
});

test("attachment names and image previews preserve file data and reject remote images", async () => {
  const server = await createServer({ configFile: false, appType: "custom", ssr: { noExternal: [/^@mui\//] }, server: { middlewareMode: true }, logLevel: "silent" });
  try {
    const { clipName, drawable } = await server.ssrLoadModule(fileURLToPath(new URL("../src/Attachments.jsx", import.meta.url)));
    const hash = "3EB0C431D5E6F7A8B9C0.ogg";
    assert.notEqual(clipName({ name: hash }), hash);
    assert.equal(clipName({ name: "board-call.m4a" }), "board-call.m4a");

    const photo = { is_image: true, inline: true, size: 14 * 1024, content_type: "image/jpeg", url: "/api/attachments/4", name: "3EB07A1B2C3D4E5F.jpg" };
    assert.equal(drawable({ ...photo, mail: false }), true);
    assert.equal(drawable({ ...photo, mail: true }), false);
    assert.equal(drawable(photo), false);
    assert.equal(drawable({ ...photo, mail: true, size: 200 * 1024 }), true);
    assert.equal(drawable({ ...photo, mail: false, url: "https://img.example/p.jpg" }), false);
    assert.equal(drawable({ ...photo, mail: false, url: "data:image/png;base64,AA" }), true);
    assert.equal(drawable({ ...photo, mail: false, is_image: false }), false);
    assert.equal(drawable({ ...photo, mail: false, url: null }), false);
  } finally {
    await server.close();
  }
});

