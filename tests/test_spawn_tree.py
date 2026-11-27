"""Stopping an agent also stops descendants that created their own session."""
import os
import select
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest import mock

import pytest

from taskuary import spawn


@pytest.mark.skipif(os.name != 'nt', reason='Windows native process-tree termination')
def test_native_tree_failure_is_reported():
    with mock.patch.object(spawn, '_end_tree', side_effect=PermissionError('cannot stop a descendant')):
        with pytest.raises(PermissionError, match='cannot stop a descendant'):
            spawn.end(1234)


@pytest.mark.skipif(os.name != 'nt', reason='Windows native process-tree termination')
def test_end_does_not_report_success_while_a_child_still_runs():
    class Process:
        pid = 1234
        def poll(self): return None
        def wait(self, timeout): raise subprocess.TimeoutExpired('fixture', timeout)

    with mock.patch.object(spawn, '_end_tree'):
        with pytest.raises(RuntimeError, match='process tree'):
            spawn.end(Process())


@pytest.mark.skipif(os.name != 'posix', reason='POSIX process groups and sessions')
def test_end_kills_detached_descendants_but_not_unrelated_process(tmp_path):
    release = tmp_path / 'release'
    detached_marker = tmp_path / 'detached'
    unrelated_marker = tmp_path / 'unrelated'
    ready = tmp_path / 'ready'
    fixture = str(Path(__file__).with_name('fake_tree_process.py'))
    parent = subprocess.Popen([sys.executable, fixture, 'parent', str(release), str(detached_marker), str(ready)],
                              stdout=subprocess.PIPE, text=True, start_new_session=True)
    unrelated = None
    try:
        unrelated = subprocess.Popen([sys.executable, fixture, 'child', str(release), str(unrelated_marker), str(tmp_path / 'unrelated-ready')],
                                     start_new_session=True)
        assert select.select([parent.stdout], [], [], 10)[0], 'detached child did not start'
        assert int(parent.stdout.readline()) > 0
        with ThreadPoolExecutor(max_workers=2) as pool:
            list(pool.map(lambda _: spawn.end(parent), range(2)))
        parent.wait(timeout=10)
        release.touch()
        unrelated.wait(timeout=10)
        assert unrelated_marker.exists(), 'unrelated process was stopped'
        time.sleep(1)
        assert not detached_marker.exists(), 'detached descendant continued after cancellation'
    finally:
        release.touch()
        for process in (parent, unrelated):
            if process is not None and process.poll() is None:
                try: process.kill()
                except ProcessLookupError: pass
        for process in (parent, unrelated):
            if process is None: continue
            try: process.wait(timeout=5)
            except subprocess.TimeoutExpired: pass
        parent.stdout.close()
