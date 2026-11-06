"""A normal Agent task authors the package; collection and review do not change old tasks."""
from types import SimpleNamespace
from unittest import mock
import pytest
from taskuary import skillstate as state
from taskuary.store import MemoryStore


def candidate(s):
    tid = s.create_task({'Title': 'Completed report comparison', 'Source': 'manual', 'Status': 'done'}, 'owner')
    return state.create(s, 'candidate', {'state': 'suggested', 'action': 'create', 'slug': 'taskuary-compare',
        'title': 'Compare two reports', 'description': 'Compare and check report differences', 'target_digest': None,
        'rationale': 'The same verified method repeats', 'evidence': [{'task_id': tid, 'reason': 'verified comparison'}]})


def test_missing_cli_leaves_suggestion_and_existing_work_unchanged():
    from taskuary import skillauthoring as a
    s = MemoryStore()
    try:
        c = candidate(s)
        with mock.patch('taskuary.agents.resolve_brain', return_value=''):
            with pytest.raises(ValueError): a.accept(s, c['id'])
        assert state.get(s, 'candidate', c['id'])['state'] == 'suggested'
        assert state.rows(s, 'generation') == []
        assert s.get_task(c['evidence'][0]['task_id'])['Status'] == 'done'
    finally: s.close()


def test_accepting_twice_reuses_one_normal_task_and_staging_package(tmp_path, monkeypatch):
    from taskuary import skillauthoring as a, config
    monkeypatch.setattr(config, 'home', lambda: tmp_path)
    s = MemoryStore()
    try:
        c = candidate(s)
        with mock.patch.object(a, '_ready', return_value='cli:fixture'), mock.patch.object(a, '_dispatch'):
            first = a.accept(s, c['id'])
            second = a.accept(s, c['id'])
        assert first['generation_id'] == second['generation_id']
        assert first['task_id'] == second['task_id']
        task = s.get_task(first['task_id'])
        assert task['SourceRef'] == f"assistant:skillgen:{first['generation_id']}"
        assert (tmp_path / 'skill-drafts' / str(first['generation_id']) / 'package').is_dir()
        assert len(state.rows(s, 'generation')) == 1
        from taskuary import terminal
        assert terminal.guess_repo(s, first['task_id'], {'cwd_map': {'fictional/other-project': str(tmp_path)}})[0] is None
    finally: s.close()


def test_invalid_output_marks_generation_failed_without_failing_existing_completion(tmp_path, monkeypatch):
    from taskuary import skillauthoring as a, config
    monkeypatch.setattr(config, 'home', lambda: tmp_path)
    s = MemoryStore()
    try:
        ordinary = s.create_task({'Title': 'Ordinary task', 'Status': 'done', 'Source': 'manual'}, 'owner')
        assert a.collect(s, ordinary) is None
        c = candidate(s)
        with mock.patch.object(a, '_ready', return_value='cli:fixture'), mock.patch.object(a, '_dispatch'):
            record = a.accept(s, c['id'])
        s.update_task(record['task_id'], {'Status': 'done'}, 'owner')
        assert a.collect(s, record['task_id']) is None
        assert state.get(s, 'generation', record['generation_id'])['state'] == 'failed'
        assert s.get_task(record['task_id'])['Status'] == 'done'
        assert s.pending_review(record['task_id']) is None
    finally: s.close()


def test_collect_pins_one_review_and_discard_does_not_publish(tmp_path, monkeypatch):
    from taskuary import skillauthoring as a, skillpackages as p, config
    monkeypatch.setattr(config, 'home', lambda: tmp_path)
    s = MemoryStore()
    try:
        c = candidate(s)
        with mock.patch.object(a, '_ready', return_value='cli:fixture'), mock.patch.object(a, '_dispatch'):
            record = a.accept(s, c['id'])
        root = p.draft_dir(record['generation_id'])
        (root / 'SKILL.md').write_text('---\nname: taskuary-compare\ndescription: Compare reports\n---\n\nCompare input columns and verify differences.\n', encoding='utf-8')
        first = a.collect(s, record['task_id'])
        second = a.collect(s, record['task_id'])
        assert first['review_id'] == second['review_id']
        review = s.get_review(first['review_id'])
        assert review['Status'] == 'pending' and review['TaskId'] == record['task_id']
        a.discard(s, record['generation_id'], first['draft_digest'])
        assert s.get_review(first['review_id'])['Status'] != 'pending'
        assert state.rows(s, 'package') == []
    finally: s.close()


