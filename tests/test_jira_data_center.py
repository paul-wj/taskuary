"""Company Jira REST v2: real intake, identity and forbidden upstream effects."""
import json
from datetime import datetime, timedelta
from unittest import mock

import pytest
from taskuary import pm, channels, trackers
from taskuary.store import MemoryStore


class Response:
    def __init__(self, data, code=200):
        self.data, self.status_code = data, code
        self.content = json.dumps(data).encode()
        self.text, self.reason = self.content.decode(), 'fixture'
    def json(self): return self.data
    def raise_for_status(self):
        if self.status_code >= 400: raise RuntimeError(f'HTTP {self.status_code}')


def setup(deployment='data_center', base='https://jira.northwind.example/jira'):
    s = MemoryStore()
    cid = s.get_connector_by_type('jira')['ConnectorId']
    s.save_connector({'ConnectorId': cid, 'Active': 1, 'Secret': 'fixture-token',
                      'ConfigJson': json.dumps({'deployment': deployment, 'base_url': base, 'email': 'alex@northwind.example'})}, 'test')
    return s, s.get_connector(cid, with_secret=True)


def issue(n, comments=None):
    return {'key': f'NW-{n}', 'fields': {'summary': f'Export {n}', 'description': 'Repair the export',
            'updated': datetime.now().astimezone().isoformat(), 'status': {'name': 'Open', 'statusCategory': {'key': 'new'}},
            'issuetype': {'name': 'Sub-task' if n % 2 else 'Story'}, 'comment': {'comments': comments or []}}}


class JiraWire:
    def __init__(self, rows=(), denied=False, fail_page=False, owner=None):
        self.rows, self.denied, self.fail_page = list(rows), denied, fail_page
        self.owner = owner or {'key': 'user-alex', 'name': 'alex', 'displayName': 'Alex'}
        self.calls = []
    def __call__(self, method, url, **kw):
        self.calls.append((method, url, kw))
        if method != 'GET': return Response({'id': '9'}, 201)
        if url.endswith('/myself'): return Response(self.owner)
        if url.endswith('/search'):
            if self.denied: return Response({'errorMessages': ['Read denied']}, 403)
            p = kw.get('params') or {}
            start, cap = p.get('startAt', 0), p.get('maxResults', 50)
            if self.fail_page and start: return Response({'errorMessages': ['Page unavailable']}, 503)
            return Response({'issues': self.rows[start:start+cap], 'total': len(self.rows), 'startAt': start, 'maxResults': cap})
        return Response({'fields': {'summary': 'Export', 'status': {'name': 'Open'}}, 'transitions': []})


def wire(fake):
    return mock.patch.multiple(pm.requests, request=fake, get=lambda url, **kw: fake('GET', url, **kw))


def test_dc_authentication_alone_does_not_prove_issue_access():
    s, c = setup(); fake = JiraWire(denied=True)
    with wire(fake), pytest.raises(RuntimeError): pm.test_jira(s, c)
    assert not [x for x in s.list_sources() if x['Channel'] == 'jira']


def test_dc_reads_all_pages_and_repeated_poll_deduplicates():
    s, c = setup(); fake = JiraWire([issue(n) for n in range(1, 28)])
    with wire(fake):
        pm.poll_jira(s, c, datetime.now()-timedelta(hours=1), file_only=True)
        pm.poll_jira(s, c, datetime.now()-timedelta(hours=1), file_only=True)
    rows = s._rows("SELECT ConversationId FROM message WHERE Channel='jira'")
    assert {r['ConversationId'] for r in rows} == {f'jira:NW-{n}' for n in range(1, 28)}
    assert len(rows) == 27


@pytest.mark.parametrize('identifier', ['key', 'name'])
def test_dc_own_comment_is_context(identifier):
    s, c = setup()
    owner = {identifier: 'alex', 'displayName': 'Alex'}
    comments = [{'id': '77', 'author': owner, 'body': 'Working on it', 'created': datetime.now().astimezone().isoformat()}]
    fake = JiraWire([issue(1, comments)], owner=owner)
    with wire(fake): pm.poll_jira(s, c, datetime.now()-timedelta(hours=1), file_only=True)
    assert s.message_by_external('jira:NW-1:c77')['Status'] == 'context'


def test_dc_zero_results_and_normalized_site_link():
    s, c = setup(base='https://jira.northwind.example/jira/rest/api/2/')
    fake = JiraWire()
    with wire(fake): pm.test_jira(s, c)
    assert all('/jira/rest/api/2/rest/api/' not in url for _, url, _ in fake.calls)
    assert any(url.endswith('/jira/rest/api/2/search') for _, url, _ in fake.calls)
    assert [x['Address'] for x in s.list_sources() if x['ConnectorId'] == c['ConnectorId']] == ['jira.northwind.example/jira']


