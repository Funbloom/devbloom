@echo off
setlocal EnableDelayedExpansion
:: One-click installer from the web UI: download latest.zip, unzip, run install.bat, register URL handlers.
:: Served at /downloads/local-agent/web-install.bat — user clicks Install, runs this file once.

set "DOWNLOAD_URL=https://dev.funbloomstudio.com/downloads/local-agent/latest.zip"
set "UPDATE_ROOT=%LOCALAPPDATA%\DevBloom\LocalAgentUpdate"
set "EXTRACT_DIR=%UPDATE_ROOT%\DevBloomLocalAgent"
set "TEMP_ZIP=%UPDATE_ROOT%\latest.zip"
set "INSTALL_DIR=%LOCALAPPDATA%\DevBloom\LocalAgent"
set "SELF_DEST=%LOCALAPPDATA%\DevBloom\web-install.bat"

echo ========================================
echo   DevBloom Local Agent - Web Installer
echo ========================================
echo.

if exist "%INSTALL_DIR%\stop.bat" call "%INSTALL_DIR%\stop.bat" >nul 2>&1

if not exist "%UPDATE_ROOT%" mkdir "%UPDATE_ROOT%"

echo [1/4] Downloading %DOWNLOAD_URL% ...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ProgressPreference='SilentlyContinue';" ^
  "try { Invoke-WebRequest -Uri '%DOWNLOAD_URL%' -OutFile '%TEMP_ZIP%' -UseBasicParsing } catch { Write-Host $_.Exception.Message; exit 1 }"
if errorlevel 1 (
  echo ERROR: Download failed. Check your internet connection.
  pause
  exit /b 1
)

echo [2/4] Extracting...
if exist "%EXTRACT_DIR%" rd /s /q "%EXTRACT_DIR%" 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { Expand-Archive -Path '%TEMP_ZIP%' -DestinationPath '%UPDATE_ROOT%' -Force } catch { Write-Host $_.Exception.Message; exit 1 }"
if errorlevel 1 (
  echo ERROR: Could not unzip. The download may be corrupt — try Download again.
  pause
  exit /b 1
)

if not exist "%EXTRACT_DIR%\install.bat" (
  echo ERROR: Zip layout unexpected — missing install.bat in DevBloomLocalAgent folder.
  pause
  exit /b 1
)

echo [3/4] Installing to AppData...
call "%EXTRACT_DIR%\install.bat"
if errorlevel 1 (
  echo ERROR: install.bat failed.
  pause
  exit /b 1
)

echo [4/4] Registering one-click handlers for Run / Install / Stop...
copy /Y "%~f0" "%SELF_DEST%" >nul
reg add "HKCU\Software\Classes\devbloom-agent-install" /ve /d "URL:DevBloom Local Agent Install" /f >nul
reg add "HKCU\Software\Classes\devbloom-agent-install" /v "URL Protocol" /d "" /f >nul
reg add "HKCU\Software\Classes\devbloom-agent-install\shell\open\command" /ve /d "\"%SELF_DEST%\"" /f >nul

for /f "usebackq delims=" %%v in ("%EXTRACT_DIR%\VERSION.txt") do set "INSTALLED_VER=%%v"
if defined INSTALLED_VER (
  start "" "https://dev.funbloomstudio.com/admin/installation?agentInstalled=%INSTALLED_VER%"
)

echo.
echo ========================================
echo   Installation complete!
echo   Location: %INSTALL_DIR%
echo ========================================
echo.
echo You can close this window and click Run in DevBloom Settings -^> Installation.
echo Future Install clicks will re-download and update automatically.
echo.
pause
exit /b 0
