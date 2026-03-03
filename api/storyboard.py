from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from image_tool import generate_image
from rag import get_supabase_client


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def list_storyboards(project_key: Optional[str] = None) -> List[Dict[str, Any]]:
    """Return all storyboards, optionally filtered by project_key."""
    try:
        supabase = get_supabase_client()
        query = (
            supabase.table("storyboards")
            .select("id,name,style,project_key,created_at,updated_at")
            .order("created_at", desc=False)
        )
        if project_key:
            query = query.eq("project_key", project_key)
        result = query.execute()
        return result.data or []
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to list storyboards: {exc}") from exc


def create_storyboard(name: str, style: Optional[str] = None, project_key: Optional[str] = None) -> Dict[str, Any]:
    """Create a new storyboard."""
    cleaned_name = (name or "").strip()
    if not cleaned_name:
        raise HTTPException(status_code=400, detail="name is required.")
    try:
        supabase = get_supabase_client()
        now = _now_iso()
        payload: Dict[str, Any] = {
            "name": cleaned_name,
            "style": style or "",
            "project_key": project_key,
            "created_at": now,
            "updated_at": now,
        }
        result = supabase.table("storyboards").insert(payload).execute()
        return (result.data or [payload])[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to create storyboard: {exc}") from exc


def get_storyboard_full(storyboard_id: str) -> Dict[str, Any]:
    """Return a storyboard with its characters, locations, and tiles."""
    sid = (storyboard_id or "").strip()
    if not sid:
        raise HTTPException(status_code=400, detail="storyboard_id is required.")
    try:
        supabase = get_supabase_client()
        sb_result = (
            supabase.table("storyboards")
            .select("id,name,style,project_key,created_at,updated_at")
            .eq("id", sid)
            .limit(1)
            .execute()
        )
        if not sb_result.data:
            raise HTTPException(status_code=404, detail="storyboard not found.")
        storyboard = sb_result.data[0]

        chars_result = (
            supabase.table("storyboard_characters")
            .select("id,storyboard_id,name,image,created_at,updated_at")
            .eq("storyboard_id", sid)
            .order("created_at", desc=False)
            .execute()
        )
        locations_result = (
            supabase.table("storyboard_locations")
            .select("id,storyboard_id,name,image,created_at,updated_at")
            .eq("storyboard_id", sid)
            .order("created_at", desc=False)
            .execute()
        )
        tiles_result = (
            supabase.table("storyboard_tiles")
            .select("id,storyboard_id,tile_number,image,prompt,location_id,character_ids,created_at,updated_at")
            .eq("storyboard_id", sid)
            .order("tile_number", desc=False)
            .execute()
        )
        return {
            "storyboard": storyboard,
            "characters": chars_result.data or [],
            "locations": locations_result.data or [],
            "tiles": tiles_result.data or [],
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load storyboard: {exc}") from exc


def update_storyboard(storyboard_id: str, name: Optional[str] = None, style: Optional[str] = None) -> Dict[str, Any]:
    sid = (storyboard_id or "").strip()
    if not sid:
        raise HTTPException(status_code=400, detail="storyboard_id is required.")
    payload: Dict[str, Any] = {}
    if name is not None:
        cleaned = name.strip()
        if not cleaned:
            raise HTTPException(status_code=400, detail="name cannot be empty.")
        payload["name"] = cleaned
    if style is not None:
        payload["style"] = style
    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update.")
    payload["updated_at"] = _now_iso()
    try:
        supabase = get_supabase_client()
        result = (
            supabase.table("storyboards")
            .update(payload)
            .eq("id", sid)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="storyboard not found.")
        return result.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to update storyboard: {exc}") from exc


def delete_storyboard(storyboard_id: str) -> Dict[str, Any]:
    sid = (storyboard_id or "").strip()
    if not sid:
        raise HTTPException(status_code=400, detail="storyboard_id is required.")
    try:
        supabase = get_supabase_client()
        result = (
            supabase.table("storyboards")
            .delete()
            .eq("id", sid)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="storyboard not found.")
        return {"deleted": True, "id": sid}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to delete storyboard: {exc}") from exc


def add_character(storyboard_id: str, name: str, image: Optional[str] = None) -> Dict[str, Any]:
    sid = (storyboard_id or "").strip()
    if not sid:
        raise HTTPException(status_code=400, detail="storyboard_id is required.")
    cleaned_name = (name or "").strip()
    if not cleaned_name:
        raise HTTPException(status_code=400, detail="name is required.")
    try:
        supabase = get_supabase_client()
        now = _now_iso()
        payload: Dict[str, Any] = {
            "storyboard_id": sid,
            "name": cleaned_name,
            "image": image or "",
            "created_at": now,
            "updated_at": now,
        }
        result = supabase.table("storyboard_characters").insert(payload).execute()
        return (result.data or [payload])[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to add character: {exc}") from exc


def update_character(character_id: str, name: Optional[str] = None, image: Optional[str] = None) -> Dict[str, Any]:
    cid = (character_id or "").strip()
    if not cid:
        raise HTTPException(status_code=400, detail="character_id is required.")
    payload: Dict[str, Any] = {}
    if name is not None:
        cleaned = name.strip()
        if not cleaned:
            raise HTTPException(status_code=400, detail="name cannot be empty.")
        payload["name"] = cleaned
    if image is not None:
        payload["image"] = image
    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update.")
    payload["updated_at"] = _now_iso()
    try:
        supabase = get_supabase_client()
        result = (
            supabase.table("storyboard_characters")
            .update(payload)
            .eq("id", cid)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="character not found.")
        return result.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to update character: {exc}") from exc


def delete_character(character_id: str) -> Dict[str, Any]:
    cid = (character_id or "").strip()
    if not cid:
        raise HTTPException(status_code=400, detail="character_id is required.")
    try:
        supabase = get_supabase_client()
        result = (
            supabase.table("storyboard_characters")
            .delete()
            .eq("id", cid)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="character not found.")
        return {"deleted": True, "id": cid}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to delete character: {exc}") from exc


def add_location(storyboard_id: str, name: str, image: Optional[str] = None) -> Dict[str, Any]:
    sid = (storyboard_id or "").strip()
    if not sid:
        raise HTTPException(status_code=400, detail="storyboard_id is required.")
    cleaned_name = (name or "").strip()
    if not cleaned_name:
        raise HTTPException(status_code=400, detail="name is required.")
    try:
        supabase = get_supabase_client()
        now = _now_iso()
        payload: Dict[str, Any] = {
            "storyboard_id": sid,
            "name": cleaned_name,
            "image": image or "",
            "created_at": now,
            "updated_at": now,
        }
        result = supabase.table("storyboard_locations").insert(payload).execute()
        return (result.data or [payload])[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to add location: {exc}") from exc


def update_location(location_id: str, name: Optional[str] = None, image: Optional[str] = None) -> Dict[str, Any]:
    lid = (location_id or "").strip()
    if not lid:
        raise HTTPException(status_code=400, detail="location_id is required.")
    payload: Dict[str, Any] = {}
    if name is not None:
        cleaned = name.strip()
        if not cleaned:
            raise HTTPException(status_code=400, detail="name cannot be empty.")
        payload["name"] = cleaned
    if image is not None:
        payload["image"] = image
    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update.")
    payload["updated_at"] = _now_iso()
    try:
        supabase = get_supabase_client()
        result = (
            supabase.table("storyboard_locations")
            .update(payload)
            .eq("id", lid)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="location not found.")
        return result.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to update location: {exc}") from exc


def delete_location(location_id: str) -> Dict[str, Any]:
    lid = (location_id or "").strip()
    if not lid:
        raise HTTPException(status_code=400, detail="location_id is required.")
    try:
        supabase = get_supabase_client()
        result = (
            supabase.table("storyboard_locations")
            .delete()
            .eq("id", lid)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="location not found.")
        return {"deleted": True, "id": lid}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to delete location: {exc}") from exc


def _next_tile_number(supabase: Any, storyboard_id: str) -> int:
    result = (
        supabase.table("storyboard_tiles")
        .select("tile_number")
        .eq("storyboard_id", storyboard_id)
        .order("tile_number", desc=True)
        .limit(1)
        .execute()
    )
    if not result.data:
        return 1
    try:
        return int(result.data[0].get("tile_number", 0)) + 1
    except Exception:
        return 1


def add_tile(
    storyboard_id: str,
    prompt: str,
    image: Optional[str] = None,
    tile_number: Optional[int] = None,
    location_id: Optional[str] = None,
    character_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    sid = (storyboard_id or "").strip()
    if not sid:
        raise HTTPException(status_code=400, detail="storyboard_id is required.")
    text = (prompt or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="prompt is required.")
    try:
        supabase = get_supabase_client()
        number = tile_number or _next_tile_number(supabase, sid)
        now = _now_iso()
        payload: Dict[str, Any] = {
            "storyboard_id": sid,
            "tile_number": number,
            "image": image or "",
            "prompt": text,
            "created_at": now,
            "updated_at": now,
        }
        if location_id is not None:
            payload["location_id"] = location_id or None
        if character_ids is not None:
            payload["character_ids"] = character_ids or []
        result = supabase.table("storyboard_tiles").insert(payload).execute()
        return (result.data or [payload])[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to add tile: {exc}") from exc


def update_tile(
    tile_id: str,
    prompt: Optional[str] = None,
    image: Optional[str] = None,
    tile_number: Optional[int] = None,
    location_id: Optional[str] = None,
    character_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    tid = (tile_id or "").strip()
    if not tid:
        raise HTTPException(status_code=400, detail="tile_id is required.")
    payload: Dict[str, Any] = {}
    if prompt is not None:
        text = prompt.strip()
        if not text:
            raise HTTPException(status_code=400, detail="prompt cannot be empty.")
        payload["prompt"] = text
    if image is not None:
        payload["image"] = image
    if tile_number is not None:
        if tile_number <= 0:
            raise HTTPException(status_code=400, detail="tile_number must be positive.")
        payload["tile_number"] = tile_number
    if location_id is not None:
        payload["location_id"] = location_id or None
    if character_ids is not None:
        payload["character_ids"] = character_ids or []
    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update.")
    payload["updated_at"] = _now_iso()
    try:
        supabase = get_supabase_client()
        result = (
            supabase.table("storyboard_tiles")
            .update(payload)
            .eq("id", tid)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="tile not found.")
        return result.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to update tile: {exc}") from exc


def reorder_tiles(storyboard_id: str, tile_ids_in_order: List[str]) -> Dict[str, Any]:
    sid = (storyboard_id or "").strip()
    if not sid:
        raise HTTPException(status_code=400, detail="storyboard_id is required.")
    if not tile_ids_in_order:
        raise HTTPException(status_code=400, detail="tile_ids_in_order cannot be empty.")
    try:
        supabase = get_supabase_client()
        for index, tile_id in enumerate(tile_ids_in_order, start=1):
            tid = (tile_id or "").strip()
            if not tid:
                continue
            (
                supabase.table("storyboard_tiles")
                .update({"tile_number": index, "updated_at": _now_iso()})
                .eq("id", tid)
                .eq("storyboard_id", sid)
                .execute()
            )
        return {"reordered": True, "count": len(tile_ids_in_order)}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to reorder tiles: {exc}") from exc


def generate_tile_image(tile_id: str) -> Dict[str, Any]:
    tid = (tile_id or "").strip()
    if not tid:
        raise HTTPException(status_code=400, detail="tile_id is required.")
    try:
        supabase = get_supabase_client()
        tile_result = (
            supabase.table("storyboard_tiles")
            .select("id,storyboard_id,prompt,image,location_id,character_ids")
            .eq("id", tid)
            .limit(1)
            .execute()
        )
        if not tile_result.data:
            raise HTTPException(status_code=404, detail="tile not found.")
        tile = tile_result.data[0]
        storyboard_id = tile.get("storyboard_id")
        if not storyboard_id:
            raise HTTPException(status_code=400, detail="tile has no storyboard_id.")

        sb_result = (
            supabase.table("storyboards")
            .select("project_key,style")
            .eq("id", storyboard_id)
            .limit(1)
            .execute()
        )
        if not sb_result.data:
            raise HTTPException(status_code=404, detail="storyboard not found for tile.")
        sb = sb_result.data[0]
        project_key = sb.get("project_key")
        style_text = (sb.get("style") or "").strip()
        prompt_text = (tile.get("prompt") or "").strip()
        if not prompt_text:
            raise HTTPException(status_code=400, detail="tile prompt is empty.")

        # Fetch referenced characters and location so we can both describe
        # them in the prompt and use their images as reference inputs.
        location_id = tile.get("location_id")
        character_ids = tile.get("character_ids") or []

        characters: List[Dict[str, Any]] = []
        if character_ids:
            chars_result = (
                supabase.table("storyboard_characters")
                .select("id,name,image")
                .in_("id", character_ids)
                .execute()
            )
            characters = chars_result.data or []

        location: Optional[Dict[str, Any]] = None
        if location_id:
            loc_result = (
                supabase.table("storyboard_locations")
                .select("id,name,image")
                .eq("id", location_id)
                .limit(1)
                .execute()
            )
            if loc_result.data:
                location = loc_result.data[0]

        full_prompt = prompt_text
        if style_text:
            full_prompt = f"{style_text}\n\n{prompt_text}"

        if location:
            loc_name = (location.get("name") or "").strip()
            if loc_name:
                full_prompt += f"\n\nLocation: {loc_name}"

        if characters:
            names = ", ".join(
                (c.get("name") or "").strip() or "character" for c in characters
            )
            full_prompt += (
                f"\n\nCharacters present in this tile: {names}. "
                "Keep their appearance consistent with their reference images."
            )

        # log the prompt
        print(f"Full prompt: {full_prompt}")

        # Map stored image URLs like /images/filename.png?project_key=xyz
        # back to the underlying filenames so the image tool can resolve
        # them and pass as Gemini reference images.
        def _extract_filename(url: Optional[str]) -> Optional[str]:
            if not url:
                return None
            raw = url.split("?", 1)[0]
            if "/" in raw:
                raw = raw.rsplit("/", 1)[-1]
            raw = raw.strip()
            return raw or None

        reference_files: List[str] = []
        if location and location.get("image"):
            fname = _extract_filename(str(location.get("image")))
            if fname:
                reference_files.append(fname)

        for char in characters:
            img_url = char.get("image")
            if not img_url:
                continue
            fname = _extract_filename(str(img_url))
            if fname and fname not in reference_files:
                reference_files.append(fname)

        gen_result = generate_image(
            prompt=full_prompt,
            project_key=project_key or None,
            reference_image_filenames=reference_files or None,
        )
        images = gen_result.get("images") or []
        if not images:
            raise HTTPException(status_code=500, detail="Image generation returned no images.")
        first = images[0]
        image_url = first.get("url") or first.get("filename")
        if not image_url:
            raise HTTPException(status_code=500, detail="Image generation did not return a URL.")

        # Upload to Supabase Storage so the image is available from any machine
        try:
            from image_storage import upload_image_to_supabase
            path_str = first.get("path")
            filename = first.get("filename") or "image.png"
            if path_str and Path(path_str).exists():
                data = Path(path_str).read_bytes()
                storage_url = upload_image_to_supabase(
                    data,
                    f"tiles/{tid}/{filename}",
                    content_type="image/png",
                )
                if storage_url:
                    image_url = storage_url
        except Exception as exc:
            print(f"[generate_tile_image] Supabase upload skipped: {exc}")

        update_payload = {
            "image": image_url,
            "updated_at": _now_iso(),
        }
        update_result = (
            supabase.table("storyboard_tiles")
            .update(update_payload)
            .eq("id", tid)
            .execute()
        )
        if not update_result.data:
            raise HTTPException(status_code=500, detail="Failed to update tile with generated image.")
        updated_tile = update_result.data[0]
        return {"tile": updated_tile, "image": first}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to generate tile image: {exc}") from exc
