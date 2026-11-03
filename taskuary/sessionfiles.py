"""Where a CLI files its own conversation, for the ones that will not hand us the id.

Three roads to a resumable session, cheapest first: claude and copilot are TOLD theirs at launch
(agents.ASSIGN_ARGS); codex streams events into a rollout we already follow (witness.RolloutTail);
and the rest leave a file behind and say nothing. This is the third road - a table of where each
one writes, how to narrow it to THIS pane, and where the id sits inside.

The layouts come from each vendor's documentation, not from a machine that ran them: gemini and
cursor were not installed where this was written. A wrong guess costs one entry in SOURCES, and
costs the owner nothing else - no id found means the Continue button simply does not appear.
"""
import hashlib
import json
import os
import re
import threading
import time
from pathlib import Path

from loguru import logger

UUID = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', re.I)
_ID_KEYS = ('sessionId', 'session_id', 'id', 'chatId')


def _home() -> Path: return Path.home()


def _gemini_dirs(cwd: str) -> list:
    """<project_hash> is sha256 of the project ROOT - which may be this cwd, or the git root above
    it. Try both, then fall back to every project in this home: being one directory out must not
    mean no continuity at all, and `since` still keeps us to a session opened after the pane."""
    root = _home() / '.gemini' / 'tmp'
    tried = [root / hashlib.sha256(str(p).encode()).hexdigest() / 'chats'
             for p in dict.fromkeys(_roots(cwd))]
    return [d for d in tried if d.is_dir()] or sorted(root.glob('*/chats'))


def _roots(cwd: str) -> list:
    here = Path(cwd).resolve()
    out = [here]
    for p in [here, *here.parents]:
        if (p / '.git').exists(): out.append(p); break
    return out


def _id_in_file(path: Path) -> str:
    """The session's own id, as written. A file that names none still has eight characters of it
    in its NAME (session-<ts>-<id8>.json), which is what gemini's own picker shows."""
    try: text = path.read_text(encoding='utf-8', errors='replace')[:100000]
    except OSError: return ''
    try:
        j = json.loads(text.split('\n', 1)[0] if path.suffix == '.jsonl' else text)
        named = next((str(j[k]) for k in _ID_KEYS if isinstance(j, dict) and j.get(k)), '')
        if UUID.fullmatch(named or ''): return named
    except ValueError:
        pass
    found = UUID.search(text)
    if found: return found.group(0)
    tail = path.stem.rsplit('-', 1)[-1]
    return tail if re.fullmatch(r'[0-9a-f]{8}', tail, re.I) else ''


def _id_in_path(path: Path) -> str:
    """cursor keeps one store per chat: ~/.cursor/chats/**/<chat-uuid>/store.db"""
    return next((p for p in (path.parent.name, *(x.name for x in path.parents)) if UUID.fullmatch(p)), '')


SOURCES = {
    'gemini': (_gemini_dirs, 'session-*.json*', _id_in_file),
    'cursor-agent': (lambda cwd: [_home() / '.cursor' / 'chats'], '**/store.db', _id_in_path),
}


def watches(cli: str) -> bool: return cli in SOURCES

def omp_file(directory) -> str:
    """The one session created in this pane's private directory, never a cwd-wide newest guess."""
    try:
        files = list(Path(directory).glob('*.jsonl'))
        if len(files) != 1: return ''
        with files[0].open(encoding='utf-8') as f:
            for _ in range(3):
                try: row = json.loads(f.readline())
                except ValueError: continue
                if row.get('type') == 'session' and row.get('id'):
                    return str(files[0].resolve())
    except (OSError, AttributeError): pass
    return ''


