"""Pure helpers for chat/history/tool heuristics and user row shaping (no FastAPI app import)."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Optional

# Keep in sync with AGENT_PERSONA_FILES keys in main.py
KNOWN_AGENT_IDS = frozenset({"creative_director", "art_director", "technical_director", "producer"})

_TOOL_TRIGGER_PHRASES = (
    "export",
    "save to pdf",
    "save as pdf",
    "save to docx",
    "save as docx",
    "export to pdf",
    "export to docx",
    "export as pdf",
    "export as docx",
    "google doc",
    "google docs",
    "generate image",
    "generate a image",
    "create image",
    "create a image",
    "draw ",
    "draw a",
    "picture of",
    "image of",
    "generate a picture",
    "resize image",
    "crop image",
    "convert image",
    "resize the image",
    "make a pdf",
    "make a docx",
    "write to pdf",
    "write to docx",
)


def _safe_path_segment(raw: Optional[str], fallback: str) -> str:
    value = (raw or "").strip()
    if not value:
        return fallback
    cleaned = re.sub(r"[^a-zA-Z0-9._-]", "_", value)
    return cleaned or fallback


def _user_might_need_tools(user_message: str) -> bool:
    """Return True if the user message suggests they may want export or image tools."""
    if not user_message or not user_message.strip():
        return False
    lower = user_message.strip().lower()
    return any(phrase in lower for phrase in _TOOL_TRIGGER_PHRASES)


def _choose_tool_name(user_message: str) -> Optional[str]:
    if not user_message:
        return None
    lower = user_message.strip().lower()
    if any(
        phrase in lower
        for phrase in ("text only", "no image", "don't generate an image", "do not generate an image")
    ):
        return None
    if "resize" in lower:
        return "resize_image"
    if "crop" in lower:
        return "crop_image"
    if "convert" in lower:
        return "convert_image"
    if any(
        phrase in lower
        for phrase in (
            "generate image",
            "generate a image",
            "create image",
            "create a image",
            "draw ",
            "draw a",
            "picture of",
            "image of",
            "generate a picture",
        )
    ):
        return "generate_image"
    return None


def _extract_tool_args(text: str, tool_name: str) -> Optional[dict]:
    if not text:
        return None
    pattern = rf"{tool_name}\s*\(\s*(\{{.*\}})\s*\)"
    match = re.search(pattern, text, re.DOTALL)
    if not match:
        return None
    raw = match.group(1)
    try:
        return json.loads(raw)
    except Exception:
        return None


def normalize_agent_id(agent_id: Optional[str]) -> str:
    if not agent_id:
        return "creative_director"
    cleaned = agent_id.strip().lower().replace("-", "_").replace(" ", "_")
    return cleaned if cleaned in KNOWN_AGENT_IDS else "creative_director"


def history_path_for_user(agent_id: str, user: dict, project_key: Optional[str], history_base_dir: Path) -> Path:
    safe_agent = normalize_agent_id(agent_id)
    raw_email = str(user.get("email") or user.get("id") or "")
    email_key = raw_email.replace("@", ".")
    safe_user = _safe_path_segment(email_key, "anonymous")
    safe_project = _safe_path_segment(project_key, "no_project")
    return history_base_dir / safe_project / safe_user / f"{safe_agent}.json"


def user_row(u: Any) -> dict:
    """Normalize a user record from Supabase (dict or object) to a small dict."""
    if hasattr(u, "model_dump"):
        u = u.model_dump()
    elif not isinstance(u, dict):
        u = {
            "id": getattr(u, "id", None),
            "email": getattr(u, "email", None),
            "created_at": getattr(u, "created_at", None),
            "user_metadata": getattr(u, "user_metadata", None) or {},
            "identities": getattr(u, "identities", None) or [],
            "app_metadata": getattr(u, "app_metadata", None) or {},
        }
    meta = u.get("user_metadata") if isinstance(u.get("user_metadata"), dict) else {}
    app_meta = u.get("app_metadata") if isinstance(u.get("app_metadata"), dict) else {}
    identities = u.get("identities") or []
    provider = None
    email = u.get("email")
    for ident in identities:
        if hasattr(ident, "model_dump"):
            ident = ident.model_dump()
        if isinstance(ident, dict):
            if not provider:
                provider = ident.get("provider")
            if not email:
                id_data = ident.get("identity_data") or {}
                email = id_data.get("email") if isinstance(id_data, dict) else None
    if not provider:
        provider = app_meta.get("provider")
    if not provider and isinstance(app_meta.get("providers"), list) and app_meta["providers"]:
        provider = app_meta["providers"][0]
    if not provider and identities:
        provider = "email"
    role = meta.get("role") or app_meta.get("role")

    def _norm(v):
        return v if (v is not None and str(v).strip() != "") else None

    return {
        "id": u.get("id"),
        "email": _norm(email),
        "created_at": u.get("created_at"),
        "role": _norm(role),
        "provider": _norm(provider),
    }


def extract_users_from_response(response: Any) -> list:
    """Handle various Supabase auth.admin.list_users() response shapes."""
    users = getattr(response, "users", None) or getattr(response, "data", None)
    if users is not None and isinstance(users, list):
        return users
    if hasattr(response, "model_dump"):
        d = response.model_dump()
        users = d.get("users") or d.get("data")
        if isinstance(users, list):
            return users
    return []
