"""Owner controls the additive library; reads do not manufacture work or execute AI."""
from unittest import mock
import pytest
from fastapi.testclient import TestClient
from taskuary import server, skillstate as state
from taskuary.store import MemoryStore


@pytest.fixture
def library(monkeypatch):
    store = MemoryStore()
    monkeypatch.setattr(server, 'store', store)
    client = TestClient(server.app, headers={'X-Taskuary-Token': server.cfg['server']['token']})
    yield store, client
    client.close(); store.close()


def test_empty_library_is_explicit_and_does_not_start_ai_or_an_agent(library):
    store, client = library
    with mock.patch('taskuary.llm.build_llm', side_effect=AssertionError('a library read must not run a model')):
        response = client.get('/api/skill-library')
    assert response.status_code == 200
    data = response.json()
    assert data['suggestions'] == []
    assert data['skills'] == []
    assert data['generations'] == []
    assert data['analysis']['state'] == 'idle'
    assert store.list_tasks() == []


def test_dismissed_ai_suggestion_stays_dismissed_after_another_read(library):
    store, client = library
    candidate = state.create(store, 'candidate', {'state': 'suggested', 'action': 'create', 'slug': 'taskuary-reconcile',
        'title': 'Reconcile data', 'description': 'Check two reports', 'evidence': []}, key='fixture-evidence')
    response = client.post(f"/api/skill-library/suggestions/{candidate['id']}/dismiss", json={})
    assert response.status_code == 200
    assert state.get(store, 'candidate', candidate['id'])['state'] == 'dismissed'
    visible = client.get('/api/skill-library').json()['suggestions']
    assert all(c['id'] != candidate['id'] for c in visible)


def test_agent_cannot_accept_improve_return_discard_or_start_analysis(library):
    store, client = library
    agent = {'X-Taskuary-Token': server.cfg['server']['agent_token']}
    for path in ('analyze', 'suggestions/1/accept', 'suggestions/1/dismiss',
                 'skills/taskuary-reconcile/improve', 'generations/1/return', 'generations/1/discard'):
        assert client.post('/api/skill-library/' + path, json={}, headers=agent).status_code == 403
    assert state.rows(store, 'generation') == []


def test_missing_generation_is_not_a_fake_success(library):
    _, client = library
    response = client.get('/api/skill-library/generations/191')
    assert response.status_code == 404
    assert response.json()['detail']
