// Board: the agent kanban - every task as a card in a status column. Some cards arrive
// from triage, some you start yourself; click a card to open the task (where you can message the agent
// working it). No drag-and-drop: dragging between columns changed status behind every other rule, so a
// card "moved to Done" skipped Mark done (the owner, 2026-09-24: "remove that feature"). House design.
import { says, subState } from "./laneSays.js";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogContent,
  DialogTitle, MenuItem, Select, Switch, TextField, Tooltip, Typography,
} from "@mui/material";
import { ButtonBar } from "./ButtonBar.jsx";
import ViewKanbanIcon from "@mui/icons-material/ViewKanban";
import WallView from "./WallView.jsx";
import GridViewIcon from "@mui/icons-material/GridView";
import ForumIcon from "@mui/icons-material/Forum";
import AddIcon from "@mui/icons-material/Add";
import api from "./api";
import { t as tr } from "./i18n.js";
import { useLocale } from "./LocaleProvider.jsx";
import { durSince } from "./timeWords.js";
import AgentWall from "./AgentWall.jsx";
import NewSheet from "./NewSheet.jsx";
import { agentName, saidOf } from "./agentWork.js";
import { isAgentKind, isGeneralKind } from "./autostart.js";
import { onLive } from "./live.js";
import { ALERT, GRADIENT, PANEL, PANEL2, BORDER, CATPPUCCIN, DIM, FAINT, INK, ROLES, card, hoverable, mono } from "./theme.jsx";
import { ChannelIcon, ActionChip, useAgents, codingAgent, timeAgo, Empty, IDLE_WAITING, isWaiting, TellAgent, WorkPane, TaskuaryMark, assignedAgent } from "./ui.jsx";
import { AGENT } from "./taskLifecycle.js";
import QueuedStart from "./QueuedStart.jsx";
import { label } from "./buttons.js";
import { LANE_META, KIND_META } from "./funnelPile.js";
import { remindWaiting } from "./taskFilter.js";
import { AGENT_SHOWN, shownAgent } from "./kinds.js";

// Not every ask is about a codebase - "what does this policy mean", "draft me a note", "prepare
// me for this meeting". The task carries `repo:none`, which is the one answer the picker could
// never give before: with the field left blank Taskuary still GUESSED a checkout, so a general
// question opened in whichever repo scored highest and the agent went looking for code to change.

// "coding · running" says nothing you can act on. How long it has been going, and what it is
// touching right now, is what tells you whether to leave it alone or go look.
const elapsed = (since) => (since ? durSince(since) : "");

const repoOf = (t) => (String(t?.Tags || "").match(/repo:([^\s,]+)/) || [])[1] || null;

// WHICH agent is on the card, said out loud; its underlying CLI only chooses the hue.
const AGENT_HUES = { claude: "#7d9a7c", codex: "#6f8a6e", gemini: "#55697a",
                     cursor: "#6f8a6e", copilot: "#8a8276" };
// the board speaks CLI names (claude, codex, gemini), a path or an .exe read as the CLI it is
export const cliName = (name) =>
  String(name || "").split(/[\\/]/).pop().replace(/\.(cmd|exe|bat|ps1)$/i, "").toLowerCase();

const agentBadge = (name, runStatus, isLive) => {
  if (!isLive && runStatus !== "running") return null;
  const cmd = cliName(name);
  const hit = Object.entries(AGENT_HUES).find(([k]) => cmd.includes(k));
  if (!name) return null;
  return { word: String(name), cli: cmd, color: hit?.[1] || "var(--tq-warning, #867f74)" };
};

// A card's peephole into the running agent: the last couple of console lines, live - and the
// blackboard line above them: the files THIS agent has modified so far (git-attributed, so it
// is true even when the agent never says so). Every other agent is told the same list.
const basename = (f) => String(f).split(/[\\/]/).pop();
export const FileChips = ({ files }) => (files || []).length === 0 ? null : (
  <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.5, mb: 0.5 }}>
    {files.slice(0, 4).map((f) => (
      <Tooltip key={f} title={f} arrow>
        <Typography variant="caption" sx={{ ...mono, fontSize: 10, lineHeight: "16px", px: 0.6,
          color: CATPPUCCIN.green, border: `1px solid ${CATPPUCCIN.surface}`, borderRadius: 0.75 }}>
          ✎ {basename(f)}
        </Typography>
      </Tooltip>
    ))}
    {files.length > 4 && (
      <Tooltip title={files.slice(4).map(basename).join(", ")} arrow>
        <Typography variant="caption" sx={{ ...mono, fontSize: 10, color: CATPPUCCIN.dim }}>+{files.length - 4}</Typography>
      </Tooltip>
    )}
  </Box>
);

