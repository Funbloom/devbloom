from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Optional

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
GAMES_DIR = PROJECT_ROOT / "games"
MANIFEST_PATH = GAMES_DIR / "manifest.json"

_KEY_RE = re.compile(r"^[a-z0-9_-]+$")


def _safe_key(value: str, label: str) -> str:
    cleaned = (value or "").strip().lower()
    if not cleaned or not _KEY_RE.match(cleaned):
        raise ValueError(f"Invalid {label} key.")
    return cleaned


def _load_manifest() -> dict:
    if not MANIFEST_PATH.exists():
        return {"games": []}
    try:
        data = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return {"games": []}
        if not isinstance(data.get("games"), list):
            data["games"] = []
        return data
    except Exception:
        return {"games": []}


def list_games() -> list[dict]:
    manifest = _load_manifest()
    games = manifest.get("games") or []
    out: list[dict] = []
    for g in games:
        if not isinstance(g, dict):
            continue
        key = (g.get("key") or "").strip()
        name = (g.get("name") or "").strip()
        if key and name:
            out.append({"key": key, "name": name})
    return out


def get_game(game_key: str) -> Optional[dict]:
    manifest = _load_manifest()
    target = _safe_key(game_key, "game")
    for g in manifest.get("games") or []:
        if isinstance(g, dict) and (g.get("key") or "").strip() == target:
            return g
    return None


def list_pipelines(game_key: str) -> list[dict]:
    game = get_game(game_key)
    if not game:
        return []
    pipelines = game.get("pipelines") or []
    out: list[dict] = []
    for p in pipelines:
        if not isinstance(p, dict):
            continue
        key = (p.get("key") or "").strip()
        name = (p.get("name") or "").strip()
        if key and name:
            out.append(
                {
                    "key": key,
                    "name": name,
                    "description": (p.get("description") or "").strip(),
                }
            )
    return out


def list_pipeline_inputs(game_key: str, pipeline_key: str) -> list[str]:
    game_key = _safe_key(game_key, "game")
    pipeline_key = _safe_key(pipeline_key, "pipeline")
    inputs_dir = GAMES_DIR / game_key / "inputs"
    if not inputs_dir.is_dir():
        return []
    files = []
    for file in inputs_dir.glob("*.json"):
        if file.is_file():
            files.append(file.name)
    return sorted(files)


