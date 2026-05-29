from pathlib import Path
import os
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from core.auth import get_current_user
from services.core.games_registry import (
    get_game,
    list_games,
    list_pipeline_inputs,
    list_pipelines,
    load_pipeline_input,
)
from games.pocket_voyager.services.gifts_service import (
    append_gift_image_file,
    append_gift_to_catalog,
    batch_update_gift_images,
    generate_gift_image,
    load_gift_catalog,
    replace_gift_image_file,
    resolve_gift_images_dir,
    update_gift_in_catalog,
)
from games.pocket_voyager.services.cities_service import (
    add_gift_to_city,
    batch_create_cities,
    load_cities_catalog,
    plan_batch_create_cities,
    plan_location_updates,
    update_cities_location_updates,
)

games_router = APIRouter()


def _require_server_file_access() -> None:
    if os.getenv("ALLOW_SERVER_FILE_ACCESS", "false").lower() != "true":
        raise HTTPException(
            status_code=400,
            detail="Server file access is disabled. Use the local agent.",
        )


class PipelineRunRequest(BaseModel):
    input_file: str | None = None
    catalog_path: str | None = None


class CreateGiftRequest(BaseModel):
    catalog_path: str
    gift_id: str
    description: str | None = None
    display_name: str | None = None
    activity_tags: list[str] | None = None
    priority: int | None = None
    weight: float | None = None
    image_mode: str | None = None  # generate


class GiftGenerateRequest(BaseModel):
    catalog_path: str = Field(min_length=1)
    gift_id: str = Field(min_length=1)


class EditGiftRequest(BaseModel):
    catalog_path: str = Field(min_length=1)
    description: str | None = None
    display_name: str | None = None
    activity_tags: list[str] | None = None
    priority: int | None = None
    weight: float | None = None
    image_mode: str | None = None  # keep|generate


class CityGiftAssignRequest(BaseModel):
    cities_path: str = Field(min_length=1)
    city_id: str = Field(min_length=1)
    gift_id: str = Field(min_length=1)


class CityBatchCreateRequest(BaseModel):
    cities_path: str = Field(min_length=1)
    gifts_path: str = Field(min_length=1)
    count: int = Field(default=1, ge=1, le=200)
    prompt: str = Field(min_length=1)


class CityUpdateLocationRequest(BaseModel):
    cities_path: str = Field(min_length=1)
    city_ids: list[str] = Field(min_items=1)
    prompt: str = Field(min_length=1)
    count: int = Field(default=3, ge=1, le=20)
    replace_existing: bool = False


class CityBatchPlanRequest(BaseModel):
    prompt: str = Field(min_length=1)
    count: int = Field(default=1, ge=1, le=200)
    existing_city_ids: list[str] = []
    existing_gift_ids: list[str] = []


class CityLocationPlanRequest(BaseModel):
    prompt: str = Field(min_length=1)
    city_ids: list[str] = Field(min_items=1)
    count: int = Field(default=3, ge=1, le=20)


