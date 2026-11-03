// A QUEUED START, said the same way wherever the task shows (T10, the owner, 2026-09-25). It read "starts by itself
// when it can" on a start that had already failed, and neither page offered the Retry or Cancel the server has had
// since PW-087. What it waits for, or why it could not start - and the two moves.
import React, { useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import api from "./api";
import { ALERT, ROLES } from "./theme.jsx";
import { fmtTime } from "./dates.js";
import { t } from "./i18n.js";
import { useLocale } from "./LocaleProvider.jsx";

export default function QueuedStart({ taskId, queued, onChanged, compact = false }) {
  const locale = useLocale();
  const [busy, setBusy] = useState(""), [err, setErr] = useState("");
  if (!queued) return null;
  const failed = queued.state === "failed", retrying = queued.state === "retrying", ranked = queued.value != null;
  // a SETUP error ("unknown agent") fails every Start the same way - Start now is not the fix, and must not be offered as one
  const setup = failed && queued.permanent;
  // a start that failed and will try again read "Waiting for a free agent slot"; and the reason was the raw exception -
  // its first line, cut short, is the part a person reads (the whole of it stays on hover)
  const why = String(queued.lastError || "").split("\n")[0].slice(0, 140);
  const at = retrying && queued.nextAt ? fmtTime(new Date(String(queued.nextAt).replace(" ", "T")), locale === "zh-CN" ? "zh-CN" : [], { hour: "numeric", minute: "2-digit" }) : "";
  const act = (e, what) => {
    e.stopPropagation();
    setBusy(what); setErr("");
    (what === "retry" ? api.post(`/api/tasks/${taskId}/dispatch/retry`) : api.delete(`/api/tasks/${taskId}/dispatch`))
      .then(() => onChanged?.())
      .catch((x) => setErr(x?.response?.data?.detail || { key: "That did not go through." }))
      .finally(() => setBusy(""));
  };
  const c = failed ? { bg: "#f3e7e9", bd: ALERT, ink: ALERT } : { bg: ROLES.working.tint, bd: ROLES.working.solid, ink: ROLES.working.ink };
  return (
    <Box onClick={(e) => e.stopPropagation()} sx={{ mt: 0.75, px: 1.1, py: 0.8, bgcolor: c.bg, border: `1px solid ${c.bd}55`,
      borderLeft: `3px solid ${c.bd}`, borderRadius: 1.25 }}>
      <Typography variant="caption" sx={{ color: c.ink, fontWeight: 600, display: "block", fontSize: compact ? 10 : 11.5, lineHeight: 1.4 }}>
        {failed ? t("⏳ Couldn't start") : retrying ? at ? t("⏳ Couldn't start yet - trying again at {time}", { time: at }) : t("⏳ Couldn't start yet - trying again shortly") : queued.behind ? t("⏳ Waiting on {behind}", { behind: queued.behind })
          : ranked ? t("⏳ Waiting its turn") : t("⏳ Waiting for a free agent slot")}
        {!failed && queued.behindTitle ? ` — “${queued.behindTitle}”` : ""}
      </Typography>
      <Typography variant="caption" title={queued.lastError || ""} sx={{ color: c.ink, display: "block", fontSize: compact ? 9.5 : 11, lineHeight: 1.45, mt: 0.2 }}>
        {setup ? t("{reason}. This is a setup problem, so Start fails the same way until it is fixed - check the agent and the repository this task uses.", { reason: why || t("The agent is not set up") })
          : failed ? t("{reason}. It won't try again by itself - Start now tries once more, Cancel takes it off the queue.", { reason: why || t("It ran out of tries") })
          : retrying ? `${why ? `${why}. ` : ""}${t("Nothing to do yet - Cancel if you'd rather it didn't.")}`
          : ranked ? `${queued.why ? `${queued.why} · ` : ""}${t("waiting work starts most valuable first, and this starts when it comes up")}`
          : `${queued.why ? `${queued.why} · ` : queued.reason ? `${queued.reason} · ` : ""}${t("starts by itself when a slot frees up")}`}
      </Typography>
      <Box sx={{ display: "flex", gap: 0.75, mt: 0.6 }}>
        {failed && !setup && <Button size="small" variant="contained" disableElevation disabled={!!busy} onClick={(e) => act(e, "retry")}
          sx={{ fontSize: 10.5, minHeight: 24, py: 0, px: 1.1 }}>{busy === "retry" ? t("Starting…") : t("Start now")}</Button>}
        <Button size="small" disabled={!!busy} onClick={(e) => act(e, "cancel")}
          sx={{ fontSize: 10.5, minHeight: 24, py: 0, px: 1.1 }}>{busy === "cancel" ? t("Cancelling…") : t("Cancel")}</Button>
      </Box>
      {err && <Typography variant="caption" sx={{ color: ALERT, display: "block", mt: 0.4 }}>{typeof err === "object" ? t(err.key) : err}</Typography>}
    </Box>
  );
}
