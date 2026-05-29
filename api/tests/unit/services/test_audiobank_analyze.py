import pytest

from services.audio.audiobank_analyze import (
    classify_from_filename,
    normalize_category_path,
    parse_analysis_json,
    sanitize_tags,
    tags_from_filename,
)
from services.audio.audiobank_storage import sanitize_filename, sanitize_storage_segment


def test_sanitize_storage_segment_nested():
    assert sanitize_storage_segment("UI/Clicks!") == "ui/clicks"
    assert sanitize_storage_segment("  Footsteps  ") == "footsteps"
    assert sanitize_storage_segment("") == "uncategorized"


def test_sanitize_filename():
    assert sanitize_filename("../My Clip (1).wav") == "My_Clip_1_.wav"


def test_tags_from_filename():
    tags = tags_from_filename("UI_Click_Soft_01.wav")
    assert "ui" in tags
    assert "click" in tags
    assert "soft" in tags


def test_classify_button_click():
    result = classify_from_filename("button_click_01.wav")
    assert result["category"] == "ui/button"
    assert "button" in result["tags"]
    assert "click" in result["tags"]


def test_classify_error_sound():
    result = classify_from_filename("error_buzz.wav")
    assert result["category"] == "ui/error"


def test_classify_dog_bark():
    result = classify_from_filename("dog_bark_happy.wav")
    assert result["category"] == "dog"


def test_classify_environment():
    result = classify_from_filename("ambient_wind_loop.wav")
    assert result["category"] == "environment"


def test_normalize_category_path_rejects_unknown():
    assert normalize_category_path("random/stuff") == "system"


def test_parse_analysis_json():
    parsed = parse_analysis_json(
        '{"category": "ui/button", "tags": ["click", "soft", "button"]}'
    )
    assert parsed["category"] == "ui/button"
    assert parsed["tags"] == ["click", "soft", "button"]


def test_sanitize_tags_dedupes():
    assert sanitize_tags(["Click", "click", "  soft  ", "", "!!!"]) == ["click", "soft"]
