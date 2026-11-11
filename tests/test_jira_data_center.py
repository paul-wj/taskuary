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


def test_feed_revisions_and_comments_share_one_unread_reference():
    from taskuary import funnel, processing_all, processing_unread
    s, c = setup()
    s.set_setting('calendar_enabled', '0', 'test')
    s.reconcile_processing_membership()
    s.activate_processing_reads(fixed_now=datetime.now().isoformat(), live_state=[])
    report = issue(1)
    since = datetime.now() - timedelta(hours=1)
    with wire(JiraWire([report])): pm.poll_jira(s, c, since, file_only=True)
    s.reconcile_processing_membership()
    original = s.resolve_processing_target('legacy_funnel', 'msg:1')['item_id']
    report['fields']['description'] = 'Repair the export for large files'
    report['fields']['comment'] = {'comments': [{'id':'93', 'author':{'key':'user-erin'},
        'body':'The large-file export still fails', 'created':datetime.now().astimezone().isoformat()}]}
    with wire(JiraWire([report])):
        pm.poll_jira(s, c, since, file_only=True)
        pm.poll_jira(s, c, since, file_only=True)
    s.reconcile_processing_membership()
    snapshot = s.processing_inventory_snapshot(fixed_now=datetime.now().isoformat(), live_state=[])
    rows, _, _ = processing_all.compact_inventory(snapshot, processing_unread.query_for(s))
    assert [r['item_id'] for r in rows] == [original]
    assert rows[0]['counts']['messages'] == 3
    bodies = [m['BodyText'] for m in snapshot['items'][0]['view']['messages']]
    assert 'The large-file export still fails' in bodies
    assert any(body.endswith('\nRepair the export for large files') for body in bodies)
    pile = funnel.build(s, now=datetime.now(), live_state=[])
    assert [(r['processing_id'], r['lane']) for r in pile['items']] == [(original, 'fyi')]
    funnel.settle(s, pile['items'][0]['key'], 'surfaced', read=True)
    s.reconcile_processing_membership()
    assert funnel.build(s, now=datetime.now(), live_state=[])['items'] == []
    report['fields']['description'] = 'Repair the export for large files and empty files'
    with wire(JiraWire([report])): pm.poll_jira(s, c, since, file_only=True)
    s.reconcile_processing_membership()
    later = funnel.build(s, now=datetime.now(), live_state=[])['items']
    assert [(r['processing_id'], r['unread']) for r in later] == [(original, True)]
    assert s._rows('SELECT TaskId FROM task') == []
    s.close()


def test_open_reference_with_the_owner_own_comment_stays_on_the_rail():
    """The owner's own comment on an open tracker item is kept `context` (the tracker's line, history,
    not work) and shares the issue's updated stamp. A reference is resolved by its close, not by who
    commented last - so its own line must not read as "answered" (processing_unread._noise's last word
    is yours) and take the still-open reference off the rail. Routed through triage, the way the
    browser's Sync files an unfamiliar issue, not the feed-only road the feed tests take."""
    from taskuary import funnel
    s, c = setup()
    s.set_setting('calendar_enabled', '0', 'test')
    s.reconcile_processing_membership()
    s.activate_processing_reads(fixed_now=datetime.now().isoformat(), live_state=[])
    report = issue(1)
    report['fields']['comment'] = {'comments': [{'id': '70', 'author': {'key': 'user-alex', 'name': 'alex',
        'displayName': 'Alex'}, 'body': 'I am working on the export',
        'created': datetime.now().astimezone().isoformat()}]}
    since = datetime.now() - timedelta(hours=1)
    fyi = lambda *a, **k: json.dumps({'intent': 'fyi', 'why': 'informational'})   # the demo files unfamiliar issues
    with wire(JiraWire([report])): pm.poll_jira(s, c, since, llm=fyi)            # the ordinary road: triage files it
    assert s.message_by_external('jira:NW-1:c70')['Status'] == 'context'          # the owner's own line, never work
    s.reconcile_processing_membership()
    pile = funnel.build(s, now=datetime.now(), live_state=[])
    assert any('NW-1' in r['title'] for r in pile['items']), 'the open reference must be on the rail'
    assert s._rows('SELECT TaskId FROM task') == []                               # triage kept it taskless
    s.close()