// A CHAT on the board was drawn as a console: a black pane of "assistant> ... you>" with the
// question truncated mid-word, under a shell prompt nobody types into, on a card whose whole news
// IS what it asked (the owner, 2026-09-08: "assistant still looks like coding cli?"). A
// conversation's peephole is its words.
const ChatTail = ({ run, name }) => {
  useLocale();
  const waiting = run.kind === "session" && isWaiting(run);
  const said = saidOf(run);
  return (
    <Box sx={{ mt: 0.7 }}>
      <Typography sx={{ ...mono, fontSize: 9, letterSpacing: ".11em", textTransform: "uppercase", color: FAINT }}>
        {waiting ? says(subState(run), name) : tr("{name} is working", { name })}
      </Typography>
      {said && <Typography sx={{ color: INK, fontSize: 11.5, lineHeight: 1.45, mt: 0.2,
        display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{said}</Typography>}
      {!said && <Typography sx={{ color: FAINT, fontSize: 11.5, mt: 0.2 }}>
        {tr(waiting ? "It is waiting on your answer." : "Working on it.")}</Typography>}
    </Box>
  );
};

const LiveTail = ({ run, chat, name }) => {
  useLocale();
  const waiting = run.kind === "session" && isWaiting(run);
  if (chat) return <ChatTail run={run} name={name} />;
  // a session reports what the agent HOLDS (ui.WorkPane); the raw-tail pane below stays only for
  // a run with no witness at all
  if (run.work || run.promptPending) return <WorkPane run={run} />;
  return (
  <Box sx={{ mt: 0.6, bgcolor: CATPPUCCIN.bg, border: `1px solid ${CATPPUCCIN.surface}`, borderRadius: 1.25, px: 0.85, py: 0.5 }}>
    <FileChips files={run.files} />
    {(run.tail || []).slice(-2).map((l, i, all) => (
      <Typography key={i} noWrap variant="caption"
        sx={{ ...mono, display: "block", fontSize: 9.5, lineHeight: 1.5,
          color: l.startsWith("→") ? CATPPUCCIN.blue : l.startsWith("✗") ? CATPPUCCIN.red : CATPPUCCIN.dim,
          opacity: i === all.length - 1 ? 1 : 0.55 }}>
        {l.replace(/\n/g, " ")}
      </Typography>
    ))}
    <Typography variant="caption" sx={{ ...mono, fontSize: 9.5, color: waiting ? CATPPUCCIN.yellow : CATPPUCCIN.cyan,
      ...(waiting ? {} : { "@keyframes tqBlink": { "50%": { opacity: 0.25 } }, animation: "tqBlink 1.1s step-end infinite" }) }}>
      {waiting ? `⏸ ${run.line || says(subState(run), shownAgent(run))}`
        : `▮ ${tr("{name} working {elapsed}", { name: shownAgent(run), elapsed: elapsed(run.StartedAt) })}`}
    </Typography>
  </Box>
  );
};

// What one agent left for the next. The note was already written and already re-seeded into
// the next agent's prompt - the owner just could never SEE it, so the board could not answer
// "what did the last one work out?". A chip on the card, the whole thing in a dialog.
const NOTE_FIELDS = ["found", "did", "next"];
const noteBody = (n) => String(n || "").replace(/^HANDOVER NOTE\s*/i, "").trim();

const NoteChip = ({ onOpen }) => {
  useLocale();
  return <Tooltip arrow title={tr("what this agent left for whoever picks the task up next")}>
    <Box onClick={(e) => { e.stopPropagation(); onOpen(); }}
      sx={{ display: "inline-flex", alignItems: "center", gap: 0.3, px: 0.6, height: 16,
        borderRadius: 0.75, bgcolor: "var(--tq-inset, #e3e6e1)", border: "1px solid var(--tq-border, #d2d6cf)", cursor: "pointer",
        "&:hover": { bgcolor: "var(--tq-inset, #d2d6cf)" } }}>
      <Typography sx={{ color: ROLES.working.ink, fontWeight: 600, fontSize: 8.5, letterSpacing: ".05em" }}>
        ✎ {tr("NOTE")}
      </Typography>
    </Box>
  </Tooltip>;
};

// found / did / next as sections, each with its own colour and icon so the eye can jump
// straight to "the next step" - plus the files git says that agent actually touched, which
// is the other half of the handover (the note tells you the thinking, the files tell you
// the blast radius). Anything the agent wrote outside the found/did/next shape is shown
// verbatim rather than dropped: a note we cannot parse is still the note it left.
const SECTION = {
  found: { title: "WHAT IT WORKED OUT", icon: "🔍", fg: "var(--tq-success, #6f8a6e)", bg: "var(--tq-inset, #e3e6e1)", bd: "var(--tq-border, #d2d6cf)" },
  did: { title: "WHAT IT ALREADY CHANGED", icon: "✓", fg: "var(--tq-success, #47654a)", bg: "var(--tq-inset, #dfeade)", bd: "var(--tq-border, #c8d9c7)" },
  next: { title: "THE NEXT STEP", icon: "→", fg: "var(--tq-link, #55697a)", bg: "var(--tq-inset, #eae4d8)", bd: "var(--tq-border, #d8cfbe)" },
};

const NoteDialog = ({ open, task, onClose }) => {
  useLocale();
  const body = noteBody(task?.HandoverNote);
  const [proof, setProof] = useState(null);
  useEffect(() => {
    setProof(null);
    if (!open || !task?.TaskId) return;
    api.get(`/api/tasks/${task.TaskId}/proof`).then(({ data }) => setProof(data)).catch(() => {});
  }, [open, task?.TaskId]);
  const secs = NOTE_FIELDS.map((k) => {
    const m = body.match(new RegExp(`^\\s*${k}\\s*:\\s*([\\s\\S]*?)(?=^\\s*(?:${NOTE_FIELDS.join("|")})\\s*:|$)`, "im"));
    return [k, (m?.[1] || "").trim()];
  }).filter(([, v]) => v);
  const files = proof?.files || [];
  return (
    <Dialog open={!!open} onClose={onClose} maxWidth="sm" fullWidth
      PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontSize: 14.5, pb: 0.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography sx={{ ...mono, color: "var(--tq-link, #55697a)", fontWeight: 600, fontSize: 12 }}>{task?.ref}</Typography>
          <Typography sx={{ color: INK, fontWeight: 600, fontSize: 14 }}>{tr("the handover note")}</Typography>
        </Box>
        <Typography variant="caption" sx={{ color: FAINT, display: "block", fontWeight: 400, mt: 0.25 }}>
          {tr("Written when this session paused — and this is the same text the next agent is seeded with, so what you read here is what it will know.")}
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ pb: 1 }}>
        {!body && <Empty>{tr("No note on this task.")}</Empty>}
        {secs.length ? secs.map(([k, v]) => (
          <Box key={k} sx={{ mb: 1, px: 1.25, py: 0.9, bgcolor: SECTION[k].bg,
            border: `1px solid ${SECTION[k].bd}`, borderRadius: 2 }}>
            <Typography variant="caption" sx={{ color: SECTION[k].fg, fontWeight: 600, fontSize: 9.5,
              letterSpacing: ".08em", display: "block", mb: 0.35 }}>
              {SECTION[k].icon} {tr(SECTION[k].title)}
            </Typography>
            <Typography variant="body2" sx={{ color: INK, whiteSpace: "pre-wrap", fontSize: 12.5, lineHeight: 1.55 }}>{v}</Typography>
          </Box>
        )) : body && (
          <Typography variant="body2" sx={{ color: INK, whiteSpace: "pre-wrap", fontSize: 12.5 }}>{body}</Typography>
        )}
        {/* the note is the agent's account of itself; this is git's */}
        {files.length > 0 && (
          <Box sx={{ mt: 1.5 }}>
            <Typography variant="caption" sx={{ color: ROLES.working.ink, fontWeight: 600, fontSize: 9.5,
              letterSpacing: ".08em", display: "block", mb: 0.5 }}>
              ✎ {tr("FILES IT TOUCHED — {count}, per git", { count: files.length })}
            </Typography>
            <Box sx={{ maxHeight: 168, overflowY: "auto", border: `1px solid ${BORDER}`, borderRadius: 2 }}>
              {files.map((f, i) => (
                <Box key={f.path} sx={{ display: "flex", gap: 1, alignItems: "baseline", px: 1, py: 0.45,
                  borderTop: i ? `1px solid ${BORDER}` : "none" }}>
                  <Typography sx={{ ...mono, color: INK, fontSize: 10.5, flex: 1, minWidth: 0 }} noWrap
                    title={f.path}>{f.path}</Typography>
                  <Typography sx={{ ...mono, color: "var(--tq-success, #47654a)", fontSize: 10 }}>+{f.added}</Typography>
                  <Typography sx={{ ...mono, color: "var(--tq-danger, #6b2733)", fontSize: 10 }}>−{f.removed}</Typography>
                </Box>
              ))}
            </Box>
          </Box>
        )}
        {proof && !files.length && (
          <Typography variant="caption" sx={{ color: FAINT, display: "block", mt: 1.5 }}>
            {tr("No file changes recorded yet — the agent may have only read, or not committed.")}
          </Typography>
        )}
      </DialogContent>
      <ButtonBar><Button onClick={onClose}>{tr("Close")}</Button></ButtonBar>
    </Dialog>
  );
};

