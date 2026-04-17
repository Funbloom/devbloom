"""
Segment Anything automatic masks for UI Breakdown (runs in local_agent venv; same pattern as meshgen).
Requires: pip install -r requirements-sam.txt and SAM_CHECKPOINT_PATH. See README-SAM.md.

Matches Meta's SamAutomaticMaskGenerator defaults (see automatic_mask_generator.py in
https://github.com/facebookresearch/segment-anything): use output_mode='binary_mask' so
segmentation is always an H×W numpy bool array, then encode as grayscale PNG for the web overlay.
"""

from __future__ import annotations

import base64
import io
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

# Constructor kwargs for SamAutomaticMaskGenerator only (no extras — unknown keys raise TypeError).
_SAM_AMG_KEYS = frozenset(
    {
        "points_per_side",
        "points_per_batch",
        "pred_iou_thresh",
        "stability_score_thresh",
        "stability_score_offset",
        "box_nms_thresh",
        "crop_n_layers",
        "crop_nms_thresh",
        "crop_overlap_ratio",
        "crop_n_points_downscale_factor",
        "min_mask_region_area",
        "point_grids",
        "output_mode",
    }
)


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


def _normalize_mask_hw(seg: Any, ih: int, iw: int) -> np.ndarray | None:
    """
    Turn SAM's segmentation into a bool array shape (ih, iw) — numpy rows = y, cols = x.

    PIL Image.fromarray(L) uses array shape (height, width) = (ih, iw). If we save (iw, ih),
    the PNG width/height are swapped vs the source image and the browser stretches masks wrong
    (horizontal UI bars look vertical).

    SamAutomaticMaskGenerator with output_mode='binary_mask' returns H×W numpy bool.
    """
    if seg is None:
        return None

    if isinstance(seg, dict) and "counts" in seg and "size" in seg:
        try:
            from pycocotools import mask as mask_utils

            decoded = mask_utils.decode(seg)
            if not isinstance(decoded, np.ndarray) or decoded.size == 0:
                return None
            arr = (decoded > 0).astype(bool)
            size = seg.get("size")
            if isinstance(size, (list, tuple)) and len(size) >= 2:
                h0, w0 = int(size[0]), int(size[1])
                # COCO size is [height, width] = [ih, iw]. Decode is usually (h0, w0); if we got (w0, h0), transpose.
                if (h0, w0) == (ih, iw) and arr.shape == (w0, h0):
                    arr = arr.T
        except Exception:
            return None
    else:
        try:
            import torch

            if isinstance(seg, torch.Tensor):
                seg = seg.detach().cpu().numpy()
        except Exception:
            pass
        try:
            arr = np.asarray(seg)
        except (TypeError, ValueError):
            return None
        if arr.dtype != bool:
            arr = arr > 0
        if arr.ndim == 3:
            if arr.shape[0] == 1:
                arr = arr[0]
            elif arr.shape[-1] == 1:
                arr = arr[:, :, 0]
            else:
                return None
        if arr.ndim != 2:
            return None
        arr = arr.astype(bool)

    if arr.shape == (ih, iw):
        return arr
    if arr.shape == (iw, ih):
        return arr.T
    return None


def _ensure_hw_for_png(seg_arr: np.ndarray, ih: int, iw: int) -> np.ndarray | None:
    """Last-chance fix before PIL: must be (ih, iw) = (height, width) rows×cols."""
    if seg_arr.ndim != 2:
        return None
    if seg_arr.shape == (ih, iw):
        return np.ascontiguousarray(seg_arr)
    if seg_arr.shape == (iw, ih):
        return np.ascontiguousarray(seg_arr.T)
    return None


def _refine_mask_morph(mask_hw: np.ndarray, open_iters: int, close_iters: int) -> np.ndarray:
    """
    Optional cleanup on the bool mask before PNG: morphological open removes salt-and-pepper noise;
    close fills tiny holes. Uses a 3×3 ellipse kernel (requires opencv-python-headless in SAM venv).
    Iterations are capped (0–3 each) for stability.
    """
    oi = max(0, min(3, int(open_iters)))
    ci = max(0, min(3, int(close_iters)))
    if oi == 0 and ci == 0:
        return mask_hw
    try:
        import cv2
    except ImportError:
        return mask_hw
    m = (mask_hw.astype(np.uint8) * 255)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    if oi > 0:
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, kernel, iterations=oi)
    if ci > 0:
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, kernel, iterations=ci)
    return m > 127


