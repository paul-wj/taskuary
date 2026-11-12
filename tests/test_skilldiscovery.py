"""AI judges repetition; code enforces evidence, ownership and durable suppression."""
import json
from unittest import mock
import pytest
from taskuary import skillstate as state
from taskuary.store import MemoryStore


def finished(store, title='Reconcile monthly data'):
    tid = store.create_task({'Title': title, 'Source': 'manual', 'Kind': 'coding', 'Status': 'done'}, 'owner')
    rid = store.start_run(tid, 'coder', 'Compare both reports', 'owner')
    store.update_run(rid, {'Status': 'done', 'Result': 'Compared records and verified the differences'}, finished=True)
    return tid


def answer(ids, action='create', slug='taskuary-reconcile', target_digest=None, title='Reconcile reports'):
    return json.dumps({'candidates': [{'action': action, 'slug': slug, 'title': title,
        'description': 'Compare two reports and validate differences', 'rationale': 'The verified procedure repeats',
        'varies': 'file locations', 'target_digest': target_digest,
        'evidence': [{'task_id': tid, 'reason': 'completed and verified this method'} for tid in ids]}]})


def test_model_cannot_cite_tasks_outside_its_evidence_or_update_unowned_skills():
    from taskuary import skilldiscovery as d
    s = MemoryStore()
    try:
        tid = finished(s)
        assert d.analyze(s, llm=lambda *a, **k: answer([tid, 99999]))['state'] == 'failed'
        assert state.rows(s, 'candidate') == []
        assert d.analyze(s, llm=lambda *a, **k: answer([tid], action='update', slug='metric-existing', target_digest='old'))['state'] == 'failed'
        assert state.rows(s, 'candidate') == []
    finally: s.close()


def test_dismissed_evidence_stays_suppressed_despite_model_rewording_but_correction_can_reoffer():
    from taskuary import skilldiscovery as d
    s = MemoryStore()
    try:
        tid = finished(s)
        assert d.analyze(s, llm=lambda *a, **k: answer([tid]))['state'] == 'ready'
        candidate = state.rows(s, 'candidate')[0]
        state.update(s, 'candidate', candidate['id'], {'state': 'dismissed'})
        d.analyze(s, llm=lambda *a, **k: answer([tid], slug='taskuary-comparison', title='A differently phrased title'))
        assert [c for c in state.rows(s, 'candidate') if c['state'] == 'suggested'] == []
        s.add_comment(tid, 'owner', 'human', 'Also check duplicate identifiers before comparing amounts.')
        d.analyze(s, llm=lambda *a, **k: answer([tid]))
        assert any(c['state'] == 'suggested' for c in state.rows(s, 'candidate'))
    finally: s.close()


def test_empty_no_provider_and_provider_failure_are_not_fake_suggestions():
    from taskuary import skilldiscovery as d
    s = MemoryStore()
    try:
        finished(s)
        with mock.patch('taskuary.llm.build_llm', return_value=None):
            assert d.analyze(s)['state'] == 'no_provider'
        assert d.analyze(s, llm=lambda *a, **k: '{not json')['state'] == 'failed'
        assert d.analyze(s, llm=lambda *a, **k: '{"candidates": []}')['state'] == 'empty'
        assert state.rows(s, 'candidate') == []
    finally: s.close()


@pytest.mark.parametrize('wrapped', ['{}Analysis complete.', 'Findings:\n```json\n{}\n```\nAnalysis complete.'])
def test_wrapped_ai_answer_preserves_validated_skill_evidence(wrapped):
    from taskuary import skilldiscovery as d
    s = MemoryStore()
    try:
        tid = finished(s)
        result = d.analyze(s, llm=lambda *a, **k: wrapped.format(answer([tid])))
        assert result['state'] == 'ready' and result['error'] is None
        candidate, = state.rows(s, 'candidate')
        assert candidate['slug'] == 'taskuary-reconcile'
        assert candidate['evidence'] == [{'task_id': tid, 'ref': f'TQ-{tid:04d}',
            'title': 'Reconcile monthly data', 'reason': 'completed and verified this method'}]
        assert s.get_task(tid)['Status'] == 'done'
        assert state.rows(s, 'generation') == []
    finally: s.close()


def test_empty_ai_answer_with_trailing_prose_is_not_a_failure():
    from taskuary import skilldiscovery as d
    s = MemoryStore()
    try:
        tid = finished(s)
        result = d.analyze(s, llm=lambda *a, **k: '{"candidates":[]}Analysis complete.')
        assert result['state'] == 'empty' and result['error'] is None
        assert state.rows(s, 'candidate') == []
        assert s.get_task(tid)['Status'] == 'done'
    finally: s.close()


