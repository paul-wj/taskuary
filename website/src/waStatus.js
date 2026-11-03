// THE WHATSAPP CARD TELLS THE TRUTH (2026-10-23). It said "On — polling on schedule and via Sync now." from its switch alone,
// while the bridge turned twelve chats away, never heard a 1:1 addressed by LID and failed its contact sync every ten minutes.
// This reads /wa/status (messengers.wa_status_line words the server already chose) into one short line and the one button that
// is the next step: "Connected · 2 chats · last message 40 min ago · 12 turned away", "Not connected — Restart bridge",
// "Logged out — Pair again". Pure, so the states are tested without a browser.
import { getLocale, t } from "./i18n.js";
import { ago } from "./timeWords.js";

// These are the fixed status phrases emitted by messengers.wa_status_line, not chat content.
const STATUS = new Set(["Logged out", "Waiting for the phone to pair", "Not connected", "Connected", "no message yet", "contact names not syncing"]);
const statusPart = (part, st) => {
  if (STATUS.has(part)) return t(part);
  if (st.admitted != null && part === `${st.admitted} ${Number(st.admitted) === 1 ? "chat" : "chats"}`)
    return t(Number(st.admitted) === 1 ? "{count} chat" : "{count} chats", { count: st.admitted });
  if (st.last_inbound_at && part.startsWith("last message "))
    return t("last message {when}", { when: ago(Number(st.last_inbound_at) * 1000) });
  return part;
};
export const waLine = (st) => {
  if (!st || st.unreachable) return null;
  const phase = st.manager?.phase;
  if (st.bridge === false) return { parts: [t(phase === "installing" || phase === "starting" ? "Starting the bridge…" : "Not connected")], away: 0,
    fix: st.node && !["installing", "starting"].includes(phase) ? "restart" : "" };
  const parts = Array.isArray(st.parts) && st.parts.length
    ? (getLocale() === "zh-CN" ? st.parts.map((part) => statusPart(part, st)) : st.parts)
    : [t(st.connected ? "Connected" : "Not connected")];
  return { parts, away: st.connected ? Number(st.turned_away) || 0 : 0, fix: st.fix ?? (st.connected ? "" : "restart") };
};
