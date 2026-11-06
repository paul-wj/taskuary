"""Durable, compare-and-set state for the additive Skill library."""
import pytest
from taskuary.store import MemoryStore, SQLiteStore


def test_acceptance_claim_is_durable_and_a_second_writer_cannot_claim_it(tmp_path):
    from taskuary import skillstate as state
    path = str(tmp_path / 'library.db')
    first, second = SQLiteStore(path), SQLiteStore(path)
    try:
        candidate = state.create(first, 'candidate', {'state': 'suggested', 'title': 'Reconcile data'}, key='evidence-1')
        claimed = state.update(first, 'candidate', candidate['id'], {'state': 'accepted'}, expected={'state': 'suggested'})
        assert claimed['state'] == 'accepted'
        with pytest.raises(ValueError):
            state.update(second, 'candidate', candidate['id'], {'state': 'accepted'}, expected={'state': 'suggested'})
        assert state.by_key(second, 'candidate', 'evidence-1')['state'] == 'accepted'
        again = state.create(second, 'candidate', {'state': 'suggested', 'title': 'Different wording'}, key='evidence-1')
        assert again['id'] == candidate['id']
        assert again['title'] == 'Reconcile data'
    finally:
        first.close(); second.close()


def test_failed_cas_leaves_unrelated_records_and_task_unchanged():
    from taskuary import skillstate as state
    store = MemoryStore()
    try:
        tid = store.create_task({'Title': 'Existing task', 'Status': 'open'}, 'owner')
        generation = state.create(store, 'generation', {'state': 'needs_review', 'task_id': tid, 'draft_digest': 'current'})
        with pytest.raises(ValueError):
            state.update(store, 'generation', generation['id'], {'state': 'published'}, expected={'draft_digest': 'old'})
        assert state.get(store, 'generation', generation['id'])['state'] == 'needs_review'
        assert store.get_task(tid)['Status'] == 'open'
        assert state.rows(store, 'package') == []
    finally: store.close()


def test_published_registry_survives_reopen_without_adopting_unregistered_files(tmp_path):
    from taskuary import skillstate as state
    path = str(tmp_path / 'library.db')
    store = SQLiteStore(path)
    record = state.create(store, 'package', {'slug': 'taskuary-reconcile', 'digest': 'revision-one'}, key='taskuary-reconcile')
    store.close()
    store = SQLiteStore(path)
    try:
        assert state.rows(store, 'package') == [record]
        assert state.by_key(store, 'package', 'metric-legacy') is None
    finally: store.close()
