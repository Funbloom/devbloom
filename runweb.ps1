# Start the Next.js dev server (port 3000).
# Usage from repo root: .\runweb.ps1

$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot

. (Join-Path $repoRoot "scripts\setenvironment.ps1")

Set-Location (Join-Path $repoRoot "web")
npm run dev