def test_wrapped_answer_cannot_partially_save_candidates_with_forged_evidence():
    from taskuary import skilldiscovery as d
    s = MemoryStore()
    try:
        tid = finished(s)
        candidates = json.loads(answer([tid]))['candidates'] + json.loads(answer([99999]))['candidates']
        result = d.analyze(s, llm=lambda *a, **k: 'Findings:\n' + json.dumps({'candidates': candidates}) + '\nAnalysis complete.')
        assert result['state'] == 'failed' and result['error']
        assert state.rows(s, 'candidate') == []
        assert s.get_task(tid)['Status'] == 'done'
    finally: s.close()


def test_generation_and_stranger_tasks_are_excluded_before_model_input(monkeypatch):
    from taskuary import skilldiscovery as d, origin
    s = MemoryStore()
    try:
        normal, generated, untrusted = finished(s), finished(s, 'Generate a Skill'), finished(s, 'Untrusted work')
        state.create(s, 'generation', {'task_id': generated, 'state': 'published'})
        monkeypatch.setattr(origin, 'of_task', lambda store, tid: ('stranger' if tid == untrusted else 'owner', 'fixture'))
        evidence = d.gather(s)['evidence']
        assert {e['task_id'] for e in evidence} == {normal}
    finally: s.close()


def test_update_candidate_uses_the_registered_revision_and_new_source_ids():
    from taskuary import skilldiscovery as d
    s = MemoryStore()
    try:
        tid = finished(s)
        state.create(s, 'package', {'slug': 'taskuary-reconcile', 'description': 'Reconcile data', 'digest': 'registered'}, key='taskuary-reconcile')
        result = d.analyze(s, llm=lambda *a, **k: answer([tid], action='update', target_digest='registered'))
        assert result['state'] == 'ready'
        c = state.rows(s, 'candidate')[0]
        assert c['target_digest'] == 'registered' and c['evidence'][0]['task_id'] == tid
        assert c['evidence'][0]['ref'] == f'TQ-{tid:04d}'
    finally: s.close()


def test_analysis_single_flights_and_does_not_hold_the_store_writer_during_ai():
    import threading
    from taskuary import skilldiscovery as d
    s = MemoryStore()
    entered, release, written = threading.Event(), threading.Event(), threading.Event()
    result = []
    tid = finished(s)
    def provider(*args, **kwargs):
        entered.set()
        assert release.wait(5)
        return answer([tid])
    thread = threading.Thread(target=lambda: result.append(d.analyze(s, llm=provider)))
    writer = threading.Thread(target=lambda: (s.create_task({'Title': 'Existing work remains writable', 'Source': 'manual'}, 'owner'), written.set()))
    try:
        thread.start()
        assert entered.wait(5)
        writer.start()
        assert written.wait(5)
        duplicate = d.analyze(s, llm=lambda *a, **k: (_ for _ in ()).throw(AssertionError('second model call')))
        assert duplicate['state'] == 'running'
    finally:
        release.set(); thread.join(5)
        if writer.ident: writer.join(5)
    try:
        assert result[0]['state'] == 'ready'
        assert len(state.rows(s, 'candidate')) == 1
    finally: s.close()


def test_existing_work_never_starts_discovery_until_the_owner_enables_it():
    from taskuary import skilldiscovery as d
    s = MemoryStore()
    try:
        tid = finished(s)
        with mock.patch.object(d.threading, 'Thread'):
            d.tick(s)
            assert state.rows(s, 'analysis') == []
            d.schedule(s, manual=True)
            assert state.by_key(s, 'analysis', 'current')['auto_enabled'] is True
            d.pause(s)
        assert state.by_key(s, 'analysis', 'current')['auto_enabled'] is False
        assert s.get_task(tid)['Status'] == 'done'
    finally: s.close()


def test_paused_interrupted_analysis_is_recoverable_without_starting_another_model():
    from taskuary import skilldiscovery as d
    s = MemoryStore()
    try:
        state.create(s, 'analysis', {'state': 'running', 'auto_enabled': False, 'pid': -1, 'instance': 'old', 'run_token': 'old'}, key='current')
        with mock.patch.object(d.threading, 'Thread'):
            d.tick(s)
        current = state.by_key(s, 'analysis', 'current')
        assert current['state'] == 'interrupted' and current['auto_enabled'] is False
        assert state.rows(s, 'candidate') == []
    finally: s.close()


