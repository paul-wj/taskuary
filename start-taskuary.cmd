@echo off
setlocal
cd /d "%~dp0"
title Taskuary Launcher
if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" "tools\start_taskuary.py" %*
    goto finished
)
where py >nul 2>nul
if not errorlevel 1 (
    py -3 "tools\start_taskuary.py" %*
    goto finished
)
where python >nul 2>nul
if not errorlevel 1 (
    python "tools\start_taskuary.py" %*
    goto finished
)
echo Startup failed: Python 3.10 or newer is required. Install Python and try again.
pause
exit /b 1

:finished
set "result=%errorlevel%"
if not "%result%"=="0" (
    echo.
    echo Taskuary did not start successfully. See the error above.
    pause
)
exit /b %result%