def load_pipeline_input(game_key: str, pipeline_key: str, filename: str) -> dict[str, Any]:
    game_key = _safe_key(game_key, "game")
    pipeline_key = _safe_key(pipeline_key, "pipeline")
    if not filename or "/" in filename or "\\" in filename or ".." in filename:
        raise ValueError("Invalid input filename.")
    inputs_dir = GAMES_DIR / game_key / "inputs"
    path = (inputs_dir / filename).resolve()
    if inputs_dir not in path.parents and path != inputs_dir:
        raise ValueError("Invalid input path.")
    if not path.exists():
        raise FileNotFoundError("Input file not found.")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ValueError(f"Failed to parse JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("Input JSON must be an object.")
    return data


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

    place_ids = gift.get("placeIds")
    if not isinstance(place_ids, list):
        place_ids = []
    out_place = [str(p).strip() for p in place_ids if str(p).strip()]
    legacy_city = str(gift.get("cityId") or "").strip()
    if not out_place and legacy_city:
        out_place = [legacy_city]

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
    pres = str(gift.get("presentationId") or "").strip()

    return {
        "id": (gift.get("id") or "").strip(),
        "displayName": display,
        "description": (gift.get("description") or "").strip(),
        "placeIds": out_place,
        "activityTags": out_tags,
        "priority": priority,
        "weight": weight,
        "imageFileName": image_name,
        "presentationId": pres,
        "image_exists": image_exists,
    }


def resolve_gift_images_dir(catalog_path: str) -> Path:
    raw_path = (catalog_path or "").strip()
    if not raw_path:
        raise ValueError("Catalog path is required.")
    path = Path(raw_path)
    if not path.exists():
        raise FileNotFoundError("Catalog path not found.")

    # If a directory is provided, treat it as the Gifts base directory and resolve Images under it.
    if path.is_dir():
        images_dir_candidates = [path / "Images", path / "images"]
        existing_images_dir = next((candidate for candidate in images_dir_candidates if candidate.is_dir()), None)
        return (existing_images_dir or images_dir_candidates[0]).resolve()

    # If a catalog JSON is provided, resolve Images next to the file.
    if path.suffix.lower() != ".json":
        raise ValueError("Catalog path must be a directory or a .json file.")
    images_dir_candidates = [path.parent / "Images", path.parent / "images"]
    existing_images_dir = next((candidate for candidate in images_dir_candidates if candidate.is_dir()), None)
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


def load_cities_catalog(catalog_path: str) -> dict[str, Any]:
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
        raise ValueError("Cities JSON must be an object.")
    cities = data.get("cities")
    if not isinstance(cities, list):
        raise ValueError("Cities JSON must include a 'cities' array.")

    normalized: list[dict[str, Any]] = []
    for city in cities:
        if not isinstance(city, dict):
            continue
        updates = city.get("locationUpdates")
        if not isinstance(updates, list):
            updates = []
        normalized_updates: list[dict[str, str]] = []
        for update in updates:
            if not isinstance(update, dict):
                continue
            normalized_updates.append(
                {
                    "text": str(update.get("text") or "").strip(),
                    "image": str(update.get("image") or "").strip(),
                }
            )
        gift_ids = city.get("giftIds")
        if not isinstance(gift_ids, list):
            gift_ids = []
        normalized.append(
            {
                "name_id": str(city.get("nameId") or "").strip(),
                "display_name": str(city.get("displayName") or "").strip(),
                "gift_ids": [str(g).strip() for g in gift_ids if str(g).strip()],
                "location_updates": normalized_updates,
            }
        )

    return {
        "catalog_path": str(path),
        "home_city_id": str(data.get("homeCityId") or "").strip(),
        "cities": normalized,
    }


def _resolve_place_ids_for_append(place_ids: list[str] | None, city_id: str) -> list[str]:
    if place_ids is not None:
        resolved = [str(p).strip() for p in place_ids if str(p).strip()]
        if resolved:
            return resolved
    c = (city_id or "").strip()
    if c:
        return [c]
    raise ValueError("At least one place id is required. Enter place IDs or select a city.")


def append_gift_to_catalog(
    catalog_path: str,
    gift_id: str,
    description: str,
    city_id: str,
    *,
    display_name: str | None = None,
    place_ids: list[str] | None = None,
    activity_tags: list[str] | None = None,
    priority: int | None = None,
    weight: float | None = None,
    presentation_id: str | None = None,
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
    if not re.match(r"^[a-zA-Z0-9_-]+$", normalized_id):
        raise ValueError("Gift id can only use letters, numbers, underscore and hyphen.")

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ValueError(f"Failed to parse JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("Catalog JSON must be an object.")

    items_key = "items" if isinstance(data.get("items"), list) else "gifts" if isinstance(data.get("gifts"), list) else "items"
    items = data.get(items_key)
    if not isinstance(items, list):
        items = []
        data[items_key] = items

    for existing in items:
        if isinstance(existing, dict) and str(existing.get("id") or "").strip() == normalized_id:
            raise ValueError("Gift id already exists.")

    resolved_place = _resolve_place_ids_for_append(place_ids, city_id)
    tags: list[str] = []
    if activity_tags is not None:
        tags = [str(t).strip() for t in activity_tags if str(t).strip()]

    if (display_name or "").strip():
        resolved_display = (display_name or "").strip()
    else:
        resolved_display = normalized_id.replace("_", " ").replace("-", " ").strip().title()

    pri = 10 if priority is None else int(priority)
    w = 2.0 if weight is None else float(weight)
    pres = str(presentation_id or "").strip()

    new_gift: dict[str, Any] = {
        "id": normalized_id,
        "displayName": resolved_display,
        "description": (description or "").strip(),
        "placeIds": resolved_place,
        "activityTags": tags,
        "priority": pri,
        "weight": w,
        "imageFileName": "",
        "presentationId": pres,
    }
    items.append(new_gift)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return new_gift


def append_gift_image_file(
    catalog_path: str,
    gift_id: str,
    description: str,
    city_id: str,
    image_bytes: bytes,
    original_filename: str,
    *,
    display_name: str | None = None,
    place_ids: list[str] | None = None,
    activity_tags: list[str] | None = None,
    priority: int | None = None,
    weight: float | None = None,
    presentation_id: str | None = None,
) -> dict[str, Any]:
    """Create gift and copy image into Gift/Images next to catalog; set imageFileName in JSON."""
    raw_suffix = Path(original_filename or "").suffix.lower()
    if raw_suffix not in (".png", ".jpg", ".jpeg", ".webp", ".gif"):
        raw_suffix = ".png"
    created = append_gift_to_catalog(
        catalog_path,
        gift_id,
        description,
        city_id,
        display_name=display_name,
        place_ids=place_ids,
        activity_tags=activity_tags,
        priority=priority,
        weight=weight,
        presentation_id=presentation_id,
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
    items_key = "items" if isinstance(data.get("items"), list) else "gifts" if isinstance(data.get("gifts"), list) else "items"
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