@pytest.mark.parametrize('bootstrap', ['reconcile', 'backfill'])
def test_reference_grouping_preserves_site_and_explicit_task_boundaries(bootstrap):
    s, _ = setup()
    tid = s.create_task({'Title':'Owner work', 'Kind':'task'}, 'test')
    messages = [
        ('site-a-1', 'jira.northwind.example/jira', 'jira:NW-1', None),
        ('site-a-2', 'jira.northwind.example/jira', 'jira:NW-1', None),
        ('site-b-1', 'jira.northwind.example/other', 'jira:NW-1', None),
        ('other-issue', 'jira.northwind.example/jira', 'jira:NW-2', None),
        ('task-message', 'jira.northwind.example/jira', 'jira:NW-1', tid),
    ]
    mids = [s.add_message({'ExternalId':ext, 'SourceName':site, 'ConversationId':conv,
        'TaskId':task, 'Channel':'jira', 'Status':'feed', 'Subject':'Export', 'BodyText':ext})
        for ext, site, conv, task in messages]
    if bootstrap == 'backfill': s.backfill_processing('jira-reference-fixture', fixed_now=datetime.now().isoformat(), live_state=[])
    s.reconcile_processing_membership()
    roots = [s.resolve_processing_target('legacy_funnel', f'msg:{mid}')['item_id'] for mid in mids]
    assert roots[0] == roots[1]
    assert len({roots[0], *roots[2:]}) == 4
    assert roots[-1] == s.resolve_processing_target('legacy_funnel', f'task:{tid}')['item_id']
    if bootstrap == 'reconcile':
        s.backfill_processing('jira-reference-fixture', fixed_now=datetime.now().isoformat(), live_state=[])
        assert [s.resolve_processing_target('legacy_funnel', f'msg:{mid}')['item_id'] for mid in mids] == roots
    s.close()


@pytest.mark.parametrize('column,other', [('SourceName', 'jira.northwind.example/other'), ('ConversationId', 'jira:NW-2')])
def test_existing_reference_rows_converge_when_their_provider_identity_matches(tmp_path, column, other):
    from taskuary.store import SQLiteStore
    path = tmp_path / 'jira-references.db'
    s = SQLiteStore(str(path))
    shared = {'Channel':'jira', 'Status':'feed', 'SourceName':'jira.northwind.example/jira',
        'ConversationId':'jira:NW-1', 'Subject':'Export', 'BodyText':'Repair the export'}
    first = s.add_message({**shared, 'ExternalId':'reference-first'})
    second = s.add_message({**shared, 'ExternalId':'reference-second', column:other})
    s.reconcile_processing_membership()
    root = s.resolve_processing_target('legacy_funnel', f'msg:{first}')['item_id']
    old = s.resolve_processing_target('legacy_funnel', f'msg:{second}')['item_id']
    assert old != root
    s._exec(f'UPDATE message SET {column}=? WHERE MessageId=?', (shared[column], second))
    before = s._rows('SELECT * FROM message ORDER BY MessageId')
    s.reconcile_processing_membership()
    assert s.resolve_processing_target('legacy_funnel', f'msg:{second}')['item_id'] == root
    assert s.processing_snapshot(old)['item']['ItemId'] == root
    assert s._rows('SELECT * FROM message ORDER BY MessageId') == before
    s.close()
    s = SQLiteStore(str(path))
    s.reconcile_processing_membership()
    assert s.resolve_processing_target('legacy_funnel', f'msg:{second}')['item_id'] == root
    assert {m['MessageId'] for m in s.processing_snapshot(root)['view']['messages']} == {first, second}
    s.close()


def _jira_reference_pile(s):
    from taskuary import funnel
    s.reconcile_processing_membership()
    return funnel.build(s, now=datetime.now(), live_state=[])['items']


