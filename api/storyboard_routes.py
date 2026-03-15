from typing import Any, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from auth import get_current_user

from image_tool import build_image_filename, build_image_url, save_bytes_to_file
from image_storage import upload_image_to_supabase
from rag import get_supabase_client
from usage import check_can_generate_images, increment_usage
from storyboard import (
    add_character,
    add_location,
    add_style,
    add_tile,
    create_storyboard,
    delete_character,
    delete_location,
    delete_storyboard,
    delete_style,
    delete_tile,
    ensure_storyboard_access,
    get_storyboard_full,
    list_storyboards,
    list_styles,
    reorder_tiles,
    generate_tile_image,
    update_character,
    update_location,
    update_storyboard,
    update_tile,
)


storyboard_router = APIRouter()


class StoryboardCreate(BaseModel):
    name: str = Field(min_length=1)
    style: Optional[str] = None
    project_key: Optional[str] = None
    is_public: bool = True


class StoryboardUpdate(BaseModel):
    name: Optional[str] = None
    style: Optional[str] = None


class CharacterCreate(BaseModel):
    name: str = Field(min_length=1)
    image: Optional[str] = None


class CharacterUpdate(BaseModel):
    name: Optional[str] = None
    image: Optional[str] = None


class TileCreate(BaseModel):
    prompt: str = Field(min_length=1)
    image: Optional[str] = None
    tile_number: Optional[int] = Field(default=None, ge=1)
    location_id: Optional[str] = None
    character_ids: Optional[List[str]] = None


class TileUpdate(BaseModel):
    prompt: Optional[str] = None
    image: Optional[str] = None
    tile_number: Optional[int] = Field(default=None, ge=1)
    location_id: Optional[str] = None
    character_ids: Optional[List[str]] = None


class TilesReorder(BaseModel):
    tile_ids: List[str] = Field(min_items=1)


class LocationCreate(BaseModel):
    name: str = Field(min_length=1)
    image: Optional[str] = None


class LocationUpdate(BaseModel):
    name: Optional[str] = None
    image: Optional[str] = None


class StyleCreate(BaseModel):
    name: str = Field(min_length=1)
    prompt: str = Field(default="")


@storyboard_router.get("/storyboard/styles")
def api_list_styles() -> list[dict[str, Any]]:
    """Public: list all styles (no auth required)."""
    return list_styles()


