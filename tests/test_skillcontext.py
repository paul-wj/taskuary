"""Published methods are discoverable, optional and absent from unrelated/untrusted work."""
from taskuary import skillstate as state
from taskuary.store import MemoryStore


def test_empty_library_adds_no_agent_context():
    from taskuary import skillcontext
    store = MemoryStore()
    try:
        tid = store.create_task({'Title': 'Existing work', 'Source': 'manual'}, 'owner')
        assert skillcontext.block(store, tid) == ''
    finally: store.close()


def test_only_published_names_and_descriptions_are_disclosed_not_bodies(tmp_path, monkeypatch):
    from taskuary import skillcontext, config
    monkeypatch.setattr(config, 'home', lambda: tmp_path)
    store = MemoryStore()
    try:
        tid = store.create_task({'Title': 'Reconcile data', 'Source': 'manual'}, 'owner')
        folder = tmp_path / 'skills' / 'taskuary-reconcile'
        folder.mkdir(parents=True)
        (folder / 'SKILL.md').write_text('---\nname: taskuary-reconcile\ndescription: Compare two ledgers\n---\n\nPrivate long instruction body.\n', encoding='utf-8')
        state.create(store, 'package', {'slug': 'taskuary-reconcile', 'name': 'taskuary-reconcile', 'description': 'Compare two ledgers', 'digest': 'pinned'}, key='taskuary-reconcile')
        state.create(store, 'generation', {'slug': 'taskuary-unpublished', 'description': 'Draft only', 'state': 'needs_review'})
        text = skillcontext.block(store, tid)
        assert 'taskuary-reconcile' in text and 'Compare two ledgers' in text
        assert str(folder / 'SKILL.md') in text
        assert 'Private long instruction body.' not in text
        assert 'taskuary-unpublished' not in text
    finally: store.close()


def test_stranger_tasks_do_not_receive_owner_skills(monkeypatch):
    from taskuary import skillcontext, origin
    store = MemoryStore()
    try:
        tid = store.create_task({'Title': 'External request', 'Source': 'email'}, 'owner')
        state.create(store, 'package', {'slug': 'taskuary-internal', 'description': 'Internal procedure'}, key='taskuary-internal')
        monkeypatch.setattr(origin, 'of_task', lambda *_: ('stranger', 'untrusted source'))
        assert skillcontext.block(store, tid) == ''
    finally: store.close()


def test_agent_can_read_published_resources_without_executing_them(tmp_path, monkeypatch):
    import pytest
    from taskuary import skillpackages as p, config, agenttools
    monkeypatch.setattr(config, 'home', lambda: tmp_path)
    monkeypatch.setattr(p, 'native_roots', lambda: {})
    store = MemoryStore()
    try:
        tid = store.create_task({'Title': 'Reconcile data', 'Source': 'manual'}, 'owner')
        generation = state.create(store, 'generation', {'slug': 'taskuary-reader', 'task_id': tid, 'state': 'generating', 'base_digest': None})
        root = p.draft_dir(generation['id'])
        (root / 'scripts').mkdir(parents=True)
        (root / 'SKILL.md').write_text('---\nname: taskuary-reader\ndescription: Read a reusable method\n---\n\nUse [script](scripts/check.py).\n', encoding='utf-8')
        script = 'raise RuntimeError("this resource must not run when read")\n'
        (root / 'scripts' / 'check.py').write_text(script, encoding='utf-8')
        snapshot = p.snapshot(store, generation['id'])
        p.publish(store, generation['id'], snapshot['digest'])
        result = agenttools.call(store, tid, 'read_skill', {'slug': 'taskuary-reader', 'path': 'scripts/check.py'}, {})
        assert script.strip() in result
        with pytest.raises(ValueError):
            agenttools.call(store, tid, 'read_skill', {'slug': 'taskuary-reader', 'path': '../config.toml'}, {})
        with pytest.raises(ValueError):
            agenttools.call(store, tid, 'read_skill', {'slug': 'taskuary-unpublished'}, {})
    finally: store.close()
