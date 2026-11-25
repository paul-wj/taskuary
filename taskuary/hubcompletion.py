"""One Hub review per newly completed task, independent of the agent's session."""
import contextlib
import json
import threading

from loguru import logger

from . import handbook, scopes
from .redact import scrub

# An outbox on the status write, not a scan of done tasks. Reopening cancels unfinished work;
# the generation distinguishes a new completion even if it happens in the same second.
SCHEMA = """
CREATE TABLE IF NOT EXISTS hub_completion (
    TaskId INTEGER PRIMARY KEY, Generation TEXT NOT NULL, State TEXT NOT NULL,
    Findings TEXT, Entries TEXT, Reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_hub_completion_pending ON hub_completion(State, TaskId);
CREATE TRIGGER IF NOT EXISTS hub_completion_queue AFTER UPDATE OF Status ON task
WHEN NEW.Status='done' AND OLD.Status IS NOT 'done' AND NEW.TaskId<{internal_task_base}
 AND EXISTS(SELECT 1 FROM connector WHERE Type='handbook' AND Active=1)
BEGIN
    INSERT OR IGNORE INTO hub_completion(TaskId, Generation, State)
    VALUES (NEW.TaskId, lower(hex(randomblob(16))), 'pending');
END;
CREATE TRIGGER IF NOT EXISTS hub_completion_reopen AFTER UPDATE OF Status ON task
WHEN OLD.Status='done' AND NEW.Status IS NOT 'done'
BEGIN
    DELETE FROM hub_completion WHERE TaskId=NEW.TaskId AND State='pending';
END;
CREATE TRIGGER IF NOT EXISTS hub_completion_delete AFTER DELETE ON task
BEGIN
    DELETE FROM hub_completion WHERE TaskId=OLD.TaskId;
END;
"""


def state(store, tid):
    row = store._one('SELECT State, Entries, Reason FROM hub_completion WHERE TaskId=?', (tid,))
    return {'status': row['State'], 'entries': json.loads(row['Entries'] or '[]'), 'reason': row['Reason']} if row else None


def _blocked(store, tid):
    if handbook.from_stranger(store, tid): return 'stranger'
    card = store.get_connector_by_type('handbook')
    if not handbook.enabled(store): return 'disabled'
    if card and not scopes.allows(card, 'hub_write'): return 'read_only'
    return ''


def _evidence(store, tid):
    from .session_artifacts import confined
    from .proof import tests_from
    from .general import ASSISTANT_TYPE, USER_TYPE
    # Prefer authored results and notes to raw transcripts, instructions or inbound messages.
    notes = [str(c['Body'] or '')[-2400:] for c in store.list_comments(tid)
             if c['ActorType'] in ('agent', 'human', USER_TYPE, ASSISTANT_TYPE) and c['Body']]
    result = store._one("SELECT substr(Result,1,3000) AS Result FROM run WHERE TaskId=? AND Status='done' "
                        "AND COALESCE(Result,'')<>'' ORDER BY RunId DESC LIMIT 1", (tid,)) or {}
    transcript = (store.last_transcript(tid) or {}).get('Text') or ''
    checks = tests_from(transcript) if transcript else {}
    # The compact report may omit the conclusion and why it held up. Use the agent's
    # saved write-up, not arbitrary task attachments or the raw terminal scrollback.
    artifact = next((a for a in store.list_task_artifacts(tid)
                     if a['Kind'] in ('coding_session', 'agent_result')), None)
    saved = ''
    if artifact and (path := confined(artifact.get('Path'))) and path.parent.name == str(tid):
        try:
            with path.open(encoding='utf-8') as f: saved = f.read(12000)
        except (OSError, UnicodeError):
            pass
    sections = []
    if notes: sections.append('Saved reports and notes:\n' + '\n\n'.join(notes[-12:])[-8500:])
    if result.get('Result'): sections.append('Saved run result:\n' + result['Result'])
    if saved.strip(): sections.append('Saved agent write-up:\n' + saved)
    if checks.get('ran'): sections.append('Recorded test evidence:\n' + json.dumps(checks, ensure_ascii=False)[:2000])
    return scrub('\n\n'.join(sections))


