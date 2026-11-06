"""Whole packages stay intact, reviewable and isolated from existing Skills."""
import hashlib
from pathlib import Path
import pytest
from taskuary import skillstate as state
from taskuary.store import MemoryStore


def package(root, script='print("ok")\n', binary=b'\x00template\xff'):
    root.mkdir(parents=True, exist_ok=True)
    (root / 'SKILL.md').write_text('---\nname: taskuary-reconcile\ndescription: Reconcile two reports\n---\n\nRun [the script](scripts/check.py) with [example](examples/input.json).\n', encoding='utf-8')
    (root / 'scripts').mkdir(exist_ok=True)
    (root / 'scripts' / 'check.py').write_text(script, encoding='utf-8')
    (root / 'examples').mkdir(exist_ok=True)
    (root / 'examples' / 'input.json').write_text('{"amount": 3}\n', encoding='utf-8')
    (root / 'assets').mkdir(exist_ok=True)
    (root / 'assets' / 'template.bin').write_bytes(binary)
    return root


@pytest.fixture
def home_store(tmp_path, monkeypatch):
    from taskuary import config
    monkeypatch.setattr(config, 'home', lambda: tmp_path)
    store = MemoryStore()
    yield tmp_path, store
    store.close()


def module(home_store, monkeypatch):
    from taskuary import skillpackages
    root, _ = home_store
    monkeypatch.setattr(skillpackages, 'native_roots', lambda: {'codex': root / 'native' / 'skills'}, raising=False)
    return skillpackages


def generation(store, base=None):
    return state.create(store, 'generation', {'slug': 'taskuary-reconcile', 'action': 'update' if base else 'create',
        'base_digest': base, 'task_id': 1, 'state': 'generating'})


def test_full_snapshot_has_binary_and_examples_and_changes_digest_with_script(home_store, monkeypatch):
    p = module(home_store, monkeypatch)
    home, store = home_store
    g = generation(store)
    root = package(p.draft_dir(g['id']))
    first = p.snapshot(store, g['id'])
    files = {f['path']: f for f in first['files']}
    assert set(files) == {'SKILL.md', 'scripts/check.py', 'examples/input.json', 'assets/template.bin'}
    assert files['assets/template.bin']['sha256'] == hashlib.sha256(b'\x00template\xff').hexdigest()
    assert files['assets/template.bin']['binary'] is True
    (root / 'scripts' / 'check.py').write_text('print("changed")\n', encoding='utf-8')
    second = p.snapshot(store, g['id'])
    assert second['digest'] != first['digest']
    assert state.get(store, 'generation', g['id'])['draft_digest'] == second['digest']


def test_invalid_python_and_broken_reference_cannot_be_snapshotted(home_store, monkeypatch):
    p = module(home_store, monkeypatch)
    _, store = home_store
    g = generation(store)
    root = package(p.draft_dir(g['id']), script='def broken(:\n')
    with pytest.raises(ValueError): p.snapshot(store, g['id'])
    (root / 'scripts' / 'check.py').write_text('print("ok")\n', encoding='utf-8')
    (root / 'examples' / 'input.json').unlink()
    with pytest.raises(ValueError): p.snapshot(store, g['id'])
    assert state.rows(store, 'package') == []


def test_published_package_and_native_link_keep_complete_resources(home_store, monkeypatch):
    p = module(home_store, monkeypatch)
    home, store = home_store
    legacy = home / 'skills' / 'metric-legacy'
    legacy.mkdir(parents=True)
    (legacy / 'SKILL.md').write_text('# Existing metric\n', encoding='utf-8')
    g = generation(store)
    package(p.draft_dir(g['id']))
    snap = p.snapshot(store, g['id'])
    result = p.publish(store, g['id'], snap['digest'])
    assert result['digest'] == snap['digest']
    assert (home / 'skills' / 'taskuary-reconcile' / 'assets' / 'template.bin').read_bytes() == b'\x00template\xff'
    assert (home / 'native' / 'skills' / 'taskuary-reconcile' / 'scripts' / 'check.py').read_text() == 'print("ok")\n'
    assert (legacy / 'SKILL.md').read_text() == '# Existing metric\n'
    assert [s['slug'] for s in p.catalogue(store)] == ['taskuary-reconcile']
    assert p.publish(store, g['id'], snap['digest'])['digest'] == snap['digest']


