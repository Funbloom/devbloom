from datetime import date

import pytest
from fastapi import HTTPException

from services.planning.planning_service import (
    _validate_event_weeks,
    _validate_milestone_risk,
    _validate_milestone_status,
    compute_event_absolute_week,
    compute_milestone_start_weeks,
    current_plan_week_index,
)


def test_compute_milestone_start_weeks_sequential() -> None:
    milestones = [
        {"id": "a", "order_index": 0, "duration_weeks": 2},
        {"id": "b", "order_index": 1, "duration_weeks": 3},
        {"id": "c", "order_index": 2, "duration_weeks": 1},
    ]
    offsets = compute_milestone_start_weeks(milestones)
    assert offsets == {"a": 0, "b": 2, "c": 5}


def test_compute_event_absolute_week() -> None:
    assert compute_event_absolute_week(4, 2) == 6
    assert compute_event_absolute_week(0, 0) == 0


def test_current_plan_week_index() -> None:
    start = date(2026, 1, 1)
    assert current_plan_week_index(start, date(2026, 1, 1)) == 0
    assert current_plan_week_index(start, date(2026, 1, 14)) == 1
    assert current_plan_week_index(start, date(2025, 12, 31)) is None


def test_validate_milestone_status_rejects_invalid() -> None:
    with pytest.raises(HTTPException) as exc_info:
        _validate_milestone_status("blocked")
    assert exc_info.value.status_code == 400


def test_validate_milestone_risk_accepts_values() -> None:
    assert _validate_milestone_risk("caution") == "caution"


def test_validate_event_weeks_within_duration() -> None:
    milestone = {"duration_weeks": 4}
    assert _validate_event_weeks(milestone, 3) == 3
    with pytest.raises(HTTPException) as exc_info:
        _validate_event_weeks(milestone, 4)
    assert exc_info.value.status_code == 400
