"""SAM bbox helper tests (no torch checkpoint required)."""

from pathlib import Path

import numpy as np

from local_agent.ui_breakdown_sam import (
    _ensure_hw_for_png,
    _normalize_mask_hw,
    _refine_mask_morph,
    bbox_coco_xywh_to_normalized,
    resolve_ui_image_under_project,
)


def test_bbox_coco_xywh_to_normalized_basic():
    t = bbox_coco_xywh_to_normalized(10, 20, 100, 50, 200, 300)
    assert t is not None
    x_min, y_min, x_max, y_max = t
    assert abs(x_min - 0.05) < 1e-9
    assert abs(y_min - 20 / 300) < 1e-9
    assert abs(x_max - 0.55) < 1e-9
    assert abs(y_max - 70 / 300) < 1e-9


def test_bbox_clamps_to_unit_square():
    t = bbox_coco_xywh_to_normalized(-10, -5, 500, 400, 200, 300)
    assert t is not None
    x_min, y_min, x_max, y_max = t
    assert x_min == 0.0
    assert y_min == 0.0
    assert x_max == 1.0
    assert y_max == 1.0


def test_normalize_mask_hw_transposes_wxh_to_hxw():
    ih, iw = 4, 6
    wrong = np.zeros((iw, ih), dtype=bool)
    wrong[2, 1] = True
    out = _normalize_mask_hw(wrong, ih, iw)
    assert out is not None
    assert out.shape == (ih, iw)
    assert out[1, 2]


def test_refine_mask_morph_noop_when_zero():
    m = np.ones((4, 5), dtype=bool)
    out = _refine_mask_morph(m, 0, 0)
    assert out.shape == m.shape
    assert bool(out[0, 0]) is True


def test_ensure_hw_for_png_transposes():
    ih, iw = 3, 5
    wrong = np.zeros((iw, ih), dtype=bool)
    wrong[2, 1] = True
    out = _ensure_hw_for_png(wrong, ih, iw)
    assert out is not None
    assert out.shape == (ih, iw)
    assert out[1, 2]


def test_resolve_ui_image_prefers_images_then_ui(tmp_path: Path):
    root = tmp_path / "proj"
    (root / "Images").mkdir(parents=True)
    (root / "Gen" / "Images" / "UI").mkdir(parents=True)
    (root / "Images" / "a.png").write_bytes(b"x")
    (root / "Gen" / "Images" / "UI" / "b.png").write_bytes(b"y")
    assert resolve_ui_image_under_project(root, "a.png") == (root / "Images" / "a.png").resolve()
    assert resolve_ui_image_under_project(root, "b.png") == (root / "Gen" / "Images" / "UI" / "b.png").resolve()
