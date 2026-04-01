from __future__ import annotations

import base64
import os
from pathlib import Path
from typing import Any

from fastapi import Body, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from local_agent.models import (
    ApproveProjectRequest,
    DirListRequest,
    FileJsonPatchRequest,
    FileJsonReadRequest,
    FileJsonWriteRequest,
    FileBinaryReadRequest,
    FileBinaryWriteRequest,
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
    return {"ok": True}


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
