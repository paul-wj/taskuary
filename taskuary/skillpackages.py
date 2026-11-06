"""Complete, reviewed Skill packages and owned native discovery links.

No package code runs here. Publication is a recoverable directory swap, not a
filesystem/SQLite transaction or an OS sandbox for same-user Agent processes.
"""
import ast, hashlib, json, os, re, shutil, stat, subprocess
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlsplit
from loguru import logger
from . import config, spawn, skillstate as state

MAX_FILES, MAX_FILE_BYTES, MAX_BYTES = 512, 32 * 1024 * 1024, 128 * 1024 * 1024
_SLUG = re.compile(r'taskuary-[a-z0-9]+(?:-[a-z0-9]+)*\Z')
_HASH = re.compile(r'[a-f0-9]{64}\Z')


def slug(value):
    value = str(value or '')
    if len(value) > 64 or not _SLUG.fullmatch(value): raise ValueError('Skill name must be taskuary-<lowercase-name>, at most 64 characters')
    return value


def draft_dir(generation_id):
    if int(generation_id) <= 0: raise ValueError('invalid Skill generation')
    return _homepath('skill-drafts', str(int(generation_id)), 'package')


def _linked(path):
    try: return path.is_symlink() or bool(path.lstat().st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT)
    except AttributeError: return path.is_symlink()
    except FileNotFoundError: return path.is_symlink()


def _plain(path):
    if _linked(path): raise ValueError('Skill paths may not be symlinks or reparse points')


def _homepath(*parts):
    path = config.home().resolve()
    for part in parts:
        path = path / part
        _plain(path)
    return path


def _inside(root, value):
    if not isinstance(value, str) or not value or '\\' in value or '\x00' in value:
        raise ValueError('invalid relative Skill path')
    p = PurePosixPath(value)
    if p.is_absolute() or any(x in ('..', '.') or ':' in x for x in p.parts): raise ValueError('Skill path escapes its package')
    result = root.joinpath(*p.parts)
    for component in (root, *[root.joinpath(*p.parts[:i]) for i in range(1, len(p.parts) + 1)]): _plain(component)
    if not result.resolve().is_relative_to(root.resolve()): raise ValueError('Skill path escapes its package')
    return result


def _syntax(path, text):
    ext = path.suffix.lower()
    if ext in ('.py', '.pyw'):
        try: ast.parse(text, filename=str(path))
        except (SyntaxError, ValueError) as e: raise ValueError(f'{path.name}: Python syntax check failed') from e
    elif ext in ('.js', '.mjs', '.cjs'):
        node = shutil.which('node')
        if not node: return {'check': f'syntax:{path.name}', 'state': 'missing', 'required': True, 'detail': 'Node is required for JavaScript syntax validation'}
        env = {k: v for k, v in os.environ.items() if k not in ('NODE_OPTIONS', 'NODE_PATH')}
        try: result = spawn.run([node, '--check', str(path)], capture_output=True, timeout=30, env=env)
        except (OSError, subprocess.SubprocessError) as e: raise ValueError(f'{path.name}: syntax checker could not run') from e
        if result.returncode: raise ValueError(f'{path.name}: JavaScript syntax check failed')
    elif ext in ('.ps1', '.sh', '.bash', '.bat', '.cmd', '.rb', '.pl', '.php', '.lua', '.r', '.ts', '.tsx', '.jsx', '.go') or text.startswith('#!'):
        return {'check': f'syntax:{path.name}', 'state': 'missing', 'required': False,
                'detail': 'No built-in syntax checker for this script type; inspect the Agent task validation evidence.'}
    return None


def _references(root, relative, text):
    # Markdown links are relative to their document; inline scripts/... paths in SKILL.md are relative to the package.
    links = re.findall(r'!?\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)', text)
    if relative == 'SKILL.md': links += re.findall(r'`((?:scripts|references|examples|assets)/[^`\s]+)`', text)
    for raw in links:
        link = urlsplit(raw.strip('<>'))
        if link.scheme or link.netloc or not link.path: continue
        decoded = unquote(link.path)
        if '\\' in decoded or '\x00' in decoded or ':' in decoded or decoded.startswith('/'):
            raise ValueError(f'{relative}: resource reference escapes the package')
        target = (root / relative).parent / decoded
        resolved = target.resolve()
        if not resolved.is_relative_to(root.resolve()) or not resolved.exists():
            raise ValueError(f'{relative}: missing or unsafe resource reference {decoded}')
        # A reference cannot traverse a planted link even when that link resolves inside.
        current = root
        for part in PurePosixPath(str(target.relative_to(root)).replace('\\', '/')).parts:
            current = current / part
            _plain(current)


