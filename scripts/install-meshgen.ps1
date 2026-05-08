# Install everything Mesh Gen / Hunyuan3D-2 needs into the SHARED root .venv:
#   1. util/requirements-meshgen.txt         (diffusers, transformers, accelerate, ...)
#   2. <HunyuanPath>/requirements.txt        (Hunyuan's own deps)
#   3. pip install -e <HunyuanPath>          (editable install of hy3dgen)
#   4. Texture extensions (compiled, need MSVC on Windows):
#      - hy3dgen/texgen/custom_rasterizer        -> python setup.py install
#      - hy3dgen/texgen/differentiable_renderer  -> python setup.py install
#
# Prereqs:
#   - Root .venv exists and is active (run api/run.bat once, then activate).
#   - PyTorch (CUDA wheel) is already installed in the venv.
#   - Visual Studio C++ Build Tools installed (for the texture extensions).
#
# Usage (any of these):
#   .\scripts\install-meshgen.ps1                                          # uses $env:HUNYUAN_PATH
#   .\scripts\install-meshgen.ps1 -HunyuanPath D:\FunBloom\models\Hunyuan3D-2
#   .\scripts\install-meshgen.ps1 -HunyuanPath D:\path\to\Hunyuan3D-2 -SkipTextureExtensions
#   .\scripts\install-meshgen.ps1 -HunyuanPath D:\path\to\Hunyuan3D-2 -StrictHostCompiler
#
# To skip the (long) texture build, pass -SkipTextureExtensions. You only need
# texture extensions if you turn ON the "texture" toggle in Mesh Gen.
#
# By default the texture build sets NVCC_PREPEND_FLAGS=-allow-unsupported-compiler
# so it works on machines where the installed MSVC is newer than what nvcc has
# been validated against (e.g. Visual Studio 2026 + CUDA 12.6, which fails with
# "fatal error C1189: unsupported Microsoft Visual Studio version"). Pass
# -StrictHostCompiler to disable this and let nvcc enforce its check.

[CmdletBinding()]
param(
    [string]$HunyuanPath = $env:HUNYUAN_PATH,
    [switch]$SkipTextureExtensions,
    [switch]$StrictHostCompiler
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Assert-Venv {
    if (-not $env:VIRTUAL_ENV) {
        throw "No virtual environment is active. Activate the root venv first:`n  .\.venv\Scripts\Activate.ps1"
    }
    Write-Host "[meshgen] Using venv: $env:VIRTUAL_ENV"
}

function Assert-HunyuanPath {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) {
        throw "HunyuanPath is required. Pass -HunyuanPath <path> or set `$env:HUNYUAN_PATH."
    }
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Hunyuan path does not exist: $Path"
    }
    if (-not (Test-Path -LiteralPath (Join-Path $Path "setup.py"))) {
        throw "Path does not look like a Hunyuan3D-2 clone (no setup.py): $Path"
    }
    Write-Host "[meshgen] Hunyuan path: $Path"
}

function Initialize-MsvcEnv {
    if (Get-Command cl.exe -ErrorAction SilentlyContinue) {
        Write-Host "[meshgen] MSVC compiler already on PATH."
        return $true
    }
    $vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    if (-not (Test-Path -LiteralPath $vswhere)) {
        Write-Warning "vswhere.exe not found. Install Visual Studio C++ Build Tools to compile texture extensions."
        return $false
    }
    $vsInstall = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
    if (-not $vsInstall) {
        Write-Warning "Visual Studio C++ tools not found. Install 'Desktop development with C++'."
        return $false
    }
    $vcvars = Join-Path $vsInstall "VC\Auxiliary\Build\vcvars64.bat"
    if (-not (Test-Path -LiteralPath $vcvars)) {
        Write-Warning "vcvars64.bat not found at $vcvars."
        return $false
    }
    Write-Host "[meshgen] Initializing MSVC environment from $vcvars ..."
    $envDump = & cmd /c "`"$vcvars`" >nul 2>&1 && set"
    foreach ($line in $envDump) {
        if ($line -match '^([^=]+)=(.*)$') {
            [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
        }
    }
    $env:DISTUTILS_USE_SDK = "1"
    $env:MSSdk = "1"
    if (Get-Command cl.exe -ErrorAction SilentlyContinue) {
        Write-Host "[meshgen] MSVC environment loaded."
        return $true
    }
    Write-Warning "Failed to load MSVC environment; texture extensions will not build."
    return $false
}

function Install-TextureExtension {
    param([string]$ExtDir, [string]$Label)
    if (-not (Test-Path -LiteralPath (Join-Path $ExtDir "setup.py"))) {
        Write-Warning "$Label - setup.py not found at $ExtDir; skipping."
        return
    }
    Write-Step "Building $Label (python setup.py install) in $ExtDir"
    Push-Location $ExtDir
    try {
        & python setup.py install
        if ($LASTEXITCODE -ne 0) {
            throw "$Label build failed (exit $LASTEXITCODE)."
        }
    } finally {
        Pop-Location
    }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

Assert-Venv
Assert-HunyuanPath -Path $HunyuanPath

Write-Step "Installing util\requirements-meshgen.txt"
& python -m pip install -r (Join-Path $repoRoot "util\requirements-meshgen.txt")
if ($LASTEXITCODE -ne 0) { throw "pip install util\requirements-meshgen.txt failed." }

Write-Step "Installing Hunyuan's requirements.txt ($HunyuanPath\requirements.txt)"
& python -m pip install -r (Join-Path $HunyuanPath "requirements.txt")
if ($LASTEXITCODE -ne 0) { throw "pip install Hunyuan requirements.txt failed." }

Write-Step "Editable install: pip install -e $HunyuanPath"
& python -m pip install -e $HunyuanPath
if ($LASTEXITCODE -ne 0) { throw "pip install -e $HunyuanPath failed." }

if ($SkipTextureExtensions) {
    Write-Host ""
    Write-Host "[meshgen] Skipping texture extensions (-SkipTextureExtensions)." -ForegroundColor Yellow
} else {
    $msvcOk = Initialize-MsvcEnv
    if (-not $msvcOk) {
        Write-Warning "Skipping texture extensions because the MSVC environment is not available."
    } else {
        if (-not $StrictHostCompiler) {
            $existing = $env:NVCC_PREPEND_FLAGS
            if ([string]::IsNullOrWhiteSpace($existing)) {
                $env:NVCC_PREPEND_FLAGS = "-allow-unsupported-compiler"
            } elseif ($existing -notmatch "-allow-unsupported-compiler") {
                $env:NVCC_PREPEND_FLAGS = "$existing -allow-unsupported-compiler"
            }
            Write-Host "[meshgen] NVCC_PREPEND_FLAGS=$($env:NVCC_PREPEND_FLAGS)"
            Write-Host "[meshgen] (Allows nvcc to use a newer MSVC than its supported list. Pass -StrictHostCompiler to disable.)"
        }
        Install-TextureExtension `
            -ExtDir (Join-Path $HunyuanPath "hy3dgen\texgen\custom_rasterizer") `
            -Label  "custom_rasterizer"
        Install-TextureExtension `
            -ExtDir (Join-Path $HunyuanPath "hy3dgen\texgen\differentiable_renderer") `
            -Label  "differentiable_renderer"
    }
}

Write-Step "Verifying imports"
& python -c "import torch, hy3dgen; print('torch', torch.__version__, 'cuda', torch.cuda.is_available()); print('hy3dgen OK')"
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Verification import failed. Check the output above."
} else {
    Write-Host ""
    Write-Host "Mesh Gen install complete." -ForegroundColor Green
}