def _build_amg_kwargs(sam_params: dict[str, Any]) -> dict[str, Any]:
    """Merge user overrides with SAM repo defaults; always force binary_mask for reliable decoding."""
    defaults: dict[str, Any] = {
        "points_per_side": 32,
        "points_per_batch": 64,
        "pred_iou_thresh": 0.88,
        "stability_score_thresh": 0.95,
        "stability_score_offset": 1.0,
        "crop_n_layers": 0,
        "crop_nms_thresh": 0.7,
        "crop_overlap_ratio": 512 / 1500,
        "crop_n_points_downscale_factor": 1,
        "min_mask_region_area": 0,
        "box_nms_thresh": 0.7,
    }
    merged: dict[str, Any] = {**defaults}
    for k, v in sam_params.items():
        if k in _SAM_AMG_KEYS and v is not None:
            merged[k] = v
    merged["output_mode"] = "binary_mask"
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
    # SamAutomaticMaskGenerator requires points_per_side >= 4; bad floats (e.g. 0.35) become 0.
    if "points_per_side" in merged and merged["points_per_side"] is not None:
        merged["points_per_side"] = max(4, min(128, int(merged["points_per_side"])))
    if "points_per_batch" in merged and merged["points_per_batch"] is not None:
        merged["points_per_batch"] = max(1, min(256, int(merged["points_per_batch"])))
    return {k: merged[k] for k in _SAM_AMG_KEYS if k in merged}


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
    """Run SAM AMG. Returns elements with id, label placeholder, normalized boxes, mask PNG (base64)."""
    from segment_anything import SamAutomaticMaskGenerator

    sam, _ = _load_sam_model()
    iw, ih = pil_rgba.size
    rgb = np.array(pil_rgba.convert("RGB"))

    sp = dict(sam_params or {})
    mask_morph_open = max(0, min(3, int(sp.pop("mask_morph_open", 0) or 0)))
    mask_morph_close = max(0, min(3, int(sp.pop("mask_morph_close", 0) or 0)))
    amg_kwargs = _build_amg_kwargs(sp)
    mask_generator = SamAutomaticMaskGenerator(model=sam, **amg_kwargs)
    masks = mask_generator.generate(rgb)

    candidates: list[dict[str, Any]] = []
    image_px = float(iw * ih) if iw > 0 and ih > 0 else 1.0

    for ann in masks:
        if not isinstance(ann, dict):
            continue
        bbox = ann.get("bbox")
        if not bbox or len(bbox) < 4:
            continue
        area_px = int(ann.get("area") or 0)
        if area_px <= 0:
            continue
        mask_area_frac = area_px / image_px
        if mask_area_frac < min_box_fraction:
            continue

        bx, by, bw, bh = float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3])
        parsed = bbox_coco_xywh_to_normalized(bx, by, bw, bh, iw, ih)
        if parsed is None:
            continue
        x_min, y_min, x_max, y_max = parsed

        seg = ann.get("segmentation")
        seg_arr = _normalize_mask_hw(seg, ih, iw)
        if seg_arr is None or not np.any(seg_arr):
            continue

        candidates.append(
            {
                "x_min": x_min,
                "y_min": y_min,
                "x_max": x_max,
                "y_max": y_max,
                "_mask_area_frac": float(mask_area_frac),
                "_area_px": area_px,
                "_segmentation": seg_arr,
            }
        )

    # Largest masks first (underneath when compositing), same as SAM notebook show_anns ordering.
    candidates.sort(key=lambda e: -float(e.get("_area_px", 0.0)))
    cap = max(1, min(max_elements, 256))
    candidates = candidates[:cap]

    elements: list[dict[str, Any]] = []
    seg_idx = 0
    for c in candidates:
        row: dict[str, Any] = {
            "label": "segment",
            "x_min": c["x_min"],
            "y_min": c["y_min"],
            "x_max": c["x_max"],
            "y_max": c["y_max"],
            "mask_area_fraction": round(float(c["_mask_area_frac"]), 8),
        }
        seg_arr = c.get("_segmentation")
        if isinstance(seg_arr, np.ndarray) and seg_arr.size > 0:
            try:
                hw = _ensure_hw_for_png(seg_arr, ih, iw)
                if hw is None:
                    pass
                else:
                    hw = _refine_mask_morph(hw, mask_morph_open, mask_morph_close)
                    u8 = (hw.astype(np.uint8)) * 255
                    buf = io.BytesIO()
                    Image.fromarray(u8, mode="L").save(buf, format="PNG", optimize=True)
                    row["mask_png_base64"] = base64.standard_b64encode(buf.getvalue()).decode("ascii")
            except Exception:
                pass
        if "mask_png_base64" not in row:
            continue
        seg_idx += 1
        row["id"] = f"seg_{seg_idx}"
        elements.append(row)
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