def test_changed_published_base_allows_a_fresh_update_recommendation():
    from taskuary import skilldiscovery as d
    s = MemoryStore()
    try:
        tid = finished(s)
        registered = state.create(s, 'package', {'slug': 'taskuary-reconcile', 'description': 'Compare reports', 'digest': 'first'}, key='taskuary-reconcile')
        d.analyze(s, llm=lambda *a, **k: answer([tid], action='update', target_digest='first'))
        prior = state.rows(s, 'candidate')[0]
        state.update(s, 'candidate', prior['id'], {'state': 'accepted'})
        state.update(s, 'package', registered['id'], {'digest': 'second'})
        d.analyze(s, llm=lambda *a, **k: answer([tid], action='update', target_digest='second'))
        assert any(c['state'] == 'suggested' and c['target_digest'] == 'second' for c in state.rows(s, 'candidate'))
    finally: s.close()


def test_long_transcript_keeps_results_corrections_and_artifacts_in_model_input():
    from taskuary import skilldiscovery as d
    s = MemoryStore()
    try:
        tid = finished(s)
        s.add_transcript(tid, 'fixture-session', 'Checking files\n' * 1000 + 'Verified duplicate-key validation with synthetic rows.')
        s.add_comment(tid, 'owner', 'human', 'Reject duplicate keys before calculating differences.')
        s.add_comment(tid, 'coder', 'agent', 'AGENT REPORT\nSummary: Validated the exported differences with synthetic inputs.')
        s.add_task_artifact({'TaskId':tid, 'Name':'duplicate-key-check.py', 'Kind':'script'})
        def provider(system, user, **kwargs):
            evidence = json.loads(user)['evidence'][0]
            process = evidence['process']
            assert isinstance(process, dict)
            assert 'synthetic rows' in process['transcript']
            assert 'Reject duplicate keys' in process['corrections'][0]['Body']
            assert process['artifacts'][0]['Name'] == 'duplicate-key-check.py'
            assert 'synthetic inputs' in process['report']['summary']
            assert 'verified the differences' in process['runs'][0]['Result']
            assert len(json.dumps(process)) < 6000
            return answer([tid])
        result = d.analyze(s, llm=provider)
        assert result['state'] == 'ready', result
        assert result['evidence_count'] == 1
        assert result['analyzed_at']
        assert state.rows(s, 'candidate')[0]['evidence'][0]['task_id'] == tid
    finally: s.close()


def test_saved_agent_report_is_work_evidence_without_a_transcript_or_run():
    from taskuary import skilldiscovery as d
    s = MemoryStore()
    try:
        tid = s.create_task({'Title':'Validate export keys', 'Source':'manual', 'Status':'done'}, 'owner')
        s.add_comment(tid, 'coder', 'agent', 'AGENT REPORT\nSummary: Checked duplicate identifiers with synthetic exports.')
        def provider(system, user, **kwargs):
            evidence = json.loads(user)['evidence']
            assert [e['task_id'] for e in evidence] == [tid]
            assert 'synthetic exports' in evidence[0]['process']['report']['summary']
            return answer([tid])
        assert d.analyze(s, llm=provider)['state'] == 'ready'
        assert state.rows(s, 'candidate')[0]['evidence'][0]['task_id'] == tid
    finally: s.close()


def test_no_work_evidence_is_distinct_from_an_actual_empty_ai_analysis():
    from taskuary import skilldiscovery as d
    s = MemoryStore()
    try:
        s.create_task({'Title':'Filed work with no saved result', 'Source':'manual', 'Status':'done'}, 'owner')
        provider = mock.Mock(side_effect=AssertionError('no model call without work evidence'))
        result = d.analyze(s, llm=provider)
        assert (result['state'], result['evidence_count']) == ('no_evidence', 0)
        provider.assert_not_called()
        assert not result.get('analyzed_at')
        finished(s)
        result = d.analyze(s, llm=lambda *a, **k: '{"candidates":[]}')
        assert (result['state'], result['evidence_count']) == ('empty', 1)
        assert result['analyzed_at']
        with mock.patch('taskuary.llm.build_llm', side_effect=AssertionError('unchanged evidence is not analyzed again')):
            reused = d._perform(s, d._claim(s)[0], None, manual=False)
        assert (reused['state'], reused['evidence_count'], reused['analyzed_at']) == ('empty', 1, result['analyzed_at'])
    finally: s.close()
