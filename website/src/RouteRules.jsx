// WHICH AI DOES EACH JOB (the router, 2026-10-25 - the mode line, the rules as sentences, the cap line and Recent routes, all
// owner-approved). Fixed is the cards, exactly as before, and a fresh install's answer. Auto lets the rules below pick the quick,
// standard or strong model by the job and how hard triage judged the work; each card stays its job's standard model. A rule is
// built from dropdowns over the values the router knows, never a typed condition, and its sentence is made from what it does.
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, MenuItem, Select, Switch, TextField, Typography } from "@mui/material";
import api from "./api";
import { BORDER, DIM, FAINT, INK, card, mono } from "./theme.jsx";
import { t } from "./i18n.js";
import { useLocale } from "./LocaleProvider.jsx";

const JOB = { triage: "triage", draft: "drafts", summary: "summaries", advisor: "the Advisor", memory: "memory", rank: "ranking",
  general: "general work", coding: "coding", judge: "judgements" };
const ruleWords = (r, locale) => {
  if (locale !== "zh-CN") return r.sentence;
  const w = r.when || {}, u = r.use || {};
  const jobs = { ...JOB, assistant: "the Assistant", quick_work: "quick general work", report: "reports" };
  const join = (xs) => xs.join("、");
  let who = `${join((w.difficulty || []).map((d) => ["quick", "standard", "hard"].includes(d) ? t(d) : d))}${join((w.job || []).map((j) => jobs[j] ? t(jobs[j]) : j)) || t("every job")}`;
  if (w.data_class?.length) who = t("{who} carrying {data} data", { who, data: join(w.data_class.map((d) => ["sensitive", "ordinary"].includes(d) ? t(d) : d)) });
  if (w.origin?.length) who = t("{who} written by {origin}", { who, origin: join(w.origin.map((o) => t(o === "stranger" ? "a stranger" : o === "owner" ? "you" : "people you trust"))) });
  if (w.person?.length) who = t("{who} with {people}", { who, people: join(w.person) });
  return u.escalate ? t("Unreadable or unsure answers from {who} -> ask the strong model once", { who })
    : u.only ? t("{who} -> only an AI whose card says it may read sensitive data", { who })
    : t("{who} -> {model}", { who, model: USE[u.tier] ? t(USE[u.tier]) : u.tier });
};
const warningWords = (warning) => {
  const match = /^Triage reads every message before it is judged, and (.+) is not marked to read sensitive data - mark it on its card, or sensitive mail is read by an AI your rule keeps from the rest of the work\.$/.exec(warning || "");
  return match ? t("Triage reads every message before it is judged, and {model} is not marked to read sensitive data - mark it on its card, or sensitive mail is read by an AI your rule keeps from the rest of the work.", { model: match[1] }) : warning;
};
const USE = { light: "the quick model", standard: "the card's own model", strong: "the strong model" };
const sel = { fontSize: 12.5, bgcolor: "#fff", minWidth: 150 };
const err = (e, d) => e?.response?.data?.detail || e?.message || { key: d };

