"""Unit tests for Solitaire card folder image batch ops (server_games.solitaire.card_folder_ops)."""

from pathlib import Path

import pytest
from PIL import Image

from server_games.solitaire import card_folder_ops


def test_list_card_image_paths_ignores_meta_and_non_images(tmp_path: Path) -> None:
    Image.new("RGB", (1, 1)).save(tmp_path / "zebra.png", format="PNG")
    Image.new("RGB", (1, 1)).save(tmp_path / "a.png", format="PNG")
    (tmp_path / "x.meta").write_text("m", encoding="ascii")
    (tmp_path / "readme.txt").write_text("no", encoding="ascii")
    sub = tmp_path / "nested"
    sub.mkdir()
    out = card_folder_ops._list_card_image_paths(tmp_path, None)
    names = [p.name for p in out]
    assert names == ["a.png", "zebra.png"]


def test_list_card_image_paths_only_basenames_filter(tmp_path: Path) -> None:
    Image.new("RGB", (1, 1)).save(tmp_path / "One.PNG", format="PNG")
    Image.new("RGB", (1, 1)).save(tmp_path / "two.png", format="PNG")
    out = card_folder_ops._list_card_image_paths(tmp_path, frozenset({"one.png"}))
    assert [p.name for p in out] == ["One.PNG"]


def test_transparent_corner_connected_all_background_is_no_foreground() -> None:
    im = Image.new("RGBA", (4, 4), (255, 255, 255, 255))
    _img, outcome = card_folder_ops._transparent_corner_connected_background(im)
    assert outcome == "no_foreground"


def test_transparent_corner_connected_makes_reachable_white_transparent() -> None:
    # White ring from corners; dark interior so mask does not eat whole image.
    im = Image.new("RGBA", (8, 8), (0, 0, 0, 255))
    px = im.load()
    for y in range(8):
        for x in range(8):
            if x == 0 or y == 0 or x == 7 or y == 7:
                px[x, y] = (255, 255, 255, 255)
    out, outcome = card_folder_ops._transparent_corner_connected_background(im)
    assert outcome == "ok"
    assert out.load()[0, 0][3] == 0
    assert out.load()[4, 4][3] == 255


