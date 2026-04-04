"""
Load Hunyuan3D-2 shape pipeline (smoke test).

https://github.com/Tencent-Hunyuan/Hunyuan3D-2 — pip install -r requirements.txt && pip install -e .
"""

from __future__ import annotations

import os
from pathlib import Path

# Set these BEFORE importing hy3dgen / diffusers / huggingface libs
CACHE_ROOT = r"D:\FunBloom\models\hf_cache"
HUB_CACHE = str(Path(CACHE_ROOT) / "hub")

os.environ["HF_HOME"] = CACHE_ROOT
os.environ["HF_HUB_CACHE"] = HUB_CACHE
os.environ["TRANSFORMERS_CACHE"] = HUB_CACHE

def main() -> None:
    print("HF_HOME =", os.getenv("HF_HOME"))
    print("HF_HUB_CACHE =", os.getenv("HF_HUB_CACHE"))
    print("TRANSFORMERS_CACHE =", os.getenv("TRANSFORMERS_CACHE"))

    from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline

    repo = "tencent/Hunyuan3D-2mini"
    subfolder = "hunyuan3d-dit-v2-mini-turbo"

    pipe = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(
        repo,
        subfolder=subfolder,
        use_safetensors=True,
        cache_dir=HUB_CACHE,
    )
    print("OK:", type(pipe).__name__, repo, subfolder)

if __name__ == "__main__":
   main()

