from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.auth import get_current_user
from games.pocket_voyager.narrative.improve import improve_script_texts
from games.pocket_voyager.narrative.index import get_mission_lines
from games.pocket_voyager.narrative.models import LineType
from games.pocket_voyager.narrative.mission_mutations import (
    add_mission,
    delete_mission,
    get_mission,
    update_mission,
)
from games.pocket_voyager.narrative.mutations import (
    add_line,
    delete_line,
    reorder_lines,
    update_line,
    update_mission_title,
)
from games.pocket_voyager.narrative.parse import validate_workspace

narrative_router = APIRouter(prefix="/narrative", tags=["narrative"])


class WorkspaceBody(BaseModel):
    missions: dict[str, Any]
    dialogues: dict[str, Any]


class MissionIdBody(WorkspaceBody):
    mission_id: str = Field(min_length=1)


class LineAddBody(MissionIdBody):
    line_type: Literal["intro", "return"]
    clip: dict[str, Any]


class LineUpdateBody(WorkspaceBody):
    clip_id: str = Field(min_length=1)
    fields: dict[str, Any] = Field(default_factory=dict)
    new_id: Optional[str] = None


class LineDeleteBody(WorkspaceBody):
    clip_id: str = Field(min_length=1)


class LineReorderBody(WorkspaceBody):
    mission_id: str = Field(min_length=1)
    line_type: Literal["intro", "return"]
    ordered_ids: list[str]


class ImproveBody(WorkspaceBody):
    clip_ids: list[str] = Field(default_factory=list)
    user_prompt: str = ""


class MissionTitleBody(WorkspaceBody):
    mission_id: str = Field(min_length=1)
    title: str


class MissionIdOnlyBody(WorkspaceBody):
    mission_id: str = Field(min_length=1)


class MissionUpsertBody(WorkspaceBody):
    mission: dict[str, Any]
    mission_id: str | None = None
    new_id: str | None = None


def _line_type(value: str) -> LineType:
    if value == "return":
        return LineType.RETURN
    return LineType.INTRO


@narrative_router.post("/validate")
def narrative_validate(
    body: WorkspaceBody,
    _user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    return validate_workspace(body.missions, body.dialogues)


@narrative_router.post("/mission-lines")
def narrative_mission_lines(
    body: MissionIdBody,
    _user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    try:
        return get_mission_lines(body.missions, body.dialogues, body.mission_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@narrative_router.post("/line/add")
def narrative_line_add(
    body: LineAddBody,
    _user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    try:
        missions, dialogues = add_line(
            body.missions,
            body.dialogues,
            body.mission_id,
            _line_type(body.line_type),
            body.clip,
        )
        return {"missions": missions, "dialogues": dialogues}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@narrative_router.post("/line/update")
def narrative_line_update(
    body: LineUpdateBody,
    _user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    try:
        missions, dialogues = update_line(
            body.missions,
            body.dialogues,
            body.clip_id,
            body.fields,
            body.new_id,
        )
        return {"missions": missions, "dialogues": dialogues}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@narrative_router.post("/line/delete")
def narrative_line_delete(
    body: LineDeleteBody,
    _user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    try:
        missions, dialogues = delete_line(body.missions, body.dialogues, body.clip_id)
        return {"missions": missions, "dialogues": dialogues}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@narrative_router.post("/line/reorder")
def narrative_line_reorder(
    body: LineReorderBody,
    _user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    try:
        missions = reorder_lines(
            body.missions,
            body.mission_id,
            _line_type(body.line_type),
            body.ordered_ids,
        )
        return {"missions": missions, "dialogues": body.dialogues}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@narrative_router.post("/mission/get")
def narrative_mission_get(
    body: MissionIdOnlyBody,
    _user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    try:
        return {"mission": get_mission(body.missions, body.mission_id)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@narrative_router.post("/mission/add")
def narrative_mission_add(
    body: MissionUpsertBody,
    _user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    try:
        missions = add_mission(body.missions, body.mission)
        return {"missions": missions, "dialogues": body.dialogues}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@narrative_router.post("/mission/update")
def narrative_mission_update(
    body: MissionUpsertBody,
    _user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    if not body.mission_id:
        raise HTTPException(status_code=400, detail="mission_id is required.")
    try:
        missions = update_mission(body.missions, body.mission_id, body.mission, body.new_id)
        return {"missions": missions, "dialogues": body.dialogues}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@narrative_router.post("/mission/delete")
def narrative_mission_delete(
    body: MissionIdOnlyBody,
    _user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    try:
        missions = delete_mission(body.missions, body.mission_id)
        return {"missions": missions, "dialogues": body.dialogues}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@narrative_router.post("/mission/title")
def narrative_mission_title(
    body: MissionTitleBody,
    _user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    try:
        missions = update_mission_title(body.missions, body.mission_id, body.title)
        return {"missions": missions, "dialogues": body.dialogues}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@narrative_router.post("/improve")
def narrative_improve(
    body: ImproveBody,
    _user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    clips = body.dialogues.get("clips")
    if not isinstance(clips, list):
        raise HTTPException(status_code=400, detail="dialogues.clips must be an array.")
    try:
        improved = improve_script_texts(clips, body.clip_ids, body.user_prompt)
        return {"improved": improved}
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Improve failed: {exc}") from exc
