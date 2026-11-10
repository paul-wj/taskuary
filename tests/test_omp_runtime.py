"""OMP's documented event stream and exact task-session boundaries."""
import io
import json
from types import SimpleNamespace
from unittest import mock

import pytest
from fastapi.testclient import TestClient

from taskuary import acp, agents, cli_connections, clis, sessionfiles, sessionrecord, terminal
from taskuary.store import MemoryStore


@pytest.fixture
def verified_acp_file(tmp_path, monkeypatch):
    path = tmp_path / 'session.jsonl'
    path.write_text('{}\n', encoding='utf-8')
    monkeypatch.setattr(sessionfiles, 'omp_acp_file', lambda *_: str(path))
    monkeypatch.setattr(sessionfiles, 'omp_acp_checkpoint', lambda *_: set())
    monkeypatch.setattr(sessionfiles, 'omp_acp_outcome', lambda *_: ('stop', ''))


def _events(*events):
    return [json.dumps(e) + '\n' for e in events]


def _run(events, returncode=0, resume=None):
    seen, traces = {}, []
    class Process:
        stdin = io.StringIO()
        stdout = iter(events)
        stderr = io.StringIO('')
        def __init__(self): self.returncode = returncode
        def wait(self, timeout=None): return self.returncode
        def poll(self): return self.returncode
        def kill(self): pass
    def popen(cmd, **kwargs):
        seen['cmd'] = cmd
        return Process()
    with mock.patch.object(agents, '_resolve_cmd', return_value=['omp']), \
         mock.patch.object(agents, '_git', return_value=''), \
         mock.patch('taskuary.spawn.popen', side_effect=popen):
        result = agents.run_cli({'cmd': 'omp', 'model': 'vendor/model'}, 'hello', lambda *x: traces.append(x), resume=resume)
    return result, traces, seen['cmd']


def test_omp_headless_stream_returns_latest_answer_session_and_tool_progress():
    events = _events(
        {'type': 'session', 'id': 'thread-123', 'version': 3},
        {'type': 'message_update', 'assistantMessageEvent': {'type': 'thinking_delta', 'delta': 'Inspecting'}},
        {'type': 'tool_execution_start', 'toolCallId': 't1', 'toolName': 'read', 'args': {'path': 'a.txt'}},
        {'type': 'tool_execution_end', 'toolCallId': 't1', 'toolName': 'read', 'result': {'content': [{'type': 'text', 'text': 'contents'}]}, 'isError': False},
        {'type': 'message_end', 'message': {'role': 'assistant', 'content': [{'type': 'text', 'text': 'Earlier'}], 'stopReason': 'toolUse'}},
        {'type': 'message_end', 'message': {'role': 'assistant', 'content': [{'type': 'text', 'text': 'Finished'}], 'stopReason': 'stop'}},
        {'type': 'agent_end', 'messages': [], 'isTerminal': True, 'yielded': True})
    (text, sid, _), trace, cmd = _run(events, resume='old-thread')
    assert (text, sid) == ('Finished', 'thread-123')
    assert ['--resume', 'old-thread'] == cmd[cmd.index('--resume'):cmd.index('--resume') + 2]
    assert '--wait-async' in cmd and cmd[cmd.index('--model') + 1] == 'vendor/model'
    assert ('tool_call', 'read', {'tool_call_id': 't1', 'args': {'path': 'a.txt'}}) in trace
    assert any(e[0] == 'tool_result' and e[1] == 't1' and 'contents' in e[2]['result'] for e in trace)
    assert ('progress', 'thinking', 'Inspecting') in trace


def test_omp_retry_success_replaces_earlier_provider_failure():
    events = _events(
        {'type': 'session', 'id': 'thread-123'},
        {'type': 'message_end', 'message': {'role': 'assistant', 'content': [], 'stopReason': 'error', 'errorMessage': 'temporary outage'}},
        {'type': 'auto_retry_start', 'attempt': 1, 'maxAttempts': 2},
        {'type': 'auto_retry_end', 'success': True, 'attempt': 1},
        {'type': 'message_end', 'message': {'role': 'assistant', 'content': [{'type': 'text', 'text': 'Recovered'}], 'stopReason': 'stop'}},
        {'type': 'agent_end', 'messages': [], 'isTerminal': True, 'yielded': True})
    assert _run(events)[0][:2] == ('Recovered', 'thread-123')


def test_omp_narration_is_an_answer_but_private_thinking_is_not():
    events = _events(
        {'type': 'session', 'id': 'thread-123'},
        {'type': 'message_end', 'message': {'role': 'assistant', 'content': [
            {'type': 'thinking', 'thinking': 'private thought'},
            {'type': 'thinking', 'thinking': 'Visible narration', 'narration': True}], 'stopReason': 'stop'}},
        {'type': 'agent_end', 'messages': [], 'isTerminal': True, 'yielded': True})
    assert _run(events)[0][:2] == ('Visible narration', 'thread-123')


def test_unavailable_error_after_side_effect_is_not_retried_on_another_brain():
    from taskuary.clipool import MID_TURN
    assert not agents.availability_failure(RuntimeError(f'provider rate limit: {MID_TURN}'))


def test_omp_headless_failure_after_start_is_not_replayed_as_unavailable():
    events = _events({'type': 'session', 'id': 's'},
                     {'type': 'message_end', 'message': {'role': 'assistant', 'stopReason': 'error', 'errorMessage': 'provider rate limit', 'content': []}},
                     {'type': 'agent_end', 'messages': [], 'isTerminal': True})
    with pytest.raises(RuntimeError) as error: _run(events, resume='existing')
    assert not agents.availability_failure(error.value)


