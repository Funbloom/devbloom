@echo off
setlocal EnableDelayedExpansion
:: Start DevBloom Local Agent (artist release). Used by devbloom-agent://start and double-click.
:: Optional first argument: URL from protocol handler (ignored except for logging).

set "INSTALL_DIR=%LOCALAPPDATA%\DevBloom\LocalAgent"
set "VENV_DIR=%INSTALL_DIR%\.venv"
set "VENV_PY=%VENV_DIR%\Scripts\python.exe"

if not exist "%INSTALL_DIR%\local_agent\main.py" (
  echo DevBloom Local Agent is not installed.
  echo Run install.bat from the downloaded zip first, or use Settings -^> Installation -^> Install / Repair.
  pause
  exit /b 1
)

if not exist "%VENV_PY%" (
  echo Virtual environment missing. Running install...
  call "%INSTALL_DIR%\install.bat"
  if errorlevel 1 exit /b 1
)

cd /d "%INSTALL_DIR%"

if not defined LOCAL_AGENT_EXTRA_CORS_ORIGINS set "LOCAL_AGENT_EXTRA_CORS_ORIGINS=https://dev.funbloomstudio.com"

title DevBloom Local Agent
echo DevBloom Local Agent - http://127.0.0.1:8765
echo Keep this window open while using DevBloom Studio.
echo CORS origins: %LOCAL_AGENT_EXTRA_CORS_ORIGINS%
echo.

"%VENV_PY%" -m uvicorn local_agent.main:app --host 127.0.0.1 --port 8765
exit /b %ERRORLEVEL%
