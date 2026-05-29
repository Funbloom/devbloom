@echo off
setlocal EnableDelayedExpansion
:: Build artist Local Agent zip and upload to private S3 (EC2 serves /downloads/ via nginx).
:: Usage: deploy\build-local-agent-release.bat
::   SkipUpload=1   — build zip only, no S3 upload
::   S3_BUCKET      — default devbloom
::   S3_PREFIX      — default releases/local-agent

if not defined S3_BUCKET set S3_BUCKET=devbloom
if not defined S3_PREFIX set S3_PREFIX=releases/local-agent
if not defined PRODUCTION_SITE_URL set PRODUCTION_SITE_URL=https://dev.funbloomstudio.com
set AWS_PROFILE=%AWS_PROFILE%

set "AWS_PROFILE_ARG="
if defined AWS_PROFILE set "AWS_PROFILE_ARG=--profile %AWS_PROFILE%"

set ROOT=%~dp0..
cd /d "%ROOT%"

for /f "tokens=*" %%i in ('powershell -NoProfile -Command "Get-Date -Format 'yyyyMMdd_HHmm'"') do set TS=%%i
set ZIPNAME=local-agent-%TS%.zip
set STAGING=%ROOT%\deploy\staging-local-agent
set PKG=DevBloomLocalAgent

echo [1/6] Staging %PKG%...
if exist "%STAGING%" rd /s /q "%STAGING%"
set PKG_ROOT=%STAGING%\%PKG%
mkdir "%PKG_ROOT%" 2>nul

copy /Y "%ROOT%\deploy\local-agent-release\VERSION.txt" "%PKG_ROOT%\VERSION.txt" >nul
copy /Y "%ROOT%\deploy\local-agent-release\README.txt" "%PKG_ROOT%\README.txt" >nul
copy /Y "%ROOT%\deploy\local-agent-release\requirements.txt" "%PKG_ROOT%\requirements.txt" >nul
copy /Y "%ROOT%\deploy\local-agent-release\install.bat" "%PKG_ROOT%\install.bat" >nul
copy /Y "%ROOT%\deploy\local-agent-release\run.bat" "%PKG_ROOT%\run.bat" >nul

echo [2/6] Copying local_agent/...
set AGENT_OUT=%PKG_ROOT%\local_agent
mkdir "%AGENT_OUT%" 2>nul
robocopy "%ROOT%\local_agent" "%AGENT_OUT%" /E /XD tests __pycache__ .git .local_agent /XF .env run.bat run.sh README.md README-SAM.md requirements-sam.txt /NFL /NDL /NJH /NJS /NC /NS /NP
if errorlevel 8 (
  echo ERROR: robocopy local_agent failed.
  exit /b 1
)

echo [3/6] Creating archive %ZIPNAME%...
cd "%STAGING%"
tar -a -c -f "%ROOT%\deploy\%ZIPNAME%" %PKG%
cd "%ROOT%"

if /I "%SkipUpload%"=="1" (
  echo SkipUpload=1 — zip saved at deploy\%ZIPNAME%
  rd /s /q "%STAGING%" 2>nul
  goto :done
)

echo [4/6] AWS credentials...
aws sts get-caller-identity %AWS_PROFILE_ARG% 2>nul
if errorlevel 1 (
  echo ERROR: AWS credentials invalid. Set AWS_PROFILE or configure aws cli.
  exit /b 1
)

echo [5/6] Uploading to s3://%S3_BUCKET%/%S3_PREFIX%/...
aws s3 cp "%ROOT%\deploy\%ZIPNAME%" "s3://%S3_BUCKET%/%S3_PREFIX%/%ZIPNAME%" --no-progress %AWS_PROFILE_ARG%
if errorlevel 1 (
  echo S3 upload failed.
  exit /b 1
)
aws s3 cp "s3://%S3_BUCKET%/%S3_PREFIX%/%ZIPNAME%" "s3://%S3_BUCKET%/%S3_PREFIX%/latest.zip" --no-progress %AWS_PROFILE_ARG%

echo [6/6] Cleaning staging...
rd /s /q "%STAGING%" 2>nul

:done
echo.
echo Done.
echo   Local zip: deploy\%ZIPNAME%
if /I not "%SkipUpload%"=="1" (
  echo   S3: s3://%S3_BUCKET%/%S3_PREFIX%/%ZIPNAME%
  echo   S3: s3://%S3_BUCKET%/%S3_PREFIX%/latest.zip
  echo.
  echo Artists download via EC2/nginx ^(private S3, no public bucket policy^):
  echo   %PRODUCTION_SITE_URL%/downloads/local-agent/latest.zip
  echo.
  echo After upload, on EC2 sync to disk:
  echo   aws s3 cp s3://%S3_BUCKET%/%S3_PREFIX%/latest.zip APP_ROOT/downloads/local-agent/latest.zip
  echo   ^(or run ./deploy/ec2-deploy.sh which syncs this automatically^)
  echo.
  echo Set in web build:
  echo   NEXT_PUBLIC_LOCAL_AGENT_DOWNLOAD_URL=%PRODUCTION_SITE_URL%/downloads/local-agent/latest.zip
)
endlocal
