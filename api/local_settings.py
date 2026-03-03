import json
import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
LOCAL_DATA_DIR = PROJECT_ROOT / ".local_data"
IMAGE_DEFAULTS_FILE = LOCAL_DATA_DIR / "image_defaults.json"
THEME_SETTINGS_FILE = LOCAL_DATA_DIR / "ui_theme.json"

def _validate_project_key(project_key: str) -> str:
    key = (project_key or "").strip()
    if not key:
        raise ValueError("project_key is required")
    # Sanitize to a safe directory name under .local_data:
    # - replace any disallowed character with "_"
    # - disallow path separators or traversal sequences
    key = re.sub(r"[^a-zA-Z0-9_.-]+", "_", key)
    if "/" in key or "\\" in key or ".." in key:
        raise ValueError("project_key contains invalid path characters")
    return key


def get_image_generated_path(project_key: str) -> Path:
    safe_key = _validate_project_key(project_key)
    return LOCAL_DATA_DIR / safe_key / "image_generated.json"


def load_image_generated(project_key: str) -> dict:
    path = get_image_generated_path(project_key)
    if not path.exists():
        return {"images": []}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return {"images": []}
        images = data.get("images")
        if not isinstance(images, list):
            return {"images": []}
        return {"images": images}
    except Exception:
        return {"images": []}


def save_image_generated(project_key: str, images: list) -> dict:
    path = get_image_generated_path(project_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    data = {"images": images}
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return data

DEFAULT_IMAGE_SETTINGS = {
    "num_images": 2,
    "width": 720,
    "height": 1280,
    "style": "high resolution cartoon, movie style",
}

DEFAULT_THEME_SETTINGS = {
    # Keep current \"ocean\" look as default.
    "theme": "ocean",
}


def load_image_defaults() -> dict:
    if not IMAGE_DEFAULTS_FILE.exists():
        return DEFAULT_IMAGE_SETTINGS.copy()
    try:
        data = json.loads(IMAGE_DEFAULTS_FILE.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return DEFAULT_IMAGE_SETTINGS.copy()
        merged = DEFAULT_IMAGE_SETTINGS.copy()
        merged.update({k: v for k, v in data.items() if v is not None})
        return merged
    except Exception:
        return DEFAULT_IMAGE_SETTINGS.copy()


def save_image_defaults(payload: dict) -> dict:
    LOCAL_DATA_DIR.mkdir(parents=True, exist_ok=True)
    data = DEFAULT_IMAGE_SETTINGS.copy()
    data.update({k: v for k, v in payload.items() if v is not None})
    IMAGE_DEFAULTS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return data


def load_theme_settings() -> dict:
    if not THEME_SETTINGS_FILE.exists():
        return DEFAULT_THEME_SETTINGS.copy()
    try:
        data = json.loads(THEME_SETTINGS_FILE.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return DEFAULT_THEME_SETTINGS.copy()
        merged = DEFAULT_THEME_SETTINGS.copy()
        merged.update({k: v for k, v in data.items() if k in merged and v is not None})
        return merged
    except Exception:
        return DEFAULT_THEME_SETTINGS.copy()


def save_theme_settings(payload: dict) -> dict:
    LOCAL_DATA_DIR.mkdir(parents=True, exist_ok=True)
    data = DEFAULT_THEME_SETTINGS.copy()
    data.update({k: v for k, v in payload.items() if k in data and v is not None})
    THEME_SETTINGS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return data
