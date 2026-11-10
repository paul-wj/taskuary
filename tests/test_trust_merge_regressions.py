"""The merge regression in two halves (fixes 1 and 6):

Fix 1 - the seed of the new trust_trackers switch ran over a legacy database that had no row for it,
handing back an ON default for an owner who had switched the master trust_non_email OFF. The new flag
now inherits the saved master choice before the seed; a fresh install keeps the new default, and an
explicit trust_trackers value always wins. Reopen is idempotent.

Fix 6 - pm.author_meta stores the Jira author as 'jira:<accountId/key>', a SITE-LOCAL id that two Data
Center sites each hand out to a different person. senders remembered the press under the raw author,
so a trust on site A started an agent for the same key on site B. The remembered Jira author is now
scoped by the normalized site (SourceName: host plus context path); a legacy bare row migrates when
the store records that author on exactly one site, otherwise it fails closed and the owner re-presses.
"""
import json
import os
import shutil
import tempfile
import unittest

from taskuary import origin, senders
from taskuary.store import SQLiteStore

SITE_A = 'jira.a.example/jira'
SITE_B = 'jira.b.example/jira'
KEY = 'JIRAUSER10000'


def _task(s, src='jira'):
    return s.create_task({'Title': 'a', 'Kind': 'general', 'Source': src}, 'router')


def _item(s, t, site, author=None, member=None, name='Kai'):
    meta = {}
    if author: meta['author'] = f'jira:{author.lower()}'
    if member is not None: meta['member'] = member
    return s.add_message({'ExternalId': f'j:{t or "x"}:{site}:{name}', 'TaskId': t, 'Channel': 'jira', 'SourceName': site,
                          'FromName': name, 'Subject': 'a jira item', 'BodyText': '[Jira issue]\nplease', 'Status': 'routed',
                          **({'MailMetaJson': json.dumps(meta)} if meta else {})})


