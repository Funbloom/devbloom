from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any

from PIL import Image, ImageSequence

_SUPPORTED_IMAGE_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".bmp",
    ".gif",
}

_RESAMPLE = Image.Resampling.LANCZOS


def is_supported_image_file(path: Path) -> bool:
    return path.is_file() and path.suffix.lower() in _SUPPORTED_IMAGE_EXTENSIONS


def _save_resized_gif(image: Image.Image, output_path: Path, width: int, height: int) -> None:
    frames: list[Image.Image] = []
    for frame in ImageSequence.Iterator(image):
        resized = frame.convert("RGBA").resize((width, height), _RESAMPLE)
        frames.append(resized.convert("P", palette=Image.Palette.ADAPTIVE))
    if not frames:
        raise ValueError("GIF contains no frames.")
    save_kwargs: dict[str, Any] = {
        "format": "GIF",
        "save_all": len(frames) > 1,
        "loop": image.info.get("loop", 0),
    }
    duration = image.info.get("duration")
    if duration is not None:
        save_kwargs["duration"] = duration
    if len(frames) > 1:
        save_kwargs["append_images"] = frames[1:]
    frames[0].save(output_path, **save_kwargs)


def resize_image_file_in_place(path: Path, width: int, height: int) -> dict[str, Any]:
    if width < 1 or height < 1:
        raise ValueError("Width and height must be at least 1.")
    target = path.resolve()
    if not is_supported_image_file(target):
        raise ValueError(f"Unsupported image file: {target.name}")
    with Image.open(target) as image:
        old_width = int(image.width)
        old_height = int(image.height)
        with tempfile.NamedTemporaryFile(delete=False, dir=target.parent, suffix=target.suffix) as tmp:
            temp_path = Path(tmp.name)
        try:
            if target.suffix.lower() == ".gif":
                _save_resized_gif(image, temp_path, width, height)
            else:
                resized = image.resize((width, height), _RESAMPLE)
                save_kwargs: dict[str, Any] = {}
                format_name = image.format or target.suffix.lstrip(".").upper()
                if target.suffix.lower() in {".jpg", ".jpeg"}:
                    resized = resized.convert("RGB")
                    save_kwargs["quality"] = 95
                resized.save(temp_path, format=format_name, **save_kwargs)
            temp_path.replace(target)
        except Exception:
            temp_path.unlink(missing_ok=True)
            raise
    return {
        "filename": target.name,
        "path": str(target),
        "old_width": old_width,
        "old_height": old_height,
        "width": width,
        "height": height,
    }


def resize_images_in_directory(directory: Path, width: int, height: int) -> dict[str, Any]:
    root = directory.resolve()
    if not root.exists() or not root.is_dir():
        raise ValueError("Directory not found.")
    if width < 1 or height < 1:
        raise ValueError("Width and height must be at least 1.")
    processed: list[dict[str, Any]] = []
    failed: list[dict[str, str]] = []
    for path in sorted(root.iterdir(), key=lambda item: item.name.lower()):
        if not is_supported_image_file(path):
            continue
        try:
            processed.append(resize_image_file_in_place(path, width, height))
        except Exception as exc:
            failed.append({"filename": path.name, "error": str(exc)})
    return {
        "directory": str(root),
        "requested_width": width,
        "requested_height": height,
        "processed_count": len(processed),
        "failed_count": len(failed),
        "processed": processed,
        "failed": failed,
    }
