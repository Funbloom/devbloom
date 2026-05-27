from enum import Enum
from typing import Any, Literal, TypedDict


class LineType(str, Enum):
    INTRO = "intro"
    RETURN = "return"


class MissionSummary(TypedDict):
    id: str
    title: str


class ClipFields(TypedDict, total=False):
    id: str
    character_name: str
    voice_name: str
    script_text: str
    mood: str | None


class DialogueLineRow(TypedDict):
    id: str
    line_type: Literal["intro", "return"]
    script_text: str
    character_name: str
    voice_name: str
    mood: str | None
    warning: str | None


class ValidateResult(TypedDict):
    missions: list[MissionSummary]
    errors: list[str]
    warnings: list[str]
    orphan_clip_ids: list[str]


class MissionLinesResult(TypedDict):
    mission_id: str
    intro: list[DialogueLineRow]
    return_lines: list[DialogueLineRow]


MissionsDocument = dict[str, Any]
DialoguesDocument = dict[str, Any]
