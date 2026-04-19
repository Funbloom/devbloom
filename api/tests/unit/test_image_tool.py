from services import image_tool


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
