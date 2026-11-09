// Start from a role: one click from "I do accounts payable" to the worker, its playbooks and its daily job - no mail is
// routed to it: a task's general work runs on the assistant (2026-11-04). Everything it lays out (roles.py) already had its
// own page; nobody who is not technical ever found them all, so the role is offered here, where the workers live, until it is taken.
import React, { useCallback, useEffect, useState } from "react";
import { Box, Button, Dialog, DialogContent, DialogTitle, TextField, Typography } from "@mui/material";
import { ButtonBar } from "./ButtonBar.jsx";
import api from "./api";
import { FAINT, INK } from "./theme.jsx";
import { t } from "./i18n.js";
import { useLocale } from "./LocaleProvider.jsx";

// what changed, in the owner's words - a receipt, not a log
const said = (r) => [
  r.profile_added ? t("Added the {profile}.md worker.", { profile: r.profile.toUpperCase() }) : t("The {profile}.md worker was already here.", { profile: r.profile.toUpperCase() }),
  r.playbooks_added.length ? t(r.playbooks_added.length > 1 ? "Added {count} playbooks." : "Added {count} playbook.", { count: r.playbooks_added.length }) : "",
  r.ledger_narrowed ? t("{ledger} is set to read: every bill becomes a proposal you approve.", { ledger: r.ledger_narrowed }) : "",
  r.workflow_id ? t("The daily portal job is under Reports, in Workflows, switched off until you have signed in to the portal once.") : "",
].filter(Boolean).join(" ");

export default function RoleStart({ onApplied }) {
  useLocale();
  const [roles, setRoles] = useState([]);
  const [open, setOpen] = useState(null);     // the role being set up
  const [portal, setPortal] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);
  const load = useCallback(() => api.get("/api/roles").then(({ data }) => setRoles(data.data || [])).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  const apply = async () => {
    setBusy(true); setErr("");
    try {
      const { data } = await api.post(`/api/roles/${open.name}`, { portal });
      setDone(data); setOpen(null); await load(); onApplied?.();
    } catch (e) { setErr(e?.response?.data?.detail || { key: "Could not set it up. Try again, or add the profile by hand." }); }
    finally { setBusy(false); }
  };
  const offered = roles.filter((r) => !r.applied);
  if (!offered.length && !done) return null;
  return (
    <Box sx={{ mb: 1.25 }}>
      {done && <Typography sx={{ fontSize: 11.5, color: INK, p: 1.25, mb: 0.75, bgcolor: "#fff", border: "1px solid #e1dcd5", borderRadius: 2 }}>{said(done)}</Typography>}
      {offered.map((r) => (
        <Box key={r.name} sx={{ p: 1.25, mb: 0.75, border: "1px dashed #d8cfbe", borderRadius: 2, display: "flex", alignItems: "center", gap: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: INK }}>{t("Start from a role: {title}", { title: r.name === "ap" && r.title === "Accounts payable" ? t("Accounts payable") : r.title })}</Typography>
            <Typography sx={{ fontSize: 11.5, color: FAINT }}>{r.name === "ap" && r.blurb === "Vendor mail answered from the ledger; bills waiting in the approval portal checked against it, approved on your yes." ? t(r.blurb) : r.blurb}</Typography>
          </Box>
          <Button size="small" variant="outlined" sx={{ whiteSpace: "nowrap" }} onClick={() => { setOpen(r); setPortal(""); setErr(""); }}>{t("Set up")}</Button>
        </Box>
      ))}
      <Dialog open={!!open} onClose={() => !busy && setOpen(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 16 }}>{t("Set up for {title}", { title: open?.name === "ap" && open.title === "Accounts payable" ? t("accounts payable") : open?.title.toLowerCase() })}</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 12.5, color: INK, mb: 1.5 }}>
            {t("Adds the {profile}.md worker, its playbooks and its daily job.", { profile: open?.profile.toUpperCase() })}
            {t("Nothing is posted to your ledger without your approval.")}
          </Typography>
          {open?.portal_needed && (
            <TextField size="small" fullWidth label={t("Bill-approval portal address (optional)")} placeholder="https://"
              value={portal} onChange={(e) => setPortal(e.target.value)}
              helperText={t("For the daily job that reads the portal's approved bills. You can add it later.")} />
          )}
          {err && <Typography sx={{ fontSize: 12, color: "#8a3324", mt: 1 }}>{typeof err === "object" ? t(err.key) : err}</Typography>}
        </DialogContent>
        <ButtonBar>
          <Button variant="contained" onClick={apply} disabled={busy}>{busy ? t("Setting up…") : t("Set up")}</Button>
          <Button onClick={() => setOpen(null)} disabled={busy}>{t("Cancel")}</Button>
        </ButtonBar>
      </Dialog>
    </Box>
  );
}
