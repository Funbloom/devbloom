"""Chat agent generate_image tool: normalize LLM placeholder model strings."""

from services import image_tool


def test_run_generate_image_tool_default_placeholder_uses_server_default(monkeypatch):
    captured: dict = {}

    monkeypatch.setattr(
        image_tool,
        "generate_image",
        lambda **kwargs: captured.update(kwargs) or {"images": []},
    )

    image_tool.run_generate_image_tool(
        {
            "prompt": "a red cube",
            "model": "default",
        }
    )

    assert captured["model"] == "gpt-image-1.5"


def test_run_generate_image_tool_omitted_model_uses_server_default(monkeypatch):
    captured: dict = {}

    monkeypatch.setattr(
        image_tool,
        "generate_image",
        lambda **kwargs: captured.update(kwargs) or {"images": []},
    )

    image_tool.run_generate_image_tool({"prompt": "a blue sphere"})

    assert captured["model"] == "gpt-image-1.5"


def test_run_generate_image_tool_explicit_gemini_preserved(monkeypatch):
    captured: dict = {}

    monkeypatch.setattr(
        image_tool,
        "generate_image",
        lambda **kwargs: captured.update(kwargs) or {"images": []},
    )

    image_tool.run_generate_image_tool(
        {
            "prompt": "x",
            "model": "gemini-2.5-flash-image",
        }
    )

    assert captured["model"] == "gemini-2.5-flash-image"