def test_changed_draft_and_changed_live_base_refuse_publication(home_store, monkeypatch):
    p = module(home_store, monkeypatch)
    home, store = home_store
    first = generation(store)
    package(p.draft_dir(first['id']))
    one = p.snapshot(store, first['id'])
    p.publish(store, first['id'], one['digest'])
    second = generation(store, one['digest'])
    root = package(p.draft_dir(second['id']), script='print("v2")\n')
    two = p.snapshot(store, second['id'])
    (root / 'examples' / 'input.json').write_text('{"amount": 4}\n', encoding='utf-8')
    with pytest.raises(ValueError): p.publish(store, second['id'], two['digest'])
    package(root, script='print("v2")\n')
    two = p.snapshot(store, second['id'])
    live = home / 'skills' / 'taskuary-reconcile' / 'scripts' / 'check.py'
    live.write_text('print("manual edit")\n', encoding='utf-8')
    with pytest.raises(ValueError): p.publish(store, second['id'], two['digest'])
    assert live.read_text() == 'print("manual edit")\n'


def test_native_foreign_directory_is_not_overwritten(home_store, monkeypatch):
    p = module(home_store, monkeypatch)
    home, store = home_store
    foreign = home / 'native' / 'skills' / 'taskuary-reconcile'
    foreign.mkdir(parents=True)
    (foreign / 'SKILL.md').write_text('User owned', encoding='utf-8')
    g = generation(store)
    package(p.draft_dir(g['id']))
    snap = p.snapshot(store, g['id'])
    result = p.publish(store, g['id'], snap['digest'])
    assert result['bindings'][0]['state'] == 'conflict'
    assert (foreign / 'SKILL.md').read_text() == 'User owned'


def test_download_requires_exact_revision_and_confined_relative_path(home_store, monkeypatch):
    p = module(home_store, monkeypatch)
    _, store = home_store
    g = generation(store)
    package(p.draft_dir(g['id']))
    snap = p.snapshot(store, g['id'])
    assert p.read_file(store, 'generation', g['id'], 'assets/template.bin', snap['digest']) == b'\x00template\xff'
    with pytest.raises(ValueError): p.read_file(store, 'generation', g['id'], '../config.toml', snap['digest'])
    with pytest.raises(ValueError): p.read_file(store, 'generation', g['id'], 'SKILL.md', 'old')


def test_planted_staging_parent_cannot_escape_taskuary_home(home_store, monkeypatch, tmp_path):
    p = module(home_store, monkeypatch)
    home, store = home_store
    outside = tmp_path / 'outside'
    outside.mkdir()
    (home / 'skill-drafts').symlink_to(outside, target_is_directory=True)
    g = generation(store)
    with pytest.raises(ValueError):
        package(p.draft_dir(g['id']))
        p.snapshot(store, g['id'])
    assert state.rows(store, 'package') == []


def test_symlink_resource_and_reference_escape_are_refused(home_store, monkeypatch):
    p = module(home_store, monkeypatch)
    home, store = home_store
    g = generation(store)
    root = package(p.draft_dir(g['id']))
    secret = home / 'private.txt'
    secret.write_text('private fixture', encoding='utf-8')
    (root / 'references').mkdir(exist_ok=True)
    (root / 'references' / 'source.txt').symlink_to(secret)
    with pytest.raises(ValueError): p.snapshot(store, g['id'])
    (root / 'references' / 'source.txt').unlink()
    (root / 'references' / 'source.md').write_text('[outside](../../../../private.txt)', encoding='utf-8')
    with pytest.raises(ValueError): p.snapshot(store, g['id'])


