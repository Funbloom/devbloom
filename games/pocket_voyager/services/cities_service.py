from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

from openai import OpenAI

from core.code_settings import GPT_MODEL_DEFAULT
from services.image_tool import generate_openai_image_to_dir
from .gifts_service import (
    POCKET_VOYAGER_IMAGE_GENERATION_SIZE,
    downscale_pocket_voyager_image,
    resolve_gift_images_dir,
)


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


def add_gift_to_city(cities_path: str, city_id: str, gift_id: str) -> dict[str, Any]:
    raw_path = (cities_path or "").strip()
    if not raw_path:
        raise ValueError("Cities path is required.")
    path = Path(raw_path)
    if not path.exists():
        raise FileNotFoundError("Cities file not found.")
    if path.suffix.lower() != ".json":
        raise ValueError("Cities path must be a .json file.")

    city_key = (city_id or "").strip()
    gift_key = (gift_id or "").strip()
    if not city_key or not gift_key:
        raise ValueError("city_id and gift_id are required.")

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ValueError(f"Failed to parse JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("Cities JSON must be an object.")

    cities = data.get("cities")
    if not isinstance(cities, list):
        raise ValueError("Cities JSON must include a 'cities' array.")

    target = next(
        (
            c
            for c in cities
            if isinstance(c, dict)
            and str(c.get("nameId") or c.get("name_id") or "").strip() == city_key
        ),
        None,
    )
    if not target:
        raise FileNotFoundError("City not found.")

    gift_ids = target.get("giftIds")
    if isinstance(gift_ids, list):
        ids = [str(x).strip() for x in gift_ids if str(x).strip()]
    else:
        ids = []
    if gift_key not in ids:
        ids.append(gift_key)
    target["giftIds"] = ids

    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return load_cities_catalog(str(path))


def batch_create_cities(
    cities_path: str,
    gifts_path: str,
    prompt: str,
    count: int,
) -> dict[str, Any]:
    if not prompt.strip():
        raise ValueError("Prompt is required.")
    if count <= 0:
        raise ValueError("Count must be greater than 0.")

    cities_file = Path((cities_path or "").strip())
    gifts_file = Path((gifts_path or "").strip())
    if not cities_file.is_file():
        raise FileNotFoundError("Cities file not found.")
    if not gifts_file.is_file():
        raise FileNotFoundError("Gifts catalog file not found.")

    try:
        cities_data = json.loads(cities_file.read_text(encoding="utf-8"))
        gifts_data = json.loads(gifts_file.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ValueError(f"Failed to parse JSON: {exc}") from exc

    if not isinstance(cities_data, dict) or not isinstance(gifts_data, dict):
        raise ValueError("Cities and gifts JSON must be objects.")

    cities_list = cities_data.get("cities")
    if not isinstance(cities_list, list):
        raise ValueError("Cities JSON must include a 'cities' array.")

    items_key = (
        "items"
        if isinstance(gifts_data.get("items"), list)
        else "gifts"
        if isinstance(gifts_data.get("gifts"), list)
        else "items"
    )
    gifts_list = gifts_data.get(items_key)
    if not isinstance(gifts_list, list):
        gifts_list = []
        gifts_data[items_key] = gifts_list

    existing_city_ids = {
        str(c.get("nameId") or c.get("name_id") or "").strip()
        for c in cities_list
        if isinstance(c, dict)
    }
    existing_city_ids = {cid for cid in existing_city_ids if cid}
    existing_gift_ids = {
        str(g.get("id") or "").strip()
        for g in gifts_list
        if isinstance(g, dict)
    }

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY is required for batch city creation.")

    client = OpenAI(api_key=api_key)
    system = (
        "You are generating game content JSON. Return strict JSON only with the schema:\n"
        "{ \"cities\": [ { \"cityId\": string, \"displayName\": string, "
        "\"locationUpdates\": [ { \"text\": string, \"image\": string } ], "
        "\"gifts\": [ { \"giftId\": string, \"displayName\": string, "
        "\"description\": string, \"activityTags\": [string] } ] } ] }"
    )
    response = client.chat.completions.create(
        model=GPT_MODEL_DEFAULT,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
    )
    content = response.choices[0].message.content or "{}"
    try:
        payload = json.loads(content)
    except Exception as exc:
        raise ValueError(f"Invalid LLM JSON: {exc}") from exc

    raw_cities = payload.get("cities")
    if not isinstance(raw_cities, list):
        raise ValueError("LLM response must include 'cities' array.")

    new_cities: list[dict[str, Any]] = []
    new_gifts: list[dict[str, Any]] = []
    images_dir = resolve_gift_images_dir(str(gifts_file))
    images_dir.mkdir(parents=True, exist_ok=True)
    errors: list[str] = []

    def _slug(s: str) -> str:
        return re.sub(r"[^a-zA-Z0-9_-]+", "_", s.strip().lower()).strip("_")

    for city in raw_cities:
        if len(new_cities) >= count:
            break
        if not isinstance(city, dict):
            continue
        city_id = _slug(str(city.get("cityId") or ""))
        display = str(city.get("displayName") or "").strip()
        gifts = city.get("gifts") if isinstance(city.get("gifts"), list) else []
        updates = city.get("locationUpdates") if isinstance(city.get("locationUpdates"), list) else []
        if not city_id or city_id in existing_city_ids or any(c.get("nameId") == city_id for c in new_cities):
            continue
        if not display:
            display = city_id.replace("_", " ").title()

        gift_ids: list[str] = []
        for idx, gift in enumerate(gifts[:5]):
            if not isinstance(gift, dict):
                continue
            raw_gid = str(gift.get("giftId") or "").strip()
            gid = _slug(raw_gid) if raw_gid else f"{city_id}_gift_{idx+1}"
            if gid in existing_gift_ids or gid in gift_ids:
                gid = f"{city_id}_gift_{idx+1}"
            gdisplay = str(gift.get("displayName") or "").strip() or gid.replace("_", " ").title()
            gdesc = str(gift.get("description") or "").strip()
            gtags = gift.get("activityTags") if isinstance(gift.get("activityTags"), list) else []
            tags = [str(t).strip() for t in gtags if str(t).strip()]
            gift_entry = {
                "id": gid,
                "displayName": gdisplay,
                "description": gdesc,
                "activityTags": tags,
                "priority": 10,
                "weight": 2.0,
                "imageFileName": "",
            }
            gifts_list.append(gift_entry)
            existing_gift_ids.add(gid)
            gift_ids.append(gid)
            new_gifts.append(gift_entry)

            try:
                prompt_text = gdisplay if not gdesc else f"{gdisplay}. {gdesc}"
                result = generate_openai_image_to_dir(
                    prompt=prompt_text,
                    output_dir=images_dir,
                    filename=f"{gid}.png",
                    width=POCKET_VOYAGER_IMAGE_GENERATION_SIZE,
                    height=POCKET_VOYAGER_IMAGE_GENERATION_SIZE,
                    quality="low",
                    model_name="gpt-image-1.5",
                )
                downscale_pocket_voyager_image(Path(result["path"]))
                gift_entry["imageFileName"] = result["filename"]
            except Exception as exc:
                errors.append(f"Image generation failed for gift {gid}: {exc}")

        normalized_updates: list[dict[str, str]] = []
        for update in updates:
            if not isinstance(update, dict):
                continue
            text = str(update.get("text") or "").strip()
            image = str(update.get("image") or "").strip()
            if text:
                normalized_updates.append({"text": text, "image": image})

        cities_list.append(
            {
                "nameId": city_id,
                "displayName": display,
                "giftIds": gift_ids,
                "locationUpdates": normalized_updates,
            }
        )
        new_cities.append(
            {
                "nameId": city_id,
                "displayName": display,
                "giftIds": gift_ids,
                "locationUpdates": normalized_updates,
            }
        )
        existing_city_ids.add(city_id)

    cities_file.write_text(json.dumps(cities_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    gifts_file.write_text(json.dumps(gifts_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    return {
        "created_cities": new_cities,
        "created_gifts": new_gifts,
        "errors": errors,
    }


def update_cities_location_updates(
    cities_path: str,
    prompt: str,
    city_ids: list[str],
    count: int,
    replace_existing: bool,
) -> dict[str, Any]:
    if not prompt.strip():
        raise ValueError("Prompt is required.")
    if count <= 0:
        raise ValueError("Count must be greater than 0.")
    if not city_ids:
        raise ValueError("At least one city id is required.")

    cities_file = Path((cities_path or "").strip())
    if not cities_file.is_file():
        raise FileNotFoundError("Cities file not found.")

    try:
        cities_data = json.loads(cities_file.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ValueError(f"Failed to parse JSON: {exc}") from exc

    if not isinstance(cities_data, dict):
        raise ValueError("Cities JSON must be an object.")

    cities_list = cities_data.get("cities")
    if not isinstance(cities_list, list):
        raise ValueError("Cities JSON must include a 'cities' array.")

    target_ids = {cid.strip() for cid in city_ids if cid.strip()}
    if not target_ids:
        raise ValueError("At least one valid city id is required.")

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY is required for location updates.")

    client = OpenAI(api_key=api_key)
    system = (
        "You generate location update JSON. Return strict JSON only with schema:\n"
        "{ \"updates\": [ { \"cityId\": string, \"updates\": [ { \"text\": string, \"image\": string } ] } ] }"
    )
    response = client.chat.completions.create(
        model=GPT_MODEL_DEFAULT,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
    )
    content = response.choices[0].message.content or "{}"
    try:
        payload = json.loads(content)
    except Exception as exc:
        raise ValueError(f"Invalid LLM JSON: {exc}") from exc

    raw_updates = payload.get("updates")
    if not isinstance(raw_updates, list):
        raise ValueError("LLM response must include 'updates' array.")

    updates_by_city: dict[str, list[dict[str, str]]] = {}
    for entry in raw_updates:
        if not isinstance(entry, dict):
            continue
        city_id = str(entry.get("cityId") or "").strip()
        updates = entry.get("updates") if isinstance(entry.get("updates"), list) else []
        if not city_id or city_id not in target_ids:
            continue
        normalized: list[dict[str, str]] = []
        for update in updates[:count]:
            if not isinstance(update, dict):
                continue
            text = str(update.get("text") or "").strip()
            image = str(update.get("image") or "").strip()
            if text:
                normalized.append({"text": text, "image": image})
        if normalized:
            updates_by_city[city_id] = normalized

    updated = 0
    for city in cities_list:
        if not isinstance(city, dict):
            continue
        city_id = str(city.get("nameId") or city.get("name_id") or "").strip()
        if not city_id or city_id not in target_ids:
            continue
        incoming = updates_by_city.get(city_id, [])
        if not incoming:
            continue
        if replace_existing:
            city["locationUpdates"] = incoming
        else:
            existing = city.get("locationUpdates")
            if not isinstance(existing, list):
                existing = []
            city["locationUpdates"] = existing + incoming
        updated += 1

    cities_file.write_text(json.dumps(cities_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"updated": updated}


def generate_cities_payload(prompt: str) -> list[dict[str, Any]]:
    if not prompt.strip():
        raise ValueError("Prompt is required.")
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY is required for batch city creation.")
    client = OpenAI(api_key=api_key)
    system = (
        "You are generating game content JSON. Return strict JSON only with the schema:\n"
        "{ \"cities\": [ { \"cityId\": string, \"displayName\": string, "
        "\"locationUpdates\": [ { \"text\": string, \"image\": string } ], "
        "\"gifts\": [ { \"giftId\": string, \"displayName\": string, "
        "\"description\": string, \"activityTags\": [string] } ] } ] }"
    )
    response = client.chat.completions.create(
        model=GPT_MODEL_DEFAULT,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
    )
    content = response.choices[0].message.content or "{}"
    payload = json.loads(content)
    raw_cities = payload.get("cities")
    if not isinstance(raw_cities, list):
        raise ValueError("LLM response must include 'cities' array.")
    return raw_cities


def plan_batch_create_cities(
    prompt: str,
    count: int,
    existing_city_ids: list[str],
    existing_gift_ids: list[str],
) -> dict[str, Any]:
    if count <= 0:
        raise ValueError("Count must be greater than 0.")
    raw_cities = generate_cities_payload(prompt)
    existing_city_ids_set = {c.strip() for c in existing_city_ids if c.strip()}
    existing_gift_ids_set = {g.strip() for g in existing_gift_ids if g.strip()}
    new_cities: list[dict[str, Any]] = []
    new_gifts: list[dict[str, Any]] = []

    def _slug(s: str) -> str:
        return re.sub(r"[^a-zA-Z0-9_-]+", "_", s.strip().lower()).strip("_")

    for city in raw_cities:
        if len(new_cities) >= count:
            break
        if not isinstance(city, dict):
            continue
        city_id = _slug(str(city.get("cityId") or ""))
        display = str(city.get("displayName") or "").strip()
        gifts = city.get("gifts") if isinstance(city.get("gifts"), list) else []
        updates = city.get("locationUpdates") if isinstance(city.get("locationUpdates"), list) else []
        if not city_id or city_id in existing_city_ids_set or any(c.get("nameId") == city_id for c in new_cities):
            continue
        if not display:
            display = city_id.replace("_", " ").title()

        gift_ids: list[str] = []
        for idx, gift in enumerate(gifts[:5]):
            if not isinstance(gift, dict):
                continue
            raw_gid = str(gift.get("giftId") or "").strip()
            gid = _slug(raw_gid) if raw_gid else f"{city_id}_gift_{idx+1}"
            if gid in existing_gift_ids_set or gid in gift_ids:
                gid = f"{city_id}_gift_{idx+1}"
            gdisplay = str(gift.get("displayName") or "").strip() or gid.replace("_", " ").title()
            gdesc = str(gift.get("description") or "").strip()
            gtags = gift.get("activityTags") if isinstance(gift.get("activityTags"), list) else []
            tags = [str(t).strip() for t in gtags if str(t).strip()]
            gift_entry = {
                "id": gid,
                "displayName": gdisplay,
                "description": gdesc,
                "activityTags": tags,
                "priority": 10,
                "weight": 2.0,
                "imageFileName": "",
            }
            existing_gift_ids_set.add(gid)
            gift_ids.append(gid)
            new_gifts.append(gift_entry)

        normalized_updates: list[dict[str, str]] = []
        for update in updates:
            if not isinstance(update, dict):
                continue
            text = str(update.get("text") or "").strip()
            image = str(update.get("image") or "").strip()
            if text:
                normalized_updates.append({"text": text, "image": image})

        new_cities.append(
            {
                "nameId": city_id,
                "displayName": display,
                "giftIds": gift_ids,
                "locationUpdates": normalized_updates,
            }
        )
        existing_city_ids_set.add(city_id)

    return {
        "created_cities": new_cities,
        "created_gifts": new_gifts,
    }


def generate_location_updates_payload(prompt: str) -> list[dict[str, Any]]:
    if not prompt.strip():
        raise ValueError("Prompt is required.")
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY is required for location updates.")
    client = OpenAI(api_key=api_key)
    system = (
        "You generate location update JSON. Return strict JSON only with schema:\n"
        "{ \"updates\": [ { \"cityId\": string, \"updates\": [ { \"text\": string, \"image\": string } ] } ] }"
    )
    response = client.chat.completions.create(
        model=GPT_MODEL_DEFAULT,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
    )
    content = response.choices[0].message.content or "{}"
    payload = json.loads(content)
    raw_updates = payload.get("updates")
    if not isinstance(raw_updates, list):
        raise ValueError("LLM response must include 'updates' array.")
    return raw_updates


def plan_location_updates(prompt: str, city_ids: list[str], count: int) -> dict[str, Any]:
    if count <= 0:
        raise ValueError("Count must be greater than 0.")
    target_ids = {cid.strip() for cid in city_ids if cid.strip()}
    if not target_ids:
        raise ValueError("At least one valid city id is required.")
    raw_updates = generate_location_updates_payload(prompt)
    updates_by_city: dict[str, list[dict[str, str]]] = {}
    for entry in raw_updates:
        if not isinstance(entry, dict):
            continue
        city_id = str(entry.get("cityId") or "").strip()
        updates = entry.get("updates") if isinstance(entry.get("updates"), list) else []
        if not city_id or city_id not in target_ids:
            continue
        normalized: list[dict[str, str]] = []
        for update in updates[:count]:
            if not isinstance(update, dict):
                continue
            text = str(update.get("text") or "").strip()
            image = str(update.get("image") or "").strip()
            if text:
                normalized.append({"text": text, "image": image})
        if normalized:
            updates_by_city[city_id] = normalized
    return {"updates": updates_by_city}
