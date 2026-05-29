from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from core.auth import require_admin

from services.audio.audiobank_service import (
    delete_audio_clip,
    import_audio_clip,
    list_categories,
    list_clips,
    read_clip_audio,
    update_audio_clip,
)

audiobank_router = APIRouter(prefix="/audiobank", tags=["audiobank"])


class AudiobankClipPatchBody(BaseModel):
    tags: Optional[list[str]] = None
    category: Optional[str] = Field(default=None, min_length=1)


@audiobank_router.get("/categories")
def get_audiobank_categories() -> list[dict]:
    try:
        return list_categories()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load categories: {exc}") from exc


@audiobank_router.get("/clips")
def get_audiobank_clips(category: Optional[str] = None, q: Optional[str] = None) -> list[dict]:
    try:
        return list_clips(category=category, query=q)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load clips: {exc}") from exc


@audiobank_router.post("/import")
async def import_audiobank_clip(
    file: UploadFile = File(...),
    category: Optional[str] = Form(default=None),
    overwrite: bool = Form(default=False),
    _admin: dict = Depends(require_admin),
) -> dict:
    try:
        raw = await file.read()
        filename = file.filename or "clip.wav"
        return import_audio_clip(filename, raw, category_override=category, overwrite=overwrite)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Import failed: {exc}") from exc


@audiobank_router.get("/clips/{clip_id}/audio")
def stream_audiobank_clip_audio(
    clip_id: str,
    export_format: Optional[str] = Query(default=None, alias="format"),
) -> Response:
    try:
        data, content_type, filename = read_clip_audio(clip_id)
        if export_format:
            from services.audio.audiobank_convert import convert_audio_bytes

            try:
                data, content_type, filename = convert_audio_bytes(
                    data,
                    filename=filename,
                    content_type=content_type,
                    target_format=export_format,
                )
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            except RuntimeError as exc:
                raise HTTPException(status_code=500, detail=str(exc)) from exc
        return Response(
            content=data,
            media_type=content_type,
            headers={"Content-Disposition": f'inline; filename="{filename}"'},
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Audio stream failed: {exc}") from exc


@audiobank_router.patch("/clips/{clip_id}")
def patch_audiobank_clip(clip_id: str, body: AudiobankClipPatchBody) -> dict:
    if body.tags is None and body.category is None:
        raise HTTPException(status_code=400, detail="No fields to update.")
    try:
        return update_audio_clip(clip_id, tags=body.tags, category=body.category)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Update failed: {exc}") from exc


@audiobank_router.delete("/clips/{clip_id}")
def remove_audiobank_clip(clip_id: str) -> dict:
    try:
        delete_audio_clip(clip_id)
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Delete failed: {exc}") from exc
