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
