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
