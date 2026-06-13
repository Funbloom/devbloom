from fastapi import HTTPException
import pytest

from routers import image_router


def test_edit_image_nanobanana_uses_default_gpt_model(monkeypatch):
    called: dict[str, object] = {}

    monkeypatch.setattr(image_router, "check_can_generate_images", lambda *args, **kwargs: None)
    monkeypatch.setattr(image_router, "increment_usage", lambda *args, **kwargs: None)
    # Avoid resolve_project_path / Supabase when resolving output dir for a bare filename.
    monkeypatch.setattr(image_router, "find_image_path", lambda *args, **kwargs: None)

    def fake_generate_image(**kwargs):
        called.update(kwargs)
        return {"images": [{"filename": "out.png", "url": "/images/out.png"}]}

    monkeypatch.setattr(image_router, "generate_image", fake_generate_image)

    body = image_router.EditImageNanobananaRequest(
        changes="make it brighter",
        reference="hero.png",
        project_key="demo",
    )
    user = {"id": "user-1", "is_admin": False}

    result = image_router.edit_image_nanobanana_route(body, user)

    assert result["images"][0]["filename"] == "out.png"
    assert called["model"] == "gpt-image-1.5"
    assert called["reference_image_filenames"] == ["hero.png"]


def test_edit_image_nanobanana_includes_extra_reference_images(monkeypatch):
    called: dict[str, object] = {}

    monkeypatch.setattr(image_router, "check_can_generate_images", lambda *args, **kwargs: None)
    monkeypatch.setattr(image_router, "increment_usage", lambda *args, **kwargs: None)
    monkeypatch.setattr(image_router, "find_image_path", lambda *args, **kwargs: None)

    def fake_generate_image(**kwargs):
        called.update(kwargs)
        return {"images": [{"filename": "out.png", "url": "/images/out.png"}]}

    monkeypatch.setattr(image_router, "generate_image", fake_generate_image)

    body = image_router.EditImageNanobananaRequest(
        changes="match the hat style",
        reference="hero.png",
        reference_image_filenames=["hat_ref.png", "hero.png", "style_ref.png"],
        project_key="demo",
    )
    user = {"id": "user-1", "is_admin": False}

    image_router.edit_image_nanobanana_route(body, user)

    assert called["reference_image_filenames"] == ["hero.png", "hat_ref.png", "style_ref.png"]


def test_edit_image_nanobanana_preserves_explicit_gpt_model(monkeypatch):
    called: dict[str, object] = {}

    monkeypatch.setattr(image_router, "check_can_generate_images", lambda *args, **kwargs: None)
    monkeypatch.setattr(image_router, "increment_usage", lambda *args, **kwargs: None)
    monkeypatch.setattr(image_router, "find_image_path", lambda *args, **kwargs: None)

    def fake_generate_image(**kwargs):
        called.update(kwargs)
        return {"images": [{"filename": "out.png", "url": "/images/out.png"}]}

    monkeypatch.setattr(image_router, "generate_image", fake_generate_image)

    body = image_router.EditImageNanobananaRequest(
        changes="change the background",
        reference="hero.png",
        model="gpt-image-1.5",
        project_key="demo",
    )
    user = {"id": "user-1", "is_admin": False}

    image_router.edit_image_nanobanana_route(body, user)

    assert called["model"] == "gpt-image-1.5"


def test_generate_image_bytes_rejects_gemini_when_reference_set(monkeypatch):
    monkeypatch.setattr(image_router, "check_can_generate_images", lambda *args, **kwargs: None)

    import base64

    body = image_router.GenerateImageBytesRequest(
        prompt="a card",
        model="gemini-2.5-flash-image",
        reference_image_base64=base64.b64encode(b"x").decode("ascii"),
    )
    user = {"id": "user-1", "is_admin": False}

    with pytest.raises(HTTPException) as exc_info:
        image_router.generate_image_bytes_route(body, user)
    assert exc_info.value.status_code == 400
    assert "OpenAI GPT Image" in str(exc_info.value.detail)
