// SAVING AND REACHING A FILE - one road for every file the page offers: a mail's attachment, a file an agent made, a page it showed.
import { useState } from "react";
import api from "./api";

// An <img src> carries no headers, so the token rides in the query string (see token_gate).
export const attUrl = (a, download) => {
  if (String(a.url || "").startsWith("data:")) return a.url;   // the static demo carries its own bytes
  const t = localStorage.getItem("taskuary_token");
  const q = [download ? "download=true" : "", t ? `token=${encodeURIComponent(t)}` : ""].filter(Boolean).join("&");
  return `${a.url}${q ? `${String(a.url).includes("?") ? "&" : "?"}${q}` : ""}`;   // a link that came with its own query keeps it
};

// what a refused file read said, from a JSON body or a Blob one (a preview asks for bytes, so its error comes back as a Blob too)
export const fileError = async (e, fallback) => {
  let d = e?.response?.data;
  if (typeof Blob !== "undefined" && d instanceof Blob) { try { d = JSON.parse(await d.text()); } catch { d = null; } }
  return (d && typeof d === "object" && d.detail) || fallback;
};

function downloadLink(href, name = "") {
  const el = document.createElement("a");
  el.href = href; el.download = name; el.rel = "noopener"; el.style.display = "none";
  document.body.appendChild(el); el.click(); el.remove();
}

// SAVE A FILE, never navigate to it. A Download that was a plain link took the window to the file's address: a file moved or deleted
// left the owner on a raw JSON 404 - and the desktop window has no Back. The server is asked first (HEAD); a file that is there is
// saved by a link with `download`, so the page stays where it is; one that is not throws the server's own reason for the page to say.
// ...and in the desktop window it lands in the computer's Downloads folder, said in words (desktop.save_download): WebView2's own
// download opened a Save As box wherever it liked (the owner, 2026-11-02: "the download should go to the local computer download").
// Resolves to the line to show once saved there, or "" when the browser's own download took it.
export const savedLine = (r) => r?.name ? `Saved to ${r.folder || "Downloads"} as ${r.name}` : "";
export const saveFile = async (a, w = typeof window === "undefined" ? null : window) => {
  const href = attUrl(a, true), bridge = w?.pywebview?.api;
  if (typeof bridge?.save_download === "function" && !href.startsWith("data:")) {
    const r = await bridge.save_download(new URL(href, w.location.href).href);
    if (!r?.name) throw new Error(r?.error || "This file could not be saved - try again.");
    return savedLine(r);
  }
  if (a.fetchDownload) {
    // A live remote file can fail after HEAD succeeds. Verify the one GET that supplies the
    // bytes before handing them to the browser; it cannot report errors from a download link.
    let data;
    try { ({ data } = await api.get(a.url, { params: { download: true }, responseType: "blob" })); }
    catch (e) { throw new Error(await fileError(e, "This file could not be saved - try again.")); }
    const url = URL.createObjectURL(data);
    try { downloadLink(url, a.name); }
    finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
    return "Download sent to your browser.";
  }
  if (!href.startsWith("data:") && typeof api.head === "function") {
    // no-cache: the browser answered a HEAD from the copy a preview had fetched, so a file deleted since was still "there"
    try { await api.head(a.url, { headers: { "Cache-Control": "no-cache" } }); }
    catch (e) {
      // a HEAD has no body to carry the reason: ask once more for it - a file that is gone answers in a few bytes
      let why = "";
      try { await api.get(a.url, { params: { download: true }, responseType: "blob", headers: { "Cache-Control": "no-cache" } }); }
      catch (e2) { why = await fileError(e2, ""); }
      throw new Error(why || (e?.response?.status === 404 ? "This file was moved or deleted." : "This file could not be saved - try again."));
    }
  }
  // `download` empty: the server's Content-Disposition names the file.
  downloadLink(href);
  return "";
};

// The line the press left, and whether it is still waiting for the file.
export const useSave = () => {
  const [err, setErr] = useState(""), [saved, setSaved] = useState(""), [saving, setSaving] = useState(false);
  return [err, async (a) => {
    setErr(""); setSaved(""); setSaving(true);
    try { setSaved(await saveFile(a)); }
    catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }, saved, saving];
};