class JiraScopeTests(unittest.TestCase):
    """A remembered Jira author is scoped to its site (the normalized SourceName, host plus context path)."""

    def test_a_person_trusted_on_site_a_does_not_authorize_the_same_key_on_site_b(self):
        from taskuary.store import MemoryStore
        s = MemoryStore()
        t = _task(s); _item(s, t, SITE_A, author=KEY, member=False)
        self.assertEqual(origin.of_task(s, t)[0], 'stranger')
        origin.raise_to(s, t, 'trusted', 'owner')          # the owner pressed the task's person-trust on site A
        t2 = _task(s); _item(s, t2, SITE_B, author=KEY, member=False)
        self.assertEqual(origin.of_task(s, t2)[0], 'stranger', 'the same key on site B is a different person')
        t3 = _task(s); _item(s, t3, SITE_A, author=KEY, member=False)
        self.assertEqual(origin.of_task(s, t3)[0], 'trusted')

    def test_same_site_new_issue_and_new_line_are_trusted(self):
        from taskuary.store import MemoryStore
        s = MemoryStore()
        t = _task(s); _item(s, t, SITE_A, author=KEY, member=False)
        origin.raise_to(s, t, 'trusted', 'owner')
        mid = _item(s, t, SITE_A, author=KEY, member=False)     # a later line on the issue by the same author
        self.assertEqual(origin.of_message(s, s.get_message(mid))[0], 'trusted')
        self.assertEqual(origin.of_task(s, t)[0], 'trusted')
        t2 = _task(s); _item(s, t2, SITE_A, author='JIRAUSER2000', member=False)
        self.assertEqual(origin.of_task(s, t2)[0], 'stranger', 'the press was for the person, not the site')

    def test_explicit_whole_source_trust_does_not_cross_sources(self):
        from taskuary.store import MemoryStore
        s = MemoryStore()
        t = _task(s); _item(s, t, SITE_A, author=KEY, member=False)
        self.assertEqual(senders.trust_org(s, t, 'owner')['name'], SITE_A)   # "Trust everyone from <site A>"
        t2 = _task(s); _item(s, t2, SITE_A, author='JIRAUSER2000', member=False)
        self.assertEqual(origin.of_task(s, t2)[0], 'trusted')
        t3 = _task(s); _item(s, t3, SITE_B, author=KEY, member=False)
        self.assertEqual(origin.of_task(s, t3)[0], 'stranger', 'site B is a different source')

    def test_vouching_with_one_site_recorded_is_scoped_to_it(self):
        from taskuary.store import MemoryStore
        s = MemoryStore()
        t = _task(s); _item(s, t, SITE_A, author=KEY, member=False)
        origin.raise_to(s, t, 'trusted', 'owner')
        self.assertEqual(s.trusted_sender('jira', f'jira:{SITE_A}:jira:{KEY.lower()}'), 'you vouched for them')
        self.assertIsNone(s.trusted_sender('jira', f'jira:{SITE_B}:jira:{KEY.lower()}'))
        t2 = _task(s); _item(s, t2, SITE_B, author=KEY, member=False)
        self.assertEqual(origin.of_task(s, t2)[0], 'stranger')

    def test_a_fresh_press_is_scoped_to_the_pressed_site_even_when_the_author_is_on_two_sites(self):
        """The press names the person on ITS site - the same id on the other site is a different person. The explicit
        source press ('Trust everyone from <site>') is the per-site way to trust a whole site."""
        from taskuary.store import MemoryStore
        s = MemoryStore()
        _item(s, None, SITE_A, author=KEY, member=False)
        _item(s, None, SITE_B, author=KEY, member=False)
        t = _task(s); _item(s, t, SITE_A, author=KEY, member=False)
        origin.raise_to(s, t, 'trusted', 'owner')
        self.assertEqual(s.trusted_sender('jira', f'jira:{SITE_A}:jira:{KEY.lower()}'), 'you vouched for them')
        t2 = _task(s); _item(s, t2, SITE_A, author=KEY, member=False)
        self.assertEqual(origin.of_task(s, t2)[0], 'trusted')
        t3 = _task(s); _item(s, t3, SITE_B, author=KEY, member=False)
        self.assertEqual(origin.of_task(s, t3)[0], 'stranger')
        senders.trust_org(s, t3, 'owner')
        self.assertEqual(origin.of_task(s, t3)[0], 'trusted')
        t4 = _task(s); _item(s, t4, SITE_A, author=KEY, member=False)
        self.assertEqual(origin.of_task(s, t4)[0], 'trusted', 'the earlier person press still stands on its own site')

    def test_a_jira_item_with_no_site_is_a_stranger_even_when_a_bare_trust_row_exists(self):
        """Hole: a siteless item must not fall back to the bare author key - a legacy unscoped row would otherwise match at any site."""
        from taskuary.store import MemoryStore
        s = MemoryStore()
        t = _task(s)
        row = s.add_message({'ExternalId': 'j:nosite', 'TaskId': t, 'Channel': 'jira', 'FromName': 'Kai',
                             'Subject': 'a jira item', 'BodyText': '[Jira issue]\nplease', 'Status': 'routed',
                             'MailMetaJson': json.dumps({'author': f'jira:{KEY.lower()}', 'member': False})})
        self.assertEqual(origin.of_task(s, t)[0], 'stranger')
        s.remember_trust('jira', f'jira:{KEY.lower()}', 'you vouched for them')      # an old unscoped record
        self.assertEqual(origin.of_message(s, s.get_message(row))[0], 'stranger', 'the bare row must not match a siteless item')
        self.assertEqual(origin.of_task(s, t)[0], 'stranger')
        s.remember_trust('jira', f'jira:{SITE_A}:jira:{KEY.lower()}', 'you vouched for them')
        self.assertEqual(origin.of_task(s, t)[0], 'stranger', 'a scoped row for a NAMED site is no fallback for an unnamed one either')
        self.assertEqual(senders.known(s, {'channel': 'jira', 'from_name': 'Kai', 'mail_meta': {'author': f'jira:{KEY.lower()}'}})[0], False)
        t2 = _task(s)
        s.add_message({'ExternalId': 'j:nosite2', 'TaskId': t2, 'Channel': 'jira', 'FromName': 'Kai',
                       'Subject': 'x', 'BodyText': 'y', 'Status': 'routed',
                       'MailMetaJson': json.dumps({'author': f'jira:{KEY.lower()}'})})
        origin.raise_to(s, t2, 'trusted', 'owner')
        rows = {r['Address'] for r in s._rows("SELECT Address FROM sender_trust WHERE Mailbox='jira'")}
        self.assertEqual(rows, {f'jira:{KEY.lower()}', f'jira:{SITE_A}:jira:{KEY.lower()}'}, 'no new trust row, no project fallback')


