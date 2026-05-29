from __future__ import annotations

import asyncio
import importlib.util
import logging
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Request

from local_agent.security import ensure_localhost

logger = logging.getLogger(__name__)
router = APIRouter()

_agent_dir = Path(__file__).resolve().parent


def reload_runtime_env() -> None:
    """Reload local_agent/.env so status and installs pick up changes without restart."""
    load_dotenv(_agent_dir / ".env", override=True)


def _is_differentiable_renderer_installed() -> bool:
    """
    Hunyuan's differentiable_renderer setup often installs module `mesh_processor`
    (see setup.py output), not necessarily `differentiable_renderer`.
    Accept either import target as installed.
    """
    return (
        importlib.util.find_spec("differentiable_renderer") is not None
        or importlib.util.find_spec("mesh_processor") is not None
    )


@router.get("/installation_status")
@router.get("/ui_breakdown/sam_status")
async def installation_status(request: Request) -> dict[str, Any]:
    """Generic local install status: Python, PyTorch, Hunyuan3D-2, SAM deps/checkpoint."""
    ensure_localhost(request)
    reload_runtime_env()
    try:
        checkpoint = (os.getenv("SAM_CHECKPOINT_PATH") or "").strip()
        model_type = (os.getenv("SAM_MODEL_TYPE") or "vit_b").strip().lower()
        has_checkpoint_env = bool(checkpoint)
        checkpoint_exists = bool(checkpoint and os.path.isfile(checkpoint))
        has_torch = importlib.util.find_spec("torch") is not None
        has_segment_anything = importlib.util.find_spec("segment_anything") is not None
        sam_installed = has_checkpoint_env and checkpoint_exists and has_torch and has_segment_anything
        py = sys.version_info
        python_3_10_installed = py.major == 3 and py.minor == 10
        torch_installed = has_torch
        hunyuan3d2_installed = importlib.util.find_spec("hy3dgen") is not None
        custom_rasterizer_installed = importlib.util.find_spec("custom_rasterizer") is not None
        differentiable_renderer_installed = _is_differentiable_renderer_installed()
        hf_home_raw = (os.getenv("HF_HOME") or "").strip()
        hf_home_set = bool(hf_home_raw)
        hf_home_exists = False
        hf_home_writable = False
        if hf_home_set:
            try:
                hf_dir = Path(hf_home_raw).expanduser().resolve()
                hf_home_exists = hf_dir.exists() and hf_dir.is_dir()
                if hf_home_exists:
                    hf_home_writable = os.access(hf_dir, os.W_OK)
            except Exception:
                hf_home_exists = False
                hf_home_writable = False
        cuda_available = False
        cuda_version = ""
        gpu_name = ""
        if has_torch:
            try:
                import torch

                cuda_available = bool(torch.cuda.is_available())
                cuda_version = str(getattr(torch.version, "cuda", "") or "")
                if cuda_available and torch.cuda.device_count() > 0:
                    gpu_name = str(torch.cuda.get_device_name(0))
            except Exception:
                cuda_available = False
                cuda_version = ""
                gpu_name = ""
        return {
            "installed": sam_installed,
            "sam_model_type": model_type,
            "sam_checkpoint_path_set": has_checkpoint_env,
            "sam_checkpoint_exists": checkpoint_exists,
            "torch_installed": has_torch,
            "segment_anything_installed": has_segment_anything,
            "python_version": f"{py.major}.{py.minor}.{py.micro}",
            "python_3_10_installed": python_3_10_installed,
            "pytorch_installed": torch_installed,
            "hunyuan3d2_installed": hunyuan3d2_installed,
            "custom_rasterizer_installed": custom_rasterizer_installed,
            "differentiable_renderer_installed": differentiable_renderer_installed,
            "hf_home_set": hf_home_set,
            "hf_home_exists": hf_home_exists,
            "hf_home_writable": hf_home_writable,
            "cuda_available": cuda_available,
            "cuda_version": cuda_version,
            "gpu_name": gpu_name,
        }
    except Exception as exc:
        logger.exception("Installation status check failed")
        raise HTTPException(status_code=503, detail=f"Installation status failed: {exc}") from exc


def _read_release_version() -> str:
    """VERSION.txt lives in the install root (parent of local_agent/), if present."""
    version_file = _agent_dir.parent / "VERSION.txt"
    if version_file.is_file():
        text = version_file.read_text(encoding="utf-8").strip()
        if text:
            return text.splitlines()[0].strip()
    return "dev"


@router.get("/installation/agent_info")
async def agent_info(request: Request) -> dict[str, Any]:
    """Release metadata for Settings → Installation (version, install directory)."""
    ensure_localhost(request)
    install_dir = str(_agent_dir.parent.resolve())
    return {
        "version": _read_release_version(),
        "install_dir": install_dir,
        "service": "local_agent",
    }


@router.post("/meshgen/install_texture_extensions")
async def meshgen_install_texture_extensions(request: Request) -> dict[str, Any]:
    """Install Hunyuan texture extensions (custom_rasterizer + differentiable_renderer) in current venv."""
    ensure_localhost(request)

    def detect_texgen_dirs() -> tuple[Path, Path]:
        try:
            import hy3dgen  # type: ignore
        except Exception as exc:
            raise RuntimeError(
                "hy3dgen is not importable in this local agent environment. Install Hunyuan3D-2 first."
            ) from exc
        module_path = Path(hy3dgen.__file__).resolve()
        candidates = [module_path.parent, *module_path.parents]
        for base in candidates:
            custom = base / "texgen" / "custom_rasterizer"
            dr = base / "texgen" / "differentiable_renderer"
            if (custom / "setup.py").is_file() and (dr / "setup.py").is_file():
                return custom, dr
        raise RuntimeError(
            "Could not locate Hunyuan texture extension sources from hy3dgen path. "
            "Expected texgen/custom_rasterizer/setup.py and texgen/differentiable_renderer/setup.py."
        )

    def run_install(cwd: Path) -> str:
        env = os.environ.copy()
        # Required when vcvars is already activated; avoids distutils trying to reactivate VC env.
        env["DISTUTILS_USE_SDK"] = "1"
        env["MSSdk"] = "1"
        proc = subprocess.run(
            [sys.executable, "setup.py", "install"],
            cwd=str(cwd),
            check=False,
            capture_output=True,
            text=True,
            env=env,
        )
        out = (proc.stdout or "").strip()
        err = (proc.stderr or "").strip()
        if proc.returncode != 0:
            msg = err or out or f"exit code {proc.returncode}"
            raise RuntimeError(f"Install failed in {cwd}: {msg}")
        merged = "\n".join([x for x in [out, err] if x]).strip()
        return merged

    try:
        custom_dir, dr_dir = await asyncio.to_thread(detect_texgen_dirs)
        custom_before = importlib.util.find_spec("custom_rasterizer") is not None
        dr_before = _is_differentiable_renderer_installed()
        custom_log = "Already installed; skipped."
        dr_log = "Already installed; skipped."
        if not custom_before:
            custom_log = await asyncio.to_thread(run_install, custom_dir)
        if not dr_before:
            dr_log = await asyncio.to_thread(run_install, dr_dir)
        custom_ok = importlib.util.find_spec("custom_rasterizer") is not None
        dr_ok = _is_differentiable_renderer_installed()
        return {
            "ok": custom_ok and dr_ok,
            "custom_rasterizer_installed": custom_ok,
            "differentiable_renderer_installed": dr_ok,
            "logs": {
                "custom_rasterizer": custom_log[-2000:],
                "differentiable_renderer": dr_log[-2000:],
            },
        }
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Texture extension install failed: {exc}") from exc
