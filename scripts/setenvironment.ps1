# scripts\setenvironment.ps1 - PowerShell mirror of setenvironment.bat.
#
# Activates the shared root .venv and sets the env vars used by api / local_agent /
# util / install-meshgen.ps1 / Mesh Gen (Hunyuan3D-2) / SAM.
#
# Existing values are preserved (we only set vars that aren't already defined),
# so you can override any of them before running this script.
#
# Usage (you MUST dot-source so the venv activation and (.venv) prompt persist):
#   . .\scripts\setenvironment.ps1
#
# Plain `.\scripts\setenvironment.ps1` will set process env vars but the (.venv)
# prompt prefix won't appear because Activate.ps1 needs to run in your shell's
# scope (only achievable via dot-sourcing this file).

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Write-Host "[setenv] Repo root: $repoRoot"

# ---- Root venv ---------------------------------------------------------------
# Activates the shared root venv: .\.venv\Scripts\Activate.ps1
# Dot-sourced so PATH, VIRTUAL_ENV, and the (.venv) prompt all stick in the caller.
$venvDir = Join-Path $repoRoot ".venv"
$venvActivate = Join-Path $venvDir "Scripts\Activate.ps1"
if (Test-Path -LiteralPath $venvActivate) {
    . $venvActivate
    Write-Host "[setenv] Activated venv: $venvDir"
} else {
    Write-Warning "Root .venv not found at $venvDir"
    Write-Warning "         Run api\run.bat or local_agent\run.bat once to bootstrap it."
}

function Set-IfMissing {
    param([string]$Name, [string]$Value)
    if ([string]::IsNullOrEmpty([System.Environment]::GetEnvironmentVariable($Name, "Process"))) {
        [System.Environment]::SetEnvironmentVariable($Name, $Value, "Process")
    }
}

# ---- Hugging Face cache (used by Mesh Gen + util\main.py) -------------------
Set-IfMissing -Name "HF_HOME" -Value "D:\FunBloom\models\hf_cache"
Set-IfMissing -Name "HF_HUB_CACHE" -Value (Join-Path $env:HF_HOME "hub")
Set-IfMissing -Name "TRANSFORMERS_CACHE" -Value $env:HF_HUB_CACHE

# ---- Hunyuan3D-2 clone (used by scripts\install-meshgen.ps1 + docs) ---------
Set-IfMissing -Name "HUNYUAN_PATH" -Value "D:\FunBloom\models\Hunyuan3D-2"

# ---- SAM (UI Breakdown) - only set if a checkpoint actually exists ---------
if (-not $env:SAM_CHECKPOINT_PATH) {
    $samCkpt = Join-Path $repoRoot "local_agent\models\sam_vit_b_01ec64.pth"
    if (Test-Path -LiteralPath $samCkpt) {
        $env:SAM_CHECKPOINT_PATH = $samCkpt
        Set-IfMissing -Name "SAM_MODEL_TYPE" -Value "vit_b"
    }
}

# ---- Local agent CORS (matches local_agent\run.bat default) -----------------
Set-IfMissing -Name "LOCAL_AGENT_EXTRA_CORS_ORIGINS" -Value "https://dev.funbloomstudio.com"

Write-Host ""
Write-Host "[setenv] DevBloom environment ready:"
Write-Host ("  REPO_ROOT                      = {0}" -f $repoRoot)
Write-Host ("  VIRTUAL_ENV                    = {0}" -f $env:VIRTUAL_ENV)
Write-Host ("  HF_HOME                        = {0}" -f $env:HF_HOME)
Write-Host ("  HF_HUB_CACHE                   = {0}" -f $env:HF_HUB_CACHE)
Write-Host ("  TRANSFORMERS_CACHE             = {0}" -f $env:TRANSFORMERS_CACHE)
Write-Host ("  HUNYUAN_PATH                   = {0}" -f $env:HUNYUAN_PATH)
if ($env:SAM_CHECKPOINT_PATH) {
    Write-Host ("  SAM_CHECKPOINT_PATH            = {0}" -f $env:SAM_CHECKPOINT_PATH)
    Write-Host ("  SAM_MODEL_TYPE                 = {0}" -f $env:SAM_MODEL_TYPE)
}
Write-Host ("  LOCAL_AGENT_EXTRA_CORS_ORIGINS = {0}" -f $env:LOCAL_AGENT_EXTRA_CORS_ORIGINS)
Write-Host ""
