import pytest
from fastapi import HTTPException

from services.image.storyboard import storyboard_tile_dimensions


def test_storyboard_tile_dimensions_square_default() -> None:
    assert storyboard_tile_dimensions() == (1024, 1024)
    assert storyboard_tile_dimensions("square") == (1024, 1024)


def test_storyboard_tile_dimensions_landscape() -> None:
    w, h = storyboard_tile_dimensions("landscape")
    assert w == 1024
    assert h == 576


def test_storyboard_tile_dimensions_portrait() -> None:
    w, h = storyboard_tile_dimensions("portrait")
    assert w == 576
    assert h == 1024


def test_storyboard_tile_dimensions_rejects_invalid() -> None:
    with pytest.raises(HTTPException) as exc_info:
        storyboard_tile_dimensions("wide")
    assert exc_info.value.status_code == 400
