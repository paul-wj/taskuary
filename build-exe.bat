@echo off
setlocal
pushd "%~dp0" || exit /b 1

if not exist ".venv\Scripts\python.exe" (
    echo Missing .venv\Scripts\python.exe. Create the project virtual environment first. 1>&2
    goto :failed
)
where.exe /q npm.cmd
if errorlevel 1 (
    echo npm.cmd not found. Install Node.js 22.12 or newer and reopen the terminal. 1>&2
    goto :failed
)

set "TASKUARY_ONEDIR="
echo [1/4] Installing frontend dependencies...
call npm.cmd --prefix website ci
if errorlevel 1 goto :failed

echo [2/4] Building the frontend...
call npm.cmd --prefix website run build
if errorlevel 1 goto :failed

echo [3/4] Installing Python packaging dependencies...
".venv\Scripts\python.exe" -m pip install -e ".[mssql,desktop,build,bundle]"
if errorlevel 1 goto :failed

echo [4/4] Packaging Taskuary.exe...
".venv\Scripts\python.exe" -m PyInstaller taskuary.spec
if errorlevel 1 goto :failed

echo Build complete: "%CD%\dist\Taskuary.exe"
popd
exit /b 0

:failed
echo Packaging failed. See the error above. 1>&2
popd
exit /b 1