@storyboard_router.post("/storyboard/styles")
def api_add_style(
    body: StyleCreate,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    return add_style(name=body.name, prompt=body.prompt)


@storyboard_router.delete("/storyboard/styles/{style_id}")
def api_delete_style(
    style_id: str,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    return delete_style(style_id)


@storyboard_router.get("/storyboard")
def api_list_storyboards(
    project_key: Optional[str] = None,
    user: dict = Depends(get_current_user),
) -> list[dict[str, Any]]:
    return list_storyboards(project_key=project_key, user_id=user.get("id"))


@storyboard_router.post("/storyboard")
def api_create_storyboard(
    body: StoryboardCreate,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    return create_storyboard(
        name=body.name,
        style=body.style,
        project_key=body.project_key,
        is_public=body.is_public,
        user_id=user.get("id"),
    )


@storyboard_router.get("/storyboard/{storyboard_id}")
def api_get_storyboard(
    storyboard_id: str,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    return get_storyboard_full(storyboard_id, current_user_id=user.get("id"))


@storyboard_router.patch("/storyboard/{storyboard_id}")
def api_update_storyboard(
    storyboard_id: str,
    body: StoryboardUpdate,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    if body.name is None and body.style is None:
        raise HTTPException(status_code=400, detail="No fields to update.")
    return update_storyboard(
        storyboard_id,
        name=body.name,
        style=body.style,
        current_user_id=user.get("id"),
    )


@storyboard_router.delete("/storyboard/{storyboard_id}")
def api_delete_storyboard(
    storyboard_id: str,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    return delete_storyboard(storyboard_id, current_user_id=user.get("id"))


@storyboard_router.post("/storyboard/{storyboard_id}/characters")
def api_add_character(
    storyboard_id: str,
    body: CharacterCreate,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    return add_character(
        storyboard_id,
        name=body.name,
        image=body.image,
        current_user_id=user.get("id"),
    )


@storyboard_router.patch("/storyboard/characters/{character_id}")
def api_update_character(
    character_id: str,
    body: CharacterUpdate,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    if body.name is None and body.image is None:
        raise HTTPException(status_code=400, detail="No fields to update.")
    return update_character(
        character_id,
        name=body.name,
        image=body.image,
        current_user_id=user.get("id"),
    )


@storyboard_router.delete("/storyboard/characters/{character_id}")
def api_delete_character(
    character_id: str,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    return delete_character(character_id, current_user_id=user.get("id"))


@storyboard_router.post("/storyboard/{storyboard_id}/tiles")
def api_add_tile(
    storyboard_id: str,
    body: TileCreate,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    return add_tile(
        storyboard_id,
        prompt=body.prompt,
        image=body.image,
        tile_number=body.tile_number,
        location_id=body.location_id,
        character_ids=body.character_ids,
        current_user_id=user.get("id"),
    )


@storyboard_router.patch("/storyboard/tiles/{tile_id}")
def api_update_tile(
    tile_id: str,
    body: TileUpdate,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    if (
        body.prompt is None
        and body.image is None
        and body.tile_number is None
        and body.location_id is None
        and body.character_ids is None
    ):
        raise HTTPException(status_code=400, detail="No fields to update.")
    return update_tile(
        tile_id,
        prompt=body.prompt,
        image=body.image,
        tile_number=body.tile_number,
        location_id=body.location_id,
        character_ids=body.character_ids,
        current_user_id=user.get("id"),
    )


@storyboard_router.delete("/storyboard/tiles/{tile_id}")
def api_delete_tile(
    tile_id: str,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    return delete_tile(tile_id, current_user_id=user.get("id"))


@storyboard_router.patch("/storyboard/{storyboard_id}/tiles/reorder")
def api_reorder_tiles(
    storyboard_id: str,
    body: TilesReorder,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    return reorder_tiles(
        storyboard_id,
        tile_ids_in_order=body.tile_ids,
        current_user_id=user.get("id"),
    )


@storyboard_router.post("/storyboard/{storyboard_id}/characters/image")
async def api_upload_character_image(
    storyboard_id: str,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Upload an image for a storyboard character and return a URL that can be stored in the DB."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="filename is required.")
    ensure_storyboard_access(storyboard_id, user.get("id"))
    try:
        supabase = get_supabase_client()
        sb = (
            supabase.table("storyboards")
            .select("project_key")
            .eq("id", storyboard_id.strip())
            .limit(1)
            .execute()
        )
        project_key: Optional[str] = None
        if sb.data:
            value = sb.data[0].get("project_key")
            if isinstance(value, str) and value.strip():
                project_key = value.strip()

        orig_name = file.filename
        ext = orig_name.rsplit(".", 1)[-1].lower() if "." in orig_name else "png"
        filename = build_image_filename("character", ext)
        data = await file.read()
        output_path = save_bytes_to_file(data, filename, project_key)
        url = build_image_url(filename, project_key)
        content_type = "image/jpeg" if ext in ("jpg", "jpeg") else "image/png" if ext == "png" else "image/webp" if ext == "webp" else "image/png"
        storage_url = upload_image_to_supabase(data, f"characters/{storyboard_id.strip()}/{filename}", content_type=content_type)
        if storage_url:
            url = storage_url
        return {
            "filename": filename,
            "url": url,
            "path": str(output_path),
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to upload character image: {exc}") from exc


@storyboard_router.post("/storyboard/{storyboard_id}/locations")
def api_add_location(
    storyboard_id: str,
    body: LocationCreate,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    return add_location(
        storyboard_id,
        name=body.name,
        image=body.image,
        current_user_id=user.get("id"),
    )


@storyboard_router.patch("/storyboard/locations/{location_id}")
def api_update_location(
    location_id: str,
    body: LocationUpdate,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    if body.name is None and body.image is None:
        raise HTTPException(status_code=400, detail="No fields to update.")
    return update_location(
        location_id,
        name=body.name,
        image=body.image,
        current_user_id=user.get("id"),
    )


@storyboard_router.delete("/storyboard/locations/{location_id}")
def api_delete_location(
    location_id: str,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    return delete_location(location_id, current_user_id=user.get("id"))


@storyboard_router.post("/storyboard/{storyboard_id}/locations/image")
async def api_upload_location_image(
    storyboard_id: str,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Upload an image for a storyboard location and return a URL that can be stored in the DB."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="filename is required.")
    ensure_storyboard_access(storyboard_id, user.get("id"))
    try:
        supabase = get_supabase_client()
        sb = (
            supabase.table("storyboards")
            .select("project_key")
            .eq("id", storyboard_id.strip())
            .limit(1)
            .execute()
        )
        project_key: Optional[str] = None
        if sb.data:
            value = sb.data[0].get("project_key")
            if isinstance(value, str) and value.strip():
                project_key = value.strip()

        orig_name = file.filename
        ext = orig_name.rsplit(".", 1)[-1].lower() if "." in orig_name else "png"
        filename = build_image_filename("location", ext)
        data = await file.read()
        output_path = save_bytes_to_file(data, filename, project_key)
        url = build_image_url(filename, project_key)
        content_type = "image/jpeg" if ext in ("jpg", "jpeg") else "image/png" if ext == "png" else "image/webp" if ext == "webp" else "image/png"
        storage_url = upload_image_to_supabase(data, f"locations/{storyboard_id.strip()}/{filename}", content_type=content_type)
        if storage_url:
            url = storage_url
        return {
            "filename": filename,
            "url": url,
            "path": str(output_path),
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to upload location image: {exc}") from exc


@storyboard_router.post("/storyboard/tiles/{tile_id}/generate")
def api_generate_tile(
    tile_id: str,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Generate an image for a tile and update the tile's image field."""
    check_can_generate_images(user.get("id") or "", user.get("is_admin") or False, count=1)
    result = generate_tile_image(tile_id, current_user_id=user.get("id"))
    increment_usage(user.get("id") or "", 1)
    return result

