"""On-disk per-user chat history (JSON files)."""

import json
from pathlib import Path
from typing import Optional

from core.app_paths import HISTORY_BASE_DIR, MAX_HISTORY_ITEMS
from core.chat_helpers import history_path_for_user
from core.chat_schemas import HistoryPayload


def get_history_path(agent_id: str, user: dict, project_key: Optional[str]) -> Path:
    return history_path_for_user(agent_id, user, project_key, HISTORY_BASE_DIR)


def read_history_messages(agent_id: str, user: dict, project_key: Optional[str]) -> list:
    path = get_history_path(agent_id, user, project_key)
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    messages = data.get("messages", [])
    if not isinstance(messages, list):
        return []
    return messages[:MAX_HISTORY_ITEMS]


def save_history(agent_id: str, user: dict, project_key: Optional[str], body: HistoryPayload) -> tuple[bool, int]:
    path = get_history_path(agent_id, user, project_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    messages = body.messages[-MAX_HISTORY_ITEMS:]
    payload = {"messages": [msg.model_dump() for msg in messages]}
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return True, len(messages)


def clear_history(agent_id: str, user: dict, project_key: Optional[str]) -> None:
    path = get_history_path(agent_id, user, project_key)
    if path.exists():
        path.unlink()