def test_recovery_commits_a_complete_approved_swap_after_database_interruption(home_store, monkeypatch):
    p = module(home_store, monkeypatch)
    _, store = home_store
    g = generation(store)
    package(p.draft_dir(g['id']))
    snap = p.snapshot(store, g['id'])
    original = state.update
    def interrupted(s, kind, id, changes, **kwargs):
        if kind == 'publication' and changes.get('phase') == 'swapped': raise OSError('fixture interruption')
        return original(s, kind, id, changes, **kwargs)
    with monkeypatch.context() as patch:
        patch.setattr(state, 'update', interrupted)
        with pytest.raises(OSError): p.publish(store, g['id'], snap['digest'])
    assert state.rows(store, 'package') == []
    p.recover(store)
    assert state.by_key(store, 'package', 'taskuary-reconcile')['digest'] == snap['digest']
    assert state.get(store, 'generation', g['id'])['state'] == 'published'


def test_update_diff_includes_deleted_binary_resource(home_store, monkeypatch):
    p = module(home_store, monkeypatch)
    _, store = home_store
    first = generation(store)
    package(p.draft_dir(first['id']))
    initial = p.snapshot(store, first['id'])
    p.publish(store, first['id'], initial['digest'])
    second = generation(store, initial['digest'])
    root = package(p.draft_dir(second['id']), script='print("second revision")\n')
    (root / 'assets' / 'template.bin').unlink()
    view = p.snapshot(store, second['id'])
    changes = {f['path']: f for f in view['files']}
    assert changes['assets/template.bin']['change'] == 'deleted'
    assert changes['assets/template.bin']['binary'] is True
    assert changes['scripts/check.py']['change'] == 'modified'


def test_file_limit_rejects_more_than_512_regular_files(home_store, monkeypatch):
    p = module(home_store, monkeypatch)
    _, store = home_store
    g = generation(store)
    root = package(p.draft_dir(g['id']))
    for i in range(508):
        (root / 'assets' / f'file-{i}.txt').write_text('fixture', encoding='utf-8')
    accepted = p.snapshot(store, g['id'])
    assert len(accepted['files']) == 512
    (root / 'assets' / 'over-limit.txt').write_text('fixture', encoding='utf-8')
    with pytest.raises(ValueError): p.snapshot(store, g['id'])
    assert state.get(store, 'generation', g['id'])['draft_digest'] == accepted['digest']


def test_native_binding_reports_external_retargeting_without_replacing_it(home_store, monkeypatch):
    p = module(home_store, monkeypatch)
    home, store = home_store
    g = generation(store)
    package(p.draft_dir(g['id']))
    snap = p.snapshot(store, g['id'])
    p.publish(store, g['id'], snap['digest'])
    link = home / 'native' / 'skills' / 'taskuary-reconcile'
    link.unlink()
    other = home / 'someone-elses-skill'
    other.mkdir()
    link.symlink_to(other, target_is_directory=True)
    assert p.bindings(store, 'taskuary-reconcile')[0]['state'] == 'conflict'
    p.reconcile_bindings(store, 'taskuary-reconcile')
    assert link.resolve() == other.resolve()


def test_other_script_languages_are_unverified_not_reported_as_checked(home_store, monkeypatch):
    p = module(home_store, monkeypatch)
    _, store = home_store
    g = generation(store)
    root = package(p.draft_dir(g['id']))
    (root / 'scripts' / 'check.ps1').write_text('Write-Output "fixture"\n', encoding='utf-8')
    detail = p.snapshot(store, g['id'])
    assert any(v['state'] == 'missing' and not v['required'] for v in detail['validation'])
    assert detail['missing_checks']


