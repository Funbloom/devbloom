"""Repo and API-local paths (history, debug logs)."""

import os
from pathlib import Path

# api/ directory (parent of core/)
_API_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = _API_DIR.parent
LOCAL_DATA_DIR = PROJECT_ROOT / ".local_data"
DEBUG_PROMPTS_PATH = LOCAL_DATA_DIR / "debug_prompts.txt"

_history_dir_env = os.getenv("CHAT_HISTORY_DIR")
if _history_dir_env:
    _history_base = Path(_history_dir_env)
    if not _history_base.is_absolute():
        _history_base = (PROJECT_ROOT / _history_dir_env).resolve()
    HISTORY_BASE_DIR = _history_base
else:
    HISTORY_BASE_DIR = LOCAL_DATA_DIR / "history"

MAX_HISTORY_ITEMS = 200
