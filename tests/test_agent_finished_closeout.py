"""An agent that finished its work owes its close-out (the owner, 2026-11-10): the merge of the pull
request it left open waits for the owner's yes like a reply does - even though no reply is owed,
and even with `--no-reply`, which says the SENDER hears nothing, not that a still-open approval is
lost. The approval never sends, never merges and never closes the task; a second completion of the
same run raises no second approval; and a run that was only saved, the owner's own Mark done and an
upstream that already ended the work owe no approval at all."""
import json, unittest
from unittest import mock

from taskuary import ci, general, github, proposals, selfclose, terminal as term, wrapup
from taskuary.store import MemoryStore

OPEN = {'number': 7, 'state': 'open', 'merged': False, 'sha': 'abc1234def',
        'url': 'https://github.com/northwind/ledger/pull/7'}


def armed(s):
    cid = s.get_connector_by_type('github')['ConnectorId']
    s.save_connector({'ConnectorId': cid, 'Secret': 'ghp_x', 'Active': 1,
                      'ConfigJson': json.dumps({'use_as_tracker': False})}, 't')
    s.set_setting('agent_push_enabled', '1', 't')
    return s


def general_pr_task(s):
    """A general task with its durable owner/assistant chat, the agent's pull request open and no
    inbound message to reply to - the shape the finished run left with nothing asking for a merge."""
    tid = s.create_task({'Title': 'Fix the nightly export', 'Kind': 'general', 'Status': 'in_progress'}, 'owner')
    s.add_comment(tid, 'owner', general.USER_TYPE, 'Fix the nightly export.')
    s.add_comment(tid, 'assistant', general.ASSISTANT_TYPE, 'Fixed the export and opened the pull request.')
    ci._save_pr(s, tid, {'number': 7, 'url': OPEN['url'], 'head': 'fix-export', 'base': 'main', 'state': 'open',
                         'repo': 'northwind/ledger', 'sha': OPEN['sha']})
    return tid


def approvals(s, tid):
    return [r for r in s._rows("SELECT * FROM review WHERE TaskId=? AND Status='pending' AND Kind='action'", (tid,))]


def drafts(s, tid):
    return [r for r in s._rows("SELECT * FROM review WHERE TaskId=? AND Status='pending' AND Kind IN ('draft','draft_reply')", (tid,))]


class Base(unittest.TestCase):
    def setUp(self):
        self.s = armed(MemoryStore())
        self._sessions = dict(term.SESSIONS); term.SESSIONS.clear(); selfclose._DONE.clear()
        self.patches = (mock.patch.object(github, 'pr', return_value=OPEN),
                        mock.patch('taskuary.playbooks.draft', return_value=None))
        for p in self.patches: p.start()
        self.addCleanup(self._stop)
    def _stop(self):
        for p in reversed(self.patches): p.stop()
    def tearDown(self):
        term.SESSIONS.clear(); term.SESSIONS.update(self._sessions); selfclose._DONE.clear()

    def declare(self, tid, said, **kw):
        return selfclose.declare(self.s, tid, said, 'assistant', **kw)


class FinishedRunRaisesTheCloseOut(Base):
    def test_a_finished_run_with_an_open_pr_and_no_reply_owed_waits_for_the_merge(self):
        tid = general_pr_task(self.s)
        with mock.patch.object(github, 'merge_pr') as merge:
            out = self.declare(tid, 'fixed the export and opened the pull request')
        self.assertTrue(out.get('ended')); self.assertFalse(out.get('closed'))
        # exactly one approval, the pull request's merge - nothing drafted for the sender, nothing sent
        rv = proposals.closeout_pending(self.s, tid)
        self.assertIsNotNone(rv, 'the finished run owes its merge, like a reply')
        p = json.loads(rv['DraftText'])
        self.assertEqual((p['action'], p['number'], p['closeout']), ('merge_pr', 7, True))
        self.assertEqual(len(approvals(self.s, tid)), 1)
        self.assertEqual(drafts(self.s, tid), [])
        merge.assert_not_called()
        # the task stays open for the owner's Mark done; the approval is what waits, not a close
        self.assertEqual(self.s.get_task(tid)['Status'], 'open')

    def test_no_reply_says_the_sender_hears_nothing_not_that_the_approval_is_lost(self):
        tid = general_pr_task(self.s)
        out = self.declare(tid, 'fixed it - the owner said no reply is owed', no_reply=True)
        self.assertTrue(out.get('ended')); self.assertFalse(out.get('closed'))
        # `--no-reply` dismisses a waiting reply draft, never the still-open close-out
        self.assertEqual(json.loads(proposals.closeout_pending(self.s, tid)['DraftText'])['action'], 'merge_pr')
        self.assertEqual(len(approvals(self.s, tid)), 1)
        self.assertEqual(drafts(self.s, tid), [])
        self.assertEqual(self.s.get_task(tid)['Status'], 'open')


