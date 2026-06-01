from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Optional

_API_DIR = Path(__file__).resolve().parent.parent.parent
_REPO_ROOT = _API_DIR.parent
GAMES_DIR = _REPO_ROOT / "games"
MANIFEST_FILENAME = "manifest.json"

_KEY_RE = re.compile(r"^[a-z0-9_-]+$")


def _safe_key(value: str, label: str) -> str:
    cleaned = (value or "").strip().lower()
    if not cleaned or not _KEY_RE.match(cleaned):
        raise ValueError(f"Invalid {label} key.")
    return cleaned


def _manifest_path_for_game(game_key: str) -> Path:
    return GAMES_DIR / game_key / MANIFEST_FILENAME


def _discover_game_keys() -> list[str]:
    """Game keys = subdirs of games/ that contain manifest.json."""
    if not GAMES_DIR.is_dir():
        return []
    keys: list[str] = []
    for child in sorted(GAMES_DIR.iterdir()):
        if not child.is_dir():
            continue
        if child.name.startswith(".") or child.name.startswith("_"):
            continue
        if (child / MANIFEST_FILENAME).is_file():
            keys.append(child.name)
    return keys


def _load_game_manifest(game_key: str) -> Optional[dict]:
    path = _manifest_path_for_game(game_key)
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return None
        return data
    except Exception:
        return None


def _load_all_game_manifests() -> list[dict]:
    out: list[dict] = []
    for dir_key in _discover_game_keys():
        raw = _load_game_manifest(dir_key)
        if not raw:
            continue
        manifest_key = (raw.get("key") or "").strip() or dir_key
        try:
            safe_key = _safe_key(manifest_key, "game")
        except ValueError:
            continue
        if safe_key != dir_key:
            # manifest key must match folder name
            continue
        out.append(raw)
    return out


def _project_keys_for_game(game: dict, game_key: str) -> list[str]:
    """Which studio `project_key` values show this game in the nav. Default: the game key only."""
    raw = game.get("project_keys")
    keys: list[str] = []
    if isinstance(raw, list) and raw:
        for item in raw:
            try:
                keys.append(_safe_key(str(item), "project"))
            except ValueError:
                continue
        keys = list(dict.fromkeys(keys))
    if not keys:
        try:
            keys = [_safe_key(game_key, "game")]
        except ValueError:
            keys = []
    return keys


def list_games() -> list[dict]:
    out: list[dict] = []
    for g in _load_all_game_manifests():
        key = (g.get("key") or "").strip()
        name = (g.get("name") or "").strip()
        if key and name:
            try:
                safe_key = _safe_key(key, "game")
            except ValueError:
                continue
            out.append(
                {
                    "key": safe_key,
                    "name": name,
                    "project_keys": _project_keys_for_game(g, safe_key),
                }
            )
    return out


def get_game(game_key: str) -> Optional[dict]:
    target = _safe_key(game_key, "game")
    manifest = _load_game_manifest(target)
    if not manifest:
        return None
    manifest_key = (manifest.get("key") or "").strip()
    if manifest_key and manifest_key != target:
        return None
    return manifest


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
