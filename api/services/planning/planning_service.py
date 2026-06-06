from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from services.core.rag import get_supabase_client

MILESTONE_STATUSES = frozenset({"todo", "in_progress", "ready", "completed"})
MILESTONE_RISKS = frozenset({"on_track", "caution", "risk"})
DELIVERABLE_STATUSES = MILESTONE_STATUSES
PLANNING_WEEKS_MAX = 104


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _validate_milestone_status(value: str) -> str:
    cleaned = (value or "").strip().lower()
    if cleaned not in MILESTONE_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"status must be one of: {', '.join(sorted(MILESTONE_STATUSES))}.",
        )
    return cleaned


def _validate_milestone_risk(value: str) -> str:
    cleaned = (value or "").strip().lower()
    if cleaned not in MILESTONE_RISKS:
        raise HTTPException(
            status_code=400,
            detail=f"risk must be one of: {', '.join(sorted(MILESTONE_RISKS))}.",
        )
    return cleaned


def _validate_deliverable_status(value: str) -> str:
    return _validate_milestone_status(value)


def _normalize_owners(value: str) -> str:
    parts = [part.strip() for part in (value or "").split(",") if part.strip()]
    return ", ".join(parts)


def compute_milestone_start_weeks(milestones: List[Dict[str, Any]]) -> Dict[str, int]:
    """Sequential start week offset per milestone id (sorted by order_index)."""
    ordered = sorted(milestones, key=lambda m: int(m.get("order_index") or 0))
    offsets: Dict[str, int] = {}
    cursor = 0
    for row in ordered:
        mid = str(row.get("id") or "")
        if not mid:
            continue
        offsets[mid] = cursor
        cursor += int(row.get("duration_weeks") or 0)
    return offsets


def compute_event_absolute_week(
    milestone_start_week: int,
    weeks_after_milestone_start: int,
) -> int:
    return milestone_start_week + max(0, int(weeks_after_milestone_start))


def current_plan_week_index(start_date: date, today: Optional[date] = None) -> Optional[int]:
    """Week index from plan start (0-based), or None if before start."""
    ref = today or date.today()
    if ref < start_date:
        return None
    delta_days = (ref - start_date).days
    return delta_days // 7


def _ensure_project_exists(supabase: Any, project_key: str) -> None:
    key = (project_key or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="project_key is required.")
    result = (
        supabase.table("projects")
        .select("project_key")
        .eq("project_key", key)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail=f"Project not found: {key}")


def _get_plan_row(supabase: Any, project_key: str) -> Optional[Dict[str, Any]]:
    result = (
        supabase.table("project_plans")
        .select("id,project_key,start_date,created_at,updated_at")
        .eq("project_key", project_key)
        .limit(1)
        .execute()
    )
    if not result.data:
        return None
    return result.data[0]


