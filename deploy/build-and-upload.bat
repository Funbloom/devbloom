@echo off
setlocal EnableDelayedExpansion
if not defined S3_BUCKET set S3_BUCKET=devbloom
if not defined S3_PREFIX set S3_PREFIX=releases
:: Production API URL - baked into the Next.js build (override before run: set PRODUCTION_API_URL=https://your-host/api)
if not defined PRODUCTION_API_URL set PRODUCTION_API_URL=https://dev.funbloomstudio.com/api
:: Optional: set AWS_PROFILE to your SSO profile name (from "aws configure sso") so upload uses that profile
set AWS_PROFILE=%AWS_PROFILE%

:: Build --profile argument only if AWS_PROFILE is set
set "AWS_PROFILE_ARG="
if defined AWS_PROFILE set "AWS_PROFILE_ARG=--profile %AWS_PROFILE%"

:: Repo root (one level up from deploy)
set ROOT=%~dp0..
cd /d "%ROOT%"

:: Timestamp for zip name
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "Get-Date -Format 'yyyyMMdd_HHmm'"') do set TS=%%i
set ZIPNAME=gamedev-king-%TS%.zip
set STAGING=%ROOT%\deploy\staging

echo [0/8] AWS credentials...
if defined AWS_PROFILE (
  echo Signing in with SSO profile: %AWS_PROFILE%
  aws sso login %AWS_PROFILE_ARG%
) else (
  echo Using default profile with access keys.
)
aws sts get-caller-identity %AWS_PROFILE_ARG% 2>nul
if errorlevel 1 (
  echo.
  echo ERROR: AWS credentials are invalid or expired.
  echo Run this in a terminal to see the exact error:
  echo   aws sts get-caller-identity
  echo Then run "aws configure" with a valid Access Key ID and Secret from IAM.
  echo Credentials file: %%USERPROFILE%%\.aws\credentials
  exit /b 1
)
echo.

echo [1/8] Building web (Next.js) with API URL: %PRODUCTION_API_URL%
cd "%ROOT%\web"
set NEXT_PUBLIC_API_URL_BASE=%PRODUCTION_API_URL%
set NEXT_PUBLIC_API_URL=%PRODUCTION_API_URL%
:: Hostnames allowed to use the local agent in the browser (comma-separated). Matches LOCAL_AGENT_EXTRA_CORS_ORIGINS on the agent. Clear with set NEXT_PUBLIC_LOCAL_AGENT_PAGE_HOSTS= before build to disable.
if not defined NEXT_PUBLIC_LOCAL_AGENT_PAGE_HOSTS set NEXT_PUBLIC_LOCAL_AGENT_PAGE_HOSTS=dev.funbloomstudio.com
call npm ci
call npm run build
if errorlevel 1 ( echo Build failed. & exit /b 1 )
cd "%ROOT%"

echo [2/8] Preparing standalone web output...
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

echo [3/8] Copying API (excluding .venv, __pycache__, .env)...
set API_OUT=%STAGING%\gamedev-king\api
mkdir "%API_OUT%" 2>nul
robocopy "%ROOT%\api" "%API_OUT%" /E /XD .venv __pycache__ .git /XF .env /NFL /NDL /NJH /NJS /NC /NS /NP
if errorlevel 8 ( echo Robocopy had errors. & exit /b 1 )

echo [4/8] Copying games/ (required by API: manifest + pocket_voyager)...
set GAMES_OUT=%STAGING%\gamedev-king\games
mkdir "%GAMES_OUT%" 2>nul
robocopy "%ROOT%\games" "%GAMES_OUT%" /E /XD __pycache__ .git .venv node_modules /NFL /NDL /NJH /NJS /NC /NS /NP
if errorlevel 8 ( echo Robocopy had errors copying games. & exit /b 1 )

echo [5/8] Creating archive %ZIPNAME%...
cd "%STAGING%"
tar -a -c -f "%ROOT%\deploy\%ZIPNAME%" gamedev-king
cd "%ROOT%"

echo [6/8] Uploading to s3://%S3_BUCKET%/%S3_PREFIX%/...
aws s3 cp "%ROOT%\deploy\%ZIPNAME%" "s3://%S3_BUCKET%/%S3_PREFIX%/%ZIPNAME%" --no-progress %AWS_PROFILE_ARG%
if errorlevel 1 ( echo S3 upload failed. Check AWS CLI and credentials. & exit /b 1 )
aws s3 cp "s3://%S3_BUCKET%/%S3_PREFIX%/%ZIPNAME%" "s3://%S3_BUCKET%/%S3_PREFIX%/latest.zip" --no-progress %AWS_PROFILE_ARG%

echo [7/8] Cleaning staging...
rd /s /q "%STAGING%" 2>nul

echo.
echo Done. Uploaded:
echo   s3://%S3_BUCKET%/%S3_PREFIX%/%ZIPNAME%
echo   s3://%S3_BUCKET%/%S3_PREFIX%/latest.zip
echo.
echo On EC2 run: ./deploy/ec2-deploy.sh   (or use latest: ./deploy/ec2-deploy.sh latest)
endlocal
