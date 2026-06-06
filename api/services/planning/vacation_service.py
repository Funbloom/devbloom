from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from services.core.rag import get_supabase_client
from services.planning.employee_service import list_employees
from services.planning.us_federal_holidays import us_federal_holidays_in_range
from services.planning.vacation_notify import notify_vacation_change

VACATION_STATUSES = frozenset({"vacation", "away_working"})
VACATION_MONTHS_DEFAULT = 24


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_date(value: str, field: str) -> date:
    cleaned = (value or "").strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail=f"{field} is required.")
    try:
        return date.fromisoformat(cleaned)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"{field} must be YYYY-MM-DD.") from exc


def default_vacation_range(today: Optional[date] = None) -> tuple[date, date]:
    ref = today or date.today()
    from_date = date(ref.year, ref.month, 1)
    month_cursor = from_date.month
    year_cursor = from_date.year
    for _ in range(VACATION_MONTHS_DEFAULT):
        month_cursor += 1
        if month_cursor > 12:
            month_cursor = 1
            year_cursor += 1
    last_day = monthrange(year_cursor, month_cursor)[1]
    to_date = date(year_cursor, month_cursor, last_day)
    return from_date, to_date


def _validate_status(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip().lower()
    if cleaned not in VACATION_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"status must be one of: vacation, away_working, or null to clear.",
        )
    return cleaned


def _row_to_entry(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(row.get("id") or ""),
        "employee_id": str(row.get("employee_id") or ""),
        "day_date": str(row.get("day_date") or ""),
        "status": str(row.get("status") or ""),
    }


def get_vacation_grid(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
) -> Dict[str, Any]:
    if from_date and to_date:
        start = _parse_date(from_date, "from")
        end = _parse_date(to_date, "to")
    elif from_date:
        start = _parse_date(from_date, "from")
        _, end = default_vacation_range(start)
    elif to_date:
        end = _parse_date(to_date, "to")
        start = date(end.year, end.month, 1)
        for _ in range(VACATION_MONTHS_DEFAULT - 1):
            if start.month == 1:
                start = date(start.year - 1, 12, 1)
            else:
                start = date(start.year, start.month - 1, 1)
    else:
        start, end = default_vacation_range()
    if end < start:
        raise HTTPException(status_code=400, detail="to must be on or after from.")

    employees = list_employees()
    supabase = get_supabase_client()
    result = (
        supabase.table("planning_vacation_days")
        .select("*")
        .gte("day_date", start.isoformat())
        .lte("day_date", end.isoformat())
        .execute()
    )
    entries = [_row_to_entry(row) for row in (result.data or [])]
    holidays = us_federal_holidays_in_range(start, end)
    return {
        "employees": employees,
        "entries": entries,
        "holidays": holidays,
        "range": {"from": start.isoformat(), "to": end.isoformat()},
    }


def _action_label(old_status: Optional[str], new_status: Optional[str]) -> str:
    if new_status == "vacation":
        return "Vacation requested"
    if new_status == "away_working":
        return "Working away set"
    if old_status == "vacation":
        return "Vacation cancelled"
    if old_status == "away_working":
        return "Working away cancelled"
    return "Vacation update"


def update_vacation_cells(
    employee_id: str,
    dates: List[str],
    status: Optional[str],
    actor_email: str = "",
) -> Dict[str, Any]:
    eid = (employee_id or "").strip()
    if not eid:
        raise HTTPException(status_code=400, detail="employee_id is required.")
    if not dates:
        raise HTTPException(status_code=400, detail="dates must not be empty.")
    new_status = _validate_status(status)
    parsed_dates: List[str] = []
    for raw in dates:
        parsed_dates.append(_parse_date(raw, "dates").isoformat())
    parsed_dates = sorted(set(parsed_dates))

    supabase = get_supabase_client()
    employee_result = (
        supabase.table("planning_employees")
        .select("id, name, start_date")
        .eq("id", eid)
        .limit(1)
        .execute()
    )
    if not employee_result.data:
        raise HTTPException(status_code=404, detail="Employee not found.")
    employee_row = employee_result.data[0]
    employee_name = str(employee_row.get("name") or "")
    emp_start = date.fromisoformat(str(employee_row.get("start_date") or date.today().isoformat()))
    for day_iso in parsed_dates:
        day = date.fromisoformat(day_iso)
        if day < emp_start:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot set vacation before employee start date ({emp_start.isoformat()}).",
            )
        if new_status is not None and day.weekday() >= 5:
            raise HTTPException(
                status_code=400,
                detail="Cannot book vacation or away on weekends.",
            )

    existing_result = (
        supabase.table("planning_vacation_days")
        .select("day_date, status")
        .eq("employee_id", eid)
        .in_("day_date", parsed_dates)
        .execute()
    )
    old_by_date = {
        str(row.get("day_date")): str(row.get("status") or "")
        for row in (existing_result.data or [])
    }

    now = _now_iso()
    updated: List[Dict[str, Any]] = []
    if new_status is None:
        supabase.table("planning_vacation_days").delete().eq("employee_id", eid).in_(
            "day_date", parsed_dates
        ).execute()
    else:
        for day_iso in parsed_dates:
            payload = {
                "employee_id": eid,
                "day_date": day_iso,
                "status": new_status,
                "updated_at": now,
            }
            result = (
                supabase.table("planning_vacation_days")
                .upsert(payload, on_conflict="employee_id,day_date")
                .execute()
            )
            if result.data:
                updated.extend([_row_to_entry(row) for row in result.data])

    old_statuses = {old_by_date.get(d) for d in parsed_dates if old_by_date.get(d)}
    old_status = next(iter(old_statuses)) if len(old_statuses) == 1 else None
    notify_vacation_change(
        actor_email=actor_email,
        employee_name=employee_name,
        action_label=_action_label(old_status, new_status),
        dates=parsed_dates,
    )

    return {
        "employee_id": eid,
        "dates": parsed_dates,
        "status": new_status,
        "updated_entries": updated,
    }
