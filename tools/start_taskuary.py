"""Double-click source launcher. Bootstrap only core dependencies, then use the normal CLI."""
import importlib
import importlib.metadata as metadata
import json, os, shutil, subprocess, sys, sysconfig
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import url2pathname


class StartupError(RuntimeError): pass


def dependency_problems(root: Path) -> list:
    try:
        try: import tomllib
        except ImportError: import tomli as tomllib
        from pip._vendor.packaging.requirements import Requirement
    except ImportError:
        return ['Python dependency checker is not installed']
    project = tomllib.loads((root / 'pyproject.toml').read_text(encoding='utf-8'))
    pending, checked, problems = list(project['project']['dependencies']), set(), []
    while pending:
        req = Requirement(pending.pop())
        if req.marker and not req.marker.evaluate({'extra': ''}): continue
        key = str(req)
        if key in checked: continue
        checked.add(key)
        try: dist = metadata.distribution(req.name)
        except metadata.PackageNotFoundError:
            problems.append(f'{req}: not installed'); continue
        if req.specifier and not req.specifier.contains(dist.version, prereleases=True):
            problems.append(f'{req}: installed {dist.version}'); continue
        pending.extend(dist.requires or [])
    return problems


def check_ui(root: Path):
    web = root / 'taskuary' / 'web'
    index = web / 'index.html'
    if not index.is_file():
        raise StartupError(f'Missing {index}. Run npm ci and npm run build in website, then start again.')
    class Assets(HTMLParser):
        def handle_starttag(self, tag, attrs):
            for name, value in attrs:
                if name in ('src', 'href') and value and value.startswith('/assets/'):
                    asset = web / urlsplit(value).path.lstrip('/')
                    if not asset.is_file():
                        raise StartupError(f'Missing {asset}. Run npm ci and npm run build in website, then start again.')
    Assets().feed(index.read_text(encoding='utf-8'))


def installed_here(root: Path) -> bool:
    for dist in metadata.distributions(name='taskuary'):
        try:
            direct = json.loads(dist.read_text('direct_url.json') or '{}')
            url = urlsplit(direct.get('url', ''))
            if (url.scheme == 'file' and direct.get('dir_info', {}).get('editable') is True
                    and Path(url2pathname(url.path)).resolve() == root.resolve()): return True
        except (ValueError, OSError): continue
    return False


def prepare(root: Path):
    print('[1/3] Checking built UI...', flush=True)
    check_ui(root)
    print('[2/3] Checking Python dependencies and taskuary command...', flush=True)
    scripts = sysconfig.get_path('scripts')
    # Native Windows PATH, not the /c/... spelling a Bash wrapper might pass through.
    os.environ['PATH'] = scripts + os.pathsep + os.environ.get('PATH', '')
    problems = dependency_problems(root)
    command = Path(scripts) / ('taskuary.exe' if os.name == 'nt' else 'taskuary')
    if problems or not installed_here(root) or not command.is_file():
        for problem in problems: print(f'  {problem}', flush=True)
        print('Installing required packages into the project virtual environment (network may be needed)...', flush=True)
        subprocess.run([sys.executable, '-m', 'pip', 'install', '--disable-pip-version-check', '-e', str(root)],
                       cwd=root, check=True)
        importlib.invalidate_caches()
        problems = dependency_problems(root)
        if problems: raise StartupError('Dependencies are still unavailable: ' + '; '.join(problems))
    resolved = shutil.which('taskuary')
    if not resolved or Path(resolved).resolve() != command.resolve():
        raise StartupError(f'taskuary does not resolve to {command}')
    probe = subprocess.run([str(command), '--help'], cwd=root, capture_output=True)
    if probe.returncode:
        raise StartupError('taskuary command failed: ' + probe.stderr.decode('utf-8', errors='replace'))
    print(f'  taskuary: {command}', flush=True)
    print('[3/3] Ready. Starting the normal app; UI opens only after the server answers.', flush=True)


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    if sys.version_info < (3, 10):
        print('Startup failed: Python 3.10 or newer is required. Install Python and try again.')
        return 1
    python = root / '.venv' / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    try:
        if Path(sys.prefix).resolve() != (root / '.venv').resolve():
            if not python.is_file():
                print('Creating project virtual environment...', flush=True)
                subprocess.run([sys.executable, '-m', 'venv', str(root / '.venv')], cwd=root, check=True)
            return subprocess.call([str(python), str(Path(__file__).resolve()), *sys.argv[1:]], cwd=root)
        os.chdir(root)
        sys.path.insert(0, str(root))
        prepare(root)
        if sys.argv[1:] == ['--check']: return 0
        if not sys.argv[1:]:
            from launcher_gui import main as launch_gui
            launch_gui(root)
            return 0
        from taskuary.cli import main as start
        start()
        return 0
    except (StartupError, OSError, subprocess.CalledProcessError, ValueError) as e:
        print(f'Startup failed: {e}', flush=True)
        return 1
    except KeyboardInterrupt:
        return 130


if __name__ == '__main__':
    raise SystemExit(main())
