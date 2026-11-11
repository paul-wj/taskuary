import React, { useState } from "react";
import api from "./api.js";
import { describe, isLive, liveProposal, pickingRepo } from "./proposalCard.js";
import { RepoPicker } from "./RepoPicker.jsx";
import { t } from "./i18n.js";
import { useLocale } from "./LocaleProvider.jsx";
import { CHOICES, VERBS, choice, label as buttonLabel } from "./buttons.js";
import { repoLabel } from "./repoNames.js";

// The confirmation box (PW-123): what will happen, on what, with which parameters - and one specifically
// labelled button that submits the structured proposal. Cancel leaves everything where it is. A card
// read back from history carries no version, so it shows what was proposed and offers nothing.
// an answer as a button that DOES it: "A coding agent" -> "Send to a coding agent"; an answer that is already a verb stays as it is
export const altLabel = (l) => (/^an? /i.test(l) ? `Send to ${l.charAt(0).toLowerCase()}${l.slice(1)}` : l);

export default function ProposalCard({ p: given, onConfirm, onCancel, onPreview }) {
  useLocale();
  const [peek, setPeek] = useState(null);
  // THE CARD'S OWN QUESTION (2026-09-25): Not ours asks how far, Send to agent asks which agent. Another answer
  // is a new proposal from the same road, shown in place - nothing runs until the confirm button.
  const [own, setOwn] = useState(null);
  const p = liveProposal(given, own);
  const [repo, setRepo] = useState(given?.params?.repo || "");
  if (!p) return null;
  // a newer proposal of the card's own carries the one it replaces, so the parent's copy - and its status - follows it
  const up = (q) => (q && given && q.id !== given.id ? { ...q, replaces: given.id } : q);
  const d = describe(p);
  const knownLabel = p.verb && p.label === VERBS[p.verb]?.label ? buttonLabel(p.verb) : null;
  const answerLabel = (a) => {
    const group = ["agent", "not_ours", "idea"].find((g) => CHOICES[g]?.some(([verb, word]) => verb === a.verb && word === a.label));
    if (!group) return altLabel(a.label);
    if (group === "agent") return t(a.verb === "coding_agent" ? "Send to a coding agent" : "Send to an agent");
    return choice(group, a.verb);
  };
  // A CHECKOUT NOBODY NAMED IS CHOSEN HERE, before Start: the dropdown holds every repository, the words' best
  // guess preselected, and Start waits until one is chosen. The card used to say "you pick it when it starts" and
  // the start then guessed on its own (the owner, 2026-09-24: "it should be dropdown to choose repo if it's not clear")
  const open = isLive(p);
  const picking = pickingRepo(p);
  // THE ANSWERS ARE THE BUTTONS (the owner, 2026-10-01: "what are these buttons? it's confusing"): a card that asks its own
  // question drew its answers as pills - the proposed one filled, as if already pressed - and then a separate confirm under
  // them. Now each answer confirms in one press; only a repository still to choose keeps a confirm of its own.
  const asks = open && !!p.alts?.length;
  const rows = (picking ? d.params.filter(([k]) => k !== "repository") : d.params).filter(([k]) => !(asks && k === "verb"));
  const confirm = async () => {
    if (!picking || repo === (p.params?.repo || "")) return onConfirm?.(up(p));
    try {
      const { data } = await api.patch(`/api/operations/${p.id}`, { params: { ...p.params, repo } });
      return onConfirm?.(up({ ...p, version: data.version, params: data.params }));
    } catch (e) { setPeek(e?.response?.data?.detail || e?.message ? { error: e?.response?.data?.detail || e.message } : { errorKey: "the repository could not be set" }); }
  };
  const choose = async (a) => {
    if (a.current) return confirm();
    try {
      const { data } = await api.post("/api/concierge/propose", { verb: a.verb, key: p.key, table: !!p.settles, exact: true });
      setOwn(data); setRepo(data?.params?.repo || ""); setPeek(null);
      if (!pickingRepo(data)) onConfirm?.(up(data));       // a checkout still to choose waits for its picker and Start
    } catch (e) { setPeek({ ...(e?.response?.data?.detail || e?.message ? { error: e?.response?.data?.detail || e.message } : { errorKey: "that answer is not available here" }), pick: true }); }
  };
  const preview = async () => {
    setPeek({ busy: true });
    try { setPeek(await onPreview?.(p)); } catch (e) { setPeek(e?.response?.data?.detail || e?.message ? { error: e?.response?.data?.detail || e.message } : { errorKey: "the dry run failed" }); }
  };
  const askRepo = p.status === "error" && p.repo?.taskId;      // a decision, not a failure: choose, then the same confirmation runs again (PW-135)
  const state = { done: t("Confirmed."), cancelled: t("Cancelled."), stale: t("Out of date - nothing moved."), error: t("Failed - nothing moved.") }[p.status] || "";
  return (
    <div className="tq-proposal" style={{ border: "1px solid var(--tq-border, #d8d1c5)", borderRadius: 12, padding: "10px 12px", marginTop: 6, background: "var(--tq-panel, #fffdfb)" }}>
      <div style={{ fontWeight: 600, fontSize: 12.5, color: "var(--tq-link, #41525f)" }}>{knownLabel || d.title}</div>
      {d.target && <div style={{ fontSize: 12, color: "var(--tq-link, #55697a)", marginTop: 2 }}>{d.target}</div>}
      {d.detail && (d.detailHead
        ? <div className="tq-proposal-section" style={{ marginTop: 8, padding: "6px 9px", borderRadius: 8, background: "var(--tq-panel, #f6f2ec)" }}>
            <div style={{ fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--tq-warning, #8a8276)", fontWeight: 600 }}>{d.detailHead}</div>
            <div style={{ fontSize: 12, color: "var(--tq-link, #3d4a55)", marginTop: 2, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{d.detail}</div>
          </div>
        : <div style={{ fontSize: 12, color: "var(--tq-link, #3d4a55)", marginTop: 4, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{d.detail}</div>)}
      {!!rows.length && (
        <div style={{ fontSize: 11.5, color: "var(--tq-warning, #6b6459)", marginTop: 4 }}>
          {rows.map(([k, v]) => <div key={k}><span style={{ fontWeight: 600 }}>{["agent", "repository", "reads", "runs", "reaches you", "goes to"].includes(k) ? t(k) : k}:</span> {String(v)}</div>)}
        </div>
      )}
      {asks && (
        <div className="tq-alts" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {p.alts.map((a) => (
            <button key={a.verb} type="button" className={`tq-chip${a.current ? " primary" : ""}`} disabled={a.current && picking && !repo}
              title={a.current ? t("the one proposed") : undefined} onClick={() => choose(a)}>{answerLabel(a)}</button>
          ))}
          {!picking && <button type="button" className="tq-chip" onClick={() => onCancel?.(up(p))}>{t(d.cancel)}</button>}
        </div>
      )}
      {picking && open && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: "var(--tq-warning, #6b6459)", marginTop: 6 }}>
          <span style={{ fontWeight: 600 }}>{t("repository:")}</span>
          <select className="tq-repo-pick" value={repo} onChange={(e) => setRepo(e.target.value)}
            style={{ fontSize: 12, padding: "3px 6px", borderRadius: 6, border: "1px solid var(--tq-border, #d8d1c5)", background: "var(--tq-panel, #fff)", color: "var(--tq-link, #3d4a55)" }}>
            {!repo && <option value="">{t("choose a repository…")}</option>}
            {p.repo_choices.map((r) => <option key={r} value={r}>{repoLabel(r)}{r === p.params?.repo ? t(" (best guess)") : ""}</option>)}
          </select>
        </label>
      )}
      {peek && !peek.busy && (
        <div style={{ fontSize: 11.5, color: "var(--tq-link, #55697a)", marginTop: 6, whiteSpace: "pre-wrap" }}>
          {peek.error || peek.errorKey ? (peek.pick ? (peek.error || t(peek.errorKey)) : t("Dry run: {error}", { error: peek.error || t(peek.errorKey) })) : t("Dry run - {headline}\n{summary}", { headline: peek.headline || "", summary: peek.summary || "" })}
        </div>
      )}
      {p.status === "done" && p.outcome?.link && <div style={{ marginTop: 6 }}><a href={p.outcome.link} style={{ fontSize: 12, color: "var(--tq-link, #55697a)" }}>{t("Open it")}</a></div>}
      {askRepo ? (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 12, color: "var(--tq-link, #41525f)" }}>{t("Which repository should the coding agent use?")}</div>
          <RepoPicker taskId={p.repo.taskId} agent={p.repo.agent} onDone={(data) => { if (data?.repo) onConfirm?.(p); }} />
          <button type="button" className="tq-chip" onClick={() => onCancel?.(up(p))}>{t("Not now")}</button>
        </div>
      ) : open && !(asks && !picking) ? (
        <div className="tq-options" style={{ marginTop: 8 }}>
          <button type="button" className="tq-chip primary" disabled={picking && !repo} onClick={confirm}>{knownLabel || d.confirm}</button>
          {d.preview && <button type="button" className="tq-chip" disabled={!!peek?.busy} onClick={preview}>{peek?.busy ? t("Running…") : t("Preview")}</button>}
          <button type="button" className="tq-chip" onClick={() => onCancel?.(up(p))}>{t(d.cancel)}</button>
        </div>
      ) : (state ? <div style={{ fontSize: 11.5, color: "var(--tq-warning, #8a8276)", marginTop: 6 }}>{state}</div> : null)}
    </div>
  );
}