@pytest.mark.parametrize('status,category,resolution', [
    ('Shipped', 'done', {'name':'Fixed'}),
    ('Closed', 'done', None),
    ('In Progress', 'indeterminate', {'name':'Won’t Fix'}),
])
def test_closed_jira_reference_leaves_fyi_and_reopened_issue_returns_unread(status, category, resolution):
    from taskuary import funnel
    s, c = setup()
    s.set_setting('calendar_enabled', '0', 'test')
    s.reconcile_processing_membership()
    s.activate_processing_reads(fixed_now=datetime.now().isoformat(), live_state=[])
    report = issue(1)
    report['fields']['resolution'] = None
    since = datetime.now() - timedelta(hours=1)
    with wire(JiraWire([report])): pm.poll_jira(s, c, since, file_only=True)
    first = _jira_reference_pile(s)[0]
    assert first['jira']['status'] == 'Open' and first['jira']['category'] == 'new'
    funnel.settle(s, first['key'], 'surfaced', read=True)
    assert _jira_reference_pile(s) == []
    before = s._rows('SELECT MessageId,BodyText,Status FROM message ORDER BY MessageId')
    report['fields'].update(status={'name':status, 'statusCategory':{'key':category}}, resolution=resolution,
                            updated=(datetime.now().astimezone() + timedelta(seconds=1)).isoformat())
    with wire(JiraWire([report])): pm.poll_jira(s, c, since, file_only=True)
    assert _jira_reference_pile(s) == []
    assert s._rows('SELECT MessageId,BodyText,Status FROM message ORDER BY MessageId') == before
    state = json.loads(s.get_message(first['mid'])['MailMetaJson'])['jira']
    assert state['closed'] and state['status'] == status
    report['fields'].update(status={'name':'Open', 'statusCategory':{'key':'new'}}, resolution=None,
                            updated=(datetime.now().astimezone() + timedelta(seconds=2)).isoformat())
    with wire(JiraWire([report])): pm.poll_jira(s, c, since, file_only=True)
    reopened = _jira_reference_pile(s)
    assert [(r['key'], r['unread'], r['jira']['closed']) for r in reopened] == [(first['key'], True, False)]
    assert s._rows('SELECT MessageId,BodyText,Status FROM message ORDER BY MessageId') == before
    s.close()


def test_custom_status_name_does_not_decide_whether_jira_is_closed():
    s, c = setup()
    s.set_setting('calendar_enabled', '0', 'test')
    report = issue(1)
    report['fields'].update(status={'name':'Closed for investigation', 'statusCategory':{'key':'indeterminate'}}, resolution=None)
    with wire(JiraWire([report])): pm.poll_jira(s, c, datetime.now()-timedelta(hours=1), file_only=True)
    rows = _jira_reference_pile(s)
    assert len(rows) == 1 and not rows[0]['jira']['closed']
    assert rows[0]['jira']['status'] == 'Closed for investigation'
    s.close()


@pytest.mark.parametrize('still_assigned', [True, False])
def test_old_closed_reference_is_refreshed_outside_the_recent_update_window(still_assigned):
    s, c = setup()
    s.set_setting('calendar_enabled', '0', 'test')
    mid = s.add_message({'Channel':'jira', 'ExternalId':'jira:NW-1@legacy', 'ConversationId':'jira:NW-1',
        'SourceName':'jira.northwind.example/jira', 'Subject':'NW-1 Export', 'BodyText':'Old reference', 'Status':'feed'})
    closed = issue(1)
    closed['fields'].update(status={'name':'Delivered', 'statusCategory':{'key':'done'}}, resolution={'name':'Fixed'},
                            updated='2025-01-01T12:00:00+00:00')
    fake = JiraWire([closed])
    def upstream(method, url, **kw):
        jql = (kw.get('params') or {}).get('jql', '')
        if url.endswith('/search') and ('"NW-1"' not in jql or (not still_assigned and 'assignee = currentUser()' in jql)):
            return Response({'issues':[], 'total':0, 'startAt':0})
        return fake(method, url, **kw)
    with wire(upstream): pm.poll_jira(s, c, datetime.now()-timedelta(minutes=2), file_only=True)
    assert _jira_reference_pile(s) == []
    assert s.get_message(mid)['BodyText'] == 'Old reference'
    assert json.loads(s.get_message(mid)['MailMetaJson'])['jira']['status'] == 'Delivered'
    s.close()


