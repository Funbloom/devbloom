from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field

MilestoneStatus = Literal["todo", "in_progress", "ready", "completed"]
MilestoneRisk = Literal["on_track", "caution", "risk"]
ImportApplyMode = Literal["append", "replace"]


class ImportedDeliverable(BaseModel):
    title: str
    status: MilestoneStatus = "todo"
    risk: MilestoneRisk = "on_track"
    owner: str = ""
    due_date: Optional[str] = None


class ImportedPlanningEvent(BaseModel):
    name: str
    week_offset: int = Field(ge=0)


class ImportedMilestone(BaseModel):
    name: str
    start_date: Optional[str] = None
    delivery_date: Optional[str] = None
    duration_weeks: int = Field(default=1, ge=1)
    status: MilestoneStatus = "todo"
    risk: MilestoneRisk = "on_track"
    goals: List[str] = Field(default_factory=list)
    deliverables: List[ImportedDeliverable] = Field(default_factory=list)
    events: List[ImportedPlanningEvent] = Field(default_factory=list)


class ImportedPlanningData(BaseModel):
    project_name: Optional[str] = None
    project_start_date: Optional[str] = None
    milestones: List[ImportedMilestone] = Field(default_factory=list)


class ImportParseResult(BaseModel):
    data: ImportedPlanningData
    warnings: List[str] = Field(default_factory=list)
