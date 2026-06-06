from __future__ import annotations

import math
import re
from datetime import date, datetime, timedelta
from typing import List, Optional, Tuple

from services.planning.planning_import_pkg.planning_import_types import (
    ImportedDeliverable,
    ImportedMilestone,
    ImportedPlanningData,
    ImportedPlanningEvent,
    MilestoneRisk,
    MilestoneStatus,
)

STATUS_MAP = {
    "completed": "completed",
    "complete": "completed",
    "ready": "ready",
    "in progress": "in_progress",
    "in_progress": "in_progress",
    "todo": "todo",
    "to do": "todo",
    "not started": "todo",
}

RISK_MAP = {
    "on track": "on_track",
    "on_track": "on_track",
    "caution": "caution",
    "risk": "risk",
}

DATE_FORMATS = (
    "%Y-%m-%d",
    "%m/%d/%Y",
    "%m/%d/%y",
    "%m.%d.%Y",
    "%m.%d.%y",
    "%d/%m/%Y",
    "%d.%m.%Y",
    "%B %d, %Y",
    "%b %d, %Y",
    "%d %B %Y",
    "%d %b %Y",
)

DOT_DATE_PATTERN = re.compile(r"^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$")
OBJECTIVE_GOAL_BOUNDARY_RE = re.compile(
    r"^(.+?)(?=(?:Core loop|Game mode|Main menu|Full Klondike|PC Controls|Start →|USA progression|Luna controls|QR Code|Add replayability|Reward screen complete|The first challenge|Challenges & stats|Undo \+ Hint|Stable polished|Full reward|Luna UX))",
    re.IGNORECASE,
)


def normalize_status(value: Optional[str]) -> Tuple[MilestoneStatus, Optional[str]]:
    cleaned = (value or "").strip().lower()
    if not cleaned:
        return "todo", None
    mapped = STATUS_MAP.get(cleaned)
    if mapped:
        return mapped, None
    return "todo", f"Unknown status '{value}'; defaulted to todo."


def normalize_risk(value: Optional[str]) -> Tuple[MilestoneRisk, Optional[str]]:
    cleaned = (value or "").strip().lower()
    if not cleaned:
        return "on_track", None
    mapped = RISK_MAP.get(cleaned)
    if mapped:
        return mapped, None
    return "on_track", f"Unknown risk '{value}'; defaulted to on_track."


def _parse_dot_separated_date(cleaned: str) -> Optional[date]:
    match = DOT_DATE_PATTERN.match(cleaned)
    if not match:
        return None
    month = int(match.group(1))
    day = int(match.group(2))
    year_raw = int(match.group(3))
    year = year_raw if year_raw >= 100 else 2000 + year_raw
    try:
        return date(year, month, day)
    except ValueError:
        return None