class JiraTrustMigrationTests(unittest.TestCase):
    """A legacy bare row ('jira', 'jira:<author>') migrates to the scoped form when the store records that author
    on exactly one site; two or zero sites drop it (fail closed - nothing matches a bare key any more); a scoped row
    that already exists wins over its bare twin. The old row is detected by its AUTHOR KEY in the poller metadata
    (json_extract '$.author'), so a Cloud accountId that itself contains a colon is no trap for a colon count."""

    @classmethod
    def setUpClass(cls):
        cls.dir = tempfile.mkdtemp(prefix='taskuary-trust-mig-')

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.dir, ignore_errors=True)

    def _seed(self, name, sites, author=KEY, extra_rows=()):
        path = os.path.join(self.dir, name)
        s = SQLiteStore(path)
        for site in sites:
            s.add_message({'ExternalId': f'j:seed:{site}:{author}', 'Channel': 'jira', 'SourceName': site, 'FromName': 'Kai',
                           'BodyText': 'x', 'Status': 'routed', 'MailMetaJson': json.dumps({'author': f'jira:{author.lower()}'})})
        s.remember_trust('jira', f'jira:{author.lower()}', 'you vouched for them')
        for addr, reason in extra_rows:
            s.remember_trust('jira', addr, reason)
        s.close()
        return path

    def _judges(self, s, site, author=KEY):
        t = _task(s); _item(s, t, site, author=author, member=False)
        return origin.of_task(s, t)[0]

    def test_one_recorded_site_migrates_the_bare_author_and_stays_idempotent(self):
        s = SQLiteStore(self._seed('one.db', (SITE_A,)))
        self.assertEqual(s.trusted_sender('jira', f'jira:{SITE_A}:jira:{KEY.lower()}'), 'you vouched for them')
        self.assertIsNone(s.trusted_sender('jira', f'jira:{KEY.lower()}'))
        self.assertEqual((self._judges(s, SITE_A), self._judges(s, SITE_B)), ('trusted', 'stranger'))
        s.close()
        s = SQLiteStore(f'{self.dir}\\one.db')             # a second reopen does not move the scoped row again
        self.assertEqual(s.trusted_sender('jira', f'jira:{SITE_A}:jira:{KEY.lower()}'), 'you vouched for them')
        self.assertIsNone(s.trusted_sender('jira', f'jira:{KEY.lower()}'))

    def test_two_recorded_sites_fail_closed_on_both(self):
        s = SQLiteStore(self._seed('two.db', (SITE_A, SITE_B)))
        self.assertIsNone(s.trusted_sender('jira', f'jira:{KEY.lower()}'), 'an ambiguous press is dropped, not kept bare')
        self.assertIsNone(s.trusted_sender('jira', f'jira:{SITE_A}:jira:{KEY.lower()}'))
        self.assertEqual((self._judges(s, SITE_A), self._judges(s, SITE_B)), ('stranger', 'stranger'))
        s.close()
        s = SQLiteStore(f'{self.dir}\\two.db')             # idempotent: the drop does not re-run or resurrect
        self.assertIsNone(s.trusted_sender('jira', f'jira:{KEY.lower()}'))
        self.assertEqual((self._judges(s, SITE_A), self._judges(s, SITE_B)), ('stranger', 'stranger'))

    def test_no_recorded_site_fails_closed(self):
        """No recorded site for that author: the bare row is left where it is, and nothing trusts through it any more."""
        s = SQLiteStore(self._seed('none.db', ()))
        self.assertEqual(s.trusted_sender('jira', f'jira:{KEY.lower()}'), 'you vouched for them', 'the old row is preserved')
        self.assertEqual(self._judges(s, SITE_A), 'stranger')
        self.assertIsNone(s.trusted_sender('jira', f'jira:{SITE_A}:jira:{KEY.lower()}'))

    def test_a_cloud_account_id_with_a_colon_migrates_by_its_exact_author_key(self):
        """The old row is detected by its author key in the poller metadata, not by counting colons in the address."""
        cloud_id = '712020:fixture-id'
        s = SQLiteStore(self._seed('colon.db', (SITE_A,), author=cloud_id))
        self.assertEqual(s.trusted_sender('jira', f'jira:{SITE_A}:jira:{cloud_id}'), 'you vouched for them')
        self.assertIsNone(s.trusted_sender('jira', f'jira:{cloud_id}'))
        self.assertEqual((self._judges(s, SITE_A, cloud_id), self._judges(s, SITE_B, cloud_id)), ('trusted', 'stranger'))

    def test_an_existing_scoped_row_wins_over_its_bare_twin(self):
        path = self._seed('collide.db', (SITE_A, SITE_B),
                          extra_rows=((f'jira:{SITE_A}:jira:{KEY.lower()}', 'you trust this source'),))
        s = SQLiteStore(path)
        self.assertEqual(s.trusted_sender('jira', f'jira:{SITE_A}:jira:{KEY.lower()}'), 'you trust this source', 'not overwritten')
        self.assertIsNone(s.trusted_sender('jira', f'jira:{KEY.lower()}'), 'the bare twin is dropped')
        self.assertIsNone(s.trusted_sender('jira', f'jira:{SITE_B}:jira:{KEY.lower()}'))
        self.assertEqual((self._judges(s, SITE_A), self._judges(s, SITE_B)), ('trusted', 'stranger'))

    def test_other_channels_are_untouched(self):
        path = self._seed('mix.db', (SITE_A,))
        s = SQLiteStore(path)
        s.remember_trust('gitlab', 'gitlab:7', 'you vouched for them')
        s.remember_trust('teams', 'dana@northwind.example', 'you vouched for them')
        s.close()
        s = SQLiteStore(path)
        self.assertEqual(s.trusted_sender('gitlab', 'gitlab:7'), 'you vouched for them')
        self.assertEqual(s.trusted_sender('teams', 'dana@northwind.example'), 'you vouched for them')
        self.assertEqual(s.trusted_sender('jira', f'jira:{SITE_A}:jira:{KEY.lower()}'), 'you vouched for them')