def inspect(root):
    from .skillimport import parse
    root = Path(root)
    _plain(root)
    if not root.is_dir(): raise ValueError('Skill package directory is missing')
    files, seen, total, checks = [], set(), 0, []
    pending = [root]
    while pending:
        folder = pending.pop()
        _plain(folder)
        for path in sorted(folder.iterdir(), key=lambda p: p.name):
            _plain(path)
            if path.name.casefold() in ('__pycache__', '.git'): raise ValueError('remove build/cache directories from the Skill package')
            rel = path.relative_to(root).as_posix()
            if any(':' in p or p.endswith(('.', ' ')) for p in path.relative_to(root).parts): raise ValueError('invalid portable Skill resource path')
            folded = rel.casefold()
            if folded in seen: raise ValueError('Skill resource paths collide ignoring case')
            seen.add(folded)
            if path.is_dir(): pending.append(path); continue
            mode = path.stat().st_mode
            if not stat.S_ISREG(mode): raise ValueError('only regular Skill resource files are allowed')
            size = path.stat().st_size
            total += size
            if len(files) >= MAX_FILES or size > MAX_FILE_BYTES or total > MAX_BYTES: raise ValueError('Skill package exceeds file or byte limits')
            data = path.read_bytes()
            if len(data) != size: raise ValueError('Skill resource changed while being read')
            try: text = data.decode('utf-8') if b'\x00' not in data else None
            except UnicodeDecodeError: text = None
            if text is not None:
                missing = _syntax(path, text)
                if missing: checks.append(missing)
                if path.suffix.lower() == '.md': _references(root, rel, text)
            elif path.suffix.lower() in ('.py', '.js', '.mjs', '.cjs'): raise ValueError('script resources must be UTF-8 text')
            files.append({'path': rel, 'size': size, 'sha256': hashlib.sha256(data).hexdigest(),
                          'binary': text is None, 'text': text, 'executable': bool(mode & 0o111) if os.name != 'nt' else False})
    files.sort(key=lambda f: f['path'])
    entry = next((f for f in files if f['path'] == 'SKILL.md'), None)
    if not entry or entry['binary']: raise ValueError('a Skill requires a UTF-8 SKILL.md')
    header = re.match(r'^---\s*\n(.*?)\n---(?:\s*\n|$)', entry['text'], flags=re.S)
    if not header: raise ValueError('SKILL.md needs standard YAML frontmatter')
    keys = re.findall(r'(?m)^([A-Za-z][A-Za-z0-9_-]*)\s*:', header[1])
    if len(keys) != len(set(keys)) or any(key not in ('name', 'description', 'license', 'compatibility', 'metadata') for key in keys):
        raise ValueError('Skill frontmatter may contain only portable name, description, license, compatibility and metadata fields; no tool grants or hooks')
    metadata = parse(entry['text'])
    name = slug(metadata['name'])
    if not str(metadata['description']).strip() or not str(metadata['body']).strip(): raise ValueError('SKILL.md needs a description and instructions')
    digest = hashlib.sha256(json.dumps([(f['path'], f['sha256'], f['executable']) for f in files], ensure_ascii=False,
                                       separators=(',', ':')).encode()).hexdigest()
    checks = [{'check': check, 'state': 'passed', 'required': True, 'detail': ''}
              for check in ('package_safety', 'frontmatter', 'references', 'supported_script_syntax')] + checks
    return {'name': name, 'description': metadata['description'], 'digest': digest, 'files': files,
            'validation': checks, 'missing_checks': [c['detail'] for c in checks if c['state'] == 'missing']}


def _snapshot_root(gid, digest):
    if not _HASH.fullmatch(str(digest)): raise ValueError('invalid Skill revision')
    return _homepath('skill-state', 'snapshots', str(int(gid)), digest)


def _version(slug_, digest):
    if not _HASH.fullmatch(str(digest)): raise ValueError('invalid published revision')
    return _homepath('skill-state', 'versions', slug(slug_), digest)


def _copy(source, target, digest):
    if target.exists():
        if inspect(target)['digest'] != digest: raise ValueError('saved Skill snapshot was changed')
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    # Keep planted links as links so the validating scan refuses them rather than copying outside data.
    shutil.copytree(source, target, symlinks=True)
    if inspect(target)['digest'] != digest: raise ValueError('Skill package changed during snapshot')


