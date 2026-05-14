from fastapi import APIRouter, Depends, HTTPException

from core.auth import get_current_user
from server_games.solitaire.schemas import SolitaireCardsFolderRequest
from server_games.solitaire.card_folder_ops import (
    solitaire_resize_cards_folder,
    solitaire_trim_white_borders_folder,
)

solitaire_image_router = APIRouter()


@solitaire_image_router.post("/tools/solitaire_cards_resize_folder")
def solitaire_cards_resize_folder_route(
    body: SolitaireCardsFolderRequest,
    _user: dict = Depends(get_current_user),
) -> dict:
    """Resize each image in the folder to width 512px (height proportional)."""
    try:
        return solitaire_resize_cards_folder(
            body.project_key.strip(),
            body.folder_relative.strip().replace("\\", "/"),
            target_width=512,
            only_filenames=body.filenames,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@solitaire_image_router.post("/tools/solitaire_cards_trim_borders_folder")
def solitaire_cards_trim_borders_folder_route(
    body: SolitaireCardsFolderRequest,
    _user: dict = Depends(get_current_user),
) -> dict:
    """Set outer near-white border to transparent (flood from corners; full image size kept). JPEG → PNG."""
    try:
        return solitaire_trim_white_borders_folder(
            body.project_key.strip(),
            body.folder_relative.strip().replace("\\", "/"),
            only_filenames=body.filenames,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
