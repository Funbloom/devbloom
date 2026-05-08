"""
In-process Hunyuan3D-2 mesh generation (image → mesh), mirroring upstream api_server.py logic.

Install Hunyuan3D-2 into the *same* venv as the local agent (see upstream README), including
PyTorch with CUDA and optional texture extensions (custom_rasterizer / differentiable_renderer).

Env (required for Mesh Gen):
  HF_HOME                 Non-empty path to Hugging Face cache root (e.g. D:\\FunBloom\\models\\hf_cache).
                          Set before starting the local agent; normalized into os.environ for hub/diffusers.

Env (optional):
  HUNYUAN_DEVICE          default cuda
  HUNYUAN_MODEL_PATH      default tencent/Hunyuan3D-2mini
  HUNYUAN_SUBFOLDER       default hunyuan3d-dit-v2-mini-turbo
  HUNYUAN_TEX_MODEL_PATH  default tencent/Hunyuan3D-2
"""

from __future__ import annotations

import base64
import io
import logging
import os
import tempfile
import threading
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

HY3DGEN_ERROR: BaseException | None = None

# Shown when texture pipeline fails due to missing compiled hy3dgen extensions
_TEXTURE_EXTENSIONS_HINT = (
    "Mesh texturing needs Hunyuan's compiled GPU extensions (custom_rasterizer). "
    "In your Hunyuan3D-2 clone, with the SAME venv as the local agent, run:\n"
    "  cd hy3dgen/texgen/custom_rasterizer\n"
    "  python setup.py install\n"
    "  cd ../differentiable_renderer\n"
    "  python setup.py install\n"
    "Requires MSVC Build Tools + CUDA matching PyTorch on Windows. "
    "Upstream: https://github.com/Tencent-Hunyuan/Hunyuan3D-2#install-requirements\n"
    "Or turn OFF 'texture' in Mesh Gen for shape-only mesh (no paint)."
)


def _exception_chain_mentions_custom_rasterizer(exc: BaseException | None) -> bool:
    """Hunyuan often wraps ModuleNotFoundError('custom_rasterizer') in a generic RuntimeError."""
    if exc is None:
        return False
    seen: set[int] = set()
    stack: list[BaseException | None] = [exc]
    while stack:
        cur = stack.pop()
        if cur is None or id(cur) in seen:
            continue
        seen.add(id(cur))
        blob = f"{type(cur).__name__} {cur!s}".lower()
        if "custom_rasterizer" in blob:
            return True
        if isinstance(cur, ModuleNotFoundError) and getattr(cur, "name", None) == "custom_rasterizer":
            return True
        stack.append(cur.__cause__)
        stack.append(cur.__context__)
    return False


def _ensure_hf_home() -> str:
    """
    Require HF_HOME (non-null / non-whitespace), resolve it, write back to os.environ, ensure dir exists.
    Must run before importing hy3dgen / huggingface_hub so the cache root is correct.
    """
    raw = (os.getenv("HF_HOME") or "").strip()
    if not raw:
        logger.error(
            "MeshGen: HF_HOME is unset or empty. Set it to your Hugging Face cache directory "
            "(Hub models use the `hub` folder under that path on Windows), e.g. "
            "HF_HOME=D:\\FunBloom\\models\\hf_cache, then restart the local agent."
        )
        raise RuntimeError(
            "HF_HOME must be set to a non-empty path (Hugging Face cache). "
            "Example: HF_HOME=D:\\FunBloom\\models\\hf_cache"
        )

    root = Path(raw).expanduser().resolve()
    if root.exists() and not root.is_dir():
        logger.error("MeshGen: HF_HOME is not a directory: %s", root)
        raise RuntimeError(f"HF_HOME must be a directory, not a file: {root}")

    resolved = str(root)
    os.environ["HF_HOME"] = resolved
    root.mkdir(parents=True, exist_ok=True)
    logger.info("MeshGen: using Hugging Face cache HF_HOME=%s", resolved)
    return resolved


try:
    _ensure_hf_home()
    import torch
    import trimesh
    from PIL import Image
    from hy3dgen.rembg import BackgroundRemover
    from hy3dgen.shapegen import (
        DegenerateFaceRemover,
        FaceReducer,
        FloaterRemover,
        Hunyuan3DDiTFlowMatchingPipeline,
    )
    from hy3dgen.texgen import Hunyuan3DPaintPipeline
except BaseException as exc:  # noqa: BLE001 — HF_HOME, CUDA/ABI, missing hy3dgen, etc.
    torch = None  # type: ignore[assignment]
    HY3DGEN_ERROR = exc
    logger.exception(
        "MeshGen: Hunyuan3D-2 / torch import failed (503 on /meshgen/generate). "
        "Use the Python from local_agent\\.venv where hy3dgen is installed (see local_agent/README.md)."
    )

_IMPORTS_OK = HY3DGEN_ERROR is None


