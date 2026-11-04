// One reading of a dispatch answer for every surface that starts a worker (PW-209/212).
//
// The server says four things: dispatch (session | assistant | needs_repo), started (a worker
// session was created for THIS request), existing (a live session was reused - nothing new
// started) and, for a coding session, accepted (the prompt was actually submitted, not merely
// typed into a booting TUI). A repository decision is never a start; a reused session is never
// "it started". Older servers without the flags: a session payload is a start.
import { t } from "./i18n.js";

export function outcomeOf(data) {
  const d = data || {};
  const who = d.agent || (d.dispatch === "assistant" ? t("the assistant") : t("the agent"));
  const ref = d.ref || "";
  if (d.dispatch === "needs_repo")
    return { state: "needs_repo", text: t("Which repository? {reason}", { reason: d.reason || t("pick one before the agent starts") }), taskId: d.taskId, agent: d.agent };
  if (d.existing || (d.started === false && d.dispatch !== "needs_repo"))
    return { state: "existing", text: ref
      ? t("{who} is already on it - {ref}; nothing new was started", { who, ref })
      : t("{who} is already on it; nothing new was started", { who }), taskId: d.taskId };
  if (d.started === true || d.session || d.dispatch === "assistant" || d.dispatch === "session") {
    const accepted = d.accepted;
    const text = accepted === false
      ? t("{who} is opening on {ref} - the ask is still being typed in", { who, ref: ref || t("it") })
      // a general agent is a chat, not a session at a keyboard: "in a live session" read as coding talk on one (2026-11-03)
      : d.dispatch === "assistant"
        ? t(ref ? "{who} is on it - {ref}" : "{who} is on it", { who, ref })
        : t(ref ? "{who} is on it in a live session - {ref}" : "{who} is on it in a live session", { who, ref });
    return { state: "started", text, taskId: d.taskId, accepted };
  }
  return { state: "unknown", text: t("no start was reported"), taskId: d.taskId };
}
