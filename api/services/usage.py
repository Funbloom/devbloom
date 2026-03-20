"""User usage tracking: image generation count per day. Enforces daily limit (admins exempt)."""
import os
from datetime import date, datetime, timezone

from fastapi import HTTPException

from services.rag import get_supabase_client

MAX_IMAGES_PER_USER_PER_DAY = int(os.getenv("MAX_IMAGES_PER_USER_PER_DAY", "20"))


def _today_utc() -> date:
    return datetime.now(timezone.utc).date()


def get_usage_today(user_id: str) -> int:
    """Return number of images generated today for this user."""
    if not (user_id or "").strip():
        return 0
    try:
        supabase = get_supabase_client()
        today = _today_utc().isoformat()
        r = (
            supabase.table("user_usage_daily")
            .select("images_generated")
            .eq("user_id", user_id)
            .eq("date", today)
            .limit(1)
            .execute()
        )
        if not r.data or len(r.data) == 0:
            return 0
        return int(r.data[0].get("images_generated", 0) or 0)
    except Exception:
        return 0


def get_usage_total(user_id: str) -> int:
    """Return total number of images generated (all time) for this user."""
    if not (user_id or "").strip():
        return 0
    try:
        supabase = get_supabase_client()
        r = (
            supabase.table("user_usage_daily")
            .select("images_generated")
            .eq("user_id", user_id)
            .execute()
        )
        if not r.data:
            return 0
        return sum(int(row.get("images_generated", 0) or 0) for row in r.data)
    except Exception:
        return 0


def get_usage_for_users(user_ids: list[str]) -> dict[str, dict]:
    """Return { user_id: { "images_today": int, "images_total": int } } for the given user ids."""
    result: dict[str, dict] = {uid: {"images_today": 0, "images_total": 0} for uid in user_ids if uid}
    if not result:
        return result
    try:
        supabase = get_supabase_client()
        today = _today_utc().isoformat()
        r = (
            supabase.table("user_usage_daily")
            .select("user_id, date, images_generated")
            .in_("user_id", list(result.keys()))
            .execute()
        )
        if not r.data:
            return result
        for row in r.data:
            uid = row.get("user_id")
            if uid not in result:
                continue
            count = int(row.get("images_generated", 0) or 0)
            result[uid]["images_total"] = result[uid]["images_total"] + count
            if row.get("date") == today:
                result[uid]["images_today"] = count
        return result
    except Exception:
        return result


def increment_usage(user_id: str, count: int = 1) -> None:
    """Increment today's image count for this user by count (upsert)."""
    if not (user_id or "").strip() or count <= 0:
        return
    try:
        supabase = get_supabase_client()
        today = _today_utc().isoformat()
        # Upsert: add count to existing row or set count for new row
        existing = (
            supabase.table("user_usage_daily")
            .select("images_generated")
            .eq("user_id", user_id)
            .eq("date", today)
            .limit(1)
            .execute()
        )
        if existing.data and len(existing.data) > 0:
            current = int(existing.data[0].get("images_generated", 0) or 0)
            supabase.table("user_usage_daily").update(
                {"images_generated": current + count}
            ).eq("user_id", user_id).eq("date", today).execute()
        else:
            supabase.table("user_usage_daily").insert({
                "user_id": user_id,
                "date": today,
                "images_generated": count,
            }).execute()
    except Exception:
        pass


def check_can_generate_images(user_id: str, is_admin: bool, count: int = 1) -> None:
    """Raise HTTPException 403 if user would exceed daily limit. Admins are unlimited."""
    if is_admin:
        return
    today_count = get_usage_today(user_id)
    if today_count + count > MAX_IMAGES_PER_USER_PER_DAY:
        raise HTTPException(
            status_code=403,
            detail=f"Daily image limit reached ({MAX_IMAGES_PER_USER_PER_DAY} per day). You have used {today_count} today. Resets at midnight UTC.",
        )