class TrustTrackersMigrationTests(unittest.TestCase):
    """The new trust_trackers switch inherits the saved trust_non_email choice before the defaults seed."""

    @classmethod
    def setUpClass(cls):
        cls.dir = tempfile.mkdtemp(prefix='taskuary-trust-trk-')

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.dir, ignore_errors=True)

    def _legacy_db(self, name, non_email, trackers=None):
        path = os.path.join(self.dir, name)
        s = SQLiteStore(path)
        s.set_setting('trust_non_email', non_email, 'owner')
        if trackers is None:
            s.cx.execute("DELETE FROM setting WHERE Name='trust_trackers'")
            s.cx.commit()
        else:
            s.set_setting('trust_trackers', trackers, 'owner')
        s.close()
        return path

    def test_off_choice_is_preserved_on_reopen(self):
        path = self._legacy_db('off.db', '0')
        s = SQLiteStore(path)
        self.assertEqual((s.get_settings()['trust_non_email'], s.get_settings()['trust_trackers']), ('0', '0'))
        self.assertEqual(s.setting_writer('trust_trackers'), 'migration')
        s.close()
        s = SQLiteStore(path)                                  # idempotent on a second reopen
        self.assertEqual((s.get_settings()['trust_non_email'], s.get_settings()['trust_trackers']), ('0', '0'))

    def test_the_preserved_off_actually_gates_tracker_starts(self):
        path = self._legacy_db('gate.db', '0')
        s = SQLiteStore(path)
        ok, why = senders.known(s, {'channel': 'jira', 'source_name': SITE_A, 'from_name': 'Kai',
                                    'mail_meta': {'author': f'jira:{KEY.lower()}', 'member': True}})
        self.assertEqual(ok, False)
        s.set_setting('trust_trackers', '1', 'owner')
        self.assertTrue(senders.known(s, {'channel': 'jira', 'source_name': SITE_A, 'from_name': 'Kai',
                                         'mail_meta': {'author': f'jira:{KEY.lower()}', 'member': True}})[0])

    def test_new_install_and_on_choice_keep_the_new_default(self):
        path = self._legacy_db('on.db', '1')
        s = SQLiteStore(path)
        self.assertEqual((s.get_settings()['trust_non_email'], s.get_settings()['trust_trackers']), ('1', '1'))
        s.close()
        s = SQLiteStore(path)                                  # a second reopen keeps the inherited 'on' choice
        self.assertEqual(s.get_settings()['trust_trackers'], '1')

    def test_already_seeded_off_choice_is_repaired_without_overriding_an_owner(self):
        path = self._legacy_db('seeded.db', '0', '1')
        s = SQLiteStore(path)
        s.cx.execute("UPDATE setting SET UpdatedBy=NULL WHERE Name='trust_trackers'")
        s.cx.commit(); s.close()
        s = SQLiteStore(path)
        self.assertEqual(s.get_setting('trust_trackers'), '0')
        self.assertEqual(s.setting_writer('trust_trackers'), 'migration')
        s.close()
        s = SQLiteStore(path)
        self.assertEqual(s.get_setting('trust_trackers'), '0')
        s.close()

    def test_an_explicit_tracker_value_wins_both_ways(self):
        path = self._legacy_db('off1.db', '0', '1')
        s = SQLiteStore(path)
        self.assertEqual(s.get_settings()['trust_trackers'], '1')
        s.close()
        s = SQLiteStore(path)                                  # idempotent on a second reopen
        self.assertEqual(s.get_settings()['trust_trackers'], '1')
        path = self._legacy_db('on0.db', '1', '0')
        s = SQLiteStore(path)
        self.assertEqual(s.get_settings()['trust_trackers'], '0')
        s.close()
        s = SQLiteStore(path)
        self.assertEqual(s.get_settings()['trust_trackers'], '0')


if __name__ == '__main__':
    unittest.main()