def test_omp_headless_failure_keeps_session_header_identity():
    events = _events({'type': 'session', 'id': 'new-thread'},
                     {'type': 'message_end', 'message': {'role': 'assistant', 'stopReason': 'error', 'errorMessage': 'failed', 'content': []}},
                     {'type': 'agent_end', 'messages': [], 'isTerminal': True})
    with pytest.raises(agents.OmpTurnError) as error: _run(events)
    assert error.value.session_id == 'new-thread'


def test_omp_cancel_reports_failed_descendant_cleanup():
    import threading
    done, cancel = threading.Event(), threading.Event()
    cancel.set()
    class Output:
        def __iter__(self):
            assert done.wait(5)
            return iter(())
    class Process:
        stdin, stdout, stderr, returncode = io.StringIO(), Output(), io.StringIO(), None
        def poll(self): return self.returncode
        def kill(self): self.returncode = -1; done.set()
        def wait(self): return self.returncode
    def fail(_): raise PermissionError('descendant is inaccessible')
    with mock.patch.object(agents, '_resolve_cmd', return_value=['omp']), mock.patch.object(agents, '_git', return_value=''), \
         mock.patch('taskuary.spawn.popen', return_value=Process()), mock.patch('taskuary.spawn.stop_tree', side_effect=fail):
        with pytest.raises(RuntimeError, match='descendant is inaccessible'):
            agents.run_cli({'cmd': 'omp'}, 'hello', lambda *args: None, cancel=cancel)


def test_omp_terminal_wrapper_stops_descendants_by_configured_family(tmp_path):
    class Pty:
        def __init__(self, argv, cwd, rows, cols, env, strict, family=''):
            self.family, self.child_alive = family, True
        def read(self): return ''
        def kill(self):
            if self.family == 'omp': self.child_alive = False
    with mock.patch.object(terminal, '_WinPty' if __import__('os').name == 'nt' else '_UnixPty', Pty):
        import sys
        from pathlib import Path
        term = terminal.Term([sys.executable, str(Path(__file__).parent / 'fake_acp_server.py')], str(tmp_path), 'coding', cli='omp')
        term.pty.kill()
    assert not term.pty.child_alive


def test_omp_terminal_close_reports_failed_descendant_cleanup():
    pty = terminal._UnixPty.__new__(terminal._UnixPty)
    pty.p, pty._tree = mock.MagicMock(), True
    with mock.patch('taskuary.spawn.stop_tree', side_effect=PermissionError('descendant is inaccessible')):
        with pytest.raises(PermissionError, match='descendant is inaccessible'): pty.kill()


def test_terminal_close_releases_waiters_even_when_process_cleanup_fails():
    term = terminal.Term.__new__(terminal.Term)
    released = []
    term.keep = lambda: None
    term.release_asks = lambda: released.append('released')
    term._emit = lambda event: released.append(event)
    term.pty = type('BrokenPty', (), {'kill': lambda self: (_ for _ in ()).throw(PermissionError('cleanup failed'))})()
    with pytest.raises(PermissionError, match='cleanup failed'): term.close()
    assert released == ['released', None]


@pytest.mark.parametrize('route', ['terminal', 'task'])
def test_stop_api_reports_cleanup_failure_without_claiming_the_task_stopped(route):
    from fastapi.testclient import TestClient
    from taskuary import server
    store = MemoryStore()
    tid = store.create_task({'Title': 'Synthetic work', 'Kind': 'coding', 'Status': 'in_progress'}, 'owner')
    class BrokenSession:
        sid, alive, task_id, agent, label = 'broken', True, tid, 'coding', 'coding'
        def close(self): raise RuntimeError('descendant is inaccessible')
    with mock.patch.object(server, 'store', store), mock.patch.object(server, '_refresh_chat_context'), \
         mock.patch.dict(terminal.SESSIONS, {'broken': BrokenSession()}, clear=True):
        client = TestClient(server.app, raise_server_exceptions=False)
        response = (client.delete('/api/terminals/broken') if route == 'terminal'
                    else client.post(f'/api/tasks/{tid}/agent/stop'))
    assert response.status_code == 503
    assert 'descendant is inaccessible' in response.json()['detail']
    assert store.get_task(tid)['Status'] == 'in_progress'
    assert not any('nobody is working' in str(c.get('Content') or '') for c in store.list_comments(tid))


def test_omp_acp_close_reports_failed_descendant_cleanup():
    client = acp.ACPClient.__new__(acp.ACPClient)
    client.p = mock.MagicMock()
    client.p._taskuary_tree = True
    client.p.poll.return_value = None
    with mock.patch('taskuary.spawn.stop_tree', side_effect=PermissionError('descendant is inaccessible')):
        with pytest.raises(RuntimeError, match='descendant is inaccessible'): client.close()