class GiftUpdateImagesRequest(BaseModel):
    catalog_path: str = Field(min_length=1)
    gift_ids: list[str] = Field(min_items=1)
    style_prompt: str | None = None
    extra_prompt: str | None = None
    quality: str | None = None  # low|medium|high
    style_mode: str | None = None  # natural|vivid


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
    if pipeline_key in {"gift_images", "cities"}:
        _require_server_file_access()
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
    _require_server_file_access()

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
    _require_server_file_access()
    image_mode = (body.image_mode or "").strip().lower()
    if image_mode and image_mode != "generate":
        raise HTTPException(status_code=400, detail="Invalid image_mode.")
    try:
        created = append_gift_to_catalog(
            catalog_path=body.catalog_path,
            gift_id=body.gift_id,
            description=body.description or "",
            display_name=body.display_name,
            activity_tags=body.activity_tags,
            priority=body.priority,
            weight=body.weight,
        )
        if image_mode == "generate":
            generate_gift_image(body.catalog_path, body.gift_id)
        catalog = load_gift_catalog(body.catalog_path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    gifts_with_urls = []
    for gift in catalog["gifts"]:
        filename = gift.get("image_filename")
        url = None
        if filename:
            query = urlencode({"catalog_path": catalog["catalog_path"], "filename": filename})
            url = f"/games/pocket_voyager/pipelines/gift_images/image?{query}"
        gifts_with_urls.append({**gift, "image_url": url})
    return {
        "ok": True,
        "created": created,
        "catalog_path": catalog["catalog_path"],
        "images_dir": catalog["images_dir"],
        "gifts": gifts_with_urls,
    }


@games_router.patch("/games/{game_key}/pipelines/gift_images/gifts/{gift_id}")
def edit_gift_route(
    game_key: str,
    gift_id: str,
    body: EditGiftRequest,
    _user: dict = Depends(get_current_user),
) -> dict:
    if game_key != "pocket_voyager":
        raise HTTPException(status_code=404, detail="Game not found.")
    _require_server_file_access()
    image_mode = (body.image_mode or "keep").strip().lower()
    if image_mode not in {"keep", "generate"}:
        raise HTTPException(status_code=400, detail="Invalid image_mode.")
    try:
        updated = update_gift_in_catalog(
            catalog_path=body.catalog_path,
            gift_id=gift_id,
            description=body.description,
            display_name=body.display_name,
            activity_tags=body.activity_tags,
            priority=body.priority,
            weight=body.weight,
        )
        if image_mode == "generate":
            generate_gift_image(body.catalog_path, gift_id)
        catalog = load_gift_catalog(body.catalog_path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    gifts_with_urls = []
    for gift in catalog["gifts"]:
        filename = gift.get("image_filename")
        url = None
        if filename:
            query = urlencode({"catalog_path": catalog["catalog_path"], "filename": filename})
            url = f"/games/pocket_voyager/pipelines/gift_images/image?{query}"
        gifts_with_urls.append({**gift, "image_url": url})
    return {
        "ok": True,
        "updated": updated,
        "catalog_path": catalog["catalog_path"],
        "images_dir": catalog["images_dir"],
        "gifts": gifts_with_urls,
    }


@games_router.post("/games/{game_key}/pipelines/gift_images/gifts/{gift_id}/upload")
async def edit_gift_with_image_route(
    game_key: str,
    gift_id: str,
    catalog_path: str = Form(...),
    description: str = Form(""),
    display_name: str = Form(""),
    activity_tags_csv: str = Form(""),
    priority_str: str = Form(""),
    weight_str: str = Form(""),
    image: UploadFile = File(...),
    _user: dict = Depends(get_current_user),
) -> dict:
    if game_key != "pocket_voyager":
        raise HTTPException(status_code=404, detail="Game not found.")
    _require_server_file_access()
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

        update_gift_in_catalog(
            catalog_path=catalog_path,
            gift_id=gift_id,
            description=description or "",
            display_name=display_name.strip() or None,
            activity_tags=_split_csv_field(activity_tags_csv),
            priority=priority_val,
            weight=weight_val,
        )
        updated = replace_gift_image_file(
            catalog_path=catalog_path,
            gift_id=gift_id,
            image_bytes=raw,
            original_filename=image.filename or "image.png",
        )
        catalog = load_gift_catalog(catalog_path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    gifts_with_urls = []
    for gift in catalog["gifts"]:
        filename = gift.get("image_filename")
        url = None
        if filename:
            query = urlencode({"catalog_path": catalog["catalog_path"], "filename": filename})
            url = f"/games/pocket_voyager/pipelines/gift_images/image?{query}"
        gifts_with_urls.append({**gift, "image_url": url})
    return {
        "ok": True,
        "updated": updated,
        "catalog_path": catalog["catalog_path"],
        "images_dir": catalog["images_dir"],
        "gifts": gifts_with_urls,
    }


@games_router.post("/games/{game_key}/pipelines/cities/gifts/assign")
def assign_gift_to_city_route(
    game_key: str,
    body: CityGiftAssignRequest,
    _user: dict = Depends(get_current_user),
) -> dict:
    if game_key != "pocket_voyager":
        raise HTTPException(status_code=404, detail="Game not found.")
    _require_server_file_access()
    try:
        result = add_gift_to_city(body.cities_path, body.city_id, body.gift_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True, **result}


@games_router.post("/games/{game_key}/pipelines/cities/batch_create")
def batch_create_cities_route(
    game_key: str,
    body: CityBatchCreateRequest,
    _user: dict = Depends(get_current_user),
) -> dict:
    if game_key != "pocket_voyager":
        raise HTTPException(status_code=404, detail="Game not found.")
    _require_server_file_access()
    try:
        result = batch_create_cities(
            cities_path=body.cities_path,
            gifts_path=body.gifts_path,
            prompt=body.prompt,
            count=body.count,
        )
        cities = load_cities_catalog(body.cities_path)
        gifts = load_gift_catalog(body.gifts_path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "ok": True,
        **result,
        "cities": cities["cities"],
        "gifts": gifts["gifts"],
    }


@games_router.post("/games/{game_key}/pipelines/cities/batch_plan")
def batch_plan_cities_route(
    game_key: str,
    body: CityBatchPlanRequest,
    _user: dict = Depends(get_current_user),
) -> dict:
    if game_key != "pocket_voyager":
        raise HTTPException(status_code=404, detail="Game not found.")
    try:
        result = plan_batch_create_cities(
            prompt=body.prompt,
            count=body.count,
            existing_city_ids=body.existing_city_ids,
            existing_gift_ids=body.existing_gift_ids,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True, **result}


@games_router.post("/games/{game_key}/pipelines/cities/update_location_updates")
def update_location_updates_route(
    game_key: str,
    body: CityUpdateLocationRequest,
    _user: dict = Depends(get_current_user),
) -> dict:
    if game_key != "pocket_voyager":
        raise HTTPException(status_code=404, detail="Game not found.")
    _require_server_file_access()
    try:
        result = update_cities_location_updates(
            cities_path=body.cities_path,
            city_ids=body.city_ids,
            prompt=body.prompt,
            count=body.count,
            replace_existing=body.replace_existing,
        )
        cities = load_cities_catalog(body.cities_path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "ok": True,
        **result,
        "cities": cities["cities"],
    }


@games_router.post("/games/{game_key}/pipelines/cities/location_plan")
def plan_location_updates_route(
    game_key: str,
    body: CityLocationPlanRequest,
    _user: dict = Depends(get_current_user),
) -> dict:
    if game_key != "pocket_voyager":
        raise HTTPException(status_code=404, detail="Game not found.")
    try:
        result = plan_location_updates(
            prompt=body.prompt,
            city_ids=body.city_ids,
            count=body.count,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True, **result}


@games_router.post("/games/{game_key}/pipelines/gift_images/update_images")
def update_gift_images_route(
    game_key: str,
    body: GiftUpdateImagesRequest,
    _user: dict = Depends(get_current_user),
) -> dict:
    if game_key != "pocket_voyager":
        raise HTTPException(status_code=404, detail="Game not found.")
    _require_server_file_access()
    try:
        result = batch_update_gift_images(
            catalog_path=body.catalog_path,
            gift_ids=body.gift_ids,
            style_prompt=body.style_prompt,
            extra_prompt=body.extra_prompt,
            quality=body.quality,
            style_mode=body.style_mode,
        )
        catalog = load_gift_catalog(body.catalog_path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    gifts_with_urls = []
    for gift in catalog["gifts"]:
        filename = gift.get("image_filename")
        url = None
        if filename:
            query = urlencode({"catalog_path": catalog["catalog_path"], "filename": filename})
            url = f"/games/pocket_voyager/pipelines/gift_images/image?{query}"
        gifts_with_urls.append({**gift, "image_url": url})
    return {
        "ok": True,
        **result,
        "gifts": gifts_with_urls,
        "images_dir": catalog["images_dir"],
    }


@games_router.post("/games/{game_key}/pipelines/gift_images/gifts/generate")
def generate_gift_image_route(
    game_key: str,
    body: GiftGenerateRequest,
    _user: dict = Depends(get_current_user),
) -> dict:
    if game_key != "pocket_voyager":
        raise HTTPException(status_code=404, detail="Game not found.")
    _require_server_file_access()
    try:
        result = generate_gift_image(body.catalog_path, body.gift_id)
        catalog = load_gift_catalog(body.catalog_path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    gifts_with_urls = []
    for gift in catalog["gifts"]:
        filename = gift.get("image_filename")
        url = None
        if filename:
            query = urlencode({"catalog_path": catalog["catalog_path"], "filename": filename})
            url = f"/games/pocket_voyager/pipelines/gift_images/image?{query}"
        gifts_with_urls.append({**gift, "image_url": url})
    return {
        "ok": True,
        "generated": result,
        "catalog_path": catalog["catalog_path"],
        "images_dir": catalog["images_dir"],
        "gifts": gifts_with_urls,
    }


def _split_csv_field(value: str) -> list[str] | None:
    parts = [p.strip() for p in (value or "").split(",") if p.strip()]
    return parts or None


@games_router.post("/games/{game_key}/pipelines/gift_images/gifts/upload")
async def create_gift_with_image_route(
    game_key: str,
    catalog_path: str = Form(...),
    gift_id: str = Form(...),
    description: str = Form(""),
    display_name: str = Form(""),
    activity_tags_csv: str = Form(""),
    priority_str: str = Form(""),
    weight_str: str = Form(""),
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
            image_bytes=raw,
            original_filename=image.filename or "image.png",
            display_name=display_name.strip() or None,
            activity_tags=_split_csv_field(activity_tags_csv),
            priority=priority_val,
            weight=weight_val,
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
