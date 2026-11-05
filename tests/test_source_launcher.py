"""Source launcher checks fail closed before importing the application or opening its UI."""
import importlib.util
from pathlib import Path

import pytest


def launcher():
    spec = importlib.util.spec_from_file_location('source_launcher', Path(__file__).parents[1] / 'tools' / 'start_taskuary.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_source_requirements_detect_missing_and_outdated_packages_but_ignore_other_platforms(tmp_path):
    start = launcher()
    (tmp_path / 'pyproject.toml').write_text('''[project]
dependencies = ["taskuary-launcher-missing-fixture>=1", "fastapi>=99999", "taskuary-other-platform; python_version < '2'"]
''', encoding='utf-8')
    problems = start.dependency_problems(tmp_path)
    assert len(problems) == 2
    assert any('taskuary-launcher-missing-fixture' in p for p in problems)
    assert any('fastapi' in p for p in problems)
    assert not any('taskuary-other-platform' in p for p in problems)


def test_missing_built_asset_blocks_startup(tmp_path):
    start = launcher()
    web = tmp_path / 'taskuary' / 'web'
    web.mkdir(parents=True)
    (web / 'index.html').write_text('<script type="module" src="/assets/missing.js"></script>', encoding='utf-8')
    with pytest.raises(start.StartupError, match='missing.js'):
        start.check_ui(tmp_path)


def test_missing_index_blocks_startup(tmp_path):
    start = launcher()
    with pytest.raises(start.StartupError, match='index.html'):
        start.check_ui(tmp_path)


def test_source_egg_info_does_not_trigger_reinstall_of_valid_editable_install(tmp_path, monkeypatch):
    import json
    start = launcher()
    source = tmp_path / 'taskuary.egg-info'
    installed = tmp_path / 'site' / 'taskuary-1.0.dist-info'
    for folder in (source, installed):
        folder.mkdir(parents=True)
        (folder / 'METADATA').write_text('Name: taskuary\nVersion: 1.0\n', encoding='utf-8')
    (installed / 'direct_url.json').write_text(json.dumps({'url': tmp_path.as_uri(), 'dir_info': {'editable': True}}), encoding='utf-8')
    monkeypatch.syspath_prepend(str(tmp_path / 'site'))
    monkeypatch.syspath_prepend(str(tmp_path))
    assert start.installed_here(tmp_path)
    assert not start.installed_here(tmp_path / 'other-checkout')
