@echo off
setlocal EnableDelayedExpansion
:: Run after clicking Install in DevBloom (downloads latest.zip + this file to your Downloads folder).
:: Downloads the current release first; falls back to a zip from Downloads if offline.

set "DOWNLOAD_URL=https://dev.funbloomstudio.com/downloads/local-agent/latest.zip"
set "DOWNLOADS_DIR=%USERPROFILE%\Downloads"
set "UPDATE_ROOT=%LOCALAPPDATA%\DevBloom\LocalAgentUpdate"
set "EXTRACT_DIR=%UPDATE_ROOT%\DevBloomLocalAgent"
set "WORK_ZIP=%UPDATE_ROOT%\latest.zip"
set "INSTALL_DIR=%LOCALAPPDATA%\DevBloom\LocalAgent"
set "SELF_DEST=%LOCALAPPDATA%\DevBloom\web-install.bat"

echo ========================================
echo   DevBloom Local Agent - Web Installer
echo ========================================
echo.

if exist "%INSTALL_DIR%\stop.bat" call "%INSTALL_DIR%\stop.bat" >nul 2>&1

if not exist "%UPDATE_ROOT%" mkdir "%UPDATE_ROOT%"

echo [1/4] Downloading current release from %DOWNLOAD_URL% ...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ProgressPreference='SilentlyContinue';" ^
  "try { Invoke-WebRequest -Uri '%DOWNLOAD_URL%' -OutFile '%WORK_ZIP%' -UseBasicParsing } catch { Write-Host $_.Exception.Message; exit 1 }"
if errorlevel 1 (
  echo Download failed. Looking for a fallback zip in Downloads...
  set "SOURCE_ZIP="
  if exist "%DOWNLOADS_DIR%\latest.zip" set "SOURCE_ZIP=%DOWNLOADS_DIR%\latest.zip"
  if not defined SOURCE_ZIP (
    for /f "delims=" %%f in ('dir /b /o-d "%DOWNLOADS_DIR%\local-agent*.zip" 2^>nul') do (
      if not defined SOURCE_ZIP set "SOURCE_ZIP=%DOWNLOADS_DIR%\%%f"
    )
  )
  if not defined SOURCE_ZIP (
    echo ERROR: Download failed and no fallback zip was found in Downloads.
    echo Click Install in DevBloom again to save latest.zip to Downloads.
    pause
    exit /b 1
  )
  echo Using fallback zip from Downloads: !SOURCE_ZIP!
  copy /Y "!SOURCE_ZIP!" "%WORK_ZIP%" >nul
  if errorlevel 1 (
    echo ERROR: Could not copy fallback zip from Downloads.
    pause
    exit /b 1
  )
)

echo [2/4] Extracting...
if exist "%EXTRACT_DIR%" rd /s /q "%EXTRACT_DIR%" 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { Expand-Archive -Path '%WORK_ZIP%' -DestinationPath '%UPDATE_ROOT%' -Force } catch { Write-Host $_.Exception.Message; exit 1 }"
if errorlevel 1 (
  echo ERROR: Could not unzip. Delete the zip in Downloads and click Install again.
  pause
  exit /b 1
)

if not exist "%EXTRACT_DIR%\install.bat" (
  echo ERROR: Zip layout unexpected — missing DevBloomLocalAgent\install.bat
  pause
  exit /b 1
)

echo [3/4] Installing to AppData...
set "DEVBLOOM_INSTALL_FROM_WEB=1"
call "%EXTRACT_DIR%\install.bat"
set "DEVBLOOM_INSTALL_FROM_WEB="
if errorlevel 1 (
  echo.
  echo ERROR: Install failed. If you saw a popup about Python, install Python 3.10+ first.
  echo Otherwise read the messages above, then try Install again in DevBloom Settings.
  pause
  exit /b 1
)

echo [4/4] Registering one-click handlers...
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
echo Click Run in DevBloom Settings -^> Installation.
echo.
pause
exit /b 0