@pytest.mark.parametrize('reason,answer,raises', [
    ('error', 'The provider could not complete the request.', True),
    ('stop', 'Rate limit is a concept worth studying.', False),
])
def test_omp_acp_uses_native_turn_outcome_not_answer_wording(tmp_path, reason, answer, raises):
    session_id = '01a1a090-8fe1-7309-9960-414997341bff'
    agent_dir = tmp_path / 'agent'
    folder = agent_dir / 'sessions' / '-workspace'
    folder.mkdir(parents=True)
    transcript = folder / f'2026-01-01T00-00-00-000Z_{session_id}.jsonl'
    transcript.write_text(json.dumps({'type': 'session', 'id': session_id}) + '\n', encoding='utf-8')
    client = mock.MagicMock()
    client.connect.return_value = {'loadSession': True}
    client.session_id, client.permission_denied = session_id, False
    def prompt(_):
        row = {'type': 'message', 'id': 'new-turn', 'message': {'role': 'assistant', 'stopReason': reason,
               'errorMessage': 'upstream failed' if reason == 'error' else None,
               'content': [{'type': 'text', 'text': answer}]}}
        with transcript.open('a', encoding='utf-8') as f: f.write(json.dumps(row) + '\n')
        return 'end_turn', answer
    client.prompt.side_effect = prompt
    with mock.patch.object(agents, '_resolve_cmd', return_value=['omp']), mock.patch.object(agents, '_git', return_value=''), \
         mock.patch.object(acp, 'ACPClient', return_value=client):
        if raises:
            with pytest.raises(RuntimeError, match='upstream failed'):
                agents.run_acp({'cmd': 'omp', 'acp': ['acp']}, 'act', lambda *a: None,
                               extra_env={'PI_CODING_AGENT_DIR': str(agent_dir)})
        else:
            result = agents.run_acp({'cmd': 'omp', 'acp': ['acp']}, 'act', lambda *a: None,
                                    extra_env={'PI_CODING_AGENT_DIR': str(agent_dir)})
            assert result[:2] == (answer, session_id)


def test_omp_acp_relative_agent_directory_is_resolved_from_child_cwd(tmp_path, monkeypatch):
    session_id = '01a1a090-8fe1-7309-9960-414997341bff'
    server, child = tmp_path / 'server', tmp_path / 'child'
    server.mkdir(); child.mkdir()
    files = []
    for root in (server, child):
        folder = root / 'relative-agent' / 'sessions' / '-workspace'
        folder.mkdir(parents=True)
        path = folder / f'2026-01-01T00-00-00-000Z_{session_id}.jsonl'
        path.write_text(json.dumps({'type': 'session', 'id': session_id}) + '\n', encoding='utf-8')
        files.append(path)
    monkeypatch.chdir(server)
    client = mock.MagicMock()
    client.connect.return_value = {'loadSession': True}
    client.session_id, client.permission_denied = session_id, False
    def prompt(_):
        row = {'type': 'message', 'id': 'new', 'message': {'role': 'assistant', 'stopReason': 'stop'}}
        with files[1].open('a', encoding='utf-8') as f: f.write(json.dumps(row) + '\n')
        return 'end_turn', 'child answer'
    client.prompt.side_effect = prompt
    with mock.patch.object(agents, '_resolve_cmd', return_value=['omp']), mock.patch.object(agents, '_git', return_value=''), \
         mock.patch.object(acp, 'ACPClient', return_value=client):
        result = agents.run_acp({'cmd': 'omp', 'acp': ['acp'], 'cwd': str(child)}, 'act', lambda *a: None,
                                extra_env={'PI_CODING_AGENT_DIR': 'relative-agent'})
    assert result[:2] == ('child answer', session_id)


def test_omp_acp_verifies_resumed_turn_when_session_journal_is_rewritten(tmp_path):
    session_id = '01a1a090-8fe1-7309-9960-414997341bff'
    agent_dir = tmp_path / 'agent'
    folder = agent_dir / 'sessions' / '-workspace'
    folder.mkdir(parents=True)
    transcript = folder / f'2026-01-01T00-00-00-000Z_{session_id}.jsonl'
    header = {'type': 'session', 'id': session_id}
    old = {'type': 'message', 'id': 'old', 'message': {'role': 'assistant', 'stopReason': 'stop', 'content': [{'type': 'text', 'text': 'old'}]}}
    transcript.write_text('\n'.join(map(json.dumps, [header, old, {'type': 'custom', 'id': 'padding', 'data': 'x' * 5000}])) + '\n', encoding='utf-8')
    client = mock.MagicMock()
    client.connect.return_value = {'loadSession': True}
    client.session_id, client.permission_denied = session_id, False
    def prompt(_):
        new = {'type': 'message', 'id': 'new', 'message': {'role': 'assistant', 'stopReason': 'stop', 'content': [{'type': 'text', 'text': 'new'}]}}
        transcript.write_text('\n'.join(map(json.dumps, [header, old, {'type': 'custom', 'id': 'padding', 'data': ''}, new])) + '\n', encoding='utf-8')
        return 'end_turn', 'new'
    client.prompt.side_effect = prompt
    with mock.patch.object(agents, '_resolve_cmd', return_value=['omp']), mock.patch.object(agents, '_git', return_value=''), \
         mock.patch.object(acp, 'ACPClient', return_value=client):
        result = agents.run_acp({'cmd': 'omp', 'acp': ['acp']}, 'act', lambda *a: None, resume=session_id,
                                extra_env={'PI_CODING_AGENT_DIR': str(agent_dir)})
    assert result[:2] == ('new', session_id)


