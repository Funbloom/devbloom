"""
Segment Anything automatic masks for UI Breakdown (runs in local_agent venv; same pattern as meshgen).
Requires: pip install -r requirements-sam.txt and SAM_CHECKPOINT_PATH. See README-SAM.md.
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageOps

# Cached SAM model; new SamAutomaticMaskGenerator per request.
_sam_model: Any = None
_sam_device: Any = None
_sam_cache_key: str | None = None

_FILENAME_SAFE = re.compile(r"^[a-zA-Z0-9._-]+$")


def _cache_key() -> str:
    ckpt = (os.getenv("SAM_CHECKPOINT_PATH") or "").strip()
    mt = (os.getenv("SAM_MODEL_TYPE") or "vit_b").strip().lower()
    return f"{mt}|{ckpt}"


def _load_sam_model():
    global _sam_model, _sam_device, _sam_cache_key
    try:
        import torch
        from segment_anything import sam_model_registry
    except ImportError as exc:
        raise ValueError(
            "SAM is not installed in the local agent venv. Run: pip install -r requirements-sam.txt "
            "See local_agent/README-SAM.md."
        ) from exc

    ckpt = (os.getenv("SAM_CHECKPOINT_PATH") or "").strip()
    if not ckpt:
        raise ValueError(
            "SAM_CHECKPOINT_PATH is not set. Download a Segment Anything .pth and set the env var. "
            "See local_agent/README-SAM.md."
        )
    if not os.path.isfile(ckpt):
        raise ValueError(f"SAM checkpoint file not found: {ckpt}")

    key = _cache_key()
    if _sam_model is not None and _sam_cache_key == key:
        return _sam_model, _sam_device

    model_type = (os.getenv("SAM_MODEL_TYPE") or "vit_b").strip().lower()
    if model_type not in sam_model_registry:
        raise ValueError(f"Invalid SAM_MODEL_TYPE: {model_type}. Use vit_b, vit_l, or vit_h.")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    sam = sam_model_registry[model_type](checkpoint=ckpt)
    sam.to(device=device)
    sam.eval()
    _sam_model = sam
    _sam_device = device
    _sam_cache_key = key
    return _sam_model, _sam_device


def bbox_coco_xywh_to_normalized(
    x: float, y: float, w: float, h: float, iw: int, ih: int
) -> tuple[float, float, float, float] | None:
    """COCO [x,y,w,h] in pixel space to normalized x_min,y_min,x_max,y_max."""
    if iw <= 0 or ih <= 0:
        return None
    x0 = max(0.0, min(1.0, x / float(iw)))
    y0 = max(0.0, min(1.0, y / float(ih)))
    x1 = max(0.0, min(1.0, (x + w) / float(iw)))
    y1 = max(0.0, min(1.0, (y + h) / float(ih)))
    x_min, x_max = min(x0, x1), max(x0, x1)
    y_min, y_max = min(y0, y1), max(y0, y1)
    return (x_min, y_min, x_max, y_max)


def resolve_ui_image_under_project(root: Path, filename: str) -> Path | None:
    """Match API find_image_path: Images/<fn> then Gen/Images/UI/<fn>."""
    fn = (filename or "").strip()
    if not fn or not _FILENAME_SAFE.match(fn):
        return None
    for rel in ("Images", Path("Gen") / "Images" / "UI"):
        p = (root / rel / fn).resolve()
        try:
            p.relative_to(root.resolve())
        except ValueError:
            continue
        if p.is_file():
            return p
    return None


def run_sam_segmentation(
    pil_rgba: Image.Image,
    *,
    max_elements: int,
    min_box_fraction: float,
    sam_params: dict[str, Any],
) -> list[dict[str, Any]]:
    """Run SAM AMG. Returns elements with id, label placeholder, normalized boxes."""
    from segment_anything import SamAutomaticMaskGenerator

    sam, _ = _load_sam_model()
    iw, ih = pil_rgba.size
    rgb = np.array(pil_rgba.convert("RGB"))

    defaults: dict[str, Any] = {
        "points_per_side": 32,
        "points_per_batch": 64,
        "pred_iou_thresh": 0.88,
        "stability_score_thresh": 0.95,
        "crop_n_layers": 0,
        "crop_nms_thresh": 0.7,
        "crop_overlap_ratio": 512 / 1500,
        "crop_n_points_downscale_factor": 1,
        "min_mask_region_area": 0,
        "box_nms_thresh": 0.7,
    }
    merged = {**defaults, **{k: v for k, v in sam_params.items() if v is not None}}
    int_keys = (
        "points_per_side",
        "points_per_batch",
        "crop_n_layers",
        "crop_n_points_downscale_factor",
        "min_mask_region_area",
    )
    for k in int_keys:
        if k in merged and merged[k] is not None:
            merged[k] = int(merged[k])

    mask_generator = SamAutomaticMaskGenerator(model=sam, **merged)
    masks = mask_generator.generate(rgb)

    candidates: list[dict[str, Any]] = []
    for ann in masks:
        if not isinstance(ann, dict):
            continue
        bbox = ann.get("bbox")
        if not bbox or len(bbox) < 4:
            continue
        bx, by, bw, bh = float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3])
        parsed = bbox_coco_xywh_to_normalized(bx, by, bw, bh, iw, ih)
        if parsed is None:
            continue
        x_min, y_min, x_max, y_max = parsed
        area = max(0.0, (x_max - x_min) * (y_max - y_min))
        if area < min_box_fraction:
            continue
        candidates.append(
            {
                "x_min": x_min,
                "y_min": y_min,
                "x_max": x_max,
                "y_max": y_max,
                "_area": area,
            }
        )

    candidates.sort(key=lambda e: -float(e.get("_area", 0.0)))
    cap = max(1, min(max_elements, 80))
    candidates = candidates[:cap]

    elements: list[dict[str, Any]] = []
    for i, c in enumerate(candidates):
        eid = f"seg_{i + 1}"
        elements.append(
            {
                "id": eid,
                "label": "segment",
                "x_min": c["x_min"],
                "y_min": c["y_min"],
                "x_max": c["x_max"],
                "y_max": c["y_max"],
            }
        )
    return elements


def run_sam_segmentation_for_project_file(
    project_root: Path,
    filename: str,
    *,
    max_elements: int,
    min_box_fraction: float,
    sam_params: dict[str, Any],
) -> dict[str, Any]:
    """Load image from approved project (Images/ or Gen/Images/UI/), run SAM, return elements + dimensions."""
    path = resolve_ui_image_under_project(project_root, filename)
    if path is None:
        raise ValueError(
            f"Image not found under project: {filename!r} (try Images/ or Gen/Images/UI/)."
        )
    pil = ImageOps.exif_transpose(Image.open(path)).convert("RGBA")
    iw, ih = pil.size
    elements = run_sam_segmentation(
        pil,
        max_elements=max_elements,
        min_box_fraction=min_box_fraction,
        sam_params=sam_params,
    )
    return {
        "elements": elements,
        "image_width": iw,
        "image_height": ih,
    }
