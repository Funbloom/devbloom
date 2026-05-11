from pathlib import Path

from PIL import Image

from local_agent.image_resize import is_supported_image_file, resize_images_in_directory


def test_resize_images_in_directory_resizes_supported_files(tmp_path: Path):
    image_one = tmp_path / "one.png"
    image_two = tmp_path / "two.jpg"
    note = tmp_path / "note.txt"

    Image.new("RGBA", (32, 20), (255, 0, 0, 255)).save(image_one, format="PNG")
    Image.new("RGB", (48, 24), (0, 255, 0)).save(image_two, format="JPEG")
    note.write_text("ignore me", encoding="utf-8")

    out = resize_images_in_directory(tmp_path, 64, 40)

    assert out["processed_count"] == 2
    assert out["failed_count"] == 0
    with Image.open(image_one) as img_one:
        assert img_one.size == (64, 40)
    with Image.open(image_two) as img_two:
        assert img_two.size == (64, 40)
    assert note.read_text(encoding="utf-8") == "ignore me"


def test_is_supported_image_file_filters_extensions(tmp_path: Path):
    image_path = tmp_path / "preview.webp"
    text_path = tmp_path / "preview.txt"

    Image.new("RGB", (8, 8), (0, 0, 255)).save(image_path, format="WEBP")
    text_path.write_text("x", encoding="utf-8")

    assert is_supported_image_file(image_path) is True
    assert is_supported_image_file(text_path) is False