def test_omp_acp_rejects_journal_rewrite_that_lost_its_anchor(tmp_path):
    session_id = '01a1a090-8fe1-7309-9960-414997341bff'
    agent_dir = tmp_path / 'agent'
    folder = agent_dir / 'sessions' / '-workspace'
    folder.mkdir(parents=True)
    transcript = folder / f'2026-01-01T00-00-00-000Z_{session_id}.jsonl'
    header = {'type': 'session', 'id': session_id}
    old = {'type': 'message', 'id': 'old', 'message': {'role': 'assistant', 'stopReason': 'stop'}}
    transcript.write_text('\n'.join(map(json.dumps, [header, old])) + '\n', encoding='utf-8')
    client = mock.MagicMock()
    client.connect.return_value = {'loadSession': True}
    client.session_id, client.permission_denied = session_id, False
    def prompt(_):
        new = {'type': 'message', 'id': 'new', 'message': {'role': 'assistant', 'stopReason': 'stop'}}
        transcript.write_text('\n'.join(map(json.dumps, [header, new])) + '\n', encoding='utf-8')
        return 'end_turn', 'answer'
    client.prompt.side_effect = prompt
    with mock.patch.object(agents, '_resolve_cmd', return_value=['omp']), mock.patch.object(agents, '_git', return_value=''), \
         mock.patch.object(acp, 'ACPClient', return_value=client):
        with pytest.raises(RuntimeError, match='unverified'):
            agents.run_acp({'cmd': 'omp', 'acp': ['acp']}, 'act', lambda *a: None, resume=session_id,
                           extra_env={'PI_CODING_AGENT_DIR': str(agent_dir)})


def test_omp_acp_cannot_reuse_a_previous_success_as_current_outcome(tmp_path):
    session_id = '01a1a090-8fe1-7309-9960-414997341bff'
    agent_dir = tmp_path / 'agent'
    folder = agent_dir / 'sessions' / '-workspace'
    folder.mkdir(parents=True)
    transcript = folder / f'2026-01-01T00-00-00-000Z_{session_id}.jsonl'
    transcript.write_text('\n'.join(json.dumps(x) for x in [
        {'type': 'session', 'id': session_id},
        {'type': 'message', 'id': 'old', 'message': {'role': 'assistant', 'stopReason': 'stop', 'content': [{'type': 'text', 'text': 'old answer'}]}}
    ]) + '\n', encoding='utf-8')
    client = mock.MagicMock()
    client.connect.return_value = {'loadSession': True}
    client.session_id, client.permission_denied = session_id, False
    client.prompt.return_value = ('end_turn', 'provider failure')
    with mock.patch.object(agents, '_resolve_cmd', return_value=['omp']), mock.patch.object(agents, '_git', return_value=''), \
         mock.patch.object(acp, 'ACPClient', return_value=client):
        with pytest.raises(RuntimeError, match='unverified'):
            agents.run_acp({'cmd': 'omp', 'acp': ['acp']}, 'act', lambda *a: None, resume=session_id,
                           extra_env={'PI_CODING_AGENT_DIR': str(agent_dir)})


@pytest.mark.parametrize('events', [
    [],
    ['{truncated\n'],
    _events({'type': 'session', 'id': 's'}, {'type': 'message_end', 'message': {'role': 'assistant', 'content': [{'type': 'text', 'text': 'partial'}], 'stopReason': 'aborted', 'errorMessage': 'Deadline exceeded'}}, {'type': 'agent_end', 'messages': []}),
    _events({'type': 'session', 'id': 's'}, {'type': 'message_end', 'message': {'role': 'assistant', 'content': [{'type': 'text', 'text': 'partial'}], 'stopReason': 'stop'}}, {'type': 'agent_end', 'messages': [], 'isTerminal': False}),
])
def test_omp_empty_malformed_aborted_and_unfinished_runs_fail(events):
    with pytest.raises(RuntimeError): _run(events)



def test_omp_nonzero_exit_is_not_a_success_even_with_an_answer():
    events = _events({'type': 'session', 'id': 's'},
                     {'type': 'message_end', 'message': {'role': 'assistant', 'content': [{'type': 'text', 'text': 'partial'}], 'stopReason': 'stop'}},
                     {'type': 'agent_end', 'messages': [], 'isTerminal': True, 'yielded': True})
    with pytest.raises(RuntimeError, match='exit 1'): _run(events, returncode=1)


def test_omp_custom_headless_flags_keep_json_and_background_wait():
    event = {'type': 'message_end', 'message': {'role': 'assistant', 'content': [{'type': 'text', 'text': 'ok'}], 'stopReason': 'stop'}}
    seen = {}
    class Process:
        stdin = io.StringIO()
        stdout = iter(_events({'type': 'session', 'id': 's'}, event, {'type': 'agent_end', 'messages': [], 'isTerminal': True}))
        stderr, returncode = io.StringIO(), 0
        def wait(self): return 0
        def poll(self): return 0
    def popen(cmd, **kwargs):
        seen['cmd'] = cmd
        return Process()
    with mock.patch.object(agents, '_resolve_cmd', return_value=['omp']), mock.patch.object(agents, '_git', return_value=''), \
         mock.patch('taskuary.spawn.popen', side_effect=popen):
        result = agents.run_cli({'cmd': 'omp', 'args': ['-p', '--no-title']}, 'hello', lambda *args: None)
    assert result[:2] == ('ok', 's')
    assert seen['cmd'][seen['cmd'].index('--mode') + 1] == 'json'
    assert '--wait-async' in seen['cmd'] and '--no-title' in seen['cmd']

def test_omp_model_selector_with_at_is_preserved_in_all_launch_modes(verified_acp_file):
    profile = {'cmd': 'omp', 'model': 'synthetic/model@revision', 'acp': ['acp']}
    def launch(cmd, args, **kwargs):
        chosen = args[args.index('--model') + 1]
        client = mock.MagicMock()
        client.connect.return_value = {'loadSession': True}
        client.session_id, client.permission_denied = 's', False
        client.prompt.return_value = ('end_turn', chosen)
        return client
    with mock.patch.object(agents, '_resolve_cmd', return_value=['omp']), mock.patch.object(agents, '_git', return_value=''), \
         mock.patch.object(acp, 'ACPClient', side_effect=launch):
        assert agents._model_args(profile, 'omp') == ['--model', 'synthetic/model@revision']
        assert terminal.agent_argv(profile)[-2:] == ['--model', 'synthetic/model@revision']
        assert agents.run_acp(profile, 'hi', lambda *args: None)[0] == 'synthetic/model@revision'


