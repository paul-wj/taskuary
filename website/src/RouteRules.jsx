// WHICH AI DOES EACH JOB (the router, 2026-10-25 - the mode line, the rules as sentences, the cap line and Recent routes, all
// owner-approved). Auto is the default (the owner, 2026-11-06): the rules below pick the quick, standard or strong model by the job
// and how hard triage judged the work, each card stays its job's standard model, and a brain with one model thinks less or harder
// instead where it can. Fixed is the cards, exactly as before. A rule is
// built from dropdowns over the values the router knows, never a typed condition, and its sentence is made from what it does.
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Autocomplete, Box, Button, MenuItem, Select, Switch, TextField, Typography } from "@mui/material";
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
// triage's three judgements, in the words a person uses for them
const LEVEL = { quick: "Quick", standard: "Normal", hard: "Hard" };
export const SAYS = "Triage judges each task quick, normal or hard and picks the model for it: quick work runs on a smaller model, "
  + "hard work on a stronger one. An AI with only one model thinks less or harder instead, where it can.";
const sel = { fontSize: 12.5, bgcolor: "var(--tq-panel, #fff)", minWidth: 150 };
const err = (e, d) => e?.response?.data?.detail || e?.message || { key: d };
// AN AI PER LEVEL (the owner, 2026-11-06: "not by default but you can adjust in settings"): for the agents' work only - general work,
// quick work, and coding on a CLI. Blank is the card's AI; set, that level runs on the AI named here when it can take the call.
const LEVELS = [["quick", "Quick"], ["normal", "Normal"], ["hard", "Hard"]];
export const CARDS = "the card's AI";

function LevelModel({ value, models, disabled, onSave }) {
  const [v, setV] = useState(value || "");
  useEffect(() => setV(value || ""), [value]);
  const commit = (next) => (next || "") !== (value || "") && onSave(next || "");
  return (
    <Autocomplete freeSolo forcePopupIcon openOnFocus size="small" options={models || []} value={v} disabled={disabled}
      onInputChange={(_e, next) => setV(next)} onChange={(_e, next) => { setV(next || ""); commit(next); }} onBlur={() => commit(v)}
      sx={{ minWidth: 170 }} renderInput={(p) => <TextField {...p} placeholder={t("its own model")} sx={{ bgcolor: "var(--tq-panel, #fff)" }}
        inputProps={{ ...p.inputProps, style: { fontSize: 12.5 } }} />} />
  );
}

function ByLevel({ p, save }) {
  const by = p.by_level || {}, brains = p.brains || [];
  const put = (lvl, patch) => {
    const next = { ...by, [lvl]: { pick: "", model: "", ...by[lvl], ...patch } };
    save({ by_level: Object.fromEntries(Object.entries(next).filter(([, x]) => x.pick)) });
  };
  return (
    <Box sx={{ mt: 1.25, pt: 1, borderTop: `1px solid ${BORDER}` }} data-tq-knob="ai_route_brain_by_level" data-tq-route-by-level="">
      <Typography sx={{ fontSize: 12.5, color: INK, fontWeight: 600 }}>{t("Which AI for each level")}</Typography>
      <Typography variant="caption" sx={{ color: FAINT, display: "block", mb: 0.75 }}>
        {t("For agents' work: general work, quick work, and coding on a CLI. Triage, drafting and the Assistant keep their cards. An AI that can't take the work (not connected, resting on its limit, not marked for sensitive data) leaves it on the card.")}
      </Typography>
      {LEVELS.map(([lvl, word]) => {
        const cur = by[lvl] || {}, b = brains.find((x) => x.pick === cur.pick);
        return (
          <Box key={lvl} sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 0.75 }} data-tq-route-by-level-row={lvl}>
            <Typography sx={{ fontSize: 12.5, color: DIM, width: 56 }}>{t(word)}</Typography>
            <Select size="small" displayEmpty value={cur.pick || ""} onChange={(e) => put(lvl, { pick: e.target.value, model: "" })}
              sx={{ ...sel, minWidth: 220 }} inputProps={{ "aria-label": t("{word} work runs on", { word }) }}>
              <MenuItem value="" sx={{ fontSize: 12.5 }}>{t(CARDS)}</MenuItem>
              {brains.map((x) => (
                <MenuItem key={x.pick} value={x.pick} sx={{ fontSize: 12.5 }}>{x.label}{x.cli ? "" : t(" - not for coding")}</MenuItem>
              ))}
              {cur.pick && !b && <MenuItem value={cur.pick} sx={{ fontSize: 12.5 }}>{cur.pick} {t("(not connected)")}</MenuItem>}
            </Select>
            <LevelModel value={cur.model} models={b?.models} disabled={!cur.pick} onSave={(model) => put(lvl, { model })} />
          </Box>
        );
      })}
    </Box>
  );
}

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
    <Box data-tq-knob="ai_route_mode ai_route_strong_cap" data-tq-route-rules="" sx={{ ...card, p: 2, mb: 1.5, bgcolor: "var(--tq-panel, #fff)" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
        <Typography sx={{ color: INK, fontWeight: 600, fontSize: 14 }}>{t("Which AI does each job")}</Typography>
        <Select size="small" value={p.mode} onChange={(e) => save({ mode: e.target.value })} sx={sel} data-tq-route-mode="">
          <MenuItem value="fixed" sx={{ fontSize: 12.5 }}>{t("Fixed - the cards below")}</MenuItem>
          <MenuItem value="auto" sx={{ fontSize: 12.5 }}>{t("Auto - by how hard the work is")}</MenuItem>
        </Select>
      </Box>
      <Typography variant="caption" sx={{ color: FAINT, display: "block", mt: 0.5 }}>
        {auto ? `${t(SAYS)} ${t("An AI you pick for something always wins.")}`
          : t("Every job runs exactly as its card says. Auto lets triage judge each task quick, normal or hard and pick the model for it.")}
      </Typography>
      {auto && !!(p.levels || []).length && (
        <Box sx={{ mt: 1 }} data-tq-route-levels="">
          {p.levels.map((l) => (
            <Typography key={l.pick} sx={{ fontSize: 12.5, color: DIM }} data-tq-route-level={l.pick}>
              <Box component="span" sx={{ color: INK, fontWeight: 600 }}>{l.brain}</Box>
              {` · ${t("quick")}: ${l.quick} · ${t("normal")}: ${l.normal} · ${t("hard")}: ${l.hard}`}
            </Typography>
          ))}
        </Box>
      )}
      {auto && <ByLevel p={p} save={save} />}
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
                  sx={{ border: 0, background: "none", p: 0, font: "inherit", color: "var(--tq-link, #55697a)", cursor: "pointer", "&:hover": { textDecoration: "underline" } }}>
                  {t("remove")}</Typography>
              )}
            </Box>
          ))}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mt: 1 }} data-tq-route-add="">
            <Select size="small" value={add.difficulty} onChange={(e) => setAdd({ ...add, difficulty: e.target.value })} sx={{ ...sel, minWidth: 110 }}>
              <MenuItem value="any" sx={{ fontSize: 12.5 }}>{t("Any")}</MenuItem>
              {(p.difficulties || []).map((d) => <MenuItem key={d} value={d} sx={{ fontSize: 12.5 }}>{LEVEL[d] ? t(LEVEL[d]) : d}</MenuItem>)}
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
              sx={{ width: 90, bgcolor: "var(--tq-panel, #fff)" }} />
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
    <Box data-tq-recent-routes="" sx={{ ...card, p: 2, mb: 1.5, bgcolor: "var(--tq-panel, #fff)" }}>
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
