"""Debug file logging and structured error logging for chat/tools."""

import logging
from datetime import datetime
from typing import Any

from core.app_paths import DEBUG_PROMPTS_PATH

logger = logging.getLogger(__name__)


def log_debug_error(title: str, details: str) -> None:
    try:
        separator = "=" * 80
        timestamp = datetime.now().isoformat()
        DEBUG_PROMPTS_PATH.parent.mkdir(parents=True, exist_ok=True)
        with DEBUG_PROMPTS_PATH.open("a", encoding="utf-8") as handle:
            handle.write("\n".join([separator, f"Timestamp: {timestamp}", title, details]) + "\n")
    except Exception:
        logger.exception("Failed to write debug error log.", extra={"debug_title": title})


def log_unexpected_path(title: str, **details: Any) -> None:
    detail_text = ", ".join(f"{key}={value!r}" for key, value in details.items())
    if detail_text:
        logger.error("%s | %s", title, detail_text)
    else:
        logger.error("%s", title)
