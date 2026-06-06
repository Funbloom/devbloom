from datetime import date
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from services.planning.us_federal_holidays import federal_holidays_for_year, us_federal_holidays_in_range
from services.planning.vacation_notify import notify_vacation_change
from services.planning.vacation_service import (
    _validate_status,
    default_vacation_range,
    update_vacation_cells,
)


def test_federal_holidays_for_year_includes_july_fourth() -> None:
    holidays = federal_holidays_for_year(2026)
    iso_dates = {d.isoformat() for d in holidays}
    assert "2026-07-03" in iso_dates or "2026-07-04" in iso_dates


def test_us_federal_holidays_in_range_sorted() -> None:
    result = us_federal_holidays_in_range(date(2026, 1, 1), date(2026, 12, 31))
    assert result == sorted(result)
    assert len(result) >= 10


def test_default_vacation_range_covers_24_months() -> None:
    start, end = default_vacation_range(date(2026, 3, 15))
    assert start == date(2026, 3, 1)
    assert end == date(2028, 3, 31)


def test_validate_status_rejects_invalid() -> None:
    with pytest.raises(HTTPException) as exc_info:
        _validate_status("pto")
    assert exc_info.value.status_code == 400


def test_validate_status_accepts_clear() -> None:
    assert _validate_status(None) is None
    assert _validate_status("vacation") == "vacation"


@patch("services.planning.vacation_service.notify_vacation_change")
@patch("services.planning.vacation_service.get_supabase_client")
def test_update_vacation_cells_rejects_before_start_date(
    mock_get_supabase: MagicMock,
    mock_notify: MagicMock,
) -> None:
    supabase = MagicMock()
    mock_get_supabase.return_value = supabase
    employee_table = MagicMock()
    supabase.table.return_value = employee_table
    employee_table.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[{"id": "e1", "name": "Alain", "start_date": "2026-06-01"}]
    )

    with pytest.raises(HTTPException) as exc_info:
        update_vacation_cells("e1", ["2026-05-15"], "vacation", actor_email="a@b.com")
    assert exc_info.value.status_code == 400
    mock_notify.assert_not_called()


@patch("services.planning.vacation_notify.requests.post")
def test_notify_vacation_change_skips_when_env_unset(mock_post: MagicMock) -> None:
    with patch.dict("os.environ", {}, clear=True):
        notify_vacation_change("a@b.com", "Alain", "Vacation requested", ["2026-07-01"])
    mock_post.assert_not_called()


@patch("services.planning.vacation_notify.requests.post")
def test_notify_vacation_change_posts_when_configured(mock_post: MagicMock) -> None:
    mock_post.return_value = MagicMock(ok=True)
    with patch.dict(
        "os.environ",
        {"VACATION_GOOGLE_CHAT_WEBHOOK_URL": "https://example.com/hook"},
    ):
        notify_vacation_change("a@b.com", "Alain", "Vacation requested", ["2026-07-01", "2026-07-02"])
    mock_post.assert_called_once()
    payload = mock_post.call_args.kwargs["json"]
    assert "Vacation requested" in payload["text"]
    assert "Alain" in payload["text"]
