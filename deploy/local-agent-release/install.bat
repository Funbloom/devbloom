@echo off
setlocal EnableDelayedExpansion
:: Install or update Local Agent into AppData. Wipes previous install first.
:: Run from unzipped download folder, or via devbloom-agent-install:// after unzipping to the update folder.

set "INSTALL_DIR=%LOCALAPPDATA%\DevBloom\LocalAgent"
set "UPDATE_SOURCE=%LOCALAPPDATA%\DevBloom\LocalAgentUpdate\DevBloomLocalAgent"
set "VENV_DIR=%INSTALL_DIR%\.venv"
set "VENV_PY=%VENV_DIR%\Scripts\python.exe"

cd /d "%~dp0"
set "SCRIPT_DIR=%CD%"

if /I "%SCRIPT_DIR%"=="%INSTALL_DIR%" (
  if exist "%UPDATE_SOURCE%\local_agent\main.py" (
    set "SOURCE_DIR=%UPDATE_SOURCE%"
    echo [DevBloom Local Agent] Update source: %SOURCE_DIR%
  ) else (
    echo ERROR: Unzip the downloaded zip to:
    echo   %UPDATE_SOURCE%
    echo Then click Install again, or run install.bat from that folder.
    exit /b 1
  )
) else (
  set "SOURCE_DIR=%SCRIPT_DIR%"
)

echo [DevBloom Local Agent] Installing to %INSTALL_DIR% ...
echo [DevBloom Local Agent] From: %SOURCE_DIR%

if /I "%SOURCE_DIR%"=="%INSTALL_DIR%" (
  echo ERROR: Invalid source folder.
  exit /b 1
)

:: Stop agent before wiping AppData
if exist "%INSTALL_DIR%\stop.bat" call "%INSTALL_DIR%\stop.bat" >nul 2>&1
taskkill /F /IM python.exe /FI "WINDOWTITLE eq DevBloom Local Agent*" >nul 2>&1

if exist "%INSTALL_DIR%" (
  echo Removing previous install...
  rd /s /q "%INSTALL_DIR%" 2>nul
  if exist "%INSTALL_DIR%" (
    echo ERROR: Could not remove %INSTALL_DIR%
    echo Close any DevBloom Local Agent window and run install.bat again.
    exit /b 1
  )
)
mkdir "%INSTALL_DIR%"

echo Copying files...
robocopy "%SOURCE_DIR%" "%INSTALL_DIR%" /E /XD .venv __pycache__ tests /XF install.bat /R:2 /W:2
set "ROBOCOPY_RC=!ERRORLEVEL!"
if !ROBOCOPY_RC! GEQ 8 (
  echo.
  echo ERROR: Copy failed ^(robocopy exit !ROBOCOPY_RC!^).
  exit /b 1
)

copy /Y "%SOURCE_DIR%\install.bat" "%INSTALL_DIR%\install.bat" >nul
copy /Y "%SOURCE_DIR%\stop.bat" "%INSTALL_DIR%\stop.bat" >nul
copy /Y "%SOURCE_DIR%\run.bat" "%INSTALL_DIR%\run.bat" >nul

cd /d "%INSTALL_DIR%"

call :find_python
if errorlevel 1 exit /b 1

