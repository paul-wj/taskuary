import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Alert, Box, Button, CircularProgress, Dialog, DialogContent, DialogTitle, TextField, Typography } from "@mui/material";
import { ButtonBar } from "./ButtonBar.jsx";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import api from "./api";
import ConnectAi from "./ConnectAi.jsx";
import { sayEarlier } from "./pageView.js";
import { t } from "./i18n.js";
import { useLocale } from "./LocaleProvider.jsx";

const GeneralWorkspace = lazy(() => import("./GeneralWorkspace.jsx"));
const failure = (e) => e?.response?.data?.detail || e.message || { key: "Could not start playbook setup." };

// `initialText`: the words New's Playbook tab (or the Assistant) wrote - From scratch, filled in. `autoStart`: Set up with AI was pressed there
export default function NewPlaybookDialog({ connectorType = "", initialText = "", autoStart = false, onClose, onManual }) {
  useLocale();
  const [mode, setMode] = useState(initialText.trim() ? "scratch" : "");
  const [query, setQuery] = useState("");
  const [before, setBefore] = useState(0);
  const [rows, setRows] = useState([]);
  const [next, setNext] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [text, setText] = useState(initialText);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [task, setTask] = useState(null);
  const [noAi, setNoAi] = useState(false);

  useEffect(() => {
    if (mode !== "email") return undefined;
    let live = true;
    setLoading(true); setError("");
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get(`/api/playbooks/examples?q=${encodeURIComponent(query)}&before=${before}`);
        if (live) { setRows((old) => before ? [...old, ...data.data] : data.data); setNext(data.next); }
      } catch (e) { if (live) setError(failure(e)); }
      finally { if (live) setLoading(false); }
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [mode, query, before]);

  const start = async () => {
    setBusy(true); setError(""); setNoAi(false);
    try {
      const { data } = await api.post("/api/playbooks/setup", {
        text: text.trim(), message_id: mode === "email" ? selected?.MessageId : null, connector_type: connectorType,
      });
      // ...THE BUILD IS THE GENERAL AGENT'S, SAID IN THE CHAT (2026-10-30: the "with AI" doors open the Assistant, not a thread on the page): the
      // dialog shuts and the chat names the task the agent drafts on (its ref opens it) - its Approve saves the playbook; the page stays put
      const ref = data.task?.ref || (data.task?.TaskId ? `TQ-${String(data.task.TaskId).padStart(4, "0")}` : "");
      if (data.task?.TaskId) {
        onClose?.();
        sayEarlier({ title: `Started ${ref} - the general agent drafts the playbook with you there, and its Approve saves it.`,
          title_i18n: { source: "Started {ref} - the general agent drafts the playbook with you there, and its Approve saves it.", values: { ref } }, open: true });
      } else setTask(data.task);
    } catch (e) {
      setError(failure(e));
      // ...and when the reason is that no AI is connected, the line carries Connect an AI (owner-approved, 2026-10-21) - read as a fact
      // (the general agents' brains), never off the sentence's words
      const brains = await api.get("/api/agents").then(({ data }) => data?.general_brains || null).catch(() => null);
      setNoAi(!!brains && !brains.length);
    }
    finally { setBusy(false); }
  };
  // that press, made here once - a remount (StrictMode's second mount keeps the ref) must not file a second setup task
  const pressed = useRef(false);
  useEffect(() => { if (autoStart && initialText.trim() && !pressed.current) { pressed.current = true; start(); } }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  return <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth={task ? "lg" : "sm"}
    aria-labelledby="new-playbook-title" PaperProps={{ sx: task ? { height: "85vh" } : { maxHeight: "90vh" } }}>
    <DialogTitle id="new-playbook-title">{task ? t("Build your playbook with AI") : t("New playbook")}</DialogTitle>
    {task ? <DialogContent sx={{ display: "flex", flexDirection: "column", minHeight: 0, p: 0 }}>
      <Typography sx={{ px: 3, pb: 1, color: "text.secondary", fontSize: 13 }}>
        {t("Your assistant will draft the steps and review rules with you. Its draft appears here, with Approve.")}
      </Typography>
      <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Suspense fallback={<CircularProgress sx={{ m: 3 }} />}><GeneralWorkspace task={task} compact /></Suspense>
      </Box>
    </DialogContent> : <DialogContent>
      <Typography sx={{ color: "text.secondary", mb: 2 }}>
        {t("A playbook teaches your assistant how to handle a recurring request. Start with an example, or describe what you need.")}
      </Typography>
      {connectorType && <Alert severity="info" sx={{ mb: 2 }}>{t("For your {connector} connection", { connector: connectorType })}</Alert>}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5, mb: 2 }}>
        {[{ value: "email", title: "Use a past email", detail: "Choose a request you have received.", icon: <MailOutlineIcon /> },
          { value: "scratch", title: "Start from scratch", detail: "Tell the assistant what should happen.", icon: <AutoAwesomeIcon /> }].map((choice) =>
          <Button key={choice.value} variant={mode === choice.value ? "contained" : "outlined"} aria-pressed={mode === choice.value}
            disabled={busy} onClick={() => { setMode(choice.value); setError(""); }}
            sx={{ alignItems: "flex-start", flexDirection: "column", textAlign: "left", textTransform: "none", p: 2, gap: 0.75 }}>
            {choice.icon}<Box component="span" sx={{ fontWeight: 600 }}>{t(choice.title)}</Box>
            <Box component="span" sx={{ fontSize: 12, fontWeight: 400 }}>{t(choice.detail)}</Box>
          </Button>)}
      </Box>
      {mode === "email" && <>
        <TextField fullWidth size="small" label={t("Search past emails")} placeholder={t("Subject, sender, or a phrase")}
          value={query} disabled={busy} onChange={(e) => { setQuery(e.target.value); setBefore(0); setRows([]); }} />
        <Typography sx={{ fontSize: 12, color: "text.secondary", my: 1 }}>{t("Searches incoming email already imported into Taskuary, including older mail.")}</Typography>
        <Box sx={{ maxHeight: 230, overflowY: "auto", mb: 1 }} aria-label={t("Past emails")} aria-busy={loading}>
          {rows.map((row) => <Button key={row.MessageId} fullWidth aria-pressed={selected?.MessageId === row.MessageId}
            disabled={busy} onClick={() => setSelected(row)} variant={selected?.MessageId === row.MessageId ? "outlined" : "text"}
            sx={{ display: "block", textAlign: "left", textTransform: "none", px: 1.5, py: 1, mb: 0.5 }}>
            <Typography sx={{ fontWeight: 600, fontSize: 13 }}>{row.Subject || t("(no subject)")}</Typography>
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{row.FromName || row.FromEmail} · {(row.SentAt || "").slice(0, 10)}</Typography>
          </Button>)}
          {loading && <CircularProgress size={20} sx={{ m: 1 }} aria-label={t("Searching emails")} />}
          {!loading && !rows.length && <Typography sx={{ py: 2, fontSize: 13 }}>
            {query ? t("No emails match. Try another search or start from scratch.") : t("No imported emails yet. You can start from scratch.")}
          </Typography>}
          {next && !loading && <Button onClick={() => setBefore(next)} disabled={busy}>{t("Load more emails")}</Button>}
        </Box>
        {selected && <Box sx={{ bgcolor: "action.hover", p: 1.5, mb: 2, borderRadius: 1 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 600 }}>{t("Selected example: {subject}", { subject: selected.Subject || t("(no subject)") })}</Typography>
          <Typography sx={{ fontSize: 12, whiteSpace: "pre-wrap", maxHeight: 120, overflowY: "auto", mt: 0.75 }}>{selected.BodyText || t("This email has no text preview.")}</Typography>
          <Button size="small" disabled={busy} onClick={() => setSelected(null)}>{t("Remove example")}</Button>
        </Box>}
      </>}
      {mode && <TextField fullWidth multiline minRows={3} label={mode === "email" ? t("Anything to add? (optional)") : t("What should this playbook do?")}
        placeholder={t("When someone asks for updated item numbers, gather the latest data and prepare a summary for my review.")}
        value={text} disabled={busy} onChange={(e) => setText(e.target.value)} />}
      {error && <Alert severity="error" sx={{ mt: 2, alignItems: "center" }} action={noAi ? <ConnectAi variant="outlined" onGo={onClose} /> : null}>{typeof error === "object" ? t(error.key) : error}</Alert>}
      {mode && <Typography sx={{ color: "text.secondary", fontSize: 12, mt: 1.5 }}>{t("The assistant will help you define the steps, connections, and what needs your approval.")}</Typography>}
    </DialogContent>}
    <ButtonBar>
      {task ? <>
        <Button href={`#task=${task.TaskId}`} onClick={onClose}>{t("Open task")}</Button>
        <Button onClick={onClose}>{t("Close")}</Button>
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{t("Saved as {ref} - search finds it when you want to come back.", { ref: task.ref || `TQ-${String(task.TaskId).padStart(4, "0")}` })}</Typography>
      </> : <>
        {/* a door to the chat, never pressed from it (data-tq-view-skip, the owner, 2026-11-02) */}
        <Button variant="contained" onClick={start} data-tq-view-skip="" disabled={busy || !mode || (mode === "email" ? !selected : !text.trim())}
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <AutoAwesomeIcon sx={{ fontSize: 15 }} />}>{busy ? t("Starting…") : t("Set up with AI")}</Button>
        <Button onClick={onManual} disabled={busy}>{t("Write manually")}</Button>
        <Button onClick={onClose} disabled={busy}>{t("Cancel")}</Button>
      </>}
    </ButtonBar>
  </Dialog>;
}