def get_plan_by_project_key(project_key: str) -> Dict[str, Any]:
    key = (project_key or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="project_key is required.")
    try:
        supabase = get_supabase_client()
        _ensure_project_exists(supabase, key)
        plan = _get_plan_row(supabase, key)
        if not plan:
            return {
                "plan": None,
                "milestones": [],
                "deliverables": [],
                "events": [],
            }

        plan_id = plan["id"]
        ms_result = (
            supabase.table("planning_milestones")
            .select(
                "id,project_plan_id,name,duration_weeks,status,risk,goals,order_index,created_at,updated_at"
            )
            .eq("project_plan_id", plan_id)
            .order("order_index", desc=False)
            .execute()
        )
        milestones = ms_result.data or []
        milestone_ids = [m["id"] for m in milestones]

        deliverables: List[Dict[str, Any]] = []
        events: List[Dict[str, Any]] = []
        if milestone_ids:
            del_result = (
                supabase.table("planning_deliverables")
                .select("id,milestone_id,title,status,risk,owner,due_date,order_index,created_at,updated_at")
                .in_("milestone_id", milestone_ids)
                .order("order_index", desc=False)
                .execute()
            )
            deliverables = del_result.data or []
            ev_result = (
                supabase.table("planning_events")
                .select(
                    "id,milestone_id,name,weeks_after_milestone_start,order_index,created_at,updated_at"
                )
                .in_("milestone_id", milestone_ids)
                .order("order_index", desc=False)
                .execute()
            )
            events = ev_result.data or []

        return {
            "plan": plan,
            "milestones": milestones,
            "deliverables": deliverables,
            "events": events,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load plan: {exc}") from exc


def upsert_plan_start_date(project_key: str, start_date: str) -> Dict[str, Any]:
    key = (project_key or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="project_key is required.")
    try:
        parsed = date.fromisoformat((start_date or "").strip())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="start_date must be YYYY-MM-DD.") from exc

    try:
        supabase = get_supabase_client()
        _ensure_project_exists(supabase, key)
        now = _now_iso()
        existing = _get_plan_row(supabase, key)
        if existing:
            result = (
                supabase.table("project_plans")
                .update({"start_date": parsed.isoformat(), "updated_at": now})
                .eq("id", existing["id"])
                .execute()
            )
            return (result.data or [existing])[0]

        payload = {
            "project_key": key,
            "start_date": parsed.isoformat(),
            "created_at": now,
            "updated_at": now,
        }
        result = supabase.table("project_plans").insert(payload).execute()
        return (result.data or [payload])[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to save plan: {exc}") from exc


def _ensure_plan_for_project(supabase: Any, project_key: str) -> Dict[str, Any]:
    plan = _get_plan_row(supabase, project_key)
    if plan:
        return plan
    now = _now_iso()
    payload = {
        "project_key": project_key,
        "start_date": date.today().isoformat(),
        "created_at": now,
        "updated_at": now,
    }
    result = supabase.table("project_plans").insert(payload).execute()
    return (result.data or [payload])[0]


def _get_milestone(supabase: Any, milestone_id: str) -> Dict[str, Any]:
    mid = (milestone_id or "").strip()
    if not mid:
        raise HTTPException(status_code=400, detail="milestone_id is required.")
    result = (
        supabase.table("planning_milestones")
        .select("id,project_plan_id,name,duration_weeks,status,risk,order_index")
        .eq("id", mid)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Milestone not found.")
    return result.data[0]


def _next_order_index(supabase: Any, table: str, foreign_key: str, foreign_id: str) -> int:
    result = (
        supabase.table(table)
        .select("order_index")
        .eq(foreign_key, foreign_id)
        .order("order_index", desc=True)
        .limit(1)
        .execute()
    )
    if not result.data:
        return 0
    return int(result.data[0].get("order_index") or 0) + 1


def create_milestone(
    project_key: str,
    name: str,
    duration_weeks: int = 1,
    status: str = "todo",
    risk: str = "on_track",
    goals: Optional[List[str]] = None,
) -> Dict[str, Any]:
    key = (project_key or "").strip()
    cleaned_name = (name or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="project_key is required.")
    if not cleaned_name:
        raise HTTPException(status_code=400, detail="name is required.")
    if duration_weeks < 1:
        raise HTTPException(status_code=400, detail="duration_weeks must be at least 1.")
    status_val = _validate_milestone_status(status)
    risk_val = _validate_milestone_risk(risk)

    try:
        supabase = get_supabase_client()
        _ensure_project_exists(supabase, key)
        plan = _ensure_plan_for_project(supabase, key)
        order_index = _next_order_index(supabase, "planning_milestones", "project_plan_id", plan["id"])
        now = _now_iso()
        payload = {
            "project_plan_id": plan["id"],
            "name": cleaned_name,
            "duration_weeks": duration_weeks,
            "status": status_val,
            "risk": risk_val,
            "goals": goals or [],
            "order_index": order_index,
            "created_at": now,
            "updated_at": now,
        }
        result = supabase.table("planning_milestones").insert(payload).execute()
        return (result.data or [payload])[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to create milestone: {exc}") from exc


def update_milestone(
    milestone_id: str,
    name: Optional[str] = None,
    duration_weeks: Optional[int] = None,
    status: Optional[str] = None,
    risk: Optional[str] = None,
    goals: Optional[List[str]] = None,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {}
    if name is not None:
        cleaned = name.strip()
        if not cleaned:
            raise HTTPException(status_code=400, detail="name cannot be empty.")
        payload["name"] = cleaned
    if duration_weeks is not None:
        if duration_weeks < 1:
            raise HTTPException(status_code=400, detail="duration_weeks must be at least 1.")
        payload["duration_weeks"] = duration_weeks
    if status is not None:
        payload["status"] = _validate_milestone_status(status)
    if risk is not None:
        payload["risk"] = _validate_milestone_risk(risk)
    if goals is not None:
        payload["goals"] = goals
    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update.")

    payload["updated_at"] = _now_iso()
    try:
        supabase = get_supabase_client()
        _get_milestone(supabase, milestone_id)
        result = (
            supabase.table("planning_milestones")
            .update(payload)
            .eq("id", milestone_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Milestone not found.")
        return result.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to update milestone: {exc}") from exc


def delete_all_milestones_for_project(project_key: str) -> None:
    key = (project_key or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="project_key is required.")
    supabase = get_supabase_client()
    plan = _get_plan_row(supabase, key)
    if not plan:
        return
    supabase.table("planning_milestones").delete().eq("project_plan_id", plan["id"]).execute()


def clear_project_planning(project_key: str) -> Dict[str, Any]:
    key = (project_key or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="project_key is required.")
    supabase = get_supabase_client()
    plan = _get_plan_row(supabase, key)
    if not plan:
        return {"ok": True, "deleted_milestones": 0}
    plan_id = str(plan["id"])
    milestone_rows = (
        supabase.table("planning_milestones")
        .select("id")
        .eq("project_plan_id", plan_id)
        .execute()
    )
    milestone_count = len(milestone_rows.data or [])
    supabase.table("planning_milestones").delete().eq("project_plan_id", plan_id).execute()
    supabase.table("project_plans").delete().eq("id", plan_id).execute()
    return {"ok": True, "deleted_milestones": milestone_count}


def delete_milestone(milestone_id: str) -> Dict[str, Any]:
    try:
        supabase = get_supabase_client()
        row = _get_milestone(supabase, milestone_id)
        plan_id = row["project_plan_id"]
        supabase.table("planning_milestones").delete().eq("id", milestone_id).execute()
        remaining = (
            supabase.table("planning_milestones")
            .select("id")
            .eq("project_plan_id", plan_id)
            .order("order_index", desc=False)
            .execute()
        )
        for idx, item in enumerate(remaining.data or []):
            supabase.table("planning_milestones").update(
                {"order_index": idx, "updated_at": _now_iso()}
            ).eq("id", item["id"]).execute()
        return {"ok": True, "id": milestone_id}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to delete milestone: {exc}") from exc


def reorder_milestones(project_key: str, milestone_ids: List[str]) -> List[Dict[str, Any]]:
    key = (project_key or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="project_key is required.")
    if not milestone_ids:
        raise HTTPException(status_code=400, detail="milestone_ids is required.")

    try:
        supabase = get_supabase_client()
        plan = _get_plan_row(supabase, key)
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found.")
        plan_id = plan["id"]
        existing = (
            supabase.table("planning_milestones")
            .select("id")
            .eq("project_plan_id", plan_id)
            .execute()
        )
        existing_ids = {str(r["id"]) for r in (existing.data or [])}
        if len(milestone_ids) != len(existing_ids):
            raise HTTPException(status_code=400, detail="milestone_ids must include all milestones.")
        if set(milestone_ids) != existing_ids:
            raise HTTPException(status_code=400, detail="milestone_ids mismatch.")

        now = _now_iso()
        for idx, mid in enumerate(milestone_ids):
            supabase.table("planning_milestones").update(
                {"order_index": idx, "updated_at": now}
            ).eq("id", mid).execute()

        result = (
            supabase.table("planning_milestones")
            .select(
                "id,project_plan_id,name,duration_weeks,status,risk,order_index,created_at,updated_at"
            )
            .eq("project_plan_id", plan_id)
            .order("order_index", desc=False)
            .execute()
        )
        return result.data or []
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to reorder milestones: {exc}") from exc


def create_deliverable(
    milestone_id: str,
    title: str,
    status: str = "todo",
    owner: str = "",
    due_date: Optional[str] = None,
    risk: str = "on_track",
) -> Dict[str, Any]:
    cleaned = (title or "").strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="title is required.")
    status_val = _validate_deliverable_status(status)
    risk_val = _validate_milestone_risk(risk)

    try:
        supabase = get_supabase_client()
        _get_milestone(supabase, milestone_id)
        order_index = _next_order_index(supabase, "planning_deliverables", "milestone_id", milestone_id)
        now = _now_iso()
        parsed_due: Optional[str] = None
        if due_date:
            try:
                parsed_due = date.fromisoformat(due_date.strip()).isoformat()
            except ValueError as exc:
                raise HTTPException(status_code=400, detail="due_date must be YYYY-MM-DD.") from exc
        payload = {
            "milestone_id": milestone_id,
            "title": cleaned,
            "status": status_val,
            "risk": risk_val,
            "owner": _normalize_owners(owner or ""),
            "due_date": parsed_due,
            "order_index": order_index,
            "created_at": now,
            "updated_at": now,
        }
        result = supabase.table("planning_deliverables").insert(payload).execute()
        return (result.data or [payload])[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to create deliverable: {exc}") from exc


def update_deliverable(
    deliverable_id: str,
    title: Optional[str] = None,
    status: Optional[str] = None,
    owner: Optional[str] = None,
    due_date: Optional[str] = None,
    risk: Optional[str] = None,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {}
    if title is not None:
        cleaned = title.strip()
        if not cleaned:
            raise HTTPException(status_code=400, detail="title cannot be empty.")
        payload["title"] = cleaned
    if status is not None:
        payload["status"] = _validate_deliverable_status(status)
    if owner is not None:
        payload["owner"] = _normalize_owners(owner)
    if risk is not None:
        payload["risk"] = _validate_milestone_risk(risk)
    if due_date is not None:
        if due_date == "":
            payload["due_date"] = None
        else:
            try:
                payload["due_date"] = date.fromisoformat(due_date.strip()).isoformat()
            except ValueError as exc:
                raise HTTPException(status_code=400, detail="due_date must be YYYY-MM-DD.") from exc
    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update.")
    payload["updated_at"] = _now_iso()

    try:
        supabase = get_supabase_client()
        result = (
            supabase.table("planning_deliverables")
            .update(payload)
            .eq("id", deliverable_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Deliverable not found.")
        return result.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to update deliverable: {exc}") from exc


def apply_planning_import(project_key: str, mode: str, data: Dict[str, Any]) -> Dict[str, Any]:
    key = (project_key or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="project_key is required.")
    if mode not in {"append", "replace"}:
        raise HTTPException(status_code=400, detail="mode must be append or replace.")

    milestones = data.get("milestones") or []
    if not milestones:
        raise HTTPException(status_code=400, detail="No milestones to import.")

    if mode == "replace":
        delete_all_milestones_for_project(key)

    project_start = (data.get("project_start_date") or "").strip()
    if project_start:
        upsert_plan_start_date(key, project_start)

    for milestone in milestones:
        created = create_milestone(
            key,
            milestone.get("name") or "",
            duration_weeks=int(milestone.get("duration_weeks") or 1),
            status=milestone.get("status") or "todo",
            risk=milestone.get("risk") or "on_track",
            goals=milestone.get("goals") or [],
        )
        milestone_id = str(created.get("id") or "")
        for deliverable in milestone.get("deliverables") or []:
            create_deliverable(
                milestone_id,
                deliverable.get("title") or "",
                status=deliverable.get("status") or "todo",
                owner=deliverable.get("owner") or "",
                due_date=deliverable.get("due_date"),
                risk=deliverable.get("risk") or "on_track",
            )
        for event in milestone.get("events") or []:
            create_event(
                milestone_id,
                event.get("name") or "",
                weeks_after_milestone_start=int(event.get("week_offset") or 0),
            )

    return get_plan_by_project_key(key)


def delete_deliverable(deliverable_id: str) -> Dict[str, Any]:
    try:
        supabase = get_supabase_client()
        row = (
            supabase.table("planning_deliverables")
            .select("id,milestone_id")
            .eq("id", deliverable_id)
            .limit(1)
            .execute()
        )
        if not row.data:
            raise HTTPException(status_code=404, detail="Deliverable not found.")
        milestone_id = row.data[0]["milestone_id"]
        supabase.table("planning_deliverables").delete().eq("id", deliverable_id).execute()
        remaining = (
            supabase.table("planning_deliverables")
            .select("id")
            .eq("milestone_id", milestone_id)
            .order("order_index", desc=False)
            .execute()
        )
        now = _now_iso()
        for idx, item in enumerate(remaining.data or []):
            supabase.table("planning_deliverables").update(
                {"order_index": idx, "updated_at": now}
            ).eq("id", item["id"]).execute()
        return {"ok": True, "id": deliverable_id}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to delete deliverable: {exc}") from exc


def _validate_event_weeks(milestone: Dict[str, Any], weeks_after: int) -> int:
    if weeks_after < 0:
        raise HTTPException(status_code=400, detail="weeks_after_milestone_start must be >= 0.")
    duration = int(milestone.get("duration_weeks") or 0)
    if weeks_after >= duration:
        raise HTTPException(
            status_code=400,
            detail=f"weeks_after_milestone_start must be less than milestone duration ({duration} weeks).",
        )
    return weeks_after


def create_event(
    milestone_id: str,
    name: str,
    weeks_after_milestone_start: int = 0,
) -> Dict[str, Any]:
    cleaned = (name or "").strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="name is required.")

    try:
        supabase = get_supabase_client()
        milestone = _get_milestone(supabase, milestone_id)
        weeks_val = _validate_event_weeks(milestone, int(weeks_after_milestone_start))
        order_index = _next_order_index(supabase, "planning_events", "milestone_id", milestone_id)
        now = _now_iso()
        payload = {
            "milestone_id": milestone_id,
            "name": cleaned,
            "weeks_after_milestone_start": weeks_val,
            "order_index": order_index,
            "created_at": now,
            "updated_at": now,
        }
        result = supabase.table("planning_events").insert(payload).execute()
        return (result.data or [payload])[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to create event: {exc}") from exc


def update_event(
    event_id: str,
    name: Optional[str] = None,
    weeks_after_milestone_start: Optional[int] = None,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {}
    if name is not None:
        cleaned = name.strip()
        if not cleaned:
            raise HTTPException(status_code=400, detail="name cannot be empty.")
        payload["name"] = cleaned

    try:
        supabase = get_supabase_client()
        existing = (
            supabase.table("planning_events")
            .select("id,milestone_id,weeks_after_milestone_start")
            .eq("id", event_id)
            .limit(1)
            .execute()
        )
        if not existing.data:
            raise HTTPException(status_code=404, detail="Event not found.")
        row = existing.data[0]
        if weeks_after_milestone_start is not None:
            milestone = _get_milestone(supabase, row["milestone_id"])
            payload["weeks_after_milestone_start"] = _validate_event_weeks(
                milestone, int(weeks_after_milestone_start)
            )
        if not payload:
            raise HTTPException(status_code=400, detail="No fields to update.")
        payload["updated_at"] = _now_iso()
        result = (
            supabase.table("planning_events")
            .update(payload)
            .eq("id", event_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Event not found.")
        return result.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to update event: {exc}") from exc


def delete_event(event_id: str) -> Dict[str, Any]:
    try:
        supabase = get_supabase_client()
        row = (
            supabase.table("planning_events")
            .select("id,milestone_id")
            .eq("id", event_id)
            .limit(1)
            .execute()
        )
        if not row.data:
            raise HTTPException(status_code=404, detail="Event not found.")
        milestone_id = row.data[0]["milestone_id"]
        supabase.table("planning_events").delete().eq("id", event_id).execute()
        remaining = (
            supabase.table("planning_events")
            .select("id")
            .eq("milestone_id", milestone_id)
            .order("order_index", desc=False)
            .execute()
        )
        now = _now_iso()
        for idx, item in enumerate(remaining.data or []):
            supabase.table("planning_events").update(
                {"order_index": idx, "updated_at": now}
            ).eq("id", item["id"]).execute()
        return {"ok": True, "id": event_id}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to delete event: {exc}") from exc
