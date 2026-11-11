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


@pytest.mark.skipif(os.name != 'nt', reason='Windows taskkill behavior')
def test_taskkill_failure_is_reported_even_if_root_fallback_stops_it():
    class Process:
        pid = 1234
        alive = True
        def poll(self): return None if self.alive else 0
        def kill(self): self.alive = False
    process = Process()
    with mock.patch.object(spawn, 'run', return_value=subprocess.CompletedProcess([], 1, b'', b'failed')):
        with pytest.raises(RuntimeError, match='process tree'):
            spawn.stop_tree(process)
    assert not process.alive


@pytest.mark.skipif(os.name != 'nt', reason='Windows taskkill behavior')
def test_exited_process_and_pty_do_not_invoke_taskkill():
    class Process:
        pid = 1234
        def poll(self): return 0
    class Pty:
        pid = 1235
        def isalive(self): return False
    with mock.patch.object(spawn, 'run', side_effect=AssertionError('already exited')):
        spawn.stop_tree(Process())
        spawn.stop_tree(Pty())


@pytest.mark.skipif(os.name != 'nt', reason='Windows taskkill behavior')
def test_taskkill_success_stops_pty_while_its_exit_is_not_yet_observed():
    class Pty:
        pid = 1234
        alive = True
        def isalive(self): return self.alive
        def kill(self, sig): self.alive = False
        def terminate(self, force=False):
            if force: self.alive = False
    process = Pty()
    with mock.patch.object(spawn, 'run', return_value=subprocess.CompletedProcess([], 0, b'', b'')):
        spawn.stop_tree(process)
    assert not process.alive


@pytest.mark.skipif(os.name != 'nt', reason='Windows taskkill behavior')
def test_taskkill_failure_reports_live_pty_after_stopping_root():
    class Pty:
        pid = 1234
        alive = True
        def isalive(self): return self.alive
        def kill(self, sig): self.alive = False
        def terminate(self, force=False): self.alive = False
    process = Pty()
    with mock.patch.object(spawn, 'run', return_value=subprocess.CompletedProcess([], 1, b'', b'failed')):
        with pytest.raises(RuntimeError, match='process tree'):
            spawn.stop_tree(process)
    assert not process.alive


@pytest.mark.skipif(os.name != 'posix', reason='POSIX process groups and sessions')
def test_stop_tree_kills_detached_descendants_but_not_unrelated_process(tmp_path):
    release = tmp_path / 'release'
    detached_marker = tmp_path / 'detached'
    unrelated_marker = tmp_path / 'unrelated'
    ready = tmp_path / 'ready'
    fixture = str(Path(__file__).with_name('fake_tree_process.py'))
    parent = subprocess.Popen([sys.executable, fixture, 'parent', str(release), str(detached_marker), str(ready)],
                              stdout=subprocess.PIPE, text=True, start_new_session=True)
    unrelated = None
    try:
        spawn.track_tree(parent)
        unrelated = subprocess.Popen([sys.executable, fixture, 'child', str(release), str(unrelated_marker), str(tmp_path / 'unrelated-ready')],
                                     start_new_session=True)
        assert select.select([parent.stdout], [], [], 10)[0], 'detached child did not start'
        assert int(parent.stdout.readline()) > 0
        with ThreadPoolExecutor(max_workers=2) as pool:
            list(pool.map(lambda _: spawn.stop_tree(parent), range(2)))
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
