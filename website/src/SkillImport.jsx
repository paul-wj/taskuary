// Bringing in someone else's SKILL.md as an ordinary worker. /read only proposes - it writes
// nothing - so the owner can see the purpose AND the body before any of it becomes a session's
// instructions; /import is the one call that actually writes, and only for the rows it is handed.
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogContent,
  DialogTitle, FormControlLabel, TextField, Typography } from "@mui/material";
import { ButtonBar } from "./ButtonBar.jsx";
import api from "./api";
import { buildPayload, chosen, clashText, cutBy, isLink, reconcileImport, slug, toRows } from "./skillImport.js";
import { BORDER, FAINT, INK, ROLES, mono } from "./theme.jsx";
import { Confirm } from "./ui.jsx";
import { t } from "./i18n.js";
import { useLocale } from "./LocaleProvider.jsx";

const failure = (e) => {
  const detail = e?.response?.data?.detail || e?.message;
  return detail ? { text: detail } : { source: "Something went wrong" };
};
const kb = (n) => (n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n || 0} B`);

const STEPS = ["Where from", "What is in it", "Import"];

export default function SkillImport({ onClose, onImported }) {
  useLocale();
  const [step, setStep] = useState(0);
  const [path, setPath] = useState("");
  const [found, setFound] = useState(null);
  const [rows, setRows] = useState([]);   // one proposal per skill, edited in place before anything is written
  const [openBody, setOpenBody] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null); // the last import's receipt: {imported: [...names]}
  const [docChars, setDocChars] = useState(0);   // where a session's seed cuts a rules document - the server's number
  const [catalog, setCatalog] = useState(null);  // {target, rows, picked} when there is more there than one import takes
  const [max, setMax] = useState(10);            // how many an import brings in - the server's number
  const [overwrite, setOverwrite] = useState(null); // index of the row whose Overwrite is waiting on a confirm

  useEffect(() => {
    let live = true;
    api.get("/api/skills/found").then(({ data }) => live && setFound(data.data || []))
      .catch((e) => live && setErr(failure(e)));
    return () => { live = false; };
  }, []);

  const groups = useMemo(() => {
    const g = new Map();
    for (const r of found || []) {
      const key = r.plugin || "Personal skills";
      if (!g.has(key)) g.set(key, { key, personal: !r.plugin, rows: [] });
      g.get(key).rows.push(r);
    }
    return [...g.values()];
  }, [found]);

  // WHAT IS THERE comes first, and costs nothing: names and paths, no bodies and no model calls. A
  // repository of 252 skills used to be refused outright over a limit the owner had not been asked
  // about yet (the owner, 2026-09-18: "it should not limit reading it, just say max to push in is 10,
  // meaning you actually choose them"). Looking is free; the cap is on what you tick.
  const look = async () => {
    const target = path.trim();
    if (!target) return;
    setBusy(true); setErr(""); setCatalog(null);
    try {
      const { data } = await api.post("/api/skills/list", { url: target });
      const rows_ = data.data || [];
      setMax(data.max || 10);
      // nothing to choose between: one skill, or a folder small enough to read whole
      if (rows_.length <= (data.max || 10)) await bringIn(target, rows_.map((r) => r.path));
      else setCatalog({ target, rows: rows_, picked: [] });
    } catch (e) { setErr(failure(e)); }
    setBusy(false);
  };

  // ...and only now is anything read: the ticked paths are fetched and turned into proposals. Both
  // roads still only PROPOSE - nothing is written until the last step.
  const bringIn = async (target, paths) => {
    setBusy(true); setErr("");
    try {
      const { data } = isLink(target)
        ? await api.post("/api/skills/fetch", { url: target, paths })
        : await api.post("/api/skills/read", { path: target, paths });
      setDocChars(data.doc_chars || 0);
      setRows(toRows(data.data));    // include: on for a single skill, off for a catalogue; enabled: always off
      setStep(1);
    } catch (e) { setErr(failure(e)); }
    setBusy(false);
  };

  const pickCount = catalog?.picked.length || 0;
  const togglePick = (p) => setCatalog((c) => ({
    ...c, picked: c.picked.includes(p) ? c.picked.filter((x) => x !== p) : c.picked.concat(p).slice(0, max),
  }));

  const setRow = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const runImport = async () => {
    setBusy(true); setErr(""); setDone(null);
    try {
      // buildPayload/reconcileImport both slug the name through the one shared rule (skillImport.js)
      // - what is SENT and what is MATCHED against the response are the same string by construction.
      const { data } = await api.post("/api/skills/import", { skills: buildPayload(rows) });
      setRows((rs) => reconcileImport(rs, data));
      setDone({ imported: data.imported || [] });
      if (data.imported?.length) onImported?.();
    } catch (e) { setErr(failure(e)); }
    setBusy(false);
  };

  const pending = chosen(rows);
  const allNamed = pending.every((r) => r.name.trim());
  const setAll = (include) => setRows((rs) => rs.map((r) => (r.imported ? r : { ...r, include })));

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="md" PaperProps={{ sx: { minHeight: "62vh" } }}>
      <DialogTitle>{t("Import skills — step {step} of 3: {name}", { step: step + 1, name: t(STEPS[step]) })}</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
        {err && <Alert severity="error" onClose={() => setErr("")}>{err.source ? t(err.source) : err.text}</Alert>}

        {step === 0 && (
          <>
            <Typography variant="body2" sx={{ color: FAINT }}>
              {t("A skill is somebody else's SKILL.md - a rules document written for one coding harness, not access to anything. Paste a link (a SKILL.md, or a GitHub repository or folder holding several) or a path on this machine (one SKILL.md, or a plugin folder). You choose which ones to bring in.")}
            </Typography>
            <Box sx={{ display: "flex", gap: 1 }}>
              <TextField fullWidth size="small" label={t("Link or path")} placeholder="https://github.com/anthropics/skills/tree/main/skills"
                value={path} onChange={(e) => { setPath(e.target.value); setCatalog(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") look(); }} />
              <Button variant="contained" disableElevation disabled={busy || !path.trim()} onClick={look}>
                {busy ? <CircularProgress size={16} sx={{ color: "#fff" }} /> : t("Read", {}, "permission")}
              </Button>
            </Box>

            {/* WHAT IS IN THERE, and which of it to bring in. Only the ticked ones are read, so this
                list costs nothing however long it is. */}
            {catalog && (
              <>
                <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, flexWrap: "wrap" }}>
                  <Typography variant="body2" sx={{ color: INK, fontWeight: 600 }}>
                    {t("{count} skills there - choose up to {max} to bring in", { count: catalog.rows.length, max })}
                  </Typography>
                  <Typography variant="caption" sx={{ color: pickCount >= max ? ROLES.you.ink : FAINT, flex: 1 }}>
                    {t(pickCount >= max ? "{count} chosen - that is the most one import takes" : "{count} chosen", { count: pickCount })}
                  </Typography>
                  <Button size="small" disabled={!pickCount} onClick={() => setCatalog((c) => ({ ...c, picked: [] }))}>{t("Clear")}</Button>
                </Box>
                <Box sx={{ flex: 1, minHeight: 0, maxHeight: 300, overflowY: "auto", border: `1px solid ${BORDER}`, borderRadius: 1.5, p: 1 }}>
                  {catalog.rows.map((r) => {
                    const on = catalog.picked.includes(r.path);
                    return (
                      <Box key={r.path} onClick={() => (on || pickCount < max) && togglePick(r.path)}
                        sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.35, px: 0.75, borderRadius: 1,
                          cursor: on || pickCount < max ? "pointer" : "default", opacity: on || pickCount < max ? 1 : 0.5,
                          "&:hover": { bgcolor: "var(--tq-panel, #f4f1ec)" } }}>
                        <Checkbox size="small" checked={on} disabled={!on && pickCount >= max} sx={{ p: 0.25 }}
                          inputProps={{ "aria-label": t("bring in {name}", { name: r.name }) }} />
                        <Typography sx={{ ...mono, fontSize: 12.5, fontWeight: 600, color: INK, flex: 1 }} noWrap>{r.name}</Typography>
                        {!!r.plugin && <Typography variant="caption" sx={{ color: FAINT }} noWrap>{r.plugin}</Typography>}
                      </Box>
                    );
                  })}
                </Box>
                <Button variant="contained" disableElevation sx={{ alignSelf: "flex-start" }}
                  disabled={busy || !pickCount} onClick={() => bringIn(catalog.target, catalog.picked)}>
                  {busy ? <CircularProgress size={16} sx={{ color: "#fff" }} /> : pickCount ? t("Read the {count} chosen", { count: pickCount }) : t("Read the chosen")}
                </Button>
              </>
            )}
            {/* ...and while a catalogue is on screen, the machine's own list is not: the question
                has moved on from where to look to which of these to take */}
            {!catalog && <Typography variant="caption" sx={{ color: FAINT }}>
              {t("Already found on this machine - click one to fill the path above, then Read.")}
            </Typography>}
            <Box sx={{ display: catalog ? "none" : "block", flex: 1, minHeight: 0, maxHeight: 340, overflowY: "auto", border: `1px solid ${BORDER}`, borderRadius: 1.5, p: 1 }}>
              {found === null && <CircularProgress size={18} />}
              {found?.length === 0 && <Typography variant="body2" sx={{ color: FAINT }}>{t("No skills found under ~/.claude on this machine.")}</Typography>}
              {groups.map((g) => (
                <Box key={g.key} sx={{ mb: 1.25 }}>
                  <Typography variant="caption" sx={{ color: FAINT, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{g.personal ? t("Personal skills") : g.key}</Typography>
                  {g.rows.map((r) => (
                    <Box key={r.path} onClick={() => setPath(r.path)}
                      sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.6, px: 0.75, borderRadius: 1, cursor: "pointer",
                        bgcolor: path === r.path ? "var(--tq-panel, #f4f1ec)" : "transparent", "&:hover": { bgcolor: "var(--tq-panel, #f4f1ec)" } }}>
                      <Typography sx={{ ...mono, fontSize: 12.5, fontWeight: 600, color: INK, flex: 1 }} noWrap>{r.name}</Typography>
                      <Typography variant="caption" sx={{ color: FAINT }}>{kb(r.bytes)}</Typography>
                    </Box>
                  ))}
                </Box>
              ))}
            </Box>
          </>
        )}

        {step === 1 && (
          <>
            <Typography variant="body2" sx={{ color: FAINT }}>
              {t("Tick the skills to bring in. Each becomes a worker's instructions - that is why the body is shown here, before anything is written.")}
            </Typography>
            {rows.length > 1 && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="caption" sx={{ color: FAINT, flex: 1 }}>{t("{count} of {total} chosen", { count: pending.length, total: rows.length })}</Typography>
                <Button size="small" onClick={() => setAll(true)}>{t("Select all")}</Button>
                <Button size="small" onClick={() => setAll(false)}>{t("None")}</Button>
              </Box>
            )}
            <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
              {rows.map((r, i) => (
                <Box key={r.path || i} sx={{ border: `1px solid ${BORDER}`, borderRadius: 1.5, p: 1.25, mb: 1, opacity: r.include ? 1 : 0.6 }}>
                  <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
                    <Checkbox checked={!!r.include} onChange={(e) => setRow(i, { include: e.target.checked })}
                      inputProps={{ "aria-label": t("bring in {name}", { name: r.name }) }} sx={{ p: 0.5 }} />
                    <TextField size="small" label={t("Name")} value={r.name} sx={{ minWidth: 160 }}
                      helperText={t("Saved in this shape - lowercase, hyphenated")}
                      onChange={(e) => setRow(i, { name: e.target.value })}
                      onBlur={(e) => setRow(i, { name: slug(e.target.value) })} />
                    <TextField size="small" label={t("Purpose - when should triage choose this?")} value={r.purpose}
                      sx={{ flex: "1 1 260px" }} onChange={(e) => setRow(i, { purpose: e.target.value })} />
                    <Chip size="small" variant="outlined" label={kb(r.bytes)} />
                    {cutBy(r, docChars) > 0 && <Chip size="small" sx={{ color: ROLES.you.ink, borderColor: ROLES.you.bd }} variant="outlined"
                      title={t("A session is given the rules flattened and cut at a fixed length. The router still sees the whole purpose.")}
                      label={t("{count} characters past what a session is given - the end is cut", { count: cutBy(r, docChars).toLocaleString() })} />}
                  </Box>
                  <FormControlLabel sx={{ mt: 0.25, display: "flex" }}
                    control={<Checkbox checked={!!r.enabled} onChange={(e) => setRow(i, { enabled: e.target.checked })} />}
                    label={t("Offer this worker to the router - unticked, it sits on the Profiles list but triage never picks it")} />
                  <Button size="small" onClick={() => setOpenBody((o) => ({ ...o, [i]: !o[i] }))}>
                    {t(openBody[i] ? "Hide the body" : "Read it")}
                  </Button>
                  {openBody[i] && (
                    <Box sx={{ mt: 0.75, maxHeight: 260, overflowY: "auto", bgcolor: "var(--tq-canvas, #f6f4f1)", borderRadius: 1, p: 1 }}>
                      <Typography component="pre" sx={{ ...mono, fontSize: 11.5, whiteSpace: "pre-wrap", m: 0, color: INK }}>{r.body}</Typography>
                    </Box>
                  )}
                </Box>
              ))}
            </Box>
          </>
        )}

        {step === 2 && (
          <>
            {pending.length > 0 && <Typography variant="body2" sx={{ color: FAINT }}>
              {t(pending.length === 1 ? "1 skill ready to write as a profile." : "{count} skills ready to write as profiles.", { count: pending.length })}
            </Typography>}
            <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
              {rows.map((r, i) => r.include && (
                <Box key={r.path || i} sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.6, flexWrap: "wrap" }}>
                  <Typography sx={{ ...mono, fontSize: 12.5, flex: 1, minWidth: 120 }}>{r.name}</Typography>
                  <Typography variant="caption" sx={{ color: FAINT }}>{t(r.enabled ? "on the roster" : "not routed")}</Typography>
                  {r.imported && <Chip size="small" label={t("imported ✓")} />}
                  {r.clash && (
                    <>
                      <Chip size="small" sx={{ bgcolor: ROLES.you.tint, color: ROLES.you.ink, border: `1px solid ${ROLES.you.bd}` }}
                        label={clashText(r.clash)} />
                      <Button size="small" onClick={() => setRow(i, { name: slug(`${r.name}-imported`), clash: null, replace: false })}>{t("Rename")}</Button>
                      {/* asks first: a rules document has no history, so this cannot be undone */}
                      <Button size="small" color="error" onClick={() => setOverwrite(i)}>{t("Overwrite it")}</Button>
                    </>
                  )}
                </Box>
              ))}
            </Box>
            {done && !pending.length && <Alert severity="success">{t("Imported: {names}", { names: done.imported.join(", ") || t("none") })}</Alert>}
          </>
        )}
      </DialogContent>
      <ButtonBar>
        {step === 1 && <Button variant="contained" disableElevation disabled={busy || !pending.length || !allNamed} onClick={() => setStep(2)}>{t("Next")}</Button>}
        {step === 2 && pending.length > 0 && (
          <Button variant="contained" disableElevation disabled={busy} onClick={runImport}>
            {busy ? <CircularProgress size={14} sx={{ color: "#fff" }} /> : t("Import")}
          </Button>
        )}
        {step > 0 && <Button disabled={busy} onClick={() => setStep(step - 1)}>{t("Back")}</Button>}
        <Button disabled={busy} onClick={onClose}>{t(done && !pending.length ? "Done" : "Close")}</Button>
      </ButtonBar>
      <Confirm open={overwrite !== null} confirmLabel={t("Overwrite")} onClose={() => setOverwrite(null)}
        title={rows[overwrite]?.clash?.doc
          ? t("Overwrite {doc}.md?", { doc: rows[overwrite].clash.doc.toUpperCase() })
          : t('Overwrite the "{name}" profile?', { name: rows[overwrite]?.name })}
        text={rows[overwrite]?.clash?.doc
          ? t("That is an operator document the assistant reads on every message, not a worker profile. Its current text has no history to restore from, so this cannot be undone. Rename the import instead unless you mean it.")
          : t("Its kind and its whole rules document are replaced by this skill's. A profile's document has no history to restore from, so this cannot be undone.")}
        onConfirm={() => { setRow(overwrite, { replace: true, clash: null }); }} />
    </Dialog>
  );
}
