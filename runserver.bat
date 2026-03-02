@echo off
start "Web Server" cmd /k "cd /d %~dp0web && npm run dev"
cd /d "%~dp0api"
call ".venv\Scripts\activate.bat"
.venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000
cd ..
pause
