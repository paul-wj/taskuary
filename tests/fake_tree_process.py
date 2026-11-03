"""Synthetic process tree for cancellation tests; never starts an agent."""
import pathlib
import subprocess
import sys
import time

mode, release, marker, ready = sys.argv[1:]
release, marker, ready = map(pathlib.Path, (release, marker, ready))
if mode == 'parent':
    child = subprocess.Popen([sys.executable, __file__, 'child', str(release), str(marker), str(ready)],
                             start_new_session=True)
    while not ready.exists(): time.sleep(.02)
    print(child.pid, flush=True)
    time.sleep(60)
elif mode == 'child':
    ready.touch()
    while not release.exists(): time.sleep(.02)
    marker.write_text('alive')
else:
    raise SystemExit('unknown fixture mode')
