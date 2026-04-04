@echo off
setlocal EnableDelayedExpansion
:: Run the FastAPI app from the api folder (main:app). Creates api\.venv on first run.
:: Requires Python 3.10+ on PATH as `python`, or the Windows `py` launcher (`py -3`).

set "API_DIR=%~dp0"
cd /d "%API_DIR%"

set "VENV_PY=%API_DIR%.venv\Scripts\python.exe"
set "ACTIVATE=%API_DIR%.venv\Scripts\activate.bat"

if exist "%VENV_PY%" (
  call "%ACTIVATE%"
  goto :deps
)

call :find_python
if errorlevel 1 exit /b 1

echo [api] Creating venv in api\.venv ...
!PY_RUN! -m venv --upgrade-deps "%API_DIR%.venv"
if errorlevel 1 (
  echo ERROR: Could not create venv.
  call :print_python_help
  exit /b 1
)

call "%ACTIVATE%"

:deps
python -m pip --version >nul 2>&1
if errorlevel 1 (
  echo [api] No pip in venv; bootstrapping with ensurepip...
  python -m ensurepip --default-pip
  if errorlevel 1 (
    echo ERROR: ensurepip failed. Remove api\.venv and run this script again, or use full Python from python.org
    exit /b 1
  )
  python -m pip install --upgrade pip
  if errorlevel 1 (
    echo ERROR: pip upgrade failed.
    exit /b 1
  )
)
echo [api] Installing dependencies...
python -m pip install -q -r "%API_DIR%requirements.txt"
if errorlevel 1 (
  echo ERROR: pip install failed.
  exit /b 1
)

echo [api] http://127.0.0.1:8000  ^(Ctrl+C to stop^)
python -m uvicorn main:app --reload --port 8000
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
echo The API server needs Python 3.10+ on PATH.
echo.
echo Install options ^(then open a new terminal and run this script again^):
echo   - winget:  winget install Python.Python.3.12
echo   - Website: https://www.python.org/downloads/  ^(check "Add python.exe to PATH"^)
echo   - Store:   Microsoft Store -^> Python 3.12
echo.
echo If Python is installed but not found, enable "Add python.exe to PATH" or use the py launcher.
exit /b 1