def test_jira_resolution_does_not_hide_a_pending_approval_or_close_local_work():
    s, c = setup()
    s.set_setting('calendar_enabled', '0', 'test')
    report = issue(1)
    since = datetime.now()-timedelta(hours=1)
    with wire(JiraWire([report])): pm.poll_jira(s, c, since, file_only=True)
    first = _jira_reference_pile(s)[0]
    rid = s.add_review({'MessageId':first['mid'], 'Kind':'reply', 'Status':'pending', 'DraftText':'Owner draft'})
    tid = s.create_task({'Title':'Separate local work', 'Kind':'task', 'Status':'open'}, 'owner')
    s.add_message({'TaskId':tid, 'Channel':'jira', 'ExternalId':'jira:NW-2@local', 'ConversationId':'jira:NW-2',
        'SourceName':'jira.northwind.example/jira', 'Subject':'NW-2 Export', 'BodyText':'Owner work', 'Status':'routed'})
    other = issue(2)
    for r in (report, other):
        r['fields'].update(status={'name':'In Progress', 'statusCategory':{'key':'indeterminate'}}, resolution={'name':'Fixed'})
    with wire(JiraWire([report, other])): pm.poll_jira(s, c, since, file_only=True)
    rows = _jira_reference_pile(s)
    assert any(r.get('rid') == rid and r['lane'] == 'approve' for r in rows)
    assert any(r.get('tid') == tid for r in rows)
    assert s.get_task(tid)['Status'] == 'open'
    assert s.get_review(rid)['DraftText'] == 'Owner draft' and s.get_review(rid)['Status'] == 'pending'
    s.close()


def test_unchanged_jira_status_does_not_make_a_read_reference_unread():
    from taskuary import funnel
    s, c = setup()
    s.set_setting('calendar_enabled', '0', 'test')
    s.reconcile_processing_membership()
    s.activate_processing_reads(fixed_now=datetime.now().isoformat(), live_state=[])
    report, since = issue(1), datetime.now()-timedelta(hours=1)
    with wire(JiraWire([report])): pm.poll_jira(s, c, since, file_only=True)
    first = _jira_reference_pile(s)[0]
    funnel.settle(s, first['key'], 'surfaced', read=True)
    report['fields']['updated'] = (datetime.now().astimezone()+timedelta(seconds=1)).isoformat()
    with wire(JiraWire([report])): pm.poll_jira(s, c, since, file_only=True)
    assert _jira_reference_pile(s) == []
    report['fields']['status'] = {'name':'验证中', 'statusCategory':{'key':'indeterminate'}}
    with wire(JiraWire([report])): pm.poll_jira(s, c, since, file_only=True)
    rows = _jira_reference_pile(s)
    assert [(r['key'], r['jira']['status'], r['unread']) for r in rows] == [(first['key'], '验证中', True)]
    s.close()


def test_jira_status_update_preserves_author_and_other_site_reference():
    s, c = setup()
    s.set_setting('calendar_enabled', '0', 'test')
    shared = {'Channel':'jira', 'ConversationId':'jira:NW-1', 'Subject':'NW-1 Export', 'BodyText':'Repair export', 'Status':'feed',
              'MailMetaJson':json.dumps({'author':'jira:user-erin', 'member':True})}
    first = s.add_message({**shared, 'ExternalId':'site-a', 'SourceName':'jira.northwind.example/jira'})
    other = s.add_message({**shared, 'ExternalId':'site-b', 'SourceName':'jira.northwind.example/other'})
    report = issue(1)
    report['fields'].update(status={'name':'Delivered', 'statusCategory':{'key':'done'}}, resolution={'name':'Fixed'})
    with wire(JiraWire([report])): pm.poll_jira(s, c, datetime.now()-timedelta(hours=1), file_only=True)
    assert [r['mid'] for r in _jira_reference_pile(s)] == [other]
    meta = json.loads(s.get_message(first)['MailMetaJson'])
    assert meta['author'] == 'jira:user-erin' and meta['member'] is True and meta['jira']['closed']
    assert json.loads(s.get_message(other)['MailMetaJson']) == {'author':'jira:user-erin', 'member':True}
    s.close()

