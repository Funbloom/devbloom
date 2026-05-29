from __future__ import annotations

import json
import os
import re
from typing import Any, Callable

from openai import OpenAI

from services.audio.audiobank_storage import sanitize_storage_segment

ANALYZE_MODEL = "gpt-4o-mini"
DEFAULT_CATEGORY = "system"

# Top-level categories (storage paths are lowercase).
AUDIOBANK_TOP_CATEGORIES: tuple[str, ...] = (
    "ui",
    "dog",
    "character",
    "environment",
    "travel",
    "rewards",
    "interaction",
    "narrative",
    "music",
    "system",
)

# UI subcategories: ui/{subcategory}
AUDIOBANK_UI_SUBCATEGORIES: dict[str, tuple[str, ...]] = {
    "button": ("button", "click", "tap", "press", "btn"),
    "notification": ("notification", "notify", "alert", "ping", "notif"),
    "popup": ("popup", "pop_up", "pop-up", "modal", "dialog"),
    "success": ("success", "win", "complete", "victory", "achievement", "confirm"),
    "error": ("error", "fail", "wrong", "invalid", "deny", "buzz"),
    "message": ("message", "msg", "chat", "inbox", "mail", "text"),
    "navigation": ("navigation", "nav", "swipe", "transition", "page", "tab", "back"),
}

TOP_CATEGORY_KEYWORDS: dict[str, tuple[str, ...]] = {
    "dog": ("dog", "bark", "woof", "puppy", "canine"),
    "character": ("character", "hero", "npc", "footstep", "footsteps", "walk", "run", "jump", "voice"),
    "environment": ("environment", "ambient", "ambience", "wind", "rain", "weather", "nature", "forest", "water"),
    "travel": ("travel", "vehicle", "engine", "door", "teleport", "map", "journey", "train", "plane"),
    "rewards": ("reward", "rewards", "coin", "coins", "collect", "pickup", "loot", "prize", "gift"),
    "interaction": ("interaction", "interact", "use", "grab", "hold", "drag", "drop"),
    "narrative": ("narrative", "story", "cutscene", "dialogue", "dialog", "narration", "voiceover"),
    "music": ("music", "loop", "bgm", "soundtrack", "stinger", "jingle"),
    "system": ("system", "loading", "startup", "shutdown", "boot", "save"),
    "ui": ("ui", "hud", "menu", "interface", "screen"),
}

ALLOWED_CATEGORY_PATHS: frozenset[str] = frozenset(
    list(TOP_CATEGORY_KEYWORDS.keys())
    + [f"ui/{sub}" for sub in AUDIOBANK_UI_SUBCATEGORIES]
)


def _default_client_factory() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("Missing OPENAI_API_KEY")
    return OpenAI(api_key=api_key)


def filename_tokens(filename: str) -> list[str]:
    stem = re.sub(r"\.[^.]+$", "", (filename or "").strip()).lower()
    tokens = re.split(r"[^a-z0-9]+", stem)
    return [token for token in tokens if token and not token.isdigit()]


def filename_search_text(filename: str) -> str:
    tokens = filename_tokens(filename)
    stem = re.sub(r"\.[^.]+$", "", (filename or "").strip()).lower()
    joined = " ".join(tokens)
    normalized_stem = re.sub(r"[^a-z0-9]+", " ", stem).strip()
    return f"{normalized_stem} {joined}".strip()


def tags_from_filename(filename: str) -> list[str]:
    tags: list[str] = []
    seen: set[str] = set()
    for token in filename_tokens(filename):
        if token in seen:
            continue
        seen.add(token)
        tags.append(token)
    return tags[:12]