def test_return_reuses_the_task_and_only_the_new_review_can_publish(tmp_path, monkeypatch):
    from taskuary import skillauthoring as a, skillpackages as p, config, proposals
    monkeypatch.setattr(config, 'home', lambda: tmp_path)
    monkeypatch.setattr(p, 'native_roots', lambda: {})
    s = MemoryStore()
    try:
        c = candidate(s)
        with mock.patch.object(a, '_ready', return_value='cli:fixture'), mock.patch.object(a, '_dispatch'):
            record = a.accept(s, c['id'])
        root = p.draft_dir(record['generation_id'])
        entry = root / 'SKILL.md'
        entry.write_text('---\nname: taskuary-compare\ndescription: Compare reports\n---\n\nCompare input columns.\n', encoding='utf-8')
        first = a.collect(s, record['task_id'])
        with mock.patch.object(a, '_ready', return_value='cli:fixture'), mock.patch.object(a, '_dispatch'):
            returned = a.return_to_agent(s, record['generation_id'], 'Check duplicate identifiers too.', first['draft_digest'])
        assert returned['task_id'] == record['task_id']
        assert s.get_review(first['review_id'])['Status'] == 'superseded'
        entry.write_text(entry.read_text(encoding='utf-8') + '\nCheck duplicate identifiers before comparing.\n', encoding='utf-8')
        second = a.collect(s, record['task_id'])
        assert second['review_id'] != first['review_id']
        assert second['draft_digest'] != first['draft_digest']
        with pytest.raises(RuntimeError): proposals.execute(s, s.get_review(first['review_id']))
        assert state.rows(s, 'package') == []
        proposals.execute(s, s.get_review(second['review_id']))
        assert state.by_key(s, 'package', 'taskuary-compare')['digest'] == second['draft_digest']
        assert len(state.rows(s, 'generation')) == 1
    finally: s.close()


def test_resume_failure_is_visible_and_does_not_restore_the_obsolete_review(tmp_path, monkeypatch):
    from taskuary import skillauthoring as a, skillpackages as p, config
    monkeypatch.setattr(config, 'home', lambda: tmp_path)
    s = MemoryStore()
    try:
        c = candidate(s)
        with mock.patch.object(a, '_ready', return_value='cli:fixture'), mock.patch.object(a, '_dispatch'):
            record = a.accept(s, c['id'])
        (p.draft_dir(record['generation_id']) / 'SKILL.md').write_text('---\nname: taskuary-compare\ndescription: Compare reports\n---\n\nCompare fields.\n', encoding='utf-8')
        first = a.collect(s, record['task_id'])
        with mock.patch.object(a, '_ready', return_value='cli:fixture'), mock.patch.object(a, '_dispatch', side_effect=ValueError('fixture CLI unavailable')):
            with pytest.raises(ValueError): a.return_to_agent(s, record['generation_id'], 'Revise the method.', first['draft_digest'])
        failed = state.get(s, 'generation', record['generation_id'])
        assert failed['state'] == 'failed' and failed['error']['code'] == 'resume_failed'
        assert s.get_review(first['review_id'])['Status'] == 'superseded'
    finally: s.close()


def test_existing_coding_agent_can_author_without_widening_general_agent_permissions(tmp_path, monkeypatch):
    import json
    from taskuary import skillauthoring as a, config, agents
    monkeypatch.setattr(config, 'home', lambda: tmp_path)
    s = MemoryStore()
    try:
        s.set_setting('general_agent_hands', 'look', 'owner')
        s.upsert_agent('coding', 'coding', 'cli', json.dumps({'purpose': 'Existing coding worker'}))
        c = candidate(s)
        with mock.patch.object(agents, 'coding_ready', return_value=True), mock.patch.object(agents, 'resolve_brain', return_value='cli:fixture'), mock.patch.object(agents, 'brain_ready', return_value=True), mock.patch.object(a, '_dispatch'):
            generated = a.accept(s, c['id'])
        assert s.get_task(generated['task_id'])['Kind'] == 'coding'
        assert s.get_setting('general_agent_hands') == 'look'
        assert s.get_task(c['evidence'][0]['task_id'])['Status'] == 'done'
    finally: s.close()


def test_return_to_a_live_terminal_keeps_feedback_in_the_standard_waitroom(tmp_path, monkeypatch):
    from taskuary import skillauthoring as a, config, terminal, waitroom
    monkeypatch.setattr(config, 'home', lambda: tmp_path)
    s = MemoryStore()
    try:
        c = candidate(s)
        with mock.patch.object(a, '_ready', return_value='cli:fixture'), mock.patch.object(a, '_dispatch'):
            record = a.accept(s, c['id'])
        s.update_task(record['task_id'], {'Status': 'in_progress'}, 'owner')
        tty = SimpleNamespace(alive=True, busy=False, task_id=record['task_id'])
        with mock.patch.object(a, '_ready', return_value='cli:fixture'), mock.patch.object(terminal, 'session_for', return_value=tty), mock.patch.object(waitroom, 'deliver', return_value={'delivered': 0, 'state': 'working'}):
            returned = a.return_to_agent(s, record['generation_id'], 'Check duplicate rows.', '')
        assert returned['task_id'] == record['task_id']
        notes = s.waiting_notes(record['task_id'])
        assert notes[0]['Note'] == 'Check duplicate rows.' and notes[0]['CreatedBy'] == 'owner'
        assert s.get_task(record['task_id'])['Status'] == 'in_progress'
        assert len(state.rows(s, 'generation')) == 1
    finally: s.close()


