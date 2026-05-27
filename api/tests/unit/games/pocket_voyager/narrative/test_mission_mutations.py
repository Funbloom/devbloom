import copy

import pytest

from games.pocket_voyager.narrative.mission_mutations import (
    add_mission,
    delete_mission,
    get_mission,
    update_mission,
)


def test_add_mission(missions_sample):
    mission = {
        "id": "999_new_mission",
        "title": "Brand new",
        "dialogueLineIds": [],
        "returnDialogueLineIds": [],
    }
    doc = add_mission(missions_sample, mission)
    assert any(m["id"] == "999_new_mission" for m in doc["missions"])


def test_add_mission_rejects_duplicate(missions_sample):
    with pytest.raises(ValueError, match="already exists"):
        add_mission(missions_sample, {"id": "000_travel_first_trip", "title": "dup"})


def test_update_mission_rename_updates_unlocks(missions_sample):
    doc = copy.deepcopy(missions_sample)
    doc["missions"][0]["unlocksMissionIds"] = ["001_travel_second"]
    second = copy.deepcopy(doc["missions"][1])
    second["id"] = "001_travel_second_v2"
    doc = update_mission(doc, "001_travel_second", second, new_id="001_travel_second_v2")
    first = next(m for m in doc["missions"] if m["id"] == "000_travel_first_trip")
    assert "001_travel_second_v2" in first["unlocksMissionIds"]
    assert "001_travel_second" not in first["unlocksMissionIds"]


def test_delete_mission_strips_unlock_refs(missions_sample):
    doc = delete_mission(missions_sample, "000_travel_first_trip")
    ids = [m["id"] for m in doc["missions"]]
    assert "000_travel_first_trip" not in ids
    remaining = next(m for m in doc["missions"] if m["id"] == "001_travel_second")
    assert "000_travel_first_trip" not in remaining.get("unlocksMissionIds", [])


def test_get_mission(missions_sample):
    mission = get_mission(missions_sample, "000_travel_first_trip")
    assert mission["title"] == "My first adventure"
    mission["title"] = "Changed"
    assert missions_sample["missions"][0]["title"] == "My first adventure"
