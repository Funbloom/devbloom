"""Admin user listing via Supabase Auth REST API and SDK fallback."""

import logging
import os
from typing import Any

import requests

from core.chat_debug import log_unexpected_path
from core.chat_helpers import extract_users_from_response, user_row
from services.rag import get_supabase_client
from services.usage import get_usage_for_users

logger = logging.getLogger(__name__)


def fetch_users_via_auth_api() -> list:
    """Fetch all users (email + OAuth) via Supabase Auth REST API. Avoids SDK filtering."""
    base_url = (os.getenv("SUPABASE_URL") or "").rstrip("/")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""
    if not base_url or not service_key:
        return []
    url = f"{base_url}/auth/v1/admin/users"
    headers = {"Authorization": f"Bearer {service_key}", "apikey": service_key}
    per_page = 1000
    page = 1
    all_users: list = []
    while True:
        resp = requests.get(url, headers=headers, params={"per_page": per_page, "page": page}, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        batch = data.get("users") or data.get("audience") or []
        if not isinstance(batch, list):
            log_unexpected_path(
                "Supabase auth API returned an unexpected users payload.",
                page=page,
                payload_type=type(batch).__name__,
            )
            break
        all_users.extend(batch)
        if len(batch) < per_page:
            break
        page += 1
    return all_users


def list_users_for_admin(admin: dict[str, Any]) -> list:
    """Build user rows with image usage for the admin UI."""
    users: list = []
    try:
        users = fetch_users_via_auth_api()
    except Exception:
        logger.exception("Failed to load users from Supabase Auth REST API; falling back to SDK.")
    if not users:
        supabase = get_supabase_client()
        per_page = 1000
        page = 1
        while True:
            try:
                response = supabase.auth.admin.list_users(page=page, per_page=per_page)
            except TypeError:
                if page == 1:
                    response = supabase.auth.admin.list_users(per_page=per_page)
                else:
                    log_unexpected_path(
                        "Supabase SDK list_users rejected pagination after the first page.",
                        page=page,
                    )
                    break
            batch = extract_users_from_response(response)
            users.extend(batch)
            if len(batch) < per_page:
                break
            page += 1
    result = [user_row(u) for u in users]
    if not result and admin.get("email"):
        result = [
            {
                "id": admin.get("id"),
                "email": admin.get("email"),
                "created_at": None,
                "role": "admin" if admin.get("is_admin") else None,
                "provider": "email",
            }
        ]
    user_ids = [r["id"] for r in result if r.get("id")]
    usage = get_usage_for_users(user_ids)
    for r in result:
        uid = r.get("id")
        if uid and uid in usage:
            r["images_today"] = usage[uid]["images_today"]
            r["images_total"] = usage[uid]["images_total"]
        else:
            r["images_today"] = 0
            r["images_total"] = 0
    return result
