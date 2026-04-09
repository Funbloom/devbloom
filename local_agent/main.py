from __future__ import annotations

import asyncio
import base64
import logging
import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from local_agent.models import (
    ApproveProjectRequest,
    DirListRequest,
    FsListRequest,
    FsPickFileBody,
    FileJsonPatchRequest,
    FileJsonReadRequest,
    FileJsonWriteRequest,
    FileBinaryReadRequest,
    FileBinaryWriteRequest,
    MeshGenGenerateRequest,
    ProjectResolveRequest,
)
from local_agent.security import (
    approve_root,
    ensure_localhost,
    ensure_root_approved,
    resolve_under_root,
    standard_project_paths,
)
from local_agent.json_patch import apply_json_patch
from local_agent.fs_picker import pick_directory_native, pick_file_native

logger = logging.getLogger(__name__)

_DEFAULT_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]


def _cors_allow_origins() -> list[str]:
    """Default dev origins plus LOCAL_AGENT_EXTRA_CORS_ORIGINS (comma-separated full origins, e.g. https://dev.example.com)."""
    extra_raw = os.getenv("LOCAL_AGENT_EXTRA_CORS_ORIGINS", "")
    extra = [x.strip() for x in extra_raw.split(",") if x.strip()]
    seen: set[str] = set()
    out: list[str] = []
    for o in _DEFAULT_CORS_ORIGINS + extra:
        if o not in seen:
            seen.add(o)
            out.append(o)
    return out


app = FastAPI(title="Local Agent", version="0.1.0")

_root = logging.getLogger()
if not _root.handlers:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logging.getLogger("local_agent").setLevel(logging.INFO)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_allow_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health(request: Request) -> dict[str, Any]:
    ensure_localhost(request)
    return {"ok": True, "service": "local_agent"}


@app.post("/fs/pick_directory")
async def fs_pick_directory(request: Request) -> dict[str, Any]:
    """Open the native folder dialog on the machine running the agent; return an absolute path."""
    ensure_localhost(request)
    try:
        raw = await asyncio.to_thread(pick_directory_native, "Choose project folder")
    except Exception as exc:
        logger.exception("Native folder picker failed")
        raise HTTPException(status_code=503, detail=f"Folder picker failed: {exc}") from exc
    if not raw:
        return {"cancelled": True}
    return {"cancelled": False, "path": raw}


@app.post("/fs/pick_file")
async def fs_pick_file(request: Request, body: FsPickFileBody = FsPickFileBody()) -> dict[str, Any]:
    """Open the native file dialog on the machine running the agent; return an absolute path."""
    ensure_localhost(request)
    title = body.title
    fts: list[tuple[str, str]] | None = None
    if body.filetypes:
        pairs = [(r[0], r[1]) for r in body.filetypes if len(r) >= 2]
        fts = pairs or None
    try:
        raw = await asyncio.to_thread(pick_file_native, title, fts)
    except Exception as exc:
        logger.exception("Native file picker failed")
        raise HTTPException(status_code=503, detail=f"File picker failed: {exc}") from exc
    if not raw:
        return {"cancelled": True}
    return {"cancelled": False, "path": raw}


@app.post("/projects/approve")
def approve_project(request: Request, body: ApproveProjectRequest) -> dict[str, Any]:
    ensure_localhost(request)
    root = approve_root(body.project_root)
    return {"ok": True, "project_root": str(root)}


@app.post("/projects/resolve")
def resolve_project_paths(request: Request, body: ProjectResolveRequest) -> dict[str, Any]:
    ensure_localhost(request)
    root = ensure_root_approved(body.project_root)
    cities_json, gifts_json, gifts_images_dir = standard_project_paths(root)
    return {
        "project_root": str(root),
        "cities_json": str(cities_json),
        "gift_catalog_json": str(gifts_json),
        "gifts_images_dir": str(gifts_images_dir),
        "cities_json_exists": cities_json.is_file(),
        "gift_catalog_json_exists": gifts_json.is_file(),
    }


@app.post("/files/json/read")
def read_json_file(request: Request, body: FileJsonReadRequest) -> dict[str, Any]:
    ensure_localhost(request)
    root = ensure_root_approved(body.project_root)
    path = resolve_under_root(root, body.relative_path)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="File not found.")
    try:
        data = path.read_text(encoding="utf-8")
        return {"path": str(path), "data": json_loads(data)}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {exc}") from exc


@app.post("/files/json/write")
def write_json_file(request: Request, body: FileJsonWriteRequest) -> dict[str, Any]:
    ensure_localhost(request)
    root = ensure_root_approved(body.project_root)
    path = resolve_under_root(root, body.relative_path)
    try:
        payload = json_dumps(body.data)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {exc}") from exc
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(payload, encoding="utf-8")
    return {"ok": True, "path": str(path)}