def test_omp_tui_preserves_model_but_drops_print_flags_and_submits_prompt(monkeypatch):
    monkeypatch.setattr(agents, '_resolve_cmd', lambda _: ['omp'])
    profile = {'cmd': r'C:\tools\omp.exe', 'model': 'vendor/model'}
    argv = terminal.agent_argv(profile)
    assert '--mode' not in argv and '--wait-async' not in argv and '-p' not in argv
    assert argv[-2:] == ['--model', 'vendor/model']
    assert terminal.seed_argv(profile, 'models are useful') == ['--', 'models are useful']


def test_omp_exact_session_file_is_confined_to_this_pane(tmp_path):
    one, two = tmp_path / 'one', tmp_path / 'two'
    one.mkdir(); two.mkdir()
    header = lambda sid: json.dumps({'type': 'session', 'version': 3, 'id': sid, 'cwd': str(tmp_path)}) + '\n'
    a = one / 'a.jsonl'; b = two / 'b.jsonl'
    a.write_text(header('one'), encoding='utf-8'); b.write_text(header('two'), encoding='utf-8')
    assert sessionfiles.omp_file(one) == str(a)
    assert sessionfiles.omp_file(two) == str(b)
    (one / 'ambiguous.jsonl').write_text(header('three'), encoding='utf-8')
    assert sessionfiles.omp_file(one) == ''


def test_omp_log_steps_and_usage_follow_the_bound_session_file(tmp_path):
    f = tmp_path / 'omp.jsonl'
    f.write_text('\n'.join(json.dumps(x) for x in [
        {'type': 'session', 'id': 'one'},
        {'type': 'message', 'timestamp': '2026-01-01T10:00:00Z', 'message': {'role': 'user', 'content': [{'type': 'text', 'text': 'Please inspect'}]}},
        {'type': 'message', 'timestamp': '2026-01-01T10:00:01Z', 'message': {'role': 'assistant', 'content': [{'type': 'thinking', 'thinking': 'Looking'}, {'type': 'toolCall', 'name': 'read', 'arguments': {'path': 'a.txt'}}, {'type': 'text', 'text': 'Done'}], 'usage': {'input': 10, 'output': 4, 'cacheRead': 2, 'cacheWrite': 1, 'cost': {'total': 0.01}}}},
    ]) + '\n', encoding='utf-8')
    steps, source = sessionrecord.cli_steps('omp', str(f))
    assert [s['k'] for s in steps] == ['you', 'thought', 'tool', 'said']
    assert steps[2]['text'] == 'a.txt' and source
    assert sessionrecord.cli_usage('omp', str(f)) == {'in': 13, 'cached': 2, 'out': 4, 'cost': 0.01}


def test_omp_session_record_shows_narration_as_answer(tmp_path):
    f = tmp_path / 'omp.jsonl'
    row = {'type': 'message', 'message': {'role': 'assistant', 'content': [
        {'type': 'thinking', 'thinking': 'private'},
        {'type': 'thinking', 'thinking': 'Public narration', 'narration': True}]}}
    f.write_text(json.dumps(row) + '\n', encoding='utf-8')
    steps, _ = sessionrecord.cli_steps('omp', str(f))
    assert [(s['k'], s['text']) for s in steps] == [('thought', 'private'), ('said', 'Public narration')]


def test_omp_acp_permission_refuses_even_when_allow_is_offered():
    client = acp.ACPClient.__new__(acp.ACPClient)
    client.permission_policy = 'deny'
    assert client._permit({'options': [{'kind': 'allow_once', 'optionId': 'yes'}]}) == {'outcome': 'cancelled'}


def test_omp_acp_resume_never_silently_opens_a_new_session():
    fake = mock.MagicMock()
    fake.connect.return_value = {'loadSession': False}
    with mock.patch.object(agents, '_resolve_cmd', return_value=['omp']), mock.patch.object(agents, '_git', return_value=''), \
         mock.patch.object(acp, 'ACPClient', return_value=fake):
        with pytest.raises(RuntimeError, match='session'): agents.run_acp({'cmd': 'omp', 'acp': ['acp']}, 'hi', lambda *a: None, resume='old')
    fake.new_session.assert_not_called()



def test_omp_acp_client_rejects_real_permission_request():
    import sys
    from pathlib import Path
    script = str(Path(__file__).parent / 'fake_acp_server.py')
    client = acp.ACPClient(sys.executable, [script], timeout=10, permission_policy='deny')
    try:
        client.connect()
        client.new_session(str(Path(__file__).parent))
        stop, _ = client.prompt('synthetic request')
        assert stop == 'end_turn'
        assert client.permission_denied
    finally:
        client.close()


def test_omp_acp_denied_permission_is_not_reported_as_success(verified_acp_file):
    fake = mock.MagicMock()
    fake.connect.return_value = {'loadSession': True}
    fake.prompt.return_value = ('end_turn', 'All done')
    fake.permission_denied = True
    with mock.patch.object(agents, '_resolve_cmd', return_value=['omp']), mock.patch.object(agents, '_git', return_value=''), \
         mock.patch.object(acp, 'ACPClient', return_value=fake):
        with pytest.raises(RuntimeError, match='permission'):
            agents.run_acp({'cmd': 'omp', 'acp': ['acp']}, 'make a change', lambda *a: None)



