from pathlib import Path
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel

from core.auth import get_current_user
from services.games_registry import (
    list_games,
    list_pipelines,
    list_pipeline_inputs,
    load_pipeline_input,
    load_gift_catalog,
    get_game,
)

games_router = APIRouter()


class PipelineRunRequest(BaseModel):
    input_file: str | None = None
    catalog_path: str | None = None


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
            filename = gift.get("image_filename")
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
        catalog = load_gift_catalog(catalog_path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    images_dir = Path(catalog["images_dir"]).resolve()
    image_path = (images_dir / filename).resolve()
    if images_dir not in image_path.parents and image_path != images_dir:
        raise HTTPException(status_code=400, detail="Invalid image path.")
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="Image not found.")

    return FileResponse(image_path, filename=filename)
