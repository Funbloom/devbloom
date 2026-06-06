from __future__ import annotations

import logging
import os
from typing import List

import requests

logger = logging.getLogger(__name__)


def notify_vacation_change(
    actor_email: str,
    employee_name: str,
    action_label: str,
    dates: List[str],
) -> None:
    """POST to Google Chat webhook if configured; never raises."""
    url = (os.getenv("VACATION_GOOGLE_CHAT_WEBHOOK_URL") or "").strip()
    if not url:
        return
    if not dates:
        return
    sorted_dates = sorted(dates)
    if len(sorted_dates) == 1:
        range_text = sorted_dates[0]
    else:
        range_text = f"{sorted_dates[0]} – {sorted_dates[-1]} ({len(sorted_dates)} days)"
    text = (
        f"*{action_label}*\n"
        f"Employee: {employee_name}\n"
        f"Dates: {range_text}\n"
        f"By: {actor_email or 'unknown'}"
    )
    try:
        response = requests.post(url, json={"text": text}, timeout=10)
        if not response.ok:
            logger.warning(
                "Vacation webhook failed: status=%s body=%s",
                response.status_code,
                response.text[:200],
            )
    except Exception as exc:
        logger.warning("Vacation webhook error: %s", exc)