@pytest.mark.parametrize('stop,answer,sid', [
    ('max_tokens', 'partial', 'session-1'),
    ('end_turn', '', 'session-1'),
    ('end_turn', 'answer', None),
])
def test_omp_acp_incomplete_turn_is_not_success(stop, answer, sid, verified_acp_file):
    fake = mock.MagicMock()
    fake.connect.return_value = {'loadSession': True}
    fake.prompt.return_value = (stop, answer)
    fake.session_id, fake.permission_denied = sid, False
    with mock.patch.object(agents, '_resolve_cmd', return_value=['omp']), mock.patch.object(agents, '_git', return_value=''), \
         mock.patch.object(acp, 'ACPClient', return_value=fake):
        with pytest.raises(RuntimeError):
            agents.run_acp({'cmd': 'omp', 'acp': ['acp']}, 'make a change', lambda *a: None)


def test_omp_acp_does_not_leave_background_work_unobserved(verified_acp_file):
    from pathlib import Path
    def launch(cmd, args, **kwargs):
        overlay = next((Path(args[i + 1]) for i, value in enumerate(args[:-1]) if value == '--config'), None)
        settings = json.loads(overlay.read_text(encoding='utf-8')) if overlay else {}
        client = mock.MagicMock()
        client.connect.return_value = {'loadSession': True}
        client.permission_denied = False
        client.session_id = 'session-1'
        if settings.get('async', {}).get('enabled') is False:
            client.prompt.return_value = ('end_turn', 'foreground work completed')
        else:
            client.prompt.return_value = ('end_turn', '')
        return client
    with mock.patch.object(agents, '_resolve_cmd', return_value=['omp']), mock.patch.object(agents, '_git', return_value=''), \
         mock.patch.object(acp, 'ACPClient', side_effect=launch):
        answer, sid, _ = agents.run_acp({'cmd': 'omp', 'acp': ['acp']}, 'make a change', lambda *a: None)
    assert (answer, sid) == ('foreground work completed', 'session-1')


def test_omp_acp_cleans_overlay_if_process_start_fails():
    from pathlib import Path
    files = []
    def fail(cmd, args, **kwargs):
        if '--config' in args: files.append(Path(args[args.index('--config') + 1]))
        raise FileNotFoundError('cannot start')
    with mock.patch.object(agents, '_resolve_cmd', return_value=['omp']), mock.patch.object(agents, '_git', return_value=''), \
         mock.patch.object(acp, 'ACPClient', side_effect=fail):
        with pytest.raises(FileNotFoundError): agents.run_acp({'cmd': 'omp', 'acp': ['acp']}, 'hello', lambda *a: None)
    assert files and not files[0].exists()


def test_omp_acp_cleans_overlay_after_cancellation(verified_acp_file):
    import threading
    from pathlib import Path
    cancel, files = threading.Event(), []
    def launch(cmd, args, **kwargs):
        files.append(Path(args[args.index('--config') + 1]))
        client = mock.MagicMock()
        client.connect.return_value = {'loadSession': True}
        client.prompt.side_effect = lambda _: (cancel.set() or ('cancelled', ''))
        return client
    with mock.patch.object(agents, '_resolve_cmd', return_value=['omp']), mock.patch.object(agents, '_git', return_value=''), \
         mock.patch.object(acp, 'ACPClient', side_effect=launch):
        with pytest.raises(RuntimeError, match='cancelled'):
            agents.run_acp({'cmd': 'omp', 'acp': ['acp']}, 'hello', lambda *a: None, cancel=cancel)
    assert files and not files[0].exists()


@pytest.mark.parametrize('args', [['acp', '--session-dir', 'somewhere'], ['acp', '--session-dir=somewhere']])
def test_omp_acp_rejects_unresumable_custom_session_directory(args):
    fake = mock.MagicMock()
    fake.connect.return_value = {'loadSession': True}
    fake.prompt.return_value = ('end_turn', 'answer')
    fake.session_id, fake.permission_denied = 's', False
    with mock.patch.object(agents, '_resolve_cmd', return_value=['omp']), mock.patch.object(agents, '_git', return_value=''), \
         mock.patch.object(acp, 'ACPClient', return_value=fake):
        with pytest.raises(ValueError, match='session-dir'):
            agents.run_acp({'cmd': 'omp', 'acp': args}, 'hello', lambda *a: None)
def test_omp_cannot_be_used_for_unverified_restricted_work():
    for restrict in (clis.readonly_args, clis.report_read_args, clis.quick_read_args):
        with pytest.raises(ValueError): restrict(r'C:\tools\omp.exe', [])
    assert 'omp' not in clis.AUTO


def test_connection_edit_keeps_model_and_protocol_fields():
    from taskuary import server
    cfg = {'server': dict(server.cfg['server']), 'agents': {}, 'cli_connections': {'omp': {'cmd': 'omp', 'args': ['-p'], 'model': 'vendor/model', 'light_model': 'vendor/light', 'acp': ['acp', '--custom'], 'model_arg': '--model'}}}
    with mock.patch.object(server, 'cfg', cfg), mock.patch.object(server, 'store', MemoryStore()), mock.patch('taskuary.config.save'):
        response = TestClient(server.app).put('/api/cli/connections/omp', json={'cmd': 'omp', 'args': ['-p', '--no-title']})
    assert response.status_code == 200
    saved = cfg['cli_connections']['omp']
    assert saved['model'] == 'vendor/model' and saved['light_model'] == 'vendor/light'
    assert saved['acp'] == ['acp', '--custom'] and saved['model_arg'] == '--model'