def test_skill_frontmatter_cannot_install_hooks_or_grant_tools(home_store, monkeypatch):
    p = module(home_store, monkeypatch)
    _, store = home_store
    g = generation(store)
    root = package(p.draft_dir(g['id']))
    entry = root / 'SKILL.md'
    original = entry.read_text(encoding='utf-8')
    for grant in ('allowed-tools: Bash(*)', 'hooks: malicious-command', 'permissionMode: bypassPermissions'):
        entry.write_text(original.replace('description:', grant + '\ndescription:', 1), encoding='utf-8')
        with pytest.raises(ValueError): p.snapshot(store, g['id'])
    assert state.rows(store, 'package') == []


def test_retry_publication_records_new_intent_before_another_swap(home_store, monkeypatch):
    p = module(home_store, monkeypatch)
    home, store = home_store
    g = generation(store)
    package(p.draft_dir(g['id']))
    snap = p.snapshot(store, g['id'])
    live = home / 'skills' / 'taskuary-reconcile'
    original_replace, original_update = p.os.replace, state.update
    def blocked(source, target):
        if Path(target) == live: raise OSError('fixture first swap interrupted')
        return original_replace(source, target)
    with monkeypatch.context() as patch:
        patch.setattr(p.os, 'replace', blocked)
        with pytest.raises(OSError): p.publish(store, g['id'], snap['digest'])
    p.recover(store)
    def second_interruption(s, kind, id, changes, **kwargs):
        if kind == 'publication' and changes.get('phase') == 'swapped': raise OSError('fixture second interruption')
        return original_update(s, kind, id, changes, **kwargs)
    with monkeypatch.context() as patch:
        patch.setattr(state, 'update', second_interruption)
        with pytest.raises(OSError): p.publish(store, g['id'], snap['digest'])
    p.recover(store)
    assert state.by_key(store, 'package', 'taskuary-reconcile')['digest'] == snap['digest']


def test_windows_junction_handles_literal_unicode_spaces_and_shell_characters(tmp_path, monkeypatch):
    import os
    if os.name != 'nt': pytest.skip('Windows junction fallback')
    from taskuary import skillpackages as p
    target = tmp_path / '目录 & literal %NAME%'
    target.mkdir()
    (target / 'resource.txt').write_text('literal target', encoding='utf-8')
    link = tmp_path / 'native & entry'
    with monkeypatch.context() as patch:
        patch.setattr(Path, 'symlink_to', lambda *args, **kwargs: (_ for _ in ()).throw(OSError('no symlink privilege')))
        p._link(link, target)
    assert link.lstat().st_reparse_tag == 0xA0000003
    assert (link / 'resource.txt').read_text(encoding='utf-8') == 'literal target'
    link.rmdir()


def test_per_file_and_total_byte_limits_accept_the_exact_boundary(home_store, monkeypatch):
    p = module(home_store, monkeypatch)
    _, store = home_store
    g = generation(store)
    root = package(p.draft_dir(g['id']))
    first = root / 'assets' / 'large-0.bin'
    with first.open('wb') as stream: stream.truncate(32 * 1024 * 1024)
    assert any(f['size'] == 32 * 1024 * 1024 for f in p.inspect(root)['files'])
    with first.open('ab') as stream: stream.write(b'x')
    with pytest.raises(ValueError): p.inspect(root)
    with first.open('wb') as stream: stream.truncate(32 * 1024 * 1024)
    for i in (1, 2):
        with (root / 'assets' / f'large-{i}.bin').open('wb') as stream: stream.truncate(32 * 1024 * 1024)
    current_size = sum(f.stat().st_size for f in root.rglob('*') if f.is_file())
    last = root / 'assets' / 'large-3.bin'
    with last.open('wb') as stream: stream.truncate(128 * 1024 * 1024 - current_size)
    exact = p.inspect(root)
    assert sum(f['size'] for f in exact['files']) == 128 * 1024 * 1024
    with last.open('ab') as stream: stream.write(b'x')
    with pytest.raises(ValueError): p.inspect(root)
