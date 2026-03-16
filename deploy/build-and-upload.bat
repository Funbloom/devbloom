@echo off
setlocal EnableDelayedExpansion
set S3_BUCKET=devbloom
set S3_PREFIX=releases

:: Repo root (one level up from deploy)
set ROOT=%~dp0..
cd /d "%ROOT%"

:: Timestamp for zip name
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "Get-Date -Format 'yyyyMMdd_HHmm'"') do set TS=%%i
set ZIPNAME=gamedev-king-%TS%.zip
set STAGING=%ROOT%\deploy\staging

echo [1/6] Building web (Next.js)...
cd "%ROOT%\web"
call npm ci
call npm run build
if errorlevel 1 ( echo Build failed. & exit /b 1 )
cd "%ROOT%"

echo [2/6] Preparing standalone web output...
set WEB_STANDALONE=%ROOT%\web\.next\standalone
set WEB_OUT=%STAGING%\gamedev-king\web
mkdir "%STAGING%\gamedev-king" 2>nul
mkdir "%WEB_OUT%" 2>nul
xcopy /E /I /Y "%WEB_STANDALONE%\*" "%WEB_OUT%\" >nul
if exist "%ROOT%\web\.next\static" (
  mkdir "%WEB_OUT%\.next\static" 2>nul
  xcopy /E /I /Y "%ROOT%\web\.next\static\*" "%WEB_OUT%\.next\static\" >nul
)
if exist "%ROOT%\web\public" (
  xcopy /E /I /Y "%ROOT%\web\public\*" "%WEB_OUT%\public\" >nul
)

echo [3/6] Copying API (excluding .venv, __pycache__, .env)...
set API_OUT=%STAGING%\gamedev-king\api
mkdir "%API_OUT%" 2>nul
robocopy "%ROOT%\api" "%API_OUT%" /E /XD .venv __pycache__ .git /XF .env /NFL /NDL /NJH /NJS /NC /NS /NP
if errorlevel 8 ( echo Robocopy had errors. & exit /b 1 )

echo [4/6] Creating archive %ZIPNAME%...
cd "%STAGING%"
tar -a -c -f "%ROOT%\deploy\%ZIPNAME%" gamedev-king
cd "%ROOT%"

echo [5/6] Uploading to s3://%S3_BUCKET%/%S3_PREFIX%/...
aws s3 cp "%ROOT%\deploy\%ZIPNAME%" "s3://%S3_BUCKET%/%S3_PREFIX%/%ZIPNAME%" --no-progress
if errorlevel 1 ( echo S3 upload failed. Check AWS CLI and credentials. & exit /b 1 )
aws s3 cp "s3://%S3_BUCKET%/%S3_PREFIX%/%ZIPNAME%" "s3://%S3_BUCKET%/%S3_PREFIX%/latest.zip" --no-progress

echo [6/6] Cleaning staging...
rd /s /q "%STAGING%" 2>nul

echo.
echo Done. Uploaded:
echo   s3://%S3_BUCKET%/%S3_PREFIX%/%ZIPNAME%
echo   s3://%S3_BUCKET%/%S3_PREFIX%/latest.zip
echo.
echo On EC2 run: ./deploy/ec2-deploy.sh   (or use latest: ./deploy/ec2-deploy.sh latest)
endlocal