def test_omp_is_found_in_standard_windows_install_without_path(tmp_path, monkeypatch):
    local = tmp_path / 'local'
    exe = local / 'omp' / 'omp.exe'
    exe.parent.mkdir(parents=True)
    exe.write_text('', encoding='utf-8')
    monkeypatch.setenv('LOCALAPPDATA', str(local))
    with mock.patch.object(clis.os if hasattr(clis, 'os') else agents.os, 'name', 'nt'), \
         mock.patch('taskuary.pathcache.which', return_value=None), \
         mock.patch.object(agents, '_fresh_path', return_value=''):
        assert clis.which('omp') == str(exe)
        assert agents._resolve_cmd('omp') == [str(exe)]


def test_missing_explicit_omp_path_never_falls_back_to_another_install(tmp_path, monkeypatch):
    exe = tmp_path / 'local' / 'omp' / 'omp.exe'
    exe.parent.mkdir(parents=True)
    exe.write_text('', encoding='utf-8')
    monkeypatch.setenv('LOCALAPPDATA', str(tmp_path / 'local'))
    missing = str(tmp_path / 'custom' / 'omp.exe')
    with mock.patch.object(agents.os, 'name', 'nt'), \
         mock.patch('taskuary.pathcache.which', side_effect=lambda name, **kw: str(exe) if name == 'omp.exe' else None), \
         mock.patch.object(agents, '_fresh_path', return_value=''):
        assert clis.which(missing) == ''
        with pytest.raises(FileNotFoundError): agents._resolve_cmd(missing)




def test_two_omp_panes_bind_and_resume_their_own_conversations(tmp_path):
    store = MemoryStore()
    store.upsert_agent('coding', 'coding', 'cli', json.dumps({'cmd': 'omp'}))
    tasks = [store.create_task({'Title': f'Synthetic task {i}', 'Kind': 'coding', 'Status': 'in_progress'}, 'owner') for i in range(2)]
    made = []
    def make_term(argv, cwd, label, tid, agent, rows, cols, store, **kw):
        term = SimpleNamespace(argv=argv, cwd=cwd, task_id=tid, agent=agent, store=store,
                               sid=f'pane-{len(made)}', ext_id='', alive=False, cli='omp',
                               seed=lambda text: None)
        made.append(term)
        return term
    with mock.patch.object(agents, '_resolve_cmd', return_value=['omp']), \
         mock.patch.object(terminal, 'Term', side_effect=make_term), \
         mock.patch.object(sessionfiles.SessionWatch, 'start', autospec=True) as start, \
         mock.patch.dict(terminal.SESSIONS, {}, clear=True):
        for tid in tasks:
            terminal.open_session(store, 'coding', tid, cwd=str(tmp_path), seed_fn=lambda _: 'do the work')
        paths = []
        for i, t in enumerate(made):
            folder = t.argv[t.argv.index('--session-dir') + 1]
            path = __import__('pathlib').Path(folder) / f'{i}.jsonl'
            path.write_text(json.dumps({'type': 'session', 'id': f'own-{i}'}) + '\n', encoding='utf-8')
            paths.append(str(path.resolve()))
        assert paths[0] != paths[1]
        for call in start.call_args_list: call.args[0].run()
        assert [store.resumable_session(tid)['ExtId'] for tid in tasks] == paths
        terminal.open_session(store, 'coding', tasks[0], cwd=str(tmp_path), resume=paths[0])
        assert made[-1].argv[-2:] == ['--resume', paths[0]]


# ── the OMP ACP road: the trace is flushed exactly once, and it does not hide the turn ─────────────────────────────────────────
# The real ACPClient is the stand-in's contract: `on_update` receives session/update events while prompt() runs, and the turn's
# answer is what it said after its last tool call. Nothing else is faked: connect(), new_session(), the native session file, the
# overlay and the process close all run through _run_acp_omp's own roads.

def _omp_acp_client(seen, events, stop='end_turn', answer='all done', fail_prompt=False, fail_close=False,
                    prompt_hook=None):
    """The stand-in behind acp.ACPClient: `on_update` gets the session/update events while prompt() runs; the answer is what
    it said after its last tool call. Nothing else is faked - connect, new_session, the native file, the overlay and the
    close all run through _run_acp_omp's own roads."""
    from pathlib import Path
    def launch(cmd, args, **kwargs):
        overlay = next((Path(args[i + 1]) for i, v in enumerate(args[:-1]) if v == '--config'), None)
        assert json.loads(overlay.read_text(encoding='utf-8')) == {'async': {'enabled': False}}
        client = mock.MagicMock()
        client.connect.return_value = {}
        client.session_id, client.permission_denied = 'omp-session-1', False
        client.p._taskuary_tree = True
        def prompt(_):
            for u in events: kwargs['on_update'](dict(u))
            if prompt_hook: prompt_hook(client)
            if fail_prompt: raise RuntimeError('the provider dropped the turn')
            return stop, answer
        client.prompt.side_effect = prompt
        def close():
            seen['closed'] = True
            if fail_close: raise RuntimeError('the process tree would not die')
        client.close.side_effect = close
        seen['overlay'], seen['client'] = overlay, client
        return client
    return launch


