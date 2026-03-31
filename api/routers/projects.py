import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.rag import get_supabase_client
from core.local_paths import delete_local_project_path, get_local_project_path, set_local_project_path

projects_router = APIRouter()

PROJECT_KEY_PATTERN = re.compile(r"^[a-z0-9_-]+$")


class ProjectCreate(BaseModel):
    project_key: str = Field(min_length=1)
    display_name: str = Field(min_length=1)
    project_path: Optional[str] = None


class ProjectUpdate(BaseModel):
    display_name: str = Field(min_length=1)
    project_path: Optional[str] = None


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


@projects_router.get("/projects")
def list_projects() -> list[dict]:
    try:
        supabase = get_supabase_client()
        result = (
            supabase.table("projects")
            .select("project_key,display_name,created_at,updated_at")
            .order("created_at", desc=False)
            .execute()
        )
        items = result.data or []
        for item in items:
            item["project_path"] = get_local_project_path(item.get("project_key", "")) or ""
        return items
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load projects: {exc}") from exc


@projects_router.post("/projects")
def create_project(body: ProjectCreate) -> dict:
    project_key = validate_project_key(body.project_key)
    display_name = body.display_name.strip()
    project_path = body.project_path.strip() if body.project_path else ""
    if not display_name:
        raise HTTPException(status_code=400, detail="display_name is required.")
    if body.project_path is not None and not project_path:
        raise HTTPException(status_code=400, detail="project_path cannot be empty.")

    try:
        supabase = get_supabase_client()
        existing = (
            supabase.table("projects")
            .select("project_key")
            .eq("project_key", project_key)
            .limit(1)
            .execute()
        )
        if existing.data:
            raise HTTPException(status_code=409, detail="project_key already exists.")

        now = datetime.now(timezone.utc).isoformat()
        payload = {
            "project_key": project_key,
            "display_name": display_name,
            "updated_at": now,
        }
        result = supabase.table("projects").insert(payload).execute()
        if project_path:
            set_local_project_path(project_key, project_path)
        response = result.data[0] if result.data else payload
        response["project_path"] = project_path
        return response
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to create project: {exc}") from exc


@projects_router.put("/projects/{project_key}")
def update_project(project_key: str, body: ProjectUpdate) -> dict:
    cleaned_key = validate_project_key(project_key)
    display_name = body.display_name.strip()
    project_path = body.project_path.strip() if body.project_path else ""
    if not display_name:
        raise HTTPException(status_code=400, detail="display_name is required.")
    if body.project_path is not None and not project_path:
        raise HTTPException(status_code=400, detail="project_path cannot be empty.")

    try:
        supabase = get_supabase_client()
        now = datetime.now(timezone.utc).isoformat()
        payload = {"display_name": display_name, "updated_at": now}
        result = (
            supabase.table("projects")
            .update(payload)
            .eq("project_key", cleaned_key)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="project not found.")
        if project_path:
            set_local_project_path(cleaned_key, project_path)
        response = result.data[0]
        response["project_path"] = project_path or get_local_project_path(cleaned_key) or ""
        return response
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to update project: {exc}") from exc


def _game_data_paths(project_key: str) -> tuple[Path, Path, Path]:
    """Project root and standard JSON paths under Assets/StreamingAssets."""
    cleaned = validate_project_key(project_key)
    root_raw = get_local_project_path(cleaned)
    if not root_raw:
        raise HTTPException(
            status_code=400,
            detail="Local project path is not set for this project. Set it in Admin → Projects.",
        )
    root = Path(root_raw).resolve()
    cities_json = root / "Assets" / "StreamingAssets" / "Travel" / "cities.json"
    gift_catalog_json = root / "Assets" / "StreamingAssets" / "Gifts" / "gifts_catalog.json"
    return root, cities_json, gift_catalog_json


@projects_router.get("/projects/{project_key}/game-data-paths")
def game_data_paths(project_key: str) -> dict:
    """Resolved absolute paths for Travel/cities.json and Gifts/gifts_catalog.json."""
    root, cities_json, gift_catalog_json = _game_data_paths(project_key)
    return {
        "project_root": str(root),
        "cities_json": str(cities_json),
        "gift_catalog_json": str(gift_catalog_json),
        "gifts_base_dir": str(gift_catalog_json.parent),
        "cities_json_exists": cities_json.is_file(),
        "gift_catalog_json_exists": gift_catalog_json.is_file(),
    }


@projects_router.get("/projects/{project_key}/game-data-file/{kind}")
def read_game_data_file(project_key: str, kind: Literal["gift_catalog", "cities"]) -> Any:
    """Read and return parsed JSON from the standard game data file."""
    _root, cities_json, gift_catalog_json = _game_data_paths(project_key)
    path = gift_catalog_json if kind == "gift_catalog" else cities_json
    if not path.is_file():
        raise HTTPException(status_code=404, detail=f"File not found: {path}")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {exc}") from exc


@projects_router.delete("/projects/{project_key}")
def delete_project(project_key: str) -> dict:
    cleaned_key = validate_project_key(project_key)
    try:
        supabase = get_supabase_client()
        sources = (
            supabase.table("sources")
            .select("id")
            .eq("project_key", cleaned_key)
            .limit(1)
            .execute()
        )
        if sources.data:
            raise HTTPException(status_code=409, detail="project has sources")

        result = (
            supabase.table("projects")
            .delete()
            .eq("project_key", cleaned_key)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="project not found.")
        delete_local_project_path(cleaned_key)
        return {"deleted": True, "project_key": cleaned_key}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to delete project: {exc}") from exc
