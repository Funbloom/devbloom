# Start the local agent (local_agent\run.bat → uvicorn on port 8765).
# Usage from repo root: .\runlocalagent.ps1

$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot

. (Join-Path $repoRoot "scripts\setenvironment.ps1")

Set-Location (Join-Path $repoRoot "local_agent")
cmd /c run.bat
exit $LASTEXITCODE