def _omp_acp_run(verified_acp_file, events, stop='end_turn', answer='all done', fail_prompt=False, cancel=None,
                 fail_close=False, fail_flush=False, prompt_hook=None):
    "One OMP turn over run_acp with that stand-in; the traced steps come back for the assertions."
    traces, seen = [], {}
    launch = _omp_acp_client(seen, events, stop=stop, answer=answer, fail_prompt=fail_prompt,
                             fail_close=fail_close, prompt_hook=prompt_hook)
    seen['flushes'] = 0
    def counting_tracer(trace, name, held=None):
        t = agents.ACPSteps(trace, name, held)
        def flush(stop=None):
            seen['flushes'] += 1
            if fail_flush: raise RuntimeError('the step canvas would not render')
            return agents.ACPSteps.flush(t, stop)
        t.flush = flush
        return t
    with mock.patch.object(agents, '_resolve_cmd', return_value=['omp']), mock.patch.object(agents, '_git', return_value=''), \
         mock.patch.object(acp, 'ACPClient', side_effect=launch), mock.patch.object(agents, 'acp_tracer', side_effect=counting_tracer):
        try: out = agents.run_acp({'cmd': 'omp', 'acp': ['acp']}, 'make the change', lambda *a: traces.append(a), cancel=cancel)
        except Exception as e: out = e
    seen['client'].close.assert_called()                                   # the turn's own connection is always closed
    assert not seen['overlay'].exists()                                    # the foreground-only overlay never leaks
    assert seen['flushes'] == 1                                            # the trace flushes exactly once, on whatever road the turn ended
    return out, traces, seen


OMP_ACP_STEP = {'sessionUpdate': 'tool_call_update', 'toolCallId': 'call-1', 'title': 'Read File', 'kind': 'read',
                'status': 'in_progress', 'rawInput': {'path': 'app.py'}, 'rawOutput': 'file contents',
                'locations': [{'path': 'app.py'}]}
OMP_TRAILING_TEXT = {'sessionUpdate': 'agent_message_chunk', 'content': {'type': 'text', 'text': 'all done'}}


def test_omp_acp_end_turn_flushes_the_open_step_balanced(verified_acp_file):
    """A tool that is still in progress at end_turn, with its rawOutput and the trailing text: the flush closes it as a done
    step with its output, and the trailing words land as the turn's last trace - one flush, nothing left open."""
    out, traces, _ = _omp_acp_run(verified_acp_file, [OMP_ACP_STEP, OMP_TRAILING_TEXT])
    assert (out[0], out[1]) == ('all done', 'omp-session-1')
    tool_calls = [t for t in traces if t[0] == 'tool_call']
    tool_results = [t for t in traces if t[0] == 'tool_result']
    assert len(tool_calls) == 1 and tool_calls[0][1] in ('read', 'Read File')
    assert tool_calls[0][2]['tool_call_id'] == 'call-1' and tool_calls[0][2]['args']['path'] == 'app.py'
    assert len(tool_results) == 1 and tool_results[0][1] == 'call-1'
    assert tool_results[0][2] == {'result': 'file contents', 'is_error': False}
    assert ('progress', 'text', 'all done') in traces                        # the trailing text was traced


def test_omp_acp_failed_turn_ends_the_unfinished_step_failed_and_still_cleans_up(verified_acp_file):
    """A provider failure after the turn has started: the still-open step ends failed (never left to spin), the failure is
    reported as an OmpTurnError with the session's id, and the connection and overlay are still cleaned up."""
    out, traces, _ = _omp_acp_run(verified_acp_file, [OMP_ACP_STEP, OMP_TRAILING_TEXT], fail_prompt=True)
    assert isinstance(out, agents.OmpTurnError) and out.session_id == 'omp-session-1'
    tool_results = [t for t in traces if t[0] == 'tool_result']
    assert len(tool_results) == 1 and tool_results[0][1] == 'call-1'
    assert tool_results[0][2] == {'result': 'file contents', 'is_error': True}
    assert ('progress', 'text', 'all done') in traces


def test_omp_acp_cancelled_turn_ends_the_unfinished_step_failed(verified_acp_file):
    import threading
    cancel = threading.Event()
    def cancel_during_prompt(client):
        client.cancel()
        cancel.set()
    out, traces, _ = _omp_acp_run(verified_acp_file, [OMP_ACP_STEP, OMP_TRAILING_TEXT], cancel=cancel,
                                  prompt_hook=cancel_during_prompt)
    assert isinstance(out, agents.OmpTurnError) and 'cancelled' in str(out)
    assert out.session_id == 'omp-session-1'
    tool_results = [t for t in traces if t[0] == 'tool_result']
    assert len(tool_results) == 1 and tool_results[0][2]['is_error'] is True
    assert ('progress', 'text', 'all done') in traces


def test_omp_acp_flush_failure_does_not_block_cleanup_or_hide_the_turn(verified_acp_file):
    """The flush must be best-effort: when it cannot finish, the turn's own answer is still returned (a trace failure is not
    the provider's), and the connection and the overlay are still cleaned up behind it."""
    out, traces, seen = _omp_acp_run(verified_acp_file, [OMP_ACP_STEP, OMP_TRAILING_TEXT], fail_flush=True)
    assert (out[0], out[1]) == ('all done', 'omp-session-1')
    assert seen['flushes'] == 1
    assert seen['closed'] is True and not seen['overlay'].exists()


def test_omp_acp_close_failure_is_reported_and_does_not_leak_the_overlay(verified_acp_file):
    """When the turn has run but the close fails: the close's failure is the one reported (not swallowed by the trace), and
    the overlay is still removed behind it."""
    out, traces, seen = _omp_acp_run(verified_acp_file, [OMP_ACP_STEP, OMP_TRAILING_TEXT], fail_close=True)
    assert isinstance(out, RuntimeError) and 'the process tree would not die' in str(out)
    assert not seen['overlay'].exists()
    assert any(t[0] == 'tool_result' for t in traces)
