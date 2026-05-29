"""Solitaire card image batch ops on a project-relative folder."""

from collections import deque
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps

from services.image.image_tool import resolve_project_root_relative_file

_CARD_IMAGE_SUFFIXES: frozenset[str] = frozenset({".png", ".jpg", ".jpeg", ".webp"})


def _list_card_image_paths(folder: Path, only_basenames_lower: frozenset[str] | None = None) -> list[Path]:
    paths: list[Path] = []
    for p in folder.iterdir():
        if not p.is_file():
            continue
        if p.name.lower().endswith(".meta"):
            continue
        if p.suffix.lower() not in _CARD_IMAGE_SUFFIXES:
            continue
        if only_basenames_lower is not None and p.name.lower() not in only_basenames_lower:
            continue
        paths.append(p)
    paths.sort(key=lambda x: x.name.lower())
    return paths


def _corner_connected_background_mask(im_rgba: Image.Image, tolerance: int = 22) -> bytearray:
    """
    BFS from image corners over background pixels (near-white opaque or very transparent).
    Returns bytearray length w*h: 1 = corner-connected background, 0 = foreground / interior.
    """
    w, h = im_rgba.size
    px = im_rgba.load()
    outside = bytearray(w * h)

    def idx(x: int, y: int) -> int:
        return y * w + x

    def is_background(x: int, y: int) -> bool:
        r, g, b, a = px[x, y]
        if a < 35:
            return True
        t = tolerance
        return r >= 255 - t and g >= 255 - t and b >= 255 - t

    q: deque[tuple[int, int]] = deque()
    for cx, cy in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        if 0 <= cx < w and 0 <= cy < h:
            i = idx(cx, cy)
            if not outside[i] and is_background(cx, cy):
                outside[i] = 1
                q.append((cx, cy))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h:
                j = idx(nx, ny)
                if not outside[j] and is_background(nx, ny):
                    outside[j] = 1
                    q.append((nx, ny))
    return outside


def _transparent_corner_connected_background(im_rgba: Image.Image, tolerance: int = 22) -> tuple[Image.Image, str]:
    """
    Sets alpha to 0 on corner-connected near-white border (same reachability as before, no crop).
    Returns (image, outcome): outcome is 'ok' | 'no_foreground' | 'unchanged'.
    """
    w, h = im_rgba.size
    mask = _corner_connected_background_mask(im_rgba, tolerance)
    if mask.count(1) == w * h:
        return im_rgba, "no_foreground"
    px = im_rgba.load()
    changed = False
    for y in range(h):
        base = y * w
        for x in range(w):
            if mask[base + x]:
                r, g, b, a = px[x, y]
                if a != 0:
                    px[x, y] = (r, g, b, 0)
                    changed = True
    return im_rgba, ("ok" if changed else "unchanged")


