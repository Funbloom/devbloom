from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Optional

from fastapi import HTTPException
from openai import OpenAI

from services.audio.audiobank_analyze import analyze_audio_clip, sanitize_tags
from services.audio.audiobank_storage import (
    delete_audio_from_supabase,
    download_audio_from_supabase,
    move_audio_in_supabase,
    sanitize_filename,
    sanitize_storage_segment,
    upload_audio_to_supabase,
)
from services.core.rag import get_supabase_client

MAX_IMPORT_BYTES = 20 * 1024 * 1024
ALLOWED_EXTENSIONS = {".wav", ".mp3"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _content_type_for_filename(filename: str) -> str:
    lower = (filename or "").lower()
    if lower.endswith(".mp3"):
        return "audio/mpeg"
    return "audio/wav"


def _extension_for_filename(filename: str) -> str:
    lower = (filename or "").lower()
    if lower.endswith(".mp3"):
        return ".mp3"
    if lower.endswith(".wav"):
        return ".wav"
    return ""


def validate_audio_upload(filename: str, data: bytes) -> None:
    if not data:
        raise HTTPException(status_code=400, detail="Empty audio file.")
    if len(data) > MAX_IMPORT_BYTES:
        raise HTTPException(status_code=400, detail="Audio file exceeds 20 MB limit.")
    ext = _extension_for_filename(filename)
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only .wav and .mp3 files are supported.")


def _clip_from_row(row: dict[str, Any]) -> dict[str, Any]:
    tags = row.get("tags")
    if not isinstance(tags, list):
        tags = []
    return {
        "id": row.get("id"),
        "filename": row.get("filename"),
        "storage_path": row.get("storage_path"),
        "public_url": row.get("public_url"),
        "category": row.get("category") or "uncategorized",
        "tags": [str(t) for t in tags],
        "content_type": row.get("content_type"),
        "file_size_bytes": row.get("file_size_bytes"),
        "duration_ms": row.get("duration_ms"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def _find_clip_by_filename(filename: str) -> Optional[dict[str, Any]]:
    safe_name = sanitize_filename(filename)
    if not safe_name:
        return None
    supabase = get_supabase_client()
    exact = (
        supabase.table("audiobank_clips")
        .select("*")
        .eq("filename", safe_name)
        .limit(1)
        .execute()
    )
    if exact.data:
        return exact.data[0]
    ilike = (
        supabase.table("audiobank_clips")
        .select("*")
        .ilike("filename", safe_name)
        .limit(1)
        .execute()
    )
    rows = ilike.data or []
    return rows[0] if rows else None


def _storage_path_for_category(category: str, filename: str) -> str:
    safe_name = sanitize_filename(filename)
    return f"{category}/{safe_name}"


def _unique_storage_path(category: str, filename: str) -> str:
    safe_name = sanitize_filename(filename)
    base_path = f"{category}/{safe_name}"
    supabase = get_supabase_client()
    existing = (
        supabase.table("audiobank_clips")
        .select("id")
        .eq("storage_path", base_path)
        .limit(1)
        .execute()
    )
    if not existing.data:
        return base_path
    stem, dot, ext = safe_name.partition(".")
    suffix = uuid.uuid4().hex[:8]
    unique_name = f"{stem}_{suffix}{dot}{ext}" if dot else f"{safe_name}_{suffix}"
    return f"{category}/{unique_name}"


def list_categories() -> list[dict[str, Any]]:
    supabase = get_supabase_client()
    result = supabase.table("audiobank_clips").select("category").execute()
    counts: dict[str, int] = {}
    for row in result.data or []:
        category = sanitize_storage_segment(str(row.get("category") or "uncategorized"))
        counts[category] = counts.get(category, 0) + 1
    return [{"category": key, "clip_count": counts[key]} for key in sorted(counts.keys())]


def list_clips(category: Optional[str] = None, query: Optional[str] = None) -> list[dict[str, Any]]:
    supabase = get_supabase_client()
    request = supabase.table("audiobank_clips").select("*").order("created_at", desc=True)
    if category:
        cat = sanitize_storage_segment(category)
        request = request.eq("category", cat)
    result = request.execute()
    rows = result.data or []
    q = (query or "").strip().lower()
    clips = [_clip_from_row(row) for row in rows]
    if not q:
        return clips
    filtered: list[dict[str, Any]] = []
    for clip in clips:
        filename = str(clip.get("filename") or "").lower()
        tags = [str(t).lower() for t in clip.get("tags") or []]
        if q in filename or any(q in tag for tag in tags):
            filtered.append(clip)
    return filtered


def import_audio_clip(
    filename: str,
    data: bytes,
    *,
    category_override: Optional[str] = None,
    overwrite: bool = False,
    client_factory: Callable[[], OpenAI] | None = None,
) -> dict[str, Any]:
    validate_audio_upload(filename, data)
    safe_name = sanitize_filename(filename)
    content_type = _content_type_for_filename(filename)

    existing = _find_clip_by_filename(safe_name)
    if existing and not overwrite:
        raise HTTPException(
            status_code=409,
            detail=f"Clip already exists in Audiobank: {existing.get('filename') or safe_name}",
        )
    if existing and overwrite:
        delete_audio_clip(str(existing.get("id")))

    if category_override and category_override.strip():
        category = sanitize_storage_segment(category_override)
        tags: list[str] = []
    else:
        analysis = analyze_audio_clip(filename, data, content_type, client_factory=client_factory)
        category = analysis["category"]
        tags = analysis["tags"]

    storage_path = _storage_path_for_category(category, safe_name)
    public_url = upload_audio_to_supabase(data, storage_path, content_type=content_type)
    if not public_url:
        raise HTTPException(status_code=500, detail="Failed to upload audio to storage.")

    now = _now_iso()
    payload = {
        "filename": safe_name,
        "storage_path": storage_path,
        "public_url": public_url,
        "category": category,
        "tags": tags,
        "content_type": content_type,
        "file_size_bytes": len(data),
        "duration_ms": None,
        "created_at": now,
        "updated_at": now,
    }
    supabase = get_supabase_client()
    inserted = supabase.table("audiobank_clips").insert(payload).execute()
    rows = inserted.data or []
    if not rows:
        raise HTTPException(status_code=500, detail="Failed to save audiobank clip.")
    return _clip_from_row(rows[0])


def update_audio_clip(
    clip_id: str,
    *,
    tags: Optional[list[str]] = None,
    category: Optional[str] = None,
) -> dict[str, Any]:
    supabase = get_supabase_client()
    existing = (
        supabase.table("audiobank_clips")
        .select("*")
        .eq("id", clip_id)
        .limit(1)
        .execute()
    )
    rows = existing.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Clip not found.")
    row = rows[0]
    updates: dict[str, Any] = {"updated_at": _now_iso()}

    if tags is not None:
        updates["tags"] = sanitize_tags(tags)

    if category is not None:
        new_category = sanitize_storage_segment(category)
        old_path = str(row.get("storage_path") or "")
        filename = sanitize_filename(str(row.get("filename") or "clip.wav"))
        new_path = f"{new_category}/{filename}"
        if old_path and new_path != old_path:
            moved_url = move_audio_in_supabase(
                old_path,
                new_path,
                str(row.get("content_type") or "audio/wav"),
            )
            if not moved_url:
                raise HTTPException(status_code=500, detail="Failed to move audio in storage.")
            updates["storage_path"] = new_path
            updates["public_url"] = moved_url
        updates["category"] = new_category

    updated = supabase.table("audiobank_clips").update(updates).eq("id", clip_id).execute()
    result_rows = updated.data or []
    if not result_rows:
        refreshed = (
            supabase.table("audiobank_clips")
            .select("*")
            .eq("id", clip_id)
            .limit(1)
            .execute()
        )
        result_rows = refreshed.data or []
    if not result_rows:
        raise HTTPException(status_code=500, detail="Failed to update clip.")
    return _clip_from_row(result_rows[0])


def _get_clip_row(clip_id: str) -> dict[str, Any]:
    supabase = get_supabase_client()
    existing = (
        supabase.table("audiobank_clips")
        .select("*")
        .eq("id", clip_id)
        .limit(1)
        .execute()
    )
    rows = existing.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Clip not found.")
    return rows[0]


def read_clip_audio(clip_id: str) -> tuple[bytes, str, str]:
    row = _get_clip_row(clip_id)
    storage_path = str(row.get("storage_path") or "")
    if not storage_path:
        raise HTTPException(status_code=404, detail="Clip storage path missing.")
    data = download_audio_from_supabase(storage_path)
    if not data:
        raise HTTPException(status_code=404, detail="Audio file not found in storage.")
    content_type = str(row.get("content_type") or _content_type_for_filename(str(row.get("filename") or "")))
    filename = str(row.get("filename") or "clip.wav")
    return data, content_type, filename


def delete_audio_clip(clip_id: str) -> None:
    supabase = get_supabase_client()
    row = _get_clip_row(clip_id)
    storage_path = str(row.get("storage_path") or "")
    if storage_path:
        delete_audio_from_supabase(storage_path)
    supabase.table("audiobank_clips").delete().eq("id", clip_id).execute()
