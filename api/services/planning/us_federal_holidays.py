from __future__ import annotations

from datetime import date, timedelta
from typing import List, Set


def _nth_weekday_of_month(year: int, month: int, weekday: int, n: int) -> date:
    """weekday: Monday=0; n=1 first occurrence, n=-1 last occurrence in month."""
    if n > 0:
        d = date(year, month, 1)
        while d.weekday() != weekday:
            d += timedelta(days=1)
        return d + timedelta(weeks=n - 1)
    if month == 12:
        d = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        d = date(year, month + 1, 1) - timedelta(days=1)
    while d.weekday() != weekday:
        d -= timedelta(days=1)
    return d


def _observe_fixed_holiday(d: date) -> date:
    """Saturday -> Friday; Sunday -> Monday."""
    if d.weekday() == 5:
        return d - timedelta(days=1)
    if d.weekday() == 6:
        return d + timedelta(days=1)
    return d


def federal_holidays_for_year(year: int) -> List[date]:
    fixed = [
        _observe_fixed_holiday(date(year, 1, 1)),
        _observe_fixed_holiday(date(year, 6, 19)),
        _observe_fixed_holiday(date(year, 7, 4)),
        _observe_fixed_holiday(date(year, 11, 11)),
        _observe_fixed_holiday(date(year, 12, 25)),
    ]
    floating = [
        _nth_weekday_of_month(year, 1, 0, 3),
        _nth_weekday_of_month(year, 2, 0, 3),
        _nth_weekday_of_month(year, 5, 0, -1),
        _nth_weekday_of_month(year, 9, 0, 1),
        _nth_weekday_of_month(year, 10, 0, 2),
        _nth_weekday_of_month(year, 11, 3, 4),
    ]
    return sorted(set(fixed + floating))


def us_federal_holidays_in_range(from_date: date, to_date: date) -> List[str]:
    """Return ISO date strings for US federal holidays in [from_date, to_date]."""
    if to_date < from_date:
        return []
    years = range(from_date.year, to_date.year + 1)
    seen: Set[date] = set()
    for year in years:
        for holiday in federal_holidays_for_year(year):
            if from_date <= holiday <= to_date:
                seen.add(holiday)
    return [d.isoformat() for d in sorted(seen)]
