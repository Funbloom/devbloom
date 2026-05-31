from unittest.mock import patch


def test_patch_audiobank_clip_requires_admin(client):
    with patch("routers.audiobank_routes.update_audio_clip") as update_audio_clip:
        response = client.patch("/audiobank/clips/clip-1", json={"tags": ["ui"]})

    assert response.status_code == 403
    update_audio_clip.assert_not_called()


def test_delete_audiobank_clip_requires_admin(client):
    with patch("routers.audiobank_routes.delete_audio_clip") as delete_audio_clip:
        response = client.delete("/audiobank/clips/clip-1")

    assert response.status_code == 403
    delete_audio_clip.assert_not_called()
