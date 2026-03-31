from pathlib import Path
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from core.auth import get_current_user
from services.games_registry import (
    list_games,
    list_pipelines,
    list_pipeline_inputs,
    load_pipeline_input,
    load_gift_catalog,
    append_gift_image_file,
    append_gift_to_catalog,
    load_cities_catalog,
    resolve_gift_images_dir,
    get_game,
)

games_router = APIRouter()


class PipelineRunRequest(BaseModel):
    input_file: str | None = None
    catalog_path: str | None = None


class CreateGiftRequest(BaseModel):
    catalog_path: str
    city_id: str = ""
    gift_id: str
    description: str | None = None
    display_name: str | None = None
    place_ids: list[str] | None = None
    activity_tags: list[str] | None = None
    priority: int | None = None
    weight: float | None = None
    presentation_id: str | None = None


@games_router.get("/games")
def list_games_route(_user: dict = Depends(get_current_user)) -> list[dict]:
    return list_games()


@games_router.get("/games/{game_key}/pipelines")
def list_pipelines_route(game_key: str, _user: dict = Depends(get_current_user)) -> list[dict]:
    if not get_game(game_key):
        raise HTTPException(status_code=404, detail="Game not found.")
    return list_pipelines(game_key)


@games_router.get("/games/{game_key}/pipelines/{pipeline_key}/inputs")
def list_pipeline_inputs_route(
    game_key: str,
    pipeline_key: str,
    _user: dict = Depends(get_current_user),
) -> list[str]:
    return list_pipeline_inputs(game_key, pipeline_key)


@games_router.post("/games/{game_key}/pipelines/{pipeline_key}/run")
def run_pipeline_route(
    game_key: str,
    pipeline_key: str,
    body: PipelineRunRequest,
    _user: dict = Depends(get_current_user),
) -> dict:
    if pipeline_key == "gift_images":
        try:
            catalog = load_gift_catalog(body.catalog_path or "")
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        gifts_with_urls = []
        for gift in catalog["gifts"]:
            filename = gift.get("imageFileName") or gift.get("image_filename")
            url = None
            if filename:
                query = urlencode({"catalog_path": catalog["catalog_path"], "filename": filename})
                url = f"/games/pocket_voyager/pipelines/gift_images/image?{query}"
            gifts_with_urls.append(
                {
                    **gift,
                    "image_url": url,
                }
            )
        return {
            "ok": True,
            "catalog_path": catalog["catalog_path"],
            "images_dir": catalog["images_dir"],
            "gifts": gifts_with_urls,
        }

    if pipeline_key == "cities":
        try:
            catalog = load_cities_catalog(body.catalog_path or "")
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {
            "ok": True,
            "catalog_path": catalog["catalog_path"],
            "home_city_id": catalog["home_city_id"],
            "cities": catalog["cities"],
        }

    if not body.input_file:
        raise HTTPException(status_code=400, detail="input_file is required.")
    try:
        payload = load_pipeline_input(game_key, pipeline_key, body.input_file)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    # MVP stub: echo parsed payload
    return {"ok": True, "input": payload}


@games_router.get("/games/{game_key}/pipelines/{pipeline_key}/image")
def get_pipeline_image(
    game_key: str,
    pipeline_key: str,
    catalog_path: str = Query(min_length=1),
    filename: str = Query(min_length=1),
    _user: dict = Depends(get_current_user),
) -> FileResponse:
    if game_key != "pocket_voyager" or pipeline_key != "gift_images":
        raise HTTPException(status_code=404, detail="Pipeline not found.")

    original_filename = filename
    filename = Path(original_filename).name
    if filename != original_filename or ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename.")

    try:
        images_dir = resolve_gift_images_dir(catalog_path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    image_path = (images_dir / filename).resolve()
    if images_dir not in image_path.parents and image_path != images_dir:
        raise HTTPException(status_code=400, detail="Invalid image path.")
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="Image not found.")

    return FileResponse(image_path, filename=filename)


@games_router.post("/games/{game_key}/pipelines/gift_images/gifts")
def create_gift_route(
    game_key: str,
    body: CreateGiftRequest,
    _user: dict = Depends(get_current_user),
) -> dict:
    if game_key != "pocket_voyager":
        raise HTTPException(status_code=404, detail="Game not found.")
    try:
        created = append_gift_to_catalog(
            catalog_path=body.catalog_path,
            gift_id=body.gift_id,
            description=body.description or "",
            city_id=body.city_id,
            display_name=body.display_name,
            place_ids=body.place_ids,
            activity_tags=body.activity_tags,
            priority=body.priority,
            weight=body.weight,
            presentation_id=body.presentation_id,
        )
        catalog = load_gift_catalog(body.catalog_path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "ok": True,
        "created": created,
        "catalog_path": catalog["catalog_path"],
        "images_dir": catalog["images_dir"],
        "gifts": catalog["gifts"],
    }


def _split_csv_field(value: str) -> list[str] | None:
    parts = [p.strip() for p in (value or "").split(",") if p.strip()]
    return parts or None


@games_router.post("/games/{game_key}/pipelines/gift_images/gifts/upload")
async def create_gift_with_image_route(
    game_key: str,
    catalog_path: str = Form(...),
    city_id: str = Form(""),
    gift_id: str = Form(...),
    description: str = Form(""),
    display_name: str = Form(""),
    place_ids_csv: str = Form(""),
    activity_tags_csv: str = Form(""),
    priority_str: str = Form(""),
    weight_str: str = Form(""),
    presentation_id: str = Form(""),
    image: UploadFile = File(...),
    _user: dict = Depends(get_current_user),
) -> dict:
    if game_key != "pocket_voyager":
        raise HTTPException(status_code=404, detail="Game not found.")
    try:
        raw = await image.read()
        if not raw:
            raise ValueError("Image file is empty.")
        priority_val: int | None = None
        if priority_str.strip():
            priority_val = int(float(priority_str.strip()))
        weight_val: float | None = None
        if weight_str.strip():
            weight_val = float(weight_str.strip())
        created = append_gift_image_file(
            catalog_path=catalog_path,
            gift_id=gift_id,
            description=description or "",
            city_id=city_id,
            image_bytes=raw,
            original_filename=image.filename or "image.png",
            display_name=display_name.strip() or None,
            place_ids=_split_csv_field(place_ids_csv),
            activity_tags=_split_csv_field(activity_tags_csv),
            priority=priority_val,
            weight=weight_val,
            presentation_id=presentation_id.strip(),
        )
        catalog = load_gift_catalog(catalog_path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "ok": True,
        "created": created,
        "catalog_path": catalog["catalog_path"],
        "images_dir": catalog["images_dir"],
        "gifts": catalog["gifts"],
    }
