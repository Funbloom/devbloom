# Start the Next.js dev server (port 3000).
# Usage from repo root: .\runweb.ps1

$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot

. (Join-Path $repoRoot "scripts\setenvironment.ps1")

if (-not $env:NEXT_PUBLIC_LOCAL_AGENT_DOWNLOAD_URL) {
  $env:NEXT_PUBLIC_LOCAL_AGENT_DOWNLOAD_URL = "https://dev.funbloomstudio.com/downloads/local-agent/latest.zip"
}

Set-Location (Join-Path $repoRoot "web")
npm run dev
