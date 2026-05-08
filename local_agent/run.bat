@echo off
setlocal EnableDelayedExpansion
:: Run from repo root so `local_agent` imports resolve. Uses the SHARED root .venv
:: (one venv at the repo root for both api and local_agent). Creates it on first run.
:: Requires Python 3.10+ on PATH as `python`, or the Windows `py` launcher (`py -3`).

set "AGENT_DIR=%~dp0"
set "REPO_ROOT=%AGENT_DIR%.."
for %%I in ("%REPO_ROOT%") do set "REPO_ROOT=%%~fI"
cd /d "%REPO_ROOT%"

set "VENV_DIR=%REPO_ROOT%\.venv"
set "VENV_PY=%VENV_DIR%\Scripts\python.exe"
:: Use `python -m pip` instead of `pip.exe`: after moving the repo, pip.exe launchers still point at the old path.

if exist "%VENV_PY%" goto :deps

call :find_python
if errorlevel 1 exit /b 1

echo [local_agent] Creating shared venv in .venv ...
!PY_RUN! -m venv "%VENV_DIR%"
if errorlevel 1 (
  echo ERROR: Could not create venv.
  call :print_python_help
  exit /b 1
)

:deps
echo [local_agent] Installing dependencies (root requirements.txt)...
"%VENV_PY%" -m pip install -q -r "%REPO_ROOT%\requirements.txt"
if errorlevel 1 (
  echo ERROR: pip install failed.
  exit /b 1
)

:: CORS: deployed UI at https://dev.funbloomstudio.com can call this agent from your browser. Override or clear: set LOCAL_AGENT_EXTRA_CORS_ORIGINS= before running.
if not defined LOCAL_AGENT_EXTRA_CORS_ORIGINS set "LOCAL_AGENT_EXTRA_CORS_ORIGINS=https://dev.funbloomstudio.com"

call :ensure_msvc_env

set "VENV_ACTIVATE=%VENV_DIR%\Scripts\activate.bat"
if exist "%VENV_ACTIVATE%" (
  call "%VENV_ACTIVATE%"
) else (
  echo [local_agent] WARNING: activate.bat not found at "%VENV_ACTIVATE%".
)

echo [local_agent] http://127.0.0.1:8765  ^(Ctrl+C to stop^)
echo [local_agent] LOCAL_AGENT_EXTRA_CORS_ORIGINS=%LOCAL_AGENT_EXTRA_CORS_ORIGINS%
"%VENV_PY%" -m uvicorn local_agent.main:app --host 127.0.0.1 --port 8765
exit /b %ERRORLEVEL%

:ensure_msvc_env
where cl >nul 2>&1
if not errorlevel 1 (
  echo [local_agent] MSVC compiler found on PATH.
  exit /b 0
)
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" (
  echo [local_agent] MSVC compiler not found ^(cl.exe^). Install Visual Studio C++ Build Tools to compile texture extensions.
  exit /b 0
)
set "VSINSTALL="
for /f "usebackq delims=" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VSINSTALL=%%i"
if not defined VSINSTALL (
  echo [local_agent] Visual Studio C++ tools not found. Install "Desktop development with C++".
  exit /b 0
)
set "VCVARS=%VSINSTALL%\VC\Auxiliary\Build\vcvars64.bat"
if not exist "%VCVARS%" (
  echo [local_agent] vcvars64.bat not found at "%VCVARS%".
  exit /b 0
)
echo [local_agent] Initializing MSVC build environment...
call "%VCVARS%" >nul 2>&1
set "DISTUTILS_USE_SDK=1"
set "MSSdk=1"
where cl >nul 2>&1
if not errorlevel 1 (
  echo [local_agent] MSVC compiler environment loaded.
) else (
  echo [local_agent] Failed to load MSVC compiler environment; texture extension builds may fail.
)
exit /b 0

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