def test_return_does_not_resurrect_a_dismissed_agent_task(tmp_path, monkeypatch):
    from taskuary import skillauthoring as a, config
    monkeypatch.setattr(config, 'home', lambda: tmp_path)
    s = MemoryStore()
    try:
        c = candidate(s)
        with mock.patch.object(a, '_ready', return_value='cli:fixture'), mock.patch.object(a, '_dispatch'):
            record = a.accept(s, c['id'])
        s.update_task(record['task_id'], {'Status': 'dropped'}, 'owner')
        with mock.patch.object(a, '_ready', return_value='cli:fixture'), mock.patch.object(a, '_dispatch'):
            with pytest.raises(ValueError): a.return_to_agent(s, record['generation_id'], 'Continue anyway.', '')
        assert s.get_task(record['task_id'])['Status'] == 'dropped'
        assert state.get(s, 'generation', record['generation_id'])['state'] == 'generating'
        assert s.waiting_notes(record['task_id']) == []
    finally: s.close()


def test_finished_generation_waits_in_the_normal_review_queue_until_owner_decides(tmp_path, monkeypatch):
    from taskuary import skillauthoring as a, skillpackages as p, config, verdicts
    monkeypatch.setattr(config, 'home', lambda: tmp_path)
    monkeypatch.setattr(p, 'native_roots', lambda: {})
    s = MemoryStore()
    try:
        c = candidate(s)
        with mock.patch.object(a, '_ready', return_value='cli:fixture'), mock.patch.object(a, '_dispatch'):
            record = a.accept(s, c['id'])
        (p.draft_dir(record['generation_id']) / 'SKILL.md').write_text('---\nname: taskuary-compare\ndescription: Compare reports\n---\n\nCheck duplicate rows and compare values.\n', encoding='utf-8')
        s.update_task(record['task_id'], {'Status': 'done'}, 'owner')
        ready = a.collect(s, record['task_id'])
        assert s.get_task(record['task_id'])['Status'] == 'waiting'
        assert any(r['ReviewId'] == ready['review_id'] for r in s.list_reviews('pending'))
        result = verdicts.decide(s, s.get_review(ready['review_id']), 'approve', actor='owner')
        assert result['status'] == 'approved'
        assert s.get_task(record['task_id'])['Status'] == 'done'
        assert state.get(s, 'generation', record['generation_id'])['state'] == 'published'
    finally: s.close()


def test_failed_native_resume_keeps_relative_file_work_inside_the_skill_workspace(tmp_path, monkeypatch):
    import json, sys
    from pathlib import Path
    from taskuary import skillauthoring as a, skillpackages as p, config, agents, general, llm, terminal
    monkeypatch.setattr(config, 'home', lambda: tmp_path)
    s = MemoryStore()
    try:
        c = candidate(s)
        with mock.patch.object(a, '_ready', return_value='cli:fixture'), mock.patch.object(a, '_dispatch'):
            record = a.accept(s, c['id'])
        s.update_task(record['task_id'], {'Kind': 'general'}, 'owner')
        s.upsert_agent('fixture', 'general', 'cli', json.dumps({'cmd': sys.executable, 'args': []}))
        real_load = config.load
        cfg = {'cmd': sys.executable, 'args': []}
        def build(store, **kwargs):
            return llm.make_cli_llm(store, 'fixture', cli_tools=kwargs.get('cli_tools', False),
                extra_env=kwargs.get('extra_env'), resume=kwargs.get('resume'), task_id=kwargs.get('task_id'))
        def run_cli(profile, prompt, trace, **kwargs):
            if kwargs.get('resume') == 'old-conversation': raise RuntimeError('synthetic resume is unavailable')
            target = Path(profile['cwd']) / 'package' / 'revision.txt'
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text('revised in the correct workspace', encoding='utf-8')
            return 'Updated the synthetic method.', 'new-conversation', ''
        with mock.patch.object(config, 'load', side_effect=lambda: {**real_load(), 'cli_connections': {'fixture': cfg}}), mock.patch.object(agents, 'connection_brains', return_value=[('fixture', cfg)]), mock.patch.dict(terminal.SESSIONS, {}, clear=True), mock.patch.object(llm, 'build_llm', side_effect=build), mock.patch.object(agents, 'run_cli', side_effect=run_cli):
            session = general.start_session(s, record['task_id'], actor='skill-library', pick='cli:fixture')
            session.cli_sid = 'old-conversation'
            session.send_prompt('Revise the method using relative paths.', brief=True)
        assert (p.draft_dir(record['generation_id']) / 'revision.txt').read_text(encoding='utf-8') == 'revised in the correct workspace'
        assert not (tmp_path / 'scratch' / 'package' / 'revision.txt').exists()
    finally: s.close()
