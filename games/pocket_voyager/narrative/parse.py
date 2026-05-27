from typing import Any

from games.pocket_voyager.narrative.models import (
    DialoguesDocument,
    MissionSummary,
    MissionsDocument,
    ValidateResult,
)


def _require_dict(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be a JSON object.")
    return value


def parse_missions_document(raw: MissionsDocument) -> MissionsDocument:
    doc = _require_dict(raw, "missions document")
    missions = doc.get("missions")
    if not isinstance(missions, list):
        raise ValueError("missions document must include a 'missions' array.")
    return doc


def parse_dialogues_document(raw: DialoguesDocument) -> DialoguesDocument:
    doc = _require_dict(raw, "dialogues document")
    clips = doc.get("clips")
    if not isinstance(clips, list):
        raise ValueError("dialogues document must include a 'clips' array.")
    return doc


def _clip_id(clip: dict[str, Any]) -> str:
    raw = clip.get("id")
    if raw is None:
        return ""
    return str(raw).strip()


def _build_clip_index(dialogues: DialoguesDocument) -> dict[str, dict[str, Any]]:
    clips_raw = dialogues.get("clips")
    if not isinstance(clips_raw, list):
        raise ValueError("dialogues document must include a 'clips' array.")
    index: dict[str, dict[str, Any]] = {}
    for i, entry in enumerate(clips_raw):
        if not isinstance(entry, dict):
            raise ValueError(f"Clip {i + 1}: expected an object.")
        cid = _clip_id(entry)
        if not cid:
            raise ValueError(f"Clip {i + 1}: missing 'id'.")
        key = cid.lower()
        if key in index:
            raise ValueError(f"Duplicate clip id '{cid}'.")
        index[key] = entry
    return index


def _mission_id_lists(mission: dict[str, Any]) -> tuple[list[str], list[str]]:
    intro_raw = mission.get("dialogueLineIds")
    return_raw = mission.get("returnDialogueLineIds")
    intro: list[str] = []
    ret: list[str] = []
    if intro_raw is not None:
        if not isinstance(intro_raw, list):
            raise ValueError(f"Mission '{mission.get('id')}': dialogueLineIds must be an array.")
        intro = [str(x).strip() for x in intro_raw if str(x).strip()]
    if return_raw is not None:
        if not isinstance(return_raw, list):
            raise ValueError(f"Mission '{mission.get('id')}': returnDialogueLineIds must be an array.")
        ret = [str(x).strip() for x in return_raw if str(x).strip()]
    return intro, ret


def validate_workspace(missions: MissionsDocument, dialogues: DialoguesDocument) -> ValidateResult:
    errors: list[str] = []
    warnings: list[str] = []
    missions_doc = parse_missions_document(missions)
    dialogues_doc = parse_dialogues_document(dialogues)

    try:
        clip_index = _build_clip_index(dialogues_doc)
    except ValueError as exc:
        return {
            "missions": [],
            "errors": [str(exc)],
            "warnings": [],
            "orphan_clip_ids": [],
        }

    summaries: list[MissionSummary] = []
    referenced: set[str] = set()

    missions_list = missions_doc.get("missions")
    assert isinstance(missions_list, list)

    for i, mission in enumerate(missions_list):
        if not isinstance(mission, dict):
            errors.append(f"Mission {i + 1}: expected an object.")
            continue
        mid = str(mission.get("id") or "").strip()
        if not mid:
            errors.append(f"Mission {i + 1}: missing 'id'.")
            continue
        title = str(mission.get("title") or "").strip() or mid
        summaries.append({"id": mid, "title": title})
        try:
            intro_ids, return_ids = _mission_id_lists(mission)
        except ValueError as exc:
            errors.append(str(exc))
            continue
        for lid in intro_ids + return_ids:
            referenced.add(lid.lower())
            if lid.lower() not in clip_index:
                errors.append(f"Mission '{mid}': unknown dialogue line id '{lid}'.")

    all_clip_keys = set(clip_index.keys())
    orphan = sorted(
        (clip_index[k].get("id") or k for k in all_clip_keys - referenced),
        key=str.lower,
    )

    return {
        "missions": summaries,
        "errors": errors,
        "warnings": warnings,
        "orphan_clip_ids": orphan,
    }


def find_mission(missions: MissionsDocument, mission_id: str) -> dict[str, Any] | None:
    missions_doc = parse_missions_document(missions)
    target = mission_id.strip()
    if not target:
        return None
    for mission in missions_doc.get("missions", []):
        if isinstance(mission, dict) and str(mission.get("id") or "").strip() == target:
            return mission
    return None
