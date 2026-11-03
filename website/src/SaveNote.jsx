// THE ANSWER TO "DID THAT TAKE?" A switch that flips, a box you leave, a rule you save - each of these
// used to post and say nothing either way, so a refusal looked exactly like a success and the owner
// found out a week later that the setting never stuck. One small notice, bottom-left, for both: a
// brief "Saved", or the reason it was not in words, which stays until it is read.
import React, { useCallback, useState } from "react";
import { Button, Snackbar } from "@mui/material";
import { errorPresentation, errorText } from "./apiError.js";
import { t, translateDescriptor } from "./i18n.js";
import { useLocale } from "./LocaleProvider.jsx";

export function useSaveNote() {
  useLocale();
  const [note, setNote] = useState(null);
  // run(fn, {ok, fail, lead, undo, localize}): ok/lead may be presentation descriptors; localize marks string values as UI sources
  const run = useCallback(async (fn, { ok, fail, lead, undo, localize = false } = {}) => {
    try { const r = await fn(); if (ok === undefined || ok) setNote({ text: ok, defaultOk: ok === undefined, localize, undo, n: Date.now() }); return { ok: true, r }; }
    catch (e) {
      setNote({ lead, reason: errorPresentation(e, fail, { localFallback: fail === undefined || localize }), localize, bad: true, n: Date.now() }); return { ok: false, e };
    }
  }, []);
  const say = useCallback((text, extra = {}) => setNote({ text, ...extra, n: Date.now() }), []);
  const el = (
    <Snackbar key={note?.n || "none"} open={!!note} onClose={(_e, why) => why !== "clickaway" && setNote(null)}
      autoHideDuration={note?.bad ? 9000 : note?.undo ? 7000 : 2200} anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      message={note?.bad && "reason" in note ? (note.lead === undefined ? t("Not saved — ") : typeof note.lead === "string" && note.localize ? t(note.lead) : translateDescriptor(note.lead)) + errorText(note.reason) : note?.defaultOk ? t("Saved") : typeof note?.text === "string" && note.localize ? t(note.text) : translateDescriptor(note?.text)}
      ContentProps={{ sx: note?.bad ? { borderLeft: "4px solid #6b2733" } : {} }}
      action={note?.undo ? <Button size="small" onClick={() => { const u = note.undo; setNote(null); u(); }}>{t("Undo")}</Button> : null} />
  );
  return { run, say, note: el };
}
