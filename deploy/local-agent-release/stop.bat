@echo off
:: Stop DevBloom Local Agent (port 8765). Used by devbloom-agent-stop:// from the web UI.

set "FOUND=0"
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":8765" ^| findstr "LISTENING"') do (
  taskkill /F /PID %%a >nul 2>&1
  set "FOUND=1"
)

if "%FOUND%"=="1" (
  echo DevBloom Local Agent stopped.
) else (
  echo No Local Agent process found on port 8765.
)

exit /b 0
