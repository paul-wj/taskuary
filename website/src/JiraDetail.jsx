import React, { useEffect, useState } from "react";
import { Box, Button } from "@mui/material";
import api from "./api";
import { attUrl, useSave } from "./fileSave.js";
import { FileDialog } from "./PublishedPages.jsx";
import { kb } from "./attachmentView.js";
import { t } from "./i18n.js";
import { useLocale } from "./LocaleProvider.jsx";

const tags = new Set("p br hr blockquote pre code strong b em i u s del sub sup h1 h2 h3 h4 h5 h6 ul ol li dl dt dd table caption thead tbody tfoot tr th td div span".split(" "));
const discard = new Set(["script", "style", "iframe", "object", "embed", "template", "svg", "math"]);

function jiraLink(raw, source) {
  try {
    const url = new URL(raw, source);
    if (["https:", "http:", "mailto:"].includes(url.protocol) && !url.username && !url.password) return url;
  } catch { /* invalid link; leave its label */ }
  return null;
}

function Picture({ file, width, onOpen }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span role="status">{t("Jira image unavailable: {name}", { name: file.name })}</span>;
  return <Box component="button" type="button" onClick={() => onOpen(file)} aria-label={t("Enlarge {name}", { name: file.name })}
    sx={{ display: "inline-block", verticalAlign: "middle", p: 0, border: "1px solid var(--tq-border)", borderRadius: 1,
      maxWidth: "100%", bgcolor: "transparent", cursor: "zoom-in" }}>
    <Box component="img" src={attUrl(file)} alt={file.name} width={width || undefined} onError={() => setFailed(true)}
      sx={{ display: "block", maxWidth: "100%", maxHeight: 420, height: "auto", objectFit: "contain" }} />
  </Box>;
}

function content(detail, body, source, onOpen) {
  const seen = new Set(), byId = new Map(), byName = new Map();
  for (const f of detail.files) {
    byId.set(f.id, f);
    byName.set(f.name, byName.has(f.name) ? null : f);
  }
  const picture = (f, name, key, width) => {
    if (!f?.is_image) return <span key={key}>{t("Jira image unavailable: {name}", { name: name || t("image") })}</span>;
    seen.add(f.id);
    return <Picture key={`${key}:${f.id}`} file={f} width={Math.min(Number(width) || 0, 2000)} onOpen={onOpen} />;
  };
  const jira = jiraLink(source, source);
  const fileAt = (raw) => {
    const url = jiraLink(raw, source);
    if (!url || !jira || url.origin !== jira.origin) return null;
    const root = jira.pathname.slice(0, jira.pathname.lastIndexOf("/browse/"));
    if (!url.pathname.startsWith(`${root}/secure/`)) return null;
    const id = /^\/(?:attachment|thumbnail)\/(\d+)(?:\/|$)/.exec(url.pathname.slice(root.length + 7))?.[1];
    return byId.get(id);
  };
  if (detail.description && detail.html) {
    // Template contents are inert. Recreate only presentation elements; never mount vendor HTML or remote images.
    const template = document.createElement("template");
    template.innerHTML = detail.html;
    const walk = (n, key) => {
      if (n.nodeType === 3) return n.textContent;
      if (n.nodeType !== 1 || discard.has(n.localName)) return null;
      const tag = n.localName, attr = (name) => n.getAttribute(name) || "";
      if (tag === "img") {
        const f = byId.get(attr("data-linked-resource-id")) || fileAt(attr("data-linked-resource-default-alias") || attr("src")) || fileAt(attr("src"));
        return picture(f, attr("alt") || attr("title"), key, attr("width"));
      }
      const children = Array.from(n.childNodes, (child, i) => walk(child, `${key}.${i}`));
      if (tag === "a") {
        if (n.querySelector("img")) return <React.Fragment key={key}>{children}</React.Fragment>;
        const f = fileAt(attr("href"));
        // Jira's attachment links must not navigate away or implicitly download.
        if (f) return <React.Fragment key={key}>{children}</React.Fragment>;
        const url = attr("href") && jiraLink(attr("href"), source);
        if (url) return <a key={key} href={url.href} target="_blank" rel="noreferrer">{children}</a>;
      }
      if (!tags.has(tag)) return <React.Fragment key={key}>{children}</React.Fragment>;
      if (["br", "hr"].includes(tag)) return React.createElement(tag, { key });
      const props = tag === "td" || tag === "th" ? { colSpan: n.colSpan, rowSpan: n.rowSpan } : tag === "ol" ? { start: n.start } : {};
      return React.createElement(tag, { key, ...props }, children);
    };
    return { body: Array.from(template.content.childNodes, (n, i) => walk(n, `${i}`)), seen };
  }
  const raw = detail.description ? detail.text ?? "" : body;
  const parts = [];
  let end = 0;
  for (const m of raw.matchAll(/!([^!|\r\n]+)(?:\|([^!\r\n]*))?!/g)) {
    const f = byName.get(m[1]);
    if (!f && !/\.(?:png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(m[1])) continue;
    parts.push(raw.slice(end, m.index), picture(f, m[1], m.index, /\bwidth=(\d+)/.exec(m[2] || "")?.[1]));
    end = m.index + m[0].length;
  }
  parts.push(raw.slice(end));
  return { body: <div style={{ whiteSpace: "pre-wrap" }}>{parts}</div>, seen };
}

export function JiraDetail({ message, children }) {
  useLocale();
  const mid = message.Channel === "jira" ? message.MessageId : null;
  const [result, setResult] = useState(null), [big, setBig] = useState(null);
  const [saveError, save, saved, saving] = useSave();
  useEffect(() => {
    if (!mid) return;
    const controller = new AbortController();
    api.get(`/api/messages/${mid}/jira-detail`, { signal: controller.signal }).then(
      ({ data }) => setResult({ mid, data }), () => { if (!controller.signal.aborted) setResult({ mid, error: true }); });
    return () => controller.abort();
  }, [mid]);
  if (!mid) return children;
  if (result?.mid !== mid) return children;
  if (result.error) return <>{children}<div role="status" className="tq-card-note">{t("Could not load live Jira details. The saved message is shown above.")}</div></>;
  if (!result.data.supported) return children;
  const { data } = result;
  const view = content(data, message.BodyText || message.ReadText || "", message.SourceLink, setBig);
  return <Box data-tq-jira-detail="" sx={{ overflowWrap: "anywhere", "& table": { display: "block", overflowX: "auto", borderCollapse: "collapse" },
    "& td, & th": { border: "1px solid var(--tq-border)", px: 0.75 }, "& pre": { whiteSpace: "pre-wrap" } }}>
    {view.body}
    {data.description && data.files.filter((f) => f.is_image && !view.seen.has(f.id)).map((f) =>
      <Box key={f.id} sx={{ my: 0.75 }}><Picture file={f} onOpen={setBig} /></Box>)}
    {data.description && data.files.length > 0 && <Box sx={{ mt: 1, borderTop: "1px solid var(--tq-border)" }}>
      <b>{t("Attached · {count}", { count: data.files.length })}</b>
      {data.files.map((f) => <Box key={f.id} sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
        <span>{f.name} · {kb(f.size)}</span><Button size="small" data-tq-download={f.name} disabled={saving} onClick={() => save({ ...f, fetchDownload: true })}>{t("Download")}</Button>
      </Box>)}
    </Box>}
    {(saving || saveError || saved) && <div role="status" className="tq-card-note">{t(saving ? "Downloading…" : saveError || saved)}</div>}
    <FileDialog file={big && { ...big, preview: "image", fetchDownload: true }} onClose={() => setBig(null)} />
  </Box>;
}
