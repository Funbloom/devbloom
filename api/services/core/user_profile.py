"""Persist per-user UI preferences in Supabase (user_profiles)."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from services.core.rag import get_supabase_client, project_exists

logger = logging.getLogger(__name__)


def get_user_profile(user_id: str) -> dict[str, Any]:
    """Return current_project_key for this user, or null if no row."""
    if not (user_id or "").strip():
        return {"current_project_key": None}
    supabase = get_supabase_client()
    result = (
        supabase.table("user_profiles")
        .select("current_project_key")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if result.data and len(result.data) > 0:
        return {"current_project_key": result.data[0].get("current_project_key")}
    return {"current_project_key": None}


def set_user_current_project(user_id: str, project_key: Optional[str]) -> dict[str, Any]:
    """Upsert current_project_key. Pass None or empty string to clear."""
    if not (user_id or "").strip():
        raise ValueError("user_id is required.")
    cleaned = (project_key or "").strip() or None
    supabase = get_supabase_client()
    if cleaned and not project_exists(supabase, cleaned):
        raise ValueError(f"Unknown project: {cleaned}")

    now = datetime.now(timezone.utc).isoformat()
    payload = {
        "user_id": user_id,
        "current_project_key": cleaned,
        "updated_at": now,
    }
    supabase.table("user_profiles").upsert(payload, on_conflict="user_id").execute()
    return {"current_project_key": cleaned, "updated_at": now}
