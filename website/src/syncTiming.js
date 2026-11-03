import { fmtTime } from "./dates.js";
import { getLocale, t } from "./i18n.js";
// The server's scheduler wakes every 30 seconds. Far from the next scheduled sync the Timeline
// can check quietly; near (and just after) the due time it must watch closely or a short refresh
// can start and finish between UI checks and the sync glyph never moves.
export const syncStatusDelay = ({ running = false, nextAt = null, now = Date.now() } = {}) => {
  if (running) return 2000;
  if (!nextAt) return 30000;
  const untilDue = nextAt - now;
  if (untilDue > 35000) return Math.min(30000, untilDue - 30000);
  // A minute overdue the scheduler is off, asleep or stuck (the demo never polls): 2 Hz for ever was ~120 reads an idle minute,
  // each a full re-render of the rail on a large home (perf 2.8, 2026-10-19). A sync that does start says so on the socket.
  return untilDue > -60000 ? 500 : 30000;
};

// One face for the sync clock, so the Timeline's caption and the pipe's chip can never disagree
// about when the mail was last read. `lastAt` is a real Date (built from the SERVER's clock, not
// from parsing a UTC string as local time - that read "in 3h" on an east-coast box).
export const syncPhaseLabel = phase => t(({ fetching: 'Reading sources', triaging: 'Organizing',
  checking: 'Checking updates', running_reports: 'Running reports' }[phase] || 'Syncing'));

export const syncFace = ({ busy = false, what = "", every = 10, lastAt = null, nextIn = null, terse = false, checked = false, started = false } = {}) => {
  if (busy) return what && !terse ? what : t("syncing…");
  if (!every) return terse ? t("sync off") : t("background sync off");
  const at = lastAt ? fmtTime(lastAt, getLocale() === "zh-CN" ? "zh-CN" : "en-US", { hour: "numeric", minute: "2-digit" }) : "—";
  const verb = started ? t("check started") : checked ? t("checked") : t("synced");
  // The terse sidebar shows just the state and time.
  if (terse) return t("{state} {time}", { state: started ? t("started") : verb, time: at });
  const nxt = nextIn == null ? "" : nextIn <= 0 ? t(" · next sync due now") : t(" · next in {time}", { time: `${Math.floor(nextIn / 60)}:${String(nextIn % 60).padStart(2, "0")}` });
  return t("{state} {time}{next}", { state: verb, time: at, next: nxt });
};
