import copy
from typing import Any

from games.pocket_voyager.narrative.parse import find_mission, parse_missions_document

MissionsDocument = dict[str, Any]


def _clone_missions(missions: MissionsDocument) -> MissionsDocument:
    return copy.deepcopy(missions)


def _missions_list(missions_doc: MissionsDocument) -> list[dict[str, Any]]:
    missions_raw = missions_doc.get("missions")
    if not isinstance(missions_raw, list):
        raise ValueError("missions document must include a 'missions' array.")
    return missions_raw


def _mission_index(missions_list: list[dict[str, Any]], mission_id: str) -> int:
    target = mission_id.strip()
    if not target:
        raise ValueError("Mission id is required.")
    for i, mission in enumerate(missions_list):
        if isinstance(mission, dict) and str(mission.get("id") or "").strip() == target:
            return i
    raise ValueError(f"Mission not found: {mission_id}")


def _replace_id_in_unlock_lists(missions_doc: MissionsDocument, old_id: str, new_id: str | None) -> None:
    old_key = old_id.lower()
    for mission in _missions_list(missions_doc):
        if not isinstance(mission, dict):
            continue
        unlocks = mission.get("unlocksMissionIds")
        if not isinstance(unlocks, list):
            continue
        updated: list[str] = []
        for entry in unlocks:
            s = str(entry).strip()
            if not s:
                continue
            if s.lower() == old_key:
                if new_id is not None:
                    updated.append(new_id)
            else:
                updated.append(s)
        mission["unlocksMissionIds"] = updated


def get_mission(missions: MissionsDocument, mission_id: str) -> dict[str, Any]:
    mission = find_mission(missions, mission_id)
    if mission is None:
        raise ValueError(f"Mission not found: {mission_id}")
    return copy.deepcopy(mission)


def default_new_mission(existing: MissionsDocument | None = None) -> dict[str, Any]:
    if existing is not None:
        missions_list = existing.get("missions")
        if isinstance(missions_list, list) and missions_list:
            last = missions_list[-1]
            if isinstance(last, dict):
                template = copy.deepcopy(last)
                suffix = str(len(missions_list)).zfill(3)
                template["id"] = f"new_mission_{suffix}"
                template["title"] = "New mission"
                template["dialogueLineIds"] = []
                template["returnDialogueLineIds"] = []
                return template
    return {
        "id": "new_mission_001",
        "title": "New mission",
        "description": "",
        "category": "story",
        "missionType": "travel_city_goal",
        "difficulty": "easy",
        "isDaily": False,
        "isRepeatable": False,
        "isStartingMission": False,
        "dialogueLineIds": [],
        "returnDialogueLineIds": [],
        "unlocksMissionIds": [],
        "objectives": [],
        "requirements": {
            "minDogLevel": 1,
            "location": "",
            "requiredItems": [],
            "optionalItems": [],
            "mustUseCorrectDestination": False,
            "mustUseCorrectItems": False,
        },
        "rewards": {"flowers": 0, "dogXp": 0, "items": [], "puzzleFragments": 0},
        "ui": {"icon": "map", "themeColor": "teal", "showProgressBar": True},
        "analytics": {"tags": []},
    }


def add_mission(missions: MissionsDocument, mission: dict[str, Any]) -> MissionsDocument:
    missions_doc = _clone_missions(parse_missions_document(missions))
    if not isinstance(mission, dict):
        raise ValueError("Mission must be an object.")
    mid = str(mission.get("id") or "").strip()
    if not mid:
        raise ValueError("Mission id is required.")
    missions_list = _missions_list(missions_doc)
    if any(isinstance(m, dict) and str(m.get("id") or "").strip().lower() == mid.lower() for m in missions_list):
        raise ValueError(f"Mission id already exists: {mid}")
    missions_list.append(copy.deepcopy(mission))
    return missions_doc


def update_mission(
    missions: MissionsDocument,
    mission_id: str,
    mission: dict[str, Any],
    new_id: str | None = None,
) -> MissionsDocument:
    missions_doc = _clone_missions(parse_missions_document(missions))
    if not isinstance(mission, dict):
        raise ValueError("Mission must be an object.")
    missions_list = _missions_list(missions_doc)
    idx = _mission_index(missions_list, mission_id)
    old_id = str(missions_list[idx].get("id") or "").strip()
    target_id = str(new_id).strip() if new_id is not None and str(new_id).strip() else str(mission.get("id") or old_id).strip()
    if not target_id:
        raise ValueError("Mission id is required.")
    if target_id.lower() != old_id.lower():
        if any(
            isinstance(m, dict) and str(m.get("id") or "").strip().lower() == target_id.lower()
            for i, m in enumerate(missions_list)
            if i != idx
        ):
            raise ValueError(f"Mission id already exists: {target_id}")
        mission = copy.deepcopy(mission)
        mission["id"] = target_id
        _replace_id_in_unlock_lists(missions_doc, old_id, target_id)
    missions_list[idx] = copy.deepcopy(mission)
    if mission.get("id") is not None:
        missions_list[idx]["id"] = target_id
    return missions_doc


def delete_mission(missions: MissionsDocument, mission_id: str) -> MissionsDocument:
    missions_doc = _clone_missions(parse_missions_document(missions))
    missions_list = _missions_list(missions_doc)
    idx = _mission_index(missions_list, mission_id)
    removed_id = str(missions_list[idx].get("id") or mission_id).strip()
    missions_list.pop(idx)
    _replace_id_in_unlock_lists(missions_doc, removed_id, None)
    return missions_doc
