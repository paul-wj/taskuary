"""An agent sends FROM the mailbox it was told to (TQ-1354: "email it from rabbig@joinorlando.org" on a + New task). The brief
listed the JOIN Gmail card as "tools: gmail", run_system answered "unknown tool type: gmail", and propose_email had no way to
name a From - so the task fell to "send it yourself". A mailbox is now named as a send-from address, and the email carries it.
"""
import json
from unittest import mock

import pytest

from taskuary import agenttools, docsync, outbound, reports, slots, verdicts
from taskuary.store import MemoryStore
from taskuary.testing import Factory

JOIN, WORK = 'rabbig@joinorlando.org', 'uri@northwind.example'


@pytest.fixture
def s():
    s = MemoryStore()
    s.save_connector({'Type': 'outlook', 'Name': 'Outlook', 'Active': 1, 'ConfigJson': json.dumps({'address': WORK})}, 't')
    s.save_connector({'Type': 'gmail', 'Name': 'JOIN', 'Active': 1, 'Roles': 'source,tool', 'ConfigJson': json.dumps({'address': JOIN})}, 't')
    return s


def test_the_brief_never_names_a_mailbox_card_as_a_tool_type(s):
    brief = docsync.agent_systems(s)
    assert 'tools: gmail' not in brief
    for l in (l for l in brief.splitlines() if 'tools:' in l):
        assert all(t.strip() in reports.REGISTRY for t in l.split('tools:')[1].split(',')), l
    assert JOIN in brief and 'propose_email' in brief and '`from`' in brief


def test_the_email_leaves_from_the_mailbox_the_agent_named(s):
    tid = Factory(s).task(title='JOIN TnT materials', kind='general', source='manual')
    out = slots.draft(s, tid, 'Hi, the TnT materials are attached.', 'rabbisf@joinorlando.org', 'JOIN TnT materials', mailbox=JOIN.upper())
    assert out['ok'] and json.loads(s.get_review(out['review_id'])['Deliver'])['mailbox'] == JOIN
    # a rewrite that names no From keeps the one picked
    again = slots.draft(s, tid, 'Hi, the TnT materials, take two.', 'rabbisf@joinorlando.org', 'JOIN TnT materials')
    assert again['review_id'] == out['review_id'] and json.loads(s.get_review(out['review_id'])['Deliver'])['mailbox'] == JOIN
    with mock.patch.object(outbound, 'send_out', return_value={'channel': 'email', 'to': ['rabbisf@joinorlando.org']}) as sent, \
         mock.patch.object(outbound, 'send_block', return_value=''), mock.patch('taskuary.learn.learn_from'):
        verdicts.decide(s, s.get_review(out['review_id']), 'approve')
    assert sent.call_args.kwargs['mailbox'] == JOIN


def test_a_mailbox_that_is_not_connected_is_refused_and_the_real_ones_named(s):
    tid = Factory(s).task(title='JOIN TnT materials', kind='general', source='manual')
    out = slots.draft(s, tid, 'Hi.', 'rabbisf@joinorlando.org', 'Hi', mailbox='nobody@else.example')
    assert not out['ok'] and JOIN in out['why'] and WORK in out['why']


def test_propose_email_carries_from_to_the_draft(s):
    seen = {}
    def draft(tid, text, to, subject, files=(), cc=(), mailbox=''): seen.update(mailbox=mailbox); return {'ok': True, 'review_id': 1}
    agenttools.call(s, 1, 'propose_email', {'to': 'rabbisf@joinorlando.org', 'subject': 'TnT', 'text': 'Hi', 'from': JOIN}, {'draft': draft})
    assert seen['mailbox'] == JOIN
