from __future__ import annotations

from fastapi import HTTPException

from services.planning.planning_import_pkg.planning_import_extract import extract_text
from services.planning.planning_import_pkg.planning_import_parser import parse_planning_text
from services.planning.planning_import_pkg.planning_import_types import (
    ImportApplyMode,
    ImportParseResult,
    ImportedPlanningData,
)
from services.planning.planning_service import apply_planning_import


def parse_import_file(file_bytes: bytes, filename: str) -> ImportParseResult:
    text = extract_text(file_bytes, filename)
    data, warnings = parse_planning_text(text)
    if not data.milestones:
        raise HTTPException(
            status_code=400,
            detail="No milestones found in file. Check that it follows the Project Status template.",
        )
    return ImportParseResult(data=data, warnings=warnings)


def apply_import(
    project_key: str,
    mode: ImportApplyMode,
    data: ImportedPlanningData,
) -> dict:
    if not data.milestones:
        raise HTTPException(status_code=400, detail="Import data contains no milestones.")
    return apply_planning_import(project_key, mode, data.model_dump())
