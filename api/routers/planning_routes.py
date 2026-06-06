from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from services.planning.planning_service import (
    create_deliverable,
    create_event,
    create_milestone,
    delete_deliverable,
    delete_event,
    delete_milestone,
    get_plan_by_project_key,
    reorder_milestones,
    update_deliverable,
    update_event,
    update_milestone,
    upsert_plan_start_date,
)

planning_router = APIRouter(prefix="/planning", tags=["planning"])


class PlanUpsertBody(BaseModel):
    project_key: str = Field(min_length=1)
    start_date: str = Field(min_length=1)


class MilestoneCreateBody(BaseModel):
    project_key: str = Field(min_length=1)
    name: str = Field(min_length=1)
    duration_weeks: int = Field(default=1, ge=1)
    status: str = "todo"
    risk: str = "on_track"


class MilestoneUpdateBody(BaseModel):
    name: Optional[str] = None
    duration_weeks: Optional[int] = Field(default=None, ge=1)
    status: Optional[str] = None
    risk: Optional[str] = None


class MilestoneReorderBody(BaseModel):
    project_key: str = Field(min_length=1)
    milestone_ids: List[str] = Field(min_length=1)


class DeliverableCreateBody(BaseModel):
    milestone_id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    status: str = "todo"


class DeliverableUpdateBody(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None


class EventCreateBody(BaseModel):
    milestone_id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    weeks_after_milestone_start: int = Field(default=0, ge=0)


class EventUpdateBody(BaseModel):
    name: Optional[str] = None
    weeks_after_milestone_start: Optional[int] = Field(default=None, ge=0)


@planning_router.get("")
def get_plan(project_key: str = Query(..., min_length=1)) -> dict:
    return get_plan_by_project_key(project_key)


@planning_router.put("/plan")
def put_plan(body: PlanUpsertBody) -> dict:
    return upsert_plan_start_date(body.project_key, body.start_date)


@planning_router.post("/milestones")
def post_milestone(body: MilestoneCreateBody) -> dict:
    return create_milestone(
        body.project_key,
        body.name,
        duration_weeks=body.duration_weeks,
        status=body.status,
        risk=body.risk,
    )


@planning_router.patch("/milestones/{milestone_id}")
def patch_milestone(milestone_id: str, body: MilestoneUpdateBody) -> dict:
    return update_milestone(
        milestone_id,
        name=body.name,
        duration_weeks=body.duration_weeks,
        status=body.status,
        risk=body.risk,
    )


@planning_router.delete("/milestones/{milestone_id}")
def remove_milestone(milestone_id: str) -> dict:
    return delete_milestone(milestone_id)


@planning_router.post("/milestones/reorder")
def post_milestone_reorder(body: MilestoneReorderBody) -> list:
    return reorder_milestones(body.project_key, body.milestone_ids)


@planning_router.post("/deliverables")
def post_deliverable(body: DeliverableCreateBody) -> dict:
    return create_deliverable(body.milestone_id, body.title, status=body.status)


@planning_router.patch("/deliverables/{deliverable_id}")
def patch_deliverable(deliverable_id: str, body: DeliverableUpdateBody) -> dict:
    return update_deliverable(deliverable_id, title=body.title, status=body.status)


@planning_router.delete("/deliverables/{deliverable_id}")
def remove_deliverable(deliverable_id: str) -> dict:
    return delete_deliverable(deliverable_id)


@planning_router.post("/events")
def post_event(body: EventCreateBody) -> dict:
    return create_event(
        body.milestone_id,
        body.name,
        weeks_after_milestone_start=body.weeks_after_milestone_start,
    )


@planning_router.patch("/events/{event_id}")
def patch_event(event_id: str, body: EventUpdateBody) -> dict:
    return update_event(
        event_id,
        name=body.name,
        weeks_after_milestone_start=body.weeks_after_milestone_start,
    )


@planning_router.delete("/events/{event_id}")
def remove_event(event_id: str) -> dict:
    return delete_event(event_id)
