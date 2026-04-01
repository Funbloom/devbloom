@echo off
setlocal EnableDelayedExpansion
:: Run from repo root so `local_agent` imports resolve. Creates local_agent\.venv on first run.
:: Requires Python 3.10+ on PATH as `python`, or the Windows `py` launcher (`py -3`).

set "AGENT_DIR=%~dp0"
set "REPO_ROOT=%AGENT_DIR%.."
cd /d "%REPO_ROOT%"

set "VENV_PY=%AGENT_DIR%.venv\Scripts\python.exe"
set "VENV_PIP=%AGENT_DIR%.venv\Scripts\pip.exe"

if exist "%VENV_PY%" goto :deps

call :find_python
if errorlevel 1 exit /b 1

echo [local_agent] Creating venv in local_agent\.venv ...
!PY_RUN! -m venv "%AGENT_DIR%.venv"
if errorlevel 1 (
  echo ERROR: Could not create venv.
  call :print_python_help
  exit /b 1
)

:deps
echo [local_agent] Installing dependencies...
"%VENV_PIP%" install -q -r "%AGENT_DIR%requirements.txt"
if errorlevel 1 (
  echo ERROR: pip install failed.
  exit /b 1
)

echo [local_agent] http://127.0.0.1:8765  ^(Ctrl+C to stop^)
"%VENV_PY%" -m uvicorn local_agent.main:app --host 127.0.0.1 --port 8765
exit /b %ERRORLEVEL%

:find_python
set "PY_RUN="
where python >nul 2>&1
if not errorlevel 1 (
  python -c "import sys; raise SystemExit(0 if sys.version_info>=(3,10) else 1)" 2>nul
  if not errorlevel 1 set "PY_RUN=python"
)
if defined PY_RUN exit /b 0
where py >nul 2>&1
if not errorlevel 1 (
  py -3 -c "import sys; raise SystemExit(0 if sys.version_info>=(3,10) else 1)" 2>nul
  if not errorlevel 1 set "PY_RUN=py -3"
)
if defined PY_RUN exit /b 0
call :print_python_help
exit /b 1

:print_python_help
echo.
echo The local agent is a small Python service. Python 3.10+ must be installed to run it.
echo.
echo Install options ^(then open a new terminal and run this script again^):
echo   - winget:  winget install Python.Python.3.12
echo   - Website: https://www.python.org/downloads/  ^(check "Add python.exe to PATH"^)
echo   - Store:   Microsoft Store -^> Python 3.12
echo.
echo If Python is installed but not found, enable "Add python.exe to PATH" or use the py launcher.
exit /b 1