class RepeatedCompletionRaisesNothingTwice(Base):
    def test_a_second_say_of_the_same_run_is_refused_and_raises_no_second_approval(self):
        tid = general_pr_task(self.s)
        self.declare(tid, 'fixed the export and opened the pull request')
        rv = proposals.closeout_pending(self.s, tid)
        out = self.declare(tid, 'done')
        self.assertIn('already ran', out['why']); self.assertFalse(out.get('ended'))
        self.assertEqual(len(approvals(self.s, tid)), 1)
        # ...and a task reopened by hand that finishes again meets the SAME approval, never a second one
        selfclose.forget(tid)
        out = self.declare(tid, 'finished it for real')
        self.assertTrue(out.get('ended'))
        again = proposals.closeout_pending(self.s, tid)
        self.assertEqual(again['ReviewId'], rv['ReviewId'], 'the SAME approval, not a second one')
        self.assertEqual(len(approvals(self.s, tid)), 1)


class TheSavedAndTheClosedOweNothing(Base):
    def test_a_saved_run_that_wrote_no_reply_owes_no_approval(self):
        """Stop and save is a saved run, not a finished one: its close-out comes with the reply it
        wrote (TQ-0767), and a run cut short of the work owes one to nobody."""
        tid = general_pr_task(self.s)
        fin = wrapup.finish(self.s, tid, {'summary': 'saved'}, None, 'assistant', keep_open=True)
        self.assertIsNone(fin.get('closeout'))
        self.assertIsNone(proposals.closeout_pending(self.s, tid))
        self.assertEqual(self.s.get_task(tid)['Status'], 'in_progress')    # the saved run leaves the status alone

    def test_a_saved_run_that_drafted_its_reply_gets_the_merge_too(self):
        """TQ-0767: a saved run that drafted its reply owes the merge too - the answer says the work
        is done, and it comes with its merge. A saved run is not `done`, so no_reply would lose it."""
        tid = general_pr_task(self.s)
        self.s.add_message({'TaskId': tid, 'ExternalId': 'gh-74', 'Channel': 'email', 'Subject': 'PR',
                            'FromName': 'Omar Keller', 'FromEmail': 'omar@vendor.example',
                            'BodyText': 'Adds tests for _cut', 'Status': 'routed'})
        self.s.add_review({'TaskId': tid, 'Kind': 'draft_reply', 'Status': 'pending', 'DraftText': 'Merging this one.'})
        prev, wrapup.REFRESH = wrapup.REFRESH, None
        try:
            with mock.patch('taskuary.responder.write_draft', return_value='Merging this one.'):
                fin = wrapup.finish(self.s, tid, {'summary': 'saved'}, None, 'assistant', keep_open=True)
        finally:
            wrapup.REFRESH = prev
        self.assertEqual(fin.get('closeout'), 'merge_pr')
        self.assertEqual(self.s.get_task(tid)['Status'], 'in_progress')

    def test_the_owners_mark_done_is_the_close_and_raises_no_approval(self):
        tid = general_pr_task(self.s)
        fin = wrapup.finish(self.s, tid, {'summary': 'merged'}, None, 'assistant', owner_done=True, no_reply=True)
        self.assertIsNone(fin.get('closeout'))
        self.assertIsNone(proposals.closeout_pending(self.s, tid))
        self.assertEqual(self.s.get_task(tid)['Status'], 'done')

    def test_an_upstream_that_already_ended_the_work_raises_nothing_new(self):
        """channels.close_upstream_ended: the close-out the finish raised is dismissed by the upstream
        ending itself, and the saved session's own wrap afterwards re-raises nothing over the dead PR."""
        tid = general_pr_task(self.s)
        fin = wrapup.finish(self.s, tid, {'summary': 'merged it'}, None, 'assistant')
        self.assertEqual(fin.get('closeout'), 'merge_pr')          # the finished run's merge waited for the owner
        rv = proposals.closeout_pending(self.s, tid)
        self.s.decide_review(rv['ReviewId'], 'no_reply', None, 'router', 'the item ended upstream')
        # ...the upstream ending's own saved-session wrap (no_reply) raises no second approval, and leaves the
        # status to the close that follows it
        fin2 = wrapup.finish(self.s, tid, {'summary': 'saved'}, None, 'assistant', keep_open=True, no_reply=True)
        self.assertIsNone(fin2.get('closeout'))
        self.assertIsNone(proposals.closeout_pending(self.s, tid))
        self.assertEqual(self.s.get_task(tid)['Status'], 'waiting')


if __name__ == '__main__':
    unittest.main()
