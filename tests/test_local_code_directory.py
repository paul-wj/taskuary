"""Local code binding must validate before changing the selected project."""
import copy, json
from unittest import mock
from fastapi.testclient import TestClient
from taskuary import server
from taskuary.store import MemoryStore


def test_missing_local_directory_preserves_task_selection_and_config(tmp_path):
    s = MemoryStore()
    s.upsert_agent('coding', 'coding', 'cli', json.dumps({'cmd':'omp'}))
    tid = s.create_task({'Title':'Repair export', 'Kind':'coding', 'Tags':'repo:northwind/old held:repo'}, 'test')
    cfg = {**server.cfg, 'agents':{'coding':{'cmd':'omp'}}, 'cli_connections':{'omp':{'cmd':'omp'}}}
    before = copy.deepcopy(cfg)
    with mock.patch.object(server, 'store', s), mock.patch.object(server, 'cfg', cfg):
        response = TestClient(server.app).put(f'/api/tasks/{tid}/repo', json={'repo':'local:folder','path':str(tmp_path/'missing'),'agent':'coding','restart':False})
    assert response.status_code == 422
    assert s.get_task(tid)['Tags'] == 'repo:northwind/old held:repo'
    assert cfg == before


def test_local_directory_binding_preserves_omp_and_starts_no_session(tmp_path):
    s = MemoryStore()
    s.upsert_agent('coding', 'coding', 'cli', json.dumps({'cmd':'omp'}))
    s.set_setting('default_brain', 'omp', 'test')
    tid = s.create_task({'Title':'Repair export', 'Kind':'coding', 'Tags':'held:repo'}, 'test')
    cfg = {**server.cfg, 'agents':{'coding':{'cmd':'omp'}}, 'cli_connections':{'omp':{'cmd':'omp'}}}
    (tmp_path/'source.txt').write_text('unchanged', encoding='utf-8')
    with mock.patch.object(server, 'store', s), mock.patch.object(server, 'cfg', cfg), mock.patch.object(server.config, 'save'), mock.patch.object(server, 'start_session', side_effect=AssertionError('binding started a session')):
        response = TestClient(server.app).put(f'/api/tasks/{tid}/repo', json={'repo':'local:folder', 'path':str(tmp_path), 'agent':'coding', 'restart':False})
    assert response.status_code == 200
    profile = json.loads(s.get_agent('coding')['Config'])
    assert profile['cwd_map']['local:folder'] == str(tmp_path)
    assert profile['cmd'] == 'omp'
    assert s.get_task(tid)['Tags'] == 'repo:local:folder'
    assert (tmp_path/'source.txt').read_text(encoding='utf-8') == 'unchanged'

