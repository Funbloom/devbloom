from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from PIL import Image

from services.image_tool import generate_openai_image_to_dir, sanitize_filename

_GIFT_ID_RE = re.compile(r"^[a-zA-Z0-9_-]+$")
POCKET_VOYAGER_IMAGE_GENERATION_SIZE = 1024
POCKET_VOYAGER_IMAGE_OUTPUT_SIZE = 256


def downscale_pocket_voyager_image(path: Path) -> None:
    target = path.resolve()
    ext = target.suffix.lower()
    save_format = "PNG"
    if ext in {".jpg", ".jpeg"}:
        save_format = "JPEG"
    elif ext == ".webp":
        save_format = "WEBP"
    with Image.open(target) as image:
        resized = image.resize(
            (POCKET_VOYAGER_IMAGE_OUTPUT_SIZE, POCKET_VOYAGER_IMAGE_OUTPUT_SIZE),
            Image.Resampling.LANCZOS,
        )
        if save_format == "JPEG":
            resized = resized.convert("RGB")
        resized.save(target, format=save_format)


def _sanitize_filename(name: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_.-]", "_", (name or "").strip())
    cleaned = cleaned.lstrip(".")
    return cleaned[:120] if cleaned else ""


def _build_default_image_name(gift: dict) -> str:
    # Present-but-empty imageFileName means "no image file" (do not fall back to id).
    if "imageFileName" in gift:
        raw = gift.get("imageFileName")
        if isinstance(raw, str) and not raw.strip():
            return ""
        if raw is not None and not (isinstance(raw, str) and not str(raw).strip()):
            base = _sanitize_filename(str(raw).strip())
            if not base:
                return ""
            if not base.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
                base = f"{base}.png"
            return base

    base = (
        gift.get("image_filename")
        or gift.get("image")
        or gift.get("id")
        or gift.get("displayName")
        or gift.get("name")
        or ""
    ).strip()
    base = _sanitize_filename(base)
    if not base:
        return ""
    if not base.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
        base = f"{base}.png"
    return base


def _normalize_gift_catalog_entry(gift: dict, images_dir: Path) -> dict[str, Any]:
    image_name = _build_default_image_name(gift) or None
    image_path = (images_dir / image_name).resolve() if image_name else None
    image_exists = bool(image_path and image_path.exists())

    tags = gift.get("activityTags")
    if not isinstance(tags, list):
        tags = []
    out_tags = [str(t).strip() for t in tags if str(t).strip()]

    pri_raw = gift.get("priority")
    if pri_raw is None:
        priority = 10
    else:
        try:
            priority = int(float(pri_raw))
        except (TypeError, ValueError):
            priority = 10

    w_raw = gift.get("weight")
    if w_raw is None:
        weight = 2.0
    else:
        try:
            weight = float(w_raw)
        except (TypeError, ValueError):
            weight = 2.0

    display = (gift.get("displayName") or gift.get("name") or "").strip()
    return {
        "id": (gift.get("id") or "").strip(),
        "displayName": display,
        "description": (gift.get("description") or "").strip(),
        "activityTags": out_tags,
        "priority": priority,
        "weight": weight,
        "imageFileName": image_name,
        "image_exists": image_exists,
    }


def resolve_gift_images_dir(catalog_path: str) -> Path:
    raw_path = (catalog_path or "").strip()
    if not raw_path:
        raise ValueError("Catalog path is required.")
    path = Path(raw_path)
    if not path.exists():
        raise FileNotFoundError("Catalog file not found.")
    if path.is_dir():
        images_dir = path / "Images"
        return images_dir.resolve()
    if path.suffix.lower() != ".json":
        raise ValueError("Catalog path must be a directory or a .json file.")
    images_dir_candidates = [path.parent / "Images", path.parent / "images"]
    existing_images_dir = next(
        (candidate for candidate in images_dir_candidates if candidate.is_dir()),
        None,
    )
    return (existing_images_dir or images_dir_candidates[0]).resolve()