@pytest.mark.parametrize('verb,payload', [('comment', {'body':'Fixed'}), ('move', {'status':'Done'}), ('assign', {'assignee':'Alex'}), ('close', {})])
def test_dc_direct_executor_performs_no_upstream_operation(verb, payload):
    s, c = setup(); fake = JiraWire()
    with wire(fake), pytest.raises(RuntimeError):
        trackers.run('jira_'+verb)({'type':'jira_'+verb, '_card': c, 'item':'NW-1', **payload})
    assert fake.calls == []


def test_dc_later_page_failure_keeps_source_window():
    s, c = setup(); source = s.save_source({'Channel':'jira', 'Address':'jira.northwind.example/jira', 'ConnectorId':c['ConnectorId'], 'Active':1}, 'test')
    before = s._one('SELECT LastPolledAt FROM source WHERE SourceId=?', (source,))
    fake = JiraWire([issue(n) for n in range(1, 28)], fail_page=True)
    with wire(fake): channels._poll_one(s, c, True, 24, None, False)
    assert s._one('SELECT LastPolledAt FROM source WHERE SourceId=?', (source,)) == before
    assert s.get_connector(c['ConnectorId'])['LastError']


def test_dc_unknown_owner_fails_poll_without_guessing():
    s, c = setup(); fake = JiraWire([issue(1, [{'id':'88', 'author':{'name':'alex'}, 'body':'Fix this'}])], owner={'displayName':'Alex'})
    with wire(fake), pytest.raises(RuntimeError): pm.poll_jira(s, c, datetime.now()-timedelta(hours=1), file_only=True)
    assert not s.message_by_external('jira:NW-1:c88')


def test_dc_stale_closeout_is_denied_without_network():
    s, c = setup(); fake = JiraWire()
    proposal = {'tracker':'jira', 'item':'NW-1', 'connector_id':c['ConnectorId'], 'text':'Fixed'}
    with wire(fake):
        assert not trackers.assess(s, proposal)['ok']
        with pytest.raises(RuntimeError): trackers.close_out(s, proposal)
    assert fake.calls == []


def test_dc_other_person_is_external_even_with_same_display_name():
    s, c = setup(); cm = {'id':'89', 'author':{'key':'user-other', 'name':'other', 'displayName':'Alex'}, 'body':'Please repair', 'created':datetime.now().astimezone().isoformat()}
    fake = JiraWire([issue(1, [cm])])
    with wire(fake): pm.poll_jira(s, c, datetime.now()-timedelta(hours=1), file_only=True)
    assert s.message_by_external('jira:NW-1:c89')['Status'] != 'context'


def _judge():
    "A triage verdict for the fixture: the ask is work. With no AI connector on the store nothing auto-starts an agent, so the poll is deterministic."
    return lambda *a, **k: json.dumps({'intent': 'task', 'kind': 'general', 'why': 'assigned work'})


@pytest.mark.parametrize('erin,expected', [
    ({'key': 'user-erin', 'name': 'erin', 'displayName': 'Erin'}, 'jira:user-erin'),
    ({'name': 'erin', 'displayName': 'Erin'}, 'jira:erin'),
    ({'accountId': '712020:erin', 'key': 'legacy-erin', 'name': 'erin', 'displayName': 'Erin'}, 'jira:712020:erin'),
])
def test_dc_same_author_comment_keeps_the_trusted_origin(erin, expected):
    """The real poll keeps reporter and comment identities equal, including Cloud payloads with legacy key/name fields."""
    s, c = setup()
    report = issue(1)
    report['fields']['reporter'] = erin
    since = datetime.now() - timedelta(hours=1)
    with wire(JiraWire([report])):
        pm.poll_jira(s, c, since, llm=_judge())
    tid = s.task_for_conversation('jira:NW-1')
    assert tid
    from taskuary import origin, senders
    assert origin.of_task(s, tid)[0] == 'stranger'          # a tracker's author is a stranger's until vouched for
    senders.vouch(s, s.list_messages(tid))                  # the owner's trust press names the reporter
    assert origin.of_task(s, tid)[0] == 'trusted'
    report['fields']['comment'] = {'comments': [{'id': '90', 'author': erin, 'body': 'Please repair the export',
                                                  'created': datetime.now().astimezone().isoformat()}]}
    with wire(JiraWire([report])):
        pm.poll_jira(s, c, since)                           # the same author's comment arrives on the next poll
    row = s.message_by_external('jira:NW-1:c90')
    assert row and row['TaskId'] == tid
    assert json.loads(row['MailMetaJson'])['author'] == expected
    assert origin.of_task(s, tid)[0] == 'trusted'                                   # its own comment does not re-block it


