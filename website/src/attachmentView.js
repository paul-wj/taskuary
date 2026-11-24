import { t } from "./i18n.js";

// Draw only Taskuary's own bytes or the demo's inline image. A mail signature's small inline logo is a chip,
// unless the picture is the whole message. Chat photos and SVGs are not treated as mail signatures.
const LOGO = 48 * 1024;
const chrome = (a) => a.mail !== false && !!a.inline && !!a.size && a.size < LOGO && a.content_type !== "image/svg+xml";
const ownImage = (u) => /^\/api\//.test(String(u || "")) || /^data:image\//.test(String(u || ""));
export const drawable = (a, pictureOnly = false) => !!a.is_image && ownImage(a.url) && (pictureOnly || !chrome(a));

// The bridge's filename can be the message ID. A name someone chose stays as written.
const HASHED = /^[0-9a-f]{12,}\.[a-z0-9]{2,5}$/i;
export const clipName = (a) => (HASHED.test(a?.name || "") || !a?.name ? t("Voice note") : a.name);
export const kb = (n) => (!n ? "" : n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);

// Linked documents and original messages are outbound links, never given the token or the app's referrer.
export const attachmentLink = (a, original, ownUrl) => a.link || !a.url
  ? { href: (a.link ? a.external_url : original) || undefined, rel: "noopener noreferrer" }
  : { href: ownUrl(a, true), rel: "noopener" };

const SAVE_MAX = 12 * 1024 * 1024;   // channels.ATT_BYTES
const unsaved = (a) => (a.size > SAVE_MAX ? t("over {size}, so not saved here", { size: kb(SAVE_MAX) }) : t("no copy came with the mail - a cloud file's link, or a forwarded mail"));
export const attachmentTitle = (a, original) => a.link ? t("{kind} — {status}", { kind: a.kind, status: a.note ? t("not read: {note}", { note: a.note }) : a.read ? (a.rows != null ? t("read, {rows} rows", { rows: a.rows }) : t("read")) : t("opens where it lives") })
  : a.url ? t(a.preview ? "read it here" : "save a copy", {}, "attachment") : t("{reason} — {location}", { reason: unsaved(a), location: original ? t("opens in the original message") : t("open it from the mail in your mailbox") });