def parse_date_value(value: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    cleaned = (value or "").strip().rstrip(".,;")
    if not cleaned or cleaned.lower() in {
        "<start date>",
        "<delivery date>",
        "<due date>",
        "tbd",
        "n/a",
        "date",
    }:
        return None, None
    for fmt in DATE_FORMATS:
        try:
            parsed = datetime.strptime(cleaned, fmt).date()
            return parsed.isoformat(), None
        except ValueError:
            continue
    dot_parsed = _parse_dot_separated_date(cleaned)
    if dot_parsed:
        return dot_parsed.isoformat(), None
    return None, f"Could not parse date '{value}'."


def infer_missing_start_dates(milestone_raws: List[dict], warnings: List[str]) -> None:
    previous_delivery: Optional[str] = None
    for raw in milestone_raws:
        name = (raw.get("name") or "").strip() or "Unnamed milestone"
        start_raw = (raw.get("start_date") or "").strip()
        delivery_raw = (raw.get("delivery_date") or "").strip()
        start_iso, _ = parse_date_value(start_raw)
        delivery_iso, _ = parse_date_value(delivery_raw)
        if start_iso or not delivery_iso:
            if delivery_iso:
                previous_delivery = delivery_iso
            continue
        if previous_delivery:
            raw["start_date"] = previous_delivery
            warnings.append(
                f"Milestone '{name}': start date missing; inferred from previous milestone delivery ({previous_delivery})."
            )
        else:
            inferred_start = date.fromisoformat(delivery_iso) - timedelta(days=7)
            raw["start_date"] = inferred_start.isoformat()
            warnings.append(
                f"Milestone '{name}': start date missing; inferred as one week before delivery ({inferred_start.isoformat()})."
            )
        previous_delivery = delivery_iso


def compute_duration_weeks(
    start_date: Optional[str],
    delivery_date: Optional[str],
    milestone_name: str,
) -> Tuple[int, List[str]]:
    warnings: List[str] = []
    if not start_date or not delivery_date:
        warnings.append(
            f"Milestone '{milestone_name}': missing start or delivery date; duration defaulted to 1 week."
        )
        return 1, warnings
    start = date.fromisoformat(start_date)
    end = date.fromisoformat(delivery_date)
    if end < start:
        warnings.append(
            f"Milestone '{milestone_name}': delivery date before start date; duration defaulted to 1 week."
        )
        return 1, warnings
    days = (end - start).days
    weeks = max(1, math.ceil(days / 7) if days > 0 else 1)
    return weeks, warnings


def clean_table_objective(objective: str, goals: List[str]) -> str:
    text = (objective or "").strip()
    if not text:
        return ""
    first_line = text.split("\n")[0].strip()
    for goal in goals:
        if goal and goal in first_line:
            first_line = first_line.split(goal)[0].strip()
    boundary = OBJECTIVE_GOAL_BOUNDARY_RE.match(first_line)
    if boundary:
        first_line = boundary.group(1).strip()
    first_line = re.sub(r"\s+", " ", first_line)
    return first_line or text.split("\n")[0].strip()


def split_deliverable_titles(raw: str) -> List[str]:
    cleaned = (raw or "").strip()
    if not cleaned:
        return []
    normalized = re.sub(r"^[●•\-]\s*", "", cleaned)
    parts = re.split(r"[●•]\s*|[\n\r]+", normalized)
    titles: List[str] = []
    for part in parts:
        line = re.sub(r"\s+", " ", part).strip()
        if line and line.lower() not in {"<bullet list of deliverables>", "<links to documents>"}:
            titles.append(line)
    if not titles and cleaned:
        titles.append(cleaned)
    return titles


def weeks_between(start_iso: str, due_iso: str) -> Optional[int]:
    try:
        start = date.fromisoformat(start_iso)
        due = date.fromisoformat(due_iso)
        if due < start:
            return None
        return (due - start).days // 7
    except ValueError:
        return None


def finalize_milestone(raw: dict, warnings: List[str]) -> Optional[ImportedMilestone]:
    name = (raw.get("name") or "").strip()
    if not name or name.lower() == "<milestone name>":
        warnings.append("Skipped milestone with missing name.")
        return None

    status, status_warn = normalize_status(raw.get("status"))
    if status_warn:
        warnings.append(f"Milestone '{name}': {status_warn}")
    risk, risk_warn = normalize_risk(raw.get("risk"))
    if risk_warn:
        warnings.append(f"Milestone '{name}': {risk_warn}")

    start_date, start_warn = parse_date_value(raw.get("start_date"))
    if start_warn:
        warnings.append(f"Milestone '{name}': {start_warn}")
    delivery_date, delivery_warn = parse_date_value(raw.get("delivery_date"))
    if delivery_warn:
        warnings.append(f"Milestone '{name}': {delivery_warn}")

    duration, duration_warnings = compute_duration_weeks(start_date, delivery_date, name)
    warnings.extend(duration_warnings)

    deliverables: List[ImportedDeliverable] = []
    events: List[ImportedPlanningEvent] = []
    goals = [g.strip() for g in (raw.get("goals") or []) if g.strip()]

    for row in raw.get("table_rows") or []:
        objective = clean_table_objective(row.get("objective") or "", goals)
        raw_deliverable = (row.get("deliverable") or "").strip()
        if row.get("tab_row"):
            titles = [raw_deliverable] if raw_deliverable else []
        else:
            titles = split_deliverable_titles(raw_deliverable)
        row_status, row_status_warn = normalize_status(row.get("status"))
        if row_status_warn:
            warnings.append(f"Milestone '{name}': {row_status_warn}")
        row_risk, row_risk_warn = normalize_risk(row.get("risk"))
        if row_risk_warn:
            warnings.append(f"Milestone '{name}': {row_risk_warn}")
        row_owner = ", ".join(
            part.strip()
            for part in (row.get("owner") or "").split(",")
            if part.strip()
        )
        due_date, due_warn = parse_date_value(row.get("due_date"))
        if due_warn:
            warnings.append(f"Milestone '{name}': {due_warn}")

        if not titles and objective:
            titles = [objective]
        for title in titles:
            full_title = title
            if objective and objective.lower() not in title.lower():
                full_title = f"{objective}: {title}"
            deliverables.append(
                ImportedDeliverable(
                    title=full_title,
                    status=row_status,
                    risk=row_risk,
                    owner=row_owner,
                    due_date=due_date,
                )
            )
            if due_date and start_date:
                week_offset = weeks_between(start_date, due_date)
                if week_offset is not None and week_offset < duration:
                    events.append(
                        ImportedPlanningEvent(name=full_title, week_offset=week_offset)
                    )

    return ImportedMilestone(
        name=name,
        start_date=start_date,
        delivery_date=delivery_date,
        duration_weeks=duration,
        status=status,
        risk=risk,
        goals=goals,
        deliverables=deliverables,
        events=events,
    )


def build_import_data(
    project_name: Optional[str],
    milestone_raws: List[dict],
) -> Tuple[ImportedPlanningData, List[str]]:
    warnings: List[str] = []
    milestones: List[ImportedMilestone] = []
    start_dates: List[str] = []

    infer_missing_start_dates(milestone_raws, warnings)

    for raw in milestone_raws:
        milestone = finalize_milestone(raw, warnings)
        if milestone:
            milestones.append(milestone)
            if milestone.start_date:
                start_dates.append(milestone.start_date)

    project_start_date = min(start_dates) if start_dates else None
    cleaned_name = (project_name or "").strip()
    if cleaned_name.lower() == "<game name>":
        cleaned_name = ""

    return (
        ImportedPlanningData(
            project_name=cleaned_name or None,
            project_start_date=project_start_date,
            milestones=milestones,
        ),
        warnings,
    )
