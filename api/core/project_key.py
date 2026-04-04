"""Project key validation (stdlib + FastAPI only; safe for lightweight unit tests)."""

import re

from fastapi import HTTPException

PROJECT_KEY_PATTERN = re.compile(r"^[a-z0-9_-]+$")


def validate_project_key(project_key: str) -> str:
    cleaned = project_key.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="project_key is required.")
    if not PROJECT_KEY_PATTERN.match(cleaned):
        raise HTTPException(
            status_code=400,
            detail="project_key must be lowercase letters, numbers, dashes, or underscores.",
        )
    return cleaned
