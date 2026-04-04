from __future__ import annotations

from typing import Any, List, Literal

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


class MeshGenGenerateRequest(BaseModel):
    """Image → mesh via in-process Hunyuan3D-2; writes under an approved project root."""

    project_root: str = Field(min_length=1)
    relative_path: str = Field(min_length=1)
    image: str = Field(min_length=1, description="Raw base64 image bytes (no data: URL prefix)")
    seed: int = 1234
    octree_resolution: int = 128
    num_inference_steps: int = 5
    guidance_scale: float = 5.0
    texture: bool = False
    face_count: int = Field(
        40000,
        ge=500,
        le=500000,
        description="Target max triangle (face) count after cleanup; lower = lighter mesh. Used for shape-only and before texturing.",
    )
    type: Literal["glb", "obj"] = "glb"
