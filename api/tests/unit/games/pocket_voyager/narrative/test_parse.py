import copy

import pytest

from games.pocket_voyager.narrative.parse import validate_workspace


def test_validate_ok(missions_sample, dialogues_sample):
    result = validate_workspace(missions_sample, dialogues_sample)
    assert result["errors"] == []
    assert len(result["missions"]) == 2
    assert "ORPHAN_LINE" in result["orphan_clip_ids"]


def test_validate_missing_clip_ref(missions_sample, dialogues_sample):
    missions = copy.deepcopy(missions_sample)
    missions["missions"][0]["dialogueLineIds"].append("MISSING_CLIP")
    result = validate_workspace(missions, dialogues_sample)
    assert any("MISSING_CLIP" in e for e in result["errors"])


def test_validate_duplicate_clip_id(missions_sample, dialogues_sample):
    dialogues = copy.deepcopy(dialogues_sample)
    dialogues["clips"].append(
        {
            "id": "000_DOG_INTRO_01",
            "character_name": "Dog",
            "voice_name": "Mark",
            "script_text": "dup",
        }
    )
    result = validate_workspace(missions_sample, dialogues)
    assert any("Duplicate" in e for e in result["errors"])