echo Creating Python virtual environment...
!PY_RUN! -m venv "%VENV_DIR%"
if errorlevel 1 (
  echo ERROR: Could not create venv.
  exit /b 1
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
for /f "usebackq delims=" %%v in ("%INSTALL_DIR%\VERSION.txt") do echo   Version: %%v
echo   Next: DevBloom Studio -^> Settings -^> Installation -^> Run
echo.
exit /b 0

:register_protocol
set "RUN_BAT=%INSTALL_DIR%\run.bat"
set "INSTALL_BAT=%INSTALL_DIR%\install.bat"
set "STOP_BAT=%INSTALL_DIR%\stop.bat"
reg add "HKCU\Software\Classes\devbloom-agent" /ve /d "URL:DevBloom Local Agent" /f >nul
reg add "HKCU\Software\Classes\devbloom-agent" /v "URL Protocol" /d "" /f >nul
reg add "HKCU\Software\Classes\devbloom-agent\shell\open\command" /ve /d "\"%RUN_BAT%\" \"%%1\"" /f >nul
reg add "HKCU\Software\Classes\devbloom-agent-stop" /ve /d "URL:DevBloom Local Agent Stop" /f >nul
reg add "HKCU\Software\Classes\devbloom-agent-stop" /v "URL Protocol" /d "" /f >nul
reg add "HKCU\Software\Classes\devbloom-agent-stop\shell\open\command" /ve /d "\"%STOP_BAT%\"" /f >nul
if exist "%LOCALAPPDATA%\DevBloom\web-install.bat" (
  reg add "HKCU\Software\Classes\devbloom-agent-install" /ve /d "URL:DevBloom Local Agent Install" /f >nul
  reg add "HKCU\Software\Classes\devbloom-agent-install" /v "URL Protocol" /d "" /f >nul
  reg add "HKCU\Software\Classes\devbloom-agent-install\shell\open\command" /ve /d "\"%LOCALAPPDATA%\DevBloom\web-install.bat\"" /f >nul
)
echo Registered devbloom-agent:// and devbloom-agent-stop:// URL handlers.
exit /b 0

:find_python
set "PY_RUN="
set "PY_TOO_OLD="
where python >nul 2>&1
if not errorlevel 1 (
  python -c "import sys; raise SystemExit(0 if sys.version_info>=(3,10) else 1)" 2>nul
  if not errorlevel 1 (
    set "PY_RUN=python"
    exit /b 0
  )
  set "PY_TOO_OLD=1"
)
where py >nul 2>&1
if not errorlevel 1 (
  py -3 -c "import sys; raise SystemExit(0 if sys.version_info>=(3,10) else 1)" 2>nul
  if not errorlevel 1 (
    set "PY_RUN=py -3"
    exit /b 0
  )
  if not defined PY_TOO_OLD set "PY_TOO_OLD=1"
)
call :python_missing
exit /b 1

:python_missing
echo.
if defined PY_TOO_OLD (
  echo ERROR: Python 3.10 or newer is required, but an older Python was found.
) else (
  echo ERROR: Python 3.10+ is not installed or not on your PATH.
)
echo.
echo   1. Download Python 3.10+ from https://www.python.org/downloads/
echo   2. During setup, check "Add python.exe to PATH"
echo   3. Close this window, then click Install again in DevBloom Settings
echo.
if defined PY_TOO_OLD (
  set "DEVBLOOM_MSGBOX_LINE1=Python 3.10 or newer is required, but an older Python was found on this PC."
) else (
  set "DEVBLOOM_MSGBOX_LINE1=Python 3.10 or newer was not found on this PC."
)
set "DEVBLOOM_MSGBOX_LINE2=Install Python 3.10+ from https://www.python.org/downloads/"
set "DEVBLOOM_MSGBOX_LINE3=During setup, check Add python.exe to PATH."
set "DEVBLOOM_MSGBOX_LINE4=Then click Install again in DevBloom Settings - Installation."
call :message_box_error
if not defined DEVBLOOM_INSTALL_FROM_WEB pause
exit /b 1

:message_box_error
set "DEVBLOOM_MSGBOX_TITLE=DevBloom Local Agent - Install"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Add-Type -AssemblyName System.Windows.Forms;" ^
  "$parts = @($env:DEVBLOOM_MSGBOX_LINE1,$env:DEVBLOOM_MSGBOX_LINE2,$env:DEVBLOOM_MSGBOX_LINE3,$env:DEVBLOOM_MSGBOX_LINE4) | Where-Object { $_ };" ^
  "$body = $parts -join [Environment]::NewLine;" ^
  "[void][System.Windows.Forms.MessageBox]::Show($body, $env:DEVBLOOM_MSGBOX_TITLE, [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Error)"
set "DEVBLOOM_MSGBOX_LINE1="
set "DEVBLOOM_MSGBOX_LINE2="
set "DEVBLOOM_MSGBOX_LINE3="
set "DEVBLOOM_MSGBOX_LINE4="
set "DEVBLOOM_MSGBOX_TITLE="
exit /b 0
