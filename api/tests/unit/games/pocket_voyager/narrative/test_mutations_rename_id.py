from games.pocket_voyager.narrative.mutations import update_line


def test_rename_updates_all_mission_refs(missions_sample, dialogues_sample):
    missions, dialogues = update_line(
        missions_sample,
        dialogues_sample,
        "SHARED_CONGRATS",
        {"script_text": "Congrats!"},
        new_id="SHARED_CONGRATS_V2",
    )
    m0_intro = missions["missions"][1]["dialogueLineIds"]
    m0_return = missions["missions"][1]["returnDialogueLineIds"]
    assert "SHARED_CONGRATS" not in m0_intro
    assert "SHARED_CONGRATS" not in m0_return
    assert "SHARED_CONGRATS_V2" in m0_intro
    assert "SHARED_CONGRATS_V2" in m0_return

    ids = [c["id"] for c in dialogues["clips"]]
    assert "SHARED_CONGRATS" not in ids
    assert "SHARED_CONGRATS_V2" in ids


def test_rename_rejects_duplicate(missions_sample, dialogues_sample):
    import pytest

    with pytest.raises(ValueError, match="already exists"):
        update_line(
            missions_sample,
            dialogues_sample,
            "000_DOG_INTRO_01",
            {},
            new_id="000_DOG_INTRO_02",
        )
