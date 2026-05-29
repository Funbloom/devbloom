import base64

from services.image import image_tool
from pathlib import Path


def test_generate_openai_image_bytes_uses_edit_when_reference(monkeypatch):
    called: dict[str, object] = {}

    class _DataItem:
        b64_json = base64.b64encode(b"fake-png").decode("ascii")

    class _Response:
        data = [_DataItem()]

    class _FakeImages:
        def edit(self, **kwargs):
            called["edit"] = kwargs
            return _Response()

        def generate(self, **kwargs):
            called["generate"] = kwargs
            return _Response()

    class _FakeClient:
        def __init__(self, **kwargs):
            self.images = _FakeImages()

    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(image_tool, "OpenAI", _FakeClient)

    out = image_tool.generate_openai_image_bytes(
        "playing card ace of spades",
        model_name="gpt-image-1.5",
        reference_image_bytes=b"\x89PNG\r\n\x1a\nfake",
    )

    assert out == b"fake-png"
    assert "edit" in called
    assert "generate" not in called
    assert called["edit"]["model"] == "gpt-image-1.5"
    assert called["edit"]["image"][0][0] == "reference.png"


def test_generate_openai_image_bytes_rejects_reference_for_non_openai_model(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")

    class _FakeClient:
        def __init__(self, **kwargs):
            self.images = None

    monkeypatch.setattr(image_tool, "OpenAI", _FakeClient)

    try:
        image_tool.generate_openai_image_bytes(
            "prompt",
            model_name="gemini-2.5-flash-image",
            reference_image_bytes=b"\x89PNG",
        )
    except ValueError as exc:
        assert "OpenAI GPT Image" in str(exc)
    else:
        raise AssertionError("expected ValueError")


def test_leonardo_reference_generation_uses_gemini_path(monkeypatch):
    called: dict[str, object] = {}

    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    def fake_gemini(**kwargs):
        called["gemini"] = kwargs
        return {"images": [{"filename": "gemini.png"}]}

    def fake_leonardo(**kwargs):
        called["leonardo"] = kwargs
        return {"images": [{"filename": "leonardo.png"}]}

    monkeypatch.setattr(image_tool, "_generate_image_gemini", fake_gemini)
    monkeypatch.setattr(image_tool, "_generate_image_leonardo", fake_leonardo)

    result = image_tool.generate_image(
        prompt="Apply edits to the reference",
        width=1024,
        height=1024,
        model="leonardo-gemini-2.5-flash-image",
        project_key="demo",
        reference_image_filenames=["hero.png"],
    )

    assert result["images"][0]["filename"] == "gemini.png"
    assert "leonardo" not in called
    assert called["gemini"]["reference_image_filenames"] == ["hero.png"]


def test_leonardo_text_only_generation_keeps_leonardo_path(monkeypatch):
    called: dict[str, object] = {}

    def fake_gemini(**kwargs):
        called["gemini"] = kwargs
        return {"images": [{"filename": "gemini.png"}]}

    def fake_leonardo(**kwargs):
        called["leonardo"] = kwargs
        return {"images": [{"filename": "leonardo.png"}]}

    monkeypatch.setattr(image_tool, "_generate_image_gemini", fake_gemini)
    monkeypatch.setattr(image_tool, "_generate_image_leonardo", fake_leonardo)

    result = image_tool.generate_image(
        prompt="A new image from text",
        width=1024,
        height=1024,
        model="leonardo-gemini-2.5-flash-image",
        project_key="demo",
    )

    assert result["images"][0]["filename"] == "leonardo.png"
    assert "gemini" not in called
    assert "leonardo" in called


def test_remove_background_uses_input_url_when_filename_lookup_fails(monkeypatch):
    class _FakeResponse:
        def __init__(self, content: bytes):
            self.content = content

        def raise_for_status(self) -> None:
            return

    monkeypatch.setattr(image_tool, "find_image_path", lambda *args, **kwargs: None)
    monkeypatch.setattr(image_tool, "build_image_filename", lambda *args, **kwargs: "ignored.png")
    monkeypatch.setattr(image_tool, "sanitize_filename", lambda name, *_args: name)
    monkeypatch.setattr(image_tool.requests, "get", lambda *_args, **_kwargs: _FakeResponse(b"input-bytes"))
    monkeypatch.setattr(
        image_tool,
        "_load_rembg",
        lambda: (
            lambda input_bytes, **_kwargs: b"out-" + input_bytes,
            None,
        ),
    )
    monkeypatch.setattr(
        image_tool,
        "save_bytes_to_file",
        lambda *_args, **_kwargs: Path("D:/tmp/out.png"),
    )
    monkeypatch.setattr(image_tool, "build_image_url", lambda filename, *_args: f"/images/{filename}")

    result = image_tool.remove_background(
        input_filename="missing.png",
        input_url="https://example.com/source.png?v=1",
        output_filename="out.png",
        project_key="demo",
        alpha_matting=False,
    )

    assert result["filename"] == "out.png"
    assert result["url"] == "/images/out.png"


def test_remove_background_raises_when_filename_missing_and_no_input_url(monkeypatch):
    monkeypatch.setattr(image_tool, "find_image_path", lambda *args, **kwargs: None)

    try:
        image_tool.remove_background(
            input_filename="missing.png",
            input_url=None,
            output_filename="out.png",
            project_key="demo",
        )
        assert False, "Expected ValueError when both local file and input_url are unavailable."
    except ValueError as exc:
        assert "Input image not found." in str(exc)