// WHERE A CARD SITS IS THE TASK'S STATE (T2, T8, T9, the owner, 2026-09-25: "everything should be the task list and
// the board just follows whatever is going on there"). The server decides it once (taskstate.py) and the Tasks list
// draws the same field; this board used to decide again in the browser, from its own facts, and the two disagreed.
// Its columns are the agent's states, in lanes.json's words: "Queued" held waiting-to-start, stopped, saved and
// Taskuary-closed alike, and "Waiting on you" held an asking agent, a drafted reply and a task waiting on somebody else.
// ...a new sender's held task stands with them, in its own word on the card (taskstate, 2026-11-17)
const COLUMN_OF = { queued: "queued", held: "queued", working: "working", blocked: "blocked", saved: "left", stopped: "left",
  agentdone: "agentdone", approve: "agentdone" };
const laneOf = (t) => COLUMN_OF[t.State] || null;

// Finished work defaults to today; the board can also load its full history.
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
// a run's status in the agent vocabulary the rest of the app speaks (taskLifecycle.AGENT)
const RUN_WORD = { running: AGENT.working, stopped: AGENT.stopped, failed: AGENT.stopped, error: AGENT.stopped };
const COLS = [
  { key: "queued", meta: LANE_META.queued, dot: "#867f74" },
  { key: "working", meta: LANE_META.working, dot: "#6f8a6e" },
  { key: "blocked", meta: LANE_META.blocked, dot: ALERT },
  // ...one name for both lanes it holds (the owner, 2026-10-28): "stopped and saved · agent stopped" wrapped to two lines at 1366px - a
  // session ended by you is an agent stopped too
  { key: "left", meta: LANE_META.stopped, dot: "#a09787" },
  { key: "agentdone", meta: KIND_META.agentdone, dot: "#47654a" },
];