def omp_acp_file(session_id: str, env: dict, argv: list, cwd: str = None) -> str:
    """Find only this ACP session's file, without reading any other conversation."""
    sid = str(session_id or '')
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', sid): return ''
    profile = env.get('OMP_PROFILE') if 'OMP_PROFILE' in env else env.get('PI_PROFILE', '')
    for i, arg in enumerate(argv):
        if arg == '--profile' and i + 1 < len(argv): profile = argv[i + 1]
        elif str(arg).startswith('--profile='): profile = str(arg).split('=', 1)[1]
    profile = str(profile or '').strip()
    if profile == 'default': profile = ''
    if profile and not re.fullmatch(r'[a-z0-9][a-z0-9._-]{0,63}', profile): return ''
    home = Path((env.get('USERPROFILE') if os.name == 'nt' else env.get('HOME')) or str(Path.home()))
    working = Path(cwd or os.getcwd())
    def child_path(value):
        path = Path(value)
        return path if path.is_absolute() else working / path
    config = home / (env.get('PI_CONFIG_DIR') or '.omp')
    if profile:
        agent = config / 'profiles' / profile / 'agent'
    else:
        agent = child_path(env['PI_CODING_AGENT_DIR']) if env.get('PI_CODING_AGENT_DIR') else config / 'agent'
    data = env.get('XDG_DATA_HOME')
    if os.name != 'nt' and data and (profile or not env.get('PI_CODING_AGENT_DIR')):
        xdg = child_path(data) / 'omp'
        if profile: xdg = xdg / 'profiles' / profile
        if xdg.is_dir(): agent = xdg
    try:
        files = list((agent / 'sessions').glob(f'*/*_{sid}.jsonl'))
        if len(files) != 1: return ''
        with files[0].open(encoding='utf-8') as f:
            for _ in range(3):
                try: row = json.loads(f.readline())
                except ValueError: continue
                if isinstance(row, dict) and row.get('type') == 'session' and row.get('id') == sid:
                    return str(files[0])
    except OSError: pass
    return ''


def _omp_session_entries(path: str):
    with open(path, encoding='utf-8') as f:
        for line in f:
            if not line.endswith('\n'): raise ValueError('incomplete session record')
            row = json.loads(line)
            if not isinstance(row, dict): raise ValueError('invalid session record')
            if row.get('type') == 'title': continue
            entry_id = row.get('id')
            if not isinstance(entry_id, str) or not entry_id: raise ValueError('session record has no id')
            yield entry_id, row


def omp_acp_checkpoint(path: str) -> str:
    """Last durable entry before this prompt; an absent anchor must not admit an old success."""
    last = ''
    for entry_id, _ in _omp_session_entries(path): last = entry_id
    if not last: raise ValueError('empty Oh My Pi session')
    return last


def omp_acp_outcome(path: str, previous: str) -> tuple[str, str]:
    """The newest assistant record after the same durable anchor, including across rewrites."""
    try:
        found, last = False, None
        for entry_id, row in _omp_session_entries(path):
            if entry_id == previous:
                if found: return '', ''
                found = True
                continue
            if found and row.get('type') == 'message':
                msg = row.get('message') or {}
                if isinstance(msg, dict) and msg.get('role') == 'assistant': last = msg
        if found and last:
            return str(last.get('stopReason') or ''), str(last.get('errorMessage') or '')
    except (OSError, ValueError, UnicodeError): pass
    return '', ''


def find(cli: str, cwd: str, since: float) -> str:
    """The id of the newest session this CLI filed AFTER `since` - '' when there is none yet."""
    source = SOURCES.get(cli)
    if not source: return ''
    dirs, pattern, read = source
    newest, at = None, since
    for d in dirs(cwd):
        try: candidates = list(Path(d).glob(pattern))
        except OSError: continue
        for f in candidates:
            try: when = f.stat().st_mtime
            except OSError: continue
            if when >= at: newest, at = f, when
    return read(newest) if newest is not None else ''


class SessionWatch(threading.Thread):
    """Wait for the file this pane is about to write, then name the pane after it. Stops with it."""

    def __init__(self, term, cli, directory=None):
        super().__init__(daemon=True)
        self.t, self.cli, self.t0, self.directory = term, cli, time.time() - 3, directory

    def run(self):
        from .terminal import bind_ext
        try:
            while not getattr(self.t, 'ext_id', ''):
                ext = omp_file(self.directory) if self.cli == 'omp' else find(self.cli, self.t.cwd, self.t0)
                bind_ext(self.t, ext)
                if not self.t.alive: break
                time.sleep(2)
        except Exception as e:
            logger.debug(f'session file watch for {getattr(self.t, "sid", "?")} ended: {e}')
