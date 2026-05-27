from games.pocket_voyager.narrative.models import LineType
from games.pocket_voyager.narrative.mutations import reorder_lines


def test_reorder_intro(missions_sample):
    missions = reorder_lines(
        missions_sample,
        "000_travel_first_trip",
        LineType.INTRO,
        ["000_DOG_INTRO_02", "000_DOG_INTRO_01"],
    )
    ids = missions["missions"][0]["dialogueLineIds"]
    assert ids == ["000_DOG_INTRO_02", "000_DOG_INTRO_01"]


def test_reorder_rejects_mismatch(missions_sample):
    import pytest

    with pytest.raises(ValueError, match="Reorder list"):
        reorder_lines(
            missions_sample,
            "000_travel_first_trip",
            LineType.INTRO,
            ["000_DOG_INTRO_01"],
        )