def snapshot(store, generation_id):
    generation = state.get(store, 'generation', generation_id)
    if not generation: raise ValueError('Skill generation not found')
    detail = inspect(draft_dir(generation_id))
    if detail['name'] != slug(generation['slug']): raise ValueError('SKILL.md name must match the proposed Skill')
    if any(v['required'] and v['state'] != 'passed' for v in detail['validation']): raise ValueError('; '.join(detail['missing_checks']))
    destination = _snapshot_root(generation_id, detail['digest'])
    _copy(draft_dir(generation_id), destination, detail['digest'])
    if inspect(draft_dir(generation_id))['digest'] != detail['digest']: raise ValueError('Skill draft changed during snapshot')
    state.update(store, 'generation', generation_id, {'draft_digest': detail['digest']})
    return diff(store, generation_id)


def diff(store, generation_id):
    generation = state.get(store, 'generation', generation_id)
    if not generation or not generation.get('draft_digest'): raise ValueError('no reviewed Skill snapshot exists')
    current = inspect(_snapshot_root(generation_id, generation['draft_digest']))
    if current['digest'] != generation['draft_digest']: raise ValueError('reviewed Skill snapshot changed')
    previous = inspect(_version(generation['slug'], generation['base_digest'])) if generation.get('base_digest') else {'files': []}
    before, after = ({f['path']: f for f in package['files']} for package in (previous, current))
    files = []
    for path in sorted(before.keys() | after.keys()):
        old, new = before.get(path), after.get(path)
        change = 'added' if old is None else 'deleted' if new is None else 'unchanged' if (old['sha256'], old['executable']) == (new['sha256'], new['executable']) else 'modified'
        item = new or old
        files.append({**{k: item[k] for k in ('path', 'size', 'sha256', 'binary', 'executable')}, 'change': change,
                      'before_text': old.get('text') if old else None, 'after_text': new.get('text') if new else None})
    return {'digest': current['digest'], 'files': files, 'validation': current['validation'], 'missing_checks': current['missing_checks']}


@contextmanager
def _lock(name):
    path = _homepath('skill-state', 'locks', slug(name) + '.lock')
    path.parent.mkdir(parents=True, exist_ok=True)
    _plain(path)
    with path.open('a+b') as handle:
        if os.name == 'nt':
            import msvcrt
            if not path.stat().st_size: handle.write(b'0'); handle.flush()
            handle.seek(0); msvcrt.locking(handle.fileno(), msvcrt.LK_LOCK, 1)
            try: yield
            finally: handle.seek(0); msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
            try: yield
            finally: fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def native_roots():
    user = Path.home()
    return {'codex': user / '.agents' / 'skills',
            'claude': Path(os.environ.get('CLAUDE_CONFIG_DIR') or user / '.claude') / 'skills'}


def _junction(link, target):
    # Native reparse points preserve literal Unicode/%/& paths; cmd.exe would reinterpret them.
    import ctypes, struct
    from ctypes import wintypes
    target_name = str(target.resolve())
    if target_name.startswith('\\\\?\\UNC\\'): substitute = '\\??\\UNC\\' + target_name[8:]
    elif target_name.startswith('\\\\?\\'): substitute = '\\??\\' + target_name[4:]
    elif target_name.startswith('\\\\'): substitute = '\\??\\UNC\\' + target_name[2:]
    else: substitute = '\\??\\' + target_name
    sub, printed = substitute.encode('utf-16-le'), target_name.encode('utf-16-le')
    paths = sub + b'\0\0' + printed + b'\0\0'
    data = struct.pack('<IHHHHHH', 0xA0000003, len(paths) + 8, 0, 0, len(sub), len(sub) + 2, len(printed)) + paths
    if len(data) > 16384: raise ValueError('the native Skill link target is too long')
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, wintypes.LPVOID, wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
    kernel.CreateFileW.restype = wintypes.HANDLE
    kernel.DeviceIoControl.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.LPVOID, wintypes.DWORD, wintypes.LPVOID, wintypes.DWORD, ctypes.POINTER(wintypes.DWORD), wintypes.LPVOID]
    kernel.DeviceIoControl.restype = wintypes.BOOL
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel.CloseHandle.restype = wintypes.BOOL
    link.mkdir()
    try:
        handle = kernel.CreateFileW(str(link), 0x40000000, 3, None, 3, 0x02200000, None)
        if handle == ctypes.c_void_p(-1).value: raise ctypes.WinError(ctypes.get_last_error())
        try:
            buffer, returned = ctypes.create_string_buffer(data, len(data)), wintypes.DWORD()
            if not kernel.DeviceIoControl(handle, 0x900A4, buffer, len(data), None, 0, ctypes.byref(returned), None):
                raise ctypes.WinError(ctypes.get_last_error())
        finally: kernel.CloseHandle(handle)
    except BaseException:
        if not _linked(link):
            try: link.rmdir()
            except OSError as cleanup: logger.warning(f'failed Skill link left for inspection ({type(cleanup).__name__})')
        raise