// ...and the column of agents waiting on the owner says "agent ready for you" for chat tasks (the owner, 2026-11-05: their next move can be any
// action - railStatus.chatReady): its own words come back only while a coding task is in it, which keeps them
const titleOf = (col, cards) => (col.key === "blocked" && !cards.some((t) => !isGeneralKind(t.Kind))
  ? `${KIND_META.chat_ready.mark} ${tr(KIND_META.chat_ready.word)}` : `${col.meta.mark} ${tr(col.meta.word)}`);

export default function BoardView({ onOpenTask, active = true }) {
  useLocale();
  const [tasks, setTasks] = useState(null);
  const [err, setErr] = useState("");
  const [view, setView] = useState("columns");   // columns | wall - the Studio's office is the Game's now (2026-10-15)
  const [finishedRange, setFinishedRange] = useState("today");
  const loadId = useRef(0);
  const [boardTick, setBoardTick] = useState(0); // bumped when a session starts here: the active board view reloads at once
  const [newOpen, setNewOpen] = useState(false);
  const [noteFor, setNoteFor] = useState(null);   // the task whose handover note is open
  const [feedOpen, setFeedOpen] = useState(false); // Feed the agent: the funnel's front door
  const [feedTask, setFeedTask] = useState(null);
  useEffect(() => {
    if (!feedOpen) return;
    const liveIds = Object.keys(live || {}).map(Number);
    if (!feedTask || !(tasks || []).some((t) => t.TaskId === feedTask)) setFeedTask(liveIds.length === 1 ? liveIds[0] : (liveIds[0] || null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedOpen]);
  const { agents, models, kinds, brains, brainList, brainModels } = useAgents();
  const [live, setLive] = useState({});                // TaskId -> {tail, AgentName} while a run works

  const load = useCallback(async () => {
    // the floor shows work a SESSION runs: a reply is drafted by the model triage uses and never
    // opens one, a to-do is the owner's own list. Both stay in Tasks and Review (isAgentKind).
    const id = ++loadId.current;
    try {
      const { data } = await api.get("/api/tasks", { params: { active: finishedRange === "today" ? 1 : 0 } });
      if (id !== loadId.current) return;
      setTasks((data.data || []).filter((t) => t.Status !== "dropped" && isAgentKind(t.Kind)));
      setErr("");
    } catch (e) {
      if (id === loadId.current) setErr(e?.response?.data?.detail || { fallback: "Failed to load the board" });
    }
  }, [finishedRange]);
  useEffect(() => { load(); return active ? onLive("task-changed", load) : undefined; }, [load, active]);
  // live tails arrive as run-tail (the cards are a status wall you watch); the task page has the full trace
  useEffect(() => {
    let sig = null;
    const tick = () => api.get("/api/runs/live").then(({ data }) => {
      const rows = data.data || [];
      setLive(Object.fromEntries(rows.map((r) => [r.TaskId, r])));
      // A SESSION THAT GOES QUIET is an agent waiting on you, and nothing else announces it: the rows are read again,
      // so the column is still the task's own state, never a second verdict made here (T9)
      const now = rows.map((r) => `${r.TaskId}:${isWaiting(r) ? 1 : 0}`).sort().join(",");
      if (sig !== null && now !== sig) load();
      sig = now;
    }).catch(() => {});
    if (!active) return undefined;
    tick(); const id = setInterval(tick, 3000);
    return () => clearInterval(id);
  }, [active, load]);


  if (!tasks) return <CircularProgress size={22} sx={{ m: 4 }} />;
  return (
    // THE BOARD IS A VIEW THE ASSISTANT READS (pageView.js, the assistant audit 2026-11-02): unmarked, "switch to the wall" asked on it had
    // no page under it, and a VIEW open of the Board waited on a root that never drew
    <Box data-tq-browse="board" data-tq-view-label="Agent board"
      sx={{ flex: { md: 1 }, minHeight: 0, display: view === "columns" ? "flex" : "block", flexDirection: "column",
        overflowY: { xs: "visible", md: view === "columns" ? "visible" : "auto" } }}>
      {err && <Alert severity="error" onClose={() => setErr("")} sx={{ mb: 1.5 }}>{err.fallback ? tr(err.fallback) : err}</Alert>}
      {/* four things on one line is a laptop's worth of room; below that they wrap rather than
          push the page sideways */}
      <Box sx={{ display: "flex", alignItems: "center", mb: 1.25, gap: 1.5, flexWrap: "wrap", flexShrink: 0 }}>
        <Typography sx={{ color: INK, fontWeight: 600, fontSize: 15, flex: "1 1 auto" }}>{tr("Agent board")}</Typography>
        {view === "columns" && <Box data-tq-board-history="" sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <Typography component="label" htmlFor="board-finished-range" sx={{ color: DIM, fontSize: 12 }}>{tr("Finished work")}</Typography>
          <Select size="small" value={finishedRange} onChange={(e) => setFinishedRange(e.target.value)}
            inputProps={{ id: "board-finished-range", "aria-label": tr("Finished work") }} sx={{ fontSize: 12, minWidth: 85 }}>
            <MenuItem value="today">{tr("Today")}</MenuItem>
            <MenuItem value="all">{tr("All")}</MenuItem>
          </Select>
        </Box>}
        {view === "notes" && <Typography variant="caption" sx={{ color: FAINT, fontSize: 10.5 }}>
          {tr("Short-lived task and checkout coordination — agents read it before starting; hard-earned reusable discoveries belong in the Hub.")}
        </Typography>}
        {view === "floor" && <Typography variant="caption" sx={{ color: FAINT, fontSize: 10.5 }}>
          {tr("One desk per agent that can run at once — an empty desk is capacity you are not using.")}
        </Typography>}
        {/* the same board, two ways to look at it - columns to move work, the floor to see how
            much of your capacity is actually busy */}
        <Box role="tablist" aria-label={tr("Board view")}
          sx={{ display: "flex", gap: 0.25, bgcolor: PANEL2, border: `1px solid ${BORDER}`, borderRadius: 2, p: "3px" }}>
          {[{ k: "columns", label: "Columns", icon: <ViewKanbanIcon sx={{ fontSize: 14 }} /> },
            { k: "wall", label: "Wall", icon: <GridViewIcon sx={{ fontSize: 14 }} /> },
            { k: "notes", label: "Live handoffs", icon: <ForumIcon sx={{ fontSize: 14 }} /> }].map((o) => (
              <Box key={o.k} role="tab" tabIndex={0} aria-selected={view === o.k}
                onClick={() => setView(o.k)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setView(o.k); } }}
                sx={{ display: "flex", alignItems: "center", gap: 0.6, height: 24, px: 1.1, borderRadius: 1.5,
                  fontSize: 12, fontWeight: view === o.k ? 700 : 500, cursor: "pointer",
                  color: view === o.k ? INK : DIM, bgcolor: view === o.k ? PANEL : "transparent",
                  boxShadow: view === o.k ? "0 1px 2px rgba(30,50,38,.10)" : "none" }}>
                {o.icon}{tr(o.label)}
              </Box>
            ))}
        </Box>
        {/* the funnel's front door, as big as the task button: pick the agent, paste the prompts */}
        <Button size="small" variant="outlined" disableElevation onClick={() => setFeedOpen(true)}
          sx={{ color: "var(--tq-warning, #6b5f45)", borderColor: "var(--tq-border, #d8cfbe)", bgcolor: "var(--tq-tint-brass, #f1ead9)", "&:hover": { borderColor: "var(--tq-edge-brass, #8a7a5c)", bgcolor: "var(--tq-tint-brass, #e9dfc5)" } }}>✎ {tr("Feed the agent")}</Button>
        <Button size="small" variant="contained" disableElevation startIcon={<AddIcon sx={{ fontSize: 15 }} />}
          onClick={() => setNewOpen(true)} sx={{ color: "#fff", background: GRADIENT }}>{tr(label("new_task"))}</Button>
      </Box>
      <Dialog open={feedOpen} onClose={() => setFeedOpen(false)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ pb: 0.5 }}>{tr("Feed the agent")}
          <Typography variant="caption" sx={{ color: FAINT, display: "block", fontWeight: 400, mt: 0.25 }}>
            {tr("Queue prompts for an agent - one, or a whole list. They land one per stop, in order, never mid-turn.")}
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", mb: 1.25 }}>
            {(tasks || []).filter((t) => t.Kind !== "reply" && t.Status !== "done" && t.Status !== "dropped")
              .sort((a, b) => (live[b.TaskId] ? 1 : 0) - (live[a.TaskId] ? 1 : 0))
              .map((t) => (
                <Box key={t.TaskId} onClick={() => setFeedTask(t.TaskId)}
                  sx={{ px: 1.1, py: 0.5, borderRadius: 99, cursor: "pointer", fontSize: 11.5, fontWeight: 600, maxWidth: 360, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    border: `1px solid ${feedTask === t.TaskId ? "var(--tq-edge-brass, #8a7a5c)" : BORDER}`, bgcolor: feedTask === t.TaskId ? "var(--tq-tint-brass, #f1ead9)" : PANEL, color: INK }}>
                  {live[t.TaskId] ? "▮ " : ""}{t.ref} · {t.Title}
                </Box>
              ))}
            {(tasks || []).filter((t) => t.Kind !== "reply" && t.Status !== "done" && t.Status !== "dropped").length === 0 && (
              <Typography variant="caption" sx={{ color: FAINT }}>{tr("No open coding task yet - make one with New task for the agent, then feed it.")}</Typography>
            )}
          </Box>
          {feedTask ? <TellAgent taskId={feedTask} taskRef={(tasks || []).find((t) => t.TaskId === feedTask)?.ref} onQueued={load} />
            : <Typography variant="caption" sx={{ color: FAINT }}>{tr("Pick the task above - ▮ marks one with an agent on it right now.")}</Typography>}
        </DialogContent>
      </Dialog>

      {/* what the agents are telling EACH OTHER - the half of the board git cannot show */}
      {view === "notes" && <AgentWall onOpenTask={onOpenTask} refresh={boardTick} active={active} />}
      {view === "wall" && <WallView onOpenTask={onOpenTask} refresh={boardTick} active={active} />}

      <Box sx={{ display: view === "columns" ? "grid" : "none", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(5, minmax(0, 1fr))" },
        gridTemplateRows: { md: "minmax(0, 1fr)" }, gap: 1.5, flex: { md: 1 }, minHeight: 0 }}>
        {COLS.map((col) => {
          const today = localToday();
          // Only agent work belongs here; the date filter applies to finished work, never live or approval work.
          const agentWork = (t) => t.HadAgent || t.Kind === "coding" || t.Kind === "setup" || !!t.Session
            || String(t.Assignee || "").startsWith("agent:");
          const cards = tasks.filter((t) => laneOf(t) === col.key && agentWork(t)
            // REMIND ME holds a card off the board until its day - unless its agent is asking you (T7, A11)
            && (!remindWaiting(t) || t.State === "blocked")
            // Today keeps work handled today; All includes the archive. Approval work stays in either view.
            && (col.key !== "agentdone" || finishedRange === "all" || t.State === "approve" || String(t.ClosedAt || t.UpdatedAt || "").startsWith(today) || t.OnWorkToday));
          // rank mode: the Queued lane reads top-down in the order the funnel will take them
          if (col.key === "queued") cards.sort((a, b) => (b.Queued?.value ?? 0.5) - (a.Queued?.value ?? 0.5));
          return (
            // Desktop lanes share the remaining viewport; only their card bodies scroll. Phones keep natural page flow.
            <Box key={col.key} data-tq-board-column={col.key}
              sx={{ bgcolor: "var(--tq-inset, #e9e3d8)", border: `1px solid ${BORDER}`, borderRadius: 2.5, p: 0.85,
                display: "flex", flexDirection: "column", minWidth: 0, minHeight: { xs: cards.length ? 200 : 0, md: 0 } }}>
              {/* the dot and the count on the title's FIRST line: a title that wraps ("stopped and saved · agent stopped" on a laptop) dropped
                  both to the middle of two lines, out of line with the columns beside it (the 2026-10-27 sweep) */}
              <Box sx={{ display: "flex", alignItems: "flex-start", gap: 0.6, px: 0.4, pb: 0.85, flexShrink: 0 }}>
                <Box sx={{ width: 7, height: 7, mt: "5px", flexShrink: 0, borderRadius: "50%", bgcolor: col.dot }} />
                <Typography variant="body2" sx={{ color: INK, fontWeight: 600, flex: 1, fontSize: 11.5 }}>{titleOf(col, cards)}</Typography>
                <Chip size="small" label={cards.length} sx={{ height: 16, fontSize: 9.5, bgcolor: PANEL,
                  border: `1px solid ${BORDER}`, color: DIM, "& .MuiChip-label": { px: 0.65 } }} />
              </Box>
              {col.key === "agentdone" && <Typography variant="caption" sx={{ display: "block", color: FAINT, fontSize: 10, px: 0.4, mb: 0.85, lineHeight: 1.3, flexShrink: 0 }}>
                {tr(finishedRange === "all" ? "All finished agent work, including older tasks, and drafts waiting for your approval."
                  : "Finished today or handled today, and drafts waiting for your approval. Choose All to see older finished work.")}
              </Typography>}
              <Box sx={{ flex: { md: 1 }, minHeight: 0, overflowY: { xs: "visible", md: "auto" },
                overscrollBehaviorY: "contain", scrollbarGutter: { md: "stable" }, pt: 0.25 }}>
              {!cards.length && <Empty>{tr("Nothing here.")}</Empty>}
              {cards.map((t) => {
                // a chat session reports its agent as the literal string "assistant" - the name of
                // the thing that helps you run Taskuary, not of the agent working this task
                const chat = isGeneralKind(t.Kind);
                // WHICH CODING AGENT has it, which is no longer the role: every coding task's
                // role is the one coding agent, so the name worth showing is the BRAIN. A live session knows
                // exactly what it launched (`cli`); an idle one takes the brain settings name.
                const brain = live[t.TaskId]?.cli || brains[assignedAgent(t.Assignee) || codingAgent(agents, kinds)] || "";
                const badge = agentBadge(chat ? agentName(t) : (brain || shownAgent(live[t.TaskId])),   /* the tool, else Taskuary */
                  t.RunStatus, !!live[t.TaskId]);
                return (
                <Box key={t.TaskId} data-tq-board-task={t.TaskId} onClick={() => onOpenTask(t.TaskId)}
                  sx={{ ...card, ...hoverable, p: 1.1, mb: 0.9, cursor: "pointer",
                    position: "relative",
                    ...(badge ? { mt: 1.1, borderColor: `${badge.color}55` } : {}) }}>
                  {badge && (
                    <Typography variant="caption" title={`${badge.word} · ${badge.cli}`} sx={{ ...mono, position: "absolute", top: -8, left: 10,
                      px: 0.6, fontSize: 9, fontWeight: 600, lineHeight: "13px", letterSpacing: ".06em",
                      color: badge.color, bgcolor: PANEL, border: `1px solid ${badge.color}55`,
                      borderRadius: 1 }}>
                      {badge.word}
                    </Typography>
                  )}
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.6 }}>
                    <Typography variant="caption" sx={{ ...mono, color: "var(--tq-link, #55697a)", fontWeight: 600, fontSize: 10,
                      whiteSpace: "nowrap", flexShrink: 0 }}>{t.ref}</Typography>
                    <ChannelIcon channel={t.Source} sx={{ fontSize: 12 }} />
                    {assignedAgent(t.Assignee) && !badge && <Chip size="small" icon={<TaskuaryMark size={10} />}
                      label={chat ? AGENT_SHOWN : (brain || AGENT_SHOWN)}
                      title={`${chat ? AGENT_SHOWN : brain || AGENT_SHOWN} works this task`}
                      sx={{ height: 15, fontSize: 8.5, bgcolor: "var(--tq-inset, #e3e6e1)", color: "var(--tq-success, #47654a)",
                        "& .MuiChip-label": { px: 0.55 }, "& .MuiChip-icon": { ml: 0.35 } }} />}
                    {t.RunStatus && (
                      <Chip size="small" label={`${chat ? AGENT_SHOWN : brain || AGENT_SHOWN} · ${t.State === "blocked" ? (chat ? tr(KIND_META.chat_ready.word) : tr(AGENT.waiting)) : RUN_WORD[t.RunStatus] ? tr(RUN_WORD[t.RunStatus]) : t.RunStatus}`
                        + (live[t.TaskId] ? ` · ${elapsed(live[t.TaskId].StartedAt)}` : "")}
                        sx={{ height: 15, fontSize: 8.5, fontWeight: 600, "& .MuiChip-label": { px: 0.7 },
                          bgcolor: t.RunStatus === "running" ? "var(--tq-inset, #eae4d8)" : t.RunStatus === "error" ? "var(--tq-inset, #f0e2e4)" : "var(--tq-inset, #dfeade)",
                          color: t.RunStatus === "running" ? "var(--tq-link, #55697a)" : t.RunStatus === "error" ? "var(--tq-danger, #6b2733)" : "var(--tq-success, #47654a)" }} />
                    )}
                    {t.HandoverNote && <NoteChip onOpen={() => setNoteFor(t)} />}
                    <Box sx={{ flex: 1 }} />
                    <Typography variant="caption" sx={{ color: FAINT, fontSize: 9.5 }}>{timeAgo(t.CreatedAt)}</Typography>
                  </Box>
                  <Typography variant="body2" sx={{ color: INK, fontWeight: 600, fontSize: 12, lineHeight: 1.35, mt: 0.4,
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {t.Title}
                  </Typography>
                  {t.Skill && (
                    <Typography variant="caption" title={t.Skill.uses?.length ? `uses ${t.Skill.uses.join(", ")}` : ""}
                      sx={{ color: "var(--tq-warning, #6b5f45)", display: "block", mt: 0.35, fontSize: 9.5, fontWeight: 600,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      Skill · {t.Skill.title}
                    </Typography>
                  )}
                  {!t.Skill && t.Source === "report" && t.SearchSources && (
                    <Typography variant="caption" sx={{ color: "var(--tq-warning, #6b5f45)", display: "block", mt: 0.35, fontSize: 9.5,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {tr("Report")} · {String(t.SearchSources).split(",")[0]}
                    </Typography>
                  )}
                  {/* a held-back dispatch says so ON the card - who it waits for and why, readable
                      without hovering anything */}
                  <QueuedStart taskId={t.TaskId} queued={t.State === "queued" ? t.Queued : null} onChanged={load} compact />
                  {live[t.TaskId] && <LiveTail run={live[t.TaskId]} chat={chat} name={agentName(t)} />}
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.6, mt: 0.6 }}>
                    <Chip size="small" label={t.Kind} sx={{ height: 15, fontSize: 8.5, bgcolor: PANEL2,
                      border: `1px solid ${BORDER}`, color: DIM, "& .MuiChip-label": { px: 0.7 } }} />
                    {t.ReviewStatus && <ActionChip reviewStatus={t.ReviewStatus} taskStatus={t.Status}
                      action={t.ReviewKind === "auto" ? "auto" : "draft"} />}
                    {/* the funnel is invisible until it isn't: a queued prompt is a promise the owner made
                        to this agent, and the card is where they look for it */}
                    {t.Waiting > 0 && (
                      <Chip size="small" onClick={(e) => { e.stopPropagation(); setFeedTask(t.TaskId); setFeedOpen(true); }}
                        label={`✎ ${tr(t.Waiting === 1 ? "{count} queued prompt" : "{count} queued prompts", { count: t.Waiting })}`}
                        title={tr("waiting in the funnel - lands at the agent's next stop; click to add more")}
                        sx={{ height: 15, fontSize: 8.5, bgcolor: "var(--tq-tint-brass, #f1ead9)", border: "1px solid var(--tq-border, #d8cfbe)", color: "var(--tq-warning, #6b5f45)", fontWeight: 600,
                          cursor: "pointer", "& .MuiChip-label": { px: 0.7 } }} />
                    )}
                    <Box sx={{ flex: 1 }} />
                    <Typography variant="caption" sx={{ color: "var(--tq-link, #55697a)", fontWeight: 600, fontSize: 9.5 }}>{tr("open →")}</Typography>
                  </Box>
                </Box>
                );
              })}
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* ── start a task for the agent: New's own "Give an agent a job" (the owner, 2026-10-15: "look like a coding or general
          agent - same as in new button") - a live session in a checkout, or a general agent, one form app-wide ── */}
      <NewSheet open={newOpen} onClose={() => setNewOpen(false)}
        onDone={() => { setBoardTick((n) => n + 1); load(); }} />

      <NoteDialog open={!!noteFor} task={noteFor} onClose={() => setNoteFor(null)} />
    </Box>
  );
}
