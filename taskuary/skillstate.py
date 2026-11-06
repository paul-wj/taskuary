"""Durable state for the Skill library, separate from operational documents and settings."""
import json
from datetime import datetime

SCHEMA = """
CREATE TABLE IF NOT EXISTS skill_record (Id INTEGER PRIMARY KEY, Kind TEXT NOT NULL,
  Name TEXT, DataJson TEXT NOT NULL, UpdatedAt TEXT NOT NULL, UNIQUE(Kind, Name));
CREATE INDEX IF NOT EXISTS idx_skill_record_kind ON skill_record(Kind, Id);
"""
KINDS = frozenset(('analysis', 'candidate', 'generation', 'package', 'binding', 'publication'))


def _kind(kind):
    if kind not in KINDS: raise ValueError('unknown Skill record kind')
    return kind


def _record(row):
    return {**json.loads(row['DataJson']), 'id': row['Id']} if row else None


def get(store, kind, id):
    return _record(store._one('SELECT Id, DataJson FROM skill_record WHERE Kind=? AND Id=?', (_kind(kind), int(id))))


def by_key(store, kind, key):
    return _record(store._one('SELECT Id, DataJson FROM skill_record WHERE Kind=? AND Name=?', (_kind(kind), str(key))))


def rows(store, kind):
    return [_record(r) for r in store._rows('SELECT Id, DataJson FROM skill_record WHERE Kind=? ORDER BY Id DESC', (_kind(kind),))]


def create(store, kind, data, key=None):
    kind = _kind(kind)
    payload = {k: v for k, v in data.items() if k != 'id'}
    encoded = json.dumps(payload, ensure_ascii=False)
    with store.lock, store._undone():
        store._clear_stale(); store.cx.execute('BEGIN IMMEDIATE')
        if key is not None:
            existing = store.cx.execute('SELECT Id, DataJson FROM skill_record WHERE Kind=? AND Name=?', (kind, str(key))).fetchone()
            if existing:
                store.cx.rollback()
                return _record(existing)
        cur = store.cx.execute('INSERT INTO skill_record (Kind, Name, DataJson, UpdatedAt) VALUES (?,?,?,?)',
                               (kind, None if key is None else str(key), encoded, datetime.now().isoformat(timespec='seconds')))
        store.cx.commit(); store._writes += 1
        return {**payload, 'id': cur.lastrowid}


def update(store, kind, id, changes, expected=None):
    kind = _kind(kind)
    with store.lock, store._undone():
        store._clear_stale(); store.cx.execute('BEGIN IMMEDIATE')
        found = store.cx.execute('SELECT Id, DataJson FROM skill_record WHERE Kind=? AND Id=?', (kind, int(id))).fetchone()
        current = _record(found)
        if not current: raise ValueError('Skill record no longer exists')
        if any(current.get(k) != v for k, v in (expected or {}).items()):
            raise ValueError('the Skill record changed - reload before trying again')
        current.update({k: v for k, v in changes.items() if k != 'id'})
        encoded = json.dumps({k: v for k, v in current.items() if k != 'id'}, ensure_ascii=False)
        store.cx.execute('UPDATE skill_record SET DataJson=?, UpdatedAt=? WHERE Kind=? AND Id=?',
                         (encoded, datetime.now().isoformat(timespec='seconds'), kind, int(id)))
        store.cx.commit(); store._writes += 1
        return current


def notify(store, task_id=None):
    # Reuse the existing coalesced/stamped protocol; no second websocket event vocabulary.
    if task_id is None: store._poke('feed-changed')
    else: store._poke('feed-changed', 'task-changed', task_id=task_id)
