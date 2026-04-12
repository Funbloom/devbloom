"""SAM bbox helper tests (no torch checkpoint required)."""

from pathlib import Path

from local_agent.ui_breakdown_sam import bbox_coco_xywh_to_normalized, resolve_ui_image_under_project


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


def test_resolve_ui_image_prefers_images_then_ui(tmp_path: Path):
    root = tmp_path / "proj"
    (root / "Images").mkdir(parents=True)
    (root / "Gen" / "Images" / "UI").mkdir(parents=True)
    (root / "Images" / "a.png").write_bytes(b"x")
    (root / "Gen" / "Images" / "UI" / "b.png").write_bytes(b"y")
    assert resolve_ui_image_under_project(root, "a.png") == (root / "Images" / "a.png").resolve()
    assert resolve_ui_image_under_project(root, "b.png") == (root / "Gen" / "Images" / "UI" / "b.png").resolve()
