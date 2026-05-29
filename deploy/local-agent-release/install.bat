@echo off
setlocal EnableDelayedExpansion
:: One-time install: copy to AppData, create .venv, register devbloom-agent:// URL protocol.
:: Can be re-run to repair (Install / Repair from DevBloom Settings).

set "SOURCE_DIR=%~dp0"
for %%I in ("%SOURCE_DIR%") do set "SOURCE_DIR=%%~fI"
set "INSTALL_DIR=%LOCALAPPDATA%\DevBloom\LocalAgent"
set "VENV_DIR=%INSTALL_DIR%\.venv"
set "VENV_PY=%VENV_DIR%\Scripts\python.exe"

echo [DevBloom Local Agent] Installing to %INSTALL_DIR% ...

if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

echo Copying files...
robocopy "%SOURCE_DIR%" "%INSTALL_DIR%" /E /XD .venv __pycache__ tests /XF install.bat /NFL /NDL /NJH /NJS /NC /NS /NP >nul
if errorlevel 8 (
  echo ERROR: Failed to copy files to %INSTALL_DIR%
  exit /b 1
)
:: Always refresh install.bat in AppData for protocol handler
copy /Y "%SOURCE_DIR%install.bat" "%INSTALL_DIR%\install.bat" >nul

cd /d "%INSTALL_DIR%"

call :find_python
if errorlevel 1 exit /b 1

if not exist "%VENV_PY%" (
  echo Creating Python virtual environment...
  !PY_RUN! -m venv "%VENV_DIR%"
  if errorlevel 1 (
    echo ERROR: Could not create venv.
    exit /b 1
  )
)

echo Installing dependencies...
"%VENV_PY%" -m pip install -q --upgrade pip
"%VENV_PY%" -m pip install -q -r "%INSTALL_DIR%\requirements.txt"
if errorlevel 1 (
  echo ERROR: pip install failed.
  exit /b 1
)

if not exist "%INSTALL_DIR%\local_agent\.env" (
  if exist "%INSTALL_DIR%\local_agent\.env.example" (
    copy /Y "%INSTALL_DIR%\local_agent\.env.example" "%INSTALL_DIR%\local_agent\.env" >nul
  )
)

call :register_protocol

echo.
echo Installation complete.
echo   Location: %INSTALL_DIR%
echo   Next: open DevBloom Studio -^> Settings -^> Installation -^> Start Local Agent
echo.
exit /b 0

:register_protocol
set "RUN_BAT=%INSTALL_DIR%\run.bat"
set "INSTALL_BAT=%INSTALL_DIR%\install.bat"
reg add "HKCU\Software\Classes\devbloom-agent" /ve /d "URL:DevBloom Local Agent" /f >nul
reg add "HKCU\Software\Classes\devbloom-agent" /v "URL Protocol" /d "" /f >nul
reg add "HKCU\Software\Classes\devbloom-agent\shell\open\command" /ve /d "\"%RUN_BAT%\" \"%%1\"" /f >nul
reg add "HKCU\Software\Classes\devbloom-agent-install" /ve /d "URL:DevBloom Local Agent Install" /f >nul
reg add "HKCU\Software\Classes\devbloom-agent-install" /v "URL Protocol" /d "" /f >nul
reg add "HKCU\Software\Classes\devbloom-agent-install\shell\open\command" /ve /d "\"%INSTALL_BAT%\"" /f >nul
echo Registered devbloom-agent:// and devbloom-agent-install:// URL handlers.
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
echo.
echo Python 3.10+ is required. Install from https://www.python.org/downloads/
echo Check "Add python.exe to PATH" during setup.
exit /b 1