def test_dc_comment_without_a_stable_id_is_not_given_an_identity():
    """A display name is not an identity, and a site email is not one either: a comment whose author carries no key, name or
    accountId is not given an author at all - nothing is inferred from the payload - and it reads as a stranger's until the
    owner trusts the source. The fix narrows the identity to the stable id; it does not widen trust."""
    s, c = setup()
    cm = {'id': '92', 'author': {'displayName': 'Erin', 'emailAddress': 'erin@northwind.example'},
          'body': 'Please repair', 'created': datetime.now().astimezone().isoformat()}
    report = issue(1)
    report['fields']['comment'] = {'comments': [cm]}
    with wire(JiraWire([report])):
        pm.poll_jira(s, c, datetime.now() - timedelta(hours=1), llm=_judge())
    row = s.message_by_external('jira:NW-1:c92')
    assert row and row['TaskId']
    assert 'author' not in (json.loads(row['MailMetaJson'] or 'null') or {})
    from taskuary import origin
    assert origin.of_task(s, row['TaskId'])[0] == 'stranger'


def test_dc_draft_test_preserves_saved_credentials_and_identity():
    s, c = setup(); fake = JiraWire()
    before = s.get_connector(c['ConnectorId'], with_secret=True)
    before_sources = s.list_sources(active_only=False)
    draft = {'config': {'deployment':'data_center', 'base_url':'https://other.northwind.example', 'email':'other@northwind.example'}, 'secret':'another-fixture-token'}
    with wire(fake): result = channels.test_connector(s, c['ConnectorId'], draft=draft)
    assert result['ok']
    assert s.get_connector(c['ConnectorId'], with_secret=True) == before
    assert s.list_sources(active_only=False) == before_sources


def test_dc_each_connector_seeds_its_own_source():
    s, c = setup(); second = s.save_connector({'Type':'jira', 'Name':'Other Jira', 'Active':1, 'Secret':'other-fixture', 'ConfigJson':json.dumps({'deployment':'data_center', 'base_url':'https://other.northwind.example', 'email':'other@northwind.example'})}, 'test')
    fake = JiraWire()
    with wire(fake):
        pm.test_jira(s, c)
        pm.test_jira(s, s.get_connector(second, with_secret=True))
    assert {x['ConnectorId'] for x in s.list_sources() if x['Channel']=='jira'} == {c['ConnectorId'], second}


@pytest.mark.parametrize('code', [301, 401, 403, 503])
def test_dc_http_failure_is_not_empty_success(code):
    s, c = setup()
    with mock.patch.object(pm.requests, 'request', return_value=Response({'errorMessages':['fixture']}, code)), pytest.raises(RuntimeError):
        pm.test_jira(s, c)
    assert not [x for x in s.list_sources() if x['Channel']=='jira']


def test_dc_no_progress_page_fails():
    s, c = setup()
    def response(method, url, **kw):
        return Response({'issues':[], 'total':3, 'startAt':0, 'maxResults':25})
    with mock.patch.object(pm.requests, 'request', side_effect=response), pytest.raises(RuntimeError):
        pm.poll_jira(s, c, datetime.now()-timedelta(hours=1), file_only=True)


def test_feed_imports_old_unresolved_assignments_without_creating_work():
    s, c = setup()
    s.save_connector({'ConnectorId':c['ConnectorId'], 'Roles':'feed'}, 'test')
    c = s.get_connector(c['ConnectorId'], with_secret=True)
    old = issue(1)
    old['fields']['updated'] = '2025-01-01T12:00:00+00:00'
    def upstream(method, url, **kw):
        jql = (kw.get('params') or {}).get('jql', '')
        rows = [old] if 'resolution is EMPTY' in jql else []
        return Response({'issues': rows, 'total':len(rows), 'startAt':0})
    with mock.patch.object(pm.requests, 'request', side_effect=upstream):
        pm.poll_jira(s, c, datetime.now()-timedelta(minutes=2), file_only=True)
        pm.poll_jira(s, c, datetime.now()-timedelta(minutes=2), file_only=True)
    rows = s._rows("SELECT TaskId, ConversationId FROM message WHERE Channel='jira'")
    assert rows == [{'TaskId':None, 'ConversationId':'jira:NW-1'}]