def sanitize_tags(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []
    tags: list[str] = []
    seen: set[str] = set()
    for item in raw:
        text = str(item).strip().lower()
        if not text or text in seen:
            continue
        cleaned = re.sub(r"[^a-z0-9 _-]+", "", text).strip()
        if not cleaned:
            continue
        seen.add(cleaned)
        tags.append(cleaned)
        if len(tags) >= 20:
            break
    return tags


def normalize_category_path(raw: str) -> str:
    cleaned = sanitize_storage_segment(raw)
    if cleaned in ALLOWED_CATEGORY_PATHS:
        return cleaned
    parts = cleaned.split("/")
    if len(parts) == 2 and parts[0] == "ui" and parts[1] in AUDIOBANK_UI_SUBCATEGORIES:
        return cleaned
    if cleaned in TOP_CATEGORY_KEYWORDS:
        return cleaned
    return DEFAULT_CATEGORY


def _keyword_hits(text: str, tokens: set[str], keywords: tuple[str, ...]) -> int:
    hits = 0
    for keyword in keywords:
        normalized = keyword.lower().replace("-", "_")
        variants = {normalized, normalized.replace("_", ""), normalized.replace("_", " ")}
        for variant in variants:
            if not variant:
                continue
            if variant in tokens:
                hits += 2
                continue
            if re.search(rf"(?<![a-z0-9]){re.escape(variant)}(?![a-z0-9])", text):
                hits += 1
    return hits


def classify_from_filename(filename: str) -> dict[str, Any]:
    """Primary classifier: filename tokens and keywords map to the fixed taxonomy."""
    tokens_list = filename_tokens(filename)
    tokens = set(tokens_list)
    text = filename_search_text(filename)
    tags = tags_from_filename(filename)

    best_ui_sub: str | None = None
    best_ui_score = 0
    for subcategory, keywords in AUDIOBANK_UI_SUBCATEGORIES.items():
        score = _keyword_hits(text, tokens, keywords)
        if score > best_ui_score:
            best_ui_score = score
            best_ui_sub = subcategory

    if best_ui_sub and best_ui_score > 0:
        return {"category": f"ui/{best_ui_sub}", "tags": tags}

    best_top: str | None = None
    best_top_score = 0
    for category, keywords in TOP_CATEGORY_KEYWORDS.items():
        if category == "ui":
            continue
        score = _keyword_hits(text, tokens, keywords)
        if score > best_top_score:
            best_top_score = score
            best_top = category

    if best_top and best_top_score > 0:
        return {"category": best_top, "tags": tags}

    ui_score = _keyword_hits(text, tokens, TOP_CATEGORY_KEYWORDS["ui"])
    if ui_score > 0:
        return {"category": "ui", "tags": tags}

    return {"category": DEFAULT_CATEGORY, "tags": tags}


def parse_analysis_json(text: str) -> dict[str, Any]:
    cleaned = (text or "").strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    data = json.loads(cleaned)
    if not isinstance(data, dict):
        raise ValueError("Analysis response must be a JSON object.")
    category = normalize_category_path(str(data.get("category") or DEFAULT_CATEGORY))
    tags = sanitize_tags(data.get("tags"))
    return {"category": category, "tags": tags}


def _taxonomy_prompt_lines() -> str:
    ui_lines = "\n".join(f"  - ui/{name}" for name in AUDIOBANK_UI_SUBCATEGORIES)
    top_lines = "\n".join(f"  - {name}" for name in TOP_CATEGORY_KEYWORDS if name != "ui")
    return (
        "Allowed categories (pick exactly one path):\n"
        f"UI subfolders:\n{ui_lines}\n"
        f"Top-level:\n{top_lines}\n"
        "  - ui (only if clearly UI but no subfolder fits)"
    )


def _merge_tags(primary: list[str], secondary: list[str]) -> list[str]:
    merged: list[str] = []
    seen: set[str] = set()
    for tag in primary + secondary:
        lower = tag.lower().strip()
        if not lower or lower in seen:
            continue
        seen.add(lower)
        merged.append(lower)
        if len(merged) >= 12:
            break
    return merged


def _classify_with_openai_text(
    filename: str,
    filename_category: str,
    filename_tags: list[str],
    *,
    client_factory: Callable[[], OpenAI] | None = None,
) -> dict[str, Any] | None:
    try:
        factory = client_factory or _default_client_factory
        client = factory()
    except Exception:
        return None

    system = (
        "You classify short sound effects for a game audio library.\n"
        "Use the filename as the primary hint.\n"
        "Return strict JSON only with keys category and tags.\n"
        "category must be exactly one allowed path from the taxonomy below.\n"
        "tags is an array of short lowercase descriptors derived from the filename.\n\n"
        f"{_taxonomy_prompt_lines()}"
    )
    user_text = (
        f"Filename: {filename}\n"
        f"Suggested category from filename rules: {filename_category}\n"
        "Pick the best category path and tags from the filename."
    )

    try:
        response = client.chat.completions.create(
            model=ANALYZE_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_text},
            ],
            temperature=0.1,
            response_format={"type": "json_object"},
        )
        content = (response.choices[0].message.content or "").strip()
        parsed = parse_analysis_json(content)
        parsed["tags"] = _merge_tags(filename_tags, parsed["tags"])
        return parsed
    except Exception as exc:
        print(f"[audiobank_analyze] text classification failed: {exc}")
        return None


def analyze_audio_clip(
    filename: str,
    data: bytes,
    content_type: str,
    *,
    client_factory: Callable[[], OpenAI] | None = None,
) -> dict[str, Any]:
    del data, content_type
    filename_result = classify_from_filename(filename)
    filename_category = filename_result["category"]
    filename_tags = filename_result["tags"]

    tokens = set(filename_tokens(filename))
    text = filename_search_text(filename)
    has_ui_sub = filename_category.startswith("ui/") and filename_category != "ui"
    has_strong_top = filename_category != DEFAULT_CATEGORY and not filename_category.startswith("ui")
    has_ui_generic = filename_category == "ui" and _keyword_hits(text, tokens, TOP_CATEGORY_KEYWORDS["ui"]) > 0
    if has_ui_sub or has_strong_top or has_ui_generic:
        return {"category": filename_category, "tags": filename_tags}

    ai_result = _classify_with_openai_text(
        filename,
        filename_category,
        filename_tags,
        client_factory=client_factory,
    )
    if ai_result:
        return ai_result
    return {"category": filename_category, "tags": filename_tags}