export function RouteRules() {
  const locale = useLocale();
  const [p, setP] = useState(null);
  const [say, setSay] = useState("");
  const [add, setAdd] = useState({ job: "draft", difficulty: "hard", tier: "strong" });
  const [cap, setCap] = useState("");
  const load = useCallback(() => api.get("/api/ai/route_rules").then((r) => { setP(r.data); setCap(String(r.data.cap ?? "")); })
    // a server older than this page (or the public demo) has no router to show: the cards alone are the whole truth there
    .catch((e) => (e?.response?.status === 404 ? setP(false) : setSay(err(e, "could not read how jobs are routed")))), []);
  useEffect(() => { load(); }, [load]);
  const save = async (patch) => {
    try { setSay(""); const r = await api.post("/api/ai/route_rules", patch); setP(r.data); setCap(String(r.data.cap ?? "")); }
    catch (e) { setSay(err(e, "could not save that")); }
  };
  if (p === false) return null;
  if (!p) return say ? <Alert severity="warning" sx={{ mb: 1.5, fontSize: 12.5 }}>{typeof say === "object" ? t(say.key) : say}</Alert> : null;
  const auto = p.mode === "auto";
  const rules = p.rules || [];
  const put = (next) => save({ rules: next.map(({ sentence, ...r }) => r) });
  const addRule = () => {
    const id = `${add.difficulty === "any" ? "" : `${add.difficulty}-`}${add.job}-${add.tier}`;
    const when = { job: [add.job], ...(add.difficulty === "any" ? {} : { difficulty: [add.difficulty] }) };
    // a new rule goes FIRST: the first rule that sets a tier wins, and the owner's own word is the one meant to win
    put([{ id, when, use: { tier: add.tier }, on: true, by: "owner" }, ...rules.filter((r) => r.id !== id)]);
  };
  return (
    <Box data-tq-knob="ai_route_mode ai_route_strong_cap" data-tq-route-rules="" sx={{ ...card, p: 2, mb: 1.5, bgcolor: "#fff" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
        <Typography sx={{ color: INK, fontWeight: 600, fontSize: 14 }}>{t("Which AI does each job")}</Typography>
        <Select size="small" value={p.mode} onChange={(e) => save({ mode: e.target.value })} sx={sel} data-tq-route-mode="">
          <MenuItem value="fixed" sx={{ fontSize: 12.5 }}>{t("Fixed - the cards below")}</MenuItem>
          <MenuItem value="auto" sx={{ fontSize: 12.5 }}>{t("Auto - by how hard the work is")}</MenuItem>
        </Select>
      </Box>
      <Typography variant="caption" sx={{ color: FAINT, display: "block", mt: 0.5 }}>
        {auto ? t("Each card below is its job's standard model; these rules say when the quick or the strong model runs instead. A brain whose strong model box is blank never steps up, and an AI you pick for something always wins.")
          : t("Every job runs exactly as its card says. Auto picks a quick, standard or strong model by the job and how hard triage judged the work.")}
      </Typography>
      {say && <Alert severity="warning" sx={{ mt: 1, fontSize: 12.5 }}>{typeof say === "object" ? t(say.key) : say}</Alert>}
      {p.warning && <Alert severity="warning" sx={{ mt: 1, fontSize: 12.5 }} data-tq-route-warning="">{warningWords(p.warning)}</Alert>}
      {/* the DATA rules hold in either mode (a constraint, not a tier), so Fixed shows them too */}
      {!auto && !!rules.filter((r) => r.use?.only).length && (
        <Box sx={{ mt: 1.25, pt: 1, borderTop: `1px solid ${BORDER}` }}>
          {rules.filter((r) => r.use?.only).map((r) => (
            <Box key={r.id} data-tq-route-rule={r.id} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Switch size="small" checked={!!r.on} onChange={() => put(rules.map((x) => (x.id === r.id ? { ...x, on: !x.on } : x)))}
                inputProps={{ "aria-label": ruleWords(r, locale) }} />
              <Typography sx={{ fontSize: 12.5, color: r.on ? INK : FAINT, flex: 1 }}>{ruleWords(r, locale)}</Typography>
            </Box>
          ))}
        </Box>
      )}
      {auto && (
        <Box sx={{ mt: 1.25, pt: 1, borderTop: `1px solid ${BORDER}` }}>
          {rules.map((r) => (
            <Box key={r.id} data-tq-route-rule={r.id} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Switch size="small" checked={!!r.on} onChange={() => put(rules.map((x) => (x.id === r.id ? { ...x, on: !x.on } : x)))}
                inputProps={{ "aria-label": ruleWords(r, locale) }} />
              <Typography sx={{ fontSize: 12.5, color: r.on ? INK : FAINT, flex: 1 }}>{ruleWords(r, locale)}</Typography>
              {r.by === "owner" && (
                <Typography component="button" type="button" variant="caption" onClick={() => put(rules.filter((x) => x.id !== r.id))}
                  sx={{ border: 0, background: "none", p: 0, font: "inherit", color: "#55697a", cursor: "pointer", "&:hover": { textDecoration: "underline" } }}>
                  {t("remove")}</Typography>
              )}
            </Box>
          ))}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mt: 1 }} data-tq-route-add="">
            <Select size="small" value={add.difficulty} onChange={(e) => setAdd({ ...add, difficulty: e.target.value })} sx={{ ...sel, minWidth: 110 }}>
              <MenuItem value="any" sx={{ fontSize: 12.5 }}>{t("Any")}</MenuItem>
              {(p.difficulties || []).map((d) => <MenuItem key={d} value={d} sx={{ fontSize: 12.5 }}>{["quick", "standard", "hard"].includes(d) ? t(d[0].toUpperCase() + d.slice(1)) : d[0].toUpperCase() + d.slice(1)}</MenuItem>)}
            </Select>
            <Select size="small" value={add.job} onChange={(e) => setAdd({ ...add, job: e.target.value })} sx={sel}>
              {Object.entries(JOB).map(([k, v]) => <MenuItem key={k} value={k} sx={{ fontSize: 12.5 }}>{t(v)}</MenuItem>)}
            </Select>
            <Typography sx={{ fontSize: 12.5, color: DIM }}>-&gt;</Typography>
            <Select size="small" value={add.tier} onChange={(e) => setAdd({ ...add, tier: e.target.value })} sx={sel}>
              {Object.entries(USE).map(([k, v]) => <MenuItem key={k} value={k} sx={{ fontSize: 12.5 }}>{t(v)}</MenuItem>)}
            </Select>
            <Button size="small" variant="outlined" onClick={addRule} sx={{ fontSize: 12.5, textTransform: "none" }}>{t("Add the rule")}</Button>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mt: 1.25 }}>
            <Typography sx={{ fontSize: 12.5, color: DIM }}>{t("At most")}</Typography>
            <TextField size="small" value={cap} placeholder={t("no cap")} onChange={(e) => setCap(e.target.value)}
              onBlur={() => cap !== String(p.cap ?? "") && save({ cap })} inputProps={{ "aria-label": t("strong calls a day"), "data-tq-route-cap": "" }}
              sx={{ width: 90, bgcolor: "#fff" }} />
            <Typography sx={{ fontSize: 12.5, color: DIM }}>{t("strong calls a day; used today: {count}", { count: p.used_today })}</Typography>
          </Box>
        </Box>
      )}
    </Box>
  );
}

