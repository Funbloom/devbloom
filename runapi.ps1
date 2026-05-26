# Start the FastAPI dev server (api\run.bat → uvicorn on port 8000).
# Usage from repo root: .\runapi.ps1

$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot

. (Join-Path $repoRoot "scripts\setenvironment.ps1")

Set-Location (Join-Path $repoRoot "api")
cmd /c run.bat
exit $LASTEXITCODE
