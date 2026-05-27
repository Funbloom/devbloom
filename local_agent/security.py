from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

from fastapi import HTTPException, Request

LOCAL_DIR = Path(__file__).resolve().parent
APPROVED_FILE = LOCAL_DIR / ".local_agent" / "approved_roots.json"


def ensure_localhost(request: Request) -> None:
    host = request.client.host if request.client else ""
    if host not in {"127.0.0.1", "::1"}:
        raise HTTPException(status_code=403, detail="Local agent is localhost-only.")


def _load_approved_roots() -> list[str]:
    if not APPROVED_FILE.exists():
        return []
    try:
        data = json.loads(APPROVED_FILE.read_text(encoding="utf-8"))
        if isinstance(data, list):
            return [str(x) for x in data if isinstance(x, str)]
    except Exception:
        return []
    return []


def _save_approved_roots(paths: Iterable[str]) -> None:
    APPROVED_FILE.parent.mkdir(parents=True, exist_ok=True)
    APPROVED_FILE.write_text(json.dumps(list(paths), ensure_ascii=False, indent=2), encoding="utf-8")


def approve_root(project_root: str) -> Path:
    root = _resolve_root(project_root)
    approved = set(_load_approved_roots())
    approved.add(str(root))
    _save_approved_roots(approved)
    return root


def ensure_root_approved(project_root: str) -> Path:
    root = _resolve_root(project_root)
    approved = set(_load_approved_roots())
    if str(root) not in approved:
        raise HTTPException(
            status_code=403,
            detail="Project root is not approved. Approve it in the local agent first.",
        )
    return root


def _resolve_root(project_root: str) -> Path:
    raw = (project_root or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="project_root is required.")
    root = Path(raw).expanduser().resolve()
    if not root.exists() or not root.is_dir():
        raise HTTPException(status_code=404, detail=f"Project root not found: {root}")
    return root


def resolve_under_root(root: Path, relative_path: str) -> Path:
    rel = (relative_path or "").strip().replace("\\", "/")
    if not rel:
        raise HTTPException(status_code=400, detail="relative_path is required.")
    root_resolved = root.resolve()
    target = (root_resolved / rel).resolve()
    try:
        target.relative_to(root_resolved)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Path traversal is not allowed.") from exc
    return target


def standard_project_paths(root: Path) -> tuple[Path, Path, Path]:
    cities_json = root / "Assets" / "StreamingAssets" / "Travel" / "cities.json"
    gift_catalog_json = root / "Assets" / "StreamingAssets" / "Gifts" / "gifts_catalog.json"
    gifts_images_dir = gift_catalog_json.parent / "Images"
    return cities_json, gift_catalog_json, gifts_images_dir
