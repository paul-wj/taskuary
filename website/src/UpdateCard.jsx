// Settings → Updates: which build is running, which is the latest release, and one button that
// fetches it, swaps it in and comes back - with every connection and setting intact, because all
// of that lives in the data folder and never beside the program (update.py explains the roads).
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Box, Button, CircularProgress, Typography } from "@mui/material";
import SystemUpdateAltIcon from "@mui/icons-material/SystemUpdateAlt";
import api from "./api";
import { updateWaiting } from "./appQuit.js";
import { BORDER, DIM, FAINT, INK, mono } from "./theme.jsx";
import { t, translateDescriptor } from "./i18n.js";
import { useLocale } from "./LocaleProvider.jsx";

const HOW = {
  setup: "the installed desktop app — the new installer is downloaded and runs quietly after this window closes; it reopens by itself. Windows asks for your OK only if Taskuary was installed for all users",
  exe: "the one-file desktop app (Taskuary.exe) — the installer is downloaded and runs quietly after this window closes; Taskuary moves into its installed home with a Start menu entry, the one file is removed, and it reopens by itself",
  pip: "a pip install — `pip install -U taskuary` runs, then the same command line is relaunched",
  source: "a source checkout — update it with `git pull` in the repository, then restart; nothing here can do that for you",
};

const waitingText = (data) => {
  const match = /^Update waits for (?:(\d+) running agents?)?(?: and )?(?:(\d+) routine runs?)?(?: \(([^)]*)\))?$/.exec(data.waits || "");
  const parts = match ? [
    match[1] && t(Number(match[1]) === 1 ? "{count} running agent" : "{count} running agents", { count: match[1] }),
    match[2] && t(Number(match[2]) === 1 ? "{count} routine run" : "{count} routine runs", { count: match[2] }),
  ].filter(Boolean).join(t(" and ")) + (match[3] ? ` (${match[3]})` : "") : "";
  const waiting = parts ? t("Update waits for {work}", { work: parts }) : data.waits || t("Update waits for running work");
  return t("{waiting} - it starts by itself when that is done.", { waiting });
};

