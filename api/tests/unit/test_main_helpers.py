"""Pure unit tests for core.chat_helpers (logic moved out of main for fast imports)."""

import pytest

import core.chat_helpers as ch


def test_normalize_agent_id_defaults_and_known():
    assert ch.normalize_agent_id(None) == "creative_director"
    assert ch.normalize_agent_id("") == "creative_director"
    assert ch.normalize_agent_id("  Creative_Director  ") == "creative_director"
    assert ch.normalize_agent_id("art-director") == "art_director"
    assert ch.normalize_agent_id("unknown_bot") == "creative_director"


def test_history_path_for_user(tmp_path):
    user = {"email": "a@b.com"}
    p = ch.history_path_for_user("creative_director", user, "my-project", tmp_path)
    assert p.parent.name == "a.b.com"
    assert p.parent.parent.name == "my-project"
    assert p.name == "creative_director.json"


def test_history_path_for_user_fallback_segments(tmp_path):
    """No email: user id becomes the path segment (same as main.get_history_path)."""
    p = ch.history_path_for_user("producer", {"id": "only-id"}, None, tmp_path)
    assert "no_project" in str(p).replace("\\", "/")
    assert "only-id" in str(p).replace("\\", "/")
    assert p.name == "producer.json"


def test_user_might_need_tools():
    assert ch._user_might_need_tools("") is False
    assert ch._user_might_need_tools("   ") is False
    assert ch._user_might_need_tools("please export to pdf") is True
    assert ch._user_might_need_tools("Generate image of a cat") is True


def test_choose_tool_name():
    assert ch._choose_tool_name("") is None
    assert ch._choose_tool_name("text only please") is None
    assert ch._choose_tool_name("resize image please") == "resize_image"
    assert ch._choose_tool_name("crop the photo") == "crop_image"
    assert ch._choose_tool_name("convert to png") == "convert_image"
    assert ch._choose_tool_name("generate image of x") == "generate_image"


def test_extract_tool_args():
    assert ch._extract_tool_args("", "generate_image") is None
    text = 'generate_image({"prompt": "x"})'
    assert ch._extract_tool_args(text, "generate_image") == {"prompt": "x"}
    assert ch._extract_tool_args("generate_image(not json)", "generate_image") is None


def test_user_row_plain_dict():
    row = ch.user_row(
        {
            "id": "u1",
            "email": "dev@example.com",
            "created_at": "t",
            "user_metadata": {"role": "admin"},
            "identities": [],
            "app_metadata": {},
        }
    )
    assert row["email"] == "dev@example.com"
    assert row["role"] == "admin"
    assert row["provider"] is None


def test_user_row_identity_email():
    row = ch.user_row(
        {
            "id": "u2",
            "email": None,
            "identities": [{"provider": "google", "identity_data": {"email": "g@gmail.com"}}],
            "user_metadata": {},
            "app_metadata": {"providers": ["google"]},
        }
    )
    assert row["email"] == "g@gmail.com"
    assert row["provider"] == "google"


def test_extract_users_from_response():
    class R:
        users = [{"id": "1"}]

    assert ch.extract_users_from_response(R()) == [{"id": "1"}]

    class D:
        data = [{"id": "2"}]

    assert ch.extract_users_from_response(D()) == [{"id": "2"}]
    assert ch.extract_users_from_response(object()) == []
