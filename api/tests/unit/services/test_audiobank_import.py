import pytest
from fastapi import HTTPException
from unittest.mock import MagicMock, patch

from services.audio.audiobank_service import _find_clip_by_filename, import_audio_clip


def test_import_skips_existing_filename_without_overwrite():
    existing = {
        "id": "clip-1",
        "filename": "button_click_01.wav",
        "storage_path": "ui/button/button_click_01.wav",
    }
    with patch("services.audio.audiobank_service._find_clip_by_filename", return_value=existing):
        with pytest.raises(HTTPException) as exc:
            import_audio_clip("button_click_01.wav", b"RIFF", overwrite=False)
    assert exc.value.status_code == 409


def test_import_overwrites_existing_filename():
    existing = {
        "id": "clip-1",
        "filename": "button_click_01.wav",
        "storage_path": "ui/button/button_click_01.wav",
    }
    with patch("services.audio.audiobank_service._find_clip_by_filename", return_value=existing):
        with patch("services.audio.audiobank_service.delete_audio_clip") as delete_mock:
            with patch("services.audio.audiobank_service.analyze_audio_clip", return_value={"category": "ui/button", "tags": ["click"]}):
                with patch("services.audio.audiobank_service.upload_audio_to_supabase", return_value="https://example.com/a.wav"):
                    with patch("services.audio.audiobank_service.get_supabase_client") as client_mock:
                        table = MagicMock()
                        client_mock.return_value.table.return_value = table
                        table.insert.return_value.execute.return_value.data = [
                            {
                                "id": "clip-2",
                                "filename": "button_click_01.wav",
                                "storage_path": "ui/button/button_click_01.wav",
                                "public_url": "https://example.com/a.wav",
                                "category": "ui/button",
                                "tags": ["click"],
                                "content_type": "audio/wav",
                                "file_size_bytes": 4,
                                "duration_ms": None,
                                "created_at": "now",
                                "updated_at": "now",
                            }
                        ]
                        result = import_audio_clip("button_click_01.wav", b"RIFF", overwrite=True)
    delete_mock.assert_called_once_with("clip-1")
    assert result["filename"] == "button_click_01.wav"


def test_find_clip_by_filename_uses_select_before_ilike():
    table = MagicMock()
    exact_result = MagicMock()
    exact_result.data = []
    ilike_result = MagicMock()
    ilike_result.data = [{"id": "clip-1", "filename": "Button_Click_01.wav"}]

    select_builder = MagicMock()
    select_builder.eq.return_value.limit.return_value.execute.return_value = exact_result
    select_builder.ilike.return_value.limit.return_value.execute.return_value = ilike_result
    table.select.return_value = select_builder

    with patch("services.audio.audiobank_service.get_supabase_client") as client_mock:
        client_mock.return_value.table.return_value = table
        found = _find_clip_by_filename("button_click_01.wav")

    assert found == {"id": "clip-1", "filename": "Button_Click_01.wav"}
    table.select.assert_called_with("*")
    select_builder.ilike.assert_called_once_with("filename", "button_click_01.wav")
