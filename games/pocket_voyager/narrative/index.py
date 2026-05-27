from typing import Any

from games.pocket_voyager.narrative.models import (
    DialogueLineRow,
    DialoguesDocument,
    LineType,
    MissionLinesResult,
    MissionsDocument,
)
from games.pocket_voyager.narrative.parse import (
    _build_clip_index,
    _mission_id_lists,
    find_mission,
    parse_dialogues_document,
)


def _row_from_clip(
    clip: dict[str, Any],
    line_type: LineType,
    warning: str | None = None,
) -> DialogueLineRow:
    return {
        "id": str(clip.get("id") or "").strip(),
        "line_type": line_type.value,
        "script_text": str(clip.get("script_text") or ""),
        "character_name": str(clip.get("character_name") or ""),
        "voice_name": str(clip.get("voice_name") or ""),
        "mood": clip.get("mood") if clip.get("mood") is not None else None,
        "warning": warning,
    }


def _line_type_for_id(
    line_id: str,
    intro_ids: list[str],
    return_ids: list[str],
) -> tuple[LineType, str | None]:
    key = line_id.lower()
    in_intro = any(x.lower() == key for x in intro_ids)
    in_return = any(x.lower() == key for x in return_ids)
    if in_intro and in_return:
        return LineType.INTRO, "Line id appears in both intro and return arrays for this mission."
    if in_intro:
        return LineType.INTRO, None
    if in_return:
        return LineType.RETURN, None
    return LineType.INTRO, "Line id is not listed on this mission."


def get_mission_lines(
    missions: MissionsDocument,
    dialogues: DialoguesDocument,
    mission_id: str,
) -> MissionLinesResult:
    mission = find_mission(missions, mission_id)
    if mission is None:
        raise ValueError(f"Mission not found: {mission_id}")

    dialogues_doc = parse_dialogues_document(dialogues)
    clip_index = _build_clip_index(dialogues_doc)
    intro_ids, return_ids = _mission_id_lists(mission)

    intro_rows: list[DialogueLineRow] = []
    for lid in intro_ids:
        clip = clip_index.get(lid.lower())
        if clip is None:
            intro_rows.append(
                {
                    "id": lid,
                    "line_type": "intro",
                    "script_text": "",
                    "character_name": "",
                    "voice_name": "",
                    "mood": None,
                    "warning": "Missing clip in dialogues file.",
                }
            )
            continue
        _, warning = _line_type_for_id(lid, intro_ids, return_ids)
        intro_rows.append(_row_from_clip(clip, LineType.INTRO, warning))

    return_rows: list[DialogueLineRow] = []
    for lid in return_ids:
        clip = clip_index.get(lid.lower())
        if clip is None:
            return_rows.append(
                {
                    "id": lid,
                    "line_type": "return",
                    "script_text": "",
                    "character_name": "",
                    "voice_name": "",
                    "mood": None,
                    "warning": "Missing clip in dialogues file.",
                }
            )
            continue
        _, warning = _line_type_for_id(lid, intro_ids, return_ids)
        return_rows.append(_row_from_clip(clip, LineType.RETURN, warning))

    return {
        "mission_id": str(mission.get("id") or "").strip(),
        "intro": intro_rows,
        "return_lines": return_rows,
    }
