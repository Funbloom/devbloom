# Run the same checks as GitHub Actions CI locally (Windows PowerShell).
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

Write-Host "== Web: npm ci, lint, build =="
Set-Location (Join-Path $Root "web")
npm ci
npm run lint
npm run build

Write-Host "== API: pip install, pytest =="
Set-Location (Join-Path $Root "api")
python -m pip install --upgrade pip
python -m pip install -r requirements.txt -r requirements-dev.txt
python -m pytest tests -q

Write-Host "All CI checks passed."
