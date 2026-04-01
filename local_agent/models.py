from __future__ import annotations

from typing import Any, List

from pydantic import BaseModel, Field


class ApproveProjectRequest(BaseModel):
    project_root: str = Field(min_length=1)


class ProjectResolveRequest(BaseModel):
    project_root: str = Field(min_length=1)


class FileJsonReadRequest(BaseModel):
    project_root: str = Field(min_length=1)
    relative_path: str = Field(min_length=1)


class FileJsonWriteRequest(BaseModel):
    project_root: str = Field(min_length=1)
    relative_path: str = Field(min_length=1)
    data: Any


class JsonPatchOp(BaseModel):
    op: str
    path: str
    value: Any | None = None


class FileJsonPatchRequest(BaseModel):
    project_root: str = Field(min_length=1)
    relative_path: str = Field(min_length=1)
    patch: List[JsonPatchOp]


class DirListRequest(BaseModel):
    project_root: str = Field(min_length=1)
    relative_path: str = Field(min_length=1)


class FileBinaryReadRequest(BaseModel):
    project_root: str = Field(min_length=1)
    relative_path: str = Field(min_length=1)


class FileBinaryWriteRequest(BaseModel):
    project_root: str = Field(min_length=1)
    relative_path: str = Field(min_length=1)
    content_base64: str = Field(min_length=1)