def _require_hunyuan() -> None:
    if not _IMPORTS_OK:
        msg = (
            "Hunyuan3D-2 (hy3dgen) is not available in this Python environment. "
            "Install the Hunyuan3D-2 repo with pip install -e . and PyTorch/CUDA per upstream docs. "
        )
        if HY3DGEN_ERROR is not None:
            msg += f" Caused by: {HY3DGEN_ERROR!r}"
            if isinstance(HY3DGEN_ERROR, ModuleNotFoundError) and "torch" in str(HY3DGEN_ERROR).lower():
                msg += (
                    " Install PyTorch into the root .venv first (CUDA wheel from "
                    "https://pytorch.org/get-started/locally/), then restart the agent. "
                    "See local_agent/README.md → Mesh Gen."
                )
        raise RuntimeError(msg)


def load_image_from_base64(image_b64: str) -> Any:
    return Image.open(io.BytesIO(base64.b64decode(image_b64)))


class HunyuanMeshWorker:
    """Lazy singleton; loads shape pipeline on first use, texture pipeline on first textured request."""

    _instance: HunyuanMeshWorker | None = None
    _init_lock = threading.Lock()

    def __init__(self) -> None:
        _require_hunyuan()
        self.device = os.getenv("HUNYUAN_DEVICE", "cuda")
        self.model_path = os.getenv("HUNYUAN_MODEL_PATH", "tencent/Hunyuan3D-2mini")
        self.subfolder = os.getenv("HUNYUAN_SUBFOLDER", "hunyuan3d-dit-v2-mini-turbo")
        self.tex_model_path = os.getenv("HUNYUAN_TEX_MODEL_PATH", "tencent/Hunyuan3D-2")

        self.rembg = BackgroundRemover()
        self.pipeline = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(
            self.model_path,
            subfolder=self.subfolder,
            use_safetensors=True,
            device=self.device,
        )
        self.pipeline.enable_flashvdm(mc_algo="mc")
        self.pipeline_tex: Hunyuan3DPaintPipeline | None = None
        self._infer_lock = threading.Lock()

    @classmethod
    def instance(cls) -> HunyuanMeshWorker:
        if cls._instance is not None:
            return cls._instance
        with cls._init_lock:
            if cls._instance is None:
                cls._instance = cls()
            return cls._instance

    def _ensure_tex_pipeline(self) -> Hunyuan3DPaintPipeline:
        if self.pipeline_tex is None:
            try:
                self.pipeline_tex = Hunyuan3DPaintPipeline.from_pretrained(self.tex_model_path)
            except Exception as exc:
                if _exception_chain_mentions_custom_rasterizer(exc):
                    logger.error(
                        "MeshGen: missing custom_rasterizer (build hy3dgen/texgen extensions; see local_agent/README.md)"
                    )
                    raise RuntimeError(_TEXTURE_EXTENSIONS_HINT) from exc
                raise
        return self.pipeline_tex

    def generate(self, params: dict[str, Any]) -> bytes:
        """Same inputs as upstream POST /generate (image base64, seed, octree_resolution, …). Returns file bytes."""
        with self._infer_lock:
            with torch.inference_mode():
                return self._generate_unlocked(params)

    def _generate_unlocked(self, params: dict[str, Any]) -> bytes:
        if "image" not in params:
            raise ValueError("No input image provided")

        image = load_image_from_base64(params["image"])
        image = self.rembg(image)

        seed = int(params.get("seed", 1234))
        generator = torch.Generator(self.device).manual_seed(seed)
        octree_resolution = int(params.get("octree_resolution", 128))
        num_inference_steps = int(params.get("num_inference_steps", 5))
        guidance_scale = float(params.get("guidance_scale", 5.0))

        mesh = self.pipeline(
            image=image,
            generator=generator,
            octree_resolution=octree_resolution,
            num_inference_steps=num_inference_steps,
            guidance_scale=guidance_scale,
            mc_algo="mc",
        )[0]

        # Cap face count (and roughly vertex count) for shape-only and before texturing.
        max_faces = int(params.get("face_count", 40000))
        mesh = FloaterRemover()(mesh)
        mesh = DegenerateFaceRemover()(mesh)
        mesh = FaceReducer()(mesh, max_facenum=max_faces)

        if params.get("texture", False):
            try:
                tex_pipe = self._ensure_tex_pipeline()
                mesh = tex_pipe(mesh, image)
            except Exception as exc:
                if _exception_chain_mentions_custom_rasterizer(exc):
                    raise RuntimeError(_TEXTURE_EXTENSIONS_HINT) from exc
                raise

        ext = str(params.get("type", "glb")).lower().lstrip(".")
        if ext not in {"glb", "obj"}:
            ext = "glb"

        # Match upstream: export → reload → export (normalizes mesh for some paths)
        with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as temp_file:
            tmp1 = temp_file.name
        try:
            mesh.export(tmp1)
            mesh = trimesh.load(tmp1)
        finally:
            Path(tmp1).unlink(missing_ok=True)

        with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as temp_file:
            tmp2 = temp_file.name
        try:
            mesh.export(tmp2)
            data = Path(tmp2).read_bytes()
        finally:
            Path(tmp2).unlink(missing_ok=True)

        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        return data


def run_mesh_generation(params: dict[str, Any]) -> bytes:
    """Run Hunyuan image→mesh in-process; thread-safe."""
    _require_hunyuan()
    return HunyuanMeshWorker.instance().generate(params)