def _current(store, row):
    return bool(store._one("SELECT 1 FROM hub_completion h JOIN task t USING(TaskId) "
                           "WHERE h.TaskId=? AND h.Generation=? AND h.State='pending' AND t.Status='done'",
                           (row['TaskId'], row['Generation'])))


def _finish(store, row, status, reason=None, ids=()):
    tid = row['TaskId']
    store._exec("UPDATE hub_completion SET State=?, Reason=?, Entries=?, Findings=NULL "
                "WHERE TaskId=? AND Generation=? AND State='pending'",
                (status, reason, json.dumps(list(ids)), tid, row['Generation']))
    store._poke('task-changed', task_id=tid)


def _publish(store, tid, findings):
    ids, created = [], False
    task = store.get_task(tid)
    for e in findings:
        topic = handbook.topic_of(e['topic'], task_repo=task.get('SourceRef') or '')
        match = store.lore_get(e['same_as']) if e['same_as'] else None
        if not match or match['Status'] != 'live': match = handbook.same_post(store, topic, e['title'])
        if not match:
            match = handbook.post(store, e['title'], e['body'], topic, e['kind'], 'task-review', tid,
                                  clip=True, why_earned=e['why_earned'])
        lid = match['LoreId']
        if lid not in ids: ids.append(lid)
        created |= match.get('Author') == 'task-review' and match.get('TaskId') == tid
    return ('published' if created else 'known'), ids


def process_one(store, llm=None, *, cancel=None):
    """Drain one queued completion. Keep the chosen candidates across a shutdown before publication."""
    row = store._one("SELECT * FROM hub_completion WHERE State='pending' ORDER BY TaskId LIMIT 1")
    if row is None: return False
    tid = row['TaskId']
    try:
        if reason := _blocked(store, tid):
            _finish(store, row, 'skipped', reason)
            return True
        if row['Findings'] is not None:
            findings = json.loads(row['Findings'])
        else:
            evidence = _evidence(store, tid)
            findings = []
            if evidence:
                from .llm import build_llm
                brain = llm or build_llm(store, job='memory', task_id=tid, cancel=cancel)
                if not brain:
                    _finish(store, row, 'failed', 'no_ai')
                    return True
                task = store.get_task(tid) or {}
                findings = handbook.extract_findings(store, scrub(task.get('Title')), evidence, brain)
        with store.lock:
            if (cancel and cancel.is_set()) or not _current(store, row): return True
            if reason := _blocked(store, tid): _finish(store, row, 'skipped', reason)
            elif not findings: _finish(store, row, 'empty')
            else:
                # Store the exact candidates first. If interrupted after a post, its exact title
                # already exists and the resumed publication links it instead of writing it again.
                store._exec('UPDATE hub_completion SET Findings=? WHERE TaskId=? AND Generation=?',
                            (json.dumps(findings, ensure_ascii=False), tid, row['Generation']))
                status, ids = _publish(store, tid, findings)
                _finish(store, row, status, ids=ids)
    except Exception as e:
        if cancel and cancel.is_set(): return True
        logger.warning(f'Hub extraction failed for task {tid} ({type(e).__name__})')
        _finish(store, row, 'failed', 'extraction')
    return True


@contextlib.contextmanager
def watch(store):
    stop = threading.Event()
    def run():
        while not stop.is_set():
            try:
                if process_one(store, cancel=stop): continue
            except Exception as e:
                logger.warning(f'Hub completion worker could not read its queue ({type(e).__name__})')
            stop.wait(1)
    worker = threading.Thread(target=run, daemon=True, name='hub-completion')
    worker.start()
    try: yield
    finally:
        stop.set()
        worker.join(timeout=1)
