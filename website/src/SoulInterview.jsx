// SOUL.md comes from a seven-turn conversation, not a fixed questionnaire. The assistant sees
// every earlier answer before it asks the next question, so a teacher, an accountant, a founder,
// and a developer get four different interviews rather than the same repository-shaped form.
import React, { useEffect, useState } from "react";
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogContent, DialogTitle,
  LinearProgress, TextField, Typography,
} from "@mui/material";
import { ButtonBar } from "./ButtonBar.jsx";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import api from "./api";
import { BORDER, DIM, FAINT, INK, PANEL2 } from "./theme.jsx";
import { t } from "./i18n.js";
import { useLocale } from "./LocaleProvider.jsx";

export default function SoulInterview({ open, onClose, onWritten }) {
  useLocale();
  const [question, setQuestion] = useState(null);
  const [total, setTotal] = useState(7);
  const [answers, setAnswers] = useState([]);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    let live = true;
    setQuestion(null); setAnswers([]); setAnswer(""); setErr(""); setBusy("question");
    api.get("/api/soul/interview").then(({ data }) => {
      if (!live) return null;
      setTotal(data.total || 7);
      return api.post("/api/soul/interview/next", { answers: [] });
    }).then((result) => {
      if (live && result) setQuestion(result.data.question);
    }).catch((e) => {
      if (live) setErr(e?.response?.data?.detail || "Could not start the interview");
    }).finally(() => { if (live) setBusy(""); });
    return () => { live = false; };
  }, [open]);

  const advance = async (skip = false) => {
    if (!question) return;
    const next = [...answers, { q: question.q, a: skip ? "" : answer.trim() }];
    if (next.length >= total && !next.some((row) => row.a)) {
      setErr("Answer at least one question so the assistant has something true to write from.");
      return;
    }
    setBusy(next.length >= total ? "write" : "question"); setErr("");
    try {
      if (next.length >= total) {
        const { data } = await api.post("/api/soul/interview", { answers: next });
        onWritten?.(data.doc); onClose();
      } else {
        const { data } = await api.post("/api/soul/interview/next", { answers: next });
        setAnswers(next); setQuestion(data.question); setAnswer("");
      }
    } catch (e) { setErr(e?.response?.data?.detail || "The assistant could not continue the interview"); }
    setBusy("");
  };

  const number = question?.number || answers.length + 1;
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 0.5 }}>
        {t("Shape SOUL.md with the assistant")}
        <Typography variant="caption" sx={{ color: FAINT, display: "block", fontWeight: 400, mt: 0.25 }}>
          {t("Seven questions, one at a time. Each new question follows what you have already said.")}
        </Typography>
      </DialogTitle>
      <LinearProgress variant={question ? "determinate" : "indeterminate"}
        value={question ? Math.max(4, ((number - 1) / total) * 100) : undefined} />
      <DialogContent sx={{ pt: "18px !important" }}>
        {err && <Alert severity="error" onClose={() => setErr("")} sx={{ mb: 2 }}>{err === "Could not start the interview" || err === "The assistant could not continue the interview" || err === "Answer at least one question so the assistant has something true to write from." ? t(err) : err}</Alert>}
        {!question && busy === "question" ? (
          <Box sx={{ display: "flex", gap: 1.25, alignItems: "center", color: DIM, py: 4, justifyContent: "center" }}>
            <CircularProgress size={18} /><Typography variant="body2">{t("The assistant is choosing the first question…")}</Typography>
          </Box>
        ) : question && (
          <>
            <Typography variant="caption" sx={{ color: FAINT, fontWeight: 600, letterSpacing: ".06em" }}>
              {t("QUESTION {number} OF {total}", { number, total })}
            </Typography>
            <Typography sx={{ fontSize: 19, lineHeight: 1.35, fontWeight: 600, color: INK, mt: 0.75, mb: 1 }}>
              {question.q}
            </Typography>
            <Typography variant="body2" sx={{ color: DIM, mb: 2 }}>{question.why}</Typography>
            <TextField autoFocus fullWidth multiline minRows={3} maxRows={8} size="small"
              placeholder={question.placeholder || t("Answer in your own words")} value={answer}
              onChange={(e) => setAnswer(e.target.value)} disabled={!!busy}
              onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && answer.trim()) advance(); }}
              sx={{ bgcolor: "var(--tq-panel, #fff)", "& textarea": { fontSize: 13.5, lineHeight: 1.55 } }} />
            {!!answers.length && (
              <Box sx={{ mt: 2, bgcolor: PANEL2, border: `1px solid ${BORDER}`, borderRadius: 1.5, p: 1.25 }}>
                <Typography variant="caption" sx={{ color: FAINT, display: "block" }}>
                  {t(answers.filter((row) => row.a).length === 1 ? "The assistant is carrying forward {count} answer from the earlier questions." : "The assistant is carrying forward {count} answers from the earlier questions.", { count: answers.filter((row) => row.a).length })}
                </Typography>
              </Box>
            )}
          </>
        )}
      </DialogContent>
      <ButtonBar>
        <Button variant="contained" disableElevation disabled={!!busy || !question || !answer.trim()}
          onClick={() => advance()} startIcon={busy ? <CircularProgress size={12} sx={{ color: "#fff" }} /> : <AutoAwesomeIcon sx={{ fontSize: 15 }} />}>
          {t(busy === "write" ? "Writing…" : busy === "question" ? "Thinking…" : number >= total ? "Write SOUL.md" : "Next question")}
        </Button>
        {question && <Button onClick={() => advance(true)} disabled={!!busy}>{t("Skip")}</Button>}
        <Button onClick={onClose} disabled={!!busy}>{t("Cancel")}</Button>
      </ButtonBar>
    </Dialog>
  );
}