def solitaire_resize_cards_folder(
    project_key: str,
    folder_relative: str,
    target_width: int = 512,
    only_filenames: list[str] | None = None,
) -> dict[str, Any]:
    """Resize each raster image in the folder so width becomes target_width (height proportional)."""
    rel = (folder_relative or "").strip().replace("\\", "/")
    folder = resolve_project_root_relative_file(project_key, rel)
    if not folder.exists():
        raise ValueError("Destination folder not found.")
    if not folder.is_dir():
        raise ValueError("Destination path is not a directory.")
    if target_width < 64 or target_width > 4096:
        raise ValueError("target_width must be between 64 and 4096.")
    only_lower: frozenset[str] | None = None
    missing_filenames: list[str] = []
    if only_filenames is not None:
        cleaned = [n.strip() for n in only_filenames if n and str(n).strip()]
        if not cleaned:
            raise ValueError("filenames must contain at least one basename when provided.")
        only_lower = frozenset(n.lower() for n in cleaned)
        all_in_folder = _list_card_image_paths(folder, None)
        present_lower = {p.name.lower() for p in all_in_folder}
        for orig in cleaned:
            if orig.lower() not in present_lower:
                missing_filenames.append(orig)
    processed: list[str] = []
    skipped: list[str] = []
    errors: list[dict[str, str]] = []
    for path in _list_card_image_paths(folder, only_lower):
        try:
            with Image.open(path) as raw:
                base_im = ImageOps.exif_transpose(raw).copy()
            w0, h0 = base_im.size
            if w0 <= 0 or h0 <= 0:
                errors.append({"filename": path.name, "error": "Invalid image size."})
                continue
            if w0 == target_width:
                skipped.append(path.name)
                continue
            new_h = max(1, int(round(h0 * (target_width / float(w0)))))
            resized = base_im.resize((target_width, new_h), Image.Resampling.LANCZOS)
            ext = path.suffix.lower()
            if ext == ".png":
                if resized.mode not in ("RGB", "RGBA"):
                    resized = resized.convert("RGBA")
                resized.save(path, format="PNG", optimize=True)
            elif ext in (".jpg", ".jpeg"):
                resized.convert("RGB").save(path, format="JPEG", quality=92)
            elif ext == ".webp":
                resized.save(path, format="WEBP", quality=88, method=4)
            else:
                resized.save(path)
            processed.append(path.name)
        except Exception as exc:
            errors.append({"filename": path.name, "error": str(exc)})
    return {
        "folder": rel,
        "target_width": target_width,
        "processed": processed,
        "skipped": skipped,
        "errors": errors,
        "missing_filenames": missing_filenames,
    }


def solitaire_trim_white_borders_folder(
    project_key: str,
    folder_relative: str,
    only_filenames: list[str] | None = None,
) -> dict[str, Any]:
    """
    Make corner-connected near-white border transparent (flood from corners; interior white untouched).
    Canvas size unchanged. JPEG inputs are written as PNG with the same basename.
    """
    rel = (folder_relative or "").strip().replace("\\", "/")
    folder = resolve_project_root_relative_file(project_key, rel)
    if not folder.exists():
        raise ValueError("Destination folder not found.")
    if not folder.is_dir():
        raise ValueError("Destination path is not a directory.")
    only_lower: frozenset[str] | None = None
    missing_filenames: list[str] = []
    if only_filenames is not None:
        cleaned = [n.strip() for n in only_filenames if n and str(n).strip()]
        if not cleaned:
            raise ValueError("filenames must contain at least one basename when provided.")
        only_lower = frozenset(n.lower() for n in cleaned)
        all_in_folder = _list_card_image_paths(folder, None)
        present_lower = {p.name.lower() for p in all_in_folder}
        for orig in cleaned:
            if orig.lower() not in present_lower:
                missing_filenames.append(orig)
    processed: list[str] = []
    skipped: list[str] = []
    errors: list[dict[str, str]] = []
    for path in _list_card_image_paths(folder, only_lower):
        try:
            with Image.open(path) as raw:
                rgba = ImageOps.exif_transpose(raw).convert("RGBA").copy()
            outcome_img, outcome = _transparent_corner_connected_background(rgba)
            if outcome == "no_foreground":
                errors.append({"filename": path.name, "error": "No foreground (entire image matched border)."})
                continue
            if outcome == "unchanged":
                skipped.append(path.name)
                continue
            ext = path.suffix.lower()
            if ext in (".jpg", ".jpeg"):
                png_path = path.with_suffix(".png")
                outcome_img.save(png_path, format="PNG", optimize=True)
                if png_path.resolve() != path.resolve():
                    try:
                        path.unlink()
                    except OSError:
                        pass
                processed.append(png_path.name)
            elif ext == ".png":
                outcome_img.save(path, format="PNG", optimize=True)
                processed.append(path.name)
            elif ext == ".webp":
                outcome_img.save(path, format="WEBP", quality=88, method=4)
                processed.append(path.name)
            else:
                outcome_img.save(path)
                processed.append(path.name)
        except Exception as exc:
            errors.append({"filename": path.name, "error": str(exc)})
    return {"folder": rel, "processed": processed, "skipped": skipped, "errors": errors, "missing_filenames": missing_filenames}