def _link(link, target):
    try: link.symlink_to(target, target_is_directory=True)
    except OSError:
        if os.name != 'nt': raise
        _junction(link, target)


def _identity(path): return os.path.normcase(os.path.realpath(path))


def reconcile_bindings(store, slug_):
    name = slug(slug_)
    package = state.by_key(store, 'package', name)
    if not package: raise ValueError('only library-owned published Skills can be exposed')
    canonical = _homepath('skills', name)
    results = []
    for cli, root in native_roots().items():
        root = Path(root)
        link = root / name
        record = {'cli': cli, 'path': str(link), 'state': 'linked', 'error': None}
        try:
            if not canonical.is_dir() or _linked(canonical): raise ValueError('published Skill directory is missing or unsafe')
            if os.path.lexists(link):
                if not _linked(link) or _identity(link) != _identity(canonical):
                    record.update(state='conflict', error='this native Skill entry belongs to another directory or Taskuary home')
            else:
                root.mkdir(parents=True, exist_ok=True)
                _link(link, canonical)
                if not _linked(link) or _identity(link) != _identity(canonical): raise ValueError('native Skill link target is not the published package')
        except (OSError, ValueError, subprocess.SubprocessError) as e:
            record.update(state='failed', error=str(e))
        key = name + ':' + cli
        existing = state.by_key(store, 'binding', key)
        payload = {**record, 'slug': name, 'home': str(config.home().resolve())}
        if existing: state.update(store, 'binding', existing['id'], payload)
        else: state.create(store, 'binding', payload, key=key)
        results.append(record)
    state.update(store, 'package', package['id'], {'bindings': results})
    return results


def bindings(store, slug_):
    canonical = _homepath('skills', slug(slug_))
    result = []
    for row in state.rows(store, 'binding'):
        if row.get('slug') != slug_: continue
        record = {k: row.get(k) for k in ('cli', 'path', 'state', 'error')}
        path = Path(record['path'])
        if not os.path.lexists(path): record.update(state='unavailable', error='the native Skill link is missing')
        elif not _linked(path) or _identity(path) != _identity(canonical): record.update(state='conflict', error='the native Skill entry points elsewhere')
        elif not canonical.is_dir(): record.update(state='unavailable', error='the published Skill directory is missing')
        else: record.update(state='linked', error=None)
        result.append(record)
    return result


def catalogue(store):
    return [p for p in state.rows(store, 'package') if _SLUG.fullmatch(str(p.get('slug') or ''))]


def _commit(store, generation, detail, journal):
    payload = {'slug': generation['slug'], 'name': detail['name'], 'description': detail['description'], 'digest': detail['digest'],
               'generation_id': generation['id'], 'origin_task_ids': generation.get('origin_task_ids', []),
               'published_at': datetime.now().isoformat(timespec='seconds'), 'bindings': []}
    package = state.by_key(store, 'package', generation['slug'])
    package = state.update(store, 'package', package['id'], payload) if package else state.create(store, 'package', payload, key=generation['slug'])
    state.update(store, 'generation', generation['id'], {'state': 'published', 'published_digest': detail['digest']})
    state.update(store, 'publication', journal['id'], {'phase': 'committed'})
    return package


