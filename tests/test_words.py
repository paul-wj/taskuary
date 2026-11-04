"""THE PLACES A SENTENCE SENDS THE OWNER (taskuary/words.json): every link is one the page opens, and no sentence the server
writes types its own "Settings → ..." path - one moved page was a dozen stale sentences, each spelled its own way."""
import json, re, unittest
from pathlib import Path
from urllib.parse import unquote
from taskuary import words

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'website' / 'src'
CANVAS, APP = (SRC / 'canvasLinks.js').read_text(encoding='utf-8'), (SRC / 'appLinks.js').read_text(encoding='utf-8')
class PlacesTests(unittest.TestCase):
    def test_every_link_is_one_the_page_opens(self):
        pages = re.search(r'SETTINGS_PAGES = \[([^\]]*)\]', CANVAS).group(1)
        groups = json.loads((ROOT / 'taskuary' / 'settings_schema.json').read_text(encoding='utf-8'))['groups']
        sections = set(re.findall(r'^    \{ title: "([^"]+)"', (SRC / 'ConnectorsView.jsx').read_text(encoding='utf-8'), re.M))   # its shelves
        for pid, p in words.PLACES.items():
            h = p['href']
            if not h: continue                                      # on the screen, no link of its own (the rail, the Board)
            if h == '#setup': self.assertIn('"#setup"', APP, pid); continue
            head = re.match(r'#([\w-]+=?)', h).group(1)
            self.assertIn(head, CANVAS, f'{pid}: {h} is no link canvasLinks.js knows')
            m = re.match(r'#settings=([^&]*)(?:&group=(.*))?$', h)
            if m:
                self.assertIn(f'"{m.group(1)}"', pages, pid)
                if m.group(2): self.assertIn(unquote(m.group(2)), groups, pid)
            m = re.match(r'#connections=(.*)$', h)
            if m: self.assertIn(unquote(m.group(1)), sections, pid)

    def test_a_place_is_asked_by_id(self):
        self.assertEqual(words.place('ai'), (words.name('ai'), words.href('ai')))
        self.assertTrue(words.link('mail').startswith(f"[{words.name('mail')}]("))
        self.assertEqual(words.link('later'), words.name('later'))              # no link: the bare name
        self.assertTrue(words.card('Exa').startswith(words.name('connections')))
        with self.assertRaises(KeyError): words.place('nowhere')



class JargonTests(unittest.TestCase):
    def test_the_list_finds_what_a_non_coder_must_never_read(self):
        found = words.jargon_in('The CLI opened a pull request with claude-sonnet-4-5 in the repo; the session ended.')
        self.assertEqual({w.lower() for w in found}, {'cli', 'pull request', 'claude-sonnet-4-5', 'repo', 'session'})
        self.assertEqual(words.jargon_in('Gail is waiting on the invoice - reply before Friday.'), [])
        # "pr" as letters in a word is not the jargon; "PR" written as such is
        self.assertEqual(words.jargon_in('a press release'), [])
        self.assertEqual(words.jargon_in('the PR is open'), ['PR'])

    def test_the_contract_lists_the_words_named(self):
        for w in ('CLI', 'repo', 'repository', 'PR', 'pull request', 'token', 'lane', 'brain', 'triage', 'harness', 'session',
                  'JSON', 'worktree', 'terminal', 'by triage', 'regular agent', 'coder'):
            self.assertIn(w, words.JARGON)


if __name__ == '__main__':
    unittest.main()
