from games.pocket_voyager.narrative.models import LineType
from games.pocket_voyager.narrative.mutations import add_line, delete_line


def test_add_intro_line(missions_sample, dialogues_sample):
    missions, dialogues = add_line(
        missions_sample,
        dialogues_sample,
        "000_travel_first_trip",
        LineType.INTRO,
        {
            "id": "NEW_INTRO_LINE",
            "character_name": "Dog",
            "voice_name": "Mark",
            "script_text": "New line",
            "mood": "CALM",
        },
    )
    mission = missions["missions"][0]
    assert mission["dialogueLineIds"][-1] == "NEW_INTRO_LINE"
    assert "returnDialogueLineIds" not in mission or "NEW_INTRO_LINE" not in mission.get(
        "returnDialogueLineIds", []
    )
    assert any(c["id"] == "NEW_INTRO_LINE" for c in dialogues["clips"])


def test_add_return_line(missions_sample, dialogues_sample):
    missions, dialogues = add_line(
        missions_sample,
        dialogues_sample,
        "000_travel_first_trip",
        LineType.RETURN,
        {
            "id": "NEW_RETURN_LINE",
            "character_name": "Dog",
            "voice_name": "Mark",
            "script_text": "Return",
        },
    )
    mission = missions["missions"][0]
    assert mission["returnDialogueLineIds"][-1] == "NEW_RETURN_LINE"


def test_delete_strips_all_refs(missions_sample, dialogues_sample):
    missions, dialogues = delete_line(missions_sample, dialogues_sample, "SHARED_CONGRATS")
    assert not any(c["id"] == "SHARED_CONGRATS" for c in dialogues["clips"])
    m1 = missions["missions"][1]
    assert "SHARED_CONGRATS" not in m1["dialogueLineIds"]
    assert "SHARED_CONGRATS" not in m1["returnDialogueLineIds"]