@app.post("/files/json/patch")
def patch_json_file(request: Request, body: FileJsonPatchRequest) -> dict[str, Any]:
    ensure_localhost(request)
    root = ensure_root_approved(body.project_root)
    path = resolve_under_root(root, body.relative_path)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="File not found.")
    try:
        data = json_loads(path.read_text(encoding="utf-8"))
        patched = apply_json_patch(data, body.patch)
        payload = json_dumps(patched)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Patch failed: {exc}") from exc
    path.write_text(payload, encoding="utf-8")
    return {"ok": True, "path": str(path), "data": patched}


@app.post("/fs/list_dir")
def fs_list_dir(request: Request, body: FsListRequest) -> dict[str, Any]:
    """Browse the local filesystem for an absolute project path (Admin UI). Does not require a pre-approved root."""
    ensure_localhost(request)
    raw = (body.path or "").strip()
    try:
        if not raw:
            base = Path.home()
        else:
            p = Path(raw).expanduser()
            if not p.is_absolute():
                raise HTTPException(
                    status_code=400,
                    detail="Path must be absolute (e.g. /Users/you/MyGame), or leave empty to start from home.",
                )
            base = p.resolve()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid path: {exc}") from exc

    if not base.exists():
        raise HTTPException(status_code=404, detail="Path not found.")
    if not base.is_dir():
        raise HTTPException(status_code=400, detail="Not a directory.")

    entries: list[dict[str, Any]] = []
    try:
        for item in sorted(base.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower())):
            if item.name.startswith("."):
                continue
            try:
                if not item.exists():
                    continue
                resolved = item.resolve()
                entries.append(
                    {
                        "name": item.name,
                        "is_dir": item.is_dir(),
                        "full_path": str(resolved),
                    }
                )
            except (OSError, PermissionError):
                continue
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail="Permission denied listing directory.") from exc

    base_resolved = base.resolve()
    parent = base_resolved.parent
    if parent.resolve() == base_resolved:
        parent_out: str | None = None
    else:
        parent_out = str(parent.resolve())

    return {
        "current": str(base_resolved),
        "parent": parent_out,
        "entries": entries,
    }


@app.post("/dir/list")
def list_dir(request: Request, body: DirListRequest) -> dict[str, Any]:
    ensure_localhost(request)
    root = ensure_root_approved(body.project_root)
    path = resolve_under_root(root, body.relative_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Path not found.")
    if not path.is_dir():
        raise HTTPException(status_code=400, detail="Path is not a directory.")
    entries = []
    for item in path.iterdir():
        entries.append({"name": item.name, "is_dir": item.is_dir(), "is_file": item.is_file()})
    return {"path": str(path), "entries": entries}


@app.post("/files/binary/read")
def read_binary_file(request: Request, body: FileBinaryReadRequest) -> Response:
    ensure_localhost(request)
    root = ensure_root_approved(body.project_root)
    path = resolve_under_root(root, body.relative_path)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="File not found.")
    data = path.read_bytes()
    media_type = guess_media_type(path)
    return Response(content=data, media_type=media_type)


@app.post("/meshgen/generate")
async def meshgen_generate(request: Request, body: MeshGenGenerateRequest) -> dict[str, Any]:
    """Run Hunyuan3D-2 in-process (same venv as the agent) and write mesh bytes under the project."""
    ensure_localhost(request)
    root = ensure_root_approved(body.project_root)
    out_path = resolve_under_root(root, body.relative_path)
    params: dict[str, Any] = {
        "image": body.image,
        "seed": body.seed,
        "octree_resolution": body.octree_resolution,
        "num_inference_steps": body.num_inference_steps,
        "guidance_scale": body.guidance_scale,
        "texture": body.texture,
        "type": body.type,
        "face_count": body.face_count,
    }
    try:
        from local_agent.meshgen_hunyuan import run_mesh_generation

        raw = await asyncio.to_thread(run_mesh_generation, params)
    except RuntimeError as exc:
        logging.getLogger(__name__).error("MeshGen: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logging.getLogger(__name__).exception("MeshGen: generation failed")
        raise HTTPException(status_code=500, detail=f"Mesh generation failed: {exc}") from exc

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(raw)
    return {"ok": True, "path": str(out_path), "relative_path": body.relative_path}


@app.post("/files/binary/write")
def write_binary_file(request: Request, body: FileBinaryWriteRequest) -> dict[str, Any]:
    ensure_localhost(request)
    root = ensure_root_approved(body.project_root)
    path = resolve_under_root(root, body.relative_path)
    try:
        raw = base64.b64decode(body.content_base64)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid base64: {exc}") from exc
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(raw)
    return {"ok": True, "path": str(path)}


def guess_media_type(path: Path) -> str:
    ext = path.suffix.lower()
    if ext in {".png"}:
        return "image/png"
    if ext in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if ext in {".webp"}:
        return "image/webp"
    return "application/octet-stream"


def json_loads(text: str) -> Any:
    import json

    return json.loads(text)


def json_dumps(obj: Any) -> str:
    import json

    return json.dumps(obj, ensure_ascii=False, indent=2) + "\n"