def test_solitaire_resize_cards_folder_resizes_png(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    folder = tmp_path / "cards"
    folder.mkdir()
    path = folder / "card.png"
    Image.new("RGB", (200, 100), color=(10, 20, 30)).save(path, format="PNG")

    monkeypatch.setattr(
        card_folder_ops,
        "resolve_project_root_relative_file",
        lambda _pk, _rel: folder,
    )
    result = card_folder_ops.solitaire_resize_cards_folder("demo", "Assets/Cards", target_width=100)
    assert result["folder"] == "Assets/Cards"
    assert result["target_width"] == 100
    assert "card.png" in result["processed"]
    with Image.open(path) as im:
        assert im.size == (100, 50)


def test_solitaire_resize_cards_folder_skips_when_already_target_width(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path,
) -> None:
    folder = tmp_path / "cards"
    folder.mkdir()
    path = folder / "exact.png"
    Image.new("RGB", (128, 64), color=(1, 2, 3)).save(path, format="PNG")

    monkeypatch.setattr(
        card_folder_ops,
        "resolve_project_root_relative_file",
        lambda _pk, _rel: folder,
    )
    result = card_folder_ops.solitaire_resize_cards_folder("demo", "x", target_width=128)
    assert result["skipped"] == ["exact.png"]
    assert result["processed"] == []


def test_solitaire_resize_cards_folder_raises_when_folder_missing(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path,
) -> None:
    missing = tmp_path / "nope"
    monkeypatch.setattr(
        card_folder_ops,
        "resolve_project_root_relative_file",
        lambda _pk, _rel: missing,
    )
    with pytest.raises(ValueError, match="Destination folder not found"):
        card_folder_ops.solitaire_resize_cards_folder("demo", "x")


def test_solitaire_resize_cards_folder_raises_when_not_directory(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path,
) -> None:
    f = tmp_path / "file.png"
    f.write_bytes(b"x")
    monkeypatch.setattr(
        card_folder_ops,
        "resolve_project_root_relative_file",
        lambda _pk, _rel: f,
    )
    with pytest.raises(ValueError, match="not a directory"):
        card_folder_ops.solitaire_resize_cards_folder("demo", "x")


def test_solitaire_resize_cards_folder_raises_bad_target_width(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path,
) -> None:
    folder = tmp_path / "c"
    folder.mkdir()
    monkeypatch.setattr(
        card_folder_ops,
        "resolve_project_root_relative_file",
        lambda _pk, _rel: folder,
    )
    with pytest.raises(ValueError, match="target_width"):
        card_folder_ops.solitaire_resize_cards_folder("demo", "x", target_width=10)


def test_solitaire_resize_cards_folder_raises_empty_filenames_after_clean(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path,
) -> None:
    folder = tmp_path / "c"
    folder.mkdir()
    monkeypatch.setattr(
        card_folder_ops,
        "resolve_project_root_relative_file",
        lambda _pk, _rel: folder,
    )
    with pytest.raises(ValueError, match="filenames must contain"):
        card_folder_ops.solitaire_resize_cards_folder("demo", "x", only_filenames=["", "  "])


def test_solitaire_resize_cards_folder_missing_filenames_reported(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path,
) -> None:
    folder = tmp_path / "c"
    folder.mkdir()
    Image.new("RGB", (100, 50), color=(5, 5, 5)).save(folder / "a.png", format="PNG")
    monkeypatch.setattr(
        card_folder_ops,
        "resolve_project_root_relative_file",
        lambda _pk, _rel: folder,
    )
    result = card_folder_ops.solitaire_resize_cards_folder(
        "demo",
        "x",
        target_width=64,
        only_filenames=["a.png", "ghost.png"],
    )
    assert "ghost.png" in result["missing_filenames"]
    assert "a.png" in result["processed"]


def test_solitaire_trim_white_borders_folder_all_white_records_error(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path,
) -> None:
    folder = tmp_path / "c"
    folder.mkdir()
    Image.new("RGBA", (6, 6), (255, 255, 255, 255)).save(folder / "flat.png", format="PNG")
    monkeypatch.setattr(
        card_folder_ops,
        "resolve_project_root_relative_file",
        lambda _pk, _rel: folder,
    )
    result = card_folder_ops.solitaire_trim_white_borders_folder("demo", "x")
    assert result["errors"]
    assert "flat.png" in result["errors"][0]["filename"]
    assert "foreground" in result["errors"][0]["error"].lower()


def test_solitaire_trim_white_borders_folder_png_transparent_border(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path,
) -> None:
    folder = tmp_path / "c"
    folder.mkdir()
    path = folder / "card.png"
    im = Image.new("RGBA", (12, 12), (40, 40, 40, 255))
    px = im.load()
    for y in range(12):
        for x in range(12):
            if x == 0 or y == 0 or x == 11 or y == 11:
                px[x, y] = (255, 255, 255, 255)
    im.save(path, format="PNG")

    monkeypatch.setattr(
        card_folder_ops,
        "resolve_project_root_relative_file",
        lambda _pk, _rel: folder,
    )
    result = card_folder_ops.solitaire_trim_white_borders_folder("demo", "x")
    assert path.name in result["processed"]
    with Image.open(path) as after:
        assert after.load()[0, 0][3] == 0
        assert after.load()[6, 6][3] == 255


def test_solitaire_trim_white_borders_folder_jpeg_replaced_by_png(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path,
) -> None:
    folder = tmp_path / "c"
    folder.mkdir()
    jpg = folder / "card.jpg"
    im = Image.new("RGB", (10, 10), (20, 20, 20))
    px = im.load()
    for y in range(10):
        for x in range(10):
            if x == 0 or y == 0 or x == 9 or y == 9:
                px[x, y] = (255, 255, 255)
    im.save(jpg, format="JPEG", quality=95)

    monkeypatch.setattr(
        card_folder_ops,
        "resolve_project_root_relative_file",
        lambda _pk, _rel: folder,
    )
    result = card_folder_ops.solitaire_trim_white_borders_folder("demo", "x")
    assert "card.png" in result["processed"]
    assert not jpg.exists()
    png_path = folder / "card.png"
    assert png_path.is_file()
