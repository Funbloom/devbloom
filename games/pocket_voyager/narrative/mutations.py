import copy
from typing import Any

from games.pocket_voyager.narrative.models import ClipFields, DialoguesDocument, LineType, MissionsDocument
from games.pocket_voyager.narrative.parse import (
    _build_clip_index,
    _mission_id_lists,
    find_mission,
    parse_dialogues_document,
    parse_missions_document,
)


def _clone_missions(missions: MissionsDocument) -> MissionsDocument:
    return copy.deepcopy(missions)


def _clone_dialogues(dialogues: DialoguesDocument) -> DialoguesDocument:
    return copy.deepcopy(dialogues)


def _replace_id_in_all_missions(
    missions_doc: MissionsDocument,
    old_id: str,
    new_id: str | None,
) -> None:
    old_key = old_id.lower()
    missions_list = missions_doc.get("missions")
    if not isinstance(missions_list, list):
        return
    for mission in missions_list:
        if not isinstance(mission, dict):
            continue
        for field in ("dialogueLineIds", "returnDialogueLineIds"):
            ids_raw = mission.get(field)
            if not isinstance(ids_raw, list):
                continue
            updated: list[str] = []
            for entry in ids_raw:
                s = str(entry).strip()
                if not s:
                    continue
                if s.lower() == old_key:
                    if new_id is not None:
                        updated.append(new_id)
                else:
                    updated.append(s)
            mission[field] = updated


def _strip_id_from_all_missions(missions_doc: MissionsDocument, line_id: str) -> None:
    _replace_id_in_all_missions(missions_doc, line_id, None)


def _find_clip_index(dialogues_doc: DialoguesDocument, clip_id: str) -> int:
    clips = dialogues_doc.get("clips")
    if not isinstance(clips, list):
        raise ValueError("dialogues document must include a 'clips' array.")
    key = clip_id.strip().lower()
    for i, clip in enumerate(clips):
        if isinstance(clip, dict) and str(clip.get("id") or "").strip().lower() == key:
            return i
    raise ValueError(f"Clip not found: {clip_id}")


def _mission_array_field(line_type: LineType) -> str:
    return "dialogueLineIds" if line_type == LineType.INTRO else "returnDialogueLineIds"


def add_line(
    missions: MissionsDocument,
    dialogues: DialoguesDocument,
    mission_id: str,
    line_type: LineType,
    clip: ClipFields,
) -> tuple[MissionsDocument, DialoguesDocument]:
    missions_doc = _clone_missions(parse_missions_document(missions))
    dialogues_doc = _clone_dialogues(parse_dialogues_document(dialogues))

    mission = find_mission(missions_doc, mission_id)
    if mission is None:
        raise ValueError(f"Mission not found: {mission_id}")

    cid = str(clip.get("id") or "").strip()
    if not cid:
        raise ValueError("Clip id is required.")

    clip_index = _build_clip_index(dialogues_doc)
    if cid.lower() in clip_index:
        raise ValueError(f"Clip id already exists: {cid}")

    new_clip: dict[str, Any] = {
        "id": cid,
        "character_name": str(clip.get("character_name") or ""),
        "voice_name": str(clip.get("voice_name") or ""),
        "script_text": str(clip.get("script_text") or ""),
    }
    mood = clip.get("mood")
    if mood is not None:
        new_clip["mood"] = mood

    clips = dialogues_doc.get("clips")
    assert isinstance(clips, list)
    clips.append(new_clip)

    field = _mission_array_field(line_type)
    ids_raw = mission.get(field)
    if not isinstance(ids_raw, list):
        ids_raw = []
    ids_raw = list(ids_raw)
    ids_raw.append(cid)
    mission[field] = ids_raw

    return missions_doc, dialogues_doc


def update_line(
    missions: MissionsDocument,
    dialogues: DialoguesDocument,
    clip_id: str,
    fields: ClipFields,
    new_id: str | None = None,
) -> tuple[MissionsDocument, DialoguesDocument]:
    missions_doc = _clone_missions(parse_missions_document(missions))
    dialogues_doc = _clone_dialogues(parse_dialogues_document(dialogues))

    idx = _find_clip_index(dialogues_doc, clip_id)
    clips = dialogues_doc.get("clips")
    assert isinstance(clips, list)
    clip_obj = clips[idx]
    assert isinstance(clip_obj, dict)

    old_id = str(clip_obj.get("id") or "").strip()
    target_id = str(new_id).strip() if new_id is not None and str(new_id).strip() else old_id

    if target_id.lower() != old_id.lower():
        clip_index = _build_clip_index(dialogues_doc)
        if target_id.lower() in clip_index and target_id.lower() != old_id.lower():
            raise ValueError(f"Clip id already exists: {target_id}")
        clip_obj["id"] = target_id
        _replace_id_in_all_missions(missions_doc, old_id, target_id)

    if "character_name" in fields:
        clip_obj["character_name"] = str(fields["character_name"] or "")
    if "voice_name" in fields:
        clip_obj["voice_name"] = str(fields["voice_name"] or "")
    if "script_text" in fields:
        clip_obj["script_text"] = str(fields["script_text"] or "")
    if "mood" in fields:
        clip_obj["mood"] = fields["mood"]

    return missions_doc, dialogues_doc


def delete_line(
    missions: MissionsDocument,
    dialogues: DialoguesDocument,
    clip_id: str,
) -> tuple[MissionsDocument, DialoguesDocument]:
    missions_doc = _clone_missions(parse_missions_document(missions))
    dialogues_doc = _clone_dialogues(parse_dialogues_document(dialogues))

    idx = _find_clip_index(dialogues_doc, clip_id)
    clips = dialogues_doc.get("clips")
    assert isinstance(clips, list)
    old_id = str(clips[idx].get("id") or "").strip() if isinstance(clips[idx], dict) else clip_id
    clips.pop(idx)
    _strip_id_from_all_missions(missions_doc, old_id)

    return missions_doc, dialogues_doc


def reorder_lines(
    missions: MissionsDocument,
    mission_id: str,
    line_type: LineType,
    ordered_ids: list[str],
) -> MissionsDocument:
    missions_doc = _clone_missions(parse_missions_document(missions))
    mission = find_mission(missions_doc, mission_id)
    if mission is None:
        raise ValueError(f"Mission not found: {mission_id}")

    field = _mission_array_field(line_type)
    current_intro, current_return = _mission_id_lists(mission)
    current = current_intro if line_type == LineType.INTRO else current_return

    current_keys = {x.lower() for x in current}
    ordered_clean = [str(x).strip() for x in ordered_ids if str(x).strip()]
    if len(ordered_clean) != len(current) or {x.lower() for x in ordered_clean} != current_keys:
        raise ValueError("Reorder list must contain exactly the same line ids as the mission section.")

    mission[field] = ordered_clean
    return missions_doc


def update_mission_title(
    missions: MissionsDocument,
    mission_id: str,
    title: str,
) -> MissionsDocument:
    missions_doc = _clone_missions(parse_missions_document(missions))
    mission = find_mission(missions_doc, mission_id)
    if mission is None:
        raise ValueError(f"Mission not found: {mission_id}")
    mission["title"] = title
    return missions_doc
