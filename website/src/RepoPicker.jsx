// Which checkout does this task belong in? What the task itself says (a GitHub item's own repository), else the coding agent's own pick
// once it starts (use_repo, repochoice.py) - triage no longer decides it (the owner, 2026-11-06). Either can be wrong, and a wrong answer
// means an agent editing the wrong tree in good faith. So the answer is visible on the task, with its reason, and one click overrides it:
// the owner's tag is what always wins, and the new session's prompt says so.
import React, { useEffect, useState } from "react";
import { Box, Button, Chip, CircularProgress, TextField, Typography } from "@mui/material";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import CheckIcon from "@mui/icons-material/Check";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import api from "./api";
import { namedRepo, repoLabel } from "./repoNames.js";
import { ACCENT, PANEL, PANEL2, BORDER, DIM, FAINT, INK, mono } from "./theme.jsx";
import { openAppLink } from "./appLinks.js";
import { LOCAL, place } from "./words.js";
import { t } from "./i18n.js";
import { useLocale } from "./LocaleProvider.jsx";

// Not every task is about a codebase. "None" is a real answer here, not a blank one: unpinning
// lets Taskuary guess again (and it will pick something), where this says there is nothing to pick.
const NO_REPO = "none";

// `agent` is the coding profile when the caller knows it; blank lets the server find the profile of kind coding
export const RepoPicker = ({ taskId, agent = "", hasSession, onDone }) => {
  useLocale();
  const [rows, setRows] = useState(null);
  const [picked, setPicked] = useState(null);
  const [why, setWhy] = useState("");
  const [open, setOpen] = useState(null);          // the repo whose path we are being asked for
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [localOpen, setLocalOpen] = useState(false);
  const [localPath, setLocalPath] = useState("");
  const load = () => api.get(`/api/tasks/${taskId}/repos`, { params: agent ? { agent } : {} })
    .then(({ data }) => { setRows(data.data || []); setPicked(data.picked); setWhy(data.why || ""); })
    .catch(() => setRows([]));
  useEffect(() => { setRows(null); setOpen(null); setPath(""); setErr(""); setLocalOpen(false); setLocalPath(""); load(); }, [taskId, agent]);

  const choose = async (r, withPath) => {
    // a repo Taskuary knows about but has no path for cannot be opened at all - but the search
    // usually FOUND the checkout already, so the answer is prefilled and one click confirms it
    if (!r.has_path && !withPath) { setOpen(r.repo); setPath(r.found || ""); setErr(""); return; }
    setBusy(true); setErr("");
    try {
      const { data } = await api.put(`/api/tasks/${taskId}/repo`,
        { repo: r.repo, path: withPath || null, ...(agent ? { agent } : {}), restart: !!hasSession });
      setOpen(null); load(); onDone?.(data);
    } catch (e) { setErr(e?.response?.data?.detail ? { text: e.response.data.detail } : { key: "Could not choose that code" }); }
    setBusy(false);
  };

  const bindLocal = async () => {
    const folder = localPath.trim();
    if (!folder || busy) return;
    const repo = `local:${encodeURIComponent(folder.replace(/\\/g, "/").replace(/\/+$/, ""))}`;
    setBusy(true); setErr("");
    try {
      await api.put(`/api/tasks/${taskId}/repo`, { repo, path: folder, restart: false, ...(agent ? { agent } : {}) });
      setLocalOpen(false); setLocalPath(""); load();
      // Binding is not a start request: refresh callers without triggering their pending dispatch.
      onDone?.({});
    } catch (e) { setErr(e?.response?.data?.detail ? { text: e.response.data.detail } : { key: "Could not choose that code" }); }
    finally { setBusy(false); }
  };

  const localCode = (
    <Box data-tq-local-code="" sx={{ mb: 1 }}>
      <Button size="small" variant="outlined" disabled={busy} onClick={() => { setLocalOpen((v) => !v); setErr(""); }}>
        {t("Add local code folder")}
      </Button>
      {localOpen && <Box sx={{ mt: 1 }}>
        <Typography variant="caption" sx={{ color: DIM, display: "block", mb: 0.75 }}>
          {t("Use a folder on the computer running Taskuary. No GitHub connection is needed; choosing it does not start an agent.")}
        </Typography>
        <TextField size="small" fullWidth autoFocus label={t("Local code folder")} value={localPath}
          placeholder="C:\\project\\my-app" inputProps={{ "data-tq-local-code-path": "" }}
          onChange={(e) => setLocalPath(e.target.value)} />
        <Box sx={{ display: "flex", gap: 1, mt: 0.75 }}>
          <Button size="small" variant="contained" disabled={busy || !localPath.trim()} onClick={bindLocal} data-tq-local-code-save="">{t("Use this folder")}</Button>
          <Button size="small" disabled={busy} onClick={() => { setLocalOpen(false); setErr(""); }}>{t("Cancel")}</Button>
        </Box>
      </Box>}
    </Box>
  );

  if (rows === null) return <CircularProgress size={14} />;
  const general = why === "a general question - no repository";
  const noRepoRow = (
    <Box sx={{ border: `1px solid ${general ? ACCENT : BORDER}`, borderRadius: 1.5,
      bgcolor: general ? "var(--tq-inset, #eae4d8)" : PANEL, px: 1.1, py: 0.7, mb: 0.6 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
        <AccountTreeIcon sx={{ fontSize: 14, color: general ? "var(--tq-link, #55697a)" : FAINT }} />
        <Typography variant="caption" sx={{ fontWeight: 600, color: general ? "var(--tq-link, #55697a)" : INK, flex: 1, minWidth: 0 }} noWrap>
          {t("Not code work")}
        </Typography>
        {general ? <CheckIcon sx={{ fontSize: 15, color: "var(--tq-success, #47654a)" }} />
          : <Button size="small" sx={{ fontSize: 10.5, minWidth: 0, px: 0.75 }} disabled={busy}
              onClick={() => choose({ repo: NO_REPO, has_path: true })}>{t("use this")}</Button>}
      </Box>
      <Typography variant="caption" sx={{ color: FAINT, display: "block", pl: 2.6, lineHeight: 1.35 }}>
        {t("A question to answer, not code to change — the agent works in its own folder and is told so.")}
      </Typography>
    </Box>
  );
  if (!rows.length) return (
    <Box>
      <Typography variant="caption" sx={{ color: FAINT, display: "block", mb: 0.75 }}>
        {t("Choose a local code folder, or connect GitHub if your code is hosted there.")}
      </Typography>
      {/* THE PLACE THAT CONNECTS IT, as a button (the rebuilt walk, 2026-10-18): the words named a place with nothing to press */}
      <Button size="small" variant="outlined" sx={{ mb: 0.75 }} onClick={() => openAppLink(place("code").href)}>{t("Connect GitHub")}</Button>
      {localCode}
      {err && <Typography variant="caption" role="alert" sx={{ color: "#6b2733", display: "block" }}>{err.text || t(err.key)}</Typography>}
      {noRepoRow}
    </Box>
  );
  return (
    <Box>
      <Typography variant="caption" sx={{ color: DIM, display: "block", mb: 0.75 }}>
        {general ? t("Not code work — this one is a question, and the agent is told so.")
          : picked ? <>{t("Working in")} <b style={mono}>{repoLabel(picked)}</b>{why ? ` — ${why}` : ""}.</>
            : t("No code chosen yet — the agent picks it when it starts, from what the task asks.")}
        {" "}{t("Pick another and the agent starts again there, told where it is.")}
      </Typography>
      {rows.map((r) => {
        const on = r.repo === picked;
        return (
          <Box key={r.repo} sx={{ border: `1px solid ${on ? ACCENT : BORDER}`, borderRadius: 1.5,
            bgcolor: on ? "var(--tq-inset, #eae4d8)" : PANEL, px: 1.1, py: 0.7, mb: 0.6 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <AccountTreeIcon sx={{ fontSize: 14, color: on ? "var(--tq-link, #55697a)" : FAINT }} />
              <Typography variant="caption" sx={{ ...mono, fontWeight: 600, color: on ? "var(--tq-link, #55697a)" : INK,
                flex: 1, minWidth: 0 }} noWrap>{r.repo.startsWith("local:") ? r.path || repoLabel(r.repo) : r.repo}</Typography>
              {r.tagged && <Chip size="small" label={t("pinned")} sx={{ height: 16, fontSize: 9, bgcolor: "var(--tq-inset, #eae4d8)", color: "var(--tq-link, #55697a)" }} />}
              {!r.has_path && (
                <Chip size="small" icon={<WarningAmberIcon sx={{ fontSize: 11 }} />} label={t("not {local}", { local: t(LOCAL) })}
                  sx={{ height: 16, fontSize: 9, bgcolor: "var(--tq-inset, #dfeade)", color: "var(--tq-link, #55697a)" }} />
              )}
              {on && r.has_path ? <CheckIcon sx={{ fontSize: 15, color: "var(--tq-success, #47654a)" }} />
                : <Button size="small" sx={{ fontSize: 10.5, minWidth: 0, px: 0.75 }} disabled={busy}
                    onClick={() => choose(r)}>{on ? t("set path") : t("use this")}</Button>}
            </Box>
            {r.what && (
              <Typography variant="caption" sx={{ color: FAINT, display: "block", pl: 2.6, lineHeight: 1.35 }} noWrap>
                {r.what}
              </Typography>
            )}
            {r.has_path && (
              <Typography variant="caption" sx={{ ...mono, color: FAINT, display: "block", pl: 2.6, fontSize: 9.5 }} noWrap>
                {r.path}
              </Typography>
            )}
            {/* Taskuary knows what this repo IS (SOUL.md) but not where it is. Without a path a
                session cannot open here at all - it would silently land in the default folder. */}
            {open === r.repo && (
              <Box sx={{ mt: 0.75, pl: 2.6 }}>
                <Typography variant="caption" sx={{ color: r.found ? "var(--tq-success, #47654a)" : "var(--tq-link, #55697a)", display: "block", mb: 0.5 }}>
                  {r.found
                    ? t("Found {repo} {local} — confirm or correct the folder.", { repo: repoLabel(r.repo), local: t(LOCAL) })
                    : t("Which folder holds {repo} {local}? It is saved on the {agent} agent, so every later task about it uses it.", { repo: repoLabel(r.repo), local: t(LOCAL), agent: agent || t("coding") })}
                </Typography>
                <Box sx={{ display: "flex", gap: 0.75, alignItems: "center" }}>
                  <TextField size="small" fullWidth autoFocus value={path} placeholder="C:\\Users\\you\\Documents\\portal"
                    onChange={(e) => setPath(e.target.value)}
                    inputProps={{
                      "aria-label": t("The folder that holds this code"),
                       style: { fontSize: 11.5, fontFamily: "ui-monospace, monospace" } }} />
                  <Button size="small" variant="contained" disableElevation disabled={busy || !path.trim()}
                    onClick={() => choose(r, path.trim())}>{t("Save")}</Button>
                  <Button size="small" sx={{ color: DIM }} onClick={() => setOpen(null)}>{t("Cancel")}</Button>
                </Box>
              </Box>
            )}
          </Box>
        );
      })}
      {localCode}
      {noRepoRow}
      {err && <Typography variant="caption" sx={{ color: "var(--tq-danger, #6b2733)", display: "block" }}>{err.text || t(err.key)}</Typography>}
      <Typography variant="caption" sx={{ color: FAINT, display: "block", mt: 0.5 }}>
        {t("Folders saved here are kept on the agent, so you only say each one once.")}
      </Typography>
      {picked && (
        <Button size="small" sx={{ fontSize: 10.5, color: DIM }} disabled={busy}
          onClick={async () => { setBusy(true); await api.put(`/api/tasks/${taskId}/repo`, { repo: null, ...(agent ? { agent } : {}) }); setBusy(false); load(); onDone?.({}); }}>
          {t("unpin — let the agent choose")}
        </Button>
      )}
    </Box>
  );
};

// THE REPOSITORY, CHOSEN BEFORE START. The Start panel said nothing about where a session would open, and the
// picker above only appeared once a start had already failed or guessed (the owner, 2026-09-24: "when i hit start
// coding agent then the repo picker showed up, but it should be there always"). This is that choice as a
// dropdown beside the brain: the repository the instruction NAMES ("check this in ledger") first, else the one
// pinned on the task, else what the task itself says - and the parent pins the choice before it starts the session. Left
// empty, the agent picks it (use_repo).
export { namedRepo };   // now in repoNames.js, so the New card's picker and a test can import it without JSX

export const RepoSelect = ({ taskId, agent = "", instruction = "", value, onChange }) => {
  useLocale();
  const [data, setData] = useState(null);
  const [manual, setManual] = useState(false);
  useEffect(() => {
    let live = true; setData(null); setManual(false);
    api.get(`/api/tasks/${taskId}/repos`, { params: agent ? { agent } : {} }).then(({ data: d }) => live && setData(d)).catch(() => live && setData({ data: [] }));
    return () => { live = false; };
  }, [taskId, agent]);
  const rows = data?.data || [];
  const tagged = rows.find((r) => r.tagged)?.repo || "";
  const suggested = namedRepo(rows, instruction) || tagged || (data?.picked && data.picked !== NO_REPO ? data.picked : "");
  // follow the words until the owner picks by hand; a hand pick stays
  useEffect(() => { if (data && !manual && suggested !== value) onChange?.(suggested); }, [data, suggested, manual]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!data || !rows.length) return null;
  const row = rows.find((r) => r.repo === value);
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap", mt: 0.75 }}>
      <AccountTreeIcon sx={{ fontSize: 15, color: DIM }} />
      <Typography variant="caption" sx={{ color: DIM, fontWeight: 600 }}>{t("code")}</Typography>
      <select className="tq-start-repo" aria-label={t("which code")} value={value || ""} onChange={(e) => { setManual(true); onChange?.(e.target.value); }}
        style={{ fontSize: 12.5, padding: "4px 6px", borderRadius: 6, border: `1px solid ${BORDER}`, background: "var(--tq-panel, #fff)", color: INK, minWidth: 220 }}>
        {!value && <option value="">{t("the agent picks…")}</option>}
        {rows.map((r) => <option key={r.repo} value={r.repo}>{r.repo.startsWith("local:") ? r.path || repoLabel(r.repo) : r.repo}{r.has_path ? "" : t(" (not {local})", { local: t(LOCAL) })}</option>)}
      </select>
      <Typography variant="caption" sx={{ color: FAINT }}>
        {!value ? t("the agent picks it when it starts - or choose one")
          : value === namedRepo(rows, instruction) ? t("named in your instruction")
          : value === tagged ? t("pinned on this task")
          : manual ? t("your choice") : (data.why || t("from the task"))}
        {row && !row.has_path ? t(" - no local folder yet: you will be asked for it") : ""}
      </Typography>
    </Box>
  );
};
