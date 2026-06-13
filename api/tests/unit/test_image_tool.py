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


def test_resolve_openai_image_size_gpt_image_15_landscape_uses_legacy_preset():
    assert image_tool.resolve_openai_image_size("gpt-image-1.5", 1024, 576) == "1536x1024"
    assert image_tool.resolve_openai_image_size("gpt-image-1.5", 1024, 1024) == "1024x1024"
    assert image_tool.resolve_openai_image_size("gpt-image-1.5", 576, 1024) == "1024x1536"


def test_resolve_openai_image_size_gpt_image_2_uses_true_16_9_and_9_16():
    assert image_tool.resolve_openai_image_size("gpt-image-2", 1024, 576) == "1088x608"
    assert image_tool.resolve_openai_image_size("gpt-image-2", 576, 1024) == "608x1088"
    assert image_tool.resolve_openai_image_size("gpt-image-2", 2048, 1152) == "2048x1152"
    assert image_tool.resolve_openai_image_size("gpt-image-2", 1024, 1024) == "1024x1024"


def test_resolve_openai_image_size_gpt_image_2_dims_divisible_by_16():
    for w, h in ((1024, 576), (576, 1024), (2048, 1152), (1024, 1024)):
        size = image_tool.resolve_openai_image_size("gpt-image-2", w, h)
        pw, ph = size.split("x")
        assert int(pw) % 16 == 0
        assert int(ph) % 16 == 0


def test_generate_openai_image_bytes_gpt_image_2_edit_omits_input_fidelity(monkeypatch):
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

    image_tool.generate_openai_image_bytes(
        "edit this",
        model_name="gpt-image-2",
        reference_image_bytes=b"\x89PNG\r\n\x1a\nfake",
    )

    assert "edit" in called
    assert "input_fidelity" not in called["edit"]


def test_generate_openai_image_bytes_gpt_image_15_edit_sets_input_fidelity(monkeypatch):
    called: dict[str, object] = {}

    class _DataItem:
        b64_json = base64.b64encode(b"fake-png").decode("ascii")

    class _Response:
        data = [_DataItem()]

    class _FakeImages:
        def edit(self, **kwargs):
            called["edit"] = kwargs
            return _Response()

    class _FakeClient:
        def __init__(self, **kwargs):
            self.images = _FakeImages()

    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(image_tool, "OpenAI", _FakeClient)

    image_tool.generate_openai_image_bytes(
        "edit this",
        model_name="gpt-image-1.5",
        reference_image_bytes=b"\x89PNG\r\n\x1a\nfake",
    )

    assert called["edit"]["input_fidelity"] == "high"


def test_generate_openai_image_bytes_gpt_image_2_passes_custom_landscape_size(monkeypatch):
    called: dict[str, object] = {}

    class _DataItem:
        b64_json = base64.b64encode(b"fake-png").decode("ascii")

    class _Response:
        data = [_DataItem()]

    class _FakeImages:
        def generate(self, **kwargs):
            called["generate"] = kwargs
            return _Response()

    class _FakeClient:
        def __init__(self, **kwargs):
            self.images = _FakeImages()

    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(image_tool, "OpenAI", _FakeClient)

    image_tool.generate_openai_image_bytes(
        "landscape scene",
        width=1024,
        height=576,
        model_name="gpt-image-2",
    )

    assert called["generate"]["size"] == "1088x608"
    assert called["generate"]["model"] == "gpt-image-2"
