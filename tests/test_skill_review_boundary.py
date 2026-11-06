"""A task may only propose its own frozen package; old proposal behavior is unchanged."""
import json
from taskuary import proposals, skillstate as state
from taskuary.store import MemoryStore


def test_a_skill_publish_proposal_cannot_be_attached_to_an_unrelated_task():
    store = MemoryStore()
    try:
        owner_task = store.create_task({'Title': 'Build a reusable method', 'Source': 'manual'}, 'owner')
        other_task = store.create_task({'Title': 'Unrelated existing task', 'Source': 'manual'}, 'owner')
        gen = state.create(store, 'generation', {'task_id': owner_task, 'state': 'needs_review', 'draft_digest': 'abc', 'base_digest': None})
        proposal = {'action': 'publish_skill', 'generation_id': gen['id'], 'digest': 'abc', 'base_digest': None}
        made = proposals.queue(store, owner_task, proposal)
        assert made and store.get_review(made['reviewId'])['TaskId'] == owner_task
        assert proposals.queue(store, other_task, proposal) is None
        assert store.pending_review(other_task) is None
        assert store.get_task(other_task)['Status'] == 'open'
    finally: store.close()


def test_changed_draft_digest_cannot_queue_or_execute_old_approval():
    store = MemoryStore()
    try:
        tid = store.create_task({'Title': 'Generate a method', 'Source': 'manual'}, 'owner')
        gen = state.create(store, 'generation', {'task_id': tid, 'state': 'needs_review', 'draft_digest': 'new', 'base_digest': None})
        stale = {'action': 'publish_skill', 'generation_id': gen['id'], 'digest': 'old', 'base_digest': None}
        assert proposals.validate(store, {**stale, 'digest': 'new'})[0] is True
        ok, reason = proposals.validate(store, stale)
        assert ok is False
        assert state.get(store, 'generation', gen['id'])['draft_digest'] == 'new'
        assert proposals.queue(store, tid, stale) is None
    finally: store.close()