// `asked`: the Assistant brought this page up for its button ("update the app", "is there an update") - it is lit, outlined the way an
// asked knob row is, until the owner presses it. The Assistant never presses it (assistant-is-a-router, 2026-10-25)
export default function UpdateCard({ asked = false, at = 0 }) {
  useLocale();
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState("");          // "check" | "apply" | "waiting" | "restarting"
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [lit, setLit] = useState(asked);
  useEffect(() => { setLit(asked); }, [asked, at]);
  const startedRef = useRef(null);

  const check = useCallback(async (force) => {
    setBusy("check"); setErr("");
    try { setInfo((await api.get(`/api/update${force ? "?force=1" : ""}`)).data); }
    catch (e) {
      // an older server, or the static demo: still say which build this is, from the route
      // every install has - "Running v..." forever is the one thing this card must never show
      try { const { data } = await api.get("/api/version"); setInfo({ current: data.version, how: "exe", latest: null, newer: false, error: null }); }
      catch { /* nothing answers: the message below says so */ }
      setErr(e?.response?.data?.detail || { source: "Couldn't check for updates from here. Press Check now to try again, or download the latest build from the project's GitHub page.", values: {} });
    }
    setBusy("");
  }, []);
  useEffect(() => { check(false); }, [check]);

  // After the swap the old process is gone for a few seconds. Poll /api/version until a NEW
  // version answers, then reload so the page runs the new bundle too.
  const waitForNew = useCallback(async (was) => {
    startedRef.current = Date.now();
    for (;;) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const { data } = await api.get("/api/version");
        if (data.version && data.version !== was) { window.location.reload(); return; }
      } catch { /* still restarting */ }
      if (Date.now() - startedRef.current > 180000) { setBusy(""); setErr({ source: "the new build did not come back within three minutes — start Taskuary by hand; your data is untouched", values: {} }); return; }
    }
  }, []);

  // AN UPDATE WAITS FOR RUNNING WORK (update.when_idle): the server holds the press until no agent or workflow run is live, and the card
  // says what it waits for, read again every few seconds. Once the server goes away the wait is the swap - the new build is looked for.
  const waitForIdle = useCallback(async (was) => {
    for (;;) {
      await new Promise((r) => setTimeout(r, 4000));
      let data;
      try { data = (await api.get("/api/update")).data; } catch { setBusy("restarting"); setNote({ source: "swapping the program and reopening…", values: {} }); await waitForNew(was); return; }
      if (data.current && data.current !== was) { window.location.reload(); return; }
      if (data.queued_error) { setBusy(""); setNote(""); setErr(data.queued_error); setInfo(data); return; }
      if (!updateWaiting(data)) { setBusy("restarting"); setNote({ source: "swapping the program and reopening…", values: {} }); await waitForNew(was); return; }
      setNote({ waiting: data });
    }
  }, [waitForNew]);
  useEffect(() => {       // ...and a page opened while one already waits shows it waiting, not a fresh button
    if (updateWaiting(info) && !busy) { setBusy("waiting"); setNote({ waiting: info }); waitForIdle(info.current); }
  }, [info]);             // on a new answer only: `busy` and the waiter are read, not watched

  const apply = async () => {
    setLit(false); setBusy("apply"); setErr(""); setNote("");
    try {
      const { data } = await api.post("/api/update", {});
      if (data.restarting) { setBusy("restarting"); setNote({ source: data.how === "exe" || data.how === "setup" ? "downloaded — installing and reopening…" : "installed — relaunching…", values: {} }); await waitForNew(info?.current); }
      else if (updateWaiting(data)) { setBusy("waiting"); setNote({ waiting: data }); await waitForIdle(info?.current); }
      else { setNote(data.detail || { source: "done", values: {} }); setBusy(""); }
    } catch (e) { setErr(e?.response?.data?.detail || { source: "the update did not start", values: {} }); setBusy(""); }
  };

  const how = info?.how || "exe";
  const canApply = !!info && info.newer && !info.error && how !== "source";
  // A FAILED CHECK IS NOT "UP TO DATE". With nothing to compare against, the button used to read as
  // a clean bill of health while the warning under it said the opposite.
  const unknown = !info?.latest && !!(err || info?.error);
  // no width of its own: every settings page is as wide as the shell's column (2026-09-18)
  return (
    <Box>
      <Typography variant="body2" sx={{ color: DIM, mb: 1.5, lineHeight: 1.6 }}>
        {t("Everything you have set up — connections, tokens, the database, your documents and playbooks — lives in the data folder, never beside the program. An update only swaps the program, so all of it is exactly where you left it when the new build opens.")}
      </Typography>
      <Box sx={{ p: 1.75, border: `1px solid ${BORDER}`, borderRadius: 2, bgcolor: "var(--tq-panel, #fff)" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
          <SystemUpdateAltIcon sx={{ fontSize: 22, color: "var(--tq-link, #55697a)" }} />
          <Box sx={{ flex: 1, minWidth: 220 }}>
            <Typography sx={{ fontWeight: 600, color: INK, fontSize: 13.5 }}>
              {t("Running")} <Box component="span" sx={{ ...mono }}>v{info?.current || "…"}</Box>
              {info?.latest && (
                <Box component="span" sx={{ color: info.newer ? "var(--tq-danger, #6b2733)" : "var(--tq-success, #47654a)", fontWeight: 600, ml: 1, fontSize: 12.5 }}>
                  {info.newer ? t("· v{version} is out", { version: info.latest }) : t("· this is the latest")}
                </Box>
              )}
            </Typography>
            <Typography variant="caption" sx={{ color: FAINT, display: "block", mt: 0.25 }}>
              {t("This is {installation}.", { installation: t(HOW[how] || HOW.exe) })}
            </Typography>
          </Box>
          <Button size="small" variant="outlined" disabled={!!busy} onClick={() => check(true)}
            startIcon={busy === "check" ? <CircularProgress size={12} /> : null}>{t("Check now")}</Button>
          {/* data-tq-knob: the Assistant's "update taskuary" lights this one (#settings=updates&key=update, SettingsView's knob) */}
          {/* ...and a check that did not get through draws none: a greyed Couldn't check beside Check now said what the warning under
              it says (the setup sweep, 2026-10-28) */}
          {!(unknown && !busy) && <Button size="small" variant="contained" disableElevation disabled={!canApply || !!busy} onClick={apply} data-tq-knob="update"
            {...(lit && canApply && !busy ? { "data-tq-asked": "" } : {})}
            sx={lit && canApply && !busy ? { outline: "2px solid var(--tq-success, #6f8a6e)", outlineOffset: 3 } : undefined}
            startIcon={["apply", "waiting", "restarting"].includes(busy) ? <CircularProgress size={12} sx={{ color: "#fff" }} /> : null}
            title={how === "source" ? t("a source checkout updates with git pull") : info?.newer ? t("install v{version} and reopen - it waits for agents mid-turn and routine runs to finish first", { version: info.latest })
              : t("nothing newer to install")}>
            {busy === "restarting" ? t("Reopening…") : busy === "waiting" ? t("Waiting…") : busy === "apply" ? t("Updating…") : info?.newer ? t("Update to v{version}", { version: info.latest })
              : info && !unknown ? t("Up to date") : t("Checking…")}
          </Button>}
        </Box>
        {info?.notes && info.newer && (
          <Typography variant="caption" sx={{ display: "block", mt: 1, color: FAINT }}>
            {t("What changed:")}{" "}
            <Box component="a" href={info.notes} target="_blank" rel="noopener" sx={{ color: "var(--tq-link, #55697a)" }}>{t("release notes")}</Box>
          </Typography>
        )}
        {note && <Alert severity="info" sx={{ mt: 1.25, fontSize: 12.5 }}>{note.waiting ? waitingText(note.waiting) : translateDescriptor(note)}</Alert>}
        {(err || info?.error) && <Alert severity={err ? "error" : "warning"} sx={{ mt: 1.25, fontSize: 12.5 }}>{err ? translateDescriptor(err) : info.error}</Alert>}
      </Box>
      <Typography variant="caption" sx={{ color: FAINT, display: "block", mt: 1.25, lineHeight: 1.6 }}>
        {t("Releases come from the project's GitHub page; the desktop build is the same file you would download there. An update waits for agents in the middle of a turn and for workflow runs, then swaps the program — nothing is cut off halfway. An agent waiting on you is closed, and its task stays open.")}
      </Typography>
    </Box>
  );
}