def load_gift_catalog(catalog_path: str) -> dict[str, Any]:
    raw_path = (catalog_path or "").strip()
    if not raw_path:
        raise ValueError("Catalog path is required.")
    path = Path(raw_path)
    if not path.exists():
        raise FileNotFoundError("Catalog file not found.")
    if path.suffix.lower() != ".json":
        raise ValueError("Catalog file must be a .json file.")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ValueError(f"Failed to parse JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("Catalog JSON must be an object.")
    gifts = data.get("items") or data.get("gifts")
    if not isinstance(gifts, list):
        raise ValueError("Catalog JSON must include an 'items' array.")

    images_dir = resolve_gift_images_dir(str(path))
    gift_items: list[dict] = []
    for gift in gifts:
        if not isinstance(gift, dict):
            continue
        gift_items.append(_normalize_gift_catalog_entry(gift, images_dir))

    return {
        "catalog_path": str(path),
        "images_dir": str(images_dir),
        "gifts": gift_items,
    }


def generate_gift_image(catalog_path: str, gift_id: str) -> dict[str, Any]:
    raw_path = (catalog_path or "").strip()
    if not raw_path:
        raise ValueError("Catalog path is required.")
    path = Path(raw_path)
    if not path.exists():
        raise FileNotFoundError("Catalog file not found.")
    if path.suffix.lower() != ".json":
        raise ValueError("Catalog file must be a .json file.")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ValueError(f"Failed to parse JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("Catalog JSON must be an object.")

    items = data.get("items") or data.get("gifts")
    if not isinstance(items, list):
        raise ValueError("Catalog JSON must include an 'items' array.")

    target = (gift_id or "").strip()
    if not target:
        raise ValueError("gift_id is required.")

    gift = next(
        (g for g in items if isinstance(g, dict) and (g.get("id") or "").strip() == target),
        None,
    )
    if not gift:
        raise FileNotFoundError("Gift not found.")

    images_dir = resolve_gift_images_dir(str(path))
    filename = _build_default_image_name(gift)
    if not filename:
        filename = sanitize_filename(f"{target}.png")

    name = (gift.get("displayName") or gift.get("name") or target).strip()
    desc = (gift.get("description") or "").strip()
    prompt = name if not desc else f"{name}. {desc}"

    result = generate_openai_image_to_dir(
        prompt=prompt,
        output_dir=images_dir,
        filename=filename,
        width=POCKET_VOYAGER_IMAGE_GENERATION_SIZE,
        height=POCKET_VOYAGER_IMAGE_GENERATION_SIZE,
        quality="low",
        model_name="gpt-image-1.5",
    )
    downscale_pocket_voyager_image(Path(result["path"]))
    gift["imageFileName"] = result["filename"]

    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return {
        "catalog_path": str(path),
        "images_dir": str(images_dir),
        "gift_id": target,
        "filename": result["filename"],
        "path": result["path"],
    }


def batch_update_gift_images(
    catalog_path: str,
    gift_ids: list[str],
    style_prompt: str | None,
    extra_prompt: str | None,
    quality: str | None,
    style_mode: str | None,
) -> dict[str, Any]:
    raw_path = (catalog_path or "").strip()
    if not raw_path:
        raise ValueError("Catalog path is required.")
    path = Path(raw_path)
    if not path.exists():
        raise FileNotFoundError("Catalog file not found.")
    if path.suffix.lower() != ".json":
        raise ValueError("Catalog path must be a .json file.")

    if not gift_ids:
        raise ValueError("At least one gift_id is required.")

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ValueError(f"Failed to parse JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("Catalog JSON must be an object.")

    items_key = (
        "items"
        if isinstance(data.get("items"), list)
        else "gifts"
        if isinstance(data.get("gifts"), list)
        else "items"
    )
    items = data.get(items_key)
    if not isinstance(items, list):
        raise ValueError("Gifts JSON must include an array.")

    gift_id_set = {str(g).strip() for g in gift_ids if str(g).strip()}
    if not gift_id_set:
        raise ValueError("At least one valid gift_id is required.")

    style_prompt = (style_prompt or "").strip()
    extra_prompt = (extra_prompt or "").strip()
    quality = (quality or "low").strip().lower()
    if quality not in {"low", "medium", "high"}:
        quality = "low"
    style_mode = (style_mode or "").strip().lower() or None
    if style_mode not in {None, "natural", "vivid"}:
        style_mode = None

    images_dir = resolve_gift_images_dir(str(path))
    images_dir.mkdir(parents=True, exist_ok=True)
    updated: list[dict[str, Any]] = []
    errors: list[str] = []

    for gift in items:
        if not isinstance(gift, dict):
            continue
        gid = str(gift.get("id") or "").strip()
        if not gid or gid not in gift_id_set:
            continue
        name = str(gift.get("displayName") or gift.get("name") or gid).strip()
        desc = str(gift.get("description") or "").strip()
        prompt_parts = [name]
        if desc:
            prompt_parts.append(desc)
        if style_prompt:
            prompt_parts.append(style_prompt)
        if extra_prompt:
            prompt_parts.append(extra_prompt)
        prompt = ". ".join([p for p in prompt_parts if p])

        try:
            result = generate_openai_image_to_dir(
                prompt=prompt,
                output_dir=images_dir,
                filename=f"{gid}.png",
                width=POCKET_VOYAGER_IMAGE_GENERATION_SIZE,
                height=POCKET_VOYAGER_IMAGE_GENERATION_SIZE,
                quality=quality,
                style=style_mode,
                model_name="gpt-image-1.5",
            )
            downscale_pocket_voyager_image(Path(result["path"]))
            gift["imageFileName"] = result["filename"]
            updated.append(gift)
        except Exception as exc:
            message = f"Image generation failed for gift {gid}: {exc}"
            print(message)
            errors.append(message)

    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"updated": updated, "errors": errors}


def append_gift_to_catalog(
    catalog_path: str,
    gift_id: str,
    description: str,
    *,
    display_name: str | None = None,
    activity_tags: list[str] | None = None,
    priority: int | None = None,
    weight: float | None = None,
) -> dict[str, Any]:
    raw_path = (catalog_path or "").strip()
    if not raw_path:
        raise ValueError("Catalog path is required.")
    path = Path(raw_path)
    if not path.exists():
        raise FileNotFoundError("Catalog file not found.")
    if path.suffix.lower() != ".json":
        raise ValueError("Catalog path must be a .json file.")

    normalized_id = (gift_id or "").strip()
    if not normalized_id:
        raise ValueError("Gift id is required.")
    if not _GIFT_ID_RE.match(normalized_id):
        raise ValueError("Gift id can only use letters, numbers, underscore and hyphen.")

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ValueError(f"Failed to parse JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("Catalog JSON must be an object.")

    items_key = (
        "items"
        if isinstance(data.get("items"), list)
        else "gifts"
        if isinstance(data.get("gifts"), list)
        else "items"
    )
    items = data.get(items_key)
    if not isinstance(items, list):
        items = []
        data[items_key] = items

    for existing in items:
        if isinstance(existing, dict) and str(existing.get("id") or "").strip() == normalized_id:
            raise ValueError("Gift id already exists.")

    tags: list[str] = []
    if activity_tags is not None:
        tags = [str(t).strip() for t in activity_tags if str(t).strip()]

    if (display_name or "").strip():
        resolved_display = (display_name or "").strip()
    else:
        resolved_display = normalized_id.replace("_", " ").replace("-", " ").strip().title()

    pri = 10 if priority is None else int(priority)
    w = 2.0 if weight is None else float(weight)
    new_gift: dict[str, Any] = {
        "id": normalized_id,
        "displayName": resolved_display,
        "description": (description or "").strip(),
        "activityTags": tags,
        "priority": pri,
        "weight": w,
        "imageFileName": "",
    }
    items.append(new_gift)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return new_gift


def append_gift_image_file(
    catalog_path: str,
    gift_id: str,
    description: str,
    image_bytes: bytes,
    original_filename: str,
    *,
    display_name: str | None = None,
    activity_tags: list[str] | None = None,
    priority: int | None = None,
    weight: float | None = None,
) -> dict[str, Any]:
    """Create gift and copy image into Gift/Images next to catalog; set imageFileName in JSON."""
    raw_suffix = Path(original_filename or "").suffix.lower()
    if raw_suffix not in (".png", ".jpg", ".jpeg", ".webp", ".gif"):
        raw_suffix = ".png"
    created = append_gift_to_catalog(
        catalog_path,
        gift_id,
        description,
        display_name=display_name,
        activity_tags=activity_tags,
        priority=priority,
        weight=weight,
    )
    normalized_id = (gift_id or "").strip()
    safe_base = _sanitize_filename(normalized_id) or "gift"
    filename = f"{safe_base}{raw_suffix}"

    images_dir = resolve_gift_images_dir(catalog_path)
    images_dir.mkdir(parents=True, exist_ok=True)
    dest = (images_dir / filename).resolve()
    if images_dir not in dest.parents and dest != images_dir:
        raise ValueError("Invalid image destination.")
    dest.write_bytes(image_bytes)

    path = Path((catalog_path or "").strip())
    if not path.exists() or path.suffix.lower() != ".json":
        raise ValueError("Catalog path must be a .json file.")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("Catalog JSON must be an object.")
    items_key = (
        "items"
        if isinstance(data.get("items"), list)
        else "gifts"
        if isinstance(data.get("gifts"), list)
        else "items"
    )
    items = data.get(items_key)
    if not isinstance(items, list):
        raise ValueError("Catalog items missing.")
    for item in items:
        if isinstance(item, dict) and str(item.get("id") or "").strip() == normalized_id:
            item["imageFileName"] = filename
            item.pop("image_filename", None)
            item.pop("cityId", None)
            item.pop("rarity", None)
            break
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    created["imageFileName"] = filename
    return created


def update_gift_in_catalog(
    catalog_path: str,
    gift_id: str,
    *,
    description: str | None = None,
    display_name: str | None = None,
    activity_tags: list[str] | None = None,
    priority: int | None = None,
    weight: float | None = None,
    image_filename: str | None = None,
) -> dict[str, Any]:
    raw_path = (catalog_path or "").strip()
    if not raw_path:
        raise ValueError("Catalog path is required.")
    path = Path(raw_path)
    if not path.exists():
        raise FileNotFoundError("Catalog file not found.")
    if path.suffix.lower() != ".json":
        raise ValueError("Catalog path must be a .json file.")

    normalized_id = (gift_id or "").strip()
    if not normalized_id:
        raise ValueError("Gift id is required.")

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ValueError(f"Failed to parse JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("Catalog JSON must be an object.")

    items_key = (
        "items"
        if isinstance(data.get("items"), list)
        else "gifts"
        if isinstance(data.get("gifts"), list)
        else "items"
    )
    items = data.get(items_key)
    if not isinstance(items, list):
        items = []
        data[items_key] = items

    gift = next(
        (g for g in items if isinstance(g, dict) and str(g.get("id") or "").strip() == normalized_id),
        None,
    )
    if not gift:
        raise FileNotFoundError("Gift not found.")

    if description is not None:
        gift["description"] = (description or "").strip()
    if display_name is not None:
        gift["displayName"] = (display_name or "").strip()
    if activity_tags is not None:
        gift["activityTags"] = [str(t).strip() for t in activity_tags if str(t).strip()]
    if priority is not None:
        gift["priority"] = int(priority)
    if weight is not None:
        gift["weight"] = float(weight)
    if image_filename is not None:
        gift["imageFileName"] = str(image_filename)

    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return gift


def replace_gift_image_file(
    catalog_path: str,
    gift_id: str,
    image_bytes: bytes,
    original_filename: str,
) -> dict[str, Any]:
    """Replace image for an existing gift and update imageFileName in JSON."""
    raw_suffix = Path(original_filename or "").suffix.lower()
    if raw_suffix not in (".png", ".jpg", ".jpeg", ".webp", ".gif"):
        raw_suffix = ".png"
    normalized_id = (gift_id or "").strip()
    if not normalized_id:
        raise ValueError("Gift id is required.")

    safe_base = _sanitize_filename(normalized_id) or "gift"
    filename = f"{safe_base}{raw_suffix}"
    images_dir = resolve_gift_images_dir(catalog_path)
    images_dir.mkdir(parents=True, exist_ok=True)
    dest = (images_dir / filename).resolve()
    if images_dir not in dest.parents and dest != images_dir:
        raise ValueError("Invalid image destination.")
    dest.write_bytes(image_bytes)

    path = Path((catalog_path or "").strip())
    if not path.exists() or path.suffix.lower() != ".json":
        raise ValueError("Catalog path must be a .json file.")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("Catalog JSON must be an object.")
    items_key = (
        "items"
        if isinstance(data.get("items"), list)
        else "gifts"
        if isinstance(data.get("gifts"), list)
        else "items"
    )
    items = data.get(items_key)
    if not isinstance(items, list):
        raise ValueError("Catalog items missing.")
    updated = False
    for item in items:
        if isinstance(item, dict) and str(item.get("id") or "").strip() == normalized_id:
            item["imageFileName"] = filename
            item.pop("image_filename", None)
            updated = True
            break
    if not updated:
        raise FileNotFoundError("Gift not found.")
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"gift_id": normalized_id, "filename": filename, "path": str(dest)}