def publish(store, generation_id, digest, actor='owner'):
    if actor not in ('owner', 'web'): raise PermissionError('only the owner can publish a Skill')
    generation = state.get(store, 'generation', generation_id)
    if not generation: raise ValueError('Skill generation not found')
    name = slug(generation['slug'])
    with _lock(name):
        package = state.by_key(store, 'package', name)
        if generation.get('state') == 'published' and generation.get('published_digest') == digest:
            if not package or package['digest'] != digest: raise ValueError('the published revision changed')
            return package
        if generation.get('state') in ('discarded', 'failed', 'interrupted'): raise ValueError('this Skill draft is not publishable')
        if generation.get('draft_digest') != digest: raise ValueError('the reviewed Skill draft changed')
        draft = inspect(draft_dir(generation_id))
        detail = inspect(_snapshot_root(generation_id, digest))
        if detail['digest'] != digest or draft['digest'] != digest: raise ValueError('the Skill draft changed after review')
        required = detail['validation'] + generation.get('validation', [])
        if any(c.get('required') and c.get('state') != 'passed' for c in required): raise ValueError('required Skill validation has not passed')
        live = _homepath('skills', name)
        if os.path.lexists(live) and not package: raise ValueError('the destination Skill directory is not owned by this library')
        base = generation.get('base_digest')
        if (package or {}).get('digest') != base: raise ValueError('the published Skill base changed')
        if package and (not live.is_dir() or inspect(live)['digest'] != base): raise ValueError('the published Skill changed on disk')
        if not package and os.path.lexists(live): raise ValueError('the Skill destination is occupied')
        version = _version(name, digest)
        _copy(_snapshot_root(generation_id, digest), version, digest)
        journal = state.create(store, 'publication', {'slug': name, 'generation_id': generation_id, 'old_digest': base,
            'new_digest': digest, 'phase': 'prepared'}, key=f'{generation_id}:{digest}')
        journal = state.update(store, 'publication', journal['id'], {'phase': 'prepared', 'error': None})
        work = _homepath('skill-state', 'publications', str(journal['id']))
        next_dir, backup = work / 'next', work / 'previous'
        _copy(version, next_dir, digest)
        live.parent.mkdir(parents=True, exist_ok=True)
        if live.exists():
            if backup.exists(): raise ValueError('recover the interrupted Skill publication before publishing again')
            os.replace(live, backup)
        os.replace(next_dir, live)
        state.update(store, 'publication', journal['id'], {'phase': 'swapped'})
        package = _commit(store, generation, detail, journal)
        package['bindings'] = reconcile_bindings(store, name)
        store.audit('skill', generation_id, 'published', actor, detail={'slug': name, 'digest': digest})
        state.notify(store, task_id=generation.get('task_id'))
        return package


def recover(store):
    recovered = []
    for journal in reversed(state.rows(store, 'publication')):
        if journal.get('phase') in ('committed', 'failed'): continue
        name = slug(journal['slug'])
        with _lock(name):
            live = _homepath('skills', name)
            backup = _homepath('skill-state', 'publications', str(journal['id']), 'previous')
            generation = state.get(store, 'generation', journal['generation_id'])
            try:
                detail = inspect(live) if live.exists() else None
                if detail and detail['digest'] == journal['new_digest'] and generation:
                    _commit(store, generation, detail, journal)
                    recovered.append({'slug': name, 'state': 'published'})
                elif not live.exists() and backup.exists() and inspect(backup)['digest'] == journal.get('old_digest'):
                    live.parent.mkdir(parents=True, exist_ok=True); os.replace(backup, live)
                    state.update(store, 'publication', journal['id'], {'phase': 'failed', 'error': 'previous complete revision restored'})
                else:
                    state.update(store, 'publication', journal['id'], {'phase': 'failed', 'error': 'publication interrupted; existing content retained'})
            except (OSError, ValueError) as e:
                state.update(store, 'publication', journal['id'], {'phase': 'failed', 'error': str(e)})
    for package in catalogue(store): reconcile_bindings(store, package['slug'])
    return recovered


def read_file(store, kind, key, path, digest):
    if kind == 'generation':
        generation = state.get(store, 'generation', int(key))
        if not generation: raise ValueError('the Skill generation no longer exists')
        if generation.get('draft_digest') == digest: root = _snapshot_root(int(key), digest)
        elif generation.get('base_digest') and generation['base_digest'] == digest: root = _version(generation['slug'], digest)
        else: raise ValueError('the Skill draft revision changed')
    elif kind == 'package':
        package = state.by_key(store, 'package', slug(key))
        if not package or package.get('digest') != digest: raise ValueError('the published Skill revision changed')
        root = _homepath('skills', package['slug'])
    else: raise ValueError('invalid Skill resource scope')
    detail = inspect(root)
    if detail['digest'] != digest: raise ValueError('the Skill package changed on disk')
    file = _inside(root, path)
    if not file.is_file(): raise ValueError('Skill resource not found')
    data = file.read_bytes()
    record = next((f for f in detail['files'] if f['path'] == path), None)
    if not record or hashlib.sha256(data).hexdigest() != record['sha256']: raise ValueError('Skill resource changed during download')
    return data
