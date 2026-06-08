from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from services.core.rag import get_supabase_client


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_date(value: str, field: str) -> str:
    cleaned = (value or "").strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail=f"{field} is required.")
    try:
        date.fromisoformat(cleaned)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"{field} must be YYYY-MM-DD.") from exc
    return cleaned


def _normalize_user_email(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip().lower()
    return cleaned if cleaned else None


def _row_to_employee(row: Dict[str, Any]) -> Dict[str, Any]:
    user_email = _normalize_user_email(str(row.get("user_email") or ""))
    return {
        "id": str(row.get("id") or ""),
        "name": str(row.get("name") or ""),
        "title": str(row.get("title") or ""),
        "start_date": str(row.get("start_date") or ""),
        "user_email": user_email,
        "order_index": int(row.get("order_index") or 0),
        "created_at": str(row.get("created_at") or ""),
        "updated_at": str(row.get("updated_at") or ""),
    }


def find_employee_id_for_user_email(email: str) -> Optional[str]:
    normalized = _normalize_user_email(email)
    if not normalized:
        return None
    supabase = get_supabase_client()
    result = (
        supabase.table("planning_employees")
        .select("id, user_email")
        .execute()
    )
    for row in result.data or []:
        if _normalize_user_email(str(row.get("user_email") or "")) == normalized:
            return str(row.get("id") or "")
    return None


def list_employees() -> List[Dict[str, Any]]:
    supabase = get_supabase_client()
    result = (
        supabase.table("planning_employees")
        .select("*")
        .order("order_index")
        .order("name")
        .execute()
    )
    rows = result.data or []
    return [_row_to_employee(row) for row in rows]


def create_employee(
    name: str,
    title: str,
    start_date: str,
    user_email: Optional[str] = None,
) -> Dict[str, Any]:
    cleaned_name = (name or "").strip()
    if not cleaned_name:
        raise HTTPException(status_code=400, detail="name is required.")
    parsed_start = _parse_date(start_date, "start_date")
    supabase = get_supabase_client()
    max_result = (
        supabase.table("planning_employees")
        .select("order_index")
        .order("order_index", desc=True)
        .limit(1)
        .execute()
    )
    next_index = 0
    if max_result.data:
        next_index = int(max_result.data[0].get("order_index") or 0) + 1
    now = _now_iso()
    normalized_email = _normalize_user_email(user_email)
    payload = {
        "name": cleaned_name,
        "title": (title or "").strip(),
        "start_date": parsed_start,
        "user_email": normalized_email,
        "order_index": next_index,
        "created_at": now,
        "updated_at": now,
    }
    result = supabase.table("planning_employees").insert(payload).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create employee.")
    return _row_to_employee(result.data[0])


def update_employee(
    employee_id: str,
    name: Optional[str] = None,
    title: Optional[str] = None,
    start_date: Optional[str] = None,
    user_email: Optional[str] = None,
) -> Dict[str, Any]:
    eid = (employee_id or "").strip()
    if not eid:
        raise HTTPException(status_code=400, detail="employee_id is required.")
    patch: Dict[str, Any] = {"updated_at": _now_iso()}
    if name is not None:
        cleaned = name.strip()
        if not cleaned:
            raise HTTPException(status_code=400, detail="name cannot be empty.")
        patch["name"] = cleaned
    if title is not None:
        patch["title"] = title.strip()
    if start_date is not None:
        patch["start_date"] = _parse_date(start_date, "start_date")
    if user_email is not None:
        patch["user_email"] = _normalize_user_email(user_email)
    if len(patch) == 1:
        raise HTTPException(status_code=400, detail="No fields to update.")
    supabase = get_supabase_client()
    result = (
        supabase.table("planning_employees")
        .update(patch)
        .eq("id", eid)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Employee not found.")
    return _row_to_employee(result.data[0])


def delete_employee(employee_id: str) -> Dict[str, str]:
    eid = (employee_id or "").strip()
    if not eid:
        raise HTTPException(status_code=400, detail="employee_id is required.")
    supabase = get_supabase_client()
    existing = (
        supabase.table("planning_employees")
        .select("id")
        .eq("id", eid)
        .limit(1)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Employee not found.")
    supabase.table("planning_employees").delete().eq("id", eid).execute()
    return {"status": "deleted", "id": eid}