// RECENT ROUTES: the last twenty AI calls, one line each - which job, which task, which tier on which brain, and why. Read-only.
export function RecentRoutes() {
  const locale = useLocale();
  const [rows, setRows] = useState(null);
  useEffect(() => { api.get("/api/ai/routes").then((r) => setRows(r.data.routes || [])).catch(() => setRows([])); }, []);
  if (!rows?.length) return null;
  return (
    <Box data-tq-recent-routes="" sx={{ ...card, p: 2, mb: 1.5, bgcolor: "#fff" }}>
      <Typography variant="caption" sx={{ color: FAINT, fontWeight: 600, display: "block", mb: 0.5 }}>{t("RECENT ROUTES")}</Typography>
      {rows.map((r) => (
        <Typography key={r.Id} sx={{ ...mono, fontSize: 11.5, color: INK, whiteSpace: "pre-wrap" }} title={r.Outcome && r.Outcome !== "ok" ? r.Outcome : undefined}>
          {[locale === "zh-CN" && ["triage", "draft", "summary", "advisor", "memory", "rank", "assistant", "general", "coding", "quick_work", "judge", "report"].includes(r.Job) ? t(r.Job) : r.Job, r.ref,
            `${locale === "zh-CN" && ["light", "standard", "strong"].includes(r.Tier) ? t(r.Tier) : r.Tier} -> ${r.brain}${r.Model ? `, ${r.Model}` : ""}`].filter(Boolean).join(" · ")}
          <Typography component="span" sx={{ ...mono, fontSize: 11.5, color: FAINT }}> · {r.Why}</Typography>
        </Typography>
      ))}
    </Box>
  );
}
