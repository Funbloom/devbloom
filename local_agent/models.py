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


class FsRevealFolderRequest(BaseModel):
    """Open a folder under an approved project root in the system file manager (Explorer / Finder / xdg-open)."""

    project_root: str = Field(min_length=1)
    relative_path: str = Field(
        min_length=1,
        description="Path under project root, e.g. Gen/Images/UI/my_export",
    )


class FsListRequest(BaseModel):
    """List a directory anywhere on disk (localhost only). Empty path lists the current user home directory."""

    path: str = Field(default="", description="Absolute directory path; empty = user home.")


class FsPickFileBody(BaseModel):
    """Optional settings for POST /fs/pick_file (native file dialog)."""

    title: str = Field(default="Choose file")
    filetypes: list[list[str]] | None = Field(
        default=None,
        description='Tkinter filetypes as [["Images","*.png *.jpg"],["All","*.*"]]',
    )


class FileBinaryReadRequest(BaseModel):
    project_root: str = Field(min_length=1)
    relative_path: str = Field(min_length=1)


class FileBinaryWriteRequest(BaseModel):
    project_root: str = Field(min_length=1)
    relative_path: str = Field(min_length=1)
    content_base64: str = Field(min_length=1)


class UiBreakdownSamRequest(BaseModel):
    """Run SAM on a UI image under an approved project (same layout as API: Images/ or Gen/Images/UI/)."""

    project_root: str = Field(min_length=1)
    filename: str = Field(min_length=1, description="Bare filename e.g. wireframe.png")
    max_elements: int = Field(default=64, ge=1, le=256)
    min_box_fraction: float = Field(default=0.008, ge=0.0, le=0.5)
    sam: dict[str, Any] | None = Field(
        default=None,
        description="SAM Automatic Mask Generator kwargs (segment_anything.SamAutomaticMaskGenerator).",
    )


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
