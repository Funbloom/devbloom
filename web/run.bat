@echo off
setlocal EnableDelayedExpansion
:: Next.js dev server (port 3000). Run from web/ or double-click this file.

set "WEB_DIR=%~dp0"
cd /d "%WEB_DIR%"

where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm not found. Install Node.js 18+ from https://nodejs.org/
  exit /b 1
)

if not exist "node_modules\" (
  echo [web] Installing npm dependencies...
  call npm install
  if errorlevel 1 (
    echo ERROR: npm install failed.
    exit /b 1
  )
)

echo [web] http://localhost:3000  ^(Ctrl+C to stop^)
call npm run dev
exit /b %ERRORLEVEL%
